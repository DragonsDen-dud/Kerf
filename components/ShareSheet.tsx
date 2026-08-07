"use client";

import { useEffect, useRef, useState } from "react";

import type { PackResult } from "@/lib/pack";
import { canvasToBlob, renderReport } from "@/lib/report";
import type { Job } from "@/lib/store";

interface Props {
  job: Job;
  result: PackResult;
  onClose: () => void;
}

type Status = "rendering" | "ready" | "error";

/**
 * Function #3 — the snapshot for the boss. Renders the report to a PNG and
 * hands it to the iOS share sheet, falling back to a download / long-press
 * save when Web Share with files is unavailable.
 */
export default function ShareSheet({ job, result, onClose }: Props) {
  const [status, setStatus] = useState<Status>("rendering");
  const [dataUrl, setDataUrl] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const blobRef = useRef<Blob | null>(null);

  const fileName = `${slug(job.name || "cut-list")}-cut-list.png`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const canvas = renderReport(result, job.parts, job.settings, {
          job: job.name,
          material: job.material,
          unit: job.unit,
          currency: job.currency,
        });
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

    return () => {
      cancelled = true;
    };
  }, [job, result]);

  const share = async () => {
    const blob = blobRef.current;
    if (!blob) return;

    const file = new File([blob], fileName, { type: "image/png" });
    const shareData = {
      files: [file],
      title: job.name || "Cut list",
      text: headline(result, job),
    };

    if (navigator.canShare?.(shareData) && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        // A user cancelling the sheet is not a failure worth reporting.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    download();
    setMessage("Sharing isn't available here, so the PNG was downloaded instead.");
  };

  const download = () => {
    const blob = blobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Give Safari a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink-950/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Share cut list snapshot"
    >
      <header className="safe-top flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-bold text-slate-50">Snapshot</h2>
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-300"
          onClick={onClose}
        >
          Done
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {status === "rendering" ? (
          <p className="py-16 text-center text-slate-400">Building the image…</p>
        ) : status === "error" ? (
          <p className="py-16 text-center text-rose-300">{message}</p>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt="Cut list snapshot"
              className="mx-auto w-full max-w-3xl rounded-xl shadow-2xl ring-1 ring-white/10"
            />
            <p className="mt-3 text-center text-xs text-slate-500">
              On iPhone you can also press and hold the image to save or copy it.
            </p>
          </>
        )}
      </div>

      <footer className="safe-bottom space-y-2 border-t border-white/10 p-4">
        {message && status === "ready" ? (
          <p className="text-center text-xs text-amber-300">{message}</p>
        ) : null}
        <button
          type="button"
          className="btn-primary w-full"
          disabled={status !== "ready"}
          onClick={share}
        >
          Share PNG
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          disabled={status !== "ready"}
          onClick={download}
        >
          Save to files
        </button>
      </footer>
    </div>
  );
}

function headline(result: PackResult, job: Job): string {
  const { totals } = result;
  if (totals.pieces === 0) return job.name || "Cut list";
  return `${job.name ? `${job.name}: ` : ""}buy ${totals.barsNeeded} bars, ${totals.pieces} pieces cut.`;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "job"
  );
}
