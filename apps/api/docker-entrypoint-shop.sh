#!/bin/sh
set -e

# Prisma est lié sous apps/api (pnpm), pas à la racine du monorepo.
# Pas de pnpm/corepack au runtime : réseau Docker souvent internal.
PRISMA=apps/api/node_modules/.bin/prisma
"$PRISMA" migrate deploy --schema=apps/api/prisma/schema.prisma

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START=true — chargement des données démo…"
  (cd apps/api && ./node_modules/.bin/prisma db seed)
fi

exec node apps/api/dist/src/main.shop.js
