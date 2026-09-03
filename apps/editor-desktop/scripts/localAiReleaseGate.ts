import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { canonicalizeJcs } from "@ggd/shared/content";
import {
  LOCAL_AI_RELEASE_CORPUS,
  LOCAL_AI_RELEASE_CORPUS_DIGEST,
  LOCAL_AI_RELEASE_CORPUS_SCHEMA,
  LOCAL_AI_RELEASE_CORPUS_VERSION,
  LOCAL_AI_EVAL_INPUT_CONTRACT,
  LOCAL_AI_EVAL_INPUT_CONTRACT_DIGEST,
  LOCAL_AI_EVAL_SYSTEM_PROMPT,
} from "../src/ai/local/releaseCorpus";
import {
  LOCAL_AI_EVAL_GRAMMAR_DIGEST,
  LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA,
  LOCAL_AI_EVAL_PROMPT_DIGEST,
  assessLocalAiRelease,
  createLocalAiEvalReceipt,
  type LocalAiEvalReceipt,
  type LocalAiReleaseRun,
} from "../src/ai/local/releaseGate";

function jsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function print(value: unknown): void {
  process.stdout.write(`${canonicalizeJcs(value)}\n`);
}

function emit(value: unknown, outputPath?: string): void {
  if (!outputPath) { print(value); return; }
  const temp = `${outputPath}.tmp`;
  writeFileSync(temp, `${canonicalizeJcs(value)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, outputPath);
  process.stdout.write(`${outputPath}\n`);
}

const [command, ...files] = process.argv.slice(2).filter((argument) => argument !== "--");
const corpusBundle = {
    schema: LOCAL_AI_RELEASE_CORPUS_SCHEMA,
    version: LOCAL_AI_RELEASE_CORPUS_VERSION,
    digest: LOCAL_AI_RELEASE_CORPUS_DIGEST,
    systemPrompt: LOCAL_AI_EVAL_SYSTEM_PROMPT,
    promptDigest: LOCAL_AI_EVAL_PROMPT_DIGEST,
    inputContract: LOCAL_AI_EVAL_INPUT_CONTRACT,
    inputContractDigest: LOCAL_AI_EVAL_INPUT_CONTRACT_DIGEST,
    outputJsonSchema: LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA,
    grammarDigest: LOCAL_AI_EVAL_GRAMMAR_DIGEST,
    cases: LOCAL_AI_RELEASE_CORPUS,
};
if (command === "corpus" && files.length === 0) {
  print(corpusBundle);
} else if (command === "metadata" && files.length === 0) {
  const { cases, ...metadata } = corpusBundle;
  print({ ...metadata, caseCount: cases.length });
} else if (command === "score" && (files.length === 1 || files.length === 2)) {
  emit(createLocalAiEvalReceipt(jsonFile<LocalAiReleaseRun>(files[0]!)), files[1]);
} else if (command === "verify" && files.length > 0) {
  const outputOption = files.findIndex((file) => file === "--output");
  const receiptFiles = outputOption < 0 ? files : files.slice(0, outputOption);
  const outputPath = outputOption < 0 ? undefined : files[outputOption + 1];
  if (receiptFiles.length === 0 || (outputOption >= 0 && (!outputPath || outputOption !== files.length - 2))) {
    process.stderr.write("verify --output 必須放在所有 receipt 後面。\n");
    process.exitCode = 2;
  } else {
    const assessment = assessLocalAiRelease(receiptFiles.map((file) => jsonFile<LocalAiEvalReceipt>(file)));
    emit(assessment, outputPath);
    if (!assessment.passed) process.exitCode = 1;
  }
} else {
  process.stderr.write([
    "Usage:",
    "  pnpm ai:release:corpus",
    "  pnpm ai:release:metadata",
    "  pnpm ai:release:score -- <release-run.json> [receipt-output.json]",
    "  pnpm ai:release:verify -- <receipt.json> [receipt.json ...] [--output assessment.json]",
  ].join("\n") + "\n");
  process.exitCode = 2;
}
