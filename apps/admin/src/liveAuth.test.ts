/**
 * 🔐 **後台頁面要自動帶上已登入的 token** —— GH#796 客戶端那一半的守衛。
 *
 * ## 為什麼這一條是承重的
 * #796 讓線上的 `/__review/**` 與 `/__live/**` 要 admin 身分。
 * ⇒ 如果這個攔截器沒裝上／裝錯，**owner 打開批核頁看到的是 401** ——
 *   也就是他上一輪抱怨的「⚠️ 讀不到批次」原封不動回來，只是換了個原因。
 * ⭐ 而伺服器那一側的守衛（`reviewAdminGate.test.ts`）**對這件事完全看不見**。
 *
 * ## 它問的是行為，⛔ 不是「有沒有那行字」
 * 換掉 `globalThis.fetch`、發**真的**請求形狀、讀**真的**送出去的 header。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · `liveAuth.ts` 的 `isGuarded()` 把 `/__live/` 拿掉 → 第 ① 條紅
 *    （13 頁在線上會拿到 401，而後台頁面看起來完全正常）。實測過。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetLiveAuthFetch, installLiveAuthFetch } from "./liveAuth";

const realFetch = globalThis.fetch;

function harness(token: string | null): { calls: { url: string; auth: string | null }[] } {
  const calls: { url: string; auth: string | null }[] = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const h = new Headers(init?.headers ?? undefined);
    calls.push({ url: String(input), auth: h.get("Authorization") });
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  _resetLiveAuthFetch();
  installLiveAuthFetch(() => token);
  return { calls };
}

afterEach(() => {
  globalThis.fetch = realFetch;
  _resetLiveAuthFetch();
});

describe("後台的 /__live 與 /__review 自動帶 token (live-auth-fetch)", () => {
  it("⭐ ① 兩族路徑都帶上 Bearer（⛔ 少一族 = 那 13 頁在線上是 401）", async () => {
    const { calls } = harness("tok123");
    await fetch("/__live/sfx-map");
    await fetch("/__review/features");
    expect(calls.map((c) => c.auth), "⛔ 有一族沒帶 token —— owner 會看到「讀不到批次」").toEqual([
      "Bearer tok123",
      "Bearer tok123",
    ]);
  });

  it("⭐ ② 其餘路徑**不帶**（⛔ 不要把 token 灑給每一個請求）", async () => {
    const { calls } = harness("tok123");
    await fetch("/api/v1/curation/whitelist");
    await fetch("https://example.com/__live/x"); // 跨網域：⛔ 絕對不帶
    expect(calls.map((c) => c.auth)).toEqual([null, null]);
  });

  it("⭐ ③ 拿不到 token 也**照樣送出去** —— 由伺服器裁決，⛔ 不在前端自己判斷權限", async () => {
    const { calls } = harness(null);
    await fetch("/__review/features");
    expect(calls.length, "⛔ 前端把請求擋掉了 —— 那是第二份權限真相，而它必然先過期").toBe(1);
    expect(calls[0]!.auth).toBeNull();
  });

  it("④ 呼叫端已經給了 Authorization 就不覆蓋（⛔ 不搶別人的決定）", async () => {
    const { calls } = harness("tok123");
    await fetch("/__review/features", { headers: { Authorization: "Bearer mine" } });
    expect(calls[0]!.auth).toBe("Bearer mine");
  });
});
