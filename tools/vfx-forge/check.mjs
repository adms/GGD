#!/usr/bin/env node

/**
 * Compact VFX Forge gate.
 *
 * Keep routine validation cheap for both humans and coding agents: successful
 * commands emit one summary line, while failures expose only the useful tail.
 * The Main receipt comparison is deliberately read-only and does not turn a
 * known Main seam into a false Editor test failure.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const release = process.argv.includes("--release");
const maxFailureLines = 80;

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
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    console.error(`FAIL ${label}\n${tail(output)}`);
    process.exit(result.status ?? 1);
  }
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const tests = output.match(/Tests\s+(\d+) passed/)?.[1];
  console.log(`PASS ${label}${tests ? ` (${tests} tests)` : ""}`);
}

const handback = json("docs/editor-contract/ggd-main-handback.json");
const receipt = json("docs/editor-contract/ggd-presentation-receipt.json");
const handbackFingerprint = handback.receipts?.presentationReceiptFingerprint;
const receiptFingerprint = receipt.fingerprint;
const presentation = handback.presentationCapabilities ?? {};
const blockers = [];
const warnings = [];

if (receipt.replacementPolicy?.status !== "supported") {
  blockers.push(`replacementPolicy=${receipt.replacementPolicy?.status ?? "missing"}`);
}
if (presentation.singleArc !== "supported") blockers.push("singleArc unavailable");
if (presentation.evasionProvenance !== "supported") blockers.push("evasion provenance unavailable");
if (presentation.displaceCue !== "supported") blockers.push("displace cue unavailable");
if (handbackFingerprint !== receiptFingerprint) {
  warnings.push(`handback receipt ${handbackFingerprint ?? "missing"} != current ${receiptFingerprint ?? "missing"}`);
}

console.log(JSON.stringify({
  mainCommit: handback.commit ?? handback.mainCommit ?? null,
  receiptFingerprint: receiptFingerprint ?? null,
  blockers,
  warnings,
}));

const focusedTests = [
  "src/vfx-forge/presentationContract.test.ts",
  "src/vfx-forge/actionAnimationPrinciples.test.ts",
  "src/vfx-forge/acceptanceFixtures.test.ts",
  "src/vfx-forge/acceptanceSources.test.ts",
  "src/vfx-forge/acceptanceProposalArtifacts.test.ts",
  "src/vfx-forge/recipes.test.ts",
  "src/vfx-forge/model.test.ts",
  "src/vfx-forge/runtimeLimits.test.ts",
  "src/vfx-forge/assetSafety.test.ts",
  "src/vfx-forge/backdropFrameAudit.test.ts",
  "src/vfx-forge/stageShaderRegistration.test.ts",
  "src/vfx-forge/visualAcceptanceIssues.test.ts",
];

run("VFX Forge focused gate", "pnpm", [
  "--filter", "@ggd/editor", "exec", "vitest", "run",
  ...focusedTests,
  "--pool=threads", "--minWorkers=1", "--maxWorkers=1", "--reporter=dot",
]);

run("Runtime actor takeover routing", "pnpm", [
  "--filter", "@ggd/client", "exec", "vitest", "run",
  "src/vfx/VfxScriptPlayer.channelTakeover.test.ts",
  "--pool=threads", "--minWorkers=1", "--maxWorkers=1", "--reporter=dot",
]);

run("Editor VFX template handback freshness", "pnpm", ["vfxforge:handback:check"]);

if (release) {
  run("Editor typecheck", "pnpm", ["--filter", "@ggd/editor", "typecheck"]);
  run("Editor build", "pnpm", ["--filter", "@ggd/editor", "build"]);
  run("Main presentation receipt freshness", "pnpm", ["receipt:check"]);
}
