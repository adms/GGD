import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  CHECK_KEYS,
  MODEL_RESULT_SCHEMA,
  parseModelResult,
  type CheckKey,
  type FrameInput,
  type ModelResult,
  type ReviewRequest,
} from "./contracts.js";

const MAX_FRAME_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

export interface PreparedFrame extends FrameInput {
  index: number;
  role: "candidate" | "reference";
  absolutePath: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteLength: number;
  sha256: string;
  dataUrl: string;
}

export interface PreparedReview {
  request: ReviewRequest;
  sourceDigest: string;
  prompt: string;
  frames: PreparedFrame[];
  requiredChecks: CheckKey[];
  minConfidence: number;
}

export type Classification = "ai-prechecked" | "ai-rejected" | "needs-human-review";

export interface ReviewReport {
  schema: "ggd-vfx-visual-review-report@1";
  authority: "advisory-only";
  classification: Classification;
  generatedAt: string;
  sourceDigest: string;
  subject: ReviewRequest["subject"];
  model: {
    requested: string;
    reported: string;
    baseUrl: string;
    reasoningEffort: "low" | "medium" | "xhigh";
    responseChannel: "content" | "reasoning_content";
    durationMs: number;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  };
  policy: { minConfidence: number; requiredChecks: CheckKey[] };
  frames: Array<Omit<PreparedFrame, "dataUrl" | "absolutePath">>;
  rawModelContent: string;
  modelResult: ModelResult;
  contractWarnings: string[];
}

interface ChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export function stripOwnerDialogue(text: string): string {
  return text.replace(/「[^」]*」/gs, " ").replace(/\s+/g, " ").trim();
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sniffMime(bytes: Buffer, path: string): PreparedFrame["mimeType"] {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  throw new Error(`${path} is not a PNG, JPEG, or WebP image`);
}

function loadFrames(
  inputs: FrameInput[], role: PreparedFrame["role"], manifestDir: string,
): PreparedFrame[] {
  return inputs.map((input, index) => {
    const absolutePath = isAbsolute(input.path) ? input.path : resolve(manifestDir, input.path);
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${input.path} must be a regular non-symlink file`);
    if (stat.size > MAX_FRAME_BYTES) throw new Error(`${input.path} exceeds the 10 MiB frame limit`);
    const bytes = readFileSync(absolutePath);
    const mimeType = sniffMime(bytes, input.path);
    return {
      ...input,
      index,
      role,
      absolutePath,
      mimeType,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    };
  });
}

function inferredChecks(request: ReviewRequest): CheckKey[] {
  const required: CheckKey[] = ["effectPresence", "clipping", "readability"];
  if (request.expectation.vfxFamily) required.push("familyMatch");
  if (request.expectation.dominantColors?.length) required.push("colorMatch");
  if (request.expectation.spawnOrigin) required.push("spawnOrigin");
  if (request.expectation.impactPlacement) required.push("impactPlacement");
  if (request.expectation.temporalOrder?.length) required.push("temporalOrder");
  required.push(...(request.policy?.requiredChecks ?? []));
  return [...new Set(required)];
}

function buildPrompt(request: ReviewRequest, requiredChecks: CheckKey[]): string {
  const mechanics = stripOwnerDialogue(request.ownerDescription ?? "");
  return [
    "你是遊戲技能 VFX 的保守視覺審查員。只判斷圖片中可觀察到的證據，不推斷傷害、數值、命中或遊戲規則。",
    "候選圖片編號只使用 Candidate 0..N；reference 只供比較，不得列入 evidenceFrames。",
    "看不清、規格未提供、幀不足或無法從畫面確認時必須填 uncertain，禁止猜測。",
    "effectPresence=pass 代表預期的主效果確實可見；familyMatch=pass 代表可見主效果屬於預期 VFX 類型。",
    "clipping=pass 代表未見穿模/裁切；readability=pass 代表主效果與角色/地面關係清楚。",
    `受測項目：${request.subject.kind}/${request.subject.id}${request.subject.name ? ` ${request.subject.name}` : ""}`,
    `預期視覺：${stable(request.expectation)}`,
    mechanics ? `機制描述（已排除「」內 Owner 對白）：${mechanics}` : "機制描述：未提供",
    request.runtimeEvidence ? `唯讀 runtime 證據：${stable(request.runtimeEvidence)}` : "唯讀 runtime 證據：未提供",
    `必要檢查：${requiredChecks.join(", ")}`,
    `所有檢查鍵都要回傳：${CHECK_KEYS.join(", ")}`,
    "overall 只有在必要檢查全為 pass 時才可為 pass；任一明確違反 mustNot 或必要檢查 fail 時為 fail；其餘為 uncertain。",
  ].join("\n");
}

export function prepareReview(request: ReviewRequest, manifestDir: string): PreparedReview {
  const candidate = loadFrames(request.candidateFrames, "candidate", manifestDir);
  const reference = loadFrames(request.referenceFrames ?? [], "reference", manifestDir);
  const frames = [...candidate, ...reference];
  const total = frames.reduce((sum, frame) => sum + frame.byteLength, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error("all frames together exceed the 64 MiB limit");
  const requiredChecks = inferredChecks(request);
  const minConfidence = request.policy?.minConfidence ?? 0.85;
  const sourceDigest = sha256(stable({ request, frames: frames.map(({ role, index, sha256 }) => ({ role, index, sha256 })) }));
  return { request, sourceDigest, prompt: buildPrompt(request, requiredChecks), frames, requiredChecks, minConfidence };
}

function classify(
  prepared: PreparedReview, result: ModelResult, initialWarnings: string[] = [],
): { classification: Classification; warnings: string[] } {
  const warnings = [...initialWarnings];
  for (const key of CHECK_KEYS) {
    const invalid = result.checks[key].evidenceFrames.filter((index) => index >= prepared.request.candidateFrames.length);
    if (invalid.length) warnings.push(`${key} cites out-of-range candidate frames: ${invalid.join(", ")}`);
  }
  for (const key of prepared.requiredChecks) {
    if (result.checks[key].status === "pass" && result.checks[key].evidenceFrames.length === 0) {
      warnings.push(`${key} passed without a candidate evidence frame`);
    }
  }
  if (result.checks.effectPresence.status === "fail" && result.checks.familyMatch.status === "pass") {
    warnings.push("internally inconsistent: familyMatch passed while effectPresence failed");
  }
  const allRequiredPass = prepared.requiredChecks.every((key) => result.checks[key].status === "pass");
  if (result.overall === "pass" && !allRequiredPass) {
    warnings.push("internally inconsistent: overall passed while a required check did not pass");
  }
  if (warnings.length || result.confidence < prepared.minConfidence) {
    return { classification: "needs-human-review", warnings };
  }
  if (result.overall === "fail" || prepared.requiredChecks.some((key) => result.checks[key].status === "fail")) {
    return { classification: "ai-rejected", warnings };
  }
  if (result.overall === "pass" && allRequiredPass) {
    return { classification: "ai-prechecked", warnings };
  }
  return { classification: "needs-human-review", warnings };
}

export function classifyModelResult(prepared: PreparedReview, result: ModelResult): Classification {
  return classify(prepared, result).classification;
}

function localApiRoot(value: string): string {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(`refusing to send images to non-loopback host ${url.hostname}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("base URL must use http or https");
  return value.replace(/\/+$/, "");
}

export async function runReview(
  prepared: PreparedReview,
  options: {
    baseUrl: string;
    model: string;
    apiToken?: string;
    timeoutMs?: number;
    reasoningEffort?: "low" | "medium" | "xhigh";
  },
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewReport> {
  const baseUrl = localApiRoot(options.baseUrl);
  const content: Array<Record<string, unknown>> = [{ type: "text", text: prepared.prompt }];
  for (const frame of prepared.frames) {
    content.push({ type: "text", text: `${frame.role === "candidate" ? "Candidate" : "Reference"} ${frame.index}: ${frame.phase}, ${frame.atMs}ms` });
    content.push({ type: "image_url", image_url: { url: frame.dataUrl } });
  }
  const startedAt = performance.now();
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.apiToken ? { authorization: `Bearer ${options.apiToken}` } : {}),
    },
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: "user", content }],
      response_format: MODEL_RESULT_SCHEMA,
      temperature: 0,
      seed: 42,
      max_tokens: 4096,
      reasoning_effort: options.reasoningEffort ?? "low",
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
  });
  const bodyText = await response.text();
  const durationMs = Math.round(performance.now() - startedAt);
  if (!response.ok) throw new Error(`LM Studio returned HTTP ${response.status}: ${bodyText.slice(0, 800)}`);
  const body = JSON.parse(bodyText) as ChatResponse;
  const message = body.choices?.[0]?.message;
  const responseChannel = message?.content?.trim() ? "content" : "reasoning_content";
  const raw = responseChannel === "content" ? message?.content : message?.reasoning_content;
  if (!raw) throw new Error(`LM Studio response has no message content: ${bodyText.slice(0, 800)}`);
  let result: ModelResult;
  const responseWarnings: string[] = [];
  try {
    const decoded = JSON.parse(raw) as unknown;
    if (decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)) {
      const object = decoded as Record<string, unknown>;
      if (typeof object.confidence === "number" && object.confidence > 1 && object.confidence <= 100) {
        responseWarnings.push(`model returned confidence ${object.confidence} as a percentage; normalized to 0..1`);
        object.confidence /= 100;
      }
    }
    result = parseModelResult(decoded);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid structured model result (${detail}): ${raw.slice(0, 800)}`, { cause: error });
  }
  const verdict = classify(prepared, result, responseWarnings);
  const usage = body.usage ? {
    ...(body.usage.prompt_tokens === undefined ? {} : { promptTokens: body.usage.prompt_tokens }),
    ...(body.usage.completion_tokens === undefined ? {} : { completionTokens: body.usage.completion_tokens }),
    ...(body.usage.total_tokens === undefined ? {} : { totalTokens: body.usage.total_tokens }),
  } : undefined;
  return {
    schema: "ggd-vfx-visual-review-report@1",
    authority: "advisory-only",
    classification: verdict.classification,
    generatedAt: new Date().toISOString(),
    sourceDigest: prepared.sourceDigest,
    subject: prepared.request.subject,
    model: {
      requested: options.model,
      reported: body.model ?? options.model,
      baseUrl,
      reasoningEffort: options.reasoningEffort ?? "low",
      responseChannel,
      durationMs,
      ...(usage === undefined ? {} : { usage }),
    },
    policy: { minConfidence: prepared.minConfidence, requiredChecks: prepared.requiredChecks },
    frames: prepared.frames.map(({ dataUrl: _dataUrl, absolutePath: _absolutePath, ...frame }) => frame),
    rawModelContent: raw,
    modelResult: result,
    contractWarnings: verdict.warnings,
  };
}

export function reportMarkdown(report: ReviewReport): string {
  const lines = [
    `# VFX visual review: ${report.subject.id}`,
    "",
    `- Classification: **${report.classification}**`,
    `- Authority: **${report.authority}** (not gameplay truth or human acceptance)`,
    `- Model: \`${report.model.reported}\``,
    `- Reasoning effort: ${report.model.reasoningEffort}`,
    `- Response channel: ${report.model.responseChannel}`,
    `- Local inference: ${(report.model.durationMs / 1_000).toFixed(2)}s`,
    `- Source digest: \`${report.sourceDigest}\``,
    `- Confidence: ${report.modelResult.confidence.toFixed(3)} (minimum ${report.policy.minConfidence})`,
    "",
    "## Checks",
    "",
    "| Check | Status | Evidence frames | Reason |",
    "| --- | --- | --- | --- |",
  ];
  for (const key of CHECK_KEYS) {
    const check = report.modelResult.checks[key];
    lines.push(`| ${key} | ${check.status} | ${check.evidenceFrames.join(", ") || "—"} | ${check.reason.replace(/\|/g, "\\|")} |`);
  }
  if (report.contractWarnings.length) lines.push("", "## Contract warnings", "", ...report.contractWarnings.map((w) => `- ${w}`));
  if (report.modelResult.notes.length) lines.push("", "## Model notes", "", ...report.modelResult.notes.map((n) => `- ${n}`));
  return `${lines.join("\n")}\n`;
}
