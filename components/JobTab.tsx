"use client";

import { useRef } from "react";

import LengthInput from "./LengthInput";
import type { Part } from "@/lib/pack";
import { colourFor } from "@/lib/palette";
import { emptyJob, sampleJob, type Job } from "@/lib/store";
import { describeStock, formatValue, unitAbbr, type UnitSystem } from "@/lib/units";

interface Props {
  job: Job;
  patch: (changes: Partial<Job>) => void;
  patchSettings: (changes: Partial<Job["settings"]>) => void;
  updatePart: (id: string, changes: Partial<Part>) => void;
  addPart: () => string;
  removePart: (id: string) => void;
  duplicatePart: (id: string) => void;
  reset: (job: Job) => void;
  impossible: Part[];
}

const COMMON_KERFS: Array<[string, number]> = [
  ['1/16"', 0.0625],
  ['3/32"', 0.09375],
  ['1/8"', 0.125],
  ['3/16"', 0.1875],
  ['1/4"', 0.25],
];

const COMMON_STOCK: Array<[string, number]> = [
  ["10'", 120],
  ["12'", 144],
  ["16'", 192],
  ["20'", 240],
  ["24'", 288],
];

export default function JobTab({
  job,
  patch,
  patchSettings,
  updatePart,
  addPart,
  removePart,
  duplicatePart,
  reset,
  impossible,
}: Props) {
  const listEnd = useRef<HTMLDivElement>(null);
  const { unit } = job;

  const handleAdd = () => {
    addPart();
    // Let React paint the new row before scrolling to it.
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth" }));
  };

  const totalPieces = job.parts.reduce((sum, p) => sum + (p.length > 0 ? p.qty : 0), 0);

  return (
    <div className="space-y-5">
      <section className="card space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">Job</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job-name">
              Job name
            </label>
            <input
              id="job-name"
              className="field"
              value={job.name}
              placeholder="e.g. BRATTON 1X1"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="job-material">
              Material / profile
            </label>
            <input
              id="job-material"
              className="field"
              value={job.material}
              placeholder='e.g. 1" x 1" tube'
              onChange={(e) => patch({ material: e.target.value })}
            />
          </div>
        </div>

        <div>
          <span className="label">Units</span>
          <div className="grid grid-cols-2 gap-2">
            {(["imperial", "metric"] as UnitSystem[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => patch({ unit: option })}
                className={`btn ${
                  job.unit === option
                    ? "bg-amber-500 text-ink-950"
                    : "border border-white/[0.12] bg-white/[0.04] text-slate-200"
                }`}
              >
                {option === "imperial" ? "Inches" : "Millimetres"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
          Step 1 — Stock &amp; saw
        </h2>

        <div>
          <LengthInput
            id="stock-length"
            label="Stock length per bar"
            value={job.settings.stockLength}
            unit={unit}
            onChange={(stockLength) => patchSettings({ stockLength })}
            hint={
              unit === "imperial"
                ? `${describeStock(job.settings.stockLength, unit)} — type 20' for a 20 foot bar`
                : undefined
            }
          />
          {unit === "imperial" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {COMMON_STOCK.map(([label, inches]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => patchSettings({ stockLength: inches })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    job.settings.stockLength === inches
                      ? "bg-amber-500 text-ink-950"
                      : "bg-white/[0.06] text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <LengthInput
            id="kerf"
            label="Blade kerf / width of cut"
            value={job.settings.kerf}
            unit={unit}
            allowZero
            onChange={(kerf) => patchSettings({ kerf })}
            hint="Every piece is charged one blade width."
          />
          {unit === "imperial" ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {COMMON_KERFS.map(([label, inches]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => patchSettings({ kerf: inches })}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    job.settings.kerf === inches
                      ? "bg-amber-500 text-ink-950"
                      : "bg-white/[0.06] text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <LengthInput
          id="end-trim"
          label="End trim allowance per bar"
          value={job.settings.endTrim}
          unit={unit}
          allowZero
          onChange={(endTrim) => patchSettings({ endTrim })}
          hint={`Usable length per bar: ${formatValue(
            Math.max(0, job.settings.stockLength - job.settings.endTrim),
            unit,
          )} ${unitAbbr(unit)}`}
        />

        <div>
          <label className="label" htmlFor="price">
            Price per bar (optional)
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
              {job.currency}
            </span>
            <input
              id="price"
              className="field pl-8"
              type="text"
              inputMode="decimal"
              value={job.settings.pricePerBar ? String(job.settings.pricePerBar) : ""}
              placeholder="0.00"
              onChange={(e) => {
                const value = Number(e.target.value.replace(/[^0-9.]/g, ""));
                patchSettings({ pricePerBar: Number.isFinite(value) ? value : 0 });
              }}
            />
          </div>
        </div>

        <div>
          <span className="label">Packing</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => patchSettings({ strategy: "optimized" })}
              className={`btn ${
                job.settings.strategy === "optimized"
                  ? "bg-amber-500 text-ink-950"
                  : "border border-white/[0.12] bg-white/[0.04] text-slate-200"
              }`}
            >
              Optimised
            </button>
            <button
              type="button"
              onClick={() => patchSettings({ strategy: "sequential" })}
              className={`btn ${
                job.settings.strategy === "sequential"
                  ? "bg-amber-500 text-ink-950"
                  : "border border-white/[0.12] bg-white/[0.04] text-slate-200"
              }`}
            >
              Match spreadsheet
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {job.settings.strategy === "optimized"
              ? "Back-fills earlier bars to squeeze in short pieces. Usually needs fewer bars."
              : "Cuts strictly in order, one bar at a time — reproduces the original workbook."}
          </p>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
            Step 2 — Pieces to cut
          </h2>
          <span className="text-xs text-slate-500">{totalPieces} pieces</span>
        </div>
        <p className="text-xs text-slate-500">
          Enter them in any order — they are sorted longest-first for you.
        </p>

        <div className="space-y-3">
          {job.parts.map((part, index) => {
            const blocked = impossible.some((p) => p.id === part.id);
            return (
              <div
                key={part.id}
                className={`rounded-xl border p-3 ${
                  blocked ? "border-rose-500/60 bg-rose-500/[0.07]" : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: colourFor(job.parts, part.id) }}
                  />
                  <input
                    className="field flex-1 py-2"
                    value={part.label}
                    placeholder={`Piece ${index + 1} label`}
                    onChange={(e) => updatePart(part.id, { label: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <LengthInput
                    value={part.length}
                    unit={unit}
                    allowZero
                    placeholder="Length"
                    onChange={(length) => updatePart(part.id, { length })}
                  />
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      aria-label={`Decrease quantity for ${part.label || `piece ${index + 1}`}`}
                      className="w-11 rounded-xl bg-white/[0.06] text-xl font-bold text-slate-200 active:scale-95"
                      onClick={() => updatePart(part.id, { qty: Math.max(0, part.qty - 1) })}
                    >
                      –
                    </button>
                    <input
                      className="field w-16 px-0 text-center"
                      type="text"
                      inputMode="numeric"
                      value={part.qty}
                      aria-label={`Quantity for ${part.label || `piece ${index + 1}`}`}
                      onChange={(e) => {
                        const qty = Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, ""))));
                        updatePart(part.id, { qty: Number.isFinite(qty) ? qty : 0 });
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${part.label || `piece ${index + 1}`}`}
                      className="w-11 rounded-xl bg-white/[0.06] text-xl font-bold text-slate-200 active:scale-95"
                      onClick={() => updatePart(part.id, { qty: part.qty + 1 })}
                    >
                      +
                    </button>
                  </div>
                </div>

                {blocked ? (
                  <p className="mt-2 text-xs font-semibold text-rose-300">
                    Longer than the usable bar — this piece cannot be cut.
                  </p>
                ) : null}

                <div className="mt-2 flex justify-end gap-3 text-xs font-semibold text-slate-400">
                  <button type="button" onClick={() => duplicatePart(part.id)}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="text-rose-300"
                    onClick={() => removePart(part.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <div ref={listEnd} />
        </div>

        <button type="button" className="btn-ghost w-full" onClick={handleAdd}>
          + Add piece
        </button>
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Reset</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (confirm("Clear this job and start empty?")) reset(emptyJob());
            }}
          >
            New empty job
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (confirm("Replace this job with the sample cut list?")) reset(sampleJob());
            }}
          >
            Load sample
          </button>
        </div>
      </section>
    </div>
  );
}
