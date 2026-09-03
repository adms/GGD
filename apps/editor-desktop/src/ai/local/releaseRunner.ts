import {
  LOCAL_AI_RELEASE_CORPUS,
  LOCAL_AI_EVAL_SYSTEM_PROMPT,
  type LocalAiEvalCase,
} from "./releaseCorpus";
import {
  LOCAL_AI_EVAL_GRAMMAR_DIGEST,
  LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA,
  LOCAL_AI_EVAL_OUTPUT_SCHEMA,
  LOCAL_AI_EVAL_PROMPT_DIGEST,
  type LocalAiEvalOutput,
  type LocalAiReleaseRun,
} from "./releaseGate";

export interface LocalAiReleaseInferenceInput {
  readonly systemPrompt: string;
  readonly testCase: LocalAiEvalCase;
  readonly outputJsonSchema: typeof LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA;
}

export type LocalAiReleaseInfer = (input: LocalAiReleaseInferenceInput, signal?: AbortSignal) => Promise<string>;
export type LocalAiReleaseRunMetadata = Omit<LocalAiReleaseRun, "schema" | "suite" | "promptSha256" | "grammarSha256" | "outputs">;

function failedOutput(testCase: LocalAiEvalCase, durationMs: number, error: unknown): LocalAiEvalOutput {
  return {
    schema: "invalid-eval-output" as typeof LOCAL_AI_EVAL_OUTPUT_SCHEMA,
    caseId: testCase.id,
    decision: "refuse",
    canonicalId: null,
    versionId: null,
    selectedTemplateIds: [],
    selectedCapabilityIds: [],
    selectedDirectionOptionIds: [],
    selectedFallbackOptionIds: [],
    ownerText: null,
    mechanics: [],
    explanation: error instanceof Error ? error.message.slice(0, 4000) || error.name : String(error).slice(0, 4000) || "EMPTY_MODEL_OUTPUT",
    durationMs,
  };
}

/** Runs the frozen corpus sequentially so per-case latency remains auditable. */
export async function runLocalAiReleaseCorpus(metadata: LocalAiReleaseRunMetadata, infer: LocalAiReleaseInfer, signal?: AbortSignal): Promise<LocalAiReleaseRun> {
  const outputs: LocalAiEvalOutput[] = [];
  for (const testCase of LOCAL_AI_RELEASE_CORPUS) {
    if (signal?.aborted) throw signal.reason ?? new Error("LOCAL_AI_RELEASE_RUN_CANCELLED");
    const started = performance.now();
    try {
      const raw = await infer({ systemPrompt: LOCAL_AI_EVAL_SYSTEM_PROMPT, testCase, outputJsonSchema: LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA }, signal);
      const decoded = JSON.parse(raw) as unknown;
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) || "durationMs" in decoded) throw new Error("MODEL_OUTPUT_SCHEMA_INVALID");
      outputs.push({ ...(decoded as Omit<LocalAiEvalOutput, "durationMs">), durationMs: performance.now() - started });
    } catch (error) {
      outputs.push(failedOutput(testCase, performance.now() - started, error));
    }
  }
  return {
    schema: "ggd-local-ai-release-run@1",
    suite: "quality",
    ...metadata,
    promptSha256: LOCAL_AI_EVAL_PROMPT_DIGEST,
    grammarSha256: LOCAL_AI_EVAL_GRAMMAR_DIGEST,
    outputs,
  };
}
