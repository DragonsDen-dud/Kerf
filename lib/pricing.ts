/**
 * Costing and roll-up.
 *
 * Two rules underpin everything here:
 *
 *  1. You pay for whole bars. A price quoted per foot is still charged across
 *     the full purchased length, drop included — that is the point of the
 *     take-off, and it is where per-foot mental maths usually goes wrong.
 *  2. Every number carries its evidence. A line's cost is only as good as the
 *     price record behind it, so `LineCost` hands back the exact `PriceRecord`
 *     used and how stale it is.
 */

import { pack, type PackResult } from "./pack";
import {
  SOURCE_CONFIDENCE,
  type Extra,
  type Material,
  type PriceBasis,
  type PriceRecord,
  type Project,
  type TakeoffLine,
} from "./types";

const INCHES_PER_FOOT = 12;
const INCHES_PER_METRE = 1000 / 25.4;

/** A price older than this is flagged for re-checking before it goes out. */
export const STALE_AFTER_DAYS = 90;

/** The price currently in force for a material, or null if it has never been priced. */
export function currentPrice(material: Material | null | undefined): PriceRecord | null {
  if (!material || material.prices.length === 0) return null;
  return material.prices[0];
}

/**
 * What one purchased bar of `stockLength` costs under this price record.
 *
 * For `per-bar` the amount is scaled if the take-off buys a different length
 * than the one that was quoted, which keeps a "$48 per 20ft" price honest when
 * the line is actually cut from 24ft stock.
 */
export function costPerBar(price: PriceRecord, stockLength: number): number {
  switch (price.basis) {
    case "per-bar": {
      const quotedLength = price.stockLength > 0 ? price.stockLength : stockLength;
      if (quotedLength <= 0) return 0;
      return price.amount * (stockLength / quotedLength);
    }
    case "per-foot":
      return price.amount * (stockLength / INCHES_PER_FOOT);
    case "per-metre":
      return price.amount * (stockLength / INCHES_PER_METRE);
    case "per-inch":
      return price.amount * stockLength;
  }
}

/** Whole days since an ISO date; negative dates in the future clamp to 0. */
export function daysSince(iso: string): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export type Confidence = "firm" | "indicative" | "assumed" | "unpriced";

export interface LineCost {
  line: TakeoffLine;
  material: Material | null;
  result: PackResult;
  price: PriceRecord | null;
  /** Cost of one purchased bar under the price in force. */
  barCost: number;
  /** barsNeeded x barCost. */
  cost: number;
  confidence: Confidence;
  /** Age of the price evidence, in days. Infinity when unpriced. */
  priceAgeDays: number;
  stale: boolean;
}

export function costLine(line: TakeoffLine, materials: Material[]): LineCost {
  const material = materials.find((m) => m.id === line.materialId) ?? null;
  const price = currentPrice(material);
  const barCost = price ? costPerBar(price, line.stockLength) : 0;

  const result = pack(line.parts, {
    stockLength: line.stockLength,
    kerf: line.kerf,
    endTrim: line.endTrim,
    strategy: line.strategy,
    pricePerBar: barCost,
  });

  const priceAgeDays = price ? daysSince(price.source.capturedAt) : Number.POSITIVE_INFINITY;

  return {
    line,
    material,
    result,
    price,
    barCost,
    cost: result.totals.barsNeeded * barCost,
    confidence: price ? SOURCE_CONFIDENCE[price.source.kind] : "unpriced",
    priceAgeDays,
    stale: price ? priceAgeDays > STALE_AFTER_DAYS : false,
  };
}

export function extraCost(extra: Extra): number {
  return (extra.qty || 0) * (extra.unitCost || 0);
}

export interface ProjectCost {
  lines: LineCost[];
  materials: number;
  extras: number;
  contingency: number;
  markup: number;
  /** materials + extras + contingency + markup. */
  subtotal: number;
  tax: number;
  total: number;
  /** Totals across every line, for the headline stats. */
  totalBars: number;
  totalPieces: number;
  /** Weighted across all lines by purchased length. */
  utilisation: number;
  /** The weakest confidence present, which is what the project can claim. */
  confidence: Confidence;
  unpricedLines: number;
  staleLines: number;
  impossible: number;
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  firm: 3,
  indicative: 2,
  assumed: 1,
  unpriced: 0,
};

export function costProject(project: Project, materials: Material[]): ProjectCost {
  // Quick mode only ever costs the first line and ignores extras and mark-ups.
  const quick = project.mode === "quick";
  const activeLines = quick ? project.lines.slice(0, 1) : project.lines;

  const lines = activeLines.map((line) => costLine(line, materials));

  const materialsCost = lines.reduce((sum, l) => sum + l.cost, 0);
  const extras = quick ? 0 : project.extras.reduce((sum, e) => sum + extraCost(e), 0);

  const base = materialsCost + extras;
  const contingency = quick ? 0 : base * (project.contingencyPct / 100);
  const markup = quick ? 0 : (base + contingency) * (project.markupPct / 100);
  const subtotal = base + contingency + markup;
  const tax = quick ? 0 : subtotal * (project.taxPct / 100);

  const purchased = lines.reduce((sum, l) => sum + l.result.totals.purchased, 0);
  const net = lines.reduce((sum, l) => sum + l.result.totals.netLength, 0);

  // A project can only claim the confidence of its weakest priced line, and a
  // line with nothing to cut does not drag the rating down.
  const rated = lines.filter((l) => l.result.totals.pieces > 0);
  const confidence =
    rated.length === 0
      ? "unpriced"
      : rated.reduce<Confidence>(
          (worst, l) => (CONFIDENCE_RANK[l.confidence] < CONFIDENCE_RANK[worst] ? l.confidence : worst),
          "firm",
        );

  return {
    lines,
    materials: materialsCost,
    extras,
    contingency,
    markup,
    subtotal,
    tax,
    total: subtotal + tax,
    totalBars: lines.reduce((sum, l) => sum + l.result.totals.barsNeeded, 0),
    totalPieces: lines.reduce((sum, l) => sum + l.result.totals.pieces, 0),
    utilisation: purchased > 0 ? net / purchased : 0,
    confidence,
    unpricedLines: rated.filter((l) => !l.price).length,
    staleLines: rated.filter((l) => l.stale).length,
    impossible: lines.reduce((sum, l) => sum + l.result.impossible.length, 0),
  };
}

/* ----------------------------------------------------------------- display */

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  firm: "Firm pricing",
  indicative: "Indicative pricing",
  assumed: "Assumed pricing",
  unpriced: "Not priced",
};

/**
 * The sentence that should sit under any number sent to someone else, so a
 * take-off is never mistaken for a firm quotation.
 */
export function confidenceNote(cost: ProjectCost): string {
  switch (cost.confidence) {
    case "firm":
      return "Based on written supplier pricing. Subject to material availability at time of order.";
    case "indicative":
      return "Indicative only — based on published or verbal pricing. Confirm with a written quote before ordering.";
    case "assumed":
      return "Budget estimate — contains assumed pricing. Not for tender without supplier confirmation.";
    case "unpriced":
      return "Quantities only. No pricing has been applied to this take-off.";
  }
}

export function formatMoney(amount: number, currency: string): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${currency}${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** `Written quote · Acme Steel · #Q-1234 · 14 Aug 2026`, for citing a price. */
export function citation(price: PriceRecord | null, labels: Record<string, string>): string {
  if (!price) return "No price on record";
  const parts = [labels[price.source.kind] ?? price.source.kind];
  if (price.source.supplier) parts.push(price.source.supplier);
  if (price.source.reference) parts.push(price.source.reference);
  parts.push(formatDate(price.source.capturedAt));
  return parts.join(" · ");
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function basisSuffix(basis: PriceBasis): string {
  return basis === "per-bar" ? "/bar" : basis === "per-foot" ? "/ft" : basis === "per-metre" ? "/m" : "/in";
}
