/**
 * GH#717 —— 執行期內容快取的**兩條**承重線（體驗層 ⇒ 一支薄守衛，⛔ 不開對抗輪）。
 *
 * ⭐ 突變點（一批一條，挑最貴的那一條）：把 `shouldUseRuntimeCache` 的
 *    `if (opts.withOverlay) return false;` 拿掉 ⇒ ①那條紅。
 *    那一行守的是「後台改了設定，下一場比賽拿到的是**新的**內容」——
 *    ⛔ 它壞掉的樣子是靜默的（deploy 成功、healthz 全綠、玩家那一場沒變）。
 *
 * ⛔ 這裡不驗任何出貨數字（TTL 的 24 一律從 `DEFAULT_CACHE_TTL_HOURS` 推導）。
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CACHE_TTL_HOURS,
  cacheTtlHours,
  contentCacheHealth,
  recordCacheLoad,
  recordUncachedLoad,
  shouldUseRuntimeCache,
} from "./contentCacheHealth";
import { buildHealthzPayload } from "./healthz";
import type { CacheReport } from "@ggd/shared/content/cache/index";

const report = (over: Partial<CacheReport> = {}): CacheReport => ({
  mode: "auto",
  hit: "file",
  key: "k",
  fingerprint: { key: "k", source: "git", dirty: 0, paths: 1, ms: 1 },
  bytes: 1,
  timings: { fingerprint: 1, read: 1, hydrate: 1, load: 0, write: 0 },
  notes: [],
  ...over,
});

describe("① overlay 在的時候**永遠不走快取** (GH#717)", () => {
  it("⭐ 承重：後台改過東西（overlay 非 null）⇒ 這一趟一定重讀，⛔ 開關也翻不動它", () => {
    // ⛔ 對照組：沒有 overlay 時它是**開**的 —— 少了這一條，下面那兩條對
    // 「整支函式永遠回 false」也會過（失敗形態④）。
    expect(shouldUseRuntimeCache({ withOverlay: false, env: {} })).toBe(true);
    expect(shouldUseRuntimeCache({ withOverlay: true, env: {} })).toBe(false);
    // 連「明確打開」都不行：失效鍵看不見 overlay，這不是偏好問題。
    expect(shouldUseRuntimeCache({ withOverlay: true, env: { GGD_CONTENT_CACHE_RUNTIME: "on" } })).toBe(
      false,
    );
  });

  it("rollback 那一格真的接著（owner 常設令：留一格可以一鍵回頭）", () => {
    expect(shouldUseRuntimeCache({ withOverlay: false, env: { GGD_CONTENT_CACHE_RUNTIME: "off" } })).toBe(
      false,
    );
    expect(cacheTtlHours({})).toBe(DEFAULT_CACHE_TTL_HOURS);
  });
});

describe("② 沒生效的時候**說得出來** (fail-open 沒錯，靜默才是缺陷)", () => {
  it("⭐ 未命中一定帶著一句 reason，而且 `/healthz` 讀得到它", () => {
    // 快取層自己記了退回原因（Redis 掛了）⇒ 原樣轉述。
    recordCacheLoad(report({ hit: "miss", notes: ["Redis 連不上（127.0.0.1:6379）⇒ 退回檔案層"] }), 480, {});
    expect(contentCacheHealth().engaged).toBe(false);
    expect(contentCacheHealth().backend).toBe("none");
    expect(contentCacheHealth().reason).toContain("Redis");

    // ⭐ 最重要的一種：正式環境的 `CONTENT_DIR=/srv/content` 認不出出貨樹。
    // ⚠️ 2026-08-30 之前快取層對這一種**一個字都不說**，所以這裡只能用猜的
    //（「空 notes ＋ miss ⇒ 大概是 CONTENT_DIR」）—— 而猜的東西不是證據。
    // 現在它是一句真的 note，⇒ 這一條改成驗**它有沒有原樣被轉述出去**。
    recordCacheLoad(
      report({ hit: "miss", notes: ["rootDir 不是宣告過的內容樹 ⇒ 直接讀內容樹（CONTENT_DIR=）"] }),
      480,
      {},
    );
    expect(contentCacheHealth().reason).toContain("CONTENT_DIR");
    // ⛔ 而**沒有** note 的 miss 仍然不准留白（那才是「靜默」本身）。
    recordCacheLoad(report({ hit: "miss" }), 480, {});
    expect(contentCacheHealth().reason).toBeTruthy();

    // 命中就 ⛔ 不准留著上一次的藉口。
    recordCacheLoad(report({ hit: "redis" }), 170, {});
    expect(contentCacheHealth()).toMatchObject({ engaged: true, backend: "redis", reason: null });
  });

  it("`/healthz` 真的送這一格出去，而且它 ⛔ 不影響 ok（退回讀內容樹不是不健康）", () => {
    recordUncachedLoad("帶 overlay ⇒ 刻意不走快取", 500, {});
    const before = buildHealthzPayload();
    expect(before.contentCache.reason).toContain("overlay");
    recordCacheLoad(report({ hit: "file" }), 170, {});
    const after = buildHealthzPayload();
    expect(after.contentCache.engaged).toBe(true);
    expect(after.ok).toBe(before.ok); // 這一格翻面，ok ⛔ 不跟著動
  });
});
