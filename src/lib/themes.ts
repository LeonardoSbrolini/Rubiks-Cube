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
  {
    id: "stickerless",
    name: "Sem adesivo",
    body: { color: "#1b1b1f", metalness: 0, roughness: 0.6 },
    sticker: { size: 0.95, radius: 0.1, metalness: 0, roughness: 0.5, glow: 0, env: 0.35 },
    accent: "#34d399",
  },
  {
    id: "chrome",
    name: "Cromado",
    body: { color: "#d4d4d8", metalness: 1, roughness: 0.14 },
    sticker: { size: 0.82, radius: 0.16, metalness: 0.55, roughness: 0.22, glow: 0, env: 1 },
    accent: "#e4e4e7",
  },
  {
    id: "gold",
    name: "Dourado",
    body: { color: "#e2b04a", metalness: 1, roughness: 0.22 },
    sticker: { size: 0.82, radius: 0.16, metalness: 0.35, roughness: 0.3, glow: 0, env: 0.9 },
    accent: "#fbbf24",
  },
  {
    id: "neon",
    name: "Neon",
    body: { color: "#07070c", metalness: 0.4, roughness: 0.35 },
    sticker: { size: 0.8, radius: 0.2, metalness: 0, roughness: 0.3, glow: 0.45, env: 0.2 },
    palette: { W: "#d9e4ff", Y: "#f5ff2e", G: "#39ff6a", B: "#1fb6ff", R: "#ff2d6f", O: "#ff9a1f" },
    accent: "#22d3ee",
  },
  {
    id: "pastel",
    name: "Pastel",
    body: { color: "#f4f1ee", metalness: 0, roughness: 0.55 },
    sticker: { size: 0.86, radius: 0.18, metalness: 0, roughness: 0.55, glow: 0, env: 0.4 },
    palette: { W: "#ffffff", Y: "#fde68a", G: "#86efac", B: "#93c5fd", R: "#fca5a5", O: "#fdba74" },
    accent: "#f9a8d4",
  },
];

export const themeHex = (t: Theme, c: Sticker) => (c !== "X" && t.palette?.[c]) || COLOR_HEX[c];
