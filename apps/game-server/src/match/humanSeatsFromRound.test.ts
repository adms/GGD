/**
 * GH#1033 —— `humanSeats` 從 **round 1** 就在 sim 裡，⛔ 不再跟著 `mobWaves.fromRound` 走。
 *
 * ── 病 ────────────────────────────────────────────────────────────────────────
 * `MatchController.enterCombat` 只在殭屍波武裝的那一段（round ≥ `mobWaves.fromRound`，出貨 3）
 * 把真人名單交進 `MobRules.humanSeats`；其餘回合走 `endCombatMobs` ⇒ `world.mobRules = null`。
 * ⇒ sim 的六個消費端（LoL 索敵模型 · idle 自動索敵 · 後搖取消 · 打帶跑窗口 · 殭屍王優先打玩家
 * · 反擊接管）在 round 1–2 把真人當 bot。#999 在真的 MatchController 上量到的，⛔ 不是推論。
 *
 * ── 藥 ────────────────────────────────────────────────────────────────────────
 * 開關 `arena-rules.humanSeatsFromRound`（出貨 1；3 ＝ 舊行為）。殭屍波沒武裝時規則表照樣交進 sim，
 * 只是 `autoWaves: false` ＋ 零個 zone ⇒ 一隻都不生。⭐ 走 GH#577 開的同一扇門，⛔ 不開第二個協定欄位。
 *
 * ── 這一支量的是「玩家真的會碰到」的那一件事 ────────────────────────────────
 * 六個消費端裡最便宜、最直接的觀察點是 GH#637 的打帶跑窗口：`armMoveOrderNoAggro` **只有**真人座位
 * 會寫 `world.moveOrderNoAggroUntil`。一次離散的點地板 ⇒ 有名單就武裝、沒名單就一個位元都不寫。
 * ⚠️ 波次刻意拉到 0.2 秒一波（出貨 1 秒／2 秒）：要證明的是「round 1 **一隻都不會生**」，慢波次會讓
 * 「沒生」與「還沒到時間」長得一模一樣（一把只驗過單邊的尺）。
 *
 * 突變（2026-09-06 驗過）：`enterCombat` 的 `else if (this.rules.mobWaves && humanSeatsDue)` 改成
 * `else if (false)` ⇒ 第一條紅（round 1 沒有名單、窗口沒武裝）；第二條（舊行為）照樣綠 —— 它量的
 * 正是「沒接的那一半」。
 */
import { describe, it, expect } from "vitest";
import { asSeatId, type EntityId } from "@ggd/shared/ids";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { HumanDriver } from "../seat/HumanDriver";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 600, resolutionTicks: 5 };
const ME = asSeatId(0);
const seats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: i !== 0,
    championId: i === 0 ? "sela" : undefined,
  }));
/** 出貨的 `fromRound: 3` 沿用 —— 這條測的就是「3 之前」。 */
const MOB_WAVES = { ...DEFAULT_MOB_WAVES_CONFIG, firstWaveSec: 0.2, waveIntervalSec: 0.2 };
const rulesWith = (humanSeatsFromRound: number): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: MOB_WAVES,
  rogueliteMobs: true,
  humanSeatsFromRound,
});

function toCombatRound(ctl: MatchController, round: number): void {
  let n = 0;
  while (!(ctl.phase.phase === "combat" && ctl.phase.round === round) && n++ < 20000) ctl.tick();
  expect(ctl.phase.round, `never reached combat round ${round}`).toBe(round);
}

interface Probe {
  humanSeatsHasMe: boolean;
  autoWaves: boolean | undefined;
  /** 這一回合場上同時最多幾隻殭屍 */
  mobsSeen: number;
  /** 一次離散的點地板之後，GH#637 的窗口有沒有被武裝（只有真人座位會被寫） */
  windowArmed: boolean;
}

/** 進到 `round` 的戰鬥，點一次地板，跑 90 tick（＝ 3 秒，夠 0.2 秒一波的排程跑十幾波）。 */
function probe(ctl: MatchController, human: HumanDriver, round: number): Probe {
  toCombatRound(ctl, round);
  ctl.tick();
  const me = ctl.seats.get(ME)!.entityId as EntityId;
  const humanSeatsHasMe = ctl.world.mobRules?.humanSeats?.has(ME) === true;
  const autoWaves = ctl.world.mobRules?.autoWaves;
  const t = ctl.world.transform.get(me)!;
  human.mailbox.push({ order: { kind: "move", point: { x: t.pos.x + 2, z: t.pos.z } } } as never);
  let mobsSeen = 0;
  let windowArmed = false;
  for (let i = 0; i < 90 && ctl.phase.phase === "combat"; i++) {
    ctl.tick();
    mobsSeen = Math.max(mobsSeen, ctl.world.mob.size);
    // 絕對 tick 的到期規則：窗口內 ⇔ `tick < 值`。round 1 武裝過的值到了 round 3 早就過期，
    // 所以這一格量的是**這一回合**有沒有重新武裝，⛔ 不是「map 裡還有沒有那個 key」。
    const until = ctl.world.moveOrderNoAggroUntil.get(me);
    if (until !== undefined && ctl.world.tick < until) windowArmed = true;
  }
  return { humanSeatsHasMe, autoWaves, mobsSeen, windowArmed };
}

function match(rules: ArenaRules): { ctl: MatchController; human: HumanDriver } {
  const ctl = new MatchController("m-hs", 11, seats(), FAST, 3, rules, SKELETON_ARENA);
  const human = new HumanDriver();
  ctl.seats.get(ME)!.setDriver(human);
  return { ctl, human };
}

describe("GH#1033 —— 真人名單從第一回合就在 sim 裡（arena-rules.humanSeatsFromRound）", () => {
  it("⭐ 出貨 1：round 1 有名單、窗口會武裝、一隻殭屍都沒有；round 3 的答案一模一樣", () => {
    const { ctl, human } = match(rulesWith(1));
    const r1 = probe(ctl, human, 1);
    expect(r1.humanSeatsHasMe, "round 1 的規則表裡沒有真人座位").toBe(true);
    expect(r1.autoWaves, "round 1 的規則表沒有把排程關掉").toBe(false);
    expect(r1.mobsSeen, "round 1 生了殭屍 —— 只送名單的那條路漏了怪").toBe(0);
    expect(r1.windowArmed, "round 1 點地板沒有武裝打帶跑窗口（真人被當成 bot）").toBe(true);
    // 同一份輸入在 round 3（殭屍波真的武裝了）—— 兩套門合流到同一個答案。
    const r3 = probe(ctl, human, 3);
    expect(r3.humanSeatsHasMe).toBe(true);
    expect(r3.windowArmed).toBe(true);
    expect(r3.autoWaves, "round 3 走的是殭屍波那條門，排程要開著").not.toBe(false);
  });

  it("填 3 ＝ 舊行為：round 1 沒有名單也不武裝，round 3 才有（一鍵 rollback 真的回得去）", () => {
    const { ctl, human } = match(rulesWith(3));
    const r1 = probe(ctl, human, 1);
    expect(r1.humanSeatsHasMe).toBe(false);
    expect(r1.windowArmed).toBe(false);
    expect(r1.mobsSeen).toBe(0);
    const r3 = probe(ctl, human, 3);
    expect(r3.humanSeatsHasMe).toBe(true);
    expect(r3.windowArmed).toBe(true);
  });
});
