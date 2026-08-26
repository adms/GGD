/**
 * 🔐 **線上的 `/__review` 與 `/__live` 要 admin 身分** —— GH#796 的承重守衛。
 *
 * ## 為什麼有這張票
 * #794 把這兩條路搬上線之後它們由 **nginx 直接服務**，⛔ 繞過了後台 console
 * 自己的登入閘。線上實測（匿名、無 token）：`/__review/features` **200**、
 * `/__live/**` **200**、⚠️ 而 `POST /__review/feature-verdict` **任何人都寫得進去**。
 *
 * owner 2026-08-27:「別問我了**自己判斷** 但是**留後台開關可以簡易 rollback**」
 * ⇒ 自己收掉，⛔ 但不建立任何新憑證：用他已經有的後台登入
 *   （token 轉給平台自己的 admin-only 端點驗 —— 「什麼算 admin」只有一個住處）。
 *
 * ## 這一條問的是**行為**，⛔ 不是「有沒有那行字」
 * 拿**真的** `checkAdmin`、餵**真的**請求形狀、收**真的**狀態碼。
 * ⛔ 不是 grep「有沒有 Authorization 這個字」（失敗形態⑥）。
 *
 * ## ⚠️ `/healthz` 刻意匿名 —— 這一條也守著它
 * 部署後置條件用 `/healthz` 判斷 sidecar 健不健康，而**部署腳本不持有、也不該
 * 持有 owner 的憑證**。⇒ 把 `/healthz` 一起關進去會讓那條後置條件永遠回 401，
 * 而**一個誤報的閘會被忽略，被忽略的閘等於沒有閘**。
 *
 * ── 突變紀錄（一批一條，最承重的那一行）──────────────────────────────────
 *  · `tools/review/adminAuth.mjs` 的 catch 從 fail-closed 改成 `return { ok: true }`
 *    → 第 ③ 條紅（平台打不到時匿名就進得來，而那正是最該擋的時候）。實測過。
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** ⚠️ 算出來的 specifier：`tools/` 是 .mjs 無型別宣告，靜態 import 會 TS7016。 */
const load = async (): Promise<{
  checkAdmin: (auth: unknown, opts?: Record<string, unknown>) => Promise<{ ok: boolean; status?: number }>;
  needsAdmin: (url: string) => boolean;
  _resetAuthCache: () => void;
}> => {
  const href = new URL("../../../../tools/review/adminAuth.mjs", `file://${join(HERE, "x")}`).href;
  return (await import(/* @vite-ignore */ href)) as never;
};

const okFetch = async (): Promise<{ status: number }> => ({ status: 200 });
const denyFetch = async (): Promise<{ status: number }> => ({ status: 403 });
const deadFetch = async (): Promise<never> => {
  throw new Error("ECONNREFUSED");
};

describe("線上批核頁要 admin 身分 (review-admin-gate)", () => {
  it("⭐ ① 哪些路要身分、哪些刻意不要（/healthz 必須保持匿名）", async () => {
    const { needsAdmin } = await load();
    expect(needsAdmin("/__review/features"), "批次清單沒有被保護").toBe(true);
    expect(needsAdmin("/__review/feature-verdict"), "⛔ 寫裁決的那條路沒有被保護").toBe(true);
    expect(needsAdmin("/__live/sfx-map"), "13 頁的資料面沒有被保護").toBe(true);
    // ⭐ 反方向：關進去會讓部署後置條件永遠 401（見檔頭）。
    expect(needsAdmin("/healthz"), "⛔ /healthz 被關起來了 —— 部署後置條件會開始誤報").toBe(false);
  });

  it("⭐ ② 匿名擋下 · admin 放行 · 非 admin 擋下（跑真的 checkAdmin）", async () => {
    const { checkAdmin, _resetAuthCache } = await load();
    _resetAuthCache();
    const anon = await checkAdmin(undefined, { required: true, fetch: okFetch });
    expect(anon.ok, "⛔ 沒有 token 就進得來").toBe(false);
    expect(anon.status).toBe(401);

    _resetAuthCache();
    expect((await checkAdmin("Bearer good", { required: true, fetch: okFetch })).ok).toBe(true);

    _resetAuthCache();
    const notAdmin = await checkAdmin("Bearer nobody", { required: true, fetch: denyFetch });
    expect(notAdmin.ok, "⛔ 平台說不是 admin，而我們放行了").toBe(false);
  });

  it("⭐ ③ 平台打不到時 **fail-CLOSED**（⛔ 不是放行）", async () => {
    const { checkAdmin, _resetAuthCache } = await load();
    _resetAuthCache();
    const r = await checkAdmin("Bearer whatever", { required: true, fetch: deadFetch });
    expect(
      r.ok,
      "⛔ 驗不到身分就放行 —— 而『平台暫時打不到』正是最該擋的時候（這條路寫得動 owner 的裁決帳本）",
    ).toBe(false);
  });

  it("⭐ ④ 一鍵 rollback：required=false 全開（owner 的常設條件）", async () => {
    const { checkAdmin, _resetAuthCache } = await load();
    _resetAuthCache();
    expect(
      (await checkAdmin(undefined, { required: false, fetch: deadFetch })).ok,
      "⛔ 關掉開關之後仍然擋著 —— 那就不是一鍵 rollback",
    ).toBe(true);
  });
});
