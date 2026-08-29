/**
 * ⭐ GH#853 —— **喊招字照 JASS 的角度飛**（原作 `SetTextTagVelocityBJ`）。
 *
 * ── 為什麼這條守衛跨**整條路**跑，⛔ 不是分兩條各驗一半 ────────────────────
 * 這一族的前科逐字寫在 `sim/effects/clientCues.ts` 的檔頭：`floatingText` 的
 * sim 側送 `subjects`、而客戶端讀 `ev.data.at` ⇒ **全遊戲每一個浮動文字都沒有
 * 出現過**，而每一個零件單看都是對的（失敗形態⑧）。⚠️ CLAUDE.md 記的第二種
 * 假綠燈（⑪「兩條對的守衛，組合是空的」）說的也是同一件事：兩條各驗一半的路，
 * ⛔ 沒有人驗**接縫**。
 *
 * ⇒ 所以這裡跑的是**出貨的那一條**：
 *   真的 Zod schema → 真的 `floatingTextEffect` → 真的 `world.events` 那一份
 *   → 真的 `VfxSystem.handleEvent` → 真的 `FloatingTextFx` 池子。
 *   ⛔ 沒有任何一步是測試自己造出來的 payload。
 *
 * ⚠️ **誠實邊界（⛔ 這條守衛管不到的）**：最後一段
 * 「`WorldAnchorLayer` 把 `driftX`／`driftZ` 加進投影座標」是 DOM 那一層，
 * 這裡量不到 ⇒ 對玩家而言這一票的狀態是「**鏈路已接上，⛔ 未驗收**」。
 *
 * ── 斷言為什麼一個出貨數字都沒有（第二守則「驗機制不驗數字」）──────────────
 * 三條比的都是**同一次執行的另一半**：往 +x 的那一發 vs 往 +z 的那一發、
 * 第一刀 vs 第二刀、有寫 `driftSpeed` vs 沒寫。夾具自己的 30／90 是夾具的量，
 * ⛔ 不是 `content/config/` 裡的任何一格。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）───────────────────────────────
 *  · ⭐ 承重線 —— `apps/client/src/vfx/FloatingTextFx.ts` 的 `tick()`：
 *      `e.driftX += (e.driftVx * dtMs) / 1000;`（連同 `driftZ` 那一行）刪掉
 *      ＝ 這一票的全部功能消失，而 schema／sim／payload 三層完全正常。
 *    → 紅：「⛔ 0°(往 +x) 的字沒有往 +x 飄 …: expected 0 to be greater than 0」
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// QualityController 在 import 時碰 localStorage（同 VfxSystem.test.ts）
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent, SELA } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import { zFloatingText, refine } from "@ggd/shared/content/schema/effects/floatingText";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";
import { VfxSystem } from "./VfxSystem";
import type { FloatingTextEntry } from "./FloatingTextFx";

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  registerSkeletonContent();
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

const C = SKELETON_ARENA.zones[0]!.center;
/** 夾具自己的量（⛔ 不是出貨值）—— 只要夠大，飄與不飄就分得開。 */
const SPEED = 6;

/**
 * 跑**出貨的那一條路**一次，回傳池子裡那幾發字。
 *
 * ⚠️ `effects` 先過**真的** `zFloatingText`（含 `refine`）—— 一份 schema 收不下的
 * 夾具在這裡就會炸，⛔ 不會變成一個「測了一個不存在的形狀」的綠燈（失敗形態⑤）。
 */
function play(
  effects: readonly Record<string, unknown>[],
  facing: { x: number; z: number },
  elapsedMs: number,
): { entries: FloatingTextEntry[]; payloads: Record<string, unknown>[] } {
  const parsed = effects.map((e) =>
    e["kind"] === "floatingText" ? zFloatingText.superRefine(refine).parse(e) : e,
  ) as unknown as EffectDef[];

  const world = new SimWorld(SKELETON_ARENA, 5301);
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  world.transform.get(caster)!.facing = facing;

  const vfx = new VfxSystem(scene, { entityPos: (): null => null });
  const payloads: Record<string, unknown>[] = [];
  const drain = (): void => {
    for (const ev of world.events) {
      if (ev.type !== "floatingText") continue;
      payloads.push(ev.data);
      vfx.handleEvent({ type: ev.type, tick: world.tick, data: ev.data }, 0);
    }
  };

  runEffects(parsed, {
    world,
    caster,
    rank: 1,
    targets: [],
    origin: "ability:test.shout",
    rng: world.rng,
  } satisfies EffectContext);
  drain();
  // `comboStrikes` 把後續刀排進班表 ⇒ 要真的把世界推下去才拿得到第二刀。
  for (let i = 0; i < 30; i++) {
    world.step(new Map());
    drain();
  }

  vfx.update(0);
  vfx.update(elapsedMs);
  const entries = (vfx.floatingTextEntries as readonly FloatingTextEntry[]).filter((e) => e.active);
  return { entries: [...entries], payloads };
}

const shout = (extra: Record<string, unknown>): Record<string, unknown> => ({
  kind: "floatingText",
  shape: "single",
  text: "喊招",
  ...extra,
});

describe("GH#853 喊招字的方向（SetTextTagVelocityBJ）", () => {
  it("⭐ 角度**兩個方向都量過**：0° 往 +x、90° 往 +z", () => {
    cover("floating-text-drift-angle");
    // ⚠️ 兩發要分開跑：同一個錨點上的第二發會被 `delayMs` 錯開,那時它還沒動。
    const east = play([shout({ driftSpeed: SPEED, driftAngleDeg: 0 })], { x: 1, z: 0 }, 500)
      .entries[0]!;
    const north = play([shout({ driftSpeed: SPEED, driftAngleDeg: 90 })], { x: 1, z: 0 }, 500)
      .entries[0]!;

    // ⭐ 承重（突變挑這一條）：0° 真的把字推向 +x，而且**只有** x 動。
    expect(east.driftX, "⛔ 0°(往 +x) 的字沒有往 +x 飄 —— 方向沒有被消費").toBeGreaterThan(0);
    expect(Math.abs(east.driftZ), "0° 不該有 z 分量").toBeLessThan(east.driftX / 100);
    // ⭐ 另一個方向（⛔ 單邊校準的尺不算自證過）：90° 換一根軸。
    expect(north.driftZ, "⛔ 90° 的字沒有往 +z 飄 —— 角度被忽略了").toBeGreaterThan(0);
    expect(Math.abs(north.driftX), "90° 不該有 x 分量").toBeLessThan(north.driftZ / 100);
    // 垂直那一根軸不受影響（`riseSpeed` 與 `drift*` 是兩根獨立的軸）
    expect(east.lift, "水平飄移不可以偷走垂直上浮").toBeGreaterThan(0);
  });

  it("`casterFacing` 跟著面向轉；`driftAngleStepDeg` 讓每一刀飛不同方向（j:33850）", () => {
    cover("floating-text-drift-facing");
    // ① 基準 = 施法者面向（原作 `GetUnitFacing(GetTriggerUnit())`，18/120 次）
    const facingNorth = play(
      [shout({ driftSpeed: SPEED, driftFrom: "casterFacing" })],
      { x: 0, z: 1 },
      500,
    ).entries[0]!;
    expect(
      facingNorth.driftZ,
      "⛔ `casterFacing` 沒有跟著面向 —— 基準向量沒有被送出／沒有被讀",
    ).toBeGreaterThan(0);
    expect(Math.abs(facingNorth.driftX), "面向 +z 時不該有 x 分量").toBeLessThan(
      facingNorth.driftZ / 100,
    );

    // ② 每一段再轉一次（超究武神霸斬 `set udg_superAngle = udg_superAngle + 270`）。
    //    ⚠️ 走**真的** `comboStrikes` —— 段號由 `delayedSystem` 填,⛔ 不是測試自己塞的。
    const combo = play(
      [
        {
          kind: "comboStrikes",
          shape: "single",
          steps: [1 / 30, 6 / 30],
          perStrike: [shout({ driftSpeed: SPEED, driftAngleDeg: 0, driftAngleStepDeg: 90 })],
        },
      ],
      { x: 1, z: 0 },
      500,
    );
    expect(combo.entries.length, "兩刀應該冒出兩段字").toBe(2);
    const [a, b] = combo.entries as [FloatingTextEntry, FloatingTextEntry];
    // ⭐ 承重：**兩刀的方向不一樣**（⛔ 不比絕對角度 —— 那是數字）。
    expect(
      Math.abs(a.driftVx - b.driftVx) + Math.abs(a.driftVz - b.driftVz),
      "⛔ 兩刀朝同一個方向飛 —— `driftAngleStepDeg` 沒有跟著段號走",
    ).toBeGreaterThan(SPEED / 2);
  });

  it("缺席 ⇒ payload 上連這一格都沒有 ⇒ 逐位元同以前；空宣稱在載入時就被擋", () => {
    cover("floating-text-drift-rollback");
    const { entries, payloads } = play([shout({ riseSpeed: 3 })], { x: 1, z: 0 }, 500);
    expect(payloads[0]!["drift"], "⛔ 沒寫 driftSpeed 卻多出一格 —— rollback 不是逐位元").toBeUndefined();
    const e = entries[0]!;
    expect(e.driftX, "沒寫 driftSpeed 的字不可以自己飄").toBe(0);
    expect(e.driftZ, "沒寫 driftSpeed 的字不可以自己飄").toBe(0);
    expect(e.lift, "舊行為（垂直上浮）必須原封不動").toBeGreaterThan(0);

    // ⭐ 第一·五守則：角度沒有速度 = 一格「說了但不會發生」的欄位 ⇒ 載入時就紅。
    expect(() =>
      zFloatingText.superRefine(refine).parse(shout({ driftAngleDeg: 90 })),
    ).toThrowError(/driftAngleDeg/);
  });
});
