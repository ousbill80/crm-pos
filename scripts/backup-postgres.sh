#!/usr/bin/env bash
set -euo pipefail

# Sauvegarde de la base PostgreSQL (§6.7 — sauvegarde et continuité).
# Prend un dump au format custom pg_dump (compressé, restaurable avec
# pg_restore) depuis le conteneur `db` de docker-compose.yml, puis applique
# une rotation simple des archives.
#
# Usage :
#   scripts/backup-postgres.sh
#
# Variables d'environnement (alignées sur docker-compose.yml) :
#   COMPOSE_FILE       Fichier compose (défaut: docker-compose.yml)
#   COMPOSE_ENV_FILE   Fichier .env pour compose (ex. .env.prod)
#   POSTGRES_SERVICE   Nom du service docker compose (défaut: db)
#   POSTGRES_USER       (défaut: caisse)
#   POSTGRES_DB         (défaut: caisse_crm)
#   BACKUP_DIR          Répertoire des archives (défaut: ./backups)
#   RETENTION_DAYS       Rétention en jours (défaut: 14)

POSTGRES_SERVICE="${POSTGRES_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-caisse}"
POSTGRES_DB="${POSTGRES_DB:-caisse_crm}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

compose() {
  if [ -n "${COMPOSE_ENV_FILE:-}" ]; then
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="${POSTGRES_DB}_${timestamp}.dump"
target="${BACKUP_DIR}/${filename}"

echo "Sauvegarde de la base '${POSTGRES_DB}' (service ${POSTGRES_SERVICE}) vers ${target}..."
compose exec -T "$POSTGRES_SERVICE" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/tmp/${filename}"
compose cp "${POSTGRES_SERVICE}:/tmp/${filename}" "$target"
compose exec -T "$POSTGRES_SERVICE" rm -f "/tmp/${filename}"

echo "Sauvegarde terminée : ${target} ($(du -h "$target" | cut -f1))"

# Rotation : supprime les archives plus vieilles que RETENTION_DAYS.
find "$BACKUP_DIR" -maxdepth 1 -name "${POSTGRES_DB}_*.dump" -mtime "+${RETENTION_DAYS}" -print -delete

echo "Rétention appliquée (${RETENTION_DAYS} jours)."
