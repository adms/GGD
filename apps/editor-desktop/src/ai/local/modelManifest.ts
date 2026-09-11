import { join } from "node:path";

export interface LocalModelManifest {
  readonly schema: "ggd-local-model-manifest@1";
  readonly id: string;
  readonly displayName: string;
  readonly revision: string;
  readonly sourceRevision: string;
  readonly url: string;
  readonly expectedBytes: number;
  readonly sha256: string;
  readonly filename: string;
  readonly license: string;
  readonly allowedRedirectHostSuffixes: readonly string[];
  readonly trust: "bundled-application-signature";
  readonly releaseGate: "pending-e8" | "passed";
}

/**
 * The sole model artifact supported by the desktop editor. This immutable
 * manifest is compiled into the signed application; runtime manifests and
 * player-supplied GGUF URLs are deliberately unsupported.
 */
export const LOCAL_MODEL_MANIFEST: LocalModelManifest = Object.freeze({
  schema: "ggd-local-model-manifest@1",
  id: "qwen3-14b-q4-k-m",
  displayName: "Qwen3-14B Q4_K_M",
  revision: "official-530227a7-q4-k-m",
  sourceRevision: "530227a7d994db8eca5ab5ced2fb692b614357fd",
  url: "https://huggingface.co/Qwen/Qwen3-14B-GGUF/resolve/530227a7d994db8eca5ab5ced2fb692b614357fd/Qwen3-14B-Q4_K_M.gguf?download=true",
  expectedBytes: 9_001_752_960,
  sha256: "500a8806e85ee9c83f3ae08420295592451379b4f8cf2d0f41c15dffeb6b81f0",
  filename: "Qwen3-14B-Q4_K_M.gguf",
  license: "Apache-2.0",
  allowedRedirectHostSuffixes: ["huggingface.co", ".hf.co"],
  trust: "bundled-application-signature",
  releaseGate: "pending-e8",
});

export function modelDirectory(root: string, manifest = LOCAL_MODEL_MANIFEST): string {
  return join(root, manifest.id, manifest.sha256);
}
