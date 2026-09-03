export const CHECK_KEYS = [
  "effectPresence",
  "familyMatch",
  "colorMatch",
  "spawnOrigin",
  "impactPlacement",
  "temporalOrder",
  "clipping",
  "readability",
] as const;

export type CheckKey = (typeof CHECK_KEYS)[number];
export type CheckStatus = "pass" | "fail" | "uncertain";

export interface FrameInput {
  path: string;
  atMs: number;
  phase: string;
}

export interface ReviewRequest {
  schema: "ggd-vfx-visual-review-request@1";
  subject: { kind: "ability" | "item" | "vfx"; id: string; name?: string };
  ownerDescription?: string;
  expectation: {
    summary: string;
    vfxFamily?: string;
    dominantColors?: string[];
    spawnOrigin?: string;
    impactPlacement?: string;
    temporalOrder?: string[];
    mustNot?: string[];
  };
  candidateFrames: FrameInput[];
  referenceFrames?: FrameInput[];
  runtimeEvidence?: Record<string, string | number | boolean>;
  policy?: { minConfidence?: number; requiredChecks?: CheckKey[] };
}

export interface ModelCheck {
  status: CheckStatus;
  reason: string;
  evidenceFrames: number[];
}

export interface ModelResult {
  overall: CheckStatus;
  confidence: number;
  checks: Record<CheckKey, ModelCheck>;
  notes: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, field);
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.trim() === "")) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return value;
}

function parseFrames(value: unknown, field: string, required: boolean): FrameInput[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    throw new Error(`${field} must contain 1..16 frames`);
  }
  const frames = value.map((v, i) => {
    if (!isObject(v)) throw new Error(`${field}[${i}] must be an object`);
    if (typeof v.atMs !== "number" || !Number.isFinite(v.atMs) || v.atMs < 0) {
      throw new Error(`${field}[${i}].atMs must be a non-negative number`);
    }
    return {
      path: requiredString(v.path, `${field}[${i}].path`),
      atMs: v.atMs,
      phase: requiredString(v.phase, `${field}[${i}].phase`),
    };
  });
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i]!.atMs < frames[i - 1]!.atMs) throw new Error(`${field} must be ordered by atMs`);
  }
  return frames;
}

export function parseReviewRequest(value: unknown): ReviewRequest {
  if (!isObject(value)) throw new Error("request must be an object");
  if (value.schema !== "ggd-vfx-visual-review-request@1") throw new Error("unsupported request schema");
  if (!isObject(value.subject) || !["ability", "item", "vfx"].includes(String(value.subject.kind))) {
    throw new Error("subject.kind must be ability, item, or vfx");
  }
  if (!isObject(value.expectation)) throw new Error("expectation must be an object");
  if (value.ownerDescription !== undefined && typeof value.ownerDescription !== "string") {
    throw new Error("ownerDescription must be a string");
  }
  const expectation = value.expectation;
  const subject: ReviewRequest["subject"] = {
    kind: value.subject.kind as ReviewRequest["subject"]["kind"],
    id: requiredString(value.subject.id, "subject.id"),
  };
  const name = optionalString(value.subject.name, "subject.name");
  if (name !== undefined) subject.name = name;

  let runtimeEvidence: ReviewRequest["runtimeEvidence"];
  if (value.runtimeEvidence !== undefined) {
    if (!isObject(value.runtimeEvidence) || Object.values(value.runtimeEvidence).some(
      (v) => !["string", "number", "boolean"].includes(typeof v),
    )) throw new Error("runtimeEvidence values must be strings, numbers, or booleans");
    runtimeEvidence = value.runtimeEvidence as ReviewRequest["runtimeEvidence"];
  }

  let policy: ReviewRequest["policy"];
  if (value.policy !== undefined) {
    if (!isObject(value.policy)) throw new Error("policy must be an object");
    const minConfidence = value.policy.minConfidence;
    if (minConfidence !== undefined && (typeof minConfidence !== "number" || minConfidence < 0.85 || minConfidence > 1)) {
      throw new Error("policy.minConfidence must be between 0.85 and 1");
    }
    const requiredChecks = value.policy.requiredChecks;
    if (requiredChecks !== undefined && (!Array.isArray(requiredChecks) || requiredChecks.some(
      (v) => !CHECK_KEYS.includes(v as CheckKey),
    ))) throw new Error("policy.requiredChecks contains an unsupported check");
    policy = {
      ...(minConfidence === undefined ? {} : { minConfidence }),
      ...(requiredChecks === undefined ? {} : { requiredChecks: requiredChecks as CheckKey[] }),
    };
  }

  const referenceFrames = parseFrames(value.referenceFrames, "referenceFrames", false);
  return {
    schema: value.schema,
    subject,
    ...(typeof value.ownerDescription === "string" ? { ownerDescription: value.ownerDescription } : {}),
    expectation: {
      summary: requiredString(expectation.summary, "expectation.summary"),
      ...(optionalString(expectation.vfxFamily, "expectation.vfxFamily") === undefined ? {} : { vfxFamily: expectation.vfxFamily as string }),
      ...(stringArray(expectation.dominantColors, "expectation.dominantColors") === undefined ? {} : { dominantColors: expectation.dominantColors as string[] }),
      ...(optionalString(expectation.spawnOrigin, "expectation.spawnOrigin") === undefined ? {} : { spawnOrigin: expectation.spawnOrigin as string }),
      ...(optionalString(expectation.impactPlacement, "expectation.impactPlacement") === undefined ? {} : { impactPlacement: expectation.impactPlacement as string }),
      ...(stringArray(expectation.temporalOrder, "expectation.temporalOrder") === undefined ? {} : { temporalOrder: expectation.temporalOrder as string[] }),
      ...(stringArray(expectation.mustNot, "expectation.mustNot") === undefined ? {} : { mustNot: expectation.mustNot as string[] }),
    },
    candidateFrames: parseFrames(value.candidateFrames, "candidateFrames", true)!,
    ...(referenceFrames === undefined ? {} : { referenceFrames }),
    ...(runtimeEvidence === undefined ? {} : { runtimeEvidence }),
    ...(policy === undefined ? {} : { policy }),
  };
}

const checkSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "reason", "evidenceFrames"],
  properties: {
    status: { type: "string", enum: ["pass", "fail", "uncertain"] },
    reason: { type: "string" },
    evidenceFrames: { type: "array", items: { type: "integer", minimum: 0 } },
  },
};

export const MODEL_RESULT_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "ggd_vfx_visual_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["overall", "confidence", "checks", "notes"],
      properties: {
        overall: { type: "string", enum: ["pass", "fail", "uncertain"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        checks: {
          type: "object",
          additionalProperties: false,
          required: CHECK_KEYS,
          properties: Object.fromEntries(CHECK_KEYS.map((key) => [key, checkSchema])),
        },
        notes: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

export function parseModelResult(value: unknown): ModelResult {
  if (!isObject(value) || !["pass", "fail", "uncertain"].includes(String(value.overall))) {
    throw new Error("model result has invalid overall status");
  }
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) {
    throw new Error("model result confidence must be between 0 and 1");
  }
  if (!isObject(value.checks) || !Array.isArray(value.notes) || value.notes.some((v) => typeof v !== "string")) {
    throw new Error("model result checks or notes are invalid");
  }
  const checks = {} as Record<CheckKey, ModelCheck>;
  for (const key of CHECK_KEYS) {
    const check = value.checks[key];
    if (!isObject(check) || !["pass", "fail", "uncertain"].includes(String(check.status)) ||
      typeof check.reason !== "string" || !Array.isArray(check.evidenceFrames) ||
      check.evidenceFrames.some((v) => !Number.isInteger(v) || (v as number) < 0)) {
      throw new Error(`model result check ${key} is invalid`);
    }
    checks[key] = check as unknown as ModelCheck;
  }
  return { overall: value.overall as CheckStatus, confidence: value.confidence, checks, notes: value.notes as string[] };
}
