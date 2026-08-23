/**
 * ⛔⛔ **對外編輯器契約裡不可以出現系統倍率**（owner 2026-08-23 的裁決）。
 *
 * owner 逐字：
 * > 「編輯器**只編輯原始資料（五級距）**，**根本不需要知道系統倍率**，
 * >  **避免雙重編輯**，而說明裡面的數值**本來就是遊戲主程式動態產生**，
 * >  根本就沒差，整體這樣才會**設計輕量化容易維護**」
 *
 * ── 前身 ──────────────────────────────────────────────────────────────────
 * 2026-08-23 早上抓到 `cooldown-tiers.json` 的 `note` 寫死著「出貨 0.2 ⇒ 單體·極小
 * 6 卡面秒 = **1.2 實際秒**」—— owner 2026-08-22 已把那格轉成 **0.4**（真值 2.4），
 * 而那段 note **就是** `ggd-skill-tiers.md` 的來源 ⇒ 對 Codex 說了差兩倍的謊，
 * 而 `tiers:check` 是**綠的**（產物抄來源，自己跟自己永遠對得上）。第一版因此只驗
 * 「**值**不可以被複述」；owner 的裁決更徹底：**那一整段換算解釋根本不該在契約裡**。
 *
 * ⛔ 掃面只有 `docs/editor-contract/**`。內部程式註解、`docs/平衡錨點量測.md`、
 * 後台欄位說明**不在**掃面 —— 引擎與 owner 自己當然要知道倍率。
 * ⭐ 旋鈕名單**從出貨 config 推導**（`combat-env.json` 的 `multipliers`），⛔ 沒有手抄。
 * ⭐ 先剝 `「…」`（owner 的**逐字原話**，第〇·六守則第 1 層，⛔ 不可改寫）；
 * ⚠️ 但 `combatEnv.<名>` **不吃這個豁免** —— 程式識別字不會是他說出口的話。
 *
 * 突變（2026-08-23）：把「實際等待 = 卡面 × `combatEnv.cooldown`」加回
 * `ggd-skill-tiers.md` → 紅並指名該檔、該行、與要跑哪一支重生成；
 * 把這一輪的刪除套上去模擬重生成後的文字 → 0 命中（⇒ ⛔ 不誤報）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTRACT = join(ROOT, "docs/editor-contract");

/** 紅了要跑哪一支 —— ⛔ 改產物等於沒改（下一次重生成會寫回去）。 */
const REBUILD: Readonly<Record<string, string>> = {
  "ggd-skill-tiers.md": "pnpm tiers:build（§二那幾段 note 的來源是 pnpm anchors:build）",
  "ggd-runtime-capabilities.md": "pnpm caps:export",
  "ggd-runtime-capabilities.json": "pnpm caps:export",
  "ap-damage-scaling.md": "pnpm apdmg:build",
  "ggd-ability-prose.json": "pnpm spec:build",
};

/** 出貨的系統倍率名單（⛔ 不是手抄的）。 */
function multiplierNames(): string[] {
  const raw = JSON.parse(readFileSync(join(ROOT, "content/config/combat-env.json"), "utf8")) as {
    multipliers?: Record<string, number>;
  };
  return Object.keys(raw.multipliers ?? {});
}

/** 「系統倍率」「全域傷害倍率」… —— 這是**詞彙**規則，⛔ 不是一份值的名單。 */
const TERM = /(系統|全域)[^，。\n]{0,8}倍率/;

/** 逐行掃一份契約。回傳「檔:行 —— 為什麼」。 */
export function scanContract(files: readonly { name: string; text: string }[]): string[] {
  const names = multiplierNames();
  const bad: string[] = [];
  for (const { name, text } of files) {
    text.split("\n").forEach((raw, i) => {
      const said = raw.replace(/「[^」]*」/g, ""); // owner 的逐字原話豁免
      const why =
        names.map((n) => `combatEnv.${n}`).find((r) => raw.includes(r)) ??
        TERM.exec(said)?.[0] ??
        names.find((n) => new RegExp("`" + n + "[` ]{0,2}[^`]{0,12}?\\d").test(said));
      if (why !== undefined) {
        bad.push(`${name}:${i + 1} 出現「${why}」 → 拿掉整段，然後跑 ${REBUILD[name] ?? "對應的產生器"}`);
      }
    });
  }
  return bad;
}

describe("編輯器契約只描述原始資料", () => {
  it("⛔ docs/editor-contract 裡一處系統倍率都不可以有", () => {
    const files = readdirSync(CONTRACT).map((name) => ({
      name,
      text: readFileSync(join(CONTRACT, name), "utf8"),
    }));
    // 夾具前提：掃到 0 份 = 這條閘永遠綠（失敗形態③）。
    expect(files.length, "docs/editor-contract 讀不到檔 —— 掃面壞了").toBeGreaterThan(3);
    expect(multiplierNames().length, "combat-env.json 讀不到 multipliers").toBeGreaterThan(10);

    expect(
      scanContract(files),
      "⛔ 編輯器契約裡出現了系統倍率。owner 2026-08-23：「編輯器只編輯原始資料（五級距），" +
        "根本不需要知道系統倍率，避免雙重編輯」⇒ ⭐ 修法是**把那一整段拿掉**，" +
        "⛔ 不是把數字改成新的、⛔ 也不是改成指向 owner-knobs.json 的引用。" +
        "⚠️ 這些檔是**產生的** —— 改**來源**（tools/ 或 content/config/ 的 note）再重生成。",
    ).toEqual([]);
  });
});

