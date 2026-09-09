/**
 * ⭐ GH#1098 —— `content/**` 不可以參與任何**執行期** import 迴圈。
 *
 * ⚠️ 這條閘的判準是 **import 圖**，⛔ 不是 grep 字串 —— 一條「掃某個檔有沒有那一行」
 * 的守衛對「換一個檔繞回來」是綠的，而繞回來正是迴圈的定義。
 *
 * ⭐ **只算執行期的邊**：`import type` / `export type` / 每一個 specifier 都帶 `type`
 * 的具名 import 都會被 tsc 與 esbuild **抹掉**，⛔ 它們在執行期不存在，
 * 因此不可能造成 TDZ。⚠️ 這一格是量出來的差別，⛔ 不是潔癖：
 * `madge --circular packages/shared/src` 報 **424** 條迴圈（其中 170 條碰 `content/`），
 * 而把型別邊拿掉之後只剩 **2 個 SCC，兩個都整包住在 `sim/`、零個 `content/` 成員**。
 * ⇒ 一份把型別邊算進去的迴圈報告，讀起來跟真的一模一樣（CLAUDE.md：
 * 「一個被 glob 灌大的統計」同族），而它會把人送去修一條不存在的迴圈。
 *
 * ⭐ 為什麼是 `content/` 這個分母：`content/schema/**` 的每一份文件都在**模組本體**
 * 就把 Zod 組起來（`z.object({ id: zId, … })`）。一旦它在迴圈裡被半途求值，
 * 拿到的 shape 值就是 `undefined` ⇒ 之後爆的是
 * `TypeError: keyValidator._parse is not a function`（在 `loader.ts` 的 `validateDoc`，
 * 離病灶很遠），或是某個同檔常數的 `ReferenceError`。⛔ 兩種都不會指向真正的那條邊。
 *
 * ── 突變紀錄（實跑）──────────────────────────────────────────────────────
 * M1 在 `content/schema/victoryPodium.ts` 加一行**值** import 指回
 *    `./config/index`（`config/index.ts` 本來就 import victoryPodium）
 *    → 本檔 FAIL，訊息逐字指名
 *    `content/schema/config/index.ts -> content/schema/victoryPodium.ts -> …`。
 *    ⭐ 那正是 GH#1098 票文**主張**存在的那條迴圈 —— 它今天不存在，
 *    而這條閘保證它出現的那一天會紅。
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const b = resolve(dirname(from), spec);
  for (const c of [`${b}.ts`, `${b}.tsx`, join(b, "index.ts"), join(b, "index.tsx"), b]) {
    try {
      if (statSync(c).isFile()) return c;
    } catch { /* not a file */ }
  }
  return null;
}

/** 只回**執行期還在**的相對 import 邊（型別邊被 tsc/esbuild 抹掉，不算）。 */
function runtimeDeps(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
  const out: string[] = [];
  for (const st of src.statements) {
    let spec: ts.Expression | undefined;
    let typeOnly = false;
    let names: ts.NodeArray<{ isTypeOnly: boolean }> | undefined;
    if (ts.isImportDeclaration(st)) {
      spec = st.moduleSpecifier;
      const c = st.importClause;
      if (c) {
        typeOnly = c.isTypeOnly;
        if (!c.name && c.namedBindings && ts.isNamedImports(c.namedBindings)) names = c.namedBindings.elements;
      }
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
      spec = st.moduleSpecifier;
      typeOnly = st.isTypeOnly;
      if (st.exportClause && ts.isNamedExports(st.exportClause)) names = st.exportClause.elements;
    }
    if (!spec || !ts.isStringLiteral(spec)) continue;
    if (names && names.length > 0 && names.every((n) => n.isTypeOnly)) typeOnly = true;
    if (typeOnly) continue;
    const t = resolveSpec(file, spec.text);
    if (t) out.push(t);
  }
  return out;
}

describe("GH#1098 執行期 import 迴圈", () => {
  it("★ content/** 不可以站在任何一條執行期 import 迴圈上", () => {
    const files = walk(SRC);
    const known = new Set(files);
    const g = new Map(files.map((f) => [f, runtimeDeps(f).filter((d) => known.has(d))]));

    // 走一次 DFS，回報第一條**含 content/ 成員**的迴圈（含完整路徑，逐檔指名）。
    const state = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const cycles: string[][] = [];
    const dfs = (v: string): void => {
      state.set(v, 1);
      stack.push(v);
      for (const w of g.get(v) ?? []) {
        if (state.get(w) === 1) cycles.push(stack.slice(stack.indexOf(w)).concat(w));
        else if (!state.has(w)) dfs(w);
      }
      stack.pop();
      state.set(v, 2);
    };
    for (const f of files) if (!state.has(f)) dfs(f);

    const R = (p: string) => relative(SRC, p);
    const guilty = cycles.filter((c) => c.some((f) => R(f).startsWith("content/")));
    expect(
      guilty.map((c) => c.map(R).join("\n      -> ")),
      "content/ 站上了執行期 import 迴圈 —— schema 在模組本體組 Zod，半途求值會讓 shape 變 undefined（症狀離病灶很遠：validateDoc 的 keyValidator._parse is not a function）。⭐ 修法是把共用常數搬到一個不 import 任何東西的葉子模組，⛔ 不是把 const 搬到檔案上面。",
    ).toEqual([]);
  });
});
