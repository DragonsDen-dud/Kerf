import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GLOSSARY,
  explainBarCost,
  explainBarFill,
  explainKerf,
  explainLineCost,
  explainPacking,
  explainRollup,
  explainUsableLength,
  explainWaste,
} from "../lib/explain.ts";
import { costLine, costProject } from "../lib/pricing.ts";
import { SCHEMA_VERSION, type Material, type PriceRecord, type Project } from "../lib/types.ts";

/* ------------------------------------------------------------------ set-up */

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
        parts: [{ id: "pt_1", label: "leg", length: 100, qty: 6 }],
      },
    ],
    ...overrides,
  };
}

const entry = () => costLine(project().lines[0], [material]);

/* -------------------------------------------------------------- the shapes */

test("every explanation is fully populated", () => {
  const e = entry();
  const steps = [
    explainUsableLength(e, "imperial"),
    explainKerf(e, "imperial"),
    explainPacking(e, "imperial"),
    explainLineCost(e, "$"),
    explainBarCost(price(), 240, "imperial", "$"),
    explainBarFill([100, 100], 0.125, 240, "imperial"),
    ...explainWaste(costProject(project(), [material]), "imperial"),
    ...explainRollup(project({ markupPct: 10 }), costProject(project({ markupPct: 10 }), [material])),
  ];

  for (const step of steps) {
    assert.ok(step.label.length > 0, "every step needs a label");
    assert.ok(step.formula.length > 0, `"${step.label}" needs a formula`);
    assert.ok(step.result.length > 0, `"${step.label}" needs a result`);
    // Nothing should leak an undefined or NaN into text a user reads.
    for (const text of [step.label, step.formula, step.result, step.note ?? ""]) {
      assert.ok(!/undefined|NaN|\[object/.test(text), `bad text in "${step.label}": ${text}`);
    }
  }
});

/* ------------------------------------------------------- the numbers match */

test("usable length explanation subtracts the end trim", () => {
  const line = { ...project().lines[0], endTrim: 1 };
  const step = explainUsableLength(costLine(line, [material]), "imperial");
  assert.match(step.formula, /240 in bar − 1 in end trim/);
  assert.equal(step.result, "239 in");
});

test("kerf explanation matches the engine's blade loss", () => {
  const e = entry();
  const step = explainKerf(e, "imperial");
  assert.match(step.formula, /6 pieces × 1\/8 in/);
  assert.equal(step.result, "3/4 in");
  assert.equal(step.result, `${(6 * 0.125).toString() === "0.75" ? "3/4" : ""} in`);
});

test("packing explanation reports the bar count the engine produced", () => {
  const e = entry();
  const step = explainPacking(e, "imperial");
  assert.equal(step.result, "3 bars");
  assert.match(step.note ?? "", /Longest first|longest first/);
});

test("the sequential strategy is explained differently from optimised", () => {
  const optimised = explainPacking(entry(), "imperial");
  const sequential = explainPacking(
    costLine({ ...project().lines[0], strategy: "sequential" }, [material]),
    "imperial",
  );
  assert.notEqual(optimised.note, sequential.note);
  assert.match(sequential.note ?? "", /one bar at a time|spreadsheet/);
});

test("bar cost explanation scales a quote given for a different length", () => {
  const same = explainBarCost(price({ stockLength: 240 }), 240, "imperial", "$");
  assert.equal(same.result, "$48.50");
  assert.match(same.note ?? "", /as-is/);

  const scaled = explainBarCost(price({ stockLength: 240 }), 288, "imperial", "$");
  assert.equal(scaled.result, "$58.20");
  assert.match(scaled.note ?? "", /scaled/);
});

test("per-foot pricing explains that the whole bar is charged", () => {
  const step = explainBarCost(price({ amount: 2, basis: "per-foot" }), 240, "imperial", "$");
  assert.equal(step.result, "$40.00");
  assert.match(step.note ?? "", /whole bar/);
});

test("line cost explanation equals bars times bar cost", () => {
  const e = entry();
  const step = explainLineCost(e, "$");
  assert.match(step.formula, /3 bars × \$48\.50 per bar/);
  assert.equal(step.result, "$145.50");
});

test("bar fill explanation adds pieces plus blade and reports the drop", () => {
  const step = explainBarFill([100, 100], 0.125, 240, "imperial");
  assert.match(step.formula, /100 \+ 100 = 200 in/);
  assert.match(step.formula, /2 × 1\/8 in blade = 1\/4 in/);
  assert.match(step.result, /200 1\/4 in of 240 in/);
  assert.match(step.note ?? "", /39 3\/4 in/);
});

test("a long piece list is summarised rather than listed in full", () => {
  const step = explainBarFill([10, 10, 10, 10, 10, 10, 10], 0.125, 240, "imperial");
  assert.match(step.formula, /7 pieces/);
});

test("waste explanation reconciles: parts + blade + trim + drop = bought", () => {
  const cost = costProject(project({ lines: [{ ...project().lines[0], endTrim: 1 }] }), [material]);
  const steps = explainWaste(cost, "imperial");
  const bought = steps.find((s) => s.label === "Material bought");
  const utilisation = steps.find((s) => s.label === "Utilisation");

  assert.ok(bought && utilisation);
  const t = cost.lines[0].result.totals;
  assert.equal(
    Math.round((t.netLength + t.kerfLoss + t.trimLoss + t.dropLoss) * 1000) / 1000,
    Math.round(t.purchased * 1000) / 1000,
  );
  assert.match(utilisation.result, /%$/);
});

test("rollup explanation lists the steps in the order they are applied", () => {
  const p = project({ contingencyPct: 10, markupPct: 20, taxPct: 5 });
  const steps = explainRollup(p, costProject(p, [material]));
  const labels = steps.map((s) => s.label);

  assert.equal(labels[0], "Materials");
  assert.ok(labels.indexOf("Contingency at 10%") < labels.indexOf("Markup at 20%"));
  assert.ok(labels.indexOf("Markup at 20%") < labels.indexOf("Tax at 5%"));
  assert.equal(labels[labels.length - 1], "Total");
  assert.equal(steps[steps.length - 1].result, "$201.66");
});

test("rollup hides steps that are switched off", () => {
  const steps = explainRollup(project(), costProject(project(), [material]));
  const labels = steps.map((s) => s.label);
  assert.deepEqual(labels, ["Materials", "Total"]);
});

test("extras appear in the rollup when present", () => {
  const p = project({ extras: [{ id: "e1", description: "Paint", qty: 2, unitCost: 25 }] });
  const steps = explainRollup(p, costProject(p, [material]));
  const extras = steps.find((s) => s.label === "Extras");
  assert.ok(extras);
  assert.equal(extras.result, "$50.00");
  assert.match(extras.formula, /2 × \$25\.00/);
});

/* ---------------------------------------------------------------- glossary */

test("every glossary term has a short and a long explanation", () => {
  assert.ok(GLOSSARY.length >= 5);
  for (const term of GLOSSARY) {
    assert.ok(term.term.length > 0);
    assert.ok(term.short.length > 10, `${term.term} needs a one-line summary`);
    assert.ok(term.long.length > 60, `${term.term} needs a fuller explanation`);
  }
});
