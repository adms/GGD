/**
 * ⭐ 出貨的 `baseStats.healthRegen` 要**引用得回原始地圖的那一格**（GH#766）。
 *
 * WHY THIS EXISTS —— #766 開票時的前提是「兩隻英雄的回血是全體中位數的 7–10 倍
 * ⇒ 可能是匯入時單位錯／小數點」。逐筆對帳之後那個前提**不成立**：
 * `godie-huth`（魔人普烏）12 與 `godie-u00k`（死之王）8 與 `war3map` 物件表的
 * `Huth.hp_regen = 12.0` / `U00K.hp_regen = 8.0` **逐位元組相同** ——
 * 匯入器 `tools/w3x-import/apply_attributes_to_content.py:145` 逐字是
 * `"healthRegen": r(res["hp_regen"])`，⛔ 沒有換算也沒有縮放。
 * ⇒ 那是第〇·六守則第 5 層的**事實**，改不改是 owner 的旋鈕（第一守則）。
 *
 * ⛔ 而那個結論在此之前只活在一份報告的散文裡（第三守則：註解會說謊）。
 * 這條守衛把它變成一個**會紅的關係**：出貨值 ↔ 地圖值。任何一次「順手把外圍抹平」
 * 都會在這裡被指名，並被要求補上 owner 的原話 —— ⛔ 這條守衛**不禁止**改動，
 * 它只是不讓改動**無聲**發生（＝ `owner-knobs.json` 的同一個形狀）。
 *
 * ⚠️ 驗的是**關係**，⛔ 不是任何一個數字（第二守則：驗機制不驗數字）——
 * owner 明天把 12 改成 0.25 並留下一句原話，這條守衛照樣綠。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { balancePopulationIds } from "../../testkit/balancePopulation";

const REPO = join(__dirname, "../../../..");
const MAP_OBJECTS = "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json";

/**
 * ⭐ 刻意偏離地圖的那幾格 —— 鍵是英雄 id，值是 **owner 的一句原話 ＋ 日期**。
 * ⛔ 「還沒查」「先這樣」不是理由（第一守則：引用不到原話就不該動那一格）。
 */
const DIVERGENCE_REASONS: Readonly<Record<string, string>> = Object.freeze({});

type Regens = Readonly<Record<string, number>>;

/** 純函式那一半 —— ⛔ 沒有 I/O，所以 sentinel 驗得動它。 */
export function regenMismatches(
  shipped: Regens,
  mapped: Regens,
  exempt: Readonly<Record<string, string>>,
): string[] {
  const out: string[] = [];
  for (const [id, want] of Object.entries(mapped)) {
    const have = shipped[id];
    if (have === undefined || Math.abs(have - want) < 1e-6 || exempt[id] !== undefined) continue;
    out.push(`${id}: 出貨 ${have} ≠ 原始地圖 ${want}`);
  }
  return out;
}

function load(): { shipped: Regens; mapped: Regens } {
  const heroes = (JSON.parse(readFileSync(join(REPO, MAP_OBJECTS), "utf-8") as string) as {
    heroes: Record<string, { hp_regen?: number | null }>;
  }).heroes;
  const byRaw = new Map(Object.entries(heroes).map(([k, v]) => [k.toLowerCase(), v]));
  const shipped: Record<string, number> = {};
  const mapped: Record<string, number> = {};
  for (const id of balancePopulationIds(REPO)) {
    const doc = JSON.parse(
      readFileSync(join(REPO, "content/champions", `${id}.json`), "utf-8"),
    ) as { baseStats?: { healthRegen?: number } };
    const raw = byRaw.get(id.replace(/^godie-/, ""))?.hp_regen;
    // ⚠️ `null` = 地圖沒有覆寫這一格（走 base 鏈進暴雪內建表）⇒ ⛔ 對不起來，跳過。
    if (typeof raw !== "number" || doc.baseStats?.healthRegen === undefined) continue;
    shipped[id] = doc.baseStats.healthRegen;
    mapped[id] = raw;
  }
  return { shipped, mapped };
}

describe("出貨的 healthRegen 引用得回原始地圖（GH#766）", () => {
  const { shipped, mapped } = load();

  it("母體裡每一位對得起地圖的那一格", () => {
    // ⚠️ 空掃描 = 讀壞了，⛔ 不是「大家都對」——⑫「只驗名詞不驗關係」的反方向。
    //    ⭐ 兩隻外圍必須在掃描範圍內，否則這條守衛正好漏掉它存在的理由。
    expect(Object.keys(mapped).length).toBeGreaterThan(20);
    expect(Object.keys(mapped)).toEqual(expect.arrayContaining(["godie-huth", "godie-u00k"]));
    expect(regenMismatches(shipped, mapped, DIVERGENCE_REASONS)).toEqual([]);
  });

  it("⭐ 量尺自證：餵一筆已知的不合進去，檢查器抓得到", () => {
    // ⛔ 「真資料是綠的」證明不了檢查器會說話（一把單邊校準的尺在最需要說話時沉默）。
    expect(regenMismatches({ "godie-huth": 0.25 }, { "godie-huth": 12 }, {})).toEqual([
      "godie-huth: 出貨 0.25 ≠ 原始地圖 12",
    ]);
    // 而豁免表真的擋得住它 —— 否則豁免只是一段沒有人執行的散文。
    expect(regenMismatches({ "godie-huth": 0.25 }, { "godie-huth": 12 }, { "godie-huth": "x" })).toEqual([]);
  });

  it("豁免表沒有過期條目（反方向：列了名卻其實對得上）", () => {
    const stale = Object.keys(DIVERGENCE_REASONS).filter(
      (id) => mapped[id] === undefined || Math.abs((shipped[id] ?? NaN) - mapped[id]!) < 1e-6,
    );
    expect(stale, "這幾格已經與地圖一致了，⛔ 把豁免拿掉").toEqual([]);
  });
});
