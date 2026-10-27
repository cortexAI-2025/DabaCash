import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentMethod, PaymentStatus, OrderStatus, Role } from "@dabacash/database";
import { PrismaService } from "../common/prisma/prisma.service";
import { AslanClient, AslanWebhookEvent } from "./aslan.client";
import { recordCommission } from "../orders/commission";
import { NotificationsService } from "../notifications/notifications.service";

const SESSION_REUSE_MARGIN_MS = 60_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private aslan: AslanClient,
    private config: ConfigService,
    private notifications: NotificationsService
  ) {}

  /** Creates (or reuses a still-valid) Aslan hosted checkout for an order and returns its URL. */
  async startAslanCheckout(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, customer: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!order || order.customerId !== userId) throw new NotFoundException("Order not found");

    const payment = order.payment;
    if (!payment || payment.method !== PaymentMethod.ASLAN) {
      throw new BadRequestException("Cette commande n'utilise pas le paiement en ligne.");
    }
    if (payment.status === PaymentStatus.COMPLETED) throw new ConflictException("Commande déjà payée.");
    if (order.status === OrderStatus.CANCELLED) throw new BadRequestException("Commande annulée.");

    if (
      payment.checkoutUrl &&
      payment.checkoutExpiresAt &&
      payment.checkoutExpiresAt.getTime() - Date.now() > SESSION_REUSE_MARGIN_MS &&
      (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.PROCESSING)
    ) {
      return { checkoutUrl: payment.checkoutUrl, expiresAt: payment.checkoutExpiresAt };
    }

    const webUrl = (this.config.get<string>("WEB_URL") ?? "").replace(/\/$/, "");
    if (!webUrl.startsWith("https://")) {
      // Aslan requires HTTPS success/cancel URLs.
      throw new BadRequestException("WEB_URL must be an https:// URL to use Aslan checkout.");
    }

    const attempt = payment.checkoutAttempts + 1;
    const session = await this.aslan.createCheckoutSession({
      // NAPS only accepts whole-MAD amounts, so round to the dirham.
      amountCentimes: Math.round(order.totalAmount) * 100,
      successUrl: `${webUrl}/payment/result?order=${order.id}&status=success`,
      cancelUrl: `${webUrl}/payment/result?order=${order.id}&status=cancel`,
      // Same key on a network retry returns the same session; a new attempt gets a new key.
      idempotencyKey: `order_${order.id}_${attempt}`,
      customer: {
        email: order.customer.email,
        name: `${order.customer.firstName} ${order.customer.lastName}`,
      },
      metadata: { orderId: order.id, paymentId: payment.id },
    });

    const expiresAt = new Date(session.expiresAt);
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayRef: session.id,
        checkoutUrl: session.url,
        checkoutExpiresAt: expiresAt,
        checkoutAttempts: attempt,
        status: PaymentStatus.PENDING,
      },
    });

    return { checkoutUrl: session.url, expiresAt };
  }

  async getOrderPaymentStatus(user: { id: string; role: Role }, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order || (order.customerId !== user.id && user.role !== Role.ADMIN)) {
      throw new NotFoundException("Order not found");
    }
    if (!order.payment) throw new NotFoundException("No payment for this order");

    const { method, status, amount, currency, paidAt } = order.payment;
    return { orderId: order.id, orderStatus: order.status, method, status, amount, currency, paidAt };
  }

  /** Entry point for POST /payments/aslan/webhook — signature already verified. */
  async handleAslanEvent(event: AslanWebhookEvent) {
    const obj: any = (event as any).data?.object ?? (event as any).data ?? event;
    const metadata: Record<string, string> = obj?.metadata ?? (event as any).metadata ?? {};
    const sessionId: string | undefined =
      obj?.checkoutSessionId ??
      obj?.sessionId ??
      obj?.session?.id ??
      (typeof obj?.id === "string" && obj.id.startsWith("cs_") ? obj.id : undefined);

    // metadata.paymentId is what we sent at checkout creation: authoritative when present.
    // The session id is only a fallback, so a mismatch can never resolve to another payment.
    const payment = metadata.paymentId
      ? await this.prisma.payment.findUnique({ where: { id: metadata.paymentId } })
      : sessionId
        ? await this.prisma.payment.findUnique({ where: { gatewayRef: sessionId } })
        : null;
    if (!payment) {
      this.logger.warn(`Aslan ${event.event}: no matching payment (session=${sessionId})`);
      return;
    }

    switch (event.event) {
      case "payment.succeeded": {
        // Never trust a paid event whose amount differs from what we asked for.
        if (typeof obj?.amount === "number" && obj.amount !== Math.round(payment.amount) * 100) {
          this.logger.error(`Aslan amount mismatch on payment ${payment.id}: got ${obj.amount}`);
          return;
        }
        if (await this.markPaid(payment.id, payment.orderId, event)) {
          await this.notifications.notify(payment.userId, {
            title: "Paiement reçu",
            body: "Votre paiement a bien été reçu, votre commande est confirmée.",
            type: "order_update",
            data: { orderId: payment.orderId },
          });
        }
        return;
      }
      case "payment.failed":
        await this.prisma.payment.updateMany({
          where: { id: payment.id, status: { not: PaymentStatus.COMPLETED } },
          data: { status: PaymentStatus.FAILED, gatewayResponse: event as any },
        });
        return;
      case "payment.pending_cash":
        // Customer got a reference code and will pay at a cash agent.
        await this.prisma.payment.updateMany({
          where: { id: payment.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] } },
          data: { status: PaymentStatus.PROCESSING, gatewayResponse: event as any },
        });
        return;
      default:
        this.logger.debug(`Ignoring Aslan event ${event.event}`);
    }
  }

  /** Returns true only the first time a payment is settled on a pending order. */
  private async markPaid(paymentId: string, orderId: string, event: AslanWebhookEvent): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Conditional update makes webhook retries/duplicates idempotent.
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: { not: PaymentStatus.COMPLETED } },
        data: { status: PaymentStatus.COMPLETED, paidAt: new Date(), gatewayResponse: event as any },
      });
      if (count === 0) return false;

      const { count: confirmed } = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CONFIRMED },
      });
      if (!confirmed) {
        // Paid after the hold expired or the order was cancelled: the money is taken, so refund it.
        this.logger.error(`Payment ${paymentId} completed on a non-pending order ${orderId}: REFUND REQUIRED`);
        return false;
      }
      await recordCommission(tx, orderId);
      return true;
    });
  }
}
