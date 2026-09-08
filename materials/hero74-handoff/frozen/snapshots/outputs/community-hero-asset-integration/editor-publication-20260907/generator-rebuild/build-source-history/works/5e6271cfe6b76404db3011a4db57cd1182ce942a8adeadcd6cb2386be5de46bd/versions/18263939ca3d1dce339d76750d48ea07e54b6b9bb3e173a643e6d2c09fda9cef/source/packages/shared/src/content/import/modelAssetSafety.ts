/** A frozen model must not let its loader fetch mutable, unreviewed side files. */
export function assertContainedModelAsset(path: string, bytes: Uint8Array): void {
  let document: unknown;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  if (path.endsWith(".glb")) {
    if (bytes.length < 20) throw new Error(`GLB 標頭不完整：${path}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error(`GLB 標頭或長度不符：${path}`);
    let offset = 12;
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) throw new Error(`GLB chunk 被截斷：${path}`);
      const size = view.getUint32(offset, true); const kind = view.getUint32(offset + 4, true);
      if (size % 4 || offset + 8 + size > bytes.length) throw new Error(`GLB chunk 長度不符：${path}`);
      if (kind === 0x4e4f534a) {
        if (document !== undefined || offset !== 12) throw new Error(`GLB JSON chunk 重複或位置錯誤：${path}`);
        document = JSON.parse(decoder.decode(bytes.subarray(offset + 8, offset + 8 + size)));
      }
      offset += size + 8;
    }
  } else document = JSON.parse(decoder.decode(bytes));
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error(`模型缺少 JSON 描述：${path}`);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
      if ((key === "uri" || key === "url") && typeof child === "string" && !/^data:(?:image\/(?:png|jpeg|webp)|application\/(?:octet-stream|gltf-buffer));base64,[A-Za-z0-9+/]*={0,2}$/.test(child)) throw new Error(`模型含有未固定的外部資產，請轉成自含資產的 GLB：${path}`);
      visit(child);
    }
  };
  visit(document);
}
