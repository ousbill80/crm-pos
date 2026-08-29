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
docker compose --env-file .env.prod -p caisse-crm-prod -f docker-compose.prod.yml up -d --build --remove-orphans
echo "→ Shop prod"
docker compose --env-file .env.shop -p caisse-crm-shop -f docker-compose.shop.yml up -d --build --remove-orphans

docker compose --env-file .env.prod -p caisse-crm-prod -f docker-compose.prod.yml ps
docker compose --env-file .env.shop -p caisse-crm-shop -f docker-compose.shop.yml ps

echo "→ Santé CRM prod (8081)"
for i in $(seq 1 45); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/health || true)"
  if [ "$code" = "200" ]; then
    echo "CRM prod OK (HTTP $code)"
    break
  fi
  if [ "$i" = "45" ]; then
    echo "CRM prod n'a pas répondu /health (dernier HTTP=$code)" >&2
    docker compose --env-file .env.prod -p caisse-crm-prod -f docker-compose.prod.yml logs --tail=80 api gateway
    exit 1
  fi
  sleep 2
done

echo "→ Santé boutique prod (8080)"
code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true)"
echo "Shop prod HTTP $code"
echo "Prod déployée. www / crm / pos .majorautoparts.shop"
