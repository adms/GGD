/**
 * 🧾 `scripts/vitest-verdict-check.sh` —— **已裁決檔數 ＋ 已跳過檔數 ＝＝ 總檔數**（GH#1014）。
 *
 * ⛔ 為什麼：2026-09-05 CI `apps/game-server  Test Files 152 passed | 1 skipped (154)`
 * —— 零個測試失敗而 job 紅（worker 的 birpc 60s 計時器在同步區段後先觸發）。
 * 那個不等式是「一個檔沒有裁決」的**唯一**訊號，⛔ 而沒有人在看它。
 * ⭐ 兩個方向：帳平 ⇒ 0；帳不平 ⇒ 非零 **且**訊息指名那一包、說出「RPC 逾時，⛔ 不是測試失敗」。
 * 突變：把腳本裡的 `summed != total` 改成永遠成立 ⇒ 第二條紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../../scripts/vitest-verdict-check.sh");
const E = "\x1b[";
const DIR = mkdtempSync(join(tmpdir(), "vitest-verdict-"));

function run(...logs: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("bash", [SCRIPT, ...logs], { encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}
function log(name: string, body: string): string {
  const p = join(DIR, name);
  writeFileSync(p, body);
  return p;
}
/** 真的 CI 長相：pnpm -r 前綴 ＋ vitest 的 ANSI 顏色（attempt 1 逐字抄下來的形狀）。 */
function summary(pkg: string, files: string, tests: string): string {
  const c = (s: string) => `${E}1m${E}32m${s}${E}39m${E}22m`;
  return (
    `${pkg} test: ${E}2m Test Files ${E}22m ${c(files)}\n` +
    `${pkg} test: ${E}2m      Tests ${E}22m ${c(tests)}\n` +
    `${pkg} test: ${E}2m   Duration ${E}22m 548.49s${E}2m (transform 62.96s)${E}22m\n`
  );
}
const BALANCED =
  summary("packages/shared", `808 passed${E}2m | ${E}22m2 skipped${E}90m (810)`, "5000 passed (5000)") +
  ` ${E}32m✓${E}39m src/replay/replay.test.ts ${E}2m(${E}22m27 tests${E}2m)${E}22m 508234ms\n` +
  summary("apps/game-server", "3 failed | 150 passed | 1 skipped (154)", "1 failed | 915 passed | 2 skipped (918)");
const RPC_TIMEOUT =
  summary("apps/game-server", "152 passed | 1 skipped (154)", "906 passed | 2 skipped (918)") +
  `apps/game-server test: ${E}31m${E}1mError${E}22m: [vitest-worker]: Timeout calling "onTaskUpdate"${E}39m\n` +
  `apps/game-server test: This error originated in "${E}1msrc/analytics/analytics.test.ts${E}22m" test file.\n`;

describe("vitest-verdict-check —— 已裁決 ＋ 已跳過 ＝＝ 總數", () => {
  it("⭐ 帳平 ⇒ 0（兩包、帶顏色、帶 pnpm 前綴；⚠️ 真的失敗也是帳平 —— 那一種由 vitest 自己非零）", () => {
    const r = run(log("ok.log", BALANCED));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("2 份 `Test Files` 摘要");
  });

  it("★ 152+1 ≠ 154 ⇒ 非零，指名那一包、說「RPC 逾時，⛔ 不是測試失敗」、點名逾時時在跑的檔", () => {
    const r = run(log("rpc.log", RPC_TIMEOUT));
    expect(r.code, "⛔ 回 0 = 下一個人會把「一檔零裁決」讀成「全綠」").toBe(1);
    expect(r.out).toContain("apps/game-server  Test Files 152 passed | 1 skipped (154) ⇒ 152+1 = 153 ≠ 154");
    expect(r.out).toContain("10 個測試沒有裁決");
    expect(r.out).toContain("worker RPC 逾時");
    expect(r.out).toContain("不是測試失敗");
    expect(r.out).toContain("src/analytics/analytics.test.ts");
  });

  it("⛔ 空 log ⇒ 非零（⛔ 沒量到任何摘要不可以是綠的）；不存在的路徑也是", () => {
    expect(run(log("empty.log", "nothing here\n")).code).toBe(3);
    expect(run(join(DIR, "missing.log")).code).toBe(2);
  });
});
