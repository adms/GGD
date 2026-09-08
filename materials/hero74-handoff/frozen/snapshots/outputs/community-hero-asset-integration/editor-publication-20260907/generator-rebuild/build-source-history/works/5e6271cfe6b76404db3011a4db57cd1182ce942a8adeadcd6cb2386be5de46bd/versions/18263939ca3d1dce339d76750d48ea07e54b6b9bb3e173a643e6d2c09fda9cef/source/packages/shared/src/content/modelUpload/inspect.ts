import { sha256Bytes } from "../sha256";
import { sniffImageHeader } from "../icons/encodeIcon";
import { MODEL_UPLOAD_LIMITS, parseUploadGlb, readFloatAccessor } from "./glb";

export interface UploadClip { index: number; name: string; duration: number; channels: number }
export interface UploadValidationReport {
  issues: { numErrors: number; numWarnings: number; numInfos: number; truncated: boolean; messages: { code: string; severity: number; pointer?: string; message?: string }[] };
}

/** Async so the same validator runs in a bounded browser or server worker. */
export async function inspectModelUpload(bytes: Uint8Array, kind: "model" | "animations" = "model") {
  const parsed = parseUploadGlb(bytes), { json, bin } = parsed;
  // Khronos publishes JS without TypeScript declarations.
  // @ts-expect-error gltf-validator has no declaration file.
  const validator = await import("gltf-validator");
  const report = await validator.validateBytes(bytes, {
    format: "glb", maxIssues: 1000, writeTimestamp: false, ignoredIssues: ["UNUSED_OBJECT"],
    externalResourceFunction: async () => { throw new Error("External resources disabled"); },
  }) as UploadValidationReport;
  if (report.issues.numErrors || report.issues.truncated) throw new Error("GLB 格式檢查未通過：" + (report.issues.messages.filter((issue) => issue.severity === 0).slice(0, 3).map((issue) => issue.code).join("、") || "診斷數超過上限"));
  const names = new Set<string>();
  const clips: UploadClip[] = (json.animations ?? []).map((animation, index) => {
    let duration = 0;
    for (const sampler of animation.samplers) {
      const values = readFloatAccessor(json, bin, sampler.input);
      duration = Math.max(duration, values.at(-1) ?? 0);
    }
    if (duration <= 0 || duration > MODEL_UPLOAD_LIMITS.clipSeconds) throw new Error("動作長度必須大於零且不超過 300 秒。");
    // Disambiguate only the working copy; uploaded original bytes remain intact.
    const prefix = animation.name?.trim().slice(0, 120) || `動作 ${index + 1}`;
    let name = prefix, n = 2; while (names.has(name)) name = `${prefix} (${n++})`;
    names.add(name);
    return { index, name, duration, channels: animation.channels.length };
  });
  if (kind === "animations" && !clips.length) throw new Error("動作庫沒有動畫片段。");
  let meshes = 0, triangles = 0;
  for (const node of json.nodes ?? []) if (node.mesh !== undefined) for (const primitive of json.meshes![node.mesh]!.primitives) {
    meshes++;
    const count = json.accessors[primitive.indices ?? primitive.attributes.POSITION!]!.count, mode = primitive.mode ?? 4;
    if (mode === 4) triangles += Math.floor(count / 3); else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
  }
  if (kind === "model" && (!meshes || !triangles)) throw new Error("模型檔沒有可見的三角網格。");
  const textures = (json.images ?? []).map((image) => {
    if (image.bufferView === undefined || !["image/png", "image/jpeg"].includes(image.mimeType ?? "")) throw new Error("GLB 貼圖必須是內嵌 PNG 或 JPEG。");
    const view = json.bufferViews[image.bufferView]!, offset = view.byteOffset ?? 0;
    const imageBytes = bin.subarray(offset, offset + view.byteLength);
    const header = sniffImageHeader(imageBytes);
    if (!header || header.mime !== image.mimeType || !header.width || !header.height) throw new Error("GLB 貼圖格式與內容不符。");
    return { width: header.width, height: header.height, bytes: view.byteLength, sha256: sha256Bytes(imageBytes) };
  });
  return { ...parsed, sha256: sha256Bytes(bytes), clips, meshes, triangles, textures, report };
}
export type InspectedModelUpload = Awaited<ReturnType<typeof inspectModelUpload>>;
