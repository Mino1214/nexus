import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cx } from "../../lib/format";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const variantMap: Record<Variant, string> = {
  primary:
    "bg-[linear-gradient(135deg,rgba(86,212,199,0.95),rgba(125,228,186,0.95))] text-slate-950 shadow-[0_10px_24px_rgba(86,212,199,0.25)] hover:brightness-105",
  secondary:
    "border border-[var(--color-border)] bg-[rgba(12,29,42,0.74)] text-[var(--color-text)] hover:border-[rgba(86,212,199,0.35)] hover:bg-[rgba(18,40,56,0.92)]",
  ghost: "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
};

export default function Button({
  children,
  className,
  variant = "primary",
  fullWidth = false,
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variantMap[variant],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
