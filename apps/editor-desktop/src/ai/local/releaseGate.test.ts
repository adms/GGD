import { describe, expect, it } from "vitest";
import { LOCAL_MODEL_MANIFEST } from "./modelManifest";
import { LOCAL_AI_EVAL_INPUT_CONTRACT_DIGEST, LOCAL_AI_RELEASE_CORPUS, LOCAL_AI_RELEASE_CORPUS_DIGEST } from "./releaseCorpus";
import {
  LOCAL_AI_EVAL_OUTPUT_SCHEMA,
  LOCAL_AI_EVAL_GRAMMAR_DIGEST,
  LOCAL_AI_EVAL_PROMPT_DIGEST,
  LOCAL_AI_EVAL_SCORER_DIGEST,
  REQUIRED_RUNTIME_TARGETS,
  assessLocalAiRelease,
  createLocalAiEvalReceipt,
  type LocalAiEvalOutput,
  type LocalAiReleaseRun,
  type LocalAiRuntimeTarget,
} from "./releaseGate";

const GIB = 1024 ** 3;
const digest = "a".repeat(64);

function goldenOutputs(): LocalAiEvalOutput[] {
  return LOCAL_AI_RELEASE_CORPUS.map((entry) => ({
    schema: LOCAL_AI_EVAL_OUTPUT_SCHEMA,
    caseId: entry.id,
    decision: entry.expected.decision,
    canonicalId: entry.expected.canonicalId ?? null,
    versionId: entry.expected.versionId ?? null,
    selectedTemplateIds: entry.expected.selectedTemplateIds ?? [],
    selectedCapabilityIds: entry.expected.selectedCapabilityIds ?? [],
    selectedDirectionOptionIds: entry.expected.selectedDirectionOptionIds ?? [],
    selectedFallbackOptionIds: entry.expected.selectedFallbackOptionIds ?? [],
    ownerText: entry.expected.ownerText ?? null,
    mechanics: entry.expected.mechanics ?? [],
    explanation: "依合法候選與來源鎖判斷。",
    durationMs: 1_000,
  }));
}

function run(target: LocalAiRuntimeTarget, suite: LocalAiReleaseRun["suite"]): LocalAiReleaseRun {
  const windows = target.startsWith("win32");
  return {
    schema: "ggd-local-ai-release-run@1", suite, target,
    model: { id: LOCAL_MODEL_MANIFEST.id, sha256: LOCAL_MODEL_MANIFEST.sha256, bytes: LOCAL_MODEL_MANIFEST.expectedBytes },
    runtime: { version: "llama.cpp-pinned", sha256: digest }, promptSha256: LOCAL_AI_EVAL_PROMPT_DIGEST, grammarSha256: LOCAL_AI_EVAL_GRAMMAR_DIGEST, inputContractSha256: LOCAL_AI_EVAL_INPUT_CONTRACT_DIGEST,
    hardware: { os: windows ? "Windows 11" : "macOS", cpu: "test", systemMemoryBytes: 32 * GIB, gpu: windows ? "NVIDIA RTX 4060 Ti" : "Apple Silicon", gpuMemoryBytes: windows ? 16 * GIB : null, driver: windows ? "pinned" : null },
    metrics: { coldStartMs: 5_000, warmStartMs: 1_000, peakRssBytes: 13 * GIB, peakVramBytes: windows ? 13 * GIB : null, context4kPassed: true, context8kPassed: true, editor3dConcurrentPassed: true, cancellationPassed: true, oomRecoveryPassed: true, offlinePassed: true, cleanInstallPassed: true },
    outputs: suite === "quality" ? goldenOutputs() : [], createdAt: "2026-09-04T00:00:00.000Z",
  };
}

describe("local AI E8 release gate", () => {
  it("contains a stable 200+ GGD corpus across every critical category", () => {
    expect(LOCAL_AI_RELEASE_CORPUS).toHaveLength(216);
    expect(LOCAL_AI_RELEASE_CORPUS_DIGEST).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(LOCAL_AI_RELEASE_CORPUS.map((entry) => entry.id)).size).toBe(216);
    expect(new Set(LOCAL_AI_RELEASE_CORPUS.map((entry) => entry.category)).size).toBe(7);
  });

  it("requires all platform receipts and treats one reversed rescue direction as a release blocker", () => {
    const receipts = REQUIRED_RUNTIME_TARGETS.map((target) => createLocalAiEvalReceipt(run(target, target === "darwin-arm64-metal" || target === "win32-x64-cuda" ? "quality" : "runtime-smoke")));
    expect(assessLocalAiRelease(receipts)).toMatchObject({ passed: true, reasonCode: "LOCAL_AI_RELEASE_GATE_PASSED" });
    const badRun = run("win32-x64-cuda", "quality");
    const outputs = [...badRun.outputs];
    const index = outputs.findIndex((entry) => entry.caseId === "direction-06-1");
    outputs[index] = { ...outputs[index]!, decision: "accept", selectedDirectionOptionIds: ["dir.self-to-ally"] };
    const bad = createLocalAiEvalReceipt({ ...badRun, outputs });
    const assessed = assessLocalAiRelease(receipts.map((entry) => entry.target === "win32-x64-cuda" ? bad : entry));
    expect(assessed.passed).toBe(false);
    expect(assessed.reasons).toContain("CRITICAL_ERROR:win32-x64-cuda");
  });

  it("rejects an unbound input contract and revalidates output collection limits", () => {
    expect(() => createLocalAiEvalReceipt({
      ...run("darwin-arm64-metal", "quality"),
      inputContractSha256: "b".repeat(64),
    })).toThrow("RELEASE_PROMPT_GRAMMAR_OR_INPUT_CONTRACT_MISMATCH");
    const source = run("darwin-arm64-metal", "quality");
    const outputs = [...source.outputs];
    outputs[0] = { ...outputs[0]!, selectedTemplateIds: Array.from({ length: 9 }, (_, index) => `template.${index}`) };
    const receipt = createLocalAiEvalReceipt({ ...source, outputs });
    expect(receipt.criticalErrors[0]).toMatchObject({ caseId: LOCAL_AI_RELEASE_CORPUS[0]!.id });
    expect(receipt.criticalErrors[0]!.reasons).toContain("OUTPUT_SELECTEDTEMPLATEIDS");
  });

  it("binds receipts to the fixed scorer policy", () => {
    const receipt = createLocalAiEvalReceipt(run("darwin-arm64-metal", "quality"));
    expect(receipt.scorerSha256).toBe(LOCAL_AI_EVAL_SCORER_DIGEST);
    const tampered = { ...receipt, scorerSha256: "b".repeat(64) };
    expect(assessLocalAiRelease([tampered])).toMatchObject({
      passed: false,
      reasons: expect.arrayContaining(["RECEIPT_DIGEST_OR_ARTIFACT_MISMATCH"]),
    });
  });

  it("rejects legal but irrelevant values in fields unused by the case", () => {
    const source = run("darwin-arm64-metal", "quality");
    const outputs = [...source.outputs];
    const index = outputs.findIndex((entry) => entry.caseId.startsWith("direction-"));
    outputs[index] = { ...outputs[index]!, canonicalId: "dir.ally-to-self", selectedCapabilityIds: ["effect:applyStatus@1"] };
    const receipt = createLocalAiEvalReceipt({ ...source, outputs });
    expect(receipt.criticalErrors.find((entry) => entry.caseId === outputs[index]!.caseId)?.reasons)
      .toEqual(expect.arrayContaining(["IDENTITY_MISMATCH", "CAPABILITY_MISMATCH"]));
  });
});
