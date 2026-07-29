/**
 * THE 21 PROTOTYPES — that they are 21, that they are the census's 21, and
 * above all that ONE prototype really does render DIFFERENTLY per call site.
 *
 * The failure this file exists to catch is failure ③ + ⑦ together: a "family
 * prototype layer" whose `applyArtParams` call can be deleted with every test
 * still green, because the tests assert the family's LABEL and MODEL LIST
 * (properties) instead of the doc's SIZE and COLOUR (behaviour). So the central
 * assertion here reads numbers off the built docs and demands they differ.
 *
 * MUTATION LOG for this file (run before landing):
 *   · delete the `applyArtParams(...)` call in `buildFamilyDocWith` and return
 *     `base` → "one prototype, two abilities, two different sizes" fails
 *   · make `colourRgb` ignore the w3x tint and always return the family element
 *     → "the map's own tint beats the name-classified element" fails
 *   · change `w3xScaleToDoc`'s gain to 0 → "the map's scale ordering survives"
 *     fails
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zVfxDoc } from "@ggd/shared/content";
import {
  DEFAULT_SCALE_MAPPING,
  W3X_ART_FAMILIES,
  W3X_ART_FAMILY_IDS,
  buildFamilyDoc,
  colourRgb,
  colourSlug,
  familyHeightY,
  familyVfxKey,
  isFamilyVfxKey,
  quantizeScale,
  scaleToken,
  w3xScaleToDoc,
  w3xTintToRgb,
  type FamilyColour,
} from "./w3xArtFamilies";
import { PRIMITIVES } from "./primitives";
import { ELEMENTS } from "./elements";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));
const USAGE = root("tools/w3x-import/out/vfx-census/MODEL_USAGE.json");

const peak = (doc: { sizeStops?: [number, number][]; size: { start: number } }): number =>
  doc.sizeStops ? Math.max(...doc.sizeStops.map(([, s]) => s)) : doc.size.start;
/** The ramp's ELEMENT-TINT stop (index 1; index 0 is the whitened core). */
const tintStop = (doc: {
  colorStops?: [number, [number, number, number, number]][];
}): [number, number, number, number] => doc.colorStops![1]![1];

describe("w3x art families — the prototype set", () => {
  it("is exactly 21 families, ordered by census reference count", () => {
    expect(W3X_ART_FAMILY_IDS).toHaveLength(21);
    expect(Object.keys(W3X_ART_FAMILIES)).toHaveLength(21);
    for (let i = 1; i < W3X_ART_FAMILY_IDS.length; i++) {
      const prev = W3X_ART_FAMILIES[W3X_ART_FAMILY_IDS[i - 1]!].refCount;
      const cur = W3X_ART_FAMILIES[W3X_ART_FAMILY_IDS[i]!].refCount;
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
    expect(W3X_ART_FAMILY_IDS[0]).toBe("shockwaveRing"); // 273 refs, the big one
  });

  it("every prototype names a real primitive, a real element, and a filename-safe slug", () => {
    const slugs = new Set<string>();
    for (const id of W3X_ART_FAMILY_IDS) {
      const p = W3X_ART_FAMILIES[id];
      expect(PRIMITIVES[p.primitive], `${id}: unknown primitive`).toBeTypeOf("function");
      expect(ELEMENTS[p.element], `${id}: unknown element`).toBeDefined();
      expect(p.slug, `${id}: slug must match ID_RE`).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
      expect(slugs.has(p.slug), `${id}: duplicate slug ${p.slug}`).toBe(false);
      slugs.add(p.slug);
      expect(p.models.length).toBeGreaterThan(0);
      // the note must SAY SOMETHING, not restate the id (the CLAUDE.md rule)
      expect(p.note.length).toBeGreaterThan(10);
      expect(p.note).not.toBe(p.label);
    }
  });

  it("the 21 families collapse 33 distinct stock models, none shared between families", () => {
    const seen = new Set<string>();
    for (const id of W3X_ART_FAMILY_IDS) {
      for (const m of W3X_ART_FAMILIES[id].models) {
        expect(seen.has(m), `${m} claimed by two families`).toBe(false);
        seen.add(m);
      }
    }
    expect(seen.size).toBe(33);
  });

  it.skipIf(!existsSync(USAGE))(
    "models + refCounts are the L1 census's, not a stale hand copy",
    () => {
      const usage = JSON.parse(readFileSync(USAGE, "utf8")) as {
        families: { id: string; label: string; refCount: number; models: { stem: string }[] }[];
      };
      const drift: string[] = [];
      for (const f of usage.families) {
        const p = W3X_ART_FAMILIES[f.id as keyof typeof W3X_ART_FAMILIES];
        if (!p) {
          drift.push(`${f.id}: census has it, the prototypes do not`);
          continue;
        }
        if (p.refCount !== f.refCount) drift.push(`${f.id}: refCount ${p.refCount} != census ${f.refCount}`);
        if (p.label !== f.label && f.id !== "uncategorised") {
          drift.push(`${f.id}: label ${p.label} != census ${f.label}`);
        }
        const a = [...p.models].sort().join(",");
        const b = f.models.map((m) => m.stem).sort().join(",");
        if (a !== b) drift.push(`${f.id}: models ${a} != census ${b}`);
      }
      expect(drift, `${drift.length} family(ies) drifted from the census`).toEqual([]);
      // 922 is the owner's headline number for the 33 prioritised models
      const total = W3X_ART_FAMILY_IDS.reduce((n, id) => n + W3X_ART_FAMILIES[id].refCount, 0);
      expect(total).toBe(922);
    },
  );
});

describe("w3x art families — one prototype, many looks", () => {
  const FAM = "shockwaveRing" as const;

  it("ONE prototype, two call sites → two DIFFERENT sizes and two DIFFERENT colours", () => {
    // Saber's 約束與勝利之劍: big, holy. A plain 踏地 ring: small, earth.
    const saber = buildFamilyDoc(FAM, { kind: "element", element: "holy" }, 2.4);
    const stomp = buildFamilyDoc(FAM, { kind: "element", element: "earth" }, 0.7);

    expect(saber.id).not.toBe(stomp.id);
    // SIZE — read off the built doc, not off a param object
    expect(peak(saber)).toBeGreaterThan(peak(stomp) * 1.8);
    // COLOUR — the holy ring is warmer (more red+green) than the earth ring is blue
    const [sr, sg, sb] = tintStop(saber);
    const [er, eg, eb] = tintStop(stomp);
    expect([sr, sg, sb]).not.toEqual([er, eg, eb]);
    expect(sb).toBeGreaterThan(eb); // holy is near-white, earth is brown
    // and both are still schema-valid vfx@1 docs
    expect(zVfxDoc.parse(saber).id).toBe(saber.id);
    expect(zVfxDoc.parse(stomp).id).toBe(stomp.id);
  });

  it("size is CONTINUOUS, not bucketed — 2.0 and 3.0 give different docs", () => {
    // The first cut bucketed into sm/md/lg and silently collapsed
    // `tornadoelemental`'s authored 2.0 and 3.0 into one doc. This is the
    // assertion that caught it, so it stays exactly this specific.
    const c: FamilyColour = { kind: "element", element: "wind" };
    const two = buildFamilyDoc("tornado", c, w3xScaleToDoc(2));
    const three = buildFamilyDoc("tornado", c, w3xScaleToDoc(3));
    expect(two.id).not.toBe(three.id);
    expect(peak(three)).toBeGreaterThan(peak(two));
    // and the whole authored ladder stays strictly increasing
    const ladder = [0.9, 1, 1.1, 1.5, 2, 3, 4, 5].map((s) => peak(buildFamilyDoc("burst", c, w3xScaleToDoc(s))));
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThanOrEqual(ladder[i - 1]!);
    expect(ladder[ladder.length - 1]!).toBeGreaterThan(ladder[0]! * 1.5);
  });

  it("the map's own tint BEATS the name-classified element", () => {
    const named = buildFamilyDoc(FAM, { kind: "element", element: "fire" }, 1);
    const w3x = buildFamilyDoc(FAM, { kind: "w3x", rgb255: [0, 255, 255] }, 1); // the ice-blue thunderclap
    expect(tintStop(w3x)).not.toEqual(tintStop(named));
    const [r, g, b] = tintStop(w3x);
    expect(b).toBeGreaterThan(r); // cyan: blue channel dominates red
    expect(g).toBeGreaterThan(r);
    expect(colourRgb({ kind: "w3x", rgb255: [0, 255, 255] })).toEqual([0, 1, 1]);
    expect(w3xTintToRgb([255, 0, 0])).toEqual([1, 0, 0]);
  });

  it("a family's alpha and timeScale reach the doc (cloud is faint + slow, shine is bright + fast)", () => {
    const c: FamilyColour = { kind: "element", element: "wind" };
    const cloud = buildFamilyDoc("cloud", c, 1);
    const shine = buildFamilyDoc("shine", c, 1);
    expect(tintStop(cloud)[3]).toBeLessThan(tintStop(shine)[3]);
    expect(cloud.lifetimeSec.max).toBeGreaterThan(shine.lifetimeSec.max);
  });

  it("every (family × size) doc is schema-valid and uniquely keyed", () => {
    const ids = new Set<string>();
    for (const id of W3X_ART_FAMILY_IDS) {
      for (const scale of [0.72, 1, 1.6] as const) {
        const colour: FamilyColour = { kind: "element", element: W3X_ART_FAMILIES[id].element };
        const doc = buildFamilyDoc(id, colour, scale);
        expect(ids.has(doc.id), `${id}/${scale} duplicate id`).toBe(false);
        ids.add(doc.id);
        expect(() => zVfxDoc.parse(doc), `${id}/${scale} invalid`).not.toThrow();
        expect(isFamilyVfxKey(doc.id)).toBe(true);
      }
    }
    expect(ids.size).toBe(21 * 3);
  });
});

describe("w3x art families — the WC3 → doc mappings", () => {
  it("scale ORDERING survives the compression, and the extremes are clamped", () => {
    expect(w3xScaleToDoc(1)).toBe(1);
    expect(w3xScaleToDoc(2)).toBeGreaterThan(w3xScaleToDoc(1));
    expect(w3xScaleToDoc(5)).toBeGreaterThan(w3xScaleToDoc(2));
    expect(w3xScaleToDoc(10)).toBe(DEFAULT_SCALE_MAPPING.max); // clamped, not 4.15
    expect(w3xScaleToDoc(0.1)).toBeGreaterThanOrEqual(DEFAULT_SCALE_MAPPING.min);
    // a 5.0 call must still read clearly bigger than a 1.0 one — if the gain
    // were 0 this is the assertion that fails
    expect(w3xScaleToDoc(5) / w3xScaleToDoc(1)).toBeGreaterThan(1.5);
    // garbage in → the identity, never NaN
    expect(w3xScaleToDoc(0)).toBe(1);
    expect(w3xScaleToDoc(Number.NaN)).toBe(1);
  });

  it("quantizeScale snaps to 0.05 without ever collapsing the authored ladder", () => {
    expect(quantizeScale(1.004)).toBe(1);
    expect(quantizeScale(1.03)).toBe(1.05);
    expect(quantizeScale(0)).toBe(1); // garbage in → identity, never 0
    expect(scaleToken(1)).toBe("s100");
    expect(scaleToken(2.4)).toBe("s240");
    // the four families with two authored scales must stay distinguishable
    for (const [a, b] of [[0.9, 3], [1.1, 3], [2, 3], [4, 5]] as const) {
      expect(scaleToken(w3xScaleToDoc(a))).not.toBe(scaleToken(w3xScaleToDoc(b)));
    }
  });

  it("a NEGATIVE w3x fly height can never push an effect under the floor (failure ①)", () => {
    // the map parks dummies at -1000 to hide them; that must not hide the CAST
    expect(familyHeightY("tornado", -1000)).toBeGreaterThan(0);
    expect(familyHeightY("shockwaveRing", 360)).toBeGreaterThan(W3X_ART_FAMILIES.shockwaveRing.heightY);
    expect(familyHeightY("shockwaveRing", undefined)).toBe(W3X_ART_FAMILIES.shockwaveRing.heightY);
  });

  it("the doc key is deterministic, lowercase, and encodes family + colour + tier", () => {
    expect(familyVfxKey("shockwaveRing", { kind: "element", element: "holy" }, 1)).toBe(
      "fx.fam.shockwave-ring.holy.s100",
    );
    expect(familyVfxKey("shockwaveRing", { kind: "element", element: "holy" }, 1.6)).toBe(
      "fx.fam.shockwave-ring.holy.s160",
    );
    expect(familyVfxKey("boltStrike", { kind: "w3x", rgb255: [0, 255, 255] }, 0.72)).toBe(
      "fx.fam.bolt-strike.w3x-00ffff.s70",
    );
    expect(colourSlug({ kind: "w3x", rgb255: [255, 100, 0] })).toBe("w3x-ff6400");
  });
});
