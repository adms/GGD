import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { AssetDrop } from "./model";

const MIN_NEUTRAL_SHARE = 0.001;
// A single transparent speck is not a removed background. Particle sprites are
// rendered on camera-facing quads, so their OUTER EDGE must mostly disappear
// under the authored blend equation or the rectangular carrier is visible in
// actual play. Keep this separate from the total-share floor: tightly cropped
// beams may touch two sides while still having clean corners/other edges.
const MIN_NEUTRAL_EDGE_SHARE = 0.25;
const NEUTRAL_CODE_VALUE = 1 / 255;
const ALPHA_BACKGROUND_MAX = 5;
const BRIGHT_MATTE_MIN = 8;
const MIN_BACKGROUND_SHARE = 0.02;
const MAX_BRIGHT_BACKGROUND_SHARE = 0.001;
const OPAQUE_CARRIER_EDGE_SHARE = 0.6;
const OPAQUE_CARRIER_TOTAL_SHARE = 0.1;
const PLANAR_THICKNESS_RATIO = 0.02;
const PLANAR_MIN_MODEL_SPAN_RATIO = 0.05;
const CARRIER_COLOR_SHIFT = 5;

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
  doc<T>(collection: "config" | "models" | "vfx", id: string): Promise<T>;
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
  fxEmitters?: readonly string[];
}

interface UnsafeTextureConfigDoc {
  schema?: unknown;
  textures?: readonly {
    file?: unknown;
    sha256?: unknown;
    status?: unknown;
    safeBlendModes?: readonly unknown[];
  }[];
}

interface GlbJson {
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  textures?: { source?: number }[];
  materials?: {
    name?: string;
    alphaMode?: "OPAQUE" | "MASK" | "BLEND";
    emissiveFactor?: number[];
    pbrMetallicRoughness?: { baseColorTexture?: { index?: number } };
  }[];
  meshes?: { primitives?: { material?: number; attributes?: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
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
  private unsafeTextureConfig: Promise<UnsafeTextureConfigDoc | null> | null = null;

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
    const bytes = await this.source.assetBytes(doc.texture);
    const contracted = await this.checkTextureContract(asset, doc.texture, doc.blendMode, bytes);
    if (contracted) return contracted;
    const raster = await this.decode(bytes, "image/png");
    const colors = colorsOf(doc);
    let neutral = 0;
    let neutralEdge = 0;
    let edgePixels = 0;
    forEachPixel(raster, (pixel, x, y) => {
      const isNeutral = isCompositingNeutral(doc.blendMode!, colors, pixel);
      if (isNeutral) neutral++;
      if (isEdgePixel(raster, x, y)) {
        edgePixels++;
        if (isNeutral) neutralEdge++;
      }
    });
    const share = neutral / pixelCount(raster);
    const edgeShare = edgePixels > 0 ? neutralEdge / edgePixels : 0;
    if (share < MIN_NEUTRAL_SHARE || edgeShare < MIN_NEUTRAL_EDGE_SHARE) {
      return {
        asset,
        safe: false,
        code: "TEXTURE_BACKDROP",
        summary: "貼圖在實際混合模式下會畫出整張底板",
        detail: `${doc.texture} · ${doc.blendMode} · 可消失背景 ${(share * 100).toFixed(3)}% · 邊緣可消失 ${(edgeShare * 100).toFixed(1)}%`,
      };
    }
    return safe(asset, `去背通過 · ${doc.blendMode} · 可消失背景 ${(share * 100).toFixed(2)}% · 邊緣 ${(edgeShare * 100).toFixed(1)}%`);
  }

  /**
   * Main owns the authoritative `(texture, blendMode)` quarantine contract.
   * Re-measuring a known file with a second Editor threshold produced the exact
   * false positives this contract was created to prevent (`babyface`, `zap1`).
   * Unknown author assets still take the pixel-analysis fallback above.
   */
  private async checkTextureContract(
    asset: AssetDrop,
    texture: string,
    blendMode: BlendMode,
    bytes: ArrayBuffer,
  ): Promise<AssetSafetyResult | null> {
    if (!this.unsafeTextureConfig) {
      this.unsafeTextureConfig = this.source
        .doc<UnsafeTextureConfigDoc>("config", "unsafe-textures")
        .then((doc) => doc?.schema === "config.unsafe-textures@1" ? doc : null)
        .catch(() => null);
    }
    const config = await this.unsafeTextureConfig;
    const row = config?.textures?.find((entry) => entry.file === texture);
    if (!row) return null;
    if (typeof row.sha256 !== "string" || row.sha256 !== await sha256(bytes)) {
      return {
        asset,
        safe: false,
        code: "ASSET_CHECK_FAILED",
        summary: "貼圖內容與 Main 安全契約的雜湊不一致",
        detail: `${texture} · 必須重新產生 config.unsafe-textures@1 收據`,
      };
    }
    if (row.status !== "safe") {
      return {
        asset,
        safe: false,
        code: "TEXTURE_BACKDROP",
        summary: "Main 安全契約已隔離這張貼圖",
        detail: `${texture} · ${blendMode}`,
      };
    }
    const allowed = new Set((row.safeBlendModes ?? []).filter((mode): mode is string => typeof mode === "string"));
    if (!allowed.has(blendMode)) {
      return {
        asset,
        safe: false,
        code: "TEXTURE_BACKDROP",
        summary: "貼圖不允許搭配目前的混合模式",
        detail: `${texture} · ${blendMode}；允許 ${[...allowed].join("、") || "無"}`,
      };
    }
    return safe(asset, `Main 素材契約通過 · ${blendMode} · sha256 已核對`);
  }

  private async checkModel(asset: AssetDrop): Promise<AssetSafetyResult> {
    const doc = await this.source.doc<ModelDoc>("models", asset.id);
    if (!doc.glbPath) throw new Error(`${asset.id}: model 文件缺 glbPath`);
    const { json, bin } = parseGlb(await this.source.assetBytes(doc.glbPath));
    const decoded = new Map<number, Promise<DecodedRaster>>();
    let measured = 0;
    for (const [materialIndex, material] of (json.materials ?? []).entries()) {
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
      let edgePixels = 0;
      const carrierBins = new Map<number, { total: number; edge: number }>();
      const border = Math.max(1, Math.round(Math.min(pixels.width, pixels.height) * 0.05));
      forEachPixel(pixels, ([r, g, b, a], x, y) => {
        if (a <= ALPHA_BACKGROUND_MAX) {
          background++;
          if (Math.max(r, g, b) > BRIGHT_MATTE_MIN) brightBackground++;
        }
        const edge = x < border || y < border || x >= pixels.width - border || y >= pixels.height - border;
        if (edge) edgePixels++;
        if (a >= 250) {
          // Quantise to 5 bits/channel. A photographed/painted background is
          // rarely byte-identical after compression, but its outer carrier
          // still lands in one dominant colour bucket.
          const key = ((r >> CARRIER_COLOR_SHIFT) << 6) | ((g >> CARRIER_COLOR_SHIFT) << 3) | (b >> CARRIER_COLOR_SHIFT);
          const bin = carrierBins.get(key) ?? { total: 0, edge: 0 };
          bin.total++;
          if (edge) bin.edge++;
          carrierBins.set(key, bin);
        }
      });
      const count = pixelCount(pixels);
      if (background / count < MIN_BACKGROUND_SHARE) {
        const carrier = [...carrierBins.values()].sort((a, b) => b.edge - a.edge)[0] ?? { total: 0, edge: 0 };
        const carrierShare = carrier.total / count;
        const carrierEdgeShare = edgePixels > 0 ? carrier.edge / edgePixels : 0;
        if (
          (materialIsPlanarCard(json, materialIndex) ||
            Math.max(...(material.emissiveFactor ?? [0])) > 0 ||
            (doc.fxEmitters?.length ?? 0) > 0) &&
          carrierShare >= OPAQUE_CARRIER_TOTAL_SHARE &&
          carrierEdgeShare >= OPAQUE_CARRIER_EDGE_SHARE
        ) {
          return {
            asset,
            safe: false,
            code: "MODEL_TEXTURE_BACKDROP",
            summary: "3D Model 的特效貼圖保留不透明單色底板",
            detail: `mat${materialIndex}:${material.name ?? "?"} · ${material.alphaMode ?? "OPAQUE"} · 單色底 ${(carrierShare * 100).toFixed(2)}% · 邊緣 ${(carrierEdgeShare * 100).toFixed(1)}%`,
          };
        }
        continue;
      }
      if ((material.alphaMode ?? "OPAQUE") === "OPAQUE") {
        return {
          asset,
          safe: false,
          code: "MODEL_TEXTURE_BACKDROP",
          summary: "3D Model 的透明貼圖被當成不透明材質，動畫時會露出整片底板",
          detail: `mat${materialIndex}:${material.name ?? "?"} · 透明背景 ${(background / count * 100).toFixed(2)}% · alphaMode OPAQUE`,
        };
      }
      if (Math.max(...(material.emissiveFactor ?? [0])) <= 0) continue;
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
    return safe(asset, measured ? `GLB 內嵌貼圖 ${measured} 份去背／透明材質通過` : "GLB 沒有需檢查的內嵌貼圖材質");
  }
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

/**
 * Preview is a consumer too: an unsafe draft must not render for even one
 * frame while its async source checks are still pending.  Requiring one safe
 * receipt per exact ref also prevents stale query data from authorising a
 * newly edited script.
 */
export function allAssetRefsVerifiedSafe(
  refs: readonly AssetDrop[],
  results: readonly AssetSafetyResult[] | undefined,
): boolean {
  if (refs.length === 0) return true;
  if (!results) return false;
  const byKey = new Map(results.map((result) => [assetKey(result.asset), result]));
  return refs.every((ref) => byKey.get(assetKey(ref))?.safe === true);
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

function materialIsPlanarCard(json: GlbJson, materialIndex: number): boolean {
  let found = false;
  let materialSpan = 0;
  let modelSpan = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const anyPosition = primitive.attributes?.POSITION;
      const anyAccessor = anyPosition === undefined ? undefined : json.accessors?.[anyPosition];
      if (anyAccessor?.min && anyAccessor.max && anyAccessor.min.length >= 3 && anyAccessor.max.length >= 3) {
        modelSpan = Math.max(
          modelSpan,
          ...[0, 1, 2].map((axis) => Math.abs(anyAccessor.max![axis]! - anyAccessor.min![axis]!)),
        );
      }
      if (primitive.material !== materialIndex) continue;
      found = true;
      const position = primitive.attributes?.POSITION;
      const accessor = position === undefined ? undefined : json.accessors?.[position];
      if (!accessor?.min || !accessor.max || accessor.min.length < 3 || accessor.max.length < 3) return false;
      const extents = [0, 1, 2]
        .map((axis) => Math.abs(accessor.max![axis]! - accessor.min![axis]!))
        .sort((a, b) => a - b);
      if (extents[2]! <= 1e-6 || extents[0]! > extents[2]! * PLANAR_THICKNESS_RATIO) return false;
      materialSpan = Math.max(materialSpan, extents[2]!);
    }
  }
  // Ignore tiny utility quads embedded in an otherwise full 3D character.
  // Their pixels cannot form a visible backdrop at the model's authored scale;
  // the save-time GPU sweep still catches a script that deliberately enlarges
  // one.  A real effect card remains comparable to the model's total span.
  return found && modelSpan > 0 && materialSpan >= modelSpan * PLANAR_MIN_MODEL_SPAN_RATIO;
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

function forEachPixel(
  raster: DecodedRaster,
  visit: (pixel: Rgba, x: number, y: number) => void,
): void {
  pixelCount(raster);
  for (let i = 0; i < raster.rgba.length; i += 4) {
    const pixel = i / 4;
    visit(
      [raster.rgba[i]!, raster.rgba[i + 1]!, raster.rgba[i + 2]!, raster.rgba[i + 3]!],
      pixel % raster.width,
      Math.floor(pixel / raster.width),
    );
  }
}

function isEdgePixel(raster: DecodedRaster, x: number, y: number): boolean {
  return x === 0 || y === 0 || x === raster.width - 1 || y === raster.height - 1;
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
