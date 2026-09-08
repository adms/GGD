import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contentVersion } from "@ggd/shared/content";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { zAuthoringKind, zEditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import { bandFor, DEFAULT_STAT_NORMALIZATION } from "@ggd/shared/content/statNormalization";
import {
  binarySha256,
  buildRuntimePackage,
  buildRuntimePackageZip,
  resolveDeltaRuntimeClosure,
  runtimeBaseSnapshotFromBundle,
  runtimeDocumentsFromBaseBundle,
  runtimeReferenceKeys,
  vfxScriptReferenceKeys,
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

const abilityAt = (id: string, damage: number) => ({
  ...ability(damage),
  id,
  document: { ...ability(damage).document, id },
});

/**
 * ⭐ GH#1024 —— 一隻**投稿英雄**：十一屬性是「出身模板 ref ＋ 逐格覆寫」，
 * ⛔ 不是十一個算好的數字（第〇·四守則）。Q 走鑄技工坊模板卡。
 */
const CHAMPION_ID = "hero.probe";
const champion = () => ({
  collection: "champions" as const,
  id: CHAMPION_ID,
  document: {
    schema: "champion@1",
    id: CHAMPION_ID,
    name: "投稿英雄",
    origin: "坦克",
    // ⭐ 坦克出身在 `byOrigin.armor` 是「極大」⇒ 這一格刻意覆寫成相反的一端，
    //   否則「覆寫有沒有生效」與「它只是剛好等於模板」量起來一模一樣。
    statOverrides: { armor: "極小" },
    role: "fighter",
    icon: "assets/icons/champions/hero.probe.webp",
    modelKey: "model.probe",
    buildPriority: [],
    abilities: {
      Q: { id: "hero.probe.q", effects: [], template: { ref: "tpl-ground-nova", params: {} } },
      W: { id: "hero.probe.w", effects: [], vfxKey: "fx.probe.ribbon" },
      E: { id: "hero.probe.e", effects: [] },
      R: { id: "hero.probe.r", effects: [] },
    },
  } as Record<string, unknown>,
});
const championAbilities = ["q", "w", "e", "r"].map((slot) => abilityAt(`hero.probe.${slot}`, 40));
const ribbon = {
  collection: "vfx" as const,
  id: "fx.probe.ribbon",
  document: {
    schema: "ribbon@1",
    id: "fx.probe.ribbon",
    lifetimeMs: 400,
    width: 0.2,
    color: "#ffffff",
  } as Record<string, unknown>,
};

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

  it("packages original icon bytes in the Main-owned asset path and supports an asset-only delta", async () => {
    const sourceBytes = new Uint8Array([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32]);
    const sourcePath = "assets/icon/abilities/test.q/source.webp";
    const outputPath = "assets/icons/abilities/test.q.webp";
    const digest = await binarySha256(sourceBytes);
    const root = ability(100);
    (root.document as Record<string, unknown>).icon = outputPath;
    const base = structuredClone(root);
    const built = buildRuntimePackage({
      mode: "delta",
      target,
      documents: [],
      selectionRoots: [root],
      baseDocuments: [base],
      assets: [{
        path: sourcePath,
        collection: "abilities",
        id: "test.q",
        mime: "image/webp",
        targetField: "icon",
        contentSha256: digest,
        contentSize: sourceBytes.length,
        bytes: sourceBytes,
        baseSha256: null,
      }],
    });
    expect(built.package.manifest.changes).toEqual([]);
    expect(built.package.manifest.entries).toContainEqual(expect.objectContaining({
      path: sourcePath,
      role: "asset",
      contentSha256: digest,
      baseSha256: null,
    }));
    expect(built.binaryEntries.get(sourcePath)).toEqual(sourceBytes);
    const first = await buildRuntimePackageZip(built);
    const second = await buildRuntimePackageZip(built);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.archiveSha256).toBe(second.archiveSha256);
    expect(new TextDecoder().decode(first.bytes)).toContain(sourcePath);
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
    // ⭐ GH#1024 B1 —— exact base 現在**含英雄與特效**（出貨 bundle，⛔ 不是夾具）。
    //   ⛔ 少了它們，`full` 的 membership 與 base 對不起來，而 `delta` 選一隻英雄當 root
    //   時 base 那一半是空的 ⇒ 每一次匯出都會被誤判成「新增一隻英雄」。
    // ⛔ 這四個名字是**逐字寫死**的，⛔ 不是 `for (…of RUNTIME_AUTHORING_COLLECTIONS)`：
    //   照清單跑的迴圈會跟著清單一起縮小 ⇒ 把 champions 拿掉時它仍然全綠
    //   （CLAUDE.md 綠燈假來源⑫：只從「宣告」那一頭走的掃描結構上失明）。
    for (const collection of ["champions", "abilities", "items", "vfx"]) {
      expect(snapshot.runtimeDocuments.some((doc) => doc.collection === collection), collection).toBe(true);
    }
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

/**
 * ⭐⭐ GH#1024 PR-2 —— 「投稿包裝得起一個英雄」的承重守衛。
 *
 * ⚠️ 拆成兩段是**量出來的**，⛔ 不是為了好看：
 *   · Editor 這一側（閉包／entries／模板 ref 保真）**今天就全部走得通**；
 *   · Main 的 `zAuthoringKind`（packageSchema.ts:160）今天**還沒有 `champion`**
 *     ⇒ 最後那一步組 manifest 過不去。⭐ 兩個 `skipIf` 保證**任何一天**都有一條在跑：
 *     詞彙補上 ⇒ 跑完整驗收；還沒補 ⇒ 跑「擋住的是哪一行」。
 *     ⛔ 不可以合成一條 `try/catch`——那種寫法兩邊都綠，等於沒有守衛。
 */
const CHAMPION_KIND_ACCEPTED = (zAuthoringKind.options as readonly string[]).includes("champion");

describe("champion 投稿包（GH#1024 B1／B2）", () => {
  const championPackageInput = () => ({
    mode: "bootstrap" as const,
    target,
    documents: [champion(), ...championAbilities, ribbon],
  });

  it("英雄卡進包時仍是「出身模板 ref ＋ 逐格覆寫」——⛔ 沒有第二個住處", () => {
    const closure = resolveDeltaRuntimeClosure(
      [champion(), ...championAbilities, ribbon],
      [{ ...champion(), document: { ...champion().document, name: "舊名" } }, ...championAbilities, ribbon],
      [{ collection: "champions", id: CHAMPION_ID }],
    );
    const packaged = closure.selectionRoots[0]!.document;
    // ⛔ 匯出**不可以**把 `resolveChampionStats` 之後的數字寫回文件（第〇·四守則）。
    expect(packaged).toEqual(champion().document);
    expect(packaged.statOverrides).toEqual({ armor: "極小" });

    // ⭐ 兩個方向：模板那一格跟著 `byOrigin` 走、覆寫那一格不跟。
    const tweaked = {
      ...DEFAULT_STAT_NORMALIZATION,
      byOrigin: {
        ...DEFAULT_STAT_NORMALIZATION.byOrigin,
        ms: { ...DEFAULT_STAT_NORMALIZATION.byOrigin.ms, 坦克: "極大" as const },
        armor: { ...DEFAULT_STAT_NORMALIZATION.byOrigin.armor, 坦克: "極小" as const },
      },
    };
    expect(bandFor(packaged, DEFAULT_STAT_NORMALIZATION, "ms")).toBe("小");
    expect(bandFor(packaged, tweaked, "ms")).toBe("極大");
    expect(bandFor(packaged, DEFAULT_STAT_NORMALIZATION, "armor")).toBe("極小");
    expect(bandFor(packaged, tweaked, "armor")).toBe("極小");
  });

  it("閉包把英雄拉到它的四支技能，並把模板卡與 vfx-script 釘成 exact requires", () => {
    const closure = resolveDeltaRuntimeClosure(
      [champion(), ...championAbilities, ribbon],
      [champion(), ...championAbilities.map((doc) => abilityAt(doc.id, 1)), ribbon],
      [{ collection: "champions", id: CHAMPION_ID }],
    );
    expect(closure.documents.map((doc) => `${doc.collection}/${doc.id}`)).toEqual(
      championAbilities.map((doc) => `abilities/${doc.id}`).sort(),
    );
    // ⭐ 模板卡從**英雄卡上內嵌的 Q** 抽出來（技能那一份是空殼）；
    //   `models/` 不是可投稿集合 ⇒ 它以 requires 的身分被釘住，⛔ 不進包。
    expect(runtimeReferenceKeys([champion()])).toEqual(expect.arrayContaining([
      { collection: "ability-templates", id: "tpl-ground-nova" },
      { collection: "models", id: "model.probe" },
      { collection: "vfx", id: "fx.probe.ribbon" },
    ]));
    // ⭐ `vfx-script@1` 的邊是反向的（腳本身上才有 abilityId）——
    //   ⛔ 沒有這一支，一支做過特效演出的技能包出去會少掉它的時間軸。
    expect(vfxScriptReferenceKeys(championAbilities, [
      { id: "hero.probe.q", abilityId: "hero.probe.q" },
      { id: "someone.else", abilityId: "other.q" },
    ])).toEqual([{ collection: "vfx-scripts", id: "hero.probe.q" }]);
  });

  it("ability／item 以外的集合真的包得出去（ribbon@1 走完整包自我驗證）", async () => {
    const built = buildRuntimePackage({ mode: "bootstrap", target, documents: [ability(100), ribbon] });
    expect(zEditorImportPackage.safeParse(built.package).success).toBe(true);
    expect(built.package.manifest.entries).toContainEqual(expect.objectContaining({
      path: "authoring/vfx/fx.probe.ribbon.json",
      collection: "vfx",
      schema: "ribbon@1",
    }));
    expect(built.package.manifest.changes.map((change) => change.kind).sort()).toEqual(["ability", "vfx"]);
    expect(new TextDecoder().decode((await buildRuntimePackageZip(built)).bytes))
      .toContain("authoring/vfx/fx.probe.ribbon.json");
  });

  it.skipIf(!CHAMPION_KIND_ACCEPTED)("匯出一隻英雄 ⇒ 包裡有 champion@1 ＋ 它的 abilities ＋ vfx ＋ icon，整包過 zEditorImportPackage", () => {
    const iconBytes = new Uint8Array([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32]);
    const built = buildRuntimePackage({
      ...championPackageInput(),
      assets: [{
        path: "assets/icon/champions/hero.probe/source.webp",
        collection: "champions",
        id: CHAMPION_ID,
        mime: "image/webp",
        targetField: "icon",
        contentSha256: `sha256:${"c".repeat(64)}`,
        contentSize: iconBytes.length,
        bytes: iconBytes,
      }],
    });
    expect(zEditorImportPackage.safeParse(built.package).success).toBe(true);
    expect(built.package.documents.map((row) => row.path)).toContain(`authoring/champions/${CHAMPION_ID}.json`);
    expect(built.package.manifest.changes.map((change) => change.kind)).toContain("champion");
    expect(built.package.manifest.entries).toContainEqual(expect.objectContaining({
      path: "assets/icon/champions/hero.probe/source.webp",
      role: "asset",
      collection: "champions",
    }));
  });

  it.skipIf(CHAMPION_KIND_ACCEPTED)("擋住的只剩 Main 的一格詞彙，而錯誤訊息指名那一行", () => {
    expect(() => buildRuntimePackage(championPackageInput()))
      .toThrow(/PACKAGE_KIND_NOT_IN_CONTRACT[\s\S]*zAuthoringKind[\s\S]*champion/);
    // ⛔ 不是「英雄文件壞了」：同一份文件在 Editor 這一側每一段都過得去。
    expect(runtimeReferenceKeys([champion()]).length).toBeGreaterThan(0);
  });
});
