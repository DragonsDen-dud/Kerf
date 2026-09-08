/**
 * Plain-English explanations of every calculation the app performs.
 *
 * This is the single place the working is written down, so the screens, the
 * exported report and the help text can never drift from each other — or from
 * the engine in `pack.ts` and `pricing.ts`.
 *
 * Each explanation returns the same shape: what is being worked out, the sum
 * with the real numbers substituted in, and the answer.
 */

import type { LineCost, ProjectCost } from "./pricing";
import { basisSuffix, extraCost, formatMoney } from "./pricing";
import { BASIS_LABELS, type PriceRecord, type Project } from "./types";
import { formatValue, unitAbbr, type UnitSystem } from "./units";

export interface Step {
  /** What is being worked out. */
  label: string;
  /** The sum, with real numbers in it. */
  formula: string;
  /** The answer. */
  result: string;
  /** Why it matters, in one sentence. */
  note?: string;
}

const len = (inches: number, unit: UnitSystem) => `${formatValue(inches, unit)} ${unitAbbr(unit)}`;

/* ------------------------------------------------------------ the cut plan */

/** How much of each bar is actually available to cut from. */
export function explainUsableLength(entry: LineCost, unit: UnitSystem): Step {
  const { stockLength, endTrim } = entry.line;
  return {
    label: "Usable length per bar",
    formula: `${len(stockLength, unit)} bar − ${len(endTrim, unit)} end trim`,
    result: len(stockLength - endTrim, unit),
    note:
      endTrim > 0
        ? "End trim is cut off and thrown away before any parts are cut, so it never counts as usable."
        : "No end trim is set, so the whole bar is available.",
  };
}

/** Why every piece costs more than its own length. */
export function explainKerf(entry: LineCost, unit: UnitSystem): Step {
  const { kerf } = entry.line;
  const pieces = entry.result.totals.pieces;
  return {
    label: "Material lost to the saw blade",
    formula: `${pieces} pieces × ${len(kerf, unit)} blade width`,
    result: len(entry.result.totals.kerfLoss, unit),
    note: "The blade turns its own width into dust on every cut, so each piece is charged one blade width.",
  };
}

/** How pieces were assigned to bars. */
export function explainPacking(entry: LineCost, unit: UnitSystem): Step {
  const { strategy, kerf } = entry.line;
  const usable = entry.result.totals.usableLength;

  return {
    label: "How pieces were fitted onto bars",
    formula:
      strategy === "optimized"
        ? `Longest first · each piece needs its length + ${len(kerf, unit)} · first bar with room wins`
        : `Longest first · cut in order · one bar at a time`,
    result: `${entry.result.totals.barsNeeded} ${entry.result.totals.barsNeeded === 1 ? "bar" : "bars"}`,
    note:
      strategy === "optimized"
        ? `Pieces are sorted longest first. Each one goes into the earliest bar that still has room for it, so short pieces fill the gaps left by long ones. A new bar is only started when a piece fits nowhere. Each bar holds ${len(usable, unit)}.`
        : `Pieces are sorted longest first and cut straight down the list from one bar at a time. When the next piece will not fit, whatever is left on that bar becomes drop and a fresh bar is started. This matches the original spreadsheet, and usually needs more bars than the optimised setting.`,
  };
}

/** The lower bound, and why the real answer is usually above it. */
export function explainBestCase(entry: LineCost, unit: UnitSystem): Step {
  const t = entry.result.totals;
  const needed = t.netLength + t.kerfLoss + t.trimLoss;
  return {
    label: "Best case if packing were perfect",
    formula: `(${len(t.netLength, unit)} parts + ${len(t.kerfLoss, unit)} blade + ${len(t.trimLoss, unit)} trim) ÷ ${len(t.usableLength, unit)} per bar, rounded up`,
    result: `${t.theoreticalBest} bars`,
    note:
      t.barsNeeded > t.theoreticalBest
        ? `This assumes pieces could be split across bars, which they cannot. Your layout uses ${t.barsNeeded - t.theoreticalBest} more, which is normal — the difference is short offcuts that nothing else fits into.`
        : "Your layout already hits this minimum, so no further packing gain is available.",
    ...(needed ? {} : {}),
  };
}

/** Where every inch of purchased material ended up. */
export function explainWaste(cost: ProjectCost, unit: UnitSystem): Step[] {
  const net = cost.lines.reduce((sum, l) => sum + l.result.totals.netLength, 0);
  const purchased = cost.lines.reduce((sum, l) => sum + l.result.totals.purchased, 0);
  const kerf = cost.lines.reduce((sum, l) => sum + l.result.totals.kerfLoss, 0);
  const trim = cost.lines.reduce((sum, l) => sum + l.result.totals.trimLoss, 0);
  const drop = cost.lines.reduce((sum, l) => sum + l.result.totals.dropLoss, 0);

  return [
    {
      label: "Material bought",
      formula: cost.lines
        .map((l) => `${l.result.totals.barsNeeded} × ${len(l.line.stockLength, unit)}`)
        .join(" + "),
      result: len(purchased, unit),
      note: "You buy whole bars, so this is what you pay for regardless of how much you use.",
    },
    {
      label: "Finished parts",
      formula: "Every part length × its quantity, added up",
      result: len(net, unit),
      note: "This is the only material that ends up in the job.",
    },
    {
      // Blade and trim are rolled in here rather than listed separately: on a
      // real job they are a fraction of a percent, and three near-zero lines
      // hide the one number that matters.
      label: "Left over (unusable ends)",
      formula: `${len(purchased, unit)} bought − ${len(net, unit)} of finished parts`,
      result: len(drop + kerf + trim, unit),
      note: "The short end of each bar once no remaining piece will fit in it, plus the material the blade turns to dust. You have paid for all of it. Keep the long ends — they will do for small parts on a later job.",
    },
    {
      label: "Utilisation",
      formula: `${len(net, unit)} parts ÷ ${len(purchased, unit)} bought`,
      result: `${(purchased > 0 ? (net / purchased) * 100 : 0).toFixed(1)}%`,
      note: "The share of what you buy that ends up as finished parts. Higher is better; 85–95% is typical.",
    },
  ];
}

/** How one bar was filled. */
export function explainBarFill(
  pieces: number[],
  kerf: number,
  usable: number,
  unit: UnitSystem,
): Step {
  const used = pieces.reduce((sum, length) => sum + length, 0);
  const blade = pieces.length * kerf;
  const shown = pieces.length <= 6 ? pieces.map((p) => formatValue(p, unit)).join(" + ") : `${pieces.length} pieces`;

  return {
    label: "How this bar fills up",
    formula: `${shown} = ${len(used, unit)}, plus ${pieces.length} × ${len(kerf, unit)} blade = ${len(blade, unit)}`,
    result: `${len(used + blade, unit)} of ${len(usable, unit)} used`,
    note: `Leaves ${len(usable - used - blade, unit)} of drop on the end.`,
  };
}

/* ------------------------------------------------------------------ costing */

/** How a quoted price becomes the cost of one bar. */
export function explainBarCost(
  price: PriceRecord,
  stockLength: number,
  unit: UnitSystem,
  currency: string,
): Step {
  const per = `${formatMoney(price.amount, currency)}${basisSuffix(price.basis)}`;

  if (price.basis === "per-bar") {
    const sameLength = Math.abs(price.stockLength - stockLength) < 1e-9;
    return {
      label: "Cost of one bar",
      formula: sameLength
        ? `${per} — quoted for a ${len(price.stockLength, unit)} bar, which is what you are buying`
        : `${per} for ${len(price.stockLength, unit)} × (${len(stockLength, unit)} ÷ ${len(price.stockLength, unit)})`,
      result: formatMoney(price.amount * (sameLength ? 1 : stockLength / price.stockLength), currency),
      note: sameLength
        ? "The quoted price is used as-is."
        : "The quote was for a different bar length, so the price is scaled to the length you are actually buying.",
    };
  }

  const perUnitLabel = BASIS_LABELS[price.basis];
  const divisor = price.basis === "per-foot" ? 12 : price.basis === "per-metre" ? 1000 / 25.4 : 1;
  const count = stockLength / divisor;

  return {
    label: "Cost of one bar",
    formula: `${per} × ${count.toFixed(2)} ${price.basis === "per-foot" ? "ft" : price.basis === "per-metre" ? "m" : "in"} per bar`,
    result: formatMoney(price.amount * count, currency),
    note: `Priced ${perUnitLabel}. You pay for the whole bar you buy, including the drop you do not use — that is where per-length pricing usually catches people out.`,
  };
}

/** How a line's total cost is reached. */
export function explainLineCost(entry: LineCost, currency: string): Step {
  return {
    label: "Cost of this line",
    formula: `${entry.result.totals.barsNeeded} bars × ${formatMoney(entry.barCost, currency)} per bar`,
    result: formatMoney(entry.cost, currency),
    note: "Whole bars only — you cannot buy part of a bar.",
  };
}

/** The full roll-up from materials to the final total, in order. */
export function explainRollup(project: Project, cost: ProjectCost): Step[] {
  const c = project.currency;
  const steps: Step[] = [];

  steps.push({
    label: "Materials",
    formula:
      cost.lines.length === 1
        ? `${cost.lines[0].result.totals.barsNeeded} bars × ${formatMoney(cost.lines[0].barCost, c)}`
        : cost.lines.map((l) => formatMoney(l.cost, c)).join(" + "),
    result: formatMoney(cost.materials, c),
    note: "Every take-off line added together.",
  });

  if (cost.extras > 0) {
    steps.push({
      label: "Extras",
      formula: project.extras
        .map((e) => `${e.qty} × ${formatMoney(e.unitCost, c)}`)
        .join(" + "),
      result: formatMoney(cost.extras, c),
      note: "Costs that are not cut from stock — labour, fasteners, finishing, delivery.",
    });
  }

  const base = cost.materials + cost.extras;

  if (cost.contingency > 0) {
    steps.push({
      label: `Contingency at ${project.contingencyPct}%`,
      formula: `${formatMoney(base, c)} × ${project.contingencyPct}%`,
      result: formatMoney(cost.contingency, c),
      note: "Cover for the things you cannot foresee. Applied to materials and extras.",
    });
  }

  if (cost.markup > 0) {
    steps.push({
      label: `Markup at ${project.markupPct}%`,
      formula: `(${formatMoney(base, c)} + ${formatMoney(cost.contingency, c)} contingency) × ${project.markupPct}%`,
      result: formatMoney(cost.markup, c),
      note: "Your margin. Applied after contingency, so it covers the contingency too.",
    });
  }

  if (cost.tax > 0) {
    steps.push({
      label: "Subtotal before tax",
      formula: "Materials + extras + contingency + markup",
      result: formatMoney(cost.subtotal, c),
    });
    steps.push({
      label: `Tax at ${project.taxPct}%`,
      formula: `${formatMoney(cost.subtotal, c)} × ${project.taxPct}%`,
      result: formatMoney(cost.tax, c),
      note: "Applied last, to everything above it.",
    });
  }

  steps.push({
    label: "Total",
    formula: cost.tax > 0 ? "Subtotal + tax" : "Everything above added together",
    result: formatMoney(cost.total, c),
  });

  return steps;
}

/** One-line summaries for the extras table. */
export function explainExtra(description: string, qty: number, unitCost: number, currency: string) {
  return `${qty} × ${formatMoney(unitCost, currency)} = ${formatMoney(extraCost({ id: "", description, qty, unitCost }), currency)}`;
}

/* ---------------------------------------------------------------- glossary */

export interface Term {
  term: string;
  short: string;
  long: string;
}

/** Plain definitions for the terms used across the app. */
export const GLOSSARY: Term[] = [
  {
    term: "Kerf",
    short: "The width of material the saw blade turns into dust.",
    long: "A blade does not cut a line, it cuts a slot as wide as the blade. A 1/8 in blade removes 1/8 in of material on every cut. This app charges one blade width per piece, so 56 pieces on a 1/8 in blade lose 7 in of material in total.",
  },
  {
    term: "End trim",
    short: "Material cut off each bar before you start.",
    long: "Mill ends are often damaged, out of square or painted. If you always dock an inch off each new bar, set it here and it comes off the usable length of every bar rather than being forgotten.",
  },
  {
    term: "Left over (drop)",
    short: "The short end of a bar that nothing else would fit into.",
    long: "Pieces are fitted onto a bar until nothing left on your list will fit in what remains. That remainder is the left-over, or drop. You have paid for it either way, so it is counted as part of what the job costs. Keep the long ends: they are free material for small parts on a later job. A job with a lot of left-over usually means a different stock length would suit it better.",
  },
  {
    term: "Utilisation",
    short: "The share of what you buy that ends up as finished parts.",
    long: "Finished part length divided by total purchased length. It is never 100% because of blade loss and drop. Between 85% and 95% is typical for a mixed cut list; below 80% usually means a different stock length would suit the job better.",
  },
  {
    term: "Take-off line",
    short: "One material, with its own stock length, saw settings and cut list.",
    long: "A job that needs three different profiles is three lines. Each is packed and priced on its own, then added into one project total.",
  },
  {
    term: "Firm / indicative / assumed",
    short: "How solid the pricing behind a number is.",
    long: "Firm means a written quote or a past invoice. Indicative means a website, phone call, trade counter or price list. Assumed means your own estimate with nothing behind it. A project can only claim the weakest rating of any line in it.",
  },
];
