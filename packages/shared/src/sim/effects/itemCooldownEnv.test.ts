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
 * 所以下面這條走**真的內容文件 + 真的授予入口**:
 *   content/items/godie-i06n.json（老衲的棒子，onBasicAttack ICD 5 秒）
 *   → `economy/shop.grantItemFree`（三選一 / 寶玉 / 任務獎勵共用的那個入口）
 * 它是出貨內容裡**唯一**帶 `internalCooldown` 的道具,也就是這顆旋鈕今天唯一
 * 的真實作用對象。
 */
describe("combatEnv.itemCooldown —— 出貨的道具走出貨的授予入口 (#189)", () => {
  /** 唯一一件帶 internalCooldown 的出貨道具:老衲的棒子,onBasicAttack、5 秒。 */
  const ICD_ITEM = "godie-i06n" as ItemId;
  const ITEM_ICD_SEC = 5;

  let contentReady = false;
  beforeAll(async () => {
    for (const r of [Champions, Items]) r.clear();
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
    const result = await new ContentLoader(new FsContentSource(dir)).load();
    registerAll(result.store);
    contentReady = true;
  });

  /**
   * 一名英雄拿著出貨的那根棒子(走 `grantItemFree`),對一個木樁每 tick 打一次,
   * 回傳窗口內棒子**真的發動**了幾次。
   *
   * 量的是木樁身上那個暈眩的到期 tick 被往後推了幾次 —— 也就是「敵人又被打暈
   * 了一次」這件玩家看得到的事,不是 `hookLastFired` 那個內部欄位(失敗形狀⑦)。
   */
  function shippedProcsIn(itemCooldown: number, windowTicks: number): number {
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
    // ⚠️ 出貨入口,不是 attachSource:`kind` 由 shop.ts 決定,這正是要測的東西。
    expect(grantItemFree(world, attacker, ICD_ITEM)).toBeGreaterThanOrEqual(0);

    let procs = 0;
    let lastExpiry = -1;
    for (let i = 0; i < windowTicks; i++) {
      fireHooks(world, attacker, "onBasicAttack", dummy);
      const stun = world.status.get(dummy)?.effects.find((s) => s.stun === true);
      if (stun && stun.expiresAtTick > lastExpiry) {
        procs++;
        lastExpiry = stun.expiresAtTick;
      }
      world.step(new Map());
    }
    return procs;
  }

  it("★ 出貨道具的 ICD 真的被 itemCooldown 縮放(3 次 → 2 次)", () => {
    cover("combat-env-item-cooldown");
    expect(contentReady).toBe(true);
    const def = Items.get(ICD_ITEM);
    // 設定就位:這件出貨文件真的帶著一個 5 秒的 onBasicAttack 內部冷卻。
    // 少了這一條,哪天有人把 internalCooldown 從文件上拿掉,下面兩個數字會一起
    // 變成「每 tick 都發動」,而測試仍然可以被調成綠的。
    expect(def.passive?.[0]?.internalCooldown).toBe(ITEM_ICD_SEC);
    expect(def.passive?.[0]?.on).toBe("onBasicAttack");

    // 5 秒 ICD @30Hz = 150 tick。301 tick 的窗口 → tick 0 / 150 / 300,三次。
    expect(shippedProcsIn(1, 301), "1x 下出貨道具的節奏就已經不對").toBe(3);
    // 2.0 → 10 秒 ICD → tick 0 / 300,兩次。
    // 一個「道具沒有以 kind:item 掛上去」的實作在這裡會拿到 3 —— 跟 1x 一樣。
    expect(
      shippedProcsIn(2, 301),
      "出貨道具沒有被道具冷卻倍率動到 —— 它掛上去的 kind 不是 'item'",
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
