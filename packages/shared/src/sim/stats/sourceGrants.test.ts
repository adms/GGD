/**
 * 授權格 —— 【格擋】與【暴擊來源】現在**四種來源都授予得起**（owner GH#299 第 2 · 6 條）。
 *
 * ── 這一條守的是什麼，以及為什麼不是機制 ──────────────────────────────────
 * 格擋與暴擊的**機制**早就出貨，也各自有守衛（`block.test.ts` /
 * `block.shipped.test.ts` / `critStrike*.test.ts`）。這一批補的是**寫入點**：
 * 2026-08-09 之前 `ModifierSource.block` 只有道具與天生技寫得到、
 * `critStrike` 只有道具寫得到，所以「三選一暴擊卡」「這支大招期間 3 倍暴擊」
 * 「接下來 5 秒內格擋」在編輯器裡沒有形狀可以填。
 *
 * ⚠️ 斷言讀的是**出貨的消費端**（`rollCritStrike` 的倍率、`blockCutFor` 的減傷），
 * ⛔ 沒有一條去看 `ModifierSource.critStrike` 這個欄位在不在 —— 一個把 grant 完美
 * 存進 source 卻沒有人讀的實作必須在這裡紅（失敗形態 ⑦：掃屬性代替掃行為）。
 * ⚠️ 也沒有任何出貨數值：夾具用 `chance: 1` 讓機制可觀測，不是去釘機率是多少。
 *
 * 突變紀錄（每一個都真的做過、真的紅）：
 *   · `economy/draft.ts` 的 `...sourceGrants(def)` 刪掉 → 「augment」那兩列紅
 *   · `effects/applyBuff.ts` 非疊層路徑的 `...sourceGrants(e)` 刪掉 → 「applyBuff」紅
 *   · `abilities/abilityPassives.ts` 的 `...sourceGrants(block)` 刪掉 → 「天生技」紅
 *   · 同檔的 `!hasSourceGrant(block)` 改回 `!block.block` → **最後那一條**紅
 *     ⚠️ 上面三列**全部照樣綠** —— 它們的夾具同時帶 block 與 critStrike，
 *     所以 `!block.block` 對它們仍然是 false。只授予暴擊的一階才問得出這道閘，
 *     而那正是失敗形態 ②（第一版漏了它，這條突變當時是綠的）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { Abilities, Augments, registerChampion } from "../content/registry";
import { spawnChampion } from "../spawnChampion";
import { applyAugmentPick } from "../economy/draft";
import { runEffects } from "../effects/effectRunner";
import { blockCutFor } from "../combat/block";
import { rollCritStrike } from "../combat/critStrike";
import type { AbilityDef, AugmentDef } from "../content/defs";
import type { BlockGrant } from "../combat/block";
import type { CritStrikeGrant } from "../combat/critStrike";
import { asSeatId, asTeamId, type AbilityId, type AugmentId, type ChampionId, type EntityId } from "../../ids";

const Z0 = SKELETON_ARENA.zones[0]!;
// `chance: 1` / `fraction: 1` 讓**機制**可觀測；⛔ 不是在釘出貨數值是多少。
const BLOCK: BlockGrant = { damageTypes: ["physical"], chance: 1, fraction: 1 };
const CRIT: CritStrikeGrant = { chance: 1, damageMult: 7, lifestealFraction: 1 };
const AUG = "fixture-grant.aug" as AugmentId;
const INNATE = "fixture-grant.passive" as AbilityId;
const GRANTER = "fixture-granter" as ChampionId;
const CRIT_ONLY = "fixture-crit-only.passive" as AbilityId;
const CRIT_HERO = "fixture-crit-only" as ChampionId;

beforeAll(() => {
  registerSkeletonContent();
  Augments.register(AUG, {
    id: AUG, name: "f", description: "f", tier: "silver", weight: 1, tags: [],
    block: BLOCK, critStrike: CRIT,
  } as AugmentDef);
  // ⚠️ `modifiers` / `hooks` / `auras` 全空是刻意的：一支**只**授予暴擊或格擋的
  // 天生技必須照樣掛上 source（`hasSourceGrant` 守的就是這個空）。
  Abilities.register(INNATE, {
    id: INNATE, name: "f", slot: "PASSIVE", innateKind: "passive", castType: "self",
    maxRank: 1, cooldown: [0], manaCost: [0], range: 0, effects: [],
    passive: { ranks: [{ block: BLOCK, critStrike: CRIT }] },
  } as AbilityDef);
  registerChampion({ ...THORNE, id: GRANTER, passiveAbility: INNATE });
  // ⭐ 只授予**暴擊**、其他六種 payload 全空的一階 —— `hasSourceGrant` 那道空值閘
  // 唯一擋得住的東西。用上面那份「同時帶 block 與 critStrike」的夾具驗不出來：
  // `!block.block` 對它照樣是 false，source 照樣掛上（測試綠、功能死）。
  Abilities.register(CRIT_ONLY, {
    ...(Abilities.get(INNATE) as AbilityDef), id: CRIT_ONLY,
    passive: { ranks: [{ critStrike: CRIT }] },
  } as AbilityDef);
  registerChampion({ ...THORNE, id: CRIT_HERO, passiveAbility: CRIT_ONLY });
});

/** 一張表，三個授權面 —— 每一列只換「這份 grant 怎麼進到那個身體上」。 */
const SURFACES: readonly { name: string; champion: ChampionId; install(w: SimWorld, id: EntityId): void }[] = [
  {
    name: "三選一增益卡 (kind:augment)",
    champion: "thorne" as ChampionId,
    install: (w, id) => void applyAugmentPick(w, { entity: id, tier: "silver", choices: [AUG], picked: null }, AUG),
  },
  {
    name: "限時增益 applyBuff (kind:buff) —— 主動技能就是這一格",
    champion: "thorne" as ChampionId,
    install: (w, id) =>
      runEffects([{ kind: "applyBuff", modifiers: [], duration: 5, block: BLOCK, critStrike: CRIT }], {
        world: w, caster: id, rank: 1, targets: [id], origin: "test", rng: w.rng,
      }),
  },
  // 天生技那一列的 grant 在 spawn 時就掛上了，所以 install 是空的。
  { name: "天生技被動 (kind:passive)", champion: GRANTER, install: () => {} },
];

function bodyWith(surface: (typeof SURFACES)[number], armed: boolean): { w: SimWorld; id: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, 20260809);
  const id = spawnChampion(w, {
    championId: armed ? surface.champion : ("thorne" as ChampionId),
    seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: Z0.center.x, z: Z0.center.z }, zone: 0,
  });
  if (armed) surface.install(w, id);
  return { w, id };
}

describe("格擋 / 暴擊的授權格 —— 四種來源同一條路", () => {
  for (const surface of SURFACES) {
    it(`${surface.name}：暴擊真的乘進去、格擋真的擋下來；沒掛的對照組兩樣都沒有`, () => {
      const on = bodyWith(surface, true);
      const off = bodyWith(surface, false);
      // 暴擊：讀出貨消費端算出來的傷害，不是讀欄位。倍率相乘 ⇒ 有 grant 的一定更大。
      expect(rollCritStrike(on.w, on.id, 100, 1, false).amount).toBeGreaterThan(
        rollCritStrike(off.w, off.id, 100, 1, false).amount,
      );
      // 格擋：讀真的被扣掉多少（`combat/damage.ts` 抽乾迴圈唯一的入口）。
      expect(blockCutFor(on.w, on.id, "physical", 100, 500, 0)).toBeGreaterThan(0);
      expect(blockCutFor(off.w, off.id, "physical", 100, 500, 0)).toBe(0);
    });
  }

  it("⛔ 只授予暴擊、屬性表全空的一階，source 照樣要掛上（失敗形態 ②）", () => {
    const w = new SimWorld(SKELETON_ARENA, 20260809);
    const id = spawnChampion(w, {
      championId: CRIT_HERO, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: Z0.center.x, z: Z0.center.z }, zone: 0,
    });
    expect(rollCritStrike(w, id, 100, 1, false).amount).toBeGreaterThan(100);
  });
});
