"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MetalCube, { type ColorMode, type MetalCubeHandle } from "@/components/MetalCube";
import FaceNet from "@/components/FaceNet";
import {
  applyAlg,
  applyMove,
  blankState,
  COLOR_HEX,
  COLOR_NAME,
  COLORS,
  describeMove,
  FACES,
  invertMove,
  isSolved,
  moveToString,
  parseAlg,
  randomScramble,
  solvedState,
  validate,
  type Face,
  type Move,
  type State,
  type Sticker,
} from "@/lib/cube";
import { solveFaces, warmUpSolver } from "@/lib/solver";

type Mode = "paint" | "solve";
const STORAGE_KEY = "cubo-magico:state";

const MANUAL_MOVES: Move[] = FACES.flatMap((face) =>
  ([1, -1, 2] as const).map((turns) => ({ face, turns })),
);

export default function CubeSolverApp() {
  const cubeRef = useRef<MetalCubeHandle>(null);
  const busy = useRef(false);

  const [cube, setCube] = useState<State>(() => solvedState());
  const [mode, setMode] = useState<Mode>("paint");
  const [brush, setBrush] = useState<Sticker>("W");
  const [colorMode, setColorMode] = useState<ColorMode>("painted");

  const [solution, setSolution] = useState<Move[] | null>(null);
  const [step, setStep] = useState(0);
  const [solving, setSolving] = useState(false);
  const [solverError, setSolverError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // restaura a pintura salva
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const arr = JSON.parse(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(arr) && arr.length === 54) setCube(arr);
      }
    } catch {}
    warmUpSolver();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cube));
    } catch {}
  }, [cube]);

  const validation = useMemo(() => validate(cube), [cube]);
  const solved = useMemo(() => isSolved(cube), [cube]);
  const centers = useMemo(() => {
    const c = Object.fromEntries(FACES.map((f, i) => [f, cube[i * 9 + 4]])) as Record<Face, Sticker>;
    return c;
  }, [cube]);

  // ---------------- pintura ----------------
  const paint = useCallback(
    (i: number) => {
      if (mode !== "paint" || busy.current) return;
      setCube((s) => {
        if (s[i] === brush) return s;
        const n = [...s];
        n[i] = brush;
        return n;
      });
    },
    [brush, mode],
  );

  // ---------------- movimentos ----------------
  const runMove = useCallback(
    async (m: Move) => {
      if (busy.current) return false;
      busy.current = true;
      await cubeRef.current?.animateMove(m, 320 / speed);
      setCube((s) => applyMove(s, m));
      busy.current = false;
      return true;
    },
    [speed],
  );

  const manualMove = useCallback(
    async (m: Move) => {
      if (solution) {
        // girar à mão invalida a solução atual
        setSolution(null);
        setPlaying(false);
        setMode("paint");
      }
      await runMove(m);
    },
    [runMove, solution],
  );

  const next = useCallback(async () => {
    if (!solution || step >= solution.length) return;
    if (await runMove(solution[step])) setStep((s) => s + 1);
  }, [runMove, solution, step]);

  const prev = useCallback(async () => {
    if (!solution || step <= 0) return;
    if (await runMove(invertMove(solution[step - 1]))) setStep((s) => s - 1);
  }, [runMove, solution, step]);

  const jumpTo = useCallback(
    (target: number) => {
      if (!solution || busy.current) return;
      setPlaying(false);
      const base = applyAlg(cube, solution.slice(0, step).map(invertMove).reverse());
      setCube(applyAlg(base, solution.slice(0, target)));
      setStep(target);
    },
    [cube, solution, step],
  );

  // reprodução automática
  useEffect(() => {
    if (!playing || !solution) return;
    if (step >= solution.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      return;
    }
    const t = setTimeout(next, 120 / speed);
    return () => clearTimeout(t);
  }, [playing, step, solution, next, speed]);

  // atalhos de teclado: U R F D L B (Shift = anti-horário), ←/→ passo a passo, espaço = play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toUpperCase();
      if (FACES.includes(k as Face) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        manualMove({ face: k as Face, turns: e.shiftKey ? -1 : 1 });
      } else if (solution && e.key === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        next();
      } else if (solution && e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        prev();
      } else if (solution && e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [manualMove, next, prev, solution]);

  // ---------------- resolver ----------------
  const solve = async () => {
    if (!validation.ok || !validation.faceString) return;
    setSolverError(null);
    if (solved) {
      setSolution([]);
      setStep(0);
      setMode("solve");
      return;
    }
    setSolving(true);
    try {
      const sol = await solveFaces(validation.faceString);
      const moves = parseAlg(sol);
      // confere a solução antes de mostrar
      if (!isSolved(applyAlg(cube, moves))) throw new Error("A solução calculada não conferiu.");
      setSolution(moves);
      setStep(0);
      setMode("solve");
    } catch (e) {
      setSolverError(e instanceof Error ? e.message : String(e));
    } finally {
      setSolving(false);
    }
  };

  const backToPaint = () => {
    setPlaying(false);
    if (solution) {
      // volta para o estado que foi pintado
      setCube((s) => applyAlg(s, solution.slice(0, step).map(invertMove).reverse()));
    }
    setSolution(null);
    setStep(0);
    setMode("paint");
  };

  const current = solution && step < solution.length ? solution[step] : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pt-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cubo Mágico</h1>
          <p className="text-sm text-zinc-400">Pinte o seu cubo, resolva e siga o passo a passo.</p>
        </div>
        <div className="flex rounded-full border border-zinc-800 bg-zinc-900 p-1 text-xs">
          {(["painted", "metallic"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              className={`rounded-full px-3 py-1.5 transition ${
                colorMode === m ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {m === "painted" ? "Adesivos" : "Metálico"}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------------- cubo 3D ---------------- */}
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-[radial-gradient(ellipse_at_top,#27272a_0%,#09090b_70%)]">
          <MetalCube
            ref={cubeRef}
            state={cube}
            colorMode={colorMode}
            tint="#d4d4d8"
            highlight={mode === "paint" ? validation.badFacelets : undefined}
            onStickerClick={mode === "paint" ? paint : undefined}
            className="h-[52vh] min-h-[340px] w-full cursor-grab active:cursor-grabbing lg:h-[calc(100vh-220px)]"
          />
          <div className="pointer-events-none absolute left-4 top-4 hidden rounded-xl sm:block bg-black/50 px-3 py-2 text-xs text-zinc-300 backdrop-blur">
            {mode === "paint"
              ? "Arraste para girar a vista · clique num adesivo para pintar"
              : "Arraste para girar a vista"}
          </div>
          <button
            onClick={() => cubeRef.current?.resetView()}
            className="absolute right-4 top-4 rounded-xl bg-black/50 px-3 py-2 text-xs text-zinc-300 backdrop-blur hover:text-white"
          >
            Centralizar vista
          </button>

          {current && (
            <div className="absolute inset-x-4 bottom-4 flex items-center gap-4 rounded-2xl bg-black/60 p-4 backdrop-blur">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-100 font-mono text-3xl font-bold text-zinc-900">
                {moveToString(current)}
              </div>
              <div className="text-sm text-zinc-200">
                <div className="text-xs uppercase tracking-wide text-zinc-400">
                  Passo {step + 1} de {solution!.length}
                </div>
                {describeMove(current)}
              </div>
            </div>
          )}
          {solution && step >= solution.length && (
            <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-emerald-500/90 p-4 text-center font-medium text-emerald-950">
              {solution.length === 0 ? "O cubo já está resolvido!" : "Pronto! Cubo resolvido 🎉"}
            </div>
          )}
        </section>

        {/* ---------------- painel ---------------- */}
        <aside className="flex flex-col gap-4">
          {mode === "paint" ? (
            <>
              <Card title="1. Sincronize o seu cubo">
                <p className="mb-3 text-sm text-zinc-400">
                  Escolha uma cor e clique nos adesivos (no cubo 3D ou na planificação) até ficar igual ao
                  seu. Segure o seu cubo com o centro{" "}
                  <ColorWord c={centers.U} /> em cima e o <ColorWord c={centers.F} /> de frente.
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {[...COLORS.map((c) => c.id as Sticker), "X" as Sticker].map((c) => (
                    <button
                      key={c}
                      onClick={() => setBrush(c)}
                      title={COLOR_NAME[c]}
                      className={`h-10 w-10 rounded-xl border-2 transition ${
                        brush === c ? "scale-110 border-white" : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                      style={{ background: COLOR_HEX[c] }}
                    >
                      {c === "X" && <span className="text-xs text-zinc-300">✕</span>}
                    </button>
                  ))}
                </div>
                <FaceNet state={cube} onPaint={paint} highlight={validation.badFacelets} />
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <SmallButton onClick={() => setCube(blankState())}>Começar do zero</SmallButton>
                  <SmallButton onClick={() => setCube(solvedState())}>Cubo resolvido</SmallButton>
                  <SmallButton onClick={() => setCube(applyAlg(solvedState(), randomScramble()))}>
                    Embaralhar (teste)
                  </SmallButton>
                </div>
              </Card>

              <Card title="2. Validação">
                {validation.ok ? (
                  <p className="text-sm text-emerald-400">
                    ✓ Estado válido{solved ? " (já resolvido)" : ""}. Pode resolver!
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm text-amber-300">
                    {validation.errors.map((e) => (
                      <li key={e}>• {e}</li>
                    ))}
                  </ul>
                )}
                {solverError && <p className="mt-2 text-sm text-red-400">{solverError}</p>}
                <button
                  onClick={solve}
                  disabled={!validation.ok || solving}
                  className="mt-4 w-full rounded-xl bg-zinc-100 py-3 font-semibold text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {solving ? "Calculando solução…" : "Resolver"}
                </button>
              </Card>
            </>
          ) : (
            <Card title="Solução">
              <p className="mb-3 text-sm text-zinc-400">
                {solution!.length} movimentos. Mantenha o centro <ColorWord c={centers.U} /> em cima e o{" "}
                <ColorWord c={centers.F} /> de frente durante toda a solução.
              </p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {solution!.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => jumpTo(i)}
                    title={`Ir para o passo ${i + 1}`}
                    className={`min-w-10 rounded-lg px-2 py-1 font-mono text-sm transition ${
                      i === step
                        ? "bg-zinc-100 text-zinc-900"
                        : i < step
                          ? "bg-emerald-900/60 text-emerald-300"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {moveToString(m)}
                  </button>
                ))}
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{ width: `${solution!.length ? (step / solution!.length) * 100 : 100}%` }}
                />
              </div>
              <div className="grid grid-cols-5 gap-2">
                <CtrlButton label="Início" onClick={() => jumpTo(0)} disabled={step === 0}>
                  ⏮
                </CtrlButton>
                <CtrlButton
                  label="Anterior"
                  onClick={() => {
                    setPlaying(false);
                    prev();
                  }}
                  disabled={step === 0}
                >
                  ◀
                </CtrlButton>
                <CtrlButton
                  label={playing ? "Pausar" : "Reproduzir"}
                  onClick={() => setPlaying((p) => !p)}
                  disabled={step >= solution!.length}
                  primary
                >
                  {playing ? "⏸" : "▶"}
                </CtrlButton>
                <CtrlButton
                  label="Próximo"
                  onClick={() => {
                    setPlaying(false);
                    next();
                  }}
                  disabled={step >= solution!.length}
                >
                  ▶︎▏
                </CtrlButton>
                <CtrlButton label="Fim" onClick={() => jumpTo(solution!.length)} disabled={step >= solution!.length}>
                  ⏭
                </CtrlButton>
              </div>
              <label className="mt-4 flex items-center gap-3 text-xs text-zinc-400">
                Velocidade
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.25}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="flex-1 accent-zinc-100"
                />
                <span className="w-10 text-right font-mono">{speed}×</span>
              </label>
              <p className="mt-3 text-xs text-zinc-500">Atalhos: ← → passo a passo, espaço reproduz/pausa.</p>
              <button
                onClick={backToPaint}
                className="mt-4 w-full rounded-xl border border-zinc-700 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Voltar para a pintura
              </button>
            </Card>
          )}

          <Card title="Girar manualmente">
            <div className="grid grid-cols-6 gap-1.5">
              {MANUAL_MOVES.map((m) => (
                <button
                  key={moveToString(m)}
                  onClick={() => manualMove(m)}
                  title={describeMove(m)}
                  className="rounded-lg bg-zinc-800 py-2 font-mono text-sm text-zinc-200 transition hover:bg-zinc-700 active:scale-95"
                >
                  {moveToString(m)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Teclado: U R F D L B (Shift = anti-horário).
              {solution ? " Girar à mão encerra a solução atual." : ""}
            </p>
          </Card>
        </aside>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">{title}</h2>
      {children}
    </div>
  );
}

function SmallButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 transition hover:bg-zinc-800"
    />
  );
}

function CtrlButton({
  children,
  label,
  primary,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; primary?: boolean }) {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={`rounded-xl py-3 text-lg transition disabled:opacity-30 ${
        primary ? "bg-zinc-100 text-zinc-900 hover:bg-white" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

function ColorWord({ c }: { c: Sticker }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-zinc-200">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLOR_HEX[c] }} />
      {COLOR_NAME[c].toLowerCase()}
    </span>
  );
}
