"use client";

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { Info } from "lucide-react";

type Variant = "primary" | "outline" | "ghost" | "danger";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:opacity-90 border border-transparent shadow-sm",
  outline:
    "border border-border bg-surface text-foreground hover:border-border-strong hover:bg-muted",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-muted",
  danger: "bg-danger-soft text-danger border border-transparent hover:opacity-85",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** 44px minimum hit target on every interactive control (touch standard). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className = "", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${className}`}
        {...props}
      />
    );
  },
);

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-border bg-surface-elevated shadow-[0_1px_2px_var(--shadow-color),0_8px_24px_-12px_var(--shadow-color)] ${className}`}
      {...props}
    />
  );
}

export function Badge({
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground ${className}`}
      {...props}
    />
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/**
 * Zero-dependency hover/focus tooltip for metric explainers. CSS-only —
 * a Radix tooltip would be another dependency for a hint that never needs
 * positioning logic beyond "above, centered". While hidden it collapses to
 * zero size, so a tip near the viewport edge never widens the page.
 */
export function InfoTip({ text, wide = false }: { text: string; wide?: boolean }) {
  return (
    <span className="group/tip relative inline-flex align-middle" tabIndex={0}>
      <Info className="size-3 cursor-help text-muted-foreground/60 transition-colors group-hover/tip:text-muted-foreground" />
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 max-h-0 max-w-0 -translate-x-1/2 overflow-hidden rounded-lg border-0 border-border bg-surface-elevated p-0 text-[11px] leading-snug font-normal normal-case tracking-normal text-muted-foreground opacity-0 shadow-[0_4px_16px_var(--shadow-color)] transition-opacity duration-150 group-hover/tip:max-h-none group-hover/tip:max-w-none group-hover/tip:border group-hover/tip:p-2 group-hover/tip:opacity-100 group-focus-visible/tip:max-h-none group-focus-visible/tip:max-w-none group-focus-visible/tip:border group-focus-visible/tip:p-2 group-focus-visible/tip:opacity-100 ${wide ? "w-60" : "w-48"}`}
      >
        {text}
      </span>
    </span>
  );
}
