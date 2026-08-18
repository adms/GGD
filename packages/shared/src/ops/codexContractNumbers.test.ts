/**
 * ⭐【Codex 合約散文裡的**數字**，必須等於出貨設定】
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼指紋那一條擋不住這個
 * ─────────────────────────────────────────────────────────────────────────────
 * `codexContractFresh.test.ts` 對帳的是**能力指紋**（effect kinds / hook events /
 * 模板家族）。它守得很好，⛔ 但它看不到散文表格裡的數字 —— 那些數字讀的是
 * `config.*`，跟能力清單完全無關。
 *
 * 2026-08-16 實測，同一份文件裡**四處在說謊**，而全套測試是綠的：
 *
 * | 文件寫 | 實際 | 差在哪 |
 * |---|---|---|
 * | 攻擊距離五格 `1.5 / 3 / 5 / 7 / 10` | 近戰 1.2–2.0、遠程 6–12 | **結構都變了**（一把尺→兩把） |
 * | 移動速度上限 `14` | **18** | owner 08-15 重新設計過 |
 * | `manaRegen` 倍率 `16` | **8.0** | 調過沒人回來改文件 |
 * | `damageDealt` 倍率 `0.5` | **1.0** | 同上 |
 *
 * ⛔ 而這份文件的第一句話就是「給**外部**技能模板編輯器」。
 * 對方照著 `1.5 / 3 / 5 / 7 / 10` 去設計一支「射程極大」的技能，
 * 會做出一個在引擎裡完全不是那個量級的東西 —— 而且**沒有任何一步會報錯**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這條測試自己也改過一次形狀，而那一次比修數字重要
 * ─────────────────────────────────────────────────────────────────────────────
 * 第一版是**解析散文表格**再逐格比對。它會紅，所以比沒有好 ——
 * ⛔ 但它守的是「手打的數字現在剛好是對的」，⚠️ 下一個人照樣要手打，
 * 只是這次會被罵。而且它自己就踩了一個真 bug：這份文件裡「小/中/大/極大」
 * **同時**是射程級距、AoE 範圍級距與魔耗倍率的列名，第一版把 AoE 那張表的
 * 「小 = 約打到 5 人」讀成射程的「小 = 5」。
 *
 * ⇒ owner 2026-08-16「do it」：三張表改成**產生的**（標記區塊），
 * 這條測試跟著降級成 `skillRemakeDocsFresh` 的形狀 —— 真的把產生器用
 * `--check` 跑起來（唯讀、回非零），⛔ 不是掃原始碼字串（失敗形態⑥）。
 *
 * ⚠️ 它紅了**不要改這條測試**，跑：
 *     pnpm contract:numbers
 * 然後把那份文件一起 commit。
 *
 * 突變紀錄（跑過）：
 *   · 把 `combat-env.json` 的 `manaRegen` 改成 99 → 紅（`--check` 回 1 並列出哪幾個區塊 stale）
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { BAND_MEANING, NORMAL_BANDS } from "../content/statNormalization";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = join(REPO, "tools/editor-contract/gen_contract_numbers.py");
const DOC = join(REPO, "docs/技能編輯器引擎須知 20260811.md");

describe("Codex 合約散文裡的數字", () => {
  it("🔴 三張數字表與 content/config/ 一致（真的跑 --check，⛔ 不是掃字串）", () => {
    cover("codex-contract-numbers");
    expect(existsSync(GEN), `${GEN} 不存在`).toBe(true);
    // ⛔ 失敗時把產生器自己的訊息原樣拋出來 —— 它會指名哪一個區塊 stale。
    try {
      execFileSync("python3", [GEN, "--check"], { cwd: REPO, encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      throw new Error(
        `合約文件的數字表過期了 —— 跑 \`pnpm contract:numbers\` 然後 commit 那份文件。\n` +
          `${err.stderr ?? ""}${err.stdout ?? ""}`,
      );
    }
  });

  it("⛔ 產生器與引擎的級距語意是同一組字（它是第二個住處）", () => {
    cover("codex-contract-numbers");
    // ⚠️ python 產生器讀不到 TS 常數，所以「極小=缺陷…」在它裡面抄了一份。
    //    ⛔ 抄一份就是第二個住處 —— 這一條就是它的守衛。
    const py = readFileSync(join(REPO, "tools/editor-contract/gen_contract_numbers.py"), "utf8");
    for (const band of NORMAL_BANDS) {
      expect(`${band}=${py.includes(`"${band}": "${BAND_MEANING[band]}"`)}`).toBe(`${band}=true`);
    }
  });

  it("⛔ 五個標記區塊都還在 —— 有人把它們刪掉就等於把表變回手打的", () => {
    cover("codex-contract-numbers");
    // ⚠️ 少了這一條，「刪掉標記 + 手打一張表」會讓上面那條**永遠綠**：
    //   `splice()` 找不到標記時是把區塊**附加在檔尾**，而 --check 只比對
    //   「產生器的輸出 == 檔案現況」。附加之後兩者一致，於是文件中段那張
    //   手打的假表沒有任何人在看（失敗形態③：可以刪掉而測試全綠）。
    const doc = readFileSync(DOC, "utf8");
    // ⭐ `contract-effects`（GH#380）：那一段的小標從 2026-08 起寫著「37 個 effect kind」
    //    而引擎是 39，⛔ 而它不在任何產生區塊裡，所以沒有東西會紅。手改成 39 只會把
    //    過期往後推一次 —— 現在標題裡的數字與清單都由 `V.effect_kinds()` 產生。
    for (const name of ["contract-caps", "contract-env", "contract-range", "contract-bands", "contract-effects"]) {
      expect(`${name}:${doc.includes(`<!-- BEGIN GENERATED:${name} -->`)}`).toBe(`${name}:true`);
    }
  });
});
