#!/usr/bin/env node

/**
 * Compact, deterministic Skill Forge acceptance gate.
 *
 * It validates the no-code creation skeleton, Main-backed tier/origin recipes,
 * complete shipped vocabulary sample, template stacking, condition controls and
 * a real Sim cast. Successful stages print one line; failures retain only the
 * useful tail so routine verification does not flood an agent context window.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const maxFailureLines = 80;

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

const focusedTests = [
  "src/collections.test.ts",
  "src/forge/skillTypePresets.test.ts",
  "src/forge/skillAcceptanceCatalog.test.ts",
  "src/forge/skillReasonableness.test.ts",
  "src/forge/runtimePreviewDoc.test.ts",
  "src/forge/forgeRealCast.test.ts",
  "src/forge/conditionEditor.test.ts",
  "src/forge/forgeStudioCondition.test.ts",
  "src/forge/forgeStudioStack.test.ts",
  "src/forge/forgeWritebackTemplateGate.test.ts",
  "src/preview/forgeRealCast.test.ts",
  "src/vfx-forge/backdropFrameAudit.test.ts",
  "src/vfx-forge/assetSafety.test.ts",
  "src/vfx-forge/basicVisualAuthoring.test.ts",
  "src/vfx-forge/mechanicVisualOverlay.test.ts",
  "src/vfx-forge/visualAcceptanceIssues.test.ts",
  "../../tools/skill-forge/visualProofImport.test.ts",
];

run("Skill Forge no-code acceptance", "pnpm", [
  "--filter", "@ggd/editor", "exec", "vitest", "run",
  ...focusedTests,
  "--pool=threads", "--minWorkers=1", "--maxWorkers=1", "--reporter=dot",
]);

// ⛔ 標籤裡不寫死分母（CLAUDE.md 第三守則）：驗收範圍已經從 42/46 長到 43/47，
//    而每一支被叫起來的工具**自己就會印出它今天的分母** —— 抄一份在標籤裡只會過期。
run("acceptance receipt", "pnpm", ["skillforge:audit:check"]);
run("real Sim preview routes", "pnpm", ["skillforge:sim-audit", "--", "--summary"]);
run("visual proof importer", "pnpm", ["skillforge:visual-proof:import", "--", "--self-test"]);
run("human review packet", "pnpm", ["skillforge:visual-review:check"]);
run("chronological visual contact sheets", "pnpm", ["skillforge:visual-sheets:check"]);
// ⛔⛔ GH#986 —— 這裡在 2026-09-07 之前有一條 `--machine-only` 的跳過路徑，訊息逐字是
//    「Codex visual advisory freshness is a **human-image-review gate**, not a machine/code failure」。
//    ⭐ 那句話**方向相反**：`build-codex-visual-advisory.mjs` 反而**要求** owner 的 verdict 全部維持 pending
//    （`humanPending === captured`）⇒ owner 真的去批核會讓它紅。它是一條**決定性的**新鮮度閘
//    （逐份 sha256 digest 對得上就綠），⛔ 不是在等一個人看圖 ⇒ 沒有理由跳過它。
run("Codex visual advisory", "pnpm", ["skillforge:visual-advisory:check"]);
