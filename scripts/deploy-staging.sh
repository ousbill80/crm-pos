#!/usr/bin/env bash
set -euo pipefail

# Déploie / met à jour uniquement la stack staging (jamais prod).
# Usage (sur le VPS) :
#   ./scripts/deploy-staging.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${COMPOSE_ENV_FILE:-.env.staging}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Manque $ENV_FILE — copier .env.staging.example et renseigner les secrets." >&2
  exit 1
fi

echo "→ Build + up staging ($COMPOSE_FILE)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "→ Santé CRM staging (8083)"
for i in $(seq 1 30); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8083/health || true)"
  if [ "$code" = "200" ]; then
    echo "CRM staging OK (HTTP $code)"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "CRM staging n'a pas répondu /health (dernier HTTP=$code)" >&2
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=80 api gateway-crm
    exit 1
  fi
  sleep 2
done

echo "→ Santé boutique staging (8082)"
code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8082/health || true)"
echo "Shop staging HTTP $code"
echo "Staging déployé. URLs : staging / crm-staging / pos-staging .majorautoparts.shop"
