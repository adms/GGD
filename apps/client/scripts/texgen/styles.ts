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
import type { GroundStyleId } from "@ggd/shared/content/schema/groundStyle";
import { fateSplitTone } from "@ggd/shared/art/fatePalette";
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
  /** ⛔ from the single source of truth — a painter with no schema id ships pixels
   *  nothing can ask for, and a schema id with no painter ships a dead floor. */
  id: GroundStyleId;
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
  /**
   * ⭐ GH#453 —— FATE 分離調色的強度（0 = 原樣，逐位元組不變）。
   *
   * owner 2026-08-19：「我們**擴充地圖物件跟生成圖片、貼圖也盡量 FATE 相關風格**」
   *
   * 色相從 `@ggd/shared/art/fatePalette` 的**同一份 token** 來 —— ⛔ 這裡不可以
   * 出現 hex。`fateSplitTone()` 只轉色相、把亮度除回去（見那支的檔頭），所以
   * 對比／起伏／AO／粗糙度**一位元都沒動** ⇒ 既有的地面手感留著，只是光變成
   * 暖金 + 冷靛。
   *
   * ⚠️ 逐 style 不同是**刻意**的，⛔ 不是懶得統一：`obsidian` 本來就是黑底描金
   * （FATE 的正中央）吃得下很多；`grass` 的草如果被推成金色就不是草了。
   * 這是一格「之後應該搬進後台」的數字 —— 現在住在這裡，見 GH#453 的 nextRound。
   */
  fateTone: number;
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
  /** 冷花崗岩 → 靛藍陰影＋金色受光面，變化最明顯 */
  fateTone: 0.3,
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
  /** 泥土的暖色可以再暖一點 */
  fateTone: 0.16,
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
  /** ⭐ 全套最低：草的綠是它的身分 */
  fateTone: 0.1,
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
  /** 沙是中性暖色，金／靛分得最開 */
  fateTone: 0.2,
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

// ------------------------------------------------------------------ wood ---
// Polished hinoki corridor — the 縁側 of a Japanese castle (GH#342). Boards run
// along V, and each board's butt joints are STAGGERED by a per-board hash: a
// shared joint row running clean across the tile is the loudest tell a plank
// floor is tiled, louder than the board edges themselves.
/** boards across one TILE_WORLD_SIZE tile → ~33 cm boards */
const PLANKS = 12;
/** butt joints per board per tile */
const PLANK_SEGMENTS = 2;

const wood: GroundStyle = {
  id: "wood",
  label: "polished hinoki corridor",
  reliefWorld: 0.022,
  macroReliefWorld: 0.1,
  ao: 0.62,
  /** 檜木本來就偏暖，往金推一點剛好 */
  fateTone: 0.16,
  paint(u, v) {
    const pf = u * PLANKS;
    const pi = Math.floor(pf);
    const pu = pf - pi; // 0..1 across the board
    // stagger: each board starts its segment run at its own offset, so no two
    // neighbouring boards share a butt joint
    const off = hash1(pi, 11) * PLANK_SEGMENTS;
    const sf = v * PLANK_SEGMENTS + off;
    const si = Math.floor(sf);
    const sv = sf - si; // 0..1 along the board segment — continuous across v=0/1
    const boardId = (((si % PLANK_SEGMENTS) + PLANK_SEGMENTS) % PLANK_SEGMENTS) * PLANKS + pi;

    // grooves: board edges (deep) and butt joints (shallower, they butt tight)
    const edge = Math.min(pu, 1 - pu);
    const seam = 1 - smoothstep(0.012, 0.05, edge);
    const butt = (1 - smoothstep(0.004, 0.02, Math.min(sv, 1 - sv))) * 0.7;
    const groove = clamp01(seam + butt);

    // grain: stretched along the board (fast across x, slow along y) plus a
    // finer figure. Both are global fBm, so the grain does NOT restart at a
    // board edge — real boards are cut from one log, and a grain that resets
    // per board reads as printed wallpaper.
    const grain = fbmAniso(u, v, 220, 10, 4, 501);
    const figure = fbmAniso(u, v, 60, 4, 3, 502);
    const micro = fbm(u, v, 190, 2, 503);

    // knots: at most one per board segment, and only on ~18 % of them
    const kx = hash1(boardId, 61);
    const ky = hash1(boardId, 62);
    const knotOn = hash1(boardId, 63) > 0.82 ? 1 : 0;
    const kd = Math.hypot((pu - kx) * 0.6, sv - ky);
    const knot = knotOn * smoothstep(0.11, 0.02, kd);

    const tone = hash1(boardId, 71);
    const h =
      0.66 + (tone - 0.5) * 0.05 + (grain - 0.5) * 0.1 + micro * 0.02 - groove * 0.5 - knot * 0.18;

    // warm pale hinoki; per-board tone spread is what keeps a corridor from
    // reading as one printed sheet
    const t = clamp01(0.28 + tone * 0.5 + (figure - 0.5) * 0.55 + (grain - 0.5) * 0.35);
    let r = lerp(0.078, 0.225, t);
    let g = r * (0.66 + (figure - 0.5) * 0.06);
    let b = r * (0.35 + (grain - 0.5) * 0.05);
    // dark heartwood streaks along the grain
    const dark = smoothstep(0.66, 0.9, grain) * 0.5;
    r = lerp(r, r * 0.62, dark);
    g = lerp(g, g * 0.58, dark);
    b = lerp(b, b * 0.6, dark);
    // knots are near-black resin
    r = lerp(r, 0.028, knot * 0.85);
    g = lerp(g, 0.019, knot * 0.85);
    b = lerp(b, 0.012, knot * 0.85);
    // grooves: shadowed gaps, not painted lines
    r = lerp(r, 0.012, groove);
    g = lerp(g, 0.009, groove);
    b = lerp(b, 0.006, groove);

    // waxed boards are the smoothest floor in the set; the grooves are not
    const rough = clamp01(0.34 + (grain - 0.5) * 0.12 + groove * 0.45 + knot * 0.2);
    return { r, g, b, h, rough };
  },
  macro(u, v) {
    const f = macroFields(u, v, 500);
    return {
      // the walked centre is polished pale; the edges keep their dark wax
      tint: (f.blotch - 0.5) * 1.1 + (f.fine - 0.5) * 0.4 + f.centre * 0.5 - f.rim * 0.55,
      rough: (f.patch - 0.5) * 0.8 - f.centre * 0.6 + f.rim * 0.35,
      h: f.blotch * 0.7 + f.patch * 0.3,
    };
  },
};

// ---------------------------------------------------------------- tatami ---
// Rush mats in the 市松 layout (GH#342). Unlike every other style here the
// LATTICE IS THE MOTIF — a tatami room is laid on a grid and reads wrong
// without one. What must not repeat is the mats' CONTENT, so tone, bleaching
// and rush direction are per-mat hashes and the macro layer carries the
// sun-fade. A 4u tile holds four 2u blocks; each block is two 1u×2u mats, and
// neighbouring blocks lay theirs on opposite axes.
/** rush ribs across one tile — integer, so the ribbing wraps */
const TATAMI_RIBS = 96;

const tatami: GroundStyle = {
  id: "tatami",
  label: "igusa tatami, 市松 layout",
  reliefWorld: 0.02,
  macroReliefWorld: 0.09,
  ao: 0.55,
  /** 藺草是綠的，推太多就不是榻榻米了 */
  fateTone: 0.12,
  paint(u, v) {
    const bx = u * 2;
    const by = v * 2;
    const bi = Math.floor(bx);
    const bj = Math.floor(by);
    const fx = bx - bi;
    const fy = by - bj;
    const vertical = (bi + bj) % 2 === 0;
    // `ml` runs across the mat's SHORT side (the 1u one), `mlong` along it
    const pair = vertical ? fx * 2 : fy * 2;
    const matIdx = Math.floor(pair);
    const ml = pair - matIdx;
    const mlong = vertical ? fy : fx;
    const matId = (bj * 2 + bi) * 2 + matIdx;

    // 縁 — the cloth border runs down the two LONG edges only
    const heri = 1 - smoothstep(0.035, 0.07, Math.min(ml, 1 - ml));
    // gaps between mats: a hair of shadow on every side
    const gap = clamp01(
      (1 - smoothstep(0.004, 0.016, Math.min(ml, 1 - ml))) +
        (1 - smoothstep(0.002, 0.008, Math.min(mlong, 1 - mlong))),
    );

    // rush ribs run ALONG the mat, so their phase axis is the short one
    const ribPhase = (vertical ? u : v) * TATAMI_RIBS;
    const rib = Math.abs((ribPhase - Math.floor(ribPhase)) * 2 - 1);
    const weave = fbmAniso(u, v, vertical ? 300 : 14, vertical ? 14 : 300, 3, 601);
    const fibre = fbm(u, v, 160, 2, 602);

    const age = hash1(matId, 81); // sun-bleached mats go straw-yellow
    const wear = hash1(matId, 82);

    const h =
      0.6 + (0.5 - Math.abs(ml - 0.5)) * 0.06 + rib * 0.14 + weave * 0.08 - gap * 0.55 + heri * 0.06;

    // fresh igusa is green; aged igusa is straw
    const t = clamp01(age * 0.75 + (weave - 0.5) * 0.5 + fibre * 0.2);
    let r = lerp(0.082, 0.2, t);
    let g = lerp(0.105, 0.168, t);
    let b = lerp(0.042, 0.072, t);
    // ribs catch the light; the valleys between them stay dark
    const shade = 0.86 + rib * 0.26 - wear * 0.08;
    r *= shade;
    g *= shade;
    b *= shade;
    // 縁: dark indigo cloth with a faint woven sheen
    const heriSheen = 0.8 + fbmAniso(u, v, vertical ? 6 : 240, vertical ? 240 : 6, 2, 603) * 0.5;
    r = lerp(r, 0.021 * heriSheen, heri);
    g = lerp(g, 0.018 * heriSheen, heri);
    b = lerp(b, 0.032 * heriSheen, heri);
    // gaps
    r = lerp(r, 0.01, gap);
    g = lerp(g, 0.01, gap);
    b = lerp(b, 0.009, gap);

    const rough = clamp01(0.82 - rib * 0.08 + gap * 0.12 - heri * 0.16);
    return { r, g, b, h, rough };
  },
  macro(u, v) {
    const f = macroFields(u, v, 600);
    // sun through the shoji bleaches whole stretches of floor, not single mats
    const sun = smoothstep(0.35, 0.85, fbm(u, v, 2, 3, 650));
    return {
      tint: (f.blotch - 0.5) * 1.0 + sun * 0.85 - f.centre * 0.35,
      rough: (f.patch - 0.5) * 0.7 - f.centre * 0.45 + sun * 0.2,
      h: f.blotch * 0.6 + f.patch * 0.4,
    };
  },
};

// -------------------------------------------------------------- obsidian ---
// Polished black slabs with gold veining — the Great Tomb's floor (GH#342).
// Slabs are VORONOI, same reason as stone: a square lattice of black tiles at
// 12 repeats across the zone is a chessboard. The joints are BRIGHT here (gold
// inlay), which is the whole read: dark field, luminous seams.
const obsidian: GroundStyle = {
  id: "obsidian",
  label: "polished obsidian with gold veins",
  reliefWorld: 0.028,
  macroReliefWorld: 0.11,
  ao: 0.55,
  /** 黑底描金＝FATE 的正中央，吃得下最多 */
  fateTone: 0.45,
  paint(u, v) {
    const wu = u + 0.012 * (fbm(u, v, 5, 3, 701) - 0.5);
    const wv = v + 0.012 * (fbm(u, v, 5, 3, 702) - 0.5);
    const cell = worley(wu, wv, 3, 13); // ~1.3u slabs
    const border = cell.f2 - cell.f1;
    const joint = 1 - smoothstep(0.006, 0.03, border);

    const tone = hash1(cell.id, 91);
    const polish = hash1(cell.id, 92);
    // Veins wander across slab faces; each slab decides how veined it is. The
    // threshold is HIGH on purpose — the first cut used 0.9 and the gold網
    // covered more of the floor than the stone did, which reads as lava, not
    // as inlay. Inlay is a thin bright line on a dark field.
    const veinField = ridged(u + 0.03 * fbm(u, v, 6, 2, 703), v, 7, 3, 704);
    const vein = smoothstep(0.965, 1.0, veinField) * (0.2 + 0.8 * hash1(cell.id, 93));
    const micro = fbm(u, v, 200, 2, 705);
    const swirl = fbm(u, v, 26, 3, 706);

    const h = 0.7 + (tone - 0.5) * 0.03 + micro * 0.015 + vein * 0.05 - joint * 0.45;

    // near-black with a cold blue cast; the swirl keeps it from reading as felt
    const baseL = 0.011 + tone * 0.016 + swirl * 0.01 + micro * 0.004;
    let r = baseL * 0.92;
    let g = baseL * 0.96;
    let b = baseL * 1.25;
    // gold: veins and the inlaid joints are the same metal
    const gold = clamp01(vein * 0.9 + joint * 0.85);
    r = lerp(r, 0.24, gold);
    g = lerp(g, 0.165, gold);
    b = lerp(b, 0.052, gold);

    // mirror-polished stone; the gold is duller than the slab it sits in
    const rough = clamp01(0.16 + polish * 0.1 + gold * 0.35 + swirl * 0.05);
    return { r, g, b, h, rough };
  },
  macro(u, v) {
    const f = macroFields(u, v, 700);
    return {
      // scuffed dull centre where the fighting happens, mirror rim
      tint: (f.blotch - 0.5) * 0.9 + (f.fine - 0.5) * 0.3 - f.centre * 0.4,
      rough: (f.patch - 0.5) * 0.9 + f.centre * 0.6 - f.rim * 0.3,
      h: f.blotch * 0.6 + f.patch * 0.4,
    };
  },
};

/**
 * Every style the schema can name. ⛔ This list and
 * `GROUND_STYLE_IDS` (packages/shared/src/content/schema/groundStyle.ts) must
 * stay the SAME SET — a painter with no id ships pixels nothing can ask for, an
 * id with no painter ships a floor that silently falls back to flat colour.
 * `groundMaterials.test.ts` holds both directions.
 */
/**
 * ⭐ GH#453 —— 把 FATE 分離調色**包在 painter 外面**，⛔ 不是在七支 painter 裡各
 * 貼一段。第零守則⑨：第二支跟第一支只差一個參數（`fateTone`）⇒ 抽一次包裝。
 *
 * ⚠️ 包在**這裡**（而不是 `gen-ground.ts` 的寫檔迴圈）是刻意的：`GROUND_STYLES`
 * 是產生器唯一讀到的東西，所以守衛只要拿 `GROUND_STYLES[i].paint()` 就等於拿到
 * **出貨的那條路徑**（失敗形態⑤：被測的不是出貨的那個）。`gen-ground.ts` 是一支
 * top-level 就寫檔的腳本，測試 import 不進去。
 */
function fateGraded(style: GroundStyle): GroundStyle {
  if (style.fateTone <= 0) return style;
  const paint = style.paint.bind(style);
  const [lo, hi] = toneRangeOf(paint);
  return {
    ...style,
    paint(u, v) {
      const t = paint(u, v);
      const [r, g, b] = fateSplitTone([t.r, t.g, t.b], style.fateTone, lo, hi);
      return { ...t, r, g, b };
    },
  };
}

/**
 * 這支 painter **自己的**亮度區間（sRGB 0..1 的 5%／95% 分位數）——
 * `fateSplitTone` 的 `lo`/`hi`。
 *
 * ⭐ 量出來的，⛔ 不是每支 style 手填兩個數字（那會是第 N 個住處，而且畫家一改
 * 顏色它就過期）。64² 是固定網格取樣 ⇒ 完全決定性；4,096 次呼叫對一次
 * 512² = 262,144 次的產生來說是 1.6% 的成本。
 *
 * ⚠️ 取**分位數**不是 min/max：一顆最亮的鵝卵石或一條最黑的縫就會把區間撐開，
 * 於是其餘 99.9% 又被擠回中間 —— 那就是第二版「方向對但看不見」的病。
 */
function toneRangeOf(paint: (u: number, v: number) => Texel): [number, number] {
  const N = 64;
  const vals: number[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = paint((x + 0.5) / N, (y + 0.5) / N);
      const l = Math.max(0, 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b);
      vals.push(l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
    }
  }
  vals.sort((a, b) => a - b);
  const at = (q: number): number => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))]!;
  return [at(0.05), at(0.95)];
}

/**
 * ⭐ **還沒**上 FATE 調色的畫家。⛔ 產生器不讀這一份 —— 它存在是為了讓守衛
 * 拿得到「同一支 painter 的 before」，於是「`.map(fateGraded)` 被拿掉」這件事
 * 有一條會紅的線（⛔ 不是靠斷言一個湊出來的比值）。
 */
export const RAW_GROUND_STYLES: readonly GroundStyle[] = [
  stone,
  dirt,
  grass,
  sand,
  wood,
  tatami,
  obsidian,
];

export const GROUND_STYLES: GroundStyle[] = RAW_GROUND_STYLES.map(fateGraded);
