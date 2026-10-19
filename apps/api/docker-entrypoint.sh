#!/bin/sh
set -e

# Prisma est lié sous apps/api (pnpm), pas à la racine du monorepo.
# Pas de pnpm/corepack au runtime : réseau Docker souvent restreint.
PRISMA=apps/api/node_modules/.bin/prisma
"$PRISMA" migrate deploy --schema=apps/api/prisma/schema.prisma

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "SEED_ON_START=true — chargement des données démo…"
  # `prisma db seed` spawne `ts-node` directement (pas via pnpm, qui
  # l'ajouterait au PATH) ; avec node-linker=hoisted (.npmrc), son binaire
  # vit dans le node_modules local du package, pas à la racine du monorepo.
  (cd apps/api && PATH="$PWD/node_modules/.bin:$PATH" ./node_modules/.bin/prisma db seed)
fi

exec node apps/api/dist/src/main.js
