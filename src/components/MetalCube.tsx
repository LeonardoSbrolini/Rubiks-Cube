"use client";

/**
 * Cubo 3D interativo NxN (three.js), inspirado no "Metal Rubik's" da OriginKit.
 *
 * - arrastar no fundo gira a vista; arrastar sobre um adesivo gira aquela camada
 * - clique (sem arrastar) em um adesivo chama onStickerClick (pintura)
 * - animações: entrada ao trocar de tamanho, giros com leve "overshoot", "pop" ao pintar,
 *   brilho ao passar o mouse, flutuação suave e giro de comemoração
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { applyMove, cubiePositions, faceletsFor, type Axis, type Move, type State, type Vec3 } from "@/lib/cube";
import { themeHex, type Theme } from "@/lib/themes";

export interface MetalCubeProps {
  size: number;
  state: State;
  theme: Theme;
  /** espaço entre as peças (0–3) */
  gap?: number;
  /** adesivos para destacar (peças inválidas) */
  highlight?: number[];
  /** clique (sem arrastar) em um adesivo */
  onStickerClick?: (index: number) => void;
  /** giro de camada feito arrastando no cubo (já animado e aplicado aqui dentro) */
  onTurn?: (move: Move) => void;
  /** liga o brilho ao passar o mouse sobre os adesivos */
  hoverGlow?: boolean;
  className?: string;
}

export interface MetalCubeHandle {
  animateMove: (move: Move, durationMs?: number) => Promise<void>;
  resetView: () => void;
  celebrate: () => void;
}

type StickerMesh = THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial>;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number, s = 1.1) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const DEFAULT_DIR = new THREE.Vector3(5.6, 4.6, 7.4).normalize();
const UNIT = 0.5; // coordenadas inteiras (passo 2) → unidades do mundo

function roundedRectShape(size: number, radius: number) {
  const s = size / 2;
  const r = Math.min(radius, s);
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

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(0.5, "rgba(0,0,0,0.22)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const MetalCube = forwardRef<MetalCubeHandle, MetalCubeProps>(function MetalCube(
  { size, state, theme, gap = 1, highlight, onStickerClick, onTurn, hoverGlow = true, className },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const props = useRef({ onStickerClick, onTurn, hoverGlow, theme, gap });
  props.current = { onStickerClick, onTurn, hoverGlow, theme, gap };

  const world = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    stage: THREE.Group; // flutua/comemora
    root: THREE.Group; // peças
    shadow: THREE.Mesh;
    bodyMat: THREE.MeshStandardMaterial;
  } | null>(null);

  const cube = useRef<{
    n: number;
    cubies: { mesh: THREE.Group; home: Vec3 }[];
    stickers: StickerMesh[];
    geos: THREE.BufferGeometry[];
    current: State;
    animating: boolean;
    introStart: number;
    spinStart: number;
    hovered: number;
    pops: Map<number, number>;
  } | null>(null);
  const highlightRef = useRef<Set<number>>(new Set());

  // ---------------------------------------------------------------- cena
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(5, 9, 6);
    const rim = new THREE.DirectionalLight(0x8b9dff, 0.6);
    rim.position.set(-6, 2, -5);
    scene.add(keyLight, rim, new THREE.AmbientLight(0xffffff, 0.3));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.9;

    const stage = new THREE.Group();
    const root = new THREE.Group();
    stage.add(root);
    scene.add(stage);

    const shadowTex = shadowTexture();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);

    const bodyMat = new THREE.MeshStandardMaterial();
    world.current = { renderer, scene, camera, controls, stage, root, shadow, bodyMat };

    // ---------- interação ----------
    const el = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (e: PointerEvent): StickerMesh | null => {
      const c = cube.current;
      if (!c) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return (raycaster.intersectObjects(c.stickers, false)[0]?.object as StickerMesh) ?? null;
    };
    const toScreen = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2((p.x * rect.width) / 2, (-p.y * rect.height) / 2);
    };

    type DragTurn = {
      axis: Axis;
      layer: number;
      rotSign: number;
      screenDir: THREE.Vector2;
      pxPer90: number;
      pivot: THREE.Group;
      cubies: { mesh: THREE.Group; home: Vec3 }[];
      angle: number;
    };
    let press: {
      x: number;
      y: number;
      sticker: StickerMesh | null;
      turn: DragTurn | null;
      lastX: number;
      lastY: number;
      lastT: number;
      vel: number;
    } | null = null;
    const axisVecs = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

    const onDown = (e: PointerEvent) => {
      const c = cube.current;
      const s = c && !c.animating ? pick(e) : null;
      press = { x: e.clientX, y: e.clientY, sticker: s, turn: null, lastX: e.clientX, lastY: e.clientY, lastT: performance.now(), vel: 0 };
      // arrastar sobre o cubo gira a camada; fora dele, gira a vista
      controls.enabled = !(s && props.current.onTurn);
      if (s) el.setPointerCapture(e.pointerId);
    };

    const startTurn = (c: NonNullable<typeof cube.current>, sticker: StickerMesh, drag: THREE.Vector2): DragTurn | null => {
      const f = faceletsFor(c.n)[sticker.userData.index as number];
      const normalAxis = f.normal.findIndex((v) => v !== 0);
      const center = new THREE.Vector3();
      sticker.getWorldPosition(center);
      const base = toScreen(center);
      // escolhe a direção na superfície que mais combina com o arraste
      let best = { axis: -1, sign: 1, score: 0, sd: new THREE.Vector2() };
      for (let a = 0; a < 3; a++) {
        if (a === normalAxis) continue;
        const sd = toScreen(center.clone().add(axisVecs[a])).sub(base);
        if (sd.length() < 1e-3) continue;
        const score = drag.dot(sd) / sd.length();
        if (Math.abs(score) > Math.abs(best.score)) best = { axis: a, sign: Math.sign(score), score, sd };
      }
      if (best.axis < 0) return null;
      const n = new THREE.Vector3(...f.normal);
      const d = new THREE.Vector3().setComponent(best.axis, best.sign);
      const r = new THREE.Vector3().crossVectors(n, d); // girar +90° em torno de r leva n → d
      const axis = [0, 1, 2].find((k) => r.getComponent(k) !== 0)! as Axis;
      const layer = f.pos[axis];
      const pivot = new THREE.Group();
      root.add(pivot);
      const cubies = c.cubies.filter(({ home }) => home[axis] === layer);
      cubies.forEach(({ mesh }) => pivot.attach(mesh));
      c.animating = true;
      c.hovered = -1;
      const unitPx = best.sd.length();
      return {
        axis,
        layer,
        rotSign: Math.sign(r.getComponent(axis)),
        screenDir: best.sd.clone().normalize().multiplyScalar(best.sign),
        // ~ arrastar a largura de 1,6 peça = 90°
        pxPer90: Math.max(60, unitPx * 1.6),
        pivot,
        cubies,
        angle: 0,
      };
    };

    const onMove = (e: PointerEvent) => {
      const c = cube.current;
      if (!c) return;
      if (!press) {
        if (props.current.hoverGlow && e.pointerType === "mouse" && !c.animating) {
          const s = pick(e);
          c.hovered = s ? (s.userData.index as number) : -1;
          el.style.cursor = s ? "pointer" : "grab";
        }
        return;
      }
      if (!press.sticker || !props.current.onTurn) return;
      const drag = new THREE.Vector2(e.clientX - press.x, e.clientY - press.y);
      if (!press.turn) {
        if (drag.length() < 8 || c.animating) return;
        press.turn = startTurn(c, press.sticker, drag);
        if (!press.turn) return;
      }
      const t = press.turn;
      const now = performance.now();
      const proj = drag.dot(t.screenDir);
      const prevProj = new THREE.Vector2(press.lastX - press.x, press.lastY - press.y).dot(t.screenDir);
      const dt = Math.max(1, now - press.lastT);
      press.vel = press.vel * 0.6 + ((proj - prevProj) / dt) * 0.4; // px/ms
      press.lastX = e.clientX;
      press.lastY = e.clientY;
      press.lastT = now;
      t.angle = t.rotSign * (proj / t.pxPer90) * (Math.PI / 2);
      t.pivot.quaternion.setFromAxisAngle(axisVecs[t.axis], t.angle);
    };

    const finishTurn = (c: NonNullable<typeof cube.current>, t: DragTurn, vel: number) => {
      const quarter = Math.PI / 2;
      let k = Math.round(t.angle / quarter);
      // um "peteleco" rápido completa o giro mesmo com pouco arraste
      const flick = t.rotSign * vel;
      if (k === 0 && Math.abs(flick) > 0.5) k = Math.sign(flick);
      else if (k === 0 && Math.abs(t.angle) > quarter * 0.3) k = Math.sign(t.angle);
      const from = t.angle;
      const to = k * quarter;
      const start = performance.now();
      const dur = 120 + Math.min(140, Math.abs(to - from) * 160);
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        t.pivot.quaternion.setFromAxisAngle(axisVecs[t.axis], from + (to - from) * e);
        if (p < 1) return void requestAnimationFrame(step);
        const sp = spacing();
        t.cubies.forEach(({ mesh, home }) => {
          root.attach(mesh);
          mesh.position.set(home[0] * UNIT * sp, home[1] * UNIT * sp, home[2] * UNIT * sp);
          mesh.quaternion.identity();
        });
        root.remove(t.pivot);
        c.animating = false;
        const kk = ((k % 4) + 4) % 4;
        if (kk !== 0) {
          const move: Move = { axis: t.axis, layer: t.layer, q: kk === 1 ? 1 : kk === 2 ? 2 : -1 };
          paint(applyMove(c.n, c.current, move));
          props.current.onTurn?.(move);
        }
      };
      requestAnimationFrame(step);
    };

    const onUp = (e: PointerEvent) => {
      controls.enabled = true;
      if (!press) return;
      const p = press;
      press = null;
      const c = cube.current;
      if (p.turn && c) return finishTurn(c, p.turn, p.vel);
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (moved > 6 || !p.sticker || c?.animating) return;
      props.current.onStickerClick?.(p.sticker.userData.index as number);
    };
    const onLeave = () => {
      if (cube.current) cube.current.hovered = -1;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    // ---------- tamanho ----------
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.zoom = Math.min(1, camera.aspect / 0.95);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // ---------- loop ----------
    let raf = 0;
    const white = new THREE.Color(0xffffff);
    const tmp = new THREE.Color();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const t = now / 1000;
      const c = cube.current;
      if (c) {
        const n = c.n;
        // entrada
        const ti = Math.min(1, (now - c.introStart) / 750);
        const s = ti < 1 ? Math.max(0.001, easeOutBack(ti, 1.4)) : 1;
        root.scale.setScalar(s);
        // flutuação + comemoração
        stage.position.y = Math.sin(t * 1.3) * 0.05 * (n / 3);
        const ts = (now - c.spinStart) / 1400;
        stage.rotation.y = ts >= 0 && ts < 1 ? easeInOut(ts) * Math.PI * 2 : ti < 1 ? (1 - easeInOut(ti)) * -Math.PI * 0.6 : 0;
        if (ts >= 0 && ts < 1) stage.position.y += Math.sin(ts * Math.PI) * 0.6 * (n / 3);
        // sombra acompanha a flutuação
        const lift = stage.position.y;
        shadow.scale.setScalar(n * 2.2 * (1 - lift * 0.08) * s);
        (shadow.material as THREE.MeshBasicMaterial).opacity = 0.9 - lift * 0.3;

        // brilho dos adesivos (neon, hover, destaque, pop)
        const glow = props.current.theme.sticker.glow;
        const pulse = 0.35 + 0.35 * Math.sin(t * 6);
        for (let i = 0; i < c.stickers.length; i++) {
          const m = c.stickers[i];
          const em = m.material.emissive;
          if (glow && c.current[i] !== "X") em.copy(m.material.color).multiplyScalar(glow);
          else em.setRGB(0, 0, 0);
          if (i === c.hovered && props.current.hoverGlow) em.add(tmp.copy(white).multiplyScalar(0.18));
          if (highlightRef.current.has(i)) em.setRGB(pulse, 0, 0);
          const p0 = c.pops.get(i);
          if (p0 !== undefined) {
            const tp = (now - p0) / 280;
            if (tp >= 1) {
              c.pops.delete(i);
              m.scale.setScalar(1);
            } else {
              m.scale.setScalar(1 + 0.3 * Math.sin(Math.PI * tp));
              em.add(tmp.copy(white).multiplyScalar(0.35 * (1 - tp)));
            }
          }
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      disposeCube();
      shadowTex.dispose();
      bodyMat.dispose();
      pmrem.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      world.current = null;
    };
     
  }, []);

  function disposeCube() {
    const c = cube.current;
    const w = world.current;
    if (!c || !w) return;
    c.cubies.forEach(({ mesh }) => w.root.remove(mesh));
    c.stickers.forEach((s) => s.material.dispose());
    c.geos.forEach((g) => g.dispose());
    cube.current = null;
  }

  const spacing = () => 1 + Math.max(0, props.current.gap) * 0.03;

  function applyTheme() {
    const w = world.current;
    const c = cube.current;
    if (!w) return;
    const th = props.current.theme;
    w.bodyMat.color.set(th.body.color);
    w.bodyMat.metalness = th.body.metalness;
    w.bodyMat.roughness = th.body.roughness;
    if (!c) return;
    c.stickers.forEach((m) => {
      m.material.metalness = th.sticker.metalness;
      m.material.roughness = th.sticker.roughness;
      m.material.envMapIntensity = th.sticker.env;
    });
  }

  function paint(s: State, pop = false) {
    const c = cube.current;
    if (!c) return;
    const th = props.current.theme;
    const now = performance.now();
    c.stickers.forEach((m, i) => {
      if (pop && c.current[i] !== s[i]) c.pops.set(i, now);
      m.material.color.set(themeHex(th, s[i]));
    });
    c.current = s;
  }

  // ---------------------------------------------------------------- monta o cubo NxN
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    disposeCube();
    const th = props.current.theme;
    const n = size;
    const bodyGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 3, 0.1);
    const stickerGeo = new THREE.ShapeGeometry(roundedRectShape(th.sticker.size, th.sticker.radius), 5);
    const cubies: { mesh: THREE.Group; home: Vec3 }[] = [];
    const byPos = new Map<string, THREE.Group>();
    const sp = spacing();
    for (const p of cubiePositions(n)) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, w.bodyMat));
      g.position.set(p[0] * UNIT * sp, p[1] * UNIT * sp, p[2] * UNIT * sp);
      w.root.add(g);
      cubies.push({ mesh: g, home: p });
      byPos.set(p.join(","), g);
    }
    const stickers = faceletsFor(n).map((f) => {
      const m = new THREE.Mesh(stickerGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })) as StickerMesh;
      const nv = new THREE.Vector3(...f.normal);
      m.position.copy(nv.clone().multiplyScalar(0.486));
      m.lookAt(nv.clone().multiplyScalar(2));
      m.userData.index = f.index;
      byPos.get(f.pos.join(","))!.add(m);
      return m;
    });
    cube.current = {
      n,
      cubies,
      stickers,
      geos: [bodyGeo, stickerGeo],
      current: state,
      animating: false,
      introStart: performance.now(),
      spinStart: -1e9,
      hovered: -1,
      pops: new Map(),
    };
    applyTheme();
    paint(state);
    // câmera e sombra proporcionais ao tamanho
    const dist = 11.8 * (n / 3) * (n === 2 ? 1.25 : 1);
    w.camera.position.copy(DEFAULT_DIR).multiplyScalar(dist);
    w.controls.minDistance = dist * 0.6;
    w.controls.maxDistance = dist * 2;
    w.controls.target.set(0, 0, 0);
    w.shadow.position.y = -(n / 2) * sp - 0.9;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, theme.sticker.size, theme.sticker.radius]);

  // ---------------------------------------------------------------- reage às props
  useEffect(() => {
    const c = cube.current;
    if (c && !c.animating && c.n === size) paint(state, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    applyTheme();
    const c = cube.current;
    if (c) paint(c.current);
     
  }, [theme]);

  useEffect(() => {
    const c = cube.current;
    if (!c) return;
    const sp = spacing();
    c.cubies.forEach(({ mesh, home }) => mesh.position.set(home[0] * UNIT * sp, home[1] * UNIT * sp, home[2] * UNIT * sp));
     
  }, [gap]);

  useEffect(() => {
    highlightRef.current = new Set(highlight ?? []);
  }, [highlight]);

  useImperativeHandle(ref, () => ({
    resetView() {
      const w = world.current;
      if (!w) return;
      const dist = w.camera.position.length();
      w.camera.position.copy(DEFAULT_DIR).multiplyScalar(dist);
      w.controls.target.set(0, 0, 0);
    },
    celebrate() {
      if (cube.current) cube.current.spinStart = performance.now();
    },
    animateMove(move, durationMs = 320) {
      const w = world.current;
      const c = cube.current;
      if (!w || !c) return Promise.resolve();
      if (c.animating) {
        // espera um giro em andamento (ex.: arraste) terminar
        const self = this as MetalCubeHandle;
        return new Promise<void>((r) => requestAnimationFrame(() => r())).then(() =>
          self.animateMove(move, durationMs),
        );
      }
      const axisVec = new THREE.Vector3().setComponent(move.axis, 1);
      const angle = (move.q * Math.PI) / 2;
      const layer = c.cubies.filter(({ home }) => home[move.axis] === move.layer);
      const pivot = new THREE.Group();
      w.root.add(pivot);
      layer.forEach(({ mesh }) => pivot.attach(mesh));
      c.animating = true;
      c.hovered = -1;
      const dur = durationMs * (move.q === 2 ? 1.45 : 1);
      const start = performance.now();
      return new Promise<void>((resolve) => {
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / Math.max(1, dur));
          pivot.quaternion.setFromAxisAngle(axisVec, angle * easeOutBack(t, 0.9));
          if (t < 1) {
            requestAnimationFrame(step);
            return;
          }
          const sp = spacing();
          layer.forEach(({ mesh, home }) => {
            w.root.attach(mesh);
            mesh.position.set(home[0] * UNIT * sp, home[1] * UNIT * sp, home[2] * UNIT * sp);
            mesh.quaternion.identity();
          });
          w.root.remove(pivot);
          c.animating = false;
          paint(applyMove(c.n, c.current, move));
          resolve();
        };
        requestAnimationFrame(step);
      });
    },
  }));

  return <div ref={mountRef} className={className} />;
});

export default MetalCube;
