import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@dabacash/database";

/**
 * One error shape for every failure: { statusCode, message, error, requestId }.
 * Known database errors become meaningful 4xx responses instead of opaque 500s,
 * and internals (stack traces, SQL, Prisma details) never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== "http") throw exception;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();
    const requestId: string | undefined = req.id;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Erreur interne du serveur";
    let error = "Internal Server Error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === "string") message = r;
      else {
        const o = r as { message?: string | string[]; error?: string };
        message = o.message ?? exception.message;
        error = o.error ?? error;
      }
      if (status < 500) error = typeof r === "object" && (r as any).error ? (r as any).error : HttpStatus[status] ?? error;
    } else if (isClientError(exception)) {
      // Raised by the HTTP layer before Nest sees the request (body-parser: payload too large, malformed JSON).
      status = exception.status ?? exception.statusCode!;
      error = HttpStatus[status] ?? "Bad Request";
      message = status === 413 ? "Corps de requête trop volumineux" : status === 400 ? "Requête mal formée" : "Requête invalide";
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, message, error } = mapPrisma(exception.code));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = "Requête invalide";
      error = "Bad Request";
    }

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${req.method} ${String(req.originalUrl).split("?")[0]} -> ${status} id=${requestId}`, stack);
    }

    if (res.headersSent) return;
    if (status === 429 && exception instanceof HttpException) {
      const retry = (exception.getResponse() as { retryAfterSeconds?: number }).retryAfterSeconds;
      if (retry) res.setHeader("Retry-After", String(retry));
    }
    res.status(status).json({ statusCode: status, message, error, requestId });
  }
}

function isClientError(e: unknown): e is { status?: number; statusCode?: number } {
  const o = e as { status?: unknown; statusCode?: unknown; expose?: unknown } | null;
  const code = typeof o?.status === "number" ? o.status : typeof o?.statusCode === "number" ? o.statusCode : 0;
  return !!o && o.expose === true && code >= 400 && code < 500;
}

function mapPrisma(code: string): { status: number; message: string; error: string } {
  switch (code) {
    case "P2025": return { status: 404, message: "Ressource introuvable", error: "Not Found" };
    case "P2002": return { status: 409, message: "Cette ressource existe déjà", error: "Conflict" };
    case "P2003":
    case "P2004": return { status: 409, message: "Opération refusée : contrainte d'intégrité", error: "Conflict" };
    case "P2034": return { status: 409, message: "Conflit de concurrence, veuillez réessayer", error: "Conflict" };
    case "P2000":
    case "P2006":
    case "P2007": return { status: 400, message: "Valeur invalide", error: "Bad Request" };
    default: return { status: 500, message: "Erreur interne du serveur", error: "Internal Server Error" };
  }
}
