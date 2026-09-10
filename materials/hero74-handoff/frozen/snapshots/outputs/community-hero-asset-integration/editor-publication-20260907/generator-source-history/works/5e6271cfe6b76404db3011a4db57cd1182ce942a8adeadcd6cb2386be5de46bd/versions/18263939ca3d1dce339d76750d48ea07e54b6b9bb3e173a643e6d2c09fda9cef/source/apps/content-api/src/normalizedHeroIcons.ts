import { ICON_ENCODE, sniffImageHeader } from "@ggd/shared/content/icons/encodeIcon";
import { encodeIcon } from "@ggd/shared/content/icons/encodeIconNode";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { zEditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import { ZIP_LIMITS } from "@ggd/shared/content/import/zipSafety";

export function verifyNormalizedHeroIcon(path: string, bytes: Uint8Array): void {
  const hash = /^assets\/icons\/community\/([a-f0-9]{64})\.webp$/.exec(path)?.[1];
  const header = sniffImageHeader(bytes);
  if (!hash || bytes.length > ZIP_LIMITS.maxEntryUncompressedBytes || sha256Bytes(bytes) !== hash || header?.mime !== "image/webp" || header.width !== ICON_ENCODE.edge || header.height !== ICON_ENCODE.edge) throw new Error("正規化圖示的路徑、digest 或尺寸不符。");
  // Decode under the same bounded Main encoder; preserve the submitted bytes.
  encodeIcon(bytes);
}

/** Portable normalized icons are verified read-only, before dependency resolution. */
export function normalizedHeroIcons(raw: unknown): Map<string, Uint8Array> {
  const parsed = zEditorImportPackage.safeParse(raw);
  const icons = new Map<string, Uint8Array>();
  if (!parsed.success || parsed.data.manifest.scope !== "community-work") return icons;
  for (const asset of parsed.data.assets) if (asset.path.startsWith("assets/icons/community/")) {
    if (icons.size >= 7 || icons.has(asset.path) || !(asset.bytes instanceof Uint8Array)) throw new Error("正規化圖示集合不合法。");
    verifyNormalizedHeroIcon(asset.path, asset.bytes);
    icons.set(asset.path, asset.bytes);
  }
  return icons;
}
