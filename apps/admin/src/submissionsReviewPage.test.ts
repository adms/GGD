/**
 * ⭐⭐ 投稿批核頁的守衛 —— **承重的只有一條**：
 * `editor-capability-fixture` 的「套用」按鈕**永遠是灰的**，⛔ 即使人工通過。
 *
 * ⚠️ ⭐ 這一條的來源是 owner 2026-09-01 的逐字裁決，⛔ 不是我的設計：
 * > 「八個驗收技能特效是用來**驗收編輯器是否能做出對應技能**，
 * >  **不是直接套用回去遊戲主程式中**」
 *
 * ── ⛔ 為什麼要在**前端**也驗（伺服器已經擋了）────────────────────────────
 * 伺服器擋的是**做不到**，這一頁擋的是**看起來做得到**。
 * ⚠️ 一個亮著的「套用」按鈕會讓審核的人以為八招可以出貨 —— ⭐ 而他按下去拿到
 * 一個 409 之後，下一步多半是去問「為什麼壞了」，⛔ 而不是「喔原來不該按」。
 * ⇒ ⭐ 灰掉**而且印出原因**才是完整的答案（⛔ 一個沒有解釋的灰按鈕會被當成壞掉）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `disabled={... || !canPromote}` 的 `!canPromote` 拿掉 → 🔴
 *   · `notPromotableWhy` 那一段刪掉 → 🔴
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "ui/SubmissionsReviewPage.tsx"), "utf8");
const NAV = readFileSync(join(__dirname, "ui/App.tsx"), "utf8");
const TAGS = readFileSync(join(__dirname, "navTags.ts"), "utf8");

describe("投稿批核頁", () => {
  /**
   * ⚠️ ⭐ **這是一支原始碼掃描**（admin 沒有 DOM 測試環境）——
   * ⛔ 而「掃字串」是失敗形態⑥。⇒ 所以它**先把那顆按鈕的 JSX 區塊切出來**，
   * 再只在那個區塊裡問問題：⛔ 不是問「這個檔案有沒有提到 canPromote」。
   * （第一版就是那樣寫的，而突變證明了它**留綠** —— `!canPromote` 在別處也出現。）
   */
  it("★★ ⭐ 「套用」按鈕**自己**綁在 `promotable` 上（⛔ 不是檔案裡有這個字）", () => {
    const i = SRC.indexOf("🚀");
    expect(i, "儀器：找不到套用按鈕").toBeGreaterThan(0);
    // ⭐ 往回切到這顆 <Btn 的開頭 —— 那一段就是它自己的 props。
    const btn = SRC.slice(SRC.lastIndexOf("<Btn", i), i);
    expect(
      btn,
      "⛔⛔ 套用按鈕的 disabled 沒有看 `canPromote` ⇒\n" +
        "⭐ 八招夾具會亮著一個按下去必然 409 的按鈕，而審核的人會以為它壞了。",
    ).toContain("!canPromote");
    expect(SRC).toMatch(/const canPromote = v\.promotable && !v\.promoted/);
    // ⛔ 不可以拿 status 當成可套用的判準 —— 那正好漏掉 fixture 那一族。
    expect(btn.includes('v.status === "approved"')).toBe(false);
  });

  it("★★ ⭐ 灰掉的時候**印出原因** —— ⛔ 一個沒有解釋的灰按鈕會被當成壞掉", () => {
    expect(SRC).toContain("notPromotableWhy");
    expect(SRC).toContain("⛔ 不可套用：");
  });

  it("★★ ⭐ 否決**必填原因**（owner 2026-08-24「追加原因的 HITL」）", () => {
    expect(SRC).toMatch(/disabled=\{[^}]*\(reason\[v\.id\] \?\? ""\) === ""[^}]*\}/);
  });

  it("★ ⭐ 套用送出**當下看到的那一份 digest**（⛔ 不是讓伺服器自己去查）", () => {
    // ⚠️ 少了它，「我審的」與「我按的」之間就沒有任何東西在比對。
    // ⚠️ 用正則吃掉換行 —— ⛔ 一條會因為格式化而紅的守衛，紅的時候說的是錯的事。
    expect(
      /promoteSubmission\(\s*v\.id,\s*v\.digest/.test(SRC),
      "⛔ 套用沒有把**當下看到的** digest 送出去 ⇒ 「我審的」與「我按的」之間沒有東西在比對",
    ).toBe(true);
  });

  it("★★ Editor／AI 裁決與 Promote 同時送出 candidateHash 和 reviewHash", () => {
    expect(SRC).toContain("candidateHash: item.candidateHash");
    expect(SRC.match(/reviewHash: item\.reviewHash/g)?.length).toBeGreaterThanOrEqual(3);
    expect(SRC).toContain("GPU 完整時間軸稽核");
    expect(SRC).toContain("舊候選缺少 GPU 完整時間軸稽核收據");
  });

  it("★ ⭐ 這一頁真的掛在導覽上，而且**不是** dev 限定", () => {
    expect(NAV, "⛔ 導覽列沒有它 —— 點不進去").toContain('page: "submissionsReview"');
    expect(NAV).toContain("<SubmissionsReviewPage />");
    expect(
      /submissionsReview: \[[^\]]*dev限定/.test(TAGS),
      "⛔⛔ 標成 dev 限定 ⇒ ⭐ 它是**出貨環境**的硬閘（owner 2026-09-01「通過才能套用」）",
    ).toBe(false);
  });
});
