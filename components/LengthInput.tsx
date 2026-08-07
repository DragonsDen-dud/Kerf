"use client";

import { useEffect, useState } from "react";

import { formatValue, parseLength, unitAbbr, type UnitSystem } from "@/lib/units";

interface Props {
  value: number;
  unit: UnitSystem;
  onChange: (inches: number) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  allowZero?: boolean;
  id?: string;
}

/**
 * A length field that accepts the way a fabricator writes lengths — `45 1/2`,
 * `3' 6"`, `20'` — and only commits a value once it parses. The text is kept
 * as typed so a half-finished `45 1/` is never rewritten under the user.
 */
export default function LengthInput({
  value,
  unit,
  onChange,
  placeholder,
  label,
  hint,
  allowZero = false,
  id,
}: Props) {
  const [text, setText] = useState(() => formatValue(value, unit));
  const [focused, setFocused] = useState(false);

  // Re-sync when the value or unit changes from outside (unit switch, reset).
  useEffect(() => {
    if (!focused) setText(formatValue(value, unit));
  }, [value, unit, focused]);

  const parsed = parseLength(text, unit);
  const empty = text.trim() === "";
  const invalid = !empty && (parsed === null || (!allowZero && parsed <= 0));

  const commit = (next: string) => {
    setText(next);
    const inches = parseLength(next, unit);
    if (inches === null) return;
    if (!allowZero && inches <= 0) return;
    onChange(inches);
  };

  return (
    <div>
      {label ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          className={`field pr-12 ${invalid ? "field-invalid" : ""}`}
          type="text"
          inputMode={unit === "metric" ? "decimal" : "text"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="next"
          value={text}
          placeholder={placeholder}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            const inches = parseLength(text, unit);
            // Snap back to a canonical rendering, or to the last good value.
            setText(formatValue(inches ?? value, unit));
          }}
          onChange={(e) => commit(e.target.value)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
          {unitAbbr(unit)}
        </span>
      </div>
      {invalid ? (
        <p className="mt-1 text-xs text-rose-300">
          {unit === "metric" ? "Try 1200, 120cm or 1.2m" : `Try 45 1/2, 3' 6" or 240`}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
