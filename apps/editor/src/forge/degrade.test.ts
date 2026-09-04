import { describe, expect, it } from "vitest";

import { degradeNotes, satisfiedCaps } from "./degrade";

describe("Forge degradation ledger", () => {
  it("does not resurrect the pre-GH#541 false combo degradation", () => {
    expect(degradeNotes(["combo"])).toEqual([]);
    expect(satisfiedCaps(["combo"])).toEqual(["combo"]);
  });

  it("still fails honestly for an unknown capability", () => {
    expect(degradeNotes(["future-capability"])).toEqual([
      {
        capability: "future-capability",
        plan: "future-capability 未支援 — 相關參數在本版不生效",
        phase: 3,
      },
    ]);
    expect(satisfiedCaps(["future-capability"])).toEqual([]);
  });
});
