/**
 * Domain model for a take-off.
 *
 * A Project holds one or more take-off Lines. Each Line is one material with
 * its own stock length, saw settings and cut list, so a job that needs three
 * different profiles is three Lines under one Project.
 *
 * Prices live separately in the material library and are referenced
 * by id, so re-pricing a material updates every take-off that uses it — and
 * every price carries the evidence it came from.
 */

import type { UnitSystem } from "./units";

export const SCHEMA_VERSION = 3;

/**
 * How pieces are assigned to bars.
 * `optimized` back-fills earlier bars (first-fit); `sequential` reproduces the
 * source workbook's one-bar-at-a-time pack.
 */
export type Strategy = "optimized" | "sequential";

/* --------------------------------------------------------------- materials */

/** Where a price came from. This is the "proof" attached to every number. */
export type SourceKind =
  | "quote"
  | "invoice"
  | "website"
  | "phone"
  | "counter"
  | "catalogue"
  | "estimate";

export const SOURCE_LABELS: Record<SourceKind, string> = {
  quote: "Written quote",
  invoice: "Past invoice",
  website: "Supplier website",
  phone: "Phone call",
  counter: "Trade counter",
  catalogue: "Price list / catalogue",
  estimate: "Own estimate",
};

/** How firm a price is — drives the confidence badge on the report. */
export const SOURCE_CONFIDENCE: Record<SourceKind, "firm" | "indicative" | "assumed"> = {
  quote: "firm",
  invoice: "firm",
  website: "indicative",
  phone: "indicative",
  counter: "indicative",
  catalogue: "indicative",
  estimate: "assumed",
};

export interface PriceSource {
  kind: SourceKind;
  /** Who gave the price. */
  supplier: string;
  /** Quote number, invoice number, SKU — whatever makes it findable again. */
  reference: string;
  /** Link to the quote, product page or PDF. */
  url: string;
  /** ISO date the price was captured (not today's date). */
  capturedAt: string;
  note: string;
  /** IndexedDB key for a photo/scan of the quote, if one was attached. */
  attachmentId?: string;
  /** Original file name of that attachment, for display. */
  attachmentName?: string;
}

export type PriceBasis = "per-bar" | "per-foot" | "per-metre" | "per-inch";

export const BASIS_LABELS: Record<PriceBasis, string> = {
  "per-bar": "per bar",
  "per-foot": "per foot",
  "per-metre": "per metre",
  "per-inch": "per inch",
};

export interface PriceRecord {
  id: string;
  /** Money, in the project currency. */
  amount: number;
  basis: PriceBasis;
  /**
   * The bar length this price refers to, in inches. Only meaningful for
   * `per-bar`; kept so a "$48 per 20ft length" price stays unambiguous.
   */
  stockLength: number;
  source: PriceSource;
  /** ISO timestamp the record was entered. */
  recordedAt: string;
}

export interface Material {
  id: string;
  /** e.g. `1" x 1" x 16ga square tube`. */
  name: string;
  /** Free grouping: Steel, Aluminium, Timber… */
  category: string;
  /** Default purchased length, in inches. */
  stockLength: number;
  /** Default blade kerf, in inches. */
  kerf: number;
  /** Default end trim per bar, in inches. */
  endTrim: number;
  /** Newest first; `prices[0]` is the price in force. */
  prices: PriceRecord[];
  notes: string;
  updatedAt: string;
}

/* ---------------------------------------------------------------- take-off */

export interface Part {
  id: string;
  label: string;
  /** Finished length in inches. */
  length: number;
  qty: number;
}

export interface TakeoffLine {
  id: string;
  /** What this run of material is for: "Frame uprights", "Handrail". */
  name: string;
  /** Null while the line is still un-priced. */
  materialId: string | null;
  /** Copied from the material when it is picked, then editable per line. */
  stockLength: number;
  kerf: number;
  endTrim: number;
  strategy: Strategy;
  parts: Part[];
}

/** A cost that is not cut from stock: labour, fasteners, finishing, delivery. */
export interface Extra {
  id: string;
  description: string;
  qty: number;
  unitCost: number;
}

export type Mode = "quick" | "detailed";

/**
 * Where a job has got to. Drives the Jobs list, so old work can be parked
 * without being deleted and a live enquiry is never mixed in with a finished
 * one.
 */
export type JobStatus = "enquiry" | "quoted" | "won" | "ordered" | "done";

export const STATUS_LABELS: Record<JobStatus, string> = {
  enquiry: "Enquiry",
  quoted: "Quoted",
  won: "Won",
  ordered: "Ordered",
  done: "Done",
};

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  client: string;
  /** Job number / drawing reference. */
  reference: string;
  preparedBy: string;
  notes: string;
  unit: UnitSystem;
  currency: string;
  mode: Mode;
  lines: TakeoffLine[];
  extras: Extra[];
  /** Percentages, 0-100. */
  contingencyPct: number;
  markupPct: number;
  taxPct: number;
  status: JobStatus;
  /** Parked jobs stay in the library but drop out of the default list. */
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ library */

/**
 * Everything the app owns, in one object. This is the unit that syncs between
 * a phone and a PC: jobs, the material library, and tombstones so a delete on
 * one device does not come back from the other.
 */
export interface Library {
  schemaVersion: typeof SCHEMA_VERSION;
  projects: Project[];
  materials: Material[];
  /** Ids deleted on some device, with when — so a merge honours the delete. */
  tombstones: Tombstone[];
  activeId: string | null;
  updatedAt: string;
}

export interface Tombstone {
  id: string;
  kind: "project" | "material";
  at: string;
}

/* ----------------------------------------------------------------- helpers */

let counter = 0;
export const newId = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export const nowIso = () => new Date().toISOString();
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function emptyPart(): Part {
  return { id: newId("pt"), label: "", length: 0, qty: 1 };
}

export function emptyLine(defaults?: Partial<TakeoffLine>): TakeoffLine {
  return {
    id: newId("ln"),
    name: "",
    materialId: null,
    stockLength: 240,
    kerf: 0.125,
    endTrim: 0,
    strategy: "optimized",
    parts: [emptyPart()],
    ...defaults,
  };
}

export function emptyMaterial(): Material {
  return {
    id: newId("mat"),
    name: "",
    category: "",
    stockLength: 240,
    kerf: 0.125,
    endTrim: 0,
    prices: [],
    notes: "",
    updatedAt: nowIso(),
  };
}

export function emptyPriceSource(): PriceSource {
  return {
    kind: "quote",
    supplier: "",
    reference: "",
    url: "",
    capturedAt: todayIso(),
    note: "",
  };
}
