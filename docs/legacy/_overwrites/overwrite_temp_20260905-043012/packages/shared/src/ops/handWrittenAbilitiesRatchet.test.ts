/**
 * ⭐⭐ **手刻技能的棘輪**（GH#993 Scope 6）—— 第〇·五守則的量尺：
 *
 * > owner 2026-08-05：「我**最推崇的方案[模板化/模組化]**　不是到處改改改」
 *
 * ⭐ 這一條釘的是**需求側**：「沒接模板而自己寫 `effects[]`」的技能數。
 * ⛔ 供給側（`usable` / `engineMissing` / `shells`）住在隔壁的
 * `brickCensusRatchet.test.ts` —— ⛔ 不要在這裡再釘一次（第〇·四：第二個住處）。
 *
 * ⭐ **雙向**，⛔ 不是單向天花板：
 * · 變**多** ⇒ 🔴 有人又手刻了一支（第〇·五守則說那是越線）
 * · 變**少** ⇒ 🔴 而訊息叫你**把基準線降下來** —— ⛔ 一個沒降的棘輪
 *   會靜靜地允許之後再爬回 263，⭐ 而那時候不會有任何東西紅。
 *
 * ⭐ 數字**從產物讀**（`ggd-brick-census.json` 的 `counts.handWritten`，
 * 由 `tools/brick-census/gen.ts` 逐檔量出來）—— ⛔ 這裡不抄一份技能清單，
 * 那會是第四個住處（第二守則：測試裡的出貨數字必過期）。
 *
 * ⚠️ 落地當天複量過：獨立重算 `handWritten` / `distinctShapes` /
 * `singletonShapes` / `top8Coverage` 四格，與產物**逐格相同**（263 / 99 / 58 / 118）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const CENSUS = JSON.parse(
  readFileSync(resolve(ROOT, "docs/editor-contract/ggd-brick-census.json"), "utf8"),
) as { counts: Record<string, number> };

/** ⭐ 2026-09-05 量到的真值。⛔ 只准往下改，⭐ 而且要在同一個 commit 裡改。 */
const HAND_WRITTEN_BASELINE = 263;

/**
 * ⭐ 判定寫成**純函式**，這樣 sentinel 餵得進去 ——
 * ⛔ 不必為了自證去動出貨產物（那是隔離區，444）。
 */
function ratchetVerdict(count: number): string | null {
  if (count > HAND_WRITTEN_BASELINE) {
    return (
      `⛔ 手刻技能從 ${HAND_WRITTEN_BASELINE} 變成 ${count}（+${count - HAND_WRITTEN_BASELINE}）——\n` +
      `⭐ 第〇·五守則：技能＝模板組合，沒有例外。新的一支要嘛接既有模板，\n` +
      `   要嘛先做出那塊積木（`pnpm bricks:build` 看 demand 排序）。`
    );
  }
  if (count < HAND_WRITTEN_BASELINE) {
    return (
      `⭐ 手刻技能降到 ${count}（−${HAND_WRITTEN_BASELINE - count}）—— 這是進步，\n` +
      `⛔ 但**基準線要跟著降**：把 HAND_WRITTEN_BASELINE 改成 ${count}。\n` +
      `⚠️ 不降的話，棘輪之後會靜靜地允許它爬回 ${HAND_WRITTEN_BASELINE}。`
    );
  }
  return null;
}

describe("⭐ 手刻技能棘輪（GH#993）", () => {
  it("⭐ 量尺自證：普查真的量到了東西（⛔ 不是在量空氣）", () => {
    expect(
      CENSUS.counts["distinctShapes"],
      "⛔⛔ 普查說手刻技能攤成 0 種形狀 —— ⭐ 那不是「全部模板化了」，\n" +
        "   是這支普查沒讀到 `content/abilities`（跑 `pnpm bricks:build`）。",
    ).toBeGreaterThan(0);
  });

  it("★ ⭐ **手刻技能數只准變少**（⛔ 而變少了要把基準線降下來）", () => {
    expect(ratchetVerdict(CENSUS.counts["handWritten"] ?? -1) ?? "OK").toBe("OK");
  });

  it("⭐ sentinel：造一個必然違規的輸入，斷言檢查器抓得到（⛔ 兩個方向）", () => {
    expect(ratchetVerdict(HAND_WRITTEN_BASELINE + 1)).toContain("變成 264");
    expect(ratchetVerdict(HAND_WRITTEN_BASELINE - 1)).toContain("基準線要跟著降");
    expect(ratchetVerdict(HAND_WRITTEN_BASELINE)).toBeNull();
  });
});
