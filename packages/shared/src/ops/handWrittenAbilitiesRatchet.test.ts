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

/**
 * ⭐ 量到的真值。⛔ 只准往下改，⭐ 而且要在同一個 commit 裡改。
 * · 2026-09-05：263 → 2026-09-06 早：257
 * · 2026-09-06（GH#993 Scope 3）：**231** —— `tools/skill-remake/templatize.py` 把 26 支
 *   逐位元等價的手寫技能接上模板（buff-self 16 · single-strike 7 · blink-strike 1 ·
 *   instant-blast 1 · proxy-fanout 1），等價由 `content/templatizeEquivalence.test.ts` 逐支證明。
 * ⚠️ 這個數字住在 `bricks:build` 的產物裡 ⇒ 轉完模板之後**要先跑 `pnpm skills:sync`**，
 *   ⛔ 不然這裡會拿舊產物的 257 對 231 說「變多了」——那不是有人手刻，是產物過期。
 * · 2026-09-06 晚（收編第二波）：**243** —— 12 支因 `abilityCodeParity`（變身對子一邊轉一邊沒轉）退回。
 *   `templatize.py` 從此帶變身對子的守門（規矩④），一邊轉不了就兩邊都不轉。
 * · 2026-09-06 晚（#1066 族 B）：u010.w／uvng.w 接上 `tpl-proxy-cast`（它的下拉本來就有 slow40）
 *   ⇒ sync 之後產物會量到 **241**，這一格要跟著改成 241。
 * · ⭐ 2026-09-07 凌晨（#1066 #1068 #1069 #1071 #1072 #1073 ＋ #1065 的三個洞落地，`templatize.py --apply`）：
 *   收 **60 支**（single-strike＋status 17 · buff-self 10（#1065 放行的 PASSIVE＋innateKind:active）· projectile-strike 10 ·
 *   blink 7 · drain-leech 5 · apply-status 5 · heal 5 · instant-blast 1），帳本 16 → 76 筆，等價閘逐支綠。
 *   ⇒ 241 − 60 = **181**（本 lane 沒跑 `bricks:build`；主 session `pnpm skills:sync` 之後拿產物量到的數字改這一格，
 *   ⚠️ 別條 lane 同時在動 content/abilities，量到 182 也不奇怪 —— 以產物為準）。
 *   ⛔ 沒轉的：n01g.q（另一半 n003.q 早已是模板 ⇒ 轉了必然「單邊」，留給主 session 用 --allow-parity-fix）、
 *   u00o.passive／o030.ex（另一半是 #1067 變身家族）、u01u.e／udre.e（別條 lane 的檔）。
 */
const HAND_WRITTEN_BASELINE = 184;

/**
 * ⭐ 判定寫成**純函式**，這樣 sentinel 餵得進去 ——
 * ⛔ 不必為了自證去動出貨產物（那是隔離區，444）。
 */
function ratchetVerdict(count: number): string | null {
  if (count > HAND_WRITTEN_BASELINE) {
    return (
      `⛔ 手刻技能從 ${HAND_WRITTEN_BASELINE} 變成 ${count}（+${count - HAND_WRITTEN_BASELINE}）——\n` +
      `⭐ 第〇·五守則：技能＝模板組合，沒有例外。新的一支要嘛接既有模板，\n` +
      "   要嘛先做出那塊積木（pnpm bricks:build 的 demand 就是排序）。\n" +
      "⚠️ 先跑 `pnpm bricks:check`：產物過期時這一格讀到的是**舊的**數字（templatize 轉完還沒 sync 的樣子）。"
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
    expect(ratchetVerdict(HAND_WRITTEN_BASELINE + 1)).toContain(`變成 ${HAND_WRITTEN_BASELINE + 1}`);
    expect(ratchetVerdict(HAND_WRITTEN_BASELINE - 1)).toContain("基準線要跟著降");
    expect(ratchetVerdict(HAND_WRITTEN_BASELINE)).toBeNull();
  });
});
