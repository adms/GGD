/**
 * tools/review/adminAuth.mjs —— 🔐 **線上的 `/__review` 與 `/__live` 要 admin 身分**（GH#796）。
 *
 * ## 為什麼需要它
 * 把這兩條路搬上線（#794）之後它們由 **nginx 直接服務**，⛔ 繞過了後台 console
 * 自己的登入閘。實測（匿名、無 token）：`/__review/features` 200、
 * `/__live/**` 200、⚠️ 而且 `POST /__review/feature-verdict` **任何人都寫得進去**。
 *
 * ## ⭐ 判準：⛔ 不建立任何新憑證
 * owner 2026-08-27:「別問我了**自己判斷** 但是**留後台開關可以簡易 rollback**」
 * ⇒ 我自己收掉它。⛔ 但我**不建立帳號或密碼**（htpasswd / 新 token 都不行）——
 *   ⭐ 所以用他**已經有的**那個登入：後台 console 的 Bearer token。
 *
 * ## 怎麼驗（⛔ 不自己解 JWT）
 * ⛔ 自己解 JWT ＝ 第二份「什麼算 admin」的真相，而它會與平台漂開。
 * ⭐ 這裡把收到的 `Authorization` 原封不動轉給**平台自己的 admin-only 端點**
 *   （`GET /api/v1/admin/accounts/pending?limit=1`，`admin/handlers.go:23` 的
 *   `ar.Use(h.svc.AdminOnly)` 罩著它）：
 *     200      ⇒ 這是 admin，放行
 *     其餘/失敗 ⇒ 401，訊息說清楚要先登入後台
 * ⇒ 「什麼算 admin」永遠只有一個住處：平台（第〇·四守則）。
 *
 * ## 🔁 一鍵 rollback（owner 的常設條件）
 *   `GGD_REVIEW_REQUIRE_ADMIN=0`  ⇒ 回到 #794 剛上線時的行為（全開）
 * 預設是 **1**（要 admin）——「優先權大的更新後都是預設啟動」（第〇·六守則）。
 * ⚠️ 它是**環境變數**⛔ 不是後台欄位，而那是刻意的：一個「用後台欄位控制後台
 * 能不能進」的開關是循環的 —— 鎖在門裡面的鑰匙不是鑰匙。
 *
 * ## ⏱ 快取
 * 每一則請求都打平台一次會讓 13 頁的實時資料變慢。同一個 token 的結果快取
 * **60 秒**（⛔ 不更久：撤銷一個 admin 之後最多一分鐘就生效）。
 */

const TTL_MS = 60_000;
/** token → { ok, at }。⚠️ 只存**結果**，⛔ 不存 token 的內容。 */
const cache = new Map();

export const AUTH_PROBE_PATH = "/api/v1/admin/accounts/pending?limit=1";

/** ⭐ 這兩族路徑才要身分。其餘（/healthz）保持匿名 —— 它是給部署後置條件用的。 */
export function needsAdmin(url) {
  return url.startsWith("/__review/") || url.startsWith("/__live/");
}

/**
 * @returns { ok: true } | { ok: false, status, error }
 */
export async function checkAdmin(authHeader, opts = {}) {
  const required = (opts.required ?? process.env.GGD_REVIEW_REQUIRE_ADMIN ?? "1") !== "0";
  if (!required) return { ok: true, bypassed: true };

  const auth = typeof authHeader === "string" ? authHeader.trim() : "";
  if (auth === "") {
    return {
      ok: false,
      status: 401,
      error:
        "⛔ 這條路要後台 admin 身分。請先在 https://ggd.adms.ai/admin/ 登入 —— " +
        "後台的頁面會自動帶上 token（GH#796）。",
    };
  }

  const hit = cache.get(auth);
  const now = opts.now ?? Date.now();
  if (hit !== undefined && now - hit.at < TTL_MS) {
    return hit.ok ? { ok: true, cached: true } : { ok: false, status: 401, error: hit.error, cached: true };
  }

  const base = opts.platformUrl ?? process.env.GGD_PLATFORM_URL ?? "http://platform:8080";
  const doFetch = opts.fetch ?? globalThis.fetch;
  let ok = false;
  let error = "";
  try {
    const r = await doFetch(`${base}${AUTH_PROBE_PATH}`, { headers: { Authorization: auth } });
    ok = r.status === 200;
    if (!ok) {
      error =
        r.status === 401 || r.status === 403
          ? "⛔ 這個 token 不是 admin（或已過期）。回後台重新登入一次。"
          : `⛔ 平台回 ${r.status} —— 驗不了身分，所以⛔ 不放行（fail-closed）。`;
    }
  } catch (err) {
    // ⭐ **fail-CLOSED**：驗不到就擋。這一族路徑寫得動 owner 的裁決帳本，
    //   ⛔ 而「平台暫時打不到」不是放行的理由。
    error = `⛔ 驗不到身分（平台打不到：${String(err)}）—— fail-closed，⛔ 不放行。`;
  }
  cache.set(auth, { ok, at: now, error });
  return ok ? { ok: true } : { ok: false, status: 401, error };
}

/** 測試用：清掉快取。 */
export function _resetAuthCache() {
  cache.clear();
}
