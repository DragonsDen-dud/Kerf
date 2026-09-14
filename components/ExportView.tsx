"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PurchaseOptions from "./PurchaseOptions";
import { Card, Note, SectionTitle, Segmented } from "./ui";
import {
  buildCsv,
  buildCutListCsv,
  buildPartsCsv,
  buildPurchaseCsv,
  downloadText,
  slug,
} from "@/lib/exports";
import { formatMoney, type ProjectCost } from "@/lib/pricing";
import { buildPurchasePlan, defaultConfig, type PurchaseConfig } from "@/lib/purchase";
import { renderPurchaseList } from "@/lib/purchaseReport";
import {
  DEFAULT_CUT_SHEET,
  renderCutSheet,
  type CutOrder,
  type CutSheetConfig,
} from "@/lib/cutSheet";
import {
  DEFAULT_REPORT_OPTIONS,
  canvasToBlob,
  renderReport,
  type ReportOptions,
} from "@/lib/report";
import type { Material, Project } from "@/lib/types";

type Sheet = "purchase" | "cut" | "takeoff";

const SHEET_LABEL: Record<Sheet, string> = {
  purchase: "Purchase list",
  cut: "Cut list",
  takeoff: "Take-off report",
};
type Status = "rendering" | "ready" | "error";

/**
 * The export screen is the sheet.
 *
 * What you see here is the actual image that gets sent — it is redrawn on
 * every change rather than approximated — so ticking a box, typing a price or
 * editing the heading shows you the finished document immediately. Nothing is
 * decided on a later confirmation screen.
 */
export default function ExportView({
  project,
  cost,
  materials,
  patchProject,
}: {
  project: Project;
  cost: ProjectCost;
  materials: Material[];
  patchProject: (changes: Partial<Project>) => void;
}) {
  const [sheet, setSheet] = useState<Sheet>("purchase");
  const [reportOptions, setReportOptions] = useState<ReportOptions>(DEFAULT_REPORT_OPTIONS);
  const [purchaseConfig, setPurchaseConfig] = useState<PurchaseConfig>(() =>
    defaultConfig(project, cost),
  );
  const [cutConfig, setCutConfig] = useState<CutSheetConfig>(DEFAULT_CUT_SHEET);

  const materialNames = useMemo(
    () => Object.fromEntries(materials.map((material) => [material.id, material.name])),
    [materials],
  );

  const [status, setStatus] = useState<Status>("rendering");
  const [dataUrl, setDataUrl] = useState("");
  const [message, setMessage] = useState("");
  const blobRef = useRef<Blob | null>(null);

  const plan = useMemo(
    () => buildPurchasePlan(project, cost, purchaseConfig),
    [project, cost, purchaseConfig],
  );

  const base = slug(project.name || "take-off");
  const fileName =
    sheet === "purchase"
      ? `${base}-purchase-list.png`
      : sheet === "cut"
        ? `${base}-cut-list.png`
        : `${base}-takeoff.png`;

  useEffect(() => {
    let cancelled = false;
    setStatus("rendering");

    // Let the panel paint before the synchronous canvas work.
    const timer = setTimeout(() => {
      try {
        const canvas =
          sheet === "purchase"
            ? renderPurchaseList(project, plan, purchaseConfig)
            : sheet === "cut"
              ? renderCutSheet(project, cutConfig, materialNames)
              : renderReport(project, cost, reportOptions);
        void canvasToBlob(canvas).then((blob) => {
          if (!cancelled) blobRef.current = blob;
        });
        if (cancelled) return;
        setDataUrl(canvas.toDataURL("image/png"));
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Could not build the image");
        setStatus("error");
      }
    }, 16);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sheet, project, cost, reportOptions, plan, purchaseConfig, cutConfig, materialNames]);

  const share = async () => {
    const blob = blobRef.current;
    if (!blob) return;

    const file = new File([blob], fileName, { type: "image/png" });
    const shareData = { files: [file], title: project.name || "Take-off" };

    if (navigator.canShare?.(shareData) && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        // Cancelling the share sheet is not a failure worth reporting.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    savePng();
    setMessage("Sharing isn't available here, so the PNG was downloaded instead.");
  };

  const savePng = () => {
    const blob = blobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const nothingToShow = cost.totalPieces === 0;

  const preview =
    status === "error" ? (
      <p className="py-16 text-center text-sm text-rose-300">{message}</p>
    ) : !dataUrl ? (
      <p className="py-16 text-center text-sm text-slate-400">Building the sheet…</p>
    ) : (
      <div className={status === "rendering" ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={SHEET_LABEL[sheet]}
          className="mx-auto w-full rounded-xl shadow-2xl ring-1 ring-white/10"
        />
      </div>
    );

  if (nothingToShow) {
    return (
      <Card>
        <SectionTitle>Export</SectionTitle>
        <Note>Nothing to show yet — add some parts on the Take-off screen.</Note>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>Which sheet</SectionTitle>
        <Note>What you see below is the finished image. Change anything and it redraws.</Note>
        <div className="mt-3">
          <Segmented<Sheet>
            value={sheet}
            onChange={setSheet}
            options={[
              { value: "purchase", label: "Purchase list", hint: "What to buy" },
              { value: "cut", label: "Cut list", hint: "What to cut, for the shop" },
              { value: "takeoff", label: "Take-off report", hint: "Full working, for a quote" },
            ]}
          />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[23rem_1fr] lg:items-start">
        {/* Preview first on a phone: the point is watching it change. */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-0">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionTitle>Preview</SectionTitle>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary !min-h-10 px-3 text-xs disabled:opacity-40"
                  disabled={status === "error"}
                  onClick={() => void share()}
                >
                  Share PNG
                </button>
                <button
                  type="button"
                  className="btn-ghost !min-h-10 px-3 text-xs disabled:opacity-40"
                  disabled={status === "error"}
                  onClick={savePng}
                >
                  Save PNG
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto rounded-xl">{preview}</div>
            {message ? <p className="mt-2 text-xs text-amber-300">{message}</p> : null}
          </Card>
        </div>

        <div className="order-2 space-y-5 lg:order-1">
          <HeaderFields project={project} patchProject={patchProject} />

          {sheet === "purchase" ? (
            <PurchaseOptions
              project={project}
              plan={plan}
              config={purchaseConfig}
              onChange={setPurchaseConfig}
            />
          ) : sheet === "cut" ? (
            <CutOptions config={cutConfig} onChange={setCutConfig} />
          ) : (
            <TakeoffOptions
              options={reportOptions}
              onChange={setReportOptions}
              headlinePlaceholder={
                cost.total > 0
                  ? formatMoney(cost.total, project.currency)
                  : `BUY ${cost.totalBars} ${cost.totalBars === 1 ? "BAR" : "BARS"}`
              }
            />
          )}

          <Card>
            <SectionTitle>Also save as a spreadsheet</SectionTitle>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {sheet === "cut" ? (
                <button
                  type="button"
                  className="btn-ghost !min-h-10 text-xs sm:col-span-2"
                  onClick={() =>
                    downloadText(`${base}-cut-list.csv`, buildPartsCsv(project, cutConfig), "text/csv")
                  }
                >
                  Cut list CSV
                </button>
              ) : sheet === "purchase" ? (
                <button
                  type="button"
                  className="btn-ghost !min-h-10 text-xs sm:col-span-2"
                  onClick={() =>
                    downloadText(
                      `${base}-purchase-list.csv`,
                      buildPurchaseCsv(project, plan, purchaseConfig),
                      "text/csv",
                    )
                  }
                >
                  Purchase list CSV
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-ghost !min-h-10 text-xs"
                    onClick={() =>
                      downloadText(`${base}-costs.csv`, buildCsv(project, cost), "text/csv")
                    }
                  >
                    Costs CSV
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !min-h-10 text-xs"
                    onClick={() =>
                      downloadText(`${base}-cutlist.csv`, buildCutListCsv(project, cost), "text/csv")
                    }
                  >
                    Cut list CSV
                  </button>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** The heading on the sheet, edited in place. These are the job's own fields. */
function HeaderFields({
  project,
  patchProject,
}: {
  project: Project;
  patchProject: (changes: Partial<Project>) => void;
}) {
  return (
    <Card>
      <SectionTitle>Heading</SectionTitle>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Text
          id="export-name"
          label="Job"
          value={project.name}
          onChange={(name) => patchProject({ name })}
          placeholder="Job name"
        />
        <Text
          id="export-client"
          label="Client"
          value={project.client}
          onChange={(client) => patchProject({ client })}
          placeholder="Who it is for"
        />
        <Text
          id="export-ref"
          label="Reference"
          value={project.reference}
          onChange={(reference) => patchProject({ reference })}
          placeholder="Job or drawing number"
        />
        <Text
          id="export-by"
          label="Prepared by"
          value={project.preparedBy}
          onChange={(preparedBy) => patchProject({ preparedBy })}
          placeholder="Your name"
        />
      </div>
      <div className="mt-3">
        <label className="label" htmlFor="export-notes">
          Note on the sheet
        </label>
        <textarea
          id="export-notes"
          value={project.notes}
          onChange={(event) => patchProject({ notes: event.target.value })}
          rows={2}
          placeholder="Anything the reader needs to know — lead time, delivery, exclusions"
          className="field"
        />
      </div>
    </Card>
  );
}

function TakeoffOptions({
  options,
  onChange,
  headlinePlaceholder,
}: {
  options: ReportOptions;
  onChange: (options: ReportOptions) => void;
  /** What the banner would say on its own, shown as the placeholder. */
  headlinePlaceholder: string;
}) {
  const set = (changes: Partial<ReportOptions>) => onChange({ ...options, ...changes });

  return (
    <Card>
      <SectionTitle>What goes on it</SectionTitle>
      <div className="mt-3 space-y-1">
        <Toggle
          checked={options.includeHeadline}
          onChange={(includeHeadline) => set({ includeHeadline })}
          label="Banner across the top"
          hint=""
        />
        {options.includeHeadline ? (
          <div className="pl-7 pb-1">
            <label className="label" htmlFor="takeoff-headline">
              What it says
            </label>
            <input
              id="takeoff-headline"
              className="field"
              value={options.headline}
              placeholder={headlinePlaceholder}
              onChange={(event) => set({ headline: event.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">
              e.g. “Budget estimate, not a quotation”
            </p>
          </div>
        ) : null}
        <Toggle
          checked={options.includeStats}
          onChange={(includeStats) => set({ includeStats })}
          label="Key figures"
          hint=""
        />
        <Toggle
          checked={options.includeRollup}
          onChange={(includeRollup) => set({ includeRollup })}
          label="Cost build-up"
          hint=""
        />
        <Toggle
          checked={options.includeEvidence}
          onChange={(includeEvidence) => set({ includeEvidence })}
          label="Where the prices came from"
          hint=""
        />
        <Toggle
          checked={options.includeWorking}
          onChange={(includeWorking) => set({ includeWorking })}
          label="The calculations"
          hint=""
        />
        <Toggle
          checked={options.includeLayout}
          onChange={(includeLayout) => set({ includeLayout })}
          label="Cutting diagrams"
          hint=""
        />
        <Toggle
          checked={options.footer === "order"}
          onChange={(on) => set({ footer: on ? "order" : "none" })}
          label="Order summary"
          hint=""
        />
      </div>
    </Card>
  );
}

function CutOptions({
  config,
  onChange,
}: {
  config: CutSheetConfig;
  onChange: (config: CutSheetConfig) => void;
}) {
  const set = (changes: Partial<CutSheetConfig>) => onChange({ ...config, ...changes });

  return (
    <Card>
      <SectionTitle>The list</SectionTitle>
      <div className="mt-3 space-y-4">
        <div>
          <label className="label" htmlFor="cut-order">
            Order
          </label>
          <select
            id="cut-order"
            className="field"
            value={config.order}
            onChange={(event) => set({ order: event.target.value as CutOrder })}
          >
            <option value="longest">Longest first</option>
            <option value="entered">As you typed it</option>
          </select>
        </div>

        <div className="space-y-1">
          <Toggle
            checked={config.boxPerPiece}
            onChange={(boxPerPiece) => set({ boxPerPiece })}
            label="A box per piece"
            hint="Tick each one off, not just the row"
          />
          <Toggle
            checked={config.showTotals}
            onChange={(showTotals) => set({ showTotals })}
            label="Totals per material"
            hint=""
          />
          <Toggle
            checked={config.showHeadline}
            onChange={(showHeadline) => set({ showHeadline })}
            label="Banner across the top"
            hint=""
          />
        </div>

        {config.showHeadline ? (
          <div>
            <label className="label" htmlFor="cut-headline">
              What it says
            </label>
            <input
              id="cut-headline"
              className="field"
              value={config.headline}
              placeholder="37 pieces to cut"
              onChange={(event) => set({ headline: event.target.value })}
            />
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="cut-note">
            Note for the shop
          </label>
          <input
            id="cut-note"
            className="field"
            value={config.note}
            placeholder="Deburr all ends. Square cuts unless noted."
            onChange={(event) => set({ note: event.target.value })}
          />
        </div>
      </div>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-100">{label}</span>
        {hint ? <span className="block text-xs leading-snug text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="field"
      />
    </div>
  );
}
