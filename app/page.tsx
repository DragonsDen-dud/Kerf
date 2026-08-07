"use client";

import { useEffect, useState } from "react";

import EstimateTab from "@/components/EstimateTab";
import JobTab from "@/components/JobTab";
import LayoutTab from "@/components/LayoutTab";
import ShareSheet from "@/components/ShareSheet";
import { useJob } from "@/lib/store";
import { describeStock } from "@/lib/units";

type Tab = "job" | "estimate" | "layout";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "job", label: "Job", icon: "M4 7h16M4 12h16M4 17h10" },
  { id: "estimate", label: "Estimate", icon: "M4 19V5m5 14V9m5 10V7m5 12v-8" },
  { id: "layout", label: "Layout", icon: "M3 8h18M3 16h18M8 4v16" },
];

export default function Home() {
  const store = useJob();
  const [tab, setTab] = useState<Tab>("estimate");
  const [sharing, setSharing] = useState(false);
  const { job, result } = store;

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

  const canShare = result.totals.pieces > 0;

  return (
    // A fixed app shell: only <main> scrolls, so the header and tab bar stay
    // put the way they would in a native app.
    <div className="fixed inset-0 mx-auto flex w-full max-w-2xl flex-col overflow-hidden">
      <header className="safe-top z-30 shrink-0 border-b border-white/10 bg-ink-950/85 backdrop-blur-lg">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-50">
              {job.name || "Untitled job"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {job.material ? `${job.material} · ` : ""}
              {describeStock(job.settings.stockLength, job.unit)} stock
            </p>
          </div>
          <button
            type="button"
            className="btn-primary shrink-0 px-3 disabled:opacity-40"
            disabled={!canShare}
            onClick={() => setSharing(true)}
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
            PNG
          </button>
        </div>

        {canShare ? (
          <div className="flex items-center gap-2 border-t border-white/[0.07] bg-amber-500/10 px-4 py-2">
            <span className="text-sm font-extrabold text-amber-300">
              BUY {result.totals.barsNeeded} {result.totals.barsNeeded === 1 ? "BAR" : "BARS"}
            </span>
            <span className="truncate text-xs text-amber-100/70">
              {result.totals.pieces} pieces ·{" "}
              {(result.totals.utilisation * 100).toFixed(1)}% used
            </span>
          </div>
        ) : null}
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        {tab === "job" ? (
          <JobTab
            job={job}
            patch={store.patch}
            patchSettings={store.patchSettings}
            updatePart={store.updatePart}
            addPart={store.addPart}
            removePart={store.removePart}
            duplicatePart={store.duplicatePart}
            reset={store.reset}
            impossible={result.impossible}
          />
        ) : tab === "estimate" ? (
          <EstimateTab job={job} result={result} />
        ) : (
          <LayoutTab job={job} result={result} />
        )}
      </main>

      <nav className="safe-bottom z-30 shrink-0 border-t border-white/10 bg-ink-950/90 backdrop-blur-lg">
        <div className="grid grid-cols-3">
          {TABS.map((entry) => {
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
                  active ? "text-amber-400" : "text-slate-500"
                }`}
                onClick={() => setTab(entry.id)}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d={entry.icon} />
                </svg>
                {entry.label}
              </button>
            );
          })}
        </div>
      </nav>

      {sharing ? (
        <ShareSheet job={job} result={result} onClose={() => setSharing(false)} />
      ) : null}
    </div>
  );
}
