/**
 * Canvas renderer for the shareable snapshot.
 *
 * Drawn by hand on a 2D canvas rather than rasterising the DOM: iOS Safari is
 * unreliable at serialising foreignObject/webfonts, and this gives a fixed,
 * print-friendly layout that reads the same on a phone and in an email.
 *
 * This is the artefact that leaves the building, so it stays plain and
 * businesslike, it always states how firm the pricing is, and it can carry the
 * working behind every figure.
 */

import { explainRollup, explainWaste, type Step } from "./explain";
import { groupBars, summariseBar, type Bar } from "./pack";
import { PALETTE } from "./palette";
import {
  CONFIDENCE_LABELS,
  basisSuffix,
  citation,
  confidenceNote,
  extraCost,
  formatMoney,
  type LineCost,
  type ProjectCost,
} from "./pricing";
import { SOURCE_LABELS, type Project } from "./types";
import { describeStock, formatLength, formatPercent, formatValue } from "./units";

const WIDTH = 1240;
const PAD = 52;
const SCALE = 2;

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE_COLOUR = "#dbe2ea";
const PANEL = "#f5f7fa";
const ACCENT = "#b45309";
const DROP = "#e2e8f0";

const font = (weight: number, size: number) =>
  `${weight} ${size}px ui-sans-serif, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif`;
const mono = (weight: number, size: number) =>
  `${weight} ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

/**
 * Every block on the sheet can be switched off, so one renderer covers both a
 * one-page price for a client and a full working file for yourself.
 */
export interface ReportOptions {
  /** The big "BUY N BARS" banner under the header. */
  includeHeadline: boolean;
  /** The four figures across the top. */
  includeStats: boolean;
  /** Where the material goes, and the cost roll-up. */
  includeRollup: boolean;
  /** The price-evidence section. */
  includeEvidence: boolean;
  /** The step-by-step calculations behind the totals. */
  includeWorking: boolean;
  /** The per-bar cutting diagrams. */
  includeLayout: boolean;
  /** What closes the page: an order summary, or nothing. */
  footer: "order" | "none";
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  includeHeadline: true,
  includeStats: true,
  includeRollup: true,
  includeEvidence: true,
  includeWorking: true,
  includeLayout: true,
  footer: "order",
};

export function renderReport(
  project: Project,
  cost: ProjectCost,
  options: ReportOptions = DEFAULT_REPORT_OPTIONS,
): HTMLCanvasElement {
  // Pass one measures on a throwaway 1px-tall canvas so text metrics are real
  // without duplicating the layout maths; pass two draws for keeps.
  const scratch = document.createElement("canvas");
  scratch.width = WIDTH;
  scratch.height = 1;
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) throw new Error("Could not get a 2D canvas context");
  const height = Math.ceil(paint(scratchCtx, project, cost, options));

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  paint(ctx, project, cost, options);

  return canvas;
}

/** Draws the whole page and returns the total height used. */
function paint(
  ctx: CanvasRenderingContext2D,
  project: Project,
  cost: ProjectCost,
  options: ReportOptions,
): number {
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 1;
  const priced = cost.total > 0;

  let y = drawHeader(ctx, project, cost);
  if (options.includeHeadline) y = drawHeadline(ctx, y, project, cost, priced);
  if (options.includeStats) y = drawStats(ctx, y, project, cost, priced);
  y = drawLineTable(ctx, y, project, cost, priced);
  if (options.includeRollup && priced && project.mode === "detailed") {
    y = drawRollup(ctx, y, project, cost);
  }
  if (options.includeEvidence && cost.lines.some((l) => l.price)) {
    y = drawEvidence(ctx, y, project, cost);
  }
  if (options.includeWorking) y = drawWorking(ctx, y, project, cost);
  if (options.includeLayout) y = drawLayouts(ctx, y, project, cost);
  return drawFooter(ctx, y, project, cost, options);
}

/* ---------------------------------------------------------------- sections */

function drawHeader(ctx: CanvasRenderingContext2D, project: Project, cost: ProjectCost): number {
  const h = 132;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, h);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 34);
  ctx.fillText(truncate(ctx, project.name.trim() || "Material take-off", 700), PAD, 60);

  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 18);
  const bits = [
    project.client.trim() && `Client: ${project.client.trim()}`,
    project.reference.trim() && `Ref: ${project.reference.trim()}`,
    project.preparedBy.trim() && `By: ${project.preparedBy.trim()}`,
  ].filter(Boolean) as string[];
  if (bits.length) ctx.fillText(truncate(ctx, bits.join("   ·   "), 700), PAD, 94);

  ctx.textAlign = "right";
  ctx.fillStyle = "#f59e0b";
  ctx.font = font(700, 15);
  ctx.fillText(project.mode === "quick" ? "QUICK ESTIMATE" : "DETAILED TAKE-OFF", WIDTH - PAD, 52);
  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 16);
  ctx.fillText(new Date().toLocaleDateString(undefined, { dateStyle: "medium" }), WIDTH - PAD, 80);
  ctx.font = font(500, 14);
  ctx.fillText(CONFIDENCE_LABELS[cost.confidence], WIDTH - PAD, 102);
  ctx.textAlign = "left";

  return h;
}

function drawHeadline(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  cost: ProjectCost,
  priced: boolean,
): number {
  const h = 116;
  ctx.fillStyle = "#fffbeb";
  ctx.fillRect(0, top, WIDTH, h);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, top, 8, h);

  ctx.fillStyle = ACCENT;
  ctx.font = font(800, 40);
  const headline =
    cost.totalPieces === 0
      ? "No pieces entered"
      : priced
        ? formatMoney(cost.total, project.currency)
        : `BUY ${cost.totalBars} ${cost.totalBars === 1 ? "BAR" : "BARS"}`;
  ctx.fillText(headline, PAD, top + 54);

  ctx.fillStyle = "#92400e";
  ctx.font = font(500, 18);
  const sub = priced
    ? `${cost.totalBars} ${cost.totalBars === 1 ? "bar" : "bars"}  ·  ${cost.totalPieces} pieces cut  ·  ${formatPercent(cost.utilisation)} of the material used`
    : `${cost.totalPieces} pieces cut  ·  ${formatPercent(cost.utilisation)} of the material used`;
  ctx.fillText(truncate(ctx, sub, WIDTH - PAD * 2), PAD, top + 84);

  ctx.font = font(500, 14);
  ctx.fillStyle = "#a16207";
  ctx.fillText(truncate(ctx, confidenceNote(cost), WIDTH - PAD * 2), PAD, top + 106);

  return top + h;
}

const STAT_H = 104;

function drawStats(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  cost: ProjectCost,
  priced: boolean,
): number {
  const stats: Array<[string, string]> = [
    ["Bars to buy", String(cost.totalBars)],
    ["Pieces to cut", String(cost.totalPieces)],
    ["Utilisation", formatPercent(cost.utilisation)],
    priced
      ? ["Material cost", formatMoney(cost.materials, project.currency)]
      : ["Materials used", String(cost.lines.length)],
  ];

  ctx.fillStyle = PANEL;
  ctx.fillRect(0, top, WIDTH, STAT_H);
  ctx.strokeStyle = LINE_COLOUR;
  hline(ctx, 0, top + STAT_H - 0.5, WIDTH);

  const colW = (WIDTH - PAD * 2) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = PAD + colW * i;
    if (i > 0) {
      ctx.strokeStyle = LINE_COLOUR;
      vline(ctx, x - 20, top + 22, top + STAT_H - 22);
    }
    ctx.fillStyle = MUTED;
    ctx.font = font(600, 13);
    ctx.fillText(label.toUpperCase(), x, top + 40);
    ctx.fillStyle = INK;
    ctx.font = font(700, 32);
    ctx.fillText(truncate(ctx, value, colW - 24), x, top + 78);
  });

  return top + STAT_H;
}

const ROW_H = 34;
const SECTION_H = 52;

function drawLineTable(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  cost: ProjectCost,
  priced: boolean,
): number {
  let y = sectionTitle(ctx, top, "What to buy");

  const cols = {
    name: PAD,
    stock: WIDTH - PAD - 560,
    bars: WIDTH - PAD - 420,
    pieces: WIDTH - PAD - 310,
    rate: WIDTH - PAD - 160,
    cost: WIDTH - PAD,
  };

  ctx.fillStyle = MUTED;
  ctx.font = font(700, 12);
  ctx.fillText("MATERIAL", cols.name, y + 14);
  ctx.textAlign = "right";
  ctx.fillText("STOCK", cols.stock, y + 14);
  ctx.fillText("BARS", cols.bars, y + 14);
  ctx.fillText("PIECES", cols.pieces, y + 14);
  if (priced) {
    ctx.fillText("PER BAR", cols.rate, y + 14);
    ctx.fillText("COST", cols.cost, y + 14);
  }
  ctx.textAlign = "left";
  y += 24;
  ctx.strokeStyle = LINE_COLOUR;
  hline(ctx, PAD, y - 0.5, WIDTH - PAD);

  for (const entry of cost.lines) {
    const t = entry.result.totals;

    ctx.fillStyle = INK;
    ctx.font = font(700, 17);
    const title = entry.line.name || entry.material?.name || "Untitled line";
    ctx.fillText(truncate(ctx, title, 440), cols.name, y + 20);

    ctx.fillStyle = MUTED;
    ctx.font = font(500, 14);
    ctx.fillText(
      truncate(ctx, entry.material?.name || "No material selected", 440),
      cols.name,
      y + 40,
    );

    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.font = mono(500, 16);
    ctx.fillText(formatValue(entry.line.stockLength, project.unit), cols.stock, y + 20);
    ctx.font = mono(700, 18);
    ctx.fillText(String(t.barsNeeded), cols.bars, y + 20);
    ctx.font = mono(500, 16);
    ctx.fillText(String(t.pieces), cols.pieces, y + 20);

    if (priced) {
      ctx.fillStyle = entry.price ? INK : "#b91c1c";
      ctx.fillText(
        entry.price ? formatMoney(entry.barCost, project.currency) : "no price",
        cols.rate,
        y + 20,
      );
      ctx.fillStyle = INK;
      ctx.font = mono(700, 17);
      ctx.fillText(formatMoney(entry.cost, project.currency), cols.cost, y + 20);
    }

    const flags = lineFlags(entry);
    if (flags) {
      ctx.fillStyle = "#b45309";
      ctx.font = font(600, 13);
      ctx.fillText(flags, cols.cost, y + 40);
    }
    ctx.textAlign = "left";

    y += ROW_H + 18;
    ctx.strokeStyle = LINE_COLOUR;
    hline(ctx, PAD, y - 0.5, WIDTH - PAD);
  }

  return y + 14;
}

function lineFlags(entry: LineCost): string {
  const flags: string[] = [];
  if (!entry.price && entry.result.totals.pieces > 0) flags.push("NOT PRICED");
  if (entry.stale) flags.push(`PRICE ${Math.round(entry.priceAgeDays)} DAYS OLD`);
  if (entry.result.impossible.length > 0) flags.push("PIECE TOO LONG");
  return flags.join("   ·   ");
}

function drawRollup(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  cost: ProjectCost,
): number {
  let y = sectionTitle(ctx, top, "How the total is built up");

  const rows: Array<[string, number, boolean]> = [["Materials", cost.materials, false]];
  for (const extra of project.extras) {
    rows.push([
      `${extra.description || "Extra"}  (${extra.qty} × ${formatMoney(extra.unitCost, project.currency)})`,
      extraCost(extra),
      false,
    ]);
  }
  if (cost.contingency) rows.push([`Contingency ${project.contingencyPct}%`, cost.contingency, false]);
  if (cost.markup) rows.push([`Markup ${project.markupPct}%`, cost.markup, false]);
  if (cost.tax) {
    rows.push(["Subtotal", cost.subtotal, false]);
    rows.push([`Tax ${project.taxPct}%`, cost.tax, false]);
  }
  rows.push(["TOTAL", cost.total, true]);

  const right = WIDTH - PAD;
  const left = WIDTH - PAD - 520;

  for (const [label, value, bold] of rows) {
    if (bold) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      hline(ctx, left, y - 0.5, right);
      ctx.lineWidth = 1;
    }
    ctx.fillStyle = bold ? INK : MUTED;
    ctx.font = bold ? font(700, 19) : font(500, 16);
    ctx.fillText(truncate(ctx, label, 340), left, y + 22);

    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.font = bold ? mono(700, 22) : mono(500, 16);
    ctx.fillText(formatMoney(value, project.currency), right, y + 22);
    ctx.textAlign = "left";

    y += bold ? ROW_H + 10 : ROW_H;
  }

  return y + 12;
}

const EVIDENCE_ROW = 66;

function drawEvidence(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  cost: ProjectCost,
): number {
  let y = sectionTitle(ctx, top, "Where the prices came from");

  const seen = new Set<string>();
  for (const entry of cost.lines) {
    if (!entry.price || !entry.material || seen.has(entry.price.id)) continue;
    seen.add(entry.price.id);

    ctx.fillStyle = INK;
    ctx.font = font(700, 16);
    ctx.fillText(truncate(ctx, entry.material.name, 560), PAD, y + 18);

    ctx.textAlign = "right";
    ctx.font = mono(600, 16);
    ctx.fillText(
      `${formatMoney(entry.price.amount, project.currency)}${basisSuffix(entry.price.basis)}`,
      WIDTH - PAD,
      y + 18,
    );
    ctx.textAlign = "left";

    ctx.fillStyle = MUTED;
    ctx.font = font(500, 14);
    ctx.fillText(
      truncate(ctx, citation(entry.price, SOURCE_LABELS), WIDTH - PAD * 2 - 240),
      PAD,
      y + 38,
    );

    const marks: string[] = [];
    if (entry.price.source.attachmentId) marks.push("copy on file");
    if (entry.price.source.url) marks.push("link on file");
    if (entry.stale) marks.push(`${Math.round(entry.priceAgeDays)} days old`);
    if (marks.length) {
      ctx.textAlign = "right";
      ctx.fillStyle = entry.stale ? "#b45309" : "#15803d";
      ctx.font = font(600, 13);
      ctx.fillText(marks.join("   ·   "), WIDTH - PAD, y + 38);
      ctx.textAlign = "left";
    }

    if (entry.price.source.note) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = font(400, 13);
      ctx.fillText(truncate(ctx, entry.price.source.note, WIDTH - PAD * 2), PAD, y + 56);
    }

    // The rule sits below whatever the row actually rendered, note included.
    y += entry.price.source.note ? EVIDENCE_ROW + 20 : EVIDENCE_ROW;
    ctx.strokeStyle = LINE_COLOUR;
    hline(ctx, PAD, y - 14.5, WIDTH - PAD);
  }

  return y + 4;
}

/**
 * The step-by-step sums behind the totals, so the reader can check the figures
 * without opening the app.
 */
function drawWorking(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  cost: ProjectCost,
): number {
  const steps: Step[] = [
    ...explainWaste(cost, project.unit),
    ...(cost.total > 0 && project.mode === "detailed" ? explainRollup(project, cost) : []),
  ];
  if (steps.length === 0) return top;

  let y = sectionTitle(ctx, top, "How these numbers were worked out");

  for (const step of steps) {
    ctx.fillStyle = INK;
    ctx.font = font(600, 16);
    ctx.fillText(truncate(ctx, step.label, WIDTH - PAD * 2 - 200), PAD, y + 16);

    ctx.textAlign = "right";
    ctx.font = mono(700, 16);
    ctx.fillText(step.result, WIDTH - PAD, y + 16);
    ctx.textAlign = "left";

    ctx.fillStyle = MUTED;
    ctx.font = mono(400, 13);
    ctx.fillText(truncate(ctx, step.formula, WIDTH - PAD * 2), PAD, y + 34);

    y += step.note ? 72 : 52;
    if (step.note) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = font(400, 13);
      ctx.fillText(truncate(ctx, step.note, WIDTH - PAD * 2), PAD, y - 20);
    }

    ctx.strokeStyle = LINE_COLOUR;
    hline(ctx, PAD, y - 10.5, WIDTH - PAD);
  }

  return y + 6;
}

const BAR_BLOCK = 122;

function drawLayouts(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  cost: ProjectCost,
): number {
  const withBars = cost.lines.filter((entry) => entry.result.bars.length > 0);
  if (withBars.length === 0) return top;

  let y = sectionTitle(ctx, top, "Cut plan — how to cut each bar");
  const trackW = WIDTH - PAD * 2;

  for (const entry of withBars) {
    const groups = groupBars(entry.result.bars);
    const usable = entry.result.totals.usableLength;

    // Colours are assigned within a line, so one colour means one part here.
    const colours = new Map<string, string>();
    entry.line.parts.forEach((part, i) => colours.set(part.id, PALETTE[i % PALETTE.length]));

    if (cost.lines.length > 1) {
      ctx.fillStyle = "#334155";
      ctx.font = font(700, 17);
      const heading = `${entry.line.name || "Line"}${entry.material ? ` — ${entry.material.name}` : ""}`;
      ctx.fillText(truncate(ctx, heading, trackW), PAD, y + 14);
      y += 30;
    }

    for (const group of groups) {
      const bar = group.representative;
      const numbers = group.bars.map((b) => b.index);
      const heading =
        group.bars.length === 1
          ? `Bar ${numbers[0]}`
          : `Bars ${compactRanges(numbers)}  (${group.bars.length} identical)`;

      ctx.fillStyle = INK;
      ctx.font = font(700, 18);
      ctx.fillText(heading, PAD, y + 18);

      ctx.textAlign = "right";
      ctx.fillStyle = MUTED;
      ctx.font = font(500, 15);
      ctx.fillText(
        `${bar.pieces.length} cuts · ${formatLength(bar.used, project.unit)} used · ${formatLength(bar.remaining, project.unit)} drop`,
        WIDTH - PAD,
        y + 18,
      );
      ctx.textAlign = "left";

      drawBar(ctx, bar, y + 32, trackW, usable, colours, project);

      ctx.fillStyle = INK;
      ctx.font = font(500, 15);
      const cuts = summariseBar(bar)
        .map(
          (g) => `${g.qty} × ${formatValue(g.length, project.unit)}${g.label ? ` (${g.label})` : ""}`,
        )
        .join("   ·   ");
      ctx.fillText(truncate(ctx, cuts, trackW), PAD, y + 98);

      y += BAR_BLOCK;
      ctx.strokeStyle = LINE_COLOUR;
      hline(ctx, PAD, y - 14.5, WIDTH - PAD);
    }
  }

  return y;
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  bar: Bar,
  barY: number,
  trackW: number,
  usable: number,
  colours: Map<string, string>,
  project: Project,
) {
  const barH = 40;
  ctx.fillStyle = DROP;
  roundRect(ctx, PAD, barY, trackW, barH, 5);
  ctx.fill();

  for (const piece of bar.pieces) {
    const x = PAD + (piece.start / usable) * trackW;
    const w = (piece.length / usable) * trackW;
    ctx.fillStyle = colours.get(piece.partId) ?? PALETTE[0];
    roundRect(ctx, x, barY, Math.max(w, 2), barH, 4);
    ctx.fill();

    const text = formatValue(piece.length, project.unit);
    ctx.font = font(700, 15);
    if (ctx.measureText(text).width + 12 < w) {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(text, x + w / 2, barY + 26);
      ctx.textAlign = "left";
    }
  }

  if (bar.remaining > 0.01) {
    const dropX = PAD + ((usable - bar.remaining) / usable) * trackW;
    const dropW = (bar.remaining / usable) * trackW;
    const text = formatValue(bar.remaining, project.unit);
    ctx.fillStyle = "#94a3b8";
    ctx.font = font(600, 14);
    if (ctx.measureText(text).width + 10 < dropW) {
      ctx.textAlign = "center";
      ctx.fillText(text, dropX + dropW / 2, barY + 25);
      ctx.textAlign = "left";
    }
  }
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  cost: ProjectCost,
  options: ReportOptions,
): number {
  const notes = project.notes.trim();
  if (options.footer === "none" && !notes) return top + 24;

  let y = top + 8;
  ctx.strokeStyle = LINE_COLOUR;
  hline(ctx, PAD, y - 0.5, WIDTH - PAD);
  y += 8;

  // The old footer restated settings nobody buys from. What a purchaser
  // actually needs off the bottom of the sheet is the order itself.
  if (options.footer === "order" && cost.lines.length) {
    y = sectionTitle(ctx, y, "To order");

    ctx.font = font(500, 16);
    for (const entry of cost.lines) {
      const bars = entry.result.bars.length;
      if (!bars) continue;
      const stock = describeStock(entry.line.stockLength, project.unit);
      const total = formatLength(bars * entry.line.stockLength, project.unit);

      ctx.fillStyle = INK;
      ctx.font = font(700, 16);
      ctx.fillText(
        truncate(ctx, entry.material?.name || entry.line.name || "Material", 620),
        PAD,
        y + 18,
      );

      ctx.fillStyle = MUTED;
      ctx.font = font(500, 16);
      ctx.textAlign = "right";
      ctx.fillText(`${bars} × ${stock}   (${total} total)`, WIDTH - PAD, y + 18);
      ctx.textAlign = "left";
      y += 26;
    }

    ctx.fillStyle = INK;
    ctx.font = font(700, 16);
    const totalLength = cost.lines.reduce(
      (sum, entry) => sum + entry.result.bars.length * entry.line.stockLength,
      0,
    );
    hline(ctx, PAD, y + 4.5, WIDTH - PAD);
    ctx.fillText(
      `${cost.totalBars} ${cost.totalBars === 1 ? "bar" : "bars"} in total`,
      PAD,
      y + 30,
    );
    ctx.textAlign = "right";
    ctx.fillText(formatLength(totalLength, project.unit), WIDTH - PAD, y + 30);
    ctx.textAlign = "left";
    y += 44;
  }

  if (notes) {
    ctx.fillStyle = INK;
    ctx.font = font(500, 15);
    ctx.fillText(truncate(ctx, notes, WIDTH - PAD * 2), PAD, y + 20);
    y += 28;
  }

  return y + 40;
}

/* ----------------------------------------------------------------- helpers */

function sectionTitle(ctx: CanvasRenderingContext2D, top: number, text: string): number {
  ctx.fillStyle = INK;
  ctx.font = font(700, 15);
  ctx.fillText(text.toUpperCase(), PAD, top + 34);
  return top + SECTION_H;
}

function hline(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

function vline(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/** `1,2,3,7,8` -> `1-3, 7-8` so long bar lists stay readable. */
export function compactRanges(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i += 1) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  return parts.join(", ");
}

/** Canvas -> PNG blob. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the PNG"));
    }, "image/png");
  });
}
