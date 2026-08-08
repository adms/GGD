/**
 * 進場安裝的接線守衛。走出貨那條路（真 registry + 真 `spawnChampion`），⛔ 沒有
 * 任何 `world.marks.set(...)` 手刻（失敗形態⑤）；⛔ 零出貨數值，斷言全部從夾具
 * 自己的 spec 推導（第零守則⑦）。
 * 突變：`spawnChampion.ts` 的 `installMarksForChampion(...)` 刪掉 → 2 failed。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, THORNE } from "./content/skeleton";
import { Abilities, registerChampion } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { MARK_DURATION_PERMANENT } from "./markLimits";
import type { MarkSpec } from "./marks";
import type { AbilityDef } from "./content/defs";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../ids";

const MARK_ID = "test.trial";
const FIXTURE_INITIAL = 4; // 夾具自己的初始層數，不是任何出貨值
const MARKED_HERO = "test-marked-hero" as ChampionId;

const spec = (initial: number): MarkSpec => ({
  markId: MARK_ID, initial, max: initial,
  durationSec: MARK_DURATION_PERMANENT, resetOn: "match",
});

/** 一支只宣告標記的天生技。`marks` 還不在 `AbilityDef` 上，故走交集。 */
const INNATE = {
  id: "test.marks.passive" as AbilityId, name: "測試標記技",
  slot: "PASSIVE", innateKind: "passive", castType: "self", maxRank: 1,
  cooldown: [0], manaCost: [0], range: 0, effects: [],
  marks: [spec(FIXTURE_INITIAL)],
} as AbilityDef & { readonly marks: readonly MarkSpec[] };

/** 同一個 markId 在 Q 上再宣告一次，初始層數不同 —— 用來讀出「先到先贏」。 */
const DUPE_Q = { ...THORNE.abilities.Q, marks: [spec(FIXTURE_INITIAL + 1)] } as AbilityDef;

beforeAll(() => {
  registerSkeletonContent();
  Abilities.register(INNATE.id, INNATE);
  registerChampion(
    {
      ...THORNE,
      id: MARKED_HERO,
      passiveAbility: INNATE.id,
      abilities: { ...THORNE.abilities, Q: DUPE_Q },
    },
    { overrideAbilities: true },
  );
});

const spawn = (): { world: SimWorld; hero: EntityId } => {
  const world = new SimWorld(SKELETON_ARENA, 20260808);
  const hero = spawnChampion(world, {
    championId: MARKED_HERO,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: SKELETON_ARENA.zones[0]!.center,
    zone: 0,
  });
  return { world, hero };
};

describe("進場安裝 —— 技能文件的 marks 真的發到英雄身上", () => {
  it("⛔ spawn 之後 world.marks 上就有那筆，層數等於文件寫的 initial", () => {
    cover("mi-install");
    const { world, hero } = spawn();
    expect(world.marks.get(hero)?.get(MARK_ID)?.count).toBe(FIXTURE_INITIAL);
  });

  it("⛔ 同一個 markId 被兩支技能宣告：先到先贏，而且衝突不是靜默的", () => {
    cover("mi-first-wins");
    const { world, hero } = spawn();
    expect(world.marks.get(hero)?.get(MARK_ID)?.initial).toBe(FIXTURE_INITIAL);
    expect(world.events.some((e) => e.type === "markInstallConflict")).toBe(true);
  });
});
