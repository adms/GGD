import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LocalModelStore } from "./modelStore";

export interface LocalRuntimeManifest {
  readonly platform: "darwin-arm64" | "darwin-x64" | "win32-x64-cuda" | "win32-x64-vulkan" | "win32-x64-cpu";
  readonly executable: string;
  readonly sha256: string;
}

/**
 * Fail-closed seam for E8. The worker never accepts an executable, URL, shell
 * argument or workspace path from the renderer. Actual spawning remains
 * disabled until the pinned runtime and the selected GGUF pass the release
 * corpus on macOS and Windows RTX 4060 Ti 16 GB.
 */
export class LocalAiWorker {
  constructor(
    private readonly resourcesRoot: string,
    private readonly store: LocalModelStore,
    private readonly runtime: LocalRuntimeManifest | null,
  ) {}

  diagnosis(): { ready: false; reasonCode: string } {
    if (this.store.manifest.releaseGate === "pending-e8") return { ready: false, reasonCode: "LOCAL_AI_E8_GATE_PENDING" };
    if (!this.runtime) return { ready: false, reasonCode: "LOCAL_AI_RUNTIME_MISSING" };
    const executable = join(this.resourcesRoot, "ai-runtime", this.runtime.platform, this.runtime.executable);
    if (!existsSync(executable)) return { ready: false, reasonCode: "LOCAL_AI_RUNTIME_MISSING" };
    return { ready: false, reasonCode: "LOCAL_AI_RUNTIME_NOT_RELEASED" };
  }
}
