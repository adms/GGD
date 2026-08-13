/**
 * ⭐【特殊殭屍 / 殭屍王 算不算英雄單位】—— owner 2026-08-13 的**兩個獨立欄位**。
 *
 *   「只能吃掉英雄，**特殊殭屍跟殭屍王可以被考慮是英雄單位**」
 *   「**這兩個是獨立欄位，都要有**」
 *
 * ⛔ 斷言讀的是 `entityIsKind` 的**回答**（89-002 的條件真的走這一支），
 *    不是「schema 有沒有這個欄位」那種掃屬性的假守衛（失敗形態⑦）。
 * ⛔ 驗機制不驗數字：這裡沒有任何出貨值。
 *
 * 突變紀錄：`condition.ts` 的 `case "champion"` 把 `mobCountsAsChampion(...)`
 * 那一行拿掉 → 前兩條紅（精英怪回到「不是英雄」，89-002 又吃不掉牠們）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { entityIsKind } from "./condition";
import type { MobRules } from "../mobs";
import type { EntityId } from "../../ids";

/** 造一隻指定 kind 的小怪，並掛上兩格開關的組合。 */
function worldWith(
  kind: "normal" | "special" | "boss",
  flags: { special?: boolean; boss?: boolean },
): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1);
  const id = world.spawn();
  world.mob.set(id, {
    zone: 0,
    team: -1 as never,
    kind,
    target: -1,
    attackCdTicks: 0,
    spawnTick: 0,
  });
  // ⚠️ 只填這一格條件讀得到的東西 —— `MobRules` 其餘欄位與這個問題無關，
  //    夾具塞滿一份完整規則反而會讓「哪一格在做事」讀不出來。
  world.mobRules = {
    special:
      flags.special === undefined ? null : ({ countsAsChampion: flags.special } as never),
    boss: flags.boss === undefined ? null : ({ countsAsChampion: flags.boss } as never),
  } as unknown as MobRules;
  return { world, id };
}

describe("精英殭屍算不算英雄單位（owner 2026-08-13 的兩格）", () => {
  it("⭐ 開著的時候，特殊殭屍與殭屍王都答『是英雄』", () => {
    cover("mob-counts-as-champion");
    const s = worldWith("special", { special: true });
    expect(entityIsKind(s.world, s.id, "champion"), "特殊殭屍").toBe(true);
    const b = worldWith("boss", { boss: true });
    expect(entityIsKind(b.world, b.id, "champion"), "殭屍王").toBe(true);
    // ⛔ 一般殭屍永遠不是 —— owner 只把「特殊」與「王」算進去。
    const n = worldWith("normal", { special: true, boss: true });
    expect(entityIsKind(n.world, n.id, "champion"), "一般殭屍").toBe(false);
    // 而且牠們**仍然是** mob —— 這一格回答的是條件，不是身分。
    expect(entityIsKind(s.world, s.id, "mob"), "特殊殭屍還是 mob").toBe(true);
  });

  it("⭐ 兩格**互相獨立** —— 可以只讓殭屍王算英雄", () => {
    cover("mob-counts-as-champion-independent");
    // 這一條就是 owner「這兩個是獨立欄位」那句話的閘：共用一個布林會讓它紅。
    const s = worldWith("special", { special: false, boss: true });
    expect(entityIsKind(s.world, s.id, "champion"), "特殊關掉 ⇒ 不是英雄").toBe(false);
    const b = worldWith("boss", { special: false, boss: true });
    expect(entityIsKind(b.world, b.id, "champion"), "王開著 ⇒ 是英雄").toBe(true);
  });

  it("⭐ 缺席 = **預設啟動**；完全沒有小怪規則的世界才是 false", () => {
    cover("mob-counts-as-champion-default");
    // 第〇·六守則：高層級的新裁決**預設啟動**，開關是為了回頭 ——
    // 一份沒有這格的舊 config 應該拿到 owner 現在要的行為，不是舊行為。
    const s2 = new SimWorld(SKELETON_ARENA, 1);
    const id = s2.spawn();
    s2.mob.set(id, {
      zone: 0,
      team: -1 as never,
      kind: "special",
      target: -1,
      attackCdTicks: 0,
      spawnTick: 0,
    });
    s2.mobRules = { special: {}, boss: null } as unknown as MobRules;
    expect(entityIsKind(s2, id, "champion"), "有區塊但沒填那一格 ⇒ 預設算英雄").toBe(true);

    // ⚠️ `mobRules === null`（單元測試夾具、客戶端預測影子、#215 之前的存檔）
    //    才是 false —— 沒有小怪規則就沒有精英怪，這個問題不成立。
    const bare = new SimWorld(SKELETON_ARENA, 1);
    const bid = bare.spawn();
    bare.mob.set(bid, {
      zone: 0,
      team: -1 as never,
      kind: "special",
      target: -1,
      attackCdTicks: 0,
      spawnTick: 0,
    });
    expect(entityIsKind(bare, bid, "champion"), "沒有小怪規則").toBe(false);
  });
});
