#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseReviewRequest } from "./contracts.js";
import { localLlmEnabled, selectReviewFrames, shouldEscalate, type ProofFrame } from "./batchCore.js";
import {
  assertLoopbackApiRoot,
  prepareReview,
  reportMarkdown,
  runReview,
  unavailableReportMarkdown,
  unavailableReviewReport,
  type ReviewReport,
} from "./review.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Args {
  proofManifest: string;
  acceptanceReport: string;
  outDir: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  enabled: boolean;
  optional: boolean;
  escalateUncertain: boolean;
  ids: Set<string> | null;
  maxCases: number | null;
}

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

interface BatchRow {
  id: string;
  name: string;
  frameCount: number;
  low?: { classification: ReviewReport["classification"]; sourceDigest: string; report: string };
  escalated?: { classification: ReviewReport["classification"]; sourceDigest: string; report: string };
  status: "reviewed" | "insufficient-keyframes" | "not-captured" | "local-model-unavailable" | "local-model-error";
  finalClassification: ReviewReport["classification"] | "not-reviewed";
  note: string;
}

function value(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const result = argv[index + 1];
  if (!result || result.startsWith("--")) throw new Error(`${flag} requires a value`);
  return result;
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help")) {
    console.log(`Usage: vfx-visual-review-batch [options]

Default is OFF and performs no model request. Add --enable-local-llm to opt in.

  --enable-local-llm       Allow localhost inference for this run
  --optional               Model/API failure becomes advisory evidence and exit 0
  --escalate-uncertain     Retry uncertain low-reasoning results once at medium (default: off)
  --ids a,b,c              Review only selected ability IDs
  --max-cases N            Bound this invocation (useful for calibration)
  --proof-manifest PATH    Browser framebuffer manifest
  --acceptance-report PATH 42/46 acceptance report
  --out-dir PATH           Evidence directory
  --model ID               LM Studio model identifier
  --base-url URL           Loopback LM Studio API root
  --timeout-ms N           Per request timeout`);
    process.exit(0);
  }
  const invocationDir = process.env.INIT_CWD ?? process.cwd();
  const numericMax = value(argv, "--max-cases");
  const maxCases = numericMax === undefined ? null : Number(numericMax);
  if (maxCases !== null && (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > 46)) {
    throw new Error("--max-cases must be an integer between 1 and 46");
  }
  const timeoutMs = Number(value(argv, "--timeout-ms") ?? "180000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000) {
    throw new Error("--timeout-ms must be an integer between 1000 and 900000");
  }
  const idsValue = value(argv, "--ids");
  return {
    proofManifest: resolve(invocationDir, value(argv, "--proof-manifest") ?? resolve(ROOT, "docs/_reports/editor-skill-basic-visual-proof/manifest.json")),
    acceptanceReport: resolve(invocationDir, value(argv, "--acceptance-report") ?? resolve(ROOT, "docs/_reports/editor-skill-acceptance-42x46.json")),
    outDir: resolve(invocationDir, value(argv, "--out-dir") ?? resolve(ROOT, "docs/_reports/editor-skill-local-llm-review")),
    model: value(argv, "--model") ?? process.env.GGD_VFX_REVIEW_MODEL ?? "qwen/qwen3.8-27b",
    baseUrl: value(argv, "--base-url") ?? process.env.GGD_VFX_REVIEW_BASE_URL ?? "http://127.0.0.1:1234/v1",
    timeoutMs,
    enabled: localLlmEnabled(argv.includes("--enable-local-llm"), process.env.GGD_VFX_LOCAL_LLM_ENABLED),
    optional: argv.includes("--optional"),
    escalateUncertain: argv.includes("--escalate-uncertain"),
    ids: idsValue ? new Set(idsValue.split(",").map((id) => id.trim()).filter(Boolean)) : null,
    maxCases,
  };
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vfx";
}

function reportPath(outDir: string, id: string, digest: string, effort: "low" | "medium"): string {
  return resolve(outDir, "cases", `${safeName(id)}-${digest.slice(0, 12)}-${effort}.json`);
}

function persistReport(outDir: string, report: ReviewReport): string {
  const path = reportPath(outDir, report.subject.id, report.sourceDigest, report.model.reasoningEffort === "low" ? "low" : "medium");
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    writeFileSync(path.replace(/\.json$/, ".md"), reportMarkdown(report), { encoding: "utf8", flag: "wx" });
  }
  return path;
}

function cachedReport(path: string): ReviewReport | null {
  if (!existsSync(path)) return null;
  const report = json<ReviewReport>(path);
  return report.schema === "ggd-vfx-visual-review-report@1" ? report : null;
}

function writeBatch(outDir: string, status: string, rows: BatchRow[], detail: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(outDir, `batch-${stamp}.json`);
  const summary = {
    reviewed: rows.filter((row) => row.status === "reviewed").length,
    insufficientKeyframes: rows.filter((row) => row.status === "insufficient-keyframes").length,
    notCaptured: rows.filter((row) => row.status === "not-captured").length,
    modelUnavailable: rows.filter((row) => row.status === "local-model-unavailable").length,
    modelError: rows.filter((row) => row.status === "local-model-error").length,
    aiPrechecked: rows.filter((row) => row.finalClassification === "ai-prechecked").length,
    aiRejected: rows.filter((row) => row.finalClassification === "ai-rejected").length,
    needsHumanReview: rows.filter((row) => row.finalClassification === "needs-human-review").length,
  };
  writeFileSync(path, JSON.stringify({
    schema: "ggd-vfx-visual-review-batch@1",
    authority: "advisory-only",
    generatedAt: new Date().toISOString(),
    status,
    detail,
    policy: {
      enabledByDefault: false,
      candidateFrames: "2..4 automatically selected keyframes",
      firstPass: "low",
      escalation: "off by default; when explicitly enabled, only uncertain low-pass results retry at medium",
      fallback: "deterministic checks and human review continue",
    },
    summary,
    rows,
  }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  return path;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const proof = json<ProofManifest>(args.proofManifest);
  const acceptance = json<AcceptanceReport>(args.acceptanceReport);
  if (proof.schema !== "ggd-editor-basic-visual-proof-manifest@1") throw new Error("unsupported proof manifest schema");
  if (acceptance.schema !== "ggd-editor-skill-acceptance@1") throw new Error("unsupported acceptance report schema");
  mkdirSync(resolve(args.outDir, "cases"), { recursive: true });

  const proofById = new Map(proof.cases.map((entry) => [entry.id, entry] as const));
  let targets = acceptance.rows.filter((row) => args.ids === null || args.ids.has(row.id));
  if (args.maxCases !== null) targets = targets.slice(0, args.maxCases);

  if (!args.enabled) {
    const rows: BatchRow[] = targets.map((row) => ({
      id: row.id, name: row.name, frameCount: 0, status: "not-captured", finalClassification: "not-reviewed",
      note: "LOCAL_MODEL_DISABLED: opt-in switch is off; no image was sent.",
    }));
    const output = writeBatch(args.outDir, "disabled", rows, "Local LLM review is disabled by default; no model request was made.");
    console.log(`[vfx-review-batch] LOCAL_MODEL_DISABLED: ${output}`);
    return 0;
  }

  assertLoopbackApiRoot(args.baseUrl);
  const rows: BatchRow[] = [];
  for (const row of targets) {
    const proofCase = proofById.get(row.id);
    if (!proofCase || proofCase.status !== "captured") {
      rows.push({ id: row.id, name: row.name, frameCount: 0, status: "not-captured", finalClassification: "not-reviewed", note: "Framebuffer evidence is not captured." });
      continue;
    }
    const selected = selectReviewFrames(proofCase.frames, row.strictVisual ? 4 : 2);
    if (selected.length < 2) {
      rows.push({ id: row.id, name: row.name, frameCount: selected.length, status: "insufficient-keyframes", finalClassification: "needs-human-review", note: "Fewer than two non-diagnostic frames; no model request was made." });
      continue;
    }
    const request = parseReviewRequest({
      schema: "ggd-vfx-visual-review-request@1",
      subject: { kind: "ability", id: row.id, name: row.name },
      expectation: { summary: row.acceptance },
      candidateFrames: selected.map((frame) => ({ path: frame.file, atMs: frame.atMs, phase: frame.label })),
      policy: { requiredChecks: row.strictVisual ? ["effectPresence", "temporalOrder", "clipping", "readability"] : ["effectPresence", "clipping", "readability"] },
    });
    const prepared = prepareReview(request, dirname(args.proofManifest));
    try {
      const lowPath = reportPath(args.outDir, row.id, prepared.sourceDigest, "low");
      const low = cachedReport(lowPath) ?? await runReview(prepared, {
        baseUrl: args.baseUrl, model: args.model, apiToken: process.env.LM_STUDIO_API_TOKEN,
        timeoutMs: args.timeoutMs, reasoningEffort: "low",
      });
      const storedLow = persistReport(args.outDir, low);
      const batchRow: BatchRow = {
        id: row.id,
        name: row.name,
        frameCount: selected.length,
        status: "reviewed",
        finalClassification: low.classification,
        note: "Low-reasoning advisory precheck complete; human review remains authoritative.",
        low: { classification: low.classification, sourceDigest: low.sourceDigest, report: storedLow },
      };
      if (args.escalateUncertain && shouldEscalate(low)) {
        const mediumPath = reportPath(args.outDir, row.id, prepared.sourceDigest, "medium");
        const medium = cachedReport(mediumPath) ?? await runReview(prepared, {
          baseUrl: args.baseUrl, model: args.model, apiToken: process.env.LM_STUDIO_API_TOKEN,
          timeoutMs: args.timeoutMs, reasoningEffort: "medium",
        });
        const storedMedium = persistReport(args.outDir, medium);
        batchRow.escalated = { classification: medium.classification, sourceDigest: medium.sourceDigest, report: storedMedium };
        batchRow.finalClassification = medium.classification;
        batchRow.note = "Low pass was uncertain, so the same keyframes were retried once at medium; human review remains authoritative.";
      }
      rows.push(batchRow);
    } catch (error) {
      const unavailable = unavailableReviewReport(prepared, args, error);
      const unavailablePath = resolve(args.outDir, "cases", `${safeName(row.id)}-${prepared.sourceDigest.slice(0, 12)}-unavailable.json`);
      if (!existsSync(unavailablePath)) {
        writeFileSync(unavailablePath, JSON.stringify(unavailable, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
        writeFileSync(unavailablePath.replace(/\.json$/, ".md"), unavailableReportMarkdown(unavailable), { encoding: "utf8", flag: "wx" });
      }
      const errorStatus = unavailable.reason.code === "LOCAL_MODEL_UNAVAILABLE" ? "local-model-unavailable" : "local-model-error";
      rows.push({ id: row.id, name: row.name, frameCount: selected.length, status: errorStatus, finalClassification: "needs-human-review", note: unavailable.reason.detail });
      const output = writeBatch(args.outDir, errorStatus, rows, "Local inference stopped after the first error; no repeated requests were attempted.");
      console.log(`[vfx-review-batch] ${unavailable.reason.code}: ${output}`);
      return args.optional ? 0 : 2;
    }
  }

  const output = writeBatch(args.outDir, "complete", rows, "AI results are advisory triage only and do not satisfy human visual acceptance.");
  console.log(`[vfx-review-batch] complete: ${output}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => { console.error(`[vfx-review-batch] ${error instanceof Error ? error.message : String(error)}`); process.exit(2); },
);
