import { stableStringify } from "@ggd/shared/content";
// GH#1108 —— 完成狀態的字彙表只有**一個**住處（`COMPLETION_BY_FINISH`）。
// ⛔ 這裡不可以自己寫第二套「哪些字算寫完了」，那種表會各自漂。
import { aiCompletionFromFinishReason, type AiStructuredResponse } from "../../../../editor/src/ai/structuredJson";
import type { LocalAiReleaseInfer } from "./releaseRunner";

type FetchLike = typeof fetch;

function localEndpointUrl(baseUrl: string, pathname: string): URL {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "::1", "localhost"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("LOCAL_AI_RELEASE_ENDPOINT_NOT_LOOPBACK");
  }
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export interface LlamaCppReleaseAttestation {
  readonly modelPath: string;
  readonly buildInfo: string;
  readonly modelFtype: string;
  readonly contextSize: number;
}

/** Refuses a loopback server that is not the measured, locked-down process. */
export async function attestLlamaCppReleaseEndpoint(
  baseUrl: string,
  expected: { readonly modelPath: string; readonly buildInfo: string; readonly minimumContextSize: number },
  fetchImpl: FetchLike = fetch,
): Promise<LlamaCppReleaseAttestation> {
  const response = await fetchImpl(localEndpointUrl(baseUrl, "/props"));
  if (!response.ok) throw new Error(`LOCAL_AI_RELEASE_PROPS_HTTP_${response.status}`);
  const props = await response.json() as Record<string, unknown>;
  const defaults = props.default_generation_settings as { params?: Record<string, unknown>; n_ctx?: unknown } | undefined;
  const params = defaults?.params;
  const valid = props.model_path === expected.modelPath
    && props.build_info === expected.buildInfo
    && props.model_ftype === "Q4_K - Medium"
    && typeof defaults?.n_ctx === "number" && defaults.n_ctx >= expected.minimumContextSize
    && props.ui === false && props.endpoint_props === false && props.endpoint_slots === false && props.cors_proxy_enabled === false
    && params?.reasoning_format === "none" && params.reasoning_in_content === false;
  if (!valid) throw new Error("LOCAL_AI_RELEASE_SERVER_ATTESTATION_FAILED");
  return {
    modelPath: props.model_path,
    buildInfo: props.build_info,
    modelFtype: props.model_ftype,
    contextSize: defaults.n_ctx,
  } as LlamaCppReleaseAttestation;
}

/**
 * OpenAI-compatible adapter used only by the offline E8 evaluation harness.
 * The caller receives a model-visible case that has already had the private
 * expected result and criticality rubric removed by releaseRunner.
 *
 * GH#1108 —— 這一層的**全部**責任就是共用正規化層要求的那兩件事：
 * ① 把供應商的 `finish_reason` 翻成完成狀態（用共用字彙表，認不得 ⇒ `unknown`）
 * ② 指出哪一段是 **final answer channel**
 * 剝包裝／驗 JSON 交給 `normalizeAiJson`，⛔ 這裡不自己寫第二套寬鬆 parser。
 *
 * ⛔⛔ `reasoning_content` **永遠不會**被當成答案（本票明文禁止），即使 final 是
 * 空的 —— 思考內容只原樣帶著供診斷。在此之前這裡寫的是
 * `content.trim() ? content : reasoning_content`：一次空 final 就會讓**模型的
 * 思考過程**被當成受測答案送進評分，而 ⚠️ 它看起來完全像一次正常的作答。
 */
export function createLlamaCppReleaseInfer(baseUrl: string, fetchImpl: FetchLike = fetch): LocalAiReleaseInfer {
  const url = localEndpointUrl(baseUrl, "/v1/chat/completions");
  return async ({ systemPrompt, testCase, outputJsonSchema }, signal) => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "local",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: stableStringify(testCase) },
        ],
        temperature: 0,
        seed: 42,
        max_tokens: 512,
        response_format: {
          type: "json_schema",
          json_schema: { name: "ggd_local_ai_eval", strict: true, schema: outputJsonSchema },
        },
      }),
      signal,
    });
    if (!response.ok) throw new Error(`LOCAL_AI_RELEASE_HTTP_${response.status}`);
    const payload = await response.json() as {
      choices?: readonly {
        finish_reason?: unknown;
        message?: { content?: unknown; reasoning_content?: unknown };
      }[];
    };
    const choice = payload.choices?.[0];
    const message = choice?.message;
    return {
      // 沒有 choices／沒有 finish_reason ⇒ `unknown` ⇒ 下游擋下。⛔ 不補 "stop"。
      completion: aiCompletionFromFinishReason(choice?.finish_reason),
      final: typeof message?.content === "string" ? message.content : null,
      reasoning: typeof message?.reasoning_content === "string" ? message.reasoning_content : null,
    } satisfies AiStructuredResponse;
  };
}
