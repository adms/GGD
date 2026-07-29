/**
 * 隨機英雄的 HOST 那一半 (#289) —— 真的開一場比賽,讀 `ctl.world.mobRules`。
 *
 * ── 為什麼一定要有這一支 ───────────────────────────────────────────────────
 * `packages/shared/.../mobs.randomChampion.test.ts` 測的是純函式:「給我一個
 * callback,我就照著抽」。它問不出、也永遠不會問出的兩件事:
 *
 *   ⑤ 被測的不是出貨的 —— 出貨的那個 controller 到底有沒有把 callback 傳進去?
 *      把 `MatchController.enterCombat` 的第五個參數刪掉,shared 那 21 條全綠、
 *      game-server 其他 500 多條也全綠,線上就永遠是喪標麥可。這裡不自己算
 *      rules,只讀 sim 真的吃到的那一份。
 *
 *   ⚠️ world.rng 有沒有被偷用 —— 這是這一支存在的第二個理由,而且比第一個更難
 *      被別的測試看見。#215 刻意讓小怪一滴 rng 都不抽,因為 `world.rng` 同時餵
 *      爆擊 / 迴避 / 傳說寶玉;抽籤只要動它一次,同一顆 seed 的每一場比賽從那個
 *      tick 之後全部位移,而畫面上什麼都看不出來。守法:**同一顆 seed 跑兩場,
 *      一場「隨機」一場「指定」,比 `world.rng.state`**。用 rng 抽的實作會讓兩場
 *      的 state 分岔;用雜湊抽的不會。
 *      ⚠️ 這條要成立,必須先證明兩場真的抽出了不同的王(否則兩場根本一樣,
 *      state 當然相等)—— 所以下面先斷言 modelKey 不同,再斷言 state 相同。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "@ggd/shared/content";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import { mobModelKeyFor } from "@ggd/shared/sim/mobs";
import type { ChampionId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { Whitelist } from "../curation/whitelist";

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
 * `fromRound: 1` so one round is enough; the wave clock is pushed out to 999s so
 * NOTHING spawns — this file tests ARMING, and a battlefield full of zombies
 * would drag `rollMobKind` into the rng comparison below for no reason.
 *
 * `mob.championId: "thorne"` is the INHERIT answer, so a king that failed to draw
 * is instantly recognisable as `champ.thorne`.
 */
const mobWaves = (bossSource: "random" | "fixed"): MobWavesConfig => ({
  ...structuredClone(DEFAULT_MOB_WAVES_CONFIG),
  fromRound: 1,
  firstWaveSec: 999,
  waveIntervalSec: 999,
  mob: {
    ...structuredClone(DEFAULT_MOB_WAVES_CONFIG.mob),
    championId: "thorne",
    championSource: "fixed",
    modelKey: undefined,
  },
  boss: { ...structuredClone(DEFAULT_MOB_WAVES_CONFIG.boss!), championSource: bossSource },
  special: { ...structuredClone(DEFAULT_MOB_WAVES_CONFIG.special!), championSource: bossSource },
});

const rulesFor = (bossSource: "random" | "fixed"): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: mobWaves(bossSource),
  rogueliteMobs: true,
});

/** Tick until combat of `round` is entered. */
function tickToCombatRound(ctl: MatchController, round: number, maxTicks = 20000): void {
  let n = 0;
  while (!(ctl.phase.phase === "combat" && ctl.phase.round === round) && n < maxTicks) {
    ctl.tick();
    n++;
  }
  expect(ctl.phase.phase, `never reached combat round ${round}`).toBe("combat");
}

const SEED = 0x51ee_d001;

const run = (bossSource: "random" | "fixed", round: number, seed = SEED): MatchController => {
  const ctl = new MatchController(
    `m-rand-${bossSource}-${round}-${seed}`,
    seed,
    allBots(),
    FAST,
    3,
    rulesFor(bossSource),
    SKELETON_ARENA,
  );
  tickToCombatRound(ctl, round);
  return ctl;
};

describe("#289 隨機英雄:出貨的 controller 真的把抽籤傳進 sim 了", () => {
  it("守衛的守衛:骨架內容真的有兩位可抽的英雄,而且是兩份不同的網格", () => {
    cover("mob-289-random-champion");
    expect(Champions.tryGet("sela" as ChampionId)?.modelKey).toBe("champ.sela");
    expect(Champions.tryGet("thorne" as ChampionId)?.modelKey).toBe("champ.thorne");
  });

  it("championSource=random ⇒ 王戴的不是「該回合一般殭屍」那張臉", () => {
    cover("mob-289-random-champion");
    const ctl = run("random", 1);
    const rules = ctl.world.mobRules;
    expect(rules, "沒有武裝殭屍規則").not.toBeNull();
    // 一般殭屍是 thorne(cfg 寫死);王必須是**抽出來的**那位。抽籤池是
    // randomChampionPool() = 有模型 ∩ 白名單,骨架內容下就是 sela + thorne。
    const bossModel = mobModelKeyFor(rules, "boss");
    expect(["champ.sela", "champ.thorne"]).toContain(bossModel);
    expect(mobModelKeyFor(rules, "normal")).toBe("champ.thorne");
    // 「有抽」的證據:同一顆 seed 下,王與特殊殭屍走不同的 slot 鹽,至少有一個
    // 回合會跟一般殭屍不一樣 —— 見下面逐回合那條。
  });

  it("championSource=fixed ⇒ 王沿用一般殭屍那位(pre-#289 的行為原封不動)", () => {
    cover("mob-289-random-champion");
    const rules = run("fixed", 1).world.mobRules;
    expect(mobModelKeyFor(rules, "boss")).toBe("champ.thorne");
    expect(mobModelKeyFor(rules, "special")).toBe("champ.thorne");
  });

  it("逐回合會換人:兩個回合的王不是同一位(抽籤真的吃了 round)", () => {
    cover("mob-289-random-champion");
    // 池子只有兩位,所以逐回合掃到找出不同的那一對;找不到 = 抽籤跟 round 無關。
    const seen = new Set<string>();
    for (const round of [1, 2, 3, 4, 5, 6]) {
      seen.add(mobModelKeyFor(run("random", round).world.mobRules, "boss"));
    }
    expect(seen.size, `六個回合的王都是同一位:${[...seen].join()}`).toBe(2);
  });

  it("同一顆 seed 重跑 ⇒ 同一位王(錄影重播對得起來)", () => {
    cover("mob-289-random-champion");
    const a = mobModelKeyFor(run("random", 2).world.mobRules, "boss");
    const b = mobModelKeyFor(run("random", 2).world.mobRules, "boss");
    expect(a).toBe(b);
  });

  it("不同 seed ⇒ 會抽到不同的王(不是把 seed 忽略掉的假隨機)", () => {
    cover("mob-289-random-champion");
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      seen.add(mobModelKeyFor(run("random", 1, seed).world.mobRules, "boss"));
    }
    expect(seen.size, "八顆不同的 seed 抽出同一位王").toBe(2);
  });

  it("⚠️ world.rng 一滴都沒被抽走:隨機場與指定場的 rng 狀態完全相同", () => {
    cover("mob-289-random-champion");
    // 先證明兩場真的不一樣(否則下面那條會在功能全死時通過)。round 2 是上面
    // 掃出來會抽到 sela 的回合之一;若哪天池子變了,這條會先紅,而不是靜靜失效。
    const rnd = run("random", 2);
    const fix = run("fixed", 2);
    expect(
      mobModelKeyFor(rnd.world.mobRules, "boss"),
      "隨機場與指定場抽到同一位 ⇒ 下面的 rng 比較沒有意義",
    ).not.toBe(mobModelKeyFor(fix.world.mobRules, "boss"));

    // 兩場的 seed 相同、tick 數相同、場上沒有半隻殭屍(firstWaveSec = 999),
    // 唯一的差別就是「王有沒有抽籤」。抽籤若走 world.rng,這兩個數字必定分岔。
    expect(rnd.world.rng.state, "抽籤動到了共用亂數流").toBe(fix.world.rng.state);
    // 連 tick 數都一起釘,免得兩場走了不同長度的路而剛好狀態相同。
    expect(rnd.world.tick).toBe(fix.world.tick);
  });

  it("白名單縮到一位 ⇒ 抽到的一定是那一位(「從策展白名單抽」不是說說而已)", () => {
    cover("mob-289-random-champion");
    // owner 2026-07-29 的裁決:隨機 = 從策展白名單抽。把白名單縮成只有 sela,
    // 王就只能是 sela —— 一個直接讀 `Champions.ids()` 而繞過白名單的實作,在
    // 這裡會有一半的回合抽到 thorne。
    const only = new Whitelist({ champions: ["sela"], items: [], abilities: [] }, false);
    const models = new Set<string>();
    for (const round of [1, 2, 3, 4]) {
      const ctl = new MatchController(
        `m-rand-wl-${round}`,
        SEED,
        allBots(),
        FAST,
        3,
        rulesFor("random"),
        SKELETON_ARENA,
        only,
      );
      tickToCombatRound(ctl, round);
      models.add(mobModelKeyFor(ctl.world.mobRules, "boss"));
    }
    expect([...models]).toEqual(["champ.sela"]);
  });
});
