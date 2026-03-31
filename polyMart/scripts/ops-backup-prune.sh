#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-backups}"
KEEP_COUNT="${KEEP_COUNT:-7}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-14}"

case "$KEEP_COUNT" in
  ''|*[!0-9]*)
    echo "[ops-backup-prune] KEEP_COUNT must be a positive integer" >&2
    exit 1
    ;;
esac

case "$MAX_AGE_DAYS" in
  ''|*[!0-9]*)
    echo "[ops-backup-prune] MAX_AGE_DAYS must be a positive integer" >&2
    exit 1
    ;;
esac

if [ "$KEEP_COUNT" -lt 1 ] || [ "$MAX_AGE_DAYS" -lt 1 ]; then
  echo "[ops-backup-prune] KEEP_COUNT and MAX_AGE_DAYS must be >= 1" >&2
  exit 1
fi

if [ ! -d "$BACKUP_ROOT" ]; then
  echo "[ops-backup-prune] backup root does not exist: ${BACKUP_ROOT}"
  exit 0
fi

if ! find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | grep -q .; then
  echo "[ops-backup-prune] no backup directories found"
  exit 0
fi

echo "[ops-backup-prune] keep-count=${KEEP_COUNT} max-age-days=${MAX_AGE_DAYS}"

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

COUNT=0
for dir in $(ls -td "${BACKUP_ROOT}"/* 2>/dev/null || true); do
  if [ ! -d "$dir" ]; then
    continue
  fi
  COUNT=$((COUNT + 1))
  if [ "$COUNT" -le "$KEEP_COUNT" ]; then
    continue
  fi
  printf '%s\n' "$dir" >> "$TMP_FILE"
done

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$MAX_AGE_DAYS" -print 2>/dev/null >> "$TMP_FILE" || true

if [ ! -s "$TMP_FILE" ]; then
  echo "[ops-backup-prune] no backups removed"
  echo "[ops-backup-prune] done"
  exit 0
fi

sort -u "$TMP_FILE" | while IFS= read -r removed; do
  if [ -z "$removed" ] || [ ! -d "$removed" ]; then
    continue
  fi
  rm -rf "$removed"
  echo "[ops-backup-prune] removed ${removed}"
done

echo "[ops-backup-prune] done"
