/**
 * Modelo do cubo 3x3 baseado em "facelets" (54 adesivos), na mesma ordem
 * usada pelo algoritmo de Kociemba / cubejs: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53).
 *
 * Cada adesivo guarda uma cor (ColorId). As faces são identificadas pela cor do centro,
 * então o usuário pode segurar o cubo em qualquer orientação desde que pinte os centros
 * corretamente.
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

export type State = Sticker[]; // length 54

export function solvedState(scheme = DEFAULT_SCHEME): State {
  return FACES.flatMap((f) => Array<Sticker>(9).fill(scheme[f]));
}

/** Tudo sem cor, exceto os centros (esquema padrão). */
export function blankState(scheme = DEFAULT_SCHEME): State {
  return FACES.flatMap((f) =>
    Array.from({ length: 9 }, (_, i): Sticker => (i === 4 ? scheme[f] : "X")),
  );
}

// ---------------------------------------------------------------------------
// Geometria: posição (x,y,z ∈ {-1,0,1}) e normal de cada adesivo.
// x → direita, y → cima, z → frente (convenção do three.js).
// ---------------------------------------------------------------------------

export type Vec3 = [number, number, number];
export interface Facelet {
  index: number;
  face: Face;
  pos: Vec3;
  normal: Vec3;
}

const FACE_FRAME: Record<Face, { origin: Vec3; col: Vec3; row: Vec3; normal: Vec3 }> = {
  // origem = posição do adesivo 1 da face; col/row = direção de avanço
  U: { origin: [-1, 1, -1], col: [1, 0, 0], row: [0, 0, 1], normal: [0, 1, 0] },
  R: { origin: [1, 1, 1], col: [0, 0, -1], row: [0, -1, 0], normal: [1, 0, 0] },
  F: { origin: [-1, 1, 1], col: [1, 0, 0], row: [0, -1, 0], normal: [0, 0, 1] },
  D: { origin: [-1, -1, 1], col: [1, 0, 0], row: [0, 0, -1], normal: [0, -1, 0] },
  L: { origin: [-1, 1, -1], col: [0, 0, 1], row: [0, -1, 0], normal: [-1, 0, 0] },
  B: { origin: [1, 1, -1], col: [-1, 0, 0], row: [0, -1, 0], normal: [0, 0, -1] },
};

export const FACELETS: Facelet[] = FACES.flatMap((face, fi) => {
  const { origin, col, row, normal } = FACE_FRAME[face];
  return Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const pos: Vec3 = [
      origin[0] + col[0] * c + row[0] * r,
      origin[1] + col[1] * c + row[1] * r,
      origin[2] + col[2] * c + row[2] * r,
    ];
    return { index: fi * 9 + i, face, pos, normal };
  });
});

const key = (p: Vec3, n: Vec3) => `${p.join(",")}|${n.join(",")}`;
const FACELET_BY_KEY = new Map(FACELETS.map((f) => [key(f.pos, f.normal), f.index]));

// ---------------------------------------------------------------------------
// Movimentos
// ---------------------------------------------------------------------------

export type Axis = 0 | 1 | 2; // x, y, z
export interface MoveDef {
  axis: Axis;
  /** camada afetada: 1, -1 ou 0 (fatia do meio) */
  layer: number;
  /** sentido em quartos de volta, positivo = anti-horário pela regra da mão direita em torno do eixo + */
  dir: 1 | -1;
}

/** Movimento horário de cada face, visto de frente para ela. */
export const BASE_MOVES: Record<Face, MoveDef> = {
  U: { axis: 1, layer: 1, dir: -1 },
  D: { axis: 1, layer: -1, dir: 1 },
  R: { axis: 0, layer: 1, dir: -1 },
  L: { axis: 0, layer: -1, dir: 1 },
  F: { axis: 2, layer: 1, dir: -1 },
  B: { axis: 2, layer: -1, dir: 1 },
};

export interface Move {
  face: Face;
  /** 1 = horário, -1 = anti-horário ('), 2 = meia volta */
  turns: 1 | -1 | 2;
}

export function parseMove(s: string): Move {
  const face = s[0] as Face;
  if (!FACES.includes(face)) throw new Error(`Movimento inválido: ${s}`);
  const suf = s.slice(1);
  const turns = suf === "'" ? -1 : suf === "2" ? 2 : 1;
  return { face, turns };
}

export function parseAlg(s: string): Move[] {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMove);
}

export function moveToString(m: Move): string {
  return m.face + (m.turns === -1 ? "'" : m.turns === 2 ? "2" : "");
}

export function invertMove(m: Move): Move {
  return { face: m.face, turns: m.turns === 2 ? 2 : (-m.turns as 1 | -1) };
}

function rotateVec(v: Vec3, axis: Axis, q: number): Vec3 {
  // rotação de q quartos de volta (positivo = anti-horário) em torno do eixo
  let [x, y, z] = v;
  const n = ((q % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x + 0, y + 0, z + 0];
}

/** Permutação de adesivos por movimento: perm[novoIndice] = indiceAntigo */
const PERM_CACHE = new Map<string, number[]>();
function permutationFor(m: Move): number[] {
  const k = moveToString(m);
  const cached = PERM_CACHE.get(k);
  if (cached) return cached;
  const def = BASE_MOVES[m.face];
  const q = def.dir * (m.turns === 2 ? 2 : m.turns);
  const perm = new Array<number>(54);
  for (const f of FACELETS) {
    if (f.pos[def.axis] === def.layer) {
      const np = rotateVec(f.pos, def.axis, q);
      const nn = rotateVec(f.normal, def.axis, q);
      const ni = FACELET_BY_KEY.get(key(np, nn))!;
      perm[ni] = f.index;
    } else {
      perm[f.index] = f.index;
    }
  }
  PERM_CACHE.set(k, perm);
  return perm;
}

export function applyMove(state: State, m: Move): State {
  const perm = permutationFor(m);
  return perm.map((old) => state[old]);
}

export function applyAlg(state: State, moves: Move[]): State {
  return moves.reduce(applyMove, state);
}

export function isSolved(state: State): boolean {
  for (let f = 0; f < 6; f++) {
    for (let i = 1; i < 9; i++) if (state[f * 9 + i] !== state[f * 9]) return false;
  }
  return true;
}

export function randomScramble(length = 22): Move[] {
  const out: Move[] = [];
  const axisOf = (f: Face) => BASE_MOVES[f].axis;
  while (out.length < length) {
    const face = FACES[Math.floor(Math.random() * 6)];
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last && last.face === face) continue;
    if (last && prev && axisOf(last.face) === axisOf(face) && prev.face === face) continue;
    const turns = ([1, -1, 2] as const)[Math.floor(Math.random() * 3)];
    out.push({ face, turns });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validação (portada da conversão facelet → cubie do Kociemba)
// ---------------------------------------------------------------------------

const U = (n: number) => n - 1;
const R = (n: number) => 9 + n - 1;
const F = (n: number) => 18 + n - 1;
const D = (n: number) => 27 + n - 1;
const L = (n: number) => 36 + n - 1;
const B = (n: number) => 45 + n - 1;

const CORNER_FACELETS = [
  [U(9), R(1), F(3)],
  [U(7), F(1), L(3)],
  [U(1), L(1), B(3)],
  [U(3), B(1), R(3)],
  [D(3), F(9), R(7)],
  [D(1), L(9), F(7)],
  [D(7), B(9), L(7)],
  [D(9), R(9), B(7)],
];
const CORNER_FACES: Face[][] = [
  ["U", "R", "F"],
  ["U", "F", "L"],
  ["U", "L", "B"],
  ["U", "B", "R"],
  ["D", "F", "R"],
  ["D", "L", "F"],
  ["D", "B", "L"],
  ["D", "R", "B"],
];
const EDGE_FACELETS = [
  [U(6), R(2)],
  [U(8), F(2)],
  [U(4), L(2)],
  [U(2), B(2)],
  [D(6), R(8)],
  [D(2), F(8)],
  [D(4), L(8)],
  [D(8), B(8)],
  [F(6), R(4)],
  [F(4), L(6)],
  [B(6), L(4)],
  [B(4), R(6)],
];
const EDGE_FACES: Face[][] = [
  ["U", "R"],
  ["U", "F"],
  ["U", "L"],
  ["U", "B"],
  ["D", "R"],
  ["D", "F"],
  ["D", "L"],
  ["D", "B"],
  ["F", "R"],
  ["F", "L"],
  ["B", "L"],
  ["B", "R"],
];

const CORNER_NAMES = ["UFR", "UFL", "UBL", "UBR", "DFR", "DFL", "DBL", "DBR"];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** string de faces (URFDLB) pronta para o solver, quando ok */
  faceString?: string;
  /** adesivos problemáticos, para destacar na UI */
  badFacelets: number[];
}

function parity(perm: number[]): number {
  let p = 0;
  for (let i = 0; i < perm.length; i++)
    for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) p ^= 1;
  return p;
}

const colorLabel = (c: Sticker) => COLOR_NAME[c].toLowerCase();

export function validate(state: State): ValidationResult {
  const errors: string[] = [];
  const bad = new Set<number>();

  // 0. Tudo pintado
  const missing = state.map((c, i) => (c === "X" ? i : -1)).filter((i) => i >= 0);
  if (missing.length) {
    errors.push(
      `Faltam ${missing.length} adesivo${missing.length === 1 ? "" : "s"} para pintar.`,
    );
    return { ok: false, errors, badFacelets: [] };
  }

  // 1. Centros distintos
  const centers = FACES.map((_, i) => state[i * 9 + 4] as ColorId);
  const centerSet = new Set(centers);
  if (centerSet.size !== 6) {
    errors.push("Os 6 centros precisam ter cores diferentes.");
    FACES.forEach((_, i) => bad.add(i * 9 + 4));
    return { ok: false, errors, badFacelets: [...bad] };
  }
  const faceOfColor = new Map<ColorId, Face>(centers.map((c, i) => [c, FACES[i]]));

  // 2. 9 adesivos de cada cor
  for (const c of COLORS) {
    const n = state.filter((s) => s === c.id).length;
    if (n !== 9)
      errors.push(`A cor ${colorLabel(c.id)} aparece ${n} vez${n === 1 ? "" : "es"} (precisa ser 9).`);
  }
  if (errors.length) return { ok: false, errors, badFacelets: [] };

  const faceStr = state.map((c) => faceOfColor.get(c as ColorId)!);

  // 3. Identifica cada peça
  const cp: number[] = [];
  let twist = 0;
  const cornerSeen = new Array(8).fill(0);
  for (let i = 0; i < 8; i++) {
    const fl = CORNER_FACELETS[i];
    let ori = 0;
    for (ori = 0; ori < 3; ori++) if (faceStr[fl[ori]] === "U" || faceStr[fl[ori]] === "D") break;
    if (ori === 3) {
      errors.push(`A quina na posição ${CORNER_NAMES[i]} não tem adesivo de cima nem de baixo.`);
      fl.forEach((x) => bad.add(x));
      continue;
    }
    const c1 = faceStr[fl[(ori + 1) % 3]];
    const c2 = faceStr[fl[(ori + 2) % 3]];
    const j = CORNER_FACES.findIndex((cf) => cf[1] === c1 && cf[2] === c2);
    if (j < 0) {
      const cols = fl.map((x) => colorLabel(state[x])).join("/");
      errors.push(`Quina impossível (${cols}) na posição ${CORNER_NAMES[i]}.`);
      fl.forEach((x) => bad.add(x));
      continue;
    }
    cp[i] = j;
    cornerSeen[j]++;
    twist += ori;
  }
  const ep: number[] = [];
  let flip = 0;
  const edgeSeen = new Array(12).fill(0);
  for (let i = 0; i < 12; i++) {
    const fl = EDGE_FACELETS[i];
    const a = faceStr[fl[0]];
    const b = faceStr[fl[1]];
    let j = EDGE_FACES.findIndex((ef) => ef[0] === a && ef[1] === b);
    let o = 0;
    if (j < 0) {
      j = EDGE_FACES.findIndex((ef) => ef[0] === b && ef[1] === a);
      o = 1;
    }
    if (j < 0) {
      const cols = fl.map((x) => colorLabel(state[x])).join("/");
      errors.push(`Meio impossível (${cols}).`);
      fl.forEach((x) => bad.add(x));
      continue;
    }
    ep[i] = j;
    edgeSeen[j]++;
    flip += o;
  }
  if (errors.length) return { ok: false, errors, badFacelets: [...bad] };

  if (cornerSeen.some((n) => n !== 1)) {
    errors.push("Há quinas repetidas (alguma peça de canto aparece duas vezes).");
    CORNER_FACELETS.forEach((fl, i) => {
      if (cornerSeen[cp[i]] > 1) fl.forEach((x) => bad.add(x));
    });
  }
  if (edgeSeen.some((n) => n !== 1)) {
    errors.push("Há meios repetidos (alguma peça de aresta aparece duas vezes).");
    EDGE_FACELETS.forEach((fl, i) => {
      if (edgeSeen[ep[i]] > 1) fl.forEach((x) => bad.add(x));
    });
  }
  if (errors.length) return { ok: false, errors, badFacelets: [...bad] };

  if (twist % 3 !== 0)
    errors.push(
      "Uma quina está girada (torcida). Esse estado não tem solução: confira as cores das quinas.",
    );
  if (flip % 2 !== 0)
    errors.push(
      "Um meio está invertido. Esse estado não tem solução: confira as cores das arestas.",
    );
  if (parity(cp) !== parity(ep))
    errors.push(
      "Duas peças estão trocadas de lugar (paridade). Esse estado não tem solução: confira a pintura.",
    );

  return {
    ok: errors.length === 0,
    errors,
    badFacelets: [...bad],
    faceString: errors.length === 0 ? faceStr.join("") : undefined,
  };
}

export const MOVE_HINT: Record<Face, string> = {
  U: "a face de cima",
  D: "a face de baixo",
  R: "a face da direita",
  L: "a face da esquerda",
  F: "a face da frente",
  B: "a face de trás",
};

export function describeMove(m: Move): string {
  const what = MOVE_HINT[m.face];
  if (m.turns === 2) return `Gire ${what} meia volta (180°).`;
  const dir = m.turns === 1 ? "horário" : "anti-horário";
  return `Gire ${what} 90° no sentido ${dir} (olhando de frente para essa face).`;
}
