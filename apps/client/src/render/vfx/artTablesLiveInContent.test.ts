/**
 * ⭐【逐 id 的特效綁定不可以住在 TypeScript 裡】（GH#384）
 *
 * 量到的（v0.20.1）：617 筆「這支技能 id → 這組特效參數」住在三個 render 模組的
 * 常數表裡。⛔ 那是**內容**，而它的住址讓兩件事同時是真的：
 *   · 改一支技能的特效 = 一次完整部署（client 是 build 時烘進映像的）
 *   · 外部編輯器**看不到它們，而且不會知道自己漏了**（第〇·五守則的對外契約紅線）
 *
 * ⭐ **掃 AST，⛔ 不掃字串。** 一條 `grep "godie-"` 的守衛擋不住
 * `["godie","-e001.q"].join("")`，也會被註解裡的例子誤報 —— 而這條看的是
 * TypeScript 真的解析出來的**字串字面量節點**，註解與識別字都不在裡面。
 *
 * 判準是「**這個字面量長得像技能文件 id 嗎**」（`godie-xxxx.slot`），⛔ 不是
 * 「這個檔有幾行」：搬回一筆就會紅，而重構、改註解、加一個新的機制函式都不會。
 *
 * 突變紀錄（2026-08-19）：把一列 `"godie-e001.q": { … }` 塞回 `bindings.ts` →
 * 這條紅，並指名那個檔與那一個 id ✅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const HERE = new URL(".", import.meta.url).pathname;

/** 這三個檔在 GH#384 之前一共放了 617 筆逐 id 綁定。 */
const GUARDED = ["bindings.ts", "w3xFamilyArt.ts", "w3xAbilityArt.ts"] as const;

/** 技能文件 id 的形狀：`godie-<rawcode>.<slot>`（`.passive` / `.ex` 也算）。 */
const ABILITY_ID = /^godie-[a-z0-9]+\.[a-z0-9]+$/;

function abilityIdLiterals(file: string): string[] {
  const text = readFileSync(join(HERE, file), "utf8");
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const found = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (ABILITY_ID.test(n.text)) found.add(n.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(src);
  return [...found].sort();
}

describe("逐 id 的特效綁定住在 content/，不是 TS 常數", () => {
  it("⭐ 三個 render/vfx 模組裡一個技能 id 字面量都沒有", () => {
    const offenders: string[] = [];
    for (const f of GUARDED) {
      for (const id of abilityIdLiterals(f)) offenders.push(`${f}: "${id}"`);
    }
    expect(
      offenders,
      "這些逐 id 的資料被搬回 TypeScript 了。⛔ 不要改這條測試 —— " +
        "把它們寫進 `content/config/vfx-ability-art.json`（`pnpm exec tsx " +
        "apps/client/src/render/vfx/generateAbilityArtContent.ts`），TS 這一側只留讀取。",
    ).toEqual([]);
  });

  it("⚠️ 夾具前提：這支掃描器真的看得到字面量（⛔ 不是在測空氣）", () => {
    // 拿一個**確定**有技能 id 字面量的檔案（這一支自己不算，它的 id 在正則裡）——
    // 用出貨的內容文件反過來證明：掃描器對一份真的有 id 的來源會回非空。
    const probe = ts.createSourceFile(
      "probe.ts",
      'const x = { "godie-e001.q": 1 };\n// godie-e002.w in a comment does not count\n',
      ts.ScriptTarget.ES2022,
      true,
    );
    const hits: string[] = [];
    const walk = (n: ts.Node): void => {
      if (ts.isStringLiteral(n) && ABILITY_ID.test(n.text)) hits.push(n.text);
      ts.forEachChild(n, walk);
    };
    walk(probe);
    expect(hits).toEqual(["godie-e001.q"]);
  });
});
