"use client";

import { useRef, useState } from "react";

import LengthInput from "./LengthInput";
import { Badge, Card, Chip, Field, NumberInput, SectionTitle, Segmented } from "./ui";
import type { LineCost } from "@/lib/pricing";
import { formatMoney } from "@/lib/pricing";
import { colourFor } from "@/lib/palette";
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
 * THE DEN — where the job is set up and the cuts are entered.
 *
 * Quick Estimate collapses to a single material and hides the mark-up
 * machinery; Detailed Take-Off opens up multiple lines, extras and roll-up.
 */
export default function DenView({
  workspace,
  onOpenHoard,
}: {
  workspace: Workspace;
  onOpenHoard: () => void;
}) {
  const { project, materials, cost } = workspace;
  const detailed = project.mode === "detailed";
  const lines = detailed ? project.lines : project.lines.slice(0, 1);

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>How much detail?</SectionTitle>
        <Segmented<Mode>
          value={project.mode}
          onChange={workspace.setMode}
          options={[
            { value: "quick", label: "🔥 Fire Breath", hint: "Quick estimate — one material" },
            {
              value: "detailed",
              label: "👁 Dragon's Eye",
              hint: "Full take-off — many materials, mark-up",
            },
          ]}
        />
        <p className="mt-2 text-xs text-slate-500">
          Nothing is lost when you switch — Fire Breath just costs the first line and hides the
          extras.
        </p>
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
                + Add line
              </button>
            ) : null
          }
        >
          {detailed ? "Take-off lines" : "What you're cutting"}
        </SectionTitle>

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
            onOpenHoard={onOpenHoard}
            canRemove={detailed && project.lines.length > 1}
          />
        ))}
      </div>

      {detailed ? <ExtrasCard workspace={workspace} /> : null}
      {detailed ? <MarkupCard workspace={workspace} /> : null}

      <Card>
        <SectionTitle>Start again</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (confirm("Clear this take-off and start empty?"))
                workspace.replaceProject(emptyProject(project.mode));
            }}
          >
            New take-off
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (confirm("Replace this take-off with the worked sample?"))
                workspace.replaceProject(sampleProject());
            }}
          >
            Load sample
          </button>
          <button type="button" className="btn-ghost" onClick={onOpenHoard}>
            Open the Hoard
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
      <SectionTitle>Job</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
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
            <Field label="Reference" htmlFor="job-ref" hint="Job number or drawing ref">
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
        <Field label="Units">
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
          <Field label="Notes" htmlFor="job-notes" hint="Printed at the bottom of the snapshot.">
            <textarea
              id="job-notes"
              className="field min-h-20"
              value={project.notes}
              placeholder="Exclusions, assumptions, lead time…"
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
  onOpenHoard,
  canRemove,
}: {
  line: TakeoffLine;
  index: number;
  detailed: boolean;
  project: Project;
  materials: Material[];
  entry: LineCost | undefined;
  workspace: Workspace;
  onOpenHoard: () => void;
  canRemove: boolean;
}) {
  const [showSettings, setShowSettings] = useState(!detailed);
  const listEnd = useRef<HTMLDivElement>(null);
  const { unit } = project;
  const material = materials.find((m) => m.id === line.materialId) ?? null;
  const missingMaterial = line.materialId !== null && !material;

  const selectMaterial = (id: string) => {
    if (!id) {
      workspace.patchLine(line.id, { materialId: null });
      return;
    }
    const picked = materials.find((m) => m.id === id);
    if (!picked) return;
    // Adopt the material's defaults — they are why they are stored.
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
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
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
              placeholder={`Line ${index + 1} — what is it for?`}
              onChange={(event) => workspace.patchLine(line.id, { name: event.target.value })}
            />
          ) : (
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">
              Stock &amp; cuts
            </h3>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {entry && entry.result.totals.barsNeeded > 0 ? (
            <Badge tone="brand">
              {entry.result.totals.barsNeeded} {entry.result.totals.barsNeeded === 1 ? "bar" : "bars"}
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
      <Field label="Material" htmlFor={`mat-${line.id}`}>
        <div className="flex gap-2">
          <select
            id={`mat-${line.id}`}
            className="field flex-1"
            value={material?.id ?? ""}
            onChange={(event) => selectMaterial(event.target.value)}
          >
            <option value="">— no material / quantities only —</option>
            {materials.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name || "(unnamed)"}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost shrink-0" onClick={onOpenHoard}>
            Hoard
          </button>
        </div>
      </Field>

      {missingMaterial ? (
        <p className="mt-2 text-xs font-semibold text-rose-300">
          The material this line used has been deleted from the Hoard. Pick another to re-price it.
        </p>
      ) : null}
      {material && !entry?.price ? (
        <p className="mt-2 text-xs font-semibold text-amber-300">
          {material.name} has no price on record — this line counts bars but no money.
        </p>
      ) : null}
      {entry?.stale ? (
        <p className="mt-2 text-xs font-semibold text-amber-300">
          Price is {Math.round(entry.priceAgeDays)} days old. Re-check before you send it out.
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
          <span className="label !mb-0">Stock &amp; saw</span>
          <span className="text-xs font-semibold text-slate-400">
            {showSettings
              ? "Hide"
              : `${describeStock(line.stockLength, unit)} · kerf ${formatValue(line.kerf, unit)}`}
          </span>
        </button>

        {showSettings ? (
          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div>
              <LengthInput
                id={`stock-${line.id}`}
                label="Stock length per bar"
                value={line.stockLength}
                unit={unit}
                onChange={(stockLength) => workspace.patchLine(line.id, { stockLength })}
                hint={
                  unit === "imperial"
                    ? `${describeStock(line.stockLength, unit)} — type 20' for a 20 foot bar`
                    : undefined
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
                label="Blade kerf / width of cut"
                value={line.kerf}
                unit={unit}
                allowZero
                onChange={(kerf) => workspace.patchLine(line.id, { kerf })}
                hint="Every piece is charged one blade width."
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
              label="End trim allowance per bar"
              value={line.endTrim}
              unit={unit}
              allowZero
              onChange={(endTrim) => workspace.patchLine(line.id, { endTrim })}
              hint={`Usable length per bar: ${formatValue(
                Math.max(0, line.stockLength - line.endTrim),
                unit,
              )} ${unitAbbr(unit)}`}
            />

            <Segmented
              label="Packing"
              value={line.strategy}
              onChange={(strategy) => workspace.patchLine(line.id, { strategy })}
              options={[
                { value: "optimized", label: "Optimised", hint: "Back-fills earlier bars" },
                { value: "sequential", label: "Match spreadsheet", hint: "One bar at a time" },
              ]}
            />
          </div>
        ) : null}
      </div>

      {/* Pieces */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label !mb-0">Pieces to cut</span>
          <span className="text-xs text-slate-500">{pieces} pieces</span>
        </div>

        {/* Desktop gets a compact table; phones get stacked cards. */}
        <div className="hidden lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Part</th>
                <th className="w-40 pb-2 font-semibold">Length</th>
                <th className="w-32 pb-2 font-semibold">Qty</th>
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
                          placeholder={`Piece ${partIndex + 1}`}
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
                        ariaLabel={`Quantity for ${part.label || `piece ${partIndex + 1}`}`}
                        onChange={(qty) => workspace.patchPart(line.id, part.id, { qty })}
                      />
                    </td>
                    <td className="py-1 text-right text-xs font-semibold">
                      <button
                        type="button"
                        className="px-1.5 text-slate-400 hover:text-white"
                        title="Duplicate"
                        onClick={() => workspace.duplicatePart(line.id, part.id)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="px-1.5 text-rose-300 hover:text-rose-200"
                        onClick={() => workspace.removePart(line.id, part.id)}
                      >
                        Del
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
                    placeholder={`Piece ${partIndex + 1} label`}
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
                      aria-label={`Decrease quantity for ${part.label || `piece ${partIndex + 1}`}`}
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
                      ariaLabel={`Quantity for ${part.label || `piece ${partIndex + 1}`}`}
                      onChange={(qty) => workspace.patchPart(line.id, part.id, { qty })}
                    />
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${part.label || `piece ${partIndex + 1}`}`}
                      className="w-11 rounded-xl bg-white/[0.06] text-xl font-bold text-slate-200 active:scale-95"
                      onClick={() => workspace.patchPart(line.id, part.id, { qty: part.qty + 1 })}
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
          + Add piece
        </button>
      </div>

      {detailed ? (
        <div className="mt-4 flex justify-end gap-3 border-t border-white/[0.07] pt-3 text-xs font-semibold text-slate-400">
          <button type="button" onClick={() => workspace.duplicateLine(line.id)}>
            Duplicate line
          </button>
          {canRemove ? (
            <button
              type="button"
              className="text-rose-300"
              onClick={() => {
                if (confirm("Remove this line and its cuts?")) workspace.removeLine(line.id);
              }}
            >
              Remove line
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
      <p className="mb-3 text-xs text-slate-500">
        Anything not cut from stock — labour, fasteners, finishing, delivery.
      </p>

      {project.extras.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-slate-500">
          No extras. Materials only.
        </p>
      ) : (
        <div className="space-y-2">
          {project.extras.map((extra) => (
            <div key={extra.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_5rem_8rem_auto]">
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
                ariaLabel="Unit cost"
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
      <SectionTitle>Contingency, markup &amp; tax</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Contingency %" htmlFor="pct-cont" hint="Cover for the unknowns">
          <NumberInput
            id="pct-cont"
            value={project.contingencyPct}
            suffix="%"
            onChange={(contingencyPct) => patchProject({ contingencyPct })}
          />
        </Field>
        <Field label="Markup %" htmlFor="pct-markup" hint="Your margin">
          <NumberInput
            id="pct-markup"
            value={project.markupPct}
            suffix="%"
            onChange={(markupPct) => patchProject({ markupPct })}
          />
        </Field>
        <Field label="Tax %" htmlFor="pct-tax" hint="VAT / sales tax">
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
