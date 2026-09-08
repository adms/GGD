import { resolve } from "node:path";
import { buildAuthoringProcessor } from "../../../packages/shared/src/content/import/authoringProcessor";
import { currentMigrationFingerprint } from "../../../packages/shared/src/content/import/migrationFingerprint";

export function communityRuntimeIdentity(): { gameRevision: string; migrationFingerprint: string; processorFingerprint: string } | null {
  const gameRevision = process.env.GGD_BUILD_STAMP?.trim();
  if (!gameRevision) return null;
  return { gameRevision, migrationFingerprint: currentMigrationFingerprint(), processorFingerprint: buildAuthoringProcessor(resolve(import.meta.dirname, "../../..")).fingerprint };
}
