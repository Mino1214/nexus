import type { PropsWithChildren } from "react";
import { cx } from "../../lib/format";

interface BadgeProps {
  className?: string;
}

export default function Badge({ children, className }: PropsWithChildren<BadgeProps>) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border border-[rgba(86,212,199,0.22)] bg-[rgba(86,212,199,0.1)] px-3 py-1 text-[11px] font-medium tracking-[0.08em] text-[var(--color-accent)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
