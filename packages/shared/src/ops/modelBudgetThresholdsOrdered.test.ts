/**
 * ⭐⭐ GH#1164 —— 模型預算的**警戒線與上限**要順序正確、⭐ 而且三個住處同一個數字。
 *
 * > owner 2026-09-10（逐字）：
 * >   「（每幀動畫通道上限 160）**太低了 至少要有 300以上每個**」
 * >   「⭐ 你改成 **300 warning, 500 limit**」
 *
 * ── ⛔ 為什麼這一條非有不可 ────────────────────────────────────────
 * ① ⭐ **兩條線倒過來就等於沒有警戒線**（warn > limit ⇒ 還沒警告就已經擋下了）——
 *    ⛔ 而那**不會有任何東西紅**：guard 照樣運作，只是那一格永遠不響。
 * ② ⭐ 在此之前警戒是 `limit × 0.75` **推**出來的 ⇒ ⛔ 照那個公式，
 *    owner 的 500 會推出 **375**，而他說的是 **300**。
 *    ⇒ 兩條線現在都是**字面值**，⛔ 而字面值會漂。
 *
 * ⚠️ ⭐ 這一條**不驗那兩個數字是多少**（第二守則：驗機制不驗數字 ——
 * owner 每週都可能再調）。⭐ 它驗的是**關係**：順序、以及三個住處是否一致。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_LOD } from "../content/schema/config/modelLod";
import { CHAMPION_CHANNEL_WARN, CHAMPION_CHANNEL_LIMIT, HERO_MODEL_BUDGET, derateFor } from "../content/modelUpload/budget";

const SHIPPED = JSON.parse(
  readFileSync(join(__dirname, "../../../../content/config/model-lod.json"), "utf8"),
) as { championChannelWarn?: number; championChannelLimit?: number };

describe("每幀動畫通道的兩條線", () => {
  it("⛔ 警戒線必須嚴格小於上限（⭐ 倒過來 ＝ 那一格永遠不會響，而沒有東西會紅）", () => {
    expect(
      CHAMPION_CHANNEL_WARN,
      "⛔ 警戒 ≥ 上限 ⇒ 還沒警告就已經被擋下 ⇒ ⭐ 警戒那一格是裝飾",
    ).toBeLessThan(CHAMPION_CHANNEL_LIMIT);
    expect(HERO_MODEL_BUDGET.channels.warn).toBeLessThan(HERO_MODEL_BUDGET.channels.limit);
  });

  it("⭐ 三個住處同一個數字（config · Zod DEFAULT · 常數）", () => {
    for (const [name, warn, limit] of [
      ["content/config/model-lod.json", SHIPPED.championChannelWarn, SHIPPED.championChannelLimit],
      ["DEFAULT_MODEL_LOD", DEFAULT_MODEL_LOD.championChannelWarn, DEFAULT_MODEL_LOD.championChannelLimit],
      ["HERO_MODEL_BUDGET.channels", HERO_MODEL_BUDGET.channels.warn, HERO_MODEL_BUDGET.channels.limit],
    ] as const) {
      expect(warn, `${name} 的警戒線`).toBe(CHAMPION_CHANNEL_WARN);
      expect(limit, `${name} 的上限`).toBe(CHAMPION_CHANNEL_LIMIT);
    }
  });

  it("⭐ 調高上限的代價說得出來（⛔ 不是一個沒有人知道成本的數字）", () => {
    // ⭐ `derateFor` 回答「這一格設成 N 等於多大的保守餘裕」。
    // ⚠️ 原本的 DERATE = 3 自稱是「conservative planning assumption」——⛔ 沒有人量過。
    const now = derateFor(CHAMPION_CHANNEL_LIMIT);
    const before = derateFor(160); // 2026-09-10 之前推導出來的那個上限
    expect(now, "⭐ 餘裕必須是正數（⛔ 否則公式接錯線了）").toBeGreaterThan(0);
    expect(
      now,
      `⛔ 上限調高 ⇒ 保守餘裕**變小**：160 時 ${before.toFixed(2)} 倍 → ${CHAMPION_CHANNEL_LIMIT} 時 ${now.toFixed(2)} 倍。\n` +
        "   ⭐ 這一條在這裡是為了讓那個代價**寫在測試裡**，⛔ 不是判斷它可不可接受（那是 owner 的裁決）。",
    ).toBeLessThan(before);
  });

  it("⭐ 量尺自證：三名被擋過的英雄，在新上限下確實過（⛔ 而在舊上限下確實不過）", () => {
    const measured = { yasuo: 170, warwick: 188, leesin: 196 }; // 2026-09-10 實測
    for (const [name, chan] of Object.entries(measured)) {
      expect(chan, `${name} 在新上限下應該過`).toBeLessThanOrEqual(CHAMPION_CHANNEL_LIMIT);
      expect(chan, `⭐ ${name} 在舊上限 160 下確實不過 —— ⛔ 否則這一票沒有解決任何事`).toBeGreaterThan(160);
    }
  });
});
