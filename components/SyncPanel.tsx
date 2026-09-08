"use client";

import { useState } from "react";

import { Card, Note, SectionTitle } from "./ui";
import { isValidCode, newSyncCode, normaliseCode } from "@/lib/library";
import type { SyncControls } from "@/lib/store";

/**
 * Turning sync on is one action: make a code here, type it there.
 *
 * The code is the only credential, so it is shown in full on the device that
 * created it and never mailed anywhere by the app.
 */
export default function SyncPanel({
  sync,
  jobCount,
}: {
  sync: SyncControls;
  jobCount: number;
}) {
  const [entry, setEntry] = useState("");
  const [pairing, setPairing] = useState(false);
  const connected = !!sync.code;

  const connect = () => {
    const code = normaliseCode(entry);
    if (!isValidCode(code)) return;
    sync.connect(code);
    setEntry("");
    setPairing(false);
  };

  const start = () => {
    const code = newSyncCode();
    sync.connect(normaliseCode(code));
    setEntry(code);
  };

  return (
    <Card>
      <SectionTitle>Phone and PC</SectionTitle>
      <Note>Jobs are saved on the device you are using. Turn on sync and both devices share one library — whichever you edited last wins.</Note>

      {!sync.configured ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-100/80">
          Sync storage is not connected to this deployment yet, so this device is on its own for
          now. Everything else works normally, and turning storage on later needs no changes here.
        </p>
      ) : connected ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              Sync is on
            </p>
            <p className="mt-1 font-mono text-sm tracking-wide text-emerald-100 break-all">
              {formatCode(sync.code)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-emerald-100/70">
              Type this same code on your other device to join it up. {jobCount}{" "}
              {jobCount === 1 ? "job" : "jobs"} in this library.
            </p>
          </div>

          <p className="text-xs text-slate-400">{describe(sync)}</p>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost !min-h-10 px-3 text-xs" onClick={sync.syncNow}>
              Sync now
            </button>
            <button
              type="button"
              className="btn-ghost !min-h-10 px-3 text-xs"
              onClick={() => void navigator.clipboard?.writeText(formatCode(sync.code))}
            >
              Copy code
            </button>
            <button
              type="button"
              className="!min-h-10 px-3 text-xs text-slate-500 hover:text-rose-300"
              onClick={sync.disconnect}
            >
              Stop syncing this device
            </button>
          </div>
        </div>
      ) : pairing ? (
        <div className="mt-3 space-y-2">
          <label className="label" htmlFor="sync-code">
            Code from your other device
          </label>
          <input
            id="sync-code"
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            placeholder="abcd-efgh-jkmn-pqrs"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="field font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary !min-h-10 px-4 text-sm disabled:opacity-40"
              disabled={!isValidCode(entry)}
              onClick={connect}
            >
              Join
            </button>
            <button
              type="button"
              className="btn-ghost !min-h-10 px-3 text-xs"
              onClick={() => setPairing(false)}
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Joining merges both libraries — nothing on this device is thrown away.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary !min-h-10 px-4 text-sm" onClick={start}>
            Turn on sync
          </button>
          <button
            type="button"
            className="btn-ghost !min-h-10 px-3 text-xs"
            onClick={() => setPairing(true)}
          >
            I already have a code
          </button>
        </div>
      )}
    </Card>
  );
}

function formatCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join("-");
}

function describe(sync: SyncControls): string {
  switch (sync.state.status) {
    case "syncing":
      return "Syncing…";
    case "synced":
      return `Last synced ${new Date(sync.state.at).toLocaleTimeString()}.`;
    case "error":
      return `${sync.state.message}. It will try again on the next change.`;
    case "unconfigured":
      return "The server has no sync storage connected.";
    default:
      return "Waiting for the first sync.";
  }
}
