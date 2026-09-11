/**
 * ⭐⭐【出貨的英雄 GLB 逐顆要有人認領，而認領過的要真的還在】(GH#1188)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 兩頭都走（⛔ 一頭必然對其中一種失明 —— 假綠燈⑫）
 * ═══════════════════════════════════════════════════════════════════════════
 *   ① 從 **GLB** 走 → 有沒有人認領它？（⛔ 漏掉「有實體而無宣告」的孤兒）
 *   ② 從 **文件** 走 → 它指的 GLB 還在嗎？（⛔ 漏掉「有宣告而無實體」的斷鏈）
 *
 * ⚠️ CLAUDE.md 逐字記過：隔離區的掃描只從「宣告」那一頭走
 * ⇒ **沒有人宣告的檔永遠不會進迴圈** ⇒ 兩份永久唯讀的孤兒結構上看不見。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️⚠️ 三個排除條件，⭐ 每一個都是**量過**才排的（⛔ 不是為了讓它變綠）
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⓵ `versions/` 凍結副本 —— 它們是「這顆模型被換過」的紀錄，⛔ 不是新資產
 *  ⓶ **LOD 變體**（`-mid` / `-small` / `-low` / `-lod<N>`）—— 依**命名慣例**載入，
 *     ⛔ 本來就不該各有一份文件。量到 **110** 顆，⛔ 把它們算成孤兒會讓這條閘變成噪音
 *  ⓷ ⭐ **被 `content/vfx/` 引用的** —— 同一顆 mdx 有**兩種合法的表達**
 *     （`model@1` 與 `vfx@1`）。量到 12 顆「孤兒」裡 **11 顆**其實是 vfx
 *     （`bloodbreathstream` · `lightningnova` · `flash` …）。
 *     ⚠️ CLAUDE.md 逐字記過這個陷阱：GH#565／#674 的假前提就是
 *     「⛔ 那個路徑不存在」被讀成「⛔ 那個東西不存在」，而它活過了**五則**稽核留言。
 *
 * ⇒ ⭐ 三個排除做完之後：納入 **326** 顆，真的沒人認領的剩 **6** 顆。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CONTENT = join(ROOT, "content");
/** ⭐ 只管**英雄身體**那幾個目錄 —— 場景道具（hex / props / scenery-cc0）依路徑載入，⛔ 本來就沒有 `model@1`。 */
const HERO_DIRS = ["assets/models/ou99/", "assets/models/community/", "assets/models/imported/", "assets/models/champions/"];
const LOD = /-(mid|small|low|lod\d)\.glb$/;

/** ⛔ 只能變小。⭐ 修掉一顆就把數字改小並 commit，否則棘輪會鬆掉。 */
const UNCLAIMED_BASELINE = 6;
/** ⛔ 同上。⚠️ 英雄層級的同型棘輪在 `heroModelGlbExists.test.ts`（38 隻）—— ⭐ 這裡是**模型文件**層級，粒度不同。 */
const BROKEN_LINK_BASELINE = 41;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".glb")) out.push(relative(CONTENT, full));
  }
  return out;
}

function modelDocs() {
  return readdirSync(join(CONTENT, "models"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(CONTENT, "models", f), "utf8")) as { id: string; glbPath?: string });
}

/** ⭐ `content/vfx/` 的全文 —— ⛔ 刻意讀全文而不解析 schema：vfx 引用模型的欄位不只一個。 */
function vfxBlob(): string {
  const dir = join(CONTENT, "vfx");
  return readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
}

describe("出貨 GLB 的認領關係（GH#1188）", () => {
  const docs = modelDocs();
  const claimed = new Set(docs.map((d) => d.glbPath).filter(Boolean) as string[]);
  const vfx = vfxBlob();
  const shipped = walk(join(CONTENT, "assets", "models"))
    .filter((p) => !p.includes("/versions/"))
    .filter((p) => HERO_DIRS.some((d) => p.startsWith(d)))
    .filter((p) => !LOD.test(p));

  const unclaimed = shipped.filter((p) => !claimed.has(p) && !vfx.includes(p.split("/").pop()!.slice(0, -4)));
  const broken = docs.filter((d) => d.glbPath && !existsSync(join(CONTENT, d.glbPath))).map((d) => d.id);

  it("⭐ 量尺自證：兩頭都真的走得到，⛔ 而且排除條件沒有把全部都排掉", () => {
    expect(docs.length, "⛔ 一份 model 文件都沒讀到").toBeGreaterThan(300);
    expect(shipped.length, "⛔ 排除完之後一顆 GLB 都不剩 ⇒ 這條閘什麼都沒在問").toBeGreaterThan(200);
    expect(vfx.length, "⛔ content/vfx 讀成空的 ⇒ 排除條件⓷失效,會誤報一整批特效模型").toBeGreaterThan(1000);
    // ⭐ 反向自證：一顆**真的有文件**的 GLB 不可以被算成孤兒。
    const withDoc = docs.find((d) => d.glbPath && shipped.includes(d.glbPath));
    expect(withDoc, "⛔ 納入的範圍裡一顆有文件的都沒有 ⇒ 路徑比對壞了").toBeTruthy();
    expect(unclaimed).not.toContain(withDoc!.glbPath!);
  });

  it("① ⛔ 沒有人認領的出貨 GLB 不可以變多（⭐ 棘輪）", () => {
    expect(
      unclaimed.length,
      `⛔⛔ 沒有人認領的出貨 GLB 從 ${UNCLAIMED_BASELINE} 變成 ${unclaimed.length}：\n` +
        unclaimed.map((p) => `   · ${p}`).join("\n") +
        "\n⇒ ⭐ 一顆沒有 `model@1` 也沒有被 `content/vfx/` 引用的 GLB，" +
        "**後台與編輯器都列不出來** ⇒ 它出貨了而沒有任何人拿得到它。\n" +
        "⇒ 補一份 `model@1`（或讓它被某個 vfx 引用）。" +
        `⭐ 修少了就把 UNCLAIMED_BASELINE 改成 ${unclaimed.length}。`,
    ).toBeLessThanOrEqual(UNCLAIMED_BASELINE);
  });

  it("② ⛔ 指向不存在 GLB 的 model 文件不可以變多（⭐ 反方向的棘輪）", () => {
    expect(
      broken.length,
      `⛔⛔ 指到不存在 GLB 的 model 文件從 ${BROKEN_LINK_BASELINE} 變成 ${broken.length}。\n` +
        `   前幾筆：${broken.slice(0, 5).join("、")}\n` +
        "⇒ ⭐ 這一半就是**體素替身**的來源（英雄層級的棘輪在 `heroModelGlbExists.test.ts`）。\n" +
        `⭐ 修少了就把 BROKEN_LINK_BASELINE 改成 ${broken.length}。`,
    ).toBeLessThanOrEqual(BROKEN_LINK_BASELINE);
  });
});
