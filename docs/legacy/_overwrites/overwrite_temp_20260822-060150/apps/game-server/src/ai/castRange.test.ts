/**
 * GH#149 —— Tier-0 bot 的施法距離要**乘過 #136 的系統倍率**
 * (`world.combatEnv.abilityRange`)，⛔ 不是卡面上的 `def.range`。
 *
 * 沒有這一條，bot 以為自己的射程是實際的 1/倍率 倍：`skillshot` 照扣魔照上 CD
 * 卻必定射空、`ground` 的 AoE 落在半路、`targeted` 每次 replan 都送出一個必被拒
 * 的指令。三者都直接汙染 bot 餵出來的命中率／法力／冷卻平衡數字。
 *
 * ⛔ 倍率**不抄出貨值**（`combat-env.json` 是後台欄位，開票時 0.6、現在 0.8）——
 * 夾具自己設一個非中性的倍率，斷言的是**關係**：卡面射程內、倍率射程外 ⇒ 不施法。
 *
 * 突變：三處 `resolveAbilityRange(world, abilityDef.range)` 改回
 * `abilityDef.range` → ①「倍率外」FAIL（bot 又開始亂丟）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent, SELA } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import { AIDriver } from "./Tier0Brain";
import { Seat } from "../seat/Seat";

beforeAll(() => registerSkeletonContent());

/** 夾具倍率 —— ⛔ 不是出貨值，這支閘驗的是「有沒有乘」，不是「乘了多少」。 */
const ENV_FACTOR = 0.5;
/** SELA 的 Q（skillshot）與 E（ground）共用這個卡面射程。 */
const CARD_RANGE = SELA.abilities.Q.range;

const C = SKELETON_ARENA.zones[0]!.center;

function hero(w: SimWorld, seat: number, team: number, dx: number): EntityId {
  return spawnChampion(w, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });
}

/** 敵人擺在 `gap` 處，回傳 bot 這一 tick 送出的施法指令的槽位。 */
function castsAt(gap: number): string[] {
  const w = new SimWorld(SKELETON_ARENA, 3);
  w.combatActive = true;
  w.combatEnv = { ...w.combatEnv, abilityRange: ENV_FACTOR };
  const bot = hero(w, 0, 0, 0);
  hero(w, 1, 1, gap);
  // ⚠️ 先跑一個空 tick：`acquireTarget` 讀的是 `world.step()` 才建起來的空間索引，
  // 少了這一行 bot 連目標都找不到，於是①會因為**錯的理由**變綠。
  w.step(new Map());
  // 只開 Q（skillshot）與 E（ground）—— W 是 `self`，它**本來就不看距離**，
  // 留著會讓「有沒有施法」這個問題永遠回 yes。
  const ab = w.abilities.get(bot)!;
  ab.slots.Q.rank = 1;
  ab.slots.E.rank = 1;
  w.health.get(bot)!.mana = 9999;

  const seat = new Seat(asSeatId(0), asTeamId(0), new AIDriver());
  seat.entityId = bot;
  const frame = seat.produceIntent(w, 0); // tick 0、seat 0 ⇒ 一定 replan
  return frame.commands.filter((c) => c.kind === "castAbility").map((c) => String(c.slot));
}

describe("GH#149 bot 的施法距離要乘系統倍率 (ai-cast-range)", () => {
  it("★ ① 卡面射程內、倍率射程外 ⇒ 一發都不放", () => {
    const gap = CARD_RANGE * (ENV_FACTOR + 1) / 2; // 嚴格介於兩者之間
    expect(gap).toBeGreaterThan(CARD_RANGE * ENV_FACTOR);
    expect(gap).toBeLessThan(CARD_RANGE);
    expect(castsAt(gap), "bot 用未乘倍率的卡面射程施法 —— 必定射空還照燒魔與冷卻").toEqual([]);
  });

  it("★ ② 倍率射程內 ⇒ 照放（控制組 —— 沒有它 ① 可能只是 bot 從不施法）", () => {
    expect(castsAt(CARD_RANGE * ENV_FACTOR * 0.5).sort()).toEqual(["E", "Q"]);
  });
});
