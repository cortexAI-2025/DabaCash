import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@dabacash/database";
import { PrismaService } from "../common/prisma/prisma.service";

export interface Notice {
  title: string;
  body: string;
  type: "order_update" | "buyback_update" | "system";
  data?: Prisma.InputJsonValue;
}

const RESEND_URL = "https://api.resend.com";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService
  ) {}

  /**
   * Records an in-app notification and emails it. Best effort by design: a failure here
   * (bad address, provider down) must never roll back or fail the business action that triggered it.
   */
  async notify(userId: string, notice: Notice) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      });
      if (!user) return;

      await this.prisma.notification.create({
        data: { userId, title: notice.title, body: notice.body, type: notice.type, data: notice.data },
      });
      await this.sendEmail(user.email, user.firstName, notice);
    } catch (err) {
      this.logger.error(`Notification failed for ${userId}: ${(err as Error).message}`);
    }
  }

  private async sendEmail(to: string, firstName: string, notice: Notice) {
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    if (!apiKey) {
      this.logger.debug(`Email skipped (RESEND_API_KEY not set): "${notice.title}"`);
      return;
    }

    const base = (this.config.get<string>("RESEND_API_URL") ?? RESEND_URL).replace(/\/$/, "");
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.config.get<string>("EMAIL_FROM") ?? "DabaCash <noreply@dabacash.ma>",
        to: [to],
        subject: notice.title,
        html:
          `<p>Bonjour ${escapeHtml(firstName)},</p>` +
          `<p>${escapeHtml(notice.body)}</p>` +
          `<p style="color:#64748b">L'équipe DabaCash</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) this.logger.error(`Resend ${res.status} for "${notice.title}"`);
  }
}
