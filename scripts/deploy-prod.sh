#!/usr/bin/env bash
set -euo pipefail

# Déploie la production (CRM + shop). Jamais appelé par la CI automatique.
# Usage (sur le VPS, après validation staging) :
#   ./scripts/deploy-prod.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env.prod ] || [ ! -f .env.shop ]; then
  echo "Manque .env.prod et/ou .env.shop." >&2
  exit 1
fi

echo "→ CRM prod"
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build --remove-orphans
echo "→ Shop prod"
docker compose --env-file .env.shop -f docker-compose.shop.yml up -d --build --remove-orphans

docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.shop -f docker-compose.shop.yml ps

curl -sf http://127.0.0.1:8081/health >/dev/null
echo "Prod CRM /health OK"
echo "Prod déployée. www / crm / pos .majorautoparts.shop"
