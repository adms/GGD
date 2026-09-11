import { canonicalizeJcs } from "@ggd/shared/content";
import { createLlamaCppReleaseInfer } from "../src/ai/local/llamaCppReleaseClient";
import { LOCAL_AI_RELEASE_CORPUS, LOCAL_AI_EVAL_SYSTEM_PROMPT } from "../src/ai/local/releaseCorpus";
import { LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA } from "../src/ai/local/releaseGate";
import { toModelVisibleEvalCase } from "../src/ai/local/releaseRunner";

async function main(): Promise<void> {
  const [endpoint = "http://127.0.0.1:8080"] = process.argv.slice(2).filter((argument) => argument !== "--");
  const testCase = LOCAL_AI_RELEASE_CORPUS[0]!;
  const started = performance.now();
  const raw = await createLlamaCppReleaseInfer(endpoint)({
    systemPrompt: LOCAL_AI_EVAL_SYSTEM_PROMPT,
    testCase: toModelVisibleEvalCase(testCase),
    outputJsonSchema: LOCAL_AI_EVAL_OUTPUT_JSON_SCHEMA,
  });
  process.stdout.write(`${canonicalizeJcs({ caseId: testCase.id, durationMs: performance.now() - started, output: JSON.parse(raw) })}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
