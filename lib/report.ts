/**
 * Canvas renderer for the shareable PNG.
 *
 * Drawn by hand on a 2D canvas rather than rasterising the DOM: iOS Safari is
 * unreliable at serialising foreignObject/webfonts, and this gives a fixed,
 * print-friendly layout that reads the same on a phone and in an email.
 */

import { groupBars, summariseBar, type PackResult, type Part, type Settings } from "./pack";
import { PALETTE } from "./palette";
import {
  describeStock,
  formatLength,
  formatPercent,
  formatValue,
  unitAbbr,
  type UnitSystem,
} from "./units";

export interface ReportMeta {
  job: string;
  material: string;
  unit: UnitSystem;
  currency: string;
}

const WIDTH = 1240;
const PAD = 52;
const SCALE = 2;

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#dbe2ea";
const PANEL = "#f5f7fa";
const ACCENT = "#b45309";
const DROP = "#e2e8f0";

const font = (weight: number, size: number) =>
  `${weight} ${size}px ui-sans-serif, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif`;

const mono = (weight: number, size: number) =>
  `${weight} ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

export function renderReport(
  result: PackResult,
  parts: Part[],
  settings: Settings,
  meta: ReportMeta,
): HTMLCanvasElement {
  const groups = groupBars(result.bars);
  const colours = new Map<string, string>();
  parts.forEach((part, i) => colours.set(part.id, PALETTE[i % PALETTE.length]));

  const activeParts = parts.filter((p) => p.length > 0 && p.qty > 0);
  const height = measureHeight(groups.length, activeParts.length, result);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);

  let y = drawHeader(ctx, meta, settings);
  y = drawHeadline(ctx, y, result, settings, meta);
  y = drawStats(ctx, y, result, settings, meta);
  y = drawMaterial(ctx, y, result, settings, meta);
  y = drawParts(ctx, y, activeParts, colours, meta);
  y = drawLayout(ctx, y, groups, result, colours, meta);
  drawFooter(ctx, y, settings, meta);

  return canvas;
}

/* ---------------------------------------------------------------- sections */

function drawHeader(
  ctx: CanvasRenderingContext2D,
  meta: ReportMeta,
  settings: Settings,
): number {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, 132);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 34);
  ctx.fillText(meta.job.trim() || "Cut List", PAD, 60);

  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 19);
  const subtitle = [meta.material.trim(), describeStock(settings.stockLength, meta.unit) + " stock"]
    .filter(Boolean)
    .join("  ·  ");
  ctx.fillText(subtitle, PAD, 94);

  ctx.textAlign = "right";
  ctx.fillStyle = "#f59e0b";
  ctx.font = font(700, 15);
  ctx.fillText("MATERIAL CUT LIST", WIDTH - PAD, 52);
  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 16);
  ctx.fillText(new Date().toLocaleDateString(undefined, { dateStyle: "medium" }), WIDTH - PAD, 80);
  ctx.font = font(500, 14);
  ctx.fillText(
    settings.strategy === "optimized" ? "Optimised pack" : "Sequential pack",
    WIDTH - PAD,
    102,
  );
  ctx.textAlign = "left";

  return 132;
}

function drawHeadline(
  ctx: CanvasRenderingContext2D,
  top: number,
  result: PackResult,
  settings: Settings,
  meta: ReportMeta,
): number {
  const h = 108;
  ctx.fillStyle = "#fffbeb";
  ctx.fillRect(0, top, WIDTH, h);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, top, 8, h);

  const { totals } = result;
  ctx.fillStyle = ACCENT;
  ctx.font = font(800, 40);
  const headline =
    totals.pieces === 0
      ? "No pieces entered"
      : `BUY ${totals.barsNeeded} ${totals.barsNeeded === 1 ? "BAR" : "BARS"} of ${describeStock(settings.stockLength, meta.unit)}`;
  ctx.fillText(headline, PAD, top + 56);

  ctx.fillStyle = "#92400e";
  ctx.font = font(500, 19);
  ctx.fillText(
    `${totals.pieces} pieces cut  ·  ${formatPercent(totals.utilisation)} of the material used  ·  ${formatLength(totals.dropLoss, meta.unit)} left over`,
    PAD,
    top + 88,
  );

  return top + h;
}

const STAT_H = 104;

function drawStats(
  ctx: CanvasRenderingContext2D,
  top: number,
  result: PackResult,
  settings: Settings,
  meta: ReportMeta,
): number {
  const { totals } = result;
  const stats: Array<[string, string]> = [
    ["Stock bars to buy", String(totals.barsNeeded)],
    ["Pieces to cut", String(totals.pieces)],
    ["Utilisation", formatPercent(totals.utilisation)],
    settings.pricePerBar > 0
      ? ["Estimated cost", `${meta.currency}${totals.cost.toFixed(2)}`]
      : ["Best case", `${totals.theoreticalBest} bars`],
  ];

  const colW = (WIDTH - PAD * 2) / stats.length;
  ctx.fillStyle = PANEL;
  ctx.fillRect(0, top, WIDTH, STAT_H);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  line(ctx, 0, top + STAT_H - 0.5, WIDTH, top + STAT_H - 0.5);

  stats.forEach(([label, value], i) => {
    const x = PAD + colW * i;
    if (i > 0) {
      ctx.strokeStyle = LINE;
      line(ctx, x - 20, top + 22, x - 20, top + STAT_H - 22);
    }
    ctx.fillStyle = MUTED;
    ctx.font = font(600, 14);
    ctx.fillText(label.toUpperCase(), x, top + 40);
    ctx.fillStyle = INK;
    ctx.font = font(700, 34);
    ctx.fillText(value, x, top + 78);
  });

  return top + STAT_H;
}

const MATERIAL_ROWS = 4;
const ROW_H = 34;

function drawMaterial(
  ctx: CanvasRenderingContext2D,
  top: number,
  result: PackResult,
  settings: Settings,
  meta: ReportMeta,
): number {
  let y = sectionTitle(ctx, top, "Material required");
  const { totals } = result;
  const u = meta.unit;

  const rows: Array<[string, string]> = [
    ["Net length of finished pieces", formatLength(totals.netLength, u)],
    ["Total material purchased", formatLength(totals.purchased, u)],
    ["Lost to blade / kerf", formatLength(totals.kerfLoss, u)],
    ["Lost to end trim", formatLength(totals.trimLoss, u)],
    ["Leftover / offcut drop", formatLength(totals.dropLoss, u)],
    ["Total waste", formatPercent(totals.wasteFraction)],
    ["Theoretical best (perfect packing)", `${totals.theoreticalBest} bars`],
    settings.pricePerBar > 0
      ? [
          "Cost",
          `${totals.barsNeeded} x ${meta.currency}${settings.pricePerBar.toFixed(2)} = ${meta.currency}${totals.cost.toFixed(2)}`,
        ]
      : ["Usable length per bar", formatLength(totals.usableLength, u)],
  ];

  // Two balanced columns.
  const half = Math.ceil(rows.length / 2);
  const colW = (WIDTH - PAD * 2 - 40) / 2;
  rows.forEach(([label, value], i) => {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x = PAD + col * (colW + 40);
    const ry = y + row * ROW_H;

    ctx.fillStyle = MUTED;
    ctx.font = font(500, 17);
    ctx.fillText(label, x, ry + 20);

    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.font = mono(600, 17);
    ctx.fillText(value, x + colW, ry + 20);
    ctx.textAlign = "left";

    ctx.strokeStyle = LINE;
    line(ctx, x, ry + ROW_H - 0.5, x + colW, ry + ROW_H - 0.5);
  });

  y += MATERIAL_ROWS * ROW_H;
  return y + 12;
}

function drawParts(
  ctx: CanvasRenderingContext2D,
  top: number,
  parts: Part[],
  colours: Map<string, string>,
  meta: ReportMeta,
): number {
  let y = sectionTitle(ctx, top, "Pieces required");

  const cols = [PAD + 26, WIDTH - PAD - 420, WIDTH - PAD - 200, WIDTH - PAD];
  ctx.fillStyle = MUTED;
  ctx.font = font(700, 13);
  ctx.fillText("PART", cols[0], y + 14);
  ctx.textAlign = "right";
  ctx.fillText("LENGTH", cols[1], y + 14);
  ctx.fillText("QTY", cols[2], y + 14);
  ctx.fillText("TOTAL LENGTH", cols[3], y + 14);
  ctx.textAlign = "left";
  y += 24;

  ctx.strokeStyle = LINE;
  line(ctx, PAD, y - 0.5, WIDTH - PAD, y - 0.5);

  for (const part of parts) {
    ctx.fillStyle = colours.get(part.id) ?? PALETTE[0];
    roundRect(ctx, PAD, y + 11, 14, 14, 3);
    ctx.fill();

    ctx.fillStyle = INK;
    ctx.font = font(600, 17);
    ctx.fillText(truncate(ctx, part.label || "(unnamed)", 380), cols[0], y + 24);

    ctx.textAlign = "right";
    ctx.font = mono(500, 17);
    ctx.fillStyle = INK;
    ctx.fillText(formatValue(part.length, meta.unit), cols[1], y + 24);
    ctx.fillText(String(part.qty), cols[2], y + 24);
    ctx.fillStyle = MUTED;
    ctx.fillText(formatValue(part.length * part.qty, meta.unit), cols[3], y + 24);
    ctx.textAlign = "left";

    y += ROW_H + 2;
    ctx.strokeStyle = LINE;
    line(ctx, PAD, y - 0.5, WIDTH - PAD, y - 0.5);
  }

  return y + 12;
}

const BAR_BLOCK = 122;

function drawLayout(
  ctx: CanvasRenderingContext2D,
  top: number,
  groups: ReturnType<typeof groupBars>,
  result: PackResult,
  colours: Map<string, string>,
  meta: ReportMeta,
): number {
  if (groups.length === 0) return top;
  let y = sectionTitle(ctx, top, "Cutting layout — how to cut each bar");

  const usable = result.totals.usableLength;
  const trackW = WIDTH - PAD * 2;

  for (const group of groups) {
    const bar = group.representative;
    const numbers = group.bars.map((b) => b.index);
    const heading =
      group.bars.length === 1
        ? `Bar ${numbers[0]}`
        : `Bars ${compactRanges(numbers)}  (${group.bars.length} identical)`;

    ctx.fillStyle = INK;
    ctx.font = font(700, 19);
    ctx.fillText(heading, PAD, y + 18);

    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 16);
    ctx.fillText(
      `${bar.pieces.length} cuts · ${formatLength(bar.used, meta.unit)} used · ${formatLength(bar.remaining, meta.unit)} drop`,
      WIDTH - PAD,
      y + 18,
    );
    ctx.textAlign = "left";

    // The bar itself.
    const barY = y + 32;
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

      const text = formatValue(piece.length, meta.unit);
      ctx.font = font(700, 15);
      if (ctx.measureText(text).width + 12 < w) {
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(text, x + w / 2, barY + 26);
        ctx.textAlign = "left";
      }
    }

    // Drop hatching label.
    if (bar.remaining > 0.01) {
      const dropX = PAD + ((usable - bar.remaining) / usable) * trackW;
      const dropW = (bar.remaining / usable) * trackW;
      ctx.fillStyle = "#94a3b8";
      ctx.font = font(600, 14);
      const text = formatValue(bar.remaining, meta.unit);
      if (ctx.measureText(text).width + 10 < dropW) {
        ctx.textAlign = "center";
        ctx.fillText(text, dropX + dropW / 2, barY + 25);
        ctx.textAlign = "left";
      }
    }

    // The cut list in words — this is what gets read at the saw.
    ctx.fillStyle = INK;
    ctx.font = font(500, 16);
    const cuts = summariseBar(bar)
      .map((g) => `${g.qty} x ${formatValue(g.length, meta.unit)}${g.label ? ` (${g.label})` : ""}`)
      .join("   ·   ");
    ctx.fillText(truncate(ctx, cuts, trackW), PAD, barY + barH + 26);

    y += BAR_BLOCK;
    ctx.strokeStyle = LINE;
    line(ctx, PAD, y - 14.5, WIDTH - PAD, y - 14.5);
  }

  return y;
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  top: number,
  settings: Settings,
  meta: ReportMeta,
) {
  const y = top + 12;
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 15);
  const u = unitAbbr(meta.unit);
  ctx.fillText(
    `Kerf ${formatValue(settings.kerf, meta.unit)} ${u}  ·  End trim ${formatValue(settings.endTrim, meta.unit)} ${u}  ·  Stock ${describeStock(settings.stockLength, meta.unit)}  ·  Every piece is charged one blade width.`,
    PAD,
    y + 20,
  );
}

/* ----------------------------------------------------------------- helpers */

function measureHeight(groupCount: number, partCount: number, result: PackResult): number {
  let h = 132; // header
  h += 108; // headline
  h += STAT_H;
  h += SECTION_H + MATERIAL_ROWS * ROW_H + 12;
  h += SECTION_H + 24 + partCount * (ROW_H + 2) + 12;
  if (groupCount > 0) h += SECTION_H + groupCount * BAR_BLOCK;
  h += 60; // footer
  return Math.ceil(h);
}

const SECTION_H = 52;

function sectionTitle(ctx: CanvasRenderingContext2D, top: number, text: string): number {
  ctx.fillStyle = INK;
  ctx.font = font(700, 15);
  ctx.fillText(text.toUpperCase(), PAD, top + 34);
  return top + SECTION_H;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
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
function compactRanges(numbers: number[]): string {
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
