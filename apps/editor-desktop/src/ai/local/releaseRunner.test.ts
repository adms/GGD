import { describe, expect, it } from "vitest";
import { LOCAL_MODEL_MANIFEST } from "./modelManifest";
import { runLocalAiReleaseCorpus } from "./releaseRunner";
import { createLocalAiEvalReceipt, LOCAL_AI_EVAL_OUTPUT_SCHEMA } from "./releaseGate";

describe("local AI release corpus runner", () => {
  it("runs all 216 cases, measures latency outside model JSON, and produces a scoreable receipt", async () => {
    const run = await runLocalAiReleaseCorpus({
      target: "darwin-arm64-metal",
      model: { id: LOCAL_MODEL_MANIFEST.id, sha256: LOCAL_MODEL_MANIFEST.sha256, bytes: LOCAL_MODEL_MANIFEST.expectedBytes },
      runtime: { version: "test", sha256: "a".repeat(64) },
      hardware: { os: "macOS", cpu: "test", systemMemoryBytes: 32 * 1024 ** 3, gpu: "Apple", gpuMemoryBytes: null, driver: null },
      metrics: { coldStartMs: 1, warmStartMs: 1, peakRssBytes: 13 * 1024 ** 3, peakVramBytes: null, context4kPassed: true, context8kPassed: true, editor3dConcurrentPassed: true, cancellationPassed: true, oomRecoveryPassed: true, offlinePassed: true, cleanInstallPassed: true },
      createdAt: "2026-09-04T00:00:00.000Z",
    }, async ({ testCase }) => JSON.stringify({
      schema: LOCAL_AI_EVAL_OUTPUT_SCHEMA,
      caseId: testCase.id,
      decision: testCase.expected.decision,
      canonicalId: testCase.expected.canonicalId ?? null,
      versionId: testCase.expected.versionId ?? null,
      selectedTemplateIds: testCase.expected.selectedTemplateIds ?? [],
      selectedCapabilityIds: testCase.expected.selectedCapabilityIds ?? [],
      selectedDirectionOptionIds: testCase.expected.selectedDirectionOptionIds ?? [],
      selectedFallbackOptionIds: testCase.expected.selectedFallbackOptionIds ?? [],
      ownerText: testCase.expected.ownerText ?? null,
      mechanics: testCase.expected.mechanics ?? [],
      explanation: "依固定規則。",
    }));
    expect(run.outputs).toHaveLength(216);
    expect(run.outputs.every((output) => output.durationMs >= 0)).toBe(true);
    expect(createLocalAiEvalReceipt(run)).toMatchObject({ passedCases: 216, criticalErrors: [] });
  });
});
