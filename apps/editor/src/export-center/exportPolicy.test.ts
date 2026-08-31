import { describe, expect, it } from "vitest";
import { packageModeBlockers, readTargetProfileFacts, rawRuntimeSchemaFor } from "./exportPolicy";

describe("Export Center target-profile policy", () => {
  it("reads both shipped-editor and live-content profile shapes", () => {
    const shipped = readTargetProfileFacts({
      schema: "ggd-editor-target-profile@1",
      supportedModes: ["bootstrap"],
      deltaExportAllowed: false,
      profileDigest: "p1",
      content: { contentVersion: "cv_a" },
      runtimeCapabilities: { fingerprint: "caps" },
      contract: { compiler: { contractVersion: null, fingerprint: null } },
    });
    expect(shipped).toMatchObject({ contentVersion: "cv_a", supportedModes: ["bootstrap"] });
    expect(packageModeBlockers(shipped, "bootstrap")).toContain(
      "目標沒有可 pin 的 compiler contractVersion／fingerprint",
    );

    const live = readTargetProfileFacts({
      schema: "ggd-content-target-profile@1",
      implementedStage: "G2",
      supportedModes: ["full", "delta"],
      deltaExportAllowed: true,
      authoringStoreState: "ready",
      base: {
        contentVersion: "cv_b",
        activationDigest: "sha256:a",
        authoringDigest: "sha256:b",
      },
      compiler: { contractVersion: "v1", fingerprint: "fp" },
      runtimeCapabilities: { fingerprint: "caps2" },
    });
    expect(packageModeBlockers(live, "delta")).toEqual([]);
  });

  it("never treats G1 or a missing exact base as production-ready", () => {
    const facts = readTargetProfileFacts({
      schema: "ggd-content-target-profile@1",
      implementedStage: "G1",
      supportedModes: ["bootstrap", "delta"],
      deltaExportAllowed: true,
      base: { activationDigest: null, authoringDigest: null },
      compiler: { contractVersion: "v1", fingerprint: "fp" },
    });
    expect(packageModeBlockers(facts, "delta")).toEqual(expect.arrayContaining([
      "缺少 base.activationDigest",
      "缺少 base.authoringDigest",
      "目標 importer 仍在 G1，validate／apply／rollback 尚未落地",
    ]));
  });

  it("only labels the two contract-approved raw runtime schemas", () => {
    expect(rawRuntimeSchemaFor("abilities")).toBe("ability@1");
    expect(rawRuntimeSchemaFor("items")).toBe("item@1");
  });
});
