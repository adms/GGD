/**
 * 施法距離級距的**採用率棘輪**（GH#414 / GH#438）。
 *
 * 背景：GH#414 把整套做完了 —— Zod 欄位 + `config.range-tiers@1` + `resolveRangeTier`
 * + 後台頁 + 契約文件 + 梯子守衛 —— 而 2026-08-19 量到出貨採用率是 **0/461**。
 * owner 抱怨的「可施展技能的距離普遍超遠」因此一格都沒被修：214 支技能各自帶自由
 * 數字，中位 11、**30 支超過梯子頂端 12**、最大 29.33（決鬥區半徑只有 24）。
 *
 * ⭐ 這一條擋的不是「有沒有做功能」，是「**做完的功能有沒有真的被用**」——
 * 那正是失敗形態②（算出來了但沒送到玩家）在**內容**上的樣子。
 *
 * ⛔ 這條紅了不要放寬數字：要嘛替新技能填 `rangeTier`，
 * 要嘛（若它真的該離群）把它加進 #433 的待裁決清單並由 owner 拍板。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = join(REPO, "content/abilities");

/**
 * 還沒填 `rangeTier` 的技能上限。⭐ 這是一條**棘輪**：只准降，⛔ 不准升。
 * 2026-08-19 寫回 205 支之後剩 9 支，全部是 GH#433 待 owner 裁決的離群值。
 */
const UNTIERED_CEILING = 9;

describe("施法距離級距的採用率（GH#414）", () => {
  it("⛔ 「有射程卻沒有級距」的技能數不得增加", () => {
    const untiered: string[] = [];
    let withRange = 0;
    for (const f of readdirSync(DIR)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const d = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Record<string, unknown>;
      if (typeof d.range !== "number" || d.range <= 0) continue;
      withRange++;
      if (typeof d.rangeTier !== "string") untiered.push(`${f}（range ${d.range}）`);
    }
    expect(withRange, "掃不到帶射程的技能 —— 這條守衛是空的").toBeGreaterThan(150);
    expect(
      untiered.length,
      `這些技能有射程卻沒有 rangeTier，而級距表整套早就做完了：\n  ${untiered.join("\n  ")}\n` +
        `⛔ 不要調高 UNTIERED_CEILING（現在 ${UNTIERED_CEILING}）—— 那是把棘輪拆掉。`,
    ).toBeLessThanOrEqual(UNTIERED_CEILING);
  });
});
