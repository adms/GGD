import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
vi.mock("./QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { VfxDoc } from "@ggd/shared/content";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { createRoundFx, type RoundFx } from "../render/roundFxRegistry";
import { RoundVfxLifecycle } from "../render/roundVfxLifecycle";

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

const FIXED_KEYS = process.env.FIXED_KEYS === "1";

function doc(id: string, mode: "burst" | "continuous"): VfxDoc {
  return {
    id,
    schema: "vfx@1",
    emitter: { shape: "point" },
    lifetimeSec: { min: 0.2, max: 0.5 },
    size: { start: 0.4, end: 0.1 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
    ...(mode === "burst" ? { mode, burstCount: 8 } : { mode, rate: 30 }),
  } as VfxDoc;
}

function makeFx(): RoundFx {
  return createRoundFx(scene, {
    vfx: {
      entityPos: (id) => ({ x: id % 7, z: id % 5 }),
      vfxDoc: (key) => doc(key, "burst"),
      localEntityId: () => 1,
      teamOf: () => 0,
      modelDocFor: (k) => ({ glbPath: `${k}.glb`, scale: 1 }),
      loadModelContainer: async () => null,
      castProgress: () => null,
    },
    ambient: {
      bindingsFor: (key) => [{ vfx: `amb.${key}` }],
      vfxDocFor: (id) =>
        id.startsWith("amb.") || id.startsWith("pv.") ? doc(id, "continuous") : null,
      ribbonDocFor: () => null,
    },
    fireRing: { vfxDocFor: () => null },
    victory: { cameraFor: () => null },
    whirlwind: { createTexture: () => null },
  });
}

function counts(fx: RoundFx): Record<string, number> {
  const named = (p: string): number =>
    scene.transformNodes.filter((n) => n.name.startsWith(p)).length;
  return {
    ps: scene.particleSystems.length,
    meshes: scene.meshes.length,
    mats: scene.materials.length,
    tex: scene.textures.length,
    tnodes: scene.transformNodes.length,
    modelfx: named("modelfx-"),
    ftLive: fx.vfx.floatingTextEntries.filter((e) => (e as { active: boolean }).active).length,
    nodes: scene.getNodes().length,
    obsBefore: scene.onBeforeRenderObservable.observers.length,
    obsAfter: scene.onAfterRenderObservable.observers.length,
    anims: scene.animationGroups.length,
    amb: named("amb-") + scene.meshes.filter((m) => m.name.includes("emit")).length,
  };
}

/** 一個回合：每幀都跑 GameApp 會跑的那一套。 */
const peak: Record<string, number>[] = [];
function playRound(fx: RoundFx, round: number, startMs: number, heroes = 8): number {
  let now = startMs;
  const roots = new Map<number, TransformNode>();
  for (let h = 0; h < heroes; h++) roots.set(h, new TransformNode(`hero-r${round}-${h}`, scene));
  for (let f = 0; f < 120; f++) {
    const i = f;
    fx.vfx.handleEvent(
      { tick: i, type: "vfxSpawn", data: { x: i % 7, z: i % 5, vfxId: `fx.r${round}-a${i % 12}` } } as unknown as EventMessage,
      now,
    );
    fx.vfx.handleEvent(
      { tick: i, type: "hitImpact", data: { source: 100 + i, target: 200 + i, amount: 120, x: i % 9, z: (i * 3) % 9 } } as unknown as EventMessage,
      now,
    );
    fx.vfx.handleEvent(
      {
        tick: i,
        type: "modelFxSpawn",
        data: {
          caster: i % heroes,
          target: (i + 1) % heroes,
          spec: { modelKey: FIXED_KEYS ? `mfx.k${i % 3}` : `mfx.r${round}-${i % 3}`, motion: "line", speed: 12, count: 2 },
        },
      } as unknown as EventMessage,
      now,
    );
    fx.vfx.handleEvent(
      { tick: i, type: "screenFlash", data: { caster: 1, spec: { applyTo: "self", colorRgb: [255, 0, 0], peakAlpha: 0.4, durationMs: 200 } } } as unknown as EventMessage,
      now,
    );
    fx.vfx.handleEvent(
      { tick: i, type: "floatingText", data: { at: i % heroes, text: `${i}Hit` } } as unknown as EventMessage,
      now,
    );
    fx.vfx.handleEvent(
      { tick: i, type: "vfxArc", data: { fromX: 0, fromZ: 0, toX: i % 9, toZ: (i * 2) % 9 } } as unknown as EventMessage,
      now,
    );
    // GameApp.syncAmbient：**每幀**、而且 extras 是**新陣列**
    for (const [id, root] of roots) {
      fx.ambient.attach(id, `model-r${round}`, root, [`pv.a${round}`, `pv.b`]);
    }
    fx.ambient.tick(now, 16);
    fx.ambient.sweep(new Set(roots.keys()));
    now += 16;
    fx.vfx.update(now);
  }
  peak.push({ ...counts(fx) });
  fx.fireRing.tick(now, 16, { phase: "combat", fireRingTicks: 10, fireRingRadius: 4, zone: { x: 0, z: 0, r: 10 } });
  fx.victoryFx.playRoundVolley(now, round);
  // 商店時間
  now += 30_000;
  fx.vfx.update(now);
  // 英雄下場
  fx.ambient.sweep(new Set<number>());
  for (const r of roots.values()) r.dispose(false, true);
  return now;
}

describe("PROBE", () => {
  it("多回合成長", () => {
    const fx = makeFx();
    const life = new RoundVfxLifecycle(fx.registry);
    let now = 1000;
    const rows: Record<string, number>[] = [];
    for (let r = 1; r <= 8; r++) {
      life.sync("combat");
      now = playRound(fx, r, now);
      life.sync("resolution");
      rows.push({ round: r, ...counts(fx) });
    }
    // eslint-disable-next-line no-console
    console.log("AFTER", JSON.stringify(rows));
    // eslint-disable-next-line no-console
    console.log("PEAK", JSON.stringify(peak));
    expect(rows.length).toBe(8);
  });
});
