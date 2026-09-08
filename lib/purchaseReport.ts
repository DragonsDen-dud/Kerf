/**
 * Canvas renderer for the purchase list.
 *
 * A different document from the take-off report: this one goes to whoever is
 * buying the steel, so it leads with footage and length options rather than
 * cut plans, and every material shows the alternatives side by side with the
 * cheapest or leanest one marked.
 *
 * Short lists are padded out rather than left as a thin strip at the top of a
 * tall page, so a two-material order still reads as a finished sheet.
 */

import {
  buyLength,
  orderInstruction,
  orderLength,
  type PurchaseConfig,
  type PurchaseLine,
  type PurchaseOption,
  type PurchasePlan,
} from "./purchase";
import { formatMoney } from "./pricing";
import type { Project } from "./types";
import { formatValue, unitAbbr } from "./units";

const WIDTH = 1240;
const PAD = 52;
const SCALE = 2;
/** Anything shorter than this gets its footer block stretched to fill. */
const MIN_HEIGHT = 1000;

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE_COLOUR = "#dbe2ea";
const PANEL = "#f5f7fa";
const ACCENT = "#b45309";
const BEST_BG = "#fff7ed";
const BEST_LINE = "#fdba74";

const font = (weight: number, size: number) =>
  `${weight} ${size}px ui-sans-serif, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif`;
const mono = (weight: number, size: number) =>
  `${weight} ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

export function renderPurchaseList(
  project: Project,
  plan: PurchasePlan,
  config: PurchaseConfig,
): HTMLCanvasElement {
  const scratch = document.createElement("canvas");
  scratch.width = WIDTH;
  scratch.height = 1;
  const scratchCtx = scratch.getContext("2d");
  if (!scratchCtx) throw new Error("Could not get a 2D canvas context");
  const natural = paint(scratchCtx, project, plan, config, 0);
  const height = Math.ceil(Math.max(natural, MIN_HEIGHT));
  // Give any spare height to the closing block so the page looks deliberate.
  const slack = height - natural;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  paint(ctx, project, plan, config, slack);

  return canvas;
}

function paint(
  ctx: CanvasRenderingContext2D,
  project: Project,
  plan: PurchasePlan,
  config: PurchaseConfig,
  slack: number,
): number {
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 1;

  let y = drawHeader(ctx, project);
  y = drawHeadline(ctx, y, project, plan);
  if (plan.impossible.length > 0) y = drawWarning(ctx, y, plan);
  for (const line of plan.lines) y = drawLine(ctx, y, project, line, config);
  if (config.showCost && plan.cost !== null) y = drawTotal(ctx, y, project, plan);
  return drawFooter(ctx, y, project, plan, config, slack);
}

/* ---------------------------------------------------------------- sections */

function drawHeader(ctx: CanvasRenderingContext2D, project: Project): number {
  const h = 128;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, h);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(700, 32);
  ctx.fillText(truncate(ctx, project.name.trim() || "Material order", 700), PAD, 58);

  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 17);
  const bits = [
    project.client.trim() && `Client: ${project.client.trim()}`,
    project.reference.trim() && `Ref: ${project.reference.trim()}`,
    project.preparedBy.trim() && `Requested by: ${project.preparedBy.trim()}`,
  ].filter(Boolean) as string[];
  if (bits.length) ctx.fillText(truncate(ctx, bits.join("   ·   "), 700), PAD, 90);

  ctx.textAlign = "right";
  ctx.fillStyle = "#f59e0b";
  ctx.font = font(700, 15);
  ctx.fillText("MATERIAL PURCHASE LIST", WIDTH - PAD, 52);
  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 16);
  ctx.fillText(new Date().toLocaleDateString(undefined, { dateStyle: "medium" }), WIDTH - PAD, 80);
  ctx.textAlign = "left";

  return h;
}

const HEADLINE_H = 132;

function drawHeadline(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  plan: PurchasePlan,
): number {
  ctx.fillStyle = "#fffbeb";
  ctx.fillRect(0, top, WIDTH, HEADLINE_H);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, top, 8, HEADLINE_H);

  ctx.fillStyle = ACCENT;
  ctx.font = font(800, 42);
  ctx.fillText(
    `${orderLength(plan.purchasedLength, project.unit)} of material to buy`,
    PAD,
    top + 56,
  );

  ctx.fillStyle = "#92400e";
  ctx.font = font(500, 18);
  const bits = [
    `${plan.lines.length} ${plan.lines.length === 1 ? "material" : "materials"}`,
    plan.totalBars > 0 ? `${plan.totalBars} ${plan.totalBars === 1 ? "bar" : "bars"}` : "",
    `${plan.totalPieces} pieces to be cut from it`,
  ].filter(Boolean);
  ctx.fillText(bits.join("   ·   "), PAD, top + 86);

  ctx.font = font(500, 14);
  ctx.fillStyle = "#a16207";
  ctx.fillText(
    `Finished parts total ${buyLength(plan.netLength, project.unit)}; the rest is cutting waste and offcut. Order the full figure above.`,
    PAD,
    top + 112,
  );

  return top + HEADLINE_H;
}

function drawWarning(ctx: CanvasRenderingContext2D, top: number, plan: PurchasePlan): number {
  const h = 58;
  ctx.fillStyle = "#fef2f2";
  ctx.fillRect(0, top, WIDTH, h);
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(0, top, 6, h);

  ctx.fillStyle = "#b91c1c";
  ctx.font = font(700, 16);
  const names = plan.impossible.map((line) => line.name).join(", ");
  ctx.fillText(
    truncate(ctx, `Check before ordering: ${names} — a part is too long for the length selected.`, WIDTH - PAD * 2),
    PAD,
    top + 35,
  );

  return top + h;
}

const ROW_H = 34;
const HEAD_H = 74;

/** One material: its options table, then the order line. */
function drawLine(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  line: PurchaseLine,
  config: PurchaseConfig,
): number {
  let y = top + 26;

  // Material heading.
  ctx.fillStyle = INK;
  ctx.font = font(700, 22);
  ctx.fillText(truncate(ctx, line.name, 640), PAD, y + 8);

  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = font(500, 15);
  ctx.fillText(
    `${line.pieces} pieces · ${buyLength(line.netLength, project.unit)} of finished parts`,
    WIDTH - PAD,
    y + 8,
  );
  ctx.textAlign = "left";

  if (line.material && line.material !== line.name) {
    ctx.fillStyle = MUTED;
    ctx.font = font(500, 15);
    ctx.fillText(truncate(ctx, line.material, 640), PAD, y + 30);
    y += 22;
  }
  if (config.showCutSummary && line.cutSummary) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = mono(400, 13);
    ctx.fillText(
      truncate(ctx, `Cuts to: ${line.cutSummary} ${unitAbbr(project.unit)}`, WIDTH - PAD * 2),
      PAD,
      y + 30,
    );
    y += 22;
  }

  y += HEAD_H - 46;

  // Column layout.
  const cols = columns(config);

  ctx.fillStyle = MUTED;
  ctx.font = font(700, 12);
  ctx.fillText("BUY AS", cols.label, y + 14);
  ctx.textAlign = "right";
  ctx.fillText("QTY", cols.qty, y + 14);
  ctx.fillText("TOTAL LENGTH", cols.total, y + 14);
  if (config.showWaste) ctx.fillText("WASTE", cols.waste, y + 14);
  if (config.showCost) {
    ctx.fillText("EACH", cols.unit, y + 14);
    ctx.fillText("COST", cols.cost, y + 14);
  }
  ctx.textAlign = "left";
  y += 22;

  ctx.strokeStyle = LINE_COLOUR;
  hline(ctx, PAD, y - 0.5, WIDTH - PAD);

  for (const option of line.options) {
    const selected = line.selected?.id === option.id;
    drawOptionRow(ctx, y, project, option, cols, config, selected);
    y += ROW_H;
    ctx.strokeStyle = LINE_COLOUR;
    hline(ctx, PAD, y - 0.5, WIDTH - PAD);
  }

  // The instruction, in the plainest words available.
  y += 14;
  if (line.selected) {
    ctx.fillStyle = INK;
    ctx.font = font(700, 19);
    ctx.fillText(`Order:  ${orderInstruction(line.selected, project.unit)}`, PAD, y + 14);

    ctx.textAlign = "right";
    ctx.font = mono(700, 19);
    ctx.fillText(orderLength(line.selected.purchasedLength, project.unit), WIDTH - PAD, y + 14);
    ctx.textAlign = "left";
    y += 30;
  }

  y += 18;
  ctx.strokeStyle = "#cbd5e1";
  hline(ctx, PAD, y - 0.5, WIDTH - PAD);

  return y;
}

interface Columns {
  label: number;
  qty: number;
  total: number;
  waste: number;
  unit: number;
  cost: number;
}

function columns(config: PurchaseConfig): Columns {
  const right = WIDTH - PAD;
  if (config.showCost) {
    return {
      label: PAD + 30,
      qty: right - 520,
      total: right - 380,
      waste: right - 250,
      unit: right - 130,
      cost: right,
    };
  }
  return {
    label: PAD + 30,
    qty: right - 340,
    total: right - 170,
    waste: right,
    unit: right,
    cost: right,
  };
}

function drawOptionRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  project: Project,
  option: PurchaseOption,
  cols: Columns,
  config: PurchaseConfig,
  selected: boolean,
) {
  if (selected) {
    ctx.fillStyle = BEST_BG;
    ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H);
    ctx.fillStyle = BEST_LINE;
    ctx.fillRect(PAD, y, 4, ROW_H);
  }

  // Selection tick.
  if (selected) {
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(PAD + 12, y + 17);
    ctx.lineTo(PAD + 17, y + 22);
    ctx.lineTo(PAD + 25, y + 11);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  const dim = !option.fits;
  ctx.fillStyle = dim ? "#b91c1c" : INK;
  ctx.font = font(selected ? 700 : 500, 16);
  ctx.fillText(option.label, cols.label, y + 22);

  if (option.recommended) {
    const bx = cols.label + ctx.measureText(option.label).width + 12;
    ctx.font = font(700, 11);
    const badge = "BEST VALUE";
    const badgeWidth = ctx.measureText(badge).width + 18;
    // Only if it fits before the numbers start; the tick already marks the row.
    if (bx + badgeWidth < cols.qty - 90) {
      ctx.fillStyle = "#16a34a";
      roundRect(ctx, bx, y + 8, badgeWidth, 18, 9);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(badge, bx + 9, y + 21);
    }
  }

  ctx.textAlign = "right";
  ctx.fillStyle = dim ? "#b91c1c" : INK;
  ctx.font = mono(selected ? 700 : 500, 16);

  if (!option.fits) {
    ctx.fillText("part too long", cols.total, y + 22);
  } else {
    ctx.fillText(
      option.kind === "cut-to-length" ? "—" : String(option.bars),
      cols.qty,
      y + 22,
    );
    ctx.fillText(orderLength(option.purchasedLength, project.unit), cols.total, y + 22);
    if (config.showWaste) {
      ctx.fillStyle = MUTED;
      ctx.font = mono(500, 15);
      ctx.fillText(`${((1 - option.utilisation) * 100).toFixed(0)}%`, cols.waste, y + 22);
    }
    if (config.showCost) {
      ctx.fillStyle = option.unitCost === null ? "#94a3b8" : INK;
      ctx.font = mono(500, 15);
      const per =
        option.kind === "cut-to-length" ? (project.unit === "metric" ? "/m" : "/ft") : "";
      ctx.fillText(
        option.unitCost === null ? "—" : `${formatMoney(option.unitCost, project.currency)}${per}`,
        cols.unit,
        y + 22,
      );
      ctx.font = mono(selected ? 700 : 500, 16);
      ctx.fillText(
        option.cost === null ? "—" : formatMoney(option.cost, project.currency),
        cols.cost,
        y + 22,
      );
    }
  }
  ctx.textAlign = "left";
}

function drawTotal(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  plan: PurchasePlan,
): number {
  const h = 96;
  ctx.fillStyle = PANEL;
  ctx.fillRect(0, top, WIDTH, h);

  ctx.fillStyle = INK;
  ctx.font = font(700, 22);
  ctx.fillText("Estimated order total", PAD, top + 46);

  ctx.fillStyle = MUTED;
  ctx.font = font(500, 14);
  ctx.fillText(
    plan.fullyPriced
      ? "Every material below has a price. Excludes tax and delivery unless stated."
      : "Some materials are unpriced, so this covers only the ones that are.",
    PAD,
    top + 70,
  );

  ctx.textAlign = "right";
  ctx.fillStyle = ACCENT;
  ctx.font = mono(800, 34);
  ctx.fillText(formatMoney(plan.cost ?? 0, project.currency), WIDTH - PAD, top + 56);
  ctx.textAlign = "left";

  return top + h;
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  top: number,
  project: Project,
  plan: PurchasePlan,
  config: PurchaseConfig,
  slack: number,
): number {
  let y = top + 28;

  // A boxed closing block; it absorbs any spare page height.
  const boxTop = y;
  const lines: string[] = [];
  if (config.note.trim()) lines.push(config.note.trim());
  if (project.notes.trim()) lines.push(project.notes.trim());
  lines.push(
    `Lengths shown are what to purchase, including cutting waste. Finished parts total ${buyLength(plan.netLength, project.unit)}.`,
  );
  lines.push(
    "Where several lengths are listed, any one will yield the parts — the marked row wastes least.",
  );

  const boxHeight = Math.max(112, 46 + lines.length * 24 + Math.max(0, slack));

  ctx.fillStyle = "#f8fafc";
  roundRect(ctx, PAD, boxTop, WIDTH - PAD * 2, boxHeight, 12);
  ctx.fill();
  ctx.strokeStyle = LINE_COLOUR;
  roundRect(ctx, PAD, boxTop, WIDTH - PAD * 2, boxHeight, 12);
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = font(700, 12);
  ctx.fillText("NOTES FOR THE SUPPLIER", PAD + 20, boxTop + 28);

  ctx.font = font(500, 15);
  ctx.fillStyle = INK;
  let ty = boxTop + 56;
  for (const text of lines) {
    ctx.fillText(truncate(ctx, text, WIDTH - PAD * 2 - 40), PAD + 20, ty);
    ty += 24;
  }

  y = boxTop + boxHeight + 24;

  ctx.fillStyle = "#94a3b8";
  ctx.font = font(500, 13);
  const settings = plan.lines
    .slice(0, 4)
    .map((line) => `${line.name}: ${line.selected ? orderInstruction(line.selected, project.unit) : "—"}`)
    .join("   ·   ");
  ctx.fillText(truncate(ctx, settings, WIDTH - PAD * 2), PAD, y + 4);

  return y + 32;
}

/* ----------------------------------------------------------------- helpers */

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

/** Kept for callers that want the raw part length formatting. */
export const partLength = formatValue;
