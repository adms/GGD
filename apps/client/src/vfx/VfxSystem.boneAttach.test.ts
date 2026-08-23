/**
 * ⭐ GH#649/#565 —— `spawnVfx at:"bone"` 的**出貨鏈**守衛（一次性掛骨頭）。
 *
 * 原作 285 次 `AddSpecialEffectTarget` 的形狀是「一次性特效掛在**施法者模型的
 * 骨頭**上」。這條線橫跨三個包，而它每一段都是失敗形態⑧的獵場：
 *
 *   出貨 Zod（`at:"bone"` ⇔ `attach` 成對）
 *     → 真的 `SimWorld` 跑真的 effectRunner → 真的 `vfxSpawn` 事件
 *     → 出貨接縫（`MatchRoom`/`ReplayRoom` 把 `ev.data` **原樣**轉發，
 *        見 `apps/game-server/src/net/eventFanout.ts` 檔頭第 2 點）
 *     → 真的 `VfxSystem.handleEvent`
 *     → 讀回 Babylon 手上那顆發射器的**世界座標**
 *
 * ⛔ 這裡**沒有任何手捏的 payload**（失敗形態⑤）：每一則事件都是 sim 真的發出
 * 來的那一則。「客戶端讀 `attach`／`caster` 而 sim 從來沒送」正是 2026-08-23
 * 一天中五次的那個洞，而它對 grep 型守衛結構性失明。
 *
 * ⚠️ 三格退路**每一格都要畫**（差別只有落點）—— 替身骨架沒有對應骨的時候
 * 「不畫」比「畫錯位置」糟得多，所以第 2、3 格也各斷言一顆發射器真的生出來，
 * 並且各記一次 `console.warn`（⛔ 不吞）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { VfxDoc } from "@ggd/shared/content";
import { zEffectDef } from "@ggd/shared/content/schema/effect";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectDef } from "@ggd/shared/sim/effects/effect";
import { VfxSystem, ARC_BODY_Y, type VfxContext } from "./VfxSystem";

const VFX_ID = "fx.w3x.orb.herocloudkfksword.p00";
const DOC: VfxDoc = JSON.parse(
  readFileSync(fileURLToPath(new URL(`../../../../content/vfx/${VFX_ID}.json`, import.meta.url)), "utf8"),
) as VfxDoc;

/** 施法者在 sim 裡的腳下座標 —— 也就是事件會帶的 x/z（第 3 格退路的落點）。 */
const EV_X = 3;
const EV_Z = 7;
/** 客戶端這邊模型根節點的世界位置（刻意**不等於** sim 座標，才分得出誰贏）。 */
const MODEL = new Vector3(10, 0, 20);

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/**
 * 真的 Zod → 真的 SimWorld → 真的 effectRunner → 真的事件 → 出貨接縫。
 * 回傳值就是客戶端在一場真比賽裡收到的那一則（`ev.data` 原樣）。
 */
function shippedEvent(at: "self" | "bone", attach?: string): { msg: EventMessage; caster: number } {
  const parsed = zEffectDef.parse({
    kind: "spawnVfx",
    vfxId: VFX_ID,
    at,
    ...(attach !== undefined ? { attach } : {}),
  }) as EffectDef;
  const world = new SimWorld(SKELETON_ARENA, 42);
  const caster = world.spawn();
  world.transform.set(caster, {
    pos: { x: EV_X, z: EV_Z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  runEffects([parsed], {
    world,
    caster,
    rank: 1,
    targets: [],
    point: { x: -99, z: -99 },
    origin: "ability:test.bone",
    rng: world.rng,
  });
  const ev = world.events.find((e) => e.type === "vfxSpawn");
  expect(ev, "sim 沒有發出 vfxSpawn").toBeDefined();
  return { msg: { type: ev!.type, tick: 0, data: ev!.data } as unknown as EventMessage, caster };
}

/** 一個「有模型的施法者」：`champ-<id>` 根節點，外加零或一根骨。 */
function spawnModel(caster: number, bone: string | null): TransformNode {
  const root = new TransformNode(`champ-${caster}`, scene);
  root.position.copyFrom(MODEL);
  if (bone !== null) {
    const j = new TransformNode(bone, scene);
    j.parent = root;
    j.position.set(0.5, 1.6, 0.2);
  }
  root.computeWorldMatrix(true);
  return root;
}

/** 這一則事件在真的 VfxSystem 上跑完之後，發射器**世界座標**在哪。 */
function playAndReadBack(msg: EventMessage): { pos: Vector3; warns: number } {
  const ctx: VfxContext = { entityPos: () => null, vfxDoc: (k) => (k === VFX_ID ? DOC : null) };
  const sys = new VfxSystem(scene, ctx);
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const before = new Set(scene.particleSystems);
  sys.handleEvent(msg, 1_000);
  const made = scene.particleSystems.filter((p) => !before.has(p) && p.name === `vfx-${VFX_ID}`);
  const warns = spy.mock.calls.length;
  spy.mockRestore();
  expect(made, "這一格退路一顆發射器都沒生 —— 「不畫」比「畫錯位置」糟").toHaveLength(1);
  return { pos: (made[0]!.emitter as Vector3).clone(), warns };
}

describe('spawnVfx at:"bone" —— 出貨鏈上真的掛到骨頭 (GH#649/#565)', () => {
  it("① 骨頭在 → 特效生在骨頭的世界座標（WC3 逗號寫法也解得開）", () => {
    const { msg, caster } = shippedEvent("bone", "hand,right");
    expect(msg.data.attach, "sim 沒把 attach 送過線 ⇒ 客戶端讀得到才有鬼").toBe("hand,right");
    const root = spawnModel(caster, `${caster}-Hand Right Ref`);
    const { pos, warns } = playAndReadBack(msg);
    expect(pos.x).toBeCloseTo(MODEL.x + 0.5, 5);
    expect(pos.y).toBeCloseTo(1.6, 5);
    expect(pos.z).toBeCloseTo(MODEL.z + 0.2, 5);
    expect(warns, "精準命中不該吵").toBe(0);
    root.dispose(false, true);
  });

  it("② 替身骨架（模型在、鏈上一根都沒有）→ 退回模型根 + 胸口高度，並記一次 log", () => {
    const { msg, caster } = shippedEvent("bone", "hand,right");
    const root = spawnModel(caster, null);
    const { pos, warns } = playAndReadBack(msg);
    expect(pos.x).toBeCloseTo(MODEL.x, 5);
    expect(pos.y).toBeCloseTo(ARC_BODY_Y, 5);
    expect(pos.z).toBeCloseTo(MODEL.z, 5);
    expect(warns, "退路要記 log，⛔ 不吞").toBe(1);
    root.dispose(false, true);
  });

  it("③ 連模型節點都沒有（體素替身／還在載）→ 退回事件座標 + 胸口高度", () => {
    const { msg } = shippedEvent("bone", "weapon");
    const { pos, warns } = playAndReadBack(msg);
    expect(pos.x).toBeCloseTo(EV_X, 5);
    expect(pos.y).toBeCloseTo(ARC_BODY_Y, 5);
    expect(pos.z).toBeCloseTo(EV_Z, 5);
    expect(warns).toBe(1);
  });

  it('④ 沒有 attach 的一般 spawnVfx 一位元不變：事件座標、y = 1.0，且 sim ⛔ 不送 attach', () => {
    const { msg, caster } = shippedEvent("self");
    expect(msg.data.attach).toBeUndefined();
    const root = spawnModel(caster, `${caster}-Hand Right Ref`);
    const { pos, warns } = playAndReadBack(msg);
    expect(pos.x).toBeCloseTo(EV_X, 5);
    expect(pos.y).toBeCloseTo(1.0, 5);
    expect(pos.z).toBeCloseTo(EV_Z, 5);
    expect(warns).toBe(0);
    root.dispose(false, true);
  });
});
