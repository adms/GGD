#!/usr/bin/env node

/**
 * Turn each accepted case's 2..18 framebuffer keyframes into one chronological
 * contact sheet. The output is review convenience only and never creates a
 * verdict. Source digests make stale sheets fail the compact acceptance gate.
 *
 * ⭐⭐ 兩組（`--set`），⛔ 一支產生器：
 *
 * | set | 材料 | 誰拍的 |
 * |---|---|---|
 * | `editor`（預設） | 技能編輯器的 42×46 驗收 | `import-visual-proof.ts` |
 * | `round11-hud` | 第十一回合 H④ 的三個 HUD 畫面（GH#1196） | `apps/client/public/hud-audition.html` |
 *
 * ⛔ 為什麼不是複製一支：`render()`／digest／`--check` 這三件事兩組**逐字相同**，
 * 而它們正是會腐爛的那三件。⇒ 差異收進 `SETS` 這張表（第零守則⑨：
 * N 個同型 = K 個模板 + 一張表）。
 * ⚠️ `editor` 那一組的行為與收據編碼**逐位元組不變** —— 它進了 `skills:check`。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acceptanceScope, assertVisualProofScope } from "./visual-proof-scope.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * ⭐ 一組材料要交代五件事，⛔ 缺一件就是「拍了但沒有人知道它是什麼」。
 * `scope()` 是其中最重的一件：它回答「**這份 manifest 的範圍憑什麼算數**」——
 * ⛔ 數量對不代表涵蓋對（`visual-proof-scope.mjs` 的檔頭逐字寫過）。
 */
const SETS = {
  editor: {
    manifestSchema: "ggd-editor-basic-visual-proof-manifest@1",
    receiptSchema: "ggd-editor-skill-contact-sheets@1",
    frameDir: "docs/_reports/editor-skill-basic-visual-proof",
    manifest: "docs/_reports/editor-skill-basic-visual-proof/manifest.json",
    outDir: "docs/_reports/editor-skill-human-review/sheets",
    receipt: "docs/_reports/editor-skill-human-review/sheets.json",
    /** ⛔ 這一組不接受任何一格缺席：acceptance 的每一列都要有畫面。 */
    partial: false,
    scope(manifest) {
      const scope = acceptanceScope(
        JSON.parse(readFileSync(join(ROOT, "docs/_reports/editor-skill-acceptance-42x46.json"), "utf8")),
      );
      assertVisualProofScope(manifest, scope);
      return scope.documents;
    },
  },
  "round11-hud": {
    manifestSchema: "ggd-hud-visual-proof-manifest@1",
    receiptSchema: "ggd-hud-contact-sheets@1",
    frameDir: "docs/_reports/round11-hud-review",
    manifest: "docs/_reports/round11-hud-review/manifest.json",
    outDir: "docs/_reports/round11-hud-review/sheets",
    receipt: "docs/_reports/round11-hud-review/sheets.json",
    /**
     * ⭐ 這一組**允許有 blocked 的格子**，⛔ 而且要把它們印出來。
     * 理由：HUD 的某一格拍不到（元件塌了／量尺不可信）是**這張票的結論之一**，
     * ⛔ 不是一個要讓產生器整支死掉的錯誤 —— 死掉的話那個結論就沒人看得到。
     */
    partial: true,
    scope(manifest) {
      const ids = new Set();
      for (const row of manifest.cases ?? []) {
        if (typeof row.id !== "string" || !row.id) throw new Error("HUD case 少了 id");
        if (ids.has(row.id)) throw new Error(`HUD case 重複：${row.id}`);
        ids.add(row.id);
      }
      if (!ids.size) throw new Error("HUD manifest 一格都沒有");
      if (manifest.documents !== ids.size) throw new Error("HUD manifest 的 documents 與 cases 對不上");
      // ⛔⛔ **量尺沒自證過就不准出接觸表。** 一把只驗過單邊（甚至沒驗）的尺，
      //    拍出來的空白與「HUD 真的是空的」長得一模一樣（CLAUDE.md 第一守則）。
      for (const [engine, cal] of Object.entries(manifest.calibration ?? {})) {
        if (!cal?.ok) throw new Error(`量尺 ${engine} 兩方向校準沒過 ⇒ 這一批不可信`);
      }
      if (!Object.keys(manifest.calibration ?? {}).length) throw new Error("HUD manifest 沒有校準紀錄");
      // ⭐ 版面是宣告過的，⛔ 不是「拍的時候剛好是多少」。
      if (manifest.stage?.viewportPinned !== true) throw new Error("HUD manifest 沒有釘住視窗尺寸");
      return ids.size;
    },
  },
};

const CHECK = process.argv.includes("--check");
const SET_NAME = (process.argv.find((a) => a.startsWith("--set=")) ?? "--set=editor").slice(6);
const cfg = SETS[SET_NAME];
if (!cfg) fail(`unknown --set=${SET_NAME}（有：${Object.keys(SETS).join(" / ")}）`);

const FRAME_DIR = join(ROOT, cfg.frameDir);
const OUT_DIR = join(ROOT, cfg.outDir);
const RECEIPT = join(ROOT, cfg.receipt);
const MANIFEST = join(ROOT, cfg.manifest);
if (!existsSync(MANIFEST)) fail(`找不到 ${relative(ROOT, MANIFEST)} —— 先跑拍攝台`);
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (manifest.schema !== cfg.manifestSchema) fail(`invalid visual proof manifest schema`);
let documents;
try {
  documents = cfg.scope(manifest);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

const blocked = [];
const rows = [];
for (const row of manifest.cases) {
  const bad =
    row.status !== "captured" || !Array.isArray(row.frames) || row.frames.length < 2 || row.frames.length > 18
      ? `${row.id}: contact sheet requires 2..18 captured keyframes`
      : null;
  if (bad) {
    // ⛔ `editor` 一格都不能少 ⇒ 死。`round11-hud` 記下來 ⇒ 收據上看得到。
    if (!cfg.partial) fail(bad);
    blocked.push({ id: row.id, reason: row.blocker ?? bad });
    continue;
  }
  const inputs = row.frames.map((frame) => join(FRAME_DIR, frame.file));
  const hash = createHash("sha256");
  hash.update(row.id).update("\0");
  for (const input of inputs) {
    if (!existsSync(input)) fail(`${row.id}: missing ${relative(ROOT, input)}`);
    hash.update(readFileSync(input)).update("\0");
  }
  const file = `${safe(row.id)}.png`;
  rows.push({
    id: row.id,
    frameCount: inputs.length,
    timesMs: row.frames.map((frame) => frame.atMs),
    sourceDigest: hash.digest("hex"),
    file: `sheets/${file}`,
    inputs,
    output: join(OUT_DIR, file),
  });
}
if (!rows.length) fail("一張接觸表都做不出來（每一格都 blocked）");

const receipt = {
  schema: cfg.receiptSchema,
  authority: "review-convenience-only",
  documents: rows.length,
  rows: rows.map(({ inputs: _inputs, output: _output, ...row }) => row),
  // ⭐ 只有允許部分缺席的那一組才多這一欄 —— ⛔ `editor` 的收據要逐位元組不變。
  ...(cfg.partial ? { blocked } : {}),
};
const encoded = `${JSON.stringify(receipt, null, 2)}\n`;

if (CHECK) {
  if (!existsSync(RECEIPT) || readFileSync(RECEIPT, "utf8") !== encoded) fail("contact sheet receipt is stale");
  for (const row of rows) if (!existsSync(row.output)) fail(`${row.id}: contact sheet is missing`);
  console.log(
    `PASS ${documents} chronological visual contact sheets are current` +
      (blocked.length ? `（⚠️ ${blocked.length} 格 blocked：${blocked.map((b) => b.id).join(", ")}）` : ""),
  );
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const row of rows) render(row);
writeFileSync(RECEIPT, encoded);
console.log(
  `WROTE ${rows.length} chronological visual contact sheets` +
    (blocked.length ? `（⚠️ ${blocked.length} 格 blocked，收據上逐格列名）` : ""),
);

function render(row) {
  const width = 320;
  const height = 180;
  const columns = Math.min(6, row.inputs.length);
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const input of row.inputs) args.push("-i", input);
  const filters = row.inputs.map((_, index) =>
    `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[v${index}]`,
  );
  if (row.inputs.length === 1) {
    filters.push("[v0]null[out]");
  } else {
    const layout = row.inputs.map((_, index) => `${(index % columns) * width}_${Math.floor(index / columns) * height}`).join("|");
    filters.push(`${row.inputs.map((_, index) => `[v${index}]`).join("")}xstack=inputs=${row.inputs.length}:layout=${layout}:fill=black[out]`);
  }
  args.push("-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", row.output);
  const result = spawnSync("ffmpeg", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) fail(`${row.id}: ffmpeg failed: ${(result.stderr ?? "").trim()}`);
}

function safe(id) { return id.replace(/[^a-zA-Z0-9._-]+/g, "-"); }
function fail(message) { console.error(`FAIL contact sheets: ${message}`); process.exit(1); }
