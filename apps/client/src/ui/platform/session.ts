/**
 * Session + API client for the Go platform (/api/v1 via the vite dev proxy /
 * nginx in prod). Holds the token pair (persisted to localStorage), attaches
 * the access token as a Bearer header, and on a 401 refreshes ONCE
 * (POST /auth/refresh, rotating refresh tokens) before retrying the original
 * request a single time. A failed refresh clears the session (logged out).
 * fetch + storage are injectable so the refresh logic is unit-testable.
 */
import type { TokenPair } from "./types";
// ⭐ 轉出 —— `refreshNotInStorage.test.ts` 要拿它當型別，⛔ 而 GH#813 B 那一輪
//   只 import 沒 export ⇒ `tsc` 紅（⚠️ 而 vitest 是綠的：型別匯入在執行期不存在）。
export type { TokenPair };

const STORAGE_KEY = "ggd.session.v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface TokenStorage {
  load(): TokenPair | null;
  save(tokens: TokenPair | null): void;
}

/** localStorage-backed token persistence (no-op outside the browser). */
export const browserTokenStorage: TokenStorage = {
  load(): TokenPair | null {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TokenPair;
      if (typeof parsed?.accessToken !== "string" || typeof parsed?.refreshToken !== "string") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },
  save(tokens: TokenPair | null): void {
    try {
      if (tokens) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(tokens));
      else globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      /* private mode etc. — session just won't persist */
    }
  },
};

export interface ApiClientOptions {
  base?: string;
  fetchFn?: typeof fetch;
  storage?: TokenStorage;
  /** called when the session dies (refresh rejected) — UI returns to auth */
  onSessionExpired?: () => void;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** attach Authorization + auto-refresh on 401 (default true) */
  auth?: boolean;
  /**
   * Refresh-and-retry once on a 401 (default true).
   *
   * Turn this OFF for an authenticated endpoint where a 401 means "that
   * credential was wrong", not "your token expired" — /account/password
   * (self-service change-password, #211) is the one such route. Retrying there
   * would replay the attempt (spending the server's brute-force budget twice)
   * and, on a failed refresh, sign the player out over a mistyped password.
   */
  refreshOn401?: boolean;
}

/** Parse the standard error envelope; fall back to a generic message. */
async function parseError(res: Response): Promise<ApiError> {
  let code = "error";
  let message = `request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body?.error?.code) code = body.error.code;
    if (body?.error?.message) message = body.error.message;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, code, message);
}

export class ApiClient {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly storage: TokenStorage;
  private tokens: TokenPair | null;
  private refreshing: Promise<boolean> | null = null;
  onSessionExpired: (() => void) | null;

  constructor(opts: ApiClientOptions = {}) {
    this.base = opts.base ?? "/api/v1";
    this.fetchFn = opts.fetchFn ?? ((...args) => fetch(...args));
    this.storage = opts.storage ?? browserTokenStorage;
    this.tokens = this.storage.load();
    this.onSessionExpired = opts.onSessionExpired ?? null;
  }

  get hasSession(): boolean {
    return this.tokens !== null;
  }

  get accessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  get refreshToken(): string | null {
    return this.tokens?.refreshToken ?? null;
  }

  /**
   * ⭐⭐ GH#813 B —— **長效憑證⛔不落 localStorage**（照 admin 已驗證過的形狀）。
   *
   * ⛔ 在此之前：`refreshToken` 與 `accessToken` 一起被寫進 localStorage。
   * ⭐ 而長效的那一顆才是有價值的目標（access 幾分鐘就過期，refresh 是**整個帳號**）。
   *
   * ⭐ 判準與 `apps/admin/src/session.ts:186` **逐字相同**：
   *   · 伺服器說它把 refresh 種成 cookie 了（`refreshCookie: true`）
   *     ⇒ ⭐ **磁碟上那一份**抽掉 refresh，記憶體裡仍然完整
   *   · 伺服器**沒說**（舊版／cookie 種不起來）⇒ ⛔ **一個位元組都不改**
   *     —— 降級要是「照舊」，⛔ 不是「當場壞掉」
   *
   * ⚠️ ⭐ 記憶體那一份保持完整是**必要**的：cookie 沒種成功時，這個分頁照舊能換發。
   */
  setTokens(tokens: TokenPair | null, refreshInCookie = false): void {
    this.tokens = tokens;
    if (tokens && refreshInCookie) {
      this.serverHoldsRefresh = true;
      this.storage.save({ ...tokens, refreshToken: "" } as TokenPair);
      return;
    }
    if (!tokens) this.serverHoldsRefresh = false;
    this.storage.save(tokens);
  }

  /** 伺服器有沒有說「refresh 在我這（cookie）」。⛔ 只有帶 token 的回應才算數。 */
  private serverHoldsRefresh = false;

  /** One raw call (no refresh logic). */
  private async rawRequest(path: string, opts: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.auth !== false && this.tokens) {
      headers["Authorization"] = `Bearer ${this.tokens.accessToken}`;
    }
    return this.fetchFn(this.base + path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  }

  /**
   * Refresh the token pair once; concurrent 401s share one in-flight refresh.
   * Returns false (and clears the session) when the refresh is rejected.
   */
  private refreshOnce(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const refreshToken = this.tokens?.refreshToken;
        if (!refreshToken) return false;
        try {
          const res = await this.rawRequest("/auth/refresh", {
            method: "POST",
            body: { refreshToken },
            auth: false,
          });
          if (!res.ok) {
            this.setTokens(null);
            this.onSessionExpired?.();
            return false;
          }
          const body = (await res.json()) as { tokens: TokenPair; refreshCookie?: unknown };
          // ⭐ 伺服器說它收下 refresh 了（種成 cookie）⇒ 磁碟上不再留一份（GH#813 B）。
          this.setTokens(body.tokens, body.refreshCookie === true);
          return true;
        } catch {
          return false; // network error: keep tokens, caller surfaces the error
        } finally {
          this.refreshing = null; // allow future refreshes once settled
        }
      })();
    }
    return this.refreshing;
  }

  /** JSON request with the 401 → refresh-once → retry-once policy. */
  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let res = await this.rawRequest(path, opts);
    if (res.status === 401 && opts.auth !== false && opts.refreshOn401 !== false && this.tokens) {
      const refreshed = await this.refreshOnce();
      if (refreshed) res = await this.rawRequest(path, opts);
    }
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as T;
  }
}
