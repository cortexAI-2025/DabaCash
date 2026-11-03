import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

async function bootstrap() {
  // rawBody: Aslan webhook signatures are computed over the exact request bytes
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const { swagger } = configureApp(app);

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  const log = new Logger("Bootstrap");
  log.log(`DabaCash API running on http://localhost:${port}`);
  if (swagger) log.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  // A bad configuration must stop the process with a readable reason, not a stack of Nest internals.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
