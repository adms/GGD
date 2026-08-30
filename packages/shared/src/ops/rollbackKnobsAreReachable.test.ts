import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **一格轉不到的旋鈕，不是 rollback 開關 —— 它只是一個 `export`。**
 *
 * owner 的常設指令（逐字）：
 * > 「別問我了自己判斷 **但是留後台開關可以簡易 rollback**」
 *
 * ⭐ 「留開關」是那條指令**唯一**能成立的理由：
 * 我挑錯的成本必須是「他改一格下拉選單」，⛔ 不是「一次 PR ＋ 重跑全套 ＋ 一次部署」。
 *
 * ── ⭐ 2026-08-30 量到的實例（GH#873）─────────────────────────────────────
 * 一條 lane 回報「開關 `goldLevelTouchLayout`（預設 `strip`）滿足 AC3」。
 * ⛔ 而複驗量到 `applyHudClusterOverride` 的**生產呼叫端是 0**
 * （只有它自己的定義、文件註解與測試），而 `content/config/` 底下**沒有 hud 的 JSON**。
 * ⇒ ⭐ 欄位在、函式在、測試在 —— ⛔ **而後台改它版面不會動**（失敗形態⑧）。
 *
 * ⭐ 這條閘問的是**兩個名詞的關係**（⛔ 不是「函式在不在」）：
 * 「**每一個 `content/config/*.json`，客戶端有沒有一行程式碼真的把它讀進去？**」
 *
 * ⚠️ ⭐ 它刻意只掃**客戶端有消費端**的那一族 —— 有些 config 是 sim／server／工具讀的，
 * ⛔ 對它們問「客戶端讀不讀」是錯的問題。⇒ 豁免表帶理由。
 */

const REPO = join(import.meta.dirname, "../../../..");
const CFG = join(REPO, "content/config");

/** ⭐ 客戶端不讀它 —— 每一格要寫得出**誰**讀它。⛔ 「還沒接」不是理由。 */
const NOT_CLIENT_SIDE: Record<string, string> = {};

/** 這一族由本檔守：客戶端 `ContentDb.load()` 必須有一行把它讀進去。 */
const CLIENT_CONSUMED = ["hud-layout"] as const;

const clientSrc = (): string => {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!e.name.endsWith(".ts") && !e.name.endsWith(".tsx")) continue;
      if (e.name.includes(".test.")) continue;
      out.push(readFileSync(p, "utf8"));
    }
  };
  walk(join(REPO, "apps/client/src"));
  return out.join("\n");
};

describe("rollback 旋鈕要真的轉得到（owner 常設指令）", () => {
  it("⭐ 量尺先自證：讀得到客戶端原始碼，且抓得到／抓不到分得開", () => {
    const src = clientSrc();
    expect(src.length, "讀不到 apps/client/src —— 路徑過期").toBeGreaterThan(100_000);
    // ⭐ 正方向：一個真的被讀的 config 抓得到
    expect(src.includes("config.gore@1")).toBe(true);
    // ⭐ 反方向：一個不存在的 tag ⛔ 抓不到
    expect(src.includes("config.this-does-not-exist@1")).toBe(false);
  });

  it("★ 每一格宣告「客戶端會讀」的 config，客戶端真的有一行讀它", () => {
    const src = clientSrc();
    const dead: string[] = [];
    for (const id of CLIENT_CONSUMED) {
      if (id in NOT_CLIENT_SIDE) continue;
      const file = join(CFG, `${id}.json`);
      if (!existsSync(file)) {
        dead.push(`${id}：⛔ content/config/${id}.json 不存在`);
        continue;
      }
      const tag = (JSON.parse(readFileSync(file, "utf8")) as { schema?: string }).schema ?? "";
      // ⭐ 驗的是**兩個**：讀得到那份文件 **且** 有東西消費它
      if (!src.includes(tag)) dead.push(`${id}：客戶端沒有一行提到 \`${tag}\``);
      else if (!src.includes(`"${id}"`)) dead.push(`${id}：有 schema tag，⛔ 而沒有一行用 id \`${id}\` 去讀它`);
    }

    expect(
      dead,
      [
        "⛔⛔ 這幾格旋鈕**轉不到** —— 欄位在、後台改得動，⛔ 而客戶端不會讀：",
        ...dead.map((d) => `   · ${d}`),
        "",
        "⭐ owner 常設指令：「別問我了自己判斷 **但是留後台開關可以簡易 rollback**」",
        "   ⇒ ⭐ 一格轉不到的旋鈕**不是 rollback 開關**，它只是一個 `export`。",
        "",
        "⭐ 修法：在 `apps/client/src/content/ContentDb.ts` 的 `load()` 裡加一行",
        "   `applyXxxDoc(this.configDoc<T>(\"<id>\", \"<schema tag>\"))`",
        "   （形狀照 `applyGoreDoc` / `applyStealthDoc`）。",
        "",
        "⚠️ ⭐ 而 2026-08-30 的實例（GH#873）正是這個形狀：",
        "   `applyHudClusterOverride` 的生產呼叫端是 **0**，",
        "   ⛔ 而三條測試、一張欄位表、一份文件註解全部都在 —— 它們**全部是綠的**。",
      ].join("\n"),
    ).toEqual([]);
  });
});
