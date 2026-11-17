/// <reference lib="webworker" />
import Cube from "cubejs";
import "cubejs/lib/solve";
import { solve2 } from "../lib/twoByTwo";

type Req = { type: "init"; size: number } | { type: "solve"; id: number; size: number; input: string };

let ready3 = false;
function init(size: number) {
  if (size === 3 && !ready3) {
    Cube.initSolver();
    ready3 = true;
  }
}

self.onmessage = (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      init(msg.size);
    } else if (msg.type === "solve") {
      init(msg.size);
      const solution =
        msg.size === 2 ? solve2(msg.input) : Cube.fromString(msg.input).solve();
      self.postMessage({ type: "solution", id: msg.id, solution });
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      id: msg.type === "solve" ? msg.id : -1,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
