/**
 * ⚡ #781 閃電效能 profile —— NullEngine（CPU-only；GPU 那一半要真瀏覽器）。
 *
 * 暫存探測檔（{用途}_temp_{時間戳}），量完即刪。⛔ 不是出貨程式。
 *
 * 量的是**出貨的那條路**的 CPU 半邊：
 *   case "chainLightning" ≈ arcBoltSpec + ArcBoltFx.strike + layeredPop
 *   （layeredPop = ImpactComposer.fire("light") + impactRecipe ×2）
 * 事件排程逐字照 65-04 天譴出貨參數：20 strands · jumps 16 · interval 0.05s
 * （→ 30Hz 下 2 tick）· cascade 第 i 條晚 i 個間隔。
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Engine } from "@babylonjs/core/Engines/engine";
import { ArcBoltFx } from "./ArcBoltFx";
import { arcBoltSpec, arcNoise, ARC_TINTS, buildArcPath, arcStripPaths } from "./arcBolt";
import { ImpactComposer, impactRecipe } from "./vfxPresets";

const ARC_BODY_Y = 0.95; // VfxSystem.ARC_BODY_Y
const TICK_MS = 1000 / 30;
const FRAME_MS = 1000 / 60;

interface Bolt {
  atMs: number;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  seed: number;
}

/** 出貨 65-04 的一次施放 → 一串 (時刻, 兩端) 的 bolt 清單。 */
function scheduleCast(startMs: number, castSeed: number): Bolt[] {
  const strands = 20;
  const jumps = 16;
  const intervalTicks = 2; // round(0.05 / (1/30)) = 2
  const out: Bolt[] = [];
  // 敵人環：半徑 6 的 20 個位置（audition 頁同款,只是多到 20）
  const ring: { x: number; z: number }[] = [];
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2;
    ring.push({ x: Math.cos(a) * 6, z: Math.sin(a) * 6 });
  }
  for (let s = 0; s < strands; s++) {
    let from = { x: 0, y: ARC_BODY_Y, z: 0 };
    for (let j = 0; j < jumps; j++) {
      const tick = s + 1 + (s + j) * intervalTicks;
      const pick = ring[Math.abs(Math.floor(arcNoise(castSeed + s * 97, j) * strands)) % strands]!;
      const to = {
        x: pick.x + arcNoise(castSeed, s * 31 + j) * 1.5,
        y: ARC_BODY_Y,
        z: pick.z + arcNoise(castSeed ^ 7, s * 31 + j) * 1.5,
      };
      out.push({ atMs: startMs + tick * TICK_MS, from, to, seed: castSeed + s * 1000 + j });
      from = to;
    }
  }
  out.sort((a, b) => a.atMs - b.atMs);
  return out;
}

function pct(v: number, total: number): string {
  return total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "-";
}

function heapMB(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

interface PhaseResult {
  label: string;
  frames: number;
  bolts: number;
  evtMs: number;
  arcUpdMs: number;
  composerMs: number;
  renderMs: number;
  gcMs: number;
  heapGrowMB: number;
  maxFrameMs: number;
  drawnStrips: number;
  reshapes: number;
  poolSize: number;
  materials: number;
  particleSystems: number;
  peakParticles: number;
}

function runPhase(
  label: string,
  casts: { startMs: number; seed: number }[],
  durationMs: number,
  opts: { pops?: boolean; forksOverride?: number } = {},
): PhaseResult {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("cam", new Vector3(0, 14, -10), scene);
  const arcs = new ArcBoltFx(scene);
  // ⭐ 1×1 RawTexture,⛔ 不是 () => null:ParticleSystem.isReady() 要 texture
  //   ready 才會跑 animate() —— null 會讓粒子 CPU 模擬整段被跳過(量到 0 顆)。
  const composer = new ImpactComposer(scene, {
    createTexture: () =>
      new RawTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, Engine.TEXTUREFORMAT_RGBA, scene, false, false),
  });
  const bolts = casts.flatMap((c) => scheduleCast(c.startMs, c.seed)).sort((a, b) => a.atMs - b.atMs);

  // 監看 reshape 次數（觀測接縫:包 strike/update 外側量不到,從 poolSize 反推不了）
  let reshapes = 0;
  const anyArcs = arcs as unknown as { reshape: (s: unknown, step: number) => void };
  const origReshape = anyArcs.reshape.bind(arcs);
  anyArcs.reshape = (s: unknown, step: number) => {
    reshapes++;
    origReshape(s, step);
  };

  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  const heap0 = heapMB();

  let evtMs = 0;
  let arcUpdMs = 0;
  let composerMs = 0;
  let renderMs = 0;
  let boltCount = 0;
  let drawnStrips = 0;
  let maxFrameMs = 0;
  let peakParticles = 0;
  let bi = 0;
  const frames = Math.ceil(durationMs / FRAME_MS);
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) {
    const nowMs = f * FRAME_MS;
    const f0 = performance.now();
    // ── ① 事件消費（case "chainLightning" 的形狀,逐字對照）────────────────
    while (bi < bolts.length && bolts[bi]!.atMs <= nowMs) {
      const b = bolts[bi++]!;
      boltCount++;
      const spec = arcBoltSpec(ARC_TINTS.lightning, {
        seed: b.seed,
        ...(opts.forksOverride !== undefined ? { forks: opts.forksOverride } : {}),
      });
      drawnStrips += arcs.strike(b.from, b.to, spec, nowMs, b.seed);
      if (opts.pops !== false) {
        // layeredPop → HitSpark:composer.fire + impactRecipe(第二次,ctor 裡那份)
        composer.fire("light", b.to.x, b.to.z, nowMs, {
          tint: ARC_TINTS.lightning,
          y: ARC_BODY_Y,
          scale: 1,
        });
        impactRecipe("light", ARC_TINTS.lightning);
      }
    }
    const f1 = performance.now();
    arcs.update(nowMs);
    const f2 = performance.now();
    composer.update(nowMs);
    const f3 = performance.now();
    scene.render();
    const f4 = performance.now();
    evtMs += f1 - f0;
    arcUpdMs += f2 - f1;
    composerMs += f3 - f2;
    renderMs += f4 - f3;
    maxFrameMs = Math.max(maxFrameMs, f4 - f0);
    if (f % 6 === 0) {
      let alive = 0;
      for (const ps of scene.particleSystems) alive += (ps as { particles?: unknown[] }).particles?.length ?? 0;
      peakParticles = Math.max(peakParticles, alive);
    }
  }
  const total = performance.now() - t0;
  const heap1 = heapMB();
  const res: PhaseResult = {
    label,
    frames,
    bolts: boltCount,
    evtMs,
    arcUpdMs,
    composerMs,
    renderMs,
    gcMs: total - evtMs - arcUpdMs - composerMs - renderMs,
    heapGrowMB: heap1 - heap0,
    maxFrameMs,
    drawnStrips,
    reshapes,
    poolSize: arcs.poolSize,
    materials: scene.materials.length,
    particleSystems: scene.particleSystems.length,
    peakParticles,
  };
  arcs.dispose();
  composer.dispose();
  scene.dispose();
  engine.dispose();
  return res;
}

function report(r: PhaseResult): void {
  const perFrame = (r.evtMs + r.arcUpdMs + r.composerMs + r.renderMs) / r.frames;
  console.log(
    `\n■ ${r.label}\n` +
      `  frames=${r.frames} bolts=${r.bolts} strips=${r.drawnStrips} reshapes=${r.reshapes}` +
      ` pool=${r.poolSize} materials=${r.materials} particleSystems=${r.particleSystems} peakParticles=${r.peakParticles}\n` +
      `  每幀合計 ${perFrame.toFixed(3)} ms | 尖峰單幀 ${r.maxFrameMs.toFixed(2)} ms | heap +${r.heapGrowMB.toFixed(1)} MB\n` +
      `  事件消費 ${r.evtMs.toFixed(1)} ms (${pct(r.evtMs, r.evtMs + r.arcUpdMs + r.composerMs + r.renderMs)})` +
      ` | arcs.update ${r.arcUpdMs.toFixed(1)} ms | composer.update ${r.composerMs.toFixed(1)} ms` +
      ` | scene.render ${r.renderMs.toFixed(1)} ms`,
  );
}

// ── microbench:單元成本 ────────────────────────────────────────────────────
function micro(label: string, n: number, fn: (i: number) => void): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  const h0 = heapMB();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  const ms = performance.now() - t0;
  const h1 = heapMB();
  console.log(
    `  · ${label}: ${((ms / n) * 1000).toFixed(2)} µs/次 (${n} 次共 ${ms.toFixed(1)} ms, heap +${(
      h1 - h0
    ).toFixed(1)} MB)`,
  );
}

console.log("═══ #781 閃電效能 profile（NullEngine / CPU-only）═══");
console.log("Node", process.version, "| gc exposed:", typeof (globalThis as { gc?: unknown }).gc);

console.log("\n── 單元成本（純 JS,無 Babylon 呼叫的部分標明）──");
micro("arcBoltSpec(tint,{seed})（含 hotToCoolStops）", 20000, (i) => arcBoltSpec(ARC_TINTS.lightning, { seed: i }));
micro("impactRecipe('light')（layeredPop 每 hop ×2）", 20000, () => impactRecipe("light", ARC_TINTS.lightning));
const specForGeom = arcBoltSpec(ARC_TINTS.lightning);
micro("buildArcPath+arcStripPaths（一條 8 段折線）", 20000, (i) => {
  const pts = buildArcPath({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 3 }, specForGeom, i);
  arcStripPaths(pts, specForGeom.halfWidth);
});

// baseline:空場景 render 底噪
report(runPhase("底噪:空場景 3 秒(無閃電)", [], 3000));

// 一次天譴（含 pop）
report(runPhase("一次 65-04 天譴(含每 hop layeredPop)", [{ startMs: 100, seed: 42 }], 3600));

// 一次天譴,拆帳:只有弧(不放 pop)
report(runPhase("一次天譴 · 只有電弧(pop 關)", [{ startMs: 100, seed: 42 }], 3600, { pops: false }));

// 一次天譴,拆帳:弧 forks=0
report(
  runPhase("一次天譴 · 電弧 forks=0(pop 關)", [{ startMs: 100, seed: 42 }], 3600, {
    pops: false,
    forksOverride: 0,
  }),
);

// 三人同場:三次天譴錯開 0.3s(owner 場景的上界模型)
report(
  runPhase(
    "三發天譴錯開 0.3s(三閃電人同場的上界)",
    [
      { startMs: 100, seed: 42 },
      { startMs: 400, seed: 43 },
      { startMs: 700, seed: 44 },
    ],
    4200,
  ),
);

console.log("\n⚠️ NullEngine 量不到:GPU fill-rate(32 條加法混合 ribbon 的 overdraw)、真瀏覽器 GC 節奏。");
