"use client";

/**
 * Cubo 3D interativo (three.js) inspirado no componente "Metal Rubik's" da OriginKit:
 * acabamento cromado ("metallic") ou adesivos pintados ("painted"), arrastar para girar
 * a câmera, clicar em um adesivo para pintar, e animação de giro das camadas.
 *
 * API de props espelha a do componente original (tint, gap, dragSensitivity, sizePercent,
 * colorMode) para facilitar a troca caso você queira usar o código da OriginKit.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  applyMove,
  BASE_MOVES,
  COLOR_HEX,
  FACELETS,
  type Move,
  type State,
} from "@/lib/cube";

export type ColorMode = "metallic" | "painted";

export interface MetalCubeProps {
  state: State;
  colorMode?: ColorMode;
  /** cor que "lava" o cromado do corpo das peças */
  tint?: string;
  /** espaço entre as peças (0–3) */
  gap?: number;
  dragSensitivity?: number;
  /** quanto do quadro o cubo ocupa (50–100) */
  sizePercent?: number;
  /** adesivos para destacar (ex.: peças inválidas) */
  highlight?: number[];
  /** chamado ao clicar (sem arrastar) em um adesivo */
  onStickerClick?: (index: number) => void;
  className?: string;
}

export interface MetalCubeHandle {
  /** anima um giro de camada; resolve quando termina */
  animateMove: (move: Move, durationMs?: number) => Promise<void>;
  /** reposiciona a câmera na vista padrão */
  resetView: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function roundedRectShape(size: number, radius: number) {
  const s = size / 2;
  const r = radius;
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo(s - r, -s);
  shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s);
  shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

const DEFAULT_CAM = new THREE.Vector3(5.6, 4.6, 7.4);

const MetalCube = forwardRef<MetalCubeHandle, MetalCubeProps>(function MetalCube(
  {
    state,
    colorMode = "metallic",
    tint = "#ffffff",
    gap = 1,
    dragSensitivity = 3,
    sizePercent = 95,
    highlight,
    onStickerClick,
    className,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    root: THREE.Group;
    cubies: { mesh: THREE.Group; home: THREE.Vector3 }[];
    stickers: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial>[];
    bodyMat: THREE.MeshStandardMaterial;
    animating: boolean;
    currentState: State;
    fitDistance: number;
  } | null>(null);
  const clickRef = useRef(onStickerClick);
  clickRef.current = onStickerClick;
  const highlightRef = useRef<Set<number>>(new Set());

  // ---- montagem da cena (uma vez) ----
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.copy(DEFAULT_CAM);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(5, 8, 6);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 20;

    const root = new THREE.Group();
    scene.add(root);

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const bodyGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 4, 0.1);
    const stickerGeo = new THREE.ShapeGeometry(roundedRectShape(0.82, 0.12), 6);

    const cubies: { mesh: THREE.Group; home: THREE.Vector3 }[] = [];
    const cubieByPos = new Map<string, THREE.Group>();
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const g = new THREE.Group();
          g.add(new THREE.Mesh(bodyGeo, bodyMat));
          g.position.set(x, y, z);
          root.add(g);
          cubies.push({ mesh: g, home: new THREE.Vector3(x, y, z) });
          cubieByPos.set(`${x},${y},${z}`, g);
        }

    const stickers = FACELETS.map((f) => {
      const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
      const m = new THREE.Mesh(stickerGeo, mat);
      const n = new THREE.Vector3(...f.normal);
      m.position.copy(n.clone().multiplyScalar(0.485));
      m.lookAt(n.clone().multiplyScalar(2));
      m.userData.index = f.index;
      cubieByPos.get(f.pos.join(","))!.add(m);
      return m;
    });

    ctx.current = {
      renderer,
      scene,
      camera,
      controls,
      root,
      cubies,
      stickers,
      bodyMat,
      animating: false,
      currentState: state,
      fitDistance: DEFAULT_CAM.length(),
    };

    // ---- clique para pintar (distingue de arrastar) ----
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || !clickRef.current || ctx.current?.animating) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(stickers, false)[0];
      if (hit) clickRef.current(hit.object.userData.index as number);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    // ---- tamanho ----
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      // em telas estreitas (celular) afasta um pouco para o cubo caber na largura
      camera.zoom = Math.min(1, camera.aspect / 0.95);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let raf = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      // pulso nos adesivos destacados
      if (highlightRef.current.size) {
        const k = 0.35 + 0.35 * Math.sin(t * 6);
        for (const i of highlightRef.current) stickers[i].material.emissive.setRGB(k, 0, 0);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      bodyGeo.dispose();
      stickerGeo.dispose();
      bodyMat.dispose();
      stickers.forEach((s) => s.material.dispose());
      pmrem.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      ctx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- cores dos adesivos ----
  const paint = (s: State) => {
    const c = ctx.current;
    if (!c) return;
    c.currentState = s;
    c.stickers.forEach((m, i) => m.material.color.set(COLOR_HEX[s[i]]));
  };
  useEffect(() => {
    if (ctx.current && !ctx.current.animating) paint(state);
  }, [state]);

  // ---- acabamento ----
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const metal = colorMode === "metallic";
    c.bodyMat.color.set(metal ? tint : "#111114");
    c.bodyMat.metalness = metal ? 1 : 0.1;
    c.bodyMat.roughness = metal ? 0.18 : 0.55;
    c.stickers.forEach((m) => {
      m.material.metalness = metal ? 0.55 : 0;
      m.material.roughness = metal ? 0.22 : 0.6;
      m.material.envMapIntensity = metal ? 1 : 0.35;
    });
  }, [colorMode, tint]);

  // ---- espaçamento ----
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const spacing = 1 + Math.max(0, gap) * 0.03;
    c.root.scale.setScalar(1);
    c.cubies.forEach(({ mesh, home }) => mesh.position.copy(home).multiplyScalar(spacing));
  }, [gap]);

  // ---- tamanho no quadro / sensibilidade ----
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const dist = DEFAULT_CAM.length() * (95 / Math.min(100, Math.max(40, sizePercent)));
    c.fitDistance = dist;
    c.camera.position.setLength(dist);
    c.controls.rotateSpeed = dragSensitivity / 3;
  }, [sizePercent, dragSensitivity]);

  // ---- destaque ----
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const next = new Set(highlight ?? []);
    for (const i of highlightRef.current) if (!next.has(i)) c.stickers[i].material.emissive.setRGB(0, 0, 0);
    highlightRef.current = next;
  }, [highlight]);

  useImperativeHandle(ref, () => ({
    resetView() {
      const c = ctx.current;
      if (!c) return;
      c.camera.position.copy(DEFAULT_CAM).setLength(c.fitDistance);
      c.controls.target.set(0, 0, 0);
    },
    animateMove(move, durationMs = 350) {
      const c = ctx.current;
      if (!c) return Promise.resolve();
      const def = BASE_MOVES[move.face];
      const axisVec = new THREE.Vector3(
        def.axis === 0 ? 1 : 0,
        def.axis === 1 ? 1 : 0,
        def.axis === 2 ? 1 : 0,
      );
      const angle = (def.dir * (move.turns === 2 ? 2 : move.turns) * Math.PI) / 2;
      const layer = c.cubies.filter(({ home }) => home.getComponent(def.axis) === def.layer);
      const pivot = new THREE.Group();
      c.root.add(pivot);
      layer.forEach(({ mesh }) => pivot.attach(mesh));
      c.animating = true;
      const dur = durationMs * (move.turns === 2 ? 1.5 : 1);
      const start = performance.now();
      return new Promise<void>((resolve) => {
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / Math.max(1, dur));
          pivot.quaternion.setFromAxisAngle(axisVec, angle * easeInOut(t));
          if (t < 1) {
            requestAnimationFrame(step);
            return;
          }
          // volta as peças para a posição original e repinta com o novo estado
          const spacing = 1 + Math.max(0, gap) * 0.03;
          layer.forEach(({ mesh, home }) => {
            c.root.attach(mesh);
            mesh.position.copy(home).multiplyScalar(spacing);
            mesh.quaternion.identity();
          });
          c.root.remove(pivot);
          c.animating = false;
          paint(applyMove(c.currentState, move));
          resolve();
        };
        requestAnimationFrame(step);
      });
    },
  }));

  return <div ref={mountRef} className={className} />;
});

export default MetalCube;
