"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { adopt, emptyLibrary, tombstone } from "./library";
import { costProject, type ProjectCost } from "./pricing";
import {
  describeError,
  loadCode,
  storeCode,
  syncAvailable,
  syncOnce,
  type SyncState,
} from "./sync";
import {
  SCHEMA_VERSION,
  emptyLine,
  emptyPart,
  newId,
  nowIso,
  todayIso,
  type Extra,
  type Material,
  type Mode,
  type JobStatus,
  type Library,
  type Part,
  type PriceRecord,
  type Project,
  type TakeoffLine,
  type Tombstone,
} from "./types";

const LIBRARY_KEY = "kerf.library.v3";
const PROJECT_KEY = "kerf.project.v2";
const HOARD_KEY = "kerf.hoard.v2";
const LEGACY_KEY = "kerf.job.v1";

/** How long after the last edit the library is pushed to the other device. */
const SYNC_DEBOUNCE_MS = 4_000;

/* ------------------------------------------------------------- seed values */

/** The sample job from the source workbook, priced from a worked example. */
export function sampleMaterials(): Material[] {
  return [
    {
      id: "mat_sample_tube",
      name: '1" x 1" x 16ga square tube',
      category: "Steel",
      stockLength: 240,
      kerf: 0.125,
      endTrim: 0,
      notes: "Mill finish. Standard 20ft mill length.",
      updatedAt: nowIso(),
      prices: [
        {
          id: "prc_sample",
          amount: 48.5,
          basis: "per-bar",
          stockLength: 240,
          recordedAt: nowIso(),
          source: {
            kind: "quote",
            supplier: "Example Steel Supply",
            reference: "Q-10432",
            url: "",
            capturedAt: todayIso(),
            note: "Sample price — replace with your own supplier quote.",
          },
        },
      ],
    },
  ];
}

export function sampleProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId("prj"),
    name: "BRATTON 1X1",
    client: "",
    reference: "",
    preparedBy: "",
    notes: "",
    unit: "imperial",
    currency: "$",
    mode: "detailed",
    status: "enquiry",
    archived: false,
    contingencyPct: 0,
    markupPct: 0,
    taxPct: 0,
    extras: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lines: [
      {
        id: newId("ln"),
        name: "Frames",
        materialId: "mat_sample_tube",
        stockLength: 240,
        kerf: 0.125,
        endTrim: 0,
        strategy: "optimized",
        parts: [
          { id: newId("pt"), label: "A1,A3", length: 45.5, qty: 4 },
          { id: newId("pt"), label: "A2,A4", length: 51, qty: 4 },
          { id: newId("pt"), label: "A5", length: 70, qty: 2 },
          { id: newId("pt"), label: "A6,A7", length: 35, qty: 4 },
          { id: newId("pt"), label: "B1,B3", length: 54, qty: 12 },
          { id: newId("pt"), label: "B2,B4", length: 51, qty: 12 },
          { id: newId("pt"), label: "B5", length: 77, qty: 6 },
          { id: newId("pt"), label: "B6,B7", length: 38, qty: 12 },
        ],
      },
    ],
  };
}

export function emptyProject(mode: Mode = "quick"): Project {
  return {
    ...sampleProject(),
    id: newId("prj"),
    name: "",
    mode,
    lines: [emptyLine({ name: mode === "quick" ? "" : "Line 1" })],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

/* ------------------------------------------------------------- persistence */

function read<T>(key: string): unknown | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or quota: the session still works, it just won't persist.
  }
}

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

function revivePart(raw: unknown): Part {
  const p = (raw ?? {}) as Partial<Part>;
  return {
    id: str(p.id) || newId("pt"),
    label: str(p.label),
    length: num(p.length),
    qty: Math.max(0, Math.floor(num(p.qty))),
  };
}

function reviveLine(raw: unknown): TakeoffLine {
  const l = (raw ?? {}) as Partial<TakeoffLine>;
  const parts = Array.isArray(l.parts) ? l.parts.map(revivePart) : [];
  return {
    id: str(l.id) || newId("ln"),
    name: str(l.name),
    materialId: typeof l.materialId === "string" ? l.materialId : null,
    stockLength: num(l.stockLength, 240),
    kerf: num(l.kerf, 0.125),
    endTrim: num(l.endTrim, 0),
    strategy: l.strategy === "sequential" ? "sequential" : "optimized",
    parts: parts.length ? parts : [emptyPart()],
  };
}

const STATUSES: JobStatus[] = ["enquiry", "quoted", "won", "ordered", "done"];

function reviveProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Project>;
  if (!Array.isArray(p.lines)) return null;
  const lines = p.lines.map(reviveLine);

  return {
    schemaVersion: SCHEMA_VERSION,
    id: str(p.id) || newId("prj"),
    name: str(p.name),
    client: str(p.client),
    reference: str(p.reference),
    preparedBy: str(p.preparedBy),
    notes: str(p.notes),
    unit: p.unit === "metric" ? "metric" : "imperial",
    currency: str(p.currency, "$"),
    mode: p.mode === "detailed" ? "detailed" : "quick",
    lines: lines.length ? lines : [emptyLine()],
    extras: Array.isArray(p.extras)
      ? p.extras.map((raw) => {
          const e = (raw ?? {}) as Partial<Extra>;
          return {
            id: str(e.id) || newId("ex"),
            description: str(e.description),
            qty: num(e.qty, 1),
            unitCost: num(e.unitCost),
          };
        })
      : [],
    contingencyPct: num(p.contingencyPct),
    markupPct: num(p.markupPct),
    taxPct: num(p.taxPct),
    status: STATUSES.includes(p.status as JobStatus) ? (p.status as JobStatus) : "enquiry",
    archived: p.archived === true,
    createdAt: str(p.createdAt) || nowIso(),
    updatedAt: str(p.updatedAt) || nowIso(),
  };
}

function reviveMaterial(raw: unknown): Material {
  const m = (raw ?? {}) as Partial<Material>;
  return {
    id: str(m.id) || newId("mat"),
    name: str(m.name),
    category: str(m.category),
    stockLength: num(m.stockLength, 240),
    kerf: num(m.kerf, 0.125),
    endTrim: num(m.endTrim),
    notes: str(m.notes),
    updatedAt: str(m.updatedAt) || nowIso(),
    prices: Array.isArray(m.prices)
      ? m.prices.map((raw) => {
          const p = (raw ?? {}) as Partial<PriceRecord>;
          const s = (p.source ?? {}) as Partial<PriceRecord["source"]>;
          return {
            id: str(p.id) || newId("prc"),
            amount: num(p.amount),
            basis:
              p.basis === "per-foot" || p.basis === "per-metre" || p.basis === "per-inch"
                ? p.basis
                : "per-bar",
            stockLength: num(p.stockLength, 240),
            recordedAt: str(p.recordedAt) || nowIso(),
            source: {
              kind: (s.kind as PriceRecord["source"]["kind"]) || "quote",
              supplier: str(s.supplier),
              reference: str(s.reference),
              url: str(s.url),
              capturedAt: str(s.capturedAt) || todayIso(),
              note: str(s.note),
              attachmentId: typeof s.attachmentId === "string" ? s.attachmentId : undefined,
              attachmentName: typeof s.attachmentName === "string" ? s.attachmentName : undefined,
            },
          };
        })
      : [],
  };
}

/**
 * Carry a v1 single-material job forward into a v2 project, so anyone who used
 * the first release keeps their cut list.
 */
function migrateLegacy(raw: unknown): { project: Project; materials: Material[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const legacy = raw as Record<string, unknown>;
  if (!Array.isArray(legacy.parts)) return null;

  const settings = (legacy.settings ?? {}) as Record<string, unknown>;
  const materialName = str(legacy.material) || "Migrated material";
  const price = num(settings.pricePerBar);
  const stockLength = num(settings.stockLength, 240);

  const material: Material = {
    ...reviveMaterial({}),
    id: newId("mat"),
    name: materialName,
    category: "",
    stockLength,
    kerf: num(settings.kerf, 0.125),
    endTrim: num(settings.endTrim),
    notes: "Carried over from the previous version of the app.",
    prices: price
      ? [
          {
            id: newId("prc"),
            amount: price,
            basis: "per-bar",
            stockLength,
            recordedAt: nowIso(),
            source: {
              kind: "estimate",
              supplier: "",
              reference: "",
              url: "",
              capturedAt: todayIso(),
              note: "Migrated from the previous version — no source recorded.",
            },
          },
        ]
      : [],
  };

  const project: Project = {
    ...emptyProject("quick"),
    name: str(legacy.name),
    unit: legacy.unit === "metric" ? "metric" : "imperial",
    currency: str(legacy.currency, "$"),
    lines: [
      {
        ...emptyLine(),
        name: materialName,
        materialId: material.id,
        stockLength,
        kerf: material.kerf,
        endTrim: material.endTrim,
        strategy: settings.strategy === "sequential" ? "sequential" : "optimized",
        parts: legacy.parts.map(revivePart),
      },
    ],
  };

  return { project, materials: [material] };
}

/* ----------------------------------------------------------------- library */

function reviveLibrary(raw: unknown): Library | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Partial<Library>;
  if (!Array.isArray(l.projects)) return null;

  const projects = l.projects
    .map(reviveProject)
    .filter((project): project is Project => project !== null);

  return {
    schemaVersion: SCHEMA_VERSION,
    projects,
    materials: Array.isArray(l.materials) ? l.materials.map(reviveMaterial) : [],
    tombstones: Array.isArray(l.tombstones)
      ? l.tombstones.flatMap((raw) => {
          const t = (raw ?? {}) as Partial<Tombstone>;
          const id = str(t.id);
          if (!id) return [];
          return [
            {
              id,
              kind: t.kind === "material" ? ("material" as const) : ("project" as const),
              at: str(t.at) || nowIso(),
            },
          ];
        })
      : [],
    activeId: typeof l.activeId === "string" ? l.activeId : projects[0]?.id ?? null,
    updatedAt: str(l.updatedAt) || nowIso(),
  };
}

/**
 * First run on a device that has a v2 single project, or a v1 job, turns it
 * into a one-job library. Nobody loses a take-off to an upgrade.
 */
function loadLibrary(): { library: Library; migrated: boolean } {
  const stored = reviveLibrary(read(LIBRARY_KEY));
  if (stored) return { library: stored, migrated: false };

  const v2 = reviveProject(read(PROJECT_KEY));
  if (v2) {
    const materials = read(HOARD_KEY);
    return {
      library: {
        ...emptyLibrary(),
        projects: [v2],
        materials: Array.isArray(materials) ? materials.map(reviveMaterial) : [],
        activeId: v2.id,
        updatedAt: nowIso(),
      },
      migrated: false,
    };
  }

  const legacy = migrateLegacy(read(LEGACY_KEY));
  if (legacy) {
    return {
      library: {
        ...emptyLibrary(),
        projects: [legacy.project],
        materials: legacy.materials,
        activeId: legacy.project.id,
        updatedAt: nowIso(),
      },
      migrated: true,
    };
  }

  // Nothing stored at all: seed the worked example so the app opens on
  // something real rather than an empty form.
  const sample = sampleProject();
  return {
    library: {
      ...emptyLibrary(),
      projects: [sample],
      materials: sampleMaterials(),
      activeId: sample.id,
      updatedAt: nowIso(),
    },
    migrated: false,
  };
}

/* -------------------------------------------------------------------- hook */

export interface SyncControls {
  state: SyncState;
  code: string;
  /** True once a backend answered — sync can be turned on at all. */
  configured: boolean;
  connect: (code: string) => void;
  disconnect: () => void;
  syncNow: () => void;
}

export interface Workspace {
  project: Project;
  /** Every job, newest edit first, archived ones last. */
  projects: Project[];
  materials: Material[];
  cost: ProjectCost;
  loaded: boolean;
  /** True when the stored data came from the pre-pricing release. */
  migrated: boolean;
  sync: SyncControls;

  patchProject: (changes: Partial<Project>) => void;
  setMode: (mode: Mode) => void;
  replaceProject: (project: Project) => void;

  newProject: (defaults?: Partial<Project>) => string;
  openProject: (id: string) => void;
  duplicateProject: (id: string) => string | null;
  removeProject: (id: string) => void;
  patchProjectById: (id: string, changes: Partial<Project>) => void;

  addLine: () => string;
  patchLine: (id: string, changes: Partial<TakeoffLine>) => void;
  removeLine: (id: string) => void;
  duplicateLine: (id: string) => void;

  addPart: (lineId: string) => void;
  patchPart: (lineId: string, partId: string, changes: Partial<Part>) => void;
  removePart: (lineId: string, partId: string) => void;
  duplicatePart: (lineId: string, partId: string) => void;

  addExtra: () => void;
  patchExtra: (id: string, changes: Partial<Extra>) => void;
  removeExtra: (id: string) => void;

  saveMaterial: (material: Material) => void;
  removeMaterial: (id: string) => void;
  addPrice: (materialId: string, price: PriceRecord) => void;
  removePrice: (materialId: string, priceId: string) => void;
}

export function useWorkspace(): Workspace {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [loaded, setLoaded] = useState(false);
  const [migrated, setMigrated] = useState(false);

  const [syncCode, setSyncCode] = useState("");
  const [syncState, setSyncState] = useState<SyncState>({ status: "off" });
  const [configured, setConfigured] = useState(false);

  // Hydrate after mount so server and client markup agree.
  useEffect(() => {
    const { library: stored, migrated: wasMigrated } = loadLibrary();
    setLibrary(stored);
    setMigrated(wasMigrated);
    setSyncCode(loadCode());
    setLoaded(true);
    void syncAvailable().then(setConfigured);
  }, []);

  useEffect(() => {
    if (loaded) write(LIBRARY_KEY, library);
  }, [library, loaded]);

  /* ------------------------------------------------------------------ sync */

  // What to upload has to be read at the moment of upload, and a state
  // updater cannot do that: React defers it rather than running it there and
  // then. A ref always holds the current library, so sync uploads this
  // device's actual work rather than whatever it had at mount.
  const latest = useRef(library);
  latest.current = library;

  const runSync = useCallback(
    async (code: string) => {
      if (!code) return;
      setSyncState({ status: "syncing" });
      try {
        const merged = await syncOnce(code, latest.current);
        setLibrary((current) => adopt(current, merged));
        setSyncState({ status: "synced", at: nowIso() });
      } catch (error) {
        const { message, unconfigured } = describeError(error);
        setSyncState(unconfigured ? { status: "unconfigured" } : { status: "error", message });
      }
    },
    [],
  );

  // Push on a debounce after edits settle, so a burst of typing is one upload.
  useEffect(() => {
    if (!loaded || !syncCode) return;
    const timer = setTimeout(() => void runSync(syncCode), SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [library, loaded, syncCode, runSync]);

  // Coming back to the tab is the moment the other device's work matters.
  useEffect(() => {
    if (!syncCode) return;
    const onFocus = () => void runSync(syncCode);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [syncCode, runSync]);

  const sync: SyncControls = useMemo(
    () => ({
      state: syncCode ? syncState : { status: "off" },
      code: syncCode,
      configured,
      connect: (code: string) => {
        storeCode(code);
        setSyncCode(code);
        void runSync(code);
      },
      disconnect: () => {
        storeCode("");
        setSyncCode("");
        setSyncState({ status: "off" });
      },
      syncNow: () => void runSync(syncCode),
    }),
    [syncCode, syncState, configured, runSync],
  );

  /* ----------------------------------------------------------- library edits */

  const editLibrary = useCallback((mutate: (draft: Library) => Library) => {
    setLibrary((current) => ({ ...mutate(current), updatedAt: nowIso() }));
  }, []);

  const projects = useMemo(() => {
    const ordered = [...library.projects].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
    return [...ordered.filter((p) => !p.archived), ...ordered.filter((p) => p.archived)];
  }, [library.projects]);

  // A library can be empty for a moment after the last job is deleted; the
  // views all assume a project exists, so stand one in.
  const fallback = useMemo(() => emptyProject("detailed"), []);
  const project =
    library.projects.find((p) => p.id === library.activeId) ?? library.projects[0] ?? fallback;

  const edit = useCallback(
    (mutate: (draft: Project) => Project) =>
      editLibrary((lib) => ({
        ...lib,
        projects: lib.projects.map((p) =>
          p.id === project.id ? { ...mutate(p), updatedAt: nowIso() } : p,
        ),
      })),
    [editLibrary, project.id],
  );

  const newProject = useCallback(
    (defaults?: Partial<Project>) => {
      const created: Project = { ...emptyProject("detailed"), ...defaults, id: newId("prj") };
      editLibrary((lib) => ({
        ...lib,
        projects: [created, ...lib.projects],
        activeId: created.id,
      }));
      return created.id;
    },
    [editLibrary],
  );

  const openProject = useCallback(
    (id: string) => editLibrary((lib) => ({ ...lib, activeId: id })),
    [editLibrary],
  );

  const duplicateProject = useCallback(
    (id: string) => {
      const source = library.projects.find((p) => p.id === id);
      if (!source) return null;
      const copy: Project = {
        ...source,
        id: newId("prj"),
        name: source.name ? `${source.name} (copy)` : "",
        status: "enquiry",
        archived: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        // Fresh ids throughout, or editing the copy would edit the original.
        lines: source.lines.map((line) => ({
          ...line,
          id: newId("ln"),
          parts: line.parts.map((part) => ({ ...part, id: newId("pt") })),
        })),
        extras: source.extras.map((extra) => ({ ...extra, id: newId("ex") })),
      };
      editLibrary((lib) => ({ ...lib, projects: [copy, ...lib.projects], activeId: copy.id }));
      return copy.id;
    },
    [editLibrary, library.projects],
  );

  const removeProject = useCallback(
    (id: string) =>
      editLibrary((lib) => {
        const projects = lib.projects.filter((p) => p.id !== id);
        return {
          ...lib,
          projects,
          tombstones: [...lib.tombstones, tombstone(id, "project")],
          activeId: lib.activeId === id ? projects[0]?.id ?? null : lib.activeId,
        };
      }),
    [editLibrary],
  );

  const patchProjectById = useCallback(
    (id: string, changes: Partial<Project>) =>
      editLibrary((lib) => ({
        ...lib,
        projects: lib.projects.map((p) =>
          p.id === id ? { ...p, ...changes, updatedAt: nowIso() } : p,
        ),
      })),
    [editLibrary],
  );

  const replaceProject = useCallback(
    (next: Project) =>
      editLibrary((lib) => ({
        ...lib,
        projects: lib.projects.some((p) => p.id === next.id)
          ? lib.projects.map((p) => (p.id === next.id ? { ...next, updatedAt: nowIso() } : p))
          : [{ ...next, updatedAt: nowIso() }, ...lib.projects],
        activeId: next.id,
      })),
    [editLibrary],
  );

  /* ------------------------------------------------------------ job editing */

  const patchProject = useCallback(
    (changes: Partial<Project>) => edit((p) => ({ ...p, ...changes })),
    [edit],
  );

  const setMode = useCallback(
    (mode: Mode) =>
      edit((p) => {
        // Switching to detailed on a still-unnamed single line gives it a name
        // so the new multi-line UI does not read as a row of blanks.
        if (mode === "detailed" && p.lines.length === 1 && !p.lines[0].name) {
          return { ...p, mode, lines: [{ ...p.lines[0], name: "Line 1" }] };
        }
        return { ...p, mode };
      }),
    [edit],
  );

  const mapLine = useCallback(
    (id: string, mutate: (line: TakeoffLine) => TakeoffLine) =>
      edit((p) => ({ ...p, lines: p.lines.map((l) => (l.id === id ? mutate(l) : l)) })),
    [edit],
  );

  const addLine = useCallback(() => {
    const line = emptyLine({ name: "" });
    edit((p) => ({ ...p, lines: [...p.lines, line] }));
    return line.id;
  }, [edit]);

  const patchLine = useCallback(
    (id: string, changes: Partial<TakeoffLine>) => mapLine(id, (l) => ({ ...l, ...changes })),
    [mapLine],
  );

  const removeLine = useCallback(
    (id: string) =>
      edit((p) => {
        const lines = p.lines.filter((l) => l.id !== id);
        return { ...p, lines: lines.length ? lines : [emptyLine()] };
      }),
    [edit],
  );

  const duplicateLine = useCallback(
    (id: string) =>
      edit((p) => {
        const index = p.lines.findIndex((l) => l.id === id);
        if (index === -1) return p;
        const source = p.lines[index];
        const copy: TakeoffLine = {
          ...source,
          id: newId("ln"),
          name: source.name ? `${source.name} (copy)` : "",
          parts: source.parts.map((part) => ({ ...part, id: newId("pt") })),
        };
        const lines = [...p.lines];
        lines.splice(index + 1, 0, copy);
        return { ...p, lines };
      }),
    [edit],
  );

  const addPart = useCallback(
    (lineId: string) => mapLine(lineId, (l) => ({ ...l, parts: [...l.parts, emptyPart()] })),
    [mapLine],
  );

  const patchPart = useCallback(
    (lineId: string, partId: string, changes: Partial<Part>) =>
      mapLine(lineId, (l) => ({
        ...l,
        parts: l.parts.map((part) => (part.id === partId ? { ...part, ...changes } : part)),
      })),
    [mapLine],
  );

  const removePart = useCallback(
    (lineId: string, partId: string) =>
      mapLine(lineId, (l) => {
        const parts = l.parts.filter((part) => part.id !== partId);
        return { ...l, parts: parts.length ? parts : [emptyPart()] };
      }),
    [mapLine],
  );

  const duplicatePart = useCallback(
    (lineId: string, partId: string) =>
      mapLine(lineId, (l) => {
        const index = l.parts.findIndex((part) => part.id === partId);
        if (index === -1) return l;
        const parts = [...l.parts];
        parts.splice(index + 1, 0, { ...l.parts[index], id: newId("pt") });
        return { ...l, parts };
      }),
    [mapLine],
  );

  const addExtra = useCallback(
    () =>
      edit((p) => ({
        ...p,
        extras: [...p.extras, { id: newId("ex"), description: "", qty: 1, unitCost: 0 }],
      })),
    [edit],
  );

  const patchExtra = useCallback(
    (id: string, changes: Partial<Extra>) =>
      edit((p) => ({
        ...p,
        extras: p.extras.map((e) => (e.id === id ? { ...e, ...changes } : e)),
      })),
    [edit],
  );

  const removeExtra = useCallback(
    (id: string) => edit((p) => ({ ...p, extras: p.extras.filter((e) => e.id !== id) })),
    [edit],
  );

  /* -------------------------------------------------------------- materials */

  const saveMaterial = useCallback(
    (material: Material) =>
      editLibrary((lib) => {
        const stamped = { ...material, updatedAt: nowIso() };
        const index = lib.materials.findIndex((m) => m.id === material.id);
        if (index === -1) return { ...lib, materials: [...lib.materials, stamped] };
        const materials = [...lib.materials];
        materials[index] = stamped;
        return { ...lib, materials };
      }),
    [editLibrary],
  );

  const removeMaterial = useCallback(
    (id: string) =>
      // The line's materialId is left dangling rather than silently rewriting
      // the take-off; the UI surfaces it as "this material has been deleted".
      editLibrary((lib) => ({
        ...lib,
        materials: lib.materials.filter((m) => m.id !== id),
        tombstones: [...lib.tombstones, tombstone(id, "material")],
      })),
    [editLibrary],
  );

  const mapMaterial = useCallback(
    (id: string, mutate: (material: Material) => Material) =>
      editLibrary((lib) => ({
        ...lib,
        materials: lib.materials.map((m) =>
          m.id === id ? { ...mutate(m), updatedAt: nowIso() } : m,
        ),
      })),
    [editLibrary],
  );

  const addPrice = useCallback(
    (materialId: string, price: PriceRecord) =>
      mapMaterial(materialId, (m) => ({ ...m, prices: [price, ...m.prices] })),
    [mapMaterial],
  );

  const removePrice = useCallback(
    (materialId: string, priceId: string) =>
      mapMaterial(materialId, (m) => ({
        ...m,
        prices: m.prices.filter((p) => p.id !== priceId),
      })),
    [mapMaterial],
  );

  const cost = useMemo(() => costProject(project, library.materials), [project, library.materials]);

  return {
    project,
    projects,
    materials: library.materials,
    cost,
    loaded,
    migrated,
    sync,
    patchProject,
    setMode,
    replaceProject,
    newProject,
    openProject,
    duplicateProject,
    removeProject,
    patchProjectById,
    addLine,
    patchLine,
    removeLine,
    duplicateLine,
    addPart,
    patchPart,
    removePart,
    duplicatePart,
    addExtra,
    patchExtra,
    removeExtra,
    saveMaterial,
    removeMaterial,
    addPrice,
    removePrice,
  };
}
