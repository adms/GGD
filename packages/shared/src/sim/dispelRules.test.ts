/**
 * 【淨化】層數上限的**三個住處對帳**（GH#360：上界 50 → 60，出貨值不動）。
 *
 * 這個上界同時活在三處，而在這條守衛之前**沒有任何東西在對帳**：
 *   ① `DISPEL_MAX_COUNT_BOUNDS[1]` —— `normalizeDispelRules` 真的夾的那個數
 *   ② `zConfigDispelDoc.maxCountCap` 的 Zod `.max` —— **後台那一格的上界從它走出來**
 *      （`apps/admin/src/configForms.ts::readSchema` 讀 `node.max`，⛔ 不是手寫的）
 *   ③ `dispel.count` 的 Zod `.max` —— 逐張卡自己寫層數時的上界
 *
 * ⚠️ 分歧的形狀是**靜默**的：只抬 ② 而忘了 ①，後台存得下 60、schema 收得下 60、
 * `content:build` 全綠，而 `normalizeDispelRules` 在開場把它夾回舊上界 ——
 * 玩家那一場一格都沒變，⛔ 沒有任何東西會叫（失敗形態②：算出來了但拿不到）。
 *
 * ⛔ 這裡**刻意不斷言上界是 60** —— 那是把一個平衡數字抄進測試（第四個住處，
 * CLAUDE.md「守衛驗機制不驗數字」）。驗的是**三者相等**與**那個上界真的到得了**：
 * owner 哪天改成 80，三處一起改照樣綠；只改一處就紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DISPEL_MAX_COUNT_BOUNDS, dispelRulesFromDoc, normalizeDispelRules } from "./dispelRules";
import { zConfigDispelDoc } from "../content/schema/config";
import { zEffectDefUnion } from "../content/schema/effect";

const [LO, HI] = DISPEL_MAX_COUNT_BOUNDS;

/** Zod v3 的 `ZodNumber.maxValue` —— ⛔ 不把 `.max()` 的數字重打一次。 */
const zodMax = (node: unknown): number | null =>
  (node as { maxValue?: number | null } | undefined)?.maxValue ?? null;

/** 出貨那一份（⛔ 不是 `DEFAULT_DISPEL_RULES` —— 引擎讀的是文件，失敗形態⑤）。 */
function shippedDoc(): Record<string, unknown> {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    readFileSync(join(here, "../../../../content/config/dispel.json"), "utf8"),
  ) as Record<string, unknown>;
}

describe("【淨化】層數上限的三個住處 (GH#360)", () => {
  it("★ 後台那一格的上界 = sim 真的夾的那個數（分歧＝存得下去但場上沒反應）", () => {
    expect(
      zodMax(zConfigDispelDoc.shape.maxCountCap),
      "config.dispel@1 的 Zod .max 與 DISPEL_MAX_COUNT_BOUNDS 分家了",
    ).toBe(HI);
  });

  it("★ 逐張卡的 `dispel.count` 上界也是同一個", () => {
    const dispel = zEffectDefUnion.optionsMap.get("dispel");
    expect(dispel, "`dispel` 這個 kind 從 union 裡消失了 —— 這條守衛在空轉").toBeTruthy();
    const shape = (dispel as unknown as { shape: Record<string, { unwrap(): unknown }> }).shape;
    const count = shape.count;
    // ⛔ 不是型別體操：`count` 整格被拿掉時，上面那條斷言會 crash 而不是紅在
    // 「上界對不上」—— 訊息指錯地方的守衛比沒有守衛更貴。
    expect(count, "`dispel.count` 這一格從 effect.ts 消失了 —— 這條守衛在空轉").toBeTruthy();
    expect(zodMax(count!.unwrap()), "effect.ts 的 dispel.count 上界對不上").toBe(HI);
  });

  it("★ 那個上界真的到得了、超過真的被夾（⛔ 抬 Zod 而沒抬 sim ＝ 靜默夾回去）", () => {
    expect(normalizeDispelRules({ maxCountCap: HI }).maxCountCap).toBe(HI);
    expect(normalizeDispelRules({ maxCountCap: HI + 1 }).maxCountCap).toBe(HI);
    expect(normalizeDispelRules({ maxCountCap: LO - 1 }).maxCountCap).toBe(LO);
    // 後台存得下的，schema 也要收得下（兩層不可以各有各的界）。
    const doc = shippedDoc();
    expect(zConfigDispelDoc.safeParse({ ...doc, maxCountCap: HI }).success).toBe(true);
    expect(zConfigDispelDoc.safeParse({ ...doc, maxCountCap: HI + 1 }).success).toBe(false);
  });

  it("★ 出貨的 dispel.json 還在界內（抬上界⛔不可以順手改變任何一場比賽）", () => {
    const doc = shippedDoc();
    expect(doc.schema, "出貨文件靜靜退回了預設").toBe("config.dispel@1");
    // ⛔ 不斷言它等於 50 —— 那是 owner 每週在改的東西。驗的是「它沒有被靜默夾掉」。
    expect(dispelRulesFromDoc(doc).maxCountCap).toBe(doc.maxCountCap as number);
  });
});
