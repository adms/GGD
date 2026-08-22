/**
 * 走過去放技能 —— `config.cast-approach@1`（owner 2026-08-22:
 * 「超過施法距離人物不會走過去放技能（做成後台開關）」）。
 *
 * 這一條守的是**機制**,而且只守一件事:目標在射程外時,角色**真的移動**,
 * 而且進到射程的那一刻**真的施放**。
 *
 * ⛔ 沒有一條斷言去看距離是多少、走了幾 tick、`maxApproachDistance` 是 24
 * (第零守則:守衛驗機制⛔不驗數字 —— 那三個值住在 config / Zod / admin 三個住處)。
 * ⛔ 也沒有一條去看 `pendingCastApproach()` 這個內部狀態:那是掃屬性代替掃行為
 * (失敗形態 ⑦)。斷言讀的是**身體的座標**與**目標的血條**。
 *
 * ⚠️ 夾具刻意不給任何人 `world.champion` ⇒ `autoAcquirePass` 一個都掃不到,
 * 所以「角色移動了」只可能是接近造成的 —— 少了這一步,一個把整段接近拿掉的
 * 實作會被自動索敵的追擊救活而全綠(失敗形態 ④:斷言方向與缺陷無關)。
 *
 * ── 突變紀錄（真的做過:改壞 → 紅 → 改回來）────────────────────────────────
 *  · `systems/MovementSystem.ts` 末尾的 `castApproachSystem(world)` 刪掉
 *    → 這一條在**斷言 ②** 紅（`expected 0 to be greater than 0`）:目標一滴血
 *    都沒掉。⭐ 而斷言 ① 仍然綠 —— 武裝那一行自己就寫了一次 `moveTarget`,所以
 *    身體照樣走過去,**只是永遠不放**。這正是那個缺陷在畫面上的樣子（角色乖乖
 *    走到臉上然後站著發呆）,也正是為什麼「有沒有移動」單獨拿來斷言是不夠的。
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { Abilities } from "../content/registry";
import { castAbility, resolveAbilityRange } from "./abilitySystem";
import { Stat } from "../stats/statTypes";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type ChampionId,
  type EntityId,
  type SeatId,
} from "../../ids";
import type { AbilityDef } from "../content/defs";
import type { IntentFrame } from "../intents";

const C = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const BOLT_ID = "test.cast-approach-bolt" as AbilityId;
/** 夾具自己的傷害。夠大,任何普攻/回復都蓋不掉它,所以「放出來了」是二元的。 */
const BOLT = 900;

/** 指定型、射程短、沒有成本 —— 唯一擋得住它的閘就是距離。 */
const BOLT_DEF: AbilityDef = {
  id: BOLT_ID,
  name: "fixture 短射程指定彈",
  slot: "Q",
  castType: "targeted",
  maxRank: 1,
  cooldown: [0],
  manaCost: [0],
  range: 3,
  effects: [{ kind: "damage", amount: { flat: BOLT }, damageType: "true" }],
} as unknown as AbilityDef;

function body(world: SimWorld, x: number, team: number): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x, z: C.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana: 500, maxMana: 500, alive: true, shields: [] });
  world.status.set(id, { effects: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(team) });
  const final = {} as Record<Stat, number>;
  final[Stat.HealthRegen] = 0;
  final[Stat.ManaRegen] = 0;
  final[Stat.AttackDamage] = 10;
  final[Stat.AttackSpeed] = 1;
  final[Stat.AttackRange] = 1;
  final[Stat.MoveSpeed] = 6;
  world.stats.set(id, { championId: "sela" as ChampionId, final, dirty: false, sources: [] });
  world.abilities.set(id, {
    slots: {
      Q: { abilityId: BOLT_ID, rank: 1, cooldownRemainingTicks: 0 },
      W: { abilityId: BOLT_ID, rank: 0, cooldownRemainingTicks: 0 },
      E: { abilityId: BOLT_ID, rank: 0, cooldownRemainingTicks: 0 },
      R: { abilityId: BOLT_ID, rank: 0, cooldownRemainingTicks: 0 },
    },
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  return id;
}

describe("超過施法距離 —— 角色走過去再放（config.cast-approach@1）", () => {
  it("目標在射程外:身體真的走進射程,而且到了就真的施放", () => {
    Abilities.register(BOLT_ID, BOLT_DEF);
    const world = new SimWorld(SKELETON_ARENA, 20260822);
    const caster = body(world, C.x - 5, 0);
    const victim = body(world, C.x + 5, 1);
    world.rebuildGrid();

    const startX = world.transform.get(caster)!.pos.x;
    const hp0 = world.health.get(victim)!.hp;
    const range = resolveAbilityRange(world, BOLT_DEF.range);
    // 前提:這一發現在**放不到**。少了這一行,一個射程夠長的夾具會讓整條測試
    // 在證明「原地就能放」而不是「走過去才放」。
    expect(Math.abs(startX - world.transform.get(victim)!.pos.x)).toBeGreaterThan(range);

    // 一次按鍵 —— 舊行為在這裡就回 "out-of-range" 並且什麼都不做。
    expect(castAbility(world, caster, "Q", { type: "entity", entityId: victim })).not.toBe(
      "out-of-range",
    );

    for (let i = 0; i < 120 && world.health.get(victim)!.hp === hp0; i++) world.step(NO_INTENTS);

    const endX = world.transform.get(caster)!.pos.x;
    // ① 真的移動了,而且是**朝目標**移動到射程內
    expect(endX).toBeGreaterThan(startX);
    expect(Math.abs(endX - world.transform.get(victim)!.pos.x)).toBeLessThanOrEqual(range + 1e-6);
    // ② 到了射程內真的施放(⛔ 不問傷害是多少,只問這一發到底有沒有發生)
    expect(hp0 - world.health.get(victim)!.hp).toBeGreaterThan(0);
  });
});
