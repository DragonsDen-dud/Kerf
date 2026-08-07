"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { pack, type Part, type Settings, type Strategy } from "./pack";
import type { UnitSystem } from "./units";

const STORAGE_KEY = "kerf.job.v1";

export interface Job {
  name: string;
  material: string;
  unit: UnitSystem;
  currency: string;
  settings: Settings;
  parts: Part[];
}

let idCounter = 0;
export const newId = () => `p${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** The sample job from the source workbook, so the app is never empty on first run. */
export function sampleJob(): Job {
  return {
    name: "BRATTON 1X1",
    material: '1" x 1" tube',
    unit: "imperial",
    currency: "$",
    settings: {
      stockLength: 240,
      kerf: 0.125,
      endTrim: 0,
      strategy: "optimized",
      pricePerBar: 0,
    },
    parts: [
      { id: newId(), label: "A1,A3", length: 45.5, qty: 4 },
      { id: newId(), label: "A2,A4", length: 51, qty: 4 },
      { id: newId(), label: "A5", length: 70, qty: 2 },
      { id: newId(), label: "A6,A7", length: 35, qty: 4 },
      { id: newId(), label: "B1,B3", length: 54, qty: 12 },
      { id: newId(), label: "B2,B4", length: 51, qty: 12 },
      { id: newId(), label: "B5", length: 77, qty: 6 },
      { id: newId(), label: "B6,B7", length: 38, qty: 12 },
    ],
  };
}

export function emptyJob(): Job {
  const base = sampleJob();
  return {
    ...base,
    name: "",
    material: "",
    parts: [{ id: newId(), label: "", length: 0, qty: 1 }],
  };
}

function reviveJob(raw: unknown): Job | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<Job>;
  if (!Array.isArray(candidate.parts) || !candidate.settings) return null;

  const base = sampleJob();
  return {
    name: typeof candidate.name === "string" ? candidate.name : "",
    material: typeof candidate.material === "string" ? candidate.material : "",
    unit: candidate.unit === "metric" ? "metric" : "imperial",
    currency: typeof candidate.currency === "string" ? candidate.currency : "$",
    settings: { ...base.settings, ...candidate.settings },
    parts: candidate.parts
      .filter((p): p is Part => !!p && typeof p === "object")
      .map((p) => ({
        id: typeof p.id === "string" ? p.id : newId(),
        label: typeof p.label === "string" ? p.label : "",
        length: Number(p.length) || 0,
        qty: Math.max(0, Math.floor(Number(p.qty) || 0)),
      })),
  };
}

export function useJob() {
  const [job, setJob] = useState<Job>(sampleJob);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from localStorage after mount so server and client markup agree.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const revived = reviveJob(JSON.parse(stored));
        if (revived) setJob(revived);
      }
    } catch {
      // Corrupt or unavailable storage just means we keep the sample job.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
    } catch {
      // Private mode / quota: the job simply won't survive a reload.
    }
  }, [job, loaded]);

  const patch = useCallback((changes: Partial<Job>) => {
    setJob((current) => ({ ...current, ...changes }));
  }, []);

  const patchSettings = useCallback((changes: Partial<Settings>) => {
    setJob((current) => ({ ...current, settings: { ...current.settings, ...changes } }));
  }, []);

  const setStrategy = useCallback(
    (strategy: Strategy) => patchSettings({ strategy }),
    [patchSettings],
  );

  const updatePart = useCallback((id: string, changes: Partial<Part>) => {
    setJob((current) => ({
      ...current,
      parts: current.parts.map((part) => (part.id === id ? { ...part, ...changes } : part)),
    }));
  }, []);

  const addPart = useCallback(() => {
    const id = newId();
    setJob((current) => ({
      ...current,
      parts: [...current.parts, { id, label: "", length: 0, qty: 1 }],
    }));
    return id;
  }, []);

  const removePart = useCallback((id: string) => {
    setJob((current) => {
      const parts = current.parts.filter((part) => part.id !== id);
      return {
        ...current,
        parts: parts.length ? parts : [{ id: newId(), label: "", length: 0, qty: 1 }],
      };
    });
  }, []);

  const duplicatePart = useCallback((id: string) => {
    setJob((current) => {
      const index = current.parts.findIndex((part) => part.id === id);
      if (index === -1) return current;
      const copy = { ...current.parts[index], id: newId() };
      const parts = [...current.parts];
      parts.splice(index + 1, 0, copy);
      return { ...current, parts };
    });
  }, []);

  const reset = useCallback((next: Job) => setJob(next), []);

  const result = useMemo(() => pack(job.parts, job.settings), [job.parts, job.settings]);

  return {
    job,
    loaded,
    result,
    patch,
    patchSettings,
    setStrategy,
    updatePart,
    addPart,
    removePart,
    duplicatePart,
    reset,
  };
}
