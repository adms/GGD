/**
 * 「每回合重新武裝」的那一行真的用了**當下的回合** —— 稽核補的 (verifier).
 *
 * ── 存活的突變 ─────────────────────────────────────────────────────────────
 * `MatchController.enterCombat` 只有一行把 round 交進 sim:
 *
 *     mobRulesFromConfig(this.rules.mobWaves, this.world.dt, this.phase.round)
 *
 * 把 `this.phase.round` 換成 `this.rules.mobWaves.fromRound`(一個固定值)之後,
 * game-server 74 檔 / 562 條**全綠**。也就是說 #217 的等級曲線、#215 的逐回合
 * 上限、GH#191 的逐回合「由誰擔任」—— 三個功能共用的**唯一通道** —— 可以整條
 * 凍死而沒有任何一條測試會說話。
 *
 * ── 為什麼既有的守衛看不到 (失敗形狀 ⑤) ────────────────────────────────────
 * `mobs.level.test.ts` / `mobs.schedule.test.ts` 直接呼叫 `mobRulesFromConfig`;
 * `mobRoundChampionWire.test.ts` 也自己算好 rules 再 `ctl.world.mobRules = rules`
 * 塞進去。三支測的都是那個**純函式**,沒有一支問過「出貨的那個 controller 到底
 * 傳了什麼進去」。這一支不傳任何東西:它只開一場真的比賽、真的打到第 1 回合與
 * 第 2 回合,然後讀 `ctl.world.mobRules` —— 也就是 sim 真的吃到的那份。
 *
 * ── 為什麼答案分得開 (失敗形狀 ④) ──────────────────────────────────────────
 * schedule 只給第 1 回合一列並指定 sela;第 2 回合沒有列 ⇒ 沿用全場的 thorne。
 * 一個凍在 `fromRound`(=1) 的實作在兩個回合都回答 sela,第二條斷言就掛。等級也
 * 一起斷言(1 → 2),所以「換臉」與「升級」是兩個獨立可證偽的數字。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "@ggd/shared/content";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";

beforeAll(() => registerSkeletonContent());

const FAST = {
  champSelectTicks: 5,
  intermissionTicks: 10,
  combatMaxTicks: 60,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/**
 * 第 1 回合由 sela 擔任、之後沿用 thorne。`fromRound: 1` 只是為了不必打三場;
 * 讀 round 的那一行與出貨設定完全相同。波次拉到很慢,這支測的是**武裝**,不是
 * 生怪,所以場上不需要有殭屍。
 */
const MOB_WAVES: MobWavesConfig = {
  ...DEFAULT_MOB_WAVES_CONFIG,
  fromRound: 1,
  firstWaveSec: 999,
  waveIntervalSec: 999,
  mob: { ...DEFAULT_MOB_WAVES_CONFIG.mob, championId: "thorne", baseLevel: 1, levelPerRound: 1 },
  schedule: [{ round: 1, mobsPerWaveCap: 3, maxAlivePerZone: 7, championId: "sela" }],
};

const RULES: ArenaRules = { ...DEFAULT_ARENA_RULES, mobWaves: MOB_WAVES, rogueliteMobs: true };

/** Tick until combat of `round` is entered; throws (via expect) if never. */
function tickToCombatRound(ctl: MatchController, round: number, maxTicks = 20000): void {
  let n = 0;
  while (!(ctl.phase.phase === "combat" && ctl.phase.round === round) && n < maxTicks) {
    ctl.tick();
    n++;
  }
  expect(ctl.phase.phase, `never reached combat round ${round}`).toBe("combat");
  expect(ctl.phase.round).toBe(round);
}

describe("逐回合的殭屍規則是用**當下的回合**武裝的 (GH#191 / #215 / #217)", () => {
  it("守衛的守衛:兩個英雄真的是兩份不同的網格", () => {
    cover("mob-round-champion");
    expect(Champions.tryGet("sela" as ChampionId)?.modelKey).toBe("champ.sela");
    expect(Champions.tryGet("thorne" as ChampionId)?.modelKey).toBe("champ.thorne");
  });

  it("第 1 回合戴 sela 的臉、第 2 回合換回 thorne —— 讀的是 world.mobRules,不是我們自己算的", () => {
    cover("mob-round-champion");
    const ctl = new MatchController("m-round-arm", 7, allBots(), FAST, 3, RULES, SKELETON_ARENA);

    tickToCombatRound(ctl, 1);
    const r1 = ctl.world.mobRules;
    expect(r1, "第 1 回合沒有武裝殭屍規則").not.toBeNull();
    // 這是 snapshot.ts 寫進 EntityState.key 的那個字串。
    expect(r1!.modelKey).toBe("champ.sela");
    expect(r1!.level).toBe(1);
    // 逐回合上限也走同一個 round —— 一起釘住,免得只有一半的通道活著。
    expect(r1!.mobsPerWaveCap).toBe(3);
    expect(r1!.maxAlivePerZone).toBe(7);

    tickToCombatRound(ctl, 2);
    const r2 = ctl.world.mobRules;
    expect(r2).not.toBeNull();
    // 第 2 回合沒有列 ⇒ 沿用全場設定。一個凍在 fromRound 的實作在這裡仍是 sela。
    expect(r2!.modelKey).toBe("champ.thorne");
    expect(r2!.level).toBe(2);
    expect(r2!.mobsPerWaveCap).toBe(DEFAULT_MOB_WAVES_CONFIG.mobsPerWaveCap);
    expect(r2!.maxAlivePerZone).toBe(DEFAULT_MOB_WAVES_CONFIG.maxAlivePerZone);

    // 兩個回合真的給出不同答案 —— 否則上面每一條都可能在功能全死時通過。
    expect(r1!.modelKey).not.toBe(r2!.modelKey);
    expect(r1!.level).not.toBe(r2!.level);
  });

  it("染黑強度也是從**武裝過的** rules 發布的,不是常數", () => {
    cover("mob-special-visible");
    const tinted: ArenaRules = {
      ...RULES,
      mobWaves: { ...MOB_WAVES, mob: { ...MOB_WAVES.mob, tintStrength: 0.2 } },
    };
    const ctl = new MatchController("m-round-tint", 7, allBots(), FAST, 3, tinted, SKELETON_ARENA);
    tickToCombatRound(ctl, 1);
    // 0.2 不是預設值(0.65),所以「永遠回傳預設」的實作在這裡分得出來。
    expect(ctl.world.mobRules!.tintStrength).toBeCloseTo(0.2, 9);
  });
});
