/**
 * ⭐ GH#1160 —— **「素材不進 git」是散文** —— 攔下 1.09 GB 那次（PR 1112）的是人工審閱，⛔ 沒有任何東西變紅。
 * 2026-09-10 又來四個：#1135／#1153 各倒 269／443 個 CI log 進 `materials/`（12.7／16.9 MB），
 * #1144 一個 commit 4,318 檔／+309 萬行。全部靠人看出來。
 *
 * > owner 2026-09-10：「成品一律上傳至git, 剩下半成品、來源、準備材料等都進 S3」
 *
 * ⭐ 這一條是**棘輪**，⛔ 不是白名單：`tools/git-hygiene/baseline.json` 記每一類的 files/bytes，
 * 只准變**少**；≥ bigBlobBytes 的 blob 逐檔列出並寫理由。⭐ 反方向也走（形態⑫）：列了而樹裡已經沒有 ⇒ 那一列該退休。
 * ⭐ 真樹的輸入是 `git ls-tree -r -l HEAD` —— **commit 進去的樹**，⛔ 不是工作區。
 * ⭐ 合成夾具（#1112 的 34 段、邊界、13 KB 圖示）走**同一支**純函式 —— 兩個方向都跑（⛔ 單邊校準的尺會沉默）。
 *
 * MUTATION（落地前跑過）：
 *   · baseline 的 materials.files 改小 1 ⇒ 「materials 不可以長」紅。
 *   · GH#1160：baseline 的 bigBlobBytes 5 MiB → 5 GiB ⇒ 「#1112 的 34 段」紅（見 commit 訊息）。
 *   · GH#1160 審查者：大檔比較 `>=` 改 `>` ⇒「邊界走真的 git」紅；isFinishedAssetPath 退回 startsWith ⇒ 偽裝段紅。
 *   · GH#1160 審查補洞：segmentSeriesViolations 的門檻 `sum >= bigBlobBytes` 改成永遠 false ⇒「改名 .bin／.dat 的分段」紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT, hasGit } from "./gitTreeExport";
import {
  bigBlobViolations, categoryGrowth, categoryOf, hashOnlyBytes, measureCategories, measureHygiene,
  rowsWithoutReason, segmentSeriesViolations, treeBlobs, type HygieneBaseline, type TreeBlob,
} from "./gitHygiene";

const BASELINE_PATH = join(REPO_ROOT, "tools/git-hygiene/baseline.json");
/** 要量哪個 rev —— 預設 HEAD；CI 或探針可設 GGD_HYGIENE_REV=origin/main。 */
const REV = process.env.GGD_HYGIENE_REV || "HEAD";
/**
 * ⭐ rollback 開關（AC④ 爭議）：設了才跑總量上限。只有 CI／作者會轉 ⇒ 環境變數。
 * ⚠️ 分母是「非 diff 可讀」位元組，⛔ 不是原票 AC④ 的「二進位總位元組」（見 gitHygiene.ts 的 hashOnlyBytes）。
 */
const TOTAL_CAP_RAW = process.env.GGD_HYGIENE_TOTAL_CAP_BYTES ?? "";
const TOTAL_CAP = Number(TOTAL_CAP_RAW);
const SKIP = !hasGit() || !existsSync(BASELINE_PATH);
const MiB = 1024 * 1024;

describe("GH#1160 git 衛生棘輪（⭐ 只讀 commit 進去的樹）", () => {
  const base = SKIP ? null : (JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as HygieneBaseline);
  const real = SKIP ? null : measureHygiene(REV);

  it("固定中央索引屬於正式 Git 查詢入口，不算準備材料", () => {
    expect(categoryOf("materials/hero-model-library/inventory.json", 8 * MiB)).toBeNull();
    expect(categoryOf("materials/hero-model-library/source-dump.json", 8 * MiB)).toBe("materials");
  });

  it("★ #1112 重演：34 段分段 ⇒ 大檔與 archives 兩條都紅並逐檔指名；⭐ 反方向：成品 GLB 與 13 KB 圖示 ⛔ 不紅", (ctx) => {
    if (!base || !real) { ctx.skip(); return; }
    // aa24208cc 的真形狀：33 × 32 MiB ＋ 最後一段 17.9 MB
    const parts: TreeBlob[] = Array.from({ length: 34 }, (_, i) => ({
      path: `materials/community-hero-forge/payload.tar.gz.part${String(i).padStart(3, "0")}`, bytes: i < 33 ? 32 * MiB : 18735826,
    }));
    const hits = bigBlobViolations(parts, base);
    expect(hits).toHaveLength(parts.length);
    parts.forEach((p, i) => expect(hits[i]).toContain(`${(p.bytes / MiB).toFixed(1)} MB  ${p.path}`));
    // 切得比上限小 1 byte ⇒ 大檔檢查量不到，⭐ 類別棘輪要接住（原路徑是 materials；搬到別處也還有 archives）
    const small = parts.map((p) => ({ ...p, bytes: base.bigBlobBytes - 1 }));
    const grows = (bs: TreeBlob[]) => categoryGrowth(measureCategories([...real.blobs, ...bs]), base).join();
    expect(bigBlobViolations(small, base)).toEqual([]);
    expect(grows(small)).toContain("materials");
    expect(grows(small.map((p) => ({ ...p, path: p.path.replace("materials/", "tools/") })))).toContain("archives");
    // 偽裝進成品目錄：非媒體副檔名／.bin ⇒ 紅；真的出貨媒體 ⇒ 不紅
    const disguised = ["content/assets/models/payload.part000", "content/assets/models/payload.bin", "content/assets/audio/x.tar.gz.aa"];
    expect(bigBlobViolations(disguised.map((path) => ({ path, bytes: 32 * MiB })), base)).toHaveLength(disguised.length);
    expect(bigBlobViolations([{ path: "content/assets/models/big.glb", bytes: 32 * MiB }, { path: "content/assets/icons/x.webp", bytes: 13 * 1024 }], base)).toEqual([]);
    // ⭐ GH#1160 審查的反例：切到上限以下、改名 .bin／.dat、放在四類以外 ⇒ 大檔與類別棘輪都 0 條 ⇒ 同骨架那一組要紅
    for (const tpl of ["tools/cache/payload-N.bin", "content/assets/models/payload-N.bin", "docs/_reports/blob/pN.dat", "tools/cache/payload.bin.N"]) {
      const segs = parts.map((p, i) => ({ path: tpl.replace("N", tpl.endsWith(".N") ? `a${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}` : String(i)), bytes: base.bigBlobBytes - 1 }));
      expect(bigBlobViolations(segs, base).concat(categoryGrowth(measureCategories([...real.blobs, ...segs]), base)), tpl).toEqual([]);
      expect(segmentSeriesViolations(segs, base), `${tpl}：改名的分段沒被抓到`).toEqual([expect.stringContaining(`${segs.length} 段`)]);
    }
    expect(grows(small.map((p, i) => ({ ...p, path: `tools/x.tar.gz.a${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}` })))).toContain("archives");
    // ⚠️ 管不到（揭露，見 segmentSeriesViolations）：改名成 .glb、內容雜湊當檔名、分散到不同目錄
  });

  it("★ 邊界走真的 git：`git add` 剛好 bigBlobBytes 的二進位 ⇒ 紅並指名；少 1 byte 與 13 KB 圖示 ⇒ ⛔ 不紅", (ctx) => {
    if (!base) { ctx.skip(); return; }
    const dir = mkdtempSync(join(tmpdir(), "ggd-hygiene-"));
    try {
      const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
      git("init", "-q");
      writeFileSync(join(dir, "at-cap.bin"), Buffer.alloc(base.bigBlobBytes));
      writeFileSync(join(dir, "under-cap.bin"), Buffer.alloc(base.bigBlobBytes - 1));
      writeFileSync(join(dir, "icon.webp"), Buffer.alloc(13 * 1024));
      git("add", "--", "at-cap.bin", "under-cap.bin", "icon.webp");
      const hits = bigBlobViolations(treeBlobs(git("write-tree"), dir), base);
      expect(hits).toEqual([expect.stringContaining(`${(base.bigBlobBytes / MiB).toFixed(1)} MB  at-cap.bin`)]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("★ 每一類（materials / archives / logs）的 files 與 bytes **只准變少**", (ctx) => {
    if (!base || !real) { console.warn("⚠️ 沒有 .git 或 baseline ⇒ 這條閘**沒驗到**（不是綠）"); ctx.skip(); return; }
    expect(categoryGrowth(real.cats, base)).toEqual([]);
    console.log(Object.entries(real.cats).map(([k, v]) => `   ${k}: ${v.files} 檔 / ${(v.bytes / MiB).toFixed(1)} MB`).join("\n"));
  });

  it("⭐ docs/legacy/_overwrites/ 單檔不可超過 legacyPerFileBytes（GH#1192：留底 hook 的上限要和這裡同一個數）", (ctx) => {
    if (!base || !real) { ctx.skip(); return; }
    const cap = base.legacyPerFileBytes;
    const known = new Set(base.legacyOverFiles.map((f) => f.path));
    // ⭐ 正向：新的超限留底 ⇒ 紅（既有的列在 legacyOverFiles，那是 8 MB 時代的債）
    const over = real.blobs.filter((b) => b.path.startsWith("docs/legacy/_overwrites/") && b.bytes > cap && !known.has(b.path))
      .map((b) => `${(b.bytes / MiB).toFixed(2)} MB  ${b.path} —— ⛔ 超過留底單檔上限 ${(cap / MiB).toFixed(2)} MB（preserve-before-overwrite.py 的 MAX_BYTES）`);
    expect(over).toEqual([]);
  });

  it("≥ bigBlobBytes 的 blob 每一個都要列在 baseline.bigBlobs；⭐ 每一列（含 legacyOverFiles）寫得出理由；⭐ 反方向：列了而樹裡沒有 ⇒ 退休", (ctx) => {
    if (!base || !real) { ctx.skip(); return; }
    expect(bigBlobViolations(real.blobs, base)).toEqual([]);
    expect(segmentSeriesViolations(real.blobs, base)).toEqual([]);
    expect(rowsWithoutReason(base)).toEqual([]);
    const present = new Set(real.blobs.map((b) => b.path));
    expect([...base.bigBlobs, ...base.legacyOverFiles].filter((r) => !present.has(r.path)).map((r) => `${r.path} —— 樹裡沒有了 ⇒ 刪掉那一列`)).toEqual([]);
  });

  it.skipIf(!TOTAL_CAP_RAW)("rollback 開關 GGD_HYGIENE_TOTAL_CAP_BYTES：「非 diff 可讀」位元組總量 ≤ 上限（近似原票 AC④，分母不同）", () => {
    // ⛔ 設了卻量不到不可以長得像綠燈（審查：NaN 會被 `!NaN` 靜默跳過；沒有 .git 會拿 [] 算出 0 ⇒ 永遠過）
    expect(Number.isFinite(TOTAL_CAP) && TOTAL_CAP > 0, `GGD_HYGIENE_TOTAL_CAP_BYTES=「${TOTAL_CAP_RAW}」不是正數`).toBe(true);
    expect(real, "開關設了，但沒有 .git 或 baseline ⇒ 這一趟量不到（⛔ 不是綠）").not.toBeNull();
    expect(hashOnlyBytes(real?.blobs ?? [])).toBeLessThanOrEqual(TOTAL_CAP);
  });
});
