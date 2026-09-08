/**
 * The buying view of a take-off.
 *
 * The cut plan answers "how do I cut this?". This module answers the different
 * question a purchaser asks: "how much do I order, in what lengths, and which
 * choice wastes least money?"
 *
 * For every material it re-packs the same cut list against each candidate
 * stock length, so the options can be compared side by side rather than
 * guessed at. Nothing here changes the take-off itself.
 */

import { pack } from "./pack";
import type { LineCost, ProjectCost } from "./pricing";
import { costPerBar } from "./pricing";
import type { Project } from "./types";
import type { UnitSystem } from "./units";

export const INCHES_PER_FOOT = 12;
export const INCHES_PER_METRE = 1000 / 25.4;

/** Mill lengths a supplier is likely to stock, in inches. */
export const IMPERIAL_CANDIDATES = [96, 120, 144, 192, 240, 288];
/** 2m, 3m, 4m, 5m, 6m, 7.2m in inches. */
export const METRIC_CANDIDATES = [2, 3, 4, 5, 6, 7.2].map((m) => m * INCHES_PER_METRE);

export function defaultCandidates(project: Project): number[] {
  const base = project.unit === "metric" ? METRIC_CANDIDATES : IMPERIAL_CANDIDATES;
  // Whatever the job is already set up for must always be offered.
  const used = project.lines.map((line) => line.stockLength).filter((n) => n > 0);
  const all = [...base, ...used];
  const unique = [...new Set(all.map((n) => Math.round(n * 1000) / 1000))];
  return unique.sort((a, b) => a - b);
}

/** How a price the user typed into the export sheet is expressed. */
export type ManualBasis = "per-bar" | "per-foot" | "per-metre";

export interface ManualPrice {
  amount: number;
  basis: ManualBasis;
}

export interface PurchaseConfig {
  /** Stock lengths (inches) shown as options, in ascending order. */
  candidates: number[];
  /** Offer a "cut to length" row for suppliers who cut to size. */
  includeByFoot: boolean;
  /** Show the price and cost columns at all. */
  showCost: boolean;
  /** Show the waste / offcut column. */
  showWaste: boolean;
  /** Print what gets cut from each material under its options. */
  showCutSummary: boolean;
  /** Print a short note to the supplier at the bottom. */
  note: string;
  /** Prices typed on the export sheet, keyed by take-off line id. */
  prices: Record<string, ManualPrice>;
  /** Which option each material is being ordered as, keyed by line id. */
  selections: Record<string, string>;
}

export function defaultConfig(project: Project, cost: ProjectCost): PurchaseConfig {
  const candidates = defaultCandidates(project);
  const selections: Record<string, string> = {};
  for (const entry of cost.lines) selections[entry.line.id] = optionId(entry.line.stockLength);
  return {
    candidates,
    includeByFoot: false,
    showCost: cost.lines.some((entry) => entry.price),
    showWaste: true,
    showCutSummary: true,
    note: "",
    prices: {},
    selections,
  };
}

export const BY_FOOT_ID = "cut-to-length";
export const optionId = (stockLength: number) => `len-${Math.round(stockLength * 1000)}`;

export interface PurchaseOption {
  id: string;
  kind: "bars" | "cut-to-length";
  /** Inches. Zero for the cut-to-length row. */
  stockLength: number;
  /** "20 ft bars", "6 m lengths", "Cut to length". */
  label: string;
  bars: number;
  /** Total length being bought, in inches. */
  purchasedLength: number;
  /** Length actually used by finished parts, as a share of what is bought. */
  utilisation: number;
  /** Purchased minus parts, blade and trim. */
  drop: number;
  /** False when a part is longer than this stock length can yield. */
  fits: boolean;
  /** Cost of one bar, or of one foot/metre for cut-to-length. */
  unitCost: number | null;
  cost: number | null;
  /** The option this module would pick. */
  recommended: boolean;
}

export interface PurchaseLine {
  lineId: string;
  name: string;
  material: string;
  pieces: number;
  /** Finished length of the parts, in inches. */
  netLength: number;
  options: PurchaseOption[];
  selected: PurchaseOption | null;
  /** `4 × 55, 2 × 137` — what comes out of this material. */
  cutSummary: string;
}

export interface PurchasePlan {
  lines: PurchaseLine[];
  /** Total length being bought across every material, in inches. */
  purchasedLength: number;
  /** Total finished part length across every material, in inches. */
  netLength: number;
  totalBars: number;
  totalPieces: number;
  cost: number | null;
  /** True when every selected option has a price behind it. */
  fullyPriced: boolean;
  /** Lines where the selected option cannot yield every part. */
  impossible: PurchaseLine[];
}

/** The price in force for a line: what was typed here, else the library price. */
function resolvePrice(
  entry: LineCost,
  config: PurchaseConfig,
  stockLength: number,
): { unitCost: number | null; perLength: number | null } {
  const manual = config.prices[entry.line.id];
  if (manual && manual.amount > 0) {
    switch (manual.basis) {
      case "per-bar":
        // Typed against the length the job is currently set to; scale to this one.
        return {
          unitCost: entry.line.stockLength > 0
            ? manual.amount * (stockLength / entry.line.stockLength)
            : manual.amount,
          perLength: entry.line.stockLength > 0 ? manual.amount / entry.line.stockLength : null,
        };
      case "per-foot":
        return {
          unitCost: manual.amount * (stockLength / INCHES_PER_FOOT),
          perLength: manual.amount / INCHES_PER_FOOT,
        };
      case "per-metre":
        return {
          unitCost: manual.amount * (stockLength / INCHES_PER_METRE),
          perLength: manual.amount / INCHES_PER_METRE,
        };
    }
  }
  if (entry.price) {
    return {
      unitCost: costPerBar(entry.price, stockLength),
      perLength: costPerBar(entry.price, 1),
    };
  }
  return { unitCost: null, perLength: null };
}

function lengthLabel(stockLength: number, unit: UnitSystem): string {
  if (unit === "metric") {
    const metres = stockLength / INCHES_PER_METRE;
    return `${trim(metres.toFixed(1))} m lengths`;
  }
  const feet = stockLength / INCHES_PER_FOOT;
  return Number.isInteger(feet) ? `${feet} ft bars` : `${trim(feet.toFixed(1))} ft bars`;
}

const trim = (text: string) => (text.includes(".") ? text.replace(/\.?0+$/, "") : text);

/** Build every buying option for one material. */
export function buildOptions(
  entry: LineCost,
  config: PurchaseConfig,
  unit: UnitSystem,
): PurchaseOption[] {
  const parts = entry.line.parts;
  const { kerf, endTrim } = entry.line;
  const options: PurchaseOption[] = [];

  for (const stockLength of config.candidates) {
    if (stockLength <= 0) continue;
    const result = pack(parts, { stockLength, kerf, endTrim, strategy: entry.line.strategy, pricePerBar: 0 });
    const { unitCost } = resolvePrice(entry, config, stockLength);
    const purchasedLength = result.totals.barsNeeded * stockLength;

    options.push({
      id: optionId(stockLength),
      kind: "bars",
      stockLength,
      label: lengthLabel(stockLength, unit),
      bars: result.totals.barsNeeded,
      purchasedLength,
      utilisation: purchasedLength > 0 ? result.totals.netLength / purchasedLength : 0,
      drop: result.totals.dropLoss,
      fits: result.impossible.length === 0,
      unitCost,
      cost: unitCost === null ? null : unitCost * result.totals.barsNeeded,
      recommended: false,
    });
  }

  if (config.includeByFoot) {
    // Cut-to-length: you pay for the parts plus the blade, rounded up to a
    // whole foot (or 0.1 m) because nobody sells a fraction of one.
    const netLength = parts.reduce((sum, p) => sum + (p.length > 0 ? p.length * p.qty : 0), 0);
    const pieces = parts.reduce((sum, p) => sum + (p.length > 0 ? p.qty : 0), 0);
    const raw = netLength + pieces * kerf;
    const step = unit === "metric" ? INCHES_PER_METRE / 10 : INCHES_PER_FOOT;
    const purchasedLength = Math.ceil(raw / step) * step;
    const { perLength } = resolvePrice(entry, config, 1);
    // Quote it the way it is sold — per foot or per metre, not per inch.
    const perDisplayUnit = unit === "metric" ? INCHES_PER_METRE : INCHES_PER_FOOT;

    options.push({
      id: BY_FOOT_ID,
      kind: "cut-to-length",
      stockLength: 0,
      label: "Cut to length",
      bars: 0,
      purchasedLength,
      utilisation: purchasedLength > 0 ? netLength / purchasedLength : 0,
      drop: purchasedLength - netLength - pieces * kerf,
      fits: true,
      unitCost: perLength === null ? null : perLength * perDisplayUnit,
      cost: perLength === null ? null : perLength * purchasedLength,
      recommended: false,
    });
  }

  // Recommend on cost when every workable option is priced, otherwise on the
  // least material bought. Ties break towards fewer bars to handle.
  const workable = options.filter((option) => option.fits);
  if (workable.length > 0) {
    const allPriced = workable.every((option) => option.cost !== null);
    const best = [...workable].sort((a, b) => {
      if (allPriced) {
        const byCost = (a.cost ?? 0) - (b.cost ?? 0);
        if (Math.abs(byCost) > 0.005) return byCost;
      }
      const byLength = a.purchasedLength - b.purchasedLength;
      if (Math.abs(byLength) > 1e-6) return byLength;
      return a.bars - b.bars;
    })[0];
    best.recommended = true;
  }

  return options;
}

/** What comes out of this material, as a short sentence. */
function summariseCuts(entry: LineCost): string {
  const groups = new Map<string, number>();
  for (const part of entry.line.parts) {
    if (part.length <= 0 || part.qty <= 0) continue;
    const key = `${part.length}`;
    groups.set(key, (groups.get(key) ?? 0) + part.qty);
  }
  return [...groups.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([length, qty]) => `${qty} × ${trim(Number(length).toFixed(3))}`)
    .join(", ");
}

export function buildPurchasePlan(
  project: Project,
  cost: ProjectCost,
  config: PurchaseConfig,
): PurchasePlan {
  const lines: PurchaseLine[] = cost.lines
    .filter((entry) => entry.result.totals.pieces > 0)
    .map((entry) => {
      const options = buildOptions(entry, config, project.unit);
      const wanted = config.selections[entry.line.id];
      const selected =
        options.find((option) => option.id === wanted) ??
        options.find((option) => option.recommended) ??
        options[0] ??
        null;

      return {
        lineId: entry.line.id,
        name: entry.line.name || entry.material?.name || "Material",
        material: entry.material?.name ?? "",
        pieces: entry.result.totals.pieces,
        netLength: entry.result.totals.netLength,
        options,
        selected,
        cutSummary: summariseCuts(entry),
      };
    });

  const purchasedLength = lines.reduce((sum, line) => sum + (line.selected?.purchasedLength ?? 0), 0);
  const netLength = lines.reduce((sum, line) => sum + line.netLength, 0);
  const priced = lines.filter((line) => line.selected?.cost != null);

  return {
    lines,
    purchasedLength,
    netLength,
    totalBars: lines.reduce((sum, line) => sum + (line.selected?.bars ?? 0), 0),
    totalPieces: lines.reduce((sum, line) => sum + line.pieces, 0),
    cost: priced.length === 0 ? null : priced.reduce((sum, line) => sum + (line.selected!.cost ?? 0), 0),
    fullyPriced: lines.length > 0 && priced.length === lines.length,
    impossible: lines.filter((line) => line.selected && !line.selected.fits),
  };
}

/* ----------------------------------------------------------------- display */

/** Length as the buyer thinks of it: feet, or metres in a metric job. */
export function buyLength(inches: number, unit: UnitSystem): string {
  if (unit === "metric") return `${trim((inches / INCHES_PER_METRE).toFixed(2))} m`;
  return `${trim((inches / INCHES_PER_FOOT).toFixed(2))} ft`;
}

/** Same, rounded up to a whole unit — what actually gets ordered. */
export function orderLength(inches: number, unit: UnitSystem): string {
  if (unit === "metric") return `${Math.ceil(inches / INCHES_PER_METRE)} m`;
  return `${Math.ceil(inches / INCHES_PER_FOOT)} ft`;
}

/** "4 × 20 ft bars" or "185 ft cut to length". */
export function orderInstruction(option: PurchaseOption, unit: UnitSystem): string {
  if (option.kind === "cut-to-length") return `${orderLength(option.purchasedLength, unit)} cut to length`;
  return `${option.bars} × ${option.label.replace(/ bars| lengths/, "")}`;
}
