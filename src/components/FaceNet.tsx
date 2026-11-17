"use client";

import { FACES, type Face, type State } from "@/lib/cube";
import { themeHex, type Theme } from "@/lib/themes";

/** Planificação em cruz: posição (coluna, linha) de cada face numa grade 4x3 de faces. */
const LAYOUT: Record<Face, [number, number]> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

export default function FaceNet({
  size,
  state,
  theme,
  onPaint,
  highlight,
}: {
  size: number;
  state: State;
  theme: Theme;
  onPaint?: (index: number) => void;
  highlight?: number[];
}) {
  const bad = new Set(highlight ?? []);
  const k = size * size;
  const gap = size <= 3 ? 3 : size <= 5 ? 2 : 1;
  const radius = size <= 3 ? 5 : size <= 5 ? 3 : 2;
  return (
    <div
      className="mx-auto grid w-full select-none"
      style={{
        gridTemplateColumns: `repeat(${4 * size}, minmax(0, 1fr))`,
        gap,
        maxWidth: 420,
      }}
    >
      {FACES.map((face, fi) => {
        const [fc, fr] = LAYOUT[face];
        return Array.from({ length: k }, (_, i) => {
          const idx = fi * k + i;
          const r = Math.floor(i / size);
          const c = i % size;
          const isMid = size % 2 === 1 && i === (k - 1) / 2;
          return (
            <button
              key={idx}
              type="button"
              aria-label={`Adesivo ${face} ${i + 1}`}
              onClick={() => onPaint?.(idx)}
              disabled={!onPaint}
              className={`net-cell relative aspect-square transition-[transform,background-color] duration-200 enabled:hover:z-10 enabled:hover:scale-[1.18] enabled:active:scale-90 ${
                bad.has(idx) ? "animate-pulse outline-2 outline-red-500" : ""
              }`}
              style={{
                gridColumn: fc * size + c + 1,
                gridRow: fr * size + r + 1,
                background: themeHex(theme, state[idx]),
                borderRadius: radius,
                boxShadow: "inset 0 -2px 0 rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.25)",
              }}
            >
              {isMid && size <= 5 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-black/45">
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
