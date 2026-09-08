"use client";

import { Badge, Card, Empty, Money, SectionTitle } from "./ui";
import {
  CONFIDENCE_LABELS,
  citation,
  confidenceNote,
  extraCost,
  formatMoney,
  basisSuffix,
  type ProjectCost,
} from "@/lib/pricing";
import { SOURCE_LABELS, type Project } from "@/lib/types";
import { formatLength, formatPercent, formatValue } from "@/lib/units";

/**
 * THE SCALES — what it weighs in at. Material required, where the material
 * goes, and what it costs, with the confidence of the pricing stated up front.
 */
export default function ScalesView({
  project,
  cost,
  onOpenHoard,
}: {
  project: Project;
  cost: ProjectCost;
  onOpenHoard: () => void;
}) {
  const { unit, currency } = project;
  const priced = cost.total > 0;
  const detailed = project.mode === "detailed";

  if (cost.totalPieces === 0) {
    return (
      <Empty
        title="Nothing on the scales yet"
        body="Add your pieces in the Den and the numbers land here."
      />
    );
  }

  const netLength = cost.lines.reduce((sum, l) => sum + l.result.totals.netLength, 0);
  const purchased = cost.lines.reduce((sum, l) => sum + l.result.totals.purchased, 0);
  const kerfLoss = cost.lines.reduce((sum, l) => sum + l.result.totals.kerfLoss, 0);
  const trimLoss = cost.lines.reduce((sum, l) => sum + l.result.totals.trimLoss, 0);
  const dropLoss = cost.lines.reduce((sum, l) => sum + l.result.totals.dropLoss, 0);

  const confidenceTone =
    cost.confidence === "firm" ? "good" : cost.confidence === "unpriced" ? "bad" : "warn";

  return (
    <div className="space-y-5">
      {/* Headline */}
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
              {detailed ? "Detailed take-off" : "Quick estimate"}
            </p>
            {priced ? (
              <p className="mt-1 text-4xl font-extrabold leading-tight text-amber-300 lg:text-5xl">
                <Money amount={cost.total} currency={currency} />
              </p>
            ) : (
              <p className="mt-1 text-4xl font-extrabold leading-tight text-amber-300 lg:text-5xl">
                {cost.totalBars} {cost.totalBars === 1 ? "bar" : "bars"}
              </p>
            )}
            <p className="mt-1 text-base font-semibold text-amber-100/90">
              {cost.totalBars} {cost.totalBars === 1 ? "bar" : "bars"} · {cost.totalPieces} pieces ·{" "}
              {formatPercent(cost.utilisation)} of the material used
            </p>
          </div>
          <Badge tone={confidenceTone}>{CONFIDENCE_LABELS[cost.confidence]}</Badge>
        </div>
        <p className="mt-3 text-xs text-amber-100/70">{confidenceNote(cost)}</p>
      </section>

      {/* Warnings that change the number */}
      {cost.unpricedLines > 0 || cost.staleLines > 0 || cost.impossible > 0 ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-300">
            Before this goes out
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-100/90">
            {cost.unpricedLines > 0 ? (
              <li>
                {cost.unpricedLines} line{cost.unpricedLines === 1 ? "" : "s"} have no price —
                quantities only.{" "}
                <button type="button" className="font-semibold underline" onClick={onOpenHoard}>
                  Price them in the Hoard
                </button>
              </li>
            ) : null}
            {cost.staleLines > 0 ? (
              <li>
                {cost.staleLines} price{cost.staleLines === 1 ? "" : "s"} older than 90 days — worth
                re-checking.
              </li>
            ) : null}
            {cost.impossible > 0 ? (
              <li>
                {cost.impossible} piece{cost.impossible === 1 ? " is" : "s are"} longer than the
                usable bar and cannot be cut.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bars to buy" value={String(cost.totalBars)} />
        <Stat label="Pieces to cut" value={String(cost.totalPieces)} />
        <Stat label="Utilisation" value={formatPercent(cost.utilisation)} />
        <Stat
          label={priced ? "Material cost" : "Take-off lines"}
          value={priced ? formatMoney(cost.materials, currency) : String(cost.lines.length)}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Line breakdown — given the extra column, it carries the money. */}
        <Card className="xl:col-span-2">
          <SectionTitle>Material required</SectionTitle>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2 font-semibold">Line</th>
                  <th className="pb-2 text-right font-semibold">Bars</th>
                  <th className="pb-2 text-right font-semibold">Pieces</th>
                  {priced ? <th className="pb-2 text-right font-semibold">Per bar</th> : null}
                  {priced ? <th className="pb-2 text-right font-semibold">Cost</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {cost.lines.map((entry) => (
                  <tr key={entry.line.id}>
                    <td className="py-2.5 pr-2">
                      <p className="font-semibold text-slate-100">
                        {entry.line.name || entry.material?.name || "Untitled line"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {entry.material?.name ?? "No material"} ·{" "}
                        {formatValue(entry.line.stockLength, unit)} stock
                      </p>
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums text-slate-100">
                      {entry.result.totals.barsNeeded}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">
                      {entry.result.totals.pieces}
                    </td>
                    {priced ? (
                      <td className="py-2.5 text-right tabular-nums text-slate-300">
                        {entry.price ? formatMoney(entry.barCost, currency) : "—"}
                      </td>
                    ) : null}
                    {priced ? (
                      <td className="py-2.5 text-right font-semibold tabular-nums text-slate-100">
                        {entry.price ? formatMoney(entry.cost, currency) : "—"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Where the material goes */}
        <Card>
          <SectionTitle>Where the material goes</SectionTitle>
          <WasteBar
            netLength={netLength}
            kerfLoss={kerfLoss}
            trimLoss={trimLoss}
            dropLoss={dropLoss}
            purchased={purchased}
          />
          <dl className="mt-4 divide-y divide-white/[0.07]">
            <Row label="Net length of finished pieces" value={formatLength(netLength, unit)} />
            <Row label="Total material purchased" value={formatLength(purchased, unit)} />
            <Row label="Lost to blade / kerf" value={formatLength(kerfLoss, unit)} />
            <Row label="Lost to end trim" value={formatLength(trimLoss, unit)} />
            <Row label="Leftover / offcut drop" value={formatLength(dropLoss, unit)} />
          </dl>
        </Card>
      </div>

      {/* Cost roll-up */}
      {priced && detailed ? (
        <Card>
          <SectionTitle>Cost summary</SectionTitle>
          <dl className="divide-y divide-white/[0.07]">
            <Row label="Materials" value={formatMoney(cost.materials, currency)} />
            {project.extras.map((extra) => (
              <Row
                key={extra.id}
                label={`${extra.description || "Extra"} (${extra.qty} × ${formatMoney(extra.unitCost, currency)})`}
                value={formatMoney(extraCost(extra), currency)}
              />
            ))}
            {cost.contingency ? (
              <Row
                label={`Contingency ${project.contingencyPct}%`}
                value={formatMoney(cost.contingency, currency)}
              />
            ) : null}
            {cost.markup ? (
              <Row label={`Markup ${project.markupPct}%`} value={formatMoney(cost.markup, currency)} />
            ) : null}
            {cost.tax ? (
              <>
                <Row label="Subtotal" value={formatMoney(cost.subtotal, currency)} />
                <Row label={`Tax ${project.taxPct}%`} value={formatMoney(cost.tax, currency)} />
              </>
            ) : null}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t-2 border-white/20 pt-3">
            <span className="text-base font-bold text-slate-50">Total</span>
            <span className="text-2xl font-extrabold text-amber-300">
              <Money amount={cost.total} currency={currency} />
            </span>
          </div>
        </Card>
      ) : null}

      {/* Evidence */}
      {cost.lines.some((entry) => entry.price) ? (
        <Card>
          <SectionTitle>Where the pricing came from</SectionTitle>
          <ul className="divide-y divide-white/[0.07]">
            {dedupePrices(cost).map((entry) => (
              <li key={entry.price!.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-100">{entry.material?.name}</span>
                  <span className="font-bold tabular-nums text-amber-300">
                    {formatMoney(entry.price!.amount, currency)}
                    <span className="text-xs font-medium text-amber-100/60">
                      {basisSuffix(entry.price!.basis)}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {citation(entry.price!, SOURCE_LABELS)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {entry.price!.source.attachmentId ? (
                    <Badge tone="good">proof attached</Badge>
                  ) : null}
                  {entry.price!.source.url ? (
                    <a
                      href={entry.price!.source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[11px] font-bold uppercase tracking-wide text-sky-300 hover:underline"
                    >
                      source link
                    </a>
                  ) : null}
                  {entry.stale ? (
                    <Badge tone="warn">{Math.round(entry.priceAgeDays)} days old</Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function dedupePrices(cost: ProjectCost) {
  const seen = new Set<string>();
  return cost.lines.filter((entry) => {
    if (!entry.price || !entry.material || seen.has(entry.price.id)) return false;
    seen.add(entry.price.id);
    return true;
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-50 lg:text-3xl">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold tabular-nums text-slate-100">{value}</dd>
    </div>
  );
}

function WasteBar({
  netLength,
  kerfLoss,
  trimLoss,
  dropLoss,
  purchased,
}: {
  netLength: number;
  kerfLoss: number;
  trimLoss: number;
  dropLoss: number;
  purchased: number;
}) {
  if (purchased <= 0) return null;

  const segments = [
    { label: "Pieces", value: netLength, colour: "#16a34a" },
    { label: "Kerf", value: kerfLoss, colour: "#f59e0b" },
    { label: "Trim", value: trimLoss, colour: "#ea580c" },
    { label: "Drop", value: Math.max(0, dropLoss), colour: "#475569" },
  ].filter((segment) => segment.value > 0);

  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full ring-1 ring-white/10">
        {segments.map((segment) => (
          <div
            key={segment.label}
            style={{ width: `${(segment.value / purchased) * 100}%`, background: segment.colour }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: segment.colour }} />
            {segment.label} {formatPercent(segment.value / purchased)}
          </span>
        ))}
      </div>
    </div>
  );
}
