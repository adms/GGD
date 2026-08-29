/**
 * 📘↔🔇 **反方向**：每一個 effect 分片的 TSDoc 都要**到得了**契約（GH#877）。
 *
 * `laneDOCSContractSilence` 從**契約**走回 schema。⭐ 它結構上答不出另一半
 * （失敗形態⑫）：它靠契約裡那一行 `**定義檔**：` 才知道要去問哪個檔 —— 那一行的
 * 格式一變，它就**數出 0 格沉默**，而 0 ≤ 基準線 ⇒ **綠燈**，而知識照樣沒送出去。
 *
 * ⇒ 這一條從**磁碟**走：`schema/effects/` 底下有哪些分片，就逐一去契約裡看那一節
 * （用 `### \`kind\`` 找，⛔ 不碰定義檔那一行）。⭐ 連 `_*.ts`（共用形狀）也是
 * **當場列目錄** —— 新開第三個共用檔而 `gen_spec.ts` 沒認它，這裡就會紅。
 *
 * 量到的（2026-08-29）：**217 格**。`taunt` / `weightedBranch` 在 `gen_spec.ts` 裡
 * 一個錨點都沒有 —— §5 從來沒呼叫過 `withDocs()`（GH#467 分片時漏接，而
 * `tsdocFields` 的檔頭還寫著「effect.ts 那一族用 `.describe()`」這句過期的話）。
 *
 * 突變紀錄（實跑）：拆掉 §5 那一行的 `withDocs(...)` 再 `genrun spec:build`
 * → **這一條與棘輪一起紅**，兩邊都數到 217 且指名 `taunt.forcedTarget` 那一族。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = "packages/shared/src/content/schema/effects";
const CONTRACT = "docs/技能標記機制與效果規則.md";
const GEN = "tools/skill-spec/gen_spec.ts";
const RATCHET = "packages/shared/src/ops/laneDOCSContractSilence.test.ts";

/** ⚠️ 與 `gen_spec.ts::tsdocIn` **逐字相同**（下面第二條驗它，⛔ 不靠人記得）。 */
const TSDOC = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
const read = (f: string): string => readFileSync(join(REPO, f), "utf8");
const docNames = (f: string): string[] => [...read(f).matchAll(TSDOC)].map((m) => m[2]!);
const shards = (pick: (f: string) => boolean): string[] =>
  readdirSync(join(REPO, DIR)).filter((f) => f.endsWith(".ts") && !f.includes(".test.") && pick(f)).sort();

/** 契約裡 `### \`kind\`` 那一節的欄位列 → 說明欄。 */
function rowsOf(contract: string, kind: string): Map<string, string> {
  const out = new Map<string, string>();
  let inside = false;
  for (const line of contract.split("\n")) {
    const h = /^#{3,4} `([^`]+)`/.exec(line);
    if (h) inside = h[1] === kind;
    if (!inside || !line.startsWith("| `")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length >= 5) out.set(cells[0]!.replace(/`/g, ""), cells[cells.length - 1]!);
  }
  return out;
}

describe("📘 每一個 effect 分片的說明都到得了契約（GH#877）", () => {
  it("⛔ 分片 → 契約：TSDoc 寫過的欄位，說明欄不可以是 `—`", () => {
    const contract = read(CONTRACT);
    const shared = shards((f) => f.startsWith("_")).flatMap((f) => docNames(`${DIR}/${f}`));
    const silent: string[] = [];
    for (const file of shards((f) => !f.startsWith("_") && f !== "index.ts")) {
      const kind = file.slice(0, -3);
      const rows = rowsOf(contract, kind);
      if (rows.size === 0) continue; // 不在出貨聯集裡 —— 那是 effectShardWiring 的事
      const known = new Set([...docNames(`${DIR}/${file}`), ...shared]);
      for (const [name, desc] of rows)
        if (known.has(name) && ["—", "-", ""].includes(desc)) silent.push(`${kind}.${name}`);
    }
    expect(
      silent,
      `這幾格的語意寫在 ${DIR}/ 卻沒有送進契約 —— 修 gen_spec.ts 的 effectDocFiles()／§5 的 ` +
        `withDocs()，然後 \`bash scripts/genrun.sh spec:build\`（⛔ 不是把說明手抄進產物）：` +
        silent.join(" · "),
    ).toEqual([]);
  });

  it("⛔ 三份 TSDoc 正則要逐字一致（產生器 · 棘輪 · 這一條）", () => {
    // ⭐ 量尺與被量的東西必須是同一把（第〇·四守則）。跨 package 的 `.ts` import 會
    //    破 `packages/shared` 的 rootDir ⇒ 抄是唯一的路 ⇒ **那就替抄的那幾份加一道閘**。
    //    ⚠️ 這不是潔癖：2026-08-29 產生器那份修了「跨 `*/` 吞併」的缺陷，
    //    抄來的沒跟著修 ⇒ 兩邊對「哪些欄位有 TSDoc」的答案會不一樣。
    for (const f of [GEN, RATCHET])
      expect(read(f), `${f} 的 TSDoc 正則與這一條不一致 —— 三份要一起改`).toContain(TSDOC.source);
  });
});
