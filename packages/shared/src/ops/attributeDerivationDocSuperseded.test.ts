/**
 * 📕 **`docs/_attribute-derivation-248.md` 的 SUPERSEDED 標頭 vs 出貨現況** —— GH#758 的閘。
 *
 * ## 為什麼標頭本身需要一條閘
 * 標頭的用途是「告訴讀者**現行**規則是什麼」。⭐ 它一旦過期就**比沒有標頭更危險** ——
 * 沒有標頭的讀者會去查證，有標頭的讀者會直接相信。
 * ⚠️ 而這份 doc 的病灶正是「一句 2026-07-26 的話活過了它的保存期限」（第三守則），
 * ⛔ 用同一種會過期的散文去修它，只是把保存期限往後推一個月。
 *
 * ## 它問的是**兩個名詞的關係**
 * 標頭宣稱「71 份 champion · critDamage 全部 1.75 · `as` 上限 {4,10}」——
 * ⭐ 逐條拿**出貨的檔案**去對。⛔ 不是 grep「有沒有 SUPERSEDED 這個字」
 * （空殼標頭貼上那個字也會過）。
 *
 * ⚠️ **第二份同型的守衛**（第一份是 `killBountyDocSuperseded.test.ts`）。
 * ⭐ 第三份出現時就抽模板（第零守則⑨：N 個同型 = K 個模板 + 一張表），
 * ⛔ 兩份還不值得 —— 它們宣稱的東西住在完全不同的出貨檔裡。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · 把標頭的「**71/71 份**」改成「**80/80 份**」→ 這一條紅並指名那個數字。實測過。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOC = "docs/_attribute-derivation-248.md";

/** 標頭 ＝ 檔案開頭那一段連續的 `>` 引言塊。 */
function header(text: string): string {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.startsWith(">")) out.push(raw);
    else if (out.length > 0 && raw.trim() !== "") break;
  }
  return out.join("\n");
}

describe("#248 決策稿的 SUPERSEDED 標頭要對得上出貨 (attribute-derivation-doc-superseded)", () => {
  it("⭐ 標頭宣稱的三件事逐條等於出貨（⛔ 不是「有沒有 SUPERSEDED 這個字」）", () => {
    const head = header(readFileSync(join(ROOT, DOC), "utf8"));
    expect(head, `${DOC} 開頭沒有 SUPERSEDED 標頭 —— GH#758 的成果被刪掉了`).toContain("SUPERSEDED");

    const champDir = join(ROOT, "content/champions");
    const champs = readdirSync(champDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    const crit = new Set(
      // ⚠️ 它住 `.baseStats.critDamage`，⛔ 不是頂層 —— 第一版寫錯路徑，讀到 71 個 undefined
      //    而斷言**照樣紅**（訊息說「出貨是 undefined」）⇒ ⭐ 那正是它該有的行為：
      //    ⛔ 讀不到就要紅，不可以靜默當成「沒有宣稱」。
      champs.map(
        (f) =>
          (JSON.parse(readFileSync(join(champDir, f), "utf8")) as { baseStats?: { critDamage?: number } })
            .baseStats?.critDamage,
      ),
    );
    const caps = JSON.parse(readFileSync(join(ROOT, "content/config/stat-caps.json"), "utf8")) as {
      caps?: Record<string, { base?: number; unlocked?: number }>;
    };
    const as = caps.caps?.["as"] ?? {};

    // ⭐ 夾具前提：母體壞了（讀到 0 份）就讓它紅，⛔ 不是讓斷言變成空轉（失敗形態③）。
    expect(champs.length, "讀不到任何 champion —— 母體壞了").toBeGreaterThan(10);

    const stale: string[] = [];
    const claim = (re: RegExp, actual: string, what: string): void => {
      const m = head.match(re);
      if (m === null) stale.push(`${DOC} 標頭撈不到「${what}」的宣稱 —— 錨被改寫了`);
      else if (m[1] !== actual) stale.push(`${DOC} 標頭說 ${what} = ${m[1]}，而出貨是 ${actual}`);
    };
    claim(/\*\*(\d+)\/\1 份\*\*/, `${champs.length}`, "champion 份數（critDamage 一致的那一句）");
    claim(/`critDamage` = \*\*([\d.]+)\*\*/, `${[...crit][0]}`, "critDamage");
    claim(/`as` 已是 `\{ base: (\d+)/, `${as.base}`, "as.base");
    claim(/`as` 已是 `\{ base: \d+, unlocked: (\d+)/, `${as.unlocked}`, "as.unlocked");
    if (crit.size !== 1) stale.push(`出貨的 critDamage 有 ${crit.size} 種值，而標頭說「全部一致」`);

    expect(
      stale.join("\n"),
      "SUPERSEDED 標頭一旦過期就比沒有標頭更危險（讀者會直接相信它）。\n" +
        `→ 出貨值住 content/champions/*.json 與 content/config/stat-caps.json；\n` +
        `→ 把 ${DOC} 標頭那一格改成新的數字。⛔ 不要改這條測試。\n`,
    ).toBe("");
  });
});
