/**
 * Modelo genérico de cubo NxN (2x2 até 7x7) baseado em adesivos ("facelets").
 *
 * Ordem das faces: U R F D L B, cada uma com N*N adesivos lidos linha a linha,
 * na mesma convenção do Kociemba / cubejs (para N=3 a string é idêntica).
 *
 * Coordenadas inteiras: cada peça fica em {-(N-1), -(N-3), …, N-1} (passo 2) em cada eixo.
 * x → direita, y → cima, z → frente (convenção do three.js).
 */

export type Face = "U" | "R" | "F" | "D" | "L" | "B";
export const FACES: Face[] = ["U", "R", "F", "D", "L", "B"];

export type ColorId = "W" | "Y" | "G" | "B" | "R" | "O";
export const COLORS: { id: ColorId; name: string; hex: string }[] = [
  { id: "W", name: "Branco", hex: "#f5f5f0" },
  { id: "Y", name: "Amarelo", hex: "#ffd500" },
  { id: "G", name: "Verde", hex: "#00a651" },
  { id: "B", name: "Azul", hex: "#0051ba" },
  { id: "R", name: "Vermelho", hex: "#c41e3a" },
  { id: "O", name: "Laranja", hex: "#ff6a13" },
];
/** "X" = adesivo ainda não pintado */
export type Sticker = ColorId | "X";
export const UNPAINTED_HEX = "#4b4b55";
export const COLOR_HEX: Record<Sticker, string> = {
  ...(Object.fromEntries(COLORS.map((c) => [c.id, c.hex])) as Record<ColorId, string>),
  X: UNPAINTED_HEX,
};
export const COLOR_NAME: Record<Sticker, string> = {
  ...(Object.fromEntries(COLORS.map((c) => [c.id, c.name])) as Record<ColorId, string>),
  X: "Sem cor",
};
export const OPPOSITE_COLOR: Record<ColorId, ColorId> = {
  W: "Y",
  Y: "W",
  G: "B",
  B: "G",
  R: "O",
  O: "R",
};

/** Esquema ocidental padrão: branco em cima, verde na frente. */
export const DEFAULT_SCHEME: Record<Face, ColorId> = {
  U: "W",
  R: "R",
  F: "G",
  D: "Y",
  L: "O",
  B: "B",
};

export const FACE_NAME: Record<Face, string> = {
  U: "Cima",
  R: "Direita",
  F: "Frente",
  D: "Baixo",
  L: "Esquerda",
  B: "Trás",
};

/** tamanhos oferecidos na interface (os que têm solução automática) */
export const SIZES = [2, 3] as const;
export type Size = (typeof SIZES)[number];

export type State = Sticker[]; // length 6*N*N

export function solvedState(n: number, scheme = DEFAULT_SCHEME): State {
  return FACES.flatMap((f) => Array<Sticker>(n * n).fill(scheme[f]));
}

/** Tudo sem cor; em cubos ímpares o centro fixo de cada face já vem pintado. */
export function blankState(n: number, scheme = DEFAULT_SCHEME): State {
  const mid = n % 2 === 1 ? (n * n - 1) / 2 : -1;
  return FACES.flatMap((f) =>
    Array.from({ length: n * n }, (_, i): Sticker => (i === mid ? scheme[f] : "X")),
  );
}

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

export type Vec3 = [number, number, number];
export type Axis = 0 | 1 | 2;
export interface Facelet {
  index: number;
  face: Face;
  /** posição (inteira) da peça que contém o adesivo */
  pos: Vec3;
  normal: Vec3;
}

const FACE_FRAME: Record<Face, { origin: Vec3; col: Vec3; row: Vec3; normal: Vec3 }> = {
  U: { origin: [-1, 1, -1], col: [1, 0, 0], row: [0, 0, 1], normal: [0, 1, 0] },
  R: { origin: [1, 1, 1], col: [0, 0, -1], row: [0, -1, 0], normal: [1, 0, 0] },
  F: { origin: [-1, 1, 1], col: [1, 0, 0], row: [0, -1, 0], normal: [0, 0, 1] },
  D: { origin: [-1, -1, 1], col: [1, 0, 0], row: [0, 0, -1], normal: [0, -1, 0] },
  L: { origin: [-1, 1, -1], col: [0, 0, 1], row: [0, -1, 0], normal: [-1, 0, 0] },
  B: { origin: [1, 1, -1], col: [-1, 0, 0], row: [0, -1, 0], normal: [0, 0, -1] },
};

const geoCache = new Map<number, { facelets: Facelet[]; byKey: Map<string, number> }>();
const key = (p: Vec3, n: Vec3) => `${p.join(",")}|${n.join(",")}`;

function geometry(n: number) {
  let g = geoCache.get(n);
  if (g) return g;
  const m = n - 1;
  const facelets = FACES.flatMap((face, fi) => {
    const { origin, col, row, normal } = FACE_FRAME[face];
    return Array.from({ length: n * n }, (_, i): Facelet => {
      const r = Math.floor(i / n);
      const c = i % n;
      const pos = [0, 1, 2].map((k) => origin[k] * m + 2 * (col[k] * c + row[k] * r)) as Vec3;
      return { index: fi * n * n + i, face, pos, normal };
    });
  });
  g = { facelets, byKey: new Map(facelets.map((f) => [key(f.pos, f.normal), f.index])) };
  geoCache.set(n, g);
  return g;
}

export const faceletsFor = (n: number) => geometry(n).facelets;

/** Posições de todas as peças visíveis */
export function cubiePositions(n: number): Vec3[] {
  const out: Vec3[] = [];
  const m = n - 1;
  for (let x = -m; x <= m; x += 2)
    for (let y = -m; y <= m; y += 2)
      for (let z = -m; z <= m; z += 2)
        if (Math.abs(x) === m || Math.abs(y) === m || Math.abs(z) === m) out.push([x, y, z]);
  return out;
}

// ---------------------------------------------------------------------------
// Movimentos
// ---------------------------------------------------------------------------

/** Giro de uma camada: eixo, coordenada da camada e quartos de volta (positivo = anti-horário em torno do eixo +). */
export interface Move {
  axis: Axis;
  layer: number;
  q: 1 | -1 | 2;
}

/** Eixo, lado e sentido horário (visto de frente) de cada face */
const FACE_DEF: Record<Face, { axis: Axis; side: 1 | -1; cw: 1 | -1 }> = {
  U: { axis: 1, side: 1, cw: -1 },
  D: { axis: 1, side: -1, cw: 1 },
  R: { axis: 0, side: 1, cw: -1 },
  L: { axis: 0, side: -1, cw: 1 },
  F: { axis: 2, side: 1, cw: -1 },
  B: { axis: 2, side: -1, cw: 1 },
};

/** Giro de uma face externa: turns 1 = horário, -1 = anti-horário, 2 = meia volta */
export function faceMove(n: number, face: Face, turns: 1 | -1 | 2): Move {
  const d = FACE_DEF[face];
  const q = turns === 2 ? 2 : ((d.cw * turns) as 1 | -1);
  return { axis: d.axis, layer: d.side * (n - 1), q };
}

export function parseAlg(n: number, s: string): Move[] {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const face = t[0] as Face;
      if (!FACES.includes(face)) throw new Error(`Movimento inválido: ${t}`);
      const suf = t.slice(1);
      return faceMove(n, face, suf === "'" ? -1 : suf === "2" ? 2 : 1);
    });
}

export function invertMove(m: Move): Move {
  return { ...m, q: m.q === 2 ? 2 : ((-m.q) as 1 | -1) };
}

const AXIS_FACES: Record<Axis, [Face, Face]> = { 0: ["R", "L"], 1: ["U", "D"], 2: ["F", "B"] };

/** Face de referência do movimento e profundidade da camada (1 = face externa). */
export function moveFace(n: number, m: Move): { face: Face; depth: number; turns: 1 | -1 | 2 } {
  const [pos, neg] = AXIS_FACES[m.axis];
  const face = m.layer >= 0 ? pos : neg;
  const d = FACE_DEF[face];
  const depth = (n - 1 - Math.abs(m.layer)) / 2 + 1;
  const turns = m.q === 2 ? 2 : m.q === d.cw ? 1 : -1;
  return { face, depth, turns };
}

export function moveToString(n: number, m: Move): string {
  const { face, depth, turns } = moveFace(n, m);
  const suf = turns === -1 ? "'" : turns === 2 ? "2" : "";
  if (n === 3 && depth === 2) {
    // fatias do meio: M segue L, E segue D, S segue F
    const [slice, ref] = m.axis === 0 ? ["M", "L"] : m.axis === 1 ? ["E", "D"] : ["S", "F"];
    const d = FACE_DEF[ref as Face];
    const t = m.q === 2 ? 2 : m.q === d.cw ? 1 : -1;
    return slice + (t === -1 ? "'" : t === 2 ? "2" : "");
  }
  return (depth > 1 ? depth : "") + face + suf;
}

const MOVE_HINT: Record<Face, string> = {
  U: "a face de cima",
  D: "a face de baixo",
  R: "a face da direita",
  L: "a face da esquerda",
  F: "a face da frente",
  B: "a face de trás",
};

export function describeMove(n: number, m: Move): string {
  const { face, depth, turns } = moveFace(n, m);
  const what = depth === 1 ? MOVE_HINT[face] : `a ${depth}ª camada a partir d${MOVE_HINT[face].slice(2)}`;
  if (turns === 2) return `Gire ${what} meia volta (180°).`;
  const dir = turns === 1 ? "horário" : "anti-horário";
  return `Gire ${what} 90° no sentido ${dir} (olhando de frente para essa face).`;
}

function rotateVec(v: Vec3, axis: Axis, q: number): Vec3 {
  let [x, y, z] = v;
  const k = ((q % 4) + 4) % 4;
  for (let i = 0; i < k; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x + 0, y + 0, z + 0];
}

const permCache = new Map<string, number[]>();
/** perm[novoIndice] = indiceAntigo */
export function permutationFor(n: number, m: Move): number[] {
  const k = `${n}:${m.axis}:${m.layer}:${m.q}`;
  const hit = permCache.get(k);
  if (hit) return hit;
  const { facelets, byKey } = geometry(n);
  const perm = new Array<number>(facelets.length);
  for (const f of facelets) {
    if (f.pos[m.axis] === m.layer) {
      const ni = byKey.get(key(rotateVec(f.pos, m.axis, m.q), rotateVec(f.normal, m.axis, m.q)))!;
      perm[ni] = f.index;
    } else perm[f.index] = f.index;
  }
  permCache.set(k, perm);
  return perm;
}

export function applyMove(n: number, state: State, m: Move): State {
  return permutationFor(n, m).map((old) => state[old]);
}

export function applyAlg(n: number, state: State, moves: Move[]): State {
  return moves.reduce((s, m) => applyMove(n, s, m), state);
}

export function isSolved(n: number, state: State): boolean {
  const k = n * n;
  for (let f = 0; f < 6; f++)
    for (let i = 1; i < k; i++) if (state[f * k + i] !== state[f * k] || state[f * k] === "X") return false;
  return true;
}

export function randomScramble(n: number): Move[] {
  const length = n === 2 ? 11 : n === 3 ? 22 : 20 + (n - 3) * 10;
  const layers: number[] = [];
  for (let l = -(n - 1); l <= n - 1; l += 2) layers.push(l);
  // no 3x3 usamos só faces externas (embaralhamento "oficial")
  const usable = n === 3 ? [-(n - 1), n - 1] : layers;
  const out: Move[] = [];
  while (out.length < length) {
    const axis = Math.floor(Math.random() * 3) as Axis;
    const layer = usable[Math.floor(Math.random() * usable.length)];
    const last = out[out.length - 1];
    if (last && last.axis === axis && last.layer === layer) continue;
    // evita sequências longas no mesmo eixo
    if (out.length >= 2 && out[out.length - 1].axis === axis && out[out.length - 2].axis === axis) continue;
    const q = ([1, -1, 2] as const)[Math.floor(Math.random() * 3)];
    out.push({ axis, layer, q });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validação genérica (contagem) — 2x2 e 3x3 têm validação completa em módulos próprios
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  badFacelets: number[];
  /** dado pronto para o solver (3x3: string URFDLB; 2x2: string de cores) */
  solverInput?: string;
}

export function validateCounts(n: number, state: State): ValidationResult {
  const errors: string[] = [];
  const missing = state.filter((c) => c === "X").length;
  if (missing) {
    errors.push(`Faltam ${missing} adesivo${missing === 1 ? "" : "s"} para pintar.`);
    return { ok: false, errors, badFacelets: [] };
  }
  const need = n * n;
  for (const c of COLORS) {
    const k = state.filter((s) => s === c.id).length;
    if (k !== need)
      errors.push(`A cor ${c.name.toLowerCase()} aparece ${k} vez${k === 1 ? "" : "es"} (precisa ser ${need}).`);
  }
  if (n % 2 === 1) {
    const mid = (need - 1) / 2;
    const centers = new Set(FACES.map((_, i) => state[i * need + mid]));
    if (centers.size !== 6) {
      errors.push("Os 6 centros precisam ter cores diferentes.");
      return { ok: false, errors, badFacelets: FACES.map((_, i) => i * need + mid) };
    }
  }
  return { ok: errors.length === 0, errors, badFacelets: [] };
}
