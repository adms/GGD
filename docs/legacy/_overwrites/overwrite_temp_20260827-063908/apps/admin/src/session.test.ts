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
