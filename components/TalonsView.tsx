"use client";

import { useMemo, useState } from "react";

import BarDiagram from "./BarDiagram";
import { Badge, Card, Empty, SectionTitle } from "./ui";
import { groupBars, summariseBar } from "@/lib/pack";
import { colourFor } from "@/lib/palette";
import type { LineCost, ProjectCost } from "@/lib/pricing";
import { compactRanges } from "@/lib/report";
import type { Project } from "@/lib/types";
import { formatLength, formatValue } from "@/lib/units";

/**
 * TALONS — where the cutting happens. For every bar, which pieces come off it
 * and in what order, with identical bars grouped so a 40-bar job stays readable.
 */
export default function TalonsView({ project, cost }: { project: Project; cost: ProjectCost }) {
  const [grouped, setGrouped] = useState(true);
  const withBars = cost.lines.filter((entry) => entry.result.bars.length > 0);

  if (withBars.length === 0) {
    return (
      <Empty
        title="No layout yet"
        body="Add pieces in the Den to see how each bar gets cut."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {cost.totalBars} bars across {withBars.length} line{withBars.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.1]"
          onClick={() => setGrouped((value) => !value)}
        >
          {grouped ? "Show every bar" : "Group identical"}
        </button>
      </div>

      {withBars.map((entry) => (
        <LineLayout
          key={entry.line.id}
          entry={entry}
          project={project}
          grouped={grouped}
          showHeading={cost.lines.length > 1}
        />
      ))}
    </div>
  );
}

function LineLayout({
  entry,
  project,
  grouped,
  showHeading,
}: {
  entry: LineCost;
  project: Project;
  grouped: boolean;
  showHeading: boolean;
}) {
  const { unit } = project;
  const groups = useMemo(() => groupBars(entry.result.bars), [entry.result.bars]);

  const rows = grouped
    ? groups.map((group) => ({
        key: group.signature || String(group.representative.index),
        bar: group.representative,
        indices: group.bars.map((b) => b.index),
      }))
    : entry.result.bars.map((bar) => ({ key: String(bar.index), bar, indices: [bar.index] }));

  return (
    <section className="space-y-4">
      {showHeading ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
          <h2 className="text-base font-bold text-slate-50">
            {entry.line.name || "Line"}
            {entry.material ? (
              <span className="ml-2 text-sm font-medium text-slate-400">{entry.material.name}</span>
            ) : null}
          </h2>
          <Badge tone="brand">
            {entry.result.totals.barsNeeded} bars · {groups.length} pattern
            {groups.length === 1 ? "" : "s"}
          </Badge>
        </div>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-2">
        {rows.map(({ key, bar, indices }) => (
          <Card key={key}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-base font-bold text-slate-50">
                {indices.length === 1 ? `Bar ${indices[0]}` : `Bars ${compactRanges(indices)}`}
                {indices.length > 1 ? (
                  <span className="ml-2 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                    ×{indices.length}
                  </span>
                ) : null}
              </h3>
              <span className="text-xs text-slate-500">{bar.pieces.length} cuts</span>
            </div>

            <BarDiagram
              bar={bar}
              usableLength={entry.result.totals.usableLength}
              parts={entry.line.parts}
              unit={unit}
            />

            <ol className="mt-3 space-y-1.5">
              {summariseBar(bar).map((group, index) => (
                <li key={index} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: colourFor(entry.line.parts, group.partId) }}
                  />
                  <span className="font-bold tabular-nums text-slate-100">{group.qty} ×</span>
                  <span className="font-semibold tabular-nums text-slate-100">
                    {formatValue(group.length, unit)}
                  </span>
                  {group.label ? <span className="text-slate-400">{group.label}</span> : null}
                </li>
              ))}
            </ol>

            <div className="mt-3 flex justify-between border-t border-white/[0.07] pt-2.5 text-xs text-slate-400">
              <span>Used {formatLength(bar.used, unit)}</span>
              <span>Kerf {formatLength(bar.kerfLoss, unit)}</span>
              <span className={bar.remaining > 0.01 ? "text-amber-300" : ""}>
                Drop {formatLength(bar.remaining, unit)}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
