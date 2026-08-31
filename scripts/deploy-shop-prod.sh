#!/usr/bin/env bash
set -euo pipefail

# Déploie uniquement la boutique prod (api-shop + gateway-shop).
# Plus rapide que deploy-prod.sh quand seuls apps/shop ou l'API shop changent.
# Usage (sur le VPS) :
#   ./scripts/deploy-shop-prod.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env.shop ]; then
  echo "Manque .env.shop." >&2
  exit 1
fi

echo "→ Shop prod (api-shop + gateway-shop)"
docker compose --env-file .env.shop -p caisse-crm-shop -f docker-compose.shop.yml up -d --build --remove-orphans
docker compose --env-file .env.shop -p caisse-crm-shop -f docker-compose.shop.yml ps

echo "→ Santé boutique prod (8080)"
for i in $(seq 1 45); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health || true)"
  if [ "$code" = "200" ]; then
    echo "Shop prod OK (HTTP $code)"
    break
  fi
  if [ "$i" = "45" ]; then
    echo "Shop prod n'a pas répondu /health (dernier HTTP=$code)" >&2
    docker compose --env-file .env.shop -p caisse-crm-shop -f docker-compose.shop.yml logs --tail=80 api-shop gateway-shop
    exit 1
  fi
  sleep 2
done

echo "Boutique prod déployée. www.majorautoparts.shop"
