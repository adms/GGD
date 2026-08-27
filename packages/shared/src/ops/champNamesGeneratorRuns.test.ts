/**
 * 🧪 GH#811 —— **呼名產生器在 roster 換過之後仍然跑得完**（⛔ 不是 exit 1 一個檔都不寫）。
 *
 * ## 病灶（2026-08-27 量到，⛔ 不是假設）
 * `build-champ-names.mjs` 的反方向檢查把「CASTING 多一列」一律當成 fatal：
 * ```
 * for (const id of Object.keys(CASTING))
 *   if (!champs.has(id)) problems.push(`CASTING row ${id} is not an authored champion`);
 * ```
 * ⇒ roster 換過（**47 位英雄搬進 `content/_legacy/champions/`**）之後它**執行即 exit 1**，
 * ⭐ 而 `process.exit(1)` 在 write 段**之前** ⇒ 三份產物一個位元組都不會被重寫。
 * ⇒ 它們永遠停在某一次手改的狀態，而**沒有任何東西會紅**
 *   （這支⛔ 不在 `skills:sync` 的鏈裡，產物也沒被隔離區鎖起來）。
 *
 * ## ⭐ 這一條問的是**關係**，⛔ 不是「有沒有那行程式」
 * 拿**真的**產生器、餵**真的** `content/champions/` ＋ `content/_legacy/champions/`，
 * 看它的離開碼。三個方向刻意不同級 —— 而**兩個 fatal 的方向必須留著**：
 *
 * | 方向 | 期望 |
 * |---|---|
 * | 出貨英雄**缺** CASTING 列 | ⛔ fatal（漏掉 = 那位英雄靜默地沒有呼名） |
 * | CASTING 多一列、英雄在 `_legacy/` | ⚠️ 放行（他被下架了，⛔ 不是打錯字） |
 * | CASTING 多一列、**兩邊都查不到** | ⛔ fatal（這才是真的漂移） |
 *
 * ⚠️ ⛔ 不驗產物內容（那是 `--check` 的事，而產物今天還沒重生成 —— 見 GH#811 交接）。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · 把 `retiredChampionIds()` 改成「目錄讀不到就回全放行」（`return CASTING_KEYS`）
 *    → 第 3 條紅（假 id 被吞掉）。實測過。
 */
import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = "tools/tts-gen/src/build-champ-names.mjs";

/** 一棵**只含產生器要的東西**的樹。⛔ 不在真 repo 上跑 —— 它會寫 `content/`。 */
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "ggd-champ-names-"));
  mkdirSync(join(root, "tools/tts-gen"), { recursive: true });
  cpSync(join(REPO, "tools/tts-gen/src"), join(root, "tools/tts-gen/src"), { recursive: true });
  cpSync(join(REPO, "content/champions"), join(root, "content/champions"), { recursive: true });
  cpSync(join(REPO, "content/_legacy/champions"), join(root, "content/_legacy/champions"), { recursive: true });
  mkdirSync(join(root, "content/assets/audio/voices/names"), { recursive: true });
  mkdirSync(join(root, "content/audio-manifests"), { recursive: true });
  return root;
}

const run = (root: string) => spawnSync("node", [GEN], { cwd: root, encoding: "utf8" });

describe("呼名產生器在 roster 漂移下的離開碼 (champ-names-generator-runs)", () => {
  it("⭐ 出貨的 roster ⇒ EXIT 0（47 列退休的 CASTING ⛔ 不再是 fatal）", () => {
    const r = run(sandbox());
    expect(`${r.stderr}${r.stdout}`.slice(0, 4000)).not.toMatch(/is not an authored champion/);
    expect(r.status).toBe(0);
  });

  it("⛔ 出貨英雄**缺** CASTING 列 ⇒ 仍然 fatal 並指名它", () => {
    const root = sandbox();
    writeFileSync(
      join(root, "content/champions/zz-ghost.json"),
      JSON.stringify({ id: "zz-ghost", name: "幽靈 - 測試", schema: "champion@1" }),
    );
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no CASTING row for champion zz-ghost/);
  });

  it("⛔ CASTING 列在 `content/` 與 `_legacy/` **都**查不到 ⇒ 仍然 fatal 並指名它", () => {
    const root = sandbox();
    const p = join(root, GEN);
    const src = readFileSync(p, "utf8").replace(
      "const CASTING = {",
      'const CASTING = {\n  "zz-nowhere": ["ja", null, null, "テスト", "tesuto"],',
    );
    writeFileSync(p, src);
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/CASTING row zz-nowhere matches neither/);
  });
});
