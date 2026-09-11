import {
  LOCAL_AI_RELEASE_CORPUS,
  LOCAL_AI_EVAL_INPUT_CONTRACT_DIGEST,
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
  /** The model-visible case deliberately excludes the private rubric. */
  readonly testCase: LocalAiEvalModelCase;
  readonly outputJsonSchema: typeof LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA;
}

export type LocalAiEvalModelCase = Pick<LocalAiEvalCase, "id" | "category" | "prompt" | "context">;

export type LocalAiReleaseInfer = (input: LocalAiReleaseInferenceInput, signal?: AbortSignal) => Promise<string>;
export type LocalAiReleaseRunMetadata = Omit<LocalAiReleaseRun, "schema" | "suite" | "promptSha256" | "grammarSha256" | "inputContractSha256" | "outputs">;

export interface LocalAiReleaseRunOptions {
  readonly initialOutputs?: readonly LocalAiEvalOutput[];
  readonly onCheckpoint?: (outputs: readonly LocalAiEvalOutput[]) => void | Promise<void>;
}

export function toModelVisibleEvalCase(testCase: LocalAiEvalCase): LocalAiEvalModelCase {
  return {
    id: testCase.id,
    category: testCase.category,
    prompt: testCase.prompt,
    context: testCase.context,
  };
}

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

export function assembleLocalAiReleaseRun(metadata: LocalAiReleaseRunMetadata, outputs: readonly LocalAiEvalOutput[]): LocalAiReleaseRun {
  return {
    schema: "ggd-local-ai-release-run@1",
    suite: "quality",
    ...metadata,
    promptSha256: LOCAL_AI_EVAL_PROMPT_DIGEST,
    grammarSha256: LOCAL_AI_EVAL_GRAMMAR_DIGEST,
    inputContractSha256: LOCAL_AI_EVAL_INPUT_CONTRACT_DIGEST,
    outputs,
  };
}

/** Runs the frozen corpus sequentially so per-case latency remains auditable. */
export async function runLocalAiReleaseCorpus(
  metadata: LocalAiReleaseRunMetadata,
  infer: LocalAiReleaseInfer,
  signal?: AbortSignal,
  options: LocalAiReleaseRunOptions = {},
): Promise<LocalAiReleaseRun> {
  const outputs: LocalAiEvalOutput[] = [...(options.initialOutputs ?? [])];
  if (outputs.some((output, index) => output.caseId !== LOCAL_AI_RELEASE_CORPUS[index]?.id)) {
    throw new Error("LOCAL_AI_RELEASE_CHECKPOINT_NOT_PREFIX");
  }
  for (const testCase of LOCAL_AI_RELEASE_CORPUS.slice(outputs.length)) {
    if (signal?.aborted) throw signal.reason ?? new Error("LOCAL_AI_RELEASE_RUN_CANCELLED");
    const started = performance.now();
    try {
      const raw = await infer({
        systemPrompt: LOCAL_AI_EVAL_SYSTEM_PROMPT,
        testCase: toModelVisibleEvalCase(testCase),
        outputJsonSchema: LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA,
      }, signal);
      const decoded = JSON.parse(raw) as unknown;
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) || "durationMs" in decoded) throw new Error("MODEL_OUTPUT_SCHEMA_INVALID");
      outputs.push({ ...(decoded as Omit<LocalAiEvalOutput, "durationMs">), durationMs: performance.now() - started });
    } catch (error) {
      outputs.push(failedOutput(testCase, performance.now() - started, error));
    }
    await options.onCheckpoint?.([...outputs]);
  }
  return assembleLocalAiReleaseRun(metadata, outputs);
}
