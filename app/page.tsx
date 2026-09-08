"use client";

import { useState } from "react";

import CutPlanView from "@/components/CutPlanView";
import EstimateView from "@/components/EstimateView";
import ExportView from "@/components/ExportView";
import GuideView from "@/components/GuideView";
import JobView from "@/components/JobView";
import JobsView from "@/components/JobsView";
import MaterialsView from "@/components/MaterialsView";
import { Card, Note, SectionTitle } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import { useWorkspace } from "@/lib/store";
import { useUpdateAvailable } from "@/lib/version";

export type View =
  | "jobs"
  | "takeoff"
  | "costs"
  | "export"
  | "cutplan"
  | "materials"
  | "guide"
  | "more";

interface NavEntry {
  id: View;
  label: string;
  /** One line saying what the screen is for — this is the whole point of it. */
  plain: string;
  icon: string;
}

const NAV: NavEntry[] = [
  {
    id: "jobs",
    label: "Jobs",
    plain: "Every job you have started",
    icon: "M4 6h16M4 12h16M4 18h16",
  },
  {
    id: "takeoff",
    label: "Take-off",
    plain: "Enter the materials and the pieces to cut",
    icon: "M3 8h18M8 4v16M3 16h18",
  },
  {
    id: "costs",
    label: "Costs",
    plain: "What it comes to, and how that was worked out",
    icon: "M4 19V5m5 14V9m5 10V7m5 12v-8",
  },
  {
    id: "export",
    label: "Export",
    plain: "Build the purchase list or the take-off sheet",
    icon: "M12 16V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  },
  {
    id: "cutplan",
    label: "Cut plan",
    plain: "How to cut each bar, for the saw",
    icon: "M6 3v12m12-12v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  },
  {
    id: "materials",
    label: "Materials",
    plain: "Your prices, and the proof behind them",
    icon: "M12 3 3 8v8l9 5 9-5V8l-9-5Zm0 0v18",
  },
  {
    id: "guide",
    label: "Guide",
    plain: "What every number on the screens means",
    icon: "M12 17h.01M12 13a2.5 2.5 0 1 0-2.5-2.5M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z",
  },
];

/** The phone has room for four screens plus a way to reach the rest. */
const PHONE_TABS: View[] = ["jobs", "takeoff", "costs", "export"];
const MORE_TABS: View[] = ["cutplan", "materials", "guide"];

const entry = (id: View) => NAV.find((item) => item.id === id)!;

export default function Home() {
  const workspace = useWorkspace();
  const [view, setView] = useState<View>("jobs");
  const { project, cost, materials, migrated } = workspace;
  const update = useUpdateAvailable();

  const usedMaterialIds = project.lines
    .map((line) => line.materialId)
    .filter((id): id is string => Boolean(id));

  const current = view === "more" ? null : entry(view);

  const body = (
    <>
      {update.ready ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          <span>A newer version of Kerf is ready. This tab is still running the old one.</span>
          <button type="button" className="btn-primary !min-h-9 px-3 text-xs" onClick={update.reload}>
            Reload
          </button>
        </div>
      ) : null}

      {migrated ? (
        <div className="mb-5 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-100">
          Your previous cut list was carried over. Its material is now under Materials — add a price
          and a source to cost it.
        </div>
      ) : null}

      {current ? (
        <p className="mb-4 text-sm leading-relaxed text-slate-400">{current.plain}.</p>
      ) : null}

      {view === "jobs" ? (
        <JobsView workspace={workspace} onOpen={() => setView("takeoff")} />
      ) : view === "takeoff" ? (
        <JobView workspace={workspace} onOpenMaterials={() => setView("materials")} />
      ) : view === "costs" ? (
        <EstimateView
          project={project}
          cost={cost}
          onOpenMaterials={() => setView("materials")}
          onOpenGuide={() => setView("guide")}
        />
      ) : view === "export" ? (
        <ExportView project={project} cost={cost} patchProject={workspace.patchProject} />
      ) : view === "cutplan" ? (
        <CutPlanView project={project} cost={cost} />
      ) : view === "materials" ? (
        <MaterialsView
          project={project}
          materials={materials}
          usedMaterialIds={usedMaterialIds}
          saveMaterial={workspace.saveMaterial}
          removeMaterial={workspace.removeMaterial}
          addPrice={workspace.addPrice}
          removePrice={workspace.removePrice}
        />
      ) : view === "guide" ? (
        <GuideView project={project} cost={cost} />
      ) : (
        <MoreMenu onPick={setView} />
      )}
    </>
  );

  return (
    // A fixed app shell: only the content column scrolls, so the header, the
    // desktop sidebar and the phone tab bar all stay put.
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-ink-950/70 lg:flex xl:w-64">
        <div className="safe-top px-5 py-5">
          <p className="fire-text text-xl font-extrabold tracking-tight">KERF</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Material take-off
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setView(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  active
                    ? "nav-active text-amber-300"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                }`}
              >
                <Icon path={item.icon} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight">{item.label}</span>
                  <span className="block truncate text-[11px] leading-tight opacity-70">
                    {item.plain}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="safe-bottom px-5 py-4 text-[11px] leading-relaxed text-slate-600">
          {workspace.sync.code ? "Synced across your devices" : "Saved on this device"}
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top z-30 shrink-0 border-b border-white/10 bg-ink-950/85 backdrop-blur-lg">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setView("jobs")}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-base font-bold text-slate-50">
                {project.name || "Untitled job"}
              </p>
              <p className="truncate text-xs text-slate-500">
                {project.client ? `${project.client} · ` : ""}
                {cost.totalPieces > 0
                  ? `${cost.totalBars} ${cost.totalBars === 1 ? "bar" : "bars"} · ${cost.totalPieces} pieces`
                  : "Nothing to cut yet"}
                {cost.total > 0 ? ` · ${formatMoney(cost.total, project.currency)}` : ""}
              </p>
            </button>
            {view !== "export" && cost.totalPieces > 0 ? (
              <button
                type="button"
                className="btn-primary shrink-0 px-3"
                onClick={() => setView("export")}
              >
                Export
              </button>
            ) : null}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 lg:px-8 lg:py-8">{body}</div>
        </main>

        {/* Phone tab bar */}
        <nav className="safe-bottom z-30 shrink-0 border-t border-white/10 bg-ink-950/90 backdrop-blur-lg lg:hidden">
          <div className="grid grid-cols-5">
            {PHONE_TABS.map((id) => {
              const item = entry(id);
              const active = view === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
                    active ? "text-amber-300" : "text-slate-500"
                  }`}
                  onClick={() => setView(id)}
                >
                  <Icon path={item.icon} />
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-current={view === "more" || MORE_TABS.includes(view) ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
                view === "more" || MORE_TABS.includes(view) ? "text-amber-300" : "text-slate-500"
              }`}
              onClick={() => setView("more")}
            >
              <Icon path="M5 12h.01M12 12h.01M19 12h.01" />
              More
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

/** The phone's overflow menu — the screens that are not part of daily use. */
function MoreMenu({ onPick }: { onPick: (view: View) => void }) {
  return (
    <Card>
      <SectionTitle>More</SectionTitle>
      <Note>The rest of the app. These are here when you need them, not every day.</Note>
      <ul className="mt-3 divide-y divide-white/[0.07]">
        {MORE_TABS.map((id) => {
          const item = entry(id);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onPick(id)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <Icon path={item.icon} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-100">{item.label}</span>
                  <span className="block text-xs text-slate-500">{item.plain}</span>
                </span>
                <span className="text-slate-600">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
