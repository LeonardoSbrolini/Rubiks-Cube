"use client";

/** Cliente do Web Worker que roda o algoritmo de Kociemba (cubejs) fora da thread principal. */
type Pending = { resolve: (s: string) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "solution") {
      pending.get(m.id)?.resolve(m.solution);
      pending.delete(m.id);
    } else if (m.type === "error") {
      pending.get(m.id)?.reject(new Error(m.message));
      pending.delete(m.id);
    }
  };
  return worker;
}

/** Pré-calcula as tabelas do solver (~2s) em segundo plano. */
export function warmUpSolver(): Promise<void> {
  if (readyPromise) return readyPromise;
  const w = getWorker();
  readyPromise = new Promise((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if (e.data.type === "ready") {
        w.removeEventListener("message", onMsg);
        resolve();
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "init" });
  });
  return readyPromise;
}

export function solveFaces(faces: string): Promise<string> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: "solve", id, faces });
  });
}
