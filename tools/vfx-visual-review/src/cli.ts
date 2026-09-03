#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { parseReviewRequest } from "./contracts.js";
import {
  prepareReview,
  reportMarkdown,
  unavailableReportMarkdown,
} from "./review.js";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_API_ORIGIN,
  disabledGeminiReport,
  resolveGeminiEnablement,
  runGeminiReview,
  unavailableGeminiReport,
} from "./gemini.js";

interface Args {
  input: string;
  outDir: string;
  model: string;
  timeoutMs: number;
  reasoningEffort: "low" | "medium" | "xhigh";
  dryRun: boolean;
  optional: boolean;
  enabled: boolean;
}

function usage(): string {
  return `Usage: vfx-visual-review --input REQUEST.json --out-dir DIR [options]

Options:
  --model ID        Gemini model identifier (default: gemini-3.1-pro-preview)
  --timeout-ms N    Request timeout (default: 120000)
  --reasoning-effort low|medium|xhigh (default: low)
  --dry-run         Validate/hash images and write the prepared prompt without calling a model
  --enable-gemini   Explicitly enable sending 2..18 keyframes to Google Gemini
  --no-gemini       Force-disable remote review even when GEMINI_API_KEY is set
  --optional        API failure becomes needs-human-review evidence and exits 0
  --help            Show this help

Environment:
  GEMINI_API_KEY (enables review when present), GGD_VFX_GEMINI_ENABLED=0|1,
  GGD_VFX_REVIEW_MODEL,
  GGD_VFX_REVIEW_REASONING_EFFORT`;
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help")) {
    console.log(usage());
    process.exit(0);
  }
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    return value;
  };
  const input = get("--input");
  const outDir = get("--out-dir");
  if (!input || !outDir) throw new Error("--input and --out-dir are required\n\n" + usage());
  const invocationDir = process.env.INIT_CWD ?? process.cwd();
  const timeoutMs = Number(get("--timeout-ms") ?? "120000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000) {
    throw new Error("--timeout-ms must be an integer between 1000 and 900000");
  }
  const reasoningEffort = get("--reasoning-effort") ?? process.env.GGD_VFX_REVIEW_REASONING_EFFORT ?? "low";
  if (!["low", "medium", "xhigh"].includes(reasoningEffort)) {
    throw new Error("--reasoning-effort must be low, medium, or xhigh");
  }
  const enablement = resolveGeminiEnablement({
    forceEnable: argv.includes("--enable-gemini"),
    forceDisable: argv.includes("--no-gemini"),
    environment: process.env.GGD_VFX_GEMINI_ENABLED,
    apiKey: process.env.GEMINI_API_KEY,
  });
  return {
    input: resolve(invocationDir, input),
    outDir: resolve(invocationDir, outDir),
    model: get("--model") ?? process.env.GGD_VFX_REVIEW_MODEL ?? DEFAULT_GEMINI_MODEL,
    timeoutMs,
    reasoningEffort: reasoningEffort as Args["reasoningEffort"],
    dryRun: argv.includes("--dry-run"),
    optional: argv.includes("--optional"),
    enabled: enablement.enabled,
  };
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vfx";
}

function outputBase(args: Args, subjectId: string, digest: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(args.outDir, `${safeName(subjectId)}-${digest.slice(0, 12)}-${stamp}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const request = parseReviewRequest(JSON.parse(readFileSync(args.input, "utf8")) as unknown);
  const prepared = prepareReview(request, dirname(args.input));
  mkdirSync(args.outDir, { recursive: true });
  const output = outputBase(args, request.subject.id, prepared.sourceDigest);

  if (args.dryRun) {
    const frames = prepared.frames.map(({ dataUrl: _dataUrl, absolutePath: _absolutePath, ...frame }) => frame);
    const payload = {
      schema: "ggd-vfx-visual-review-prepared@1",
      authority: "advisory-only",
      input: basename(args.input),
      model: args.model,
      endpoint: GEMINI_API_ORIGIN,
      reasoningEffort: args.reasoningEffort,
      sourceDigest: prepared.sourceDigest,
      policy: { minConfidence: prepared.minConfidence, requiredChecks: prepared.requiredChecks },
      prompt: prepared.prompt,
      frames,
    };
    writeFileSync(`${output}.prepared.json`, JSON.stringify(payload, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    console.log(`[vfx-review] prepared ${frames.length} frame(s): ${output}.prepared.json`);
    console.log("[vfx-review] --dry-run: Google Gemini was not contacted");
    return 0;
  }

  if (!args.enabled) {
    const disabled = disabledGeminiReport(prepared, args.model);
    writeFileSync(`${output}.json`, JSON.stringify(disabled, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    writeFileSync(`${output}.md`, unavailableReportMarkdown(disabled), { encoding: "utf8", flag: "wx" });
    console.log(`[vfx-review] ${disabled.reason.code}: ${output}.json`);
    console.log("[vfx-review] Gemini disabled; deterministic and human gates continue");
    return 0;
  }

  let report;
  try {
    console.log(`[vfx-review] opt-in upload: ${prepared.frames.length} keyframe(s) -> generativelanguage.googleapis.com (${args.model})`);
    report = await runGeminiReview(prepared, {
      apiKey: process.env.GEMINI_API_KEY ?? "",
      model: args.model,
      timeoutMs: args.timeoutMs,
      reasoningEffort: args.reasoningEffort,
    });
  } catch (error) {
    const unavailable = unavailableGeminiReport(prepared, args.model, error);
    writeFileSync(`${output}.json`, JSON.stringify(unavailable, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    writeFileSync(`${output}.md`, unavailableReportMarkdown(unavailable), { encoding: "utf8", flag: "wx" });
    console.log(`[vfx-review] ${unavailable.reason.code}: ${output}.json`);
    console.log("[vfx-review] Gemini skipped; SimWorld/event trace and human review remain required");
    return args.optional || unavailable.reason.code === "GEMINI_API_KEY_MISSING" || unavailable.reason.code === "GEMINI_UNAVAILABLE" ? 0 : 2;
  }
  writeFileSync(`${output}.json`, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  writeFileSync(`${output}.md`, reportMarkdown(report), { encoding: "utf8", flag: "wx" });
  console.log(`[vfx-review] ${report.classification}: ${output}.json`);
  console.log(`[vfx-review] human-readable report: ${output}.md`);
  if (report.classification === "ai-rejected") return 1;
  if (report.classification === "needs-human-review") return 3;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[vfx-review] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  },
);
