/**
 * 📘↔🔇 **對外契約「沉默」的棘輪**（GH#675）。
 *
 * 第〇·五守則的紅線是「對外契約不可以說謊」，而 2026-08-27 量到它有一個**更安靜的
 * 變體**：契約的參數表把說明欄印成 `—`，而**定義檔的 TSDoc 就寫著那一格的語意**。
 * 知識在 repo 裡，只是從來沒送到讀契約的人手上。
 *
 * ⚠️ 沉默**不是**中立的。最貴的實例是 `applyBuff.polarity`（GH#662）：
 * 省略那一格 ⇒ 有方向的淨化拔不到這份減益（`clearPools.polarityPasses`
 * 「不知道不當成是」）。契約上那一格是空白 ⇒ 外部編輯器**合理地**不填 ⇒
 * 產出的減益在任何淨化面前都是無敵的，而**每一道閘都是綠的**。
 *
 * 根因：`spec:build` 的說明欄吃 `.describe()`（內省讀得到），而 `effects/*.ts`
 * 那一族用 `/** … *\/` TSDoc —— `gen_spec.ts::tsdocFields()` 只對兩個手動錨定的
 * 檔開了旁路，其餘整欄空白。⛔ 修法在 `tools/skill-spec/`（本 lane 柵欄外）。
 *
 * ⭐ 這一條驗的是**兩個名詞的關係**（出貨 schema ↔ 產生的契約），⛔ 不是
 * 「文件裡有沒有那個字」。它是**棘輪**：沉默只能變少。加一個帶 TSDoc 的新欄位
 * 而它沒有送進契約 ⇒ 紅。
 *
 * 突變紀錄（2026-08-27 實跑）：把偵測空白格的 `desc !== "—"` 改成 `desc !== "@@"`
 *（＝把量尺弄瞎）→ **校準那一條紅**，訊息指名 `demoKind.silentField`。改回來。
 *
 * ⚠️ ⭐ 而**棘輪那一條在同一次突變下是綠的** —— 瞎掉的量尺數出 0 格，0 ≤ 213。
 * 這正是 CLAUDE.md「一把只驗過單邊的尺不算自證過」那一條：⛔ 只有棘輪的話，
 * 「偵測器壞了」與「契約修好了」量起來一模一樣。校準那一條是為了這個而存在的。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTRACT = "docs/技能標記機制與效果規則.md";

/**
 * ⭐ 2026-08-27 量到的沉默格數。**只能往下**。
 * 351 格有明確定義檔的空說明格裡，213 格的定義檔（或它繼承的 `_shared`/`_hook`）
 * 真的有 TSDoc —— 也就是「我們寫過，但沒送出去」。
 */
const BASELINE = 213;

const TSDOC = /\/\*\*([\s\S]*?)\*\/\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_]\w*)\s*:/g;
const docNames = (src: string): Set<string> =>
  new Set([...src.matchAll(TSDOC)].map((m) => m[2]!));

/** 契約表裡說明欄空白、而定義檔的 TSDoc 有話說的那些格。 */
function silentCells(contract: string, tsdocOf: (file: string) => Set<string>): string[] {
  const out: string[] = [];
  let sec: string | null = null;
  let def: string | null = null;
  for (const line of contract.split("\n")) {
    const h = /^#{3,4} `([^`]+)`/.exec(line);
    if (h) {
      sec = h[1]!;
      def = null;
    }
    const d = /\*\*定義檔\*\*：`(packages\/[^`]+?\.ts)`/.exec(line);
    if (d && sec) def = d[1]!;
    if (!sec || !def || !line.startsWith("| `") || line.split("|").length < 7) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const desc = cells[cells.length - 1]!;
    if (desc !== "—" && desc !== "-" && desc !== "") continue;
    const name = cells[0]!.replace(/`/g, "");
    const known =
      tsdocOf(def).has(name) ||
      tsdocOf("packages/shared/src/content/schema/effects/_shared.ts").has(name) ||
      tsdocOf("packages/shared/src/content/schema/effects/_hook.ts").has(name);
    if (known) out.push(`${sec}.${name}`);
  }
  return out;
}

describe("📘 對外契約的沉默只能變少（GH#675）", () => {
  it("⛔ 校準：偵測器兩個方向都要對（有 TSDoc 而空白＝抓到；已經有說明＝不抓）", () => {
    const fake = [
      "### `demoKind`",
      "**定義檔**：`packages/shared/src/content/schema/effects/demo.ts`",
      "| 參數 | 型別 | 必填 | 範圍 | 說明 |",
      "|---|---|---|---|---|",
      "| `silentField` | 數字 | 選填 | — | — |",
      "| `describedField` | 數字 | 選填 | — | 這一格有說明。 |",
      "| `undocumented` | 數字 | 選填 | — | — |",
    ].join("\n");
    const got = silentCells(fake, () => new Set(["silentField", "describedField"]));
    expect(got).toEqual(["demoKind.silentField"]);
  });

  it("⛔ 出貨態：沉默格數不可以比基準線多", () => {
    const cache = new Map<string, Set<string>>();
    const tsdocOf = (f: string): Set<string> => {
      if (!cache.has(f)) {
        let src = "";
        try {
          src = readFileSync(join(REPO, f), "utf8");
        } catch {
          /* 定義檔搬家了 ⇒ 那一節算不出沉默，交給 spec:check 的逐位元組比對叫 */
        }
        cache.set(f, docNames(src));
      }
      return cache.get(f)!;
    };
    const silent = silentCells(readFileSync(join(REPO, CONTRACT), "utf8"), tsdocOf);
    expect(
      silent.length,
      `契約沉默格 ${silent.length} > 基準線 ${BASELINE}。` +
        `新增的欄位在 schema 有 TSDoc 卻沒送進契約 —— 修 tools/skill-spec/gen_spec.ts ` +
        `的 tsdocFields 錨點（⛔ 不是把說明手抄進產物）。新增的幾格：` +
        silent.slice(-6).join(" · "),
    ).toBeLessThanOrEqual(BASELINE);
  });
});
