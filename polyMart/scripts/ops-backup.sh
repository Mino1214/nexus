#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE_PATH="${COMPOSE_FILE_PATH:-compose.prod.yaml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-}"
BACKUP_ROOT="${BACKUP_ROOT:-backups}"
TIMESTAMP="${TIMESTAMP:-$(date '+%Y%m%d-%H%M%S')}"
BACKUP_DIR="${BACKUP_DIR:-${BACKUP_ROOT}/${TIMESTAMP}}"
API_URL="${API_URL:-http://127.0.0.1:43221}"

COMPOSE_ARGS=(-f "$COMPOSE_FILE_PATH")
if [ -n "$COMPOSE_ENV_FILE" ]; then
  COMPOSE_ARGS=(--env-file "$COMPOSE_ENV_FILE" "${COMPOSE_ARGS[@]}")
fi

mkdir -p "$BACKUP_DIR"

if ! docker compose "${COMPOSE_ARGS[@]}" ps postgres >/dev/null 2>&1; then
  echo "postgres service is not available in ${COMPOSE_FILE_PATH}" >&2
  exit 1
fi

echo "[ops-backup] writing ${BACKUP_DIR}/postgres.sql"
docker compose "${COMPOSE_ARGS[@]}" exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "${BACKUP_DIR}/postgres.sql"

echo "[ops-backup] writing metadata"
cat > "${BACKUP_DIR}/metadata.json" <<EOF
{
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "composeFile": "${COMPOSE_FILE_PATH}",
  "apiUrl": "${API_URL}",
  "postgresDump": "postgres.sql",
  "notes": [
    "Redis is excluded because the current production stack uses Redis for cache and queue state.",
    "Application truth is stored in PostgreSQL."
  ]
}
EOF

echo "[ops-backup] capturing health snapshots"
curl -fsS "${API_URL}/health" > "${BACKUP_DIR}/health.json"
curl -fsS "${API_URL}/ready" > "${BACKUP_DIR}/ready.json"

echo "[ops-backup] done"
echo "${BACKUP_DIR}"
