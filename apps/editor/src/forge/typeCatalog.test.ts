import { describe, expect, it } from "vitest";
import {
  GGD_TYPE_CATALOG,
  GGD_TYPE_CATALOG_ERROR,
  pickableTemplateIds,
  templateContractBlockers,
  templateParamDecision,
  templateSelectionDecision,
} from "./typeCatalog";

describe("Main ggd-type-catalog fail-closed adapter", () => {
  it("accepts the generated contract and reproduces its measured pickable count", () => {
    expect(GGD_TYPE_CATALOG_ERROR).toBeNull();
    expect(GGD_TYPE_CATALOG).not.toBeNull();
    expect(GGD_TYPE_CATALOG!.types.filter((entry) => entry.expands)).toHaveLength(
      GGD_TYPE_CATALOG!.counts.pickable,
    );
    const expectedDoc = GGD_TYPE_CATALOG!.types
      .filter((entry) => entry.expands && (entry.wiring === "doc" || entry.wiring === "both"))
      .length;
    const expectedNode = GGD_TYPE_CATALOG!.types
      .filter((entry) => entry.expands && (entry.wiring === "node" || entry.wiring === "both"))
      .length;
    expect(pickableTemplateIds("doc").size).toBe(expectedDoc);
    expect(pickableTemplateIds("node").size).toBe(expectedNode);
  });

  it("uses measured expansion and wiring rather than the template status badge", () => {
    expect(templateSelectionDecision("tpl-beam-roll", "doc").selectable).toBe(true);
    expect(templateSelectionDecision("tpl-locust-line", "node").selectable).toBe(true);
    expect(templateSelectionDecision("tpl-locust-line", "doc")).toMatchObject({
      selectable: false,
      reason: expect.stringContaining("wiring=node"),
    });
    expect(templateSelectionDecision("tpl-dragon-serpent", "doc")).toMatchObject({
      selectable: false,
      reason: expect.stringContaining("尚未接上展開路徑"),
    });
    expect(templateSelectionDecision("tpl-does-not-exist", "doc").selectable).toBe(false);
  });

  it("locks inert and wrong-side params instead of offering silent no-op controls", () => {
    expect(templateParamDecision("tpl-beam-roll", "speed", "doc")).toMatchObject({
      editable: false,
      fillsVia: "spawnModelFx.preset",
      reason: expect.stringContaining("本版不生效"),
    });
    expect(templateParamDecision("tpl-beam-roll", "modelKey", "doc")).toMatchObject({
      editable: false,
      fillsVia: "spawnModelFx.preset",
      reason: expect.stringContaining("只能透過 spawnModelFx.preset"),
    });
    expect(templateParamDecision("tpl-beam-roll", "damageType", "doc")).toEqual({
      editable: true,
      reason: null,
      fillsVia: "template.ref → expand()",
    });
  });

  it("turns every unavailable card into an explicit save blocker", () => {
    expect(templateContractBlockers(["tpl-single-strike"], "doc")).toEqual([]);
    expect(templateContractBlockers(["tpl-locust-line", "tpl-dragon-quake"], "doc"))
      .toEqual([
        expect.stringContaining("tpl-locust-line"),
        expect.stringContaining("tpl-dragon-quake"),
      ]);
  });
});
