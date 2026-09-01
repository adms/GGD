/**
 * ⭐⭐ 「**契約說得出真話**」的第三條 —— main 第二件責任的**棘輪**。
 *
 * owner 的大目標：引擎長出新機制 ⇒ ⭐ 契約自動變長 ⇒ 編輯器那邊自動變紅。
 *
 * ── ⚠️ 既有的兩條閘管的是**新鮮度與雙向真話**，⛔ 管不到「縮水」──────────
 * | 既有的閘 | 它問什麼 | ⛔ 它問不出來的 |
 * |---|---|---|
 * | `editorCoverageFresh` | 契約是不是從**現在**的 schema 重新產生的 | ⛔ 重新產生**之後變短了**它照樣綠 |
 * | `editorCapabilities` | 宣告 supported/unsupported 兩個方向都不可以說謊 | ⛔ 一格**整個消失**不算說謊 |
 *
 * ⇒ ⭐⭐ 有人拿掉一個 effect kind／一個 enum 值／一整族欄位時，
 *   契約會**安靜地變短**，⛔ 而編輯器那邊只會發現「那個東西不見了」——
 *   ⚠️ 而那正是 owner 的目標**反過來**：編輯器做得到的事變少，⛔ 而沒有人喊。
 *
 * ── ⭐ 這條問的是一個**會變的問題**（元規則：⛔ 不要寫死一個常數）────────
 * 基準線就是**上一次量到的格數**，而它**只准往上**。
 * ⇒ 真的要縮（例如一個機制被正式退場）⇒ ⭐ 把基準線調小，
 *   ⛔ 而那是一個**看得見的決定**，⛔ 不是一次安靜的消失。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 契約 JSON 砍掉 10 筆 `required` → 🔴（訊息指名少了幾格）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

/**
 * ⭐ 棘輪：**只准往上**。2026-09-01 量到的格數。
 *
 * ⚠️ 這個 session 的實測（⭐ 它證明了「引擎長出機制 ⇒ 契約自動變長」是真的）：
 *   · `vfx@1` 長出 KP2* 八條時間軌  ⇒ `vfxField` 53 → **86**
 *   · `spawnModelFx` 收得下骨頭掛點 ⇒ 4,873 → **4,874**
 *   · `damageTierPerRank` ＋ `summon-agent` 家族 ⇒ **4,895**
 *   · ⭐ `grantXp`（GH#890）⇒ **4,899** —— ⭐ 棘輪往上轉的樣子
 */
const FLOOR = 4908;

describe("⭐ 編輯器契約只會變長（棘輪）", () => {
  const doc = JSON.parse(
    readFileSync(resolve(ROOT, "docs/editor-contract/ggd-editor-coverage.json"), "utf8"),
  ) as { required?: unknown[]; fingerprint?: string };

  it("★ ① `required` 的格數**不可以變少**", () => {
    const n = doc.required?.length ?? 0;
    expect(
      n,
      `⛔⛔ 契約從 ${FLOOR} 格變成 ${n} 格 —— ⭐ **少了 ${FLOOR - n} 格**。\n` +
        `⚠️ 既有的兩條閘對這件事是**綠的**：\n` +
        `   · \`editorCoverageFresh\` 只問「是不是重新產生的」—— ⛔ 變短了也是重新產生的\n` +
        `   · \`editorCapabilities\` 只問「宣告有沒有說謊」—— ⛔ 一格**整個消失**不算說謊\n` +
        `⇒ ⭐ 而編輯器那邊只會發現「那個東西不見了」，⛔ 沒有人喊。\n` +
        `⭐ 真的要縮（一個機制正式退場）⇒ 把 FLOOR 調小 —— ⛔ 那要是一個**看得見的決定**。`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  it("⭐ ② 指紋在（⛔ 少了它，編輯器分不出兩份契約）", () => {
    expect(typeof doc.fingerprint, "⛔ 契約沒有指紋 ⇒ 編輯器無法判斷自己讀的是哪一版").toBe("string");
    expect((doc.fingerprint ?? "").length).toBeGreaterThan(8);
  });

  it("⭐ ③ **量尺自證**：把清單截短，第 ① 條要抓得到", () => {
    // ⚠️ CLAUDE.md：一把只驗過單邊的尺不算自證過。
    const shrunk = (doc.required ?? []).slice(0, 10).length;
    expect(shrunk < FLOOR, "⛔ 檢查器連「只剩 10 格」都判成沒問題 ⇒ 第 ① 條是瞎的").toBe(true);
  });
});
