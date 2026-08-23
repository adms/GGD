/** 暫存探針 —— 量 7 回合逐類別殘留。⛔ 不入版控。 */
import { describe, it, expect, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
vi.mock("./QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { VfxDoc } from "@ggd/shared/content";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { createRoundFx, type RoundFx } from "./roundFxRegistry";
import { RoundVfxLifecycle } from "./roundVfxLifecycle";

const doc = (id: string, mode: "burst" | "continuous"): VfxDoc =>
  ({
    id, schema: "vfx@1", emitter: { shape: "point" },
    lifetimeSec: { min: 0.2, max: 0.5 }, size: { start: 0.4, end: 0.1 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] }, blendMode: "additive",
    ...(mode === "burst" ? { mode, burstCount: 8 } : { mode, rate: 30 }),
  }) as VfxDoc;

const makeFx = (scene: Scene): RoundFx =>
  createRoundFx(scene, {
    vfx: {
      entityPos: (id) => ({ x: id % 7, z: id % 5 }),
      vfxDoc: (key) => doc(key, "burst"),
      modelDocFor: (k) => ({ glbPath: `${k}.glb` }),
      loadModelContainer: async () => null,
    },
    ambient: {
      bindingsFor: (key) => [{ vfx: `amb.${key}` }],
      vfxDocFor: (id) => (/^(amb|pv)\./.test(id) ? doc(id, "continuous") : null),
      ribbonDocFor: () => null,
    },
    ambientToggleMask: () => 0,
    fireRing: { vfxDocFor: () => null },
    whirlwind: { createTexture: () => null },
  });

function playRound(scene: Scene, fx: RoundFx, round: number, startMs: number): number {
  let now = startMs;
  const roots = new Map<number, TransformNode>();
  for (let h = 0; h < 6; h++) roots.set(h, new TransformNode(`hero-r${round}-${h}`, scene));
  for (let i = 0; i < 90; i++) {
    const ev = (type: string, data: unknown): void =>
      fx.vfx.handleEvent({ tick: i, type, data } as unknown as EventMessage, now);
    ev("vfxSpawn", { x: i % 7, z: i % 5, vfxId: `fx.r${round}-a${i % 12}` });
    ev("hitImpact", { source: 100 + i, target: 200 + i, amount: 120, x: i % 9, z: (i * 3) % 9 });
    ev("modelFxSpawn", {
      caster: i % 6, modelKey: `mfx.r${round}-${i % 3}`, path: "radial", speed: 12,
      x: i % 7, z: i % 5, zone: 0,
      instances: [
        { x: i % 7, z: i % 5, dx: 1, dz: 0, dist: 6, durationSec: 0.5 },
        { x: i % 7, z: i % 5, dx: -1, dz: 0, dist: 6, durationSec: 0.5 },
      ],
    });
    for (const [id, root] of roots) fx.ambient.attach(id, `model-r${round}`, root, [`pv.${round}`]);
    fx.ambient.tick(now, 16);
    fx.ambient.sweep(new Set(roots.keys()));
    fx.vfx.update((now += 16));
  }
  fx.vfx.update((now += 30_000));
  fx.ambient.sweep(new Set<number>());
  for (const r of roots.values()) r.dispose(false, true);
  return now;
}

const pfx = (n: string): string => (/^[A-Za-z0-9]+/.exec(n.replace(/^[_\s]+/, "")) ?? ["?"])[0]!.toLowerCase().slice(0, 20);

function census(scene: Scene): Record<string, number> {
  const out: Record<string, number> = {};
  const bump = (k: string): void => { out[k] = (out[k] ?? 0) + 1; };
  for (const m of scene.meshes) bump(`mesh:${pfx(m.name)}`);
  for (const m of scene.materials) bump(`mat:${pfx(m.name)}`);
  for (const t of scene.textures) bump(`tex:${pfx(t.name)}`);
  for (const p of scene.particleSystems) bump(`ps:${pfx(p.name)}`);
  for (const n of scene.transformNodes) bump(`node:${pfx(n.name)}`);
  for (const g of scene.geometries) bump(`geo:${pfx(g.id ?? "?")}`);
  bump.length;
  return out;
}

describe("probe", () => {
  it("7 rounds census", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fx = makeFx(scene);
    const life = new RoundVfxLifecycle(fx.registry);
    let now = 1000;
    const rows: Record<string, number>[] = [];
    for (let round = 1; round <= 7; round++) {
      life.sync("combat");
      now = playRound(scene, fx, round, now);
      life.sync("resolution");
      rows.push(census(scene));
    }
    const kinds = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
    const lines = ["kind\t" + rows.map((_, i) => `R${i + 1}`).join("\t")];
    for (const k of kinds) lines.push(k + "\t" + rows.map((r) => r[k] ?? 0).join("\t"));
    console.log("\n@@CENSUS@@\n" + lines.join("\n") + "\n@@END@@");
    scene.dispose(); engine.dispose();
    expect(rows.length).toBe(7);
  }, 300000);
});

// ── probe 2: EntityViewRegistry（英雄身體 + tint clone）+ ArenaScene（每回合換圖）
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { AssetManager } from "./AssetManager";
import { arenaDefFromDoc } from "@ggd/shared/sim/world/ArenaDef";
import type { ArenaDoc } from "@ggd/shared/content";
import { buildArena, disposeArena } from "./ArenaScene";

const pose = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x, z: e.z, fx: e.fx, fz: e.fz,
});
function body2(id: number, flags: number): EntityViewState {
  return { id, kind: 0, seatId: 0, key: "champ.sela", teamId: 1, x: 0, z: 0, fx: 1, fz: 0, alive: true, flags };
}

describe("probe2", () => {
  it("7 rounds: entity views + arena swap", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const reg = new EntityViewRegistry(scene, new AssetManager(scene));
    (reg as unknown as { content: { championTintFor?: () => null } }).content.championTintFor = () => null;
    const dir = fileURLToPath(new URL("../../../../content/arenas/", import.meta.url));
    const docs = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as ArenaDoc)
      .filter((d) => (d as { schema?: string }).schema?.startsWith("arena"));
    const rows: Record<string, number>[] = [];
    let now = 0;
    for (let round = 1; round <= 20; round++) {
      const doc = docs[(round - 1) % docs.length]!;
      const h = buildArena(scene, arenaDefFromDoc(doc), (doc as { groundStyle?: string }).groundStyle);
      const ids = Array.from({ length: 10 }, (_, i) => round * 1000 + i);
      for (const flags of [0, ENTITY_FLAG.MUD_SWELL, ENTITY_FLAG.MUD_BOSS]) {
        reg.sync({ entities: ids.map((id) => body2(id, flags)), poseFor: pose, nowMs: now, dtMs: 16, loadModels: false });
        now += 16;
      }
      reg.sync({ entities: [], poseFor: pose, nowMs: now, dtMs: 16, loadModels: false });
      now += 16;
      disposeArena(scene, h);
      rows.push(census(scene));
    }
    const kinds = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
    const lines = ["kind\t" + rows.map((_, i) => `R${i + 1}`).join("\t")];
    for (const k of kinds) lines.push(k + "\t" + rows.map((r) => r[k] ?? 0).join("\t"));
    console.log("\n@@CENSUS2@@\n" + lines.join("\n") + "\n@@END2@@");
    console.log("@@TEXNAMES@@ " + JSON.stringify(scene.textures.map((t) => `${t.getClassName()}|${t.name}|${(t as unknown as {uniqueId:number}).uniqueId}`)));
    reg.dispose(); scene.dispose(); engine.dispose();
    expect(rows.length).toBe(20);
  }, 300000);
});
