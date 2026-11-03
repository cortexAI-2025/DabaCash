import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import helmet from "helmet";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { isProd } from "./config/env.validation";

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const DEV_ORIGINS = ["http://localhost:3000", "https://localhost"]; // web dev server + Capacitor Android WebView

/** Everything an HTTP request goes through. Shared by main.ts and the integration tests. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  const http = new Logger("Http");

  const proxies = config.get<string>("TRUST_PROXY");
  if (proxies) app.set("trust proxy", /^\d+$/.test(proxies) ? Number(proxies) : proxies);

  const swagger = config.get<string>("ENABLE_SWAGGER") === "true" || (!isProd() && config.get<string>("ENABLE_SWAGGER") !== "false");
  app.use(
    helmet({
      contentSecurityPolicy: swagger ? false : undefined, // Swagger UI needs inline scripts
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // Request id + one access-log line per request. No bodies, no query strings: they may hold personal data.
  app.use((req: any, res: any, next: () => void) => {
    const incoming = req.headers["x-request-id"];
    req.id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", req.id);
    const started = Date.now();
    res.on("finish", () => {
      if (String(req.originalUrl).startsWith("/api/v1/health")) return;
      const user = req.user?.id ? ` user=${req.user.id}` : "";
      http.log(`${req.method} ${String(req.originalUrl).split("?")[0]} ${res.statusCode} ${Date.now() - started}ms id=${req.id}${user}`);
    });
    next();
  });

  const origins = (config.get<string>("CORS_ORIGINS") ?? (isProd() ? "" : DEV_ORIGINS.join(",")))
    .split(",").map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "Retry-After"],
    maxAge: 600,
  });

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (swagger) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("DabaCash API").setVersion("1.0").addBearerAuth().build()
    );
    SwaggerModule.setup("docs", app, doc);
  }
  return { swagger };
}
