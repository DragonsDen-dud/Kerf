import assert from "node:assert/strict";
import { test } from "node:test";

import { groupBars, pack, summariseBar, type Part, type Settings } from "../lib/pack.ts";
import { formatFeetInches, formatValue, parseLength } from "../lib/units.ts";

/**
 * The sample job that ships in the source workbook (sheet "BRATTON 1X1"),
 * with the workbook's own Step 3 figures as the expected values.
 */
const SAMPLE_PARTS: Part[] = [
  { id: "1", label: "A1,A3", length: 45.5, qty: 4 },
  { id: "2", label: "A2,A4", length: 51, qty: 4 },
  { id: "3", label: "A5", length: 70, qty: 2 },
  { id: "4", label: "A6,A7", length: 35, qty: 4 },
  { id: "5", label: "B1,B3", length: 54, qty: 12 },
  { id: "6", label: "B2,B4", length: 51, qty: 12 },
  { id: "7", label: "B5", length: 77, qty: 6 },
  { id: "8", label: "B6,B7", length: 38, qty: 12 },
];

const baseSettings = (overrides: Partial<Settings> = {}): Settings => ({
  stockLength: 240, // B5 = 20 * 12
  kerf: 0.125, // B6
  endTrim: 0, // B7
  strategy: "sequential",
  pricePerBar: 0,
  ...overrides,
});

test("sequential strategy reproduces the workbook's Step 3 figures", () => {
  const result = pack(SAMPLE_PARTS, baseSettings());
  const { totals } = result;

  assert.equal(totals.pieces, 56); // B39
  assert.equal(totals.netLength, 2844); // B40
  assert.equal(totals.barsNeeded, 14); // B41
  assert.equal(totals.purchased, 3360); // B42
  assert.equal(totals.kerfLoss, 7); // B43
  assert.equal(totals.trimLoss, 0); // B44
  assert.equal(totals.dropLoss, 509); // B45
  assert.equal(totals.utilisation.toFixed(4), (2844 / 3360).toFixed(4)); // B46
  assert.equal(totals.theoreticalBest, 12); // B48
});

test("every piece is accounted for exactly once", () => {
  const result = pack(SAMPLE_PARTS, baseSettings());
  const placed = result.bars.flatMap((bar) => bar.pieces);
  assert.equal(placed.length, 56);

  for (const part of SAMPLE_PARTS) {
    const count = placed.filter((p) => p.partId === part.id).length;
    assert.equal(count, part.qty, `part ${part.label}`);
  }
});

test("no bar is overfilled once kerf is charged", () => {
  const settings = baseSettings({ endTrim: 2 });
  for (const strategy of ["sequential", "optimized"] as const) {
    const result = pack(SAMPLE_PARTS, { ...settings, strategy });
    for (const bar of result.bars) {
      const consumed = bar.used + bar.kerfLoss;
      assert.ok(
        consumed <= result.totals.usableLength + 1e-9,
        `${strategy} bar ${bar.index} consumed ${consumed}`,
      );
      assert.ok(bar.remaining >= -1e-9, `${strategy} bar ${bar.index} went negative`);
    }
  }
});

test("optimized strategy never needs more bars than sequential", () => {
  const sequential = pack(SAMPLE_PARTS, baseSettings({ strategy: "sequential" }));
  const optimized = pack(SAMPLE_PARTS, baseSettings({ strategy: "optimized" }));

  assert.ok(optimized.totals.barsNeeded <= sequential.totals.barsNeeded);
  // On this dataset first-fit saves a whole bar.
  assert.equal(optimized.totals.barsNeeded, 13);
  assert.ok(optimized.totals.barsNeeded >= optimized.totals.theoreticalBest);
});

test("pieces that cannot fit the usable bar are reported, not packed", () => {
  const parts: Part[] = [
    { id: "a", label: "too long", length: 300, qty: 2 },
    { id: "b", label: "fine", length: 100, qty: 1 },
  ];
  const result = pack(parts, baseSettings());

  assert.equal(result.impossible.length, 1);
  assert.equal(result.impossible[0].label, "too long");
  assert.equal(result.totals.pieces, 1);
  assert.equal(result.totals.barsNeeded, 1);
});

test("a piece exactly as long as the bar minus kerf still fits", () => {
  const result = pack([{ id: "a", label: "full", length: 239.875, qty: 2 }], baseSettings());
  assert.equal(result.impossible.length, 0);
  assert.equal(result.totals.barsNeeded, 2);
});

test("end trim reduces usable length and shows up as trim loss", () => {
  const result = pack(SAMPLE_PARTS, baseSettings({ endTrim: 1 }));
  assert.equal(result.totals.usableLength, 239);
  assert.equal(result.totals.trimLoss, result.totals.barsNeeded * 1);
});

test("an empty cut list produces zeroed totals rather than NaN", () => {
  const result = pack([], baseSettings());
  assert.equal(result.totals.barsNeeded, 0);
  assert.equal(result.totals.utilisation, 0);
  assert.equal(result.totals.theoreticalBest, 0);
  assert.equal(result.totals.cost, 0);
});

test("cost estimate multiplies bars by the price per bar", () => {
  const result = pack(SAMPLE_PARTS, baseSettings({ pricePerBar: 48.5 }));
  assert.equal(result.totals.cost, 14 * 48.5);
});

test("bar summary collapses runs of identical cuts", () => {
  const result = pack(SAMPLE_PARTS, baseSettings());
  const summary = summariseBar(result.bars[0]);
  const total = summary.reduce((sum, group) => sum + group.qty, 0);
  assert.equal(total, result.bars[0].pieces.length);
});

test("identical bars are grouped together", () => {
  const parts: Part[] = [{ id: "a", label: "leg", length: 100, qty: 6 }];
  const result = pack(parts, baseSettings());
  const groups = groupBars(result.bars);
  // Two 100in cuts per 240in bar -> three identical bars.
  assert.equal(result.totals.barsNeeded, 3);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].bars.length, 3);
});

test("imperial length parsing accepts shop notation", () => {
  const cases: Array<[string, number]> = [
    ["45.5", 45.5],
    ["45 1/2", 45.5],
    ["45-1/2", 45.5],
    ["1/2", 0.5],
    ["3'", 36],
    ["3' 6\"", 42],
    ["3ft 6in", 42],
    ["20'", 240],
    ['240"', 240],
    ["6 ft", 72],
  ];
  for (const [input, expected] of cases) {
    assert.equal(parseLength(input, "imperial"), expected, input);
  }
  assert.equal(parseLength("banana", "imperial"), null);
  assert.equal(parseLength("", "imperial"), null);
});

test("metric length parsing converts to internal inches", () => {
  assert.equal(parseLength("25.4", "metric"), 1);
  assert.equal(parseLength("254mm", "metric"), 10);
  assert.equal(parseLength("2.54cm", "metric"), 1);
  assert.equal(parseLength("1m", "metric")?.toFixed(4), (1000 / 25.4).toFixed(4));
  assert.equal(parseLength("nope", "metric"), null);
});

test("imperial formatting rounds to the nearest sixteenth", () => {
  assert.equal(formatValue(45.5, "imperial"), "45 1/2");
  assert.equal(formatValue(45, "imperial"), "45");
  assert.equal(formatValue(0.0625, "imperial"), "1/16");
  assert.equal(formatValue(45.3125, "imperial"), "45 5/16");
  assert.equal(formatFeetInches(240), "20' 0\"");
  assert.equal(formatFeetInches(42.5), "3' 6 1/2\"");
});

test("a length parsed then formatted round-trips", () => {
  for (const input of ["45 1/2", "3' 6\"", "77", "38 3/8"]) {
    const inches = parseLength(input, "imperial");
    assert.ok(inches !== null);
    const reparsed = parseLength(formatValue(inches, "imperial"), "imperial");
    assert.equal(reparsed, inches, input);
  }
});
