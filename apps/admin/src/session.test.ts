/**
 * adminui-session-guard: ApiClient 401 → refresh-once → retry-once (shared with
 * the game client), and the admin role guard (verifyAdmin: 200 → admin,
 * 403 → not-authorized, other → rethrow).
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ApiClient, ApiError, verifyAdmin, type StoredSession, type TokenStorage } from "./session";
import type { TokenPair } from "./types";

function memStorage(initial: StoredSession | null = null): TokenStorage & { current: StoredSession | null } {
  const box = {
    current: initial,
    load: () => box.current,
    save: (t: StoredSession | null) => {
      box.current = t;
    },
  };
  return box;
}

const TOKENS: TokenPair = { accessToken: "acc-1", refreshToken: "ref-1", expiresIn: 900 };
const NEW_TOKENS: TokenPair = { accessToken: "acc-2", refreshToken: "ref-2", expiresIn: 900 };

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("session refresh + role guard (adminui-session-guard)", () => {
  const actorTokens = (id: string): TokenPair => ({ ...TOKENS, accessToken: `header.${btoa(JSON.stringify({ sub: id }))}.signature` });
  it.each(["json", "binary"])("does not replay %s work under another app's cookie account", async (format) => {
    const storage = memStorage({ ...actorTokens("author"), refreshToken: "", rtCookie: true });
    const expired = vi.fn(); const urls: string[] = [];
    const api = new ApiClient({ storage, onSessionExpired: expired, fetchFn: vi.fn(async (url) => {
      urls.push(String(url));
      return String(url).endsWith("/auth/refresh") ? jsonRes(200, { tokens: actorTokens("reviewer"), refreshCookie: true }) : jsonRes(401, { error: { code: "expired" } });
    }) as typeof fetch });
    await expect(format === "json" ? api.request("/hero-works/draft", { body: { workId: "author-work" } }) : api.binaryResponse("/hero-submissions", new Blob(["frozen work"]))).rejects.toMatchObject({ status: 401 });
    expect(urls).toHaveLength(2);
    expect(urls.some((url) => url.endsWith("/auth/logout"))).toBe(false);
    expect(api.hasSession).toBe(false); expect(storage.current).toBeNull(); expect(expired).toHaveBeenCalledTimes(1);
  });

  it("ignores an old refresh completion after the user explicitly logs into another account", async () => {
    let finish!: (response: Response) => void;
    const storage = memStorage(actorTokens("author"));
    const fetchFn = vi.fn(async (url) => String(url).endsWith("/auth/refresh") ? new Promise<Response>((resolve) => { finish = resolve; }) : jsonRes(401, { error: { code: "expired" } }));
    const api = new ApiClient({ storage, fetchFn: fetchFn as typeof fetch });
    const pending = api.binaryResponse("/hero-submissions", new Blob(["author work"]));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    api.setTokens(actorTokens("reviewer")); finish(jsonRes(200, { tokens: actorTokens("author") }));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(storage.current).toEqual(actorTokens("reviewer")); expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries the identical binary submission once after refresh, preserving operation identity and bytes", async () => {
    const payload = new Blob([new Uint8Array([0, 255, 128, 10])], { type: "application/zip" });
    const sent: RequestInit[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/auth/refresh")) return jsonRes(200, { tokens: NEW_TOKENS });
      sent.push(init!);
      return sent.length === 1 ? jsonRes(401, { error: { code: "unauthorized", message: "expired" } }) : new Response(payload);
    });
    const client = new ApiClient({ fetchFn: fetchFn as typeof fetch, storage: memStorage(TOKENS) });
    const response = await client.binaryResponse("/hero-submissions", payload, { contentType: "application/zip", headers: { "x-ggd-operation-id": "same-operation" } });
    expect(sent).toHaveLength(2);
    expect(sent.map((request) => new Headers(request.headers).get("authorization"))).toEqual(["Bearer acc-1", "Bearer acc-2"]);
    for (const request of sent) {
      expect(request.body).toBe(payload);
      expect(new Headers(request.headers).get("x-ggd-operation-id")).toBe("same-operation");
    }
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255, 128, 10]);
  });
  it("401 → refresh once → retry original once with the rotated token", async () => {
    cover("adminui-session-guard");
    const storage = memStorage(TOKENS);
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"];
      calls.push(u);
      if (u.endsWith("/admin/accounts?page=1&pageSize=1") && auth === "Bearer acc-1")
        return jsonRes(401, { error: { code: "unauthorized", message: "expired" } });
      if (u.endsWith("/auth/refresh")) return jsonRes(200, { tokens: NEW_TOKENS });
      if (auth === "Bearer acc-2") return jsonRes(200, { accounts: [] });
      return jsonRes(500, { error: { code: "internal", message: "boom" } });
    });
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage });

    const ok = await verifyAdmin(api);
    expect(ok).toBe(true);
    expect(calls).toEqual([
      "/api/v1/admin/accounts?page=1&pageSize=1",
      "/api/v1/auth/refresh",
      "/api/v1/admin/accounts?page=1&pageSize=1",
    ]);
    expect(storage.current).toEqual(NEW_TOKENS);
  });

  it("verifyAdmin returns false on a 403 (authenticated, not an operator)", async () => {
    cover("adminui-session-guard");
    const fetchFn = vi.fn(async () => jsonRes(403, { error: { code: "admin_required", message: "admin role required" } }));
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage: memStorage(TOKENS) });
    expect(await verifyAdmin(api)).toBe(false);
  });

  it("verifyAdmin rethrows non-403 failures", async () => {
    cover("adminui-session-guard");
    const fetchFn = vi.fn(async () => jsonRes(500, { error: { code: "internal", message: "down" } }));
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage: memStorage(TOKENS) });
    await expect(verifyAdmin(api)).rejects.toBeInstanceOf(ApiError);
  });

  // /account/password opts out of the retry: a 401 there means "that current
  // password was wrong", not "your token expired". Retrying would replay the
  // guess against the server's brute-force budget and, worse, a failed refresh
  // would sign the operator out over a typo.
  it("refreshOn401:false sends the request ONCE and never touches /auth/refresh", async () => {
    cover("adminui-change-password");
    const storage = memStorage(TOKENS);
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return jsonRes(401, { error: { code: "unauthorized", message: "invalid credentials" } });
    });
    const expired = vi.fn();
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage, onSessionExpired: expired });

    await expect(
      api.request("/account/password", { body: { currentPassword: "x", newPassword: "y" }, refreshOn401: false }),
    ).rejects.toMatchObject({ status: 401 });

    expect(calls).toEqual(["/api/v1/account/password"]);
    expect(storage.current).toEqual(TOKENS); // still signed in after a typo
    expect(expired).not.toHaveBeenCalled();
  });

  // 🔐 #724/F-21 —— 承重的那條線，兩件事**一起**成立才算修好：
  // ① 伺服器說它把 refresh token 種進 httpOnly cookie ⇒ 磁碟上那一份**不留**它
  // ② 於是重新載入之後（磁碟上只剩 accessToken），401 仍然換發得到 ——
  //    ⛔ 少了②，這個修補就是「把 operator 鎖在後台外面」，比原本的洞更糟。
  it("cookie 模式：refresh token 不落地，而重載後的 401 仍然換發得到", async () => {
    cover("adminui-session-guard");
    // 一個**重新載入過**的後台：磁碟上只剩 access token 與那格記號。
    const storage = memStorage({ accessToken: "acc-1", refreshToken: "", expiresIn: 900, rtCookie: true });
    const bodies: string[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"];
      if (u.endsWith("/auth/refresh")) {
        bodies.push(String(init?.body ?? ""));
        return jsonRes(200, { tokens: NEW_TOKENS, refreshCookie: true });
      }
      if (auth === "Bearer acc-2") return jsonRes(200, { ok: true });
      return jsonRes(401, { error: { code: "unauthorized", message: "expired" } });
    });
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage });

    await expect(api.request("/me")).resolves.toEqual({ ok: true });
    expect(bodies[0], "換發時身上沒有 token —— 憑證由 cookie 帶").toContain('"refreshToken":""');
    expect(storage.current?.refreshToken, "長效憑證⛔不可以落到 localStorage").toBe("");
    expect(storage.current?.rtCookie).toBe(true);
    expect(api.refreshToken, "記憶體裡仍是完整的：cookie 沒種成功時這個分頁照舊").toBe("ref-2");
  });

  it("a rejected refresh clears the session and fires onSessionExpired", async () => {
    cover("adminui-session-guard");
    const storage = memStorage(TOKENS);
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/auth/refresh")) return jsonRes(401, { error: { code: "unauthorized", message: "reuse" } });
      return jsonRes(401, { error: { code: "unauthorized", message: "expired" } });
    });
    const expired = vi.fn();
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage, onSessionExpired: expired });
    await expect(api.request("/me")).rejects.toMatchObject({ status: 401 });
    expect(storage.current).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });
});
