import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentVersion } from "@ggd/shared/content";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { zEditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import {
  buildRuntimePackage,
  buildRuntimePackageZip,
  resolveDeltaRuntimeClosure,
  runtimeBaseSnapshotFromBundle,
  runtimeDocumentsFromBaseBundle,
  runtimeReferenceKeys,
} from "./exportBuilder";
import type { TargetProfileFacts } from "./exportPolicy";

const target: TargetProfileFacts = {
  schema: "ggd-content-target-profile@1",
  contentVersion: "cv_base",
  capabilityFingerprint: "caps",
  profileDigest: "profile",
  contractIndexDigest: "contract",
  contractIndexHref: "/api/v1/content-import/contract-index",
  implementedStage: "G2",
  authoringStoreState: "ready",
  supportedModes: ["bootstrap", "full", "delta"],
  deltaExportAllowed: true,
  authoringProcessorKind: "runtime-direct",
  authoringProcessorContractVersion: "runtime-direct@1",
  authoringProcessorFingerprint: "runtime-direct-fp",
  compilerContractVersion: null,
  compilerFingerprint: null,
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
    expect(built.package.manifest.authoringProcessor).toEqual({
      kind: "runtime-direct",
      contractVersion: "runtime-direct@1",
      fingerprint: "runtime-direct-fp",
    });
    expect(built.package.manifest.compiler).toBeUndefined();
    expect(packageDigest(built.package.manifest)).toBe(built.package.manifest.packageDigest);
    const first = await buildRuntimePackageZip(built);
    const second = await buildRuntimePackageZip(built);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.archiveSha256).toBe(second.archiveSha256);
    expect(new TextDecoder().decode(first.bytes.slice(0, 4))).toBe("PK\u0003\u0004");
    expect(new DataView(first.bytes.buffer, first.bytes.byteOffset, 4).getUint32(0, true)).toBe(0x04034b50);
  });

  it("builds delta only against an exact base and refuses no-op or implicit full delete", () => {
    const delta = buildRuntimePackage({
      mode: "delta",
      target,
      documents: [ability(200)],
      selectionRoots: [ability(200)],
      baseDocuments: [ability(100)],
    });
    expect(delta.package.manifest.changes).toHaveLength(1);
    expect(delta.package.manifest.selectionRoots).toHaveLength(1);
    expect(delta.package.manifest.changes[0]?.reason).toBe("selected");
    expect(delta.package.manifest.changes[0]?.before?.contentSha256).toMatch(/^sha256:/);
    expect(() => buildRuntimePackage({
      mode: "delta",
      target,
      documents: [ability(100)],
      selectionRoots: [ability(100)],
      baseDocuments: [ability(100)],
    })).toThrow(/沒有可匯出的變更/);
    expect(() => buildRuntimePackage({ mode: "delta", target, documents: [ability(200)], baseDocuments: [ability(100)] })).toThrow(/selectionRoots/);
    expect(() => buildRuntimePackage({
      mode: "delta",
      target,
      documents: [],
      selectionRoots: [ability(200)],
      baseDocuments: [ability(100)],
    })).toThrow(/至少要有一份/);
    expect(() => buildRuntimePackage({
      mode: "delta",
      target,
      documents: [ability(200)],
      selectionRoots: [ability(300)],
      baseDocuments: [ability(100)],
    })).toThrow(/內容不一致/);
    const dep = { ...ability(50), id: "dep.q", document: { ...ability(50).document, id: "dep.q" } };
    expect(() => buildRuntimePackage({
      mode: "delta",
      target,
      documents: [dep],
      selectionRoots: [ability(200)],
      baseDocuments: [ability(100), { ...ability(40), id: "dep.q", document: { ...ability(40).document, id: "dep.q" } }],
    })).toThrow(/已變更卻未列入 changes/);
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

  it("pins every template card shape, not only the legacy single-card ref", () => {
    const doc = ability(100);
    (doc.document as Record<string, unknown>).template = {
      cards: [
        { ref: "tpl-ground-nova", params: {} },
        { ref: "tpl-buff-self", params: {} },
      ],
      onConflict: "reject",
    };
    expect(runtimeReferenceKeys([doc])).toEqual([
      { collection: "ability-templates", id: "tpl-buff-self" },
      { collection: "ability-templates", id: "tpl-ground-nova" },
    ]);
  });

  it("delta closure adds only changed reachable dependencies and keeps roots distinct", () => {
    const rootBase = ability(100);
    const rootCurrent = ability(100);
    (rootBase.document as Record<string, unknown>).augment = { targets: [{ abilityId: "dep.q", patches: [] }] };
    (rootCurrent.document as Record<string, unknown>).augment = { targets: [{ abilityId: "dep.q", patches: [] }] };
    const depBase = { ...ability(20), id: "dep.q", document: { ...ability(20).document, id: "dep.q" } };
    const depCurrent = { ...ability(30), id: "dep.q", document: { ...ability(30).document, id: "dep.q" } };
    const unrelatedBase = { ...ability(40), id: "other.q", document: { ...ability(40).document, id: "other.q" } };
    const unrelatedCurrent = {
      ...ability(50),
      id: "other.q",
      // Deliberately invalid: an unselected draft must not poison this delta.
      document: { ...ability(50).document, id: "other.q", schema: "broken@1" },
    };

    const closure = resolveDeltaRuntimeClosure(
      [rootCurrent, depCurrent, unrelatedCurrent],
      [rootBase, depBase, unrelatedBase],
      [{ collection: "abilities", id: "test.q" }],
    );
    expect(closure.selectionRoots.map((doc) => doc.id)).toEqual(["test.q"]);
    expect(closure.documents.map((doc) => doc.id)).toEqual(["dep.q"]);
    expect(closure.addedDependencies.map((doc) => doc.id)).toEqual(["dep.q"]);

    const built = buildRuntimePackage({
      mode: "delta",
      target,
      documents: closure.documents,
      selectionRoots: closure.selectionRoots,
      baseDocuments: [rootBase, depBase, unrelatedBase],
    });
    expect(built.package.manifest.selectionRoots.map((root) => root.id)).toEqual(["test.q"]);
    expect(built.package.manifest.changes.map((change) => [change.id, change.reason])).toEqual([
      ["dep.q", "required-dependency"],
    ]);
  });

  it("traverses through an unchanged intermediary to find a changed nested dependency", () => {
    const rootBase = ability(10);
    const rootCurrent = ability(10);
    const middleBase = { ...ability(20), id: "middle.q", document: { ...ability(20).document, id: "middle.q" } };
    const middleCurrent = { ...ability(20), id: "middle.q", document: { ...ability(20).document, id: "middle.q" } };
    const leafBase = { ...ability(30), id: "leaf.q", document: { ...ability(30).document, id: "leaf.q" } };
    const leafCurrent = { ...ability(31), id: "leaf.q", document: { ...ability(31).document, id: "leaf.q" } };
    (rootBase.document as Record<string, unknown>).augment = { targets: [{ abilityId: "middle.q", patches: [] }] };
    (rootCurrent.document as Record<string, unknown>).augment = { targets: [{ abilityId: "middle.q", patches: [] }] };
    (middleBase.document as Record<string, unknown>).augment = { targets: [{ abilityId: "leaf.q", patches: [] }] };
    (middleCurrent.document as Record<string, unknown>).augment = { targets: [{ abilityId: "leaf.q", patches: [] }] };

    const closure = resolveDeltaRuntimeClosure(
      [rootCurrent, middleCurrent, leafCurrent],
      [rootBase, middleBase, leafBase],
      [{ collection: "abilities", id: "test.q" }],
    );
    expect(closure.documents.map((doc) => doc.id)).toEqual(["leaf.q"]);
    expect(closure.addedDependencies.map((doc) => doc.id)).toEqual(["leaf.q"]);
  });

  it("accepts only hash-verified exact base runtime bundles", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const bundle = JSON.parse(readFileSync(join(root, "content", "bundle.json"), "utf8"));
    bundle.schema = "ggd-content-runtime-bundle@1";
    bundle.activationDigest = "sha256:" + "a".repeat(64);
    bundle.packageDigest = "sha256:" + "b".repeat(64);
    for (const group of Object.values(bundle.collections) as { entries: unknown[]; count?: number }[]) {
      group.count = group.entries.length;
    }
    bundle.contentVersion = contentVersion(Object.fromEntries(
      Object.entries(bundle.collections).map(([name, group]) => [name, (group as { hash: string }).hash]),
    ));
    const snapshot = runtimeBaseSnapshotFromBundle(bundle, bundle.contentVersion, bundle.activationDigest);
    expect(snapshot.runtimeDocuments.length).toBeGreaterThan(2);
    expect(snapshot.documents.some((doc) => doc.collection === "ability-templates")).toBe(true);
    expect(snapshot.packageDigest).toBe(bundle.packageDigest);
    expect(runtimeDocumentsFromBaseBundle(bundle, bundle.contentVersion, bundle.activationDigest)).toHaveLength(snapshot.runtimeDocuments.length);
    bundle.collections["ability-templates"].entries[0].doc.name += " tampered";
    expect(() => runtimeDocumentsFromBaseBundle(bundle, bundle.contentVersion, bundle.activationDigest)).toThrow(/hash 不一致/);
  });

  it("rejects legacy, count, activation, and recomputed contentVersion drift", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const source = JSON.parse(readFileSync(join(root, "content", "bundle.json"), "utf8"));
    const bundle = {
      ...source,
      schema: "ggd-content-runtime-bundle@1",
      activationDigest: "sha256:" + "a".repeat(64),
      packageDigest: "sha256:" + "b".repeat(64),
      collections: Object.fromEntries(Object.entries(source.collections).map(([name, group]) => [name, {
        ...(group as Record<string, unknown>),
        count: (group as { entries: unknown[] }).entries.length,
      }])),
    };
    bundle.contentVersion = contentVersion(Object.fromEntries(
      Object.entries(bundle.collections).map(([name, group]) => [name, (group as { hash: string }).hash]),
    ));
    expect(() => runtimeBaseSnapshotFromBundle({ ...bundle, schema: "content-bundle@1" }, bundle.contentVersion))
      .toThrow(/ggd-content-runtime-bundle@1/);
    expect(() => runtimeBaseSnapshotFromBundle(bundle, bundle.contentVersion, "sha256:" + "c".repeat(64)))
      .toThrow(/activationDigest/);
    const badCount = structuredClone(bundle);
    badCount.collections.abilities.count += 1;
    expect(() => runtimeBaseSnapshotFromBundle(badCount, bundle.contentVersion, bundle.activationDigest))
      .toThrow(/count/);
    const badVersion = structuredClone(bundle);
    badVersion.collections.abilities.hash = "0".repeat(12);
    expect(() => runtimeBaseSnapshotFromBundle(badVersion, bundle.contentVersion, bundle.activationDigest))
      .toThrow(/collection hash/);
    const badContentVersion = structuredClone(bundle);
    badContentVersion.contentVersion = "cv_000000000000";
    expect(() => runtimeBaseSnapshotFromBundle(badContentVersion, badContentVersion.contentVersion, bundle.activationDigest))
      .toThrow(/contentVersion 重算不一致/);
  });
});
