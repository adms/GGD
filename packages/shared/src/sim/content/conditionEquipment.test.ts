/**
 * `condition.equipment@1` —— 「身上裝備了某件／某類道具時」的行為守衛。
 * 擋住的是 77-002 御雷劍（「使用從者道具"御雷劍"的剎那，其雷鳴劍發動[機率]上升」）。
 *
 * ⭐ **兩個方向一起讀**：帶著那件道具時加成真的落下去，沒帶時真的沒有。只驗前者
 * 的守衛對「永遠回 true」的實作是全綠的，而那正是這顆葉子最可能壞掉的方向
 * （它是一個閘，壞掉的樣子是「它從不擋」）。
 *
 * ⛔ 沒有任何一條斷言在讀 condition 物件的形狀或 schema 有沒有這個欄位 ——
 * 那是失敗形態 ⑦。每一條都跑真的 `fireHooks` → `runEffects` → 傷害佇列，讀的是
 * `world.health` 上真的血量差。
 *
 * 道具是走**出貨的** `grantItemFree`（三選一那條路）發下去的，不是手寫
 * `champ.items[0]` —— 失敗形態 ⑤：手寫的那一版在有人改了「裝備住哪裡」的那一天
 * 會繼續全綠。
 *
 * ⛔ 也沒有出貨數值住在這裡（第零守則⑦）：`BONUS` 是這一檔自己的夾具，
 * 道具與 tag 取自 skeleton 內容。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────────
 * `sim/content/condition.ts` 的 `cond.kind === "equipment"` 那一段改成
 * `return true`（讓閘永遠開）：
 *   × 「② 沒帶那一件 → 不觸發」 FAIL（期望 false 得到 true）
 *   × 「④ 帶的是別類   → 不觸發」 FAIL（期望 false 得到 true）
 *   ○ 「① 帶著那一件」「③ 帶著那一類」 PASS（正確的實作也會過，所以它們一個人不算守衛）
 * 改回來 → 4/4 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "./skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { grantItemFree } from "../economy/shop";
import { fireHooks } from "../effects/hooks";
import { asSeatId, asTeamId, type EntityId, type ItemId } from "../../ids";
import type { EffectCondition } from "./condition";

/** skeleton 的兩件純加成道具（都沒有自己的 on-hit，不會污染血量差）。 */
const ROD = "ember-rod" as ItemId; // tags: ["ap"]
const VEST = "ironhide-vest" as ItemId; // tags: ["tank"]
/** 夾具常數。不是平衡值，不是出貨值。 */
const BONUS = 500;

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

/** 掛一條「條件成立才加 BONUS 真傷」的 proc，發下 `carry`，揮一下，看有沒有落地。 */
function swingWith(condition: EffectCondition, carry: ItemId | null): boolean {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const hero = spawn(world, SELA.id, 0, 0);
  const foe = spawn(world, THORNE.id, 1, 1);
  world.step(new Map());

  if (carry) grantItemFree(world, hero, carry);
  attachSource(world, hero, {
    id: "test:proc",
    kind: "item",
    hooks: [
      {
        on: "onBasicAttack",
        effects: [{ kind: "damage", damageType: "true", amount: { flat: BONUS } }],
        condition,
      },
    ],
  });

  const before = world.health.get(foe)!.hp;
  fireHooks(world, hero, "onBasicAttack", foe);
  world.step(new Map());
  // 掉血 = BONUS 減掉同一 tick 的回復，所以用半個 BONUS 分帶。
  return before - world.health.get(foe)!.hp > BONUS / 2;
}

function spawn(world: SimWorld, championId: string, seat: number, team: number): EntityId {
  return spawnChampion(world, {
    championId: championId as never,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + seat, z: C.z },
    zone: 0,
  });
}

const HAS_ROD: EffectCondition = { kind: "equipment", subject: "self", itemId: ROD };
const HAS_TANK: EffectCondition = { kind: "equipment", subject: "self", tag: "tank" };

describe("裝備了某件／某類道具時", () => {
  it("★ ① 帶著指名的那一件 → 加成真的落下去了", () => {
    cover("condition-equipment-item-present");
    expect(swingWith(HAS_ROD, ROD)).toBe(true);
  });

  it("★ ② 背包裡沒有那一件 → 一點都沒加（這一條是閘本身）", () => {
    cover("condition-equipment-item-absent");
    expect(swingWith(HAS_ROD, null)).toBe(false);
    // 帶了別的道具也不算 —— 「有裝備」不等於「裝備了它」。
    expect(swingWith(HAS_ROD, VEST)).toBe(false);
  });

  it("★ ③ 「這一類」讀的是道具文件上的 tag，不是編號", () => {
    cover("condition-equipment-tag-present");
    expect(swingWith(HAS_TANK, VEST)).toBe(true);
  });

  it("★ ④ 帶的是別一類 → 不觸發（tag 沒有被當成「有帶東西就算」）", () => {
    cover("condition-equipment-tag-absent");
    expect(swingWith(HAS_TANK, ROD)).toBe(false);
  });
});
