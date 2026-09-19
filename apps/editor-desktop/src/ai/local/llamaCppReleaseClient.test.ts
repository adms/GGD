import { describe, expect, it } from "vitest";
import { LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA } from "./releaseGate";
import { attestLlamaCppReleaseEndpoint, createLlamaCppReleaseInfer } from "./llamaCppReleaseClient";

const CASE = {
  id: "case-1",
  category: "identity",
  prompt: "prompt",
  context: {
    registryCandidates: [], sourcePacket: null, legalTemplateIds: [], legalCapabilityIds: [], legalCapabilityOptions: [],
    legalDirectionOptions: [], legalFallbackOptions: [], ownerText: null,
  },
} as const;

/** Answers every request with one canned OpenAI-shaped choice. */
const replying = (choice: Record<string, unknown>): typeof fetch =>
  async () => new Response(JSON.stringify({ choices: [choice] }), { status: 200 });

const inferOnce = (fetchImpl: typeof fetch) =>
  createLlamaCppReleaseInfer("http://127.0.0.1:8080", fetchImpl)({
    systemPrompt: "system", testCase: CASE, outputJsonSchema: LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA,
  });

describe("llama.cpp release client", () => {
  it("sends a deterministic strict-schema request without the private rubric", async () => {
    const requests: [URL | RequestInfo, RequestInit | undefined][] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push([input, init]);
      return new Response(JSON.stringify({
        choices: [{ message: { content: "{\"schema\":\"ggd-local-ai-eval-output@1\"}" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await inferOnce(fetchImpl);
    const [url, init] = requests[0]!;
    expect(String(url)).toBe("http://127.0.0.1:8080/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ temperature: 0, seed: 42, response_format: { type: "json_schema", json_schema: { strict: true } } });
    expect(body.messages[1].content).not.toContain("expected");
    expect(body.messages[1].content).not.toContain("critical");
  });

  /**
   * ⭐ GH#1108 承重守衛。⚠️ 它擋的缺陷**壞掉跟正常長得一模一樣**：舊版在 final 空的
   * 時候拿 `reasoning_content` 頂上 ⇒ 模型的**思考過程**被當成受測答案送進評分，
   * 而收據上看起來就是一次普通的作答。
   * 突變紀錄：final 改回 `content.trim() ? content : reasoning_content` ⇒ 第二段紅。
   */
  it("⭐ 承重：finish_reason 逐字翻成完成狀態；⛔ 思考內容永遠不當答案", async () => {
    // ① 完成狀態來自供應商，認不得／沒送 ⇒ unknown（⇒ 下游擋下）。⛔ 不補 "stop"。
    for (const [finish, completion] of [["stop", "complete"], ["length", "truncated"], [undefined, "unknown"]] as const) {
      const got = await inferOnce(replying({ finish_reason: finish, message: { content: "{}" } }));
      expect(got).toMatchObject({ completion, final: "{}" });
    }

    // ② final 是空的 ⇒ final 留空、思考內容只原樣帶著供診斷，⛔ 不遞補。
    const thinking = await inferOnce(replying({
      finish_reason: "stop",
      message: { content: "", reasoning_content: "{\"decision\":\"accept\"}" },
    }));
    expect(thinking.final).toBe("");
    expect(thinking.reasoning).toBe("{\"decision\":\"accept\"}");
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
