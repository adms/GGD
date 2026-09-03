import type { IconKind } from "../ai/prompt";

export const LOCAL_ICON_POLICY = {
  schema: "ggd-editor-local-icon-policy@1",
  edgePx: 256,
  outputMime: "image/webp",
  outputQuality: 0.88,
  maxSourceBytes: 20 * 1024 * 1024,
  acceptedSourceMime: ["image/png", "image/jpeg", "image/webp"] as const,
} as const;

export interface LocalIconKey {
  kind: IconKind;
  docId: string;
}

export interface StagedLocalIcon extends LocalIconKey {
  schema: "ggd-editor-staged-icon@1";
  contentPath: string;
  mimeType: "image/webp";
  width: 256;
  height: 256;
  contentSha256: string;
  bytes: number;
  blob: Blob;
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
): Promise<StagedLocalIcon> {
  validateLocalIconSource(file);
  const bitmap = await createImageBitmap(file);
  try {
    const crop = centeredSquareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = LOCAL_ICON_POLICY.edgePx;
    canvas.height = LOCAL_ICON_POLICY.edgePx;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("瀏覽器無法建立 2D 圖片轉檔器");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      bitmap,
      crop.sx,
      crop.sy,
      crop.size,
      crop.size,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await canvasBlob(canvas, LOCAL_ICON_POLICY.outputMime, LOCAL_ICON_POLICY.outputQuality);
    if (blob.type !== LOCAL_ICON_POLICY.outputMime) {
      throw new Error(`這個瀏覽器無法輸出 WebP（實際得到 ${blob.type || "未知格式"}）`);
    }
    const digest = await sha256(blob);
    return {
      schema: "ggd-editor-staged-icon@1",
      kind,
      docId,
      contentPath: localIconAssetPath(kind, docId),
      mimeType: LOCAL_ICON_POLICY.outputMime,
      width: LOCAL_ICON_POLICY.edgePx,
      height: LOCAL_ICON_POLICY.edgePx,
      contentSha256: digest,
      bytes: blob.size,
      blob,
      sourceName: file.name,
      sourceMimeType: file.type,
      sourceBytes: file.size,
      stagedAt: new Date().toISOString(),
    };
  } finally {
    bitmap.close();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("圖片轉檔失敗")),
    mimeType,
    quality,
  ));
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
