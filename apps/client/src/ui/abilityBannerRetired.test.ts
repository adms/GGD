/**
 * ⛔⛔ **技能說明橫幅已經退休 —— 它不可以再回來。**
 *
 * ⭐ owner 2026-08-22（他回報了**兩次**，第二次標「緊急插件改完立即上架」）：
 *
 * > 「戰鬥回合按下QWER出現技能說明**遮住戰鬥畫面** 你說修掉了 **但其實沒有**」
 * > 「**根本不需要顯示那麼大的技能說明區塊，請你移除這個功能到 legacy 不要再出現了**」
 *
 * ── 第一次為什麼沒修掉（root cause）────────────────────────────────────────
 * 我 grep 了 `setHeldAbility` 的呼叫點，⛔ **而我加了 `head -10`** ——
 * 輸出被 `TouchControls` 那一串佔滿，於是我看不到
 * `input/InputCapture.ts`（**鍵盤 QWER**）與 `input/GamepadInput.ts`（手把），
 * 就下了「鍵盤沒有走這條路」的結論。⭐ owner 用的正是鍵盤。
 * ⇒ **一個被截斷的 grep 產生了一個自信的錯誤結論**，而那一版還通過了全套測試
 *   （因為我寫的守衛只驗我改到的那兩條路）。
 *
 * ── 這條守衛驗什麼 ────────────────────────────────────────────────────────
 * ⭐ 它**不驗某幾個檔**（那正是上次失敗的形狀）——
 *   它驗「**整個 client 樹上沒有任何東西把那個面板掛回去**」。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLIENT_SRC = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("技能說明橫幅已退休 (owner 2026-08-22)", () => {
  const files = walk(CLIENT_SRC);

  it("⛔ 出貨樹上沒有任何檔案引用 `AbilityDescriptionOverlay`", () => {
    // ⭐ 只算**真的把它接回去**的兩種形狀：import 與 JSX。
    // ⛔ 不算註解 —— 記錄「它為什麼退休」的那幾行是有價值的（第三守則的反面：
    //    一段說明退休原因的註解，正是下一個人不會把它加回來的理由）。
    const LIVE = /(?:import[^\n]*AbilityDescriptionOverlay|<AbilityDescriptionOverlay)/;
    const refs = files
      .filter((p) => LIVE.test(readFileSync(p, "utf-8")))
      .map((p) => p.slice(CLIENT_SRC.length + 1));
    expect(
      refs,
      "⛔ 那個面板 owner 明說「移除到 legacy **不要再出現了**」。\n" +
        "  ⭐ 退休的元件另存在 `docs/legacy/_retired-ui/`（第一·五守則：另存，⛔ 不是刪除）。\n" +
        "  ⚠️ 技能說明**沒有消失** —— 技能格 tooltip / 選人畫面 / 後台都還讀 `describeHeldAbility()`。",
    ).toEqual([]);
  });

  it("⭐ 沒有任何按下入口再用 `\"full\"` 這個 intent —— 它現在沒有消費端", () => {
    const offenders: string[] = [];
    for (const p of files) {
      if (p.endsWith("abilityHold.ts")) continue; // 型別定義處
      const src = readFileSync(p, "utf-8");
      for (const line of src.split("\n")) {
        // ⛔ 只看**真的一行程式**，不看註解（`//` 開頭或含 `*` 的 JSDoc 行）。
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
        if (/setHeldAbility\([^)]*"full"/.test(t)) {
          offenders.push(`${p.slice(CLIENT_SRC.length + 1)}: ${t}`);
        }
      }
    }
    expect(
      offenders,
      "⛔ `\"full\"` 是那個退休面板的 intent —— 現在沒有東西讀它，" +
        "留著只會讓下一個人以為它還有作用（第一·五守則）。",
    ).toEqual([]);
  });

  it("⛔ 兩格指向那個面板的後台欄位也不可以留著（說了但不會發生）", () => {
    // 同上 —— ⛔ 只算真的一行程式（`xxx: bool(...)` / `cfg.xxxOpensBanner`）。
    const dead = files
      .filter((p) =>
        readFileSync(p, "utf-8")
          .split("\n")
          .some((l) => {
            const t = l.trim();
            if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return false;
            return /OpensBanner/.test(t);
          }),
      )
      .map((p) => p.slice(CLIENT_SRC.length + 1));
    expect(
      dead,
      "`hoverOpensBanner` / `pressOpensBanner` 指向的面板已經不存在 ⇒ " +
        "留著就是一格「後台存得起來、遊戲裡什麼都不會發生」的欄位。",
    ).toEqual([]);
  });
});
