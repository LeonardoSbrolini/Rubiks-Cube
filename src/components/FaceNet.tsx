"use client";

import { COLOR_HEX, FACE_NAME, type Face, type State } from "@/lib/cube";

/** Planificação em cruz: posição (coluna, linha) de cada face numa grade 4x3 de faces. */
const LAYOUT: Record<Face, [number, number]> = {
  U: [1, 0],
  L: [0, 1],
  F: [1, 1],
  R: [2, 1],
  B: [3, 1],
  D: [1, 2],
};
const ORDER: Face[] = ["U", "R", "F", "D", "L", "B"];

export default function FaceNet({
  state,
  onPaint,
  highlight,
}: {
  state: State;
  onPaint?: (index: number) => void;
  highlight?: number[];
}) {
  const bad = new Set(highlight ?? []);
  return (
    <div
      className="grid w-full select-none gap-[3px]"
      style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridTemplateRows: "repeat(9, auto)" }}
    >
      {ORDER.map((face, fi) => {
        const [fc, fr] = LAYOUT[face];
        return Array.from({ length: 9 }, (_, i) => {
          const idx = fi * 9 + i;
          const col = fc * 3 + (i % 3) + 1;
          const row = fr * 3 + Math.floor(i / 3) + 1;
          return (
            <button
              key={idx}
              type="button"
              title={`${FACE_NAME[face]} ${i + 1}`}
              onClick={() => onPaint?.(idx)}
              disabled={!onPaint}
              className={`relative aspect-square rounded-[4px] border border-black/40 transition-transform enabled:hover:scale-110 enabled:active:scale-95 ${
                bad.has(idx) ? "ring-2 ring-red-500 ring-offset-1 ring-offset-zinc-950" : ""
              }`}
              style={{ gridColumn: col, gridRow: row, background: COLOR_HEX[state[idx]] }}
            >
              {i === 4 && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black/50 mix-blend-multiply">
                  {face}
                </span>
              )}
            </button>
          );
        });
      })}
    </div>
  );
}
