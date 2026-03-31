import { formatPercent } from "../../lib/format";

interface ProbabilityBarProps {
  outcomes: string[];
  prices: number[];
}

export default function ProbabilityBar({ outcomes, prices }: ProbabilityBarProps) {
  if (outcomes.length > 2) {
    return (
      <div className="space-y-2">
        {outcomes.slice(0, 4).map((outcome, index) => (
          <div key={`${outcome}-${index}`} className="flex items-center justify-between rounded-2xl bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm">
            <span className="text-[var(--color-muted)]">{outcome}</span>
            <span className="font-mono text-[var(--color-text)]">{formatPercent(prices[index] ?? 0)}</span>
          </div>
        ))}
      </div>
    );
  }

  const yes = Math.max(0, Math.min(1, prices[0] ?? 0));
  const no = Math.max(0, Math.min(1, prices[1] ?? 0));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-mono text-[var(--color-accent)]">YES {formatPercent(yes)}</span>
        <span className="font-mono text-rose-300">NO {formatPercent(no)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(86,212,199,0.9),rgba(125,228,186,0.9))]"
          style={{ width: `${yes * 100}%` }}
        />
      </div>
    </div>
  );
}
