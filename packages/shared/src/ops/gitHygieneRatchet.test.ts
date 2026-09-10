/**
 * ⭐ GH#1160 —— **「素材不進 git」是散文** —— 攔下 1.09 GB 那次（PR 1112）的是人工審閱，⛔ 沒有任何東西變紅。
 * 2026-09-10 又來四個：#1135／#1153 各倒 269／443 個 CI log 進 `materials/`（12.7／16.9 MB），
 * #1144 一個 commit 4,318 檔／+309 萬行。全部靠人看出來。
 *
 * > owner 2026-09-10：「成品一律上傳至 git，剩下半成品、來源、準備材料等都進 S3」
 *
 * ⭐ 這一條是**棘輪**，⛔ 不是白名單：`tools/git-hygiene/baseline.json` 記每一類的 files/bytes，
 * 只准變**少**；> 5 MB 的 blob 逐檔列出並寫理由。⭐ 反方向也走（形態⑫）：列了而樹裡已經沒有 ⇒ 那一列該退休。
 * ⭐ 輸入是 `git ls-tree -r -l HEAD` —— **commit 進去的樹**，⛔ 不是工作區。
 *
 * MUTATION（落地前跑過）：把 baseline 的 materials.files 改小 1 ⇒ 「materials 不可以長」紅。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, hasGit } from "./gitTreeExport";
import { HYGIENE_CATS, isFinishedAssetPath, measureHygiene, treeBlobs, type HygieneCat as Cat } from "./gitHygiene";

interface Baseline {
  bigBlobBytes: number;
  categories: Record<Cat, { files: number; bytes: number }>;
  bigBlobs: Array<{ path: string; bytes: number; why: string }>;
}
const BASELINE_PATH = join(REPO_ROOT, "tools/git-hygiene/baseline.json");
/** 要量哪個 rev —— 預設 HEAD；CI 或探針可設 GGD_HYGIENE_REV=origin/main。 */
const REV = process.env.GGD_HYGIENE_REV || "HEAD";
const measure = () => measureHygiene(REV);

const SKIP = !hasGit() || !existsSync(BASELINE_PATH);

describe("GH#1160 git 衛生棘輪（⭐ 只讀 commit 進去的樹）", () => {
  const base = SKIP ? null : (JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline);

  it("★ 每一類（materials / legacy-overwrites / archives / logs）的 files 與 bytes **只准變少**", (ctx) => {
    if (!base) { console.warn("⚠️ 沒有 .git 或 baseline ⇒ 這條閘**沒驗到**（不是綠）"); ctx.skip(); return; }
    const { cats } = measure();
    const grew: string[] = [];
    for (const k of HYGIENE_CATS) {
      const now = cats[k], was = base.categories[k];
      if (now.files > was.files || now.bytes > was.bytes) {
        grew.push(`${k}：files ${was.files}→${now.files}，bytes ${was.bytes}→${now.bytes} —— ⛔ 這一類不准長（owner 2026-09-10：準備材料進 S3，⭐ git 只留 manifest/SHA-256）`);
      }
    }
    expect(grew).toEqual([]);
    console.log(Object.entries(cats).map(([k, v]) => `   ${k}: ${v.files} 檔 / ${(v.bytes / 1048576).toFixed(1)} MB`).join("\n"));
  });

  it("> 5 MB 的 blob 每一個都要列在 baseline.bigBlobs 並寫得出理由（⛔ 新的大檔 = 紅）", (ctx) => {
    if (!base) { ctx.skip(); return; }
    const { blobs } = measure();
    const listed = new Set(base.bigBlobs.map((b) => b.path));
    const unlisted = blobs.filter((b) => b.bytes > base.bigBlobBytes && !isFinishedAssetPath(b.path) && !listed.has(b.path))
      .map((b) => `${(b.bytes / 1048576).toFixed(1)} MB  ${b.path} —— ⛔ 沒列在 tools/git-hygiene/baseline.json 的 bigBlobs（要留就寫理由；否則走 S3）`);
    expect(unlisted).toEqual([]);
    const noWhy = base.bigBlobs.filter((b) => !b.why || b.why.trim().length < 4).map((b) => b.path);
    expect(noWhy, "bigBlobs 每一列都要有 why").toEqual([]);
  });

  it("⭐ 反方向：baseline 列的大檔，樹裡已經沒有了 ⇒ 那一列該退休（⛔ 過期的散文）", (ctx) => {
    if (!base) { ctx.skip(); return; }
    const present = new Set(treeBlobs(REV).map((b) => b.path));
    const stale = base.bigBlobs.filter((b) => !present.has(b.path)).map((b) => `${b.path} —— 樹裡沒有了 ⇒ 從 bigBlobs 刪掉那一列`);
    expect(stale).toEqual([]);
  });
});
