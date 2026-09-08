/**
 * The job library and how two devices agree on it.
 *
 * Sync is deliberately dumb: each device holds the whole library, and merging
 * is per-record last-write-wins on `updatedAt`. That is right for one person
 * with a phone and a PC — the only way to lose an edit is to change the same
 * job on both devices while offline, and then the newer edit wins, which is
 * what anyone would expect.
 *
 * Deletes need help, because "missing on device A" and "new on device B" look
 * identical. So a delete leaves a tombstone, and a tombstone beats any record
 * older than it.
 */

import { SCHEMA_VERSION, type Library, type Material, type Project, type Tombstone } from "./types";

/** Tombstones older than this are dropped — the delete has long since landed. */
export const TOMBSTONE_TTL_DAYS = 120;

export function emptyLibrary(): Library {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: [],
    materials: [],
    tombstones: [],
    activeId: null,
    updatedAt: new Date(0).toISOString(),
  };
}

const time = (iso: string) => {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
};

/** The most recent tombstone for an id, or 0 if it was never deleted. */
function deletedAt(tombstones: Tombstone[], id: string): number {
  let latest = 0;
  for (const stone of tombstones) {
    if (stone.id === id) latest = Math.max(latest, time(stone.at));
  }
  return latest;
}

function mergeRecords<T extends { id: string; updatedAt: string }>(
  mine: T[],
  theirs: T[],
  tombstones: Tombstone[],
): T[] {
  const byId = new Map<string, T>();

  for (const record of [...mine, ...theirs]) {
    const existing = byId.get(record.id);
    if (!existing || time(record.updatedAt) > time(existing.updatedAt)) {
      byId.set(record.id, record);
    }
  }

  // A delete only wins over edits that predate it, so re-editing a job on the
  // other device brings it back rather than silently losing the work.
  return [...byId.values()].filter(
    (record) => time(record.updatedAt) > deletedAt(tombstones, record.id),
  );
}

function mergeTombstones(mine: Tombstone[], theirs: Tombstone[]): Tombstone[] {
  const byId = new Map<string, Tombstone>();
  for (const stone of [...mine, ...theirs]) {
    const existing = byId.get(stone.id);
    if (!existing || time(stone.at) > time(existing.at)) byId.set(stone.id, stone);
  }

  const cutoff = Date.now() - TOMBSTONE_TTL_DAYS * 86_400_000;
  return [...byId.values()].filter((stone) => time(stone.at) > cutoff);
}

/**
 * Combine the library on this device with the one from the server.
 *
 * `mine` wins ties, because the local copy is the one the person is looking
 * at; the active job is likewise kept local so a sync never yanks the screen
 * out from under them.
 */
export function mergeLibraries(mine: Library, theirs: Library): Library {
  const tombstones = mergeTombstones(mine.tombstones, theirs.tombstones);

  const projects = mergeRecords<Project>(mine.projects, theirs.projects, tombstones).sort(
    (a, b) => time(b.updatedAt) - time(a.updatedAt),
  );
  const materials = mergeRecords<Material>(mine.materials, theirs.materials, tombstones).sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  const activeId =
    mine.activeId && projects.some((p) => p.id === mine.activeId)
      ? mine.activeId
      : projects[0]?.id ?? null;

  return {
    schemaVersion: SCHEMA_VERSION,
    projects,
    materials,
    tombstones,
    activeId,
    updatedAt: new Date(Math.max(time(mine.updatedAt), time(theirs.updatedAt))).toISOString(),
  };
}

export function tombstone(id: string, kind: Tombstone["kind"]): Tombstone {
  return { id, kind, at: new Date().toISOString() };
}

/* ------------------------------------------------------------ sync payloads */

/** What a device sends to, and receives from, the sync endpoint. */
export interface SyncEnvelope {
  format: "kerf.library";
  version: 1;
  library: Library;
}

export function envelope(library: Library): SyncEnvelope {
  return { format: "kerf.library", version: 1, library };
}

export function isEnvelope(value: unknown): value is SyncEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SyncEnvelope>;
  return candidate.format === "kerf.library" && !!candidate.library;
}

/* -------------------------------------------------------------- sync codes */

// No i/l/1/o/0: this gets read off a phone screen and typed into a PC.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A sync code is a shared secret, so it needs enough entropy to not be guessed. */
export function newSyncCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function normaliseCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isValidCode(code: string): boolean {
  return /^[a-z0-9]{12,64}$/.test(normaliseCode(code));
}
