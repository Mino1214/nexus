#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:43221}"
WEB_URL="${WEB_URL:-http://127.0.0.1:43220}"

echo "[ops-smoke] api health"
API_HEALTH="$(curl -fsS "${API_URL}/health")"
printf '%s' "$API_HEALTH" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s); if(x.status!=="ok") process.exit(1); console.log(JSON.stringify({status:x.status,persistence:x.persistence,cache:x.cache,queue:x.queue,phase:x.phase}, null, 2));})'

echo "[ops-smoke] api readiness"
API_READY="$(curl -fsS "${API_URL}/ready")"
printf '%s' "$API_READY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s); if(x.status!=="ready") process.exit(1); console.log(JSON.stringify(x.dependencies, null, 2));})'

echo "[ops-smoke] api metrics"
curl -fsS "${API_URL}/metrics" | grep -q "polywatch_api_http_requests_total"
echo "ok"

echo "[ops-smoke] web health"
curl -fsS "${WEB_URL}/healthz" >/dev/null
echo "ok"

echo "[ops-smoke] spa fallback"
curl -fsSI "${WEB_URL}/leaderboard" | grep -q "200 OK"
echo "ok"

echo "[ops-smoke] api proxy leaderboard"
LEADERBOARD="$(curl -fsS "${WEB_URL}/api/leaderboard?window=weekly&limit=2")"
printf '%s' "$LEADERBOARD" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s); if(!Array.isArray(x)) process.exit(1); console.log(JSON.stringify({items:x.length, top:x[0]?.name ?? x[0]?.userName ?? null}, null, 2));})'

echo "[ops-smoke] admin unauthorized"
ADMIN_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${API_URL}/api/admin/translations?lang=ko&page=1&limit=1")"
if [ "$ADMIN_STATUS" != "401" ]; then
  echo "expected admin endpoint to return 401 without auth, got ${ADMIN_STATUS}" >&2
  exit 1
fi
echo "ok"

echo "[ops-smoke] completed"
