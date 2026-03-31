import { ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis } from "recharts";
import type { PricePoint } from "@polywatch/shared";
import { useTranslation } from "react-i18next";
import { formatPercent } from "../../lib/format";

interface PriceChartProps {
  history: PricePoint[];
}

export default function PriceChart({ history }: PriceChartProps) {
  const { t } = useTranslation();
  const points = history.map((item, index) => ({
    index,
    price: Number(item.p ?? item.price ?? 0),
    label: item.t
      ? new Date(typeof item.t === "string" ? item.t : Number(item.t)).toLocaleDateString("ko-KR", {
          month: "short",
          day: "numeric",
        })
      : `${index + 1}`,
  }));

  if (points.length < 2) {
    return (
      <div className="glass-panel rounded-[24px] p-5 text-sm text-[var(--color-muted)]">
        {t("market.historyUnavailable")}
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-[24px] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">{t("market.probabilityHistory")}</div>
          <div className="font-display text-lg font-bold text-[var(--color-text)]">{t("market.yesPriceTrend")}</div>
        </div>
        <div className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)]">{t("market.interval1d")}</div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points}>
            <defs>
              <linearGradient id="polywatchChart" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(86,212,199,0.75)" />
                <stop offset="100%" stopColor="rgba(86,212,199,0)" />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fill: "#7c9598", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(value) => formatPercent(value)}
              tick={{ fill: "#7c9598", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(value: number) => formatPercent(value)}
              contentStyle={{
                background: "rgba(6, 17, 26, 0.95)",
                border: "1px solid rgba(120, 185, 189, 0.18)",
                borderRadius: "16px",
              }}
            />
            <Area type="monotone" dataKey="price" stroke="#56d4c7" strokeWidth={3} fill="url(#polywatchChart)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
