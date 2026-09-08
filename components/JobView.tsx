"use client";

import { useRef, useState } from "react";

import LengthInput from "./LengthInput";
import { Badge, Card, Chip, Field, Note, NumberInput, SectionTitle, Segmented, Working } from "./ui";
import { explainKerf, explainPacking, explainUsableLength } from "@/lib/explain";
import { colourFor } from "@/lib/palette";
import { formatMoney, type LineCost } from "@/lib/pricing";
import { emptyProject, sampleProject, type Workspace } from "@/lib/store";
import type { Material, Mode, Project, TakeoffLine } from "@/lib/types";
import { describeStock, formatValue, unitAbbr, type UnitSystem } from "@/lib/units";

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

/**
 * The job screen: settings and the cut list. Every setting that changes the
 * answer carries a one-line explanation of what it does.
 */
export default function JobView({
  workspace,
  onOpenMaterials,
}: {
  workspace: Workspace;
  onOpenMaterials: () => void;
}) {
  const { project, materials, cost } = workspace;
  const detailed = project.mode === "detailed";
  const lines = detailed ? project.lines : project.lines.slice(0, 1);

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>How much detail do you need?</SectionTitle>
        <Segmented<Mode>
          value={project.mode}
          onChange={workspace.setMode}
          options={[
            { value: "quick", label: "Quick estimate", hint: "One material, just the cost" },
            {
              value: "detailed",
              label: "Detailed take-off",
              hint: "Many materials, extras and markup",
            },
          ]}
        />
        <div className="mt-2">
          <Note>
            Switching does not delete anything. Quick estimate costs the first material only and
            hides extras, contingency, markup and tax until you switch back.
          </Note>
        </div>
      </Card>

      <JobDetails workspace={workspace} detailed={detailed} />

      <div className="space-y-4">
        <SectionTitle
          aside={
            detailed ? (
              <button
                type="button"
                className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.1]"
                onClick={() => workspace.addLine()}
              >
                + Add material
              </button>
            ) : null
          }
        >
          {detailed ? "Materials and cut lists" : "Stock and cut list"}
        </SectionTitle>

        {detailed ? (
          <Note>
            One block per material. A job needing 1x1 tube and 2x2 angle is two blocks, each packed
            and priced separately, then added together.
          </Note>
        ) : null}

        {lines.map((line, index) => (
          <LineCard
            key={line.id}
            line={line}
            index={index}
            detailed={detailed}
            project={project}
            materials={materials}
            entry={cost.lines.find((l) => l.line.id === line.id)}
            workspace={workspace}
            onOpenMaterials={onOpenMaterials}
            canRemove={detailed && project.lines.length > 1}
          />
        ))}
      </div>

      {detailed ? <ExtrasCard workspace={workspace} /> : null}
      {detailed ? <MarkupCard workspace={workspace} /> : null}

      <Card>
        <SectionTitle>Start again</SectionTitle>
        <Note>
          Everything is saved on this device only. Nothing is uploaded and nothing is shared until
          you export it.
        </Note>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (confirm("Clear this job and start from empty?"))
                workspace.replaceProject(emptyProject(project.mode));
            }}
          >
            New job
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (confirm("Replace this job with the worked example?"))
                workspace.replaceProject(sampleProject());
            }}
          >
            Load example
          </button>
          <button type="button" className="btn-ghost" onClick={onOpenMaterials}>
            Manage materials
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- job details */

function JobDetails({ workspace, detailed }: { workspace: Workspace; detailed: boolean }) {
  const { project, patchProject } = workspace;

  return (
    <Card>
      <SectionTitle>Job details</SectionTitle>
      <Note>These appear at the top of the exported report. All optional.</Note>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Job name" htmlFor="job-name">
          <input
            id="job-name"
            className="field"
            value={project.name}
            placeholder="e.g. BRATTON 1X1"
            onChange={(event) => patchProject({ name: event.target.value })}
          />
        </Field>
        <Field label="Client" htmlFor="job-client">
          <input
            id="job-client"
            className="field"
            value={project.client}
            placeholder="Who it's for"
            onChange={(event) => patchProject({ client: event.target.value })}
          />
        </Field>
        {detailed ? (
          <>
            <Field label="Reference" htmlFor="job-ref" hint="Job number or drawing reference">
              <input
                id="job-ref"
                className="field"
                value={project.reference}
                placeholder="JOB-104"
                onChange={(event) => patchProject({ reference: event.target.value })}
              />
            </Field>
            <Field label="Prepared by" htmlFor="job-by">
              <input
                id="job-by"
                className="field"
                value={project.preparedBy}
                placeholder="Your name"
                onChange={(event) => patchProject({ preparedBy: event.target.value })}
              />
            </Field>
          </>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Units" hint="Lengths are stored the same way either way, so switching is safe.">
          <div className="grid grid-cols-2 gap-2">
            {(["imperial", "metric"] as UnitSystem[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={project.unit === option}
                onClick={() => patchProject({ unit: option })}
                className={`btn ${
                  project.unit === option
                    ? "bg-amber-500 text-ink-950"
                    : "border border-white/[0.12] bg-white/[0.04] text-slate-200"
                }`}
              >
                {option === "imperial" ? "Inches" : "Millimetres"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Currency symbol" htmlFor="job-currency">
          <input
            id="job-currency"
            className="field"
            value={project.currency}
            maxLength={3}
            onChange={(event) => patchProject({ currency: event.target.value })}
          />
        </Field>
      </div>

      {detailed ? (
        <div className="mt-3">
          <Field
            label="Notes"
            htmlFor="job-notes"
            hint="Printed at the bottom of the report — a good place for exclusions and assumptions."
          >
            <textarea
              id="job-notes"
              className="field min-h-20"
              value={project.notes}
              placeholder="Price excludes delivery. Assumes mill finish. Valid 30 days."
              onChange={(event) => patchProject({ notes: event.target.value })}
            />
          </Field>
        </div>
      ) : null}
    </Card>
  );
}

/* --------------------------------------------------------------- line card */

function LineCard({
  line,
  index,
  detailed,
  project,
  materials,
  entry,
  workspace,
  onOpenMaterials,
  canRemove,
}: {
  line: TakeoffLine;
  index: number;
  detailed: boolean;
  project: Project;
  materials: Material[];
  entry: LineCost | undefined;
  workspace: Workspace;
  onOpenMaterials: () => void;
  canRemove: boolean;
}) {
  const [showSettings, setShowSettings] = useState(!detailed);
  const listEnd = useRef<HTMLDivElement>(null);
  const { unit } = project;
  const u = unitAbbr(unit);
  const material = materials.find((m) => m.id === line.materialId) ?? null;
  const missingMaterial = line.materialId !== null && !material;

  const selectMaterial = (id: string) => {
    if (!id) {
      workspace.patchLine(line.id, { materialId: null });
      return;
    }
    const picked = materials.find((m) => m.id === id);
    if (!picked) return;
    // Adopt the material's saved defaults — that is why they are stored.
    workspace.patchLine(line.id, {
      materialId: id,
      stockLength: picked.stockLength,
      kerf: picked.kerf,
      endTrim: picked.endTrim,
      name: line.name || picked.name,
    });
  };

  const addPart = () => {
    workspace.addPart(line.id);
    requestAnimationFrame(() =>
      listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  const pieces = line.parts.reduce((sum, part) => sum + (part.length > 0 ? part.qty : 0), 0);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {detailed ? (
            <input
              className="field flex-1 py-2 font-semibold"
              value={line.name}
              placeholder={`Material ${index + 1} — what is it for?`}
              onChange={(event) => workspace.patchLine(line.id, { name: event.target.value })}
            />
          ) : (
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Stock and cuts
            </h3>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {entry && entry.result.totals.barsNeeded > 0 ? (
            <Badge tone="brand">
              {entry.result.totals.barsNeeded}{" "}
              {entry.result.totals.barsNeeded === 1 ? "bar" : "bars"}
            </Badge>
          ) : null}
          {entry && entry.cost > 0 ? (
            <span className="font-bold text-amber-300">
              {formatMoney(entry.cost, project.currency)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Material picker */}
      <Field
        label="Material"
        htmlFor={`mat-${line.id}`}
        hint="Picking one fills in its saved bar length, blade width and trim, and prices the job."
      >
        <div className="flex gap-2">
          <select
            id={`mat-${line.id}`}
            className="field flex-1"
            value={material?.id ?? ""}
            onChange={(event) => selectMaterial(event.target.value)}
          >
            <option value="">— none: count quantities, no pricing —</option>
            {materials.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name || "(unnamed)"}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost shrink-0" onClick={onOpenMaterials}>
            Manage
          </button>
        </div>
      </Field>

      {missingMaterial ? (
        <p className="mt-2 text-xs font-semibold text-rose-300">
          The material this used has been deleted. Pick another one to price it again.
        </p>
      ) : null}
      {material && !entry?.price ? (
        <p className="mt-2 text-xs font-semibold text-amber-300">
          {material.name} has no price saved, so this counts bars but no money.
        </p>
      ) : null}
      {entry?.stale ? (
        <p className="mt-2 text-xs font-semibold text-amber-300">
          This price is {Math.round(entry.priceAgeDays)} days old — worth re-checking before you
          send the estimate.
        </p>
      ) : null}

      {/* Stock & saw */}
      <div className="mt-4">
        <button
          type="button"
          className="mb-2 flex w-full items-center justify-between text-left"
          onClick={() => setShowSettings((value) => !value)}
          aria-expanded={showSettings}
        >
          <span className="label !mb-0">Stock and saw settings</span>
          <span className="text-xs font-semibold text-slate-400">
            {showSettings
              ? "Hide"
              : `${describeStock(line.stockLength, unit)} · blade ${formatValue(line.kerf, unit)}`}
          </span>
        </button>

        {showSettings ? (
          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div>
              <LengthInput
                id={`stock-${line.id}`}
                label="Bar length you buy"
                value={line.stockLength}
                unit={unit}
                onChange={(stockLength) => workspace.patchLine(line.id, { stockLength })}
                hint={
                  unit === "imperial"
                    ? `Currently ${describeStock(line.stockLength, unit)}. You can type 20' for a 20 foot bar.`
                    : "The full length of stock as delivered."
                }
              />
              {unit === "imperial" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {COMMON_STOCK.map(([label, inches]) => (
                    <Chip
                      key={label}
                      active={line.stockLength === inches}
                      onClick={() => workspace.patchLine(line.id, { stockLength: inches })}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <LengthInput
                id={`kerf-${line.id}`}
                label="Saw blade width (kerf)"
                value={line.kerf}
                unit={unit}
                allowZero
                onChange={(kerf) => workspace.patchLine(line.id, { kerf })}
                hint="How much material the blade destroys per cut. Every piece is charged one of these."
              />
              {unit === "imperial" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {COMMON_KERFS.map(([label, inches]) => (
                    <Chip
                      key={label}
                      active={line.kerf === inches}
                      onClick={() => workspace.patchLine(line.id, { kerf: inches })}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>

            <LengthInput
              id={`trim-${line.id}`}
              label="End trim per bar"
              value={line.endTrim}
              unit={unit}
              allowZero
              onChange={(endTrim) => workspace.patchLine(line.id, { endTrim })}
              hint={`Docked off every new bar before cutting starts. Leaves ${formatValue(
                Math.max(0, line.stockLength - line.endTrim),
                unit,
              )} ${u} usable.`}
            />

            <div>
              <Segmented
                label="How pieces are fitted onto bars"
                value={line.strategy}
                onChange={(strategy) => workspace.patchLine(line.id, { strategy })}
                options={[
                  { value: "optimized", label: "Optimised", hint: "Back-fills earlier bars" },
                  { value: "sequential", label: "Match spreadsheet", hint: "One bar at a time" },
                ]}
              />
              <div className="mt-2">
                <Note>
                  {line.strategy === "optimized"
                    ? "Short pieces fill the gaps left by long ones, so this usually needs fewer bars. Recommended."
                    : "Cuts straight down the list and starts a new bar as soon as something does not fit. Reproduces the original spreadsheet exactly, for reconciling."}
                </Note>
              </div>
            </div>

            {entry && entry.result.totals.pieces > 0 ? (
              <Working
                title="What these settings do to the answer"
                steps={[
                  explainUsableLength(entry, unit),
                  explainKerf(entry, unit),
                  explainPacking(entry, unit),
                ]}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Pieces */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label !mb-0">Pieces to cut</span>
          <span className="text-xs text-slate-500">{pieces} pieces</span>
        </div>
        <div className="mb-3">
          <Note>
            Enter them in any order — they get sorted longest first automatically. Lengths accept
            45 1/2, 3&apos; 6&quot; or 45.5.
          </Note>
        </div>

        {/* Desktop gets a compact table; phones get stacked cards. */}
        <div className="hidden lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Part name</th>
                <th className="w-40 pb-2 font-semibold">Length</th>
                <th className="w-32 pb-2 font-semibold">Quantity</th>
                <th className="w-24 pb-2" />
              </tr>
            </thead>
            <tbody>
              {line.parts.map((part, partIndex) => {
                const blocked = entry?.result.impossible.some((p) => p.id === part.id);
                return (
                  <tr key={part.id} className={blocked ? "bg-rose-500/[0.07]" : undefined}>
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-sm"
                          style={{ background: colourFor(line.parts, part.id) }}
                        />
                        <input
                          className="field py-2"
                          value={part.label}
                          placeholder={`Part ${partIndex + 1}`}
                          onChange={(event) =>
                            workspace.patchPart(line.id, part.id, { label: event.target.value })
                          }
                        />
                      </div>
                    </td>
                    <td className="py-1 pr-2">
                      <LengthInput
                        value={part.length}
                        unit={unit}
                        allowZero
                        placeholder="Length"
                        onChange={(length) => workspace.patchPart(line.id, part.id, { length })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <NumberInput
                        integer
                        value={part.qty}
                        ariaLabel={`Quantity for ${part.label || `part ${partIndex + 1}`}`}
                        onChange={(qty) => workspace.patchPart(line.id, part.id, { qty })}
                      />
                    </td>
                    <td className="py-1 text-right text-xs font-semibold">
                      <button
                        type="button"
                        className="px-1.5 text-slate-400 hover:text-white"
                        onClick={() => workspace.duplicatePart(line.id, part.id)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="px-1.5 text-rose-300 hover:text-rose-200"
                        onClick={() => workspace.removePart(line.id, part.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {line.parts.map((part, partIndex) => {
            const blocked = entry?.result.impossible.some((p) => p.id === part.id);
            return (
              <div
                key={part.id}
                className={`rounded-xl border p-3 ${
                  blocked
                    ? "border-rose-500/60 bg-rose-500/[0.07]"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: colourFor(line.parts, part.id) }}
                  />
                  <input
                    className="field flex-1 py-2"
                    value={part.label}
                    placeholder={`Part ${partIndex + 1} name`}
                    onChange={(event) =>
                      workspace.patchPart(line.id, part.id, { label: event.target.value })
                    }
                  />
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <LengthInput
                    value={part.length}
                    unit={unit}
                    allowZero
                    placeholder="Length"
                    onChange={(length) => workspace.patchPart(line.id, part.id, { length })}
                  />
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      aria-label={`Decrease quantity for ${part.label || `part ${partIndex + 1}`}`}
                      className="w-11 rounded-xl bg-white/[0.06] text-xl font-bold text-slate-200 active:scale-95"
                      onClick={() =>
                        workspace.patchPart(line.id, part.id, { qty: Math.max(0, part.qty - 1) })
                      }
                    >
                      –
                    </button>
                    <NumberInput
                      integer
                      value={part.qty}
                      className="w-16 px-0 text-center"
                      ariaLabel={`Quantity for ${part.label || `part ${partIndex + 1}`}`}
                      onChange={(qty) => workspace.patchPart(line.id, part.id, { qty })}
                    />
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${part.label || `part ${partIndex + 1}`}`}
                      className="w-11 rounded-xl bg-white/[0.06] text-xl font-bold text-slate-200 active:scale-95"
                      onClick={() => workspace.patchPart(line.id, part.id, { qty: part.qty + 1 })}
                    >
                      +
                    </button>
                  </div>
                </div>

                {blocked ? (
                  <p className="mt-2 text-xs font-semibold text-rose-300">
                    Longer than a usable bar, so this cannot be cut. Use longer stock or split it.
                  </p>
                ) : null}

                <div className="mt-2 flex justify-end gap-3 text-xs font-semibold text-slate-400">
                  <button type="button" onClick={() => workspace.duplicatePart(line.id, part.id)}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="text-rose-300"
                    onClick={() => workspace.removePart(line.id, part.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div ref={listEnd} />
        <button type="button" className="btn-ghost mt-3 w-full" onClick={addPart}>
          + Add a part
        </button>
      </div>

      {detailed ? (
        <div className="mt-4 flex justify-end gap-3 border-t border-white/[0.07] pt-3 text-xs font-semibold text-slate-400">
          <button type="button" onClick={() => workspace.duplicateLine(line.id)}>
            Duplicate this material
          </button>
          {canRemove ? (
            <button
              type="button"
              className="text-rose-300"
              onClick={() => {
                if (confirm("Remove this material and its cut list?")) workspace.removeLine(line.id);
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ extras */

function ExtrasCard({ workspace }: { workspace: Workspace }) {
  const { project } = workspace;

  return (
    <Card>
      <SectionTitle
        aside={
          <button
            type="button"
            className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.1]"
            onClick={workspace.addExtra}
          >
            + Add
          </button>
        }
      >
        Extras
      </SectionTitle>
      <Note>
        Costs that are not cut from stock — labour, fasteners, paint, galvanising, delivery. These
        are added to materials before contingency and markup are worked out.
      </Note>

      {project.extras.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-slate-500">
          No extras. Materials only.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:grid sm:grid-cols-[1fr_5rem_8rem_5rem]">
            <span>Description</span>
            <span>Qty</span>
            <span>Cost each</span>
            <span />
          </div>
          {project.extras.map((extra) => (
            <div
              key={extra.id}
              className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_5rem_8rem_5rem]"
            >
              <input
                className="field col-span-2 py-2 sm:col-span-1"
                value={extra.description}
                placeholder="Powder coating"
                onChange={(event) =>
                  workspace.patchExtra(extra.id, { description: event.target.value })
                }
              />
              <NumberInput
                value={extra.qty}
                ariaLabel="Quantity"
                onChange={(qty) => workspace.patchExtra(extra.id, { qty })}
              />
              <NumberInput
                value={extra.unitCost}
                prefix={project.currency}
                ariaLabel="Cost each"
                onChange={(unitCost) => workspace.patchExtra(extra.id, { unitCost })}
              />
              <button
                type="button"
                className="px-2 text-xs font-semibold text-rose-300"
                onClick={() => workspace.removeExtra(extra.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MarkupCard({ workspace }: { workspace: Workspace }) {
  const { project, patchProject } = workspace;
  return (
    <Card>
      <SectionTitle>Contingency, markup and tax</SectionTitle>
      <Note>
        Applied in this order, each to the running total: contingency on materials and extras, then
        markup on top of that, then tax on everything. Leave any at zero to skip it.
      </Note>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field
          label="Contingency"
          htmlFor="pct-cont"
          hint="Cover for what you cannot foresee"
        >
          <NumberInput
            id="pct-cont"
            value={project.contingencyPct}
            suffix="%"
            onChange={(contingencyPct) => patchProject({ contingencyPct })}
          />
        </Field>
        <Field label="Markup" htmlFor="pct-markup" hint="Your margin">
          <NumberInput
            id="pct-markup"
            value={project.markupPct}
            suffix="%"
            onChange={(markupPct) => patchProject({ markupPct })}
          />
        </Field>
        <Field label="Tax" htmlFor="pct-tax" hint="VAT or sales tax">
          <NumberInput
            id="pct-tax"
            value={project.taxPct}
            suffix="%"
            onChange={(taxPct) => patchProject({ taxPct })}
          />
        </Field>
      </div>
    </Card>
  );
}
