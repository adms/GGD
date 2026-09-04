import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  packageModeBlockers,
  readTargetProfileFacts,
  rawRuntimeSchemaFor,
  runtimeCollectionForSchema,
} from "./exportPolicy";
import { readEditorContractIndex } from "./editorContractIndex";
import { buildContractIndex } from "@ggd/shared/content/import/contractIndex";
import { ZIP_LIMITS } from "@ggd/shared/content/import/zipSafety";

const contractIndex = readEditorContractIndex(
  buildContractIndex(ZIP_LIMITS as unknown as Record<string, number>),
);

describe("Export Center target-profile policy", () => {
  it("reads both shipped-editor and live-content profile shapes", () => {
    const shipped = readTargetProfileFacts({
      schema: "ggd-editor-target-profile@1",
      supportedModes: ["bootstrap"],
      deltaExportAllowed: false,
      profileDigest: "p1",
      content: { contentVersion: "cv_a" },
      runtimeCapabilities: { fingerprint: "caps" },
      authoringProcessor: {
        kind: "runtime-direct",
        contractVersion: "runtime-direct@1",
        fingerprint: "runtime-direct-fp",
      },
      contract: { compiler: { contractVersion: null, fingerprint: null } },
    });
    expect(shipped).toMatchObject({ contentVersion: "cv_a", supportedModes: ["bootstrap"] });
    expect(packageModeBlockers(shipped, "bootstrap", contractIndex)).not.toContain(
      "目標沒有可 pin 的 runtime-direct authoringProcessor receipt",
    );

    const live = readTargetProfileFacts({
      schema: "ggd-content-target-profile@1",
      implementedStage: "G2",
      supportedModes: ["full", "delta"],
      deltaExportAllowed: true,
      authoringStoreState: "ready",
      base: {
        gameRevision: "rev-b",
        contentVersion: "cv_b",
        activationDigest: "sha256:a",
        authoringDigest: "sha256:b",
      },
      authoringProcessor: {
        kind: "runtime-direct",
        contractVersion: "runtime-direct@1",
        fingerprint: "fp",
      },
      runtimeCapabilities: { fingerprint: "caps2" },
      contractIndex: { digest: contractIndex.digest, href: "/api/v1/content-import/contract-index" },
      authoringModel: { accepts: ["ability@1", "item@1"] },
    });
    expect(live).toMatchObject({
      contractIndexDigest: contractIndex.digest,
      contractIndexHref: "/api/v1/content-import/contract-index",
    });
    expect(packageModeBlockers(live, "delta", contractIndex)).toEqual([]);
  });

  it("never treats G1 or a missing exact base as production-ready", () => {
    const facts = readTargetProfileFacts({
      schema: "ggd-content-target-profile@1",
      implementedStage: "G1",
      supportedModes: ["bootstrap", "delta"],
      deltaExportAllowed: true,
      base: { activationDigest: null, authoringDigest: null },
      authoringProcessor: {
        kind: "runtime-direct",
        contractVersion: "runtime-direct@1",
        fingerprint: "fp",
      },
    });
    expect(packageModeBlockers(facts, "delta", contractIndex)).toEqual(expect.arrayContaining([
      "缺少 base.activationDigest",
      "缺少 base.authoringDigest",
      "目標未宣告 importer G2",
    ]));
  });

  it("only labels the two contract-approved raw runtime schemas", () => {
    expect(rawRuntimeSchemaFor("abilities")).toBe("ability@1");
    expect(rawRuntimeSchemaFor("items")).toBe("item@1");
    expect(runtimeCollectionForSchema("ability@1")).toBe("abilities");
    expect(runtimeCollectionForSchema("item@1")).toBe("items");
    expect(runtimeCollectionForSchema("future@1")).toBeNull();
  });

  it("derives package representations from Main and fails closed on a new unsupported builder", () => {
    const futureContract = {
      ...contractIndex,
      representations: [
        ...contractIndex.representations,
        {
          schema: "future@1",
          packageKind: "runtime-document",
          state: "supported" as const,
          minStage: "G2",
          modes: ["bootstrap", "full", "delta"] as const,
          promotionPolicy: "admin-package-apply" as const,
        },
      ],
    };
    const facts = readTargetProfileFacts({
      schema: "ggd-content-target-profile@1",
      implementedStage: "G2",
      supportedModes: ["full"],
      deltaExportAllowed: false,
      base: {
        gameRevision: "rev",
        contentVersion: "cv",
        activationDigest: "sha256:a",
        authoringDigest: "sha256:b",
      },
      authoringProcessor: {
        kind: "runtime-direct",
        contractVersion: "runtime-direct@1",
        fingerprint: "fp",
      },
      authoringModel: { accepts: ["ability@1", "item@1", "future@1"] },
    });
    expect(packageModeBlockers(facts, "full", futureContract)).toContain(
      "Editor 尚未實作 future@1 的 runtime package builder",
    );
  });

  it("rejects a stale profile summary that disagrees with the verified registry", () => {
    const facts = readTargetProfileFacts({
      schema: "ggd-content-target-profile@1",
      implementedStage: "G2",
      supportedModes: ["full"],
      base: {
        gameRevision: "rev",
        contentVersion: "cv",
        activationDigest: "sha256:a",
        authoringDigest: "sha256:b",
      },
      authoringProcessor: {
        kind: "runtime-direct",
        contractVersion: "runtime-direct@1",
        fingerprint: "fp",
      },
      authoringModel: { accepts: ["ability@1"] },
    });
    expect(packageModeBlockers(facts, "full", contractIndex)).toEqual(expect.arrayContaining([
      expect.stringContaining("target profile 與 contract-index"),
    ]));
  });

  it("keeps every package mode blocked against the actually shipped static profile", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const facts = readTargetProfileFacts(JSON.parse(readFileSync(join(root, "content", "editor-target-profile.json"), "utf8")));
    for (const mode of ["bootstrap", "full", "delta"] as const) {
      expect(packageModeBlockers(facts, mode, null), mode).not.toEqual([]);
    }
    expect(packageModeBlockers(facts, "bootstrap", null)).toEqual(expect.arrayContaining([
      "缺少已驗證的 Main contract-index",
      "缺少 base.gameRevision",
    ]));
  });
});
