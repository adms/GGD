import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      authoringProcessor: {
        kind: "runtime-direct",
        contractVersion: "runtime-direct@1",
        fingerprint: "runtime-direct-fp",
      },
      contract: { compiler: { contractVersion: null, fingerprint: null } },
    });
    expect(shipped).toMatchObject({ contentVersion: "cv_a", supportedModes: ["bootstrap"] });
    expect(packageModeBlockers(shipped, "bootstrap")).not.toContain(
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
      authoringModel: { accepts: ["ability@1", "item@1"] },
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
      authoringProcessor: {
        kind: "runtime-direct",
        contractVersion: "runtime-direct@1",
        fingerprint: "fp",
      },
    });
    expect(packageModeBlockers(facts, "delta")).toEqual(expect.arrayContaining([
      "缺少 base.activationDigest",
      "缺少 base.authoringDigest",
      "目標未宣告 importer G2",
    ]));
  });

  it("only labels the two contract-approved raw runtime schemas", () => {
    expect(rawRuntimeSchemaFor("abilities")).toBe("ability@1");
    expect(rawRuntimeSchemaFor("items")).toBe("item@1");
  });

  it("keeps every package mode blocked against the actually shipped static profile", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const facts = readTargetProfileFacts(JSON.parse(readFileSync(join(root, "content", "editor-target-profile.json"), "utf8")));
    for (const mode of ["bootstrap", "full", "delta"] as const) {
      expect(packageModeBlockers(facts, mode), mode).not.toEqual([]);
    }
    expect(packageModeBlockers(facts, "bootstrap")).toEqual(expect.arrayContaining([
      "目標未宣告 importer G2",
      "缺少 base.gameRevision",
    ]));
  });
});
