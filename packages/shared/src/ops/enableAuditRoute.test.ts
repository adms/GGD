import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐⭐ GH#473 —— **後台叫得到那三支稽核的那道縫**。
 *
 * ── ⚠️ 為什麼需要一條 route（⛔ 不是「多一個端點比較好」）────────────────────
 * `auditPlan()` 讀的是 **repo 的檔案**（`content/` 與判準模組的原始碼），
 * ⛔ 而後台是**瀏覽器** —— 它碰不到檔案系統。
 * ⇒ ⭐ 沒有這一條，admin 算得出「這一次要驗誰」（`enableAudit.ts`）卻**驗不了**
 *   —— ⚠️ 那正是失敗形態⑧的形狀：兩端各自都對，⛔ 而接縫不存在。
 *
 * ⛔ 這條閘**不驗 HTTP 真的跑起來**（那要起一台 server）。
 * ⭐ 它驗的是**接線存在且語意對**：route 在、吃 `ids`、⭐ 而空清單**不掃全部**。
 */
const REPO = resolve(__dirname, "../../../..");
const mw = readFileSync(resolve(REPO, "tools/review/middleware.mjs"), "utf8");

describe("GH#473 /__review/enable-audit", () => {
  it("量尺先自證：讀得到 middleware（⛔ 空字串會讓下面全部空過）", () => {
    expect(mw.length).toBeGreaterThan(1000);
    expect(mw, "⭐ 對照組：既有的 queue route 應該在").toContain('"/__review/queue"');
  });

  it("★ ⭐ route 在，而且**真的呼叫 `auditPlan`**（⛔ 不是一個回空物件的殼）", () => {
    expect(mw).toContain('"/__review/enable-audit"');
    expect(mw).toContain('import { auditPlan } from "./enable-audit.mjs"');
    expect(mw, "⛔ 有 route 而沒呼叫 = 一個永遠回同一個答案的端點").toMatch(
      /auditPlan\(repoRoot,\s*list\)/,
    );
  });

  it("★ ⭐ **空清單不掃全部** —— 那是票文逐字的成本斷言「不啟用就不花錢」", () => {
    // ⚠️ ⭐ 切窗要**從 route 往後**取固定長度 —— 第一版拿 `verdict` 當右界,
    //   ⛔ 而它在 enable-audit **後面** ⇒ slice 回空字串 ⇒ 斷言對空字串跑（量尺自己瞎了）。
    const i = mw.indexOf('"/__review/enable-audit"');
    const seg = mw.slice(i, i + 900);
    expect(
      seg,
      "⛔ 空 ids 走到 auditPlan ⇒ 每一次存檔都掃全部 ⇒ 那條成本斷言就死了",
    ).toMatch(/list\.length === 0/);
  });
});
