/**
 * 練習靶（GH#657，owner 2026-08-24「練習模式**預設對方三個英雄**但**不會移動
 * 也不會攻擊、施放技能**」）—— **承重那一條線**。
 *
 * 驗的是機制，⛔ 不是數字（第二守則）：
 *   ① 練習房開場，對面**真的有**靶子實體（數量從 `PracticeRules` 推導，
 *      ⛔ 不抄字面值 —— 那是後台的一格，抄進來就是第四個住處）；
 *   ② ⭐ **承重**：把玩家貼在靶子臉上跑一整段，靶子**一次都沒有**索到目標
 *      （＝不還手）；
 *   ③ ⭐ **反向**：同一情境、`dummyFightsBack: true` ⇒ 靶子**會**索到目標。
 *      少了它，一個「把全場自動索敵都關掉」的錯誤實作會全部通過（失敗形態④）；
 *   ④ `dummyCount: 0` ⇒ 對面一個實體都沒有（＝這個功能出現之前的練習房）。
 *
 * ⛔ **不驗**「靶子有沒有走動」：`DummyDriver` 不送 intent ⇒ 沒有 order ⇒
 * 沒有 `moveTarget`，而②已經證明它連目標都沒有 —— 追擊唯一的入口就是目標。
 *
 * 突變（驗過，見 commit 訊息）：拿掉 `OrderSystem.autoAcquirePass` 裡的
 * `inertSeats` 那一段 ⇒ ② 紅（靶子當場索到玩家），而 ③④ 仍然綠。
 */
import { describe, it, expect } from "vitest";
import { asSeatId, type EntityId } from "@ggd/shared/ids";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "@ggd/shared/content";
import { DEFAULT_PRACTICE_RULES, type PracticeRules } from "@ggd/shared/content";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";

const FAST = { champSelectTicks: 5, intermissionTicks: 10, combatMaxTicks: 60, resolutionTicks: 5 };
const MOB_WAVES: MobWavesConfig = { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 };
const RULES: ArenaRules = { ...DEFAULT_ARENA_RULES, mobWaves: MOB_WAVES };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function build(practice: PracticeRules): MatchController {
  const ctl = new MatchController("practice", 4242, allBots(), FAST, 3, RULES, SKELETON_ARENA);
  ctl.practice = practice;
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  expect(ctl.phase.phase).toBe("combat");
  return ctl;
}

/** 上場的靶子（＝玩家那一隊之後的那幾個座位裡，真的進了世界的那些）。 */
function dummyEntities(ctl: MatchController): EntityId[] {
  const out: EntityId[] = [];
  for (const seat of ctl.seats.values()) {
    if (seat.teamId !== 0 && seat.entityId !== null) out.push(seat.entityId);
  }
  return out;
}

/**
 * 把玩家貼在第一個靶子身上跑 `ticks` 拍，回答「靶子**有沒有**索到過目標」。
 *
 * ⚠️ 每一拍都重新貼上去：靶子沒有目標就不會被追擊拉住，而玩家是 bot、會自己走位
 * —— 不釘的話「沒索到敵」可能只是因為兩個人早就走散了（失敗形態④）。
 */
function dummyEverAcquired(ctl: MatchController, ticks: number): boolean {
  const player = ctl.seats.get(asSeatId(0))!.entityId!;
  const dummy = dummyEntities(ctl)[0]!;
  for (let i = 0; i < ticks; i++) {
    const dt = ctl.world.transform.get(dummy)!;
    const pt = ctl.world.transform.get(player)!;
    pt.pos = { x: dt.pos.x, z: dt.pos.z };
    pt.zone = dt.zone;
    ctl.tick();
    if (ctl.world.nav.get(dummy)?.attackTarget !== null) return true;
  }
  return false;
}

describe("練習靶 (GH#657)", () => {
  it("① 練習房開場，對面站著 `dummyCount` 個靶子實體", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES });
    expect(dummyEntities(ctl).length).toBe(DEFAULT_PRACTICE_RULES.dummyCount);
  });

  it("② ⭐ 承重：玩家貼臉打一整段，靶子**一次都沒有**索到目標（被打不還手）", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES });
    expect(dummyEverAcquired(ctl, 120)).toBe(false);
  });

  it("③ ⭐ 反向：`dummyFightsBack` 開著 ⇒ 同一情境下靶子**會**索到目標", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES, dummyFightsBack: true });
    expect(dummyEverAcquired(ctl, 120)).toBe(true);
  });

  it("④ `dummyCount: 0` ⇒ 對面一個實體都沒有（這個功能出現之前的練習房）", () => {
    const ctl = build({ ...DEFAULT_PRACTICE_RULES, dummyCount: 0 });
    expect(dummyEntities(ctl).length).toBe(0);
  });
});
