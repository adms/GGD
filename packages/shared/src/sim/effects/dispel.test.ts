/**
 * 【淨化】`dispel` 的行為守衛（A4b，#278）。
 *
 * ── 這一檔要釘死的四件事 ──────────────────────────────────────────────────
 *
 *  ①  `dispellable` **兩個方向都是閘**。只驗「標了 false 的活下來」會被一個
 *      「什麼都不拔」的實作騙過去（失敗形態 ④：斷言方向跟缺陷無關），
 *      所以每一條都同時讀「該走的走了」與「該留的留了」。
 *
 *  ②  `world.dispelRules` 的旋鈕**真的接到行為上**。這是第一守則的收尾 ——
 *      一格存得起來、後台畫得出來、而引擎不讀的欄位，跟沒做是一樣的
 *      （失敗形態 ②：算出來了但從沒送到）。
 *
 *  ③  `polarity` 是**方向**，不是標籤。一發「對敵拔增益」不可以順手拔掉
 *      敵人身上的減速 —— 那會讓一件淨化道具在戰場上替對手解圍。
 *
 *  ④  `shape: "circle"` 的半徑**真的是一道邊界**。圈外的隊友必須一根寒毛
 *      都沒動（失敗形態 ⑦：「有人被拔了」是屬性，「誰被拔了」才是行為）。
 *
 * ── 為什麼跑真的 `SimWorld` ───────────────────────────────────────────────
 * 因為 `dispel` 的全部價值就是「玩家身上那一條減速消失了」。手寫一個假的
 * status 陣列再看它被 filter 過，驗的是 `Array.prototype.filter`。
 *
 * ⚠️ 半徑不寫字面值：`resolveAbilityRadius` 會乘上 `combatEnv.abilityRange`
 * （出貨 0.6），所以測試裡的「圈內/圈外」座標一律**從那支出貨函式推導**。
 * 抄一個 9.17 進來就是 CLAUDE.md 說的第四個住處，而它一定會過期。
 *
 * 突變紀錄（每一條都真的做過，見 commit message）:
 *   · `requireDispellable: true` → `false`          → dsp-flag-false 紅
 *   · `defaults` 整個不傳                            → dsp-rules-default 紅
 *   · `if (!rules.enabled) return` 刪掉              → dsp-disabled 紅
 *   · `polarity` 一律傳 `"any"`                      → dsp-polarity-buff/debuff 紅
 *   · 圓形分支的 `distSq(...) <= r2` → `true`        → dsp-circle-edge 紅
 *   · `if (!rules.appliesToMobs …) continue` 刪掉    → dsp-mobs 紅
 *   · `Math.min(e.count ?? cap, cap)` → `e.count ?? cap` → dsp-count-cap 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { resolveAbilityRadius } from "../abilities/abilitySystem";
import { DEFAULT_DISPEL_RULES, type DispelRules } from "../dispelRules";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import type { StatusEffect } from "../components";
import { Statuses } from "../content/registry";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

interface Rig {
  world: SimWorld;
  hero: EntityId;
}

function rig(rules?: Partial<DispelRules>): Rig {
  const world = new SimWorld(SKELETON_ARENA, 11);
  world.combatActive = true;
  if (rules) world.dispelRules = { ...DEFAULT_DISPEL_RULES, ...rules };
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

/** 多加一個身體。同隊 = 不會互相普攻污染量測（同 knockback.test.ts 的理由）。 */
function ally(world: SimWorld, seat: number, dx: number): EntityId {
  const id = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(0),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return id;
}

function enemy(world: SimWorld, seat: number, dx: number): EntityId {
  const id = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(1),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return id;
}

/** 掛一筆 status。`expiresAtTick` 是**絕對** tick（sim/purity 的規矩）。 */
function put(
  world: SimWorld,
  id: EntityId,
  statusId: string,
  extra: Partial<StatusEffect> = {},
): void {
  const st = world.status.get(id) ?? { effects: [] };
  st.effects.push({
    statusId: statusId as StatusEffect["statusId"],
    sourceId: `src:${statusId}`,
    expiresAtTick: world.tick + 300,
    moveSpeedMult: 0.7,
    ...extra,
  });
  world.status.set(id, st);
}

function ids(world: SimWorld, id: EntityId): string[] {
  return (world.status.get(id)?.effects ?? [])
    .map((e) => String(e.statusId))
    .sort();
}

function ctx(
  world: SimWorld,
  caster: EntityId,
  targets: EntityId[],
): EffectContext {
  return {
    world,
    caster,
    rank: 1,
    targets,
    origin: "test:dispel",
    rng: world.rng,
  };
}

function fire(
  world: SimWorld,
  caster: EntityId,
  targets: EntityId[],
  e: EffectDef,
): void {
  runEffects([e], ctx(world, caster, targets));
}

describe("dispel —— 【淨化】", () => {
  it("標了 dispellable:false 的狀態淨化拔不掉,沒標的拔得掉", () => {
    cover("dsp-flag-false");
    const { world, hero } = rig();
    put(world, hero, "slow", { dispellable: false, polarity: "debuff" });
    put(world, hero, "root", { polarity: "debuff" });

    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "single",
      polarity: "debuff",
      count: 5,
    } as EffectDef);

    // ⚠️ 兩個方向一起讀:只驗「root 走了」的話,一個把整池清空的實作也會過;
    // 只驗「slow 留著」的話,一個什麼都不做的實作也會過。
    expect(ids(world, hero)).toEqual(["slow"]);
  });

  it("沒標 dispellable 時算不算可拔,由 dispelRules 決定", () => {
    cover("dsp-rules-default");
    const off = rig({ statusDefaultDispellable: false });
    put(off.world, off.hero, "root", { polarity: "debuff" });
    fire(off.world, off.hero, [off.hero], {
      kind: "dispel",
      shape: "single",
      polarity: "debuff",
      count: 5,
    } as EffectDef);
    expect(ids(off.world, off.hero)).toEqual(["root"]);

    // 同一份文件、同一個狀態,只有後台那一格不同 → 結果相反。
    const on = rig({ statusDefaultDispellable: true });
    put(on.world, on.hero, "root", { polarity: "debuff" });
    fire(on.world, on.hero, [on.hero], {
      kind: "dispel",
      shape: "single",
      polarity: "debuff",
      count: 5,
    } as EffectDef);
    expect(ids(on.world, on.hero)).toEqual([]);
  });

  it("enabled:false 讓整個 kind 不作用", () => {
    cover("dsp-disabled");
    const { world, hero } = rig({ enabled: false });
    put(world, hero, "root", { polarity: "debuff" });
    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "single",
      polarity: "debuff",
      count: 5,
    } as EffectDef);
    expect(ids(world, hero)).toEqual(["root"]);
  });

  it("對敵拔增益不會順手解掉敵人的減速", () => {
    cover("dsp-polarity-buff");
    const { world, hero } = rig();
    const foe = enemy(world, 1, 2);
    put(world, foe, "haste", { polarity: "buff", moveSpeedMult: 1.3 });
    put(world, foe, "slow", { polarity: "debuff" });

    fire(world, hero, [foe], {
      kind: "dispel",
      shape: "single",
      polarity: "buff",
      count: 5,
    } as EffectDef);

    // 拔走了他的加速,而他的減速**還在** —— 一發「淨化敵人」不可以替對手解圍。
    expect(ids(world, foe)).toEqual(["slow"]);
  });

  it("對己拔減益不會拔掉自己的增益", () => {
    cover("dsp-polarity-debuff");
    const { world, hero } = rig();
    put(world, hero, "haste", { polarity: "buff", moveSpeedMult: 1.3 });
    put(world, hero, "slow", { polarity: "debuff" });

    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "single",
      polarity: "debuff",
      count: 5,
    } as EffectDef);

    expect(ids(world, hero)).toEqual(["haste"]);
  });

  it("圓形淨化的半徑是一道真的邊界,圈外的隊友沒被碰到", () => {
    cover("dsp-circle-edge");
    const { world, hero } = rig();
    // ⚠️ 出貨半徑會被 `combatEnv.abilityRange` 乘過,所以座標從那支函式推導,
    // 不抄字面值(CLAUDE.md:驗機制不驗數字)。
    const DOC_RADIUS = 8;
    const effective = resolveAbilityRadius(world, DOC_RADIUS);
    expect(effective).toBeGreaterThan(1); // 夾具前提:圈要大到放得下兩個身體

    const near = ally(world, 1, effective * 0.5);
    const far = ally(world, 2, effective * 1.5);
    put(world, near, "slow", { polarity: "debuff" });
    put(world, far, "slow", { polarity: "debuff" });

    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "circle",
      side: "allies",
      radius: DOC_RADIUS,
      polarity: "debuff",
      count: 5,
    } as EffectDef);

    expect(ids(world, near)).toEqual([]);
    expect(ids(world, far)).toEqual(["slow"]);
  });

  it("polarity 是從 status 文件真的接進執行期的,不是夾具自己寫的", () => {
    cover("dsp-status-doc-wire");
    // ⛔ 這一條是本批**最重要**的守衛,因為它守的是一條在 2026-08-05 之前
    // **根本不存在**的線:14 份 `status-effect@1` 文件 14 份都填了 `polarity`,
    // `StatusEffect.polarity` 這一格也在,而 `applyStatus` 從來沒有把前者寫進
    // 後者 —— 於是每一發【淨化】在真的遊戲裡都拔不到任何東西(失敗形態 ②)。
    //
    // ⚠️ 上面那幾條用 `put()` 手寫 `polarity`,驗的是 `clearPools` 的過濾器;
    // 只有這一條走**出貨的施加路徑**(`applyStatus`),所以只有它會在那條線
    // 被拆掉時變紅(失敗形態 ⑤:被測的不是出貨的那個)。
    const { world, hero } = rig();
    Statuses.register("wired-slow", { polarity: "debuff" });

    // 一筆走真路徑掛上、一筆是登錄表查不到的
    fire(world, hero, [hero], {
      kind: "applyStatus",
      statusId: "wired-slow",
      durationSec: 10,
      moveSpeedMult: 0.7,
    } as unknown as EffectDef);
    fire(world, hero, [hero], {
      kind: "applyStatus",
      statusId: "unregistered-slow",
      durationSec: 10,
      moveSpeedMult: 0.7,
    } as unknown as EffectDef);
    expect(ids(world, hero)).toEqual(["unregistered-slow", "wired-slow"]);

    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "single",
      polarity: "debuff",
      count: 5,
    } as EffectDef);

    // 有文件的被拔走;查不到的留著(「不知道」不當成「是」,見 clearPools)。
    expect(ids(world, hero)).toEqual(["unregistered-slow"]);
  });

  it("文件寫的 count 夾不過 dispelRules.maxCountCap", () => {
    cover("dsp-count-cap");
    const { world, hero } = rig({ maxCountCap: 1 });
    put(world, hero, "slow", { polarity: "debuff" });
    put(world, hero, "root", { polarity: "debuff" });
    put(world, hero, "silence", { polarity: "debuff" });

    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "single",
      polarity: "debuff",
      count: 99, // 一份想要「全清」的文件
    } as EffectDef);

    // 只掉一筆 —— 全域上限管得到逐支文件,不然那一格就只是裝飾。
    expect(ids(world, hero)).toHaveLength(2);
  });
});
