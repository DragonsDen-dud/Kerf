/**
 * Length parsing and formatting.
 *
 * Everything in the app is stored internally in INCHES. The unit system only
 * affects how a number is read from the user and how it is printed back.
 * That way switching units never silently reinterprets an existing cut list.
 */

export type UnitSystem = "imperial" | "metric";

export const MM_PER_INCH = 25.4;

/** Convert a value in the given display unit into internal inches. */
export function toInches(value: number, unit: UnitSystem): number {
  return unit === "metric" ? value / MM_PER_INCH : value;
}

/** Convert internal inches into the given display unit. */
export function fromInches(inches: number, unit: UnitSystem): number {
  return unit === "metric" ? inches * MM_PER_INCH : inches;
}

export const unitAbbr = (unit: UnitSystem) => (unit === "metric" ? "mm" : "in");

/**
 * Parse a shop-floor length into inches.
 *
 * Imperial accepts the way a fabricator actually writes things down:
 *   45.5      45 1/2      45-1/2      1/2      3'      3' 6"      3ft 6in
 *   20'       240"        6 ft
 * Metric accepts plain millimetres, plus `m` / `cm` suffixes:
 *   1200      1200mm      120cm       1.2m
 *
 * Returns null when the text is not a length we understand.
 */
export function parseLength(raw: string, unit: UnitSystem): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  if (unit === "metric") return parseMetric(text);
  return parseImperial(text);
}

function parseMetric(text: string): number | null {
  const m = text.match(/^([0-9]*\.?[0-9]+)\s*(mm|cm|m)?$/);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const scale = m[2] === "m" ? 1000 : m[2] === "cm" ? 10 : 1;
  return (value * scale) / MM_PER_INCH;
}

function parseImperial(text: string): number | null {
  // Normalise the many ways people type feet and inches.
  const normalised = text
    .replace(/′/g, "'") // prime
    .replace(/″/g, '"') // double prime
    // No leading \b: "3ft" has no word boundary between the digit and the unit.
    .replace(/(feet|foot|ft)\b/g, "'")
    .replace(/(inches|inch|in)\b/g, '"');

  // Feet component, e.g. `3'` or `3' 6 1/2"`.
  const feetMatch = normalised.match(/^\s*([0-9]*\.?[0-9]+)\s*'/);
  let inches = 0;
  let rest = normalised;

  if (feetMatch) {
    inches += Number(feetMatch[1]) * 12;
    rest = normalised.slice(feetMatch[0].length);
  }

  rest = rest.replace(/"/g, "").trim();
  if (!rest) return feetMatch ? inches : null;

  const inchPart = parseInchExpression(rest);
  if (inchPart === null) return null;

  return inches + inchPart;
}

/** `45`, `45.5`, `1/2`, `45 1/2`, `45-1/2` -> inches. */
function parseInchExpression(text: string): number | null {
  const cleaned = text.trim();

  // whole + fraction, separated by a space or a hyphen
  const mixed = cleaned.match(/^([0-9]+)\s*[-\s]\s*([0-9]+)\s*\/\s*([0-9]+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  // bare fraction
  const fraction = cleaned.match(/^([0-9]+)\s*\/\s*([0-9]+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }

  // plain decimal
  const decimal = cleaned.match(/^[0-9]*\.?[0-9]+$/);
  if (decimal) return Number(cleaned);

  return null;
}

/**
 * Format inches for display.
 *
 * Imperial rounds to the nearest 1/16" and prints a proper mixed fraction,
 * because "45 1/2" is what goes on the saw, not "45.5000".
 */
export function formatLength(
  inches: number,
  unit: UnitSystem,
  opts: { fractions?: boolean } = {},
): string {
  if (unit === "metric") {
    const mm = inches * MM_PER_INCH;
    return `${trimZeros(mm.toFixed(1))} mm`;
  }
  if (opts.fractions === false) return `${trimZeros(inches.toFixed(3))} in`;
  return `${formatImperialValue(inches)} in`;
}

/** Same as formatLength but without the trailing unit label. */
export function formatValue(inches: number, unit: UnitSystem): string {
  if (unit === "metric") return trimZeros((inches * MM_PER_INCH).toFixed(1));
  return formatImperialValue(inches);
}

function formatImperialValue(inches: number): string {
  const negative = inches < 0;
  const abs = Math.abs(inches);
  const sixteenths = Math.round(abs * 16);
  const whole = Math.floor(sixteenths / 16);
  let numerator = sixteenths % 16;
  let denominator = 16;

  while (numerator > 0 && numerator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }

  const sign = negative ? "-" : "";
  if (numerator === 0) return `${sign}${whole}`;
  if (whole === 0) return `${sign}${numerator}/${denominator}`;
  return `${sign}${whole} ${numerator}/${denominator}`;
}

/** Render inches as feet + inches, e.g. `20' 0"` — used for stock bars. */
export function formatFeetInches(inches: number): string {
  const negative = inches < 0;
  const abs = Math.abs(inches);
  const feet = Math.floor(abs / 12);
  const remainder = abs - feet * 12;
  const sign = negative ? "-" : "";
  if (feet === 0) return `${sign}${formatImperialValue(remainder)}"`;
  if (Math.round(remainder * 16) === 0) return `${sign}${feet}' 0"`;
  return `${sign}${feet}' ${formatImperialValue(remainder)}"`;
}

/** A friendly restatement of a stock length, e.g. `240 in (20' 0")`. */
export function describeStock(inches: number, unit: UnitSystem): string {
  if (unit === "metric") return formatLength(inches, unit);
  return `${formatImperialValue(inches)} in (${formatFeetInches(inches)})`;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency}${amount.toFixed(2)}`;
}
