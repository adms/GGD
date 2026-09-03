/**
 * ⭐⭐ **一個變身態退場之前，要先問卡面**（GH#623）。
 *
 * ⛔⛔ **這張票的分級已經被推翻了，而推翻它的紀錄就在 CLAUDE.md 裡**
 * （2026-08-27 逐字）：
 * > v2 報告有一欄叫「退場會掉什麼」，而它的表頭逐字寫著「（**今天畫面上真的存在的**）」
 * > ⇒ ⭐ **它只量了六個視覺軸，從來沒讀過卡面文字。**
 * > 逐句對照卡面之後：**9 個「🟢 可以退場」裡只有 1 個真的可以** ——
 * > 其餘三個退場都會讓**卡面當場變成謊話**（第一·五守則）。
 *
 * ⇒ ⭐⭐ 所以這張票**不可以照它自己的分級執行** ——
 * 🟢9 那一欄的分母是「六個視覺軸」，⛔ 不是「玩家讀得到的東西」。
 *
 * ⭐ 而票文自己寫對了驗收條件（逐字）：
 * > 「每一對退場都要驗『**退場後那支技能仍然做得到同一件事**』，
 * >  ⛔ 不是『選人畫面上看不到它了』」
 *
 * ⇒ ⭐ 這一支就是那個驗收條件的**可執行版本**：
 * 一個變身態文件如果不見了，而**卡面還在講它的事**，⇒ 🔴。
 *
 * ⚠️ ⭐ 它同時是**下一次退場的前置閘** —— ⛔ 不是一份會過期的分級表。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 從 `COUNTERPART_OWNER` 拿掉一對（＝假裝退場了）
 *    → 🔴 ②「這一對的卡面還在講變身，而它的對造不見了」
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../../..");
const CHAMPS = join(ROOT, "content/champions");
const ABIL = join(ROOT, "content/abilities");

/** ⭐ 出貨的變身對子表（`form_counterparts.py` 的 `COUNTERPART_OWNER`）。 */
function counterparts(): string[] {
  const py = readFileSync(join(ROOT, "tools/skill-remake/form_counterparts.py"), "utf8");
  const block = /COUNTERPART_OWNER = \{([\s\S]*?)\n\}/u.exec(py);
  if (!block) return [];
  return [...block[1]!.matchAll(/"(godie-[a-z0-9]+)":/gu)].map((m) => m[1]!);
}

/** ⭐ 一份文件裡的卡面文字（⛔ 剝掉 `「…」` 角色台詞 —— 第〇·六守則）。 */
function cardText(doc: unknown): string {
  const out: string[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === "description" && typeof v === "string") out.push(v);
      else walk(v);
    }
  };
  walk(doc);
  return out.join("\n").replace(/「[^」]*」/gu, "");
}

describe("變身態退場的前置閘（GH#623）", () => {
  it("★★ ⭐ 對子表**不是空的**（⛔ 空的話下面那條靜靜變綠）", () => {
    expect(
      counterparts().length,
      "⛔ 一對變身都量不到 —— 解析器瞎了，這一支的結論全部作廢",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐⭐ **每一個被卡面點名的變身態都還在**（⛔ 退場了卡面就變謊話）", () => {
    const alive = new Set(readdirSync(CHAMPS).map((f) => f.replace(/\.json$/u, "")));
    const broken: string[] = [];
    for (const alt of counterparts()) {
      if (alive.has(alt)) continue;
      // ⭐ 它不在了 —— ⛔ 那就要問：**還有沒有卡面在講它的事**？
      for (const f of readdirSync(ABIL)) {
        if (!f.endsWith(".json") || f === "_index.json") continue;
        const doc = JSON.parse(readFileSync(join(ABIL, f), "utf8")) as Record<string, unknown>;
        if (cardText(doc).includes("變身")) broken.push(`${alt} ← ${String(doc["id"])}`);
      }
    }
    expect(
      broken.slice(0, 5),
      "⛔⛔ 一個變身態退場了，而**卡面還在講變身** ⇒\n" +
        "  ⭐ CLAUDE.md 2026-08-27 逐字記過這件事：v2 報告的「🟢 可以退場」\n" +
        "  只量了**六個視覺軸**，從來沒讀過卡面文字\n" +
        "  ⇒ **9 個 🟢 裡只有 1 個真的可以**，其餘退場會讓卡面當場變成謊話。\n" +
        "  ⇒ ⭐ 退場之前先改卡面（第一·五守則），⛔ 不是先刪文件。",
    ).toEqual([]);
  });

  it("★★ ⭐ 對子的**兩邊都在**（⛔ 半個退場比不退場更糟）", () => {
    const missing = counterparts().filter(
      (alt) => !existsSync(join(CHAMPS, `${alt}.json`)),
    );
    expect(
      missing,
      "⛔⛔ 對子表點名的變身態文件不見了 ⇒\n" +
        "  ⭐ 「本體改了、變身態沒改」是這個 repo 記過最多次的資料毀損形狀\n" +
        "  （玩家變身之後用的是舊的那一份，而全套測試會全綠）。",
    ).toEqual([]);
  });
});
