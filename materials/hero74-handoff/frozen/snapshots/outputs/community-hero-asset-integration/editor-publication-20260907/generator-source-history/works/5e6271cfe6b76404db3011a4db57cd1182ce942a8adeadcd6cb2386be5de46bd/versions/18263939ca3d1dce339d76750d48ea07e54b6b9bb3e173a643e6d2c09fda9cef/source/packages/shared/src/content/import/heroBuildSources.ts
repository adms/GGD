import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { buildProcessorReceipt, processorFingerprint, sourceClosure } from "./authoringProcessor";
import { canonicalizeJcs, contentSha256 } from "./jcs";
import { sha256Bytes } from "../sha256";

const GENERATOR_ENTRIES = ["packages/shared/src/content/heroForge/planner.ts", "packages/shared/src/content/heroForge/generator.ts", "packages/shared/src/content/heroForge/communityExamples.ts"] as const;
const BUILD_INPUTS = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "packages/shared/package.json", "apps/content-api/package.json", "tsconfig.base.json"] as const;
export type HeroBuildSourceKind = "hero-generator" | "hero-processor";

function snapshot(repoRoot: string, kind: HeroBuildSourceKind, paths: readonly string[], receipt?: ReturnType<typeof buildProcessorReceipt>) {
  const root = realpathSync(repoRoot), files = new Map<string, Uint8Array>();
  for (const path of [...new Set([...paths, ...BUILD_INPUTS])].sort()) {
    const full = realpathSync(resolve(root, path));
    if (!full.startsWith(root + sep) || !/^[a-zA-Z0-9._/-]+$/.test(path)) throw new Error(`生成來源路徑超出專案：${path}`);
    files.set(`source/${path}`, new Uint8Array(readFileSync(full)));
  }
  if (receipt) files.set("processor-receipt.json", new TextEncoder().encode(canonicalizeJcs(receipt)));
  const manifest = {
    schema: "ggd-hero-build-source@1", kind,
    ...(receipt ? { processorFingerprint: processorFingerprint(receipt) } : { entrypoints: [...GENERATOR_ENTRIES] }),
    files: [...files].map(([path, bytes]) => ({ path, contentSha256: `sha256:${sha256Bytes(bytes)}`, bytes: bytes.length })),
  };
  const versionId = contentSha256(manifest);
  files.set("source-manifest.json", new TextEncoder().encode(canonicalizeJcs(manifest)));
  return { kind, versionId, manifest, files };
}

/** Pure source identity is independent of the machine or capture timestamp. */
export function snapshotHeroGenerator(repoRoot: string) {
  return snapshot(repoRoot, "hero-generator", sourceClosure(repoRoot, GENERATOR_ENTRIES));
}

export function snapshotHeroProcessor(repoRoot: string) {
  const receipt = buildProcessorReceipt(repoRoot);
  const captured = snapshot(repoRoot, "hero-processor", receipt.surfaces.flatMap((surface) => surface.files.map((file) => file.path)), receipt);
  // Reject a concurrent source edit between receipt hashing and source capture.
  for (const surface of receipt.surfaces) for (const file of surface.files) {
    if (sha256Bytes(captured.files.get(`source/${file.path}`)!) !== file.sha256) throw new Error("生成程式在保存版本期間變更，請重新建包。");
  }
  return { ...captured, processorFingerprint: processorFingerprint(receipt) };
}
