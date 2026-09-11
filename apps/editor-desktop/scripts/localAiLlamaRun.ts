import { existsSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { canonicalizeJcs, stableStringify } from "@ggd/shared/content";
import { attestLlamaCppReleaseEndpoint, createLlamaCppReleaseInfer } from "../src/ai/local/llamaCppReleaseClient";
import { sha256File } from "../src/ai/local/modelDownload";
import { LOCAL_MODEL_MANIFEST } from "../src/ai/local/modelManifest";
import { REQUIRED_RUNTIME_TARGETS, type LocalAiReleaseRun } from "../src/ai/local/releaseGate";
import { assembleLocalAiReleaseRun, runLocalAiReleaseCorpus, type LocalAiReleaseRunMetadata } from "../src/ai/local/releaseRunner";

interface MeasuredEvidence {
  readonly target: LocalAiReleaseRun["target"];
  readonly runtimeVersion: string;
  readonly runtimeBuildInfo: string;
  readonly hardware: LocalAiReleaseRun["hardware"];
  readonly metrics: LocalAiReleaseRun["metrics"];
  readonly createdAt?: string;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function readEvidence(path: string): MeasuredEvidence {
  const value = JSON.parse(readFileSync(path, "utf8")) as MeasuredEvidence;
  if (!value || !REQUIRED_RUNTIME_TARGETS.includes(value.target) || typeof value.runtimeVersion !== "string"
    || !value.runtimeVersion || typeof value.runtimeBuildInfo !== "string" || !value.runtimeBuildInfo
    || !value.hardware || !value.metrics) fail("LOCAL_AI_RELEASE_EVIDENCE_INVALID");
  return value;
}

function writeAtomic(path: string, value: unknown): void {
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${canonicalizeJcs(value)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

function compatibleCheckpoint(value: LocalAiReleaseRun, metadata: LocalAiReleaseRunMetadata): boolean {
  const { outputs: _outputs, ...actual } = value;
  const { outputs: _expectedOutputs, ...expected } = assembleLocalAiReleaseRun(metadata, []);
  return stableStringify(actual) === stableStringify(expected);
}

async function main(): Promise<void> {
  const [modelPath, runtimePath, evidencePath, outputPath, endpoint = "http://127.0.0.1:8080"] = process.argv.slice(2).filter((argument) => argument !== "--");
  if (!modelPath || !runtimePath || !evidencePath || !outputPath) {
    fail("Usage: pnpm ai:release:run:llama -- <model.gguf> <llama-server> <measured-evidence.json> <release-run.json> [loopback-endpoint]");
  }

  const modelBytes = statSync(modelPath).size;
  const [modelSha256, runtimeSha256] = await Promise.all([sha256File(modelPath), sha256File(runtimePath)]);
  if (modelBytes !== LOCAL_MODEL_MANIFEST.expectedBytes || modelSha256 !== LOCAL_MODEL_MANIFEST.sha256) {
    fail("LOCAL_AI_RELEASE_MODEL_ARTIFACT_MISMATCH");
  }
  const evidence = readEvidence(evidencePath);
  await attestLlamaCppReleaseEndpoint(endpoint, {
    modelPath: realpathSync(modelPath),
    buildInfo: evidence.runtimeBuildInfo,
    minimumContextSize: 8192,
  });
  const metadata: LocalAiReleaseRunMetadata = {
    target: evidence.target,
    model: { id: LOCAL_MODEL_MANIFEST.id, sha256: modelSha256, bytes: modelBytes },
    runtime: { version: evidence.runtimeVersion, sha256: runtimeSha256 },
    hardware: evidence.hardware,
    metrics: evidence.metrics,
    createdAt: evidence.createdAt ?? new Date().toISOString(),
  };
  const partialPath = `${outputPath}.partial`;
  const partial = existsSync(partialPath) ? JSON.parse(readFileSync(partialPath, "utf8")) as LocalAiReleaseRun : null;
  if (partial && !compatibleCheckpoint(partial, metadata)) fail("LOCAL_AI_RELEASE_CHECKPOINT_METADATA_MISMATCH");
  const run = await runLocalAiReleaseCorpus(metadata, createLlamaCppReleaseInfer(endpoint), undefined, {
    initialOutputs: partial?.outputs,
    onCheckpoint: (outputs) => {
      writeAtomic(partialPath, assembleLocalAiReleaseRun(metadata, outputs));
      if (outputs.length === 1 || outputs.length % 10 === 0) process.stderr.write(`E8 checkpoint ${outputs.length}/216\n`);
    },
  });
  writeAtomic(outputPath, run);
  if (existsSync(partialPath)) unlinkSync(partialPath);
  process.stdout.write(`${outputPath}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
