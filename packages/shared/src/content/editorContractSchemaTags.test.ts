/**
 * ⛔⛔ **對外契約引用的每一個 `config.*@N` 都要真的存在**（GH#613）。
 *
 * 量到的：`editorCapabilities` 的 `effect.screen-feedback@1` 引用
 * **`config.screen-cues@1`** —— ⛔ 那個 schema tag 從來沒有存在過（真的是
 * `config.screen-fx@1`，`content/config/screen-fx.json`），而它跟著產生器散進了
 * `docs/editor-contract/ggd-runtime-capabilities.{md,json}`。
 *
 * ⭐ 為什麼它比一般的錯字嚴重 —— CLAUDE.md 第〇·五守則逐字：
 * 「內部債可以忍，**對外契約不行** —— 外部編輯器看不到我們的 registry，
 *  沒有辦法發現我們在說謊。」照著契約去找那份 config 的人**永遠找不到**。
 *
 * ⚠️ ⛔ 既有的守衛對它結構性失明，而且是**三種**都失明：
 *   · `editorCapabilities.test.ts` 兩個方向對帳的是 **capability 的存在**
 *     （effect kind / hook event），⛔ 不讀 caveat 那段散文。
 *   · `configUnionCoversDirectory.test.ts` 問的是「schema 目錄 ↔ union」，
 *     ⛔ 它不知道有人在**別的檔**引用了一個不在 union 裡的名字。
 *   · `--check` 逐位元組比對的是「產物 ↔ 產生器」—— 產物忠實地抄了來源的謊。
 *
 * ⇒ 這一條問的是**第三個關係**：契約散文裡的名字 ↔ 出貨 Zod union。
 *
 * 突變（2026-08-24）：把 `config.screen-fx@1` 改回 `config.screen-cues@1` → 紅並
 * 指名該檔、該 tag、與最接近的真名。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zConfigDoc } from "./schema/config/index";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTRACT = join(ROOT, "docs/editor-contract");
/** 契約的**來源**也要掃 —— 只掃產物的話，修法會變成手改產物（下一次 sync 打回來）。 */
const SOURCE = "packages/shared/src/content/editorCapabilities.ts";

const TAG = /config\.[a-z0-9-]+@\d+/g;

/** 出貨 Zod union 的每一個 tag —— ⛔ 不是手抄的名單，⛔ 也不是掃資料夾。 */
function realTags(): Set<string> {
  return new Set(zConfigDoc.options.map((o) => o.shape.schema.value as string));
}

/** 最接近的真名（拿來當錯誤訊息的第二句 —— 一條說不出修法的閘會被人放寬）。 */
function nearest(tag: string, real: ReadonlySet<string>): string {
  const stem = tag.replace(/@\d+$/, "").split(".")[1] ?? "";
  const head = stem.split("-")[0] ?? stem;
  const hit = [...real].find((r) => r.includes(head));
  return hit ? `最接近的真名是 \`${hit}\`` : "⛔ 沒有任何近似的真名 —— 這一格可能整個是虛構的";
}

export function scanTags(
  files: readonly { name: string; text: string }[],
  real: ReadonlySet<string>,
): string[] {
  const bad: string[] = [];
  for (const { name, text } of files) {
    text.split("\n").forEach((line, i) => {
      for (const tag of new Set(line.match(TAG) ?? [])) {
        if (real.has(tag)) continue;
        bad.push(`${name}:${i + 1} 引用不存在的 \`${tag}\` —— ${nearest(tag, real)}`);
      }
    });
  }
  return bad;
}

describe("編輯器契約引用的 schema tag 都真的存在", () => {
  it("⛔ 契約與它的來源裡一個虛構的 config.*@N 都不可以有", () => {
    const real = realTags();
    expect(real.size, "config union 讀不到 —— 掃面壞了").toBeGreaterThan(50);

    const files = [
      ...readdirSync(CONTRACT).map((name) => ({
        name: `docs/editor-contract/${name}`,
        text: readFileSync(join(CONTRACT, name), "utf8"),
      })),
      { name: SOURCE, text: readFileSync(join(ROOT, SOURCE), "utf8") },
    ];
    // 夾具前提：掃到的 tag 是 0 個 = 這條閘永遠綠（失敗形態③）。
    const seen = files.flatMap((f) => f.text.match(TAG) ?? []);
    expect(seen.length, "契約裡一個 config.*@N 都掃不到 —— 正則壞了").toBeGreaterThan(5);

    expect(
      scanTags(files, real),
      "⛔ 對外契約引用了一個**不存在的** schema tag。外部編輯器看不到我們的 registry，" +
        "照著它去找那份 config 的人永遠找不到。⭐ 修法是改**來源**" +
        `（${SOURCE} 或對應的產生器）再重跑 \`pnpm caps:export\`，⛔ 不是手改 docs/ 的產物。`,
    ).toEqual([]);
  });
});
