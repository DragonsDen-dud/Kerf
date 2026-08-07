/**
 * 1D cutting-stock engine.
 *
 * Ported from the "MATERIAL CUT LIST CALCULATOR" workbook. The workbook's
 * cutting engine (columns P:U) walks the piece list longest-first and keeps a
 * single running bar, opening a new one whenever the next piece no longer
 * fits — a next-fit-decreasing pack. Every piece is charged one blade width,
 * including the last piece on a bar, matching `B43 = pieces x kerf`.
 *
 * `sequential` reproduces that behaviour exactly so the app can be reconciled
 * against the spreadsheet. `optimized` runs first-fit-decreasing, which uses
 * the same cost model but back-fills earlier bars and so never needs more
 * bars than `sequential`.
 */

/** Floating-point slack, in inches. Well below any real saw tolerance. */
const EPSILON = 1e-9;

export type Strategy = "optimized" | "sequential";

export interface Part {
  id: string;
  label: string;
  /** Finished length in inches. */
  length: number;
  qty: number;
}

export interface Settings {
  /** Purchased stock length in inches. */
  stockLength: number;
  /** Blade kerf in inches. */
  kerf: number;
  /** End trim discarded from each bar, in inches. */
  endTrim: number;
  strategy: Strategy;
  /** Optional price of one stock bar, used for the cost estimate. */
  pricePerBar: number;
}

export interface PlacedPiece {
  partId: string;
  label: string;
  length: number;
  /** Distance from the start of the usable bar to this piece's first cut. */
  start: number;
}

export interface Bar {
  /** 1-based bar number, as printed on the cut list. */
  index: number;
  pieces: PlacedPiece[];
  /** Sum of the finished lengths on this bar. */
  used: number;
  /** Blade loss on this bar (pieces x kerf). */
  kerfLoss: number;
  /** Usable length still free after the last cut. */
  remaining: number;
}

export interface PackResult {
  bars: Bar[];
  /** Parts longer than the usable bar; impossible to cut. */
  impossible: Part[];
  totals: {
    pieces: number;
    /** Net length of the finished pieces. */
    netLength: number;
    barsNeeded: number;
    /** barsNeeded x stockLength. */
    purchased: number;
    kerfLoss: number;
    trimLoss: number;
    /** purchased - net - kerf - trim. */
    dropLoss: number;
    utilisation: number;
    wasteFraction: number;
    /** Lower bound on bars if packing were perfect. */
    theoreticalBest: number;
    usableLength: number;
    cost: number;
  };
}

/** Expand parts into individual pieces, longest first (workbook rows 215:234). */
export function expandPieces(parts: Part[]): Array<{ part: Part; length: number }> {
  const usable = parts.filter((p) => p.length > 0 && p.qty > 0);
  const sorted = [...usable].sort((a, b) => b.length - a.length);
  const pieces: Array<{ part: Part; length: number }> = [];
  for (const part of sorted) {
    for (let i = 0; i < part.qty; i += 1) pieces.push({ part, length: part.length });
  }
  return pieces;
}

export function pack(parts: Part[], settings: Settings): PackResult {
  const { stockLength, kerf, endTrim, strategy, pricePerBar } = settings;
  const usableLength = Math.max(0, stockLength - endTrim);

  const impossible: Part[] = [];
  const cuttable: Part[] = [];
  for (const part of parts) {
    if (part.length <= 0 || part.qty <= 0) continue;
    // A piece needs room for itself plus the blade width that frees it.
    if (part.length + kerf > usableLength + EPSILON) impossible.push(part);
    else cuttable.push(part);
  }

  const pieces = expandPieces(cuttable);
  const bars: Bar[] = [];

  const openBar = (): Bar => {
    const bar: Bar = {
      index: bars.length + 1,
      pieces: [],
      used: 0,
      kerfLoss: 0,
      remaining: usableLength,
    };
    bars.push(bar);
    return bar;
  };

  const place = (bar: Bar, piece: { part: Part; length: number }) => {
    bar.pieces.push({
      partId: piece.part.id,
      label: piece.part.label,
      length: piece.length,
      start: usableLength - bar.remaining,
    });
    bar.used += piece.length;
    bar.kerfLoss += kerf;
    bar.remaining -= piece.length + kerf;
  };

  for (const piece of pieces) {
    const need = piece.length + kerf;

    if (strategy === "sequential") {
      // Next-fit: only ever consider the bar currently on the saw.
      const current = bars[bars.length - 1];
      if (current && need <= current.remaining + EPSILON) place(current, piece);
      else place(openBar(), piece);
      continue;
    }

    // First-fit: back-fill the earliest bar with room.
    const target = bars.find((bar) => need <= bar.remaining + EPSILON) ?? openBar();
    place(target, piece);
  }

  const pieceCount = pieces.length;
  const netLength = pieces.reduce((sum, p) => sum + p.length, 0);
  const barsNeeded = bars.length;
  const purchased = barsNeeded * stockLength;
  const kerfLoss = pieceCount * kerf;
  const trimLoss = barsNeeded * endTrim;
  const dropLoss = purchased - netLength - kerfLoss - trimLoss;
  const utilisation = purchased === 0 ? 0 : netLength / purchased;
  const theoreticalBest =
    pieceCount === 0 || usableLength <= 0
      ? 0
      : Math.ceil((netLength + kerfLoss + trimLoss) / usableLength);

  return {
    bars,
    impossible,
    totals: {
      pieces: pieceCount,
      netLength,
      barsNeeded,
      purchased,
      kerfLoss,
      trimLoss,
      dropLoss,
      utilisation,
      wasteFraction: purchased === 0 ? 0 : 1 - utilisation,
      theoreticalBest,
      usableLength,
      cost: barsNeeded * (pricePerBar || 0),
    },
  };
}

/**
 * Collapse a bar's pieces into `2 x 54 in` style groupings, preserving the
 * order the cuts are made in.
 */
export function summariseBar(
  bar: Bar,
): Array<{ partId: string; label: string; length: number; qty: number }> {
  const groups: Array<{ partId: string; label: string; length: number; qty: number }> = [];
  for (const piece of bar.pieces) {
    const last = groups[groups.length - 1];
    // Group on partId, not label: two different parts may share a name.
    if (last && last.partId === piece.partId && Math.abs(last.length - piece.length) < EPSILON) {
      last.qty += 1;
    } else {
      groups.push({ partId: piece.partId, label: piece.label, length: piece.length, qty: 1 });
    }
  }
  return groups;
}

/**
 * Group identical bars so a 40-bar job reads as "12 x Bar type A" instead of
 * forty near-identical diagrams.
 */
export interface BarGroup {
  signature: string;
  bars: Bar[];
  representative: Bar;
}

export function groupBars(bars: Bar[]): BarGroup[] {
  const groups = new Map<string, BarGroup>();
  for (const bar of bars) {
    const signature = bar.pieces
      .map((p) => `${p.partId}@${p.length.toFixed(4)}`)
      .join("|");
    const existing = groups.get(signature);
    if (existing) existing.bars.push(bar);
    else groups.set(signature, { signature, bars: [bar], representative: bar });
  }
  return [...groups.values()];
}
