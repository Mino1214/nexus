#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE_PATH="${COMPOSE_FILE_PATH:-compose.prod.yaml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-}"
DUMP_FILE="${1:-}"

COMPOSE_ARGS=(-f "$COMPOSE_FILE_PATH")
if [ -n "$COMPOSE_ENV_FILE" ]; then
  COMPOSE_ARGS=(--env-file "$COMPOSE_ENV_FILE" "${COMPOSE_ARGS[@]}")
fi

if [ -z "$DUMP_FILE" ]; then
  echo "usage: bash scripts/ops-restore.sh <path-to-postgres.sql>" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "dump file not found: $DUMP_FILE" >&2
  exit 1
fi

echo "[ops-restore] this will replace the current PostgreSQL schema in ${COMPOSE_FILE_PATH}"

docker compose "${COMPOSE_ARGS[@]}" exec -T postgres sh -lc '
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
GRANT ALL ON SCHEMA public TO public;
SQL
'

echo "[ops-restore] restoring ${DUMP_FILE}"
docker compose "${COMPOSE_ARGS[@]}" exec -T postgres sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$DUMP_FILE"

echo "[ops-restore] done"
