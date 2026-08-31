/**
 * ⭐⭐ GH#813 B —— **長效憑證⛔不落 localStorage**（client 那一半）。
 *
 * ⭐ admin 那一半 2026-08-30 就修好了（`apps/admin/src/session.test.ts:117` 逐字
 * 釘著「長效憑證⛔不可以落到 localStorage」），⛔ 而 client 還在存整對。
 *
 * ⚠️ ⭐ 為什麼只有 refresh 重要：`accessToken` 幾分鐘就過期，
 * ⭐ 而 `refreshToken` 是**整個帳號** —— 偷到它等於偷到帳號。
 *
 * ── ⭐ 降級要是「照舊」，⛔ 不是「當場壞掉」──────────────────────────────
 * 伺服器**沒說**它種了 cookie（舊版／cookie 種不起來）⇒ ⛔ 一個位元組都不改。
 * ⭐ 而記憶體裡那一份**永遠是完整的** —— cookie 沒種成功時這個分頁照舊能換發。
 *
 * MUTATION LOG：`setTokens` 的 cookie 分支拿掉 → ①紅。
 */
import { describe, it, expect } from "vitest";
import { ApiClient, type TokenPair, type TokenStorage } from "./session";

const PAIR: TokenPair = { accessToken: "acc-1", refreshToken: "ref-1" };

function memStorage(init: TokenPair | null): TokenStorage & { current: TokenPair | null } {
  let cur = init;
  return {
    get current() {
      return cur;
    },
    load: () => cur,
    save: (t) => {
      cur = t;
    },
  };
}

describe("GH#813 B refresh token 不落磁碟", () => {
  it("★ ⭐ 伺服器說它種了 cookie ⇒ **磁碟上的 refresh 是空的**", () => {
    const storage = memStorage(null);
    const api = new ApiClient({ fetchFn: (() => {}) as never, storage });
    api.setTokens(PAIR, true);
    expect(storage.current?.refreshToken, "⛔ 長效憑證還在磁碟上").toBe("");
    expect(storage.current?.accessToken, "⛔ 短效的不該被一起清掉").toBe("acc-1");
  });

  it("★ ⭐ **記憶體裡仍然完整** —— cookie 沒種成功時這個分頁照舊能換發", () => {
    const storage = memStorage(null);
    const api = new ApiClient({ fetchFn: (() => {}) as never, storage });
    api.setTokens(PAIR, true);
    expect(api.refreshToken, "⛔ 記憶體也被清了 ⇒ 這個分頁再也換發不了").toBe("ref-1");
  });

  it("★ ⭐ 伺服器**沒說** ⇒ ⛔ 一個位元組都不改（rollback 要還原得回舊形狀）", () => {
    const storage = memStorage(null);
    const api = new ApiClient({ fetchFn: (() => {}) as never, storage });
    api.setTokens(PAIR);
    expect(storage.current, "⛔ 非 cookie 模式被動了 ⇒ 還原不回 #724 之前").toEqual(PAIR);
  });

  it("⭐ 登出（null）兩邊都清乾淨", () => {
    const storage = memStorage(PAIR);
    const api = new ApiClient({ fetchFn: (() => {}) as never, storage });
    api.setTokens(null);
    expect(storage.current).toBeNull();
    expect(api.refreshToken).toBeNull();
  });
});
