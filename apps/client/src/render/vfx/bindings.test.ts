/**
 * Roster VFX bindings (task #79): all 240 abilities of the 48 whitelisted
 * champions are bound to a real element/primitive — NOT the generic fire
 * placeholder — and 依文潔琳's ice spells resolve to an ICE primitive (the
 * flagship symptom). Every generated curated doc is schema-valid.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { zVfxDoc } from "@ggd/shared/content";
import { rosterBindings, abilityVfxKeys, curatedDocs, vfxKeyFor } from "./bindings";

const WHITELIST = fileURLToPath(new URL("../../../../../data/curation/whitelist.json", import.meta.url));
const roster: string[] = JSON.parse(readFileSync(WHITELIST, "utf8")).champions;

describe("roster bindings cover the 48 whitelisted champions (ability-vfx-bindings)", () => {
  it("binds every ability of all 48 champions (240 rows, none missing)", () => {
    cover("ability-vfx-bindings");
    const binds = rosterBindings();
    expect(binds).toHaveLength(roster.length * 5);
    for (const champ of roster) {
      const slots = binds.filter((b) => b.abilityId.startsWith(`${champ}.`)).map((b) => b.abilityId);
      expect(new Set(slots)).toEqual(
        new Set([`${champ}.q`, `${champ}.w`, `${champ}.e`, `${champ}.r`, `${champ}.ex`]),
      );
    }
  });

  it("no roster ability keeps the generic fire placeholder", () => {
    cover("ability-vfx-bindings");
    for (const key of Object.values(abilityVfxKeys())) {
      expect(key).not.toBe("fx.ember-bolt-cast");
      expect(key.startsWith("fx.prim.")).toBe(true);
    }
  });

  it("依文潔琳 (godie-n003): Q/E/R resolve to an ICE primitive (the ice spells now have ice)", () => {
    cover("ability-vfx-bindings");
    const keys = abilityVfxKeys();
    expect(keys["godie-n003.q"]).toContain("fx.prim.ice.");
    expect(keys["godie-n003.e"]).toContain("fx.prim.ice.");
    expect(keys["godie-n003.r"]).toContain("fx.prim.ice.");
    // and the generated ice doc actually reads cold (blue-dominant tint)
    const iceDoc = curatedDocs().get(keys["godie-n003.e"]!)!;
    const tint = iceDoc.colorStops![1]![1];
    expect(tint[2]).toBeGreaterThan(tint[0]);
  });

  it("EX / R ultimates scale up vs Q/W/E of the same element+primitive (task #50)", () => {
    cover("ability-vfx-bindings");
    // godie-e008 夏娜: E fire explosion (md) vs R fire explosion (lg)
    const keys = abilityVfxKeys();
    expect(keys["godie-e008.e"]).toBe("fx.prim.fire.explosion");
    expect(keys["godie-e008.r"]).toBe("fx.prim.fire.explosion-lg");
    const docs = curatedDocs();
    const md = docs.get("fx.prim.fire.explosion")!;
    const lg = docs.get("fx.prim.fire.explosion-lg")!;
    expect(lg.sizeStops![1]![1]).toBeGreaterThan(md.sizeStops![1]![1]);
  });

  it("every distinct curated doc is schema-valid and its id equals its vfxKey", () => {
    cover("ability-vfx-bindings");
    const docs = curatedDocs();
    expect(docs.size).toBeGreaterThan(10); // a real palette, reused across abilities
    for (const [key, doc] of docs) {
      expect(doc.id).toBe(key);
      expect(() => zVfxDoc.parse(doc)).not.toThrow();
    }
  });

  it("vfxKeyFor is stable and encodes element + primitive + size", () => {
    cover("ability-vfx-bindings");
    expect(vfxKeyFor({ element: "ice", primitive: "nova", size: "md" })).toBe("fx.prim.ice.nova");
    expect(vfxKeyFor({ element: "fire", primitive: "explosion", size: "lg" })).toBe("fx.prim.fire.explosion-lg");
    expect(vfxKeyFor({ element: "void", primitive: "pulse", size: "sm" })).toBe("fx.prim.void.pulse-sm");
  });
});
