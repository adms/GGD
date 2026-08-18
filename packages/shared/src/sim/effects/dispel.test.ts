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
 *   · `applyBuff.ts` 的 `dispellable: e.dispellable` 刪掉 → dsp-buff-authoring 紅
 *   · `applyStatus.ts` 的 `dispellable: e.dispellable` 刪掉 → dsp-status-dot-authoring 紅
 *   · `zApplyBuff` 的 `dispellable` 欄位刪掉         → dsp-authoring-schema 紅
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { resolveAbilityRadius } from "../abilities/abilitySystem";
import { DEFAULT_DISPEL_RULES, dispelRulesFromDoc, type DispelRules } from "../dispelRules";
import type { EffectContext, EffectDef } from "./effect";
import { zEffectDef } from "../../content/schema/effect";
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

  /**
   * ⭐ owner 2026-08-18 —— 「淨化 = 解掉**所有**負面狀態」。
   *
   * > 「理論上淨化就是解掉所有負面狀態阿⋯所以**提高到 1000 都沒關係**」
   *
   * 在 `maxCountCap: 3` 的時代，有一批卡的文案寫著「解除全部負面狀態」，
   * 而引擎逐位元只會拔 3 筆（第一·五守則：卡片上「說了但不會發生」的字）。
   *
   * ⛔ **這一條刻意不斷言 `maxCountCap === 1000`** —— 那是把一個出貨數值抄進
   * 測試（第四個住處，CLAUDE.md「守衛驗機制不驗數字」）。它斷言的是**行為**：
   * 一發沒寫 `count` 的淨化，在**出貨那一份 `content/config/dispel.json`** 底下，
   * 真的拔得掉超過 3 筆減益。owner 哪天調成 500 或 40 這條照樣綠；
   * 調回 3 就紅，而那正是我們要它叫的那一刻。
   *
   * ⚠️ 規則**從磁碟上出貨的那一份讀**，⛔ 不是 `DEFAULT_DISPEL_RULES` ——
   * 引擎讀的是文件（`MatchController` 開場灌進 `world.dispelRules`），
   * 只驗 TS 常數會漏掉「常數改了但 JSON 沒改」那一半（失敗形態⑤）。
   *
   * ⚠️ 六筆是**六個不同的 statusId**，理由與這個上限為什麼不能是「26 種」一樣：
   * `applyStatus` 的合併鍵是 status id + 來源，筆數本來就不受種類數限制。
   */
  it("★ 一發淨化真的拔得掉超過 3 筆減益（owner 2026-08-18「解掉所有負面狀態」）", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const doc: unknown = JSON.parse(
      readFileSync(join(here, "../../../../../content/config/dispel.json"), "utf8"),
    );
    // 出貨那一份真的 parse 得過、而且真的是這個 schema（⛔ 不可以靜靜退回預設）。
    expect((doc as { schema?: string }).schema).toBe("config.dispel@1");
    const { world, hero } = rig(dispelRulesFromDoc(doc));

    for (const s of ["slow", "root", "silence", "curse", "wither", "chill"]) {
      put(world, hero, s, { polarity: "debuff" });
    }
    expect(ids(world, hero)).toHaveLength(6);

    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "single",
      polarity: "debuff",
      // ⛔ 不寫 `count` —— 那正是「解除全部」那些卡的寫法（跟著全域上限走）。
    } as EffectDef);

    expect(
      ids(world, hero),
      "出貨的 maxCountCap 又把淨化夾回一小撮了 —— 卡面上的「全部」會變成謊話",
    ).toEqual([]);
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

  /**
   * ⭐ GH#295 —— `pools.buffs` 以前是一個**死開關**：出貨
   * `buffDefaultDispellable: false`，而全 repo 沒有任何 authoring 欄位可以把一個
   * 來源標成 `dispellable: true`，兩道閘相乘為零。
   *
   * ⚠️ 這一條**一定要走出貨的施加路徑**（`applyBuff`）。手寫一個 `ModifierSource`
   * 再看它被拔掉，驗的是 `clearPools` 的過濾器 —— 而缺陷從來不在那裡
   *（失敗形態 ⑤：被測的不是出貨的那個）。
   */
  it("⭐ 標了 dispellable 的增益淨化拔得掉,沒標的拔不掉（GH#295）", () => {
    cover("dsp-buff-authoring");
    const { world, hero } = rig(); // 出貨規則：buffDefaultDispellable = false
    const buffIds = (): string[] =>
      (world.stats.get(hero)?.sources ?? []).map((s) => s.id).filter((i) => i.startsWith("buff:"));

    const marked = {
      kind: "applyBuff",
      modifiers: [],
      duration: 10,
      dispellable: true,
      polarity: "buff",
    } as unknown as EffectDef;
    fire(world, hero, [hero], marked);
    const canGo = buffIds().at(-1)!;
    world.step(new Map()); // 換一個 tick，兩份增益才會拿到不同的 source id
    fire(world, hero, [hero], { ...marked, dispellable: undefined } as EffectDef);
    const stays = buffIds().at(-1)!;
    expect(canGo).not.toBe(stays);

    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "single",
      pools: { buffs: true },
      polarity: "buff",
      count: 5,
    } as EffectDef);

    // 兩個方向一起讀：只驗「標了的走了」的話，一個把整池清空的實作也會過。
    expect(buffIds()).not.toContain(canGo);
    expect(buffIds()).toContain(stays);
  });

  it("applyStatus / dot 的 dispellable 也真的從文件走到執行期（GH#295）", () => {
    cover("dsp-status-dot-authoring");
    const { world, hero } = rig();
    // ⚠️ 一定要**登錄**這份狀態並給它 `polarity` —— 沒登錄的話極性是 undefined，
    // 它會因為「有方向的淨化拔不到沒極性的東西」而活下來，於是這一條就算把
    // `dispellable` 那一行刪掉也照樣綠（失敗形態 ④，實測過）。
    Statuses.register("unbreakable", { polarity: "debuff" });
    fire(world, hero, [hero], {
      kind: "applyStatus",
      statusId: "unbreakable",
      duration: 10,
      moveSpeedMult: 0.7,
      dispellable: false, // 出貨預設是 true，所以只有這一格能讓它留下來
    } as unknown as EffectDef);
    fire(world, hero, [hero], {
      kind: "dot",
      amountPerTick: { flat: 1 },
      intervalSec: 1,
      durationSec: 10,
      dispellable: false,
    } as unknown as EffectDef);

    fire(world, hero, [hero], {
      kind: "dispel",
      shape: "single",
      pools: { status: true, dot: true },
      polarity: "debuff",
      count: 5,
    } as EffectDef);

    // 全域預設說「可拔」，文件說「不可拔」—— 文件那一格要贏，否則它是裝飾。
    expect(ids(world, hero)).toEqual(["unbreakable"]);
    expect(world.dot.get(hero) ?? []).toHaveLength(1);
  });

  it("三個 kind 的 dispellable 在 Zod 上真的存在（`.strict()` 會擋掉不存在的欄位）", () => {
    cover("dsp-authoring-schema");
    for (const doc of [
      { kind: "applyBuff", modifiers: [], duration: 1, dispellable: true, polarity: "buff" },
      { kind: "applyStatus", statusId: "slow", duration: 1, dispellable: false },
      {
        kind: "dot",
        amountPerTick: { flat: 1 },
        intervalSec: 1,
        durationSec: 1,
        dispellable: false,
      },
    ]) {
      expect(zEffectDef.safeParse(doc).success, `${doc.kind} 收不下 dispellable`).toBe(true);
    }
  });
});
