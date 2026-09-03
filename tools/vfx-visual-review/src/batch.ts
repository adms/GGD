#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseReviewRequest } from "./contracts.js";
import {
  adaptiveReviewFrameBudget,
  selectReviewFrames,
  shouldEscalate,
  type ProofFrame,
} from "./batchCore.js";
import {
  prepareReview,
  reportMarkdown,
  unavailableReportMarkdown,
  type ReviewReport,
} from "./review.js";
import {
  DEFAULT_GEMINI_MODEL,
  resolveGeminiEnablement,
  type GeminiEnablementReason,
  runGeminiReview,
  unavailableGeminiReport,
} from "./gemini.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface Args {
  proofManifest: string;
  acceptanceReport: string;
  outDir: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  enabled: boolean;
  enablementReason: GeminiEnablementReason;
  optional: boolean;
  escalateUncertain: boolean;
  ids: Set<string> | null;
  maxCases: number | null;
  maxFrames: number | null;
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
  status: "reviewed" | "insufficient-keyframes" | "not-captured" | "model-disabled" | "model-unavailable" | "model-error";
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

When GEMINI_API_KEY is present, advisory review is enabled automatically.

  --enable-gemini          Allow selected keyframes to be sent to Google Gemini
  --no-gemini              Force-disable remote review even when a key is configured
  --optional               Model/API failure becomes advisory evidence and exit 0
  --escalate-uncertain     Retry uncertain low-reasoning results once at medium (default: off)
  --ids a,b,c              Review only selected ability IDs
  --max-cases N            Bound this invocation (useful for calibration)
  --max-frames N           Override adaptive frame budget (2..18)
  --proof-manifest PATH    Browser framebuffer manifest
  --acceptance-report PATH 42/46 acceptance report
  --out-dir PATH           Evidence directory
  --model ID               Gemini model identifier (default: gemini-3.1-pro-preview)
  --timeout-ms N           Per request timeout`);
    process.exit(0);
  }
  const invocationDir = process.env.INIT_CWD ?? process.cwd();
  const numericMax = value(argv, "--max-cases");
  const maxCases = numericMax === undefined ? null : Number(numericMax);
  if (maxCases !== null && (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > 46)) {
    throw new Error("--max-cases must be an integer between 1 and 46");
  }
  const numericFrames = value(argv, "--max-frames");
  const maxFrames = numericFrames === undefined ? null : Number(numericFrames);
  if (maxFrames !== null && (!Number.isInteger(maxFrames) || maxFrames < 2 || maxFrames > 18)) {
    throw new Error("--max-frames must be an integer between 2 and 18");
  }
  const timeoutMs = Number(value(argv, "--timeout-ms") ?? "120000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000) {
    throw new Error("--timeout-ms must be an integer between 1000 and 900000");
  }
  const idsValue = value(argv, "--ids");
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  const enablement = resolveGeminiEnablement({
    forceEnable: argv.includes("--enable-gemini"),
    forceDisable: argv.includes("--no-gemini"),
    environment: process.env.GGD_VFX_GEMINI_ENABLED,
    apiKey,
  });
  return {
    proofManifest: resolve(invocationDir, value(argv, "--proof-manifest") ?? resolve(ROOT, "docs/_reports/editor-skill-basic-visual-proof/manifest.json")),
    acceptanceReport: resolve(invocationDir, value(argv, "--acceptance-report") ?? resolve(ROOT, "docs/_reports/editor-skill-acceptance-42x46.json")),
    outDir: resolve(invocationDir, value(argv, "--out-dir") ?? resolve(ROOT, "docs/_reports/editor-skill-gemini-review")),
    model: value(argv, "--model") ?? process.env.GGD_VFX_REVIEW_MODEL ?? DEFAULT_GEMINI_MODEL,
    apiKey,
    timeoutMs,
    enabled: enablement.enabled,
    enablementReason: enablement.reason,
    optional: argv.includes("--optional"),
    escalateUncertain: argv.includes("--escalate-uncertain"),
    ids: idsValue ? new Set(idsValue.split(",").map((id) => id.trim()).filter(Boolean)) : null,
    maxCases,
    maxFrames,
  };
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vfx";
}

function reportPath(outDir: string, id: string, digest: string, model: string, effort: "low" | "medium"): string {
  return resolve(outDir, "cases", `${safeName(id)}-${digest.slice(0, 12)}-gemini-${safeName(model)}-${effort}.json`);
}

function persistReport(outDir: string, report: ReviewReport): string {
  const path = reportPath(outDir, report.subject.id, report.sourceDigest, report.model.requested, report.model.reasoningEffort === "low" ? "low" : "medium");
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    writeFileSync(path.replace(/\.json$/, ".md"), reportMarkdown(report), { encoding: "utf8", flag: "wx" });
  }
  return path;
}

function cachedReport(path: string, model: string): ReviewReport | null {
  if (!existsSync(path)) return null;
  const report = json<ReviewReport>(path);
  return report.schema === "ggd-vfx-visual-review-report@1" && report.model.provider === "google-gemini" && report.model.requested === model
    ? report
    : null;
}

function writeBatch(
  outDir: string,
  status: string,
  rows: BatchRow[],
  detail: string,
  enablementReason: GeminiEnablementReason,
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(outDir, `batch-${stamp}.json`);
  const summary = {
    reviewed: rows.filter((row) => row.status === "reviewed").length,
    modelDisabled: rows.filter((row) => row.status === "model-disabled").length,
    insufficientKeyframes: rows.filter((row) => row.status === "insufficient-keyframes").length,
    notCaptured: rows.filter((row) => row.status === "not-captured").length,
    modelUnavailable: rows.filter((row) => row.status === "model-unavailable").length,
    modelError: rows.filter((row) => row.status === "model-error").length,
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
      enabledWhenApiKeyPresent: true,
      enablementReason,
      provider: "google-gemini",
      candidateFrames: "2..18 event-selected chronological keyframes; ordinary cap 8, strict cinematic cap 18",
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
      id: row.id, name: row.name, frameCount: 0, status: "model-disabled", finalClassification: "needs-human-review",
      note: `GEMINI_DISABLED: ${args.enablementReason}; no image was sent.`,
    }));
    const output = writeBatch(args.outDir, "disabled", rows, "Google Gemini review is disabled; no model request was made.", args.enablementReason);
    console.log(`[vfx-review-batch] GEMINI_DISABLED: ${output}`);
    return 0;
  }

  if (args.apiKey.trim() === "") {
    const rows: BatchRow[] = targets.map((row) => ({
      id: row.id, name: row.name, frameCount: 0, status: "model-unavailable", finalClassification: "needs-human-review",
      note: "GEMINI_API_KEY_MISSING: no image was sent; deterministic and human review continue.",
    }));
    const output = writeBatch(args.outDir, "model-unavailable", rows, "GEMINI_API_KEY is missing; no model request was made.", args.enablementReason);
    console.log(`[vfx-review-batch] GEMINI_API_KEY_MISSING: ${output}`);
    return 0;
  }

  const rows: BatchRow[] = [];
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const row = targets[targetIndex]!;
    const proofCase = proofById.get(row.id);
    if (!proofCase || proofCase.status !== "captured") {
      rows.push({ id: row.id, name: row.name, frameCount: 0, status: "not-captured", finalClassification: "not-reviewed", note: "Framebuffer evidence is not captured." });
      continue;
    }
    const frameBudget = adaptiveReviewFrameBudget(proofCase.frames, row.strictVisual, args.maxFrames);
    const selected = selectReviewFrames(proofCase.frames, frameBudget);
    if (selected.length < 2) {
      rows.push({ id: row.id, name: row.name, frameCount: selected.length, status: "insufficient-keyframes", finalClassification: "needs-human-review", note: "Fewer than two non-diagnostic frames; no model request was made." });
      continue;
    }
    const request = parseReviewRequest({
      schema: "ggd-vfx-visual-review-request@1",
      subject: { kind: "ability", id: row.id, name: row.name },
      expectation: { summary: row.acceptance },
      candidateFrames: selected.map((frame) => ({ path: frame.file, atMs: frame.atMs, phase: frame.label })),
      policy: { requiredChecks: ["effectPresence", "temporalOrder", "clipping", "readability"] },
    });
    const prepared = prepareReview(request, dirname(args.proofManifest));
    try {
      console.log(`[vfx-review-batch] opt-in upload ${row.id}: ${selected.length} keyframes -> generativelanguage.googleapis.com (${args.model})`);
      const lowPath = reportPath(args.outDir, row.id, prepared.sourceDigest, args.model, "low");
      const low = cachedReport(lowPath, args.model) ?? await runGeminiReview(prepared, {
        apiKey: args.apiKey, model: args.model,
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
        const mediumPath = reportPath(args.outDir, row.id, prepared.sourceDigest, args.model, "medium");
        const medium = cachedReport(mediumPath, args.model) ?? await runGeminiReview(prepared, {
          apiKey: args.apiKey, model: args.model,
          timeoutMs: args.timeoutMs, reasoningEffort: "medium",
        });
        const storedMedium = persistReport(args.outDir, medium);
        batchRow.escalated = { classification: medium.classification, sourceDigest: medium.sourceDigest, report: storedMedium };
        batchRow.finalClassification = medium.classification;
        batchRow.note = "Low pass was uncertain, so the same keyframes were retried once at medium; human review remains authoritative.";
      }
      rows.push(batchRow);
    } catch (error) {
      const unavailable = unavailableGeminiReport(prepared, args.model, error);
      const unavailablePath = resolve(args.outDir, "cases", `${safeName(row.id)}-${prepared.sourceDigest.slice(0, 12)}-unavailable.json`);
      if (!existsSync(unavailablePath)) {
        writeFileSync(unavailablePath, JSON.stringify(unavailable, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
        writeFileSync(unavailablePath.replace(/\.json$/, ".md"), unavailableReportMarkdown(unavailable), { encoding: "utf8", flag: "wx" });
      }
      const errorStatus = unavailable.reason.code === "GEMINI_UNAVAILABLE" ? "model-unavailable" : "model-error";
      rows.push({ id: row.id, name: row.name, frameCount: selected.length, status: errorStatus, finalClassification: "needs-human-review", note: unavailable.reason.detail });
      for (const remaining of targets.slice(targetIndex + 1)) {
        rows.push({
          id: remaining.id,
          name: remaining.name,
          frameCount: 0,
          status: errorStatus,
          finalClassification: "needs-human-review",
          note: `No request was made after ${unavailable.reason.code}; deterministic and human review continue.`,
        });
      }
      const output = writeBatch(args.outDir, errorStatus, rows, "Gemini inference stopped after the first error; no repeated requests were attempted.", args.enablementReason);
      console.log(`[vfx-review-batch] ${unavailable.reason.code}: ${output}`);
      return args.optional || unavailable.reason.code === "GEMINI_UNAVAILABLE" ? 0 : 2;
    }
  }

  const output = writeBatch(args.outDir, "complete", rows, "AI results are advisory triage only and do not satisfy human visual acceptance.", args.enablementReason);
  console.log(`[vfx-review-batch] complete: ${output}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => { console.error(`[vfx-review-batch] ${error instanceof Error ? error.message : String(error)}`); process.exit(2); },
);
