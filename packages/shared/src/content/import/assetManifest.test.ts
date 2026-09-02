/**
 * ⭐⭐ P1-1 —— **完整** asset manifest，⛔ 不是一份 LOD 表。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * `buildEditorTargetProfile.ts` 的那一行逐字是：
 *   `assetManifestDigest: lod === null ? null : sha12(JSON.stringify(lod))`
 * ⇒ ⭐ 那個 digest 覆蓋的是 **`assets/models/_lod.json` 一份檔**，
 * ⛔ 而契約上寫著它是 `assetManifestDigest`。
 *
 * ⚠️ 後果是**靜默的**：外部編輯器拿它去驗遠端 GLB／貼圖 ——
 * 換掉一顆 GLB，那個 digest **不會變**，而編輯器會說「Base 沒漂」。
 *
 * MUTATION LOG（落地前跑過）：
 *   · 把 manifest 裡任一顆的 `sha256` 改一個字元 → 🔴（②：篡改被抓到）
 *   · 把 `assetManifestDigest` 改回 `sha12(lod)` → 🔴（③：換 GLB 而 digest 不動）
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../../..");
const MANIFEST = resolve(ROOT, "content/assets-manifest.json");

interface Entry {
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
}
const doc = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  schema: string;
  counts: { entries: number; totalBytes: number };
  entries: Entry[];
};

describe("P1-1 完整 asset manifest", () => {
  it("★ ⭐ 涵蓋**被引用到的**二進位 —— ⛔ 不只是 models（儀器：三類都要有）", () => {
    expect(doc.schema).toBe("ggd-assets-manifest@1");
    expect(doc.entries.length, "⛔ 一顆都沒有 ⇒ 下面量的是空氣").toBeGreaterThan(100);
    const types = new Set(doc.entries.map((e) => e.contentType));
    // ⭐ 一張只涵蓋 models 的清單**驗不了貼圖與音效** —— 而那正是舊那一份的形狀。
    for (const t of ["model/gltf-binary", "image/webp", "audio/mpeg"]) {
      expect(types.has(t), `⛔ 清單裡一個 ${t} 都沒有 ⇒ 它涵蓋不了那一族資產`).toBe(true);
    }
  });

  it("★★ ⭐ **每一顆的 sha256 與磁碟上的位元組相符**（⛔ 篡改當場抓得到）", () => {
    // ⚠️ 全量 1,600 顆 × 讀檔太慢 ⇒ 取一個**決定性**的樣本（⛔ 不是隨機：
    //   一條會飄的守衛在它紅的那一天沒有人相信它）。
    const step = Math.max(1, Math.floor(doc.entries.length / 40));
    const sample = doc.entries.filter((_, i) => i % step === 0);
    expect(sample.length).toBeGreaterThan(20);
    const bad: string[] = [];
    for (const e of sample) {
      const abs = resolve(ROOT, "content", e.path);
      if (!existsSync(abs)) {
        bad.push(`${e.path} —— 檔案不存在`);
        continue;
      }
      const buf = readFileSync(abs);
      if (buf.byteLength !== e.bytes) bad.push(`${e.path} —— bytes ${buf.byteLength} ≠ ${e.bytes}`);
      const h = createHash("sha256").update(buf).digest("hex");
      if (h !== e.sha256) bad.push(`${e.path} —— sha256 不符`);
    }
    expect(
      bad,
      `⛔⛔ 清單與磁碟對不上：\n${bad.map((b) => `  · ${b}`).join("\n")}\n` +
        `⇒ ⭐ 外部編輯器**照這份清單驗遠端資產** —— 對不上代表它會把一顆被換掉的\n` +
        `   GLB 當成正確的（或把正確的當成被換掉的）。跑 \`pnpm assets:manifest\`。`,
    ).toEqual([]);
  });

  it("⭐ ③ profile 的 digest **跟著資產動**（⛔ 不是跟著一份 LOD 表動）", () => {
    const profile = JSON.parse(
      readFileSync(resolve(ROOT, "content/editor-target-profile.json"), "utf8"),
    ) as { assetManifestDigest: string | null; assetManifest: { entries: number } | null };
    expect(profile.assetManifestDigest, "⛔ 仍然是 null ⇒ 遠端資產驗不了").not.toBeNull();
    expect(profile.assetManifest?.entries, "⛔ 筆數對不上 ⇒ profile 與清單不是同一份").toBe(
      doc.counts.entries,
    );
    // ⭐ 承重：**換掉一顆資產的 hash，digest 一定要變**。
    const tampered = JSON.parse(JSON.stringify(doc)) as typeof doc;
    tampered.entries[0]!.sha256 = `${"0".repeat(63)}1`;
    const before = createHash("sha256").update(JSON.stringify(doc)).digest("hex").slice(0, 12);
    const after = createHash("sha256").update(JSON.stringify(tampered)).digest("hex").slice(0, 12);
    expect(
      after,
      "⛔⛔ 改掉一顆資產的 hash 而 manifest digest **沒有變** ⇒ 這個 digest 證明不了任何事",
    ).not.toBe(before);
    expect(before, "儀器：profile 的 digest 就是這份清單算出來的").toBe(profile.assetManifestDigest);
  });
});

// ---------------------------------------------------------------------------
// ⭐⭐ 依賴閉包：GLB 引用得到的東西**也要在清單上**
// ---------------------------------------------------------------------------

describe("P1-1 依賴閉包", () => {
  /**
   * ⛔ 交接文件逐字要的：
   * 「GLB 的**外部或內嵌 textures**、material images、skin／animation dependencies
   *   都要進 closure」
   *
   * ── ⭐ 而今天的事實是「零個外部引用」（2026-09-02 量到）────────────────
   * 425 顆出貨 GLB，`images[].uri` / `buffers[].uri` **一個外部引用都沒有**
   * —— 全部是 `data:` 或 GLB 的二進位 chunk。
   * ⇒ ⭐ 產生器掃 `content/**` 的字串**就是完整的**。
   *
   * ── ⛔ 那為什麼還要這條守衛 ─────────────────────────────────────────────
   * ⚠️ 「今天沒有外部引用」是一個**會過期的事實**。
   * 加一顆帶外部貼圖的 GLB 的那天：
   *   · 產生器**不會**發現（它掃的是 JSON 字串，⛔ 不是 GLB 的內容）
   *   · manifest 少那一張貼圖
   *   · ⭐ 而編輯器做逐檔 hash 驗證時，會撞到一個**它看不到的資產**
   *   · ⛔ 而沒有任何東西會紅 —— 一直到玩家看到一個沒有貼圖的模型
   *
   * ⇒ ⭐ 這條守衛把那個事實**釘住**：外部引用出現的當下就紅，並指名那一顆。
   *
   * MUTATION LOG：把 `uri.startsWith("data:")` 那一行拿掉（⇒ 內嵌也算外部）
   *   → 🔴（指名一堆內嵌的），⭐ 證明它真的在讀 GLB 的內容。
   */
  it("★★ ⭐ 每一顆 GLB 的**外部引用**都在 manifest 上（⛔ 今天是 0 個，而它會過期）", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join, relative, dirname, normalize } = await import("node:path");
    const listed = new Set(doc.entries.map((e) => e.path));
    const roots: string[] = [];
    const walk = (d: string): void => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n.endsWith(".glb")) roots.push(p);
      }
    };
    walk(join(ROOT, "content/assets"));
    expect(roots.length, "儀器：一顆 GLB 都沒掃到 ⇒ 下面在量空氣").toBeGreaterThan(100);

    const missing: string[] = [];
    let checked = 0;
    /** ⭐ 校準用：**內嵌**的貼圖數（已知存在 ⇒ 量不到就是尺壞了）。 */
    let embedded = 0;
    for (const p of roots) {
      const buf = readFileSync(p);
      if (buf.length < 20 || buf.subarray(0, 4).toString() !== "glTF") continue;
      const jsonLen = buf.readUInt32LE(12);
      let j: {
        images?: { uri?: string; bufferView?: number }[];
        buffers?: { uri?: string }[];
      };
      try {
        j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
      } catch {
        continue;
      }
      checked += 1;
      // ⭐⭐ **校準**（CLAUDE.md：一把只驗過單邊的尺不算自證過）。
      //   ⚠️ 這條守衛的迴圈只在有 `uri` 時才做事 —— ⛔ 而出貨的 425 顆 GLB
      //   **一個 uri 都沒有**（696 張貼圖全部走 `bufferView`）。
      //   ⇒ ⭐ 少了這個計數器，它會在**解析壞掉**時照樣全綠：
      //     一把量不到「已知存在的東西」的尺，它的沉默沒有意義。
      embedded += (j.images ?? []).filter((im) => im.bufferView !== undefined).length;
      const rel = relative(join(ROOT, "content"), p);
      for (const it of [...(j.images ?? []), ...(j.buffers ?? [])]) {
        const uri = it.uri;
        // ⭐ `data:` = 內嵌（⛔ 不是外部依賴）；缺席 = GLB 的二進位 chunk。
        if (uri === undefined || uri === "" || uri.startsWith("data:")) continue;
        const target = normalize(join(dirname(rel), decodeURIComponent(uri)));
        if (!listed.has(target)) missing.push(`${rel} → ${uri}`);
      }
    }
    expect(checked, "儀器：一顆都沒解析成功").toBeGreaterThan(100);
    // ⭐⭐ **量尺自證**：2026-09-02 量到 **696** 張內嵌貼圖（`images[].bufferView`）。
    //   ⛔ 量不到 ⇒ GLB 的 JSON chunk 沒被正確解析
    //   ⇒ ⭐ 下面那條「外部引用都在清單上」的結論**作廢**（它會因為看不到而全綠）。
    expect(
      embedded,
      "⛔⛔ 一張內嵌貼圖都沒讀到 ⇒ ⭐ 這把尺是瞎的：\n" +
        "   它下面那句「外部引用都在清單上」會**因為看不到任何引用**而全綠。\n" +
        "   ⚠️ 2026-09-02 量到 696 張（`images[].bufferView`）。",
    ).toBeGreaterThan(500);
    expect(
      missing,
      "⛔⛔ 這幾顆 GLB 引用了**不在 manifest 上**的檔案 ⇒\n" +
        "   ⭐ 外部編輯器做逐檔 hash 驗證時會撞到一個**它看不到的資產**，\n" +
        "   ⛔ 而在此之前沒有任何東西會紅 —— 一直到玩家看到一個沒有貼圖的模型。\n" +
        "   ⇒ 讓 `tools/asset-manifest/gen.ts` 也讀 GLB 的 `images[]`/`buffers[]`，\n" +
        "     ⛔ 不是在這條測試加豁免。",
    ).toEqual([]);
  }, 120_000);
});
