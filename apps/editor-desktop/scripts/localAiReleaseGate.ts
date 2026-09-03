import { readFileSync } from "node:fs";
import { canonicalizeJcs } from "@ggd/shared/content";
import {
  LOCAL_AI_RELEASE_CORPUS,
  LOCAL_AI_RELEASE_CORPUS_DIGEST,
  LOCAL_AI_RELEASE_CORPUS_SCHEMA,
  LOCAL_AI_RELEASE_CORPUS_VERSION,
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

const [command, ...files] = process.argv.slice(2);
const corpusBundle = {
    schema: LOCAL_AI_RELEASE_CORPUS_SCHEMA,
    version: LOCAL_AI_RELEASE_CORPUS_VERSION,
    digest: LOCAL_AI_RELEASE_CORPUS_DIGEST,
    systemPrompt: LOCAL_AI_EVAL_SYSTEM_PROMPT,
    promptDigest: LOCAL_AI_EVAL_PROMPT_DIGEST,
    outputJsonSchema: LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA,
    grammarDigest: LOCAL_AI_EVAL_GRAMMAR_DIGEST,
    cases: LOCAL_AI_RELEASE_CORPUS,
};
if (command === "corpus" && files.length === 0) {
  print(corpusBundle);
} else if (command === "metadata" && files.length === 0) {
  const { cases, ...metadata } = corpusBundle;
  print({ ...metadata, caseCount: cases.length });
} else if (command === "score" && files.length === 1) {
  print(createLocalAiEvalReceipt(jsonFile<LocalAiReleaseRun>(files[0]!)));
} else if (command === "verify" && files.length > 0) {
  const assessment = assessLocalAiRelease(files.map((file) => jsonFile<LocalAiEvalReceipt>(file)));
  print(assessment);
  if (!assessment.passed) process.exitCode = 1;
} else {
  process.stderr.write([
    "Usage:",
    "  pnpm ai:release:corpus",
    "  pnpm ai:release:metadata",
    "  pnpm ai:release:score -- <release-run.json>",
    "  pnpm ai:release:verify -- <receipt.json> [receipt.json ...]",
  ].join("\n") + "\n");
  process.exitCode = 2;
}
