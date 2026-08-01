/**
 * 道具冷卻倍率 `combatEnv.itemCooldown` (GH#189 第三塊).
 *
 * owner 2026-07-28:道具冷卻要能獨立於技能冷卻調整,預設 1x。
 *
 * ---------------------------------------------------------------------------
 * 為什麼守衛長這樣
 * ---------------------------------------------------------------------------
 * 這顆旋鈕最容易的兩種壞法都不會讓任何既有測試變紅:
 *   ① 加了 key、後台也看得到,但 sim 裡沒有任何地方讀它 —— 面板可以調,調了
 *      沒事發生(失敗形狀②的變體:設定送到了,但沒有人消費)。
 *   ② 讀了,但**連英雄天生技 / 三選一 / 靈氣的 ICD 一起**縮放 —— 一個叫
 *      「道具冷卻時間」的倍率動到了不是道具的東西。
 * 所以下面每一條都是 A/B:同一份 hook、同一段 tick,只差 `src.kind` 或只差
 * 倍率,兩邊必須給出不同的**發動次數**。
 *
 * 量的是 `buffApply` 事件 —— hook 真的跑完 effects 才會發出的那個訊號,而且是
 * 會離開伺服器的通道;不是 `hookLastFired` 這種內部欄位(失敗形狀⑦)。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource } from "../stats/statPipeline";
import { fireHooks } from "./hooks";
import { normalizeCombatEnv, DEFAULT_COMBAT_ENV } from "../combatEnv";
import { ModOp, type ModifierSourceKind } from "../stats/modifiers";
import { Stat } from "../stats/statTypes";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Champions, Items } from "../content/registry";
import { grantItemFree } from "../economy/shop";
import { itemSourceId } from "../economy/itemSource";
import { TICK_MS } from "../../constants";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";

beforeAll(() => registerSkeletonContent());

/** 1 秒 ICD。@30Hz 是 30 tick,所以 60 tick 的窗口在 1x 下發動 3 次。 */
const ICD_SEC = 1;
const WINDOW_TICKS = 61;

function hero(world: SimWorld): EntityId {
  return spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
}

/**
 * 每一 tick 都嘗試發動一次 on-hit hook,回傳 `WINDOW_TICKS` 內真的發動了幾次。
 * `kind` 決定這份 hook 掛在道具上還是掛在別的東西上。
 */
function procsIn(kind: ModifierSourceKind, itemCooldown: number, cooldown = 1): number {
  const world = new SimWorld(SKELETON_ARENA, 1);
  world.combatEnv = normalizeCombatEnv({ itemCooldown, cooldown });
  const id = hero(world);
  attachSource(world, id, {
    id: `src:${kind}`,
    kind,
    hooks: [
      {
        on: "onBasicAttack",
        target: "self",
        internalCooldown: ICD_SEC,
        effects: [
          {
            kind: "applyBuff",
            modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: 0.01 }],
            duration: 999,
            stackKey: "icd-probe",
          },
        ],
      },
    ],
  });

  let procs = 0;
  for (let i = 0; i < WINDOW_TICKS; i++) {
    fireHooks(world, id, "onBasicAttack", id);
    for (const e of world.events) if (e.type === "buffApply" && e.data.source === id) procs++;
    world.step(new Map());
  }
  return procs;
}

describe("combatEnv.itemCooldown (#189)", () => {
  it("出貨預設是 1.0 —— 加這顆旋鈕不改變任何既有道具的節奏", () => {
    cover("combat-env-item-cooldown");
    expect(DEFAULT_COMBAT_ENV.itemCooldown).toBe(1);
    // 1 秒 ICD、61 tick 的窗口 → tick 0 / 30 / 60,三次。
    expect(procsIn("item", 1)).toBe(3);
  });

  it("★ 2.0 讓道具被動的內部冷卻真的變兩倍長(3 次 → 2 次)", () => {
    cover("combat-env-item-cooldown");
    // 2 秒 ICD → tick 0 / 60,兩次。一個「讀了 key 但沒乘上去」的實作還是 3。
    expect(procsIn("item", 2)).toBe(2);
    // …而且方向是對的:0.5 讓它更常發動(0.5 秒 ICD → 0/15/30/45/60)。
    expect(procsIn("item", 0.5)).toBe(5);
  });

  it("★ 只動道具 —— 天生技 / 三選一 / buff 的 ICD 不受影響", () => {
    cover("combat-env-item-cooldown");
    // 同一份 hook、同一個 2.0 倍率,唯一的差別是 `src.kind`。
    //
    // `"aura"` 不在名單裡,而且不是遺漏:那個 kind **只有 sim 自己寫**
    // (sim/aura/aura.ts 擁有每一份,離開半徑就拔掉),手動掛一份會在第一次
    // `step` 就被 auraSystem 收走 —— 量到的會是靈氣的生命週期,不是這顆旋鈕。
    for (const kind of ["champion", "augment", "passive", "buff"] as const) {
      expect(procsIn(kind, 2), `${kind} 的 ICD 被道具冷卻倍率動到了`).toBe(3);
    }
  });

  it("★ 技能冷卻倍率碰不到道具 ICD(兩顆旋鈕互相獨立)", () => {
    cover("combat-env-item-cooldown");
    // `cooldown` 4.0 是很大的一個數:如果道具 ICD 誤讀了它,這裡會掉到 1 次。
    expect(procsIn("item", 1, 4)).toBe(3);
    // 反向:道具倍率 4.0 時道具自己確實變慢了(證明上一行不是因為倍率整個沒被讀)。
    expect(procsIn("item", 4, 1)).toBe(1);
  });
});

/**
 * ---------------------------------------------------------------------------
 * 出貨路徑 —— 上面每一條的 `kind` 都是**測試自己手寫**的
 * ---------------------------------------------------------------------------
 * `procsIn` 用 `attachSource({ kind })` 直接掛一份 hook。那證明了 `fireHooks`
 * 會照 `src.kind` 分流,但**沒有證明真正的道具走到那一行時 kind 真的是
 * `"item"`** —— 失敗形狀⑤「受測的不是出貨的那個東西」。
 *
 * 這件事被實測過:把 `economy/shop.ts` 三個 `attachSource` 的
 * `kind: "item"` 全部改成 `kind: "passive"`(也就是玩家買到、撿到、undo 回來的
 * 每一件道具都不再是 `"item"`),整包 @ggd/shared 1450 條**全綠**。
 * `ModifierSource.kind === "item"` 在整個 sim 裡只有 `effects/hooks.ts` 一處在
 * 讀,所以那個突變唯一的後果就是:標著「道具冷卻時間」的旋鈕對真正的道具完全
 * 失效,而後台照樣顯示、照樣存得下去。沒有任何測試會講這件事。
 *
 * 所以下面這條走**真的內容文件 + 真的授予入口**:出貨的某一件道具 →
 * `economy/shop.grantItemFree`(三選一 / 寶玉 / 任務獎勵共用的那個入口)。
 *
 * ⚠️ **哪一件是算出來的,不是寫死的**(2026-08-01)。
 * 這一條原本釘死 `godie-i06n`(老衲的棒子)並在註解裡寫「它是出貨內容裡唯一
 * 帶 internalCooldown 的道具」。owner 2026-08-01 重寫了那份文件的被動(改成
 * 10% 機率減速、沒有內部冷卻),於是這條守衛紅了 —— 而紅的原因跟它要守的東西
 * (道具的 kind 是不是 "item")毫無關係,那句「唯一」也在同一天變成謊話
 * (CLAUDE.md 第三守則)。現在改成**從出貨內容選**:第一件符合量測條件的道具。
 * 換一件道具、加一件道具,這裡都自己跟上;而下面那兩個 3 / 2 的斷言仍然是
 * 寫死的**倍率關係**,所以「沒有以 kind:item 掛上去」照樣紅。
 *
 * 改完之後重跑的兩個突變(2026-08-01,都 RED):
 *   ① `economy/itemSource.ts` 的 `kind: "item"` → `"passive"`(上面那段歷史說
 *      的就是這個突變,當年全綠)→ 這一條紅在
 *      「沒有被道具冷卻倍率動到 —— 它掛上去的 kind 不是 'item'」;
 *   ② `effects/hooks.ts` 的 `const factor = src.kind === "item" ? … : 1` → `1`
 *      (倍率讀了但沒乘上去)→ 這一條、加上上面兩條自己手寫 `kind` 的,一起紅。
 */
describe("combatEnv.itemCooldown —— 出貨的道具走出貨的授予入口 (#189)", () => {
  /**
   * 這個量測看得見的 effect kind —— 也就是會發出一則帶 `origin` 的世界事件的
   * 那些。`origin` 是 `hook:<sourceId>`,而 sourceId 由 `itemSource.ts` 產生,
   * 所以「這則事件是不是這件道具的這條 hook 發的」是可以精確判定的。
   *
   * ⚠️ 不含 `applyStatus`:它只有在 `stun` / 免疫時才發事件,一個純減速的
   * proc 什麼都不發(老衲的棒子正是這一種)。把它列進來會挑到一件量不到的
   * 道具,然後拿 0 次去跟 3 比 —— 一個看起來像功能壞掉、實際上是量測壞掉的紅。
   */
  const OBSERVABLE_KINDS = new Set(["damage", "damageArea", "damageLine", "heal", "applyBuff"]);

  let contentReady = false;
  beforeAll(async () => {
    for (const r of [Champions, Items]) r.clear();
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
    const result = await new ContentLoader(new FsContentSource(dir)).load();
    registerAll(result.store);
    contentReady = true;
  });

  /**
   * 出貨內容裡**第一件**適合當這顆旋鈕量測對象的道具(id 排序後取第一,所以
   * 失敗訊息可重現)。條件全部是**量測需求**,不是對內容的要求:
   *
   *   · `passive[0]` 掛在 `onBasicAttack` —— 這條測試就是每 tick 點一次它;
   *   · 有 `internalCooldown` —— 沒有 ICD 就沒有東西可以被倍率縮放;
   *   · 沒有 `chance` / `condition` —— 骰子會讓「發動了幾次」不再是 ICD 的函數;
   *   · 沒有 `requires` —— 職業閘會依英雄擋掉,量到的會是閘不是 ICD;
   *   · 至少一個 {@link OBSERVABLE_KINDS} 的 effect —— 否則發動了也看不見。
   */
  function pickIcdItem(): { itemId: ItemId; icdSec: number } {
    for (const id of Items.ids().slice().sort()) {
      const hook = Items.get(id).passive?.[0];
      if (!hook || hook.on !== "onBasicAttack") continue;
      if (!(typeof hook.internalCooldown === "number" && hook.internalCooldown > 0)) continue;
      if (hook.chance !== undefined || hook.condition !== undefined) continue;
      if (hook.requires !== undefined) continue;
      if (!hook.effects.some((e) => OBSERVABLE_KINDS.has(e.kind))) continue;
      return { itemId: id, icdSec: hook.internalCooldown };
    }
    throw new Error(
      "出貨內容裡沒有任何一件『onBasicAttack + internalCooldown + 看得見的效果』的道具 —— " +
        "combatEnv.itemCooldown 這顆旋鈕今天對真實內容 0 作用對象。這是 S8(機制上線、內容 0 筆)," +
        "不是這條測試的問題:去 content/items 補一件,或把這顆旋鈕收掉。",
    );
  }

  /**
   * 一名英雄拿著出貨的那件道具(走 `grantItemFree`),對一個木樁每 tick 打一次,
   * 回傳窗口內那條 hook **真的發動**了幾次。
   *
   * 量的是**世界事件**上的 `origin` —— 也就是「這一下是那件道具打的」這件會
   * 離開伺服器、玩家在畫面上看得到的事,不是 `hookLastFired` 那個內部欄位
   * (失敗形狀⑦)。
   *
   * ⚠️ 事件在 `step()` **之後**才掃:`SimWorld.step` 的第一行就清空
   * `world.events`,而 hook 產生的傷害是丟進 `world.damageQueue`、由同一個
   * `step` 裡的 combatResolveSystem 結算後才發事件的。在 `step` 之前掃會永遠
   * 是 0。上面 `procsIn` 掃在 `step` 之前是因為它量的是 `applyBuff` 那個
   * **當場**發出的事件 —— 兩邊的時機不同,不是抄漏了。
   */
  function shippedProcsIn(itemId: ItemId, itemCooldown: number, windowTicks: number): number {
    const world = new SimWorld(SKELETON_ARENA, 1);
    world.combatEnv = normalizeCombatEnv({ itemCooldown });
    const ids = Champions.ids().slice().sort();
    const championId = ids[0]!;
    const attacker = spawnChampion(world, {
      championId,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: SKELETON_ARENA.zones[0]!.center.x, z: SKELETON_ARENA.zones[0]!.center.z },
      zone: 0,
    });
    const dummy = spawnChampion(world, {
      championId,
      seatId: asSeatId(1),
      teamId: asTeamId(1),
      pos: { x: SKELETON_ARENA.zones[0]!.center.x + 1, z: SKELETON_ARENA.zones[0]!.center.z },
      zone: 0,
    });
    // ⚠️ 出貨入口,不是 attachSource:`kind` 由 shop.ts / itemSource.ts 決定,
    // 這正是要測的東西。回傳的是格子編號,而 sourceId 帶著它。
    const slot = grantItemFree(world, attacker, itemId);
    expect(slot).toBeGreaterThanOrEqual(0);
    const origin = `hook:${itemSourceId(itemId, slot)}`;

    // ⚠️ 一格暖機,而且是量到的不是猜的:在**第一次** `step` 之前,兩個人還沒有
    // 進到廣域索引裡,所以 `enemiesInCircle` 回空集合 —— hook 照樣觸發、照樣燒
    // 掉內部冷卻,但一個受害者都沒有,於是「發動了」這件事在畫面上看不到。
    // 沒有這一格,ICD 的節奏會從 0/N/2N 變成「0 看不見、N、2N」,量到 2 次,
    // 而那 2 次跟 2x 倍率下的 2 次長得一模一樣 —— 一條會對兩種世界都給同一個
    // 答案的斷言(失敗形狀④)。
    world.step(new Map());

    let procs = 0;
    let firedLastTick = false;
    for (let i = 0; i < windowTicks; i++) {
      const hp = world.health.get(dummy)!;
      hp.hp = hp.maxHp; // 木樁不死 —— 死了就不再是 enemiesInCircle 的目標,量測提早結束
      fireHooks(world, attacker, "onBasicAttack", dummy);
      world.step(new Map());
      const fired = world.events.some((e) => e.data["origin"] === origin);
      // 上升緣,不是逐則計數:一次發動可能在同一 tick 發出好幾則帶同一個
      // `origin` 的事件(多個受害者、擊退、破盾…)。兩次發動之間至少隔
      // `icdTicks` 格,而呼叫端已經斷言 `icdTicks >= 2`,所以兩次發動不可能被
      // 併成同一個上升緣。
      if (fired && !firedLastTick) procs++;
      firedLastTick = fired;
    }
    return procs;
  }

  it("★ 出貨道具的 ICD 真的被 itemCooldown 縮放(3 次 → 2 次)", () => {
    cover("combat-env-item-cooldown");
    expect(contentReady).toBe(true);
    // 「這件出貨文件真的帶著一個 onBasicAttack 的內部冷卻」這件事,現在由
    // {@link pickIcdItem} 保證:條件不滿足就**沒有**候選人,它會帶著 S8 的說明
    // 丟例外。舊版在這裡寫的是 `toBe(5)` 這種對照常數;把 id 改成算出來的之後
    // 再對照同一個來源就是一條永遠為真的斷言(第二守則:刪掉功能還會綠的不是
    // 測試),所以它被換成下面這條**真的會紅**的量測前提。
    const { itemId, icdSec } = pickIcdItem();
    // ICD → tick,用的是 `effects/hooks.ts` 同一條 `internalCooldown / world.dt`。
    // 2·icdTicks+1 的窗口 → tick 0 / N / 2N,三次。
    const icdTicks = Math.round(icdSec / (TICK_MS / 1000));
    const windowTicks = 2 * icdTicks + 1;
    // 1x 與 2x 要量得出差別,ICD 至少要有一格。ICD 0.02 秒(= 半格)在兩種倍率
    // 下都是「每 tick 都發動」,3 跟 2 都會落空而且看不出是為什麼。
    expect(
      icdTicks,
      `${itemId} 的內部冷卻只有 ${icdSec} 秒 —— 短到 1x 與 2x 量不出差別,這個量測失效了`,
    ).toBeGreaterThanOrEqual(2);
    expect(shippedProcsIn(itemId, 1, windowTicks), `1x 下 ${itemId} 的節奏就已經不對`).toBe(3);
    // 2.0 → ICD 兩倍長 → tick 0 / 2N,兩次。
    // 一個「道具沒有以 kind:item 掛上去」的實作在這裡會拿到 3 —— 跟 1x 一樣。
    expect(
      shippedProcsIn(itemId, 2, windowTicks),
      `${itemId} 沒有被道具冷卻倍率動到 —— 它掛上去的 kind 不是 'item'`,
    ).toBe(2);
  });

  it("★ 出貨的 combat-env 文件把 itemCooldown 鎖在 1.0", () => {
    cover("combat-env-item-cooldown");
    // owner 2026-07-28:道具冷卻預設 1x。`DEFAULT_COMBAT_ENV.itemCooldown` 是
    // **程式端**的預設;伺服器實際載入的是 content/config/combat-env.json。
    // 兩份不一致時後台顯示的預設和玩家吃到的節奏會是兩個數字,而且沒有任何地方
    // 會說 —— 這正是 #187 在殭屍王賞金上刻意釘死三份的同一個理由。
    const doc = JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/config/combat-env.json"),
        "utf8",
      ),
    ) as { multipliers: Record<string, number> };
    expect(doc.multipliers.itemCooldown).toBe(1.0);
    expect(doc.multipliers.itemCooldown).toBe(DEFAULT_COMBAT_ENV.itemCooldown);
  });
});
