import { describe, expect, it } from "vitest";
import { abilityIdOfAuthoredOrigin } from "./authoredOrigin";

describe("abilityIdOfAuthoredOrigin", () => {
  it.each([
    ["ability:godie-hart.r", "godie-hart.r"],
    ["hook:abilityPassive:godie-e002.ex", "godie-e002.ex"],
    ["hook:abilityToggleOn:godie-e00s.passive", "godie-e00s.passive"],
    ["hook:buff:ability:godie-e002.r#20", "godie-e002.r"],
    ["hook:buff:hook:abilityPassive:godie-e002.ex#31", "godie-e002.ex"],
  ])("resolves %s", (origin, abilityId) => {
    expect(abilityIdOfAuthoredOrigin(origin)).toBe(abilityId);
  });

  it.each([
    undefined,
    "",
    "basic",
    "item:godie-e002.ex",
    "hook:item:legendary-blade",
    "hook:buff:stack:godie-e002.ex#20",
  ])("refuses unrelated or lossy provenance %s", (origin) => {
    expect(abilityIdOfAuthoredOrigin(origin)).toBeUndefined();
  });
});
