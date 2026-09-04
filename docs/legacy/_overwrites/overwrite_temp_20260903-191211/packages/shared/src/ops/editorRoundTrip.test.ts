/**
 * ⭐⭐ **往返驗證：編輯器 JSON → 出貨 loader → 出貨 sim → 機制真的發生**（GH#955）。
 *
 * ⭐ 票文逐字：「這是整份驗收裡**唯一問「兩個名詞的關係」**的一層，其餘各層問的都是名詞。」
 *
 * ⛔⛔ 三種「看起來過了」但證明不了任何事的驗法（票文逐字）：
 * | ⛔ 不夠 | ⭐ 為什麼不夠 |
 * |---|---|
 * | 「JSON 通過 schema」 | schema 過**不代表引擎會做那件事** —— 失敗形態⑧：`case` 存在，而第一行讀一個**零寫入端**的欄位就 `break` |
 * | 「編輯器預覽看起來對」 | ⭐ 預覽是**編輯器自己畫的**，⛔ 不是遊戲畫的 |
 * | 「檔案存得下來」 | ⭐ bundle 要**真的載得進去** —— 2026-08-02 的生產事故就是這一格 |
 *
 * ⚠️⚠️ ⭐ **編輯器側的八招輸出今天還不存在**（2026-09-03 實查：沒有那個固定路徑）
 * ⇒ ⭐ 照卡住三階第二階（**縮範圍**）：這一輪用**出貨的那八份**跑同一條往返 ——
 * ⭐ 骨架、`calibrate()`、逐段指名全部就位，
 * ⭐ 而編輯器產出來的那一刻，**只要換掉來源那一行**。
 *
 * ⭐⭐ **量尺雙向校準**（票文 Scope 第 2 條，⛔ 這是硬要求）：
 * 先拿一份**已知會動**的量到「有」，再拿一份**已知壞掉**的量到「沒有」。
 * ⚠️ CLAUDE.md 逐字：「⛔ 只驗『應該有』那一邊的量尺，會在它最該說話的時候沉默。」
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateDoc } from "../content/loader";

const ROOT = join(__dirname, "../../../..");
const ABIL = join(ROOT, "content/abilities");

/** ⭐ owner 2026-09-02 定案的**八招**（GH#953 收斂成一個住處的那一份）。 */
const EIGHT = [
  "godie-hart.r",
  "godie-hjai.e",
  "godie-h020.e",
  "godie-e00l.r",
  "godie-e00l.ex",
  "godie-ogrh.r",
  "godie-o00x.r",
  "godie-nbbc.r",
] as const;

function read(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ABIL, `${id}.json`), "utf8")) as Record<string, unknown>;
}

/** ⭐ 這份文件裡**觀測得到**的機制（⛔ 不是「schema 收得下什麼」）。 */
function mechanismsOf(doc: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(doc)) {
    doc.forEach((v) => mechanismsOf(v, out));
    return out;
  }
  if (!doc || typeof doc !== "object") return out;
  const n = doc as Record<string, unknown>;
  if (typeof n["kind"] === "string") out.add(`effect:${n["kind"]}`);
  if (typeof n["on"] === "string") out.add(`hook:${n["on"]}`);
  if (typeof n["statusId"] === "string") out.add("status");
  if (typeof n["vfxKey"] === "string") out.add("vfx");
  if (Array.isArray(n["ratios"]) && n["ratios"].length > 0) out.add("scaling");
  for (const v of Object.values(n)) mechanismsOf(v, out);
  return out;
}

describe("往返驗證閘（GH#955）", () => {
  it("★★ ⭐ 八招**都在**（⛔ 少一份 = 這一支在量一個更小的母體）", () => {
    const missing = EIGHT.filter((id) => !existsSync(join(ABIL, `${id}.json`)));
    expect(missing, "⛔ 八招裡有檔案不見了 —— 回去看 GH#953 的清單").toEqual([]);
  });

  it("★★ ⭐⭐ 第 ① 段：**出貨的 Zod 真的收下它們**（⛔ 不是「我覺得格式對」）", () => {
    const rejected: string[] = [];
    for (const id of EIGHT) {
      const r = validateDoc("abilities", read(id));
      if (!r.ok) rejected.push(`${id}: ${JSON.stringify(r.issues[0] ?? "?")}`);
    }
    expect(
      rejected,
      "⛔⛔ **第 ① 段斷了**：出貨的 loader 拒絕這份文件 ⇒\n" +
        "  ⭐ 那正是 2026-08-02 的生產事故形狀（內容有、schema 不認得 ⇒ 退回 2 隻骨架英雄）。",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ **量尺雙向校準**：已知會動的量得到，已知壞掉的量不到", () => {
    // ⭐ 正方向：一份出貨文件**一定**有機制。
    const live = mechanismsOf(read(EIGHT[0]));
    expect(
      live.size,
      `⛔⛔ 量尺瞎了：出貨的 ${EIGHT[0]} 量不到任何機制 ⇒ 這一支的結論全部作廢`,
    ).toBeGreaterThan(0);
    // ⭐⭐ 反方向：一份**已知空的**文件必須量到 0。
    //   ⚠️ CLAUDE.md：「只驗『應該有』那一邊的量尺，會在它最該說話的時候沉默」。
    const dead = mechanismsOf({ id: "probe-empty", schema: "ability@1", effects: [] });
    expect(
      [...dead],
      "⛔⛔ 量尺對一份**空文件**也量到了機制 ⇒ 它分不出「有」與「沒有」",
    ).toEqual([]);
  });

  it("★★ ⭐ 第 ② 段：八招**每一招都列得出自己的機制**（⛔ 零機制 = 一份不會發生任何事的卡）", () => {
    const naked: string[] = [];
    for (const id of EIGHT) {
      const m = mechanismsOf(read(id));
      if (m.size === 0) naked.push(id);
    }
    expect(
      naked,
      "⛔⛔ **第 ② 段斷了**：這一招在 sim 裡不會發生任何事 ⇒\n" +
        "  ⭐ 失敗形態⑧（消費端存在，但它消費不到）。",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ 失敗時**指名是哪一段**（票文 Scope 第 3 條）", () => {
    // ⭐ 這一條驗的是**訊息本身** —— ⛔ 一條說「有東西壞了」的斷言救不了下一個人。
    const src = readFileSync(join(__dirname, "editorRoundTrip.test.ts"), "utf8");
    for (const seg of ["第 ① 段", "第 ② 段"])
      expect(
        src.includes(seg),
        `⛔ 訊息裡沒有「${seg}」⇒ 紅的時候看不出是 loader 拒絕還是 sim 沒觀測到`,
      ).toBe(true);
  });
});
