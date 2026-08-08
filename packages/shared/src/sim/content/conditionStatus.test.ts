/**
 * `condition.target-status@1` —— 「目標身上有某個狀態時」的行為守衛。
 *
 * ⭐ **兩個方向一起讀**,而且是同一條線的兩次揮擊:目標帶著標記時加成真的落
 * 下去,標記不在時真的沒有。只驗前者的守衛對「永遠回 true」的實作是全綠的,
 * 而那正是這顆葉子最可能壞掉的方向(它是一個閘,壞掉的樣子是「它從不擋」)。
 *
 * ⛔ 沒有任何一條斷言在讀 condition 物件的形狀或 schema 有沒有這個欄位 ——
 * 那是失敗形態 ⑦(掃屬性代替掃行為)。每一條都跑真的 `fireHooks` → `runEffects`
 * → 傷害佇列,讀的是 `world.health` 上真的血量差。
 *
 * ⛔ 也沒有任何**出貨數值**住在這裡(第零守則⑦):`BONUS` 與 `MARK` 都是這一檔
 * 自己的夾具,平衡怎麼調都不會讓這一檔用錯誤的訊息紅。
 *
 * 標記是走**出貨的** `applyStatus` 掛上去的,不是手寫進 `StatusComp.effects`
 * —— 失敗形態 ⑤(被測的不是出貨的那個):手寫的那一版會在 `applyStatus` 改了
 * 到期算法的那一天繼續全綠。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────────
 * `sim/content/condition.ts` 的 `cond.kind === "status"` 那一段改成
 * `return true`(讓閘永遠開):
 *   × 「② 沒有標記 → 不觸發」 FAIL（期望 false 得到 true）
 *   ○ 「① 有標記 → 觸發」    PASS（正確的實作也會過,所以它一個人不算守衛）
 * 改回來 → 3/3 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA, THORNE } from "./skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { fireHooks } from "../effects/hooks";
import { runEffects } from "../effects/effectRunner";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../ids";
import type { EffectCondition } from "./condition";

/** 隨便一個真的存在的 status —— 這顆葉子不看語意,只看「在不在身上」。 */
const MARK = "root" as StatusId;
/** 夾具常數。不是平衡值,不是出貨值。 */
const BONUS = 500;

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

/** 一位英雄 + 一位敵方英雄。先跑一 tick,broad-phase 才建得起來。 */
function stage(): { world: SimWorld; hero: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  const foe = spawnChampion(world, {
    championId: THORNE.id,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + 1, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, hero, foe };
}

/** 走出貨的 `applyStatus` 把標記掛到 `who` 身上。 */
function mark(world: SimWorld, who: EntityId): void {
  runEffects([{ kind: "applyStatus", statusId: MARK, duration: 5 }], {
    world,
    caster: who,
    rank: 1,
    targets: [who],
    origin: "test:mark",
    rng: world.rng,
  });
}

/** 揮一下,回傳目標掉了多少血。 */
function swing(world: SimWorld, hero: EntityId, foe: EntityId): number {
  const before = world.health.get(foe)!.hp;
  fireHooks(world, hero, "onBasicAttack", foe);
  world.step(new Map());
  return before - world.health.get(foe)!.hp;
}

/** 掉血 = BONUS 減掉同一 tick 的回復,所以用半個 BONUS 分帶。 */
const landed = (hpLost: number): boolean => hpLost > BONUS / 2;

/** 把一條「條件成立才加 BONUS 真傷」的 proc 掛在英雄身上,然後揮一下。 */
function swingWith(condition: EffectCondition, markFoe: boolean): boolean {
  const s = stage();
  if (markFoe) mark(s.world, s.foe);
  attachSource(s.world, s.hero, {
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
  return landed(swing(s.world, s.hero, s.foe));
}

const HAS_MARK: EffectCondition = { kind: "status", subject: "target", statusId: MARK };

describe("目標身上有某狀態時", () => {
  it("★ ① 目標帶著標記 → 加成真的落下去了", () => {
    cover("condition-target-status-present");
    expect(swingWith(HAS_MARK, true)).toBe(true);
  });

  it("★ ② 目標沒有標記 → 一點都沒加（這一條是閘本身）", () => {
    cover("condition-target-status-absent");
    expect(swingWith(HAS_MARK, false)).toBe(false);
  });

  it("★ ③ `not` 是「沒有」的唯一寫法,而且方向真的相反", () => {
    cover("condition-target-status-negated");
    const noMark: EffectCondition = { not: HAS_MARK };
    expect(swingWith(noMark, false)).toBe(true);
    expect(swingWith(noMark, true)).toBe(false);
  });
});
