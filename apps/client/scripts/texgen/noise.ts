/**
 * texgen/noise — the tiny procedural-texture kernel behind gen-ground.ts.
 *
 * EVERY generator here is SEAMLESS BY CONSTRUCTION, not by mirroring or by
 * blending a border: the lattices wrap in integer cell space, so the texel at
 * u=0.999 and the texel at u=0.001 read the same lattice corners. That matters
 * because the arena floor tiles the detail set ~12× across a 48-unit zone; a
 * visible seam would be the same "拼接方塊" complaint (task #80) in a new form.
 *
 * Nothing here is random at runtime — every function is a pure hash of its
 * integer lattice coordinates plus a seed, so `tsx gen-ground.ts` writes
 * byte-identical PNGs on any machine, the same contract gen-cursors.ts and
 * gen-icons.ts already hold.
 */

/** Integer avalanche hash (Wang-style mix) → uint32. */
function hashInt(a: number): number {
  let x = a | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = (x + (x << 3)) | 0;
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

/** Hash a 2D integer lattice cell + seed → [0,1). */
export function hash2i(ix: number, iy: number, seed: number): number {
  return (
    hashInt(Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) /
    4294967296
  );
}

/** Hash a single integer + seed → [0,1). Used for per-cell attributes. */
export function hash1(id: number, seed: number): number {
  return hashInt(Math.imul(id, 2654435761) + Math.imul(seed, 40503)) / 4294967296;
}

/** Positive modulo — lattice wrap. */
function wrap(i: number, period: number): number {
  return ((i % period) + period) % period;
}

/** Quintic smoothstep (C2 — no lattice creasing in the derived normal map). */
function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Value noise on a wrapping RECTANGULAR lattice: `periodX`/`periodY` lattice
 * cells across the full [0,1) texture on each axis. Each axis wraps with its
 * OWN period, which is what keeps the stretched (anisotropic) variant seamless
 * — squashing a coordinate into a square lattice instead would leave the y
 * axis mid-cell at v=1 and put a hard seam across every tile border.
 */
export function valueNoise2(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const fx = x * periodX;
  const fy = y * periodY;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = quintic(fx - x0);
  const ty = quintic(fy - y0);
  const xa = wrap(x0, periodX);
  const xb = wrap(x0 + 1, periodX);
  const ya = wrap(y0, periodY);
  const yb = wrap(y0 + 1, periodY);
  const v00 = hash2i(xa, ya, seed);
  const v10 = hash2i(xb, ya, seed);
  const v01 = hash2i(xa, yb, seed);
  const v11 = hash2i(xb, yb, seed);
  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
}

/** Square-lattice value noise. Any integer `period` tiles seamlessly. */
export function valueNoise(x: number, y: number, period: number, seed: number): number {
  return valueNoise2(x, y, period, period, seed);
}

/**
 * Fractal sum of `octaves` value-noise layers, each at double the previous
 * period — every period stays an integer, so the sum still tiles. Returns
 * [0,1] (normalised by the amplitude sum).
 */
export function fbm(
  x: number,
  y: number,
  period: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let p = period;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x, y, p, seed + o * 1013);
    norm += amp;
    amp *= gain;
    p *= 2;
  }
  return sum / norm;
}

/** fBm with independently scaled axes — stretches features into streaks. */
export function fbmAniso(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let px = periodX;
  let py = periodY;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x, y, px, py, seed + o * 7717);
    norm += amp;
    amp *= gain;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

/** Ridged noise — sharp creases instead of rounded blobs (cracks, crazing). */
export function ridged(x: number, y: number, period: number, octaves: number, seed: number): number {
  return 1 - Math.abs(fbm(x, y, period, octaves, seed) * 2 - 1);
}

export interface WorleyResult {
  /** distance to the nearest feature point, in CELL units */
  f1: number;
  /** distance to the second-nearest — `f2 - f1` is the cell-border field */
  f2: number;
  /** wrapped cell index of the nearest feature point (stable per cell) */
  id: number;
}

/**
 * Worley/Voronoi on a wrapping grid of `cells`×`cells`. Feature points are
 * hash-jittered inside their cell, and neighbour lookups wrap, so this tiles.
 *
 * This is THE reason the stone floor does not read as a grid: slabs are Voronoi
 * cells with irregular borders, not square pavers on a lattice.
 */
export function worley(x: number, y: number, cells: number, seed: number): WorleyResult {
  const fx = x * cells;
  const fy = y * cells;
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  let f1 = 1e9;
  let f2 = 1e9;
  let id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gy = cy + oy;
      const wx = wrap(gx, cells);
      const wy = wrap(gy, cells);
      const px = gx + hash2i(wx, wy, seed);
      const py = gy + hash2i(wx, wy, seed + 7717);
      const dx = px - fx;
      const dy = py - fy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = wy * cells + wx;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, id };
}

// ---------------------------------------------------------------- buffers ---

/** Wrapped fetch from a square float buffer. */
export function sampleWrapped(buf: Float32Array, size: number, x: number, y: number): number {
  return buf[wrap(y, size) * size + wrap(x, size)]!;
}

/**
 * Separable box blur with WRAPPING edges (a non-wrapping blur would darken the
 * derived AO along the tile border and reintroduce a seam).
 */
export function blurWrapped(src: Float32Array, size: number, radius: number): Float32Array {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const span = radius * 2 + 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += sampleWrapped(src, size, x + k, y);
      tmp[y * size + x] = s / span;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += sampleWrapped(tmp, size, x, y + k);
      out[y * size + x] = s / span;
    }
  }
  return out;
}

/**
 * Tangent-space normal from a height field, OpenGL/glTF convention (+Y up,
 * which is what Babylon expects with the default invertNormalMapX/Y = false).
 *
 *   n ∝ ( -(hRight - hLeft)/2 , (hDown - hUp)/2 , 1/strength )
 *
 * `down` is the NEXT row: image v runs downward while tangent +Y runs upward,
 * so the V derivative is negated once — get this backwards and every lit bump
 * on the floor reads as a dent.
 */
export function normalFromHeight(
  height: Float32Array,
  size: number,
  strength: number,
): { nx: Float32Array; ny: Float32Array; nz: Float32Array } {
  const nx = new Float32Array(size * size);
  const ny = new Float32Array(size * size);
  const nz = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = sampleWrapped(height, size, x - 1, y);
      const hr = sampleWrapped(height, size, x + 1, y);
      const hu = sampleWrapped(height, size, x, y - 1);
      const hd = sampleWrapped(height, size, x, y + 1);
      let vx = -((hr - hl) / 2) * strength;
      let vy = ((hd - hu) / 2) * strength;
      let vz = 1;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      vx /= len;
      vy /= len;
      vz /= len;
      const i = y * size + x;
      nx[i] = vx;
      ny[i] = vy;
      nz[i] = vz;
    }
  }
  return { nx, ny, nz };
}

/**
 * Cheap cavity ambient occlusion: a texel sitting BELOW its neighbourhood
 * average is in a groove. Two radii so both mortar lines (narrow) and broad
 * dishing (wide) darken. Returns [0,1], 1 = unoccluded.
 */
export function cavityAo(height: Float32Array, size: number, strength: number): Float32Array {
  const narrow = blurWrapped(height, size, Math.max(1, Math.round(size / 128)));
  const wide = blurWrapped(height, size, Math.max(2, Math.round(size / 40)));
  const ao = new Float32Array(size * size);
  for (let i = 0; i < ao.length; i++) {
    const occ = clamp01((narrow[i]! - height[i]!) * 1.7 + (wide[i]! - height[i]!) * 2.4);
    ao[i] = 1 - strength * occ;
  }
  return ao;
}

/** Linear → sRGB transfer. Albedo PNGs are read as gamma-space by Babylon. */
export function toSrgb(c: number): number {
  const x = clamp01(c);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
