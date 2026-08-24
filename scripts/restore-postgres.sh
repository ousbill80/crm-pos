#!/usr/bin/env bash
set -euo pipefail

# Restauration de la base PostgreSQL à partir d'une sauvegarde produite par
# scripts/backup-postgres.sh (§6.7 — sauvegarde et continuité).
#
# ATTENTION : opération destructive — la base cible est supprimée puis
# recréée avant restauration. Par défaut, restaure les fichiers de conf
# docker-compose.yml (service "db", base "caisse_crm") ; utiliser
# --target-db pour restaurer vers une base de test distincte sans toucher à
# la base de production (c'est la procédure recommandée pour tester une
# sauvegarde avant de l'utiliser en conditions réelles).
#
# Usage :
#   scripts/restore-postgres.sh <fichier.dump> [--target-db NOM]

POSTGRES_SERVICE="${POSTGRES_SERVICE:-db}"
POSTGRES_USER="${POSTGRES_USER:-caisse}"
POSTGRES_DB_DEFAULT="${POSTGRES_DB:-caisse_crm}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

compose() {
  if [ -n "${COMPOSE_ENV_FILE:-}" ]; then
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

if [ $# -lt 1 ]; then
  echo "Usage: $0 <fichier.dump> [--target-db NOM]" >&2
  exit 1
fi

BACKUP_FILE="$1"
shift
TARGET_DB="$POSTGRES_DB_DEFAULT"

while [ $# -gt 0 ]; do
  case "$1" in
    --target-db)
      TARGET_DB="$2"
      shift 2
      ;;
    *)
      echo "Option inconnue : $1" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Fichier de sauvegarde introuvable : $BACKUP_FILE" >&2
  exit 1
fi

echo "ATTENTION : cette opération va ÉCRASER toutes les données de la base '${TARGET_DB}'."
echo "  Source  : ${BACKUP_FILE}"
echo "  Service : ${POSTGRES_SERVICE}"
read -r -p "Tapez exactement RESTAURER pour confirmer : " confirmation
if [ "$confirmation" != "RESTAURER" ]; then
  echo "Confirmation invalide — restauration annulée."
  exit 1
fi

filename="$(basename "$BACKUP_FILE")"
compose cp "$BACKUP_FILE" "${POSTGRES_SERVICE}:/tmp/${filename}"

# Base cible recréée depuis 'postgres' pour pouvoir DROP/CREATE la base
# cible sans connexion active dessus (les connexions existantes sont
# terminées explicitement d'abord).
compose exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();"
compose exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\";"
compose exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\" OWNER \"${POSTGRES_USER}\";"

compose exec -T "$POSTGRES_SERVICE" pg_restore -U "$POSTGRES_USER" -d "$TARGET_DB" --no-owner --clean --if-exists "/tmp/${filename}"
compose exec -T "$POSTGRES_SERVICE" rm -f "/tmp/${filename}"

echo "Restauration terminée sur la base '${TARGET_DB}'."
