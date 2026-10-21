import {
  Injectable,
  Logger,
  BadGatewayException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";

// https://doc.aslan.ma — hosted checkout (card + cash-to-web), amounts in centimes.
const DEFAULT_API_URL = "https://api.aslanpay.ma/pay/api/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface AslanCheckoutSession {
  id: string;
  url: string;
  status: string;
  expiresAt: string;
}

export interface CreateCheckoutInput {
  amountCentimes: number;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  customer?: { email?: string; name?: string };
  metadata?: Record<string, string>;
}

export interface AslanWebhookEvent {
  event: string;
  [key: string]: unknown;
}

@Injectable()
export class AslanClient {
  private readonly logger = new Logger(AslanClient.name);

  constructor(private config: ConfigService) {}

  private get secretKey() {
    return this.config.get<string>("ASLAN_SECRET_KEY");
  }

  private get baseUrl() {
    return (this.config.get<string>("ASLAN_API_URL") ?? DEFAULT_API_URL).replace(/\/$/, "");
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<AslanCheckoutSession> {
    if (!this.secretKey) {
      throw new ServiceUnavailableException("Le paiement en ligne n'est pas configuré.");
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/checkout/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          amount: input.amountCentimes,
          currency: "MAD",
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          customer: input.customer,
          metadata: input.metadata,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      this.logger.error(`Aslan unreachable: ${(err as Error).message}`);
      throw new BadGatewayException("Service de paiement injoignable, réessayez.");
    }

    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Log Aslan's error code/details, never the key.
      this.logger.error(`Aslan ${res.status} ${body?.code ?? ""}: ${body?.message ?? ""}`);
      throw new BadGatewayException("Le service de paiement a refusé la requête.");
    }
    return body as AslanCheckoutSession;
  }

  /**
   * Header format: `t=<unix_seconds>,v1=<hex hmac>`;
   * v1 = HMAC-SHA256(webhookSecret, `${t}.${rawBody}`). Rejects stale timestamps (replay).
   */
  verifyWebhook(rawBody: Buffer | undefined, header: string | undefined): AslanWebhookEvent {
    const secret = this.config.get<string>("ASLAN_WEBHOOK_SECRET");
    if (!secret) throw new ServiceUnavailableException("Webhook secret not configured");
    if (!rawBody || !header) throw new UnauthorizedException("Missing signature");

    const parts = Object.fromEntries(
      header.split(",").map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      })
    );
    const t = Number.parseInt(parts.t, 10);
    const signature: string | undefined = parts.v1;
    if (!Number.isFinite(t) || !signature) throw new UnauthorizedException("Malformed signature");

    if (Math.abs(Math.floor(Date.now() / 1000) - t) > WEBHOOK_TOLERANCE_SECONDS) {
      throw new UnauthorizedException("Webhook timestamp out of tolerance");
    }

    const expected = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest();
    const received = Buffer.from(signature, "hex");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new UnauthorizedException("Invalid signature");
    }

    return JSON.parse(rawBody.toString("utf8"));
  }
}
