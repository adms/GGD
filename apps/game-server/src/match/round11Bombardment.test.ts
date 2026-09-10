/**
 * ⭐⭐ 第十一回合的**大轟炸**真的在跑（GH#1151 F）。
 *
 * ⚠️⭐ 在此之前 `round11Bombardment.ts` **零 production 消費端** ——
 * `bombardment` 那五格後台調得到、⛔ 而轉了什麼都不會發生（第一守則：那是裝飾）。
 *
 * ⭐ 這一支⛔ 不看血量差（第十一回合場上還有別的傷害來源，那把尺分不出來），
 * ⭐ 它數的是**出貨傷害管線上帶著 `origin: "round11Bombardment"` 的封包** ——
 * ⛔ 一個 no-op 的實作數出來就是 0。
 */
import { describe, it, expect } from "vitest";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";
import { TICK_HZ } from "@ggd/shared/constants";

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const TELEGRAPH = 4;
const rules = (over: Partial<ArenaRules["round11"]["bombardment"]> = {}): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  finalRound: 3,
  round11: {
    ...DEFAULT_ARENA_RULES.round11,
    enabled: true,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: 60,
    maxAliveZombies: 0,
    spawnRampSec: 0,
    deadPlayersControlBoss: false, // ⭐ 這一支只問轟炸,⛔ 不要換邊一起動
    // ⭐ 波次表只留轟炸 ⇒ 排程一到就是它（⛔ 不靠運氣抽中）。
    waveTable: { eventIntervalSec: 2, difficultyBase: 1, events: [{ kind: "bombardment", weight: 1 }] },
    bombardment: {
      enabled: true,
      telegraphSec: TELEGRAPH,
      damagePctOfMaxHp: 0.5,
      radius: 12,
      crowdBias: 0.6,
      ...over,
    },
  },
});

/** ⭐ 跑到第十一回合的 combat。 */
function toRound11(ctl: MatchController): void {
  recordBossKill(ctl.round11BossKillsForTest, 1);
  recordBossKill(ctl.round11BossKillsForTest, 2);
  let n = 0;
  while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
  expect(ctl.phase.round, "有跑到第十一回合").toBe(4);
}

interface Beat {
  tick: number;
  telegraphs: number;
  hits: number;
}

/** ⭐ 跑 `secs` 秒，逐 tick 記下**預警**與**落地傷害封包**。 */
function trace(ctl: MatchController, secs: number): Beat[] {
  const out: Beat[] = [];
  for (let i = 0; i < Math.round(secs * TICK_HZ); i++) {
    ctl.tick();
    let telegraphs = 0;
    let hits = 0;
    for (const ev of ctl.world.events) {
      if (ev.type === "round11Bombardment") telegraphs++;
      if (ev.type === "damage" && ev.data.origin === "round11Bombardment") hits++;
    }
    if (telegraphs > 0 || hits > 0) out.push({ tick: ctl.world.tick, telegraphs, hits });
  }
  return out;
}

describe("大轟炸真的在跑（GH#1151 F）", () => {
  it("⭐⭐ 預警先出現，⛔ 而**倒數期間一發傷害都沒有**", () => {
    const ctl = new MatchController("bomb-on", 7, allBots(), FAST, undefined, rules());
    toRound11(ctl);
    const beats = trace(ctl, TELEGRAPH + 3);
    const firstTele = beats.find((b) => b.telegraphs > 0);
    expect(firstTele, "⭐ 預警圈真的發出去了").toBeDefined();
    const firstHit = beats.find((b) => b.hits > 0);
    expect(firstHit, "⭐ 而且真的落地了").toBeDefined();
    // ⛔⛔ 倒數期間零傷害 —— ⭐ 落地一定在預警之後至少 telegraphSec 秒。
    const gapSec = (firstHit!.tick - firstTele!.tick) / TICK_HZ;
    expect(gapSec, "⛔ 倒數前不傷害").toBeGreaterThanOrEqual(TELEGRAPH);
  });

  it("⭐⭐ 一發轟炸**只結算一次** —— ⛔ 不是每 tick 都打", () => {
    const ctl = new MatchController("bomb-once", 7, allBots(), FAST, undefined, rules());
    toRound11(ctl);
    const beats = trace(ctl, TELEGRAPH + 6);
    const hitTicks = beats.filter((b) => b.hits > 0).map((b) => b.tick);
    expect(hitTicks.length, "⭐ 落地只有**一個** tick 有傷害").toBe(1);
  });

  it("⭐ 傷害 ＝ **最大生命的一半**（⛔ 不吃護甲：它走真傷）", () => {
    const ctl = new MatchController("bomb-amt", 7, allBots(), FAST, undefined, rules());
    toRound11(ctl);
    let seen: { amount: number; target: number }[] = [];
    for (let i = 0; i < Math.round((TELEGRAPH + 6) * TICK_HZ) && seen.length === 0; i++) {
      ctl.tick();
      seen = ctl.world.events
        .filter((e) => e.type === "damage" && e.data.origin === "round11Bombardment")
        .map((e) => ({ amount: e.data.amount as number, target: e.data.target as number }));
    }
    expect(seen.length, "有量到落地的封包").toBeGreaterThan(0);
    for (const p of seen) {
      const hp = ctl.world.health.get(p.target as never);
      expect(hp, "目標還在").toBeDefined();
      // ⚠️ `amount` 是**打進去之後**的量;真傷⛔ 不減免 ⇒ 它就是 maxHp × 0.5。
      expect(p.amount).toBeCloseTo(hp!.maxHp * 0.5, 3);
    }
  });

  it("⛔ 開關關掉 ⇒ **一個預警、一發傷害都沒有**（⭐ 一鍵 rollback）", () => {
    const ctl = new MatchController("bomb-off", 7, allBots(), FAST, undefined, rules({ enabled: false }));
    toRound11(ctl);
    expect(trace(ctl, TELEGRAPH + 3), "⛔ 整段完全安靜").toEqual([]);
  });

  it("⛔ 半徑 0 ⇒ 有預警**而沒有人被打到**（⭐ 證明命中真的吃那一格）", () => {
    const ctl = new MatchController("bomb-r0", 7, allBots(), FAST, undefined, rules({ radius: 0 }));
    toRound11(ctl);
    const beats = trace(ctl, TELEGRAPH + 3);
    // ⚠️ 半徑 0 ⇒ `pickBombardmentTarget` 仍然挑得到人(權重全 1),⭐ 但沒有人在圈內。
    expect(beats.some((b) => b.telegraphs > 0), "⭐ 預警照樣出現").toBe(true);
    expect(beats.some((b) => b.hits > 0), "⛔ 而沒有任何人被打到").toBe(false);
  });
});
