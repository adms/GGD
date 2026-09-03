/**
 * ⭐⭐ **資產驗收漏斗的可調參數**（GH#664 Phase 2）。
 *
 * ⭐ 前提回驗（2026-09-03）：票文說「Tier0/1/1.5 **已建**，⛔ 剩 Tier2（你按的那一頁）
 * **從來沒被用過**」——⭐ 而 `docs/_review/approvals.json` 的 `entries` **是 0 筆**
 * ⇒ ⭐⭐ **那句話今天逐字成立**。
 *
 * ⇒ ⭐ 而 Phase 2 的感知基準線（pHash）**需要有人先核准過**才有東西可比對
 * ⇒ ⛔ 它做不完，⭐ 而**做得完的那一半是「不要寫死那幾個數字」**
 * （票文逐字：「pHash 閾值做成一格可調（⛔ 寫死 —— 它就是 owner 之後會調的東西）」）。
 *
 * ⚠️⚠️ ⭐ **這一支最重要的是那兩個「預設關」** ——
 * 一個「有欄位、有預設值、而參考影格還沒建」的漂移偵測如果**開著**出貨，
 * ⭐ 它會讓**每一份資產在第一次比對時全部回 pending**
 * （＝票文 Known risks 的第一條逐字：「人審變成每版的事 —— ⛔ 正好違反本票目的」）。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `perceptualBaselineEnabled` 改成 true → 🔴 ②「參考影格那一半還沒建」
 * M2 `blockShipOnPending` 改成 true → 🔴 ③「部署會被『人不在』卡死」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHIPPED_REVIEW_TUNING,
  zConfigReviewTuningDoc,
} from "./schema/config/reviewTuning";

const ROOT = join(__dirname, "../../../..");
const DOC = JSON.parse(
  readFileSync(join(ROOT, "content/config/review-tuning.json"), "utf8"),
) as Record<string, unknown>;

describe("資產驗收漏斗的可調參數（GH#664）", () => {
  it("★★ ⭐ 出貨值與 JSON **逐格相同**，而且過得了出貨的 Zod", () => {
    expect(() => zConfigReviewTuningDoc.parse(DOC)).not.toThrow();
    const { note: _n, ...doc } = DOC;
    const { ...shipped } = SHIPPED_REVIEW_TUNING;
    expect(doc, "⛔ 兩個住處漂了（第一守則的三個住處）").toEqual(shipped);
  });

  it("★★ ⭐⭐ **感知基準線出貨是關的**（⛔ 參考影格那一半還沒建）", () => {
    expect(
      SHIPPED_REVIEW_TUNING.perceptualBaselineEnabled,
      "⛔⛔ 漂移偵測開著出貨，而參考影格還沒建 ⇒\n" +
        "  ⭐ 每一份資產在第一次比對時**全部回 pending**\n" +
        "  ＝ 票文 Known risks 逐字：「人審變成每版的事 —— ⛔ 正好違反本票目的」",
    ).toBe(false);
  });

  it("★★ ⭐⭐ **硬擋出貨是關的 —— 那是硬規定**", () => {
    expect(
      SHIPPED_REVIEW_TUNING.blockShipOnPending,
      "⛔⛔ 票文 Non-goals 逐字：「把 HITL 變成事前審批門\n" +
        "  （部署 ⛔ 被『人不在』卡死 —— **預設不擋是硬規定**）」",
    ).toBe(false);
  });

  it("⭐ 閾值落在**兩個代價之間**（⛔ 0 與 1 都是壞的）", () => {
    const t = SHIPPED_REVIEW_TUNING.perceptualDriftThreshold;
    expect(t, "⛔ 閾值 0 ＝ 任何一點差異都回 pending（太緊那一邊）").toBeGreaterThan(0);
    expect(t, "⛔ 閾值 1 ＝ 什麼都放行（太鬆那一邊，真漂移漏放）").toBeLessThan(1);
  });

  it("★★ ⭐ 前提仍成立：Tier2 那一頁**還沒有人按過**（⛔ 有人按了就要回來改這張票）", () => {
    const ledger = JSON.parse(
      readFileSync(join(ROOT, "docs/_review/approvals.json"), "utf8"),
    ) as { entries?: unknown };
    const n = Array.isArray(ledger.entries)
      ? ledger.entries.length
      : Object.keys((ledger.entries ?? {}) as object).length;
    expect(
      n,
      `⭐ 核准帳本現在有 ${n} 筆 —— ⭐ **這是好消息**：\n` +
        "  Tier2 開始被用了 ⇒ 感知基準線終於有東西可比對\n" +
        "  ⇒ ⭐ 回去把 `perceptualBaselineEnabled` 打開（GH#664 Phase 2 的下一步）。",
    ).toBe(0);
  });
});
