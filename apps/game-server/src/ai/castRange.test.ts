/**
 * GH#149 —— Tier-0 bot 的施法距離要乘過 #136 的系統倍率
 * (`world.combatEnv.abilityRange`)，⛔ 不是卡面上的 `def.range`。少了它，
 * `skillshot` 照扣魔照上 CD 卻必定射空、`ground` 的 AoE 落在半路、`targeted`
 * 每次 replan 都送出必被拒的指令 —— 三者都汙染 bot 餵出來的平衡數字。
 *
 * ⛔ 倍率不抄出貨值（後台欄位，開票時 0.6、現在 0.8）：夾具自訂一個非中性倍率，
 * 斷言的是**關係**（卡面內、倍率外 ⇒ 不放）。
 * 突變：`resolveAbilityRange(world, abilityDef.range)` 改回 `abilityDef.range` → ① FAIL。
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

/** 夾具倍率 —— ⛔ 不是出貨值：這支閘驗「有沒有乘」，不是「乘了多少」。 */
const ENV_FACTOR = 0.5;
/** SELA 的 Q（skillshot）與 E（ground）共用這個卡面射程。 */
const CARD_RANGE = SELA.abilities.Q.range;
const C = SKELETON_ARENA.zones[0]!.center;

const hero = (w: SimWorld, seat: number, team: number, dx: number): EntityId =>
  spawnChampion(w, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });

/** 敵人擺在 `gap` 處，回傳 bot 這一 tick 送出的施法指令的槽位。 */
function castsAt(gap: number): string[] {
  const w = new SimWorld(SKELETON_ARENA, 3);
  w.combatActive = true;
  w.combatEnv = { ...w.combatEnv, abilityRange: ENV_FACTOR };
  const bot = hero(w, 0, 0, 0);
  hero(w, 1, 1, gap);
  // ⚠️ 先跑一個空 tick：`acquireTarget` 讀的是 `world.step()` 才建起來的空間索引，
  // 少了這一行 bot 連目標都找不到，於是 ① 會因為**錯的理由**變綠。
  w.step(new Map());
  // 只開 Q（skillshot）與 E（ground）—— W 是 `self`，它本來就不看距離。
  const ab = w.abilities.get(bot)!;
  ab.slots.Q.rank = 1;
  ab.slots.E.rank = 1;
  w.health.get(bot)!.mana = 9999;
  const seat = new Seat(asSeatId(0), asTeamId(0), new AIDriver());
  seat.entityId = bot;
  return seat
    .produceIntent(w, 0) // tick 0、seat 0 ⇒ 一定 replan
    .commands.filter((c) => c.kind === "castAbility")
    .map((c) => String(c.slot));
}

describe("GH#149 bot 的施法距離要乘系統倍率 (ai-cast-range)", () => {
  it("★ ① 卡面射程內、倍率射程外 ⇒ 一發都不放", () => {
    const gap = (CARD_RANGE * (ENV_FACTOR + 1)) / 2; // 嚴格介於兩者之間
    expect([gap > CARD_RANGE * ENV_FACTOR, gap < CARD_RANGE]).toEqual([true, true]);
    expect(castsAt(gap), "bot 用未乘倍率的卡面射程施法 —— 射空還照燒魔與冷卻").toEqual([]);
  });

  it("★ ② 倍率射程內 ⇒ 照放（控制組 —— 沒有它 ① 可能只是 bot 從不施法）", () => {
    expect(castsAt(CARD_RANGE * ENV_FACTOR * 0.5).sort()).toEqual(["E", "Q"]);
  });
});
