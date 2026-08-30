import { describe, expect, it } from "vitest";
import { contentSha256, SHA256_PREFIX } from "./jcs";
import { zSha256Hex, zDigest } from "./packageSchema";
import { packageDigest } from "./digest";

/**
 * ⭐⭐ **產生端的輸出，驗證端要收得下去。**
 *
 * ── ⛔ 2026-08-31 之前它是壞的 ────────────────────────────────────────
 * ```
 * contentSha256({...})          ⇒ "sha256:9420d195be4a…"   （jcs.ts:104）
 * zSha256Hex.safeParse(那個值)   ⇒ 🔴 **拒**                （packageSchema.ts:58）
 * ```
 * ⭐ 而**兩邊的檔頭都逐字說自己照著「規格 §1」**。
 *
 * ⇒ ⚠️ ⭐ 這是「**配對式後置條件**」那一族（CLAUDE.md 記過的 2026-08-02 事故同型）：
 * 兩個名詞**各自都對**，⛔ 而它們的**關係**是壞的 ——
 * ⭐ 而 main 在此之前**沒有任何一條測試問那個關係**。
 *
 * ⚠️ ⭐ 而它為什麼一直沒被發現：既有的測試都是**單邊**的
 * （`jcs.test.ts` 只驗產生端的決定性；`packageSchema.test.ts` 用自己編的夾具
 * `"a".repeat(64)` 只驗某一格的錯誤路徑）——
 * ⛔ **沒有一條把產生端的輸出餵給驗證端。**
 *
 * ⇒ ⭐ 這條閘就做那一件事，⛔ 不做別的。
 */

describe("sha256 wire format：產生端 ↔ 驗證端", () => {
  it("⭐ 量尺先自證：產生端真的產得出東西，而且是決定性的", () => {
    const a = contentSha256({ id: "x", schema: "ability@1" });
    expect(a).toBe(contentSha256({ id: "x", schema: "ability@1" }));
    expect(a.startsWith(SHA256_PREFIX), "產生端不再帶前綴了？那這條閘要跟著改").toBe(true);
    // ⭐ 反方向：不同輸入⛔不可以算出同一個值
    expect(a).not.toBe(contentSha256({ id: "y", schema: "ability@1" }));
  });

  it("★ `contentSha256()` 的輸出，`zSha256Hex` 收得下去", () => {
    for (const doc of [
      { id: "godie-e001.q", schema: "ability@1" },
      { nested: { a: [1, 2, { b: "x" }] } },
      {},
    ]) {
      const produced = contentSha256(doc);
      const r = zSha256Hex.safeParse(produced);
      expect(
        r.success,
        [
          "⛔⛔ **產生端的輸出過不了自己的驗證器。**",
          `   產生端給的：${produced}`,
          `   驗證端說  ：${r.success ? "" : r.error.issues.map((i) => i.message).join(" · ")}`,
          "",
          "⚠️ ⭐ 兩個名詞各自都對，⛔ 而它們的**關係**是壞的",
          "   —— 而那正是 2026-08-02 生產故障的形狀（配對式後置條件）。",
        ].join("\n"),
      ).toBe(true);
    }
  });

  it("★ `packageDigest()` 的輸出，`zDigest` 也收得下去", () => {
    const d = packageDigest({ schema: "x", generatedAt: "2026-01-01T00:00:00Z" });
    expect(zDigest.safeParse(d).success, `⛔ packageDigest 給的 ${d} 過不了 zDigest`).toBe(true);
  });

  it("⛔ 反方向：裸 hex（沒有前綴）**不可以**被 `zSha256Hex` 收下", () => {
    // ⭐ 這一條釘住的是「為什麼要統一」：exact ref 是**字串相等**比對，
    //   ⇒ ⛔ 收兩種拼法等於同一份內容有兩個 id（第〇·四守則的第二個住處）。
    expect(zSha256Hex.safeParse("a".repeat(64)).success).toBe(false);
    expect(zSha256Hex.safeParse("SHA256:" + "a".repeat(64)).success, "⛔ 大寫前綴不該收").toBe(false);
    expect(zSha256Hex.safeParse("sha256:" + "A".repeat(64)).success, "⛔ 大寫 hex 不該收").toBe(false);
  });
});
