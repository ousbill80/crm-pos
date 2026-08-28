import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import type { Request } from 'express';
import cookieParser from 'cookie-parser';
import type { RawBodyRequest } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ShopAppModule } from './shop-app.module';

function configureCors(app: NestExpressApplication): void {
  const rawOrigins = process.env.CORS_ORIGINS?.trim();
  if (rawOrigins) {
    const origins = rawOrigins
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    app.enableCors({
      origin: origins,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    });
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    app.enableCors({ origin: false });
    return;
  }
  app.enableCors({ origin: true, credentials: true });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(ShopAppModule, {
    rawBody: true,
  });
  app.set('trust proxy', 1);
  app.use(
    json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as RawBodyRequest<Request>).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  configureCors(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
