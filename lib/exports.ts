/**
 * Machine-readable exports.
 *
 * The JSON shape is versioned and deliberately flat so another system — a
 * project tracker, an ERP, a spreadsheet — can consume a take-off without
 * knowing anything about this app's internals. Every priced row carries its
 * source, so the receiving system inherits the evidence rather than a bare
 * number.
 */

import { extraCost, formatDate, type ProjectCost } from "./pricing";
import { SOURCE_LABELS, type Project } from "./types";
import { formatValue, unitAbbr } from "./units";

export const EXPORT_FORMAT = "kerf.takeoff";
export const EXPORT_VERSION = 1;

export interface TakeoffExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  project: {
    id: string;
    name: string;
    client: string;
    reference: string;
    preparedBy: string;
    notes: string;
    mode: Project["mode"];
    unit: Project["unit"];
    currency: string;
  };
  totals: {
    bars: number;
    pieces: number;
    utilisation: number;
    materials: number;
    extras: number;
    contingency: number;
    markup: number;
    subtotal: number;
    tax: number;
    total: number;
    confidence: ProjectCost["confidence"];
  };
  lines: Array<{
    id: string;
    name: string;
    material: string;
    /** Lengths are exported in inches, the app's internal unit. */
    stockLengthIn: number;
    kerfIn: number;
    endTrimIn: number;
    barsNeeded: number;
    pieces: number;
    netLengthIn: number;
    dropIn: number;
    utilisation: number;
    unitPrice: number | null;
    priceBasis: string | null;
    barCost: number;
    cost: number;
    price: {
      supplier: string;
      kind: string;
      reference: string;
      url: string;
      capturedAt: string;
      note: string;
      hasAttachment: boolean;
    } | null;
    parts: Array<{ label: string; lengthIn: number; qty: number }>;
  }>;
  extras: Array<{ description: string; qty: number; unitCost: number; cost: number }>;
}

export function buildExport(project: Project, cost: ProjectCost): TakeoffExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      client: project.client,
      reference: project.reference,
      preparedBy: project.preparedBy,
      notes: project.notes,
      mode: project.mode,
      unit: project.unit,
      currency: project.currency,
    },
    totals: {
      bars: cost.totalBars,
      pieces: cost.totalPieces,
      utilisation: round(cost.utilisation, 4),
      materials: round(cost.materials),
      extras: round(cost.extras),
      contingency: round(cost.contingency),
      markup: round(cost.markup),
      subtotal: round(cost.subtotal),
      tax: round(cost.tax),
      total: round(cost.total),
      confidence: cost.confidence,
    },
    lines: cost.lines.map((entry) => ({
      id: entry.line.id,
      name: entry.line.name,
      material: entry.material?.name ?? "",
      stockLengthIn: entry.line.stockLength,
      kerfIn: entry.line.kerf,
      endTrimIn: entry.line.endTrim,
      barsNeeded: entry.result.totals.barsNeeded,
      pieces: entry.result.totals.pieces,
      netLengthIn: round(entry.result.totals.netLength, 4),
      dropIn: round(entry.result.totals.dropLoss, 4),
      utilisation: round(entry.result.totals.utilisation, 4),
      unitPrice: entry.price ? entry.price.amount : null,
      priceBasis: entry.price ? entry.price.basis : null,
      barCost: round(entry.barCost),
      cost: round(entry.cost),
      price: entry.price
        ? {
            supplier: entry.price.source.supplier,
            kind: entry.price.source.kind,
            reference: entry.price.source.reference,
            url: entry.price.source.url,
            capturedAt: entry.price.source.capturedAt,
            note: entry.price.source.note,
            hasAttachment: Boolean(entry.price.source.attachmentId),
          }
        : null,
      parts: entry.line.parts
        .filter((part) => part.length > 0 && part.qty > 0)
        .map((part) => ({ label: part.label, lengthIn: part.length, qty: part.qty })),
    })),
    extras: project.extras.map((extra) => ({
      description: extra.description,
      qty: extra.qty,
      unitCost: round(extra.unitCost),
      cost: round(extraCost(extra)),
    })),
  };
}

/**
 * A purchase-order style CSV: one row per material line, with the evidence
 * columns a buyer would want before raising the order.
 */
export function buildCsv(project: Project, cost: ProjectCost): string {
  const u = unitAbbr(project.unit);
  const rows: string[][] = [
    [
      "Line",
      "Material",
      `Stock length (${u})`,
      "Bars to buy",
      "Pieces",
      `Net length (${u})`,
      `Drop (${u})`,
      "Utilisation",
      "Unit price",
      "Price basis",
      "Cost per bar",
      "Line cost",
      "Price source",
      "Supplier",
      "Reference",
      "Priced on",
      "Proof attached",
    ],
  ];

  for (const entry of cost.lines) {
    const t = entry.result.totals;
    rows.push([
      entry.line.name,
      entry.material?.name ?? "(no material)",
      formatValue(entry.line.stockLength, project.unit),
      String(t.barsNeeded),
      String(t.pieces),
      formatValue(t.netLength, project.unit),
      formatValue(t.dropLoss, project.unit),
      `${(t.utilisation * 100).toFixed(1)}%`,
      entry.price ? entry.price.amount.toFixed(2) : "",
      entry.price ? entry.price.basis : "",
      entry.price ? entry.barCost.toFixed(2) : "",
      entry.price ? entry.cost.toFixed(2) : "",
      entry.price ? SOURCE_LABELS[entry.price.source.kind] : "Not priced",
      entry.price?.source.supplier ?? "",
      entry.price?.source.reference ?? "",
      entry.price ? formatDate(entry.price.source.capturedAt) : "",
      entry.price?.source.attachmentId ? "Yes" : "No",
    ]);
  }

  for (const extra of project.extras) {
    rows.push([
      extra.description || "Extra",
      "(non-stock)",
      "",
      "",
      String(extra.qty),
      "",
      "",
      "",
      extra.unitCost.toFixed(2),
      "each",
      "",
      extraCost(extra).toFixed(2),
      "Entered by hand",
      "",
      "",
      "",
      "No",
    ]);
  }

  const money = (label: string, value: number) =>
    rows.push(["", "", "", "", "", "", "", "", "", "", label, value.toFixed(2), "", "", "", "", ""]);

  rows.push([]);
  money("Materials", cost.materials);
  if (cost.extras) money("Extras", cost.extras);
  if (cost.contingency) money(`Contingency ${project.contingencyPct}%`, cost.contingency);
  if (cost.markup) money(`Markup ${project.markupPct}%`, cost.markup);
  if (cost.tax) money(`Tax ${project.taxPct}%`, cost.tax);
  money("TOTAL", cost.total);

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** A cut list a saw operator can read: one row per cut, grouped by line. */
export function buildCutListCsv(project: Project, cost: ProjectCost): string {
  const u = unitAbbr(project.unit);
  const rows: string[][] = [["Line", "Material", "Bar #", "Cut #", "Part", `Length (${u})`]];

  for (const entry of cost.lines) {
    for (const bar of entry.result.bars) {
      bar.pieces.forEach((piece, index) => {
        rows.push([
          entry.line.name,
          entry.material?.name ?? "",
          String(bar.index),
          String(index + 1),
          piece.label,
          formatValue(piece.length, project.unit),
        ]);
      });
    }
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value: string): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function round(value: number, dp = 2): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "takeoff"
  );
}

/** Trigger a browser download for generated text. */
export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
