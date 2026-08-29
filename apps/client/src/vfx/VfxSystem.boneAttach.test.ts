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
 *
 * ⭐ @visual-proof —— GH#809 修的缺陷**不是不可見**，是「特效長在**錯的身體**上」：
 * 兩種情況畫面都一樣亮 ⇒ readPixels 的 A/B **分不出來**（量尺在這個軸上是瞎的）。
 * ⇒ 終端量是三個一起讀：① 真的有一顆發射器 ② 它 `isStarted()` 且
 * `manualEmitCount > 0`（⛔ **不可以量 `emitRate`** —— `frontLoadDoc` 把這一族壓成
 * 單幀爆發，出貨的 `emitRate` **恆為 0**；實跑驗過拿它當尺六格全紅）
 * ③ 它的**世界座標**落在受擊者骨頭上（夾具讓兩具模型相距 40 單位 ⇒ 掛錯人量得出來）。
 * ⛔ 誠實邊界：⛔ 不證明那份 vfx 文件畫得出亮像素（那是 `vfxDocsBirthVisibility`
 * 與 audition 的事）；本檔用的是既有出貨文件，⛔ 本批沒動它。
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
/** ⭐ GH#809 —— 受擊者在 sim 裡的腳下座標（刻意**不等於**施法者的）。 */
const VICTIM_X = 30;
const VICTIM_Z = 40;
/** 受擊者模型根的世界位置（三個位置兩兩不等 ⇒ 錨錯人一定看得出來）。 */
const VICTIM_MODEL = new Vector3(50, 0, 60);

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
function shippedEvent(
  at: "self" | "bone",
  attach?: string,
  /** ⭐ GH#809 —— 省略＝施法者（今天的行為）；`"victim"` ＝ 掛在受擊者身上。 */
  boneOn?: "victim",
): { msg: EventMessage; caster: number; victim: number } {
  const parsed = zEffectDef.parse({
    kind: "spawnVfx",
    vfxId: VFX_ID,
    at,
    ...(attach !== undefined ? { attach } : {}),
    ...(boneOn !== undefined ? { boneOn } : {}),
  }) as EffectDef;
  const world = new SimWorld(SKELETON_ARENA, 42);
  const caster = world.spawn();
  const victim = world.spawn();
  world.transform.set(caster, {
    pos: { x: EV_X, z: EV_Z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.transform.set(victim, {
    pos: { x: VICTIM_X, z: VICTIM_Z },
    vel: { x: 0, z: 0 },
    facing: { x: -1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  runEffects([parsed], {
    world,
    caster,
    rank: 1,
    targets: [victim],
    point: { x: -99, z: -99 },
    origin: "ability:test.bone",
    rng: world.rng,
  });
  const ev = world.events.find((e) => e.type === "vfxSpawn");
  expect(ev, "sim 沒有發出 vfxSpawn").toBeDefined();
  return { msg: { type: ev!.type, tick: 0, data: ev!.data } as unknown as EventMessage, caster, victim };
}

/** 一個「有模型的施法者」：`champ-<id>` 根節點，外加零或一根骨。 */
function spawnModel(caster: number, bone: string | null, at: Vector3 = MODEL): TransformNode {
  const root = new TransformNode(`champ-${caster}`, scene);
  root.position.copyFrom(at);
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
  // ⭐ @visual-proof 的**終端量**：一顆**真的在噴**的發射器，而且它的世界座標就是
  //    玩家會看到那團粒子的地方。⛔ 只斷言「物件被建出來」不夠 —— 一顆停著的、
  //    emitRate 0 的發射器停在正確的位置上，畫面上與「什麼都沒發生」一模一樣。
  const ps = made[0]!;
  expect(ps.isStarted(), "發射器沒有 start ⇒ 位置對了也是零像素").toBe(true);
  // ⚠️ ⭐ 量的是 `manualEmitCount` ⛔ 不是 `emitRate`：這條路上的每一份 doc 都被
  //    `frontLoadDoc` 壓成「所有粒子誕生在同一幀」⇒ **出貨的 `emitRate` 就是 0**
  //    （`VfxSystem.play()` 寫的是 `ps.manualEmitCount = max(1, …)`）。
  //    ⛔ 拿 emitRate 當量尺 ＝ 一把在這一族上恆為 0 的尺（實跑：六格全紅）。
  expect(ps.manualEmitCount, "這一發一顆粒子都不生 ⇒ 位置對了也是零像素").toBeGreaterThan(0);
  return { pos: (ps.emitter as Vector3).clone(), warns };
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

  /**
   * ⭐ GH#809 —— **錨定單位是受擊者**（原作 92 次量到的另一半）。這一批的**承重線**：
   * ⚠️ 兩具模型同時在場，所以「掛錯人」與「掛對人」量起來**不一樣** ——
   * 一具模型的夾具對兩種實作會**同時**通過（失敗形態④）。
   * 突變（實跑）：客戶端 `data.attachTo ?? data.caster` → `data.caster` ⇒ 本條紅（落在施法者手上）。
   */
  it("⑤ boneOn:\"victim\" → 掛在**受擊者**模型的骨頭上，⛔ 不是施法者的", () => {
    const { msg, caster, victim } = shippedEvent("bone", "hand,right", "victim");
    expect(msg.data.attachTo, "sim 沒送 attachTo ⇒ 客戶端只能掛回施法者").toBe(victim);
    expect(msg.data.caster, "caster 不可以被覆寫（拖曳心跳/瞄準/電弧種子都讀它）").toBe(caster);
    const cRoot = spawnModel(caster, `${caster}-Hand Right Ref`);
    const vRoot = spawnModel(victim, `${victim}-Hand Right Ref`, VICTIM_MODEL);
    const { pos, warns } = playAndReadBack(msg);
    expect(pos.x).toBeCloseTo(VICTIM_MODEL.x + 0.5, 5);
    expect(pos.z).toBeCloseTo(VICTIM_MODEL.z + 0.2, 5);
    expect(warns).toBe(0);
    cRoot.dispose(false, true);
    vRoot.dispose(false, true);
  });

  it("⑥ 受擊者還沒有模型 → 退回**受擊者腳下** + 胸口高度（⛔ 不是施法者腳下）", () => {
    const { msg, caster } = shippedEvent("bone", "chest", "victim");
    const cRoot = spawnModel(caster, `${caster}-Chest Ref`);
    const { pos } = playAndReadBack(msg);
    expect(pos.x).toBeCloseTo(VICTIM_X, 5);
    expect(pos.z).toBeCloseTo(VICTIM_Z, 5);
    expect(pos.y).toBeCloseTo(ARC_BODY_Y, 5);
    cRoot.dispose(false, true);
  });
});
