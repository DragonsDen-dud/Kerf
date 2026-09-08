"use client";

import { useMemo, useState } from "react";

import SyncPanel from "./SyncPanel";
import { Badge, Card, Note, SectionTitle } from "./ui";
import { costProject, formatMoney } from "@/lib/pricing";
import type { Workspace } from "@/lib/store";
import { STATUS_LABELS, type JobStatus, type Project } from "@/lib/types";

const STATUS_ORDER: JobStatus[] = ["enquiry", "quoted", "won", "ordered", "done"];

const STATUS_TONE: Record<JobStatus, "neutral" | "warn" | "good" | "brand"> = {
  enquiry: "neutral",
  quoted: "warn",
  won: "good",
  ordered: "brand",
  done: "neutral",
};

/**
 * Every job in one place: open one, start another, park the finished ones.
 *
 * The totals shown here are recomputed per job rather than stored, so a price
 * change in the material library is reflected across the whole list at once.
 */
export default function JobsView({
  workspace,
  onOpen,
}: {
  workspace: Workspace;
  onOpen: () => void;
}) {
  const { projects, project, materials, openProject, newProject, duplicateProject, removeProject } =
    workspace;
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects
      .filter((job) => showArchived || !job.archived)
      .filter((job) =>
        needle
          ? [job.name, job.client, job.reference].join(" ").toLowerCase().includes(needle)
          : true,
      );
  }, [projects, query, showArchived, ]);

  const archivedCount = projects.filter((job) => job.archived).length;

  const open = (id: string) => {
    openProject(id);
    onOpen();
  };

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>Your jobs</SectionTitle>
      <Note>Each job keeps its own materials, cut list, pricing and export settings. Open one to work on it; the rest stay exactly as you left them.</Note>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by job, client or reference"
            aria-label="Search jobs"
            className="field flex-1"
          />
          <button
            type="button"
            className="btn-primary shrink-0"
            onClick={() => {
              newProject();
              onOpen();
            }}
          >
            + New job
          </button>
        </div>

        {archivedCount > 0 ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            Show {archivedCount} archived {archivedCount === 1 ? "job" : "jobs"}
          </label>
        ) : null}
      </Card>

      {visible.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-400">
            {query ? `Nothing matches “${query}”.` : "No jobs yet — start one above."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              active={job.id === project.id}
              total={summarise(job, materials)}
              confirming={confirming === job.id}
              onOpen={() => open(job.id)}
              onStatus={(status) => workspace.patchProjectById(job.id, { status })}
              onArchive={() =>
                workspace.patchProjectById(job.id, { archived: !job.archived })
              }
              onDuplicate={() => {
                duplicateProject(job.id);
                onOpen();
              }}
              onAskDelete={() => setConfirming(job.id)}
              onCancelDelete={() => setConfirming(null)}
              onDelete={() => {
                removeProject(job.id);
                setConfirming(null);
              }}
            />
          ))}
        </ul>
      )}

      <SyncPanel sync={workspace.sync} jobCount={projects.length} />
    </div>
  );
}

function summarise(job: Project, materials: Parameters<typeof costProject>[1]) {
  const cost = costProject(job, materials);
  return {
    bars: cost.totalBars,
    pieces: cost.totalPieces,
    money: cost.total > 0 ? formatMoney(cost.total, job.currency) : null,
  };
}

function JobRow({
  job,
  active,
  total,
  confirming,
  onOpen,
  onStatus,
  onArchive,
  onDuplicate,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  job: Project;
  active: boolean;
  total: { bars: number; pieces: number; money: string | null };
  confirming: boolean;
  onOpen: () => void;
  onStatus: (status: JobStatus) => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={`rounded-2xl border p-4 transition ${
        active
          ? "border-amber-500/40 bg-amber-500/[0.06]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20"
      } ${job.archived ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-2 truncate text-base font-bold text-slate-50">
            {job.name || "Untitled job"}
            {active ? <span className="text-[11px] font-bold text-amber-400">· OPEN</span> : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {[job.client, job.reference].filter(Boolean).join(" · ") || "No client or reference"}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {total.money ? (
              <span className="font-bold text-amber-300">{total.money}</span>
            ) : (
              <span className="text-slate-500">Not priced</span>
            )}
            <span>
              {total.bars} {total.bars === 1 ? "bar" : "bars"}
            </span>
            <span>{total.pieces} pieces</span>
            <span className="text-slate-600">{when(job.updatedAt)}</span>
          </p>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABELS[job.status]}</Badge>
          <button type="button" className="btn-ghost !min-h-9 px-3 text-xs" onClick={onOpen}>
            Open
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
        <label className="sr-only" htmlFor={`status-${job.id}`}>
          Status for {job.name || "this job"}
        </label>
        <select
          id={`status-${job.id}`}
          value={job.status}
          onChange={(event) => onStatus(event.target.value as JobStatus)}
          className="field !min-h-9 !w-auto !py-1 text-xs"
        >
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <button type="button" className="btn-ghost !min-h-9 px-3 text-xs" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="btn-ghost !min-h-9 px-3 text-xs" onClick={onArchive}>
          {job.archived ? "Restore" : "Archive"}
        </button>

        {confirming ? (
          <span className="ml-auto flex items-center gap-2 text-xs text-rose-200">
            Delete for good?
            <button
              type="button"
              className="rounded-lg bg-rose-600 px-2.5 py-1 font-bold text-white"
              onClick={onDelete}
            >
              Delete
            </button>
            <button type="button" className="text-slate-400" onClick={onCancelDelete}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="ml-auto text-xs text-slate-500 hover:text-rose-300"
            onClick={onAskDelete}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

/** "3 days ago" reads faster than a date when scanning a list. */
function when(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
