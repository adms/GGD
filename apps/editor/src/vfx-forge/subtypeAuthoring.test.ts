import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { zVfxSubtypeDoc } from "@ggd/shared/content/schema/vfxSubtype";
import { authoredTimeline } from "./subtypeAuthoring";

const subtype = zVfxSubtypeDoc.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../content/vfx-subtypes/sub.forward-twin-blast.json"), "utf8")));
describe("authored subtype timeline", () => {
  it("maps repeated calls to independent rows and retains their parameter overrides on round trip", () => {
    const script = zVfxScriptDoc.parse({ schema: "vfx-script@1", id: "subtype-proof.q", abilityId: "subtype-proof.q", yields: ["caster.castFx"], segments: [
      { call: { subtype: subtype.id, params: { burstLifeSec: 0.8 } } },
      { call: { subtype: subtype.id, params: { burstLifeSec: 2.4 } } },
    ] });
    const raw = JSON.stringify(script);
    const timeline = authoredTimeline(script, [subtype]);
    expect(timeline.errors).toEqual([]);
    expect(timeline.owners).toEqual([0, 0, 1, 1]);
    expect(timeline.expanded.segments[1]).toMatchObject({ lifeSec: 0.8 });
    expect(timeline.expanded.segments[3]).toMatchObject({ lifeSec: 2.4 });
    expect(JSON.stringify(script)).toBe(raw);
    expect(authoredTimeline(zVfxScriptDoc.parse(JSON.parse(raw)), [subtype])).toEqual(timeline);
  });
  it("exposes missing or out-of-bounds calls without pretending that they rendered", () => {
    const script = zVfxScriptDoc.parse({ schema: "vfx-script@1", id: "subtype-proof.q", abilityId: "subtype-proof.q", segments: [{ call: { subtype: subtype.id, params: { burstLifeSec: 200 } } }] });
    expect(authoredTimeline(script, [subtype])).toMatchObject({ owners: [], expanded: { segments: [] }, errors: [expect.stringContaining("第 1 段")] });
    expect(authoredTimeline(script, []).errors).toHaveLength(1);
  });
});
