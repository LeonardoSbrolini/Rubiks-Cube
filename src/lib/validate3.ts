/** Validação do 3x3 (conversão facelet → peças do Kociemba). Índices na ordem URFDLB. */
import { COLOR_NAME, COLORS, FACES, type ColorId, type Face, type State, type Sticker, type ValidationResult } from "./cube";
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


function parity(perm: number[]): number {
  let p = 0;
  for (let i = 0; i < perm.length; i++)
    for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) p ^= 1;
  return p;
}

const colorLabel = (c: Sticker) => COLOR_NAME[c].toLowerCase();

export function validate3(state: State): ValidationResult {
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
    solverInput: errors.length === 0 ? faceStr.join("") : undefined,
  };
}

