import type { BettingTrendSlice } from './types';

const PALETTE = ['#5ce1e6', '#a78bfa', '#fbbf24', '#fb7185', '#4ade80', '#38bdf8', '#c084fc', '#94a3b8'];

type Props = {
  slices: BettingTrendSlice[];
  size?: number;
};

/** SVG 파이 차트 (외부 라이브러리 없음) */
export function ManagedPieChart({ slices, size = 200 }: Props) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  let angle = -Math.PI / 2;
  const valid = slices.map((s, i) => ({
    ...s,
    value: Math.max(0, s.value),
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="fc-admin__pieWrap">
      <svg width={size} height={size} viewBox="-1.15 -1.15 2.3 2.3" className="fc-admin__pieSvg">
        {valid.map((s, i) => {
          const a = (s.value / total) * 2 * Math.PI;
          if (a < 1e-6) return null;
          const x1 = Math.cos(angle);
          const y1 = Math.sin(angle);
          angle += a;
          const x2 = Math.cos(angle);
          const y2 = Math.sin(angle);
          const large = a > Math.PI ? 1 : 0;
          const d = `M 0 0 L ${x1} ${y1} A 1 1 0 ${large} 1 ${x2} ${y2} Z`;
          return <path key={i} d={d} fill={s.color} stroke="var(--fc-border)" strokeWidth={0.01} />;
        })}
      </svg>
      <ul className="fc-admin__pieLegend">
        {valid.map((s, i) => (
          <li key={i}>
            <span className="fc-admin__pieSwatch" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="fc-admin__piePct">{((s.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
