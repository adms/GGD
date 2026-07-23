/**
 * vfx-cast-pillar-math: the pure half of the 0.6 s cast telegraph column.
 *
 * The three properties this effect lives or dies by, none of which need Babylon:
 *   · HONEST TIMING — the shape is a function of PROGRESS through the real cast
 *     window, so a 0.35 s cast and a 2 s cast both rise/hold/pay off across
 *     their own window and no constant "0.6" exists anywhere in the module;
 *   · NO WHITEOUT — 12 simultaneous casters must not sum to 12x the light;
 *   · NO DROWNING THE GROUND TELEGRAPH — the base flare stays smaller and
 *     dimmer than the Telegraph ring, asserted against Telegraph's OWN
 *     exported alpha, not a copied number;
 *   · ELEMENT AWARENESS — 依文潔琳's ice must not erupt in orange fire.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { BASE_ALPHA as TELEGRAPH_ALPHA } from "./Telegraph";
import { ELEMENTS, elementFromVfxKey, elementStyle } from "../render/vfx/elements";
import { vfxKeyFor } from "../render/vfx/bindings";
import {
  CORE_RADIUS,
  CORE_WHITEN,
  DEFAULT_FRINGE,
  GROUND_PEAK_ALPHA,
  GROUND_RADIUS,
  MAX_PILLARS,
  MOTE_COUNT,
  MIN_CROWD_SCALE,
  PILLAR_HEIGHT,
  SHELL_RADIUS,
  TINT_MIN_CHROMA,
  chromaOf,
  crowdAlphaScale,
  crowdTotalLuminance,
  moteSpec,
  motePoolKey,
  motesPerPulse,
  pillarPalette,
  pillarShape,
  pillarTintFromRamp,
} from "./castPillar";
import { stopsAscending } from "./vfxPresets";
import { DEATH_FOCUS_LUMA, deathFocusGrey } from "./DeathFocusFx";
import {
  ROUND_WASH_FILTER,
  ROUND_WASH_BACKGROUND,
  MATCH_WASH_FILTER,
  MATCH_WASH_BACKGROUND,
  MATCH_WASH_FILTER_HELD,
  MATCH_WASH_BACKGROUND_HELD,
} from "../render/victoryPresentation";

describe("the column is driven by the cast window, not a fixed timer", () => {
  it("rises, holds full height and intensifies across ANY window length", () => {
    cover("vfx-cast-pillar-math");
    // sample the SAME progress values — the curve knows nothing about seconds
    const early = pillarShape("cast", 0.05);
    const risen = pillarShape("cast", 0.3);
    const late = pillarShape("cast", 0.95);

    expect(early.height).toBeLessThan(risen.height);
    expect(risen.height).toBeCloseTo(1, 5);
    expect(late.height).toBeCloseTo(1, 5);
    // the core INTENSIFIES toward the resolve — "it is about to go off"
    expect(late.coreAlpha).toBeGreaterThan(risen.coreAlpha);
    expect(risen.coreAlpha).toBeGreaterThan(early.coreAlpha);
    // …and the shell converges inward as it charges
    expect(late.radius).toBeLessThan(early.radius);
  });

  it("has no cast-length constant at all: 0.35 s and 2 s produce the same curve", () => {
    cover("vfx-cast-pillar-math");
    // 40% into a 0.35 s cast and 40% into a 2 s cast are the SAME frame shape
    const short = pillarShape("cast", 140 / 350);
    const long = pillarShape("cast", 800 / 2000);
    expect(short).toEqual(long);
  });

  it("release flashes brighter than the cast ever was, then decays to 0", () => {
    cover("vfx-cast-pillar-math");
    const peak = pillarShape("cast", 1);
    const flash = pillarShape("release", 0);
    expect(flash.coreAlpha).toBeGreaterThan(peak.coreAlpha);
    expect(flash.shellAlpha).toBeGreaterThan(peak.shellAlpha);
    // blows outward and upward
    expect(pillarShape("release", 1).radius).toBeGreaterThan(1);
    const end = pillarShape("release", 1);
    expect(end.coreAlpha).toBe(0);
    expect(end.shellAlpha).toBe(0);
    expect(end.groundAlpha).toBe(0);
  });

  it("an INTERRUPT collapses downward and never flashes", () => {
    cover("vfx-cast-pillar-math");
    const peak = pillarShape("cast", 1);
    const snuff = pillarShape("extinguish", 0);
    // strictly dimmer than the cast it replaced — an interrupt must not read
    // as a resolve (a pillar that pays off after a stun is a lie)
    expect(snuff.coreAlpha).toBeLessThan(peak.coreAlpha);
    expect(snuff.shellAlpha).toBeLessThan(peak.shellAlpha);
    // and it drops rather than stretching up
    expect(pillarShape("extinguish", 1).height).toBeLessThan(0.35);
    expect(pillarShape("extinguish", 1).coreAlpha).toBe(0);
  });

  it("clamps out-of-range progress instead of producing negative light", () => {
    cover("vfx-cast-pillar-math");
    expect(pillarShape("cast", -5)).toEqual(pillarShape("cast", 0));
    expect(pillarShape("cast", 9)).toEqual(pillarShape("cast", 1));
    for (const phase of ["cast", "release", "extinguish"] as const) {
      for (const u of [0, 0.25, 0.5, 0.75, 1]) {
        const s = pillarShape(phase, u);
        expect(s.shellAlpha).toBeGreaterThanOrEqual(0);
        expect(s.coreAlpha).toBeGreaterThanOrEqual(0);
        expect(s.groundAlpha).toBeGreaterThanOrEqual(0);
        expect(s.height).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("twelve casters must not white out the screen", () => {
  it("per-pillar alpha falls as the crowd grows, with a readable floor", () => {
    cover("vfx-cast-pillar-crowd");
    expect(crowdAlphaScale(1)).toBe(1);
    let prev = 1;
    for (let n = 2; n <= MAX_PILLARS; n++) {
      const s = crowdAlphaScale(n);
      expect(s).toBeLessThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(MIN_CROWD_SCALE);
      prev = s;
    }
  });

  it("total light grows sub-linearly: 12 pillars < 6 pillars' worth of naive sum", () => {
    cover("vfx-cast-pillar-crowd");
    // a 3v3v3v3 arena is 12 champions — the worst case this must survive
    const twelve = crowdTotalLuminance(12);
    expect(twelve).toBeLessThan(6);
    expect(twelve).toBeGreaterThan(crowdTotalLuminance(1)); // still additive
    // monotone: one more caster never REDUCES total screen light (that would
    // read as the effect flickering off when the fight gets big)
    for (let n = 1; n < MAX_PILLARS; n++) {
      expect(crowdTotalLuminance(n + 1)).toBeGreaterThanOrEqual(crowdTotalLuminance(n));
    }
  });

  it("mote pulses thin out with the crowd and the quality budget", () => {
    cover("vfx-cast-pillar-crowd");
    expect(motesPerPulse(1, 1)).toBe(MOTE_COUNT);
    expect(motesPerPulse(12, 1)).toBeLessThan(MOTE_COUNT);
    expect(motesPerPulse(12, 0.5)).toBeLessThanOrEqual(motesPerPulse(12, 1));
    // never zero: a cast without motes still has to read as a cast
    expect(motesPerPulse(MAX_PILLARS, 0.1)).toBeGreaterThanOrEqual(1);
  });
});

describe("the column never out-shouts the ground telegraph", () => {
  it("base flare is dimmer than the Telegraph fill and smaller than an AoE ring", () => {
    cover("vfx-cast-pillar-readability");
    // compared against Telegraph's OWN exported alpha, not a copied literal
    expect(GROUND_PEAK_ALPHA).toBeLessThan(TELEGRAPH_ALPHA);
    // the default telegraph radius for an ability with no authored radius is
    // 1.2 (VfxSystem abilityCast); the flare must sit inside even that
    expect(GROUND_RADIUS).toBeLessThan(1.2);
    // brightest frame of the whole life still under the telegraph fill
    const brightest = Math.max(
      pillarShape("cast", 1).groundAlpha,
      pillarShape("release", 0).groundAlpha,
    );
    expect(brightest).toBeLessThan(TELEGRAPH_ALPHA);
  });

  it("the caster stays readable: core is narrower than a body, shell wider", () => {
    cover("vfx-cast-pillar-readability");
    // the core is occluded by the champion mesh → the character silhouettes
    // against it (the FF7 read); the shell surrounds the body instead of
    // sitting in front of it
    expect(CORE_RADIUS).toBeLessThan(0.5);
    expect(SHELL_RADIUS).toBeGreaterThan(0.5);
    expect(PILLAR_HEIGHT).toBeGreaterThan(2.45); // clears the overhead HP bar
  });
});

describe("it survives the #85 death-spectator wash without blinding anyone", () => {
  it("stays far brighter than a washed arena floor, and never clips to white", () => {
    cover("vfx-cast-pillar-readability");
    // the SAME formula the #85 post-process runs, from its own exported
    // constants (DeathFocusFx builds its GLSL from these too, so this cannot
    // drift out of sync with the shader)
    const floor: [number, number, number] = [0.28, 0.26, 0.24]; // arena ground
    const washedFloor = deathFocusGrey(floor, 1);
    const luma = (c: readonly [number, number, number]): number =>
      c[0] * DEATH_FOCUS_LUMA[0] + c[1] * DEATH_FOCUS_LUMA[1] + c[2] * DEATH_FOCUS_LUMA[2];

    for (const key of ["fx.prim.ice.nova", "fx.prim.fire.nova", undefined]) {
      const p = pillarPalette(key, null);
      // what the additive column actually contributes at its brightest frame:
      // core colour × core alpha, over the arena floor
      const a = pillarShape("release", 0).coreAlpha;
      const lit: [number, number, number] = [
        Math.min(1, floor[0] + p.core[0]! * a),
        Math.min(1, floor[1] + p.core[1]! * a),
        Math.min(1, floor[2] + p.core[2]! * a),
      ];
      const washed = deathFocusGrey(lit, 1);
      // READABLE: still clearly brighter than the drained ground around it
      expect(luma(washed)).toBeGreaterThan(luma(washedFloor) * 1.8);
      // NOT BLINDING: even at full strength it does not clip every channel to
      // pure white (which is what a "white out the screen" bug looks like)
      expect(Math.min(...washed)).toBeLessThan(1);
    }
  });
});

describe("it survives the #93 victory washes too", () => {
  /**
   * The #93 washes are a DIFFERENT mechanism from #85 and had to be checked
   * separately: #85 is a Babylon post-process on the arena camera, but the
   * round/match washes are a DOM layer over the canvas carrying a
   * `backdrop-filter` plus a translucent grey/dark gradient. A column that
   * survives the shader can still be erased by the gradient, and task #100
   * ("champions keep fighting after the round is settled") means casts really
   * are still going out while the wash is up.
   *
   * The filter math is the Filter Effects spec, applied to the wash strings the
   * presentation layer actually exports — retuning the wash re-evaluates this
   * test instead of leaving a stale copy behind.
   */
  const LUMA_R = 0.2126,
    LUMA_G = 0.7152,
    LUMA_B = 0.0722;

  /** `saturate(s)` / `grayscale(a)` (= saturate(1-a)) per the spec matrix. */
  function saturate(c: readonly number[], s: number): [number, number, number] {
    const [r, g, b] = c as [number, number, number];
    return [
      (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
      (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
      (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
    ];
  }

  /** Apply a CSS `filter` string left-to-right, exactly as the browser does. */
  function applyFilter(filter: string, rgb: readonly number[]): [number, number, number] {
    let out: [number, number, number] = [rgb[0]!, rgb[1]!, rgb[2]!];
    for (const m of filter.matchAll(/(\w+)\(([\d.]+)\)/g)) {
      const fn = m[1] as string;
      const v = Number(m[2]);
      if (fn === "grayscale") out = saturate(out, 1 - v);
      else if (fn === "saturate") out = saturate(out, v);
      else if (fn === "brightness") out = [out[0] * v, out[1] * v, out[2] * v];
      else throw new Error(`unhandled filter fn ${fn} — the wash changed shape`);
    }
    return out;
  }

  /** The most OPAQUE rgba stop in a gradient: the worst case for visibility. */
  function worstStop(background: string): [number, number, number, number] {
    let worst: [number, number, number, number] = [0, 0, 0, 0];
    for (const m of background.matchAll(/rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)/g)) {
      const a = Number(m[4]);
      if (a >= worst[3]) worst = [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255, a];
    }
    return worst;
  }

  const over = (
    fg: readonly [number, number, number, number],
    bg: readonly number[],
  ): [number, number, number] => [
    fg[0] * fg[3] + bg[0]! * (1 - fg[3]),
    fg[1] * fg[3] + bg[1]! * (1 - fg[3]),
    fg[2] * fg[3] + bg[2]! * (1 - fg[3]),
  ];
  const luma = (c: readonly number[]): number =>
    c[0]! * LUMA_R + c[1]! * LUMA_G + c[2]! * LUMA_B;

  it("stays readable under the round grey and the match dark, and never blows out", () => {
    cover("vfx-cast-pillar-victorywash");
    const floor: [number, number, number] = [0.28, 0.26, 0.24];
    const washes: [string, string, string][] = [
      ["round grey", ROUND_WASH_FILTER, ROUND_WASH_BACKGROUND],
      ["match dark", MATCH_WASH_FILTER, MATCH_WASH_BACKGROUND],
      ["match held (the roast chicken must be visible)", MATCH_WASH_FILTER_HELD, MATCH_WASH_BACKGROUND_HELD],
    ];

    for (const [label, filter, background] of washes) {
      const scrim = worstStop(background);
      const washedFloor = over(scrim, applyFilter(filter, floor));

      for (const key of ["fx.prim.ice.nova", "fx.prim.fire.nova", undefined]) {
        const p = pillarPalette(key, null);
        // the additive column at its brightest frame, over the arena floor
        const a = pillarShape("release", 0).coreAlpha;
        const lit: [number, number, number] = [
          Math.min(1, floor[0] + p.core[0]! * a),
          Math.min(1, floor[1] + p.core[1]! * a),
          Math.min(1, floor[2] + p.core[2]! * a),
        ];
        const washed = over(scrim, applyFilter(filter, lit));

        // NOT INVISIBLE: still clearly separated from the drained ground. The
        // round wash is the harsh one (grayscale 0.88 + a 0.76-alpha scrim), so
        // this is the assertion that would fail first if it were retuned darker.
        expect(luma(washed), `${label} / ${key ?? "gold"} vs floor`).toBeGreaterThan(
          luma(washedFloor) * 1.25,
        );
        // NOT BLINDING: the wash exists to calm the screen for the victory beat;
        // a column that clips every channel would punch straight through it.
        expect(Math.min(...washed), `${label} / ${key ?? "gold"} clipping`).toBeLessThan(1);
      }
    }
  });
});

describe("element awareness (依文潔琳 must not cast orange fire)", () => {
  it("takes the element straight off the ability's own #79 vfxKey", () => {
    cover("vfx-cast-pillar-element");
    const iceKey = vfxKeyFor({ element: "ice", primitive: "nova", size: "md" });
    const p = pillarPalette(iceKey, null);
    expect(p.element).toBe("ice");
    expect(p.fringe).toEqual(elementStyle("ice").color);
    // blue-dominant, never red-dominant
    expect(p.fringe[2]).toBeGreaterThan(p.fringe[0]);
    const fire = pillarPalette(vfxKeyFor({ element: "fire", primitive: "nova", size: "md" }), null);
    expect(fire.fringe[0]).toBeGreaterThan(fire.fringe[2]);
  });

  it("every element in the palette round-trips through a real vfxKey", () => {
    cover("vfx-cast-pillar-element");
    for (const el of Object.keys(ELEMENTS)) {
      const key = vfxKeyFor({ element: el as never, primitive: "pulse", size: "lg" });
      expect(elementFromVfxKey(key)).toBe(el);
      expect(pillarPalette(key, null).element).toBe(el);
    }
  });

  it("the core is the element whitened toward the FF7 yellow-white blaze", () => {
    cover("vfx-cast-pillar-element");
    for (const key of ["fx.prim.ice.nova", "fx.prim.fire.nova", "fx.prim.void.pulse-sm"]) {
      const p = pillarPalette(key, null);
      for (let i = 0; i < 3; i++) {
        expect(p.core[i]!).toBeGreaterThanOrEqual(p.fringe[i]! - 1e-9);
        expect(p.core[i]!).toBeLessThanOrEqual(1 + 1e-9);
      }
      // whitened, not washed out: the hue is still recognisable
      const spread = Math.max(...p.core) - Math.min(...p.core);
      expect(spread).toBeGreaterThan(0);
      expect(CORE_WHITEN).toBeLessThan(1);
    }
  });

  it("falls back to the doc tint, then to FF7 gold — never to a black column", () => {
    cover("vfx-cast-pillar-element");
    // an un-bound imported doc (the 285 still on fx.ember-bolt-cast) has no
    // element in its id, so its own colour carries the pillar
    const imported = pillarPalette("fx.ember-bolt-cast", [0.2, 0.4, 0.1]);
    expect(imported.element).toBeNull();
    expect(Math.max(...imported.fringe)).toBeCloseTo(1, 5); // normalized bright
    // no doc at all → the FF7 limit-break gold
    expect(pillarPalette(undefined, null).fringe).toEqual(DEFAULT_FRINGE);
    // a black doc colour must NOT produce an invisible pillar
    expect(pillarPalette("fx.whatever", [0, 0, 0]).fringe).toEqual(DEFAULT_FRINGE);
    // a non-primitive key that merely CONTAINS an element word is not an element
    expect(elementFromVfxKey("fx.icebolt")).toBeNull();
    expect(elementFromVfxKey("fx.prim.notanelement.nova")).toBeNull();
  });

  it("a GREY/WHITE doc colour is not a colour — it falls through to FF7 gold", () => {
    cover("vfx-cast-pillar-element");
    // REGRESSION. In a live match every pillar's emissiveColor AND vertex
    // colours read [1,1,1] and the light it added to the frame measured RGB
    // [15,13,13] — a colourless flare, for 297 of 554 abilities. The cause was
    // `brighten` normalising a WHITE tint to white and calling it a hue.
    expect(pillarPalette("fx.ember-bolt-cast", [1, 1, 1]).fringe).toEqual(DEFAULT_FRINGE);
    expect(pillarPalette("fx.whatever", [0.5, 0.5, 0.5]).fringe).toEqual(DEFAULT_FRINGE);
    // a near-grey that still has a usable cast is refused too (below the floor)
    expect(pillarPalette("fx.whatever", [1, 0.97, 0.95]).fringe).toEqual(DEFAULT_FRINGE);
    // …but a real hue still wins over the default
    expect(pillarPalette("fx.whatever", [0.2, 0.4, 1]).fringe).not.toEqual(DEFAULT_FRINGE);
    expect(chromaOf(pillarPalette("fx.whatever", [0.2, 0.4, 1]).fringe)).toBeGreaterThanOrEqual(
      TINT_MIN_CHROMA,
    );
  });

  it("reads the hue out of the whole colour RAMP, not the white-hot first stop", () => {
    cover("vfx-cast-pillar-element");
    // the real fx.ember-bolt-cast ramp, byte-for-byte from
    // content/vfx/fx.ember-bolt-cast.json — 285 abilities point at this doc
    const emberStops = [
      [0, [1, 1, 1, 1]],
      [0.15, [1, 0.6, 0.2, 1]],
      [0.53, [0.35, 0.21, 0.07, 0.35]],
      [1, [0, 0, 0, 0]],
    ] as const;
    const tint = pillarTintFromRamp(emberStops, [1, 0.6, 0.2, 1]);
    expect(tint).not.toBeNull();
    // the flame gold the doc was always describing, normalized to full bright
    expect(tint![0]).toBeCloseTo(1, 5);
    expect(tint![1]).toBeCloseTo(0.6, 2);
    expect(tint![2]).toBeCloseTo(0.2, 2);
    // and it survives the palette: a warm column, never a white one
    const p = pillarPalette("fx.ember-bolt-cast", tint);
    expect(p.fringe[0]).toBeGreaterThan(p.fringe[2]);
    expect(chromaOf(p.fringe)).toBeGreaterThan(TINT_MIN_CHROMA);

    // an entirely achromatic ramp yields nothing → caller falls back to gold
    expect(
      pillarTintFromRamp(
        [
          [0, [1, 1, 1, 1]],
          [1, [0.4, 0.4, 0.4, 0]],
        ] as const,
        [1, 1, 1, 1],
      ),
    ).toBeNull();
    // no stops at all → the legacy 2-stop start still carries the hue
    const legacy = pillarTintFromRamp(undefined, [0.1, 0.3, 0.9, 1]);
    expect(legacy).not.toBeNull();
    expect(legacy![2]).toBeCloseTo(1, 5); // blue normalized to peak
    // a black-only ramp must not be mistaken for a hue
    expect(pillarTintFromRamp([[0, [0, 0, 0, 1]]] as const, [0, 0, 0, 1])).toBeNull();
  });

  it("mote pool keys are bounded by the element count (one per element + default)", () => {
    cover("vfx-cast-pillar-element");
    const keys = new Set<string>();
    for (const el of Object.keys(ELEMENTS)) {
      keys.add(motePoolKey(pillarPalette(`fx.prim.${el}.nova`, null)));
    }
    keys.add(motePoolKey(pillarPalette(undefined, null)));
    expect(keys.size).toBe(Object.keys(ELEMENTS).length + 1);
  });

  it("motes rise INTO the column (inverted gravity) and use valid preset ramps", () => {
    cover("vfx-cast-pillar-math");
    const spec = moteSpec(pillarPalette("fx.prim.holy.nova", null));
    expect(spec.gravityY).toBeGreaterThan(0); // UP — the convergence read
    expect(spec.blend).toBe("additive");
    expect(stopsAscending(spec.sizeStops)).toBe(true);
    expect(stopsAscending(spec.colorStops)).toBe(true);
    expect(spec.flatRing?.radius).toBeLessThan(SHELL_RADIUS);
  });
});
