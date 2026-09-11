import { describe, expect, it } from "vitest";
import { LocalAiWorker } from "./localWorker";

describe("local AI worker release gate", () => {
  it("cannot run a downloaded model before the E8 gate", () => {
    const store = { manifest: { releaseGate: "pending-e8" } } as never;
    expect(new LocalAiWorker("/not-exposed-to-renderer", store, null).diagnosis()).toEqual({
      ready: false,
      reasonCode: "LOCAL_AI_E8_GATE_PENDING",
    });
  });
});
