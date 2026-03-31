#!/usr/bin/env bash
set -euo pipefail

ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
ALERT_FORMAT="${ALERT_FORMAT:-generic}"
ALERT_STATUS="${ALERT_STATUS:-info}"
ALERT_TITLE="${ALERT_TITLE:-Polywatch notification}"
ALERT_TEXT="${ALERT_TEXT:-}"
ALERT_SOURCE="${ALERT_SOURCE:-polywatch}"
ALERT_LINK="${ALERT_LINK:-}"

if [ -z "$ALERT_WEBHOOK_URL" ]; then
  echo "[ops-notify] ALERT_WEBHOOK_URL is required" >&2
  exit 1
fi

PAYLOAD="$(
  node <<'EOF'
const format = process.env.ALERT_FORMAT || "generic";
const status = process.env.ALERT_STATUS || "info";
const title = process.env.ALERT_TITLE || "Polywatch notification";
const text = process.env.ALERT_TEXT || "";
const source = process.env.ALERT_SOURCE || "polywatch";
const link = process.env.ALERT_LINK || "";
const timestamp = new Date().toISOString();

const statusEmoji = {
  success: "✅",
  failure: "❌",
  warning: "⚠️",
  info: "ℹ️",
}[status] || "ℹ️";

const color = {
  success: "#22c55e",
  failure: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
}[status] || "#3b82f6";

const summary = `${statusEmoji} ${title}${text ? `\n${text}` : ""}${link ? `\n${link}` : ""}`;

if (format === "slack") {
  process.stdout.write(
    JSON.stringify({
      text: summary,
      attachments: [
        {
          color,
          fields: [
            { title: "Status", value: status, short: true },
            { title: "Source", value: source, short: true },
          ],
          footer: "polywatch",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }),
  );
  process.exit(0);
}

if (format === "discord") {
  process.stdout.write(
    JSON.stringify({
      content: null,
      embeds: [
        {
          title,
          description: text || "No additional details.",
          color: parseInt(color.replace("#", ""), 16),
          fields: [
            { name: "Status", value: status, inline: true },
            { name: "Source", value: source, inline: true },
            ...(link ? [{ name: "Link", value: link, inline: false }] : []),
          ],
          timestamp,
        },
      ],
    }),
  );
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    status,
    title,
    text,
    source,
    link: link || null,
    timestamp,
  }),
);
EOF
)"

echo "[ops-notify] sending ${ALERT_FORMAT} notification"
curl -fsS -X POST \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD" \
  "$ALERT_WEBHOOK_URL" >/dev/null

echo "[ops-notify] delivered"
