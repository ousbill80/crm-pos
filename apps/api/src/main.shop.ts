import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import type { Request } from 'express';
import cookieParser from 'cookie-parser';
import type { RawBodyRequest } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ShopAppModule } from './shop-app.module';
import { applyHttpSecurity, configureCors } from './http-security';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(ShopAppModule, {
    rawBody: true,
  });
  applyHttpSecurity(app);
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
  configureCors(app, { credentials: true });
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
