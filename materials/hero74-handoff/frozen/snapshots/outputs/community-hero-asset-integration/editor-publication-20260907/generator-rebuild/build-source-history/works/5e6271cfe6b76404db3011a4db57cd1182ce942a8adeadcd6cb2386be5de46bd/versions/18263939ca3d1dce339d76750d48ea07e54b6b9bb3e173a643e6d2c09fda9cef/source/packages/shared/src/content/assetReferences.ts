/** The asset manifest and immutable work snapshots use the same collector. */
export const BINARY_ASSET_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".png": "image/png",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".ktx2": "image/ktx2", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".bin": "application/octet-stream",
});

export function assetMediaType(path: string): string | undefined {
  return BINARY_ASSET_TYPES[path.slice(path.lastIndexOf(".")).toLowerCase()];
}

export function referencedAssetPaths(document: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(document)) for (const value of document) referencedAssetPaths(value, out);
  else if (document && typeof document === "object") for (const value of Object.values(document)) referencedAssetPaths(value, out);
  else if (typeof document === "string" && document.startsWith("assets/") && assetMediaType(document)) out.add(document);
  return out;
}
