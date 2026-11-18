"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MetalCube, { type MetalCubeHandle } from "@/components/MetalCube";
import FaceNet from "@/components/FaceNet";
import Confetti from "@/components/Confetti";
import {
  applyAlg,
  applyMove,
  blankState,
  COLOR_NAME,
  COLORS,
  describeMove,
  FACES,
  faceMove,
  invertMove,
  isSolved,
  moveToString,
  parseAlg,
  randomScramble,
  SIZES,
  solvedState,
  validateCounts,
  type Face,
  type Move,
  type State,
  type Sticker,
} from "@/lib/cube";
import { validate3 } from "@/lib/validate3";
import { validate2 } from "@/lib/twoByTwo";
import { solve, warmUpSolver } from "@/lib/solver";
import { THEMES, themeHex, type Theme } from "@/lib/themes";

type Tab = "paint" | "solve";
const PREFS_KEY = "cubo-magico:prefs";
const stateKey = (n: number) => `cubo-magico:state:${n}`;

function validateFor(n: number, s: State) {
  if (n === 2) return validate2(s);
  if (n === 3) return validate3(s);
  return validateCounts(n, s);
}

function loadState(n: number): State {
  try {
    const raw = localStorage.getItem(stateKey(n));
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length === 6 * n * n) return arr;
  } catch {}
  return solvedState(n);
}

export default function CubeSolverApp() {
  const cubeRef = useRef<MetalCubeHandle>(null);
  const busy = useRef(false);

  const [size, setSize] = useState(3);
  const [themeId, setThemeId] = useState("classic");
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const [cube, setCube] = useState<State>(() => solvedState(3));
  const [tab, setTab] = useState<Tab>("paint");
  const [brush, setBrush] = useState<Sticker>("W");

  const [solution, setSolution] = useState<Move[] | null>(null);
  const [step, setStep] = useState(0);
  const [solving, setSolving] = useState(false);
  const [solverError, setSolverError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [confetti, setConfetti] = useState(0);
  const [showMoves, setShowMoves] = useState(true);
  useEffect(() => {
    // em telas baixas os botões de giro começam recolhidos para sobrar espaço para a pintura
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.innerWidth >= 1024 && window.innerHeight < 880) setShowMoves(false);
  }, []);
  const cubeNow = useRef(cube);
  useEffect(() => {
    cubeNow.current = cube;
  }, [cube]);

  // ---------------- preferências salvas ----------------
  useEffect(() => {
    let n = 3;
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      if (SIZES.includes(p.size)) n = p.size;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (THEMES.some((t) => t.id === p.theme)) setThemeId(p.theme);
    } catch {}
    setSize(n);
    setCube(loadState(n));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ size, theme: themeId }));
    } catch {}
    warmUpSolver(size);
  }, [size, themeId]);
  useEffect(() => {
    try {
      if (cube.length === 6 * size * size) localStorage.setItem(stateKey(size), JSON.stringify(cube));
    } catch {}
  }, [cube, size]);

  const validation = useMemo(() => validateFor(size, cube), [size, cube]);
  const solved = useMemo(() => isSolved(size, cube), [size, cube]);
  
  const centers = useMemo(() => {
    if (size % 2 === 0) return null;
    const k = size * size;
    return Object.fromEntries(FACES.map((f, i) => [f, cube[i * k + (k - 1) / 2]])) as Record<Face, Sticker>;
  }, [cube, size]);

  const celebrate = useCallback(() => {
    cubeRef.current?.celebrate();
    setConfetti((c) => c + 1);
  }, []);

  // ---------------- tamanho ----------------
  const changeSize = (n: number) => {
    if (n === size || busy.current) return;
    setPlaying(false);
    setSolution(null);
    setStep(0);
    setTab("paint");
    setSolverError(null);
    setSize(n);
    setCube(loadState(n));
  };

  // ---------------- pintura ----------------
  const paint = useCallback(
    (i: number) => {
      if (tab !== "paint" || busy.current) return;
      setCube((s) => {
        if (s[i] === brush) return s;
        const n = [...s];
        n[i] = brush;
        return n;
      });
    },
    [brush, tab],
  );

  // ---------------- movimentos ----------------
  /** aplica um giro ao estado (a animação já aconteceu) */
  const commitMove = useCallback(
    (m: Move, celebrateIfSolved = true) => {
      const before = cubeNow.current;
      const ns = applyMove(size, before, m);
      cubeNow.current = ns;
      setCube(ns);
      if (celebrateIfSolved && !isSolved(size, before) && isSolved(size, ns)) celebrate();
    },
    [size, celebrate],
  );

  const runMove = useCallback(
    async (m: Move, celebrateIfSolved = true) => {
      if (busy.current) return false;
      busy.current = true;
      await cubeRef.current?.animateMove(m, 260 / speed);
      commitMove(m, celebrateIfSolved);
      busy.current = false;
      return true;
    },
    [speed, commitMove],
  );

  const leaveSolution = useCallback(() => {
    if (!solution) return;
    setSolution(null);
    setPlaying(false);
    setTab("paint");
  }, [solution]);

  // fila de giros manuais: cliques/teclas rápidos entram na fila e animam em sequência
  const queue = useRef<Move[]>([]);
  const pump = async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) {
      const m = queue.current.shift()!;
      await cubeRef.current?.animateMove(m, queue.current.length ? 110 : 220);
      commitMove(m);
    }
    busy.current = false;
  };
  const manualMove = (m: Move) => {
    leaveSolution();
    queue.current.push(m);
    pump();
  };


  const next = useCallback(async () => {
    if (!solution || step >= solution.length) return;
    if (await runMove(solution[step])) setStep((s) => s + 1);
  }, [runMove, solution, step]);

  const prev = useCallback(async () => {
    if (!solution || step <= 0) return;
    if (await runMove(invertMove(solution[step - 1]), false)) setStep((s) => s - 1);
  }, [runMove, solution, step]);

  const jumpTo = useCallback(
    (target: number) => {
      if (!solution || busy.current) return;
      setPlaying(false);
      const base = applyAlg(size, cube, solution.slice(0, step).map(invertMove).reverse());
      setCube(applyAlg(size, base, solution.slice(0, target)));
      setStep(target);
      if (target === solution.length && target > 0) celebrate();
    },
    [cube, solution, step, size, celebrate],
  );

  useEffect(() => {
    if (!playing || !solution) return;
    if (step >= solution.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      return;
    }
    const t = setTimeout(next, 140 / speed);
    return () => clearTimeout(t);
  }, [playing, step, solution, next, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toUpperCase();
      if (FACES.includes(k as Face) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        manualMove(faceMove(size, k as Face, e.shiftKey ? -1 : 1));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, prev, solution, size, leaveSolution]);

  // ---------------- resolver ----------------
  const runSolver = async () => {
    if (!validation.ok || !validation.solverInput || solving) return;
    setSolverError(null);
    if (solved) {
      setSolution([]);
      setStep(0);
      setTab("solve");
      return;
    }
    setSolving(true);
    try {
      const sol = await solve(size, validation.solverInput);
      const moves = parseAlg(size, sol);
      if (!isSolved(size, applyAlg(size, cube, moves))) throw new Error("A solução calculada não conferiu.");
      setSolution(moves);
      setStep(0);
      setTab("solve");
    } catch (e) {
      setSolverError(e instanceof Error ? e.message : String(e));
    } finally {
      setSolving(false);
    }
  };

  const backToPaint = () => {
    setPlaying(false);
    if (solution) setCube((s) => applyAlg(size, s, solution.slice(0, step).map(invertMove).reverse()));
    setSolution(null);
    setStep(0);
    setTab("paint");
  };

  const scramble = () => {
    if (busy.current) return;
    setSolution(null);
    setPlaying(false);
    setTab("paint");
    setCube(applyAlg(size, solvedState(size), randomScramble(size)));
  };

  const manualMoves = useMemo(
    () => FACES.flatMap((f) => ([1, -1, 2] as const).map((t) => faceMove(size, f, t))),
    [size],
  );
  const current = solution && step < solution.length ? solution[step] : null;
  const finished = !!solution && step >= solution.length;
  const palette = [...COLORS.map((c) => c.id as Sticker), "X" as Sticker];
  const accent = theme.accent;

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden bg-[#06060a] text-zinc-100"
      style={{ ["--accent" as string]: accent }}
    >
      <Aurora theme={theme} />

      {/* ------------------------------------------------ topo */}
      <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-2 lg:px-6 lg:pt-4">
        <Link href="/" className="flex items-center gap-3" title="Voltar para a apresentação">
          <Logo theme={theme} />
          <div className="leading-tight">
            <h1 className="text-lg font-semibold tracking-tight">Cubo Mágico</h1>
            <p className="hidden text-xs text-zinc-400 sm:block">Sincronize, resolva e aprenda</p>
          </div>
        </Link>

        <div className="order-3 w-full sm:order-none sm:mx-auto sm:w-auto">
          <Segmented
            value={size}
            onChange={changeSize}
            options={SIZES.map((n) => ({ value: n, label: `${n}×${n}` }))}
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setThemeId(t.id)}
              title={t.name}
              aria-label={`Variação ${t.name}`}
              className={`group relative h-8 w-8 rounded-full p-[3px] transition ${
                t.id === themeId ? "ring-2 ring-[var(--accent)]" : "ring-1 ring-white/10 hover:ring-white/40"
              }`}
            >
              <ThemeSwatch t={t} />
              <span className="pointer-events-none absolute top-10 left-1/2 z-50 -translate-x-1/2 rounded-md bg-black/80 px-2 py-1 text-[11px] whitespace-nowrap opacity-0 transition group-hover:opacity-100">
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </header>

      {/* ------------------------------------------------ conteúdo */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 max-lg:landscape:grid max-lg:landscape:grid-cols-[minmax(0,1fr)_minmax(300px,46%)] lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4 lg:px-6 lg:pb-5 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* palco 3D */}
        <section className="stage relative h-[42dvh] min-h-[220px] shrink-0 overflow-hidden rounded-[28px] max-lg:landscape:h-auto max-lg:landscape:min-h-0 lg:h-auto">
          <MetalCube
            ref={cubeRef}
            size={size}
            state={cube}
            theme={theme}
            highlight={tab === "paint" ? validation.badFacelets : undefined}
            hoverGlow={false}
            className="absolute inset-0"
          />
          <Confetti fire={confetti} colors={COLORS.map((c) => themeHex(theme, c.id))} />

          <div className="pointer-events-none absolute top-4 left-4 flex flex-wrap gap-2">
            <Chip>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
              {size}×{size} · {theme.name}
            </Chip>
            <Chip className="hidden md:flex">
              Arraste para girar a vista
            </Chip>
          </div>
          <div className="absolute top-4 right-4 flex gap-2">
            <IconButton label="Centralizar vista" onClick={() => cubeRef.current?.resetView()}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            </IconButton>
            <IconButton label="Embaralhar" onClick={scramble}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </IconButton>
          </div>

          {/* dock inferior */}
          <div className="absolute inset-x-3 bottom-3 flex justify-center">
            {tab === "solve" && solution ? (
              <div className="glass-strong flex w-full max-w-2xl items-center gap-3 rounded-3xl p-2.5 sm:gap-4 sm:p-3">
                <div
                  key={step}
                  className="move-pop flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-mono text-2xl font-bold text-zinc-950 sm:h-16 sm:w-16 sm:text-3xl"
                  style={{ background: finished ? "#34d399" : "var(--accent)" }}
                >
                  {current ? moveToString(size, current) : "✓"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] tracking-wider text-zinc-400 uppercase">
                    {finished ? "Concluído" : `Passo ${step + 1} de ${solution!.length}`}
                  </div>
                  <div className="truncate text-sm text-zinc-100 sm:whitespace-normal">
                    {current
                      ? describeMove(size, current)
                      : solution!.length === 0
                        ? "O cubo já está resolvido!"
                        : "Pronto! Cubo resolvido 🎉"}
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                      style={{ width: `${solution!.length ? (step / solution!.length) * 100 : 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Ctrl label="Anterior" onClick={() => (setPlaying(false), prev())} disabled={step === 0}>
                    <path d="M15 6 9 12l6 6" />
                  </Ctrl>
                  <Ctrl label={playing ? "Pausar" : "Reproduzir"} onClick={() => setPlaying((p) => !p)} disabled={finished} primary>
                    {playing ? <path d="M9 6v12M15 6v12" /> : <path d="M8 5v14l11-7z" fill="currentColor" />}
                  </Ctrl>
                  <Ctrl label="Próximo" onClick={() => (setPlaying(false), next())} disabled={finished}>
                    <path d="m9 6 6 6-6 6" />
                  </Ctrl>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* painel */}
        <aside className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
          <div className="glass flex shrink-0 rounded-2xl p-1">
            {(["paint", "solve"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (t === tab) return;
                  if (t === "paint") return backToPaint();
                  setTab("solve");
                  if (!solution && validation.ok) runSolver();
                }}
                className={`flex-1 rounded-xl py-2 text-sm font-medium transition disabled:opacity-40 ${
                  tab === t ? "bg-white/10 text-white shadow-inner" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {t === "paint" ? "1 · Sincronizar" : "2 · Solução"}
              </button>
            ))}
          </div>

          {tab === "paint" && (
            <div className="glass flex shrink-0 items-center justify-between gap-1 rounded-2xl p-2 sm:justify-center sm:gap-2">
              {palette.map((c) => (
                <button
                  key={c}
                  onClick={() => setBrush(c)}
                  title={COLOR_NAME[c]}
                  aria-label={`Cor ${COLOR_NAME[c]}`}
                  aria-pressed={brush === c}
                  className={`relative grid aspect-square w-full max-w-10 place-items-center rounded-full transition-all duration-200 ${
                    brush === c ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#14141c]" : "hover:scale-105"
                  }`}
                  style={{
                    background: themeHex(theme, c),
                    boxShadow: brush === c ? `0 0 18px ${themeHex(theme, c)}` : undefined,
                  }}
                >
                  {c === "X" && <span className="text-xs text-zinc-300">✕</span>}
                </button>
              ))}
            </div>
          )}

          {tab === "paint" ? (
            <div className="glass flex shrink-0 flex-col gap-3 rounded-3xl p-4 lg:min-h-0 lg:flex-1 lg:shrink">
              <p className="text-[13px] leading-snug text-zinc-400">
                {centers ? (
                  <>
                    Escolha a cor acima e clique nos quadradinhos até ficar igual ao seu cubo, segurando o centro <ColorWord c={centers.U} theme={theme} /> em cima e o{" "}
                    <ColorWord c={centers.F} theme={theme} /> de frente.
                  </>
                ) : (
                  <>Escolha a cor acima e clique nos quadradinhos até ficar igual ao seu cubo. Mantenha-o na mesma posição em que pintou.</>
                )}
              </p>
              <div className="net-wrap flex items-center justify-center lg:min-h-[170px] lg:flex-1">
                <FaceNet size={size} state={cube} theme={theme} onPaint={paint} highlight={validation.badFacelets} />
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Pill onClick={() => setCube(blankState(size))}>Começar do zero</Pill>
                <Pill onClick={() => setCube(solvedState(size))}>Resolvido</Pill>
                <Pill onClick={scramble}>Embaralhar</Pill>
              </div>

              <div className="rounded-2xl bg-black/25 p-3">
                {validation.ok ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
                    Estado válido{solved ? " (já resolvido)" : ""}.
                  </p>
                ) : (
                  <ul className="max-h-20 space-y-0.5 overflow-y-auto text-[13px] text-amber-300">
                    {validation.errors.map((e) => (
                      <li key={e}>• {e}</li>
                    ))}
                  </ul>
                )}
                {solverError && <p className="mt-1 text-sm text-red-400">{solverError}</p>}
              </div>

              <button
                onClick={runSolver}
                disabled={!validation.ok || solving}
                className="shine relative shrink-0 overflow-hidden rounded-2xl py-3 font-semibold text-zinc-950 transition enabled:hover:brightness-110 enabled:active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35"
                style={{ background: "linear-gradient(135deg, var(--accent), #ffffff)" }}
              >
                {solving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
                    Calculando…
                  </span>
                ) : (
                  "Resolver"
                )}
              </button>
            </div>
          ) : !solution ? (
            <div className="glass flex shrink-0 flex-col items-center justify-center gap-4 rounded-3xl p-6 text-center lg:min-h-0 lg:flex-1 lg:shrink">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-2xl">🧩</div>
              <div>
                <h2 className="font-semibold">Passo a passo da solução</h2>
                <p className="mt-1 text-[13px] text-zinc-400">
                  {validation.ok
                    ? "Seu cubo está pronto. Calcule a solução para ver cada movimento animado no cubo."
                    : "Primeiro pinte o cubo igual ao seu na aba Sincronizar."}
                </p>
              </div>
              {!validation.ok && (
                <ul className="space-y-0.5 text-[13px] text-amber-300">
                  {validation.errors.map((e) => (
                    <li key={e}>• {e}</li>
                  ))}
                </ul>
              )}
              {solverError && <p className="text-sm text-red-400">{solverError}</p>}
              <button
                onClick={validation.ok ? runSolver : () => setTab("paint")}
                disabled={solving}
                className="shine relative w-full overflow-hidden rounded-2xl py-3 font-semibold text-zinc-950 transition enabled:hover:brightness-110 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--accent), #ffffff)" }}
              >
                {solving ? "Calculando…" : validation.ok ? "Resolver agora" : "Ir para a pintura"}
              </button>
            </div>
          ) : (
            <div className="glass flex shrink-0 flex-col gap-3 rounded-3xl p-4 lg:min-h-0 lg:flex-1 lg:shrink">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">{solution!.length} movimentos</h2>
                <span className="text-xs text-zinc-500">← → passo · espaço play</span>
              </div>
              <p className="text-[13px] text-zinc-400">
                {centers ? (
                  <>
                    Mantenha o centro <ColorWord c={centers.U} theme={theme} /> em cima e o{" "}
                    <ColorWord c={centers.F} theme={theme} /> de frente o tempo todo.
                  </>
                ) : (
                  <>Mantenha o cubo na mesma posição em que você pintou.</>
                )}
              </p>
              <div className="flex max-h-40 flex-wrap content-start gap-1.5 overflow-y-auto pr-1 lg:max-h-none lg:min-h-0 lg:flex-1">
                {solution!.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => jumpTo(i)}
                    title={`Ir para o passo ${i + 1}`}
                    className={`h-9 min-w-11 rounded-xl px-2 font-mono text-sm transition-all duration-200 ${
                      i === step
                        ? "scale-110 bg-[var(--accent)] text-zinc-950 shadow-[0_0_18px_var(--accent)]"
                        : i < step
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-white/5 text-zinc-300 hover:bg-white/10"
                    }`}
                  >
                    {moveToString(size, m)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Pill onClick={() => jumpTo(0)} disabled={step === 0}>
                  ⏮ Início
                </Pill>
                <Pill onClick={() => jumpTo(solution!.length)} disabled={finished}>
                  Fim ⏭
                </Pill>
              </div>
              <label className="flex items-center gap-3 text-xs text-zinc-400">
                Velocidade
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.25}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="flex-1 accent-[var(--accent)]"
                />
                <span className="w-10 text-right font-mono">{speed}×</span>
              </label>
              <button
                onClick={backToPaint}
                className="rounded-2xl border border-white/10 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5"
              >
                Voltar para a pintura
              </button>
            </div>
          )}

          <div className="glass shrink-0 rounded-3xl p-3">
            <button
              onClick={() => setShowMoves((v) => !v)}
              aria-expanded={showMoves}
              className="flex w-full items-center justify-between px-1"
            >
              <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Girar faces</h2>
              <span className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span className="hidden sm:inline">teclas U R F D L B · Shift = &apos;</span>
                <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${showMoves ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>
            <div className={`mt-2 grid-cols-6 gap-1 ${showMoves ? "grid" : "hidden"}`}>
              {manualMoves.map((m) => (
                <button
                  key={`${m.axis}${m.layer}${m.q}`}
                  onClick={() => manualMove(m)}
                  title={describeMove(size, m)}
                  className="rounded-lg bg-white/5 py-1.5 font-mono text-[13px] text-zinc-200 transition hover:bg-white/12 active:scale-95"
                >
                  {moveToString(size, m)}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- peças de UI

function Aurora({ theme }: { theme: Theme }) {
  // gradientes estáticos (sem filtro de desfoque animado) para não pesar na GPU
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(60vmax 50vmax at 8% 0%, ${theme.accent}40, transparent 60%),
            radial-gradient(55vmax 45vmax at 100% 100%, #6366f133, transparent 60%)`,
        }}
      />
      <div className="grid-bg absolute inset-0 opacity-[0.07]" />
    </div>
  );
}

function Logo({ theme }: { theme: Theme }) {
  const cols = ["W", "R", "G", "Y", "B", "O", "G", "W", "R"] as const;
  return (
    <div className="logo grid h-9 w-9 grid-cols-3 gap-[2px] rounded-xl bg-black/60 p-[3px] ring-1 ring-white/10">
      {cols.map((c, i) => (
        <span key={i} className="rounded-[3px]" style={{ background: themeHex(theme, c) }} />
      ))}
    </div>
  );
}

function ThemeSwatch({ t }: { t: Theme }) {
  const cols = (["R", "G", "B", "Y"] as const).map((c) => themeHex(t, c));
  return (
    <span
      className="block h-full w-full overflow-hidden rounded-full"
      style={{
        background: `conic-gradient(${cols[0]} 0 25%, ${cols[1]} 0 50%, ${cols[2]} 0 75%, ${cols[3]} 0)`,
        boxShadow: `inset 0 0 0 3px ${t.body.color}`,
      }}
    />
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (v: number) => void;
  options: { value: number; label: string }[];
}) {
  const idx = options.findIndex((o) => o.value === value);
  return (
    <div className="glass relative grid rounded-2xl p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      <span
        className="absolute top-1 bottom-1 left-1 rounded-xl bg-white/12 shadow-[0_0_20px_-4px_var(--accent)] ring-1 ring-white/15 transition-transform duration-300 ease-[cubic-bezier(.3,1.4,.5,1)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 px-3 py-1.5 font-mono text-sm transition sm:px-4 ${
            o.value === value ? "text-white" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-strong flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-zinc-200 ${className}`}>
      {children}
    </div>
  );
}

function IconButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="glass-strong flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition hover:scale-105 hover:text-white active:scale-95"
    >
      {children}
    </button>
  );
}

function Pill(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex-1 rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white active:scale-[.97] disabled:opacity-30"
    />
  );
}

function Ctrl({
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
      className={`flex h-11 w-11 items-center justify-center rounded-2xl transition active:scale-90 disabled:opacity-30 sm:h-12 sm:w-12 ${
        primary ? "bg-white text-zinc-950 hover:brightness-110" : "bg-white/8 text-zinc-100 hover:bg-white/15"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function ColorWord({ c, theme }: { c: Sticker; theme: Theme }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-zinc-100">
      <span className="inline-block h-3 w-3 rounded-[4px]" style={{ background: themeHex(theme, c) }} />
      {COLOR_NAME[c].toLowerCase()}
    </span>
  );
}
