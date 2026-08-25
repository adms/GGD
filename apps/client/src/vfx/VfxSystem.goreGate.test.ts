/**
 * ⭐ GH#702 —— **gore 開關真的關得掉那蓬血**（A/B，量活粒子）。
 *
 * ⛔ 在這之前 `config.gore@1.style` 只閘 `hitImpact` 那條血路，⛔ 不閘
 * `spawnVfx` ⇒ 幻之匕首選「無血」照樣噴 —— 而 GH#696 的驗收帳本裡**登記了
 * 那格開關當 rollback**，於是帳本寫著一個假的 rollback（第一·五守則）。
 *
 * ⛔ 這裡沒有任何手捏的 payload（失敗形態⑤）：效果來自**出貨的道具文件**、
 * 事件來自**真的 SimWorld/effectRunner**、文件是**出貨的那一份**、
 * 設定是**出貨的 `content/config/gore.json`**（只翻 `style` 那一格）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { VfxDoc } from "@ggd/shared/content";
import { zEffectDef } from "@ggd/shared/content/schema/effect";
import { zVfxDoc } from "@ggd/shared/content/schema/vfx";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectDef } from "@ggd/shared/sim/effects/effect";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { applyGoreDoc, resetGoreConfig, type GoreStyle } from "./goreConfig";

const shipped = (p: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), "utf8"));

/** 出貨的幻之匕首：3% 觸發的被動裡那條 `spawnVfx`（⛔ 不是我寫的效果）。 */
const ITEM = shipped("content/items/godie-i039.json") as {
  passive: { effects: { kind: string; vfxId?: string }[] }[];
};
const SPAWN = ITEM.passive[0]!.effects.find((e) => e.kind === "spawnVfx")!;
const VFX_ID = SPAWN.vfxId!;
/** 出貨的血花文件，走**真的 Zod** ⇒ 「`gore` 這一格 schema 收得下」也被驗到。 */
const DOC = zVfxDoc.parse(shipped(`content/vfx/${VFX_ID}.json`)) as VfxDoc;
const GORE_CFG = shipped("content/config/gore.json") as Record<string, unknown>;

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
  resetGoreConfig();
});
beforeEach(() => resetGoreConfig());

/** 真的 Zod → 真的 SimWorld → 真的 effectRunner ⇒ 一場真比賽收到的那一則。 */
function shippedEvent(): EventMessage {
  const world = new SimWorld(SKELETON_ARENA, 42);
  const caster = world.spawn();
  const victim = world.spawn();
  for (const [id, x] of [[caster, 2], [victim, 6]] as const) {
    world.transform.set(id, {
      pos: { x, z: 4 },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.5,
      zone: 0,
    });
  }
  runEffects([zEffectDef.parse(SPAWN) as EffectDef], {
    world,
    caster,
    rank: 1,
    targets: [victim],
    point: { x: 6, z: 4 },
    origin: "item:godie-i039",
    rng: world.rng,
  });
  const ev = world.events.find((e) => e.type === "vfxSpawn");
  expect(ev, "sim 沒有發出 vfxSpawn").toBeDefined();
  return { type: ev!.type, tick: 0, data: ev!.data } as unknown as EventMessage;
}

/** 這一則事件在指定 gore 風格下**生出幾顆粒子**（⛔ 不是「有沒有跑到某一行」）。 */
function liveParticles(style: GoreStyle): { born: number; systems: number } {
  applyGoreDoc({ ...GORE_CFG, style });
  const ctx: VfxContext = { entityPos: () => null, vfxDoc: (k) => (k === VFX_ID ? DOC : null) };
  const sys = new VfxSystem(scene, ctx);
  const before = new Set(scene.particleSystems);
  sys.handleEvent(shippedEvent(), 1_000);
  const made = scene.particleSystems.filter((p) => !before.has(p));
  return { born: made.reduce((n, p) => n + p.manualEmitCount, 0), systems: made.length };
}

describe("GH#702 gore 開關閘得到 spawnVfx 的血", () => {
  it("出貨的血花文件宣告 gore（否則這道閘無事可管）", () => {
    expect(DOC.gore).toBe(true);
  });

  it('style="blood" 照舊噴；style="off" ⇒ **零粒子、零系統**', () => {
    const blood = liveParticles("blood");
    expect(blood.born).toBeGreaterThan(0);

    const off = liveParticles("off");
    // ⛔ 連 HitSpark 退路都不可以補上 ——「無血」就是**畫面上什麼都沒多**
    expect(off).toEqual({ born: 0, systems: 0 });
  });

  it('style="stylized" 也關（一份 vfx@1 的紅是烘在文件裡的，播不出無紅版）', () => {
    expect(liveParticles("stylized")).toEqual({ born: 0, systems: 0 });
  });

  it("沒宣告 gore 的文件不受影響（這道閘⛔ 不是全域靜音）", () => {
    const plain = { ...DOC, id: `${DOC.id}.notgore`, gore: undefined } as VfxDoc;
    applyGoreDoc({ ...GORE_CFG, style: "off" });
    const sys = new VfxSystem(scene, { entityPos: () => null, vfxDoc: () => plain });
    expect(sys.play(plain, 1, 1, 1_000)).not.toBeNull();
  });
});
