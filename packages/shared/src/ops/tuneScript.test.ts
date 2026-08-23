/**
 * ⚖️ **`scripts/tune.sh` —— 純數值調整的 T0 路。**
 *
 * > owner 2026-08-23：「這一版之後你的純數值調整我一律走 T0 => **寫成 script 吧**」
 *
 * ⚠️ 這一條驗的是**三道 fail-closed 都還在**，⛔ 不是「腳本存在」。
 * 一個會放行 schema 改動的 T0 路，就是 2026-08-02 那次事故的自動化版本：
 * 那天 content 與 schema 都動了，而**只有 content 被送上去** ⇒
 * 舊映像的 Zod 不認得新欄位 ⇒ 內容驗證整份失敗 ⇒ 退回 2 隻骨架英雄，
 * ⭐ **而網站看起來完全正常。**
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "../../../..");
const SH = join(REPO, "scripts/tune.sh");
const code = existsSync(SH) ? readFileSync(SH, "utf8") : "";

describe("scripts/tune.sh", () => {
  it("腳本存在而且是可執行的入口", () => {
    expect(code.length, "找不到 scripts/tune.sh").toBeGreaterThan(500);
    expect(/--content-only/.test(code), "沒有走 --content-only ⇒ 它其實在做全量").toBe(true);
  });

  it("★ ① 只放行 content/config —— 碰到程式或 schema 就必須拒絕", () => {
    // 白名單要在，而且**其餘一律進 OUTSIDE**（`*)` 那一支）。
    expect(/content\/config\/\*\.json\)/.test(code), "沒有把 content/config 列成白名單").toBe(true);
    expect(
      /\*\)\s*OUTSIDE\+=/.test(code),
      "沒有『其餘一律出局』那一支 —— 那就不是 fail-closed，是 fail-open。",
    ).toBe(true);
    expect(
      /pnpm ship/.test(code),
      "拒絕之後沒有指出正確的路（全量 `pnpm ship`）—— 一個只會說不的閘會被繞過。",
    ).toBe(true);
  });

  it("★ ② 嚴格 Zod 要跑，而且失敗要 die", () => {
    expect(/content:build/.test(code)).toBe(true);
    expect(
      /content:build[\s\S]{0,400}die "內容驗證失敗/.test(code),
      "content:build 失敗沒有 die —— 界外的值就會被放上線。",
    ).toBe(true);
  });

  it("★ ③ 動到 owner 的旋鈕就要驗授權表", () => {
    expect(/combat-env\|owner-knobs\|base-bonus/.test(code)).toBe(true);
    expect(
      /ownerKnobs\.test\.ts/.test(code),
      "沒有跑 owner-knobs 的閘 —— 引用不到他原話的格子就會被改（第一守則）。",
    ).toBe(true);
  });

  it("⛔ 不可以在 T0 路上跑 typecheck / 七包 vitest（那就沒有省到）", () => {
    // ⭐ 反方向的守衛：這條路的價值就是**不跑**那兩樣。
    expect(/pnpm -s typecheck|pnpm typecheck/.test(code), "T0 路跑了 typecheck").toBe(false);
    expect(/vitest run --root apps\//.test(code), "T0 路跑了 apps 的 vitest").toBe(false);
  });
});
