import { afterEach, expect, it } from "vitest";
import { VfxSubtypes } from "./expand";
import { captureRegistryContext, extendRegistryContext, withRegistryContext } from "../../sim/content/registryContext";
import type { VfxSubtypeDoc } from "../schema/vfxSubtype";

const doc = (label: string): VfxSubtypeDoc => ({ schema: "vfx-subtype@1", id: "sub.context-test", label, derivedFrom: [], params: {}, segments: [{ kind: "hideBody", on: "castStart", at: "caster", durationMs: 100 }] });
afterEach(() => VfxSubtypes.clear());
it("keeps authored subtype versions immutable and isolated between community rooms", () => {
  VfxSubtypes.register(doc("official"));
  const official = captureRegistryContext("official");
  const first = extendRegistryContext(official, "first", () => VfxSubtypes.register(doc("v1")));
  const second = extendRegistryContext(official, "second", () => VfxSubtypes.register(doc("v2")));
  expect(VfxSubtypes.get("sub.context-test")?.label).toBe("official");
  withRegistryContext(first, () => {
    expect(VfxSubtypes.get("sub.context-test")?.label).toBe("v1");
    withRegistryContext(second, () => expect(VfxSubtypes.get("sub.context-test")?.label).toBe("v2"));
    expect(VfxSubtypes.get("sub.context-test")?.label).toBe("v1");
    expect(() => VfxSubtypes.register(doc("overwrite"))).toThrow("immutable");
  });
});
