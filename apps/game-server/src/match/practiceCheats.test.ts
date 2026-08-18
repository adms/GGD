/**
 * 練習面板六個分頁背後的**六個機制**（GH#365）—— 每一個一條承重的線。
 *
 * ⛔ 驗機制不驗數字（第二守則）：斷言的是「經驗值有沒有進去」「屬性有沒有被設成
 * 我要的那個值」「狀態有沒有真的帶著機制掛上」，⛔ 不是任何一個出貨數值。
 * 唯一出現的數字全部是**我在這條測試裡自己送進去的輸入**，或**從 `world.mobRules`
 * 推導**的 —— 沒有一個是抄來的出貨設定。
 *
 * ⛔ 這裡**不做**突變驗證：這一批的突變額度花在 `practiceCheatGate.test.ts`
 * （安全性＝承重那一條線，第零守則②）。這六條是「按了會不會發生事」，
 * 而它們每一條刪掉實作都會直接紅（斷言讀的就是實作寫的那個東西）。
 */
import { describe, it, expect } from "vitest";
import { asSeatId, type EntityId } from "@ggd/shared/ids";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "@ggd/shared/content";
import { DEFAULT_PRACTICE_RULES } from "@ggd/shared/content";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { Statuses } from "@ggd/shared/sim/content/registry";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { liveAttribute } from "@ggd/shared/sim/stats/attrSources";
import { cheatStatusFlags } from "@ggd/shared/sim/cheatStatusFlags";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";

const FAST = { champSelectTicks: 5, intermissionTicks: 10, combatMaxTicks: 60, resolutionTicks: 5 };
const SEAT0 = asSeatId(0);
const MOB_WAVES: MobWavesConfig = { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 };
const RULES: ArenaRules = { ...DEFAULT_ARENA_RULES, mobWaves: MOB_WAVES };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** 一間跑到 combat 的練習房 + 座位 0 的實體。 */
function build(autoMobWaves = false): { ctl: MatchController; e: EntityId } {
  const ctl = new MatchController("practice-cheats", 99, allBots(), FAST, 3, RULES, SKELETON_ARENA);
  ctl.practice = { ...DEFAULT_PRACTICE_RULES, autoMobWaves };
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  const e = ctl.seats.get(SEAT0)!.entityId!;
  expect(e).not.toBeNull();
  return { ctl, e };
}

describe("練習面板的六個機制（GH#365）", () => {
  it("① 成長 —— grantXp 真的把經驗值灌進去", () => {
    const { ctl, e } = build();
    const before = ctl.world.champion.get(e)!;
    const lvl0 = before.level;
    const xp0 = before.xp;
    expect(ctl.applyCheat(SEAT0, { kind: "grantXp", amount: 100_000 })).toBe(true);
    const after = ctl.world.champion.get(e)!;
    expect(after.level > lvl0 || after.xp > xp0, "經驗值一點都沒進去").toBe(true);
  });

  it("② 屬性 —— setStat 把一條屬性**設成**那個值，而且連按兩次不會愈墊愈高", () => {
    const { ctl, e } = build();
    // (a) Stat 那一條路：Override。
    expect(ctl.applyCheat(SEAT0, { kind: "setStat", stat: Stat.AbilityPower, value: 777 })).toBe(true);
    ctl.tick(); // statRecomputeSystem
    expect(ctl.world.stats.get(e)!.final[Stat.AbilityPower]).toBe(777);

    // (b) 三圍那一條路：差額。⭐ **兩次**是這一條的重點 —— 每按一次疊一格來源的
    //     實作在第二次會變成 400，而畫面上完全看不出多了一份（失敗形態②）。
    expect(ctl.applyCheat(SEAT0, { kind: "setStat", stat: "str", value: 200 })).toBe(true);
    ctl.tick();
    expect(liveAttribute(ctl.world, e, "str", "total")).toBeCloseTo(200, 3);
    expect(ctl.applyCheat(SEAT0, { kind: "setStat", stat: "str", value: 200 })).toBe(true);
    ctl.tick();
    expect(liveAttribute(ctl.world, e, "str", "total")).toBeCloseTo(200, 3);

    // (c) 不存在的屬性名一律拒絕，⛔ 不靜默吞掉。
    expect(ctl.applyCheat(SEAT0, { kind: "setStat", stat: "no-such-stat", value: 1 })).toBe(false);
  });

  it("③ 技能 —— 無限魔力每 tick 補滿；關掉之後就不補了", () => {
    const { ctl, e } = build();
    const hp = ctl.world.health.get(e)!;
    expect(ctl.applyCheat(SEAT0, { kind: "infiniteMana", enabled: true })).toBe(true);
    hp.mana = 0;
    ctl.tick();
    expect(hp.mana).toBe(hp.maxMana);
    // ⭐ 反向：關掉之後同一段流程**不會**回到滿，否則①驗到的可能是別的東西。
    expect(ctl.applyCheat(SEAT0, { kind: "infiniteMana", enabled: false })).toBe(true);
    hp.mana = 0;
    ctl.tick();
    expect(hp.mana).toBeLessThan(hp.maxMana);
  });

  it("④ 技能 —— 指定施放走**出貨的** castAbility（沒學會就放不出來）", () => {
    const { ctl, e } = build();
    const ab = ctl.world.abilities.get(e)!;
    for (const s of ["Q", "W", "E", "R"] as const) ab.slots[s].rank = 0;
    expect(ctl.applyCheat(SEAT0, { kind: "castAbility", slot: "Q" }), "沒學會卻放得出來 = 繞過了閘").toBe(
      false,
    );
    expect(ctl.takeCheatRejection()).toContain("not-learned");
    expect(ctl.applyCheat(SEAT0, { kind: "maxAbilities" })).toBe(true);
    expect(ctl.applyCheat(SEAT0, { kind: "castAbility", slot: "Q" })).toBe(true);
  });

  it("⑤ 狀態 —— 掛上去**帶著機制**（不是一個空的 HUD 圖示），解除拔得掉", () => {
    // 專屬 id，⛔ 不動出貨的那 40 份（全域登錄表會漏進隔壁測試）。
    Statuses.register("cheat-probe-stun", { polarity: "debuff", tags: ["stun", "hard-cc"] });
    const { ctl, e } = build();
    expect(ctl.applyCheat(SEAT0, { kind: "setStatus", statusId: "cheat-probe-stun", on: true })).toBe(true);
    const on = ctl.world.status.get(e)!.effects.find((s) => s.statusId === "cheat-probe-stun");
    expect(on, "狀態根本沒掛上").toBeTruthy();
    expect(on!.stun, "掛上了但沒有機制 —— 那只是一個 HUD 圖示").toBe(true);
    expect(on!.polarity).toBe("debuff");

    expect(ctl.applyCheat(SEAT0, { kind: "setStatus", statusId: "cheat-probe-stun", on: false })).toBe(true);
    expect(ctl.world.status.get(e)!.effects.some((s) => s.statusId === "cheat-probe-stun")).toBe(false);
    // 不存在的狀態一律拒絕 —— ⛔ 不掛一個空殼上去。
    expect(ctl.applyCheat(SEAT0, { kind: "setStatus", statusId: "nope", on: true })).toBe(false);
  });

  it("⑥ 殭屍 —— setWave 把波次時鐘搬到「下一 tick 就是第 k 波」", () => {
    const { ctl } = build(true);
    const rules = ctl.world.mobRules!;
    const k = 7;
    expect(ctl.applyCheat(SEAT0, { kind: "setWave", wave: k })).toBe(true);
    const before = ctl.world.mob.size;
    ctl.tick();
    // ⭐ 期望值**從 rules 推導**，⛔ 不抄字面值（那是後台的兩格設定）。
    expect(ctl.world.mobTicks).toBe(rules.firstWaveTicks + (k - 1) * rules.waveIntervalTicks);
    expect(ctl.world.mob.size, "跳到第 7 波卻一隻都沒出來").toBeGreaterThan(before);
  });

  it("⭐ 狀態的機制是**推導**出來的，⛔ 不是一份手寫的 id 對照表", () => {
    expect(cheatStatusFlags("stun", ["stun", "hard-cc", "cast-denied"]).stun).toBe(true);
    expect(cheatStatusFlags("slow30", ["slow30", "slow"]).moveSpeedMult).toBeCloseTo(0.7, 6);
    // 機制住在技能 JSON 裡的那些（例：燃燒的傷害）→ 掛上去只有圖示，而面板會標 ◇。
    expect(cheatStatusFlags("burn", ["burn", "dot", "marker"])).toEqual({});
  });
});
