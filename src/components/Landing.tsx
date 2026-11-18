"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MetalCube, { type MetalCubeHandle } from "@/components/MetalCube";
import { applyMove, faceMove, FACES, invertMove, solvedState, type Move, type State } from "@/lib/cube";
import { THEMES, themeHex } from "@/lib/themes";

const N = 3;
const SHOWCASE = ["classic", "chrome", "neon", "gold", "pastel", "stickerless"];

/** Tela de apresentação: cubo 3D que embaralha e se resolve sozinho, textos e botão para o app. */
export default function Landing() {
  const cubeRef = useRef<MetalCubeHandle>(null);
  const [state, setState] = useState<State>(() => solvedState(N));
  const [themeIdx, setThemeIdx] = useState(0);
  const [phase, setPhase] = useState<"embaralhando" | "resolvendo" | "resolvido">("resolvido");
  const theme = THEMES.find((t) => t.id === SHOWCASE[themeIdx]) ?? THEMES[0];

  useEffect(() => {
    let alive = true;
    let s = solvedState(N);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const play = async (m: Move, ms: number) => {
      if (!alive) return;
      await cubeRef.current?.animateMove(m, ms);
      s = applyMove(N, s, m);
      if (alive) setState(s);
    };
    (async () => {
      await wait(1200);
      for (let round = 0; alive; round++) {
        // embaralha
        setPhase("embaralhando");
        const moves: Move[] = [];
        for (let i = 0; i < 10; i++) {
          let m: Move;
          do {
            m = faceMove(N, FACES[Math.floor(Math.random() * 6)], ([1, -1, 2] as const)[Math.floor(Math.random() * 3)]);
          } while (moves.length && moves[moves.length - 1].axis === m.axis);
          moves.push(m);
          await play(m, 340);
          await wait(60);
        }
        await wait(700);
        // resolve (desfazendo)
        setPhase("resolvendo");
        for (const m of moves.slice().reverse().map(invertMove)) {
          await play(m, 300);
          await wait(40);
        }
        if (!alive) break;
        setPhase("resolvido");
        cubeRef.current?.celebrate();
        await wait(1600);
        if (alive) setThemeIdx((i) => (i + 1) % SHOWCASE.length);
        await wait(900);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#06060a] text-zinc-100">
      {/* fundo */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 transition-[background] duration-1000"
          style={{
            background: `radial-gradient(60vmax 45vmax at 50% 45%, ${theme.accent}33, transparent 65%),
              radial-gradient(50vmax 40vmax at 100% 100%, #6366f126, transparent 60%)`,
          }}
        />
        <div className="grid-bg absolute inset-0 opacity-[0.08]" />
      </div>

      {/* topo */}
      <header className="fade-up relative z-10 flex shrink-0 items-center justify-between px-5 pt-4 sm:px-8 sm:pt-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 grid-cols-3 gap-[2px] rounded-lg bg-black/60 p-[3px] ring-1 ring-white/10">
            {(["W", "R", "G", "Y", "B", "O", "G", "W", "R"] as const).map((c, i) => (
              <span key={i} className="rounded-[2px]" style={{ background: themeHex(theme, c) }} />
            ))}
          </div>
          <span className="font-semibold tracking-tight">Cubo Mágico</span>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400 ring-1 ring-white/10">2×2 · 3×3</span>
      </header>

      {/* título */}
      <div className="relative z-10 shrink-0 px-5 pt-4 text-center sm:pt-6">
        <p className="fade-up text-xs font-medium tracking-[0.25em] text-[var(--a)] uppercase" style={{ ["--a" as string]: theme.accent, animationDelay: "80ms" }}>
          Resolvedor de cubo mágico
        </p>
        <h1
          className="fade-up mx-auto mt-3 max-w-4xl text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl xl:text-5xl"
          style={{ animationDelay: "160ms" }}
        >
          Do seu cubo embaralhado ao resolvido,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(90deg, ${theme.accent}, #ffffff)` }}
          >
            um passo de cada vez.
          </span>
        </h1>
        <p className="fade-up mx-auto mt-3 max-w-xl text-sm text-zinc-400 sm:text-base" style={{ animationDelay: "240ms" }}>
          Pinte as cores do seu cubo, receba a solução e acompanhe cada movimento animado em 3D.
        </p>
      </div>

      {/* cubo */}
      <div className="relative z-0 min-h-0 flex-1">
        <MetalCube
          ref={cubeRef}
          size={N}
          state={state}
          theme={theme}
          hoverGlow={false}
          autoRotate
          zoom={false}
          distanceScale={0.8}
          className="absolute inset-0"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-zinc-300 ring-1 ring-white/10">
            {phase === "embaralhando" ? "Embaralhando…" : phase === "resolvendo" ? "Resolvendo…" : `Resolvido · ${theme.name}`}
          </span>
        </div>
      </div>

      {/* rodapé */}
      <div className="relative z-10 shrink-0 px-5 pb-6 sm:pb-8">
        <ul className="fade-up mx-auto mb-5 flex max-w-2xl flex-wrap justify-center gap-2 text-xs text-zinc-300 sm:gap-3 sm:text-sm" style={{ animationDelay: "320ms" }}>
          {["🎨 Pinte igual ao seu cubo", "🧠 Solução em segundos", "▶️ Passo a passo animado"].map((t) => (
            <li key={t} className="rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">
              {t}
            </li>
          ))}
        </ul>
        <div className="fade-up flex justify-center" style={{ animationDelay: "400ms" }}>
          <Link
            href="/resolver"
            className="shine group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-8 py-3.5 text-base font-semibold text-zinc-950 transition hover:scale-[1.03] active:scale-[.98] sm:px-10 sm:py-4"
            style={{
              background: `linear-gradient(135deg, ${theme.accent}, #ffffff)`,
              boxShadow: `0 10px 40px -8px ${theme.accent}`,
            }}
          >
            Começar
            <svg viewBox="0 0 24 24" className="h-5 w-5 transition group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
