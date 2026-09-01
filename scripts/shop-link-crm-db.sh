#!/usr/bin/env bash
# Lie la stack shop à la base PostgreSQL du CRM (prod Hostinger).
# Usage (sur le VPS, depuis la racine du dépôt) :
#   ./scripts/shop-link-crm-db.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env.prod ]; then
  echo "Manque .env.prod." >&2
  exit 1
fi

if [ ! -f .env.shop ]; then
  cp .env.shop.example .env.shop
  echo "Créé .env.shop depuis .env.shop.example — vérifiez les autres secrets."
fi

# shellcheck disable=SC1091
set -a
source .env.prod
set +a

DB_USER="${POSTGRES_USER:-caisse}"
DB_NAME="${POSTGRES_DB:-caisse_crm}"
DB_HOST="${CRM_DB_HOST:-caisse-crm-prod-db-1}"
CRM_NETWORK="${CRM_DOCKER_NETWORK:-caisse-crm-prod_backend}"

DATABASE_URL="postgresql://${DB_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:5432/${DB_NAME}?schema=public"

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
    rm -f "${file}.bak"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$file"
  fi
}

upsert_env DATABASE_URL "$DATABASE_URL" .env.shop
upsert_env CRM_DOCKER_NETWORK "$CRM_NETWORK" .env.shop

echo "→ .env.shop : DATABASE_URL → ${DB_HOST}/${DB_NAME}"
echo "→ Redéployer : ./scripts/deploy-shop-prod.sh"
