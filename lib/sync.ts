"use client";

/**
 * Client half of sync.
 *
 * The device is always the source of truth for what is on screen; the server
 * is a post box. Pull-merge-push, on a timer and on demand, which is enough
 * for one person moving between a phone and a PC.
 */

import { envelope, isEnvelope, mergeLibraries, normaliseCode } from "./library";
import type { Library } from "./types";

export const CODE_KEY = "kerf.sync.code";

export type SyncState =
  | { status: "off" }
  | { status: "unconfigured" }
  | { status: "syncing" }
  | { status: "synced"; at: string }
  | { status: "error"; message: string };

export function loadCode(): string {
  try {
    return window.localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeCode(code: string) {
  try {
    if (code) window.localStorage.setItem(CODE_KEY, code);
    else window.localStorage.removeItem(CODE_KEY);
  } catch {
    // Private mode: sync works for this session but is not remembered.
  }
}

/** Is a sync backend actually connected to this deployment? */
export async function syncAvailable(): Promise<boolean> {
  try {
    const response = await fetch("/api/sync", { method: "HEAD", cache: "no-store" });
    return response.status === 204;
  } catch {
    return false;
  }
}

class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: "unconfigured" | "offline" | "server",
  ) {
    super(message);
  }
}

async function pull(code: string): Promise<Library | null> {
  let response: Response;
  try {
    response = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, { cache: "no-store" });
  } catch {
    throw new SyncError("No connection", "offline");
  }

  if (response.status === 404) return null; // First device to use this code.
  if (response.status === 501) throw new SyncError("Sync is not set up on the server", "unconfigured");
  if (!response.ok) throw new SyncError("The sync service did not answer", "server");

  const body = (await response.json()) as { envelope?: unknown };
  if (!isEnvelope(body.envelope)) throw new SyncError("The stored data was not readable", "server");
  return body.envelope.library;
}

async function push(code: string, library: Library): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope(library)),
    });
  } catch {
    throw new SyncError("No connection", "offline");
  }

  if (response.status === 501) throw new SyncError("Sync is not set up on the server", "unconfigured");
  if (response.status === 413) throw new SyncError("This library is too big to sync", "server");
  if (!response.ok) throw new SyncError("The sync service refused the upload", "server");
}

/**
 * One round trip: take what the server has, merge it with what this device
 * has, and send the result back. Returns the merged library so the caller can
 * adopt it.
 */
export async function syncOnce(code: string, mine: Library): Promise<Library> {
  const clean = normaliseCode(code);
  const theirs = await pull(clean);
  const merged = theirs ? mergeLibraries(mine, theirs) : mine;
  await push(clean, merged);
  return merged;
}

export function describeError(error: unknown): { message: string; unconfigured: boolean } {
  if (error instanceof SyncError) {
    return { message: error.message, unconfigured: error.kind === "unconfigured" };
  }
  return { message: "Sync failed", unconfigured: false };
}
