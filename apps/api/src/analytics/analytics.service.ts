import { Injectable } from "@nestjs/common";
import { Prisma } from "@dabacash/database";
import { PrismaService } from "../common/prisma/prisma.service";

const TZ = "Africa/Casablanca";
const DAY_MS = 24 * 3600_000;

// An order counts as sales once the franchise has accepted it. Inlined constants (not bind
// parameters) because Postgres will not compare a text parameter to an enum column.
const SETTLED = Prisma.sql`o.status IN ('CONFIRMED', 'IN_TRANSIT', 'DELIVERED')`;

const casablancaDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getAnalytics(days: number) {
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const prevSince = new Date(since.getTime() - days * DAY_MS);

    const [dailyRows, categoryRows, sellerRows, franchiseRows, prevRows, commissions, onHand, buybacks, buybacksByFranchise] =
      await Promise.all([
        this.prisma.$queryRaw<{ day: string; orders: number; gmv: number }[]>`
          SELECT to_char(((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS orders, COALESCE(SUM(o."totalAmount"), 0)::float AS gmv
          FROM orders o WHERE ${SETTLED} AND o."createdAt" >= ${since}
          GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<{ category: string; units: number; revenue: number; cost: number }[]>`
          SELECT dm."deviceType"::text AS category, COALESCE(SUM(oi.quantity), 0)::int AS units,
                 COALESCE(SUM(oi."totalPrice"), 0)::float AS revenue,
                 COALESCE(SUM(oi.quantity * pl."buybackPrice"), 0)::float AS cost
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          JOIN product_listings pl ON pl.id = oi."listingId"
          JOIN device_models dm ON dm.id = pl."deviceModelId"
          WHERE ${SETTLED} AND o."createdAt" >= ${since}
          GROUP BY 1 ORDER BY revenue DESC`,
        this.prisma.$queryRaw<{ listingId: string; title: string; franchise: string; units: number; revenue: number; avgDaysToSell: number }[]>`
          SELECT pl.id AS "listingId", pl.title, f.name AS franchise,
                 SUM(oi.quantity)::int AS units, SUM(oi."totalPrice")::float AS revenue,
                 AVG(EXTRACT(EPOCH FROM (o."createdAt" - pl."createdAt")) / 86400)::float AS "avgDaysToSell"
          FROM order_items oi
          JOIN orders o ON o.id = oi."orderId"
          JOIN product_listings pl ON pl.id = oi."listingId"
          JOIN franchises f ON f.id = pl."franchiseId"
          WHERE ${SETTLED} AND o."createdAt" >= ${since}
          GROUP BY pl.id, pl.title, f.name
          ORDER BY "avgDaysToSell" ASC, units DESC LIMIT 10`,
        this.prisma.$queryRaw<{ id: string; name: string; city: string; orders: number; units: number; revenue: number; cost: number }[]>`
          SELECT f.id, f.name, f.city, COALESCE(s.orders, 0)::int AS orders, COALESCE(s.units, 0)::int AS units,
                 COALESCE(s.revenue, 0)::float AS revenue, COALESCE(s.cost, 0)::float AS cost
          FROM franchises f
          LEFT JOIN (
            SELECT o."franchiseId" AS fid, COUNT(DISTINCT o.id) AS orders, SUM(oi.quantity) AS units,
                   SUM(oi."totalPrice") AS revenue, SUM(oi.quantity * pl."buybackPrice") AS cost
            FROM orders o
            JOIN order_items oi ON oi."orderId" = o.id
            JOIN product_listings pl ON pl.id = oi."listingId"
            WHERE ${SETTLED} AND o."createdAt" >= ${since}
            GROUP BY o."franchiseId"
          ) s ON s.fid = f.id
          WHERE f.status = 'ACTIVE'
          ORDER BY revenue DESC`,
        this.prisma.$queryRaw<{ orders: number; gmv: number }[]>`
          SELECT COUNT(*)::int AS orders, COALESCE(SUM(o."totalAmount"), 0)::float AS gmv
          FROM orders o WHERE ${SETTLED} AND o."createdAt" >= ${prevSince} AND o."createdAt" < ${since}`,
        this.prisma.commission.groupBy({
          by: ["franchiseId"],
          where: { createdAt: { gte: since } },
          _sum: { amount: true },
        }),
        this.prisma.inventory.groupBy({ by: ["franchiseId"], _sum: { quantity: true } }),
        this.prisma.buybackRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
        this.prisma.buybackRequest.groupBy({
          by: ["franchiseId"],
          where: { createdAt: { gte: since }, status: { in: ["ACCEPTED", "COMPLETED"] } },
          _count: true,
        }),
      ]);

    // Fill days with no sales so the line shows zeros instead of skipping them.
    const byDay = new Map(dailyRows.map((r) => [r.day, r]));
    const daily: { day: string; orders: number; gmv: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = casablancaDay(new Date(now.getTime() - i * DAY_MS));
      daily.push(byDay.get(day) ?? { day, orders: 0, gmv: 0 });
    }

    const gmv = dailyRows.reduce((a, r) => a + r.gmv, 0);
    const orders = dailyRows.reduce((a, r) => a + r.orders, 0);
    const units = categoryRows.reduce((a, r) => a + r.units, 0);
    const margin = categoryRows.reduce((a, r) => a + (r.revenue - r.cost), 0);
    const commission = commissions.reduce((a, c) => a + (c._sum.amount ?? 0), 0);

    const commissionBy = new Map(commissions.map((c) => [c.franchiseId, c._sum.amount ?? 0]));
    const onHandBy = new Map(onHand.map((i) => [i.franchiseId, i._sum.quantity ?? 0]));
    const acceptedBy = new Map(buybacksByFranchise.map((b) => [b.franchiseId, b._count]));

    const count = (...statuses: string[]) => buybacks.filter((b) => statuses.includes(b.status)).reduce((a, b) => a + b._count, 0);
    const bbTotal = buybacks.reduce((a, b) => a + b._count, 0);
    const accepted = count("ACCEPTED", "COMPLETED");
    const decided = accepted + count("REJECTED");

    return {
      period: { days, since: since.toISOString(), timezone: TZ },
      definitions: {
        gmv: "Commandes confirmées, en route ou livrées (annulées et en attente exclues)",
        margin: "Prix de vente moins prix de rachat de l'article, sur les articles vendus",
        sellThrough: "Unités vendues sur la période / (unités vendues + stock actuel)",
      },
      totals: {
        gmv,
        orders,
        units,
        margin,
        avgMarginPerUnit: units ? margin / units : 0,
        avgOrderValue: orders ? gmv / orders : 0,
        commission,
      },
      previous: { gmv: prevRows[0]?.gmv ?? 0, orders: prevRows[0]?.orders ?? 0 },
      daily,
      categories: categoryRows.map((r) => ({
        category: r.category,
        units: r.units,
        revenue: r.revenue,
        margin: r.revenue - r.cost,
        marginPct: r.revenue ? (r.revenue - r.cost) / r.revenue : 0,
      })),
      topSellers: sellerRows,
      franchises: franchiseRows.map((f) => {
        const stock = onHandBy.get(f.id) ?? 0;
        return {
          id: f.id,
          name: f.name,
          city: f.city,
          orders: f.orders,
          units: f.units,
          revenue: f.revenue,
          margin: f.revenue - f.cost,
          commission: commissionBy.get(f.id) ?? 0,
          acceptedBuybacks: acceptedBy.get(f.id) ?? 0,
          onHand: stock,
          sellThrough: f.units + stock ? f.units / (f.units + stock) : 0,
        };
      }),
      buyback: {
        total: bbTotal,
        accepted,
        rejected: count("REJECTED"),
        pending: count("PENDING", "UNDER_REVIEW"),
        acceptanceRate: decided ? accepted / decided : null,
      },
      // Listings are not linked to the buyback that sourced them, so buyback -> resale
      // conversion cannot be computed honestly. Reported as a gap rather than approximated.
      notTracked: ["buybackToResaleConversion"],
    };
  }
}
