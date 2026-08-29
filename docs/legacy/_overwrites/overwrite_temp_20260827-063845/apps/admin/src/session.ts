/**
 * Session + API client for the Go platform (/api/v1). Mirrors the game
 * client's session pattern (copied deliberately — the admin console must not
 * import from apps/client): holds the token pair, attaches the access token as
 * a Bearer header, and on a 401 refreshes ONCE (POST /auth/refresh) before
 * retrying the original request a single time. A failed refresh clears the
 * session. fetch + storage are injectable so the refresh + role-guard logic is
 * unit-testable.
 *
 * ## 🔐 #724 / F-21 —— refresh token 不再**長住** localStorage
 *
 * 稽核找到的洞：整組 token 寫進 localStorage ⇒ 一次 XSS 帶走的不是「這一頁」，
 * 是一顆**能繼續換發好幾天**的長效憑證。而後台正是最值得偷的那一個 console
 * （它能停權帳號、發水晶、改平衡）。
 *
 * ⭐ 修法是**伺服器說了算**：`/auth/{login,refresh,account/password}` 現在會把
 * refresh token 同時種進一顆 **httpOnly** cookie（`ggd_rt`,
 * `Path=/api/v1/auth`, `SameSite=Strict`），並在回應裡多一個
 * `"refreshCookie": true` 說它種了。這一支看到那個旗標，就**不把 refresh token
 * 寫進 localStorage** —— 換發改由瀏覽器自動帶上的 cookie 負責，而 JavaScript
 * （因此 XSS）讀不到它。
 *
 * ⚠️ **⛔ 不是「前端自己決定」**：httpOnly 的意思就是瀏覽器**永遠驗證不了**那顆
 * cookie 在不在。前端如果用猜的，一次「後端把旋鈕關掉」就會讓 token 掉在地上、
 * 把 operator 鎖在門外。⇒ 旗標由伺服器發，`GGD_AUTH_REFRESH_COOKIE=0`
 * **一格環境變數**把兩邊一起退回 #724 之前的行為，⛔ 不必重建前端。
 *
 * ⚠️ **記憶體裡那一份刻意留著**：`this.tokens` 仍握有真的 refresh token，只有
 * **寫到磁碟的那一份**被抽掉。⭐ 這讓「cookie 沒種成功」的降級是**這個分頁完全
 * 照舊**，只有下一次重新載入才需要 cookie —— 而那時它要嘛在（正常）、要嘛
 * 需要重新登入（可復原），⛔ 不會是「當場壞掉」。同一個分頁裡的 XSS 本來就能
 * 直接呼叫 API，所以留在記憶體裡沒有多讓出任何東西；F-21 要關的是**跨頁存活**
 * 的那一份。
 */
import type { TokenPair } from "./types";

const STORAGE_KEY = "ggd.admin.session.v1";

/**
 * 存到 localStorage 的形狀。⭐ 比 `TokenPair` 多一格 `rtCookie` —— 它記的是
 * 「上一次伺服器說 refresh token 在 cookie 裡」，所以**重新載入之後**這一支才
 * 知道「refreshToken 是空的」是**刻意的**，⛔ 不是壞掉的 session。
 * ⛔ 少了它，重載後的第一個 401 會直接判定「沒有憑證」並登出。
 */
export type StoredSession = TokenPair & { rtCookie?: boolean };

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
  load(): StoredSession | null;
  save(tokens: StoredSession | null): void;
}

/** localStorage-backed token persistence (no-op outside the browser). */
export const browserTokenStorage: TokenStorage = {
  load(): StoredSession | null {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSession;
      if (typeof parsed?.accessToken !== "string" || typeof parsed?.refreshToken !== "string") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },
  save(tokens: StoredSession | null): void {
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
  /**
   * Refresh-and-retry once on a 401 (default true).
   *
   * Turn this OFF for an authenticated endpoint where a 401 means "that
   * credential was wrong", not "your token expired" — /account/password is the
   * one such route. Retrying there would replay the attempt (spending the
   * server's brute-force budget twice) and, on a failed refresh, sign the
   * operator out over a mistyped password.
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
  /**
   * ⭐ 「伺服器手上有一顆 httpOnly cookie 裝著我的 refresh token」。
   * 由**最近一次帶 token 的回應**決定（#724/F-21），⛔ 不是前端猜的。
   */
  private serverHoldsRefresh = false;
  onSessionExpired: (() => void) | null;

  constructor(opts: ApiClientOptions = {}) {
    this.base = opts.base ?? "/api/v1";
    this.fetchFn = opts.fetchFn ?? ((...args) => fetch(...args));
    this.storage = opts.storage ?? browserTokenStorage;
    const restored = this.storage.load();
    this.tokens = restored;
    this.serverHoldsRefresh = restored?.rtCookie === true;
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
    const hadRefreshInHand = (this.tokens?.refreshToken ?? "") !== "";
    const cookieMode = this.serverHoldsRefresh;
    this.tokens = tokens;
    if (tokens === null) {
      this.storage.save(null);
      // ⭐ 簽出要把憑證**還回去**。⚠️ 重新載入之後這一支手上沒有 refresh token
      // 了（那正是 F-21 的重點），所以呼叫端的 `if (token) apiLogout(token)`
      // 會整個跳過 —— 於是伺服器那一顆 cookie 會活到 TTL 到期。
      // ⇒ 這裡補打一發**盡力而為**的 logout，讓 cookie 被清掉並且 token 被撤銷。
      // ⛔ 只在「cookie 模式且我手上沒有 token」時打，所以正常簽出⛔不會打兩次。
      if (cookieMode && !hadRefreshInHand) {
        void this.rawRequest("/auth/logout", { method: "POST", body: { refreshToken: "" }, auth: false }).catch(
          () => {
            /* best effort — 本機的 session 已經清掉了 */
          },
        );
      }
      this.serverHoldsRefresh = false;
      return;
    }
    // ⭐ cookie 模式下**只有磁碟上那一份**被抽掉 refresh token；記憶體裡仍是完整
    // 的（見檔頭：降級要是「照舊」，⛔ 不是「當場壞掉」）。
    this.storage.save(
      cookieMode ? { ...tokens, refreshToken: "", rtCookie: true } : { ...tokens, rtCookie: false },
    );
  }

  /**
   * 讀伺服器對「refresh token 在誰手上」的裁決。⭐ 只有**帶 token 的回應**才算數
   * （`tokens` 欄位在場）—— 其他回應沒有資格改變這個狀態。
   */
  private noteRefreshCookie(parsed: unknown): void {
    if (typeof parsed !== "object" || parsed === null) return;
    const body = parsed as { tokens?: unknown; refreshCookie?: unknown };
    if (body.tokens === undefined) return;
    this.serverHoldsRefresh = body.refreshCookie === true;
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
      // ⭐ 明寫（同源本來就是預設）：refresh token 現在住在一顆 cookie 裡，
      // 而「哪天有人把預設改掉」不應該是一個靜默的登出（#724/F-21）。
      credentials: "same-origin",
    });
  }

  private refreshOnce(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const refreshToken = this.tokens?.refreshToken ?? "";
        // ⭐ 空字串 ＋ cookie 模式 = 「重新載入之後的後台」：憑證在瀏覽器的
        // httpOnly cookie 裡，由伺服器自己去讀（#724/F-21）。
        // ⛔ 兩個都沒有才是真的沒有 session。
        if (refreshToken === "" && !this.serverHoldsRefresh) return false;
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
          const body = (await res.json()) as { tokens: TokenPair; refreshCookie?: boolean };
          this.noteRefreshCookie(body);
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
    if (res.status === 401 && opts.auth !== false && opts.refreshOn401 !== false && this.tokens) {
      const refreshed = await this.refreshOnce();
      if (refreshed) res = await this.rawRequest(path, opts);
    }
    if (!res.ok) throw await parseError(res);
    const parsed = (await res.json()) as T;
    // ⭐ 登入／改密碼也是在這裡拿到 token 的。呼叫端隨後才呼叫 `setTokens()`，
    // 所以「伺服器有沒有種 cookie」必須在**同一次回應**上就記下來 ——
    // ⛔ 不然登入後那顆 refresh token 會照舊被寫進 localStorage（#724/F-21）。
    this.noteRefreshCookie(parsed);
    return parsed;
  }

  /**
   * POST a JSON body and read a BINARY response (task #243's archive export).
   *
   * `request` cannot serve this: it calls res.json() on the way out, which
   * would corrupt a ZIP. The 401 path still parses the standard error envelope,
   * so a wrong-password refusal reads exactly like every other API failure
   * rather than arriving as an unreadable blob.
   *
   * refreshOn401 defaults to FALSE here for the same reason /account/password
   * turns it off: these routes re-confirm a password, so a 401 means "that
   * credential was wrong", not "your token expired", and retrying would spend
   * the server's brute-force budget twice.
   */
  async requestBlob(path: string, body: unknown, opts: RequestOptions = {}): Promise<Blob> {
    let res = await this.rawRequest(path, { ...opts, body, method: opts.method ?? "POST" });
    if (res.status === 401 && opts.refreshOn401 === true && this.tokens) {
      const refreshed = await this.refreshOnce();
      if (refreshed) res = await this.rawRequest(path, { ...opts, body, method: opts.method ?? "POST" });
    }
    if (!res.ok) throw await parseError(res);
    return await res.blob();
  }

  /**
   * POST RAW BYTES (the archive upload). The body is sent as-is with an
   * explicit content type — no JSON.stringify — because the payload is a file
   * the operator picked, and re-encoding it would be both wrong and enormous.
   */
  async postRaw<T>(path: string, body: BodyInit, contentType: string): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": contentType };
    if (this.tokens) headers["Authorization"] = `Bearer ${this.tokens.accessToken}`;
    const res = await this.fetchFn(this.base + path, { method: "POST", headers, body });
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
