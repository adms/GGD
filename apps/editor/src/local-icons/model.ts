import type { IconKind } from "../ai/prompt";
import { sniffImageHeader, type IconFormat } from "@ggd/shared/content/icons/iconContract";

export const LOCAL_ICON_POLICY = {
  schema: "ggd-editor-local-icon-policy@2",
  maxSourceBytes: 20 * 1024 * 1024,
  acceptedSourceMime: ["image/png", "image/jpeg", "image/webp"] as const,
} as const;

export interface LocalIconKey {
  kind: IconKind;
  docId: string;
}

export interface StagedLocalIcon extends LocalIconKey {
  schema: "ggd-editor-staged-icon@2";
  /** Final document pointer. Main writes the converted WebP here. */
  contentPath: string;
  /** ZIP source entry. It deliberately differs from contentPath. */
  sourcePath: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  contentSha256: string;
  bytes: number;
  /** Original source bytes; Editor must not create a competing conversion. */
  blob: Blob;
  sourcePreserved: true;
  /** Exact existing output asset read when staged; null means it did not exist. */
  baseSha256: string | null;
  sourceName: string;
  sourceMimeType: string;
  sourceBytes: number;
  stagedAt: string;
}

export interface IconCrop {
  sx: number;
  sy: number;
  size: number;
}

export function localIconStorageKey({ kind, docId }: LocalIconKey): string {
  return `${kind}/${docId}`;
}

export function localIconAssetPath(kind: IconKind, docId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(docId)) throw new Error(`Icon 文件 ID 不安全：${docId}`);
  return `assets/icons/${kind}/${docId}.webp`;
}

export function localIconSourcePath(kind: IconKind, docId: string, format: IconFormat): string {
  if (!/^[A-Za-z0-9._-]+$/.test(docId)) throw new Error(`Icon 文件 ID 不安全：${docId}`);
  const ext = format === "jpeg" ? "jpeg" : format;
  return `assets/icon/${kind}/${docId}/source.${ext}`;
}

export function validateLocalIconSource(file: Pick<File, "name" | "type" | "size">): void {
  if (!(LOCAL_ICON_POLICY.acceptedSourceMime as readonly string[]).includes(file.type)) {
    throw new Error(`只接受 PNG／JPEG／WebP；收到 ${file.type || "未知格式"}`);
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("圖片是空檔或大小無效");
  if (file.size > LOCAL_ICON_POLICY.maxSourceBytes) {
    throw new Error(`圖片 ${formatBytes(file.size)} 超過本機暫存上限 ${formatBytes(LOCAL_ICON_POLICY.maxSourceBytes)}`);
  }
}

/** Square cover crop; never stretches a non-square source. */
export function centeredSquareCrop(width: number, height: number): IconCrop {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("圖片尺寸無效");
  }
  const size = Math.min(width, height);
  return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}

export async function stageLocalIcon(
  kind: IconKind,
  docId: string,
  file: File,
  options: { readonly maxSourceEdge: number; readonly baseSha256: string | null },
): Promise<StagedLocalIcon> {
  validateLocalIconSource(file);
  const raw = new Uint8Array(await file.arrayBuffer());
  const header = sniffImageHeader(raw);
  if (!header) throw new Error("圖片檔頭不是有效的 PNG／JPEG／WebP");
  const mimeType = header.mime as StagedLocalIcon["mimeType"];
  if (!(LOCAL_ICON_POLICY.acceptedSourceMime as readonly string[]).includes(mimeType)) {
    throw new Error(`圖片檔頭格式不受支援：${header.mime}`);
  }
  if (header.mime !== file.type) {
    throw new Error(`圖片宣稱 ${file.type || "未知格式"}，但檔頭實際是 ${header.mime}`);
  }
  if (header.width > options.maxSourceEdge || header.height > options.maxSourceEdge) {
    throw new Error(`圖片 ${header.width}×${header.height} 超過目標遊戲允許的 ${options.maxSourceEdge}×${options.maxSourceEdge}`);
  }
  const digest = await sha256(file);
  return {
    schema: "ggd-editor-staged-icon@2",
    kind,
    docId,
    contentPath: localIconAssetPath(kind, docId),
    sourcePath: localIconSourcePath(kind, docId, header.format),
    mimeType,
    width: header.width,
    height: header.height,
    contentSha256: digest,
    bytes: file.size,
    blob: file.slice(0, file.size, mimeType),
    sourcePreserved: true,
    baseSha256: options.baseSha256,
    sourceName: file.name,
    sourceMimeType: file.type,
    sourceBytes: file.size,
    stagedAt: new Date().toISOString(),
  };
}

export function isCurrentStagedLocalIcon(value: unknown): value is StagedLocalIcon {
  if (!value || typeof value !== "object") return false;
  const icon = value as Partial<StagedLocalIcon>;
  return icon.schema === "ggd-editor-staged-icon@2" && icon.sourcePreserved === true &&
    typeof icon.sourcePath === "string" && typeof icon.contentPath === "string" &&
    typeof icon.contentSha256 === "string" && icon.blob instanceof Blob &&
    (icon.baseSha256 === null || typeof icon.baseSha256 === "string");
}

async function sha256(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}
