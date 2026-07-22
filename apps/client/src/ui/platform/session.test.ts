/**
 * webui-02 (webui-session-refresh) + webui-03 (webui-error-envelope):
 * ApiClient 401 handling — refresh ONCE via /auth/refresh, retry the original
 * request once, share one in-flight refresh across concurrent 401s; a
 * rejected refresh clears the session and fires onSessionExpired. Error
 * responses surface the standard {error:{code,message}} envelope as ApiError.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ApiClient, ApiError, type TokenStorage } from "./session";
import type { TokenPair } from "./types";

function memStorage(initial: TokenPair | null = null): TokenStorage & { current: TokenPair | null } {
  const box = {
    current: initial,
    load: () => box.current,
    save: (t: TokenPair | null) => {
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

describe("session refresh logic (webui-02)", () => {
  it("401 → POST /auth/refresh → retry original once with the new token", async () => {
    cover("webui-session-refresh");
    const storage = memStorage(TOKENS);
    const calls: { url: string; auth?: string; body?: string }[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"];
      calls.push({ url: u, auth, body: init?.body ? String(init.body) : undefined });
      if (u.endsWith("/me") && auth === "Bearer acc-1") return jsonRes(401, { error: { code: "unauthorized", message: "expired" } });
      if (u.endsWith("/auth/refresh")) return jsonRes(200, { tokens: NEW_TOKENS });
      if (u.endsWith("/me") && auth === "Bearer acc-2") return jsonRes(200, { account: { id: "a1" } });
      return jsonRes(500, { error: { code: "internal", message: "boom" } });
    });
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage });

    const out = await api.request<{ account: { id: string } }>("/me");
    expect(out.account.id).toBe("a1");
    expect(calls.map((c) => c.url)).toEqual(["/api/v1/me", "/api/v1/auth/refresh", "/api/v1/me"]);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ refreshToken: "ref-1" });
    // rotated pair persisted
    expect(storage.current).toEqual(NEW_TOKENS);
  });

  it("rejected refresh clears the session, fires onSessionExpired, and does NOT loop", async () => {
    cover("webui-session-refresh");
    const storage = memStorage(TOKENS);
    let meCalls = 0;
    let refreshCalls = 0;
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/me")) {
        meCalls++;
        return jsonRes(401, { error: { code: "unauthorized", message: "expired" } });
      }
      refreshCalls++;
      return jsonRes(401, { error: { code: "unauthorized", message: "refresh token reuse detected" } });
    });
    const expired = vi.fn();
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage, onSessionExpired: expired });

    await expect(api.request("/me")).rejects.toMatchObject({ status: 401 });
    expect(meCalls).toBe(1); // original NOT retried after failed refresh
    expect(refreshCalls).toBe(1); // refreshed exactly once
    expect(storage.current).toBeNull(); // logged out
    expect(api.hasSession).toBe(false);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("concurrent 401s share ONE in-flight refresh", async () => {
    cover("webui-session-refresh");
    const storage = memStorage(TOKENS);
    let refreshCalls = 0;
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"];
      if (u.endsWith("/auth/refresh")) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 5));
        return jsonRes(200, { tokens: NEW_TOKENS });
      }
      if (auth === "Bearer acc-1") return jsonRes(401, { error: { code: "unauthorized", message: "expired" } });
      return jsonRes(200, { ok: true });
    });
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage });

    const [a, b, c] = await Promise.all([
      api.request<{ ok: boolean }>("/wallet"),
      api.request<{ ok: boolean }>("/friends"),
      api.request<{ ok: boolean }>("/store/catalog"),
    ]);
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(refreshCalls).toBe(1);
  });

  it("unauthenticated requests never attempt a refresh", async () => {
    cover("webui-session-refresh");
    const storage = memStorage(null);
    const fetchFn = vi.fn(async () => jsonRes(401, { error: { code: "unauthorized", message: "bad creds" } }));
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage });
    await expect(api.request("/auth/login", { body: { username: "u", password: "p" }, auth: false })).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("error envelope surfacing (webui-03)", () => {
  it("parses {error:{code,message}} into ApiError fields", async () => {
    cover("webui-error-envelope");
    const fetchFn = vi.fn(async () =>
      jsonRes(409, { error: { code: "already_owned", message: "skin already owned" } }),
    );
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage: memStorage(TOKENS) });
    const err = await api.request("/store/buy", { body: { kind: "skin", id: "x" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "already_owned", message: "skin already owned" });
  });

  it("non-JSON error bodies fall back to a generic message", async () => {
    cover("webui-error-envelope");
    const fetchFn = vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 }));
    const api = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage: memStorage(TOKENS) });
    const err = await api.request("/wallet").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: "error" });
  });
});
