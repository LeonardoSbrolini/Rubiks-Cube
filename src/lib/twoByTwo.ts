/**
 * 2x2: validação e solver ótimo (menor número de movimentos).
 *
 * O 2x2 não tem centros, então a quina de baixo-esquerda-trás (DLB) é usada como referência
 * fixa e o solver só usa giros U, R e F (que não mexem nela). São 7! × 3^7 combinações de
 * coordenadas; uma busca em largura completa leva ~1s e cabe em 11 MB (feita no Web Worker).
 */
import {
  COLOR_NAME,
  faceMove,
  faceletsFor,
  OPPOSITE_COLOR,
  permutationFor,
  validateCounts,
  type ColorId,
  type Face,
  type State,
  type ValidationResult,
  type Vec3,
} from "./cube";

const N = 2;
const facelets = faceletsFor(N);

/** 8 posições de quina; cada uma com os 3 adesivos na ordem [eixo y, eixo x, eixo z] */
const SLOTS: { pos: Vec3; triple: number[] }[] = (() => {
  const out: { pos: Vec3; triple: number[] }[] = [];
  for (const y of [1, -1])
    for (const x of [1, -1])
      for (const z of [1, -1]) {
        const at = facelets.filter((f) => f.pos[0] === x && f.pos[1] === y && f.pos[2] === z);
        const by = (axis: number) => at.find((f) => f.normal[axis] !== 0)!.index;
        out.push({ pos: [x, y, z], triple: [by(1), by(0), by(2)] });
      }
  return out;
})();
const REF = SLOTS.findIndex((s) => s.pos.join() === "-1,-1,-1"); // DLB
const MOBILE = SLOTS.map((_, i) => i).filter((i) => i !== REF); // 7 posições móveis

export const MOVES_2: { face: Face; turns: 1 | -1 | 2 }[] = (["U", "R", "F"] as Face[]).flatMap((face) =>
  ([1, -1, 2] as const).map((turns) => ({ face, turns })),
);
const moveName = (m: { face: Face; turns: 1 | -1 | 2 }) =>
  m.face + (m.turns === -1 ? "'" : m.turns === 2 ? "2" : "");

function schemeFrom(state: State) {
  const [dy, lx, bz] = SLOTS[REF].triple.map((i) => state[i] as ColorId);
  const scheme = { D: dy, L: lx, B: bz, U: OPPOSITE_COLOR[dy], R: OPPOSITE_COLOR[lx], F: OPPOSITE_COLOR[bz] };
  return scheme;
}

function expectedColors(pos: Vec3, s: ReturnType<typeof schemeFrom>) {
  return [pos[1] > 0 ? s.U : s.D, pos[0] > 0 ? s.R : s.L, pos[2] > 0 ? s.F : s.B];
}
const setKey = (cs: string[]) => [...cs].sort().join("");

/** Lê o estado como (peça, orientação) em cada uma das 7 posições móveis. */
function toCubies(state: State): { perm: number[]; ori: number[] } | { error: string; bad: number[] } {
  const s = schemeFrom(state);
  const pieceByKey = new Map(MOBILE.map((slot, k) => [setKey(expectedColors(SLOTS[slot].pos, s)), k]));
  const perm: number[] = [];
  const ori: number[] = [];
  const seen = new Set<number>();
  for (const slot of MOBILE) {
    const cols = SLOTS[slot].triple.map((i) => state[i] as ColorId);
    const piece = pieceByKey.get(setKey(cols));
    if (piece === undefined) {
      const desc = cols.map((c) => COLOR_NAME[c].toLowerCase()).join("/");
      return { error: `Quina impossível (${desc}). Confira as cores dela.`, bad: SLOTS[slot].triple };
    }
    if (seen.has(piece)) return { error: "Há quinas repetidas (a mesma peça aparece duas vezes).", bad: SLOTS[slot].triple };
    seen.add(piece);
    perm.push(piece);
    ori.push(cols.findIndex((c) => c === s.U || c === s.D));
  }
  return { perm, ori };
}

export function validate2(state: State): ValidationResult {
  const base = validateCounts(N, state);
  if (!base.ok) return base;
  const s = schemeFrom(state);
  if (new Set(Object.values(s)).size !== 6)
    return {
      ok: false,
      errors: ["A quina de baixo-esquerda-trás tem cores que não combinam (cores opostas na mesma peça)."],
      badFacelets: SLOTS[REF].triple,
    };
  const c = toCubies(state);
  if ("error" in c) return { ok: false, errors: [c.error], badFacelets: c.bad };
  if (!isTwistValid(c.ori))
    return {
      ok: false,
      errors: ["Uma quina está girada (torcida). Esse estado não tem solução: confira as cores das quinas."],
      badFacelets: [],
    };
  return { ok: true, errors: [], badFacelets: [], solverInput: state.join("") };
}

// ---------------------------------------------------------------------------
// Tabelas de movimento nas coordenadas
// ---------------------------------------------------------------------------

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040];
const N_PERM = 5040;
const N_ORI = 2187;

function encodePerm(p: number[]): number {
  let idx = 0;
  for (let i = 0; i < 7; i++) {
    let smaller = 0;
    for (let j = i + 1; j < 7; j++) if (p[j] < p[i]) smaller++;
    idx += smaller * FACT[6 - i];
  }
  return idx;
}
function decodePerm(idx: number): number[] {
  const avail = [0, 1, 2, 3, 4, 5, 6];
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const f = FACT[6 - i];
    const k = Math.floor(idx / f);
    idx %= f;
    out.push(avail.splice(k, 1)[0]);
  }
  return out;
}
const encodeOri = (o: number[]) => o.reduce((a, v) => a * 3 + v, 0);
function decodeOri(idx: number): number[] {
  const out = new Array(7);
  for (let i = 6; i >= 0; i--) {
    out[i] = idx % 3;
    idx = Math.floor(idx / 3);
  }
  return out;
}

/** Para cada movimento: para onde vai cada posição móvel e como muda a orientação. */
const MOVE_MAPS = MOVES_2.map((m) => {
  const perm = permutationFor(N, faceMove(N, m.face, m.turns));
  const dest = new Map<number, number>(); // índice antigo -> novo
  perm.forEach((old, ni) => dest.set(old, ni));
  const where = new Map<number, [number, number]>(); // adesivo -> [posição móvel, índice no trio]
  MOBILE.forEach((slot, k) => SLOTS[slot].triple.forEach((f, o) => where.set(f, [k, o])));
  const slotTo: number[] = [];
  const oriTo: number[][] = [];
  MOBILE.forEach((slot, k) => {
    oriTo[k] = [0, 1, 2].map((o) => {
      const [k2, o2] = where.get(dest.get(SLOTS[slot].triple[o])!)!;
      slotTo[k] = k2;
      return o2;
    });
  });
  return { slotTo, oriTo };
});

function isTwistValid(ori: number[]): boolean {
  // a partir do resolvido, a "torção" alcançável é exatamente a do grupo gerado pelos giros;
  // checa via tabela de orientação (barata: 2187 estados).
  return reachableOri()[encodeOri(ori)] === 1;
}
let oriReach: Uint8Array | null = null;
function reachableOri(): Uint8Array {
  if (oriReach) return oriReach;
  const seen = new Uint8Array(N_ORI);
  const q = [0];
  seen[0] = 1;
  while (q.length) {
    const o = decodeOri(q.pop()!);
    for (const mm of MOVE_MAPS) {
      const no = new Array(7);
      for (let k = 0; k < 7; k++) no[mm.slotTo[k]] = mm.oriTo[k][o[k]];
      const e = encodeOri(no);
      if (!seen[e]) {
        seen[e] = 1;
        q.push(e);
      }
    }
  }
  return (oriReach = seen);
}

let tables: { permMove: Uint16Array; oriMove: Uint16Array; dist: Uint8Array } | null = null;

function buildTables() {
  if (tables) return tables;
  const M = MOVE_MAPS.length;
  const permMove = new Uint16Array(N_PERM * M);
  for (let i = 0; i < N_PERM; i++) {
    const p = decodePerm(i);
    MOVE_MAPS.forEach((mm, m) => {
      const np = new Array(7);
      for (let k = 0; k < 7; k++) np[mm.slotTo[k]] = p[k];
      permMove[i * M + m] = encodePerm(np);
    });
  }
  const oriMove = new Uint16Array(N_ORI * M);
  for (let i = 0; i < N_ORI; i++) {
    const o = decodeOri(i);
    MOVE_MAPS.forEach((mm, m) => {
      const no = new Array(7);
      for (let k = 0; k < 7; k++) no[mm.slotTo[k]] = mm.oriTo[k][o[k]];
      oriMove[i * M + m] = encodeOri(no);
    });
  }
  const dist = new Uint8Array(N_PERM * N_ORI).fill(255);
  dist[0] = 0;
  let frontier = [0];
  for (let d = 0; frontier.length; d++) {
    const next: number[] = [];
    for (const s of frontier) {
      const p = Math.floor(s / N_ORI);
      const o = s % N_ORI;
      for (let m = 0; m < M; m++) {
        const t = permMove[p * M + m] * N_ORI + oriMove[o * M + m];
        if (dist[t] === 255) {
          dist[t] = d + 1;
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return (tables = { permMove, oriMove, dist });
}

/** Solução ótima (giros U/R/F) para um estado 2x2 válido, como string "R U' F2 …". */
export function solve2(stateString: string): string {
  const state = stateString.split("") as State;
  const c = toCubies(state);
  if ("error" in c) throw new Error(c.error);
  const { permMove, oriMove, dist } = buildTables();
  const M = MOVE_MAPS.length;
  let p = encodePerm(c.perm);
  let o = encodeOri(c.ori);
  if (dist[p * N_ORI + o] === 255) throw new Error("Estado sem solução.");
  const out: string[] = [];
  while (dist[p * N_ORI + o] > 0) {
    const d = dist[p * N_ORI + o];
    for (let m = 0; m < M; m++) {
      const np = permMove[p * M + m];
      const no = oriMove[o * M + m];
      if (dist[np * N_ORI + no] === d - 1) {
        out.push(moveName(MOVES_2[m]));
        p = np;
        o = no;
        break;
      }
    }
  }
  return out.join(" ");
}
