import { describe, expect, it } from "vitest";
import { buildRuntimePackage } from "./exportBuilder";
import type { TargetProfileFacts } from "./exportPolicy";
const target = {
  schema: "ggd-content-target-profile@1", contentVersion: "cv_base", capabilityFingerprint: "caps",
  profileDigest: "p", contractIndexDigest: "c", contractIndexHref: "/x", implementedStage: "G2",
  authoringStoreState: "ready", supportedModes: ["bootstrap"], deltaExportAllowed: true,
  authoringProcessorKind: "runtime-direct", authoringProcessorContractVersion: "runtime-direct@1",
  authoringProcessorFingerprint: "fp", compilerContractVersion: null, compilerFingerprint: null,
  activationDigest: null, authoringDigest: null, gameRevision: "rev-1", migrationFingerprint: "m",
  authoringAccepts: [], authoringNotRequired: [], unavailable: [],
} as unknown as TargetProfileFacts;
describe("probe", () => {
  it("champion package zod issues", () => {
    try {
      buildRuntimePackage({ mode: "bootstrap", target, documents: [
        { collection: "champions", id: "hero.probe", document: { schema: "champion@1", id: "hero.probe", name: "X", origin: "坦克", statOverrides: { armor: "極小" }, modelKey: "m", buildPriority: [], abilities: { Q: { id: "a.q", effects: [] }, W: { id: "a.q", effects: [] }, E: { id: "a.q", effects: [] }, R: { id: "a.q", effects: [] } } } },
        { collection: "abilities", id: "a.q", document: { schema: "ability@1", id: "a.q", name: "A", slot: "Q", maxRank: 1, castType: "target", cooldownSec: [1], manaCost: [1], effects: [] } },
        { collection: "vfx", id: "fx.r", document: { schema: "ribbon@1", id: "fx.r" } },
      ] });
      console.log("PROBE: BUILT OK");
    } catch (error) { console.log("PROBE ERROR:", String(error)); }
    expect(true).toBe(true);
  });
});
