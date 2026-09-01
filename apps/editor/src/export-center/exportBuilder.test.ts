import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { zEditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import { hashCollection, hashDoc } from "@ggd/shared/content";
import { buildRuntimePackage, buildRuntimePackageZip, runtimeDocumentsFromBaseBundle, runtimeReferenceKeys } from "./exportBuilder";
import type { TargetProfileFacts } from "./exportPolicy";

const target: TargetProfileFacts = {
  schema: "ggd-content-target-profile@1",
  contentVersion: "cv_base",
  capabilityFingerprint: "caps",
  profileDigest: "profile",
  implementedStage: "G2",
  authoringStoreState: "ready",
  supportedModes: ["bootstrap", "full", "delta"],
  deltaExportAllowed: true,
  compilerContractVersion: "runtime-direct@1",
  compilerFingerprint: "runtime-direct-fp",
  activationDigest: "sha256:" + "a".repeat(64),
  authoringDigest: "sha256:" + "b".repeat(64),
  gameRevision: "rev-1",
  migrationFingerprint: "migration-1",
  authoringAccepts: ["ability@1", "item@1"],
  authoringNotRequired: ["expectedCompiled"],
  unavailable: [],
};

const ability = (damage: number) => ({
  collection: "abilities" as const,
  id: "test.q",
  document: {
    schema: "ability@1",
    id: "test.q",
    name: "Test",
    slot: "Q",
    maxRank: 4,
    castType: "target",
    cooldownSec: [1, 1, 1, 1],
    manaCost: [1, 1, 1, 1],
    effects: [{ kind: "damage", amount: { flat: [damage, damage, damage, damage] }, damageType: "magic" }],
  },
});

describe("runtime package builder", () => {
  it("builds a self-validating deterministic bootstrap JSON and byte-identical ZIP", async () => {
    const built = buildRuntimePackage({ mode: "bootstrap", target, documents: [ability(100)] });
    expect(zEditorImportPackage.safeParse(built.package).success).toBe(true);
    expect(packageDigest(built.package.manifest)).toBe(built.package.manifest.packageDigest);
    const first = await buildRuntimePackageZip(built);
    const second = await buildRuntimePackageZip(built);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.archiveSha256).toBe(second.archiveSha256);
    expect(new TextDecoder().decode(first.bytes.slice(0, 4))).toBe("PK\u0003\u0004");
    expect(new DataView(first.bytes.buffer, first.bytes.byteOffset, 4).getUint32(0, true)).toBe(0x04034b50);
  });

  it("builds delta only against an exact base and refuses no-op or implicit full delete", () => {
    const delta = buildRuntimePackage({ mode: "delta", target, documents: [ability(200)], baseDocuments: [ability(100)] });
    expect(delta.package.manifest.changes).toHaveLength(1);
    expect(delta.package.manifest.changes[0]?.before?.contentSha256).toMatch(/^sha256:/);
    expect(() => buildRuntimePackage({ mode: "delta", target, documents: [ability(100)], baseDocuments: [ability(100)] })).toThrow(/沒有可匯出的變更/);
    expect(() => buildRuntimePackage({ mode: "full", target, documents: [ability(200)], baseDocuments: [...[ability(100)], {
      collection: "items" as const,
      id: "missing",
      document: { schema: "item@1", id: "missing", name: "M", cost: 1, tier: 1, modifiers: [], tags: [] },
    }] })).toThrow(/IMPLICIT_DELETE_FORBIDDEN/);
  });

  it("extracts exact external reference keys without duplicating packaged roots", () => {
    const doc = ability(100);
    (doc.document as Record<string, unknown>).augment = { targets: [{ abilityId: "other.q", patches: [] }] };
    expect(runtimeReferenceKeys([doc])).toEqual([{ collection: "abilities", id: "other.q" }]);
  });

  it("accepts only hash-verified exact base runtime bundles", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const abilityDoc = JSON.parse(readFileSync(join(root, "content", "abilities", "godie-e001.q.json"), "utf8"));
    const abilityEntry = { id: abilityDoc.id, hash: hashDoc(abilityDoc), doc: abilityDoc };
    const item = JSON.parse(readFileSync(join(root, "content", "items", "godie-i000.json"), "utf8"));
    const itemEntry = { id: item.id, hash: hashDoc(item), doc: item };
    const bundle = {
      schema: "content-bundle@1",
      contentVersion: target.contentVersion,
      collections: {
        abilities: { hash: hashCollection([abilityEntry]), entries: [abilityEntry] },
        items: { hash: hashCollection([itemEntry]), entries: [itemEntry] },
      },
    };
    expect(runtimeDocumentsFromBaseBundle(bundle, target.contentVersion!)).toHaveLength(2);
    item.cost = 2;
    expect(() => runtimeDocumentsFromBaseBundle(bundle, target.contentVersion!)).toThrow(/hash 不一致/);
  });
});
