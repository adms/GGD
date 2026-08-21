/**
 * ⭐【名言包裡的每一筆都真的響得出來】(GH#441)
 *
 * 量到的（2026-08-19 普查）：`godie-zombiex` 的名言條目住在 `quotes.json` 的
 * **最外層**而不是 `quotes` 物件裡，而 `championQuotesFromDoc()` 只讀 `doc.quotes`
 * ⇒ 那一筆是**死資料**：喪標麥可的名言既不會播、也不會顯示在選人資料卡上。
 * ⛔ 而且它對應的 mp3 **根本不存在**。
 *
 * ⚠️ 沒有任何既有守衛會紅：`nameVoice.test.ts` 驗的是**解析器**（給它什麼它就
 * 解什麼），⛔ 不是「出貨的那一份包裡有沒有東西掉在解析器看不到的地方」
 * （失敗形態⑤：被測的不是出貨的那個）。
 *
 * ⇒ 這一條把那個判準換成閘（CLAUDE.md 元規則）。兩個方向都關：
 *   ① `quotes` 裡的每一筆，clip 都要真的在磁碟上 —— 一筆「說了但不會響」的名言
 *      正是第一·五守則點名的形態（卡片上印著那句話，按下去是安靜的）。
 *   ② `quotes` **外面**不可以有長得像英雄 id 的鍵 —— 那就是 GH#441 的形狀本身，
 *      而它安靜地活了下來，因為 JSON 收得下、`content:build` 綠、後台照樣畫。
 *
 * ⛔ 兩條都讀**出貨的那一份**（`content/assets/audio/voices/quotes/quotes.json`），
 * ⛔ 不是手寫夾具。
 *
 * 突變紀錄（跑過）：
 *   · 把 `godie-zombiex` 搬回 `quotes` 外面 → ② 紅並指名它 ✅
 *     （同時 ① 也紅，因為那一筆從 `quotes` 消失前後 clip 檢查的母體會變）
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { championQuotesFromDoc, QUOTE_VO_MANIFEST_PATH } from "./nameVoice";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const DOC = JSON.parse(readFileSync(join(CONTENT, QUOTE_VO_MANIFEST_PATH), "utf8")) as Record<string, unknown>;

/** 出貨包的「這不是一筆名言」的頂層鍵 —— 其餘一律要在 `quotes` 裡面。 */
const META_KEYS = new Set([
  "id",
  "schema",
  "note",
  "generatedBy",
  "generator",
  "voice",
  "loudness",
  "coverage",
  "fields",
  "quotes",
]);

describe("名言包的完整性 (GH#441)", () => {
  it("每一筆名言的 clip 都真的在磁碟上 —— ⛔ 不可以有一句按下去是安靜的", () => {
    const manifest = championQuotesFromDoc(DOC);
    expect(manifest, "出貨的 quotes.json 解不出任何一筆 —— 整個名言功能是死的").not.toBeNull();
    const entries = Object.entries(manifest!.quotes);
    expect(entries.length, "這條在測空氣").toBeGreaterThan(0);
    const missing = entries.filter(([, e]) => !existsSync(join(CONTENT, e.clip))).map(([id, e]) => `${id} → ${e.clip}`);
    expect(
      missing,
      "這幾筆名言在選人資料卡上印得出來，但 clip 不存在 ⇒ 按下去是安靜的（第一·五守則）。" +
        "補 mp3（`node tools/tts-gen/src/generate.mjs …`），⛔ 不要放寬這條：\n  " + missing.join("\n  "),
    ).toEqual([]);
  });

  it("`quotes` 外面沒有掉出去的名言條目 —— 那正是 GH#441 的形狀", () => {
    // 判準是**它長得像不像一筆名言**（帶 clip / jpQuote），⛔ 不是「它叫什麼名字」——
    // 抄一份英雄 id 名單就是第二個住處，而它一定會過期。
    const strays = Object.entries(DOC)
      .filter(([k]) => !META_KEYS.has(k))
      .filter(([, v]) => !!v && typeof v === "object" && ("clip" in (v as object) || "jpQuote" in (v as object)))
      .map(([k]) => k);
    expect(
      strays,
      "這幾筆名言掉在 `quotes` 物件外面 —— 解析器只讀 `doc.quotes`，所以它們是死資料" +
        "（既不會播也不會顯示）。把它們搬進 `quotes`：\n  " + strays.join("\n  "),
    ).toEqual([]);
  });
});
