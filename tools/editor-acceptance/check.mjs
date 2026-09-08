#!/usr/bin/env node

/**
 * One command for repeatable Editor acceptance.
 *
 * Default is the cheap deterministic loop. --visual adds asset/transparency and
 * stored framebuffer-ledger gates. --release adds the full Editor suite/build.
 * Human art-direction scoring intentionally remains outside automation.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const geminiLocalEnv = resolve(root, ".env.gemini.local");
if (existsSync(geminiLocalEnv) && typeof process.loadEnvFile === "function") {
  // Local developer secret only. Node loads values into process.env without
  // echoing them; child review processes inherit the same provider-neutral
  // environment. An explicit shell variable still wins over the file.
  const existingGeminiKey = process.env.GEMINI_API_KEY;
  process.loadEnvFile(geminiLocalEnv);
  if (existingGeminiKey !== undefined) process.env.GEMINI_API_KEY = existingGeminiKey;
}
const proofFlag = process.argv.indexOf("--proof");
const proofPath = proofFlag >= 0 ? process.argv[proofFlag + 1] : null;
if (proofFlag >= 0 && (!proofPath || proofPath.startsWith("--"))) {
  console.error("FAIL --proof requires the browser-export JSON path");
  process.exit(2);
}
const geminiEnvironment = String(process.env.GGD_VFX_GEMINI_ENABLED ?? "").trim().toLowerCase();
const geminiExplicitlyDisabled = process.argv.includes("--no-gemini") || ["0", "false", "no", "off"].includes(geminiEnvironment);
const geminiRequested = process.argv.includes("--gemini")
  || proofPath !== null
  || ["1", "true", "yes", "on"].includes(geminiEnvironment);
const gemini = !geminiExplicitlyDisabled && (
  geminiRequested && (
    process.argv.includes("--gemini") || String(process.env.GEMINI_API_KEY ?? "").trim() !== ""
  )
);
const visual = process.argv.includes("--visual") || process.argv.includes("--release") || proofPath !== null || gemini;
const release = process.argv.includes("--release");
const maxFailureLines = 100;

function json(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function tail(text, lines = maxFailureLines) {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join("\n");
}

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  if (result.status !== 0) {
    console.error(`FAIL ${label}\n${tail(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)}`);
    process.exit(result.status ?? 1);
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const tests = output.match(/Tests\s+(\d+) passed/)?.[1];
  console.log(`PASS ${label}${tests ? ` (${tests} tests)` : ""}`);
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const coverage = json("docs/editor-contract/ggd-editor-coverage.json");
const capabilities = json("docs/editor-contract/ggd-runtime-capabilities.json");
const handback = json("docs/editor-contract/ggd-main-handback.json");
const worktreeStatus = git("status", "--porcelain", "--untracked-files=normal") ?? "";
console.log(JSON.stringify({
  schema: "ggd-editor-acceptance-run@1",
  mode: release ? "release" : visual ? "visual" : "quick",
  generatedAt: new Date().toISOString().replace(/:\d\d\.\d\d\dZ$/, "Z"),
  branch: git("branch", "--show-current"),
  head: git("rev-parse", "--short=12", "HEAD"),
  originMain: git("rev-parse", "--short=12", "origin/main"),
  dirty: worktreeStatus.length > 0,
  worktreeChangeCount: worktreeStatus === "" ? 0 : worktreeStatus.split(/\r?\n/).length,
  handbackMainCommit: handback.commit ?? handback.mainCommit ?? null,
  coverageFingerprint: coverage.fingerprint ?? null,
  capabilityFingerprint: capabilities.fingerprint ?? null,
  geminiVisualReview: gemini
    ? "enabled-advisory"
    : geminiExplicitlyDisabled
      ? "disabled-explicit"
      : geminiRequested
        ? "disabled-no-key"
        : "disabled-not-requested",
}));

if (proofPath) {
  run("46-document browser framebuffer import", "pnpm", [
    "skillforge:visual-proof:import", "--", proofPath, "--require-review",
  ]);
  run("42-theme / 46-document receipt refresh", "pnpm", ["skillforge:audit"]);
}

run("Main capability receipt", "pnpm", ["caps:check"]);
run("Editor coverage freshness", "pnpm", [
  "exec", "vitest", "run", "packages/shared/src/ops/editorCoverageFresh.test.ts",
  "--pool=threads", "--minWorkers=1", "--maxWorkers=1", "--reporter=dot",
]);
// ⭐⭐ owner 2026-09-05（逐字裁決）：
//   「**視覺驗收屬於內容而非功能面，不影響現在 code 合併就不考慮在這個範圍**」
//
// ⇒ ⭐ 視覺驗收（Codex 的 advisory 指紋）**不是 code 閘** ——
//   它是一個「有沒有人看過那些圖」的問題，而 `check.mjs:69` 自己的訊息早就這樣寫了：
//   「Codex visual advisory freshness is a **human-image-review gate, not a machine/code failure**」。
//
// ⛔⛔ 而在此之前 `--release` 會跑它 ⇒ CI 的 `contract` job 因此紅
//   ⇒ ⭐ **branch protection 把它列為必要 ⇒ 任何 PR 都 merge 不了。**
//   一個「內容還沒被人看過」的狀態，擋住了「程式對不對」的合併路徑。
//
// ⇒ 一律走 `--machine-only`：**機器驗得了的照驗**（46 份收據、Sim 預覽路由、
//   視覺證據匯入、人審包、接觸表全部留著），⛔ 只有「advisory 指紋新不新鮮」降級成 PENDING。
// ⭐ 它**不會消失** —— `skillforge:visual-advisory:check` 仍然存在，
//   由 `skills:sync` 的豁免表帶著理由追蹤（GH#986 的 F），⛔ 只是不再擋 code 合併。
run("Skill Forge", "pnpm", ["skillforge:check", "--", "--machine-only"]);
run("VFX Forge", "pnpm", ["vfxforge:check"]);

if (visual) {
  run("VFX texture × blendMode contract", "pnpm", [
    "exec", "vitest", "run", "packages/shared/src/content/unsafeTextureQuarantine.test.ts",
    "--pool=threads", "--minWorkers=1", "--maxWorkers=1", "--reporter=dot",
  ]);
}

if (gemini) {
  run("Optional Google Gemini VFX visual triage", "pnpm", [
    "vfx:review:batch", "--", "--enable-gemini", "--optional",
  ]);
}

if (release) {
  run("Editor typecheck", "pnpm", ["--filter", "@ggd/editor", "typecheck"]);
  run("Editor full tests", "pnpm", [
    "--filter", "@ggd/editor", "exec", "vitest", "run",
    "--pool=threads", "--minWorkers=1", "--maxWorkers=1", "--reporter=dot",
  ]);
  run("Editor production build", "pnpm", ["--filter", "@ggd/editor", "build"]);
}

console.log("PASS Editor acceptance complete; human visual verdict remains required for art direction/original-scene fidelity");
