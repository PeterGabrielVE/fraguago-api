import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors(); // lets the Next.js frontend call the API

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // Filtros globales de errores.
  // Se evalúan en orden INVERSO al registro: primero se prueba
  // PrismaExceptionFilter, y AllExceptionsFilter queda como catch-all.
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new AllExceptionsFilter(httpAdapterHost),
    new PrismaExceptionFilter(httpAdapterHost),
  );

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();