/**
 * ⭐⭐ **正規化器 ⛔ 不可以吃掉它沒有產生的那幾格**（2026-09-02 量到）。
 *
 * ⛔⛔ 發生了什麼：`tools/ap-conversion/apply.py` 為了**冪等**，每一次都把
 * `ratios` 整條倒回 `claims.json` 的**換算前快照**再重算
 * （它的註解逐字解釋了為什麼 —— 那個設計是**對的**）。
 * ⚠️ ⭐ 而那份快照裡沒有**別人**寫的條件式係數
 * （GH#936 的碎片增幅、GH#944 的變身增幅，帶 `when` 的那幾筆）
 * ⇒ ⭐⭐ 它們在下一次 `pnpm skills:sync` **靜默消失**。
 *
 * ⭐⭐ **而它為什麼難查**：紅的不是「內容被吃了」，
 * 紅的是**四條剛寫好的守衛同時失敗** ⇒ 讀起來像「守衛壞了」。
 * ⚠️ 那是 CLAUDE.md 的「改產物等於沒改」，⭐ 只是**方向相反**：
 * 這一次被吃的是**手編檔**，而吃它的是一支正規化器。
 *
 * ⭐ 判準（第〇·四守則）：**一個只覆寫其中幾格的正規化器，
 * ⛔ 不可以丟掉它沒有產生的那幾格。**
 *
 * ⚠️ ⭐ 這一支是**棘輪**，⛔ 不是「數字要等於 4」——
 * 4 是量到的現況：⭐ 變多代表有人又寫了一條條件式係數（好事，把下限調上來）；
 * ⛔ **變少代表有一支正規化器又把它吃了**，⭐ 而那正是這一支要抓的東西。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ABIL = join(__dirname, "../../../../content/abilities");

/** ⭐ 走訪任何巢狀結構 —— ⛔ 不假設條件式係數住在頂層。 */
function conditionalRatios(o: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) {
    o.forEach((v) => conditionalRatios(v, out));
    return out;
  }
  if (!o || typeof o !== "object") return out;
  const n = o as Record<string, unknown>;
  for (const key of ["ratios", "attrRatios"]) {
    const arr = n[key];
    if (Array.isArray(arr))
      for (const r of arr)
        if (r && typeof r === "object" && (r as Record<string, unknown>)["when"] !== undefined)
          out.push(r as Record<string, unknown>);
  }
  for (const v of Object.values(n)) conditionalRatios(v, out);
  return out;
}

function scan(): { total: number; byFile: Map<string, number> } {
  const byFile = new Map<string, number>();
  let total = 0;
  for (const f of readdirSync(ABIL)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const found = conditionalRatios(JSON.parse(readFileSync(join(ABIL, f), "utf8")));
    if (found.length > 0) {
      byFile.set(f, found.length);
      total += found.length;
    }
  }
  return { total, byFile };
}

/** ⭐ 量到的現況（2026-09-02）—— ⛔ 不是目標，是**下限**。 */
const FLOOR = 4;

describe("正規化器不吃條件式係數（2026-09-02）", () => {
  it("★★ ⭐⭐ 棘輪：帶 `when` 的係數**只准變多**", () => {
    const { total, byFile } = scan();
    expect(
      total,
      `⛔⛔ 條件式係數從 ${FLOOR} 掉到 ${total} —— ⭐ 八成是某一支正規化器把它吃了。\n` +
        "  ⚠️ ⭐ 查法：把那幾份從 git 還原、跑 `bash scripts/genrun.sh <那一支>`、再看還在不在。\n" +
        "  ⭐ 已知會這樣做的：`apconv:build`（`tools/ap-conversion/apply.py` 倒回 claims 快照）。\n" +
        `  ⭐ 今天還在的：${[...byFile.keys()].join(", ") || "（一個都沒有）"}`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  it("⭐ 04-002 點名的兩支（龍破斬 · 神滅斬）**兩份鏡射都**帶著條件", () => {
    const { byFile } = scan();
    const want = ["godie-h020.e.json", "godie-hjai.e.json", "godie-h020.r.json", "godie-hjai.r.json"];
    const missing = want.filter((f) => !byFile.has(f));
    expect(
      missing,
      "⛔ 少了鏡射的一半 ⇒ 玩家變身之後拿到的是**沒有增幅**的那一份（GH#944）",
    ).toEqual([]);
  });

  it("⭐ 每一筆條件式係數都有**看得懂的條件**（⛔ 不是空物件）", () => {
    const bad: string[] = [];
    for (const f of readdirSync(ABIL)) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      for (const r of conditionalRatios(JSON.parse(readFileSync(join(ABIL, f), "utf8")))) {
        const w = r["when"] as Record<string, unknown> | null;
        // GH#1058：`when` 也可以是 `{all:[…]}` / `{any:[…]}` / `{not:{…}}` 的組合（schema/condition.ts:392）——
        // 判準是**每一片葉子**都有 `kind`，⛔ 不是根節點有 `kind`。
        const leavesHaveKind = (c: unknown): boolean => {
          if (!c || typeof c !== "object") return false;
          const o = c as Record<string, unknown>;
          if (Array.isArray(o["all"])) return (o["all"] as unknown[]).length > 0 && (o["all"] as unknown[]).every(leavesHaveKind);
          if (Array.isArray(o["any"])) return (o["any"] as unknown[]).length > 0 && (o["any"] as unknown[]).every(leavesHaveKind);
          if (o["not"] !== undefined) return leavesHaveKind(o["not"]);
          return typeof o["kind"] === "string";
        };
        if (!leavesHaveKind(w)) bad.push(f);
      }
    }
    expect(bad, "⛔ 一個沒有 `kind` 的 `when` 引擎讀不懂 ⇒ 那條係數等於不存在").toEqual([]);
  });
});
