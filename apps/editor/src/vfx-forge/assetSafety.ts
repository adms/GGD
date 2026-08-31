import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { AssetDrop } from "./model";

const MIN_NEUTRAL_SHARE = 0.001;
const NEUTRAL_CODE_VALUE = 1 / 255;
const ALPHA_BACKGROUND_MAX = 5;
const BRIGHT_MATTE_MIN = 8;
const MIN_BACKGROUND_SHARE = 0.02;
const MAX_BRIGHT_BACKGROUND_SHARE = 0.001;

type Rgba = readonly [number, number, number, number];
type BlendMode = "additive" | "alpha" | "alphaKey" | "modulate";

export interface DecodedRaster {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface AssetSafetyResult {
  asset: AssetDrop;
  safe: boolean;
  code: "SAFE" | "TEXTURE_BACKDROP" | "MODEL_TEXTURE_BACKDROP" | "ASSET_CHECK_FAILED";
  summary: string;
  detail?: string;
}

export interface AssetSafetySource {
  doc<T>(collection: "models" | "vfx", id: string): Promise<T>;
  assetBytes(contentPath: string): Promise<ArrayBuffer>;
}

export interface VfxScriptAssetGuard {
  assertScriptSafe(doc: VfxScriptDoc): Promise<void>;
}

interface VfxDoc {
  id?: string;
  blendMode?: BlendMode;
  texture?: string;
  schema?: "vfx@1" | "ribbon@1";
  color?: Rgba | { start: Rgba; end: Rgba };
  colorStops?: readonly (readonly [number, Rgba])[];
}

interface ModelDoc {
  glbPath?: string;
}

interface GlbJson {
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  textures?: { source?: number }[];
  materials?: {
    name?: string;
    emissiveFactor?: number[];
    pbrMetallicRoughness?: { baseColorTexture?: { index?: number } };
  }[];
}

export class UnsafeVfxAssetError extends Error {
  constructor(readonly blockers: readonly AssetSafetyResult[]) {
    super(blockers.map((item) => `${item.asset.id}: ${item.summary}`).join("；"));
    this.name = "UnsafeVfxAssetError";
  }
}

/**
 * One gate for palette, drag/drop, save and future package export. Unknown and
 * decode errors fail closed; a successful result is memoised for this editor
 * session so moving sliders never re-downloads the same GLB/PNG.
 */
export class AssetSafetyGate implements VfxScriptAssetGuard {
  private readonly cache = new Map<string, Promise<AssetSafetyResult>>();

  constructor(
    private readonly source: AssetSafetySource,
    private readonly decode: (bytes: ArrayBuffer, mime?: string) => Promise<DecodedRaster> = decodeRaster,
  ) {}

  check(asset: AssetDrop): Promise<AssetSafetyResult> {
    const key = assetKey(asset);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const pending = this.checkUncached(asset).catch((error: unknown) => ({
      asset,
      safe: false,
      code: "ASSET_CHECK_FAILED" as const,
      summary: "素材安全檢查失敗，已禁止使用",
      detail: String(error),
    }));
    this.cache.set(key, pending);
    return pending;
  }

  async checkScript(doc: VfxScriptDoc): Promise<AssetSafetyResult[]> {
    return Promise.all(assetRefsFromScript(doc).map((asset) => this.check(asset)));
  }

  async assertScriptSafe(doc: VfxScriptDoc): Promise<void> {
    const blockers = (await this.checkScript(doc)).filter((result) => !result.safe);
    if (blockers.length) throw new UnsafeVfxAssetError(blockers);
  }

  private async checkUncached(asset: AssetDrop): Promise<AssetSafetyResult> {
    return asset.collection === "vfx" ? this.checkVfx(asset) : this.checkModel(asset);
  }

  private async checkVfx(asset: AssetDrop): Promise<AssetSafetyResult> {
    const doc = await this.source.doc<VfxDoc>("vfx", asset.id);
    if (!doc.texture) return safe(asset, "此 VFX 不引用貼圖");
    if (!doc.blendMode) throw new Error(`${asset.id}: 缺 blendMode`);
    const raster = await this.decode(await this.source.assetBytes(doc.texture), "image/png");
    const colors = colorsOf(doc);
    let neutral = 0;
    forEachPixel(raster, (pixel) => {
      if (isCompositingNeutral(doc.blendMode!, colors, pixel)) neutral++;
    });
    const share = neutral / pixelCount(raster);
    if (share < MIN_NEUTRAL_SHARE) {
      return {
        asset,
        safe: false,
        code: "TEXTURE_BACKDROP",
        summary: "貼圖在實際混合模式下會畫出整張底板",
        detail: `${doc.texture} · ${doc.blendMode} · 可消失背景 ${(share * 100).toFixed(3)}%`,
      };
    }
    return safe(asset, `去背通過 · ${doc.blendMode} · 可消失背景 ${(share * 100).toFixed(2)}%`);
  }

  private async checkModel(asset: AssetDrop): Promise<AssetSafetyResult> {
    const doc = await this.source.doc<ModelDoc>("models", asset.id);
    if (!doc.glbPath) throw new Error(`${asset.id}: model 文件缺 glbPath`);
    const { json, bin } = parseGlb(await this.source.assetBytes(doc.glbPath));
    const decoded = new Map<number, Promise<DecodedRaster>>();
    let measured = 0;
    for (const [materialIndex, material] of (json.materials ?? []).entries()) {
      if (Math.max(...(material.emissiveFactor ?? [0])) <= 0) continue;
      const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
      if (textureIndex === undefined) continue;
      const imageIndex = json.textures?.[textureIndex]?.source;
      if (imageIndex === undefined) throw new Error(`${asset.id}: mat${materialIndex} 貼圖沒有 image source`);
      let raster = decoded.get(imageIndex);
      if (!raster) {
        const image = embeddedImage(json, bin, imageIndex, asset.id);
        raster = this.decode(toOwnedArrayBuffer(image.bytes), image.mimeType);
        decoded.set(imageIndex, raster);
      }
      const pixels = await raster;
      measured++;
      let background = 0;
      let brightBackground = 0;
      forEachPixel(pixels, ([r, g, b, a]) => {
        if (a > ALPHA_BACKGROUND_MAX) return;
        background++;
        if (Math.max(r, g, b) > BRIGHT_MATTE_MIN) brightBackground++;
      });
      const count = pixelCount(pixels);
      if (background / count < MIN_BACKGROUND_SHARE) continue;
      if (brightBackground / count >= MAX_BRIGHT_BACKGROUND_SHARE) {
        return {
          asset,
          safe: false,
          code: "MODEL_TEXTURE_BACKDROP",
          summary: "3D Model 的發光貼圖會在實際遊戲露出底板",
          detail: `mat${materialIndex}:${material.name ?? "?"} · 透明背景 ${(background / count * 100).toFixed(2)}% · 亮色殘留 ${(brightBackground / count * 100).toFixed(2)}%`,
        };
      }
    }
    return safe(asset, measured ? `GLB 內嵌發光貼圖 ${measured} 份去背通過` : "GLB 沒有需檢查的發光 cut-out 材質");
  }
}

export function assetRefsFromScript(doc: VfxScriptDoc): AssetDrop[] {
  const refs = new Map<string, AssetDrop>();
  for (const segment of doc.segments) {
    if (segment.kind === "modelFx") {
      addRef(refs, { collection: "models", id: segment.modelKey });
      if (segment.trailVfxId) addRef(refs, { collection: "vfx", id: segment.trailVfxId });
    } else if (segment.kind === "vfx") {
      addRef(refs, { collection: "vfx", id: segment.vfxId });
    }
  }
  return [...refs.values()].sort((a, b) => assetKey(a).localeCompare(assetKey(b)));
}

export function assetKey(asset: AssetDrop): string {
  return `${asset.collection}:${asset.id}`;
}

export function isCompositingNeutral(
  mode: BlendMode,
  colors: readonly Rgba[],
  rgba8: Rgba,
): boolean {
  const tex = rgba8.map((value) => value / 255) as unknown as Rgba;
  let contribution = 0;
  for (const color of colors) {
    if (mode === "additive") {
      contribution = Math.max(contribution, tex[0] * color[0], tex[1] * color[1], tex[2] * color[2]);
    } else if (mode === "alpha" || mode === "alphaKey") {
      contribution = Math.max(contribution, tex[3] * color[3]);
    } else {
      for (let channel = 0; channel < 3; channel++) {
        contribution = Math.max(contribution, tex[3] * color[3] * (1 - tex[channel]! * color[channel]!));
      }
    }
  }
  return contribution < NEUTRAL_CODE_VALUE;
}

async function decodeRaster(bytes: ArrayBuffer, mime = "image/png"): Promise<DecodedRaster> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("瀏覽器無法建立 2D canvas 來檢查貼圖");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, rgba: image.data };
  } finally {
    bitmap.close();
  }
}

function colorsOf(doc: VfxDoc): readonly Rgba[] {
  if (doc.colorStops?.length) return doc.colorStops.map((stop) => stop[1]);
  const color = doc.color;
  if (Array.isArray(color)) return [color as unknown as Rgba];
  if (color && "start" in color) return [color.start, color.end];
  return [[1, 1, 1, 1]];
}

function parseGlb(bytes: ArrayBuffer): { json: GlbJson; bin: Uint8Array } {
  const view = new DataView(bytes);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error("不是有效的 GLB v2");
  }
  let offset = 12;
  let json: GlbJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > view.byteLength) throw new Error("GLB chunk 超出檔案範圍");
    const chunk = new Uint8Array(bytes, start, length);
    if (type === 0x4e4f534a) {
      const text = new TextDecoder().decode(chunk).replace(/[\u0000 ]+$/u, "");
      json = JSON.parse(text) as GlbJson;
    } else if (type === 0x004e4942) bin = chunk;
    offset = start + length;
    while (offset % 4 !== 0) offset++;
  }
  if (!json || !bin) throw new Error("GLB 缺 JSON/BIN chunk");
  return { json, bin };
}

function embeddedImage(
  json: GlbJson,
  bin: Uint8Array,
  imageIndex: number,
  assetId: string,
): { bytes: Uint8Array; mimeType: string } {
  const image = json.images?.[imageIndex];
  if (!image) throw new Error(`${assetId}: GLB image ${imageIndex} 不存在`);
  if (image.uri) throw new Error(`${assetId}: GLB image ${imageIndex} 是外部 URI，無法證明匯出包完整性`);
  if (image.bufferView === undefined) throw new Error(`${assetId}: GLB image ${imageIndex} 沒有 bufferView`);
  const bufferView = json.bufferViews?.[image.bufferView];
  if (!bufferView) throw new Error(`${assetId}: GLB bufferView ${image.bufferView} 不存在`);
  const start = bufferView.byteOffset ?? 0;
  const end = start + bufferView.byteLength;
  if (end > bin.length) throw new Error(`${assetId}: GLB image ${imageIndex} 超出 BIN 範圍`);
  return { bytes: bin.subarray(start, end), mimeType: image.mimeType ?? "image/png" };
}

function addRef(refs: Map<string, AssetDrop>, asset: AssetDrop): void {
  refs.set(assetKey(asset), asset);
}

function safe(asset: AssetDrop, summary: string): AssetSafetyResult {
  return { asset, safe: true, code: "SAFE", summary };
}

function pixelCount(raster: DecodedRaster): number {
  const expected = raster.width * raster.height * 4;
  if (raster.width <= 0 || raster.height <= 0 || raster.rgba.length !== expected) {
    throw new Error(`貼圖解碼尺寸不一致：${raster.width}×${raster.height}, RGBA=${raster.rgba.length}`);
  }
  return raster.width * raster.height;
}

function forEachPixel(raster: DecodedRaster, visit: (pixel: Rgba) => void): void {
  pixelCount(raster);
  for (let i = 0; i < raster.rgba.length; i += 4) {
    visit([raster.rgba[i]!, raster.rgba[i + 1]!, raster.rgba[i + 2]!, raster.rgba[i + 3]!]);
  }
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
