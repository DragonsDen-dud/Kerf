"use client";

import type { PackResult } from "@/lib/pack";
import { colourFor } from "@/lib/palette";
import type { Job } from "@/lib/store";
import { describeStock, formatLength, formatPercent, formatValue } from "@/lib/units";

interface Props {
  job: Job;
  result: PackResult;
}

/**
 * Function #1 — material requirements. What to buy, what it costs, and where
 * the material goes.
 */
export default function EstimateTab({ job, result }: Props) {
  const { totals } = result;
  const { unit } = job;
  const activeParts = job.parts.filter((p) => p.length > 0 && p.qty > 0);

  if (totals.pieces === 0) {
    return (
      <div className="card text-center text-slate-400">
        <p className="text-lg font-semibold text-slate-200">Nothing to estimate yet</p>
        <p className="mt-1 text-sm">Add your pieces on the Job tab and the numbers land here.</p>
      </div>
    );
  }

  const savedVsSequential = totals.barsNeeded - totals.theoreticalBest;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Buy</p>
        <p className="mt-1 text-4xl font-extrabold leading-tight text-amber-300">
          {totals.barsNeeded} {totals.barsNeeded === 1 ? "bar" : "bars"}
        </p>
        <p className="mt-1 text-base font-semibold text-amber-100/90">
          of {describeStock(job.settings.stockLength, unit)}
          {job.material ? ` · ${job.material}` : ""}
        </p>
        {job.settings.pricePerBar > 0 ? (
          <p className="mt-3 text-2xl font-bold text-amber-200">
            {job.currency}
            {totals.cost.toFixed(2)}
            <span className="ml-2 text-sm font-medium text-amber-100/70">
              at {job.currency}
              {job.settings.pricePerBar.toFixed(2)} per bar
            </span>
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="Pieces to cut" value={String(totals.pieces)} />
        <Stat label="Utilisation" value={formatPercent(totals.utilisation)} />
        <Stat label="Total waste" value={formatPercent(totals.wasteFraction)} />
        <Stat label="Best case" value={`${totals.theoreticalBest} bars`} />
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-amber-400">
          Where the material goes
        </h2>
        <WasteBar result={result} />
        <dl className="mt-4 divide-y divide-white/[0.07]">
          <Row label="Net length of finished pieces" value={formatLength(totals.netLength, unit)} />
          <Row label="Total material purchased" value={formatLength(totals.purchased, unit)} />
          <Row label="Lost to blade / kerf" value={formatLength(totals.kerfLoss, unit)} />
          <Row label="Lost to end trim" value={formatLength(totals.trimLoss, unit)} />
          <Row label="Leftover / offcut drop" value={formatLength(totals.dropLoss, unit)} />
          <Row label="Usable length per bar" value={formatLength(totals.usableLength, unit)} />
        </dl>
        {savedVsSequential > 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Perfect packing would need {totals.theoreticalBest} bars; this layout uses{" "}
            {savedVsSequential} more. Short offcuts are rarely worth chasing.
          </p>
        ) : (
          <p className="mt-3 text-xs text-emerald-400">
            This layout hits the theoretical minimum for the material.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-amber-400">
          Pieces required
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="pb-2 font-semibold">Part</th>
              <th className="pb-2 text-right font-semibold">Length</th>
              <th className="pb-2 text-right font-semibold">Qty</th>
              <th className="pb-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {activeParts.map((part) => (
              <tr key={part.id}>
                <td className="py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: colourFor(job.parts, part.id) }}
                    />
                    <span className="font-semibold text-slate-100">
                      {part.label || "(unnamed)"}
                    </span>
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums text-slate-200">
                  {formatValue(part.length, unit)}
                </td>
                <td className="py-2.5 text-right tabular-nums text-slate-200">{part.qty}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-400">
                  {formatValue(part.length * part.qty, unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {result.impossible.length > 0 ? (
        <section className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-rose-300">
            Cannot be cut
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-rose-100">
            {result.impossible.map((part) => (
              <li key={part.id}>
                {part.label || "(unnamed)"} — {formatLength(part.length, unit)} is longer than the
                usable bar ({formatLength(totals.usableLength, unit)}).
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-50">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-slate-100">{value}</dd>
    </div>
  );
}

function WasteBar({ result }: { result: PackResult }) {
  const { totals } = result;
  if (totals.purchased <= 0) return null;

  const segments = [
    { label: "Pieces", value: totals.netLength, colour: "#16a34a" },
    { label: "Kerf", value: totals.kerfLoss, colour: "#f59e0b" },
    { label: "Trim", value: totals.trimLoss, colour: "#ea580c" },
    { label: "Drop", value: Math.max(0, totals.dropLoss), colour: "#475569" },
  ].filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full ring-1 ring-white/10">
        {segments.map((segment) => (
          <div
            key={segment.label}
            style={{
              width: `${(segment.value / totals.purchased) * 100}%`,
              background: segment.colour,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: segment.colour }} />
            {segment.label} {formatPercent(segment.value / totals.purchased)}
          </span>
        ))}
      </div>
    </div>
  );
}
