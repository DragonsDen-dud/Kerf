/** Distinct fills for each part, shared by the on-screen diagrams and the PNG. */
export const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#db2777",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#4d7c0f",
  "#be123c",
  "#0369a1",
  "#9333ea",
];

export function colourFor(parts: Array<{ id: string }>, id: string): string {
  const index = parts.findIndex((p) => p.id === id);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}
