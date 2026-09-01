/**
 * ⭐⭐ **兩份 receipt 不可以說相反的話**。
 *
 * ── ⛔ 量到的（2026-09-02）─────────────────────────────────────────────────
 * 同一件事，兩份 profile 說了**相反**的話 **17 天**：
 *
 * | 誰 | 對 `compiler` 說什麼 |
 * |---|---|
 * | 靜態（正式站 `/content/editor-target-profile.json`） | ⭐「owner 2026-08-15 裁決：**砍掉**編譯器那一層」 |
 * | runtime（`/api/v1/content-import/active/target-profile`） | ⛔「compiler **尚未實作**」 |
 *
 * ⇒ ⭐ 那兩句話讓外部編輯器做**相反**的事：
 *   「尚未實作」＝**等**你做完再說 · 「不會有」＝**現在**就照 `ability@1` 直出。
 *
 * ⚠️ 而 owner 2026-08-15 的 commit 訊息已經逐字警告過同一個形狀：
 * 「⛔ 不可以因為『看起來比較完整』留著指紋 —— 一個宣稱存在的編譯器合約會讓對方
 *  去實作重編比對，⋯於是他們每一包都比對失敗，而失敗訊息看起來像格式問題。」
 *
 * MUTATION LOG（落地前跑過）：
 *   · runtime 的 `authoringModel` 拿掉 → 🔴（②：兩份的 accepts 對不上）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTargetProfile } from "./targetProfile";

const ROOT = resolve(__dirname, "../../../../..");
const STATIC = JSON.parse(
  readFileSync(resolve(ROOT, "content/editor-target-profile.json"), "utf8"),
) as Record<string, unknown>;

const runtime = buildTargetProfile({
  generatedAt: "2026-09-02T00:00:00.000Z",
  gameVersion: null,
  content: null,
});

describe("⭐ 靜態 profile 與 runtime profile 對同一件事的說法", () => {
  it("★★ ⭐ **編譯器那一層**：兩份都說「不會有」（⛔ 不是一份說『還沒做』）", () => {
    const s = STATIC["authoringModel"] as { accepts?: string[]; notRequired?: string[] } | undefined;
    expect(s, "⛔ 靜態 profile 沒有 authoringModel（它從 2026-08-15 起就該有）").toBeDefined();
    expect(
      runtime.authoringModel.accepts,
      "⛔⛔ runtime profile 與靜態 profile 對「編輯器該產什麼」說法不同 ⇒ 對面會做相反的事",
    ).toEqual(s?.accepts);
    expect(runtime.authoringModel.notRequired).toEqual(s?.notRequired);
    // ⭐ 兩份都必須明說「不需要 expectedCompiled」——⛔ 那是四層模型的核心產物。
    expect(runtime.authoringModel.notRequired).toContain("expectedCompiled");
  });

  it("⭐ `compiler` 兩格仍然是 null —— 而理由**不可以**再寫「尚未實作」", () => {
    expect(runtime.compiler).toEqual({ contractVersion: null, fingerprint: null });
    const reason =
      runtime.unavailable.find((u) => u.field.startsWith("compiler."))?.reason ?? "";
    expect(reason, "⛔ 一個 null 沒有出處，跟「忘了填」長得一模一樣").not.toBe("");
    expect(
      reason.includes("尚未實作"),
      "⛔⛔ 理由仍然寫著「尚未實作」—— 而 owner 2026-08-15 裁決的是「**這條路上不會有編譯器**」。\n" +
        "⭐ 兩者讓對面做相反的事：等 vs 直出。",
    ).toBe(false);
    expect(reason).toContain("砍掉");
  });
});
