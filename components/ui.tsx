"use client";

import { useEffect, type ReactNode } from "react";

import type { Step } from "@/lib/explain";

/* ------------------------------------------------------------------ layout */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SectionTitle({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">{children}</h2>
      {aside}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="card text-center text-slate-400">
      <p className="text-lg font-semibold text-slate-200">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm">{body}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ chrome */

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad" | "brand";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-white/[0.08] text-slate-300",
    good: "bg-emerald-500/15 text-emerald-300",
    warn: "bg-amber-500/15 text-amber-300",
    bad: "bg-rose-500/15 text-rose-300",
    brand: "bg-amber-500/20 text-amber-300",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A segmented control — the desktop-friendly way to switch a small enum. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div>
      {label ? <span className="label">{label}</span> : null}
      <div
        role="group"
        aria-label={label}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`btn flex-col !items-start gap-0.5 px-3 py-2 text-left ${
                active
                  ? "bg-amber-500 text-ink-950"
                  : "border border-white/[0.12] bg-white/[0.04] text-slate-200"
              }`}
            >
              <span className="text-[15px] font-bold leading-tight">{option.label}</span>
              {option.hint ? (
                <span
                  className={`text-[11px] font-medium leading-tight ${
                    active ? "text-ink-900/70" : "text-slate-500"
                  }`}
                >
                  {option.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active ? "bg-amber-500 text-ink-950" : "bg-white/[0.06] text-slate-300 hover:bg-white/[0.1]"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950/95 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex min-h-0 flex-1 flex-col sm:max-h-full sm:flex-none sm:rounded-2xl sm:border sm:border-white/10 sm:bg-ink-900 sm:shadow-2xl ${
          wide ? "sm:w-full sm:max-w-4xl" : "sm:w-full sm:max-w-xl"
        }`}
      >
        <header className="safe-top flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-base font-bold text-slate-50">{title}</h2>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-300 hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:max-h-[70vh]">{children}</div>
        {footer ? (
          <footer className="safe-bottom shrink-0 space-y-2 border-t border-white/10 p-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- bits */

export function Money({
  amount,
  currency,
  className = "",
}: {
  amount: number;
  currency: string;
  className?: string;
}) {
  return (
    <span className={`tabular-nums ${className}`}>
      {currency}
      {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

/* ------------------------------------------------------- showing the maths */

/**
 * A collapsible panel that shows how a number was reached: the sum with the
 * real values substituted in, the answer, and one line on why it matters.
 */
export function Working({
  title = "Show the working",
  steps,
  defaultOpen = false,
}: {
  title?: string;
  steps: Step[];
  defaultOpen?: boolean;
}) {
  if (steps.length === 0) return null;

  return (
    <details
      className="group mt-3 rounded-xl border border-white/10 bg-white/[0.02] open:border-amber-500/25 open:bg-amber-500/[0.04]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 transition hover:text-amber-300">
        <span className="flex items-center gap-2">
          <svg
            className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          {title}
        </span>
      </summary>
      <ol className="space-y-3 border-t border-white/[0.07] px-3 py-3">
        {steps.map((step, index) => (
          <li key={index}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-slate-100">{step.label}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-amber-300">
                {step.result}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-xs leading-relaxed text-slate-400">
              {step.formula}
            </p>
            {step.note ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.note}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** A short explanatory paragraph under a heading or field. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-slate-500">{children}</p>;
}

/** A headline figure with an optional one-line explanation of what it means. */
export function StatCard({
  label,
  value,
  hint,
  fire = false,
}: {
  label: string;
  value: string;
  hint?: string;
  fire?: boolean;
}) {
  return (
    <div className="stat-card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-extrabold lg:text-3xl ${fire ? "fire-text" : "text-slate-50"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** A plain number input that keeps an empty box empty instead of showing 0. */
export function NumberInput({
  value,
  onChange,
  id,
  suffix,
  prefix,
  placeholder,
  className = "",
  ariaLabel,
  integer = false,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  suffix?: string;
  prefix?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  integer?: boolean;
}) {
  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
          {prefix}
        </span>
      ) : null}
      <input
        id={id}
        aria-label={ariaLabel}
        className={`field ${prefix ? "pl-8" : ""} ${suffix ? "pr-10" : ""} ${className}`}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        value={value ? String(value) : ""}
        placeholder={placeholder ?? "0"}
        onChange={(event) => {
          const cleaned = event.target.value.replace(integer ? /[^0-9]/g : /[^0-9.]/g, "");
          const parsed = Number(cleaned);
          onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
