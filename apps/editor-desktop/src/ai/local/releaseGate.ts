import { sha256Hex, stableStringify } from "@ggd/shared/content";
import {
  LOCAL_AI_RELEASE_CORPUS,
  LOCAL_AI_RELEASE_CORPUS_DIGEST,
  LOCAL_AI_RELEASE_CORPUS_VERSION,
  LOCAL_AI_EVAL_SYSTEM_PROMPT,
  type LocalAiEvalCase,
  type LocalAiEvalDecision,
} from "./releaseCorpus";
import { LOCAL_MODEL_MANIFEST } from "./modelManifest";

export const LOCAL_AI_EVAL_OUTPUT_SCHEMA = "ggd-local-ai-eval-output@1" as const;
export const LOCAL_AI_EVAL_RECEIPT_SCHEMA = "ggd-local-ai-eval-receipt@1" as const;
export const LOCAL_AI_RELEASE_ASSESSMENT_SCHEMA = "ggd-local-ai-release-assessment@1" as const;

export const LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema", "caseId", "decision", "canonicalId", "versionId", "selectedTemplateIds", "selectedCapabilityIds",
    "selectedDirectionOptionIds", "selectedFallbackOptionIds", "ownerText", "mechanics", "explanation",
  ],
  properties: {
    schema: { const: LOCAL_AI_EVAL_OUTPUT_SCHEMA },
    caseId: { type: "string", minLength: 1, maxLength: 100 },
    decision: { enum: ["accept", "degrade", "refuse"] },
    canonicalId: { type: ["string", "null"] },
    versionId: { type: ["string", "null"] },
    selectedTemplateIds: { type: "array", items: { type: "string" }, maxItems: 8 },
    selectedCapabilityIds: { type: "array", items: { type: "string" }, maxItems: 128 },
    selectedDirectionOptionIds: { type: "array", items: { type: "string" }, maxItems: 32 },
    selectedFallbackOptionIds: { type: "array", items: { type: "string" }, maxItems: 32 },
    ownerText: { type: ["string", "null"] },
    mechanics: { type: "array", items: { type: "string" }, maxItems: 32 },
    explanation: { type: "string", minLength: 1, maxLength: 4000 },
  },
} as const;
export const LOCAL_AI_EVAL_PROMPT_DIGEST = sha256Hex(LOCAL_AI_EVAL_SYSTEM_PROMPT);
export const LOCAL_AI_EVAL_GRAMMAR_DIGEST = sha256Hex(stableStringify(LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA));

export type LocalAiRuntimeTarget =
  | "darwin-arm64-metal"
  | "darwin-x64-cpu"
  | "win32-x64-cuda"
  | "win32-x64-vulkan"
  | "win32-x64-cpu";

export const REQUIRED_RUNTIME_TARGETS: readonly LocalAiRuntimeTarget[] = [
  "darwin-arm64-metal", "darwin-x64-cpu", "win32-x64-cuda", "win32-x64-vulkan", "win32-x64-cpu",
];
export const REQUIRED_QUALITY_TARGETS: readonly LocalAiRuntimeTarget[] = ["darwin-arm64-metal", "win32-x64-cuda"];
export const LOCAL_AI_RELEASE_LIMITS = Object.freeze({
  minimumScorePct: 95,
  maximumCriticalErrors: 0,
  maximumWarmSectionP95Ms: 10_000,
  maximumColdStartMs: 30_000,
  minimumWindowsGpuMemoryBytes: 15 * 1024 ** 3,
  maximumWindowsPeakVramBytes: 14 * 1024 ** 3,
  minimumMacSystemMemoryBytes: 24 * 1024 ** 3,
  maximumMacPeakRssBytes: 18 * 1024 ** 3,
});

export interface LocalAiEvalOutput {
  readonly schema: typeof LOCAL_AI_EVAL_OUTPUT_SCHEMA;
  readonly caseId: string;
  readonly decision: LocalAiEvalDecision;
  readonly canonicalId: string | null;
  readonly versionId: string | null;
  readonly selectedTemplateIds: readonly string[];
  readonly selectedCapabilityIds: readonly string[];
  readonly selectedDirectionOptionIds: readonly string[];
  readonly selectedFallbackOptionIds: readonly string[];
  readonly ownerText: string | null;
  readonly mechanics: readonly string[];
  readonly explanation: string;
  readonly durationMs: number;
}

export interface LocalAiReleaseRun {
  readonly schema: "ggd-local-ai-release-run@1";
  readonly suite: "quality" | "runtime-smoke";
  readonly target: LocalAiRuntimeTarget;
  readonly model: { readonly id: string; readonly sha256: string; readonly bytes: number };
  readonly runtime: { readonly version: string; readonly sha256: string };
  readonly promptSha256: string;
  readonly grammarSha256: string;
  readonly hardware: {
    readonly os: string;
    readonly cpu: string;
    readonly systemMemoryBytes: number;
    readonly gpu: string | null;
    readonly gpuMemoryBytes: number | null;
    readonly driver: string | null;
  };
  readonly metrics: {
    readonly coldStartMs: number;
    readonly warmStartMs: number;
    readonly peakRssBytes: number;
    readonly peakVramBytes: number | null;
    readonly context4kPassed: boolean;
    readonly context8kPassed: boolean;
    readonly editor3dConcurrentPassed: boolean;
    readonly cancellationPassed: boolean;
    readonly oomRecoveryPassed: boolean;
    readonly offlinePassed: boolean;
    readonly cleanInstallPassed: boolean;
  };
  readonly outputs: readonly LocalAiEvalOutput[];
  readonly createdAt: string;
}

export interface LocalAiEvalReceipt {
  readonly schema: typeof LOCAL_AI_EVAL_RECEIPT_SCHEMA;
  readonly suite: LocalAiReleaseRun["suite"];
  readonly target: LocalAiRuntimeTarget;
  readonly model: LocalAiReleaseRun["model"];
  readonly runtime: LocalAiReleaseRun["runtime"];
  readonly promptSha256: string;
  readonly grammarSha256: string;
  readonly corpusVersion: typeof LOCAL_AI_RELEASE_CORPUS_VERSION;
  readonly corpusDigest: string;
  readonly caseCount: number;
  readonly passedCases: number;
  readonly scorePct: number;
  readonly criticalErrors: readonly { caseId: string; reasons: readonly string[] }[];
  readonly p95SectionMs: number | null;
  readonly hardware: LocalAiReleaseRun["hardware"];
  readonly metrics: LocalAiReleaseRun["metrics"];
  readonly createdAt: string;
  readonly receiptDigest: string;
}

const HEX = /^[a-f0-9]{64}$/;
const OUTPUT_KEYS = [
  "schema", "caseId", "decision", "canonicalId", "versionId", "selectedTemplateIds", "selectedCapabilityIds",
  "selectedDirectionOptionIds", "selectedFallbackOptionIds", "ownerText", "mechanics", "explanation", "durationMs",
].sort();
const SIMPLIFIED_CHINESE = /[这为后发里边还让从与将个么过时会开关应线术体点进选当门无万]/;

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  return stableStringify(actual) === stableStringify(expected);
}

function subset(values: readonly string[], allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return values.every((value) => set.has(value));
}

function validateOutputShape(value: LocalAiEvalOutput): string[] {
  const reasons: string[] = [];
  if (!value || typeof value !== "object" || stableStringify(Object.keys(value).sort()) !== stableStringify(OUTPUT_KEYS)) return ["OUTPUT_SCHEMA_FIELDS"];
  if (value.schema !== LOCAL_AI_EVAL_OUTPUT_SCHEMA) reasons.push("OUTPUT_SCHEMA_TAG");
  if (!["accept", "degrade", "refuse"].includes(value.decision)) reasons.push("OUTPUT_DECISION");
  for (const key of ["selectedTemplateIds", "selectedCapabilityIds", "selectedDirectionOptionIds", "selectedFallbackOptionIds", "mechanics"] as const) {
    if (!Array.isArray(value[key]) || value[key].some((entry) => typeof entry !== "string")) reasons.push(`OUTPUT_${key.toUpperCase()}`);
  }
  if ((value.canonicalId !== null && typeof value.canonicalId !== "string") || (value.versionId !== null && typeof value.versionId !== "string")) reasons.push("OUTPUT_ID_TYPE");
  if (value.ownerText !== null && typeof value.ownerText !== "string") reasons.push("OUTPUT_OWNER_TYPE");
  if (typeof value.explanation !== "string" || value.explanation.length < 1 || value.explanation.length > 4000) reasons.push("OUTPUT_EXPLANATION");
  if (!Number.isFinite(value.durationMs) || value.durationMs < 0 || value.durationMs > 600_000) reasons.push("OUTPUT_DURATION");
  return reasons;
}

export function gradeLocalAiEvalCase(testCase: LocalAiEvalCase, output: LocalAiEvalOutput): readonly string[] {
  const reasons = validateOutputShape(output);
  if (reasons.length > 0) return reasons;
  if (output.caseId !== testCase.id) reasons.push("CASE_ID_MISMATCH");
  if (output.decision !== testCase.expected.decision) reasons.push("DECISION_MISMATCH");
  if (testCase.expected.canonicalId !== undefined && output.canonicalId !== testCase.expected.canonicalId) reasons.push("IDENTITY_MISMATCH");
  if (testCase.expected.versionId !== undefined && output.versionId !== testCase.expected.versionId) reasons.push("SOURCE_VERSION_MISMATCH");
  const pairs = [
    ["TEMPLATE", output.selectedTemplateIds, testCase.context.legalTemplateIds, testCase.expected.selectedTemplateIds],
    ["CAPABILITY", output.selectedCapabilityIds, testCase.context.legalCapabilityIds, testCase.expected.selectedCapabilityIds],
    ["DIRECTION", output.selectedDirectionOptionIds, testCase.context.legalDirectionOptionIds, testCase.expected.selectedDirectionOptionIds],
    ["FALLBACK", output.selectedFallbackOptionIds, testCase.context.legalFallbackOptionIds, testCase.expected.selectedFallbackOptionIds],
  ] as const;
  for (const [label, actual, legal, expected] of pairs) {
    if (!subset(actual, legal)) reasons.push(`${label}_ALLOWLIST_VIOLATION`);
    if (expected !== undefined && !sameStrings(actual, expected)) reasons.push(`${label}_MISMATCH`);
  }
  if (testCase.expected.ownerText !== undefined && output.ownerText !== testCase.expected.ownerText) reasons.push("OWNER_TEXT_DRIFT");
  if (testCase.expected.mechanics !== undefined && !sameStrings(output.mechanics, testCase.expected.mechanics)) reasons.push("QUOTED_DIALOGUE_BECAME_MECHANIC");
  const rendered = stableStringify(output);
  if (testCase.expected.forbiddenPhrases?.some((phrase) => rendered.includes(phrase))) reasons.push("SOURCE_VERSION_LEAK");
  if (testCase.expected.traditionalChinese && SIMPLIFIED_CHINESE.test(`${output.ownerText ?? ""}${output.explanation}`)) reasons.push("TRADITIONAL_CHINESE_DRIFT");
  return reasons;
}

function p95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
}

export function createLocalAiEvalReceipt(run: LocalAiReleaseRun): LocalAiEvalReceipt {
  if (run.schema !== "ggd-local-ai-release-run@1" || !["quality", "runtime-smoke"].includes(run.suite)) throw new Error("RELEASE_RUN_SCHEMA_INVALID");
  if (!REQUIRED_RUNTIME_TARGETS.includes(run.target)) throw new Error("RELEASE_TARGET_UNKNOWN");
  if (run.model.id !== LOCAL_MODEL_MANIFEST.id || run.model.sha256 !== LOCAL_MODEL_MANIFEST.sha256 || run.model.bytes !== LOCAL_MODEL_MANIFEST.expectedBytes) throw new Error("RELEASE_MODEL_MISMATCH");
  if (!HEX.test(run.runtime.sha256) || !HEX.test(run.promptSha256) || !HEX.test(run.grammarSha256)) throw new Error("RELEASE_COMPONENT_DIGEST_INVALID");
  if (run.promptSha256 !== LOCAL_AI_EVAL_PROMPT_DIGEST || run.grammarSha256 !== LOCAL_AI_EVAL_GRAMMAR_DIGEST) throw new Error("RELEASE_PROMPT_OR_GRAMMAR_MISMATCH");
  if (Number.isNaN(Date.parse(run.createdAt))) throw new Error("RELEASE_TIMESTAMP_INVALID");
  const numericMetrics = [run.metrics.coldStartMs, run.metrics.warmStartMs, run.metrics.peakRssBytes, run.metrics.peakVramBytes ?? 0, run.hardware.systemMemoryBytes, run.hardware.gpuMemoryBytes ?? 0];
  if (numericMetrics.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("RELEASE_METRICS_INVALID");
  const byId = new Map(run.outputs.map((output) => [output.caseId, output]));
  if (byId.size !== run.outputs.length) throw new Error("RELEASE_OUTPUT_DUPLICATE");
  const cases = run.suite === "quality" ? LOCAL_AI_RELEASE_CORPUS : [];
  if (run.outputs.length !== cases.length || cases.some((entry) => !byId.has(entry.id))) throw new Error("RELEASE_OUTPUT_COVERAGE");
  const scored = cases.map((entry) => ({ entry, reasons: gradeLocalAiEvalCase(entry, byId.get(entry.id)!) }));
  const criticalErrors = scored.filter(({ entry, reasons }) => entry.critical && reasons.length > 0).map(({ entry, reasons }) => ({ caseId: entry.id, reasons }));
  const passedCases = scored.filter(({ reasons }) => reasons.length === 0).length;
  const projection = {
    schema: LOCAL_AI_EVAL_RECEIPT_SCHEMA,
    suite: run.suite,
    target: run.target,
    model: run.model,
    runtime: run.runtime,
    promptSha256: run.promptSha256,
    grammarSha256: run.grammarSha256,
    corpusVersion: LOCAL_AI_RELEASE_CORPUS_VERSION,
    corpusDigest: LOCAL_AI_RELEASE_CORPUS_DIGEST,
    caseCount: cases.length,
    passedCases,
    scorePct: cases.length === 0 ? 100 : Number(((passedCases / cases.length) * 100).toFixed(3)),
    criticalErrors,
    p95SectionMs: p95(run.outputs.map((output) => output.durationMs)),
    hardware: run.hardware,
    metrics: run.metrics,
    createdAt: run.createdAt,
  };
  return { ...projection, receiptDigest: sha256Hex(stableStringify(projection)) };
}

export interface LocalAiReleaseAssessment {
  readonly schema: typeof LOCAL_AI_RELEASE_ASSESSMENT_SCHEMA;
  readonly passed: boolean;
  readonly reasonCode: "LOCAL_AI_RELEASE_GATE_PASSED" | "LOCAL_AI_E8_GATE_PENDING";
  readonly reasons: readonly string[];
  readonly verifiedReceiptDigests: readonly string[];
}

function receiptValid(receipt: LocalAiEvalReceipt): boolean {
  if (!receipt || receipt.schema !== LOCAL_AI_EVAL_RECEIPT_SCHEMA || !REQUIRED_RUNTIME_TARGETS.includes(receipt.target)) return false;
  const { receiptDigest: _digest, ...projection } = receipt;
  return HEX.test(receipt.receiptDigest)
    && sha256Hex(stableStringify(projection)) === receipt.receiptDigest
    && receipt.model.id === LOCAL_MODEL_MANIFEST.id
    && receipt.model.sha256 === LOCAL_MODEL_MANIFEST.sha256
    && receipt.model.bytes === LOCAL_MODEL_MANIFEST.expectedBytes
    && receipt.corpusVersion === LOCAL_AI_RELEASE_CORPUS_VERSION
    && receipt.corpusDigest === LOCAL_AI_RELEASE_CORPUS_DIGEST
    && receipt.promptSha256 === LOCAL_AI_EVAL_PROMPT_DIGEST
    && receipt.grammarSha256 === LOCAL_AI_EVAL_GRAMMAR_DIGEST;
}

/** No single machine or aggregate score can unlock local AI by itself. */
export function assessLocalAiRelease(receipts: readonly LocalAiEvalReceipt[]): LocalAiReleaseAssessment {
  const reasons: string[] = [];
  const valid = receipts.filter(receiptValid);
  if (valid.length !== receipts.length) reasons.push("RECEIPT_DIGEST_OR_ARTIFACT_MISMATCH");
  if (new Set(valid.map((receipt) => receipt.promptSha256)).size > 1) reasons.push("PROMPT_DIGEST_DRIFT");
  if (new Set(valid.map((receipt) => receipt.grammarSha256)).size > 1) reasons.push("GRAMMAR_DIGEST_DRIFT");
  const receiptKeys = valid.map((receipt) => `${receipt.target}:${receipt.suite}`);
  if (new Set(receiptKeys).size !== receiptKeys.length) reasons.push("DUPLICATE_TARGET_SUITE_RECEIPT");
  for (const target of REQUIRED_RUNTIME_TARGETS) {
    if (!valid.some((receipt) => receipt.target === target)) reasons.push(`RUNTIME_SMOKE_MISSING:${target}`);
  }
  for (const target of REQUIRED_QUALITY_TARGETS) {
    const receipt = valid.find((candidate) => candidate.target === target && candidate.suite === "quality");
    if (!receipt) { reasons.push(`QUALITY_RECEIPT_MISSING:${target}`); continue; }
    if (receipt.caseCount !== LOCAL_AI_RELEASE_CORPUS.length || receipt.scorePct < LOCAL_AI_RELEASE_LIMITS.minimumScorePct) reasons.push(`QUALITY_THRESHOLD_FAILED:${target}`);
    if (receipt.criticalErrors.length > LOCAL_AI_RELEASE_LIMITS.maximumCriticalErrors) reasons.push(`CRITICAL_ERROR:${target}`);
    if (receipt.p95SectionMs === null || receipt.p95SectionMs > LOCAL_AI_RELEASE_LIMITS.maximumWarmSectionP95Ms) reasons.push(`SECTION_P95_FAILED:${target}`);
    if (receipt.metrics.coldStartMs > LOCAL_AI_RELEASE_LIMITS.maximumColdStartMs || receipt.metrics.warmStartMs > LOCAL_AI_RELEASE_LIMITS.maximumWarmSectionP95Ms) reasons.push(`STARTUP_LATENCY_FAILED:${target}`);
    if (target === "darwin-arm64-metal") {
      if (receipt.hardware.systemMemoryBytes < LOCAL_AI_RELEASE_LIMITS.minimumMacSystemMemoryBytes) reasons.push("MAC_MEMORY_BELOW_24GIB");
      if (receipt.metrics.peakRssBytes > LOCAL_AI_RELEASE_LIMITS.maximumMacPeakRssBytes) reasons.push("MAC_MEMORY_RESERVE_FAILED");
    }
    if (target === "win32-x64-cuda") {
      if (!/4060\s*ti/i.test(receipt.hardware.gpu ?? "") || (receipt.hardware.gpuMemoryBytes ?? 0) < LOCAL_AI_RELEASE_LIMITS.minimumWindowsGpuMemoryBytes) reasons.push("WINDOWS_4060TI_16GB_NOT_PROVEN");
      if (receipt.metrics.peakVramBytes === null || receipt.metrics.peakVramBytes > LOCAL_AI_RELEASE_LIMITS.maximumWindowsPeakVramBytes) reasons.push("WINDOWS_2GIB_VRAM_RESERVE_FAILED");
    }
  }
  for (const receipt of valid) {
    const metrics = receipt.metrics;
    if (!metrics.context4kPassed || !metrics.context8kPassed || !metrics.editor3dConcurrentPassed || !metrics.cancellationPassed
      || !metrics.oomRecoveryPassed || !metrics.offlinePassed || !metrics.cleanInstallPassed) reasons.push(`RUNTIME_RECOVERY_OR_CLEAN_INSTALL_FAILED:${receipt.target}`);
  }
  const uniqueReasons = [...new Set(reasons)].sort();
  return {
    schema: LOCAL_AI_RELEASE_ASSESSMENT_SCHEMA,
    passed: uniqueReasons.length === 0,
    reasonCode: uniqueReasons.length === 0 ? "LOCAL_AI_RELEASE_GATE_PASSED" : "LOCAL_AI_E8_GATE_PENDING",
    reasons: uniqueReasons,
    verifiedReceiptDigests: valid.map((receipt) => receipt.receiptDigest).sort(),
  };
}
