import { describe, expect, it } from "vitest";
import { LOCAL_MODEL_MANIFEST } from "./modelManifest";
import { LOCAL_AI_RELEASE_CORPUS } from "./releaseCorpus";
import { runLocalAiReleaseCorpus, type LocalAiReleaseRunMetadata } from "./releaseRunner";
import { createLocalAiEvalReceipt, LOCAL_AI_EVAL_OUTPUT_SCHEMA } from "./releaseGate";

describe("local AI release corpus runner", () => {
  const metadata: LocalAiReleaseRunMetadata = {
    target: "darwin-arm64-metal",
    model: { id: LOCAL_MODEL_MANIFEST.id, sha256: LOCAL_MODEL_MANIFEST.sha256, bytes: LOCAL_MODEL_MANIFEST.expectedBytes },
    runtime: { version: "test", sha256: "a".repeat(64) },
    hardware: { os: "macOS", cpu: "test", systemMemoryBytes: 32 * 1024 ** 3, gpu: "Apple", gpuMemoryBytes: null, driver: null },
    metrics: { coldStartMs: 1, warmStartMs: 1, peakRssBytes: 13 * 1024 ** 3, peakVramBytes: null, context4kPassed: true, context8kPassed: true, editor3dConcurrentPassed: true, cancellationPassed: true, oomRecoveryPassed: true, offlinePassed: true, cleanInstallPassed: true },
    createdAt: "2026-09-04T00:00:00.000Z",
  };

  it("runs all 216 cases, measures latency outside model JSON, and produces a scoreable receipt", async () => {
    const privateRubric = new Map(LOCAL_AI_RELEASE_CORPUS.map((entry) => [entry.id, entry.expected]));
    const run = await runLocalAiReleaseCorpus(metadata, async ({ testCase }) => {
      expect(testCase).not.toHaveProperty("expected");
      expect(testCase).not.toHaveProperty("critical");
      const expected = privateRubric.get(testCase.id)!;
      return JSON.stringify({
        schema: LOCAL_AI_EVAL_OUTPUT_SCHEMA,
        caseId: testCase.id,
        decision: expected.decision,
        canonicalId: expected.canonicalId ?? null,
        versionId: expected.versionId ?? null,
        selectedTemplateIds: expected.selectedTemplateIds ?? [],
        selectedCapabilityIds: expected.selectedCapabilityIds ?? [],
        selectedDirectionOptionIds: expected.selectedDirectionOptionIds ?? [],
        selectedFallbackOptionIds: expected.selectedFallbackOptionIds ?? [],
        ownerText: expected.ownerText ?? null,
        mechanics: expected.mechanics ?? [],
        explanation: "依固定規則。",
      });
    });
    expect(run.outputs).toHaveLength(216);
    expect(run.outputs.every((output) => output.durationMs >= 0)).toBe(true);
    expect(createLocalAiEvalReceipt(run)).toMatchObject({ passedCases: 216, criticalErrors: [] });
  });

  it("resumes only an ordered checkpoint prefix and checkpoints every new case", async () => {
    const first = {
      schema: LOCAL_AI_EVAL_OUTPUT_SCHEMA,
      caseId: LOCAL_AI_RELEASE_CORPUS[0]!.id,
      decision: "refuse" as const,
      canonicalId: null, versionId: null, selectedTemplateIds: [], selectedCapabilityIds: [],
      selectedDirectionOptionIds: [], selectedFallbackOptionIds: [], ownerText: null, mechanics: [],
      explanation: "checkpoint", durationMs: 1,
    };
    let calls = 0;
    const checkpoints: number[] = [];
    const run = await runLocalAiReleaseCorpus(metadata, async ({ testCase }) => {
      calls += 1;
      return JSON.stringify({ ...first, caseId: testCase.id, durationMs: undefined });
    }, undefined, { initialOutputs: [first], onCheckpoint: (outputs) => { checkpoints.push(outputs.length); } });
    expect(calls).toBe(215);
    expect(checkpoints).toEqual(Array.from({ length: 215 }, (_, index) => index + 2));
    expect(run.outputs).toHaveLength(216);
    await expect(runLocalAiReleaseCorpus(metadata, async () => "{}", undefined, {
      initialOutputs: [{ ...first, caseId: LOCAL_AI_RELEASE_CORPUS[1]!.id }],
    })).rejects.toThrow("LOCAL_AI_RELEASE_CHECKPOINT_NOT_PREFIX");
  });
});
