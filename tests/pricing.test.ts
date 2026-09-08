import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCsv, buildCutListCsv, buildExport } from "../lib/exports.ts";
import {
  STALE_AFTER_DAYS,
  citation,
  confidenceNote,
  costLine,
  costPerBar,
  costProject,
  currentPrice,
  daysSince,
  formatMoney,
} from "../lib/pricing.ts";
import {
  SCHEMA_VERSION,
  SOURCE_LABELS,
  type Material,
  type PriceRecord,
  type Project,
} from "../lib/types.ts";

/* ------------------------------------------------------------------ set-up */

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

function price(overrides: Partial<PriceRecord> = {}): PriceRecord {
  return {
    id: "prc_1",
    amount: 48.5,
    basis: "per-bar",
    stockLength: 240,
    recordedAt: new Date().toISOString(),
    ...overrides,
    source: {
      kind: "quote",
      supplier: "Acme Steel",
      reference: "Q-1234",
      url: "",
      capturedAt: daysAgo(1),
      note: "",
      ...overrides.source,
    },
  };
}

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat_1",
    name: "1x1 tube",
    category: "Steel",
    stockLength: 240,
    kerf: 0.125,
    endTrim: 0,
    notes: "",
    updatedAt: new Date().toISOString(),
    prices: [price()],
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "prj_1",
    name: "Test job",
    client: "",
    reference: "",
    preparedBy: "",
    notes: "",
    unit: "imperial",
    currency: "$",
    mode: "detailed",
    status: "enquiry",
    archived: false,
    contingencyPct: 0,
    markupPct: 0,
    taxPct: 0,
    extras: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lines: [
      {
        id: "ln_1",
        name: "Frames",
        materialId: "mat_1",
        stockLength: 240,
        kerf: 0.125,
        endTrim: 0,
        strategy: "optimized",
        parts: [{ id: "pt_1", label: "leg", length: 100, qty: 6 }],
      },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------ price basics */

test("per-bar pricing scales when the take-off buys a different length", () => {
  const quoted = price({ amount: 48, basis: "per-bar", stockLength: 240 });
  assert.equal(costPerBar(quoted, 240), 48);
  // A 24ft bar at the same rate per inch is 20% more than the quoted 20ft bar.
  assert.equal(round(costPerBar(quoted, 288)), 57.6);
});

test("per-length pricing charges the whole purchased bar, drop included", () => {
  assert.equal(costPerBar(price({ amount: 2, basis: "per-foot" }), 240), 40);
  assert.equal(costPerBar(price({ amount: 0.25, basis: "per-inch" }), 240), 60);
  const perMetre = costPerBar(price({ amount: 10, basis: "per-metre" }), 240);
  assert.equal(perMetre.toFixed(4), ((240 * 25.4) / 1000 * 10).toFixed(4));
});

test("currentPrice takes the newest record and tolerates an empty hoard", () => {
  const newest = price({ id: "prc_new", amount: 60 });
  const older = price({ id: "prc_old", amount: 40 });
  assert.equal(currentPrice(material({ prices: [newest, older] }))?.id, "prc_new");
  assert.equal(currentPrice(material({ prices: [] })), null);
  assert.equal(currentPrice(null), null);
});

/* ------------------------------------------------------------ line costing */

test("a line costs bars needed times the cost of one bar", () => {
  const entry = costLine(project().lines[0], [material()]);
  // Two 100in cuts per 240in bar -> three bars.
  assert.equal(entry.result.totals.barsNeeded, 3);
  assert.equal(entry.barCost, 48.5);
  assert.equal(entry.cost, 145.5);
  assert.equal(entry.confidence, "firm");
  assert.equal(entry.stale, false);
});

test("a line with no material is counted but not costed", () => {
  const line = { ...project().lines[0], materialId: null };
  const entry = costLine(line, []);
  assert.equal(entry.result.totals.barsNeeded, 3);
  assert.equal(entry.cost, 0);
  assert.equal(entry.price, null);
  assert.equal(entry.confidence, "unpriced");
});

test("a price older than the staleness window is flagged", () => {
  const old = material({ prices: [price({ source: { capturedAt: daysAgo(STALE_AFTER_DAYS + 5) } as never })] });
  const entry = costLine(project().lines[0], [old]);
  assert.equal(entry.stale, true);
  assert.ok(entry.priceAgeDays >= STALE_AFTER_DAYS);
});

test("daysSince handles today, the past and rubbish input", () => {
  assert.equal(daysSince(new Date().toISOString()), 0);
  assert.equal(daysSince(daysAgo(10)), 10);
  assert.equal(daysSince("not a date"), Number.POSITIVE_INFINITY);
});

/* --------------------------------------------------------- project roll-up */

test("roll-up applies contingency, then markup, then tax in that order", () => {
  const cost = costProject(
    project({ contingencyPct: 10, markupPct: 20, taxPct: 5 }),
    [material()],
  );

  assert.equal(cost.materials, 145.5);
  assert.equal(round(cost.contingency), 14.55); // 10% of materials
  assert.equal(round(cost.markup), 32.01); // 20% of (145.50 + 14.55)
  assert.equal(round(cost.subtotal), 192.06);
  assert.equal(round(cost.tax), 9.6); // 5% of subtotal
  assert.equal(round(cost.total), 201.66);
});

test("extras are added before contingency and markup", () => {
  const cost = costProject(
    project({
      markupPct: 10,
      extras: [{ id: "ex_1", description: "Powder coat", qty: 2, unitCost: 25 }],
    }),
    [material()],
  );
  assert.equal(cost.extras, 50);
  assert.equal(round(cost.markup), 19.55); // 10% of (145.50 + 50)
  assert.equal(round(cost.total), 215.05);
});

test("quick mode costs only the first line and ignores extras and markup", () => {
  const twoLines = project({
    mode: "quick",
    markupPct: 50,
    extras: [{ id: "ex_1", description: "x", qty: 1, unitCost: 100 }],
    lines: [
      project().lines[0],
      { ...project().lines[0], id: "ln_2", parts: [{ id: "pt_2", label: "b", length: 200, qty: 4 }] },
    ],
  });
  const cost = costProject(twoLines, [material()]);

  assert.equal(cost.lines.length, 1);
  assert.equal(cost.extras, 0);
  assert.equal(cost.markup, 0);
  assert.equal(cost.total, 145.5);
});

test("project confidence falls to the weakest priced line", () => {
  const firm = material();
  const guessed = material({
    id: "mat_2",
    prices: [price({ id: "prc_2", source: { kind: "estimate" } as never })],
  });
  const twoLines = project({
    lines: [
      project().lines[0],
      { ...project().lines[0], id: "ln_2", materialId: "mat_2" },
    ],
  });

  const cost = costProject(twoLines, [firm, guessed]);
  assert.equal(cost.confidence, "assumed");
  assert.match(confidenceNote(cost), /Budget estimate/);
});

test("an empty line does not drag the confidence rating down", () => {
  const withEmpty = project({
    lines: [
      project().lines[0],
      { ...project().lines[0], id: "ln_2", materialId: null, parts: [] },
    ],
  });
  const cost = costProject(withEmpty, [material()]);
  assert.equal(cost.confidence, "firm");
  assert.equal(cost.unpricedLines, 0);
});

test("unpriced and stale lines are counted for the pre-send warnings", () => {
  const stale = material({
    id: "mat_2",
    prices: [price({ id: "p2", source: { capturedAt: daysAgo(200) } as never })],
  });
  const p = project({
    lines: [
      { ...project().lines[0], id: "ln_1", materialId: null },
      { ...project().lines[0], id: "ln_2", materialId: "mat_2" },
    ],
  });
  const cost = costProject(p, [stale]);
  assert.equal(cost.unpricedLines, 1);
  assert.equal(cost.staleLines, 1);
});

test("an empty project produces zeroed totals rather than NaN", () => {
  const cost = costProject(project({ lines: [] }), []);
  assert.equal(cost.total, 0);
  assert.equal(cost.utilisation, 0);
  assert.equal(cost.confidence, "unpriced");
  assert.match(confidenceNote(cost), /Quantities only/);
});

/* --------------------------------------------------------------- reporting */

test("a citation names the source, supplier, reference and date", () => {
  const text = citation(price(), SOURCE_LABELS);
  assert.match(text, /Written quote/);
  assert.match(text, /Acme Steel/);
  assert.match(text, /Q-1234/);
  assert.equal(citation(null, SOURCE_LABELS), "No price on record");
});

test("money formatting always shows two decimals and keeps the sign", () => {
  assert.equal(formatMoney(1234.5, "$"), "$1,234.50");
  assert.equal(formatMoney(-20, "£"), "-£20.00");
  assert.equal(formatMoney(0, "$"), "$0.00");
});

/* ----------------------------------------------------------------- exports */

test("the JSON export carries the totals and the price provenance", () => {
  const p = project();
  const cost = costProject(p, [material()]);
  const payload = buildExport(p, cost);

  assert.equal(payload.format, "kerf.takeoff");
  assert.equal(payload.version, 1);
  assert.equal(payload.totals.bars, 3);
  assert.equal(payload.totals.total, 145.5);
  assert.equal(payload.lines.length, 1);
  assert.equal(payload.lines[0].material, "1x1 tube");
  assert.equal(payload.lines[0].price?.supplier, "Acme Steel");
  assert.equal(payload.lines[0].price?.reference, "Q-1234");
  assert.equal(payload.lines[0].parts[0].qty, 6);
  // Round-trips through JSON without loss.
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
});

test("the cost CSV quotes cells containing commas and ends with a total", () => {
  const p = project({ name: "Job, with comma" });
  p.lines[0].name = 'He said "go"';
  const csv = buildCsv(p, costProject(p, [material()]));

  assert.match(csv, /"He said ""go"""/);
  assert.match(csv, /TOTAL,145\.50/);
  assert.match(csv, /Acme Steel/);
});

test("the cut list CSV has one row per cut", () => {
  const p = project();
  const cost = costProject(p, [material()]);
  const rows = buildCutListCsv(p, cost).split("\r\n");
  // Header plus one row for each of the six pieces.
  assert.equal(rows.length, 7);
  assert.match(rows[0], /^Line,Material,Bar #,Cut #,Part/);
});

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
