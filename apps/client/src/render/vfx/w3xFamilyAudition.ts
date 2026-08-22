/**
 * w3xFamilyAudition — the scene behind `public/w3x-family-audition.html`.
 *
 * CONDITION 3 OF THE BAR ("你真的試玩過適合"), for the three families the owner
 * named by name. The sibling page `w3x-emitter-audition.html` proves the
 * PARAMETER MAPPING with hand-transcribed fixtures. This page proves the
 * SHIPPED CONTENT: every number on screen is fetched over HTTP from
 * `content/vfx/`, exactly as a match fetches it —
 *
 *   GET /content/assets/vfx/w3x-families.json  the composite (pivots, attach, swarm)
 *   GET /content/vfx/fx.w3x.*.json          the generated vfx@1 docs
 *     → `familyEffectToSpec`                (pure bridge, this lane)
 *     → `W3xEmitterRig.play`                (budget → toParticleSystem → Babylon)
 *
 * Nothing is transcribed into this file. If the generator is wrong, this page
 * is wrong in the same way — which is the point of auditioning the artefact
 * instead of a copy of it.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Particles/particleSystemComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import type { VfxDoc } from "@ggd/shared/content";

import { W3xEmitterRig, type W3xEffectHandle } from "./W3xEmitterRig";
import { championStandIn } from "./w3xEmitterAudition";
import {
  W3X_FAMILY_LABEL,
  distinctPivotCount,
  type W3xFamily,
  type W3xFamilyEffect,
  type W3xFamilyManifest,
} from "./w3xFamilies";
import { familyEffectToSpec, swarmCountForLevel } from "./w3xFamilyRuntime";

const CONTENT = "/content/";

export interface FamilyAuditionStats {
  fps: number;
  effects: number;
  systems: number;
  pooled: number;
  totalSystems: number;
  aliveParticles: number;
  plan: {
    systemsBeforeMerge: number;
    systemsAfterMerge: number;
    kept: number;
    dropped: number;
    particles: number;
    faithful: boolean;
  } | null;
  attach: string | null;
  problems: string[];
}

export interface FamilyAuditionHandle {
  /** the manifest as shipped — the page renders its own UI from this */
  manifest(): W3xFamilyManifest | null;
  play(effectId: string, champions: number, opts?: { memberDocId?: string; level?: number }): Promise<void>;
  stopAll(): void;
  /** deterministic frame stepping for headless capture (see the sibling page) */
  step(frames: number, stepMs?: number): void;
  /** camera framing — an effect whose particles are 12× a champion needs pulling back */
  setView(opts: { radius?: number; alpha?: number; beta?: number; targetY?: number }): void;
  /**
   * Measured, not asserted: the world-space extent and particle size actually
   * on screen right now, against the 1.58-unit champion stand-in. This is the
   * number behind "the particle is bigger than the champion" — read off the
   * live scene rather than recomputed from the doc.
   */
  measure(): {
    /** champion stand-in height, the yardstick */
    championHeight: number;
    alive: number;
    /** largest live particle diameter, world units */
    maxParticleSize: number;
    /** median live particle diameter — maxima are often one flash sprite */
    medianParticleSize: number;
    /** AABB of live particle centres */
    extent: { x: number; y: number; z: number };
    centre: { x: number; y: number; z: number };
  };
  stats(): FamilyAuditionStats;
  /** per-system diagnostics — the "started, ready, textured and emitting NOTHING" check */
  debug(): {
    name: string;
    started: boolean;
    ready: boolean;
    rate: number;
    alive: number;
    /** pool size the factory sized from the doc — the "why is it capped" check */
    capacity: number;
    manual: number;
    textured: boolean;
    pos: [number, number, number];
  }[];
  dispose(): void;
}

/** Everything the page needs to describe an effect, derived not transcribed. */
export function describeEffect(effect: W3xFamilyEffect): string[] {
  const out = [
    `${W3X_FAMILY_LABEL[effect.family]} · ${effect.source.model} · PRE2 ×${effect.layers.length}` +
      (effect.ribbonDocIds.length ? ` + RIBB ×${effect.ribbonDocIds.length}` : ""),
    `mdx ${effect.source.mdxBytes.toLocaleString()} B → glb ` +
      `${effect.source.glbBytes === null ? "（未轉檔）" : `${effect.source.glbBytes.toLocaleString()} B`}` +
      ` · ${effect.source.geosets} geoset / ${effect.source.triangles} tri · ${effect.source.assetClass}`,
    `附著點 ${effect.attach ?? "（物件資料未指定 → WC3 靜默 fallback 到 origin）"}` +
      ` · ${effect.ambient ? "常駐（球體 / buff 美術）" : "一次性"}` +
      ` · 不同 PIVOT 位置 ${distinctPivotCount(effect)} 處`,
  ];
  if (effect.usedBy.length) {
    out.push(
      "被引用：" +
        effect.usedBy.map((u) => `${u.objectId}(${u.baseId}) ${u.field}`).join("、"),
    );
  } else {
    out.push("被引用：無（地圖裡沒有任何物件用它 — 死 import，保留為紀錄）");
  }
  if (effect.swarm) {
    const s = effect.swarm;
    out.push(
      `蝗蟲群佈局（全部讀自 war3map.w3a / w3u）：每級 ${s.countPerLevel.join(" / ")} 隻 · ` +
        `間隔 ${s.spawnIntervalSec}s · 半徑 ${s.radiusWc3} WC3 = ${s.radiusWorld} 世界單位 · ` +
        `持續 ${s.durationSec}s · 成員 usca ${s.memberScale} · 頂點染色 rgb(${s.memberTint.join(",")})`,
    );
  }
  const substituted = effect.layers.filter((l) => l.textureSubstituted).length;
  if (substituted) {
    out.push(
      `貼圖：${substituted}/${effect.layers.length} 層是 CC0 代用圖（原圖在 war3.mpq 裡，見 #81/#116）。` +
        `原始路徑逐層記錄在 wc3Texture。幾何、時序、顏色、Alpha 是忠實的；顏色以外的「材質長相」不是。`,
    );
  }
  return out;
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
  return (await r.json()) as T;
}

export function startW3xFamilyAudition(canvas: HTMLCanvasElement): FamilyAuditionHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.027, 0.031, 0.047, 1);

  const camera = new ArcRotateCamera("cam", -Math.PI / 2, 1.02, 9, new Vector3(0, 1.0, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 2.5;
  camera.upperRadiusLimit = 40;
  camera.wheelDeltaPercentage = 0.02;

  const light = new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 0.75;

  const ground = CreateGround("ground", { width: 60, height: 60 }, scene);
  const gmat = new StandardMaterial("gmat", scene);
  gmat.diffuseColor = new Color3(0.07, 0.08, 0.11);
  gmat.specularColor = Color3.Black();
  ground.material = gmat;

  const rig = new W3xEmitterRig(scene, {
    resolveTextureUrl: (p) => CONTENT + p,
    // ⏳ GH#570 —— 試演頁**明著**繞過三秒兜底（它的用途就是把一支效果放著看完）。
    hardCapSec: Infinity,
  });

  const champions: TransformNode[] = [];
  const handles: W3xEffectHandle[] = [];
  let manifest: W3xFamilyManifest | null = null;
  const docCache = new Map<string, VfxDoc>();
  let problems: string[] = [];
  let lastAttach: string | null = null;

  void fetchJson<W3xFamilyManifest>(`${CONTENT}assets/vfx/w3x-families.json`).then((m) => {
    manifest = m;
  });

  function ensureChampions(n: number): void {
    while (champions.length < n) {
      const i = champions.length;
      // a ring of stand-ins, so a 12-champion worst case is all on screen
      const a = (i / 12) * Math.PI * 2;
      const r = i === 0 ? 0 : 3.4 + Math.floor(i / 12) * 3;
      champions.push(championStandIn(scene, i, Math.cos(a) * r, Math.sin(a) * r));
    }
    for (let i = 0; i < champions.length; i++) champions[i]!.setEnabled(i < n);
  }

  async function loadDocs(ids: readonly string[]): Promise<void> {
    await Promise.all(
      ids
        .filter((id) => !docCache.has(id))
        .map(async (id) => {
          docCache.set(id, await fetchJson<VfxDoc>(`${CONTENT}vfx/${id}.json`));
        }),
    );
  }

  function stopAll(): void {
    for (const h of handles) h.cancel();
    handles.length = 0;
  }

  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min(now - last, 100);
    last = now;
    rig.tick(dt);
    scene.render();
  });
  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    manifest: () => manifest,
    async play(effectId, count, opts) {
      stopAll();
      problems = [];
      const m = manifest;
      if (!m) {
        problems.push("_w3x-families.json 還沒載入完成");
        return;
      }
      const effect = m.effects.find((e) => e.id === effectId);
      if (!effect) {
        problems.push(`manifest 裡沒有 ${effectId}`);
        return;
      }
      const wanted = effect.layers.map((l) => l.docId);
      if (opts?.memberDocId) wanted.push(opts.memberDocId);
      await loadDocs(wanted);

      const { spec, missingDocIds, problems: p } = familyEffectToSpec(effect, docCache, {
        ...(opts?.level !== undefined ? { level: opts.level } : {}),
        ...(opts?.memberDocId ? { memberDocId: opts.memberDocId } : {}),
      });
      problems = [...p, ...missingDocIds.map((id) => `缺少 doc：${id}`)];
      if (!spec) return;

      ensureChampions(count);
      for (let i = 0; i < count; i++) {
        const h = rig.play(spec, { kind: "node", root: champions[i]! });
        handles.push(h);
        lastAttach = h.attach
          ? `${effect.attach} → ${h.attach.node ?? "（未命中，落在 root）"}` +
            ` · matched=${h.attach.matched}${h.attach.exact ? "（精確）" : "（fallback）"} · ${h.attach.reason}`
          : null;
      }
    },
    stopAll,
    step(frames, stepMs = 1000 / 60) {
      // `rig.tick` pins the RIG's clock, but Babylon's particle integrator
      // advances by `scene.getAnimationRatio()`, which is derived from the
      // engine's WALL-CLOCK delta. Under a software rasteriser a frame can take
      // 200 ms, so without this the captured "t = 500 ms" frame is really
      // several seconds of particle motion and every measured extent is wrong.
      // Pin the animation clock for the duration of the stepping.
      const prevConst = scene.useConstantAnimationDeltaTime;
      scene.useConstantAnimationDeltaTime = true;
      try {
        for (let i = 0; i < frames; i++) {
          rig.tick(stepMs);
          scene.render();
        }
      } finally {
        scene.useConstantAnimationDeltaTime = prevConst;
      }
    },
    setView({ radius, alpha, beta, targetY }) {
      if (radius !== undefined) camera.radius = radius;
      if (alpha !== undefined) camera.alpha = alpha;
      if (beta !== undefined) camera.beta = beta;
      if (targetY !== undefined) camera.setTarget(new Vector3(0, targetY, 0));
    },
    measure() {
      const sizes: number[] = [];
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const ps of scene.particleSystems) {
        const live = (ps as unknown as { particles?: { position: Vector3; size: number }[] }).particles;
        if (!live?.length) continue;
        // a local-space system stores particle positions relative to its emitter
        const e = ps.emitter as { getAbsolutePosition?: () => Vector3 } | Vector3;
        const base =
          (ps as unknown as { isLocal?: boolean }).isLocal === true
            ? (typeof (e as { getAbsolutePosition?: unknown }).getAbsolutePosition === "function"
                ? (e as { getAbsolutePosition: () => Vector3 }).getAbsolutePosition()
                : (e as Vector3))
            : new Vector3(0, 0, 0);
        for (const p of live) {
          sizes.push(p.size);
          const x = p.position.x + base.x, y = p.position.y + base.y, z = p.position.z + base.z;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
      }
      sizes.sort((a, b) => a - b);
      const fin = (n: number): number => (Number.isFinite(n) ? n : 0);
      return {
        championHeight: 1.58,
        alive: sizes.length,
        maxParticleSize: sizes.length ? sizes[sizes.length - 1]! : 0,
        medianParticleSize: sizes.length ? sizes[Math.floor(sizes.length / 2)]! : 0,
        extent: {
          x: fin(maxX - minX), y: fin(maxY - minY), z: fin(maxZ - minZ),
        },
        centre: {
          x: fin((maxX + minX) / 2), y: fin((maxY + minY) / 2), z: fin((maxZ + minZ) / 2),
        },
      };
    },
    stats() {
      const plan = handles[0]?.plan ?? null;
      return {
        fps: Math.round(engine.getFps()),
        effects: rig.effectCount,
        systems: rig.systemCount,
        pooled: rig.pooledCount,
        totalSystems: rig.totalSystems,
        // "is anything ACTUALLY drawing" — the check that caught the pooled
        // `manualEmitCount` bug, where every system was started, ready and
        // textured at rate 600 and emitting exactly zero particles forever.
        aliveParticles: scene.particleSystems.reduce(
          (n, ps) =>
            n + ((ps as unknown as { particles?: unknown[] }).particles?.length ?? ps.getActiveCount()),
          0,
        ),
        plan: plan
          ? {
              systemsBeforeMerge: plan.systemsBeforeMerge,
              systemsAfterMerge: plan.systemsAfterMerge,
              kept: plan.emitters.length,
              dropped: plan.dropped.length,
              particles: plan.particles,
              faithful: plan.faithful,
            }
          : null,
        attach: lastAttach,
        problems,
      };
    },
    debug() {
      return scene.particleSystems.map((ps) => {
        const e = ps.emitter as { getAbsolutePosition?: () => { x: number; y: number; z: number } };
        const p = e?.getAbsolutePosition?.() ?? { x: NaN, y: NaN, z: NaN };
        return {
          name: ps.name,
          started: ps.isStarted(),
          ready: ps.isReady(),
          rate: ps.emitRate,
          alive:
            (ps as unknown as { particles?: unknown[] }).particles?.length ?? ps.getActiveCount(),
          capacity: (ps as unknown as { getCapacity(): number }).getCapacity(),
          manual: ps.manualEmitCount,
          textured: ps.particleTexture?.isReady() ?? false,
          pos: [p.x, p.y, p.z] as [number, number, number],
        };
      });
    },
    dispose() {
      window.removeEventListener("resize", onResize);
      stopAll();
      rig.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}

/** Re-exported so the page can label the level buttons without duplicating them. */
export { swarmCountForLevel };

/** Re-exported so the page can label the family tabs without duplicating them. */
export { W3X_FAMILY_LABEL };
export type { W3xFamily, W3xFamilyEffect, W3xFamilyManifest };
