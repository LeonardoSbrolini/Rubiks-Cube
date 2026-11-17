"use client";

/** Cliente do Web Worker: Kociemba (cubejs) para 3x3 e busca ótima para 2x2. */
type Pending = { resolve: (s: string) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "solution") pending.get(m.id)?.resolve(m.solution);
    else if (m.type === "error") pending.get(m.id)?.reject(new Error(m.message));
    pending.delete(m.id);
  };
  return worker;
}

export const SOLVABLE_SIZES = [2, 3];

/** Pré-calcula as tabelas do 3x3 (~2s) em segundo plano. */
export function warmUpSolver(size: number) {
  if (SOLVABLE_SIZES.includes(size)) getWorker().postMessage({ type: "init", size });
}

export function solve(size: number, input: string): Promise<string> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: "solve", id, size, input });
  });
}
