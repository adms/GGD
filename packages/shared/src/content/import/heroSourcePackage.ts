import { zHeroProject } from "../heroForge/schema";
import type { HeroPackageTarget } from "./heroPackage";
import { zEditorImportPackage, type EditorImportPackage } from "./packageSchema";
import { packageDigest } from "./digest";
import { contentSha256, jcsByteLength } from "./jcs";
import { sha256Bytes } from "../sha256";
import { uploadedHeroModelPath } from "../modelUpload/heroModelSchema";

export interface HeroSourceIcon {
  path: string;
  collection: "champions" | "abilities";
  id: string;
  mime: string;
  bytes: Uint8Array;
}

/** The existing package's source channel, consumed by Main before compilation. */
export function buildHeroSourcePackage(raw: unknown, icons: readonly HeroSourceIcon[], target: HeroPackageTarget, modelBytes?: Uint8Array): EditorImportPackage {
  const project = zHeroProject.parse(raw);
  const model = project.presentation.uploadedModel;
  if (!!model !== !!modelBytes || (model && modelBytes && (model.sha256 !== sha256Bytes(modelBytes) || model.byteSize !== modelBytes.length))) throw new Error("上傳模型來源與英雄固定版本不符。");
  const modelAssets = model && modelBytes ? [{ path: uploadedHeroModelPath(model), bytes: modelBytes }] : [];
  const path = `authoring/hero-projects/${project.projectId}.json`;
  const hash = contentSha256(project);
  const manifest = {
    schema: "ggd-editor-package@1", gameId: "ggd", mode: "bootstrap", scope: "community-work",
    packageDigest: "sha256:" + "0".repeat(64), migrationFingerprint: target.migrationFingerprint,
    base: { gameRevision: target.gameRevision, contentVersion: target.contentVersion, activationDigest: null, authoringDigest: null },
    authoringProcessor: { kind: "runtime-direct", contractVersion: "runtime-direct@1", fingerprint: target.processorFingerprint },
    selectionRoots: [{ kind: "hero", id: project.projectId, contentSha256: hash }],
    changes: [{ kind: "hero", id: project.projectId, path, op: "upsert", before: null, after: { contentSha256: hash }, reason: "selected" }],
    entries: [{ path, role: "authoring", contentSha256: hash, contentSize: jcsByteLength(project) }, ...icons.map(({ bytes, ...icon }) => ({
      ...icon, role: "asset", targetField: "icon", contentSha256: `sha256:${sha256Bytes(bytes)}`, contentSize: bytes.length,
    })), ...modelAssets.map(({ path, bytes }) => ({ path, role: "asset", mime: "model/gltf-binary", contentSha256: `sha256:${sha256Bytes(bytes)}`, contentSize: bytes.length }))],
    requires: [], requiredCapabilities: [], expectedCompiled: [], expectedDerived: [],
    validationPolicy: { representation: "ggd-hero-project@2", references: "exact", activation: "work-scoped" },
    requiredScenarios: [], fidelityDecisions: [], acceptedWarnings: [],
  };
  manifest.packageDigest = packageDigest(manifest);
  return zEditorImportPackage.parse({ schema: "ggd-editor-import@1", manifest, documents: [{ path, document: project }], compiled: [], validation: [], reports: {}, assets: [...icons.map(({ path, bytes }) => ({ path, bytes })), ...modelAssets] });
}
