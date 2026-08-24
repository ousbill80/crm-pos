import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

function configureCors(app: NestExpressApplication): void {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) {
    const origins = raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    app.enableCors({
      origin: origins,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    // Web prod : same-origin via passerelle nginx. Mobile / outils : définir CORS_ORIGINS.
    app.enableCors({ origin: false });
    return;
  }
  app.enableCors();
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  // Photos catalogue (data URL) + import CSV/Excel (base64) — au-delà de 100 ko.
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));
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
