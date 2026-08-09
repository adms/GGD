/**
 * 技能吸血 (`Stat.SpellVamp`) —— 行為守衛。owner 2026-08-10：
 * 「至尊魔戒 附加技能吸血 20%」。
 *
 * 在這一格屬性存在之前,`combat/damage.ts` 的吸血整段掛在
 * `pkt.origin === "basic"` 底下,所以**技能傷害永遠不吸血**,而
 * 落魂的嗜血劍 (godie-i00l) 的「全能吸血+30%」出貨成了普通吸血 ——
 * 它的 authoringNote 早就指名了這個缺口與這個修法。
 *
 * 三條,而第三條才是這一批真正的風險：
 *
 *  ① 技能傷害真的吸血了（機制會不會發生）。
 *  ② 普攻**不吃** SpellVamp、技能**不吃** Lifesteal —— 兩格是分開的。
 *     ⛔ 這條在防「把 gate 從 `=== "basic"` 換成 `dmg > 0` 然後兩邊共用
 *     同一格」那種寫法：那樣做①也會綠,而所有帶吸血的道具會突然連技能
 *     一起吸（失敗形態④：斷言方向跟缺陷無關）。
 *  ③ ⭐ 火圈 / 花 / 守衛塔 / 小怪 的傷害**不可以**吸血。
 *     ⛔ 最容易寫錯的一條：`origin !== "basic"` 這個鬆讀法會讓站在火圈裡
 *     的人靠火圈**回血**,而畫面上只是「他好像不太會死」,沒有任何錯誤。
 *
 * ⚠️ 吸血率一律由測試自己塞,不抄任何出貨值（CLAUDE.md：出貨數值住進測試
 * ＝第四個住處）。這裡驗的是「機制會不會發生」,不是「20% 還是 30%」。
 *
 * 突變紀錄（都真的做過）:
 *   · `vampsAsAbility ? final[SpellVamp] : effectiveLifesteal(...)`
 *     整段換回 `effectiveLifesteal(...)`        → sv-ability 紅
 *   · gate 的 `pkt.origin.startsWith("ability:")` 換成 `pkt.origin !== "basic"`
 *                                                → sv-not-environment 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { combatResolveSystem } from "./combat/damage";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";

const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(() => registerSkeletonContent());

/** 一發傷害之後,施放者自己回了多少血。 */
function vampGain(opts: {
  origin: string;
  lifesteal?: number;
  spellVamp?: number;
}): number {
  const world = new SimWorld(SKELETON_ARENA, 9);
  world.combatActive = true;
  const mk = (seat: number, team: number, dx: number): EntityId =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
    });
  const hero = mk(0, 0, 0);
  const foe = mk(1, 1, 2);
  world.step(new Map());

  const sc = world.stats.get(hero)!;
  sc.final[Stat.Lifesteal] = opts.lifesteal ?? 0;
  sc.final[Stat.SpellVamp] = opts.spellVamp ?? 0;

  // 挖一個坑,否則回血會被 maxHp 夾掉,兩邊都量到 0。
  const hp = world.health.get(hero)!;
  hp.hp = hp.maxHp * 0.2;

  const before = hp.hp;
  world.damageQueue.push({
    source: hero,
    target: foe,
    amount: 100,
    type: "magic",
    crit: false,
    origin: opts.origin,
  });
  combatResolveSystem(world);
  return world.health.get(hero)!.hp - before;
}

/** 只影響絕對值,每一條的兩邊都一樣,所以它不是被驗的數字。 */
const RATE = 0.5;

describe("技能吸血 —— Stat.SpellVamp", () => {
  it("① 技能傷害真的吸血", () => {
    cover("sv-ability");
    const gain = vampGain({ origin: "ability:test-nuke", spellVamp: RATE });
    expect(gain).toBeGreaterThan(0);
  });

  it("② 兩格是分開的 —— 普攻不吃 SpellVamp、技能不吃 Lifesteal", () => {
    cover("sv-separate");
    // 只有 SpellVamp 的人打普攻 → 不回血
    expect(vampGain({ origin: "basic", spellVamp: RATE })).toBe(0);
    // 只有 Lifesteal 的人放技能 → 不回血
    expect(vampGain({ origin: "ability:test-nuke", lifesteal: RATE })).toBe(0);
    // 夾具前提：兩條配對的路各自是通的,否則上面兩個 0 沒有意義
    expect(vampGain({ origin: "basic", lifesteal: RATE })).toBeGreaterThan(0);
    expect(vampGain({ origin: "ability:test-nuke", spellVamp: RATE })).toBeGreaterThan(0);
  });

  it("③ ⭐ 環境傷害（火圈/花/守衛塔/小怪）不吸血", () => {
    cover("sv-not-environment");
    for (const origin of ["fireRing", "flower", "guardian", "mob"]) {
      expect(vampGain({ origin, spellVamp: RATE })).toBe(0);
    }
  });
});
