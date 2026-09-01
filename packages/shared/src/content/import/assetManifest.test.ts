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
