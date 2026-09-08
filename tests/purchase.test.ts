import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPurchaseCsv } from "../lib/exports.ts";
import { costProject } from "../lib/pricing.ts";
import {
  BY_FOOT_ID,
  buildPurchasePlan,
  buyLength,
  defaultCandidates,
  defaultConfig,
  optionId,
  orderInstruction,
  orderLength,
  type PurchaseConfig,
} from "../lib/purchase.ts";
import { SCHEMA_VERSION, type Material, type PriceRecord, type Project } from "../lib/types.ts";

/* ------------------------------------------------------------------ set-up */

function price(overrides: Partial<PriceRecord> = {}): PriceRecord {
  return {
    id: "prc_1",
    amount: 48,
    basis: "per-bar",
    stockLength: 240,
    recordedAt: new Date().toISOString(),
    ...overrides,
    source: {
      kind: "quote",
      supplier: "Acme",
      reference: "Q-1",
      url: "",
      capturedAt: new Date().toISOString().slice(0, 10),
      note: "",
      ...overrides.source,
    },
  };
}

const material: Material = {
  id: "mat_1",
  name: "1x1 tube",
  category: "Steel",
  stockLength: 240,
  kerf: 0.125,
  endTrim: 0,
  notes: "",
  updatedAt: new Date().toISOString(),
  prices: [price()],
};

function project(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "prj_1",
    name: "Test",
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
        // Six 100in legs: 2 per 240in bar, but 1 per 120in bar.
        parts: [{ id: "pt_1", label: "leg", length: 100, qty: 6 }],
      },
    ],
    ...overrides,
  };
}

function planFor(p: Project, tweak: Partial<PurchaseConfig> = {}) {
  const cost = costProject(p, [material]);
  const config = { ...defaultConfig(p, cost), ...tweak };
  return { plan: buildPurchasePlan(p, cost, config), config, cost };
}

/* --------------------------------------------------------------- candidates */

test("the job's own stock length is always offered", () => {
  const p = project({ lines: [{ ...project().lines[0], stockLength: 199 }] });
  assert.ok(defaultCandidates(p).some((c) => Math.abs(c - 199) < 1e-6));
});

test("candidates are sorted and free of duplicates", () => {
  const list = defaultCandidates(project());
  assert.deepEqual(list, [...list].sort((a, b) => a - b));
  assert.equal(list.length, new Set(list).size);
});

/* ----------------------------------------------------------- option maths */

test("each length option re-packs the same parts", () => {
  const { plan } = planFor(project());
  const options = plan.lines[0].options;

  const at240 = options.find((o) => o.id === optionId(240));
  const at120 = options.find((o) => o.id === optionId(120));
  assert.ok(at240 && at120);

  // Two 100in legs fit a 240in bar; only one fits a 120in bar.
  assert.equal(at240.bars, 3);
  assert.equal(at120.bars, 6);
  assert.equal(at240.purchasedLength, 720);
  assert.equal(at120.purchasedLength, 720);
});

test("an option that cannot yield a part is marked, not silently dropped", () => {
  const p = project({
    lines: [{ ...project().lines[0], parts: [{ id: "pt", label: "long", length: 150, qty: 2 }] }],
  });
  const { plan } = planFor(p);
  const at96 = plan.lines[0].options.find((o) => o.id === optionId(96));
  const at240 = plan.lines[0].options.find((o) => o.id === optionId(240));

  assert.ok(at96 && at240);
  assert.equal(at96.fits, false, "a 150in part cannot come out of a 96in bar");
  assert.equal(at240.fits, true);

  // Whichever length wins, it must be one that can actually yield the part.
  const best = plan.lines[0].options.find((o) => o.recommended);
  assert.ok(best?.fits, "an unusable length must never be recommended");
  // 192in is the leanest here: one part per bar, least material bought.
  assert.equal(best.id, optionId(192));
});

test("the recommendation goes to the least material bought when unpriced", () => {
  const p = project();
  const cost = costProject(p, []); // no material -> no price
  const config = defaultConfig(p, cost);
  const plan = buildPurchasePlan(p, cost, config);
  const best = plan.lines[0].options.find((o) => o.recommended);
  assert.ok(best);
  const cheapestLength = Math.min(
    ...plan.lines[0].options.filter((o) => o.fits).map((o) => o.purchasedLength),
  );
  assert.equal(best.purchasedLength, cheapestLength);
});

test("the recommendation follows cost once every option is priced", () => {
  // Priced per foot, so every length costs the same per inch; the tie then
  // breaks on least material bought.
  const perFoot: Material = { ...material, prices: [price({ amount: 2, basis: "per-foot" })] };
  const p = project();
  const cost = costProject(p, [perFoot]);
  const config = defaultConfig(p, cost);
  const plan = buildPurchasePlan(p, cost, config);

  const best = plan.lines[0].options.find((o) => o.recommended);
  assert.ok(best);
  const costs = plan.lines[0].options.filter((o) => o.fits).map((o) => o.cost ?? Infinity);
  assert.equal(best.cost, Math.min(...costs));
});

test("only one option per material is ever recommended", () => {
  const { plan } = planFor(project());
  assert.equal(plan.lines[0].options.filter((o) => o.recommended).length, 1);
});

/* ------------------------------------------------------------ manual prices */

test("a price typed per foot costs the whole bar, drop included", () => {
  const { plan } = planFor(project(), {
    prices: { ln_1: { amount: 2, basis: "per-foot" } },
  });
  const at240 = plan.lines[0].options.find((o) => o.id === optionId(240));
  assert.ok(at240);
  // 20ft bar at $2/ft = $40 each, three of them.
  assert.equal(at240.unitCost, 40);
  assert.equal(at240.cost, 120);
});

test("a price typed per bar scales to the length being compared", () => {
  const { plan } = planFor(project(), {
    prices: { ln_1: { amount: 48, basis: "per-bar" } },
  });
  const at240 = plan.lines[0].options.find((o) => o.id === optionId(240));
  const at120 = plan.lines[0].options.find((o) => o.id === optionId(120));
  assert.ok(at240 && at120);
  assert.equal(at240.unitCost, 48);
  assert.equal(at120.unitCost, 24, "half the bar should be half the price");
});

test("a typed price overrides the saved library price", () => {
  const { plan } = planFor(project(), {
    prices: { ln_1: { amount: 1, basis: "per-foot" } },
  });
  const at240 = plan.lines[0].options.find((o) => o.id === optionId(240));
  assert.equal(at240?.unitCost, 20, "should use the typed $1/ft, not the saved $48/bar");
});

/* ------------------------------------------------------------ cut to length */

test("cut to length buys the parts plus blade, rounded up to a whole foot", () => {
  const { plan } = planFor(project(), { includeByFoot: true });
  const byFoot = plan.lines[0].options.find((o) => o.id === BY_FOOT_ID);
  assert.ok(byFoot);
  // 6 x 100in = 600in of parts, plus 6 x 1/8in blade = 600.75in -> 51ft.
  assert.equal(byFoot.purchasedLength, 612);
  assert.equal(byFoot.bars, 0);
  assert.equal(orderLength(byFoot.purchasedLength, "imperial"), "51 ft");
});

test("cut to length is absent unless it is switched on", () => {
  const { plan } = planFor(project());
  assert.equal(plan.lines[0].options.some((o) => o.id === BY_FOOT_ID), false);
});

/* ------------------------------------------------------------------- plan */

test("the plan totals only what is actually selected", () => {
  const { plan } = planFor(project(), { selections: { ln_1: optionId(120) } });
  assert.equal(plan.lines[0].selected?.id, optionId(120));
  assert.equal(plan.totalBars, 6);
  assert.equal(plan.purchasedLength, 720);
});

test("an unknown selection falls back to the recommendation", () => {
  const { plan } = planFor(project(), { selections: { ln_1: "nonsense" } });
  assert.ok(plan.lines[0].selected?.recommended);
});

test("materials with nothing to cut are left off the list", () => {
  const p = project({
    lines: [
      project().lines[0],
      { ...project().lines[0], id: "ln_2", name: "Empty", parts: [] },
    ],
  });
  const { plan } = planFor(p);
  assert.equal(plan.lines.length, 1);
  assert.equal(plan.lines[0].lineId, "ln_1");
});

test("the plan reports a selection that cannot be cut", () => {
  const p = project({
    lines: [{ ...project().lines[0], parts: [{ id: "pt", label: "long", length: 150, qty: 1 }] }],
  });
  const { plan } = planFor(p, { selections: { ln_1: optionId(96) } });
  assert.equal(plan.impossible.length, 1);
});

/* --------------------------------------------------------------- display */

test("lengths are presented the way a buyer asks for them", () => {
  assert.equal(buyLength(240, "imperial"), "20 ft");
  assert.equal(orderLength(241, "imperial"), "21 ft", "part feet round up to order");
  assert.equal(buyLength(1000 / 25.4, "metric"), "1 m");
});

test("the order instruction reads as an instruction", () => {
  const { plan } = planFor(project(), { selections: { ln_1: optionId(240) } });
  assert.equal(orderInstruction(plan.lines[0].selected!, "imperial"), "3 × 20 ft");

  const { plan: cut } = planFor(project(), {
    includeByFoot: true,
    selections: { ln_1: BY_FOOT_ID },
  });
  assert.equal(orderInstruction(cut.lines[0].selected!, "imperial"), "51 ft cut to length");
});

/* ------------------------------------------------------------------- csv */

test("the purchase CSV marks the chosen row and lists the alternatives", () => {
  const { plan, config } = planFor(project(), { selections: { ln_1: optionId(240) } });
  const csv = buildPurchaseCsv(project(), plan, config);

  assert.match(csv, /^Material,Ordering,Buy as/);
  assert.match(csv, /ORDER THIS/);
  assert.match(csv, /alternative|best value/);
  assert.match(csv, /TOTAL TO BUY/);
  assert.match(csv, /60 ft/);
});

test("a note reaches the CSV and survives commas", () => {
  const { plan, config } = planFor(project(), { note: 'Deliver Thursday, "back gate"' });
  const csv = buildPurchaseCsv(project(), plan, config);
  assert.match(csv, /"Deliver Thursday, ""back gate"""/);
});

test("cut to length is quoted per foot, matching what was typed", () => {
  const { plan } = planFor(project(), {
    includeByFoot: true,
    prices: { ln_1: { amount: 3.25, basis: "per-foot" } },
  });
  const byFoot = plan.lines[0].options.find((o) => o.id === BY_FOOT_ID);
  assert.ok(byFoot);
  assert.equal(byFoot.unitCost, 3.25, "the unit price must read back as typed, not per inch");
  // 612in = 51ft at $3.25.
  assert.equal(Math.round((byFoot.cost ?? 0) * 100) / 100, 165.75);
});

test("a bar option quoted per foot shows the price of one whole bar", () => {
  const { plan } = planFor(project(), { prices: { ln_1: { amount: 3.25, basis: "per-foot" } } });
  const at240 = plan.lines[0].options.find((o) => o.id === optionId(240));
  assert.equal(at240?.unitCost, 65, "a 20ft bar at $3.25/ft is $65");
});
