/**
 * ⭐⭐ **每一份 `content/<集合>/_index.json` 都有戶籍**（GH#883）。
 *
 * ⛔⛔ 量到的形狀：`content/vfx-scripts/_index.json` 是一份
 * **全戶籍都沒有人認領的產物** ⇒ ⭐ 沒有任何鏈會重生成它，
 * 而它 stale 很久**沒有東西紅**：
 * ⛔ genguard 放行 · ⛔ 隔離區不鎖 · ⛔ 沒有 `--check` 叫它 —— ⭐ **三層同時瞎**。
 *
 * ⭐ 根因**不是**忘了宣告：`packages/shared/scripts/buildIndexes.ts` 的檔頭
 * 逐字寫著 `// ggd:writes content/<星號>/_index.json`（一句正確的、單一住處的宣告）
 * —— ⚠️ 這裡寫成 `<星號>` 是因為**塊註解裡不可以出現那兩個字元**（它會提前收掉註解）。
 * ⛔ 而 `merge-io.mjs` 的 `staticWrites()` **讀不到它** ——
 * 它只掃 `package.json` 那一行的**字面**，而這個 repo 的產生器幾乎全部長成
 * `bash scripts/genrun.sh <step> <step>:build:raw`
 * ⇒ ⭐ 唯一被掃到的腳本是 **wrapper**，而真正的寫入端藏在兩層底下
 * （`<step>:build:raw` → `pnpm --filter @ggd/shared content:build` → `buildIndexes.ts`）。
 *
 * ⇒ ⭐ 這一支釘住**結果**（每一份索引都有人認領），⛔ 不是掃 `merge-io.mjs`
 * 的原始碼字串 —— 收割器換一種寫法而結果仍然對，這條不該紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const IO = JSON.parse(readFileSync(join(ROOT, "tools/parallel-gates/sync-io.json"), "utf8")) as {
  steps: { name: string; writes: string[] }[];
};

/** ⭐ 戶籍比對要懂 glob —— ⛔ 字面比對會讓一句 glob 宣告讀起來像「沒有人認領」。 */
const claims = (path: string): string[] =>
  IO.steps
    .filter((s) =>
      s.writes.some((w) =>
        w.includes("*")
          ? new RegExp(
              "^" +
                w
                  .split("*")
                  .map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
                  .join("[^/]*") +
                "$",
            ).test(path)
          : w === path,
      ),
    )
    .map((s) => s.name);

describe("每一份 content 索引都有戶籍（GH#883）", () => {
  const collections = readdirSync(join(ROOT, "content"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(ROOT, "content", e.name, "_index.json")))
    .map((e) => e.name);

  it("⭐ 量尺先自證：真的掃到集合了", () => {
    expect(collections.length, "⛔ 一個都沒掃到 ⇒ 這條在量空氣").toBeGreaterThan(10);
  });

  it("★★ ⭐ 每一份 `_index.json` 都有人認領（⛔ 零認領 ＝ 三層同時瞎）", () => {
    const orphan = collections
      .map((c) => `content/${c}/_index.json`)
      .filter((p) => claims(p).length === 0);
    expect(
      orphan,
      "⛔ 這幾份索引**全戶籍都沒有人認領** ⇒ 沒有任何鏈會重生成它們，" +
        "而它們會 stale 很久而沒有東西紅（genguard 放行 · 隔離區不鎖 · 沒有 --check 叫它）。\n" +
        "⭐ 修的是**收割**：`merge-io.mjs` 的 `staticWrites()` 要追得到真正的寫入端" +
        "（wrapper → `:raw` → `pnpm --filter <pkg> <script>`），⛔ 不是手寫 `sync-io.json`。",
    ).toEqual([]);
  });

  it("⭐ 反方向：那句 glob 宣告**真的在**寫入端的檔頭（⛔ 不是戶籍表裡手寫的）", () => {
    const src = readFileSync(join(ROOT, "packages/shared/scripts/buildIndexes.ts"), "utf8");
    expect(
      src.includes("ggd:writes content/*/_index.json"),
      "⛔ 寫入端不再宣告它 ⇒ 下一次重量測戶籍就會消失（而消失是**靜默**的）",
    ).toBe(true);
  });
});
