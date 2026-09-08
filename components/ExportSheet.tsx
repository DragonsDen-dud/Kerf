"use client";

import { useEffect, useRef, useState } from "react";

import { Modal } from "./ui";
import { buildCsv, buildCutListCsv, buildExport, downloadText, slug } from "@/lib/exports";
import type { ProjectCost } from "@/lib/pricing";
import { canvasToBlob, renderReport, type ReportOptions } from "@/lib/report";
import type { Project } from "@/lib/types";

type Status = "rendering" | "ready" | "error";

/**
 * Getting the take-off out of the app and in front of someone.
 *
 * The PNG is the fast path (straight into the iOS share sheet); the CSV and
 * JSON are the paper trail — the JSON is the versioned shape another system
 * can ingest later.
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
  const [options, setOptions] = useState<ReportOptions>({
    includeLayout: true,
    includeEvidence: true,
    includeWorking: true,
  });
  const [status, setStatus] = useState<Status>("rendering");
  const [dataUrl, setDataUrl] = useState("");
  const [message, setMessage] = useState("");
  const blobRef = useRef<Blob | null>(null);

  const base = slug(project.name || "take-off");
  const fileName = `${base}-${project.mode === "quick" ? "estimate" : "takeoff"}.png`;

  useEffect(() => {
    let cancelled = false;
    setStatus("rendering");

    // Give the modal a frame to paint before the (synchronous) canvas work.
    const timer = setTimeout(() => {
      (async () => {
        try {
          const canvas = renderReport(project, cost, options);
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
  }, [project, cost, options]);

  const share = async () => {
    const blob = blobRef.current;
    if (!blob) return;

    const file = new File([blob], fileName, { type: "image/png" });
    const shareData = { files: [file], title: project.name || "Take-off", text: headline(project, cost) };

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
            <button
              type="button"
              className="btn-ghost w-full !min-h-10 text-xs"
              onClick={() =>
                downloadText(`${base}-costs.csv`, buildCsv(project, cost), "text/csv")
              }
            >
              Cost CSV
            </button>
            <button
              type="button"
              className="btn-ghost w-full !min-h-10 text-xs"
              onClick={() =>
                downloadText(`${base}-cutlist.csv`, buildCutListCsv(project, cost), "text/csv")
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
          </div>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-4">
        <Toggle
          checked={options.includeLayout}
          onChange={(includeLayout) => setOptions((o) => ({ ...o, includeLayout }))}
          label="Include cutting diagrams"
        />
        <Toggle
          checked={options.includeEvidence}
          onChange={(includeEvidence) => setOptions((o) => ({ ...o, includeEvidence }))}
          label="Include where the prices came from"
        />
        <Toggle
          checked={options.includeWorking}
          onChange={(includeWorking) => setOptions((o) => ({ ...o, includeWorking }))}
          label="Include the calculations"
        />
      </div>

      {status === "rendering" ? (
        <p className="py-16 text-center text-slate-400">Building the image…</p>
      ) : status === "error" ? (
        <p className="py-16 text-center text-rose-300">{message}</p>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt="Take-off snapshot"
            className="mx-auto w-full rounded-xl shadow-2xl ring-1 ring-white/10"
          />
          <p className="mt-3 text-center text-xs text-slate-500">
            On iPhone you can also press and hold the image to save or copy it.
          </p>
        </>
      )}
    </Modal>
  );
}

function Toggle({
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

function headline(project: Project, cost: ProjectCost): string {
  if (cost.totalPieces === 0) return project.name || "Take-off";
  const name = project.name ? `${project.name}: ` : "";
  if (cost.total > 0) {
    return `${name}${cost.totalBars} bars, ${cost.totalPieces} pieces, ${project.currency}${cost.total.toFixed(2)}.`;
  }
  return `${name}buy ${cost.totalBars} bars, ${cost.totalPieces} pieces cut.`;
}
