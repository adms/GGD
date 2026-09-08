import { beforeEach, expect, it } from "vitest";
import type { AbilityId } from "../../ids";
import { Abilities } from "./registry";
import { ContentStore } from "../../content/store";
import { Models, registerAll } from "../../content/registries";
import { captureRegistryContext, extendRegistryContext, withRegistryContext } from "./registryContext";

const id = "context-proof.q" as AbilityId;
function registerVersion(damage: number): void {
  const store = new ContentStore();
  store.add("abilities", id, { schema: "ability@1", id, name: "完整原文\n第二行", slot: "Q", castType: "self", maxRank: 4, cooldown: [10, 10, 10, 10], manaCost: [0, 0, 0, 0], range: 0, effects: [{ kind: "damage", amount: { flat: damage }, damageType: "magic" }] });
  store.add("models", "context-model", { id: "context-model", schema: "model@1", glbPath: `assets/models/version-${damage}.glb` });
  registerAll(store, { representation: "verified-runtime", onTemplateFailure: "throw" });
}
beforeEach(() => { Abilities.clear(); Models.clear(); registerVersion(10); });

it("registers new versions through Main's existing seam while every room and official base keep their own values", () => {
  const base = captureRegistryContext("official-base");
  const first = extendRegistryContext(base, "room-one", () => registerVersion(20));
  const second = extendRegistryContext(base, "room-two", () => registerVersion(30));
  const path = () => Models.get("context-model").glbPath;
  expect(path()).toContain("version-10");
  withRegistryContext(first, () => {
    expect(path()).toContain("version-20");
    withRegistryContext(second, () => expect(path()).toContain("version-30"));
    expect(path()).toContain("version-20");
    expect(() => Abilities.clear()).toThrow("immutable");
    expect(() => Models.get("context-model").glbPath = "changed").toThrow();
    expect(() => Abilities.get(id).cooldown[0] = 99).toThrow();
  });
  registerVersion(40);
  expect(path()).toContain("version-40");
  withRegistryContext(first, () => expect(path()).toContain("version-20"));
  withRegistryContext(base, () => expect(path()).toContain("version-10"));
});

it("restores lookup context after a failed build or failed frame and rejects asynchronous registration", () => {
  const base = captureRegistryContext("base");
  expect(() => extendRegistryContext(base, "failed", () => { registerVersion(50); throw new Error("fail"); })).toThrow("fail");
  expect(Models.get("context-model").glbPath).toContain("version-10");
  const next = extendRegistryContext(base, "next", () => registerVersion(60));
  expect(() => withRegistryContext(next, () => { throw new Error("frame"); })).toThrow("frame");
  expect(Models.get("context-model").glbPath).toContain("version-10");
  expect(() => extendRegistryContext(base, "async", async () => registerVersion(70))).toThrow("synchronous");
});
