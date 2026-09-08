"use client";

import { Badge, Card, Empty, Money, Note, SectionTitle, StatCard, Working } from "./ui";
import {
  explainBarCost,
  explainKerf,
  explainLineCost,
  explainPacking,
  explainRollup,
  explainUsableLength,
  explainWaste,
} from "@/lib/explain";
import {
  CONFIDENCE_LABELS,
  basisSuffix,
  citation,
  confidenceNote,
  extraCost,
  formatMoney,
  type ProjectCost,
} from "@/lib/pricing";
import { SOURCE_LABELS, type Project } from "@/lib/types";
import { formatLength, formatPercent, formatValue } from "@/lib/units";

/**
 * The estimate: what to buy, what it costs, and the sums behind both.
 *
 * Every figure on this screen can be opened up to show the calculation that
 * produced it, so nothing has to be taken on trust.
 */
export default function EstimateView({
  project,
  cost,
  onOpenMaterials,
  onOpenGuide,
}: {
  project: Project;
  cost: ProjectCost;
  onOpenMaterials: () => void;
  onOpenGuide: () => void;
}) {
  const { unit, currency } = project;
  const priced = cost.total > 0;
  const detailed = project.mode === "detailed";

  if (cost.totalPieces === 0) {
    return (
      <Empty
        title="Nothing to estimate yet"
        body="Go to Job, enter the lengths and quantities you need to cut, and the numbers appear here."
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
      <section className="fire-panel">
        <span className="fire-rim" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-400/90">
              {detailed ? "Detailed take-off" : "Quick estimate"}
            </p>
            <p className="fire-text mt-1 text-4xl font-extrabold leading-tight lg:text-6xl">
              {priced ? (
                <Money amount={cost.total} currency={currency} />
              ) : (
                `${cost.totalBars} ${cost.totalBars === 1 ? "bar" : "bars"}`
              )}
            </p>
            <p className="mt-2 text-base font-semibold text-amber-50/90">
              Buy {cost.totalBars} {cost.totalBars === 1 ? "bar" : "bars"} to cut{" "}
              {cost.totalPieces} pieces
            </p>
          </div>
          <Badge tone={confidenceTone}>{CONFIDENCE_LABELS[cost.confidence]}</Badge>
        </div>
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-amber-100/70">
          {confidenceNote(cost)}
        </p>
      </section>

      {/* Anything that would change the number */}
      {cost.unpricedLines > 0 || cost.staleLines > 0 || cost.impossible > 0 ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-300">
            Check these before you send it
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-100/90">
            {cost.unpricedLines > 0 ? (
              <li>
                {cost.unpricedLines} material{cost.unpricedLines === 1 ? " has" : "s have"} no price,
                so {cost.unpricedLines === 1 ? "it is" : "they are"} counted but not costed.{" "}
                <button type="button" className="font-semibold underline" onClick={onOpenMaterials}>
                  Add a price
                </button>
              </li>
            ) : null}
            {cost.staleLines > 0 ? (
              <li>
                {cost.staleLines} price{cost.staleLines === 1 ? " is" : "s are"} more than 90 days
                old. Steel and timber move; worth a fresh quote.
              </li>
            ) : null}
            {cost.impossible > 0 ? (
              <li>
                {cost.impossible} piece{cost.impossible === 1 ? " is" : "s are"} longer than a usable
                bar, so {cost.impossible === 1 ? "it cannot" : "they cannot"} be cut at all. Use
                longer stock or split the part.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {/* Headline figures */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Bars to buy"
          value={String(cost.totalBars)}
          hint="Whole bars — you cannot buy part of one."
          fire
        />
        <StatCard
          label="Pieces to cut"
          value={String(cost.totalPieces)}
          hint="Every part × its quantity."
        />
        <StatCard
          label="Utilisation"
          value={formatPercent(cost.utilisation)}
          hint="Share of bought material that becomes parts."
        />
        <StatCard
          label={priced ? "Material cost" : "Materials used"}
          value={priced ? formatMoney(cost.materials, currency) : String(cost.lines.length)}
          hint={priced ? "Before extras, contingency and markup." : "Separate materials in this job."}
        />
      </section>

      {/* Per-material breakdown */}
      <Card>
        <SectionTitle>What to buy</SectionTitle>
        <Note>
          One row per material. Bars are worked out by fitting your pieces onto stock lengths, then
          the cost is that bar count times the price of one bar.
        </Note>

        <div className="-mx-4 mt-3 overflow-x-auto px-4">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 font-semibold">Material</th>
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
                      {entry.line.name || entry.material?.name || "Untitled"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.material?.name ?? "No material selected"} ·{" "}
                      {formatValue(entry.line.stockLength, unit)} bars
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
                    <td className="py-2.5 text-right font-semibold tabular-nums text-amber-300">
                      {entry.price ? formatMoney(entry.cost, currency) : "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cost.lines.map((entry) => (
          <Working
            key={entry.line.id}
            title={`How ${entry.line.name || entry.material?.name || "this material"} was worked out`}
            steps={[
              explainUsableLength(entry, unit),
              explainPacking(entry, unit),
              explainKerf(entry, unit),
              ...(entry.price
                ? [
                    explainBarCost(entry.price, entry.line.stockLength, unit, currency),
                    explainLineCost(entry, currency),
                  ]
                : []),
            ]}
          />
        ))}
      </Card>

      {/* Where the material goes */}
      <Card>
        <SectionTitle>Where the material goes</SectionTitle>
        <Note>
          You buy whole bars, so you pay for the whole bar. Most of it becomes finished parts; what
          is left is the short end of each bar that nothing else would fit into.
        </Note>

        <div className="mt-4">
          <WasteBar
            netLength={netLength}
            kerfLoss={kerfLoss}
            trimLoss={trimLoss}
            dropLoss={dropLoss}
            purchased={purchased}
          />
        </div>

        <dl className="mt-4 divide-y divide-white/[0.07]">
          <Row
            label="Finished parts"
            value={formatLength(netLength, unit)}
            hint="What ends up in the job"
          />
          <Row
            label="Material bought"
            value={formatLength(purchased, unit)}
            hint="Bars needed × bar length"
          />
          <Row
            label="Left over (unusable ends)"
            value={formatLength(dropLoss + kerfLoss + trimLoss, unit)}
            hint="The short end of each bar once no remaining piece will fit in it. You have paid for it, and it may do for small parts on a later job."
          />
        </dl>

        <Working steps={explainWaste(cost, unit)} />
      </Card>

      {/* Cost roll-up */}
      {priced && detailed ? (
        <Card>
          <SectionTitle>How the total is built up</SectionTitle>
          <Note>
            Materials and extras first, then contingency on top of those, then markup on top of
            that, then tax on everything. The order matters — each step is applied to the running
            total, not to the materials figure.
          </Note>

          <dl className="mt-3 divide-y divide-white/[0.07]">
            <Row label="Materials" value={formatMoney(cost.materials, currency)} />
            {project.extras.map((extra) => (
              <Row
                key={extra.id}
                label={extra.description || "Extra"}
                value={formatMoney(extraCost(extra), currency)}
                hint={`${extra.qty} × ${formatMoney(extra.unitCost, currency)}`}
              />
            ))}
            {cost.contingency ? (
              <Row
                label="Contingency"
                value={formatMoney(cost.contingency, currency)}
                hint={`${project.contingencyPct}% of materials and extras`}
              />
            ) : null}
            {cost.markup ? (
              <Row
                label="Markup"
                value={formatMoney(cost.markup, currency)}
                hint={`${project.markupPct}% of everything above`}
              />
            ) : null}
            {cost.tax ? (
              <>
                <Row label="Subtotal" value={formatMoney(cost.subtotal, currency)} />
                <Row
                  label="Tax"
                  value={formatMoney(cost.tax, currency)}
                  hint={`${project.taxPct}% of the subtotal`}
                />
              </>
            ) : null}
          </dl>

          <div className="mt-3 flex items-baseline justify-between border-t-2 border-amber-500/30 pt-3">
            <span className="text-base font-bold text-slate-50">Total</span>
            <span className="fire-text text-3xl font-extrabold">
              <Money amount={cost.total} currency={currency} />
            </span>
          </div>

          <Working steps={explainRollup(project, cost)} title="Show every step" />
        </Card>
      ) : null}

      {/* Pricing evidence */}
      {cost.lines.some((entry) => entry.price) ? (
        <Card>
          <SectionTitle>Where the prices came from</SectionTitle>
          <Note>
            Each price is stored with its source so any number here can be traced back. This section
            is printed on the exported report too.
          </Note>
          <ul className="mt-3 divide-y divide-white/[0.07]">
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
                <p className="mt-1 text-xs text-slate-400">{citation(entry.price!, SOURCE_LABELS)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {entry.price!.source.attachmentId ? (
                    <Badge tone="good">copy of quote saved</Badge>
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

      <Card>
        <SectionTitle>Not sure about a term?</SectionTitle>
        <Note>
          Kerf, end trim, drop, utilisation and the pricing ratings are all explained in plain
          English, with worked examples.
        </Note>
        <button type="button" className="btn-ghost mt-3 w-full sm:w-auto" onClick={onOpenGuide}>
          Open the guide
        </button>
      </Card>
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

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate-300">
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
      </dt>
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

  // Blade and end trim are real but tiny — a fraction of a percent on a
  // typical job. Shown separately they are noise, so they ride with the
  // leftover, which is the number worth acting on.
  const segments = [
    { label: "Finished parts", value: netLength, colour: "#22c55e" },
    {
      label: "Left over",
      value: Math.max(0, dropLoss + kerfLoss + trimLoss),
      colour: "#475569",
    },
  ].filter((segment) => segment.value > 0);

  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full ring-1 ring-white/10">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className="stock-sheen"
            style={{ width: `${(segment.value / purchased) * 100}%`, background: segment.colour }}
            title={`${segment.label}: ${formatPercent(segment.value / purchased)}`}
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
