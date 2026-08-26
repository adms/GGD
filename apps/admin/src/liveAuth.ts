/**
 * 🔐 `apps/admin/src/liveAuth.ts` —— 讓每一個打到 `/__live/**` 與 `/__review/**`
 * 的請求自動帶上這個 console 已經登入拿到的 Bearer token（GH#796）。
 *
 * ## ⛔ 為什麼不是「去改那 13 個頁面」
 * 那 13 頁各自寫著 `fetch("/__live/<dataset>")`。逐頁加一個 header ＝
 * **13 處同型改動 ＋ 第 14 頁加進來時不會有東西提醒你**（第零守則⑨：
 * N 個同型項目 = K 個模板，⛔ 不是 N 次改改改）。
 * ⇒ 一個攔截器，一個住處。
 *
 * ## 它做什麼、⛔ 不做什麼
 * · 只碰**相對路徑**且前綴是 `/__live/` 或 `/__review/` 的請求
 * · 呼叫端**已經給了** `Authorization` 就不覆蓋（⛔ 不搶別人的決定）
 * · ⛔ **不判斷「有沒有權限」** —— 拿不到 token 也照樣送出去，由伺服器裁決。
 *   判斷放兩個地方 ＝ 兩份真相，而前端那一份必然先過期（第〇·四守則）。
 *
 * ## ⚠️ 本機與線上的差別
 * 本機 dev server 不驗身分（`GGD_REVIEW_REQUIRE_ADMIN` 只在 live 模式預設是 1），
 * 所以這支在本機是**沒有作用的**（多帶一個 header 而已）。⭐ 那是刻意的：
 * ⛔ 不要為了「本機也要驗」而讓開發要先登入 —— 那會讓人把整條閘關掉。
 */

let installed = false;

/** 只有這兩族要帶身分。⛔ `/healthz` 刻意不在內（部署後置條件用它，而它沒有 token）。 */
const GUARDED = ["/__live/", "/__review/"];

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname;
  return (input as Request).url ?? "";
}

/** 相對路徑，或同源的絕對路徑 —— ⛔ 跨網域一律不帶（別把 token 送給別人）。 */
function isGuarded(raw: string): boolean {
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.origin !== globalThis.location?.origin) return false;
      path = u.pathname;
    } catch {
      return false;
    }
  }
  return GUARDED.some((p) => path.startsWith(p));
}

/**
 * 裝上攔截器。⭐ 冪等 —— 重複呼叫只裝一次（HMR 會 re-import）。
 * @param readToken 取得 access token；⛔ 注入是為了測得動，⛔ 不是為了有第二個來源。
 */
export function installLiveAuthFetch(readToken: () => string | null): void {
  if (installed) return;
  const base = globalThis.fetch;
  if (typeof base !== "function") return;
  installed = true;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!isGuarded(urlOf(input))) return base(input, init);
    const existing = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!existing.has("Authorization")) {
      const t = readToken();
      if (t !== null && t !== "") existing.set("Authorization", `Bearer ${t}`);
    }
    return base(input, { ...(init ?? {}), headers: existing });
  }) as typeof fetch;
}

/** 測試用：拆掉「已裝過」的記號。⛔ 產品程式碼不該叫它。 */
export function _resetLiveAuthFetch(): void {
  installed = false;
}
