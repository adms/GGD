import { describe, expect, it } from "vitest";
import { LOCAL_AI_STATUS_SCHEMA, zLocalAiStatus, zLocalModelControlRequest } from "./localAi";

describe("local AI desktop contract", () => {
  it("accepts the narrow status shape and rejects renderer path or URL fields", () => {
    const status = {
      schema: LOCAL_AI_STATUS_SCHEMA,
      preference: "off",
      preferenceConfigured: false,
      desktopAvailable: true,
      model: {
        id: "qwen3-14b-q4-k-m",
        displayName: "Qwen3-14B Q4_K_M",
        state: "not-installed",
        expectedBytes: 9_001_752_960,
        downloadedBytes: 0,
        digest: "5".repeat(64),
        errorCode: null,
      },
      inference: { enabled: false, backend: "none", reasonCode: "LOCAL_AI_E8_GATE_PENDING" },
      byok: {
        configured: false,
        remembered: false,
        baseUrl: null,
        origin: null,
        protocol: "auto",
        models: [],
        selectedModel: null,
        modelDiscovery: "unknown",
        structuredOutput: "unknown",
        disclosureAccepted: false,
        connection: { state: "idle", message: null },
      },
    };
    expect(zLocalAiStatus.parse(status)).toEqual(status);
    expect(() => zLocalAiStatus.parse({ ...status, modelPath: "/secret/model.gguf" })).toThrow();
    expect(() => zLocalModelControlRequest.parse({ action: "start", url: "https://example.com/model.gguf" })).toThrow();
  });
});
