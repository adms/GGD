/**
 * ⭐ GH#652 的三個細節 —— owner 2026-08-24:「do it」。
 *
 * ① **後搖取消**(animation cancel):結算**之後**的後搖,一條新指令就砍掉,
 *    ⭐ 而那一發照樣算數。⛔ 前搖不變(走開仍然作廢那一刀)。
 * ② **A 移動的 tie-break**:打**離指令點最近**的,⛔ 不是離角色最近/英雄優先。
 * ③ **視野追擊**:GGD **沒有戰爭迷霧**(`sim/vision.ts` 出貨 `fullVision: true`,
 *    owner 2026-08-23「全視野,就算牆後也看得到」)⇒ 目標永遠不會離開視野,
 *    那條規則在這裡**不成立**。⛔ 不做假的機制,理由寫在 `combatFeel.ts` 的
 *    `leashUnits`(距離牽引就是 GGD 版本的答案,而且它早就在了)。
 *
 * 跑的是真的 `world.step()`(真 OrderSystem / 真 RecoverySystem / 真 targeting),
 * ⛔ 不是手餵 `autoAcquirePass`(失敗形態⑤)。每一條都**兩個方向一起讀** ——
 * 只驗開著那一邊的話,一個「無條件砍後搖」的實作也會全綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Abilities } from "../content/registry";
import { castAbility } from "../abilities/abilitySystem";
import { isRecovering } from "../abilities/abilityRecovery";
import { mobRulesFromConfig, type MobWavesConfigLike } from "../mobs";
import { DEFAULT_MANUAL_ORDER, type ManualOrderRules } from "../combatFeel";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type ChampionId,
  type EntityId,
  type SeatId,
} from "../../ids";
import type { IntentFrame } from "../intents";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
/** 避開柱子與邊界夾的乾淨巷道(autoAcquire.test.ts 的同一條)。 */
const at = (dx: number) => ({ x: Z0.center.x + dx, z: Z0.center.z + 12 });
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const WHIFF = "test.lol.whiff" as AbilityId;

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(WHIFF, {
    id: WHIFF, name: "Whiffable", slot: "Q", maxRank: 1, cooldown: [0.1], manaCost: [0],
    range: 20, targetsEnemies: true, castType: "ground", radius: 3, castTimeSec: 0.6,
    effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100 } }],
  });
});

/** 出貨規則 + 覆蓋想量的那幾格(manualOrder 是 optional,所以先補齊出貨預設)。 */
function tune(w: SimWorld, over: Partial<ManualOrderRules>): void {
  const mo: ManualOrderRules = { ...DEFAULT_MANUAL_ORDER, ...(w.combatFeel.manualOrder ?? {}), ...over };
  w.combatFeel = Object.freeze({ ...w.combatFeel, manualOrder: Object.freeze(mo) });
}

/** 真人名單走 GH#577 開的那扇門(`MobRules.humanSeats`);mobZones 不開,不生怪。 */
function setHumanSeats(w: SimWorld, seats: ReadonlySet<SeatId>): void {
  const cfg = (
    JSON.parse(readFileSync(join(CONTENT, "config/arena-rules.json"), "utf8")) as {
      mobWaves: MobWavesConfigLike;
    }
  ).mobWaves;
  w.mobRules = mobRulesFromConfig(cfg, w.dt, 1, undefined, undefined, seats);
}

/** 揮空一發 ⇒ 後搖上身。回傳世界與施法者。 */
function whiffed(human: boolean): { w: SimWorld; me: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 21);
  setHumanSeats(w, human ? new Set([asSeatId(0)]) : new Set());
  const me = spawnChampion(w, {
    championId: "sela" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
    pos: at(0), zone: 0,
  });
  // 敵人擺遠 —— 這一發必須真的打空,後搖才會武裝(命中會自己取消,那是連段系統)。
  spawnChampion(w, {
    championId: "thorne" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1),
    pos: at(18), zone: 0,
  });
  w.abilities.get(me)!.slots.Q = { abilityId: WHIFF, rank: 1, cooldownRemainingTicks: 0 };
  w.step(NO_INTENTS);
  w.rebuildGrid();
  expect(castAbility(w, me, "Q", { type: "point", point: at(2) })).toBe("ok");
  for (let i = 0; i < 40 && w.abilities.get(me)!.cast; i++) w.step(NO_INTENTS);
  const h = w.health.get(me)!;
  h.mana = h.maxMana = 99999; // 讓「後搖」是唯一可能的拒絕理由
  w.abilities.get(me)!.slots.Q.cooldownRemainingTicks = 0;
  expect(isRecovering(w, me), "前提壞了:這一發沒有揮空").toBe(true);
  return { w, me };
}

const moveOrder = (dx: number) =>
  new Map<SeatId, IntentFrame>([
    [asSeatId(0), { order: { kind: "move" as const, point: at(dx) }, commands: [] }],
  ]);

describe("① 後搖取消 —— 結算之後,一條指令就砍掉", () => {
  it("真人下一條走位指令 ⇒ 後搖當場結束,同一 tick 就能再出手(⛔ 而且不回收那一發)", () => {
    const { w, me } = whiffed(true);
    const hpBefore = w.health.get(me)!.hp;
    w.step(moveOrder(-3));
    expect(isRecovering(w, me), "下了指令而後搖還在 —— animation cancel 沒接上").toBe(false);
    w.abilities.get(me)!.slots.Q.cooldownRemainingTicks = 0;
    expect(castAbility(w, me, "Q", { type: "point", point: at(2) }), "後搖砍了卻還是出不了手").toBe("ok");
    // ⛔ 不回收:傷害早已結算、冷卻早已付掉,砍掉的只有那段承諾。
    expect(w.health.get(me)!.hp).toBe(hpBefore);
    expect(w.events.some((e) => e.type === "recoveryEnd" && e.data.reason === "cancel")).toBe(true);
  });

  it("⛔ bot／沒接 humanSeats 的世界一格都不變 —— 揮空懲罰照吃", () => {
    const { w, me } = whiffed(false);
    w.step(moveOrder(-3));
    expect(isRecovering(w, me), "非真人座位也被放行 = 揮空懲罰從整個 AI 身上消失").toBe(true);
  });

  it("開關關掉 ⇒ 回到 DOTA 式的完整揮空窗口(一鍵 rollback)", () => {
    const { w, me } = whiffed(true);
    tune(w, { recoveryCancelOnOrder: false });
    w.step(moveOrder(-3));
    expect(isRecovering(w, me)).toBe(true);
  });
});

describe("② A 移動打離指令點最近的", () => {
  /** 我在 0;近的敵人在 +2、遠的在 +5;A 點在 +6 ⇒ 兩種排序給出不同答案。 */
  function aClickField(nearestToCursor: boolean): { w: SimWorld; near: EntityId; far: EntityId } {
    const w = new SimWorld(SKELETON_ARENA, 11);
    w.combatActive = true;
    tune(w, { attackMoveNearestToCursor: nearestToCursor });
    spawnChampion(w, {
      championId: "sela" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0), pos: at(0), zone: 0,
    });
    const near = spawnChampion(w, {
      championId: "thorne" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: at(2), zone: 0,
    });
    const far = spawnChampion(w, {
      championId: "thorne" as ChampionId, seatId: asSeatId(2), teamId: asTeamId(1), pos: at(5), zone: 0,
    });
    w.step(NO_INTENTS);
    w.rebuildGrid();
    return { w, near, far };
  }

  const aClick = new Map<SeatId, IntentFrame>([
    [asSeatId(0), { order: { kind: "attackMove" as const, point: at(6) }, commands: [] }],
  ]);

  it("開(出貨)⇒ 咬**離 A 點最近**的那一個,⛔ 不是離我最近的", () => {
    const { w, far } = aClickField(true);
    const me = [...w.champion.keys()][0]!;
    w.step(aClick);
    expect(w.nav.get(me)!.attackTarget, "A 點在遠處那一隻身上,英雄卻咬了腳邊那隻").toBe(far);
  });

  it("關 ⇒ 回到共用排序(離**我**最近的),一鍵 rollback", () => {
    const { w, near } = aClickField(false);
    const me = [...w.champion.keys()][0]!;
    w.step(aClick);
    expect(w.nav.get(me)!.attackTarget).toBe(near);
  });
});
