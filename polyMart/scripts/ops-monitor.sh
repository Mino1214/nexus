#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:43221}"
WEB_URL="${WEB_URL:-http://127.0.0.1:43220}"
BACKUP_ROOT="${BACKUP_ROOT:-backups}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-36}"
SMOKE_SCRIPT="${SMOKE_SCRIPT:-scripts/ops-smoke.sh}"

case "$MAX_BACKUP_AGE_HOURS" in
  ''|*[!0-9]*)
    echo "[ops-monitor] MAX_BACKUP_AGE_HOURS must be a positive integer" >&2
    exit 1
    ;;
esac

if [ "$MAX_BACKUP_AGE_HOURS" -lt 1 ]; then
  echo "[ops-monitor] MAX_BACKUP_AGE_HOURS must be >= 1" >&2
  exit 1
fi

if [ ! -f "$SMOKE_SCRIPT" ]; then
  echo "[ops-monitor] smoke script not found: ${SMOKE_SCRIPT}" >&2
  exit 1
fi

echo "[ops-monitor] running smoke checks"
bash "$SMOKE_SCRIPT"

if [ ! -d "$BACKUP_ROOT" ]; then
  echo "[ops-monitor] backup root does not exist: ${BACKUP_ROOT}" >&2
  exit 1
fi

LATEST_BACKUP="$(ls -td "${BACKUP_ROOT}"/* 2>/dev/null | head -n 1 || true)"

if [ -z "$LATEST_BACKUP" ] || [ ! -d "$LATEST_BACKUP" ]; then
  echo "[ops-monitor] no backup directories found under ${BACKUP_ROOT}" >&2
  exit 1
fi

for required_file in postgres.sql metadata.json health.json ready.json; do
  if [ ! -s "${LATEST_BACKUP}/${required_file}" ]; then
    echo "[ops-monitor] required backup artifact missing: ${LATEST_BACKUP}/${required_file}" >&2
    exit 1
  fi
done

LATEST_NAME="$(basename "$LATEST_BACKUP")"

if printf '%s' "$LATEST_NAME" | grep -Eq '^[0-9]{8}-[0-9]{6}$'; then
  LATEST_EPOCH="$(perl -MTime::Piece -e 'print Time::Piece->strptime($ARGV[0], "%Y%m%d-%H%M%S")->epoch' "$LATEST_NAME")"
else
  if stat -f %m "$LATEST_BACKUP" >/dev/null 2>&1; then
    LATEST_EPOCH="$(stat -f %m "$LATEST_BACKUP")"
  else
    LATEST_EPOCH="$(stat -c %Y "$LATEST_BACKUP")"
  fi
fi

NOW_EPOCH="$(date +%s)"
if [ "$LATEST_EPOCH" -gt "$NOW_EPOCH" ]; then
  BACKUP_AGE_HOURS=0
else
  BACKUP_AGE_HOURS="$(((NOW_EPOCH - LATEST_EPOCH) / 3600))"
fi

echo "[ops-monitor] latest-backup=${LATEST_BACKUP}"
echo "[ops-monitor] backup-age-hours=${BACKUP_AGE_HOURS}"
echo "[ops-monitor] api-url=${API_URL}"
echo "[ops-monitor] web-url=${WEB_URL}"

if [ "$BACKUP_AGE_HOURS" -gt "$MAX_BACKUP_AGE_HOURS" ]; then
  echo "[ops-monitor] latest backup is older than ${MAX_BACKUP_AGE_HOURS} hours" >&2
  exit 1
fi

echo "[ops-monitor] completed"
