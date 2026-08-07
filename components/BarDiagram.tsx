"use client";

import type { Bar } from "@/lib/pack";
import { colourFor } from "@/lib/palette";
import { formatValue, type UnitSystem } from "@/lib/units";

interface Props {
  bar: Bar;
  usableLength: number;
  parts: Array<{ id: string }>;
  unit: UnitSystem;
}

/**
 * A single stock bar drawn to scale: each cut in its part colour, the offcut
 * left grey at the end.
 */
export default function BarDiagram({ bar, usableLength, parts, unit }: Props) {
  const scale = usableLength > 0 ? 100 / usableLength : 0;

  return (
    <div className="flex h-9 w-full overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-white/10">
      {bar.pieces.map((piece, i) => {
        const width = piece.length * scale;
        const text = formatValue(piece.length, unit);
        return (
          <div
            key={`${piece.partId}-${i}`}
            className="flex shrink-0 items-center justify-center overflow-hidden border-r border-ink-950/60 text-[11px] font-bold text-white/95"
            style={{ width: `${width}%`, background: colourFor(parts, piece.partId) }}
            title={`${piece.label || "piece"} — ${text}`}
          >
            {width > 7 ? text : null}
          </div>
        );
      })}
      {bar.remaining > 0.01 ? (
        <div
          className="flex shrink-0 items-center justify-center text-[11px] font-semibold text-slate-400"
          style={{ width: `${bar.remaining * scale}%` }}
          title={`Offcut — ${formatValue(bar.remaining, unit)}`}
        >
          {bar.remaining * scale > 9 ? formatValue(bar.remaining, unit) : null}
        </div>
      ) : null}
    </div>
  );
}
