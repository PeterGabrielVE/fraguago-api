import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/prisma-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix("api");

  // Detrás de Caddy/Render req.ip sería la IP del proxy: con esto sale del
  // X-Forwarded-For que agrega el proxy (base del rate limiting por IP).
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));

  app.use(cookieParser()); // ← habilita req.cookies

  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableShutdownHooks(); // vacía la cola de PostHog al apagar
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
