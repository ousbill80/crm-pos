import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Durcissement HTTP commun CRM et api-shop.
 * Le HTML/CSP de la SPA est porté par nginx ; ici on protège l’API JSON.
 */
export function applyHttpSecurity(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
}

export type CorsMode = { kind: 'origins'; origins: string[] } | { kind: 'closed' } | { kind: 'dev-open' };

export function resolveCorsMode(
  rawOrigins: string | undefined,
  nodeEnv: string | undefined,
): CorsMode {
  const raw = rawOrigins?.trim();
  if (raw) {
    return {
      kind: 'origins',
      origins: raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    };
  }
  if (nodeEnv === 'production') return { kind: 'closed' };
  return { kind: 'dev-open' };
}

export function configureCors(
  app: NestExpressApplication,
  options?: { credentials?: boolean },
): void {
  const mode = resolveCorsMode(process.env.CORS_ORIGINS, process.env.NODE_ENV);
  const credentials = options?.credentials === true;
  if (mode.kind === 'origins') {
    app.enableCors({
      origin: mode.origins,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials,
    });
    return;
  }
  if (mode.kind === 'closed') {
    app.enableCors({ origin: false });
    return;
  }
  app.enableCors(credentials ? { origin: true, credentials: true } : undefined);
}
