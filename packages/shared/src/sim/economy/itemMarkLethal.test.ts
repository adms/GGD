/**
 * GH#354 —— **道具**宣告的具名標記，真的接在出貨的免死管線上。
 *
 * ── 這一條擋的是什麼（它是一個已經量到的缺陷，不是假想）────────────────────
 * GANTZ Suit 與 千年積木 原本用 `item.block(fraction:1, lethalOnly:true)` +
 * 一條 `onLethalDamage` hook 寫「擋下致命傷害**並**回復生命 / 加 AD」。
 * 而 `combat/damage.ts` 的 `blockCut` 先把 `dmg` 削成 0，`emit("lethalDamage")`
 * 又關在下面 `if (dmg > 0)` 裡面 ⇒ 後半段**一次都不會觸發**。
 * 卡面兩行字、遊戲裡一行 —— 而 `content:build` 全綠、全套測試全綠
 *（第一·五守則：每一個零件都是對的，只有它們的組合是空的）。
 *
 * ── 為什麼是這三條斷言 ────────────────────────────────────────────────────
 *  ① `world.marks` 上真的有那個標記 —— `item@1.marks` 有沒有被**送到身體上**。
 *     ⛔ 不是「schema 收得下」：那是屬性不是行為（失敗形態⑦）。
 *  ② 人活著。免死那一半。
 *  ③ ⭐ **承重的那一條**：`selfEffects` 真的跑了 —— 斷言落在
 *     `StatsComp.sources` 上那個 `buff:stack:gantz-ad` 來源。
 *     少了③，一個「免死做了、後續效果沒跑」的實作（＝改寫之前的出貨狀態）
 *     照樣會綠，而那正是這一批要修的缺陷本身（失敗形態④）。
 *
 * ── ⛔ 不驗數字 ───────────────────────────────────────────────────────────
 * 3 層、100% 血、AD +100%、3 秒冷卻**一個都沒有寫進斷言**（第零守則⑦）：
 * 那些是 owner 每週在改的出貨值。這裡驗的是**機制會不會發生**。
 *
 * ⚠️ 道具用的是**出貨文件**（失敗形態⑤），身體用骨架英雄 —— 逐字沿用
 * `itemVisionFlight.test.ts` 的理由：這條守衛問的是道具那一半。
 *
 * 突變（做過，見 commit message）：
 *   · `combat/lethalSave.ts` 的 `runEffects(rule.selfEffects, …)` 整段拿掉
 *     → 斷言③紅（①②仍綠 ⇒ 證明③問的是「後續效果」而不是「免死」）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Items } from "../content/registry";
import type { ItemDoc } from "../../content/schema/item";
import { asSeatId, asTeamId, type EntityId, type ItemId, type SeatId } from "../../ids";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { registerSkeletonContent, THORNE } from "../content/skeleton";
import { attachItemSource } from "./itemSource";
import type { IntentFrame } from "../intents";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const GANTZ = "gantz-suit" as ItemId;

beforeAll(async () => {
  registerSkeletonContent();
  const store = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store;
  for (const d of store.all<ItemDoc>("items")) Items.register(d.id, d as never);
});

describe("道具的具名標記 —— GANTZ Suit 的免死真的會跑後續效果", () => {
  it("⛔ 裝上 → 標記在身上 → 致命傷害被擋 → selfEffects 真的發生了", () => {
    cover("item-mark-lethal");
    const world = new SimWorld(SKELETON_ARENA, 20260818);
    world.combatActive = true;
    const Z0 = SKELETON_ARENA.zones[0]!;
    const mk = (seat: number, team: number): EntityId =>
      spawnChampion(world, {
        championId: THORNE.id,
        seatId: asSeatId(seat),
        teamId: asTeamId(team),
        pos: { x: Z0.center.x + seat, z: Z0.center.z + 14 },
        zone: 0,
      });
    const hero = mk(0, 0);
    const foe = mk(1, 1);

    const def = Items.get(GANTZ);
    world.champion.get(hero)!.items[0] = GANTZ;
    attachItemSource(world, hero, GANTZ, 0, def);

    // ① 標記真的被送到身體上（⛔ 不是「schema 收得下」）。
    const bag = world.marks.get(hero);
    expect(bag, "裝上 GANTZ Suit 之後身上沒有任何標記 —— item@1.marks 沒有被安裝").toBeDefined();
    expect([...bag!.keys()].length).toBeGreaterThan(0);
    const markId = [...bag!.keys()][0]!;
    const before = bag!.get(markId)!.count;

    const hp = world.health.get(hero)!;
    world.damageQueue.push({
      source: foe,
      target: hero,
      amount: hp.maxHp * 10,
      type: "physical",
      crit: false,
      origin: "ability:test.lethal",
    });
    world.step(NO_INTENTS);

    // ② 免死那一半：人活著，而且真的燒了層數。
    expect(world.health.get(hero)!.alive).toBe(true);
    expect(bag!.get(markId)!.count).toBeLessThan(before);

    // ③ ⭐ 承重：`selfEffects` 的 applyBuff 真的落在身上。
    const sources = world.stats.get(hero)!.sources.map((s) => s.id);
    expect(
      sources.some((id) => id.startsWith("buff:stack:")),
      "免死成功了但 selfEffects 一個都沒跑 —— 卡面上「每擋一次 AD+100%」還是空的",
    ).toBe(true);
  });
});
