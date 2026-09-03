import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_AI_RELEASE_CORPUS_DIGEST } from "./ai/local/releaseCorpus";
import { LOCAL_AI_EVAL_GRAMMAR_DIGEST, LOCAL_AI_EVAL_PROMPT_DIGEST, LOCAL_AI_RELEASE_LIMITS } from "./ai/local/releaseGate";

const ROOT = join(import.meta.dirname, "..");

describe("desktop cross-platform packaging gate", () => {
  it("builds Mac and Windows shells without bundling model weights or an unreleased runtime", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      build: { files: string[]; extraResources: Array<{ from: string; to: string }>; mac: { target: string[] }; win: { target: string[] } };
    };
    expect(pkg.build.mac.target).toEqual(expect.arrayContaining(["dmg", "zip"]));
    expect(pkg.scripts["dist:mac"]).toContain("--universal");
    expect(pkg.build.win.target).toEqual(expect.arrayContaining(["nsis", "portable"]));
    expect(pkg.build.files.join(" ")).not.toMatch(/gguf|safetensors|onnx/i);
    expect(pkg.build.extraResources).toContainEqual({ from: "resources/ai", to: "ai" });
    expect(readdirSync(join(ROOT, "resources/ai"), { recursive: true }).map(String).join("\n")).not.toMatch(/\.(gguf|safetensors|onnx|pt|pth)$/i);
    const runtime = JSON.parse(readFileSync(join(ROOT, "resources/ai/runtime-manifest.json"), "utf8"));
    expect(runtime).toMatchObject({ released: false, reasonCode: "LOCAL_AI_E8_GATE_PENDING", executables: [] });
    const release = JSON.parse(readFileSync(join(ROOT, "resources/ai/release-gate-manifest.json"), "utf8"));
    expect(release).toMatchObject({ released: false, reasonCode: "LOCAL_AI_E8_GATE_PENDING", corpus: { cases: 216 }, verifiedReceiptDigests: [] });
    expect(release.corpus.sha256).toBe(LOCAL_AI_RELEASE_CORPUS_DIGEST);
    expect(release.promptSha256).toBe(LOCAL_AI_EVAL_PROMPT_DIGEST);
    expect(release.grammarSha256).toBe(LOCAL_AI_EVAL_GRAMMAR_DIGEST);
    expect({ ...release.corpus, ...release.performance }).toMatchObject(LOCAL_AI_RELEASE_LIMITS);
  });
});
