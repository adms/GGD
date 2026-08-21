/**
 * GH#535 — 手機註冊 QR：`/link?code=…` 的**未登入**分支必須是一條路，不是一面牆。
 *
 * 這條線承重的地方只有一個：掌機的 QR **只指得到 `/link`**。在此之前那一頁對
 * 「還沒有帳號的人」只給了一顆 `去登入`，而它 `closeLink()` 會把 `?code=` 一起丟掉
 * —— 全新玩家從掌機出發，最後停在一個把他自己的憑證清掉的按鈕上。
 *
 * ⛔ 不是 grep「register」：`Btn` / `TextInput` 都是**明列 props**，一個沒被接住的
 * 屬性會被靜默丟掉而 grep 照樣綠（purchaseDialogPadBack.test.ts 檔頭記過這個形狀）。
 * 這裡把出貨的 `LinkRoute` 真的渲染出來，讀**最終 markup**。
 *
 * ⭐ 兩個方向一起關，因為缺陷正是「某一個相位上多了／少了」：
 *   ① 未登入 ⇒ 有註冊欄位、⛔ 沒有「核准」（沒有 session 可以核准，那顆會 401）
 *   ② 已登入 ⇒ 有「核准」、⛔ 沒有密碼欄（註冊表單不可以漏進核准卡）
 * 兩相位都必須印出代碼 —— 「兩邊比對同一組碼」是註冊路徑唯一的信任錨（device.go）。
 *
 * 突變（2026-08-22，M1）：把未登入分支換回原本那顆 `去登入 Sign in first`
 * （移除註冊表單）→ 本檔紅並指名「未登入分支要能建立帳號」。
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkRoute, LINK_PATH } from "./LinkRoute";
import { appStore } from "./store";
import type { AccountPublic } from "./types";

const CODE = "WXYZ-2345";

const ACCOUNT: AccountPublic = {
  id: "a1",
  username: "returning_player",
  mmr: 0,
  games: 0,
  wins: 0,
  createdAt: "2026-08-22T00:00:00Z",
};

// vite.config `environment: "node"` — no DOM. `readCode()` reads window.location,
// so give it exactly the two fields it touches (effects never run under
// renderToStaticMarkup, but the listener pair keeps the stub honest).
(globalThis as { window?: unknown }).window = {
  location: { pathname: LINK_PATH, search: `?code=${CODE}` },
  addEventListener() {},
  removeEventListener() {},
};

afterEach(() => {
  appStore.setState({ account: null });
});

function markup(account: AccountPublic | null): string {
  appStore.setState({ account });
  return renderToStaticMarkup(createElement(LinkRoute));
}

describe("GH#535 手機註冊 QR — /link 的未登入分支", () => {
  it("未登入時給的是**建立帳號**的表單，⛔ 而且沒有一顆會 401 的「核准」", () => {
    const html = markup(null);
    expect(html).toContain(CODE); // 信任錨：兩邊比對同一組碼
    expect(html).toContain('type="password"'); // 真的有密碼欄，⛔ 不是文案
    expect(html).toContain('autoComplete="new-password"'); // 密碼管理員認得的身分(#185)
    expect(html).toContain('type="email"');
    expect(html).toContain("建立帳號");
    expect(html).not.toContain("核准 Approve");
  });

  it("已登入時仍然是原本的核准卡，⛔ 註冊表單一格都沒有漏進來", () => {
    const html = markup(ACCOUNT);
    expect(html).toContain(CODE);
    expect(html).toContain("核准 Approve");
    expect(html).toContain(ACCOUNT.username);
    expect(html).not.toContain('type="password"');
  });
});
