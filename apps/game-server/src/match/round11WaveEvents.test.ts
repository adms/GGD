/**
 * ⭐⭐ 第十一回合的**波次組合**真的在發（GH#1151 B / #924）。
 *
 * > owner 2026-09-01（逐字）：「這個殭屍組合⋯組合項目可以包含
 * >  **殭屍 特殊殭屍 殭屍王** 的不同英雄組合 甚至加入**場景效果**」
 *
 * ⚠️⭐ 在此之前 `pickRound11Event` **一次都沒被呼叫過** ——
 * `waveTable.events` 那張加權表**從來沒抽過**，⛔ 而設定齊全、後台畫得出來。
 *
 * ⭐ 這一支數的是**出貨生怪門**發出來的 `mobSpawn` / `mobBossSpawn` 事件，
 * ⛔ 不是「有沒有呼叫某個函式」。
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

const rules = (
  events: { kind: string; weight: number }[],
  baseSpawnCount = 4,
): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  finalRound: 3,
  round11: {
    ...DEFAULT_ARENA_RULES.round11,
    enabled: true,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: 60,
    // ⭐ 場上上限要夠大,⛔ 否則量到的「沒生出來」其實是被上限夾掉。
    maxAliveZombies: 200,
    spawnRampSec: 0,
    deadPlayersControlBoss: false,
    waveTable: { eventIntervalSec: 2, difficultyBase: 1, baseSpawnCount, events },
    bombardment: { ...DEFAULT_ARENA_RULES.round11.bombardment, enabled: false },
  },
});

function toRound11(ctl: MatchController): void {
  recordBossKill(ctl.round11BossKillsForTest, 1);
  recordBossKill(ctl.round11BossKillsForTest, 2);
  let n = 0;
  while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
  expect(ctl.phase.round, "有跑到第十一回合").toBe(4);
}

/** ⭐ 跑 `secs` 秒，數出貨生怪門發出來的事件。 */
function tally(ctl: MatchController, secs: number) {
  const out = { normal: 0, special: 0, boss: 0, unhandled: [] as string[] };
  for (let i = 0; i < Math.round(secs * TICK_HZ); i++) {
    ctl.tick();
    for (const ev of ctl.world.events) {
      if (ev.type === "mobSpawn") {
        const k = String(ev.data.kind);
        if (k === "normal") out.normal++;
        if (k === "special") out.special++;
      }
      if (ev.type === "mobBossSpawn") out.boss++;
      if (ev.type === "round11EventUnhandled") out.unhandled.push(String(ev.data.kind));
    }
  }
  return out;
}

const make = (id: string, events: { kind: string; weight: number }[], base = 4) =>
  new MatchController(id, 7, allBots(), FAST, undefined, rules(events, base));

/**
 * ⭐⭐ 跑一場決定性的比賽，回傳 6 秒內的生怪計數。
 *
 * ⚠️⚠️ ⭐ **一定要有基線**：第十一回合的**背景生怪系統**也在發 `mobSpawn`
 * ⇒ ⛔ 「有量到 special」證明不了那是波次事件生的。
 * ⭐ 同一顆種子、同樣的 tick 序列 ⇒ 兩場唯一的差別就是**那張波次表**。
 */
const run = (id: string, events: { kind: string; weight: number }[], base = 4) => {
  const ctl = make(id, events, base);
  toRound11(ctl);
  return tally(ctl, 6);
};

/** ⭐ 基線：**空的波次表** ⇒ `pickRound11Event` 回 null ⇒ 一個波次事件都不發。 */
const BASE = () => run("wave-ab", []);

describe("波次組合真的在發（GH#924）", () => {
  it("⭐⭐ 只留「特殊殭屍」⇒ **比基線多**（⛔ 而基線本身就有背景生怪）", () => {
    const withEvents = run("wave-ab", [{ kind: "special", weight: 1 }]);
    expect(withEvents.special, "⭐ 波次事件確實多生了特殊殭屍").toBeGreaterThan(BASE().special);
  });

  it("⭐⭐ 只留「殭屍王」⇒ **王真的召出來**（⭐ 走王自己那扇門）", () => {
    const withEvents = run("wave-ab", [{ kind: "boss", weight: 1 }]);
    expect(withEvents.boss, "⭐ 王召出來了").toBeGreaterThan(BASE().boss);
  });

  it("⛔ 基數 0 ⇒ 波次事件**一隻都不多生**（⭐ 一鍵轉回去）", () => {
    const zero = run("wave-ab", [{ kind: "special", weight: 1 }], 0);
    expect(zero.special, "⛔ 這一格轉 0 ⇒ 與基線逐位元相同").toBe(BASE().special);
  });

  it("⛔⛔ 認不得的 kind ⇒ **出聲**，⛔ 不是安靜地丟掉", () => {
    // ⚠️ ⭐ 這是本批最重要的一條:一個安靜被丟掉的事件,看起來跟
    //   「那一格權重太低所以沒抽到」**一模一樣** —— fail-open 沒錯,靜默才是缺陷。
    const t = run("wave-ab", [{ kind: "reviveCircle", weight: 1 }]);
    expect(t.unhandled.length, "⭐ 它有喊").toBeGreaterThan(0);
    expect(t.unhandled[0], "⭐ 而且指名是哪一個 kind").toBe("reviveCircle");
    expect(BASE().unhandled.length, "⭐ 而基線⛔ 不會喊").toBe(0);
  });
});
