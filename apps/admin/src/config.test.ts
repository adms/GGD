/** adminui-hub-config: hub link resolution — dev localhost defaults, PROD
 * same-origin preset, and VITE_* overrides winning over both. */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { isLoopbackHost, resolveHubLinks, resolveReplayClientBase } from "./config";

function byKey(links: ReturnType<typeof resolveHubLinks>, key: string) {
  const l = links.find((x) => x.key === key);
  if (!l) throw new Error(`no link ${key}`);
  return l;
}

describe("hub config (adminui-hub-config)", () => {
  it("dev defaults point at localhost dev servers", () => {
    cover("adminui-hub-config");
    const links = resolveHubLinks({}, "dev");
    expect(byKey(links, "client").url).toBe("http://localhost:39527");
    expect(byKey(links, "editor").url).toBe("http://127.0.0.1:5174/editor/");
    expect(byKey(links, "api").healthUrl).toBe("http://localhost:8080/v1/healthz");
    // content-api card exists in dev (has a default URL)
    expect(links.some((l) => l.key === "contentApi")).toBe(true);
  });

  it("PROD preset collapses to same-origin paths and hides content-api", () => {
    cover("adminui-hub-config");
    const links = resolveHubLinks({}, "prod");
    expect(byKey(links, "client").url).toBe("/");
    expect(byKey(links, "editor").url).toBe("/editor/");
    expect(byKey(links, "admin").url).toBe("/admin/");
    expect(byKey(links, "api").healthUrl).toBe("/api/v1/healthz");
    // content-api is dev-only → no card in prod
    expect(links.some((l) => l.key === "contentApi")).toBe(false);
  });

  it("explicit VITE_* env overrides the preset", () => {
    cover("adminui-hub-config");
    const links = resolveHubLinks({ VITE_CLIENT_URL: "https://play.ggd.gg", VITE_PLATFORM_API_URL: "https://api.ggd.gg" }, "prod");
    expect(byKey(links, "client").url).toBe("https://play.ggd.gg");
    expect(byKey(links, "api").url).toBe("https://api.ggd.gg/v1/healthz");
  });
});

/**
 * GH#496 —— 「後台 戰鬥回放 出現的是 localhost 無法觀看」(owner 2026-08-21)
 *
 * 被測的是**兩個名詞的關係**：「回放連結指向本機」單獨看不是錯的（開發機上那正是
 * 對的），錯的是「**後台自己不在本機、連結卻指向本機**」。只驗其中一半的檢查在
 * 這個故障面前必然是綠的 —— 那是 2026-08-02 四項後置條件全綠而網站不能玩的形狀。
 *
 * ── 突變（做過）────────────────────────────────────────────────────────────
 * `resolveReplayClientBase` 把 `isProd ? "prod" : "dev"` 改回不傳（用預設 "dev"）
 * → 第一條紅，訊息就是 owner 看到的那個 localhost 網址。
 */
describe("回放連結不可以在正式站退回 localhost (adminui-hub-config)", () => {
  const PROD_HREF = "https://ggd.adms.ai/admin/";

  it("⭐ 正式站（PROD）拿到的是同源網址，不是 localhost，而且不喊警告", () => {
    cover("adminui-hub-config");
    const r = resolveReplayClientBase({ PROD: "true" }, true, PROD_HREF);
    expect(new URL(r.url, PROD_HREF).hostname, "回放連結在正式站上指向本機").toBe("ggd.adms.ai");
    expect(r.warning, "正確的設定不可以喊假警報").toBeNull();
  });

  it("⭐ fail-loud：真的退回本機時，`warning` 非 null（畫面上是紅字，⛔ 不是 console）", () => {
    cover("adminui-hub-config");
    // 「有人把 VITE_CLIENT_URL 設成本機」是這個故障的另一半成因，而 PROD preset
    // 修不了它 —— 顯式 env 永遠贏。所以偵測必須看**結果**，不是看有沒有走 preset。
    const r = resolveReplayClientBase({ VITE_CLIENT_URL: "http://localhost:39527" }, true, PROD_HREF);
    expect(r.warning, "線上退回 localhost 卻沒有任何東西喊 —— 這就是 #496").not.toBeNull();
    expect(r.warning).toContain("ggd.adms.ai");
    expect(r.url).toContain("localhost");
  });

  it("開發機上 localhost 是對的，⛔ 不可以喊警告（假警報比沒有警報更糟）", () => {
    cover("adminui-hub-config");
    expect(resolveReplayClientBase({}, false, "http://127.0.0.1:60721/admin/").warning).toBeNull();
  });

  it("認得 loopback 的每一種寫法（0.0.0.0 / ::1 / 127.x 都不是可分享的網址）", () => {
    cover("adminui-hub-config");
    for (const h of ["localhost", "127.0.0.1", "127.1.2.3", "0.0.0.0", "::1"]) {
      expect(isLoopbackHost(h), `${h} 應該算本機`).toBe(true);
    }
    expect(isLoopbackHost("ggd.adms.ai")).toBe(false);
  });
});
