/**
 * ⭐ GH#662 —— 「沒標極性的純減益，**淨化拔得掉**」的行為守衛。
 *
 * ⛔ 這一支驗的是**機制**，不是數字（第二守則）：斷言全部是「那一份來源還在不在」
 * 與「移速有沒有回到掛上去之前」，⛔ 沒有任何出貨值。
 *
 * 三個方向一起讀（少一個方向，某一種壞掉的實作就會過）：
 *   ① 純減益 → 拔得掉
 *   ② 旋鈕關掉 → 拔不掉（＝ rollback 真的接到行為上，第一守則的收尾）
 *   ③ 混了方向的代價型自我增益 → **拔不掉**（⛔ 不可以把狂化當減益吃掉）
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { DEFAULT_DISPEL_RULES, type DispelRules } from "../dispelRules";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

function rig(rules?: Partial<DispelRules>): { world: SimWorld; hero: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 11);
  world.combatActive = true;
  world.dispelRules = { ...DEFAULT_DISPEL_RULES, ...rules };
  const hero = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return { world, hero };
}

function fire(world: SimWorld, hero: EntityId, e: EffectDef): void {
  const ctx: EffectContext = {
    world,
    caster: hero,
    rank: 1,
    targets: [hero],
    origin: "test:infer",
    rng: world.rng,
  };
  runEffects([e], ctx);
}

/** 身上還掛著幾份 `applyBuff` 來源（`buff:` 前綴就是那條掛載路徑寫下的 id）。 */
function buffSources(world: SimWorld, hero: EntityId): number {
  return (world.stats.get(hero)?.sources ?? []).filter((s) => s.id.startsWith("buff:")).length;
}

const PURGE: EffectDef = {
  kind: "dispel",
  shape: "single",
  pools: { buffs: true },
  polarity: "debuff",
} as EffectDef;

/** 一份**整份往下拉**的來源（減速），作者兩格都沒填。 */
const SLOW: EffectDef = {
  kind: "applyBuff",
  applyTo: "self",
  duration: 10,
  modifiers: [{ stat: "ms", op: "pctMult", value: -0.5 }],
} as EffectDef;

/** 代價型自我增益：攻速上去、回血下去。⛔ 它是增益。 */
const FRENZY: EffectDef = {
  kind: "applyBuff",
  applyTo: "self",
  duration: 10,
  modifiers: [
    { stat: "as", op: "pctAdd", value: 1.0 },
    { stat: "healthRegen", op: "flat", value: -10 },
  ],
} as EffectDef;

describe("沒標極性的純減益推論成 debuff (GH#662)", () => {
  it("① 出貨設定下：整份負值的 applyBuff 被「淨化敵方減益」拔得掉", () => {
    const { world, hero } = rig();
    fire(world, hero, SLOW);
    expect(buffSources(world, hero)).toBe(1);
    fire(world, hero, PURGE);
    expect(buffSources(world, hero)).toBe(0);
  });

  it("② 後台把推論關掉 ⇒ 逐位元回到舊行為（拔不掉）", () => {
    const { world, hero } = rig({ inferDebuffFromNegativeModifiers: false });
    fire(world, hero, SLOW);
    fire(world, hero, PURGE);
    expect(buffSources(world, hero)).toBe(1);
  });

  it("③ 混了方向的代價型增益 ⛔ 不被推論成減益（拔不掉）", () => {
    const { world, hero } = rig();
    fire(world, hero, FRENZY);
    fire(world, hero, PURGE);
    expect(buffSources(world, hero)).toBe(1);
  });

  it("④ 作者明寫 dispellable:false 仍然贏（內部冷卻記帳不吃自我淨化）", () => {
    const { world, hero } = rig();
    fire(world, hero, { ...SLOW, dispellable: false } as EffectDef);
    fire(world, hero, PURGE);
    expect(buffSources(world, hero)).toBe(1);
  });

  it("⑤ 疊層路徑（stackKey）也吃得到推論 —— ⛔ 不是只有非疊層那一條", () => {
    const { world, hero } = rig();
    fire(world, hero, { ...SLOW, stackKey: "infer-test" } as EffectDef);
    expect(buffSources(world, hero)).toBe(1);
    fire(world, hero, PURGE);
    expect(buffSources(world, hero)).toBe(0);
  });
});
