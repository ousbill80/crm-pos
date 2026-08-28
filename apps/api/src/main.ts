import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { applyHttpSecurity, configureCors } from './http-security';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  applyHttpSecurity(app);
  // Photos catalogue (data URL) + import CSV/Excel (base64) — au-delà de 100 ko.
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));
  app.use(cookieParser());
  configureCors(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
