/**
 * Session + API client for the Go platform (/api/v1). Mirrors the game
 * client's session pattern (copied deliberately — the admin console must not
 * import from apps/client): holds the token pair (persisted to localStorage),
 * attaches the access token as a Bearer header, and on a 401 refreshes ONCE
 * (POST /auth/refresh) before retrying the original request a single time. A
 * failed refresh clears the session. fetch + storage are injectable so the
 * refresh + role-guard logic is unit-testable.
 */
import type { TokenPair } from "./types";

const STORAGE_KEY = "ggd.admin.session.v1";

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
  onSessionExpired?: () => void;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** attach Authorization + auto-refresh on 401 (default true) */
  auth?: boolean;
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

  setTokens(tokens: TokenPair | null): void {
    this.tokens = tokens;
    this.storage.save(tokens);
  }

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
          const body = (await res.json()) as { tokens: TokenPair };
          this.setTokens(body.tokens);
          return true;
        } catch {
          return false;
        } finally {
          this.refreshing = null;
        }
      })();
    }
    return this.refreshing;
  }

  /** JSON request with the 401 → refresh-once → retry-once policy. */
  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let res = await this.rawRequest(path, opts);
    if (res.status === 401 && opts.auth !== false && this.tokens) {
      const refreshed = await this.refreshOnce();
      if (refreshed) res = await this.rawRequest(path, opts);
    }
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as T;
  }
}

/**
 * Verify the current session belongs to an admin by pinging an admin-only
 * route. 200 → admin; a 403 (`admin_required`) → authenticated but not an
 * operator; anything else re-throws for the caller to surface.
 */
export async function verifyAdmin(api: ApiClient): Promise<boolean> {
  try {
    await api.request("/admin/accounts?page=1&pageSize=1");
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return false;
    throw err;
  }
}
