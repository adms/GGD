// GH#1108 —— 「模型答案怎麼剝包裝」只有**一個**住處。⛔ 這裡不寫第二套。
import { normalizeAiJson, type AiStructuredResponse } from "../../../../editor/src/ai/structuredJson";
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

/**
 * ⭐ GH#1108 —— adapter 回的是**結構化回覆**（完成狀態＋final channel），
 * ⛔ 不是一段裸字串。
 *
 * 為什麼型別要改：完成狀態**只有 adapter 看得到**（它是 HTTP 回應裡的
 * `finish_reason`）。回一段字串就等於把它丟掉，而 runner 只剩「假設它寫完了」
 * 一條路 —— ⚠️ 一段在 token 上限被砍斷的 JSON **仍然 parse 得過**，所以那個
 * 假設不會有任何東西變紅。讓它走在型別裡，「沒回報 ⇒ unknown ⇒ 擋下」就是預設。
 */
export type LocalAiReleaseInfer = (input: LocalAiReleaseInferenceInput, signal?: AbortSignal) => Promise<AiStructuredResponse>;
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
      // GH#1108 —— 在此之前這一行是裸的 `JSON.parse(raw)`：模型只要把答案包進一層
      // ```json 圍欄（⭐ 而那是模型很常做的事），整個案例就記成失敗，⚠️ 而失敗原因
      // 會寫成一句 `Unexpected token` —— 看起來像模型答錯，⛔ 其實是我們沒剝包裝。
      // ⛔ 這不是把驗證放寬：完成狀態、多區塊、未閉合圍欄、前後多餘解說、壞 JSON
      //    全部照擋，下面的 root type／schema／評分也一道都沒少。
      const unwrapped = normalizeAiJson(raw);
      if (!unwrapped.ok) throw new Error(`MODEL_OUTPUT_${unwrapped.reason}: ${unwrapped.detail}`);
      const decoded = unwrapped.value;
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) || "durationMs" in decoded) throw new Error("MODEL_OUTPUT_SCHEMA_INVALID");
      outputs.push({ ...(decoded as Omit<LocalAiEvalOutput, "durationMs">), durationMs: performance.now() - started });
    } catch (error) {
      outputs.push(failedOutput(testCase, performance.now() - started, error));
    }
    await options.onCheckpoint?.([...outputs]);
  }
  return assembleLocalAiReleaseRun(metadata, outputs);
}
