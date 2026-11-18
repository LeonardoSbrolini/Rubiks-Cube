import { COLOR_HEX, type ColorId, type Sticker } from "./cube";

export interface Theme {
  id: string;
  name: string;
  body: { color: string; metalness: number; roughness: number };
  sticker: { size: number; radius: number; metalness: number; roughness: number; glow: number; env: number };
  palette?: Partial<Record<ColorId, string>>;
  /** cor de destaque da interface para este tema */
  accent: string;
}

export const THEMES: Theme[] = [
  {
    id: "classic",
    name: "Clássico",
    body: { color: "#111114", metalness: 0.1, roughness: 0.5 },
    sticker: { size: 0.84, radius: 0.14, metalness: 0, roughness: 0.35, glow: 0, env: 0.5 },
    accent: "#a78bfa",
  },
];

export const themeHex = (t: Theme, c: Sticker) => (c !== "X" && t.palette?.[c]) || COLOR_HEX[c];
