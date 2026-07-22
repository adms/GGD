/**
 * texgen/styles — the art. One painter per ArenaDef `groundStyle` actually used
 * by a shipped arena (packages/shared/src/content/schema/arena.ts):
 *
 *   stone → arena.skeleton, arena.castle    dirt  → arena.godie
 *   sand  → arena.colosseum                 grass → arena.dota
 *
 * Each painter is TWO functions, and the split is the whole point of task #80.
 *
 *   paint()  — the DETAIL layer. Seamless, repeats every `TILE_WORLD_SIZE`
 *              world units across the floor. Carries everything the eye reads
 *              up close: slab edges, pebbles, blades, ripples, grain.
 *   macro()  — the MACRO layer. Stretched ONCE over the whole 48-unit zone, so
 *              it never repeats at all. Carries the low-frequency story:
 *              trampled centre, grimy rim, damp patches, worn paths.
 *
 * A tiling texture on its own always betrays its period — the eye locks onto
 * the largest feature and finds the lattice. Detail × non-repeating macro is
 * the standard fix: the only repeating content is high-frequency (too small to
 * fingerprint), and everything large-scale is unique per position.
 *
 * Colour is authored in LINEAR light and sRGB-encoded on write (gen-ground.ts),
 * because Babylon reads albedo PNGs as gamma-space.
 */
import { clamp01, fbm, fbmAniso, hash1, ridged, smoothstep, worley } from "./noise";

/** World units covered by one repeat of the detail set. */
export const TILE_WORLD_SIZE = 4;

/**
 * Nominal world size of a zone's bounding square — every shipped arena zone has
 * `boundaryRadius` 24, so the macro map is stretched across 48 units. Only used
 * to convert the macro relief below into a normal-map gain; the renderer scales
 * the macro map to whatever the actual zone radius is.
 */
export const ZONE_WORLD_SIZE = 48;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** One detail texel. `h` drives the derived normal + AO; albedo is LINEAR. */
export interface Texel {
  r: number;
  g: number;
  b: number;
  h: number;
  rough: number;
}

/** One macro texel. `tint`/`rough` are signed drifts in [-1,1]. */
export interface MacroTexel {
  tint: number;
  rough: number;
  h: number;
}

export interface GroundStyle {
  id: string;
  label: string;
  /**
   * Peak-to-peak relief of the DETAIL height field, in WORLD UNITS — how far a
   * slab face stands above its mortar joint, a pebble above the earth. The
   * normal-map gain is derived from this and the texel size, so the relief
   * stays physically consistent if TILE_WORLD_SIZE or the resolution changes.
   *
   * These are deliberately ~2× life-size: the fixed camera looks down from 55°
   * where true-scale relief nearly vanishes. They are NOT free parameters —
   * an early cut used an arbitrary gain that worked out ~10× life-size and lit
   * the turf like corrugated iron and the earth like a riveted boiler plate.
   */
  reliefWorld: number;
  /** peak-to-peak relief of the MACRO field (gentle, arena-wide dishing) */
  macroReliefWorld: number;
  /** cavity-AO strength */
  ao: number;
  paint(u: number, v: number): Texel;
  macro(u: number, v: number): MacroTexel;
}

/**
 * Shared macro scaffolding. `rad` is 0 at the zone centre and 1 at the boundary
 * circle (the macro map is mapped 1:1 onto the zone's bounding square), so
 * "centre" and "rim" are real places on the arena floor, not just noise.
 */
function macroFields(u: number, v: number, seed: number) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const rad = clamp01(Math.sqrt(dx * dx + dy * dy) * 2);
  return {
    rad,
    /** where the fighting happens — heroes spawn and brawl mid-zone */
    centre: 1 - smoothstep(0.1, 0.8, rad),
    rim: smoothstep(0.55, 1.0, rad),
    blotch: fbm(u, v, 3, 4, seed + 901),
    patch: fbm(u, v, 6, 3, seed + 902),
    fine: fbm(u, v, 11, 3, seed + 903),
  };
}

// ----------------------------------------------------------------- stone ---
// Dungeon flagstone for arena.skeleton / arena.castle. Slabs are VORONOI cells,
// not squares on a lattice: irregular borders are what stop the floor reading
// as the grid the user complained about, even before the macro layer lands.
const stone: GroundStyle = {
  id: "stone",
  label: "cracked dungeon flagstone",
  reliefWorld: 0.05,
  macroReliefWorld: 0.16,
  ao: 0.8,
  paint(u, v) {
    // warp the cell field so slab borders meander instead of running straight
    const wu = u + 0.03 * (fbm(u, v, 6, 3, 101) - 0.5);
    const wv = v + 0.03 * (fbm(u, v, 6, 3, 202) - 0.5);
    const cell = worley(wu, wv, 3, 11); // 3 slabs per 4u tile → ~1.3u slabs
    const border = cell.f2 - cell.f1;
    // narrow joint: a wide near-black mortar line reads as cartoon tar and
    // makes the slab grid the loudest thing on the floor
    const mortar = 1 - smoothstep(0.015, 0.085, border);

    const tone = hash1(cell.id, 33);
    const tilt = hash1(cell.id, 44) - 0.5;
    const grain = fbm(u, v, 40, 4, 55);
    const micro = fbm(u, v, 150, 2, 66);

    // hairline cracks wandering across slab faces — kept sparse and shallow,
    // since a dense ridged net reads as scribble rather than fractured stone
    const crackField = ridged(u + 0.02 * fbm(u, v, 8, 2, 77), v, 10, 3, 88);
    const crack = smoothstep(0.93, 1.0, crackField) * (0.35 + 0.65 * hash1(cell.id, 91));

    const h =
      0.62 + tilt * 0.05 + grain * 0.07 + micro * 0.02 - mortar * 0.42 - crack * 0.12;

    // wider per-slab tone spread — neighbouring slabs reading as different
    // stones is the cheapest defence against a repeat being recognisable
    const baseL = 0.045 + tone * 0.068 + grain * 0.028 + micro * 0.009;
    let r = baseL;
    let g = baseL * 1.02;
    let b = baseL * 1.13; // cool granite cast
    if (hash1(cell.id, 123) > 0.74) {
      // the occasional warm/sandstone slab so the floor is not monochrome
      r *= 1.16;
      g *= 1.05;
      b *= 0.88;
    }
    // mortar: darker, browner, and much rougher than the slab faces
    r = lerp(r, 0.04, mortar);
    g = lerp(g, 0.035, mortar);
    b = lerp(b, 0.029, mortar);
    const ck = crack * 0.6;
    r = lerp(r, 0.024, ck);
    g = lerp(g, 0.021, ck);
    b = lerp(b, 0.02, ck);

    const rough = clamp01(0.7 + mortar * 0.18 + grain * 0.06 - tone * 0.06);
    return { r, g, b, h, rough };
  },
  macro(u, v) {
    const f = macroFields(u, v, 100);
    return {
      // damp/mossy blotches, a scuffed-pale centre, grime creeping up the rim
      tint: (f.blotch - 0.5) * 1.5 + (f.fine - 0.5) * 0.5 + f.centre * 0.45 - f.rim * 0.5,
      // trampled centre polishes; the mossy rim stays rough
      rough: (f.patch - 0.5) * 1.2 - f.centre * 0.55 + f.rim * 0.4,
      h: f.blotch * 0.7 + f.patch * 0.3,
    };
  },
};

// ------------------------------------------------------------------ dirt ---
// Packed earth for arena.godie: lumpy, pebbly, dry-crazed.
const dirt: GroundStyle = {
  id: "dirt",
  label: "packed earth with pebbles",
  reliefWorld: 0.045,
  macroReliefWorld: 0.18,
  ao: 0.72,
  paint(u, v) {
    // Earth gets structure at EVERY scale rather than one readable motif. The
    // first cut layered a ridged "dry crazing" net over the lumps; ridged noise
    // thresholds into closed contour loops, and at 12 repeats across the zone
    // those loops read as a stamped camo pattern that made the tiling obvious.
    // Three plain fBm scales plus a domain warp leave nothing to lock onto.
    const warp = (fbm(u, v, 5, 3, 210) - 0.5) * 0.06;
    const lumps = fbm(u + warp, v - warp, 5, 5, 201);
    const mid = fbm(u, v, 17, 4, 211);
    const grain = fbm(u, v, 52, 4, 202);
    const micro = fbm(u, v, 180, 2, 203);

    // pebbles: only ~40% of cells carry one, and the radius varies per cell, so
    // there is no readable pebble lattice
    const peb = worley(u, v, 22, 204);
    const size = 0.16 + hash1(peb.id, 206) * 0.2;
    const pebble = hash1(peb.id, 205) > 0.58 ? smoothstep(size, size * 0.35, peb.f1) : 0;

    const scuff = fbmAniso(u, v, 24, 6, 3, 208); // dragged, stretched marks

    const h =
      0.5 +
      lumps * 0.26 +
      mid * 0.1 +
      grain * 0.1 +
      micro * 0.03 +
      pebble * 0.22 +
      (scuff - 0.5) * 0.06;

    // averaging three fBm layers pulls the result hard toward 0.5 (variance
    // adds in quadrature), which left the earth a near-flat brown — expand the
    // contrast back out around the mean before mapping it to colour
    const t = clamp01((lumps * 0.5 + mid * 0.22 + grain * 0.28 - 0.5) * 1.9 + 0.5);
    let r = lerp(0.032, 0.126, t);
    let g = lerp(0.021, 0.09, t);
    let b = lerp(0.013, 0.056, t);
    const ochre = fbm(u, v, 4, 3, 209) - 0.5;
    r *= 1 + ochre * 0.3;
    g *= 1 + ochre * 0.12;
    b *= 1 - ochre * 0.1;
    // Pebbles LIGHTEN AND DESATURATE THE LOCAL COLOUR instead of lerping to an
    // absolute grey. A neutral grey speck on saturated brown reads distinctly
    // blue by simultaneous contrast — the first cut looked like someone had
    // sprinkled lavender confetti over the arena.
    const pk = pebble * 0.6;
    r = lerp(r, r * 1.25 + 0.012, pk);
    g = lerp(g, g * 1.25 + 0.01, pk);
    b = lerp(b, b * 1.3 + 0.008, pk);

    const rough = clamp01(0.9 + grain * 0.07 - pebble * 0.14);
    return { r, g, b, h, rough };
  },
  macro(u, v) {
    const f = macroFields(u, v, 200);
    return {
      // a dark trodden bowl in the middle, dusty pale drifts toward the rim
      tint: (f.blotch - 0.5) * 1.6 + (f.patch - 0.5) * 0.7 - f.centre * 0.75 + f.rim * 0.3,
      rough: (f.patch - 0.5) * 1.1 - f.centre * 0.4,
      h: f.blotch * 0.65 + f.patch * 0.35,
    };
  },
};

// ----------------------------------------------------------------- grass ---
// Trodden turf for arena.dota. Blade streaks follow a low-frequency FLOW FIELD,
// so no two patches of grass lie in the same direction — a fixed blade axis is
// one of the loudest tiling tells there is.
const grass: GroundStyle = {
  id: "grass",
  label: "trodden turf with worn soil",
  reliefWorld: 0.035,
  macroReliefWorld: 0.17,
  ao: 0.75,
  paint(u, v) {
    const ang = fbm(u, v, 5, 3, 301) * Math.PI * 2;
    const wu = u + Math.cos(ang) * 0.045;
    const wv = v + Math.sin(ang) * 0.045;
    const blades = fbmAniso(wu, wv, 128, 26, 3, 302);

    const clump = worley(u, v, 11, 303);
    const clumpH = smoothstep(0.9, 0.15, clump.f1);
    const clumpTone = hash1(clump.id, 304);

    const soil = smoothstep(0.62, 0.8, fbm(u, v, 4, 4, 305)); // turf worn through
    const yellow = fbm(u, v, 7, 3, 306) - 0.5;

    const h =
      0.42 + clumpH * 0.22 + blades * 0.26 - soil * 0.18 + fbm(u, v, 60, 3, 307) * 0.06;

    const shade = clamp01(blades * 0.7 + clumpTone * 0.35 + 0.02);
    let r = lerp(0.02, 0.075, shade);
    let g = lerp(0.055, 0.18, shade);
    let b = lerp(0.014, 0.048, shade);
    // sun-bleached / dry patches
    r += yellow * 0.045;
    g += yellow * 0.032;
    b -= yellow * 0.012;
    // bare soil showing through the worn spots
    r = lerp(r, 0.072, soil);
    g = lerp(g, 0.05, soil);
    b = lerp(b, 0.03, soil);

    const rough = clamp01(0.88 + blades * 0.05 - soil * 0.03);
    return { r, g, b, h: clamp01(h), rough };
  },
  macro(u, v) {
    const f = macroFields(u, v, 300);
    // worn paths: a ridged field reads as meandering trails through the turf
    const path = smoothstep(0.72, 1.0, ridged(u, v, 3, 3, 350));
    return {
      tint: (f.blotch - 0.5) * 1.4 + (f.fine - 0.5) * 0.4 - f.centre * 0.5 + path * 0.6,
      rough: (f.patch - 0.5) * 1.0 + path * 0.35,
      h: f.blotch * 0.6 + f.patch * 0.4 - path * 0.25,
    };
  },
};

// ------------------------------------------------------------------ sand ---
// Colosseum arena sand. TWO ripple trains at integer frequencies crossing at an
// angle, each heavily domain-warped and masked so one dominates per region —
// integer frequencies keep sin() seamless across the tile border, the warp and
// the mask stop it reading as wallpaper stripes.
const sand: GroundStyle = {
  id: "sand",
  label: "raked colosseum sand",
  reliefWorld: 0.030,
  macroReliefWorld: 0.15,
  ao: 0.6,
  paint(u, v) {
    // Ripples are STRETCHED NOISE, not sin(). The first cut of this style used
    // two sine trains at integer frequencies crossing at an angle; it tiled
    // perfectly and still failed, because a sine train lays down a hard lattice
    // and at 12 repeats across the zone it read as a plaid basket-weave — the
    // exact "obviously tiled" look task #80 is about. fBm has no period below
    // its lattice, so stretching it gives ripple crests with no global rhythm.
    const ang = fbm(u, v, 4, 3, 401) * Math.PI * 2;
    const wu = u + Math.cos(ang) * 0.06;
    const wv = v + Math.sin(ang) * 0.06;
    // Two stretched fields with SWAPPED axes, blended by a low-frequency mask:
    // ripples run north-south in some regions and east-west in others, and swirl
    // through the blend. A single anisotropic field left every crest on the same
    // axis, which put faint vertical banding right back across the floor.
    const crestV = fbmAniso(wu, wv, 26, 4, 3, 402);
    const crestH = fbmAniso(wu, wv, 4, 26, 3, 403);
    const dirMask = smoothstep(0.35, 0.65, fbm(u, v, 3, 3, 409));
    const crest = lerp(crestV, crestH, dirMask);
    // trampled patches flatten the ripples — kept light here because the macro
    // layer already carries the big churned-arena story without repeating
    const trample = smoothstep(0.52, 0.84, fbm(u, v, 4, 4, 404));
    const ripple = lerp(clamp01((crest - 0.5) * 1.35 + 0.5), 0.5, trample);

    const grain = fbm(u, v, 150, 3, 405);
    const micro = fbm(u, v, 360, 2, 406);
    const peb = worley(u, v, 17, 407);
    const pebble = hash1(peb.id, 408) > 0.8 ? smoothstep(0.2, 0.06, peb.f1) : 0;

    const h =
      0.5 + (ripple - 0.5) * 0.34 + grain * 0.09 + micro * 0.025 + pebble * 0.14;

    const lit = clamp01(ripple * 0.55 + grain * 0.4 + 0.05);
    let r = lerp(0.15, 0.3, lit);
    let g = lerp(0.115, 0.245, lit);
    let b = lerp(0.062, 0.15, lit);
    // compacted sand is darker and slightly damp
    r *= 1 - trample * 0.2;
    g *= 1 - trample * 0.2;
    b *= 1 - trample * 0.16;
    // pebbles read as darker grains of the same sand, not neutral-grey specks
    // (which go blue against the warm base — see the dirt painter)
    const pk = pebble * 0.55;
    r = lerp(r, r * 0.84, pk);
    g = lerp(g, g * 0.85, pk);
    b = lerp(b, b * 0.9, pk);

    const rough = clamp01(0.8 + grain * 0.08 - pebble * 0.12 + trample * 0.05);
    return { r, g, b, h, rough };
  },
  macro(u, v) {
    const f = macroFields(u, v, 400);
    return {
      // bleached dry drifts, a dark churned centre where the fighting happens
      tint: (f.blotch - 0.5) * 1.3 + (f.fine - 0.5) * 0.45 - f.centre * 0.8 + f.rim * 0.35,
      rough: (f.patch - 0.5) * 0.9 + f.centre * 0.35,
      h: f.blotch * 0.7 + f.patch * 0.3,
    };
  },
};

/**
 * Every style a shipped arena actually asks for. `wood` is legal in the schema
 * enum but NO arena sets it (all five use stone/dirt/grass/sand), so shipping a
 * wood set would be ~1.5 MB of pixels nothing loads — groundMaterials.ts maps
 * wood onto the stone set instead.
 */
export const GROUND_STYLES: GroundStyle[] = [stone, dirt, grass, sand];
