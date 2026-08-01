/**
 * 道具身上的 隱形 / 真視 / 飛行 —— 裝上去之後 sim 真的看得到 (item-vision-flight).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這條守衛在防哪一個失敗形態
 *
 * CLAUDE.md 失敗形態 ②「算出來了但從沒送到客戶端」的近親：**欄位存得下，但沒有人
 * 把它轉交出去**。`sim/stealth.ts` 的 `syncVisionGrants` 與 `sim/flight.ts` 的
 * `syncFlightGrants` 從 2026-07-30 就會掃過 `StatsComp.sources` 上每一個
 * `src.vision` / `src.flight` —— 可是 `item@1` 一直沒有這兩個欄位，所以
 * 至尊魔戒的「永久隱身」、晨曦之光的「看穿隱形」、天叢雲劍的「飛昇」三句文案
 * 從匯入以來都是空頭支票。
 *
 * 補上欄位之後，真正會壞的地方是「忘記在 `buildItemSource` 轉交」。那種漏接
 * **型別檢查抓不到**（多一個 optional 欄位不轉交完全合法），單獨看 schema 測試也
 * 是綠的（文件存得下就過），只有把道具真的裝到身上、再問 sim 才問得出來。
 * 所以這裡走的是真的 `attachItemSource` + 真的 `SimWorld`，不是手捏的 source。
 *
 * ⚠️ 用**出貨文件**，不是 fixture。CLAUDE.md 失敗形態 ⑤ 說得很清楚：被測的必須是
 * 出貨的那一個。手捏一份帶 vision 的假道具會讓「欄位轉交了」變綠，同時
 * 「出貨的三支道具其實沒有授權這個欄位」照樣沒人發現。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Items } from "../content/registry";
import type { ItemDoc } from "../../content/schema/item";
import { asSeatId, asTeamId, type ItemId } from "../../ids";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { attachItemSource } from "./itemSource";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/** 出貨文件裡真的授權了這三個欄位的道具 —— 名字寫死，因為它們是 owner 的文案要的。 */
const STEALTH_ITEM = "godie-i004" as ItemId; // 至尊魔戒「永久隱身」
const TRUESIGHT_ITEM = "godie-i016" as ItemId; // 晨曦之光「看穿隱形」
const FLIGHT_ITEM = "godie-i014" as ItemId; // 天叢雲劍「飛昇」

let docs: Map<string, ItemDoc>;

beforeAll(async () => {
  registerSkeletonContent();
  const store = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store;
  docs = new Map(store.all<ItemDoc>("items").map((d) => [d.id as string, d]));
  for (const d of store.all<ItemDoc>("items")) Items.register(d.id, d as never);
});

/**
 * 一個真的 world + 一個真的英雄身體，然後走真的 `attachItemSource` 裝上去。
 *
 * 身體用骨架英雄 THORNE 而不是出貨英雄，是刻意的：這條守衛問的是「**道具**授權的
 * vision/flight 有沒有被轉交給 sim」，跟是誰拿著它無關。用骨架身體讓測試不必把整
 * 棵英雄樹註冊進 registry，也不會在某位英雄改數值時無關地紅掉。
 * ⚠️ 但**道具**一定是出貨文件（失敗形態 ⑤：被測的不是出貨的那個）。
 */
function equip(itemId: ItemId) {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const id = spawnChampion(world, {
    championId: THORNE.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: SKELETON_ARENA.zones[0]!.center.x + 2, z: SKELETON_ARENA.zones[0]!.center.z },
    zone: 0,
  });
  attachItemSource(world, id, itemId, 0, Items.get(itemId));
  world.step(new Map());
  return { world, id };
}

describe("道具授權的 隱形 / 真視 / 飛行 真的到得了 sim (item-vision-flight)", () => {
  it("出貨文件真的授權了這三個欄位 —— 不是機制上線、內容 0", () => {
    cover("item-vision-flight");
    // 失敗形態「mechanism shipped, content 0」的直接檢查。少了這一條，下面三條
    // 就算全綠也只證明「如果有人授權的話會動」。
    expect(docs.get(STEALTH_ITEM)?.vision?.stealthFadeDelaySec, "至尊魔戒沒有 vision").toBe(3);
    expect(docs.get(TRUESIGHT_ITEM)?.vision?.trueSightRadius, "晨曦之光沒有真視半徑").toBeGreaterThan(0);
    expect(docs.get(FLIGHT_ITEM)?.flight, "天叢雲劍沒有 flight").toBeDefined();
  });

  it("★ 裝上至尊魔戒 → world.stealth 真的有這個人", () => {
    cover("item-vision-flight");
    const { world, id } = equip(STEALTH_ITEM);
    // 這一行就是突變點：把 buildItemSource 的 `vision: def.vision` 拿掉，
    // 文件照樣載得進來、typecheck 照樣過、schema 測試照樣綠，只有這裡會紅。
    expect(world.stealth.get(id), "道具授權了隱形,但 syncVisionGrants 沒看到").toBeDefined();
  });

  it("★ 裝上晨曦之光 → world.trueSight 有半徑，且等於文件授權的值", () => {
    cover("item-vision-flight");
    const { world, id } = equip(TRUESIGHT_ITEM);
    const want = docs.get(TRUESIGHT_ITEM)!.vision!.trueSightRadius!;
    // 斷言「等於文件的值」而不是「大於 0」: 半徑被吞掉一半仍然是 >0,
    // 那種漏接正是斷言方向與缺陷無關 (失敗形態 ④)。
    expect(world.trueSight.get(id)?.radius).toBeCloseTo(want, 6);
  });

  it("★ 裝上天叢雲劍 → world.flight 有這個人", () => {
    cover("item-vision-flight");
    const { world, id } = equip(FLIGHT_ITEM);
    expect(world.flight.get(id), "道具授權了飛行,但 syncFlightGrants 沒看到").toBeDefined();
  });

  it("沒有授權的道具不會意外拿到這三樣 —— 這是控制組", () => {
    cover("item-vision-flight");
    // 沒有這一條,上面三條可能是「每個人都隱形」而不是「這件道具讓你隱形」。
    const plain = "godie-i000" as ItemId; // 丈八蛇矛: 純數值 + 擴散,沒有 vision/flight
    const { world, id } = equip(plain);
    expect(world.stealth.get(id)).toBeUndefined();
    expect(world.trueSight.get(id)).toBeUndefined();
    expect(world.flight.get(id)).toBeUndefined();
  });
});
