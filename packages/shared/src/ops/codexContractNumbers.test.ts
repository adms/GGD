/**
 * ⭐【貼在 Codex 合約散文裡的**數字**，必須等於出貨設定算出來的那一個】
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
 * ⚠️ 這是 CLAUDE.md 第〇·五守則那句話的**第三次**應驗：
 * 「a flag defended by prose outlives the prose's expiry date and nothing goes red」。
 * 前兩次的解法都是**推導**；這一次沒辦法（散文要人讀），所以退而求其次：
 * ⭐ **把散文裡的每一個數字都拉回來對帳。**
 *
 * ⛔ 這條**不要求**文件複製整張表 —— 它只檢查文件裡**已經寫了**的那幾格。
 * 想從文件拿掉一格，這條就不再管它（那是編輯決定）；但只要還寫著，就必須是真的。
 *
 * 突變紀錄（跑過）：把文件裡的 `manaRegen | **8.0**` 改回 `**16**` → 紅並指名那一格。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOC = join(REPO, "docs/技能編輯器引擎須知 20260811.md");

const readJson = (p: string): Record<string, never> =>
  JSON.parse(readFileSync(join(REPO, p), "utf8")) as Record<string, never>;

/** 文件裡的數字寫法有 `**8.0**` / `8.0` / `**18**` 幾種，統一剝成數字。 */
function cellNumber(cell: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(cell.replace(/\*/g, ""));
  return m ? Number(m[0]) : null;
}

/**
 * 找出以 `| <label> |` 開頭的那一列，回傳第 n 個欄位。
 *
 * ⚠️ `after` 不是選配的講究 —— 這份文件裡「小 / 中 / 大 / 極大」**同時**是
 * 射程級距、AoE 範圍級距與魔耗倍率的列名（實測三張表都有 `| 小 |`）。
 * 少了錨點，第一版把 AoE 那張表的 `| 小 | 約打到 5 人 |` 讀成射程的「小 = 5」。
 * ⛔ 所以每一次查詢都要指定從哪個標題之後開始找。
 */
function rowCell(doc: string, label: string, col: number, after?: string): number | null {
  let body = doc;
  if (after !== undefined) {
    const at = doc.indexOf(after);
    if (at < 0) return null;
    body = doc.slice(at);
  }
  for (const line of body.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells[1] === undefined) continue;
    if (cells[1].replace(/`/g, "").replace(/\*/g, "").trim() !== label) continue;
    return cellNumber(cells[col + 1] ?? "");
  }
  return null;
}

describe("Codex 合約散文裡的數字", () => {
  const doc = readFileSync(DOC, "utf8");

  it("🔴 全域倍率表的每一格 = combat-env.json", () => {
    cover("codex-contract-numbers");
    const env = readJson("content/config/combat-env.json");
    const mult = (env["multipliers"] ?? env) as unknown as Record<string, number>;
    // ⛔ 名單從**文件**推 —— 文件寫了哪幾格就對哪幾格，⛔ 不要求它列完全部。
    for (const key of ["maxHealth", "magicResistMult", "attackRange", "abilityRange", "cooldown", "manaRegen", "damageDealt"]) {
      const inDoc = rowCell(doc, key, 1, "## 八、全域倍率");
      if (inDoc === null) continue; // 文件沒寫這一格 —— 編輯決定，不管
      expect(`${key}=${inDoc}`).toBe(`${key}=${mult[key]}`);
    }
  });

  it("🔴 上限表的每一格 = stat-caps.json", () => {
    cover("codex-contract-numbers");
    const caps = readJson("content/config/stat-caps.json")["caps"] as unknown as Record<
      string,
      { base: number; unlocked: number }
    >;
    for (const [label, key] of [["攻擊速度 as", "as"], ["移動速度 ms", "ms"], ["冷卻縮減 cdr", "cdr"], ["吸血 lifesteal", "lifesteal"]] as const) {
      const inDoc = rowCell(doc, label, 1, "### 目前的天花板");
      if (inDoc === null) continue;
      expect(`${key}=${inDoc}`).toBe(`${key}=${caps[key]!.base}`);
    }
  });

  it("🔴 攻擊距離的兩把尺 = stat-normalization.json（⛔ 而且必須是兩把）", () => {
    cover("codex-contract-numbers");
    const two = (readJson("content/config/stat-normalization.json")["bandsByScale"] as unknown as Record<
      string,
      Record<string, Record<string, number>>
    >)["range"]!;
    const RANGE_TABLE = "### 攻擊距離 —— **兩把尺**";
    // 文件那張表每一列是「級距 | 近戰 | 遠程」——⛔ 只有一欄數字就代表它還停在單尺那一版。
    for (const band of ["極小", "小", "中", "大", "極大"]) {
      expect(`${band}近戰=${rowCell(doc, band, 1, RANGE_TABLE)}`).toBe(`${band}近戰=${two["melee"]![band]}`);
      expect(`${band}遠程=${rowCell(doc, band, 2, RANGE_TABLE)}`).toBe(`${band}遠程=${two["ranged"]![band]}`);
    }
  });
});
