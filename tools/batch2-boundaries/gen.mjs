#!/usr/bin/env node
/**
 * ⭐⭐ **第二批 37 名的「五道界線」矩陣** —— GH#1150 的第一條 AC。
 *
 * owner 2026-09-08 逐字（⭐ 五件事分別確認）：
 *
 * > 「檔案存在 · GLB 轉換成功 · 已標準化入庫 · 遊戲畫面驗收 · 正式發布 —— 五件事分別確認。
 * >   ⛔ 一件成立**不蘊含**下一件」
 *
 * 而 #1150 的 AC 逐字要求這張表「⭐ 由 A／B／C 的**收據推導**，⛔ 不手填」。
 *
 * ⚠️ ⭐ 為什麼它必須是產生器：一張手填的 37×5 表，**每一格都是一句散文** ——
 *   而這份 repo 記錄過五次「一句活過保存期限的散文，⛔ 而沒有東西變紅」。
 *
 * ⛔ 每一格只填**量得到**的那一道；量不到就寫 `?`（⭐ 一個誠實的答案，
 *   ⛔ 不是猜一個，也⛔ 不是留白 —— 留白讀起來像「不適用」）。
 *
 *   node tools/batch2-boundaries/gen.mjs --receipts <dir> [--check]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = join(REPO, "docs/_reports/batch2-37-boundaries.md");

const args = process.argv.slice(2);
const check = args.includes("--check");
const rd = args[args.indexOf("--receipts") + 1];
if (!rd || !existsSync(rd)) {
  console.error("⛔ 用法：--receipts <收據目錄>（要有 package-report.json 等）");
  process.exit(2);
}
const read = (n) => {
  const p = join(rd, `${n}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
};

/** ⭐ 真的轉出來的本尊 GLB（⛔ 不是收據上的宣告）—— 五道界線②的實據。 */
const bodiesIndex = join(REPO, "docs/_reports/batch2-37-bodies/index.json");
const nativeBodies = new Set(
  existsSync(bodiesIndex)
    ? Object.keys(JSON.parse(readFileSync(bodiesIndex, "utf8")).bodies ?? {})
    : [],
);

/** ⭐ 逐條驗過「它會不會在畫面上動起來」的那幾顆（⛔ 不是「像不像」）。 */
const screenPath = join(REPO, "docs/_reports/batch2-37-bodies/screen-verification.json");
const screenOk = new Set(
  existsSync(screenPath)
    ? Object.entries(JSON.parse(readFileSync(screenPath, "utf8")).bodies ?? {})
        .filter(([, r]) => r.ok === true)
        .map(([id]) => id)
    : [],
);

const pkg = read("package-report");
const pipe = read("pipeline-report");
const review = read("author-review");
if (!pkg) {
  console.error("⛔ 缺 package-report.json —— ⭐ 沒有收據就沒有矩陣（⛔ 不猜）");
  process.exit(2);
}

/** ⭐ `?` ＝ 這一道**沒有收據回答得了**，⛔ 不是「不適用」也⛔ 不是「失敗」。 */
const UNKNOWN = "?";
const YES = "✅";
const NO = "⛔";

const byId = new Map((review?.heroes ?? []).map((h) => [h.id ?? h.heroId, h]));

const rows = (pkg.heroes ?? []).map((h) => {
  const assets = Array.isArray(h.assets) ? h.assets.length : 0;
  // ⭐ 收據**自己**回答得了這一道：`model.kind`。
  //   ⚠️ `explicit-proxy` ＝ 這隻用的是**核准過的代理本體**，⛔ 不是它本尊的 GLB
  //   ⇒ 「GLB 轉換成功」對它是 ⛔（⭐ 而那不是缺陷，是**這一道還沒走到**）。
  // ⭐⭐ ② 有**兩個**證據來源，⛔ 而收據那一個會過期：
  //   · 收據的 `model.kind`（Codex 打包當下的狀態）
  //   · ⭐ `docs/_reports/batch2-37-bodies/index.json`（**真的轉出來的那幾顆**）
  //   ⇒ 後者贏 —— 一顆已經轉出來、上了 S3、驗過雜湊的 GLB，
  //     ⛔ 不會因為舊收據還寫著 `explicit-proxy` 就變回沒有。
  const kind = h.model?.kind ?? "";
  const glb = nativeBodies.has(h.id)
    ? YES
    : kind === "native" || kind === "own"
      ? YES
      : kind
        ? NO
        : UNKNOWN;
  // ⭐ 「已標準化入庫」＝ 這一包被打包器判 passed **且**有 zip 的 sha
  const intake = h.status === "passed" && typeof h.zipSha256 === "string" ? YES : NO;
  // ⭐ 「遊戲畫面驗收」—— 收據有一格 `liveGameVerified`（⚠️ ⭐ 而它今天全是 false）
  //   ⛔ 沒有那一格才回 `?`；有而是 false ⇒ ⛔ 就是 ⛔，⛔ 不要柔化成「未知」。
  // ⭐⭐ ④「遊戲畫面驗收」有**兩個**來源，⛔ 而收據那一個只說得出 `false`：
  //   · 收據的 `model.liveGameVerified`（Codex 打包當下）
  //   · ⭐ `screen-verification.json` —— **可判版本**（頂點／骨架／六 clip／NaN／人形高度）
  //   ⇒ 後者為真時贏：一顆已經逐條驗過的身體，
  //     ⛔ 不會因為舊收據還寫著 false 就變回沒驗過。
  //   ⚠️ ⭐ 而它**刻意不是**「像不像那個角色」—— 那一題只有人答得出來（HITL）。
  const screen = screenOk.has(h.id)
    ? YES
    : typeof h.model?.liveGameVerified === "boolean"
      ? (h.model.liveGameVerified ? YES : NO)
      : UNKNOWN;
  // ⭐⭐ 「正式發布」對**社群英雄**⛔ 不是「進 content/champions/」（2026-09-09 實測到的）。
  //
  // ⛔ 我照那個定義真的落過一名（b2-rem ＋ 它的 6 支技能）：
  //   `content:build` 的名單閘當場說
  //   「content/champions/ 裡有 1 張卡既不在名單上、也不是變身態、也不是骨架 ⇒
  //     上架就把 id 加進 starter.go 的 starterChampions」
  //   ⇒ ⭐ 而那是**全體玩家的起始名單**，⛔ 不是社群房。
  //
  // ⭐ 社群英雄真正的發布路是**投稿發布流程**：
  //   `apps/platform/internal/server/publishsubmission.go`（`Origin == OriginPlayer`）
  //   ＋ `hero_policy.go` 的 `communityRoomOnly` ＋ `game-server` 的 `applyContentPool()`。
  //   ⇒ 它落在**平台 overlay**，⛔ 不在 git 的 `content/champions/`。
  //
  // ⚠️ ⭐ 所以這一欄在此之前量的是**另一件事** —— 它會把「社群英雄上線了沒」
  //   讀成「有沒有被塞進官方名單」，⛔ 而那兩件事的答案可以相反。
  //   ⇒ 誠實的答案是 `?`：**這一欄要問平台 overlay，而這支產生器讀不到它。**
  //   ⛔ 不留 NO —— 那是誣告；⛔ 也不留 YES —— 那是說謊。
  const shipped = UNKNOWN;
  const r = byId.get(h.id);
  return {
    id: h.id,
    files: assets > 0 ? YES : NO,
    assets,
    glb,
    intake,
    screen,
    shipped,
    slots: r?.slots?.length ?? r?.reviewedSlots ?? UNKNOWN,
  };
});

const tally = (k, v) => rows.filter((r) => r[k] === v).length;
const md = [
  "<!-- ⛔ 產物 —— 改 `tools/batch2-boundaries/gen.mjs`，⛔ 不要手改。 -->",
  "# 第二批 37 名 —— 五道界線矩陣（GH#1150 AC①）",
  "",
  "> owner 2026-09-08：「檔案存在 · GLB 轉換成功 · 已標準化入庫 · 遊戲畫面驗收 · 正式發布",
  "> —— 五件事分別確認。⛔ 一件成立**不蘊含**下一件」",
  "",
  `⭐ **由收據推導**，⛔ 不手填。收據 buildHash \`${pkg.buildHash ?? "?"}\`` +
    `・pipeline \`${pipe?.status ?? "?"}\`・target \`${pkg.target?.migrationFingerprint ?? "?"}\``,
  "",
  "⚠️ `?` ＝ **沒有收據回答得了這一道**（⛔ 不是「不適用」，也⛔ 不是「失敗」）。",
  "",
  "| # | 英雄 | ①檔案存在 | ②GLB 轉換 | ③標準化入庫 | ④畫面驗收 | ⑤正式發布 |",
  "|---:|---|:---:|:---:|:---:|:---:|:---:|",
  ...rows.map((r, i) =>
    `| ${i + 1} | \`${r.id}\` | ${r.files}（${r.assets}） | ${r.glb} | ${r.intake} | ${r.screen} | ${r.shipped} |`),
  "",
  "## 逐道合計",
  "",
  "| 界線 | ✅ | ⛔ | ? |",
  "|---|---:|---:|---:|",
  ...[["①檔案存在", "files"], ["②GLB 轉換", "glb"], ["③標準化入庫", "intake"],
      ["④畫面驗收", "screen"], ["⑤正式發布", "shipped"]].map(([label, k]) =>
    `| ${label} | ${tally(k, YES)} | ${tally(k, NO)} | ${tally(k, UNKNOWN)} |`),
  "",
  "⇒ ⭐ **正式發布這一欄是 `?`** —— ⛔ 它問的不是 `content/champions/`：",
  "社群英雄走**投稿發布流程**（`publishsubmission.go` ＋ `communityRoomOnly` ＋ `applyContentPool()`），",
  "落在**平台 overlay**，⛔ 不在 git 裡 ⇒ ⭐ 這支產生器讀不到它，所以誠實回 `?`。",
  "⚠️ 2026-09-09 實測：照舊定義落過一名 ⇒ 名單閘要求把 id 加進 `starterChampions`，",
  "⭐ 而那是**全體玩家的起始名單**，⛔ 不是社群房。",
  "",
].join("\n") + "\n";

if (check) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== md) {
    console.error("⛔ batch2-37-boundaries.md 過期 ⇒ 重生成：node tools/batch2-boundaries/gen.mjs --receipts <dir>");
    process.exit(1);
  }
  console.log(`batch2:boundaries:check OK（${rows.length} 列）`);
} else {
  writeFileSync(OUT, md);
  console.log(`✅ 寫出 ${OUT}（${rows.length} 列；正式發布 ${tally("shipped", YES)}/${rows.length}）`);
}
