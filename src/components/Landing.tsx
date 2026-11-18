"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MetalCube, { type MetalCubeHandle } from "@/components/MetalCube";
import Backdrop from "@/components/Backdrop";
import { LogoMark } from "@/components/Brand";
import { applyMove, faceMove, FACES, invertMove, solvedState, type Move, type State } from "@/lib/cube";
import { THEMES } from "@/lib/themes";

const N = 3;
const theme = THEMES[0];

const FEATURES = [
  { icon: "🎨", title: "Pinte igual ao seu", text: "Escolha a cor e toque nos quadradinhos da planificação." },
  { icon: "✅", title: "Validação na hora", text: "Avisa se alguma peça está torcida, repetida ou trocada." },
  { icon: "🧠", title: "Solução em segundos", text: "2×2 com o mínimo de giros e 3×3 pelo algoritmo de Kociemba." },
  { icon: "▶️", title: "Passo a passo em 3D", text: "Cada giro animado, com play, voltar e controle de velocidade." },
];

/** Tela de apresentação: cubo 3D que embaralha e se resolve sozinho, destaques animados e botão para o app. */
export default function Landing() {
  const cubeRef = useRef<MetalCubeHandle>(null);
  const [state, setState] = useState<State>(() => solvedState(N));
  const [phase, setPhase] = useState<"embaralhando" | "resolvendo" | "resolvido">("resolvido");
  const [tick, setTick] = useState(0);

  // destaque rotativo (celular/tablet)
  useEffect(() => {
    const t = setInterval(() => setTick((i) => i + 1), 3200);
    return () => clearInterval(t);
  }, []);

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
      while (alive) {
        setPhase("embaralhando");
        const moves: Move[] = [];
        for (let i = 0; i < 10 && alive; i++) {
          let m: Move;
          do {
            m = faceMove(N, FACES[Math.floor(Math.random() * 6)], ([1, -1, 2] as const)[Math.floor(Math.random() * 3)]);
          } while (moves.length && moves[moves.length - 1].axis === m.axis);
          moves.push(m);
          await play(m, 360);
          await wait(70);
        }
        await wait(800);
        if (!alive) break;
        setPhase("resolvendo");
        for (const m of moves.slice().reverse().map(invertMove)) {
          await play(m, 320);
          await wait(50);
        }
        if (!alive) break;
        setPhase("resolvido");
        cubeRef.current?.celebrate();
        await wait(2600);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const left = FEATURES.slice(0, 2);
  const right = FEATURES.slice(2);
  const mobileFeature = FEATURES[tick % FEATURES.length];

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#06060a] text-zinc-100">
      <Backdrop accent={theme.accent} />

      {/* topo */}
      <header className="fade-up relative z-10 flex shrink-0 items-center justify-between px-5 pt-4 sm:px-8 sm:pt-6">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">Cubo Mágico</span>
        </div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-zinc-400 ring-1 ring-white/10">2×2 · 3×3</span>
      </header>

      {/* título */}
      <div className="relative z-10 shrink-0 px-5 pt-3 text-center sm:pt-5">
        <p className="fade-up text-xs font-medium tracking-[0.25em] text-violet-300 uppercase" style={{ animationDelay: "80ms" }}>
          Resolvedor de cubo mágico
        </p>
        <h1
          className="fade-up mx-auto mt-3 max-w-4xl text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl xl:text-5xl"
          style={{ animationDelay: "160ms" }}
        >
          Do seu cubo embaralhado ao resolvido,{" "}
          <span className="bg-gradient-to-r from-violet-400 to-white bg-clip-text text-transparent">um passo de cada vez.</span>
        </h1>
        <p className="fade-up mx-auto mt-3 max-w-xl text-sm text-zinc-400 sm:text-base" style={{ animationDelay: "240ms" }}>
          Pinte as cores do seu cubo, receba a solução e acompanhe cada movimento animado em 3D.
        </p>

        {/* destaque rotativo no celular/tablet */}
        <div className="mt-4 flex h-[60px] justify-center xl:hidden">
          <div key={tick} className="ticker-item glass flex max-w-sm items-center gap-3 rounded-2xl px-4 py-2.5 text-left">
            <span className="text-xl">{mobileFeature.icon}</span>
            <span>
              <span className="block text-sm font-medium">{mobileFeature.title}</span>
              <span className="block text-xs text-zinc-400">{mobileFeature.text}</span>
            </span>
          </div>
        </div>
      </div>

      {/* cubo + destaques nas laterais (desktop) */}
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
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[min(30vw,330px)] flex-col justify-center gap-5 pl-8 xl:flex 2xl:pl-16">
          {left.map((f, i) => (
            <FeatureCard key={f.title} f={f} delay={500 + i * 180} from="-40px" float={i * 1.4} />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[min(30vw,330px)] flex-col justify-center gap-5 pr-8 xl:flex 2xl:pr-16">
          {right.map((f, i) => (
            <FeatureCard key={f.title} f={f} delay={680 + i * 180} from="40px" float={0.7 + i * 1.4} />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-zinc-300 ring-1 ring-white/10">
            {phase === "embaralhando" ? "Embaralhando…" : phase === "resolvendo" ? "Resolvendo…" : "Resolvido ✓"}
          </span>
        </div>
      </div>

      {/* só o botão embaixo do cubo */}
      <div className="fade-up relative z-10 flex shrink-0 justify-center px-5 pt-3 pb-7 sm:pb-9" style={{ animationDelay: "400ms" }}>
        <Link
          href="/resolver"
          className="shine group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-br from-violet-400 to-white px-9 py-3.5 text-base font-semibold text-zinc-950 shadow-[0_10px_40px_-8px_#a78bfa] transition hover:scale-[1.04] active:scale-[.98] sm:px-11 sm:py-4 sm:text-lg"
        >
          Começar
          <svg viewBox="0 0 24 24" className="h-5 w-5 transition group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function FeatureCard({
  f,
  delay,
  from,
  float,
}: {
  f: (typeof FEATURES)[number];
  delay: number;
  from: string;
  float: number;
}) {
  return (
    <div
      className="float-card glass-strong rounded-2xl p-4"
      style={{
        ["--from" as string]: from,
        animationDelay: `${delay}ms, ${delay + 900 + float * 1000}ms`,
      }}
    >
      <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-lg ring-1 ring-white/10">{f.icon}</div>
      <div className="text-sm font-semibold">{f.title}</div>
      <div className="mt-0.5 text-[13px] leading-snug text-zinc-400">{f.text}</div>
    </div>
  );
}
