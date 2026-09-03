import { describe, expect, it } from "vitest";
import { LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA } from "./releaseGate";
import { attestLlamaCppReleaseEndpoint, createLlamaCppReleaseInfer } from "./llamaCppReleaseClient";

describe("llama.cpp release client", () => {
  it("sends a deterministic strict-schema request without the private rubric", async () => {
    const requests: [URL | RequestInfo, RequestInit | undefined][] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push([input, init]);
      return new Response(JSON.stringify({
        choices: [{ message: { content: "{\"schema\":\"ggd-local-ai-eval-output@1\"}" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const infer = createLlamaCppReleaseInfer("http://127.0.0.1:8080", fetchImpl);
    await infer({
      systemPrompt: "system",
      testCase: {
        id: "case-1",
        category: "identity",
        prompt: "prompt",
        context: {
          registryCandidates: [], sourcePacket: null, legalTemplateIds: [], legalCapabilityIds: [],
          legalDirectionOptionIds: [], legalFallbackOptionIds: [], ownerText: null,
        },
      },
      outputJsonSchema: LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA,
    });
    const [url, init] = requests[0]!;
    expect(String(url)).toBe("http://127.0.0.1:8080/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ temperature: 0, seed: 42, response_format: { type: "json_schema", json_schema: { strict: true } } });
    expect(body.messages[1].content).not.toContain("expected");
    expect(body.messages[1].content).not.toContain("critical");
  });

  it("rejects remote, TLS, credential, path and query endpoints", () => {
    for (const endpoint of [
      "https://127.0.0.1:8080", "http://example.com:8080", "http://user:pass@localhost:8080",
      "http://localhost:8080/base?key=secret",
    ]) expect(() => createLlamaCppReleaseInfer(endpoint)).toThrow();
  });

  it("attests model path, runtime build and locked-down server props", async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
      model_path: "/models/qwen.gguf",
      build_info: "b1-0f3a71b",
      model_ftype: "Q4_K - Medium",
      default_generation_settings: { n_ctx: 16_384, params: { reasoning_format: "none", reasoning_in_content: false } },
      ui: false,
      endpoint_props: false,
      endpoint_slots: false,
      cors_proxy_enabled: false,
    }), { status: 200 });
    await expect(attestLlamaCppReleaseEndpoint("http://localhost:8080", {
      modelPath: "/models/qwen.gguf", buildInfo: "b1-0f3a71b", minimumContextSize: 8192,
    }, fetchImpl)).resolves.toMatchObject({ contextSize: 16_384, modelFtype: "Q4_K - Medium" });
    await expect(attestLlamaCppReleaseEndpoint("http://localhost:8080", {
      modelPath: "/models/other.gguf", buildInfo: "b1-0f3a71b", minimumContextSize: 8192,
    }, fetchImpl)).rejects.toThrow("LOCAL_AI_RELEASE_SERVER_ATTESTATION_FAILED");
  });
});
