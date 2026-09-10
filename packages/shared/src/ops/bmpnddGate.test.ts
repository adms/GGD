/**
 * ⭐ GH#1162 —— BMPNDD 六步裡零個閘：`pnpm typecheck` 紅了好幾輪，5 輪 BMPNDD、5 次部署每一次都「綠」。
 * 這條守衛**真的跑**腳本裡的 `bmpndd_gate`（sed 抽出來 source），用 PATH 上一支假的 `pnpm` 造出紅／綠：
 *   · pnpm 回非零 ⇒ 閘回非零（⇒ bmpndd 在 push 之前 exit 1）
 *   · pnpm 回 0 ⇒ 閘回 0
 *   · GGD_BMPNDD_NO_GATE=1 ⇒ 回 0 **而且印出「沒有跑」那一行**（⛔ 靜默跳過與跑過長得一樣）
 * MUTATION LOG：把 `return 1` 改成 `return 0` ⇒ 「紅要停」紅。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../../scripts/bmpndd.sh");
function fn(): string {
  const m = /^bmpndd_gate\(\) \{[\s\S]*?^\}/m.exec(readFileSync(SCRIPT, "utf8"));
  if (!m) throw new Error("scripts/bmpndd.sh 裡找不到 bmpndd_gate() —— GH#1162 的閘被拿掉了？");
  return m[0];
}
function fakePnpm(exitCode: number): string {
  const d = mkdtempSync(join(tmpdir(), "fake-pnpm-")); const f = join(d, "pnpm");
  writeFileSync(f, `#!/bin/bash\necho "fake pnpm $*"; exit ${exitCode}\n`); chmodSync(f, 0o755); return d;
}
function run(pnpmExit: number, env: Record<string, string> = {}) {
  const r = spawnSync("bash", ["-c", `${fn()}\nbmpndd_gate; echo rc=$?`], {
    encoding: "utf8", env: { ...process.env, ...env, PATH: `${fakePnpm(pnpmExit)}:${process.env.PATH ?? ""}` },
  });
  return r.stdout + r.stderr;
}
describe("GH#1162 BMPNDD 第 0 步的閘（⭐ 真的跑那個函式）", () => {
  it("★ ship:check 紅 ⇒ 閘回非零（⇒ 停在 push 之前）", () => {
    const out = run(1, { GGD_BMPNDD_NO_GATE: "0" });
    expect(out).toMatch(/rc=1/); expect(out).toContain("停在 push 之前");
  });
  it("ship:check 綠 ⇒ 閘回 0，行為不變", () => {
    expect(run(0, { GGD_BMPNDD_NO_GATE: "0" })).toMatch(/rc=0/);
  });
  it("--no-gate ⇒ 回 0，⭐ 而且印出「沒有跑」（⛔ 不靜默）", () => {
    const out = run(1, { GGD_BMPNDD_NO_GATE: "1" });
    expect(out).toMatch(/rc=0/); expect(out).toContain("沒有跑");
  });
});
