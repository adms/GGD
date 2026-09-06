/**
 * genguardMarkerRegions.test.ts —— genguard 對「**只擁有檔案一部分**」的產生器
 * 不可以過度封鎖（GH#1096）。
 *
 * ⭐ 病灶：`README.md` 有 2,075 行，其中只有 **9 段** `<!-- BEGIN GENERATED:… -->`
 * 是 `docs:readme` 寫的（那支腳本的檔頭逐字說「it owns three marker-delimited
 * regions and rewrites only the text between them」）。⛔ 而 genguard 問的是
 * 「**這個檔**是不是產物」⇒ 整份 exit 2 ⇒ 另外約一千行人寫的散文改不動
 * （GH#1089 的用語稽核撞上這一條，只能走 `GGD_GENGUARD_OFF=1` ——
 * ⭐ 而一條每次都要繞過的閘等於沒有閘）。
 *
 * ⭐ **兩個方向都驗**（⛔ 只驗「會擋」那一半不算 —— 那對「永遠擋」也是綠的）：
 *   ① 區段**內**的編輯 ⇒ 仍然 exit 2 並指名 `docs:readme`（擋的那一半沒有放鬆）
 *   ② 區段**外**的編輯 ⇒ exit 0（人寫的散文改得動）
 *   ③ 整份覆蓋（Write）⇒ 仍然 exit 2（它會把產生區段一起蓋掉）
 *   ④ 有作者**不是** marker 拼接器的檔 ⇒ 整份照舊擋
 *
 * ⭐ 真的把 hook 跑起來（餵 PreToolUse 的 JSON 事件）＋ 真的出貨檔案與真的戶籍表，
 * ⛔ 不是掃原始碼字串（失敗形態⑥），⛔ 也不是自造一份虛構的 payload（形態⑤）。
 *
 * ⚠️ 突變驗過（2026-09-07）：`marker_regions.hits_region()` 改成 `return regs[0]`
 * （＝永遠「在區段內」）⇒ ② 紅；改成 `return None`（＝永遠在外）⇒ ① 紅。
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "../../../..");
const HOOK = join(REPO, "scripts/preserve-before-overwrite.py");
/** ⭐ 出貨的部分產物本人（9 段 marker，其餘人寫）。⛔ 不自造夾具 —— 見檔頭。 */
const README = join(REPO, "README.md");
/** ⭐ 兩個作者，而 `skillremake:docs` 用 `### 13.10 …` 標題拼接、⛔ 沒有 marker。 */
const CONTRACT = join(REPO, "docs/技能編輯器引擎須知 20260811.md");

function hook(toolName: string, toolInput: Record<string, unknown>) {
  const ev = JSON.stringify({ tool_name: toolName, tool_input: toolInput, cwd: REPO });
  const r = spawnSync("python3", [HOOK], { input: ev, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** README 裡的一行 —— `inside` 決定它取自產生區段內還是外（現場算，⛔ 不抄行號）。 */
function readmeLine(inside: boolean): string {
  const lines = readFileSync(README, "utf8").split("\n");
  const seen = new Map<string, number>();
  for (const l of lines) seen.set(l, (seen.get(l) ?? 0) + 1);
  let depth = 0;
  const picked: string[] = [];
  for (const line of lines) {
    if (line.includes("<!-- BEGIN GENERATED:")) depth++;
    else if (line.includes("<!-- END GENERATED:")) depth--;
    else if (depth > 0 === inside && line.length > 40 && seen.get(line) === 1) picked.push(line);
  }
  // ⚠️ 只收**全檔唯一**的行 —— 一個出現兩次的 `old_string` 會讓「它落在哪一段」
  //   變成兩個答案，而那不是這條測試要問的東西。
  expect(picked.length, `README 找不到${inside ? "區段內" : "區段外"}的唯一長行`).toBeGreaterThan(0);
  return picked[Math.floor(picked.length / 2)]!;
}

describe("genguard —— 部分擁有的檔（marker 區段）", () => {
  it("① 產生區段**內**的編輯 ⇒ 仍然擋（exit 2）並指名產生器", () => {
    const r = hook("Edit", { file_path: README, old_string: readmeLine(true), new_string: "x" });
    expect(r.status, r.out).toBe(2);
    expect(r.out).toContain("docs:readme");
    expect(r.out).toContain("產生區段");
  });

  it("② 產生區段**外**的散文 ⇒ 放行（exit 0），而且要說出哪幾段別動", () => {
    const r = hook("Edit", { file_path: README, old_string: readmeLine(false), new_string: "x" });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("只有某幾段是產物");
    // ⭐ 放行不是沉默：它要把區段範圍印出來，⛔ 不然下一個人不知道邊界在哪。
    expect(r.out).toContain("roster L");
  });

  it("③ 整份覆蓋（Write）⇒ 仍然擋 —— 它會把產生區段一起蓋掉", () => {
    const r = hook("Write", { file_path: README, content: "全新的 README" });
    expect(r.status, r.out).toBe(2);
    expect(r.out).toContain("整份覆蓋");
  });

  it("④ 有一個作者不是 marker 拼接器 ⇒ 整份照舊擋（⛔ 不可以只看第一個作者）", () => {
    // `docs/技能編輯器引擎須知 20260811.md` 被 contract:numbers（marker）與
    // skillremake:docs（標題拼接、沒有 marker）同時認領 ⇒ marker 外面**不是**自由的。
    const text = readFileSync(CONTRACT, "utf8");
    const line = text.split("\n").find((l) => l.startsWith("# ") || l.startsWith("## "))!;
    const r = hook("Edit", { file_path: CONTRACT, old_string: line, new_string: "x" });
    expect(r.status, r.out).toBe(2);
    expect(r.out).toContain("skillremake:docs");
    expect(r.out, "這一份不可以被當成部分產物").not.toContain("只有某幾段是產物");
  });
});
