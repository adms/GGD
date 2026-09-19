/**
 * 🎟 註冊畫面的邀請碼那一格 —— **後台切選填，玩家要看得到**（GH#1274）。
 *
 * ⭐ 這一條守的是 CLAUDE.md 的「第四個住處是消費端」：
 * 後端已經把必填／選填做成後台一格（`apps/platform/internal/invite/policy.go`），
 * ⛔ 而在此之前畫面上那句話是**寫死的**「內測期間需要邀請碼才能註冊」
 * ⇒ owner 轉了那一格，玩家那邊**一個字都沒變**（＝開關是裝飾）。
 *
 * ⚠️ 這裡只驗**純函式**（`inviteFieldPlan`）。JSX 那三個用點（placeholder／說明／整格不畫）
 * 由 `AuthScreen.tsx` 讀它，⛔ 這條守衛不假裝驗得到 React 的渲染。
 */
import { describe, it, expect } from "vitest";
import { inviteFieldPlan, INVITE_HELP, INVITE_HELP_OPTIONAL } from "./firstOwner";

describe("🎟 邀請碼欄位：必填／選填／不畫（GH#1274）", () => {
  it("★★ 必填 vs 選填：說明與 placeholder 真的不一樣", () => {
    const req = inviteFieldPlan({ inviteCodeSupported: true, inviteCodeRequired: true });
    const opt = inviteFieldPlan({ inviteCodeSupported: true, inviteCodeRequired: false });
    expect([req.show, req.required, req.help], "⛔ 必填模式的樣子變了").toEqual([true, true, INVITE_HELP]);
    expect([opt.show, opt.required, opt.help], "⛔ 切到選填而畫面還寫「需要邀請碼才能註冊」 ⇒ 那一格是裝飾").toEqual([true, false, INVITE_HELP_OPTIONAL]);
    expect(opt.placeholder, "⛔ 選填模式的 placeholder 沒有說可以不填").toContain("可不填");
    expect(req.placeholder, "⛔ 必填模式不該寫「可不填」").not.toContain("可不填");
  });

  it("★★ ⛔ fail-closed：政策讀不到 ⇒ 當成必填（⛔ 不是猜成選填）", () => {
    const unknown = inviteFieldPlan(null);
    expect([unknown.show, unknown.required, unknown.help], "⛔ 讀不到政策卻說可以不填 ⇒ 玩家留白送出，伺服器 403").toEqual([true, true, INVITE_HELP]);
  });

  it("★ 這台沒裝邀請碼系統 ⇒ 整格不畫（⛔ 不是畫一個按了沒用的欄位）", () => {
    expect(inviteFieldPlan({ inviteCodeSupported: false, inviteCodeRequired: false }).show).toBe(false);
  });
});
