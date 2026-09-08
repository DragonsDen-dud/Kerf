"use client";

import { Field, Note, NumberInput } from "./ui";
import {
  BY_FOOT_ID,
  IMPERIAL_CANDIDATES,
  METRIC_CANDIDATES,
  buyLength,
  defaultCandidates,
  optionId,
  orderInstruction,
  orderLength,
  type ManualBasis,
  type PurchaseConfig,
  type PurchasePlan,
} from "@/lib/purchase";
import { formatMoney } from "@/lib/pricing";
import type { Project } from "@/lib/types";

/**
 * The controls for the purchase list. Everything here changes the sheet
 * immediately, so the preview beside it is always what will be sent.
 */
export default function PurchaseOptions({
  project,
  plan,
  config,
  onChange,
}: {
  project: Project;
  plan: PurchasePlan;
  config: PurchaseConfig;
  onChange: (next: PurchaseConfig) => void;
}) {
  const patch = (changes: Partial<PurchaseConfig>) => onChange({ ...config, ...changes });

  const allCandidates = [
    ...new Set([
      ...(project.unit === "metric" ? METRIC_CANDIDATES : IMPERIAL_CANDIDATES),
      ...defaultCandidates(project),
    ]),
  ].sort((a, b) => a - b);

  const toggleCandidate = (length: number) => {
    const has = config.candidates.some((c) => Math.abs(c - length) < 1e-6);
    const next = has
      ? config.candidates.filter((c) => Math.abs(c - length) >= 1e-6)
      : [...config.candidates, length].sort((a, b) => a - b);
    // Never leave a material with nothing to order.
    if (next.length === 0 && !config.includeByFoot) return;
    patch({ candidates: next });
  };

  return (
    <div className="space-y-5">
      {/* Which lengths to offer */}
      <section>
        <h3 className="label">Lengths your supplier might stock</h3>
        <Note>
          Tick every length you could actually buy. The sheet compares them and marks the one that
          wastes least — or costs least, once prices are in.
        </Note>
        <div className="mt-2 flex flex-wrap gap-2">
          {allCandidates.map((length) => {
            const active = config.candidates.some((c) => Math.abs(c - length) < 1e-6);
            return (
              <button
                key={length}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCandidate(length)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-amber-500 text-ink-950"
                    : "bg-white/[0.06] text-slate-300 hover:bg-white/[0.1]"
                }`}
              >
                {orderLength(length, project.unit)}
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={config.includeByFoot}
            onChange={(event) => patch({ includeByFoot: event.target.checked })}
            className="mt-0.5 h-4 w-4 accent-amber-500"
          />
          <span>
            Also offer <strong>cut to length</strong>
            <span className="block text-xs text-slate-500">
              Only if the supplier cuts to size. Buys just the parts plus blade width, rounded up.
            </span>
          </span>
        </label>
      </section>

      {/* Per material */}
      <section>
        <h3 className="label">Each material</h3>
        <Note>
          Pick what you are ordering and, if you know it, type the price. Prices typed here are used
          for this sheet only — they are not saved to your material library.
        </Note>

        <div className="mt-3 space-y-3">
          {plan.lines.map((line) => {
            const manual = config.prices[line.lineId];
            return (
              <div key={line.lineId} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-100">{line.name}</p>
                  <p className="text-xs text-slate-500">
                    {line.pieces} pieces · {buyLength(line.netLength, project.unit)} of parts
                  </p>
                </div>

                <div className="mt-2 space-y-1">
                  {line.options.map((option) => {
                    const selected = line.selected?.id === option.id;
                    return (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
                          selected ? "bg-amber-500/15 text-amber-100" : "text-slate-300 hover:bg-white/[0.04]"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`opt-${line.lineId}`}
                          checked={selected}
                          disabled={!option.fits}
                          onChange={() =>
                            patch({
                              selections: { ...config.selections, [line.lineId]: option.id },
                            })
                          }
                          className="h-4 w-4 accent-amber-500"
                        />
                        <span className="flex-1 truncate">
                          {option.label}
                          {option.recommended ? (
                            <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                              best value
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-xs text-slate-400">
                          {option.fits ? (
                            <>
                              {option.kind === "bars" ? `${option.bars} × ` : ""}
                              {orderLength(option.purchasedLength, project.unit)}
                              {option.cost !== null
                                ? ` · ${formatMoney(option.cost, project.currency)}`
                                : ""}
                            </>
                          ) : (
                            <span className="text-rose-300">part too long</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                  {line.options.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-rose-300">
                      No lengths ticked — nothing can be ordered for this material.
                    </p>
                  ) : null}
                </div>

                {config.showCost ? (
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <NumberInput
                      value={manual?.amount ?? 0}
                      prefix={project.currency}
                      placeholder="Price if you know it"
                      ariaLabel={`Price for ${line.name}`}
                      onChange={(amount) =>
                        patch({
                          prices: {
                            ...config.prices,
                            [line.lineId]: { amount, basis: manual?.basis ?? "per-foot" },
                          },
                        })
                      }
                    />
                    <select
                      className="field w-40"
                      aria-label={`Price basis for ${line.name}`}
                      value={manual?.basis ?? "per-foot"}
                      onChange={(event) =>
                        patch({
                          prices: {
                            ...config.prices,
                            [line.lineId]: {
                              amount: manual?.amount ?? 0,
                              basis: event.target.value as ManualBasis,
                            },
                          },
                        })
                      }
                    >
                      <option value="per-foot">per foot</option>
                      <option value="per-metre">per metre</option>
                      <option value="per-bar">
                        per {orderLength(
                          plan.lines.find((l) => l.lineId === line.lineId)?.selected?.stockLength || 0,
                          project.unit,
                        )} bar
                      </option>
                    </select>
                  </div>
                ) : null}

                {line.selected ? (
                  <p className="mt-2 text-xs font-semibold text-amber-300">
                    Order: {orderInstruction(line.selected, project.unit)} ·{" "}
                    {orderLength(line.selected.purchasedLength, project.unit)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* What to show */}
      <section>
        <h3 className="label">What to show on the sheet</h3>
        <div className="space-y-2">
          <Toggle
            checked={config.showHeadline}
            onChange={(showHeadline) => patch({ showHeadline })}
            label="Banner across the top"
            hint="The headline strip under the job name."
          />
          {config.showHeadline ? (
            <div className="pl-7">
              <label className="label" htmlFor="purchase-headline">
                What it says
              </label>
              <input
                id="purchase-headline"
                className="field"
                value={config.headline}
                placeholder={`${orderLength(plan.purchasedLength, project.unit)} of material to buy`}
                onChange={(event) => patch({ headline: event.target.value })}
              />
              <p className="mt-1 text-xs leading-snug text-slate-500">
                Leave it empty for the footage above. Or write your own — “Please quote and confirm
                lead time”, “Material for BUCA — order Monday”, “Prices only, do not order yet”.
              </p>
            </div>
          ) : null}
          <Toggle
            checked={config.showCost}
            onChange={(showCost) => patch({ showCost })}
            label="Prices and costs"
            hint="Leave off for a quantities-only list."
          />
          <Toggle
            checked={config.showWaste}
            onChange={(showWaste) => patch({ showWaste })}
            label="Waste percentage per option"
            hint="Helps justify why the longer bar is worth it."
          />
          <Toggle
            checked={config.showCutSummary}
            onChange={(showCutSummary) => patch({ showCutSummary })}
            label="What each material gets cut into"
            hint="Useful if the supplier is cutting for you."
          />
        </div>
      </section>

      <Field label="Note for the supplier" htmlFor="purchase-note">
        <textarea
          id="purchase-note"
          className="field min-h-20"
          value={config.note}
          placeholder="Deliver to site Thursday. Mill finish is fine."
          onChange={(event) => patch({ note: event.target.value })}
        />
      </Field>

      {/* Running total */}
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-400">This order</p>
        <p className="fire-text mt-1 text-2xl font-extrabold">
          {orderLength(plan.purchasedLength, project.unit)}
          {plan.cost !== null && config.showCost
            ? ` · ${formatMoney(plan.cost, project.currency)}`
            : ""}
        </p>
        <p className="mt-1 text-xs text-amber-100/70">
          {plan.totalBars > 0 ? `${plan.totalBars} bars · ` : ""}
          {plan.lines.length} materials · {plan.totalPieces} pieces to cut
        </p>
      </section>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-amber-500"
      />
      <span>
        {label}
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export { BY_FOOT_ID, optionId };
