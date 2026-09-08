/**
 * 🔁 GH#1098 —— `content/schema/**` 不可以有**執行期 import 環**。
 *
 * ## ⛔ 票文的診斷今天**不成立**（2026-09-09 實測）
 *
 * 票文說「環狀 import 讓 editor 測試偶發整檔炸掉（HEAD 6 跑 1 中）」。
 * ⭐ 逐檔解析 182 個 schema 檔的 **395 條值 import 邊**（⛔ 跳過 `import type` ——
 * 那是型別，被 TS 抹掉，⛔ 造不成執行期環）⇒ **零個真環**。
 * ⭐ 而 `apps/editor/src/export-center/` **連跑 20 次：20 綠 0 紅**。
 *
 * ⇒ ⭐ 那個偶發**不是環造成的**（或它已經被別的改動修掉了）。
 * ⚠️ ⭐ 而這條閘仍然值得留下 —— ⛔ 不是為了那張票，是為了**下一個環**：
 * `victoryPodium.ts` 的 TDZ 與 `zVfxCollectionDoc` 的 `keyValidator._parse`
 * 都是「模組被重入」的典型症狀，⭐ 而它們在爆的時候**指的是別的檔**
 * （`loader.ts:340` 是爆點，⛔ 不是病灶）。⇒ 環要在**加進來的那一刻**紅，
 * ⛔ 不是等某一次 6 跑 1 中。
 *
 * 突變驗證（2026-09-09）：在 `config/index.ts` 加一行
 * `import { zConfigAssetCdnDoc } from "./assetCdn"` 而讓 `assetCdn.ts`
 * 反過來 `import { … } from "./index"` → 紅並指名那兩個檔。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const ROOT = resolve(join(__dirname, "schema"));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".ts") && !e.includes(".test.")) out.push(p);
  }
  return out;
}

/** ⭐ 只收**值** import —— `import type` 被 TS 抹掉，⛔ 造不成執行期環。 */
const VALUE_IMPORT = /^[ \t]*(?:import|export)(?![ \t]+type\b)[^;]*?\bfrom[ \t]+"(\.[^"]+)"/gm;

function edges(): Map<string, Set<string>> {
  const g = new Map<string, Set<string>>();
  for (const f of walk(ROOT)) {
    const src = readFileSync(f, "utf-8");
    const set = new Set<string>();
    for (const m of src.matchAll(VALUE_IMPORT)) {
      const base = resolve(dirname(f), m[1]!);
      // ⭐ 兩種解析都試（`./x` → `x.ts` 或 `x/index.ts`），⛔ 而**先試檔案**：
      //   `arenaRules.mobWaves` 若先試目錄會被解成 `arenaRules` —— 我第一版就這樣
      //   得到一個假的自指環。
      for (const cand of [`${base}.ts`, join(base, "index.ts")]) {
        try {
          if (statSync(cand).isFile()) {
            const rel = relative(ROOT, cand);
            if (!rel.startsWith("..")) set.add(rel);
            break;
          }
        } catch {
          /* 不存在就試下一個 */
        }
      }
    }
    g.set(relative(ROOT, f), set);
  }
  return g;
}

describe("schema 樹沒有執行期 import 環（GH#1098）", () => {
  it("⛔ 零個環 —— 有的話指名那一圈", () => {
    const g = edges();
    const cycles: string[] = [];
    const seen = new Set<string>();
    const dfs = (n: string, stack: string[]): void => {
      for (const m of [...(g.get(n) ?? [])].sort()) {
        const i = stack.indexOf(m);
        if (i >= 0) {
          cycles.push([...stack.slice(i), m].join(" → "));
          continue;
        }
        if (stack.length > 14) continue;
        dfs(m, [...stack, m]);
      }
    };
    for (const n of [...g.keys()].sort()) {
      if (seen.has(n)) continue;
      seen.add(n);
      dfs(n, [n]);
    }
    expect(
      [...new Set(cycles)],
      "⛔ schema 樹出現執行期 import 環。\n" +
        "  ⭐ 症狀不會指向這裡：它會變成別的檔的 TDZ（`PODIUM_CLIP_OPTS`）\n" +
        "  或 Zod 的 `keyValidator._parse is not a function` —— ⛔ 而爆點是 `loader.ts`。\n" +
        "  ⭐ 修法：把共用的常數抽成第三個檔，⛔ 不是改成 `import type`（若它是值）。",
    ).toEqual([]);
  });

  it("⭐ 這把尺自己會動（⛔ 不是掃到零個就永遠綠）", () => {
    const g = edges();
    const files = g.size;
    const links = [...g.values()].reduce((n, s) => n + s.size, 0);
    // ⛔ 不釘死數字（會隨內容變），⭐ 只釘「它真的看到了一棵樹」——
    //   路徑解析壞掉時 links 會塌成 0，而第一條會靜靜地綠。
    expect(files, "掃不到 schema 檔 —— 路徑錯了").toBeGreaterThan(50);
    expect(links, "一條邊都沒解析到 ⇒ 第一條斷言是空的（⭐ 這是校準，⛔ 不是統計）").toBeGreaterThan(100);
  });
});
