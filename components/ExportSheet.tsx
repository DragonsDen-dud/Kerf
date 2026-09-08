"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PurchaseOptions from "./PurchaseOptions";
import { Modal, Segmented } from "./ui";
import {
  buildCsv,
  buildCutListCsv,
  buildExport,
  buildPurchaseCsv,
  downloadText,
  slug,
} from "@/lib/exports";
import type { ProjectCost } from "@/lib/pricing";
import { buildPurchasePlan, defaultConfig, type PurchaseConfig } from "@/lib/purchase";
import { renderPurchaseList } from "@/lib/purchaseReport";
import { canvasToBlob, renderReport, type ReportOptions } from "@/lib/report";
import type { Project } from "@/lib/types";

type Sheet = "takeoff" | "purchase";
type Status = "rendering" | "ready" | "error";

/**
 * Two documents from one take-off.
 *
 * The take-off report is the full working, for your own file. The purchase
 * list is what goes to whoever buys the material: footage, length options and
 * a recommendation, with everything on it switchable before it is sent.
 */
export default function ExportSheet({
  project,
  cost,
  onClose,
}: {
  project: Project;
  cost: ProjectCost;
  onClose: () => void;
}) {
  const [sheet, setSheet] = useState<Sheet>("takeoff");
  const [reportOptions, setReportOptions] = useState<ReportOptions>({
    includeLayout: true,
    includeEvidence: true,
    includeWorking: true,
  });
  const [purchaseConfig, setPurchaseConfig] = useState<PurchaseConfig>(() =>
    defaultConfig(project, cost),
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
      : `${base}-${project.mode === "quick" ? "estimate" : "takeoff"}.png`;

  useEffect(() => {
    let cancelled = false;
    setStatus("rendering");

    // Let the panel paint before the synchronous canvas work.
    const timer = setTimeout(() => {
      (async () => {
        try {
          const canvas =
            sheet === "purchase"
              ? renderPurchaseList(project, plan, purchaseConfig)
              : renderReport(project, cost, reportOptions);
          const blob = await canvasToBlob(canvas);
          if (cancelled) return;
          blobRef.current = blob;
          setDataUrl(canvas.toDataURL("image/png"));
          setStatus("ready");
        } catch (error) {
          if (cancelled) return;
          setMessage(error instanceof Error ? error.message : "Could not build the image");
          setStatus("error");
        }
      })();
    }, 16);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sheet, project, cost, reportOptions, plan, purchaseConfig]);

  const share = async () => {
    const blob = blobRef.current;
    if (!blob) return;

    const file = new File([blob], fileName, { type: "image/png" });
    const shareData = { files: [file], title: project.name || "Take-off", text: headline(sheet, project, cost, plan) };

    if (navigator.canShare?.(shareData) && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        // Cancelling the sheet is not a failure worth reporting.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    downloadPng();
    setMessage("Sharing isn't available here, so the PNG was downloaded instead.");
  };

  const downloadPng = () => {
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

  const preview =
    status === "rendering" ? (
      <p className="py-16 text-center text-slate-400">Building the sheet…</p>
    ) : status === "error" ? (
      <p className="py-16 text-center text-rose-300">{message}</p>
    ) : (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={sheet === "purchase" ? "Purchase list" : "Take-off snapshot"}
          className="mx-auto w-full rounded-xl shadow-2xl ring-1 ring-white/10"
        />
        <p className="mt-3 text-center text-xs text-slate-500">
          This is exactly what gets sent. On iPhone you can also press and hold to save or copy it.
        </p>
      </>
    );

  return (
    <Modal
      wide
      title="Export"
      onClose={onClose}
      footer={
        <>
          {message ? <p className="text-center text-xs text-amber-300">{message}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={status !== "ready"}
              onClick={() => void share()}
            >
              Share PNG
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={status !== "ready"}
              onClick={downloadPng}
            >
              Save PNG
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {sheet === "purchase" ? (
              <button
                type="button"
                className="btn-ghost w-full !min-h-10 text-xs sm:col-span-3"
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
                  className="btn-ghost w-full !min-h-10 text-xs"
                  onClick={() => downloadText(`${base}-costs.csv`, buildCsv(project, cost), "text/csv")}
                >
                  Cost CSV
                </button>
                <button
                  type="button"
                  className="btn-ghost w-full !min-h-10 text-xs"
                  onClick={() =>
                    downloadText(
                      `${base}-cutlist.csv`,
                      buildCutListCsv(project, cost),
                      "text/csv",
                    )
                  }
                >
                  Cut list CSV
                </button>
                <button
                  type="button"
                  className="btn-ghost w-full !min-h-10 text-xs"
                  onClick={() =>
                    downloadText(
                      `${base}.json`,
                      JSON.stringify(buildExport(project, cost), null, 2),
                      "application/json",
                    )
                  }
                >
                  JSON
                </button>
              </>
            )}
          </div>
        </>
      }
    >
      <div className="mb-4">
        <Segmented<Sheet>
          value={sheet}
          onChange={setSheet}
          options={[
            { value: "takeoff", label: "Take-off report", hint: "Your full working" },
            { value: "purchase", label: "Purchase list", hint: "For whoever buys it" },
          ]}
        />
      </div>

      {sheet === "takeoff" ? (
        <>
          <div className="mb-4 flex flex-wrap gap-4">
            <Check
              checked={reportOptions.includeLayout}
              onChange={(includeLayout) => setReportOptions((o) => ({ ...o, includeLayout }))}
              label="Include cutting diagrams"
            />
            <Check
              checked={reportOptions.includeEvidence}
              onChange={(includeEvidence) => setReportOptions((o) => ({ ...o, includeEvidence }))}
              label="Include where the prices came from"
            />
            <Check
              checked={reportOptions.includeWorking}
              onChange={(includeWorking) => setReportOptions((o) => ({ ...o, includeWorking }))}
              label="Include the calculations"
            />
          </div>
          {preview}
        </>
      ) : plan.lines.length === 0 ? (
        <p className="py-16 text-center text-slate-400">
          Nothing to buy yet — add some parts on the Job screen.
        </p>
      ) : (
        // Controls beside the sheet on a wide screen; stacked on a phone.
        <div className="grid gap-5 lg:grid-cols-[22rem_1fr] lg:items-start">
          <div className="lg:max-h-[60vh] lg:overflow-y-auto lg:pr-2">
            <PurchaseOptions
              project={project}
              plan={plan}
              config={purchaseConfig}
              onChange={setPurchaseConfig}
            />
          </div>
          <div className="lg:sticky lg:top-0">{preview}</div>
        </div>
      )}
    </Modal>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-amber-500"
      />
      {label}
    </label>
  );
}

function headline(
  sheet: Sheet,
  project: Project,
  cost: ProjectCost,
  plan: ReturnType<typeof buildPurchasePlan>,
): string {
  const name = project.name ? `${project.name}: ` : "";
  if (sheet === "purchase") {
    const amount = plan.cost !== null ? `, ${project.currency}${plan.cost.toFixed(2)}` : "";
    return `${name}material to buy — ${plan.totalBars} bars across ${plan.lines.length} materials${amount}.`;
  }
  if (cost.totalPieces === 0) return project.name || "Take-off";
  if (cost.total > 0) {
    return `${name}${cost.totalBars} bars, ${cost.totalPieces} pieces, ${project.currency}${cost.total.toFixed(2)}.`;
  }
  return `${name}buy ${cost.totalBars} bars, ${cost.totalPieces} pieces cut.`;
}
