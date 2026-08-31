import { describe, expect, it } from "vitest";
import {
  generatedAbilityBlockers,
  generatedChampionBlockers,
  sourceWriteBlockers,
} from "./sourcePolicy";

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

  it("fails safe for generated champions until main supplies source ownership", () => {
    expect(generatedChampionBlockers()[0]).toContain("content/champions");
    expect(sourceWriteBlockers("champions", { id: "godie-e002" }, null)).toHaveLength(1);
  });

  it("lets an authoritative hand-authored champion descriptor unlock direct writes", () => {
    expect(sourceWriteBlockers("champions", { id: "custom-hero" }, {
      schema: "ggd-editor-source@1",
      collection: "champions",
      id: "custom-hero",
      outputPath: "content/champions/custom-hero.json",
      ownership: { kind: "hand-authored", sourcePaths: ["content/champions/custom-hero.json"] },
      writePolicy: "document",
    })).toEqual([]);
  });

  it("does not apply generated-source rules to hand-authored collections", () => {
    expect(sourceWriteBlockers("vfx-scripts", { provenance: "owner-spec" }, null)).toEqual([]);
    expect(sourceWriteBlockers("skins", { id: "skin.custom" }, null)).toEqual([]);
  });
});
