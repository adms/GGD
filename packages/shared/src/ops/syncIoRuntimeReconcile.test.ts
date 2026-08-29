/**
 * 🧾 **執行期對帳** —— GH#771 Scope③ / AC③ 的閘。
 *
 * `syncIoDeclaresWrites.test.ts` 問**名詞**（「這一列是不是空的」）；⭐ 這一條問**關係**：
 * 「這一支真的寫出去的位元組，戶籍表上是不是它自己的？」⛔ 少了它，「宣告少一份」
 * （⇒ genrun 解不開 ⇒ EACCES）與「根本沒有宣告」（⇒ 沒有隔離區、沒有鏈會重生成 ——
 * #771 追記量到的 `tts-gen` 三份）長得一模一樣。⭐ 兩個方向都跑（單邊校準不算自證過）。
 *
 * 突變（一批一條）：`classify()` 的 `if (isMine(p)) continue;` → `continue;`（什麼都不算數）
 * ⇒ 第一條的「紅」那一半失敗（exit 0，`expected +0 to be 1`）。實測過。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = join(REPO, "tools/parallel-gates/reconcile.mjs");
const read = (rel: string) => JSON.parse(readFileSync(join(REPO, rel), "utf8"));
const run = (args: string[]) => spawnSync("node", [CLI, ...args], { encoding: "utf8" });
type Row = { step: string; path: string; why?: string };

describe("執行期對帳 (sync-io-runtime-reconcile)", () => {
  it("⭐ 只動自己的 ⇒ 綠；動了別人的／沒人認領的 ⇒ 紅並指名", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-reconcile-"));
    mkdirSync(join(root, "content"), { recursive: true });
    const io = join(root, "io.json");
    const pending = join(root, "pending.json");
    writeFileSync(pending, JSON.stringify({ pending: [] }));
    const steps = [{ name: "A", writes: ["content/a.*.json"] }, { name: "B", writes: ["content/b.json"] }];
    writeFileSync(io, JSON.stringify({ steps }));
    for (const f of ["a.1.json", "b.json", "c.json"]) writeFileSync(join(root, "content", f), "{}");

    const before = join(root, "before.json");
    const common = ["--root", root, "--io", io, "--pending", pending, "--step", "A", "--before", before];
    expect(run(["snapshot", "--root", root, "--io", io, "--out", before]).status).toBe(0);

    // ① 只動 A 自己宣告的（glob 展開的那一份）⇒ 綠
    writeFileSync(join(root, "content/a.1.json"), '{"changed":1}');
    const clean = run(["verify", ...common]);
    expect(clean.status, `⛔ 只動自己的產物卻紅了 —— 這條閘會被人放寬:\n${clean.stderr}`).toBe(0);

    // ② 再動一份 B 的、生一份沒人認領的 ⇒ 紅，而且兩堆的病不同 ⇒ 訊息要分得開
    writeFileSync(join(root, "content/b.json"), '{"changed":1}');
    writeFileSync(join(root, "content/c.json"), '{"changed":1}');
    const dirty = run(["verify", ...common]);
    expect(dirty.status, "⛔ 寫了不屬於自己的檔卻是綠的").toBe(1);
    expect(dirty.stderr).toContain("content/b.json");
    expect(dirty.stderr).toContain("content/c.json");
    expect(dirty.stderr).toContain("全戶籍都沒有人認領");
  });

  it("⭐ 棘輪會自己到期：`reconcile-pending.json` 的每一列今天仍然是**真的洞**", () => {
    const io = read("tools/parallel-gates/sync-io.json") as { steps: { name: string; writes?: string[] }[] };
    const rows = read("tools/parallel-gates/reconcile-pending.json").pending as Row[];
    const dead = rows.filter(
      (r) =>
        !r.why?.trim() ||
        !io.steps.some((s) => s.name === r.step) ||
        // ⭐ 到期：重量測之後它有了主人 ⇒ 刪掉這一列。棘輪⛔ 只收「全戶籍零認領」那一類。
        io.steps.some((s) => (s.writes ?? []).includes(r.path)),
    );
    expect(
      dead.map((r) => `${r.step} → ${r.path}`),
      "⛔ 這幾列棘輪已經到期（步驟不存在／那份檔已經有主人／沒寫理由）—— **刪掉它們**。",
    ).toEqual([]);
  });

  it("接線：`genrun.sh` 單獨跑那條路真的 拍快照 → 跑 → 對帳（⛔ 順序反了等於沒對帳）", () => {
    const sh = readFileSync(join(REPO, "scripts/genrun.sh"), "utf8");
    const at = (s: string) => sh.indexOf(s);
    expect(at("reconcile.mjs snapshot"), "⛔ 沒有拍快照 ⇒ 對帳沒有母體").toBeGreaterThan(-1);
    expect(at("reconcile.mjs snapshot")).toBeLessThan(at('GGD_QUARANTINE_UNLOCKED=1 pnpm "$RUN"'));
    expect(at('GGD_QUARANTINE_UNLOCKED=1 pnpm "$RUN"')).toBeLessThan(at("reconcile.mjs verify"));
  });
});
