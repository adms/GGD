/**
 * 攻速解鎖上限的**內容端** —— GH#188 稜彩卡 + GH#189 傳說近戰武器.
 *
 * ---------------------------------------------------------------------------
 * 為什麼要有這一支(而不是靠 statCaps.test.ts / statCapsReach.test.ts)
 * ---------------------------------------------------------------------------
 * 那兩支證明的是 **機制**:一個手寫的 `CapRaise` modifier 會把上限抬起來。
 * v0.9.11 把機制做完了,但**沒有任何內容消費它** —— `fieldAdoption.test.ts` 的
 * 豁免條目就是為此存在的。#188 / #189 是第一批消費者,所以這一支問的是完全不同
 * 的問題:**出貨的那兩份文件,經過出貨的那兩條路徑,真的把上限打開了嗎**。
 *
 * 因此:
 *   · 內容從 `content/` 真的載入(`ContentLoader` + `FsContentSource`),不是
 *     fixture —— 失敗形狀⑤「受測的不是出貨的那個東西」。
 *   · 三選一走 `applyAugmentPick`,道具走 `grantItemFree`,不是直接
 *     `attachSource` —— 失敗形狀⑤ 的另一半。
 *
 * ---------------------------------------------------------------------------
 * 這一支最重要的一條:**拿掉 CapRaise 就只剩 4.0**
 * ---------------------------------------------------------------------------
 * 「攻速 ×2」這張卡最容易的退化方式是安靜的:CapRaise 沒被讀到 / 被結算順序
 * 夾在 ×2 前面 / cap 表回退成空表,玩家看到的就是 4.0,而卡片仍然「有效」。
 * 沒有人會回報一張「有生效」的卡。所以每一條斷言都成對:同一個世界、同一個
 * 英雄、同一條路徑,只差那一個 modifier,一邊 4.0 一邊 5.0。
 *
 * 5.0 這個數字是刻意挑的:它同時排除了三種錯誤實作 ——
 *   4.0 = CapRaise 被忽略;2.5 = ×2 沒生效;10.0 = 夾在硬上限而不是實際值。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_STAT_CAPS, statCapsFromDoc } from "../statCaps";
import { cover } from "../../../testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Augments, Champions, Items, LootTables } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { applyAugmentPick, offerItems, type AugmentOffer } from "./draft";
import { grantItemFree } from "./shop";
import { fireHooks } from "../effects/hooks";
import { legendaryPool } from "./legendaryOrb";
import { LEGENDARY_POOL_TABLE } from "./itemTiers";
import { asSeatId, asTeamId, type AugmentId, type ChampionId, type EntityId, type ItemId } from "../../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/** #188 稜彩卡 and #189 傳說近戰武器 — the two docs under test, by shipped id. */
const AUGMENT_ID = "limit-breaker" as AugmentId;
const ITEM_ID = "endless-edge" as ItemId;

/** 三階寶具池（owner 2026-08-18）。⛔ 這裡列的是**檔名**，成員從磁碟讀。 */
const POOL_TABLES = ["legendary-weapons", "ex-release-weapons", "ex-origin-weapons"];

/** 一般上限 / 解鎖硬上限 (sim/statCaps.ts DEFAULT_STAT_CAPS). */
const BASE_CAP = 4.0;
const UNLOCKED_CAP = 10.0;

/**
 * 起跳攻速。挑 2.5 是因為 2.5 × 2 = 5.0 —— 高過一般上限 4.0(所以夾不夾看得
 * 出來),又低過硬上限 10.0(所以「夾在 10」也看得出來)。
 */
const START_AS = 2.5;

let meleeChampion: ChampionId;
let rangedChampion: ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Items, Augments, LootTables]) r.clear();
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
  // 排序後取第一個 —— Map 迭代順序不可倚賴(這個 repo 的決定性紀律),而且固定
  // 的英雄讓失敗訊息可重現。
  const ids = Champions.ids().slice().sort();
  meleeChampion = ids.find((id) => Champions.get(id).attackType === "melee")!;
  rangedChampion = ids.find((id) => Champions.get(id).attackType === "ranged")!;
});

function spawn(world: SimWorld, championId: ChampionId, seat = 0): EntityId {
  return spawnChampion(world, {
    championId,
    seatId: asSeatId(seat),
    teamId: asTeamId(seat),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
}

const asOf = (world: SimWorld, id: EntityId): number => world.stats.get(id)!.final[Stat.AttackSpeed];

/**
 * 一名英雄,攻速被一個 Flat 精準推到 `START_AS`。Flat 的大小是**量**出來的
 * (先讀這個英雄自己的最終攻速再補差額),而不是猜的 —— 換一個英雄、改一次
 * 三圍係數,這個 setup 都還是落在 2.5。
 */
function heroAt(world: SimWorld, championId: ChampionId, seat = 0): EntityId {
  const id = spawn(world, championId, seat);
  recomputeStats(world, id);
  const own = asOf(world, id);
  attachSource(world, id, {
    id: "test:as-floor",
    kind: "buff",
    modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: START_AS - own }],
  });
  recomputeStats(world, id);
  return id;
}

/** 走出貨路徑吃下一張三選一卡。 */
function pickAugment(world: SimWorld, id: EntityId, augmentId: AugmentId): void {
  const offer: AugmentOffer = { entity: id, tier: "prismatic", choices: [augmentId], picked: null };
  expect(applyAugmentPick(world, offer, augmentId), "the pick was refused").toBe(true);
  recomputeStats(world, id);
}

describe("GH#188 稜彩·破限超頻 —— 出貨的那張卡真的解得開 4.0", () => {
  it("設定就位:出貨文件是 ×2 攻速 + CapRaise 10,而且起跳點是 2.5", () => {
    cover("statcaps-content-augment");
    const def = Augments.get(AUGMENT_ID);
    expect(def.tier, "owner 指定 tier prismatic").toBe("prismatic");
    // 「乘法,不是 flat」 —— pctAdd 1.0 在一個已經有 +2.5 flat 的英雄身上是完全
    // 不同的數字,所以 op 本身要被釘住。
    const mult = (def.modifiers ?? []).find((m) => m.op === ModOp.PercentMult);
    expect(mult, "沒有乘法 modifier —— 這張卡不是 ×2").toBeDefined();
    expect(mult!.stat).toBe(Stat.AttackSpeed);
    expect(mult!.value, "pctMult 1.0 = ×2").toBeCloseTo(1.0, 9);
    const raise = (def.modifiers ?? []).find((m) => m.op === ModOp.CapRaise);
    expect(raise, "沒有 CapRaise —— 這張卡退化成普通 ×2 攻速卡").toBeDefined();
    expect(raise!.stat).toBe(Stat.AttackSpeed);
    expect(raise!.value).toBeCloseTo(UNLOCKED_CAP, 9);

    const world = new SimWorld(SKELETON_ARENA, 1);
    expect(asOf(world, heroAt(world, meleeChampion)), "起跳攻速沒有落在 2.5").toBeCloseTo(START_AS, 6);
  });

  it("吃下這張卡 → 5.0(不是 4.0,也不是 10.0)", () => {
    cover("statcaps-content-augment");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = heroAt(world, meleeChampion);
    pickAugment(world, id, AUGMENT_ID);
    expect(asOf(world, id)).toBeCloseTo(START_AS * 2, 6);
    // 三個獨立的否定,對應三種不同的壞實作。
    expect(asOf(world, id)).toBeGreaterThan(BASE_CAP); // CapRaise 被忽略
    expect(asOf(world, id)).not.toBeCloseTo(START_AS, 6); // ×2 沒生效
    expect(asOf(world, id)).toBeLessThan(UNLOCKED_CAP); // 夾在硬上限而不是實際值
  });

  it("★ 把 CapRaise 從同一張卡上拿掉 → 只拿得到 4.0", () => {
    cover("statcaps-content-augment");
    // 這是 #188 唯一真正必要的守衛。上面那條在一個「CapRaise 是 no-op 但一般
    // 上限剛好夠高」的世界裡也會綠;這一條不會 —— 它要求同一份文件、同一條
    // `applyAugmentPick` 路徑,少了那一個 modifier 就**必須**掉回 4.0。
    const shipped = Augments.get(AUGMENT_ID);
    const stripped = {
      ...shipped,
      id: "test-limit-breaker-nocap" as AugmentId,
      modifiers: (shipped.modifiers ?? []).filter((m) => m.op !== ModOp.CapRaise),
    };
    expect(stripped.modifiers, "拿掉 CapRaise 之後應該還剩 ×2").toHaveLength(
      (shipped.modifiers ?? []).length - 1,
    );
    Augments.register(stripped.id, stripped);

    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = heroAt(world, meleeChampion);
    pickAugment(world, id, stripped.id);
    expect(asOf(world, id), "沒有 CapRaise 卻超過一般上限 —— 上限根本沒在夾").toBeCloseTo(BASE_CAP, 6);
  });
});

describe("GH#189 無盡連刃 —— 傳說近戰武器", () => {
  it("裝上去(走 grantItemFree)就把上限解到 10,拿掉 CapRaise 只剩 4.0", () => {
    cover("statcaps-content-item");
    const shipped = Items.get(ITEM_ID);
    expect(shipped.requiresAttackType, "近戰限定沒有寫在文件上").toBe("melee");

    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = heroAt(world, meleeChampion);
    // 這件武器自己不給攻速數值(數值在 on-hit 疊層上),所以先把人推到 5.0 的
    // 需求高度,再看上限讓不讓他站在那裡。
    attachSource(world, id, {
      id: "test:as-push",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentMult, value: 1.0 }],
    });
    recomputeStats(world, id);
    expect(asOf(world, id), "沒裝武器時應該被一般上限夾住").toBeCloseTo(BASE_CAP, 6);

    expect(grantItemFree(world, id, ITEM_ID)).toBeGreaterThanOrEqual(0);
    recomputeStats(world, id);
    expect(asOf(world, id), "裝了解鎖武器仍然是 4.0 —— CapRaise 沒被讀到").toBeCloseTo(START_AS * 2, 6);
  });

  it("★ 只出現在近戰英雄的傳說池 —— 三選一與傳說寶玉兩條路都要擋", () => {
    cover("legendary-melee-only");
    // 兩條路,因為傳說池有兩個消費者;只修一條是這個功能最可能的半套做法。
    //
    // ⚠️ 2026-08-18:這裡本來兩條路都寫死用 `LEGENDARY_POOL_TABLE`。owner 那天把
    // 上架寶具切成三階,無盡連刃搬進了 `ex-release-weapons`,於是「寶玉池裡有這把
    // 刀」變成一句假話 —— 而它守的機制(`requiresAttackType` 過濾)⛔ 一點都沒變。
    // ⇒ 現在**推導**:三選一那條路問「它真的住在哪張池」,寶玉那條路改成對**寶玉池
    // 自己**的近戰限定成員陳述同一條性質。兩條路都還在,⛔ 沒有放寬。
    const world = new SimWorld(SKELETON_ARENA, 1);
    const melee = spawn(world, meleeChampion, 0);
    const ranged = spawn(world, rangedChampion, 1);

    // ── 傳說寶玉那條路:寶玉池自己的近戰限定成員(⛔ 不寫死是哪一件)
    const orbMeleeOnly = LootTables.get(LEGENDARY_POOL_TABLE)
      .entries.map((e) => e.itemId as ItemId)
      .filter((id) => Items.get(id).requiresAttackType === "melee");
    expect(orbMeleeOnly.length, "寶玉池裡一件近戰限定武器都沒有 —— 這條斷言會變成空的").toBeGreaterThan(0);
    const orbForMelee = legendaryPool(world, melee);
    const orbForRanged = legendaryPool(world, ranged);
    for (const id of orbMeleeOnly) {
      expect(orbForMelee, `近戰英雄的寶玉池裡沒有 ${id}`).toContain(id);
      expect(orbForRanged, `遠程英雄的寶玉池竟然有近戰限定武器 ${id}`).not.toContain(id);
    }

    // ── 三選一那條路:抽很多次都不該抽到 —— 一次沒抽到證明不了任何事。
    const itemTable = POOL_TABLES.find((t) =>
      LootTables.get(t).entries.some((e) => e.itemId === ITEM_ID),
    );
    expect(itemTable, `${ITEM_ID} 不在任何一張出貨的寶具池裡 —— 玩家拿不到它`).toBeDefined();
    let rangedSaw = 0;
    let meleeSaw = 0;
    for (let seed = 0; seed < 40; seed++) {
      const w = new SimWorld(SKELETON_ARENA, seed + 1);
      const r = spawn(w, rangedChampion, 0);
      const m = spawn(w, meleeChampion, 1);
      if (offerItems(w, r, itemTable!, 3).choices.includes(ITEM_ID)) rangedSaw++;
      if (offerItems(w, m, itemTable!, 3).choices.includes(ITEM_ID)) meleeSaw++;
    }
    expect(rangedSaw, "遠程英雄的寶具三選一抽到了近戰限定武器").toBe(0);
    // …而且對近戰是真的抽得到的。少了這一條,一個「永遠回空池」的實作也會全綠。
    expect(meleeSaw, "近戰英雄 40 次抽卡一次都沒看到它 —— 過濾器把所有人都擋了").toBeGreaterThan(0);
  });
});

/**
 * on-hit 疊層 —— owner 的定案規格,逐字對照出貨文件的文案:
 *   「每次普攻命中攻擊速度增加10%,可無限疊加,1秒內沒有新的普攻命中則全部
 *   層數歸零」(owner 2026-08-01 改寫,原文是 3 秒;`content/items/endless-edge.json`)
 *
 * ⚠️ 語意選擇寫死在這裡:**歸零,不是逐層掉**。兩種語意在「同一 tick 疊三層」
 * 的測法下**完全無法區分**,所以下面刻意在三個不同的 tick 疊三層 —— 逐層到期的
 * 實作會在第一層自己的到期那一刻掉到 2 層,整組歸零的實作要等到**最後一刀**
 * 的到期才一次掉到 0。owner 說「歸零」,照字面做。
 *
 * ⚠️ **秒數從出貨文件讀,層數與形狀不從文件讀。**
 * owner 2026-08-01 把 3 秒改成 1 秒,而這一支守的是機制(整組共用一個到期、
 * 命中刷新整組、到期用絕對 tick),不是那個秒數 —— 一個寫死 90 tick 的測試
 * 會在每一次調參時變紅,而紅的原因跟它要守的東西無關。
 * 但**只有秒數**是讀來的:「三層一起活、一起死」「連打不掉層」這些形狀仍然
 * 寫死在斷言裡。實測過的三個突變(2026-08-01,都 RED):
 *   ① `applyBuff.ts` 拿掉 `existing.expiresAtTick = expiresAtTick`
 *      (命中不再刷新整組)→ 下面兩條一起紅;
 *   ② `applyBuff.ts` 的 `if (e.stackKey !== undefined)` 短路掉
 *      (每一刀變成各自獨立的一份 buff = 逐層到期)→ 同樣兩條一起紅;
 *   ③ `expiresAtTick = world.tick + 90`(不讀文件秒數,寫死舊的 3 秒)
 *      → 「整組歸零」那一條紅。第三個是這次改成讀文件之後**新增**的守備範圍。
 */
describe("GH#189 無盡連刃 on-hit 疊層", () => {
  /**
   * 出貨文件上那一組疊層 buff 的持續秒數 —— `passive[0]` 裡那個 `applyBuff`
   * 的 `duration`,也就是文案「N 秒內沒有新的普攻命中則全部層數歸零」的 N。
   *
   * 找 `kind === "applyBuff"` 而不是拿 `effects[0]`:哪天有人在前面插一個
   * 特效/音效 effect,拿 `[0]` 會靜默量到錯的東西。
   */
  function shippedStackSeconds(): number {
    const hook = Items.get(ITEM_ID).passive?.[0];
    expect(hook?.on, "出貨文件的第一個被動不再掛在 onBasicAttack 上").toBe("onBasicAttack");
    const buff = hook?.effects.find((e) => e.kind === "applyBuff");
    expect(buff, "出貨文件的 onBasicAttack 被動已經不是 applyBuff —— 疊層機制不見了").toBeDefined();
    const b = buff as Extract<typeof buff, { kind: "applyBuff" }>;
    expect(b.stackKey, "沒有 stackKey —— 每一刀會變成各自獨立的一份 buff,不可能『整組歸零』").toBe(
      "endless-edge",
    );
    // 「可**無限**疊加」= 故意不寫 maxStacks (endless-edge.json 的 authoringNote)。
    expect(b.maxStacks, "出貨文件長出了 maxStacks —— 那就不是『可無限疊加』了").toBeUndefined();
    expect(b.duration, "疊層 buff 沒有持續時間 —— 歸零永遠不會發生").toBeGreaterThan(0);
    return b.duration!;
  }

  /** 出貨的那個秒數換算成 tick(`applyBuff.ts` 用的是同一條 `duration / world.dt`)。 */
  const stackTicks = (world: SimWorld): number =>
    Math.round(shippedStackSeconds() / world.dt);

  /** 裝好刀、攻速被墊到 2.5 的近戰英雄,場上沒有敵人(避免其他系統插手)。 */
  function armed(world: SimWorld): EntityId {
    const id = heroAt(world, meleeChampion);
    expect(grantItemFree(world, id, ITEM_ID)).toBeGreaterThanOrEqual(0);
    recomputeStats(world, id);
    return id;
  }

  /** 目前的層數,從**攻速**反推 —— 讀 `stacks` 欄位是失敗形狀⑦(掃屬性)。 */
  function stacksFrom(world: SimWorld, id: EntityId): number {
    return Math.round((asOf(world, id) / START_AS - 1) / 0.1);
  }

  const hit = (world: SimWorld, id: EntityId): void => {
    fireHooks(world, id, "onBasicAttack", id);
    recomputeStats(world, id);
  };

  it("一次命中 = +10%,三次命中 = +30%（線性疊加,不是覆蓋)", () => {
    cover("legendary-onhit-stacks");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = armed(world);
    expect(asOf(world, id)).toBeCloseTo(START_AS, 6);
    hit(world, id);
    expect(asOf(world, id), "第一次命中沒有加攻速").toBeCloseTo(START_AS * 1.1, 6);
    hit(world, id);
    hit(world, id);
    // 2.5 × 1.3 = 3.25。覆蓋式實作會停在 2.75,乘法式會給 3.3275。
    expect(asOf(world, id), "三層不是 +30%").toBeCloseTo(START_AS * 1.3, 6);
  });

  it("沒有冷卻時間 —— 同一 tick 的兩次命中疊成兩層", () => {
    cover("legendary-onhit-stacks");
    // owner 明確裁決不需要冷卻。一個帶 internalCooldown 的版本在這裡只會有一層。
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = armed(world);
    const t = world.tick;
    hit(world, id);
    hit(world, id);
    expect(world.tick, "測試自己偷偷推進了 tick,那就不是同一 tick 了").toBe(t);
    expect(stacksFrom(world, id)).toBe(2);
  });

  it("★ 沒有新的命中 → 整組歸零(不是逐層掉),到期用絕對 tick", () => {
    cover("legendary-onhit-stacks");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = armed(world);
    const step = (n: number): void => {
      for (let i = 0; i < n; i++) world.step(new Map());
    };

    const dur = stackTicks(world); // 出貨值:1 秒 @30Hz = 30 tick
    // 三層,分別落在 t / t+gap / t+2·gap。三分之一是為了讓**第一層自己的到期**
    // (t+dur)落在**最後一刀的到期**(t+2·gap+dur)之前 —— 那個空隙正是逐層到期
    // 與整組歸零唯一分得開的地方。
    const gap = Math.floor(dur / 3);
    expect(
      gap,
      `出貨的疊層只有 ${dur} tick,三層擠在同一格 —— 這個測法分不出逐層/整組,不是通過`,
    ).toBeGreaterThanOrEqual(1);

    const firstHitTick = world.tick;
    hit(world, id);
    step(gap);
    hit(world, id);
    step(gap);
    hit(world, id);
    const lastHitTick = world.tick;
    expect(lastHitTick).toBe(firstHitTick + 2 * gap);
    expect(stacksFrom(world, id)).toBe(3);

    // 走到「第一次命中之後滿一個持續時間」的那一刻再多一格。逐層到期的實作在
    // 這裡只剩 2 層;整組歸零的實作因為到期被最後一刀刷新過,還是 3 層。
    step(dur + 1 - 2 * gap);
    expect(world.tick, "沒有真的越過第一層自己的持續時間").toBeGreaterThan(firstHitTick + dur);
    expect(stacksFrom(world, id), "第一層自己掉了 —— 這是逐層到期,不是整組歸零").toBe(3);

    // 從最後一次命中算起還差一格的時候,三層都還在……
    step(2 * gap - 2);
    expect(world.tick).toBe(lastHitTick + dur - 1);
    expect(stacksFrom(world, id), "還沒到期就先掉了").toBe(3);

    // ……跨過到期之後,三層**一起**消失(不是 2、不是 1)。
    // 差的那一格是 `buffExpirySystem` 在 `tick++` 之前跑的系統順序,不是語意:
    // 到期比較的是絕對 tick(`expiresAtTick <= world.tick`),沒有遞減計數器。
    step(2);
    expect(world.tick).toBe(lastHitTick + dur + 1);
    expect(stacksFrom(world, id), "整組沒有歸零").toBe(0);
    expect(asOf(world, id)).toBeCloseTo(START_AS, 6);
  });

  /**
   * ★ 出貨路徑 —— 上面每一條都用 `fireHooks(...)` **直接**點火。
   *
   * 那證明了 hook 本身的語意,但沒有證明**英雄真的揮一刀時這個 hook 會被點燃**
   * (失敗形狀⑤)。這件事被實測過:把 `systems/BasicAttackSystem.ts` 結尾那一行
   * `fireHooks(world, id, "onBasicAttack", targetId)` 拿掉,這個 describe 的
   * 每一條都還是綠的 —— 無盡連刃在真實戰鬥裡一層都不會疊,而 #189 的守衛不會說。
   *
   * 所以這一條完全不碰 `fireHooks`:一名近戰英雄、一個木樁、`world.step`,
   * 疊出來的層數必須等於他真的結算出去的刀數。
   */
  it("★ 真的揮刀(world.step,不呼叫 fireHooks)也會疊層 —— 出貨的普攻管線接得上", () => {
    cover("legendary-onhit-stacks");
    const world = new SimWorld(SKELETON_ARENA, 7);
    const c = SKELETON_ARENA.zones[0]!.center;
    const attacker = heroAt(world, meleeChampion, 0);
    expect(grantItemFree(world, attacker, ITEM_ID)).toBeGreaterThanOrEqual(0);
    recomputeStats(world, attacker);
    const dummy = spawnChampion(world, {
      championId: meleeChampion,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: c.x + 1.0, z: c.z },
      zone: 0,
    });

    // 窗口 = **一個**疊層持續時間(出貨值 1 秒 = 30 tick,owner 2026-08-01)。
    // 這個長度是被證明過的、不是估的:整組共用一個到期,而每一刀都會把它推到
    // 「那一刀 + dur」。最早的一刀落在 tick >= 0,所以到期一定 >= dur;而最後
    // 一次重算發生在 tick dur-1(迴圈最後一次 `step` 之前的那個 tick)。
    // dur > dur-1,所以窗口內**不可能**有任何一層過期 —— 於是「疊了幾層」與
    // 「揮了幾刀」必須完全相等,跟攻速多快、刀與刀相隔多遠都無關。
    const windowTicks = stackTicks(world);
    const dummyPos = { ...world.transform.get(dummy)!.pos };
    let swings = 0;
    for (let i = 0; i < windowTicks; i++) {
      const hp = world.health.get(dummy)!;
      hp.hp = hp.maxHp; // 木樁不死、不被推開:兩者都會提早結束測量
      world.transform.get(dummy)!.pos = { ...dummyPos };
      world.nav.get(attacker)!.attackTarget = dummy;
      world.step(new Map());
      for (const e of world.events) {
        if (e.type === "basicAttack" && e.data["source"] === attacker) swings++;
      }
    }

    expect(swings, "木樁在射程內卻一刀都沒揮出去 —— 這個測量根本沒開始").toBeGreaterThan(0);
    recomputeStats(world, attacker);
    expect(
      stacksFrom(world, attacker),
      "真的揮了刀卻沒有疊層 —— 出貨的普攻管線沒有點燃 onBasicAttack",
    ).toBe(swings);
  });

  it("每一次新的命中都把整組的到期時間往後推(所以連打不會掉層)", () => {
    cover("legendary-onhit-stacks");
    const world = new SimWorld(SKELETON_ARENA, 1);
    const id = armed(world);
    const dur = stackTicks(world);
    // 出刀間隔取持續時間的三分之二:嚴格短於一個持續時間(所以「沒有刷新」的
    // 實作一定會在下一刀之前掉光),又長到不可能是「同一 tick 連打」。
    const gap = Math.floor((dur * 2) / 3);
    expect(gap, "出刀間隔算出 0 —— 那就變成同一 tick 連打,測不到刷新").toBeGreaterThanOrEqual(1);
    expect(gap, "出刀間隔比持續時間還長 —— 這樣掉層是正常的,測不到刷新").toBeLessThan(dur);
    for (let i = 0; i < 10; i++) {
      hit(world, id);
      for (let k = 0; k < gap; k++) world.step(new Map());
    }
    expect(stacksFrom(world, id), "連續命中卻掉了層 —— 到期沒有被刷新").toBe(10);
  });
});

/**
 * ---------------------------------------------------------------------------
 * 出貨的**上限表文件** —— #188/#189 的「解鎖到 10.0」最後靠的是它
 * ---------------------------------------------------------------------------
 * 上面每一條都跑在 `new SimWorld(...)` 的預設 `world.statCaps` 上,也就是
 * `DEFAULT_STAT_CAPS`(程式端)。但伺服器實際載入的是
 * `content/config/stat-caps.json`(MatchRoom → `statCapsFromDoc`),而且那份
 * 文件會隨 `MatchState.statCapsJson` 一起送到客戶端面板。
 *
 * 這件事被實測過:把出貨文件的 `unlocked` 從 10.0 改成 5.5,整包 @ggd/shared
 * 1450 條全綠 —— 沒有任何測試在看那份文件。玩家吃到的天花板由它決定,守衛卻只
 * 釘住了程式端的那一份。#187 在殭屍王賞金上刻意把三份釘在一起,這裡是同一課。
 */
describe("GH#188/#189 的天花板來自出貨文件,不只是程式預設", () => {
  const shippedCapsDoc = (): unknown =>
    JSON.parse(readFileSync(join(CONTENT_DIR, "config/stat-caps.json"), "utf8"));

  it("★ content/config/stat-caps.json 就是 4.0 / 10.0,而且解析結果等於 sim 預設", () => {
    cover("statcaps-content-augment");
    const doc = shippedCapsDoc() as {
      schema: string;
      caps: Record<string, { base: number; unlocked: number }>;
    };
    expect(doc.schema).toBe("config.stat-caps@1");
    // owner 2026-07-28:「一般上限是 4.0…可以解鎖最多到 10.0」。
    expect(doc.caps["as"]).toEqual({ base: BASE_CAP, unlocked: UNLOCKED_CAP });
    // 文件與程式預設不一致 = 後台顯示的預設、和沒有文件時實際生效的,是兩個
    // 不同的數字,而且沒有任何地方會說。
    expect(statCapsFromDoc(doc)).toEqual(DEFAULT_STAT_CAPS);
  });

  it("★ 用出貨文件的那張表跑同一條路徑,破限超頻仍然給 5.0", () => {
    cover("statcaps-content-augment");
    // 上面的 5.0 是在 `DEFAULT_STAT_CAPS` 下量到的。這一條把 `world.statCaps`
    // 換成**從出貨文件解析出來的表**,再走一次 `applyAugmentPick` —— 證明玩家
    // 真的坐在哪張表上,結果都一樣。
    const world = new SimWorld(SKELETON_ARENA, 1);
    world.statCaps = statCapsFromDoc(shippedCapsDoc());
    const id = heroAt(world, meleeChampion);
    pickAugment(world, id, AUGMENT_ID);
    expect(asOf(world, id), "出貨的上限表沒有把 4.0 打開").toBeCloseTo(START_AS * 2, 6);
  });
});
