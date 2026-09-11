/**
 * ⭐⭐【每一顆出貨的模型都要說得出它從哪來】(GH#1234)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 抓到的：129 顆**正在出貨**的第三方模型，出處紀錄是 **0 筆**
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-11 量到：
 *   `ls content/models/ou99.*.json`        → **129**
 *   `grep -ci 'ou99' content/assets/CREDITS.md` → **0**
 *
 * ⚠️ 而它們**不是**躺著沒人用：綁在英雄卡上、在後台與編輯器的模型下拉選單裡、
 * `heroBody: true`。⭐ 而且 `community`（75 顆）也是 0 筆。
 *
 * ⭐ **這與第一·四守則是同一條線**：「有就用，沒有才 CC0/CC-BY，再沒有才自己生成」——
 * 那條守則**預設每一階都留得下出處**，⛔ 而這批在出處那一份裡不存在。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 兩個方向（⛔ 一頭會漏掉孤兒 —— 假綠燈⑫）
 * ═══════════════════════════════════════════════════════════════════════════
 *   ① 有檔**無出處** ⇒ 紅 —— ⭐ 這條接住**下一批**外部模型
 *   ② 有出處**無檔**  ⇒ 紅 —— ⛔ 否則清單會慢慢與世界脫節，而脫節的清單會讓①失效
 *
 * ⚠️ ⭐ 從「宣告」那一頭走，永遠看不到**沒有人宣告**的檔（它不會進迴圈）——
 * CLAUDE.md 逐字記過這個形狀：隔離區的掃描因此漏掉兩份永久唯讀的孤兒。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CONTENT = join(ROOT, "content");
const CREDITS = join(CONTENT, "assets", "CREDITS.md");

function modelDirs(): Map<string, number> {
  const out = new Map<string, number>();
  for (const file of readdirSync(join(CONTENT, "models"))) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(CONTENT, "models", file), "utf8")) as { glbPath?: string };
    if (!doc.glbPath) continue;
    const dir = dirname(doc.glbPath);
    out.set(dir, (out.get(dir) ?? 0) + 1);
  }
  return out;
}

/**
 * ⭐ `CREDITS.md` 裡**逐列宣告過**的模型目錄。
 *
 * ⚠️⚠️ ⛔ 這一支的第一版是 `credits.includes(dir)` —— **而它擋不住任何東西**：
 * 突變驗證當場證明了兩件事（⭐ 兩個都是我自己在檔頭警告過的形狀）：
 *   ① 把 `ou99` 那一**列**刪掉 ⇒ 仍然綠，因為 `models/ou99/` 還寫在**節標題**裡
 *      ⇒ ⛔ 它量到的是「這個字串出現過」，⛔ 不是「這一列還在」
 *   ② 塞一個**不存在**的目錄進表 ⇒ 仍然綠，因為反方向的迴圈走的是
 *      **模型文件**那一頭 ⇒ ⛔ 一個沒有檔的宣告**永遠不會進迴圈**（假綠燈⑫）
 * ⇒ ⭐ 所以現在它**解析表格列**，而反方向從**這份清單**走。
 */
function declaredDirs(credits: string): Set<string> {
  const out = new Set<string>();
  for (const line of credits.split("\n")) {
    // ⭐ 形式一：表格列（新的第三方那一節用的）
    if (line.startsWith("|")) {
      const row = /^\|\s*`((?:assets\/)?models\/[A-Za-z0-9_\-./]+?)\/?`\s*\|/.exec(line);
      if (row) out.add(row[1]!.replace(/^assets\//, ""));
      continue;
    }
    // ⭐ 形式二：節標題 `## Characters (\`models/champions/*.glb\`)` —— 這份檔案原本的寫法。
    //    ⛔ 不要把它排除掉：那三節（champions / guardians / hex）**本來就寫得很完整**，
    //    ⭐ 而一條把既有的好紀錄也判成缺口的閘，會在第一天就被關掉。
    if (line.startsWith("#")) {
      for (const m of line.matchAll(/`((?:assets\/)?models\/[A-Za-z0-9_\-./]+?)\/\*/g)) {
        out.add(m[1]!.replace(/^assets\//, ""));
      }
    }
  }
  return out;
}

/** ⭐ 比對一律正規化掉 `assets/` 前綴 —— 兩邊的寫法不一致是這一族最常見的假紅。 */
const norm = (dir: string) => dir.replace(/^assets\//, "");

describe("出貨模型的出處（GH#1234）", () => {
  const credits = existsSync(CREDITS) ? readFileSync(CREDITS, "utf8") : "";
  const dirs = modelDirs();
  const declared = declaredDirs(credits);

  it("⭐ 量尺自證：真的掃到模型與多個來源目錄，⛔ 而且 CREDITS 讀得到", () => {
    // ⛔ 沒有這一條，一個回空 Map 的掃描會讓下面兩條**結構上永遠綠**。
    const total = [...dirs.values()].reduce((a, b) => a + b, 0);
    expect(total, "⛔ 一顆模型都沒掃到 —— 路徑或欄位名錯了").toBeGreaterThan(200);
    expect(dirs.size, "⛔ 只認得一個來源目錄 ⇒ 分類壞了").toBeGreaterThan(3);
    expect(credits.length, "⛔ CREDITS.md 讀成空的").toBeGreaterThan(1000);
    // ⭐ 反向自證：一個**不存在**的目錄不可以被判成「有出處」。
    expect(declared.has("models/definitely-not-a-real-dir"),
      "⛔ 不存在的目錄被判成有出處 ⇒ 比對太寬，這條閘什麼都攔不住").toBe(false);
    // ⭐ 而**已知宣告過**的那一個要解析得到 —— ⛔ 只驗前者的話一個回空集合的解析也會過。
    expect(declared.has("models/ou99"),
      "⛔ 連表格裡真的有的那一列都解析不到 ⇒ 表格解析壞了").toBe(true);
  });

  it("① ⛔ 有檔而 CREDITS 說不出它從哪來 ⇒ 紅（⭐ 這條接住下一批）", () => {
    const orphans = [...dirs.entries()]
      .filter(([dir]) => !declared.has(norm(dir)))
      .map(([dir, n]) => `${dir}（${n} 顆）`);
    expect(
      orphans,
      "⛔⛔ 這幾個目錄底下有**正在出貨**的模型，而 `content/assets/CREDITS.md` 裡找不到它們的出處。\n" +
        "⭐ 出貨第三方資產而沒有出處紀錄，是這個專案唯一不該省的一件事" +
        "（第一·四守則預設每一階都留得下出處）。\n" +
        "⇒ 在 CREDITS.md 補一節，寫**來源站點 · 取得方式 · 權利人立場 · 哪些英雄在用**。\n" +
        "⛔ 不要改這條測試。⛔ 也不要編一個授權說法 —— 說不出來就明說說不出來。",
    ).toEqual([]);
  });

  it("② ⭐ CREDITS 宣告過的模型目錄，磁碟上要真的還有東西（⛔ 反方向，否則①會失效）", () => {
    // ⭐ 從**宣告**那一頭走（⛔ 不是從模型文件那一頭）——
    //    ⛔ 一個沒有檔的宣告永遠不會出現在 `dirs` 裡,那正是假綠燈⑫。
    const stale = [...declared]
      .filter((dir) => !existsSync(join(CONTENT, "assets", dir)) && !existsSync(join(CONTENT, dir)));
    expect(
      stale,
      "⭐ CREDITS.md 還在講這幾個目錄，⛔ 而磁碟上已經沒有了 ⇒ 把那幾列刪掉。\n" +
        "⛔ 一張與世界脫節的出處清單，會讓上面那條「有檔無出處」開始放行真的缺口。",
    ).toEqual([]);
  });
});
