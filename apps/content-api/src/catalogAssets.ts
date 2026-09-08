import { sha256Bytes } from "@ggd/shared/content/sha256";
import type { ImportStore } from "./importStore";

export const CATALOG_INSTANCE_WORK_ID = "ggd-existing-hero-instances";

/** Only server-prepared immutable instances can supply assets absent from the
 * shipped tree. Reuse the existing object store and verify the path digest. */
export function readCatalogInstanceAsset(store: ImportStore, path: string): Uint8Array | null {
  const match = /^assets\/hero-instances\/([a-f0-9]{64})\.[a-z0-9]+$/.exec(path);
  if (!match) return null;
  for (const version of store.listWorkVersions(CATALOG_INSTANCE_WORK_ID)) {
    if (!version.files.some(x=>x.path===path)) continue;
    const bytes=store.readWorkFile(CATALOG_INSTANCE_WORK_ID,version.versionId,path);
    if (!bytes || sha256Bytes(bytes)!==match[1]) throw Object.assign(new Error("已保存的英雄素材損壞。"),{statusCode:503});
    return bytes;
  }
  return null;
}
