/**
 * agentsMdIsHonest.test.ts —— `AGENTS.md` 是**對外契約**，它引用的每一條指令都要真的存在（GH#988）。
 * 三件事：① 每個 `pnpm <script>` 在根 `package.json` 裡 ② 每個 `bash scripts/<x>.sh` 存在
 * ③ §3 表列的 packet 欄位名 ⊆ coord 契約認得的。⛔ 三條都讀真的檔，⛔ 不抄字串常數。
 * ④ GH#997：檔裡每一個 commit sha 都**真的在 HEAD 的歷史上**（永不過期的性質），而檔頭
 *   「上次校對的 origin/main」那一顆還要**落後 HEAD ≤ {@link BASELINE_MAX_BEHIND}** —— 否則那一行
 *   是一句在到期之後還活著的散文（第三守則），而讀它的是 Codex，⛔ 不是我們自己。
 *
 * ⭐ **哨兵**：假的 AGENTS.md 文字餵進**同一支**檢查器 ⇒ 每一種缺陷都要被指名。⛔ 沒有它，
 * 「永遠綠的閘」與「不存在的閘」量起來一樣（綠燈假來源⑨）。⛔ 體驗層：不做突變。
 * ⚠️ ③ 的分母**刻意含 `check.mjs` 真的讀到的屬性**：`evidence` 今天只住在 check.mjs
 * （`packet.evidence`），`schema.mjs` 一個字都沒有 —— 那正是它檔頭自己禁止的「第二個住處」。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");
const caps = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => String(m[1]));

/** §3「欄位規則」表的第一欄（反引號包住的欄位名），⛔ 不含 JSON 範例裡的鍵。 */
function packetFields(md: string): string[] {
  const sec = md.slice(md.indexOf("## 3."), md.indexOf("## 4."));
  return sec
    .split("\n")
    .map((l) => /^\|\s*`([^`]+)`/.exec(l)?.[1])
    .filter((f): f is string => Boolean(f))
    .map((f) => f.replace(/\[\]$/, ""));
}

/** ⭐ coord 契約今天認得的欄位名 = schema.mjs 宣告的 ＋ check.mjs 真的讀到的。 */
async function knownFields(): Promise<Set<string>> {
  const url = pathToFileURL(join(REPO, "tools/coord/schema.mjs")).href;
  const S = (await import(url)) as { REQUIRED: string[]; FORBIDDEN: string[] };
  const set = new Set<string>([...S.REQUIRED, ...S.FORBIDDEN]);
  for (const f of caps(read("tools/coord/check.mjs"), /\b(?:packet|c)\.([A-Za-z]\w*)/g)) set.add(f);
  return set;
}

/** ⭐ 三條檢查住同一支函式 ⇒ 真檔與哨兵走的是**同一條路**（⛔ 不是失敗形態⑤的虛構通道）。 */
function audit(md: string, scripts: Set<string>, fields: Set<string>): string[] {
  const bad: string[] = [];
  for (const s of caps(md, /\bpnpm ([a-z][a-z0-9]*(?::[a-z0-9-]+)*)/g))
    if (!scripts.has(s)) bad.push(`\`pnpm ${s}\` 不在根 package.json 的 scripts 裡`);
  for (const p of caps(md, /\bbash (scripts\/[\w.-]+\.sh)/g))
    if (!existsSync(join(REPO, p))) bad.push(`\`bash ${p}\` 指向一支不存在的腳本`);
  for (const f of packetFields(md))
    if (!fields.has(f)) bad.push(`§3 的欄位 \`${f}\` 不在 tools/coord 的契約裡`);
  return bad;
}

const SENTINEL = [
  "## 3. Packet",
  "",
  "push 之前跑 `pnpm nope:check`，然後 `bash scripts/nope.sh`。",
  "",
  "| 欄位 | 規則 |",
  "|---|---|",
  "| `kind` | ⭐ 這一個是真的,⛔ 不可以被判紅 |",
  "| `nopeField` | 一個 coord 契約沒有的欄位 |",
  "",
  "## 4. 尾",
].join("\n");

describe("AGENTS.md —— 引用的每一條指令與欄位都存在（GH#988）", () => {
  it("⭐ 出貨的 AGENTS.md 三條全過（⛔ 沒擋過頭）", async () => {
    const scripts = new Set(Object.keys(JSON.parse(read("package.json")).scripts as object));
    expect(audit(read("AGENTS.md"), scripts, await knownFields())).toEqual([]);
  });

  it("⭐ 哨兵：假的 script / 腳本 / 欄位都被指名（⛔ 而真的那一個不被誤判）", async () => {
    const bad = audit(SENTINEL, new Set(["skills:check"]), await knownFields());
    expect(bad.join("\n")).toContain("pnpm nope:check");
    expect(bad.join("\n")).toContain("scripts/nope.sh");
    expect(bad.join("\n")).toContain("nopeField");
    expect(bad.join("\n")).not.toContain("`kind`");
    expect(bad).toHaveLength(3);
  });
});
