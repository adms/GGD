/**
 * visualProofScript.test.ts —— 這支閘不可以說「你沒有終端證據」，而證據就躺在硬碟上。(GH#714)
 *
 * 盲區：`CHANGED` 的三個來源**全部只列 tracked 檔**，而 `HAS_REPORT` 正是從它撈報告
 * ⇒ 一條被規定「⛔ 不碰 git 寫入」的 lane **永遠沒辦法讓這支閘變綠**，而它的訊息會說
 * 「你改了畫面層卻沒有終端證據」——⚠️ 那句話是假的。被忽略的閘等於沒有閘。
 *
 * ⛔ 掃原始碼字串對這個形態永遠是綠的（失敗形態⑥）⇒ 這裡**真的把腳本跑起來**讀離開碼與輸出。
 * 三個情境一起驗：「看得見未追蹤證據」與「沒有被放寬」是同一件事的兩半。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function write(dir: string, rel: string, body: string): void {
  mkdirSync(join(dir, dirname(rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

/** 一個真的 git repo，畫面層有一筆未提交的改動（TOUCHED 非空），但沒有任何證據。 */
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "ggd-visualproof-"));
  const git = (...a: string[]) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  write(dir, "apps/client/src/vfx/beam.ts", "export const beam = 1;\n");
  mkdirSync(join(dir, "scripts"), { recursive: true });
  copyFileSync(join(REPO, "scripts/visual-proof.sh"), join(dir, "scripts/visual-proof.sh"));
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("add", "--", "apps", "scripts");
  git("commit", "-qm", "base");
  write(dir, "apps/client/src/vfx/beam.ts", "export const beam = 2;\n");
  return dir;
}

function run(dir: string, args: string[] = [], extraEnv: Record<string, string> = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.GGD_VISUAL_PROOF_OFF;
  return spawnSync("bash", [join(dir, "scripts/visual-proof.sh"), ...args], { cwd: dir, encoding: "utf8", env });
}

describe("scripts/visual-proof.sh", () => {
  it("未追蹤的證據算數（但要說出來），沒有證據仍然紅，空殼標記仍然被指名", () => {
    const dir = sandbox();

    // ① 完全沒有證據 ⇒ 仍然紅（⛔ 這次改動沒有放寬判準）
    const none = run(dir);
    expect(none.status, `沒有證據卻放行了：\n${none.stdout}`).not.toBe(0);

    // ② 未追蹤的 visual-proof 報告 ⇒ 綠，且**必須**說「還沒 git add」
    //    （fail-open 沒錯，靜默才是缺陷 —— 出貨的是 git，不是這台機器的工作區）
    write(dir, "docs/_reports/beam_visual-proof_20260826-1200.md", "A 8947 / B 0\n");
    const ok = run(dir);
    expect(ok.status, `未追蹤的證據應該讓閘轉綠：\n${ok.stdout}${ok.stderr}`).toBe(0);
    expect(ok.stdout).toContain("還沒 git add");
    expect(ok.stdout).toContain("beam_visual-proof_20260826-1200.md");

    // ③ v2 的標記誠實那一段要保留：空殼 @visual-proof ⇒ 紅並指名該檔
    write(dir, "apps/client/src/vfx/shell.test.ts", "// @visual-proof\nit('x', () => {});\n");
    const liar = run(dir);
    expect(liar.status).not.toBe(0);
    expect(liar.stderr).toContain("shell.test.ts");
  });
});
