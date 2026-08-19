/**
 * 級距名是 **owner 指定的五個字**，⛔ 不是任何人推導出來的。
 *
 * 2026-08-19（GH#463）：合併兩套舊詞彙時選了「保留使用中的那個字」而留下 **`超大`**。
 * ⚠️ 那個字**不是憑空發明的** —— owner 2026-08-11 給 AoE 四級距時親口說過它。
 * 錯的是**挑了舊版本**：owner 在 **同一天（08-19）**給冷卻級距時已經改口成
 * 「一樣是極小小中大極大」，而第〇·六守則說第 1 層裡**新的贏**。
 * 這個挑錯在被抓到之前已經長進 505 筆出貨內容。owner 的原話：
 *
 * > 「明明就是 **極小 小 中 大 極大** 五級距怎麼又變成六了，
 * >  **沒有超大這種東西**哪裡來的？」
 *
 * ⚠️ 而那次改回來的遷移是這個 repo 最危險的操作之一：`小` 在改名前後**都是合法值**，
 * 只是從第 1 格變成第 2 格。⇒ 只改 enum 不重寫內容的話，253 筆會被**靜默重新解讀**，
 * 而 Zod 過、`content:build` 過、全套測試綠。
 *
 * ⇒ 這一條把兩個方向都關起來：**名單本身**要逐字對，**內容裡的每一個級距詞**
 * 也要在名單上。任何人再發明一個字（或把某一格改名而忘了重寫內容）都會紅。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SKILL_TIER_NAMES } from "./skillTiers";

const CONTENT = join(__dirname, "..", "..", "..", "..", "content");

/** 值是級距詞的每一個欄位。⛔ 漏一個 = 那一軸的內容會被靜默重新解讀。 */
const TIER_FIELDS = [
  "rangeTier",
  "radiusTier",
  "travelTier",
  "pushTier",
  "distanceTier",
] as const;

function* jsonFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* jsonFiles(p);
    // ⛔ 產物不算 —— 它們是從來源重建的，紅在這裡只會指向錯的地方。
    else if (e.endsWith(".json") && !["bundle.json", "manifest.json", "_index.json"].includes(e)) {
      yield p;
    }
  }
}

describe("級距名", () => {
  it("逐字等於 owner 指定的五個字", () => {
    expect([...SKILL_TIER_NAMES]).toEqual(["極小", "小", "中", "大", "極大"]);
  });

  it("content/ 裡沒有任何不在名單上的級距詞", () => {
    const allowed = new Set<string>(SKILL_TIER_NAMES);
    const offenders: string[] = [];
    for (const f of jsonFiles(CONTENT)) {
      const raw = readFileSync(f, "utf8");
      if (!TIER_FIELDS.some((k) => raw.includes(`"${k}"`))) continue;
      for (const k of TIER_FIELDS) {
        for (const m of raw.matchAll(new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`, "g"))) {
          if (!allowed.has(m[1]!)) offenders.push(`${f.slice(CONTENT.length + 1)} → ${k}: ${m[1]}`);
        }
      }
    }
    expect(offenders, offenders.slice(0, 10).join("\n")).toEqual([]);
  });

  it("三張級距表的鍵名就是那五個字，順序也一樣", () => {
    for (const name of ["range-tiers", "aoe-tiers", "displacement-tiers"]) {
      const doc = JSON.parse(readFileSync(join(CONTENT, "config", `${name}.json`), "utf8"));
      for (const [k, v] of Object.entries(doc)) {
        // 級距表的那幾個區塊 = 值是物件、而且鍵剛好是五個級距名那幾個
        if (typeof v !== "object" || v === null || Array.isArray(v)) continue;
        const keys = Object.keys(v);
        if (keys.length !== SKILL_TIER_NAMES.length) continue;
        expect(keys, `${name}.${k}`).toEqual([...SKILL_TIER_NAMES]);
      }
    }
  });
});
