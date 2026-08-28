#!/bin/sh
set -e

pnpm --filter api exec prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START=true — chargement des données démo…"
  pnpm --filter api prisma:seed
fi

exec node apps/api/dist/main.shop.js
