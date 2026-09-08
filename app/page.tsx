"use client";

import { useEffect, useState } from "react";

import CutPlanView from "@/components/CutPlanView";
import EstimateView from "@/components/EstimateView";
import ExportSheet from "@/components/ExportSheet";
import GuideView from "@/components/GuideView";
import JobView from "@/components/JobView";
import MaterialsView from "@/components/MaterialsView";
import { formatMoney } from "@/lib/pricing";
import { useWorkspace } from "@/lib/store";
import { describeStock } from "@/lib/units";

export type View = "job" | "estimate" | "cutplan" | "materials" | "guide";

const VIEWS: Array<{ id: View; label: string; plain: string; icon: string }> = [
  { id: "job", label: "Job", plain: "Settings & cut list", icon: "M4 7h16M4 12h16M4 17h10" },
  {
    id: "estimate",
    label: "Estimate",
    plain: "What to buy & what it costs",
    icon: "M4 19V5m5 14V9m5 10V7m5 12v-8",
  },
  { id: "cutplan", label: "Cut plan", plain: "How to cut each bar", icon: "M3 8h18M3 16h18M8 4v16" },
  {
    id: "materials",
    label: "Materials",
    plain: "Prices & where they came from",
    icon: "M12 3 3 8v8l9 5 9-5V8l-9-5Zm0 0v18",
  },
  {
    id: "guide",
    label: "Guide",
    plain: "How the maths works",
    icon: "M12 17h.01M12 13a2.5 2.5 0 1 0-2.5-2.5M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z",
  },
];

export default function Home() {
  const workspace = useWorkspace();
  const [view, setView] = useState<View>("estimate");
  const [exporting, setExporting] = useState(false);
  const { project, cost, materials, migrated } = workspace;

  // Register the offline service worker once the app is interactive.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is a bonus; the app works without it.
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const canExport = cost.totalPieces > 0;
  const usedMaterialIds = project.lines
    .map((line) => line.materialId)
    .filter((id): id is string => Boolean(id));

  const body = (
    <>
      {migrated ? (
        <div className="mb-5 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-100">
          Your previous cut list was carried over. Its material is now under Materials — add a price
          and a source to cost it.
        </div>
      ) : null}
      {view === "job" ? (
        <JobView workspace={workspace} onOpenMaterials={() => setView("materials")} />
      ) : view === "estimate" ? (
        <EstimateView
          project={project}
          cost={cost}
          onOpenMaterials={() => setView("materials")}
          onOpenGuide={() => setView("guide")}
        />
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
      ) : (
        <GuideView project={project} cost={cost} />
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
          {VIEWS.map((entry) => {
            const active = view === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setView(entry.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  active
                    ? "nav-active text-amber-300"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                }`}
              >
                <Icon path={entry.icon} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight">{entry.label}</span>
                  <span className="block truncate text-[11px] leading-tight opacity-70">
                    {entry.plain}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="safe-bottom px-5 py-4 text-[11px] leading-relaxed text-slate-600">
          {project.mode === "quick" ? "Quick estimate" : "Detailed take-off"}
          <br />
          Saved on this device
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top z-30 shrink-0 border-b border-white/10 bg-ink-950/85 backdrop-blur-lg">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-slate-50">
                {project.name || "Untitled job"}
              </p>
              <p className="truncate text-xs text-slate-500">
                {project.client ? `${project.client} · ` : ""}
                {project.lines.length > 1
                  ? `${project.lines.length} materials`
                  : describeStock(project.lines[0]?.stockLength ?? 240, project.unit)}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary shrink-0 px-3 disabled:opacity-40 disabled:shadow-none"
              disabled={!canExport}
              onClick={() => setExporting(true)}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
              Export
            </button>
          </div>

          {canExport ? (
            <div className="border-t border-white/[0.07] bg-gradient-to-r from-amber-500/[0.18] via-orange-500/[0.08] to-transparent">
              <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2">
                <span className="fire-text text-sm font-extrabold">
                  {cost.total > 0
                    ? formatMoney(cost.total, project.currency)
                    : `${cost.totalBars} ${cost.totalBars === 1 ? "BAR" : "BARS"}`}
                </span>
                <span className="truncate text-xs text-amber-100/70">
                  {cost.totalBars} {cost.totalBars === 1 ? "bar" : "bars"} to buy ·{" "}
                  {cost.totalPieces} pieces · {(cost.utilisation * 100).toFixed(1)}% used
                </span>
              </div>
            </div>
          ) : null}
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 lg:px-8 lg:py-8">{body}</div>
        </main>

        {/* Phone tab bar */}
        <nav className="safe-bottom z-30 shrink-0 border-t border-white/10 bg-ink-950/90 backdrop-blur-lg lg:hidden">
          <div className="grid grid-cols-5">
            {VIEWS.map((entry) => {
              const active = view === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${
                    active ? "text-amber-300" : "text-slate-500"
                  }`}
                  onClick={() => setView(entry.id)}
                >
                  <Icon path={entry.icon} />
                  {entry.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {exporting ? (
        <ExportSheet project={project} cost={cost} onClose={() => setExporting(false)} />
      ) : null}
    </div>
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
