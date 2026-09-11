import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, renameSync, statfsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { dirname } from "node:path";
import type { LocalModelManifest } from "./modelManifest";

export interface ModelPaths {
  readonly final: string;
  readonly partial: string;
  readonly receipt: string;
}

export interface DownloadProgress {
  readonly downloadedBytes: number;
  readonly expectedBytes: number;
}

export interface DownloadOptions {
  readonly manifest: LocalModelManifest;
  readonly paths: ModelPaths;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: DownloadProgress) => void;
  readonly availableBytes?: (directory: string) => number;
}

export class ModelDownloadError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ModelDownloadError";
  }
}

export function availableDiskBytes(directory: string): number {
  const stats = statfsSync(directory);
  return Number(stats.bavail) * Number(stats.bsize);
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function downloadedBytes(path: string): number {
  try { return statSync(path).size; } catch { return 0; }
}

function hostAllowed(responseUrl: string, manifest: LocalModelManifest): boolean {
  if (!responseUrl) return true;
  let host: string;
  try { host = new URL(responseUrl).hostname.toLowerCase(); } catch { return false; }
  return manifest.allowedRedirectHostSuffixes.some((suffix) => suffix.startsWith(".") ? host.endsWith(suffix) : host === suffix);
}

function removeIfPresent(path: string): void {
  try { unlinkSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function downloadAndInstallModel(options: DownloadOptions): Promise<void> {
  const { manifest, paths, signal, onProgress } = options;
  mkdirSync(dirname(paths.final), { recursive: true });
  let offset = downloadedBytes(paths.partial);
  if (offset > manifest.expectedBytes) {
    removeIfPresent(paths.partial);
    offset = 0;
  }
  const remaining = manifest.expectedBytes - offset;
  const free = (options.availableBytes ?? availableDiskBytes)(dirname(paths.final));
  const safetyReserve = 512 * 1024 * 1024;
  if (free < remaining + safetyReserve) {
    throw new ModelDownloadError("MODEL_DISK_SPACE", `模型仍需 ${remaining} bytes，且必須保留 512 MiB 安全空間。`);
  }

  const response = await (options.fetchImpl ?? fetch)(manifest.url, {
    headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
    redirect: "follow",
    signal,
  });
  if (!hostAllowed(response.url, manifest)) throw new ModelDownloadError("MODEL_REDIRECT_ORIGIN", "模型下載被重新導向未核准的來源。");
  if (offset > 0 && response.status === 200) {
    removeIfPresent(paths.partial);
    offset = 0;
  } else if (offset > 0 && response.status !== 206) {
    throw new ModelDownloadError("MODEL_RANGE_UNSUPPORTED", `續傳需要 HTTP 206，實際為 ${response.status}。`);
  } else if (offset === 0 && response.status !== 200 && response.status !== 206) {
    throw new ModelDownloadError("MODEL_HTTP_STATUS", `模型下載失敗：HTTP ${response.status}。`);
  }
  if (!response.body) throw new ModelDownloadError("MODEL_EMPTY_BODY", "模型下載沒有回傳內容。");

  let current = offset;
  onProgress?.({ downloadedBytes: current, expectedBytes: manifest.expectedBytes });
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      current += chunk.length;
      onProgress?.({ downloadedBytes: current, expectedBytes: manifest.expectedBytes });
      callback(null, chunk);
    },
  });
  const source = Readable.fromWeb(response.body as never);
  await pipeline(source, meter, createWriteStream(paths.partial, { flags: offset > 0 ? "a" : "w", mode: 0o600 }), { signal });

  const actualBytes = downloadedBytes(paths.partial);
  if (actualBytes !== manifest.expectedBytes) {
    throw new ModelDownloadError("MODEL_SIZE_MISMATCH", `模型大小不符：預期 ${manifest.expectedBytes}，實際 ${actualBytes}。`);
  }
  const digest = await sha256File(paths.partial);
  if (digest !== manifest.sha256) {
    throw new ModelDownloadError("MODEL_DIGEST_MISMATCH", "模型 SHA-256 驗證失敗；檔案不會載入。");
  }

  removeIfPresent(paths.final);
  renameSync(paths.partial, paths.final);
  const receiptTemp = `${paths.receipt}.partial`;
  writeFileSync(receiptTemp, `${JSON.stringify({
    schema: "ggd-local-model-receipt@1",
    modelId: manifest.id,
    revision: manifest.revision,
    bytes: manifest.expectedBytes,
    sha256: manifest.sha256,
    verifiedAt: new Date().toISOString(),
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(receiptTemp, paths.receipt);
}
