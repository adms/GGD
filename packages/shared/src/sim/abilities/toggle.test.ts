/**
 * 【切換】的**行為**守衛 —— 20-01 風王結界 · 70-00 紮根。
 *
 * 每一條都跑真的 `SimWorld.step()`：真的 `castAbility`、真的
 * `basicAttackSystem` 揮刀、真的 `combatResolveSystem` 排乾傷害佇列。
 * 斷言讀的是 `world.health.get(x).mana / .hp` —— snapshot 每 tick 送上線、
 * 玩家法力條與血條讀的那一份（#125）。
 *
 * ⚠️ 沒有一條斷言長成「`def.toggle.upkeepCadence === 'perAttack'`」。那是屬性
 * 掃描（失敗形態 ⑦），把 `toggleUpkeepSystem` 整支換成空函式它照樣綠。
 *
 * ⛔ 沒有任何一條抄出貨數值。這裡的 30 / 50 / 400 是**這個測試自己造的技能**
 * 的參數，不是 20-01 的出貨值 —— 出貨值住在 `content/` 與 schema 的三個住處，
 * 抄進來就是第四個（CLAUDE.md 第零守則）。
 *
 * ── 兩個方向，第二個才是重點 ────────────────────────────────────────────
 *  ① 開啟後**維持成本真的每次普攻扣掉**（而開關成本是另一個數字）。
 *  ② 資源不足時**自動關閉，而且 onExit 真的發生**。
 *
 * ② 是這一支的靈魂：只驗手動關閉的話，自動關閉那條路壞掉不會紅，而畫面上
 * 「風王鐵槌有一半的時候不出現」看起來就只是隨機。
 *
 * 突變紀錄（都真的做過）：
 *   · `toggle.ts` 拿掉 `if (tg.exitOnResourceEmpty !== false) exitToggle(…)`
 *     那一行（改成純 `continue`）→ `tg-auto-exit` 紅（切換沒關、鐵槌沒打）。
 *   · `toggle.ts` 的 `perAttack` 節奏閘改成無條件扣款 → `tg-upkeep` 紅。
 *   · `exitToggle` 拿掉 `runEffects(tg.onExit …)` → `tg-auto-exit` 紅。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { Abilities } from "../content/registry";
import { castAbility } from "./abilitySystem";
import { isToggleOn } from "./toggle";
import { zEffectDefUnion } from "../../content/schema/effect";
import { zAbilityToggle } from "../../content/schema/ability";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../../ids";
import type { AbilityDef } from "../content/defs";

const C = SKELETON_ARENA.zones[0]!.center;
const TOGGLE_ID = "test.gale" as AbilityId;
/** 開關成本 vs 維持成本 —— 兩個**不同**的數字，這正是它們是兩格的理由。 */
const SWITCH_COST = 50;
const UPKEEP_COST = 30;
/** onExit（「風王鐵槌」）的傷害。夠大，減傷之後仍然看得出來。 */
const HAMMER = 400;

function body(world: SimWorld, x: number, team: number, mana = 500): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x, z: C.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.health.set(id, { hp: 5000, maxHp: 5000, mana, maxMana: 500, alive: true, shields: [] });
  world.status.set(id, { effects: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(team) });
  const final = {} as Record<Stat, number>;
  // 回復歸零：`regenSystem` 每 tick 都跑，否則它會補回維持成本剛扣掉的法力，
  // 而斷言就變成在量兩個系統的差。
  final[Stat.HealthRegen] = 0;
  final[Stat.ManaRegen] = 0;
  final[Stat.AttackDamage] = 10;
  final[Stat.AttackSpeed] = 2;
  final[Stat.AttackRange] = 4;
  world.stats.set(id, { championId: "sela" as ChampionId, final, dirty: false, sources: [] });
  world.abilities.set(id, {
    slots: {
      Q: { abilityId: TOGGLE_ID, rank: 0, cooldownRemainingTicks: 0 },
      W: { abilityId: TOGGLE_ID, rank: 1, cooldownRemainingTicks: 0 },
      E: { abilityId: TOGGLE_ID, rank: 0, cooldownRemainingTicks: 0 },
      R: { abilityId: TOGGLE_ID, rank: 0, cooldownRemainingTicks: 0 },
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

/** 造一支切換技並登錄它。`over` 讓每一條測試改自己要驗的那一格。 */
function registerToggle(over: Partial<AbilityDef["toggle"] & object> = {}): void {
  const hammer = zEffectDefUnion.parse({
    kind: "damageArea",
    damageType: "true", // 減免不是這一條要驗的東西
    amount: { flat: HAMMER },
    radius: 6,
    includeOrigin: true,
  });
  const toggle = zAbilityToggle.parse({
    upkeepCadence: "perAttack",
    upkeepCost: [UPKEEP_COST],
    onExit: [hammer],
    ...over,
  });
  Abilities.register(TOGGLE_ID, {
    id: TOGGLE_ID,
    name: "測試用切換技",
    slot: "W",
    castType: "self",
    maxRank: 1,
    cooldown: [60],
    manaCost: [SWITCH_COST],
    range: 0,
    effects: [],
    recoverySec: 0, // 後搖會擋掉普攻，而普攻正是這一支要量的東西
    toggle,
  } as AbilityDef);
}

function rig(over: Partial<AbilityDef["toggle"] & object> = {}): {
  world: SimWorld;
  hero: EntityId;
  dummy: EntityId;
} {
  registerToggle(over);
  const world = new SimWorld(SKELETON_ARENA, 20260808);
  world.combatActive = true;
  const hero = body(world, C.x, 0);
  const dummy = body(world, C.x + 2, 1);
  world.nav.get(hero)!.attackTarget = dummy;
  world.rebuildGrid();
  return { world, hero, dummy };
}

const step = (w: SimWorld, n: number): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

describe("【切換】開關成本 · 維持成本 · 資源耗盡自動關閉", () => {
  it("① 開關成本與維持成本是兩個數字，維持成本每揮一刀收一次", () => {
    cover("tg-upkeep");
    const { world, hero } = rig();
    const hp = world.health.get(hero)!;
    const before = hp.mana;

    expect(castAbility(world, hero, "W", { type: "self" })).toBe("ok");
    // 開關成本現在就付掉了，維持成本一毛都還沒收。
    expect(before - hp.mana).toBe(SWITCH_COST);
    expect(isToggleOn(world.abilities.get(hero)!, "W")).toBe(true);

    // 真的揮刀。數幾刀由 `basicAttack` 事件決定 —— 不預設攻速換算出幾 tick
    // 一刀（那會把斷言綁死在一個平衡數值上）。
    let swings = 0;
    const afterCast = hp.mana;
    for (let i = 0; i < 30; i++) {
      world.step(new Map());
      swings += world.events.filter((e) => e.type === "basicAttack" && e.data.source === hero)
        .length;
    }
    expect(swings).toBeGreaterThan(1); // 沒揮刀就什麼都沒證明
    expect(afterCast - hp.mana).toBe(swings * UPKEEP_COST);
  });

  it("② MP 不足 → 自動關閉，而且 onExit（風王鐵槌）真的打出去", () => {
    cover("tg-auto-exit");
    const { world, hero, dummy } = rig();
    expect(castAbility(world, hero, "W", { type: "self" })).toBe("ok");

    // 剛好付不出下一次維持成本。
    world.health.get(hero)!.mana = UPKEEP_COST - 1;
    const dummyHpBefore = world.health.get(dummy)!.hp;

    step(world, 30);

    expect(isToggleOn(world.abilities.get(hero)!, "W")).toBe(false);
    // ⭐ 這一條是重點：自動關閉走的是與手動關閉同一個 onExit。
    // 鐵槌 400 遠大於普攻 10，所以「有沒有挨到鐵槌」不會被普攻淹沒。
    expect(dummyHpBefore - world.health.get(dummy)!.hp).toBeGreaterThan(HAMMER / 2);
  });

  it("③ 手動再按一次 = 關閉，走的是同一個 onExit（節奏 none 也一樣）", () => {
    cover("tg-manual-exit");
    // 70-00 紮根的形狀：完全沒有維持成本，但關閉照樣要發生 onExit。
    const { world, hero, dummy } = rig({ upkeepCadence: "none", upkeepCost: [0] });
    expect(castAbility(world, hero, "W", { type: "self" })).toBe("ok");
    const manaAfterOpen = world.health.get(hero)!.mana;
    const dummyHpBefore = world.health.get(dummy)!.hp;

    // ⚠️ 冷卻已經被開啟那一次轉滿了。關閉仍然要通得過 —— 關不掉的切換技
    // 等於把方向盤從玩家手上拿走。
    expect(world.abilities.get(hero)!.slots.W.cooldownRemainingTicks).toBeGreaterThan(0);
    expect(castAbility(world, hero, "W", { type: "self" })).toBe("ok");

    expect(isToggleOn(world.abilities.get(hero)!, "W")).toBe(false);
    // 「每次[開關]耗[MP]」—— 關閉也付一次開關成本。
    expect(manaAfterOpen - world.health.get(hero)!.mana).toBe(SWITCH_COST);
    step(world, 2); // 讓傷害佇列排乾
    expect(dummyHpBefore - world.health.get(dummy)!.hp).toBeGreaterThan(HAMMER / 2);
  });
});
