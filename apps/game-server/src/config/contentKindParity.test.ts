import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONTENT_KINDS } from "./contentBus";

/**
 * ⭐⭐ GH#736 —— **Go 端 publish 的 kind ↔ TS 端認得的 kind**。
 *
 * ⚠️ ⭐ 這是**兩個名詞的關係**，⛔ 不是任何一邊自己：
 * 兩邊各自都「對」——Go 端有 `ContentKindContentOverlay`、TS 端有一張 `CONTENT_KINDS`——
 * ⛔ 而它們**對不上**的時候沒有任何東西會紅。
 *
 * ── 量到的（2026-08-31）────────────────────────────────────────────────────
 * Go 端 `redisx/contentbus.go:64` 從很久以前就在 publish `"content-overlay"`，
 * ⛔ 而 TS 端的 `CONTENT_KINDS` 只有三項 ⇒ ⭐ **每一則公告都掉進 `unknownKinds`**。
 * ⚠️ 好消息是它**不是靜默丟掉**（會上 `/healthz`），
 * ⭐ 壞消息是讀 `/healthz` 的人看到的是「版本歪了」，而真相是「**這一台知道有東西
 * 變了，而它做不到**」——⭐ 兩者要分得出來，這條閘就是那個分界。
 *
 * ⛔ **這條閘只驗名字對得上，⛔ 不驗「熱載真的發生了」** —— 後者的誠實答案寫在
 * `defaultRefreshers["content-overlay"]` 的 `consequence` 裡（`ok: false`）。
 */
describe("GH#736 內容匯流排的 kind 對帳", () => {
  const go = readFileSync(
    resolve(__dirname, "../../../platform/internal/data/redisx/contentbus.go"),
    "utf8",
  );

  /** Go 端宣告的每一個 kind 字面值。 */
  const goKinds = [...go.matchAll(/ContentKind\w+\s*=\s*"([a-z-]+)"/g)].map((m) => m[1]!);

  it("量尺先自證：切得到 Go 端的宣告（⛔ 解析壞了下面會空過）", () => {
    expect(goKinds.length).toBeGreaterThanOrEqual(3);
    expect(goKinds).toContain("curation");
  });

  it("★ ⭐ Go 端 publish 的每一個 kind，TS 端**都認得**", () => {
    const missing = goKinds.filter((k) => !(CONTENT_KINDS as readonly string[]).includes(k));
    expect(
      missing,
      `⛔ Go 端在 publish 這幾個 kind，而 game-server **不認得**：${missing.join(", ")}\n` +
        `⚠️ 症狀不是錯誤 —— 是它們掉進 \`unknownKinds\`，而 /healthz 讀起來像「版本歪了」。`,
    ).toEqual([]);
  });

  it("⭐ 反方向：TS 端認得的每一個，Go 端**真的會 publish**（⛔ 否則是一格死旋鈕）", () => {
    const orphan = (CONTENT_KINDS as readonly string[]).filter((k) => !goKinds.includes(k));
    expect(
      orphan,
      `⛔ 這幾個 kind 只有 TS 端有 —— 沒有人會 publish 它們：${orphan.join(", ")}`,
    ).toEqual([]);
  });
});
