/**
 * GH#310 —— 一支技能的 AoE 半徑不可以超過決鬥區半徑。
 *
 * ⚠️ 這條守衛的整段歷史就是「量錯」的歷史，所以它的**形狀**比它的斷言重要：
 *
 * ① 原本的普查走訪整棵 `AbilityDef` 收集所有叫 `radius` 的數字再取 `Math.max`，
 *    於是撿到 `template.params.radius`（**作者填的 WC3 原始值**，例如 513.5）
 *    而不是 `AbilityDef.radius`（**引擎輸出**，9.41）→ 報出「29 支全場命中」，
 *    全部是誤報。失敗形態⑤：被測的不是出貨的那個。
 * ② 修好之後的 atlas 又只看模板技（`template.params.radius` 存在才算），
 *    而**唯一真的超標的那一支是手寫 radius、沒有模板** → 它永遠看不到。
 *    失敗形態：過濾條件把要找的東西排除掉。
 *
 * 所以這裡的三個做法是刻意的：
 *   · 讀 **`registerAll` 之後**的註冊表（`Abilities` + `Champions` 內嵌鏡像），
 *     ⛔ 不讀磁碟上的 JSON、⛔ 不走訪整棵樹取 max
 *   · **兩份都掃** —— 內嵌那一份在 runtime 可能贏（見 abilityShadowing.test.ts）
 *   · 上界從 `Arenas` **推導**（每張競技場每個 zone 的 `boundaryRadius` 取最小），
 *     ⛔ 不抄字面值 24（第二守則：出貨數值不住在測試裡）
 *
 * 突變紀錄：
 *   · 把 `content/abilities/godie-o00k.passive.json` 的 radius 改回 29.33 → 紅
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { registerAll, Arenas } from "./registries";
import { Abilities, Champions } from "../sim/content/registry";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

describe("AoE 半徑不得超過決鬥區（GH#310）", () => {
  it("⭐ 每一支技能的引擎半徑 ≤ 最小的 zone 半徑 —— standalone 與英雄卡內嵌都算", async () => {
    cover("ability-radius-within-zone");
    // ⚠️ `load()` 回的是 `{ store, … }`，不是 store 本身 —— 直接餵進去會
    //    `store.all is not a function`（castTimeCoverage.test.ts:110-111 是對的樣板）。
    const loaded = await new ContentLoader(shippedContentSource(CONTENT)).load();
    registerAll(loaded.store);

    const zoneRadii = Arenas.all().flatMap((a) => a.zones.map((z) => z.boundaryRadius));
    expect(zoneRadii.length, "夾具前提：讀不到任何 zone 就等於在測空集合").toBeGreaterThan(0);
    const limit = Math.min(...zoneRadii);

    const over: string[] = [];
    const seen = (id: string, r: unknown) => {
      if (typeof r === "number" && r > limit) over.push(`${id}: ${r} > ${limit}`);
    };
    for (const d of Abilities.all()) seen(d.id, (d as { radius?: number }).radius);
    for (const c of Champions.all())
      for (const [slot, ab] of Object.entries(c.abilities ?? {}))
        seen(`${c.id}.${slot}(內嵌)`, (ab as { radius?: number } | undefined)?.radius);

    // 夾具前提：真的有技能帶半徑，否則上面兩圈是在掃空氣（失敗形態③）。
    const withRadius = Abilities.all().filter((d) => typeof (d as { radius?: number }).radius === "number");
    expect(withRadius.length, "一支帶 radius 的技能都沒有 —— 這條守衛在測空集合").toBeGreaterThan(50);

    expect(over, "半徑超過決鬥區 = 那不是範圍技，是「所有人」").toEqual([]);
  });
});
