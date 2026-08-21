/**
 * ⛔ **描述現況的文件裡不可以出現已經被取代的級距數字。**
 *
 * 傷害五級距在 2026-08-19 → 08-21 三天內重錨了**三次**（500/1250/… → 1150/2875/…
 * → 600/1500/…）。每一次重錨，散文裡那五個數字就地變成謊話 —— 而 `content:build`、
 * `spec:check`、全套測試**全部是綠的**，因為那些閘看的是產生器與 schema，
 * ⛔ 沒有一個在讀散文。2026-08-21 實際量到：Codex 契約的檔頭還貼著
 * `1150/2875/5750/8625/11500`，而那份文件的用途就是「外部編輯器照著抄」。
 * ⇒ 這一條把散文也關進閘裡（「要記得一起改」這個判準已經失效四次）。
 *
 * ⚠️ 它驗**機制**不驗**數字**：它不知道、也不該知道出貨值是多少（那有三個住處 +
 * drift 測試在守）。這裡只列**已經死掉的**數字 —— 歷史常數，⛔ 永遠不會再合法，
 * 所以寫在測試裡沒有「第四個住處」的問題。
 *
 * ⚠️ 名單是**具名**的，⛔ 不掃整棵 docs/：`docs/_daily/**`（歷史帳本）、
 * `docs/legacy/**`、`docs/_release/**` 與 `*_temp_*` 稽核快照裡**引用舊數字是它們的
 * 工作**，改它們就是竄改歷史。
 *
 * ⚠️ 紅了⛔ 不要改這條測試：把那份文件的數字換掉，或把那一段搬進 `docs/legacy/`。
 *
 * 突變（2026-08-21）：README 級距節塞回「傷害五級距 1150/2875/5750/8625/11500」→ 紅，
 * 訊息指名檔名、行號、與那個數字是誰。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** **描述現況**的文件 —— 這些必須跟 HEAD 的級距一致。 */
const LIVE_DOCS = [
  "README.md",
  "docs/平衡錨點量測.md",
  "docs/傷害偏低警告清單.md",
  "docs/魔力回復例外清單.md",
  "docs/技能標記機制與效果規則.md",
  "docs/技能編輯器引擎須知 20260811.md",
  "docs/editor-contract/ggd-skill-tiers.md",
  "docs/_session-handover.md",
  // ⭐ 2026-08-21 —— 這三份現在也**描述現況**，所以它們也進閘：
  //   · 英雄定位總表：`tools/hero-archetypes/build.ts` 產生，§一那張「幾項套用中」
  //     在這一天之前是手打的，而它已經說謊（印著「尚未套用 2 項」而 `as` 已經開了）
  //   · AP 傷害契約：技能傷害多出來的那一乘，外部編輯器照著抄
  //   · 技能 AP 換算計畫：級距↔AP 的換算表，數字全部來自級距表
  "docs/英雄定位與屬性總表.md",
  "docs/editor-contract/ap-damage-scaling.md",
  "docs/技能AP換算計畫.md",
];

/** 死掉的數字 → 它是什麼。訊息要讓人**不必翻 git log** 就知道下一步。 */
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

/** `1150` 要中；`11500` / `21150` / `1150.5` 不可以中；`1,150` 也算。 */
const patterns = (n: number): RegExp[] =>
  [String(n), n.toLocaleString("en-US")].map(
    (s) => new RegExp(`(?<![\\d.,])${s.replace(",", ",")}(?![\\d.,]*\\d)`),
  );

describe("級距數字：描述現況的文件不可以留著被取代的那一版", () => {
  it("⛔ LIVE_DOCS 裡一個死掉的級距數字都不可以有", () => {
    cover("superseded-tier-numbers");
    const present = LIVE_DOCS.filter((rel) => existsSync(join(ROOT, rel)));
    // 夾具前提：名單整份找不到 = 這條守衛永遠綠（失敗形態③）。
    expect(present.length).toBeGreaterThan(LIVE_DOCS.length / 2);

    const bad: string[] = [];
    for (const rel of present) {
      const lines = readFileSync(join(ROOT, rel), "utf8").split("\n");
      for (const [n, why] of SUPERSEDED) {
        for (const re of patterns(n)) {
          lines.forEach((line, i) => {
            if (re.test(line)) bad.push(`${rel}:${i + 1} 出現 ${n}（${why}）— ${line.trim().slice(0, 100)}`);
          });
        }
      }
    }
    expect(
      bad.join("\n"),
      "這幾份文件描述的是**現況**，而它們還留著被取代的級距數字。\n" +
        "→ 出貨值以 content/config/*-tiers.json 與 docs/平衡錨點量測.md 為準；\n" +
        "→ 若那一段本來就在講「舊版長什麼樣」，把它搬進 docs/legacy/ 或標成 _temp_ 快照。\n" +
        "⛔ 不要改這條測試。\n",
    ).toBe("");
  });
});
