/**
 * `status-effect@1.tags` 的**上下界**，加上開放架構的「類別」那一半。
 *
 * ⚠️ 這一支刻意**不**驗「每份帶著等同 id 的專屬 tag」——
 * `content/statusTagOpenness.test.ts` 已經是那條的閘（連同 kebab-case 形狀與
 * 打錯字偵測）。抄第二份就是第二個住處，而兩份斷言只會在某一天分歧。
 * 這裡只補它沒有的兩件事：**schema 的界**，與**類別 tag 真的存在**。
 *
 * owner 2026-08-08：「[狀態 tag]**應該要做成開放架構，tag 盡可能多不要共用**」
 * 開放（自由字串、加分類不必改程式）不等於無界（第一守則：欄位要有上界）。
 *
 * ⛔ 不驗任何一份帶哪幾個類別（第零守則⑦：出貨值不進斷言）。分類是 owner 每次改
 * 文案都可能動的東西；驗的是**規則**。
 *
 * 突變驗證（兩條都真的跑過，紅了再改回來）：
 *   ① `content/status-effects/magic-break.json` 的 tags 只留 `["magic-break"]`
 *      → 「類別 tag」那條紅，訊息指名 magic-break
 *   ② `statusEffect.ts` 的 `.max(STATUS_TAGS_MAX)` 拿掉 → 「上下界」那條紅
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STATUS_TAGS_MAX, zStatusEffectDoc } from "./statusEffect";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../..", "content/status-effects");

/** 出貨的那一份，用出貨的那個 schema 解析 —— 不是手寫夾具（失敗形態 ⑤）。 */
const DOCS = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .sort()
  .map((f) => zStatusEffectDoc.parse(JSON.parse(readFileSync(join(DIR, f), "utf8"))));

describe("status-effect tags", () => {
  it("每一份除了自己的專屬 tag，還帶著至少一個別人也有的類別 tag", () => {
    expect(DOCS.length).toBeGreaterThan(0);
    const users = new Map<string, number>();
    for (const d of DOCS) for (const t of d.tags ?? []) users.set(t, (users.get(t) ?? 0) + 1);
    // 專屬 tag 不能是全部，否則「類別條件」整個機制沒有東西可以查得到這一份。
    const noCategory = DOCS.filter(
      (d) => !(d.tags ?? []).some((t) => t !== d.id && (users.get(t) ?? 0) > 1),
    );
    expect(noCategory.map((d) => d.id)).toEqual([]);
  });

  it("開放不等於無界：超長 / 前後空白 / 重複 / 數量爆炸都被擋在存檔那一刻", () => {
    const base = { id: "x", schema: "status-effect@1", name: "x" };
    const rejected: readonly string[][] = [
      ["a".repeat(41)], // 每個 tag 的長度上界（誤植攔截：整段描述被貼進來）
      [" stun"], // 前後空白 —— 表單上跟 "stun" 一模一樣，卻永遠比不中
      ["stun", "stun"], // 重複：看起來寫了東西，實際什麼都沒改變
      Array.from({ length: STATUS_TAGS_MAX + 1 }, (_, i) => `t${i}`), // 數量上界
    ];
    for (const tags of rejected) {
      expect(zStatusEffectDoc.safeParse({ ...base, tags }).success).toBe(false);
    }
    expect(zStatusEffectDoc.safeParse({ ...base, tags: ["stun", "hard-cc"] }).success).toBe(true);
  });
});
