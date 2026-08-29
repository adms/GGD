/**
 * 🚪 NAV 覆蓋率閘 ＋ 每級加成頁的行為守衛（GH#790）。
 *
 * 閘擋的失敗形態：NAV 有列、右欄沒有東西畫 —— 點下去是**一頁空白**，而元件/路由/
 * session-gate/測試全綠（perLevelBonus 是第 4 個實例，⛔ 不再靠人踩）。
 * ⚠️ render case 是 App.tsx 裡的 JSX 條件行，不是可 import 的表 ⇒ 這一條**例外**允許
 * 把 App.tsx 當文字掃：它抓的是**接線存在性**（`{page === "x" &&` 這一行在不在），
 * ⛔ 不是行為（失敗形態⑥管的是後者）。NAV 與 CONFIG_DOC_SPECS 仍讀出貨常數本身。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { perLevelBonusFromDoc } from "@ggd/shared/sim/baseBonus";
import { NAV } from "./ui/App";
import { CONFIG_DOC_SPECS } from "./configForms";
import { validateOverlayDoc } from "./contentOverlay";
import { PLB_DOC_ID, plbDocFor, plbDraftFor, plbRowIssue } from "./ui/PerLevelBonusPage";

const TAG = "adminui-nav-pages-render";
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_SRC = readFileSync(join(HERE, "ui", "App.tsx"), "utf8");

/** 豁免表 —— 每列一個能被反駁的理由。⭐ 下面第二條測試反向驗它：接上線那天這一列必刪。 */
const RENDER_EXEMPT: Record<string, string> = {
  // GH#790：專頁元件已落地（ui/PerLevelBonusPage.tsx），render case 由主 session 接
  //（併行柵欄：App.tsx 是共用檔）。接上的那一刻「豁免會過期」那條會紅，逼著刪這一列。
  // perLevelBonus: "GH#790 主 session 接線中",
};

/** 只認 JSX 渲染守門的形狀，⛔ 不認 `r.page === "approvals"` 那種導覽列徽章比對。 */
const renderCases = (src: string): Set<string> =>
  new Set([...src.matchAll(/\{page === "(\w+)" &&/g)].map((m) => m[1]!));
const specPages = new Set(CONFIG_DOC_SPECS.map((s) => s.page));
const uncovered = (cases: Set<string>): string[] =>
  NAV.map((n) => n.page as string).filter(
    (p) => !cases.has(p) && !specPages.has(p) && !(p in RENDER_EXEMPT),
  );

describe("NAV 覆蓋率：每一頁要嘛有 render case、要嘛有 spec", () => {
  it("沒有任何一頁點下去是空白", () => {
    cover(TAG);
    const blank = uncovered(renderCases(APP_SRC));
    expect(
      blank,
      `這些頁在左欄點得到、右欄什麼都不畫：${blank.join(", ")} ⇒ 在 App.tsx 加 render case、` +
        `或在 configForms.ts 加 spec；暫時接不上才進 RENDER_EXEMPT（帶票號）。`,
    ).toEqual([]);
  });

  it("豁免會過期：已接上線的頁不准留在豁免表上", () => {
    cover(TAG);
    const cases = renderCases(APP_SRC);
    const stale = Object.keys(RENDER_EXEMPT).filter((p) => cases.has(p) || specPages.has(p));
    expect(
      stale,
      `這些頁已經有 render case / spec，豁免列過期了：${stale.join(", ")} —— 刪掉那一列。`,
    ).toEqual([]);
  });

  it("sentinel（常駐突變）：拿掉任一頁的 case，閘要紅並指名那一頁", () => {
    cover(TAG);
    const doctored = APP_SRC.replaceAll('page === "statCaps"', 'page === "statCapsGone"');
    const cases = renderCases(doctored);
    expect(cases.has("statCaps")).toBe(false); // 量尺先自證：真的拿掉了
    expect(uncovered(cases)).toContain("statCaps");
  });
});

describe("每級加成頁（GH#790 AC①②）", () => {
  it("出貨文件畫得出 ap 那列；改值＋新增一列後，整份文件過得了 putOverlayDoc 的同一道 Zod 閘", () => {
    cover(TAG);
    const shippedPath = join(HERE, "..", "..", "..", "content", "config", "per-level-bonus.json");
    const shipped = JSON.parse(readFileSync(shippedPath, "utf8")) as Record<string, unknown>;
    // 走 sim 在用的同一支萃取器（⛔ 不自造夾具 —— 失敗形態⑤）
    const draft = plbDraftFor(perLevelBonusFromDoc(shipped));
    expect(draft["ap"]).toEqual({ amount: "1", appliesTo: "all" });
    expect(plbRowIssue("ap", draft["ap"]!)).toBeNull();
    draft["ap"] = { amount: "2", appliesTo: "all" }; // AC① 可調
    draft["armor"] = { amount: "1", appliesTo: "primary" }; // AC② 新增一列
    // putOverlayDoc 送出前跑的就是 validateOverlayDoc —— 它拒絕＝那份文件根本進不了 overlay
    expect(validateOverlayDoc("config", PLB_DOC_ID, plbDocFor(draft, "n"))).toEqual({
      ok: true,
      validated: true,
    });
    // 界外、以及「永遠不會生效」的組合（ms 不由三圍推導）要被列警擋下（第一·五守則）
    expect(plbRowIssue("ap", { amount: "101", appliesTo: "all" })).not.toBeNull();
    expect(plbRowIssue("ms", { amount: "1", appliesTo: "primary" })).not.toBeNull();
  });
});
