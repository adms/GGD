/**
 * 🎫 開票規格 lint（owner 2026-08-24：「開票要把 [acceptance criteria,] 及
 * [緊急][重要][優先] 的tag, 採用的 [思考策略] 與 [解決模板] 寫清楚」）。
 *
 * ⭐ 真的把腳本跑起來（⛔ 不是掃字串 —— 第三守則），兩個方向：
 * 帶齊四件 ⇒ 0；缺件 ⇒ 1 且**逐件指名**。⛔ 不碰網路（--body-file 模式）。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const run = (file: string): { code: number; out: string } => {
  try {
    return { code: 0, out: execFileSync("bash", ["scripts/ticket-lint.sh", "--body-file", file], { cwd: REPO, encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, out: err.stdout ?? "" };
  }
};

describe("開票規格 lint", () => {
  const dir = mkdtempSync(join(tmpdir(), "tl-"));

  it("帶齊四件 ⇒ 0", () => {
    const f = join(dir, "ok.md");
    writeFileSync(f, "[重要][fix] 標題\n**Objective** o\n**Scope** s\n**Files / modules likely affected** f\n**Implementation constraints** c\n## 驗收\nx\n**Test / verification criteria** t\n[思考策略] 閘不是判準\n[解決模板] 三個住處開關\n");
    expect(run(f).code).toBe(0);
  });

  it("缺件 ⇒ 1 且逐件指名（⛔ 不是籠統的「格式不對」）", () => {
    const f = join(dir, "bad.md");
    writeFileSync(f, "只有一句話\n");
    const r = run(f);
    expect(r.code).toBe(1);
    for (const piece of ["驗收標準", "類型 tag", "[緊急]", "思考策略", "解決模板", "Objective", "Scope", "Files", "constraints", "verification"]) {
      expect(r.out, `訊息沒指名缺「${piece}」`).toContain(piece);
    }
  });
});
