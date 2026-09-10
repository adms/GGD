/**
 * ⭐⭐ 第十一回合**真的進得去**（GH#1151 A 的進場那一段）。
 *
 * ⚠️⭐ 這條驗的是**行為**，⛔ 不是「有一個欄位」：
 * 跑一場真的 `MatchController` 到最後一回合，然後問「比賽停了沒」。
 *
 * ⭐ 兩個方向都跑：開關**關著**（出貨）⇒ 停在 finalRound；
 * 開關**開著** ＋ 王擊殺達門檻 ⇒ ⭐ **多打一個第十一回合**，⛔ 而且只多一個。
 */
import { describe, it, expect } from "vitest";
import { TICK_HZ } from "@ggd/shared/constants";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { DEFAULT_BURN_CURVE } from "@ggd/shared/sim/fireRing";
import { type FireRingConfig, DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";

/** ⭐ 出貨形狀的火圈 —— 這支測試要問「哪一回合有圈」,⛔ 沒有圈就問不了。 */
const RING: FireRingConfig = {
  startSec: 1,
  shrinkSec: 20,
  minRadius: 0.5,
  burnCurve: [...DEFAULT_BURN_CURVE],
  maxPctPerSec: 1,
  lethalSaveApplies: false,
  roundHardCapSec: 300,
  boss: { extendCombatSec: 180, delayFireRingSec: 180 },
};

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const rules = (round11: Partial<ArenaRules["round11"]>): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  // ⭐ 出貨的 `arena-rules.json` **有** mobWaves（fromRound 3）——
  //   ⛔ 沒有它,第十一回合的生怪整段不會武裝(`world.mobRules` 是 null)。
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  finalRound: 3, // ⭐ 縮短賽制,⛔ 免得測試跑十回合
  round11: {
    enabled: false,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: 7,
    bannerText: "第十一回合",
    maxAliveZombies: 0,
    spawnRampSec: 0,
    waveTable: { eventIntervalSec: 0, difficultyBase: 1, baseSpawnCount: 0, events: [] },
    bossStrengthMult: 1,
    bossScaleFloor: 1,
    bossScaleCeil: 1,
    bombardment: { enabled: false, telegraphSec: 0, damagePctOfMaxHp: 0, radius: 0, crowdBias: 0 },
    // ⭐ 從出貨 fallback 展開 ⇒ ⛔ 這一支不必因為別人加一格取捨迴圈參數就改一次
    //   （而且它要的正是「全部惰性」，`DEFAULT_ARENA_RULES` 的那一份就是）。
    survivalLoop: { ...DEFAULT_ARENA_RULES.round11.survivalLoop },
    deadPlayersControlBoss: false,
    possession: { escapeWindowSec: 0, telegraphRadius: 1, inheritBossAugments: false },
    scoring: { survivalWeight: 0, scoreMultiplier: 1, minContributionForFullSurvival: 0 },
    ...round11,
  },
});

/** 跑到比賽結束（或撞到守衛），回傳打完的回合數。 */
function runToEnd(ctl: MatchController, guard = 40000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n++ < guard) ctl.tick();
  expect(ctl.phase.phase, "比賽要在守衛之內結束").toBe("matchEnd");
  return ctl.phase.round;
}

describe("第十一回合的進場（GH#1151 A）", () => {
  it("⛔ 開關**關著**（出貨）⇒ 比賽停在 finalRound", () => {
    const ctl = new MatchController("r11-off", 7, allBots(), FAST, undefined, rules({}));
    expect(runToEnd(ctl)).toBe(3);
  });

  it("⛔ 開著但**王擊殺沒到門檻** ⇒ 一樣停在 finalRound", () => {
    const ctl = new MatchController("r11-few", 7, allBots(), FAST, undefined, rules({ enabled: true }));
    recordBossKill(ctl.round11BossKillsForTest, 1); // 只有 1 隻,門檻是 2
    expect(runToEnd(ctl)).toBe(3);
  });

  it("⭐⭐ 開著 ＋ 達門檻 ⇒ **多打一個回合**，⛔ 而且只多一個", () => {
    const ctl = new MatchController("r11-on", 7, allBots(), FAST, undefined, rules({ enabled: true }));
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    // ⭐ 只多一個：`shouldEnterRound11` 只在「剛打完 finalRound」成立
    //   ⇒ 第 4 回合打完後 `isLastRound()` 回 true ⇒ ⛔ 不會有第 5 回合。
    expect(runToEnd(ctl)).toBe(4);
  });

  it("⭐ 第十一回合**沒有商店**，⭐ 而且長度用 `durationSec`", () => {
    const ctl = new MatchController("r11-shop", 7, allBots(), FAST, undefined, rules({ enabled: true }));
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    let n = 0;
    // 跑到第十一回合的 combat
    while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
    expect(ctl.phase.round, "有跑到第十一回合").toBe(4);
    expect(ctl.phase.phase).toBe("combat");
    // ⛔ 商店關著
    expect(ctl.world.economyOpen, "第十一回合⛔沒有商店").toBe(false);
    // ⭐ 長度來自設定,⛔ 不是賽制的 combatMaxTicks(20)
    expect(ctl.phase.ticksLeft).toBeGreaterThan(FAST.combatMaxTicks);
    expect(ctl.phase.ticksLeft).toBeLessThanOrEqual(7 * TICK_HZ);
  });
});

describe("第十一回合的世界（GH#1151 A 第 2 條）", () => {
  it("⭐ **沒有火圈** —— ⛔ 而第十回合（同樣是 royale）**有**", () => {
    const ctl = new MatchController(
      "r11-ring", 7, allBots(), FAST, undefined, rules({ enabled: true }),
      undefined, undefined, undefined, RING,
    );
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    let n = 0;
    const ringByRound = new Map<number, boolean>();
    let prev = "";
    while (ctl.phase.phase !== "matchEnd" && n++ < 40000) {
      ctl.tick();
      const k = `${ctl.phase.round}/${ctl.phase.phase}`;
      if (k !== prev && ctl.phase.phase === "combat") {
        ringByRound.set(ctl.phase.round, (ctl.world as { fireRingRules?: unknown }).fireRingRules != null);
      }
      prev = k;
    }
    // ⭐ 兩個方向：finalRound（3）有圈、⛔ 第十一回合（4）沒有。
    expect(ringByRound.get(3), "第十回合(royale)⭐有火圈").toBe(true);
    expect(ringByRound.get(4), "第十一回合⛔沒有火圈").toBe(false);
  });
});

describe("第十一回合的生怪（GH#1151 B）", () => {
  const WAVES = { eventIntervalSec: 1, difficultyBase: 1.15, baseSpawnCount: 0, events: [{ kind: "normal", weight: 100 }] };

  it("⭐ `waveTable` 真的變成 `MobRules`，⛔ 而其他回合不受影響", () => {
    const ctl = new MatchController(
      "r11-mobs", 7, allBots(), FAST, undefined,
      rules({ enabled: true, maxAliveZombies: 40, spawnRampSec: 0, waveTable: WAVES }),
      undefined, undefined, undefined, RING,
    );
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    let n = 0, prev = "";
    const capByRound = new Map<number, number | undefined>();
    while (ctl.phase.phase !== "matchEnd" && n++ < 40000) {
      ctl.tick();
      const k = `${ctl.phase.round}/${ctl.phase.phase}`;
      if (k !== prev && ctl.phase.phase === "combat") {
        capByRound.set(ctl.phase.round, (ctl.world.mobRules as { maxAlivePerZone?: number } | null)?.maxAlivePerZone);
      }
      prev = k;
    }
    // ⭐ 第十一回合（4）吃到設定的 40；⛔ 第十回合（3）沒有。
    expect(capByRound.get(4), "第十一回合⭐用 round11 的上限").toBe(40);
    expect(capByRound.get(3), "⛔ 第十回合不受影響").not.toBe(40);
  });

  it("⭐⭐ **漸進生成**：上限從 0 長上去，⛔ 不是一開場就滿載", () => {
    const ctl = new MatchController(
      "r11-ramp", 7, allBots(), FAST, undefined,
      rules({ enabled: true, maxAliveZombies: 100, spawnRampSec: 5, waveTable: WAVES }),
      undefined, undefined, undefined, RING,
    );
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    let n = 0;
    while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
    const capNow = (): number => (ctl.world.mobRules as { maxAlivePerZone: number }).maxAlivePerZone;
    ctl.tick();
    const early = capNow();
    for (let i = 0; i < 5 * 30; i++) ctl.tick();
    const late = capNow();
    // ⛔ 開場遠低於上限、⭐ 而 rampSec 之後到頂 —— 兩個方向都量。
    expect(early, "⛔ 開場不可以滿載").toBeLessThan(20);
    expect(late, "⭐ ramp 之後到頂").toBe(100);
  });
});

describe("第十一回合的王強度（GH#1151 D）", () => {
  const WAVES = { eventIntervalSec: 0.2, difficultyBase: 1.15, baseSpawnCount: 0, events: [{ kind: "normal", weight: 100 }] };

  it("⭐⭐ 依**累計已生成**成長 —— ⛔ 而清場**不會**讓它變回去", () => {
    const ctl = new MatchController(
      "r11-boss", 7, allBots(), FAST, undefined,
      rules({
        enabled: true, maxAliveZombies: 30, spawnRampSec: 0, waveTable: WAVES,
        bossStrengthMult: 2, bossScaleFloor: 1, bossScaleCeil: 8,
      }),
      undefined, undefined, undefined, RING,
    );
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    let n = 0;
    while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
    expect(ctl.round11BossScaleForTest, "⭐ 開場是下界").toBe(1);
    for (let i = 0; i < 600; i++) ctl.tick();
    const grown = ctl.round11BossScaleForTest;
    expect(grown, "⭐ 生了怪之後王變強").toBeGreaterThan(1);
    // ⭐⭐ 現在把場上清空 —— ⛔ 王**不可以**跟著變弱。
    for (const id of [...ctl.world.mob.keys()]) ctl.world.destroy(id);
    expect(ctl.round11BossScaleForTest, "⛔ 清場不會讓王變弱").toBe(grown);
  });

  it("⛔ 其他回合的怪**不算** —— 第十一回合的累計從 0 起算", () => {
    const ctl = new MatchController(
      "r11-boss0", 7, allBots(), FAST, undefined,
      rules({
        enabled: true, maxAliveZombies: 30, spawnRampSec: 0, waveTable: WAVES,
        bossStrengthMult: 2, bossScaleFloor: 1, bossScaleCeil: 8,
      }),
      undefined, undefined, undefined, RING,
    );
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    let n = 0;
    // 先跑完第 1–3 回合（那幾回合也在生怪）
    while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
    expect(ctl.round11BossScaleForTest, "⛔ 前面幾回合的怪不算").toBe(1);
  });
});

describe("第十一回合的一次性獎勵帳本（GH#1151 C）", () => {
  const WAVES = { eventIntervalSec: 0.2, difficultyBase: 1.15, baseSpawnCount: 0, events: [{ kind: "normal", weight: 100 }] };

  it("⭐ 進場時**清空** —— ⛔ 上一回合的帳本不可以讓這一回合領不到", () => {
    const ctl = new MatchController(
      "r11-claims", 7, allBots(), FAST, undefined,
      rules({ enabled: true, maxAliveZombies: 10, spawnRampSec: 0, waveTable: WAVES }),
      undefined, undefined, undefined, RING,
    );
    recordBossKill(ctl.round11BossKillsForTest, 1);
    recordBossKill(ctl.round11BossKillsForTest, 2);
    // 在進第十一回合**之前**先把帳本弄髒
    ctl.round11ClaimsForTest.claim("drop", "boss-7");
    expect(ctl.round11ClaimsForTest.claimed("drop", "boss-7")).toBe(true);
    let n = 0;
    while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
    // ⭐ 進場之後那一筆不見了 ⇒ 這一回合領得到
    expect(ctl.round11ClaimsForTest.claimed("drop", "boss-7"), "⛔ 帳本不可以跨回合").toBe(false);
    expect(ctl.round11ClaimsForTest.claim("drop", "boss-7")).toBe(true);
  });
});
