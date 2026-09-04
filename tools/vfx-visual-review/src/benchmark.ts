#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseReviewRequest } from "./contracts.js";
import {
  adaptiveReviewFrameBudget,
  selectReviewFrames,
  type ProofFrame,
} from "./batchCore.js";
import {
  type BenchmarkExpectation,
  type BenchmarkObservation,
  summarizeBenchmark,
} from "./benchmarkCore.js";
import {
  DEFAULT_GEMINI_MODEL,
  assertGeminiModel,
  resolveGeminiEnablement,
  runGeminiReview,
  unavailableGeminiReport,
} from "./gemini.js";
import { prepareReview } from "./review.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface ProofManifest {
  schema: string;
  cases: Array<{
    id: string;
    name: string;
    status: "captured" | "blocked" | "failed";
    frames: ProofFrame[];
  }>;
}

interface AcceptanceReport {
  schema: string;
  rows: Array<{ id: string; name: string; acceptance: string; strictVisual: boolean }>;
}

interface BenchmarkManifest {
  schema: "ggd-vfx-visual-benchmark-set@1";
  cases: Array<{
    id: string;
    expected: BenchmarkExpectation;
    labelReason: string;
  }>;
}

function value(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const result = argv[index + 1];
  if (!result || result.startsWith("--")) throw new Error(`${flag} requires a value`);
  return result;
}

function integer(argv: string[], flag: string, fallback: number, min: number, max: number): number {
  const result = Number(value(argv, flag) ?? fallback);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new Error(`${flag} must be an integer between ${min} and ${max}`);
  }
  return result;
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(`Usage: vfx-visual-review-benchmark [options]

  --models a,b       Gemini model IDs (default: gemini-3.1-pro-preview)
  --repeats N        Repetitions per labelled case (default: 3; max: 10)
  --max-frames N     Override adaptive frame budget (2..18)
  --timeout-ms N     Per-request timeout (default: 120000)
  --manifest PATH    Human-labelled benchmark set
  --proof PATH       Browser proof manifest
  --acceptance PATH  42/46 acceptance report
  --out-dir PATH     Benchmark evidence directory
  --no-gemini        Write a disabled receipt and send no images`);
    return 0;
  }
  const invocationDir = process.env.INIT_CWD ?? process.cwd();
  const manifestPath = resolve(invocationDir, value(argv, "--manifest") ?? resolve(ROOT, "tools/vfx-visual-review/benchmark-set.json"));
  const proofPath = resolve(invocationDir, value(argv, "--proof") ?? resolve(ROOT, "docs/_reports/editor-skill-basic-visual-proof/manifest.json"));
  const acceptancePath = resolve(invocationDir, value(argv, "--acceptance") ?? resolve(ROOT, "docs/_reports/editor-skill-acceptance-42x46.json"));
  const outDir = resolve(invocationDir, value(argv, "--out-dir") ?? resolve(ROOT, "docs/_reports/editor-skill-gemini-benchmark"));
  const repeats = integer(argv, "--repeats", 3, 1, 10);
  const timeoutMs = integer(argv, "--timeout-ms", 120_000, 1_000, 900_000);
  const maxFramesRaw = value(argv, "--max-frames");
  const maxFrames = maxFramesRaw === undefined ? null : integer(argv, "--max-frames", 18, 2, 18);
  const models = (value(argv, "--models") ?? DEFAULT_GEMINI_MODEL)
    .split(",").map((model) => assertGeminiModel(model.trim())).filter(Boolean);
  if (models.length === 0 || models.length > 4) throw new Error("--models must contain 1..4 Gemini model IDs");

  const apiKey = process.env.GEMINI_API_KEY ?? "";
  const enablement = resolveGeminiEnablement({
    forceDisable: argv.includes("--no-gemini"),
    environment: process.env.GGD_VFX_GEMINI_ENABLED,
    apiKey,
  });
  const benchmark = json<BenchmarkManifest>(manifestPath);
  const proof = json<ProofManifest>(proofPath);
  const acceptance = json<AcceptanceReport>(acceptancePath);
  if (benchmark.schema !== "ggd-vfx-visual-benchmark-set@1") throw new Error("unsupported benchmark manifest schema");
  if (proof.schema !== "ggd-editor-basic-visual-proof-manifest@1") throw new Error("unsupported proof manifest schema");
  if (acceptance.schema !== "ggd-editor-skill-acceptance@1") throw new Error("unsupported acceptance report schema");
  mkdirSync(resolve(outDir, "runs"), { recursive: true });

  const proofById = new Map(proof.cases.map((entry) => [entry.id, entry] as const));
  const acceptanceById = new Map(acceptance.rows.map((entry) => [entry.id, entry] as const));
  const observations: BenchmarkObservation[] = [];
  const evidence: Array<Record<string, unknown>> = [];
  let stopReason: string | null = null;

  if (enablement.enabled) {
    outer: for (const model of models) {
      for (const labelled of benchmark.cases) {
        const proofCase = proofById.get(labelled.id);
        const row = acceptanceById.get(labelled.id);
        if (!proofCase || proofCase.status !== "captured" || !row) {
          evidence.push({ id: labelled.id, model, status: "skipped", reason: "captured proof or acceptance row missing" });
          continue;
        }
        const budget = adaptiveReviewFrameBudget(proofCase.frames, row.strictVisual, maxFrames);
        const selected = selectReviewFrames(proofCase.frames, budget);
        if (selected.length < 2) {
          evidence.push({ id: labelled.id, model, status: "skipped", reason: "fewer than two distinct temporal frames" });
          continue;
        }
        const request = parseReviewRequest({
          schema: "ggd-vfx-visual-review-request@1",
          subject: { kind: "ability", id: row.id, name: row.name },
          expectation: { summary: row.acceptance },
          candidateFrames: selected.map((frame) => ({ path: frame.file, atMs: frame.atMs, phase: frame.label })),
          policy: { requiredChecks: ["effectPresence", "temporalOrder", "clipping", "readability"] },
        });
        const prepared = prepareReview(request, dirname(proofPath));
        for (let repetition = 1; repetition <= repeats; repetition += 1) {
          try {
            console.log(`[vfx-benchmark] ${model} ${labelled.id} ${repetition}/${repeats}: ${selected.length} frames`);
            const report = await runGeminiReview(prepared, {
              apiKey,
              model,
              timeoutMs,
              reasoningEffort: "low",
            });
            const runPath = resolve(outDir, "runs", `${stamp()}-${labelled.id.replace(/[^a-z0-9._-]/gi, "-")}-${model}-r${repetition}.json`);
            writeFileSync(runPath, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
            observations.push({
              model,
              caseId: labelled.id,
              expected: labelled.expected,
              status: "completed",
              overall: report.modelResult.overall,
              durationMs: report.model.durationMs,
              totalTokens: report.model.usage?.totalTokens,
            });
            evidence.push({
              id: labelled.id,
              labelReason: labelled.labelReason,
              expected: labelled.expected,
              model,
              repetition,
              frameCount: selected.length,
              report: runPath,
            });
          } catch (error) {
            const unavailable = unavailableGeminiReport(prepared, model, error);
            const status = unavailable.reason.code === "GEMINI_UNAVAILABLE" ? "unavailable" : "error";
            observations.push({ model, caseId: labelled.id, expected: labelled.expected, status });
            evidence.push({ id: labelled.id, model, repetition, status, reason: unavailable.reason.code });
            stopReason = `${unavailable.reason.code}: benchmark stopped to avoid repeated failed requests`;
            break outer;
          }
        }
      }
    }
  } else {
    stopReason = `${enablement.reason}: no image was transmitted`;
  }

  const output = resolve(outDir, `benchmark-${stamp()}.json`);
  writeFileSync(output, JSON.stringify({
    schema: "ggd-vfx-visual-benchmark-report@1",
    authority: "advisory-measurement-only",
    generatedAt: new Date().toISOString(),
    enablement: { enabled: enablement.enabled, reason: enablement.reason },
    policy: {
      repeats,
      models,
      reasoningEffort: "low",
      frameBudget: maxFrames ?? "adaptive-2..18",
      positivePassAuthority: false,
      stopOnFirstProviderFailure: true,
    },
    labelledCases: benchmark.cases,
    summaries: models.map((model) => summarizeBenchmark(model, observations)),
    observations,
    evidence,
    stopReason,
  }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  console.log(`[vfx-benchmark] report: ${output}`);
  if (stopReason) console.log(`[vfx-benchmark] ${stopReason}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[vfx-benchmark] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
