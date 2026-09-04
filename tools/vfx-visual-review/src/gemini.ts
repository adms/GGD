import { performance } from "node:perf_hooks";

import { MODEL_RESULT_SCHEMA } from "./contracts.js";
import {
  parseStructuredModelContent,
  type PreparedReview,
  type ReviewReport,
  type UnavailableReviewReport,
} from "./review.js";

export const GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com";
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-pro-preview";
const MAX_INLINE_REQUEST_BYTES = 15 * 1024 * 1024;

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
  responseId?: string;
}

export type GeminiEnablementReason =
  | "explicitly-disabled"
  | "environment-disabled"
  | "explicitly-enabled"
  | "environment-enabled"
  | "api-key-present"
  | "api-key-missing";

export interface GeminiEnablement {
  enabled: boolean;
  reason: GeminiEnablementReason;
}

/**
 * A configured key enables the advisory reviewer automatically. Explicit
 * disable signals always win so the same acceptance command can run without
 * transmitting frames.
 */
export function resolveGeminiEnablement(input: {
  forceEnable?: boolean;
  forceDisable?: boolean;
  environment?: string;
  apiKey?: string;
}): GeminiEnablement {
  if (input.forceDisable) return { enabled: false, reason: "explicitly-disabled" };
  const environment = input.environment?.trim().toLowerCase();
  if (environment && ["0", "false", "no", "off"].includes(environment)) {
    return { enabled: false, reason: "environment-disabled" };
  }
  if (input.forceEnable) return { enabled: true, reason: "explicitly-enabled" };
  if (environment && ["1", "true", "yes", "on"].includes(environment)) {
    return { enabled: true, reason: "environment-enabled" };
  }
  if ((input.apiKey ?? "").trim() !== "") return { enabled: true, reason: "api-key-present" };
  return { enabled: false, reason: "api-key-missing" };
}

export function assertGeminiModel(value: string): string {
  if (!/^gemini-[a-z0-9._-]+$/i.test(value)) {
    throw new Error("Gemini model must be a plain gemini-* identifier");
  }
  return value;
}

export function geminiEndpoint(model: string): string {
  const safeModel = assertGeminiModel(model);
  return `${GEMINI_API_ORIGIN}/v1beta/models/${encodeURIComponent(safeModel)}:generateContent`;
}

function inlineBytes(frame: PreparedReview["frames"][number]): string {
  const comma = frame.dataUrl.indexOf(",");
  if (comma < 0) throw new Error(`prepared frame ${frame.index} has no inline image payload`);
  return frame.dataUrl.slice(comma + 1);
}

function assertGeminiPayload(prepared: PreparedReview): void {
  if (prepared.frames.length < 2 || prepared.frames.length > 18) {
    throw new Error(`Gemini review requires 2..18 total keyframes; received ${prepared.frames.length}`);
  }
  const encodedBytes = prepared.frames.reduce((sum, frame) => sum + Buffer.byteLength(frame.dataUrl, "utf8"), 0);
  const promptBytes = Buffer.byteLength(prepared.prompt, "utf8");
  if (encodedBytes + promptBytes > MAX_INLINE_REQUEST_BYTES) {
    throw new Error("Gemini inline review payload exceeds the local 15 MiB safety budget");
  }
}

export async function runGeminiReview(
  prepared: PreparedReview,
  options: {
    apiKey: string;
    model?: string;
    timeoutMs?: number;
    reasoningEffort?: "low" | "medium" | "xhigh";
  },
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewReport> {
  assertGeminiPayload(prepared);
  if (options.apiKey.trim() === "") throw new Error("GEMINI_API_KEY is missing");
  const model = assertGeminiModel(options.model ?? DEFAULT_GEMINI_MODEL);
  const endpoint = geminiEndpoint(model);
  const parts: Array<Record<string, unknown>> = [{ text: prepared.prompt }];
  for (const frame of prepared.frames) {
    parts.push({
      // Keep the visual judge blind to runtime-generated phase labels such as
      // "anim" or "第 7 段". Those labels previously let a model echo expected
      // events without proving that the pixels contained them.
      text: `${frame.role === "candidate" ? "Candidate" : "Reference"} ${frame.index}, ${frame.atMs}ms`,
    });
    parts.push({
      inline_data: {
        mime_type: frame.mimeType,
        data: inlineBytes(frame),
      },
    });
  }

  const startedAt = performance.now();
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": options.apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        // Gemini 3 defaults to medium/high thinking depending on the model.
        // Pin the level so the cheap pass cannot consume the response budget
        // before emitting JSON. Google recommends omitting temperature for 3.x.
        thinkingConfig: {
          thinkingLevel: options.reasoningEffort === "xhigh" ? "high" : options.reasoningEffort ?? "low",
        },
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseJsonSchema: MODEL_RESULT_SCHEMA.json_schema.schema,
      },
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  });
  const bodyText = await response.text();
  const durationMs = Math.round(performance.now() - startedAt);
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}: ${bodyText.slice(0, 800)}`);

  const body = JSON.parse(bodyText) as GeminiResponse;
  if (body.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the review prompt: ${body.promptFeedback.blockReason}`);
  }
  const candidate = body.candidates?.[0];
  const raw = candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!raw) {
    throw new Error(`Gemini response has no candidate text${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}`);
  }
  const verdict = parseStructuredModelContent(prepared, raw);
  const usage = body.usageMetadata ? {
    ...(body.usageMetadata.promptTokenCount === undefined ? {} : { promptTokens: body.usageMetadata.promptTokenCount }),
    ...(body.usageMetadata.candidatesTokenCount === undefined ? {} : { completionTokens: body.usageMetadata.candidatesTokenCount }),
    ...(body.usageMetadata.totalTokenCount === undefined ? {} : { totalTokens: body.usageMetadata.totalTokenCount }),
  } : undefined;

  // The 2026-09-04 negative calibration falsely accepted an Avalon EX sample
  // whose four frames omitted the required finishing beam. Until a labelled
  // calibration set proves otherwise, Gemini may surface rejections/issues but
  // can never grant positive visual acceptance.
  const calibrationWarnings = verdict.classification === "ai-prechecked"
    ? ["Google Gemini positive verdict is not calibrated; forced to human review"]
    : [];
  return {
    schema: "ggd-vfx-visual-review-report@1",
    authority: "advisory-only",
    classification: verdict.classification === "ai-prechecked" ? "needs-human-review" : verdict.classification,
    generatedAt: new Date().toISOString(),
    sourceDigest: prepared.sourceDigest,
    subject: prepared.request.subject,
    model: {
      provider: "google-gemini",
      requested: model,
      reported: body.modelVersion ?? model,
      baseUrl: GEMINI_API_ORIGIN,
      reasoningEffort: options.reasoningEffort ?? "low",
      responseChannel: "gemini-candidate",
      durationMs,
      ...(usage === undefined ? {} : { usage }),
    },
    policy: { minConfidence: prepared.minConfidence, requiredChecks: prepared.requiredChecks },
    frames: prepared.frames.map(({ dataUrl: _dataUrl, absolutePath: _absolutePath, ...frame }) => frame),
    rawModelContent: raw,
    modelResult: verdict.result,
    contractWarnings: [...verdict.warnings, ...calibrationWarnings],
  };
}

function baseUnavailable(
  prepared: PreparedReview,
  model: string,
  code: UnavailableReviewReport["reason"]["code"],
  detail: string,
): UnavailableReviewReport {
  return {
    schema: "ggd-vfx-visual-review-unavailable@1",
    authority: "advisory-only",
    classification: "needs-human-review",
    generatedAt: new Date().toISOString(),
    sourceDigest: prepared.sourceDigest,
    subject: prepared.request.subject,
    model: { provider: "google-gemini", requested: model, baseUrl: GEMINI_API_ORIGIN },
    reason: { code, detail },
  };
}

export function disabledGeminiReport(prepared: PreparedReview, model: string): UnavailableReviewReport {
  return baseUnavailable(
    prepared,
    model,
    "GEMINI_DISABLED",
    "Google Gemini review is disabled by runtime policy; no image was transmitted.",
  );
}

export function unavailableGeminiReport(
  prepared: PreparedReview,
  model: string,
  error: unknown,
): UnavailableReviewReport {
  const detail = error instanceof Error ? error.message : String(error);
  if (/GEMINI_API_KEY is missing/i.test(detail)) {
    return baseUnavailable(prepared, model, "GEMINI_API_KEY_MISSING", detail);
  }
  const unavailable = /ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed|Failed to fetch|AbortError|HTTP (?:404|429|5\d\d)/i.test(detail);
  return baseUnavailable(prepared, model, unavailable ? "GEMINI_UNAVAILABLE" : "GEMINI_ERROR", detail);
}
