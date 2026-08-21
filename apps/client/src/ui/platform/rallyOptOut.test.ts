/**
 * @vitest-environment jsdom
 *
 * ⭐ 「**預設是加入**」的守衛（GH#492，owner 2026-08-21 反轉語意）。
 *
 * > 「你說的是對的，**預設是加入，五秒是讓人按否定的**」
 *
 * ---- 為什麼這一條非做行為測試不可 -------------------------------------------
 * 這整張票的行為是「**沒有人按任何東西**，然後那台瀏覽器自己送出加入請求」。
 * 一條只驗 `rallyAutoJoin()` 回 "join" 的測試，對一個**根本沒把它接到 acceptRally**
 * 的版本是全綠的（CLAUDE.md 失敗形態③：可以從渲染樹刪掉但測試還是全綠）——
 * 而那個版本在畫面上和正確的版本一模一樣：視窗跳出來、倒數走完、視窗消失。
 * ⇒ 這裡掛的是**出貨的元件**，換掉的只有最後一段 `fetch`，斷言讀的是
 *   **真的離開這個行程的那個 request**。
 *
 * ⛔ 不驗秒數（5 / 1.5 / 120 住在三個住處 + laneConfigDocs 的 drift 守衛上）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { cover } from "@ggd/shared/testkit/cover";

const { RallyConfirmDialog } = await import("./RallyConfirmDialog");
const { appStore } = await import("./store");
const { api } = await import("./api");
const { __setLastUserInputAtForTest } = await import("./userIdle");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAG = "lobby-rally";

let container: HTMLDivElement;
let root: Root;
let sent: { url: string; body: unknown }[];
let realFetch: typeof globalThis.fetch;

/** 一則集合令推播（`internal/room/rally.go` 送出的那個形狀）。 */
function rallyPush(expiresAt: number): unknown {
  return {
    type: "invite",
    roomId: "r1",
    roomName: "Rally Room",
    from: "acc_host",
    fromName: "host",
    fromMmr: 1200,
    token: "tok-1",
    broadcast: true,
    expiresAt,
    waitSec: 5,
  };
}

async function mountWith(expiresAt: number): Promise<void> {
  appStore.setState({
    room: null,
    ws: { presence: {}, invites: [rallyPush(expiresAt)], chat: [], matchReady: null, wsError: null },
  } as never);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(RallyConfirmDialog));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function button(label: string): HTMLButtonElement {
  const hit = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
  expect(hit, `找不到「${label}」按鈕`).toBeTruthy();
  return hit as HTMLButtonElement;
}

beforeEach(() => {
  sent = [];
  __setLastUserInputAtForTest(Date.now()); // 人就在螢幕前
  api.setTokens({ accessToken: "a", refreshToken: "r", expiresIn: 900 });
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    sent.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify({ room: { id: "r1" }, members: [] }), { status: 200 });
  }) as typeof globalThis.fetch;
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  globalThis.fetch = realFetch;
  api.setTokens(null);
});

describe("集合令 opt-out：沒按「不要」就進房 (GH#492)", () => {
  it("★ 沒有人按任何東西，倒數走完，加入請求真的離開這個行程", async () => {
    cover(TAG);
    // 提前量之後、期限之前 —— 這是「自動加入」該發生的那一段。
    await mountWith(Date.now() + 500);
    const joins = sent.filter((s) => s.url.includes("/rooms/join-by-code"));
    expect(joins, "⛔ 沒有請求 = 預設加入根本沒接上去").toHaveLength(1);
    expect((joins[0]!.body as { token: string }).token).toBe("tok-1");
    expect((joins[0]!.body as { ready?: boolean }).ready, "readyOnJoin：一趟就準備好").toBe(true);
  });

  it("★ 按下「不要」就不會進房，而且視窗收掉", async () => {
    cover(TAG);
    await mountWith(Date.now() + 60_000); // 還在倒數
    await act(async () => button("不要").click());
    expect(sent.filter((s) => s.url.includes("/rooms/join-by-code"))).toHaveLength(0);
    expect(appStore.getState().ws.invites).toHaveLength(0);
  });

  it("★ 人不在螢幕前就⛔不自動加入 —— 視窗留著，要他自己按", async () => {
    cover(TAG);
    __setLastUserInputAtForTest(Date.now() - 60 * 60 * 1000);
    await mountWith(Date.now() + 500);
    expect(sent.filter((s) => s.url.includes("/rooms/join-by-code")), "掛機的人不被拉走").toHaveLength(0);
    expect(container.textContent ?? "").toContain("需要自己按");
    button("加入"); // 而且他還是進得去
  });
});
