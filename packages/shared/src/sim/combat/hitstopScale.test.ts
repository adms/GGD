/**
 * ⭐ 定格時長倍率 `combat-feel.hitstop.scale`（GH#646）的閘。
 *
 * owner：「hitstop 先設定為0 求順暢為主」—— 出貨 0 = **攻守全不凍**。
 * ⚠️ G1 那兩格（holdsVictimWalk / stuckGuard）管的是「定格期間誰的腳被按住」，
 * 這一格管「定格**存不存在**」—— 攻擊者的凍結（BasicAttack / Cast / Recovery
 * 的暫停全讀 `world.hitstop`）只有這一格關得掉，所以斷言讀的是
 * `world.hitstop` 兩張表本身，⛔ 不是淨位移。
 *
 * 儀器（失敗形態④）：每一條都先斷言「攻擊真的落在人身上」—— 否則「打不到」
 * 也會讓零凍結變綠。scale 1 的「回舊行為」不是釘數字，是跟**沒有 config 的
 * 預設世界**逐位元比對（同 seed 決定性）。
 *
 * 突變紀錄：把 `combat/damage.ts` 的 `hitstopTicks = scaleHitstopTicks(...)`
 * 那一行拿掉 → 第一條紅（出貨 scale 0 下攻守照凍），恢復後綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { combatFeelFromDoc, COMBAT_FEEL_SCHEMA, type CombatFeelRules } from "../combatFeel";

beforeAll(() => registerSkeletonContent());

const HERE = dirname(fileURLToPath(import.meta.url));
const SHIPPED = JSON.parse(
  readFileSync(join(HERE, "../../../../../content/config/combat-feel.json"), "utf8"),
) as { hitstop?: { scale?: number } };

const ZC = SKELETON_ARENA.zones[0]!.center;

interface Run {
  hits: number; // 儀器:傷害真的落在受害者身上
  aFrozen: number; // 攻擊者身上 hitstop > 0 的 tick 數
  vFrozen: number; // 受害者身上 hitstop > 0 的 tick 數
  vStun: number; // 受害者身上 hitstun > 0 的 tick 數
}

/** 一位攻擊者貼身連打一位站樁的受害者 90 tick,逐 tick 讀兩張凍結表。 */
function runFight(feel?: CombatFeelRules): Run {
  const world = new SimWorld(SKELETON_ARENA, 11);
  world.combatActive = true;
  if (feel) world.combatFeel = feel;
  const victim: EntityId = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: ZC.x, z: ZC.z },
    zone: 0,
  });
  const attacker: EntityId = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: ZC.x + 1.2, z: ZC.z },
    zone: 0,
  });
  world.stats.get(attacker)!.final[Stat.AttackSpeed] = 4;
  const out: Run = { hits: 0, aFrozen: 0, vFrozen: 0, vStun: 0 };
  for (let i = 0; i < 90; i++) {
    for (const id of [victim, attacker]) {
      const hp = world.health.get(id)!;
      hp.hp = hp.maxHp; // 死了就沒有「凍結」可量
    }
    world.step(new Map());
    if ((world.hitstop.get(attacker) ?? 0) > 0) out.aFrozen++;
    if ((world.hitstop.get(victim) ?? 0) > 0) out.vFrozen++;
    if ((world.hitstun.get(victim) ?? 0) > 0) out.vStun++;
    for (const e of world.events) {
      if (e.type === "damage" && (e.data as { target?: EntityId }).target === victim) out.hits++;
    }
  }
  return out;
}

const docWithScale = (scale: number): CombatFeelRules =>
  combatFeelFromDoc({ id: "combat-feel", schema: COMBAT_FEEL_SCHEMA, hitstop: { scale } });

describe("hitstop 時長倍率 (GH#646)", () => {
  it("⭐ scale 0 ⇒ 連攻擊者也零凍結 tick(hitstun 一併不生成)", () => {
    const r = runFight(docWithScale(0));
    expect(r.hits, "攻擊必須真的落在人身上(儀器)").toBeGreaterThan(0);
    expect(r.aFrozen, "攻擊者不可以有任何凍結 tick").toBe(0);
    expect(r.vFrozen, "受害者不可以有任何凍結 tick").toBe(0);
    expect(r.vStun, "hitstun 只在 hitstop > 0 時生成,也要歸零").toBe(0);
  });

  it("scale 1 ⇒ 回舊行為 —— 與沒有 config 的預設世界逐位元相同,而且真的有凍結", () => {
    const one = runFight(docWithScale(1));
    const legacy = runFight(); // DEFAULT_COMBAT_FEEL:程式 fallback scale = 1
    expect(one.hits).toBeGreaterThan(0);
    expect(one.aFrozen, "舊節拍下攻擊者要真的凍(機制還在)").toBeGreaterThan(0);
    expect(one.vFrozen).toBeGreaterThan(0);
    expect(one).toEqual(legacy);
  });

  it("出貨文件走的就是這一格:scale 0(owner:「hitstop 先設定為0 求順暢為主」)", () => {
    // 從出貨 JSON 推導,⛔ 不抄字面值:normalize 之後的值必須等於文件裡那一格。
    const rules = combatFeelFromDoc({ id: "combat-feel", schema: COMBAT_FEEL_SCHEMA, ...SHIPPED });
    expect(rules.hitstop?.scale, "出貨文件的 scale 沒有活著走過 normalize").toBe(
      SHIPPED.hitstop?.scale,
    );
    const r = runFight(rules);
    expect(r.hits).toBeGreaterThan(0);
    // owner 的裁決:出貨 0 ⇒ 全不凍。他哪天調回 > 0,這兩條要跟著他的新裁決走。
    expect(r.aFrozen + r.vFrozen, "出貨設定下不可以有任何凍結 tick").toBe(0);
  });
});
