/**
 * Canvas renderer for the shop cut list.
 *
 * This is the sheet that gets printed and stuck to the saw, so it is the one
 * document here with no explaining on it at all: your part list exactly as you
 * typed it, set large enough to read at arm's length, with a box to tick as
 * each piece comes off.
 *
 * Deliberately *not* the bar-by-bar plan. The shop decides how to get the
 * pieces out of a bar; they just need to know what pieces to make.
 */

import type { Project, TakeoffLine } from "./types";
import { formatValue, unitAbbr } from "./units";

const WIDTH = 1240;
const PAD = 52;
const SCALE = 2;
const MIN_HEIGHT = 900;

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE_COLOUR = "#cbd5e1";
const PANEL = "#eef2f7";
const ACCENT = "#b45309";
const STRIPE = "#f8fafc";

const font = (weight: number, size: number) =>
  `${weight} ${size}px ui-sans-serif, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif`;
const mono = (weight: number, size: number) =>
  `${weight} ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

export type CutOrder = "entered" | "longest";

export interface CutSheetConfig {
  /** The strip across the top. Off for a bare list. */
  showHeadline: boolean;
  /** Your own wording for it; blank counts the pieces. */
  headline: string;
  /** A box for every piece rather than one for the row. */
  boxPerPiece: boolean;
  /** Longest first cuts waste; as-entered matches your drawing. */
  order: CutOrder;
  /** The per-material totals line. */
  showTotals: boolean;
  note: string;
}

export const DEFAULT_CUT_SHEET: CutSheetConfig = {
  showHeadline: true,
  headline: "",
  boxPerPiece: true,
  order: "longest",
  showTotals: true,
  note: "",
};

/* ----------------------------------------------------------------- layout */

const HEADER_H = 120;
const BANNER_H = 88;
const GROUP_H = 58;
const COLUMNS_H = 30;
const ROW_H = 66;

interface Row {
  qty: number;
  length: number;
  label: string;
}

interface Group {
  title: string;
  subtitle: string;
  rows: Row[];
  pieces: number;
  total: number;
}

/** One group per take-off line, holding the parts exactly as entered. */
function groupsOf(
  project: Project,
  config: CutSheetConfig,
  materialNames: Record<string, string>,
): Group[] {
  return project.lines
    .map((line) => build(line, config, line.materialId ? materialNames[line.materialId] : ""))
    .filter((group): group is Group => group !== null);
}

function build(line: TakeoffLine, config: CutSheetConfig, material: string | undefined): Group | null {
  const rows: Row[] = line.parts
    .filter((part) => part.length > 0 && part.qty > 0)
    .map((part) => ({ qty: part.qty, length: part.length, label: part.label }));
  if (rows.length === 0) return null;

  if (config.order === "longest") rows.sort((a, b) => b.length - a.length);

  return {
    title: line.name || material || "Parts",
    // Never repeat the material as the subtitle when it is already the title.
    subtitle: material && material !== (line.name || "") ? material : "",
    rows,
    pieces: rows.reduce((sum, row) => sum + row.qty, 0),
    total: rows.reduce((sum, row) => sum + row.qty * row.length, 0),
  };
}

export function renderCutSheet(
  project: Project,
  config: CutSheetConfig,
  materialNames: Record<string, string> = {},
): HTMLCanvasElement {
  const groups = groupsOf(project, config, materialNames);

  const natural = height(groups, config, project);
  const total = Math.ceil(Math.max(natural, MIN_HEIGHT));

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = total * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, total);
  paint(ctx, project, groups, config);

  return canvas;
}

/** Every block is a fixed height, so the page can be measured outright. */
function height(groups: Group[], config: CutSheetConfig, project: Project): number {
  let y = HEADER_H;
  if (config.showHeadline) y += BANNER_H;
  for (const group of groups) {
    y += GROUP_H + COLUMNS_H + group.rows.length * ROW_H;
    if (config.showTotals) y += 44;
    y += 22;
  }
  if (config.note.trim() || project.notes.trim()) y += 70;
  return y + 40;
}

function paint(
  ctx: CanvasRenderingContext2D,
  project: Project,
  groups: Group[],
  config: CutSheetConfig,
) {
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 1;

  let y = drawHeader(ctx, project);
  if (config.showHeadline) y = drawBanner(ctx, y, groups, config);

  for (const group of groups) {
    y = drawGroup(ctx, y, project, group, config);
  }

  const note = [config.note.trim(), project.notes.trim()].filter(Boolean).join("   ·   ");
  if (note) {
    ctx.strokeStyle = LINE_COLOUR;
    hline(ctx, PAD, y + 12.5, WIDTH - PAD);
    ctx.fillStyle = INK;
    ctx.font = font(600, 17);
    ctx.fillText(truncate(ctx, note, WIDTH - PAD * 2), PAD, y + 44);
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, project: Project): number {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 34);
  ctx.fillText(truncate(ctx, project.name.trim() || "Cut list", 720), PAD, 58);

  const bits = [project.client.trim(), project.reference.trim()].filter(Boolean);
  if (bits.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = font(500, 18);
    ctx.fillText(truncate(ctx, bits.join("   ·   "), 720), PAD, 90);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = "#f59e0b";
  ctx.font = font(700, 17);
  ctx.fillText("CUT LIST", WIDTH - PAD, 54);
  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 16);
  ctx.fillText(new Date().toLocaleDateString(undefined, { dateStyle: "medium" }), WIDTH - PAD, 82);
  ctx.textAlign = "left";

  return HEADER_H;
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  top: number,
  groups: Group[],
  config: CutSheetConfig,
): number {
  ctx.fillStyle = "#fffbeb";
  ctx.fillRect(0, top, WIDTH, BANNER_H);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, top, 8, BANNER_H);

  const pieces = groups.reduce((sum, group) => sum + group.pieces, 0);
  const written = config.headline.trim();
  const text = written || `${pieces} ${pieces === 1 ? "piece" : "pieces"} to cut`;

  ctx.fillStyle = ACCENT;
  fitText(ctx, text, WIDTH - PAD * 2, 40, 22);
  ctx.fillText(text, PAD, top + 56);

  return top + BANNER_H;
}

function drawGroup(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  group: Group,
  config: CutSheetConfig,
): number {
  let y = top;
  const unit = unitAbbr(project.unit);

  // Material band.
  ctx.fillStyle = PANEL;
  ctx.fillRect(0, y, WIDTH, GROUP_H);
  ctx.fillStyle = INK;
  ctx.font = font(700, 23);
  ctx.fillText(truncate(ctx, group.title, 620), PAD, y + 30);
  if (group.subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 15);
    ctx.fillText(truncate(ctx, group.subtitle, 620), PAD, y + 49);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = font(700, 20);
  ctx.fillText(`${group.pieces} ${group.pieces === 1 ? "piece" : "pieces"}`, WIDTH - PAD, y + 36);
  ctx.textAlign = "left";
  y += GROUP_H;

  // Column heads — the only labels on the sheet.
  const cols = { qty: PAD, length: PAD + 120, label: PAD + 400, tick: WIDTH - PAD };
  ctx.fillStyle = MUTED;
  ctx.font = font(700, 12);
  ctx.fillText("QTY", cols.qty, y + 20);
  ctx.fillText("LENGTH", cols.length, y + 20);
  ctx.fillText("DESCRIPTION", cols.label, y + 20);
  ctx.textAlign = "right";
  ctx.fillText("CUT", cols.tick, y + 20);
  ctx.textAlign = "left";
  y += COLUMNS_H;

  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  hline(ctx, PAD, y + 0.5, WIDTH - PAD);
  ctx.lineWidth = 1;

  group.rows.forEach((row, index) => {
    if (index % 2 === 1) {
      ctx.fillStyle = STRIPE;
      ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H);
    }

    ctx.fillStyle = INK;
    ctx.font = font(700, 27);
    ctx.fillText(`${row.qty}`, cols.qty, y + 43);
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 19);
    ctx.fillText("×", cols.qty + ctx.measureText(`${row.qty}`).width + 26, y + 43);

    // The length is what gets read off the sheet, so it is the biggest thing.
    ctx.fillStyle = INK;
    ctx.font = mono(700, 30);
    ctx.fillText(`${formatValue(row.length, project.unit)} ${unit}`, cols.length, y + 44);

    if (row.label) {
      // Cut the description to whatever the tick boxes leave behind.
      const room = cols.tick - tickWidth(row.qty, config.boxPerPiece) - cols.label - 24;
      ctx.fillStyle = MUTED;
      ctx.font = font(500, 19);
      ctx.fillText(truncate(ctx, row.label, room), cols.label, y + 43);
    }

    drawTicks(ctx, y, cols.tick, row.qty, config.boxPerPiece);

    ctx.strokeStyle = LINE_COLOUR;
    hline(ctx, PAD, y + ROW_H - 0.5, WIDTH - PAD);
    y += ROW_H;
  });

  if (config.showTotals) {
    ctx.fillStyle = MUTED;
    ctx.font = font(600, 16);
    ctx.fillText(
      `${group.pieces} pieces · ${formatValue(group.total, project.unit)} ${unit} of material`,
      PAD,
      y + 28,
    );
    y += 44;
  }

  return y + 22;
}

const BOX = 30;
const SMALL = 20;
const GAP = 7;
/** How much of the row width the tick boxes may take. */
const TICK_AREA = 520;

/** What the tick block will occupy, so the description can be cut to fit. */
function tickWidth(qty: number, perPiece: boolean): number {
  const wanted = perPiece ? qty : 1;
  if (wanted <= 1) return BOX;
  const boxes = wanted * SMALL + (wanted - 1) * GAP;
  // Too many to draw one each: a single box with the count beside it.
  return boxes <= TICK_AREA ? boxes : BOX + 80;
}

/** One box to tick, or a box per piece when there is room for them. */
function drawTicks(
  ctx: CanvasRenderingContext2D,
  top: number,
  right: number,
  qty: number,
  perPiece: boolean,
) {
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 2;

  const wanted = perPiece ? qty : 1;
  const boxes = wanted * SMALL + (wanted - 1) * GAP;

  if (wanted > 1 && boxes <= TICK_AREA) {
    let x = right - boxes;
    for (let i = 0; i < wanted; i += 1) {
      roundRect(ctx, x, top + (ROW_H - SMALL) / 2, SMALL, SMALL, 4);
      ctx.stroke();
      x += SMALL + GAP;
    }
  } else {
    roundRect(ctx, right - BOX, top + (ROW_H - BOX) / 2, BOX, BOX, 5);
    ctx.stroke();
    if (wanted > 1) {
      ctx.fillStyle = MUTED;
      ctx.font = font(600, 15);
      ctx.textAlign = "right";
      ctx.fillText(`${qty} off`, right - BOX - 14, top + ROW_H / 2 + 6);
      ctx.textAlign = "left";
    }
  }

  ctx.lineWidth = 1;
}

/* ---------------------------------------------------------------- helpers */

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  max: number,
  min: number,
) {
  for (let size = max; size > min; size -= 1) {
    ctx.font = font(800, size);
    if (ctx.measureText(text).width <= maxWidth) return;
  }
  ctx.font = font(800, min);
}

function hline(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}
