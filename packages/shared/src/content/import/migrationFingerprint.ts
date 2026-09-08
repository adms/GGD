import { buildCapabilityManifest } from "../editorCapabilities";
import { sha256Bytes } from "../sha256";

/** Same schema/family identity for importer, game runtime, and generated targets. */
export function currentMigrationFingerprint(): string {
  const caps = buildCapabilityManifest();
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(caps.docSurface) + "|" + JSON.stringify(caps.templateFamilies))).slice(0, 12);
}
