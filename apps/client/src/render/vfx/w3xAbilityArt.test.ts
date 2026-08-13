/**
 * W3X ability art promotions — the guard rails that keep this table HONEST.
 *
 * Two failure modes this test exists to prevent, both of which would make the
 * owner's 「根本不知道哪招是哪招」 WORSE rather than better:
 *   1. a binding invented from a plausible-looking name instead of read out of
 *      the import (the project's hard-won "JASS > tooltip, never proximity-
 *      grep" rule) — guarded by asserting every row still matches
 *      VFX_BINDINGS.json, the generated source of truth;
 *   2. a family whose emitters hang off ANIMATED model nodes being promoted —
 *      replayed at a world position those collapse to a blob, so `divinering`
 *      and the tornadoes must stay on their primitives.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { isShipped } from "../../testkit/contentFixtures";
import { fileURLToPath } from "node:url";
import { zVfxDoc } from "@ggd/shared/content";
import { W3X_ABILITY_ART, w3xArtFor, extraVfxDocIds } from "./w3xAbilityArt";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const BINDINGS = root("tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json");

interface Emitter {
  docId: string;
  anchorIsModelRoot: boolean;
}
interface Bindings {
  models: Record<string, { emitters?: Emitter[] }>;
}
const bindings: Bindings | null = existsSync(BINDINGS)
  ? (JSON.parse(readFileSync(BINDINGS, "utf8")) as Bindings)
  : null;

const rows = Object.entries(W3X_ABILITY_ART);

describe("w3x ability art promotions", () => {
  it("promotes a non-empty set, and every doc it names exists and is schema-valid", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const [abilityId, art] of rows) {
      for (const id of [art.primary, ...art.extra]) {
        const p = root(`content/vfx/${id}.json`);
        expect(existsSync(p), `${abilityId} -> missing vfx doc ${id}`).toBe(true);
        // particle docs only: a ribbon@1 doc would not play through VfxSystem
        const doc = zVfxDoc.parse(JSON.parse(readFileSync(p, "utf8")));
        expect(doc.id).toBe(id);
      }
    }
  });

  it("the ability's shipped vfxKey IS the promoted primary (content agrees with the table)", () => {
    for (const [abilityId, art] of rows) {
      // GH#323 —— 表上留著已退場的技能沒有錯（復活就用得上），⛔ 錯的是拿它們斷言。
      if (!isShipped("abilities", abilityId)) continue;
      const p = root(`content/abilities/${abilityId}.json`);
      expect(existsSync(p), `no ability doc ${abilityId}`).toBe(true);
      const doc = JSON.parse(readFileSync(p, "utf8")) as { vfxKey?: string };
      expect(doc.vfxKey, `${abilityId} vfxKey drifted from its promotion`).toBe(art.primary);
    }
  });

  it("primary is never repeated in extra, and a family's docs are unique", () => {
    for (const [abilityId, art] of rows) {
      const all = [art.primary, ...art.extra];
      expect(new Set(all).size, `${abilityId} names a doc twice`).toBe(all.length);
    }
  });

  it("only AUTHOR-SET provenance is promoted — never inherited Blizzard stock", () => {
    for (const [abilityId, art] of rows) {
      expect(
        ["w3a-override", "w3h-override", "jass-literal"],
        `${abilityId} promoted on weak provenance`,
      ).toContain(art.provenance);
    }
  });

  it("every promoted family is ROOT-ANCHORED in the import (the renderability gate)", () => {
    if (!bindings) return; // archaeology output not present in this checkout
    for (const [abilityId, art] of rows) {
      const model = bindings.models[art.family];
      expect(model, `${abilityId}: family ${art.family} not in VFX_BINDINGS`).toBeDefined();
      const emitters = model!.emitters ?? [];
      expect(emitters.length, `${art.family} has no emitters`).toBeGreaterThan(0);
      for (const e of emitters) {
        expect(
          e.anchorIsModelRoot,
          `${art.family}/${e.docId} hangs off an animated node — promoting it renders a blob`,
        ).toBe(true);
      }
    }
  });

  it("the known animated-node families stay OFF the promotion list", () => {
    const families = new Set(rows.map(([, a]) => a.family));
    for (const banned of ["divinering", "earthtornado2", "lightningtornado", "heronarutos4effect"]) {
      expect(families.has(banned), `${banned} must keep its primitive`).toBe(false);
    }
  });

  it("依文潔琳 42-04 世界終結 binds to the map's OWN frost nova (the acceptance case)", () => {
    const art = w3xArtFor("godie-n003.r");
    expect(art).toBeDefined();
    expect(art!.family).toBe("frostnova");
    // recovered from a literal `AddSpecialEffectLocBJ(..., "frostnova.mdx")`
    expect(art!.provenance).toBe("jass-literal");
    // all 4 of the effect's emitters play, not 1 of 4
    expect([art!.primary, ...art!.extra]).toHaveLength(4);
  });

  it("lookups are null-safe for the ~632 abilities that keep their primitive", () => {
    expect(w3xArtFor(undefined)).toBeUndefined();
    expect(w3xArtFor("godie-n003.q")).toBeUndefined(); // stock FrostNovaTarget, not in repo
    expect(extraVfxDocIds("godie-n003.q")).toEqual([]);
    expect(extraVfxDocIds(undefined)).toEqual([]);
  });
});
