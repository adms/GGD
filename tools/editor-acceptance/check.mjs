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
run("Skill Forge", "pnpm", release
  ? ["skillforge:check"]
  : ["skillforge:check", "--", "--machine-only"]);
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
