/**
 * ⭐⭐ GH#1002 —— 會寫 `tools/skill-remake/heroes/*.py` 的測試一律在**沙盒副本**上跑，
 * ⛔ 不在出貨樹上突變。
 *
 * ── ⛔ 為什麼（量到的，2026-09-05）────────────────────────────────────────────
 * 在此之前 `editorSourceSurvivesSync.test.ts` 逐字做的是：改**真的**來源 → 跑整條產生器鏈
 * → 斷言 → `finally` 還原。⭐ 而它的 timeout 是 15 分鐘 —— 逾時那一刻 worker 被殺，
 * `finally` 跑不完 ⇒ 殘骸留在工作樹上：`godie-e00s.py` 的 `scatterRadius` 6.0 → 5.25、
 * `content/abilities/*.json` **68 份**掉 `castTimeSec`。
 * ⚠️ 而三支閘（`speedlists:check` · `skillremake:json:check` · `skillremake:docs:check`）
 * 的訊息全都指著「內容與產生器不一致」，⛔ 沒有一支說「有人動了你的樹」。
 *
 * ⇒ ⭐ 判準（CLAUDE.md 第二守則同型）：**任何會寫真實檔案的測試，`finally` 都不算還原** ——
 *   `finally` 只在 process 活著時跑。⭐ 正解是**根本不寫真實檔案**：複製到 `mkdtemp()`。
 *
 * ── 兩種沙盒 ─────────────────────────────────────────────────────────────────
 * · `"routes"`   —— 三支路由測試（CAS / 注入 / 失敗還原）要的最小集合：戶籍表兩份 ＋
 *                   一份來源 ＋ 兩份產物（~1.5 MB，毫秒級）
 * · `"generator-chain"` —— 真的跑產生器鏈那一支：整棵 `content/`（⛔ 不含 342 MB 的
 *                   `assets/`；`hashAssetTree()` 對缺席的 assets 目錄回 undefined，
 *                   `assetsInContentVersion.test.ts` ④ 釘住了這一點）＋ `tools/skill-remake/`
 *                   ＋ `skill-tag-manifest.json`（`tag_gate.py` 從 repo 根讀它）
 *
 * ⚠️ `cpSync` **保留 444**（隔離區的權限位）⇒ 沙盒建好之後整棵 `chmod -R u+w`，
 *   ⛔ 否則第一支產生器就吃 EACCES —— 而那個紅看起來像產生器壞了。
 *
 * ⚠️ 這個 helper 取代了 `testSourceLock.ts`：鎖存在的唯一理由是「兩支測試寫**同一個真實檔**」，
 *   沙盒之後每支各有一棵樹，⭐ 那個競態結構上消失了。
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** 真的 repo 根 —— ⭐ 只拿來**讀**（複製來源、找 node_modules/tsx），⛔ 不寫。 */
export const REPO = resolve(__dirname, "../../..");

/** 路由測試要的最小集合（相對 repo 根）。 */
const ROUTE_FILES: readonly string[] = [
  "tools/parallel-gates/sync-io.json",
  "tools/parallel-gates/normalizers.json",
  "tools/skill-remake/heroes/godie-e00s.py",
  "content/abilities/godie-e00s.r.json",
  "content/abilities/godie-e010.r.json",
];

export type SandboxKind = "routes" | "generator-chain";

/** 建一棵可寫的沙盒樹；回傳它的根。用完 `removeSandbox()`。 */
export function makeSourceSandbox(kind: SandboxKind): string {
  const root = mkdtempSync(join(tmpdir(), "ggd-source-sandbox-"));
  if (kind === "routes") {
    for (const rel of ROUTE_FILES) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      cpSync(join(REPO, rel), join(root, rel));
    }
  } else {
    mkdirSync(join(root, "content"));
    for (const name of readdirSync(join(REPO, "content"))) {
      if (name === "assets") continue;
      cpSync(join(REPO, "content", name), join(root, "content", name), { recursive: true });
    }
    cpSync(join(REPO, "tools/skill-remake"), join(root, "tools/skill-remake"), {
      recursive: true,
      filter: (src) => !src.includes("__pycache__"),
    });
    cpSync(join(REPO, "skill-tag-manifest.json"), join(root, "skill-tag-manifest.json"));
  }
  execFileSync("chmod", ["-R", "u+w", root]);
  return root;
}

export function removeSandbox(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
