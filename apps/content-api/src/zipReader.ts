import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { extractEntry as extractSharedEntry, type CentralEntry } from "@ggd/shared/content/import/zipReader";
export { ZipFormatError, readCentralDirectory } from "@ggd/shared/content/import/zipReader";
export type { CentralEntry, CentralDirectory } from "@ggd/shared/content/import/zipReader";

/** Main adds bounded DEFLATE decoding to the shared archive reader. */
export function extractEntry(bytes: Buffer, entry: CentralEntry): Buffer {
  return Buffer.from(extractSharedEntry(bytes, entry, (raw, maxBytes) => inflateRawSync(raw, { maxOutputLength: Math.max(1, maxBytes) })));
}
export function archiveSha256(bytes: Buffer): string { return "sha256:" + createHash("sha256").update(bytes).digest("hex"); }
