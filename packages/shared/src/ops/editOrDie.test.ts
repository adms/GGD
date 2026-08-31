/**
 * ⭐⭐ `scripts/edit-or-die.py` —— **對不上就非零離開**。
 *
 * ⚠️ 這支腳本因為**同一天三次**同型失誤而存在（2026-08-31）：
 * 我用 `python3 -c "…s.replace(old,new)…"` 改檔而**沒有 assert** ⇒
 * 字串對不上時檔案一個位元組都沒動，⭐ **而腳本印出「✓ 改好了」**
 * ⇒ 我把「⛔ 沒有改到」讀成「⭐ 改了而測試還是綠的」。
 *
 * ⛔ 三次裡有**兩次**發生在突變驗證上 —— 也就是我讀到的是**假的綠燈**，
 * 而那正是 CLAUDE.md 整章在防的東西（「一條綠燈有四種假的來源」）。
 *
 * ⭐ 元規則：判準治不了 ⇒ 把它換成一個**會擋下你的程式**。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../../scripts/edit-or-die.py");

function run(args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("python3", [SCRIPT, ...args], { encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function seed(body: string) {
  const d = mkdtempSync(join(tmpdir(), "edit-or-die-"));
  const f = join(d, "t.txt");
  writeFileSync(f, body);
  const o = join(d, "o.txt");
  const n = join(d, "n.txt");
  return { f, o, n };
}

describe("edit-or-die —— 改不到就要死", () => {
  it("★ ⭐ **對不上 ⇒ 非零 ＋ 檔案不動**（⛔ 這正是三次假綠燈的來源）", () => {
    const { f, o, n } = seed("hello\nworld\n");
    writeFileSync(o, "NOT_THERE");
    writeFileSync(n, "x");
    const r = run([f, "--old-file", o, "--new-file", n]);
    expect(r.code, "⛔ 回 0 = 下一個人會把「沒改到」讀成「改了」").toBe(2);
    expect(readFileSync(f, "utf8"), "⛔ 半套修改比不修改更糟").toBe("hello\nworld\n");
  });

  it("⭐ 對得上 ⇒ 0 ＋ 真的改了（量尺的另一個方向）", () => {
    const { f, o, n } = seed("hello\nworld\n");
    writeFileSync(o, "world");
    writeFileSync(n, "WORLD");
    const r = run([f, "--old-file", o, "--new-file", n]);
    expect(r.code, r.out).toBe(0);
    expect(readFileSync(f, "utf8")).toBe("hello\nWORLD\n");
  });

  it("⭐ 出現**兩次**而期望一次 ⇒ 也要死（⛔ 不可以只換第一個）", () => {
    const { f, o, n } = seed("a\na\n");
    writeFileSync(o, "a");
    writeFileSync(n, "b");
    expect(run([f, "--old-file", o, "--new-file", n]).code).toBe(2);
    expect(readFileSync(f, "utf8")).toBe("a\na\n");
  });

  it("⭐ 錯誤訊息要**指出最接近的行**（⛔ 「對不上」三個字幫不了任何人）", () => {
    // ⚠️ ⭐ **前導空白不會擋住比對**（子字串就是子字串）—— 我第一版的夾具
    //   就用錯了這一點，而它「通過」了替換。⭐ 真正對不上的是**內部**縮排差一格。
    const { f, o, n } = seed("if (x) {\n    return 1;\n}\n");
    writeFileSync(o, "if (x) {\n  return 1;\n}"); // ⚠️ 內部縮排 2 vs 4 —— 眼睛看不出來
    writeFileSync(n, "y");
    const r = run([f, "--old-file", o, "--new-file", n]);
    expect(r.code).toBe(2);
    expect(r.out, "⛔ 沒指出最接近的行 = 下一個人要自己去猜縮排").toContain("if (x) {");
  });
});
