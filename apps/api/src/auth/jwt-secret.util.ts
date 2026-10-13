// Audit sécurité : le .env.example fourni au scaffold contient un
// JWT_SECRET placeholder ("change-me-generate-with-openssl-rand-hex-32").
// Rien n'empêchait un déploiement de copier ce fichier sans le régénérer.
// On échoue au boot plutôt qu'en silence si ce placeholder atteint la prod.
const MOTIF_PLACEHOLDER = /change-me/i;

export function resolveJwtSecret(
  secret: string | undefined,
  nodeEnv: string | undefined,
): string {
  if (!secret) {
    throw new Error('JWT_SECRET doit être défini (voir apps/api/.env).');
  }
  if (nodeEnv === 'production' && MOTIF_PLACEHOLDER.test(secret)) {
    throw new Error(
      'JWT_SECRET contient encore la valeur placeholder du .env.example — ' +
        'générer un secret avec `openssl rand -hex 32` avant un déploiement en production.',
    );
  }
  return secret;
}
