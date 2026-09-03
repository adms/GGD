/**
 * ⭐⭐ **帳號在輸入端就被正規化，而正則兩邊仍是鏡像**（GH#952）。
 *
 * owner 2026-09-02 附圖：帳號欄輸入 `MR57`，紅字
 * 「3-24 chars: lowercase letters, digits, _ or -; must start with a letter or digit」。
 *
 * ⭐⭐ **而拒絕大寫換不到任何東西**：伺服器的帳號索引本來就把大小寫視為同一個
 * （`account.go` 的 `indexKey()` ⇒ `strings.ToLower`，`reindex.go` / `boot.go` 同樣）
 * ⇒ `MR57` 與 `mr57` **在儲存層早就是同一個帳號**
 * ⇒ ⭐ 在輸入端擋掉大寫**沒有換到唯一性、沒有換到安全性**，⛔ 只換到一次註冊失敗。
 *
 * ⚠️ ⭐ **這一支同時守住「⛔ 不要順手放寬正則」**：
 * client 的 `USERNAME_RE` 是 server `usernameRe` 的**鏡像**（`validation.ts` 檔頭逐字
 * "mirrors the backend rules exactly"）。⛔ 放寬其中一邊 = 第二個住處
 * ⇒ 前端放行、後端拒絕，而玩家看到的是一個**沒有訊息**的失敗。
 * ⇒ ⭐ 所以第 3 條**真的去讀那支 go 檔**。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `normaliseUsername` 的 `.toLowerCase()` 拿掉 → 🔴 ①逐字「MR57 沒有被轉成小寫」
 * M2 `USERNAME_RE` 加上 `A-Z`（＝順手放寬）→ 🔴 ③「兩邊的正則不再是鏡像」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normaliseUsername, validateUsername, USERNAME_RE } from "./validation";

const REPO = join(__dirname, "../../../../..");

describe("註冊表單的輸入正規化（GH#952）", () => {
  it("★★ ⭐ owner 打的那一個（`MR57`）現在**通得過**", () => {
    const typed = "MR57";
    expect(
      validateUsername(typed),
      "⛔ 直接驗原字串會被擋 —— 這就是 owner 撞到的那一下",
    ).not.toBeNull();
    const n = normaliseUsername(typed);
    expect(n, "⛔ `MR57` 沒有被轉成小寫").toBe("mr57");
    expect(validateUsername(n), "⛔ 正規化之後還是被擋 —— 那正規化就沒有意義").toBeNull();
  });

  it("⭐ 前後空白也一起收掉（⛔ 一個看不見的空白 = 一次看不懂的失敗）", () => {
    expect(normaliseUsername("  Mr57 \n")).toBe("mr57");
  });

  it("★★ ⭐⭐ 正則仍是 server 的**鏡像**（⛔ 不可以順手放寬其中一邊）", () => {
    const go = readFileSync(join(REPO, "apps/platform/internal/auth/service.go"), "utf8");
    const m = /usernameRe\s*=\s*regexp\.MustCompile\(`([^`]+)`\)/.exec(go);
    expect(m, "⛔ 找不到 server 的 `usernameRe` —— 鏡像關係驗不了了").toBeTruthy();
    expect(
      USERNAME_RE.source,
      "⛔⛔ 兩邊的正則不再是鏡像 ⇒ 前端放行、後端拒絕，\n" +
        "  ⭐ 而玩家看到的是一個**沒有訊息**的失敗。\n" +
        "  ⇒ 要放寬就**兩邊一起**，⛔ 不是在這裡偷偷改一邊。",
    ).toBe(m![1]);
  });

  it("⭐ 訊息是中文的（⛔ 玩家看到的第一個畫面不該是英文紅字）", () => {
    const msg = validateUsername("A");
    expect(msg, "⛔ 太短的帳號應該要有訊息").toBeTruthy();
    expect(
      /[一-鿿]/u.test(msg!),
      `⛔ 帳號的錯誤訊息還是英文：「${msg}」`,
    ).toBe(true);
  });

  it("⭐ 反方向：真的**違規**的還是要被擋（⛔ 正規化不是放行）", () => {
    expect(normaliseUsername("ab"), "兩個字轉小寫還是兩個字").toBe("ab");
    expect(validateUsername(normaliseUsername("ab")), "⛔ 長度不足竟然放行了").not.toBeNull();
    expect(
      validateUsername(normaliseUsername("_lead")),
      "⛔ 開頭不是英數竟然放行了",
    ).not.toBeNull();
  });
});
