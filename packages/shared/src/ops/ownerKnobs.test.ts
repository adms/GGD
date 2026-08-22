/**
 * ⛔⛔ **系統倍率是 owner 的人工旋鈕 —— 不是我的。**
 *
 * owner 2026-08-22（他說這是**第三次**釐清）：
 *
 * > 「對 我說過**這是我人工的旋鈕**，並沒有放在公式裡，我們上次已經釐清過，**為何你要再犯**？」
 *
 * ── 為什麼這條守衛存在 ────────────────────────────────────────────────────
 * 那句話有**兩半**，而 repo 在 2026-08-22 之前只記了第一半：
 *   ① 倍率不可以**進公式** —— 架構規則，記在 `damageTiers.ts::anchorFloorFrom` ✅
 *   ② ⛔ 倍率**不是我能轉的** —— 所有權規則，⛔ **哪裡都沒記**
 *
 * ⇒ 缺了②的後果（真的發生了）：為了把平衡拉回 owner 說過的「3.5 發」，
 *   我把 `damageDealt` 從 1.0 設成 2.5。⭐ **每一條既有的閘都是綠的** ——
 *   沒進推導公式、三個住處齊全、有中文說明與上下界。
 *   owner 當場抓到：「**我什麼時候提到 damageDealt 1.0→2.5 ?**」
 *
 * ── 它驗什麼 ──────────────────────────────────────────────────────────────
 * ⭐ **不是「值等於某個數字」**（那是第二守則禁止的：出貨數值是 owner 每週在調的）。
 *   驗的是「**這一格的出貨值，引用得到 owner 的哪一句原話**」——
 *   `owner-knobs.json` 的每一列都帶一句逐字 `quote`，而出貨值必須等於那一列。
 *
 * ⇒ owner 改一格 ⇒ 我把新值與**他的原話**一起寫進 `owner-knobs.json`，測試就綠。
 *   我自己改一格 ⇒ 兩份對不上 ⇒ **紅**，而且訊息會問「他哪一句話說了這個？」
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../../content/config");
const read = (f: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, f), "utf-8")) as Record<string, unknown>;

interface Knob {
  value: number;
  quote: string;
  on: string;
}

describe("系統倍率是 owner 的人工旋鈕 (owner 2026-08-22)", () => {
  const knobs = read("owner-knobs.json")["knobs"] as Record<string, Knob>;
  const env = read("combat-env.json")["multipliers"] as Record<string, number>;

  it("⛔ 每一格出貨值都等於 owner 授權表上的那一個 —— 對不上就是我自己轉的", () => {
    const drift = Object.entries(knobs)
      .filter(([k, v]) => env[k] !== v.value)
      .map(([k, v]) => `${k}: 授權表 ${v.value} ⇄ 出貨 ${env[k]}（owner 的原話：「${v.quote}」）`);
    expect(
      drift,
      "⛔ 這幾格的出貨值與 owner 的授權表對不上。\n" +
        "⭐ 要問的是：**他哪一句話說了這個數字？**\n" +
        "  · 他說過 ⇒ 把新值與那句**逐字原話**一起寫進 content/config/owner-knobs.json\n" +
        "  · 他沒說過 ⇒ ⛔ 把出貨值改回授權表上的那一個，並把選項列給他（⭐ 列了就真的不要自己挑）",
    ).toEqual([]);
  });

  it("⛔ 每一格都要帶一句 owner 的原話 —— 一格沒有出處的旋鈕就是沒有人授權過", () => {
    const noQuote = Object.entries(knobs)
      .filter(([, v]) => typeof v.quote !== "string" || v.quote.trim().length === 0)
      .map(([k]) => k);
    expect(noQuote, "沒有出處的旋鈕 ⇒ 補上 owner 的逐字原話，或把它從表上拿掉").toEqual([]);
  });

  it("⭐ 授權表點名的每一格都真的是引擎認得的倍率（⛔ 不是一個打錯字的名字）", () => {
    const unknown = Object.keys(knobs).filter((k) => !(k in env));
    expect(unknown, "授權表上有引擎不認得的 key ⇒ 它守不到任何東西").toEqual([]);
  });
});
