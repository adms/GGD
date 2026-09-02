/**
 * `condition.recentCast@1` —— 連續技窗口的承重守衛（GH#937）。
 *
 * ⭐ **兩個方向一起讀**，而且是同一條線的兩次讀取：窗口內接上時條件真的成立、
 * 窗口過了時真的不成立。只驗前者的守衛對「永遠回 true」的實作是全綠的，
 * 而那正是這顆葉子最可能壞掉的方向（它是一個閘，壞掉的樣子是「它從不關」）。
 *
 * ⛔ 沒有任何一條斷言在讀 condition 物件的形狀或 schema 有沒有這個欄位 ——
 * 那是失敗形態⑦（掃屬性代替掃行為）。紀錄是走**出貨的** `castAbility` 寫進去的，
 * ⛔ 不是手寫進 ledger —— 失敗形態⑤（被測的不是出貨的那個）：手寫的那一版會在
 * 寫入點被搬到某道拒絕閘之前的那一天繼續全綠。
 *
 * ⛔ 也沒有任何**出貨數值**住在這裡（第零守則⑦）：窗口長度是這一檔自己的夾具，
 * tick 數從 `world.dt` 推導 —— tick 率怎麼調都不會讓這一檔用錯誤的訊息紅。
 *
 * ── 突變紀錄 ────────────────────────────────────────────────────────────────
 * `sim/content/condition.ts` 的 `recentCast` 分支最後一行
 *   `return world.tick - at <= Math.round(cond.withinSec / world.dt);`
 * 改成 `return true;`（讓窗口永遠開著）：
 *   × 「② 超過窗口 → 不成立」（技能 id）  FAIL（期望 false 得到 true）
 *   × 「② 超過窗口 → 不成立」（槽位）      FAIL（期望 false 得到 true）
 *   ○ 「① 窗口內 → 成立」                  PASS（正確的實作也會過，所以它一個人不算守衛）
 * 改回來 → 3/3 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "./skeleton";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "../abilities/abilitySystem";
import { evaluateCondition, type EffectCondition } from "./condition";
import { asSeatId, asTeamId, type AbilityId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
/** 夾具：窗口長度。⛔ 不是出貨值 —— 內容側怎麼填都不會讓這一檔紅。 */
const WINDOW_SEC = 1;
/** 施法者自己那一支 W（`castType:"self"`，冷卻 16 秒 ⇒ 不會干擾窗口）。 */
const W_ID = SELA.abilities.W.id as AbilityId;

/** 一位英雄，W 學到 1 級。先跑一 tick，broad-phase 才建得起來。 */
function stage(): { world: SimWorld; hero: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 937);
  world.combatActive = true;
  const hero = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  world.abilities.get(hero)!.slots.W.rank = 1;
  world.step(new Map());
  return { world, hero };
}

/** 把世界往前推 `sec` 秒 —— tick 數從 `world.dt` 推導，⛔ 不抄一個 tick 率。 */
function advance(world: SimWorld, sec: number): void {
  const n = Math.round(sec / world.dt);
  for (let i = 0; i < n; i++) world.step(new Map());
}

const holds = (world: SimWorld, hero: EntityId, cond: EffectCondition): boolean =>
  evaluateCondition(world, cond, { self: hero });

describe("GH#937 recentCast —— 連續技窗口，兩個方向一起讀", () => {
  it("① 窗口內施放過 ⇒ 成立；② 超過窗口 ⇒ 不成立（指名技能）", () => {
    cover("condition-recent-cast");
    const { world, hero } = stage();
    const cond: EffectCondition = {
      kind: "recentCast",
      subject: "self",
      abilityId: W_ID,
      withinSec: WINDOW_SEC,
    };

    // ⓪ 還沒放過 —— 「從來沒有」與「太久了」要合流成同一個 false。
    expect(holds(world, hero, cond)).toBe(false);

    expect(castAbility(world, hero, "W", { type: "self" })).toBe("ok");
    advance(world, WINDOW_SEC / 2);
    expect(holds(world, hero, cond)).toBe(true); // ①

    advance(world, WINDOW_SEC); // 總共 1.5 個窗口
    expect(holds(world, hero, cond)).toBe(false); // ②
  });

  it("① 窗口內 ⇒ 成立；② 超過窗口 ⇒ 不成立（那**一格**，owner 要的「一組技能」）", () => {
    const { world, hero } = stage();
    const cond: EffectCondition = {
      kind: "recentCast",
      subject: "self",
      slot: "W",
      withinSec: WINDOW_SEC,
    };

    expect(castAbility(world, hero, "W", { type: "self" })).toBe("ok");
    advance(world, WINDOW_SEC / 2);
    expect(holds(world, hero, cond)).toBe(true); // ①

    advance(world, WINDOW_SEC);
    expect(holds(world, hero, cond)).toBe(false); // ②
  });

  it("⛔ 被拒絕的按鍵不開窗口 —— 沒學會的那一格按下去等於沒按", () => {
    const { world, hero } = stage();
    const cond: EffectCondition = {
      kind: "recentCast",
      subject: "self",
      slot: "E",
      withinSec: WINDOW_SEC,
    };
    // E 的 rank 還是 0 ⇒ `castAbility` 走不到提交點。
    expect(castAbility(world, hero, "E", { type: "self" })).toBe("not-learned");
    expect(holds(world, hero, cond)).toBe(false);
  });
});
