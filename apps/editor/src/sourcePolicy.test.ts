import { describe, expect, it } from "vitest";
import { generatedAbilityBlockers, sourceWriteBlockers } from "./sourcePolicy";

describe("editor source safety", () => {
  it("blocks generated ability output when the main descriptor route is absent", () => {
    expect(generatedAbilityBlockers({ provenance: "owner-spec" })).toHaveLength(1);
    expect(sourceWriteBlockers("abilities", { provenance: "owner-spec" }, null)[0]).toContain(
      "不能直接改產物",
    );
  });

  it("lets the authoritative descriptor override the local provenance fallback", () => {
    expect(sourceWriteBlockers("abilities", { provenance: "owner-spec" }, {
      schema: "ggd-editor-source@1",
      collection: "abilities",
      id: "probe.q",
      outputPath: "content/abilities/probe.q.json",
      ownership: { kind: "hand-authored", sourcePaths: ["content/abilities/probe.q.json"] },
      writePolicy: "document",
    })).toEqual([]);
  });

  it("names the producer and source without allowing a direct product write", () => {
    const blockers = sourceWriteBlockers("abilities", {}, {
      schema: "ggd-editor-source@1",
      collection: "abilities",
      id: "godie-e002.r",
      outputPath: "content/abilities/godie-e002.r.json",
      ownership: {
        kind: "generator-owned",
        producer: "skillremake:json",
        sourcePaths: ["tools/skill-remake/batch1.py"],
      },
      writePolicy: "source-adapter",
    });
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain("skillremake:json");
    expect(blockers[0]).toContain("tools/skill-remake/batch1.py");
  });

  it("does not apply the ability-source rule to other collections", () => {
    expect(sourceWriteBlockers("vfx-scripts", { provenance: "owner-spec" }, null)).toEqual([]);
  });
});
