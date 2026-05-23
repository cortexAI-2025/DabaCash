import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Global prefix
  app.setGlobalPrefix("api");

  // URI versioning: /api/v1/...
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  // CORS
  app.enableCors({
    origin: process.env.NEXT_PUBLIC_API_URL
      ? [process.env.NEXT_PUBLIC_API_URL, "http://localhost:3000"]
      : "http://localhost:3000",
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle("DabaCash API")
    .setDescription("Hybrid marketplace + franchise platform for second-hand electronics in Morocco")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.API_PORT ?? 4000;
  await app.listen(port);
  console.log(`🚀 DabaCash API running on http://localhost:${port}`);
  console.log(`📄 Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
