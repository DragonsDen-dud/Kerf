"use client";

import { useMemo, useState } from "react";

import BarDiagram from "./BarDiagram";
import { groupBars, summariseBar, type PackResult } from "@/lib/pack";
import { colourFor } from "@/lib/palette";
import type { Job } from "@/lib/store";
import { formatLength, formatValue } from "@/lib/units";

interface Props {
  job: Job;
  result: PackResult;
}

/**
 * Function #2 — the breakdown. For every bar, which pieces come off it and in
 * what order, with identical bars grouped so a 40-bar job stays readable.
 */
export default function LayoutTab({ job, result }: Props) {
  const [grouped, setGrouped] = useState(true);
  const { unit } = job;
  const groups = useMemo(() => groupBars(result.bars), [result.bars]);

  if (result.totals.pieces === 0) {
    return (
      <div className="card text-center text-slate-400">
        <p className="text-lg font-semibold text-slate-200">No layout yet</p>
        <p className="mt-1 text-sm">Add pieces on the Job tab to see how each bar gets cut.</p>
      </div>
    );
  }

  const rows = grouped
    ? groups.map((group) => ({
        key: group.signature || String(group.representative.index),
        bar: group.representative,
        indices: group.bars.map((b) => b.index),
      }))
    : result.bars.map((bar) => ({ key: String(bar.index), bar, indices: [bar.index] }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {result.totals.barsNeeded} bars · {groups.length} distinct pattern
          {groups.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200"
          onClick={() => setGrouped((g) => !g)}
        >
          {grouped ? "Show every bar" : "Group identical"}
        </button>
      </div>

      {rows.map(({ key, bar, indices }) => (
        <section key={key} className="card">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-base font-bold text-slate-50">
              {indices.length === 1 ? `Bar ${indices[0]}` : `Bars ${compactRanges(indices)}`}
              {indices.length > 1 ? (
                <span className="ml-2 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                  x{indices.length}
                </span>
              ) : null}
            </h3>
            <span className="text-xs text-slate-500">{bar.pieces.length} cuts</span>
          </div>

          <BarDiagram
            bar={bar}
            usableLength={result.totals.usableLength}
            parts={job.parts}
            unit={unit}
          />

          <ol className="mt-3 space-y-1.5">
            {summariseBar(bar).map((group, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: colourFor(job.parts, group.partId) }}
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
        </section>
      ))}
    </div>
  );
}

/** `1,2,3,7,8` -> `1-3, 7-8`. */
function compactRanges(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i += 1) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  return parts.join(", ");
}
