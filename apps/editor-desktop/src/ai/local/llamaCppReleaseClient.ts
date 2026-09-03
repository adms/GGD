import { stableStringify } from "@ggd/shared/content";
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
      choices?: readonly { message?: { content?: unknown; reasoning_content?: unknown } }[];
    };
    const message = payload.choices?.[0]?.message;
    const content = typeof message?.content === "string" && message.content.trim()
      ? message.content
      : typeof message?.reasoning_content === "string" ? message.reasoning_content : null;
    if (!content) throw new Error("LOCAL_AI_RELEASE_EMPTY_RESPONSE");
    return content;
  };
}
