import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⭐⭐ **「編輯器必須實作什麼」這份清單不可以過期。**
 *
 * owner 2026-08-30：「讓**分工明確有效率又安全**」。
 *
 * ⚠️ ⭐ 而 2026-08-30 量到的問題正是分工的接縫爛掉：
 * 外部編輯器（`feat/ability-review-authoring`）落後 main **1,186 個 commit**，
 * 涵蓋率差 **+149 項** —— ⛔ 而**沒有任何東西會說**。
 *
 * ⇒ ⭐ `docs/editor-contract/ggd-editor-coverage.json` 是那份清單，
 *   而它**從出貨註冊表推導**（⛔ 不是手寫）：
 *   引擎長出一個新機制 ⇒ 這一份自動變長 ⇒ 編輯器那邊的閘自動變紅。
 *
 * ⛔⛔ **更正（2026-08-31）**：這裡原本寫「`apps/editor` 不在 main 上」——
 * ⭐ **那是假的**：`git ls-files apps/editor/` = **78 個檔**、**17 支測試**、在 pnpm workspace 裡。
 * ⇒ ⭐ 涵蓋率閘**今天就寫得在 main 上**，⛔ 而我因為那個假前提把它外包出去了。
 * ⚠️ ⭐ 而同一句假前提**同時活在文件與這個註解裡** —— 第三守則的形狀：
 *   一句過期的散文活過了它的保存期限，⛔ 而沒有任何東西變紅。
 *
 * ⛔ 這條閘不驗編輯器 ——
 *   一條讀不到它的測試會是一條**永遠不會紅的閘**（失敗形態⑨）。
 *   ⇒ 這一邊只保證「清單與契約同步」；那一邊（Codex）讀它並驗自己實作了幾項。
 */

const REPO = join(import.meta.dirname, "../../../..");
const OUT = join(REPO, "docs/editor-contract/ggd-editor-coverage.json");

describe("編輯器涵蓋率清單不可能過期（owner 2026-08-30「分工明確」）", () => {
  it("⭐ 量尺先自證：清單存在、而且真的有內容", () => {
    expect(existsSync(OUT), "ggd-editor-coverage.json 不見了 —— 跑 pnpm editorcov:build").toBe(true);
    const d = JSON.parse(readFileSync(OUT, "utf8")) as {
      required: unknown[];
      notRequired: unknown[];
      counts: Record<string, number>;
    };
    // ⛔ 掃到 0 項 ＝ 這條閘在空轉
    expect(d.required.length, "清單是空的 ⇒ 推導壞了，⛔ 不是「引擎沒有機制」").toBeGreaterThan(100);
    // ⭐ 反方向：unsupported 那一族**刻意不必實作**，而它要有理由
    for (const n of d.notRequired as { name: string; why: string }[]) {
      expect(n.why.length, `${n.name} 的「為什麼不必實作」是空的`).toBeGreaterThan(4);
    }
    // ⭐ 每一個 group 都要有東西（⛔ 少一個 group ＝ 推導漏了一整類）
    for (const g of ["effectKind", "effectField", "hookEvent", "abilityField", "auraField", "templateFamily"]) {
      expect(d.counts[g], `group「${g}」是 0 ⇒ 推導漏了一整類`).toBeGreaterThan(0);
    }
  });

  it("★ 清單與出貨註冊表逐位元組同步", () => {
    let out = "";
    let code = 0;
    try {
      out = execFileSync("npx", ["tsx", "tools/editor-contract/gen_editor_coverage.ts", "--check"], {
        cwd: REPO,
        encoding: "utf8",
        timeout: 120_000,
      });
    } catch (e) {
      const err = e as { status?: number; stderr?: string; stdout?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(
      code,
      [
        "⛔ 編輯器涵蓋率清單過期了 —— ⭐ 這代表引擎長出了新機制而清單沒跟上。",
        "   跑：pnpm editorcov:build && git add docs/editor-contract/",
        "   ⚠️ ⛔ 不要手改那份 JSON（第〇·四守則：它從出貨註冊表推導）。",
        "",
        out.slice(0, 600),
      ].join("\n"),
    ).toBe(0);
  });
});
