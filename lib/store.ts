"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { costProject, type ProjectCost } from "./pricing";
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
  type Part,
  type PriceRecord,
  type Project,
  type TakeoffLine,
} from "./types";

const PROJECT_KEY = "kerf.project.v2";
const HOARD_KEY = "kerf.hoard.v2";
const LEGACY_KEY = "kerf.job.v1";

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

/* -------------------------------------------------------------------- hook */

export interface Workspace {
  project: Project;
  materials: Material[];
  cost: ProjectCost;
  loaded: boolean;
  /** True when the stored data came from the pre-pricing release. */
  migrated: boolean;

  patchProject: (changes: Partial<Project>) => void;
  setMode: (mode: Mode) => void;
  replaceProject: (project: Project) => void;

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
  const [project, setProject] = useState<Project>(sampleProject);
  const [materials, setMaterials] = useState<Material[]>(sampleMaterials);
  const [loaded, setLoaded] = useState(false);
  const [migrated, setMigrated] = useState(false);

  // Hydrate after mount so server and client markup agree.
  useEffect(() => {
    const storedProject = reviveProject(read(PROJECT_KEY));
    const storedHoard = read(HOARD_KEY);

    if (storedProject) {
      setProject(storedProject);
      if (Array.isArray(storedHoard)) setMaterials(storedHoard.map(reviveMaterial));
    } else {
      const legacy = migrateLegacy(read(LEGACY_KEY));
      if (legacy) {
        setProject(legacy.project);
        setMaterials(legacy.materials);
        setMigrated(true);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) write(PROJECT_KEY, project);
  }, [project, loaded]);

  useEffect(() => {
    if (loaded) write(HOARD_KEY, materials);
  }, [materials, loaded]);

  const edit = useCallback((mutate: (draft: Project) => Project) => {
    setProject((current) => ({ ...mutate(current), updatedAt: nowIso() }));
  }, []);

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

  const saveMaterial = useCallback((material: Material) => {
    setMaterials((current) => {
      const stamped = { ...material, updatedAt: nowIso() };
      const index = current.findIndex((m) => m.id === material.id);
      if (index === -1) return [...current, stamped];
      const next = [...current];
      next[index] = stamped;
      return next;
    });
  }, []);

  const removeMaterial = useCallback((id: string) => {
    setMaterials((current) => current.filter((m) => m.id !== id));
    // Leave the line's materialId dangling rather than silently rewriting the
    // take-off; the UI surfaces it as "material removed from the Hoard".
  }, []);

  const addPrice = useCallback((materialId: string, price: PriceRecord) => {
    setMaterials((current) =>
      current.map((m) =>
        m.id === materialId
          ? { ...m, prices: [price, ...m.prices], updatedAt: nowIso() }
          : m,
      ),
    );
  }, []);

  const removePrice = useCallback((materialId: string, priceId: string) => {
    setMaterials((current) =>
      current.map((m) =>
        m.id === materialId
          ? { ...m, prices: m.prices.filter((p) => p.id !== priceId), updatedAt: nowIso() }
          : m,
      ),
    );
  }, []);

  const cost = useMemo(() => costProject(project, materials), [project, materials]);

  return {
    project,
    materials,
    cost,
    loaded,
    migrated,
    patchProject,
    setMode,
    replaceProject: setProject,
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
