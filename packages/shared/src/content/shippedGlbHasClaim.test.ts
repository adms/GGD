/**
 * ⭐⭐【出貨的英雄 GLB 逐顆要有人認領，而認領過的要真的還在】(GH#1188)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 兩頭都走（⛔ 一頭必然對其中一種失明 —— 假綠燈⑫）
 * ═══════════════════════════════════════════════════════════════════════════
 *   ① 從 **GLB** 走 → 有沒有人認領它？（⛔ 漏掉「有實體而無宣告」的孤兒）
 *   ② 從 **文件** 走 → 它指的 GLB 還在嗎？（⛔ 漏掉「有宣告而無實體」的斷鏈）
 *
 * ⭐ 認領有兩種合法層級：`model@1`／`vfx@1` 是執行期資產；
 * `current-resources.json.modelComponents` 是已驗收、但尚缺英雄定義、動作或綁定的
 * 獨立元件。第一守則要求後者進中央成品庫，同時禁止把它冒稱完整英雄，
 * 所以不能為了過閘硬造一份假的六態 `model@1`。
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
const CURRENT_RESOURCES = join(ROOT, "materials", "asset-library", "current-resources.json");
const IMMUTABLE_RELEASE = join(ROOT, "materials", "hero-model-library", "release.json");
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

/** 已驗收但刻意尚不可當英雄切換的獨立元件；檔名與 sha 必須一致。 */
function componentClaims(): Set<string> {
  const doc = JSON.parse(readFileSync(CURRENT_RESOURCES, "utf8")) as {
    modelComponents?: Array<{ componentReady?: boolean; gitPath?: string; sha256?: string }>;
  };
  return new Set(
    (doc.modelComponents ?? [])
      .filter((row) => row.componentReady === true && typeof row.gitPath === "string")
      .filter((row) => row.gitPath!.startsWith("content/assets/models/") && row.gitPath!.endsWith(".glb"))
      .filter((row) => row.gitPath!.slice(-68, -4) === row.sha256)
      .map((row) => row.gitPath!.slice("content/".length)),
  );
}

/** 已有不可變 rollback 記錄、但根目錄仍保留一份相同 hash 舊成品的認領。 */
function rollbackBinaryClaims(): Set<string> {
  const dir = join(CONTENT, "champions");
  const hashes = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .flatMap((f) => {
      const champion = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        modelVersions?: Array<{ binarySha256?: string }>;
      };
      return (champion.modelVersions ?? []).map((version) => version.binarySha256);
    })
    .filter((sha): sha is string => typeof sha === "string" && /^[0-9a-f]{64}$/.test(sha));
  return new Set(hashes.map((sha) => `assets/models/community/${sha}.glb`));
}

/** 舊的已讀回 S3 release 仍認領其根目錄成品；release map 本身不可改寫。 */
function immutableReleaseClaims(): Set<string> {
  const release = JSON.parse(readFileSync(IMMUTABLE_RELEASE, "utf8")) as {
    model_locations?: Record<string, string>;
  };
  return new Set(
    Object.values(release.model_locations ?? {}).flatMap((location) => {
      const marker = "/content/";
      const at = location.indexOf(marker);
      return at < 0 ? [] : [location.slice(at + marker.length)];
    }),
  );
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
  const components = componentClaims();
  const rollbacks = rollbackBinaryClaims();
  const immutableRelease = immutableReleaseClaims();
  const vfx = vfxBlob();
  const shipped = walk(join(CONTENT, "assets", "models"))
    .filter((p) => !p.includes("/versions/"))
    .filter((p) => HERO_DIRS.some((d) => p.startsWith(d)))
    .filter((p) => !LOD.test(p));

  const unclaimed = shipped.filter(
    (p) => !claimed.has(p) && !components.has(p) && !rollbacks.has(p) && !immutableRelease.has(p) &&
      !vfx.includes(p.split("/").pop()!.slice(0, -4)),
  );
  const broken = docs.filter((d) => d.glbPath && !existsSync(join(CONTENT, d.glbPath))).map((d) => d.id);

  it("⭐ 量尺自證：兩頭都真的走得到，⛔ 而且排除條件沒有把全部都排掉", () => {
    expect(docs.length, "⛔ 一份 model 文件都沒讀到").toBeGreaterThan(300);
    expect(shipped.length, "⛔ 排除完之後一顆 GLB 都不剩 ⇒ 這條閘什麼都沒在問").toBeGreaterThan(200);
    expect(vfx.length, "⛔ content/vfx 讀成空的 ⇒ 排除條件⓷失效,會誤報一整批特效模型").toBeGreaterThan(1000);
    expect(components.size, "⛔ 中央素材庫沒有讀到任何已驗收元件 ⇒ 獨立元件認領失效").toBeGreaterThan(20);
    expect(rollbacks.size, "⛔ 沒有讀到任何不可變模型版本 ⇒ 舊成品認領失效").toBeGreaterThan(20);
    expect(immutableRelease.size, "⛔ 沒有讀到已讀回的不可變 release ⇒ 舊發行成品認領失效").toBeGreaterThan(20);
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
        "\n⇒ ⭐ 一顆沒有 `model@1`、沒有被 `content/vfx/` 引用，也沒有被中央素材庫認領的 GLB，" +
        "沒有任何工作流能說出它是什麼。\n" +
        "⇒ 完整英雄補 `model@1`；特效模型補 vfx 引用；尚缺綁定／動作的獨立元件補中央素材庫記錄。" +
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
