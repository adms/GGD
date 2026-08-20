/**
 * ⛔ **描述現況的文件裡不可以出現已經被取代的級距數字。**
 *
 * ── 為什麼要這一條 ──────────────────────────────────────────────────────────
 * 傷害五級距在 2026-08-19 → 08-21 三天內重錨了**三次**：
 *
 *   500/1250/2500/3750/5000  （錨 Lv18，用中位**有效**血量 9048）
 *   1150/2875/5750/8625/11500（錨 LV50，用混合量 3442 回乘 ⇒ +16.5%）
 *   600/1500/3000/4500/6000  （錨 LV30 hard limit，純基礎中位，母體 49 位可選本體）
 *
 * 每一次重錨，散文裡那五個數字就地變成謊話 —— 而 `content:build`、`spec:check`、
 * 全套測試**全部是綠的**，因為那些閘看的是產生器與 schema，⛔ 沒有一個在讀散文。
 * 2026-08-21 實際量到：Codex 契約的檔頭還貼著 `1150/2875/5750/8625/11500`，
 * 而那份文件的用途就是「外部編輯器照著抄」。
 *
 * ⇒ 這一條把「散文」也關進閘裡。⛔ 它不是判準（「要記得一起改」已經失效四次）。
 *
 * ── 這條守衛驗的是「機制」，⛔ 不是「數字」 ────────────────────────────────
 * 它**不知道**出貨值是多少，也**不該**知道 —— 出貨值住 `content/config/*-tiers.json`
 * ＋ Zod `DEFAULT_*` ＋ admin `SHIPPED_*`，三者之間已經有 drift 測試在守。
 * 這裡只列**已經死掉的**那些數字：它們是歷史常數，⛔ 永遠不會再變成合法值，
 * 所以把它們寫在測試裡沒有「第四個住處」的問題。
 *
 * ⚠️ 名單是**具名**的（`LIVE_DOCS`），⛔ 不是掃整棵 docs/：
 *   · `docs/_daily/**`、`docs/legacy/**`、`docs/_release/**` 是**當時的紀錄**，
 *     改它們就是竄改歷史（owner 的規矩：測試可以跟著設計走，知識不可以無聲消失）。
 *   · `*_temp_*` 是某一次稽核的快照，裡面**引用舊數字是它的工作**。
 *
 * ⚠️ 紅了**不要改這條測試**，去把那份文件的數字換掉 —— 或者，如果那一段本來就是在
 * 講「舊版是什麼」，把它搬進 `docs/legacy/` 或標成 `_temp_` 快照。
 *
 * 突變紀錄（2026-08-21）：
 *   · 在 `README.md` 的級距節塞回一行「傷害五級距 1150/2875/5750/8625/11500」→ 紅，
 *     訊息指名 README.md、行號、以及那個數字被誰取代 ✅
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * **描述現況**的文件 —— 這些必須跟 HEAD 的級距一致。
 * ⛔ 歷史帳本（`docs/_daily/`）、退休區（`docs/legacy/`）、版本 note（`docs/_release/`）
 * 與 `_temp_` 稽核快照**刻意不在**這張名單上。
 */
const LIVE_DOCS = [
  "README.md",
  "docs/平衡錨點量測.md",
  "docs/傷害偏低警告清單.md",
  "docs/魔力回復例外清單.md",
  "docs/技能標記機制與效果規則.md",
  "docs/技能編輯器引擎須知 20260811.md",
  "docs/editor-contract/ggd-skill-tiers.md",
  "docs/_session-handover.md",
];

/** 死掉的數字 → 它是什麼、被誰取代。訊息要讓人**不必翻 git log** 就知道下一步。 */
const SUPERSEDED: readonly (readonly [number, string])[] = [
  [1150, "傷害級距·極小（錨 LV50 那一版）"],
  [2875, "傷害級距·小（同上）"],
  [5750, "傷害級距·中（同上）"],
  [8625, "傷害級距·大（同上）"],
  [11500, "傷害級距·極大（同上）"],
  [13927, "舊天花板：混了 HP 倍率**與**魔抗減傷，比真實高 18%"],
  [9048, "Lv18 的中位**有效**血量（錨點等級與空間都已被 owner 更正）"],
  [3442, "把初始加成折進基礎再回乘的**混合量**，差 +16.5%（算術錯誤，不是量測誤差）"],
  [2792, "舊母體（含變身態與骨架佔位）算出來的純基礎中位血量"],
];

/** `1150` 要中，`11500` / `21150` / `1150.5` 不可以中；`1,150` 也算。 */
const hit = (text: string, n: number): RegExp[] =>
  [new RegExp(`(?<![\\d.,])${n}(?![\\d.,]*\\d)`), new RegExp(`(?<![\\d.,])${n.toLocaleString("en-US")}(?![\\d.,]*\\d)`)];

describe("級距數字：描述現況的文件不可以留著被取代的那一版", () => {
  it("⛔ LIVE_DOCS 裡一個死掉的級距數字都不可以有", () => {
    cover("superseded-tier-numbers");
    const present = LIVE_DOCS.filter((rel) => existsSync(join(ROOT, rel)));
    // 夾具前提：名單整份找不到 = 這條守衛會永遠綠（失敗形態③）。
    expect(present.length).toBeGreaterThan(LIVE_DOCS.length / 2);

    const bad: string[] = [];
    for (const rel of present) {
      const lines = readFileSync(join(ROOT, rel), "utf8").split("\n");
      for (const [n, why] of SUPERSEDED) {
        for (const re of hit("", n)) {
          lines.forEach((line, i) => {
            if (re.test(line)) bad.push(`${rel}:${i + 1} 出現 ${n}（${why}）\n      ${line.trim().slice(0, 120)}`);
          });
        }
      }
    }
    expect(
      bad.join("\n"),
      `這幾份文件描述的是**現況**，而它們裡面還留著已經被取代的級距數字。\n` +
        `→ 出貨值以 content/config/*-tiers.json 與 docs/平衡錨點量測.md 為準；\n` +
        `→ 如果那一段本來就是在講「舊版長什麼樣」，把它搬進 docs/legacy/ 或標成 _temp_ 快照。\n` +
        `⛔ 不要改這條測試。\n`,
    ).toBe("");
  });
});
