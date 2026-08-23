#!/usr/bin/env tsx
/**
 * (Re)build every content/<collection>/_index.json + content/manifest.json +
 * content/bundle.json (the one-file transport bundle).
 * Pure function of the docs on disk — no timestamps, deterministic output.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { writeEditorTargetProfile } from "./buildEditorTargetProfile";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { bundlePath, rebuildAllIndexes } from "../src/content/node/index";
import { COLLECTION_NAMES } from "../src/content/schema/index";
import { ContentLoader } from "../src/content/loader";
import { FsContentSource } from "../src/content/node/FsContentSource";
import { registerAll } from "../src/content/registries";
import {
  findActiveCardsWithNoPayload,
  pressPayloadFailureReport,
  unknownPressPayloadHits,
} from "../src/content/abilityPressPayload";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");

if (!existsSync(CONTENT_DIR)) {
  console.error(`content dir not found: ${CONTENT_DIR} — run \`pnpm content:export\` first`);
  process.exit(1);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VALIDATE FIRST. This gate exists because it was MISSING, and its absence cost
 * real time twice on 2026-08-01.
 *
 * CLAUDE.md tells every contributor 「每一次 content/ 編輯都要跑 pnpm content:build」.
 * Until today that command did NOT validate anything — it rebuilt indexes and
 * exited 0 on content the schemas reject. The Zod bounds were real, but they only
 * ran inside `ContentLoader.load()`, i.e. whenever some unrelated test happened to
 * use the strict loader. So the sequence was:
 *
 *   1. write an `authoringNote` past its 2000-char ceiling
 *   2. `pnpm content:build` → EXIT 0, looks fine, move on
 *   3. minutes later a test explodes — and its first reported error is a
 *      MISSING-REFERENCE cascade naming OTHER documents, because the oversized
 *      doc failed to load and everything pointing at it lost its target
 *
 * Step 3 is what makes this expensive: the error names the wrong file. Two
 * different authors hit it the same afternoon and both had to trace backwards.
 *
 * A guard that only fires far from the edit that broke it is not a guard, it is
 * an alarm in another building. So the mandated command now runs the SAME strict
 * loader the tests do, BEFORE it writes anything — a violation fails here, at the
 * moment of the edit, naming the field and the file.
 *
 * ⚠️ Deliberately strict-then-write, not write-then-check: `rebuildAllIndexes`
 * mutates `_index.json`/`manifest.json`/`bundle.json`, and baking an invalid tree
 * into the bundle is how an unloadable doc reaches a container.
 * ─────────────────────────────────────────────────────────────────────────────
 */
try {
  // ⛔ **一定要 `fail-closed`**（GH#326）。執行期的出貨政策是 `quarantine`
  //    ——「玩家已經在等了，少一份設定好過整站退回骨架」——但**產出期沒有玩家
  //    在等**：這裡靜默地隔離一份文件，換來的是一個「bundle 有、來源缺一塊」
  //    的產物被 commit 出貨，而那正是 2026-08-01 / 08-02 兩次事故的形狀。
  //    ⚠️ 隔離在執行期是止血，在這裡是**製造**出血。
  await new ContentLoader(new FsContentSource(CONTENT_DIR)).load({ policy: "fail-closed" });
} catch (err) {
  const errors = (err as { errors?: unknown[] }).errors ?? [err];
  console.error(`\n✖ content 驗證失敗 —— ${errors.length} 個問題，索引與 bundle 都沒有重建：\n`);
  for (const e of errors) console.error(`  - ${String(e)}`);
  console.error(
    "\n這些是 Zod schema 的上下界。改到超過上界的欄位(例如 authoringNote 2000 字)會在這裡被擋下," +
      "\n而不是幾分鐘後在某條無關的測試裡以「別的道具參照不到」的形式爆出來。\n",
  );
  process.exit(1);
}

const manifest = rebuildAllIndexes(CONTENT_DIR);
for (const name of COLLECTION_NAMES) {
  const c = manifest.collections[name];
  if (c) console.log(`  ${name.padEnd(15)} ${String(c.count).padStart(3)} doc(s)  ${c.hash}`);
}
console.log(`contentVersion: ${manifest.contentVersion}`);

// ⭐ 外部編輯器的遠端資料契約（owner 2026-08-14）。跟著 content 一起產生，
// 因為它的每一格都是 content 的函式 —— 分開跑就一定會有一天忘記跑。
// 它落在 `content/` 底下 ⇒ 正式站直接服務：
//     https://ggd.adms.ai/content/editor-target-profile.json
{
  const text = writeEditorTargetProfile();
  const p = JSON.parse(text) as { profileDigest: string };
  console.log(`editor-target-profile.json  digest=${p.profileDigest}`);
}

// The one-file transport bundle (content/bundle.json). Print what the wire
// actually costs: nginx already gzips application/json above gzip_min_length,
// so the gzip figure is what prod serves today; brotli is what it would serve
// once brotli_static is configured. Compression here is MEASUREMENT ONLY — no
// .gz/.br siblings are emitted (they would be a second artifact that can drift).
const bfile = bundlePath(CONTENT_DIR);
if (existsSync(bfile)) {
  const raw = readFileSync(bfile);
  const gz = gzipSync(raw, { level: 9 }).length;
  const br = brotliCompressSync(raw, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  const docCount = COLLECTION_NAMES.reduce(
    (n, name) => n + (manifest.collections[name]?.count ?? 0),
    0,
  );
  console.log(
    `bundle.json:    ${docCount} doc(s)  ${statSync(bfile).size} B raw  ${gz} B gzip-9  ${br} B brotli-11`,
  );
}

const REPO_ROOT = join(CONTENT_DIR, "..");

// ─────────────────────────────────────────────────────────── 英雄名單漣漪 ──
/**
 * ⭐ owner 2026-08-16：「請把調整上下架英雄會影響到的程式檔案、機制、說明文件、
 * 測試 等 做成一個 **重 build 會自動檢查**的 script」。
 *
 * ⚠️ 掛在**這裡**而不是只做成一條測試，理由是 CLAUDE.md 的元規則
 *（判準沒用，只有閘有用）：改名單的人不一定會跑 `pnpm test`，但他**一定**要跑
 * `pnpm content:build`（改 content/ 就得跑，否則 shippedBundleIsCurrent 會紅）。
 * ⇒ 把檢查放在他必經的那條路上。
 *
 * ⛔ 失敗直接 `exit 1` —— 一行沒有人讀的 warn 不算守衛（fail-open 那條規則）。
 */
// ⚠️ 用**子行程**呼叫，⛔ 不 import —— `tools/` 在 `packages/shared` 的 rootDir
//    之外，直接 import 會讓 tsc 報 TS6059。而且這樣它保持成一支**獨立可跑的
//    腳本**（`pnpm roster:check`），⛔ 不變成 shared 的一部分。
// ⚠️ 只在**真的 repo** 上跑。`buildIndexesValidates.test.ts` 會把 content/ 複製到
//    一棵 temp 樹再跑這支 build —— 那裡沒有 `apps/platform/`，而名單檢查驗的是
//    **跨 repo 的關係**，在只有內容的樹上它沒有東西可比。
// ⛔ 這不是「測試環境跳過檢查」那種豁免：真的 build 一定在 repo 根，一定會跑到。
const rosterGuard = join(REPO_ROOT, "tools/roster-guard/check.ts");
const starterGo = join(REPO_ROOT, "apps/platform/internal/curation/starter.go");
if (!existsSync(rosterGuard) || !existsSync(starterGo)) {
  console.log("（跳過英雄名單漣漪檢查：這不是完整的 repo 樹）");
  process.exit(0);
}
const rosterCheck = spawnSync(
  process.execPath,
  [
    join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs"),
    join(REPO_ROOT, "tools/roster-guard/check.ts"),
  ],
  { stdio: "inherit" },
);
if (rosterCheck.status !== 0) process.exit(rosterCheck.status ?? 1);
