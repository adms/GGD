import { describe, expect, it } from "vitest";
import {
  modesFor,
  promotionPolicyFor,
  readEditorContractIndex,
} from "./editorContractIndex";

const fixture = {
  schema: "ggd-editor-contract-index@1",
  digest: "f0fa79b088ba",
  representations: [
    { representation: "ability@1", packageKind: "runtime-document", state: "supported", minStage: "G2", modes: ["bootstrap", "full", "delta"], promotionPolicy: "admin-package-apply" },
    { representation: "item@1", packageKind: "runtime-document", state: "supported", minStage: "G2", modes: ["bootstrap", "full", "delta"], promotionPolicy: "admin-package-apply" },
    { representation: "vfx-script@1", packageKind: "vfx-script", state: "planned", minStage: "G5", modes: [], promotionPolicy: "review-required" },
    { representation: "template@1", packageKind: "effect-template", state: "planned", minStage: null, modes: [], promotionPolicy: "review-required" },
    { representation: "editor-capability-fixture", packageKind: "capability-fixture", state: "supported", minStage: "G2", modes: [], promotionPolicy: "forbidden" },
  ],
};

describe("Main editor contract index", () => {
  it("pins the profile digest and reads the shipped five representation rows", () => {
    const index = readEditorContractIndex(fixture, fixture.digest);
    expect(modesFor(index, "ability@1")).toEqual(["bootstrap", "full", "delta"]);
    expect(modesFor(index, "vfx-script@1")).toEqual([]);
    expect(promotionPolicyFor(index, "editor-capability-fixture")).toBe("forbidden");
  });

  it("fails closed for unknown representation, missing fields, and digest drift", () => {
    const index = readEditorContractIndex(fixture);
    expect(modesFor(index, "future@9")).toEqual([]);
    expect(promotionPolicyFor(index, "future@9")).toBe("forbidden");
    expect(() => readEditorContractIndex(fixture, "different")).toThrow(/digest/);
    expect(() => readEditorContractIndex({ ...fixture, representations: [{ representation: "ability@1" }] }))
      .toThrow(/packageKind|state/);
  });

  it("rejects duplicate rows and invented modes", () => {
    expect(() => readEditorContractIndex({
      ...fixture,
      representations: [...fixture.representations, fixture.representations[0]],
    })).toThrow(/重複/);
    expect(() => readEditorContractIndex({
      ...fixture,
      representations: [{ ...fixture.representations[0], modes: ["turbo"] }],
    })).toThrow(/未知 mode/);
  });
});
