import assert from "node:assert/strict";
import test from "node:test";

import {
  adopt,
  emptyLibrary,
  isValidCode,
  mergeLibraries,
  newSyncCode,
  normaliseCode,
  tombstone,
} from "../lib/library";
import type { Library, Material, Project } from "../lib/types";

const at = (iso: string) => new Date(iso).toISOString();

/** Tombstones expire, so delete tests have to sit inside the TTL window. */
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function job(id: string, name: string, updatedAt: string): Project {
  return {
    schemaVersion: 3,
    id,
    name,
    client: "",
    reference: "",
    preparedBy: "",
    notes: "",
    unit: "imperial",
    currency: "$",
    mode: "detailed",
    status: "enquiry",
    archived: false,
    lines: [],
    extras: [],
    contingencyPct: 0,
    markupPct: 0,
    taxPct: 0,
    createdAt: at("2026-01-01T00:00:00Z"),
    updatedAt: at(updatedAt),
  };
}

function stock(id: string, name: string, updatedAt: string): Material {
  return {
    id,
    name,
    category: "",
    stockLength: 240,
    kerf: 0.125,
    endTrim: 0,
    prices: [],
    notes: "",
    updatedAt: at(updatedAt),
  };
}

const lib = (over: Partial<Library>): Library => ({ ...emptyLibrary(), ...over });

/* --------------------------------------------------------------- merging */

test("a job only on the phone reaches the PC", () => {
  const phone = lib({ projects: [job("a", "Buca", "2026-05-01T10:00:00Z")] });
  const pc = lib({ projects: [job("b", "Chervin", "2026-05-01T09:00:00Z")] });

  const merged = mergeLibraries(pc, phone);
  assert.deepEqual(
    merged.projects.map((p) => p.name).sort(),
    ["Buca", "Chervin"],
  );
});

test("the newer edit of the same job wins", () => {
  const older = lib({ projects: [job("a", "Old name", "2026-05-01T10:00:00Z")] });
  const newer = lib({ projects: [job("a", "New name", "2026-05-02T10:00:00Z")] });

  assert.equal(mergeLibraries(older, newer).projects[0].name, "New name");
  // Direction must not matter, or the two devices would disagree.
  assert.equal(mergeLibraries(newer, older).projects[0].name, "New name");
});

test("jobs come back newest edit first", () => {
  const merged = mergeLibraries(
    lib({ projects: [job("a", "Older", "2026-05-01T00:00:00Z")] }),
    lib({ projects: [job("b", "Newer", "2026-06-01T00:00:00Z")] }),
  );
  assert.deepEqual(merged.projects.map((p) => p.name), ["Newer", "Older"]);
});

/* -------------------------------------------------------------- deleting */

test("a delete on one device does not come back from the other", () => {
  const deleted = lib({
    projects: [],
    tombstones: [{ id: "a", kind: "project", at: daysAgo(1) }],
  });
  const stale = lib({ projects: [job("a", "Buca", daysAgo(2)) ] });

  assert.equal(mergeLibraries(deleted, stale).projects.length, 0);
  assert.equal(mergeLibraries(stale, deleted).projects.length, 0);
});

test("editing a job after it was deleted elsewhere keeps the work", () => {
  const deleted = lib({
    tombstones: [{ id: "a", kind: "project", at: daysAgo(2) }],
  });
  const edited = lib({ projects: [job("a", "Still wanted", daysAgo(1))] });

  const merged = mergeLibraries(deleted, edited);
  assert.equal(merged.projects.length, 1, "an edit newer than the delete must survive");
  assert.equal(merged.projects[0].name, "Still wanted");
});

test("deleting a material tombstones it too", () => {
  const deleted = lib({ materials: [], tombstones: [tombstone("m1", "material")] });
  const stale = lib({ materials: [stock("m1", "1x1 tube", "2020-01-01T00:00:00Z")] });

  assert.equal(mergeLibraries(deleted, stale).materials.length, 0);
});

test("old tombstones are dropped so they cannot accumulate forever", () => {
  const ancient = lib({
    tombstones: [{ id: "gone", kind: "project", at: at("2020-01-01T00:00:00Z") }],
  });
  assert.equal(mergeLibraries(ancient, emptyLibrary()).tombstones.length, 0);
});

/* ------------------------------------------------------------ active job */

test("syncing does not move the job you are looking at", () => {
  const mine = lib({
    projects: [job("a", "Mine", "2026-05-01T00:00:00Z")],
    activeId: "a",
  });
  const theirs = lib({
    projects: [job("b", "Theirs", "2026-06-01T00:00:00Z")],
    activeId: "b",
  });

  assert.equal(mergeLibraries(mine, theirs).activeId, "a");
});

test("a deleted active job falls back to whatever is left", () => {
  const mine = lib({ projects: [], activeId: "gone" });
  const theirs = lib({ projects: [job("b", "Theirs", "2026-06-01T00:00:00Z")] });

  assert.equal(mergeLibraries(mine, theirs).activeId, "b");
});

test("an empty library merges to an empty library", () => {
  const merged = mergeLibraries(emptyLibrary(), emptyLibrary());
  assert.equal(merged.projects.length, 0);
  assert.equal(merged.activeId, null);
});

/* ----------------------------------------------------------- sync codes */

test("sync codes are long enough not to be guessed", () => {
  // Simulated in Node, which has webcrypto on globalThis.
  const code = newSyncCode();
  assert.match(code, /^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/);
  assert.ok(isValidCode(code));
});

test("codes are read back however they were typed", () => {
  assert.equal(normaliseCode("  AB2C-de3F  "), "ab2cde3f");
  assert.ok(isValidCode("ab2c-de3f-gh4j-km5n"));
  assert.ok(!isValidCode("short"));
  assert.ok(!isValidCode(""));
});

test("two codes are never the same", () => {
  const codes = new Set(Array.from({ length: 200 }, newSyncCode));
  assert.equal(codes.size, 200);
});

/* ------------------------------------------------------- adopting a merge */

test("a merge that changes nothing keeps the very same object", () => {
  // Identity matters: a new object re-arms the push timer, which syncs again,
  // which produces another new object — a loop that never settles.
  const mine = lib({ projects: [job("a", "Buca", "2026-05-01T00:00:00Z")], activeId: "a" });
  assert.equal(adopt(mine, structuredClone(mine)), mine);
});

test("a merge that brings news is adopted", () => {
  const mine = lib({ projects: [job("a", "Buca", "2026-05-01T00:00:00Z")], activeId: "a" });
  const theirs = lib({ projects: [job("b", "Chervin", "2026-05-02T00:00:00Z")] });

  const next = adopt(mine, theirs);
  assert.notEqual(next, mine);
  assert.equal(next.projects.length, 2);
});

/* ---------------------------------------------------- two devices talking */

/**
 * The exchange each device performs: take what the server holds, merge it with
 * what this device holds, put the result back. Both devices must end up with
 * everything, whatever order they go in.
 */
function exchange(device: Library, server: Library | null): { device: Library; server: Library } {
  const merged = server ? mergeLibraries(device, server) : device;
  return { device: merged, server: merged };
}

test("two devices end up with each other's jobs", () => {
  let server: Library | null = null;

  let pc = lib({ projects: [job("a", "CHECK", "2026-09-08T15:00:00Z")], activeId: "a" });
  let phone = lib({ projects: [job("b", "Bahamas", "2026-09-08T15:01:00Z")], activeId: "b" });

  ({ device: pc, server } = exchange(pc, server));
  ({ device: phone, server } = exchange(phone, server));
  // The PC only learns about the phone's job on its next round.
  ({ device: pc, server } = exchange(pc, server));

  assert.deepEqual(pc.projects.map((p) => p.name).sort(), ["Bahamas", "CHECK"]);
  assert.deepEqual(phone.projects.map((p) => p.name).sort(), ["Bahamas", "CHECK"]);
});

test("a device uploads its own work, not an empty library", () => {
  // The failure this pins down: syncing pushed a library read before the jobs
  // were loaded, so every device reported success and sent nothing.
  const pc = lib({ projects: [job("a", "CHECK", "2026-09-08T15:00:00Z")] });
  const { server } = exchange(pc, null);

  assert.equal(server.projects.length, 1, "the first push must carry this device's jobs");
  assert.equal(server.projects[0].name, "CHECK");
});

test("syncing an empty device does not wipe the server", () => {
  const server = lib({ projects: [job("a", "CHECK", "2026-09-08T15:00:00Z")] });
  const fresh = emptyLibrary();

  const after = exchange(fresh, server);
  assert.equal(after.server.projects.length, 1, "an empty device must not erase the library");
  assert.equal(after.device.projects.length, 1, "and it should receive the jobs");
});
