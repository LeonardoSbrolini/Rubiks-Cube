/// <reference lib="webworker" />
import Cube from "cubejs";
import "cubejs/lib/solve";

type Req = { type: "init" } | { type: "solve"; id: number; faces: string };

let ready = false;
function ensureInit() {
  if (!ready) {
    Cube.initSolver();
    ready = true;
  }
}

self.onmessage = (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      ensureInit();
      self.postMessage({ type: "ready" });
    } else if (msg.type === "solve") {
      ensureInit();
      const solution = Cube.fromString(msg.faces).solve();
      self.postMessage({ type: "solution", id: msg.id, solution });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      id: "id" in msg ? msg.id : -1,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
