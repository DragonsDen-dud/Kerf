"use client";

import { Card, Note, SectionTitle } from "./ui";
import { GLOSSARY, explainRollup, explainWaste } from "@/lib/explain";
import { formatMoney, type ProjectCost } from "@/lib/pricing";
import type { Project } from "@/lib/types";
import { formatValue, unitAbbr } from "@/lib/units";

/**
 * The guide: how every number in the app is arrived at, written in plain
 * English and worked through with the numbers currently in the job so it is
 * never abstract.
 */
export default function GuideView({ project, cost }: { project: Project; cost: ProjectCost }) {
  const { unit, currency } = project;
  const u = unitAbbr(unit);
  const first = cost.lines[0];
  const hasJob = cost.totalPieces > 0 && first;

  return (
    <div className="space-y-5">
      <section className="fire-panel">
        <span className="fire-rim" aria-hidden="true" />
        <h1 className="fire-text text-3xl font-extrabold lg:text-4xl">How this works</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-amber-50/85">
          Nothing here is a black box. This page walks through every calculation the app performs,
          in order, using the numbers currently in your job. If a figure ever looks wrong, this is
          where to check it.
        </p>
      </section>

      {/* The method, step by step */}
      <Card>
        <SectionTitle>The method, step by step</SectionTitle>
        <ol className="space-y-4">
          <GuideStep
            n={1}
            title="Work out how much of each bar you can actually use"
            body={`A bar is only as useful as what is left after end trim. Usable length = bar length − end trim. If you dock 1 ${u} off every new bar, a ${formatValue(240, unit)} ${u} bar gives you ${formatValue(239, unit)} ${u} to cut from.`}
            live={
              hasJob
                ? `Your first material: ${formatValue(first.line.stockLength, unit)} ${u} bar − ${formatValue(first.line.endTrim, unit)} ${u} trim = ${formatValue(first.result.totals.usableLength, unit)} ${u} usable.`
                : undefined
            }
          />
          <GuideStep
            n={2}
            title="Sort the pieces longest first"
            body="Long pieces are the hard ones to place, so they go down first while every bar is still empty. Short pieces are easy and get used afterwards to fill the gaps. This is why the order you type your cut list in makes no difference to the answer."
          />
          <GuideStep
            n={3}
            title="Charge every piece one blade width"
            body={`The saw does not cut a line, it cuts a slot as wide as the blade. So a piece does not need its own length on the bar — it needs its length plus one blade width. That is what stops a "240 ${u} bar fits four 60 ${u} pieces" answer that fails on the shop floor.`}
            live={
              hasJob
                ? `Your setting: ${formatValue(first.line.kerf, unit)} ${u} blade. Across ${cost.totalPieces} pieces that is ${formatValue(cost.lines.reduce((s, l) => s + l.result.totals.kerfLoss, 0), unit)} ${u} of material turned to dust.`
                : undefined
            }
          />
          <GuideStep
            n={4}
            title="Fit the pieces onto bars"
            body="Two ways to do this, and you choose per material in the Job screen. Optimised puts each piece into the earliest bar that still has room, so short pieces back-fill the gaps left by long ones. Match spreadsheet cuts straight down the list from one bar at a time, and starts a new bar the moment something does not fit — which is what the original spreadsheet did, and usually needs more bars."
            live={
              hasJob
                ? `Your first material uses the ${first.line.strategy === "optimized" ? "optimised" : "match spreadsheet"} setting and needs ${first.result.totals.barsNeeded} bars.`
                : undefined
            }
          />
          <GuideStep
            n={5}
            title="Count whole bars"
            body="You cannot buy three-quarters of a bar. Whatever is left on the last bar is drop — you have paid for it either way, so it stays in the numbers rather than quietly disappearing."
          />
          <GuideStep
            n={6}
            title="Turn bars into money"
            body={`Cost of one bar depends on how the supplier quoted it. Quoted per bar, the price is used as-is (and scaled if you are buying a different length than was quoted). Quoted per foot or per metre, the whole bar is charged — including the drop you will not use. Then: bars × cost per bar = the cost of that material.`}
            live={
              hasJob && first.price
                ? `Your first material: ${first.result.totals.barsNeeded} bars × ${formatMoney(first.barCost, currency)} = ${formatMoney(first.cost, currency)}.`
                : undefined
            }
          />
          <GuideStep
            n={7}
            title="Build up to the total"
            body="Materials and extras are added first. Contingency is then a percentage of that. Markup is a percentage of materials plus extras plus contingency — so your margin covers the contingency too. Tax comes last, on everything. Each percentage applies to the running total, not to the materials figure."
            live={
              cost.total > 0 && project.mode === "detailed"
                ? `Your total: ${formatMoney(cost.total, currency)}.`
                : undefined
            }
          />
        </ol>
      </Card>

      {/* Worked example on the live job */}
      {hasJob ? (
        <Card>
          <SectionTitle>Worked through with your numbers</SectionTitle>
          <Note>
            The same figures as the Estimate screen, laid out as sums rather than as a table.
          </Note>
          <div className="mt-3 space-y-4">
            <WorkedBlock title="Material" steps={explainWaste(cost, unit)} />
            {cost.total > 0 && project.mode === "detailed" ? (
              <WorkedBlock title="Money" steps={explainRollup(project, cost)} />
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Quick vs detailed */}
      <Card>
        <SectionTitle>Quick estimate or detailed take-off?</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-base font-bold text-slate-50">Quick estimate</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              One material, one cut list, straight to a number. No extras, no contingency, no
              markup, no tax — just what the steel costs. Use it for a phone call, a rough budget,
              or a sanity check before you commit time to the full job.
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-4">
            <h3 className="text-base font-bold text-slate-50">Detailed take-off</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              As many materials as the job needs, each with its own stock length and saw settings,
              plus extras for labour and finishing, and contingency, markup and tax on top. Use it
              for anything that turns into a real quotation or a purchase order.
            </p>
          </div>
        </div>
        <Note>
          Switching between them never deletes anything. Quick estimate simply costs the first
          material and hides the rest until you switch back.
        </Note>
      </Card>

      {/* Pricing confidence */}
      <Card>
        <SectionTitle>How solid is the price?</SectionTitle>
        <Note>
          Every price you save records where it came from. That decides the rating printed on the
          estimate and on the exported report, so a rough figure never gets mistaken for a firm
          quotation.
        </Note>
        <dl className="mt-3 divide-y divide-white/[0.07]">
          <ConfidenceRow
            rating="Firm"
            sources="Written quote, past invoice"
            meaning="Someone has committed to this price in writing. Safe to quote from."
          />
          <ConfidenceRow
            rating="Indicative"
            sources="Supplier website, phone call, trade counter, price list"
            meaning="Real, but nobody has committed to it. Confirm in writing before you order."
          />
          <ConfidenceRow
            rating="Assumed"
            sources="Your own estimate"
            meaning="A guess. Fine for a budget, not for a tender."
          />
        </dl>
        <Note>
          A job can only claim the weakest rating of any material in it. One assumed price makes the
          whole estimate assumed — which is the honest answer.
        </Note>
      </Card>

      {/* Glossary */}
      <Card>
        <SectionTitle>Terms used in this app</SectionTitle>
        <dl className="divide-y divide-white/[0.07]">
          {GLOSSARY.map((term) => (
            <div key={term.term} className="py-3">
              <dt className="text-base font-bold text-slate-50">{term.term}</dt>
              <dd className="mt-0.5 text-sm font-medium text-amber-200/80">{term.short}</dd>
              <dd className="mt-1.5 text-sm leading-relaxed text-slate-400">{term.long}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Limits */}
      <Card>
        <SectionTitle>What this does not do</SectionTitle>
        <ul className="space-y-2 text-sm leading-relaxed text-slate-400">
          <li>
            <span className="font-semibold text-slate-200">It does not credit drop back.</span> Long
            offcuts often get used on the next job, but this take-off assumes they do not, so the
            number is conservative rather than optimistic.
          </li>
          <li>
            <span className="font-semibold text-slate-200">It only cuts in one direction.</span>{" "}
            This is for linear stock — bar, tube, angle, timber. Sheet material needs
            two-dimensional nesting, which is a different problem.
          </li>
          <li>
            <span className="font-semibold text-slate-200">
              It does not know your supplier&apos;s stock.
            </span>{" "}
            It assumes bars are available in the length you set. Check availability before ordering.
          </li>
          <li>
            <span className="font-semibold text-slate-200">
              It does not guarantee the fewest possible bars.
            </span>{" "}
            Perfect packing is a famously hard problem. The optimised setting is very close in
            practice; the Estimate screen shows the theoretical best so you can see the gap.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function GuideStep({
  n,
  title,
  body,
  live,
}: {
  n: number;
  title: string;
  body: string;
  live?: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-sm font-extrabold text-ink-950">
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-slate-50">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">{body}</p>
        {live ? (
          <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 font-mono text-xs leading-relaxed text-amber-200/90">
            {live}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function WorkedBlock({
  title,
  steps,
}: {
  title: string;
  steps: Array<{ label: string; formula: string; result: string; note?: string }>;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={index}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-semibold text-slate-100">{step.label}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-amber-300">
                {step.result}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-xs leading-relaxed text-slate-400">{step.formula}</p>
            {step.note ? <p className="mt-1 text-xs text-slate-500">{step.note}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ConfidenceRow({
  rating,
  sources,
  meaning,
}: {
  rating: string;
  sources: string;
  meaning: string;
}) {
  return (
    <div className="py-3">
      <dt className="flex flex-wrap items-baseline gap-2">
        <span className="text-base font-bold text-slate-50">{rating}</span>
        <span className="text-xs text-slate-500">{sources}</span>
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-slate-400">{meaning}</dd>
    </div>
  );
}
