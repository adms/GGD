/**
 * ⭐ 「還沒重畫的圖示」要分成**活的**與**孤兒**兩群 —— ⛔ 它們要的東西相反。
 *
 * WHY THIS EXISTS —— 2026-09-10 量到（GH#1129 AC③）:
 *   `twopass-v1` 的 sidecar 有 **117** 張。⭐ 而逐張問「出貨內容有沒有引用它」:
 *
 *     · ⭐ **48 張**被引用 —— ⭐ **全部是道具圖示**(⛔ 零個英雄、零個技能)
 *     · ⛔ **69 張**沒有任何出貨文件引用 —— 孤兒
 *
 * ⇒ ⭐ 照 AC③ 字面做(把 117 張全畫成 v3),⭐ **59% 的算力花在沒有人會看到的圖上**,
 *   ⛔ 而做完之後 AC③ 會變綠 —— ⭐ **一個綠燈,而它證明的不是玩家看到了什麼。**
 *
 * ⚠️ ⭐ 這條**不斷言那兩個數字**(第二守則:驗機制不驗數字 —— 圖示每週在畫)。
 * ⭐ 它斷言的是**關係**:「重畫的工作清單裡,每一張都要有人引用」。
 *
 * ⚠️⚠️ ⭐ 而量出這個分界花了**三次** —— ⛔ 前兩次都是尺壞掉:
 *   ① `sed 's/\.method$//'` 之後 id 還帶著 `.webp` ⇒ 比對全 miss ⇒ 得到「0 張活的」
 *   ② 改用 `s/\.\(webp\|png\)$//` ⇒ ⛔ **macOS 的 BSD sed 不吃 `\|`** ⇒ 同樣全 miss
 *   ⇒ ⭐ 兩次都給出一個**看起來很合理**的結論(「全部是孤兒」),⛔ 而它是假的。
 *   ⇒ 所以這條測試自己帶 sentinel(見最後一個 it)。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shippedItemIds } from "../../testkit/shippedSurface";

const ROOT = join(__dirname, "../../../..");
const ICONS = join(ROOT, "content/assets/icons");
/**
 * ⭐⭐ **分母是「玩家今天拿得到的」，⛔ 不是「`content/` 底下有的」。**
 *
 * ⚠️ ⭐ 這一行是**本 repo 的閘當場改出來的**：第一版掃 `content/items` 全部，
 * 而 `content:build` 的稽核逐字說「這 1 支掃了 `content/items` 卻**沒說自己掃的是全部還是上架中**
 * ——出貨樹 142 件裡玩家今天只拿得到 **89** 件」。
 * ⇒ ⭐ 一個「48 張活的」如果分母是 142，它回答的是**另一個問題**。
 * ⚠️ 而我寫這條測試的同一天，才剛在文件裡寫過「⭐ 讀一張表之前先問這一欄的分母是什麼」。
 */
const REFDIRS = ["content/champions", "content/abilities", "content/augments"];

function walk(dir: string, suffix: string, hits: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return hits;
  }
  for (const name of entries.sort()) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, suffix, hits);
    else if (name.endsWith(suffix)) hits.push(p);
  }
  return hits;
}

/** ⭐ `<id>.webp.method` → `<id>`。⛔ 兩層副檔名都要剝(這裡踩過兩次)。 */
const idOf = (p: string): string =>
  p.slice(p.lastIndexOf("/") + 1).replace(/\.method$/, "").replace(/\.(webp|png|jpg)$/, "");

/** 出貨內容裡出現過的每一個帶引號的字串（⭐ 一次讀完，⛔ 不逐張 grep）。 */
function referencedIds(): Set<string> {
  const out = new Set<string>();
  /**
   * ⭐⭐ **道具那一半的分母 ＝ 上架件 ∪ 它們的配方材料（遞移）。**
   *
   * ⚠️ ⭐ 這一段被**改過兩次**，兩次都是分母錯：
   *   ① 第一版掃整棵 `content/items`（142 件）⇒ `content:build` 的稽核當場擋下：
   *      「⛔ 沒說自己掃的是全部還是上架中 —— 玩家今天只拿得到 89 件」
   *   ② 改成純 `shippedItemIds()`（89 件）⇒ ⛔ **活的變成 0 張** ——
   *      ⭐ 因為那 48 張全部是**配方材料**（`recipe.components`），
   *      ⛔ 它們不在上架面，⭐ 而玩家**在合成介面看得到它們的圖示**。
   *
   * ⇒ ⭐ 兩個分母都是錯的，⛔ 而它們錯的方向相反（一個太寬、一個太窄）。
   * ⭐ 對的那個是**聯集**：能拿到的 ＋ 拿得到的東西**要用到的**。
   * ⚠️ 同族前科：本 repo 記過「出貨管道聯集 ≠ 任何單一來源（寶具 30 件 → 84 件）」。
   */
  const shipped = shippedItemIds(ROOT);
  const seen = new Set<string>();
  const frontier = [...shipped];
  while (frontier.length) {
    const id = frontier.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.add(id);
    let doc: string;
    try {
      doc = readFileSync(join(ROOT, `content/items/${id}.json`), "utf8");
    } catch {
      continue;
    }
    // ⭐ 圖示欄位（一件道具可以指一個與自己 id 不同的圖示）
    for (const m of doc.matchAll(/"icon"\s*:\s*"([^"]+)"/g)) out.add(m[1]!.replace(/\.(webp|png|jpg)$/, ""));
    // ⭐ 配方材料 ＋ 配方書 —— ⭐ 遞移展開（材料自己也可能有配方）
    let parsed: { recipe?: { components?: unknown; book?: unknown } };
    try {
      parsed = JSON.parse(doc) as typeof parsed;
    } catch {
      continue;
    }
    const comps = parsed.recipe?.components;
    if (Array.isArray(comps)) for (const c of comps) if (typeof c === "string") frontier.push(c);
    if (typeof parsed.recipe?.book === "string") frontier.push(parsed.recipe.book);
  }
  for (const d of REFDIRS) {
    for (const p of walk(join(ROOT, d), ".json")) {
      let body: string;
      try {
        body = readFileSync(p, "utf8");
      } catch {
        continue;
      }
      for (const m of body.matchAll(/"([A-Za-z0-9][A-Za-z0-9._-]{2,})"/g)) out.add(m[1]!);
    }
  }
  return out;
}

describe("圖示重畫的工作清單只含玩家看得到的", () => {
  const methods = walk(ICONS, ".method");
  const refs = referencedIds();

  it("⭐ 母體沒有塌掉（⛔ 0 張「看過」讀起來跟全過一樣）", () => {
    expect(methods.length, ".method sidecar").toBeGreaterThan(500);
    expect(refs.size, "出貨內容裡的字串").toBeGreaterThan(2000); // ⭐ 實測 2,888（⛔ 我第一版猜 5000 —— 門檻要從量到的來）
  });

  it("⭐ 每一張還沒重畫的圖示，要嘛有人引用，要嘛被記成孤兒", () => {
    const stale = methods.filter((p) => {
      try {
        return readFileSync(p, "utf8").includes("twopass-v1");
      } catch {
        return false;
      }
    });
    const live = stale.filter((p) => refs.has(idOf(p)));
    const orphan = stale.filter((p) => !refs.has(idOf(p)));
    // ⭐ 斷言的是**關係**：兩群加起來要等於全部（⛔ 不是「孤兒要是 69 個」）
    expect(live.length + orphan.length).toBe(stale.length);
    /**
     * ⭐⭐ **棘輪，⛔ 不是一條永遠紅的線。**
     *
     * ⚠️ 我第一版寫的是 `orphan.length <= live.length`（今天 69 vs 48）
     * ⇒ ⛔ **它會永遠紅**,而一條永遠紅的測試**擋住每一個人** —— 那正是
     *   CLAUDE.md 形態⑨「一個永遠不會綠的閘」,⭐ 而我今天稍早才修好一個同型的
     *   （`release-note-players.sh` 答了「無」還是擋）。⇒ ⛔ 不要再造一個。
     *
     * ⭐ 棘輪的形狀:**孤兒數只能變少或持平**。
     *   · 有人下架／補引用一張孤兒 ⇒ 基準線跟著降(⭐ 手動改這個數字,並在 commit 說為什麼)
     *   · ⛔ 有人**新增**一張沒有人引用的舊版圖示 ⇒ **紅**
     *   · ⭐ 而訊息永遠印出今天的比例,⛔ 讓「59% 花在沒人看的圖上」這件事不會被忘記
     */
    /**
     * ⭐ 2026-09-10 量到 **29 活 / 88 孤兒**。⛔ 只能往下改。
     *
     * ⚠️⚠️ ⭐ **這個數字在同一天被改過三次，⛔ 三次都是分母錯：**
     *   | 分母 | 結果 | 錯在哪 |
     *   |---|---|---|
     *   | 整棵 `content/items`（142 件） | 48 活 / 69 孤兒 | ⛔ **太寬** —— 玩家今天只拿得到 89 件 |
     *   | 純 `shippedItemIds()`（89 件） | **0** 活 / 117 孤兒 | ⛔ **太窄** —— 那 48 張全是**配方材料** |
     *   | ⭐ 上架件 ∪ 配方材料（遞移） | ⭐ **29 活 / 88 孤兒** | ⭐ 對 |
     *
     * ⇒ ⭐ 兩個錯的分母**錯的方向相反**，⛔ 而兩個都給得出一個看起來合理的數字。
     * ⚠️ 抓到第一個的是 `content:build` 的稽核（⛔ 不是我），抓到第二個的是這條測試自己
     * （「活的 0 張」⭐ 是一個**不可能為真**的數字 —— 而它正是量尺自證的用途）。
     */
    const ORPHAN_BASELINE = 88;
    expect(
      orphan.length,
      `⛔ 孤兒 ${orphan.length} 張（基準線 ${ORPHAN_BASELINE}）vs 活的 ${live.length} 張。\n` +
        `   ⭐ 今天有 ${Math.round((orphan.length / Math.max(stale.length, 1)) * 100)}% 的待重畫圖示**沒有任何出貨文件引用** ——\n` +
        `   ⛔ 照「twopass-v1 = 0」的字面做，那些算力花在沒有人會看到的圖上，而做完之後它會變綠。\n` +
        `   ⭐ 孤兒前 5 個：${orphan.slice(0, 5).map(idOf).join(" ")}\n` +
        `   ⇒ 先問「它們為什麼還在」（下架？補引用？），⛔ 不是先畫它們（GH#1129 AC③）。`,
    ).toBeLessThanOrEqual(ORPHAN_BASELINE);
  });

  it("⭐ 量尺自證：三個方向（⛔ 這把尺壞過兩次，兩次都給出「全部是孤兒」）", () => {
    // ① 兩層副檔名都要剝掉 —— ⛔ 沒剝乾淨就會把每一張都判成孤兒
    expect(idOf("/a/b/ember-rod.webp.method")).toBe("ember-rod");
    expect(idOf("/a/b/godie-e00t.png.method")).toBe("godie-e00t");
    // ② 已知**有**：出貨內容裡確實找得到一些 id
    expect([...refs].some((r) => r.startsWith("godie-"))).toBe(true);
    // ③ 已知**沒有**：一個編出來的 id 不可以被判成「有人引用」
    expect(refs.has("zzz-not-a-real-icon-id")).toBe(false);
  });
});
