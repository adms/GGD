/**
 * ⭐ 長期文件裡引用的「產生器指令」與「守衛測試檔」**必須真的存在**。
 *
 * WHY THIS EXISTS —— 2026-09-10 抓到 `assetpin:check`:
 *
 *   ① #1126 的 Scope 寫「⋯＋**兩條閘**」⇒ 我在契約裡替那兩條閘**取了名字**
 *   ② 名字被抄進 **#1127 AC②** 與 **#1128 六項驗收第 1 項**
 *   ③ ⭐ #1126 後來被**刻意關掉**(CF 架構讓「釘住 S3 版本」的風險結構上消失)
 *      ⛔ 而那兩處**沒有跟著改**
 *   ④ ⛔ 我 2026-09-10 把六項改寫成 CF 版時**原封抄了它一次**
 *
 * ⇒ ⭐ **一個從未存在的指令,活成了兩張票的驗收條件。**
 * ⚠️ 它比一般的過期散文更難發現:⛔ 它讀起來像「另一邊已經有的東西」。
 * ⭐ 而第三守則講的正是這個:「看到『已驗證』『see xxx.test.ts』先確認那個檔真的存在」——
 *   ⛔ 而那是**判準**,這份文件記過五次判準失效。
 *
 * ── ⭐ 兩把尺,而**收斂的過程本身是這條測試的一部分** ──────────────────
 * ⚠️ 第一版掃「反引號裡的 `x:y`」⇒ **165 個誤報**(`alpha:false`/`attr:agi`/`art:caster`
 *    全是欄位值)。第二版改掃「`pnpm x:y`」⇒ 只吃兩段 ⇒ ⛔ 把 `editor:proof:capture`
 *    截成 `editor:proof` 而**誤報對外契約文件在說謊**。
 * ⇒ ⭐ 定案:**反引號裡、以本 repo 產生器動詞結尾**的名字(`:build`/`:check`/…)。
 *   105 次引用 → 2 個不存在,⭐ 而其中一個正是要抓的那一個。
 *
 * ⛔ 掃的**不是**全部文件:`_reports/`／`_temp_`／`_release/`／`_daily/`／`legacy/`
 * 是當時的快照,⭐ 它們**本來就會提到當時存在而現在沒有的東西**。
 * ⇒ 這條只管**人會回去讀的長期文件**。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const SKIP = ["/legacy/", "/_overwrites/", "/_reports/", "/_release/", "/_daily/", "_temp_"];

function walk(dir: string, ext: readonly string[], hits: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return hits;
  }
  for (const name of entries.sort()) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, ext, hits);
    else if (ext.some((e) => name.endsWith(e))) hits.push(p);
  }
  return hits;
}

/** ⭐ package.json 的 scripts —— 根目錄 ＋ 每一個子專案。 */
function allScripts(): Set<string> {
  const out = new Set<string>();
  // ⚠️ ⭐ **這一行第一版漏了 `tools/`** —— ⇒ `map:gen` 被誤報成「不存在」。
  //   ⭐ 分母漏一塊,結論就會指著一份**沒有說謊**的文件說它說謊。
  const files = [
    "package.json",
    ...walk(join(ROOT, "apps"), ["package.json"]),
    ...walk(join(ROOT, "packages"), ["package.json"]),
    ...walk(join(ROOT, "tools"), ["package.json"]),
  ];
  for (const rel of files) {
    const p = rel.startsWith("/") ? rel : join(ROOT, rel);
    try {
      const j = JSON.parse(readFileSync(p, "utf8")) as { scripts?: Record<string, unknown> };
      for (const k of Object.keys(j.scripts ?? {})) out.add(k);
    } catch {
      /* 沒有 scripts 就跳過 */
    }
  }
  return out;
}

const durableDocs = (): string[] =>
  [...walk(join(ROOT, "docs"), [".md"]), join(ROOT, "CLAUDE.md")].filter(
    (p) => !SKIP.some((s) => p.includes(s)),
  );

/**
 * ⭐ 剝掉 `「…」` —— ⛔ **引用一句過期的舊宣稱不是一個宣稱。**
 *
 * ⚠️ 兩個實例(兩個都是這條閘自己抓出來的):
 *   · `素材庫與-S3-統一資源庫.md` 用「⋯＋ **`assetpin:check` 綠**」引述**它自己剛推翻的**那一句
 *   · `英雄屬性正規化計畫.md` 用「從 `nightPact.test.ts` 承接」交代一段**歷史**
 * ⇒ ⭐ 兩者都是在**記錄一個已死的名字**,⛔ 而不是在說它活著。
 *
 * ⭐ 這與 CLAUDE.md 第〇·六守則「`「」` 裡面是**角色對白**,不是效果」是**同一條規矩**——
 *   ⭐ 而這是它的第三個載體(技能說明 → 後台布林散文 → 文件裡的證據指標)。
 * ⚠️ 用等長空白替換,⛔ 不改變位移(訊息裡的行號才對得上)。
 */
const stripQuotes = (text: string): string => text.replace(/「[^」]*」/g, (m) => " ".repeat(m.length));

const VERBS = "build|check|apply|export|sync|gen|refresh|stamp|json|provenance";
const CMD = new RegExp("`([a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)*:(?:" + VERBS + "))`", "g");
const TEST = /`([A-Za-z][A-Za-z0-9_.-]*\.test\.(?:ts|tsx|py|mts))`/g;

/**
 * ⭐ 豁免表 —— ⛔ 每一列都要有**能被反駁的理由**,⛔ 不是「還沒收」。
 * ⚠️ 棘輪:這張表**只能變短**。加一列要在 commit 訊息裡說為什麼。
 */
const EXEMPT_CMD: Record<string, string> = {
  "lod:gen": "需求稽核表裡的**待辦項名稱**（`requirements-status.md` / `_requirements-audit-gaps.md`）——⭐ 它記的是「還沒做的東西叫什麼」，⛔ 不是「跑這個指令」。",
};
const EXEMPT_TEST: Record<string, string> = {
  "grab.test.ts": "`docs/design/grab-family.md` §5.4 標題逐字是「**會證明它的**測試」——⭐ 未來式的設計稿，⛔ 不是宣稱它存在。",
  "displace.test.ts": "同上（同一節同一行）。",
  "chain.test.ts": "同上（同一節同一行）。",
  "grabFraming.test.ts": "同一份設計稿的同一族未來式引用。",
  "nightPact.test.ts": "`英雄屬性正規化計畫.md:1141` 逐字寫「守衛 `deathWard.test.ts`（2026-08-19 **從 `nightPact.test.ts` 承接**）」——⭐ 它引用的是**被承接掉的舊測試**,那是歷史。⚠️ ⭐ 它落在**全形括號**裡而不是 `「」` ⇒ `stripQuotes` 碰不到它 —— ⛔ 而我**不把過濾器改得更聰明**:一條會去猜「這句是不是歷史」的正則,下一次就會猜錯方向。⇒ 走豁免表,帶理由。",
};

describe("長期文件引用的指令與守衛都要真的存在", () => {
  const docs = durableDocs();
  const scripts = allScripts();
  const tests = new Set(
    [...walk(join(ROOT, "packages"), [".test.ts", ".test.tsx", ".test.mts"]),
     ...walk(join(ROOT, "apps"), [".test.ts", ".test.tsx", ".test.mts"]),
     ...walk(join(ROOT, "tools"), [".test.ts", ".test.py", ".test.mts"])].map((p) => p.slice(p.lastIndexOf("/") + 1)),
  );

  it("⭐ 母體沒有塌掉（⛔ 0 個「看過」讀起來跟全過一樣）", () => {
    expect(docs.length, "長期文件").toBeGreaterThan(100);
    expect(scripts.size, "package.json scripts").toBeGreaterThan(200);
    expect(tests.size, "測試檔").toBeGreaterThan(500);
  });

  it("⛔ 不可以引用一支不存在的產生器指令", () => {
    const bad: string[] = [];
    for (const p of docs) {
      const body = stripQuotes(readFileSync(p, "utf8"));
      for (const m of body.matchAll(CMD)) {
        const name = m[1]!;
        if (scripts.has(name) || name in EXEMPT_CMD) continue;
        bad.push(`${p.slice(ROOT.length + 1)}: \`${name}\` —— package.json 裡沒有這一支`);
      }
    }
    expect(
      [...new Set(bad)].join("\n"),
      "⛔ 一個不存在的指令被寫成證據 —— ⭐ 要嘛去做它，要嘛換成一個**今天跑得起來**的證據，" +
        "⛔ 要嘛進 EXEMPT_CMD 並寫下一個能被反駁的理由。",
    ).toBe("");
  });

  it("⛔ 不可以引用一份不存在的守衛測試", () => {
    const bad: string[] = [];
    for (const p of docs) {
      const body = stripQuotes(readFileSync(p, "utf8"));
      for (const m of body.matchAll(TEST)) {
        const name = m[1]!;
        if (tests.has(name) || name in EXEMPT_TEST) continue;
        bad.push(`${p.slice(ROOT.length + 1)}: \`${name}\` —— repo 裡沒有這個檔`);
      }
    }
    expect(
      [...new Set(bad)].join("\n"),
      "⛔ 第三守則:「看到 see xxx.test.ts 先確認那個檔真的存在」—— ⭐ 這一條就是它的機器版。",
    ).toBe("");
  });

  it("⭐ 量尺自證:四個方向（⛔ 一個門檻證明不了它抓得到）", () => {
    const probe = (text: string, re: RegExp): string[] => [...text.matchAll(re)].map((m) => m[1]!);
    // ① 已知**有**:動詞結尾的名字抓得到
    expect(probe("跑 `foo:build` 就好", CMD)).toEqual(["foo:build"]);
    // ② 已知**沒有**:欄位值不可以被當成指令（⭐ 這是 165 個誤報的來源）
    expect(probe("`alpha:false` `attr:agi` `art:caster`", CMD)).toEqual([]);
    // ③ ⭐⭐ 三段的名字**絕對不可以被截成兩段** —— ⛔ 截了就會誤報對外契約在說謊。
    //   ⚠️ `capture` 不是產生器動詞 ⇒ ⭐ 這條尺**刻意不認**整個名字(那是對的:它不是一支閘),
    //   ⛔ 而它更不可以吐出 `editor:proof` 這個**前綴**。⇒ 斷言的是**後者**。
    expect(probe("`editor:proof:capture`", CMD)).not.toContain("editor:proof");
    // ④ 測試檔名抓得到，而普通檔名不會
    expect(probe("`a.test.ts` 與 `b.ts`", TEST)).toEqual(["a.test.ts"]);
    // ⑤ ⭐ 引號裡的**歷史**不算宣稱（⛔ 而引號外的同一個字**要**算 —— 兩個方向）
    expect(probe(stripQuotes("在此之前寫著「跑 `dead:check`」"), CMD)).toEqual([]);
    expect(probe(stripQuotes("現在跑 `live:check`"), CMD)).toEqual(["live:check"]);
  });
});
