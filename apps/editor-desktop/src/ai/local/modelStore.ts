import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  LOCAL_AI_STATUS_SCHEMA,
  zAiMode,
  type AiMode,
  type LocalAiStatus,
  type LocalModelControlRequest,
  type LocalModelState,
} from "@ggd/shared/content";
import { downloadAndInstallModel, ModelDownloadError, type ModelPaths } from "./modelDownload";
import { LOCAL_MODEL_MANIFEST, modelDirectory, type LocalModelManifest } from "./modelManifest";

type Listener = (status: LocalAiStatus) => void;

function removeIfPresent(path: string): void {
  try { unlinkSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export class LocalModelStore {
  readonly paths: ModelPaths;
  readonly manifest: LocalModelManifest;
  private listeners = new Set<Listener>();
  private abortController: AbortController | null = null;
  private state: LocalModelState;
  private bytes: number;
  private errorCode: string | null = null;
  private preference: AiMode;
  private preferenceConfigured: boolean;
  private cancelDeletesPartial = false;
  private lastProgressEmitAt = 0;

  constructor(
    modelsRoot: string,
    preference: AiMode = "off",
    preferenceConfigured = false,
    manifest: LocalModelManifest = LOCAL_MODEL_MANIFEST,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly availableBytes?: (directory: string) => number,
  ) {
    this.manifest = manifest;
    this.preference = zAiMode.parse(preference);
    this.preferenceConfigured = preferenceConfigured;
    const directory = modelDirectory(modelsRoot, manifest);
    mkdirSync(directory, { recursive: true });
    this.paths = {
      final: join(directory, manifest.filename),
      partial: join(directory, `${manifest.filename}.partial`),
      receipt: join(directory, "verification.json"),
    };
    this.bytes = this.fileBytes(this.paths.partial);
    this.state = this.inspectInstalled() ? "ready" : this.bytes > 0 ? "partial" : "not-installed";
  }

  private fileBytes(path: string): number {
    try { return statSync(path).size; } catch { return 0; }
  }

  private inspectInstalled(): boolean {
    if (!existsSync(this.paths.final) || !existsSync(this.paths.receipt)) return false;
    try {
      const receipt = JSON.parse(readFileSync(this.paths.receipt, "utf8")) as Record<string, unknown>;
      return receipt.schema === "ggd-local-model-receipt@1"
        && receipt.modelId === this.manifest.id
        && receipt.sha256 === this.manifest.sha256
        && receipt.bytes === this.manifest.expectedBytes
        && this.fileBytes(this.paths.final) === this.manifest.expectedBytes;
    } catch { return false; }
  }

  status(): LocalAiStatus {
    return {
      schema: LOCAL_AI_STATUS_SCHEMA,
      preference: this.preference,
      preferenceConfigured: this.preferenceConfigured,
      desktopAvailable: true,
      model: {
        id: this.manifest.id,
        displayName: this.manifest.displayName,
        state: this.state,
        expectedBytes: this.manifest.expectedBytes,
        downloadedBytes: this.state === "ready" ? this.manifest.expectedBytes : this.bytes,
        digest: this.manifest.sha256,
        errorCode: this.errorCode,
      },
      inference: {
        enabled: false,
        backend: "none",
        reasonCode: this.manifest.releaseGate === "pending-e8" ? "LOCAL_AI_E8_GATE_PENDING" : "LOCAL_AI_RUNTIME_MISSING",
      },
      byok: {
        configured: false,
        remembered: false,
        baseUrl: null,
        origin: null,
        protocol: "auto",
        models: [],
        selectedModel: null,
        modelDiscovery: "unknown",
        structuredOutput: "unknown",
        disclosureAccepted: false,
        connection: { state: "idle", message: null },
      },
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status());
    return () => this.listeners.delete(listener);
  }

  setPreference(preference: AiMode): LocalAiStatus {
    this.preference = zAiMode.parse(preference);
    this.preferenceConfigured = true;
    this.emit();
    return this.status();
  }

  async control(action: LocalModelControlRequest["action"]): Promise<LocalAiStatus> {
    if (action === "start" || action === "resume") return this.start();
    if (action === "pause") {
      this.cancelDeletesPartial = false;
      this.abortController?.abort();
      if (this.state === "downloading") this.state = "paused";
    } else if (action === "cancel") {
      this.cancelDeletesPartial = true;
      if (this.abortController) this.abortController.abort();
      else removeIfPresent(this.paths.partial);
      this.bytes = 0;
      this.state = "not-installed";
      this.errorCode = null;
    } else if (action === "remove") {
      this.cancelDeletesPartial = true;
      if (this.abortController) this.abortController.abort();
      else removeIfPresent(this.paths.partial);
      removeIfPresent(this.paths.final);
      removeIfPresent(this.paths.receipt);
      removeIfPresent(`${this.paths.receipt}.partial`);
      this.bytes = 0;
      this.state = "not-installed";
      this.errorCode = null;
    } else if (action === "repair") {
      removeIfPresent(this.paths.final);
      removeIfPresent(this.paths.receipt);
      removeIfPresent(this.paths.partial);
      this.bytes = 0;
      this.state = "not-installed";
      this.errorCode = null;
      return this.start();
    }
    this.emit();
    return this.status();
  }

  private start(): LocalAiStatus {
    if (this.abortController || this.state === "ready") return this.status();
    this.abortController = new AbortController();
    this.cancelDeletesPartial = false;
    this.state = "downloading";
    this.errorCode = null;
    this.lastProgressEmitAt = 0;
    this.emit();
    void downloadAndInstallModel({
      manifest: this.manifest,
      paths: this.paths,
      fetchImpl: this.fetchImpl,
      signal: this.abortController.signal,
      onProgress: ({ downloadedBytes }) => {
        this.bytes = downloadedBytes;
        const now = Date.now();
        if (downloadedBytes === this.manifest.expectedBytes || now - this.lastProgressEmitAt >= 200) {
          this.lastProgressEmitAt = now;
          this.emit();
        }
      },
      ...(this.availableBytes ? { availableBytes: this.availableBytes } : {}),
    }).then(() => {
      this.bytes = this.manifest.expectedBytes;
      this.state = "ready";
      this.errorCode = null;
    }).catch((error: unknown) => {
      if ((error as Error).name === "AbortError") {
        if (this.cancelDeletesPartial) removeIfPresent(this.paths.partial);
        this.bytes = this.cancelDeletesPartial ? 0 : this.fileBytes(this.paths.partial);
        this.state = this.cancelDeletesPartial ? "not-installed" : "paused";
      } else {
        this.bytes = this.fileBytes(this.paths.partial);
        this.state = "broken";
        this.errorCode = error instanceof ModelDownloadError ? error.code : "MODEL_DOWNLOAD_FAILED";
      }
    }).finally(() => {
      this.abortController = null;
      this.cancelDeletesPartial = false;
      this.emit();
    });
    return this.status();
  }

  private emit(): void {
    const value = this.status();
    for (const listener of this.listeners) listener(value);
  }
}
