/**
 * voxelSkin/hash — the ONLY entropy source in the skin generator.
 *
 * THE DETERMINISM CONTRACT (#231): same champion ⇒ same skin, on every client,
 * on every build, forever. So: FNV-1a over a versioned, explicitly delimited
 * string; no `Math.random`, no `Date`, no `Object.keys` iteration order, no
 * locale-dependent sort, no floating-point accumulation. Every choice in
 * generate.ts is `channel(...) % frozenArray.length`.
 *
 * The seed is the championId — NOT the name and NOT the modelKey. That is what
 * keeps the 14 exact-name collision pairs (亞瑟王-Saber ×2, 龍宮禮奈 ×2, …) and
 * the 18 champions sharing `champ.sela` apart: they differ in exactly one field
 * and it is the one we hash.
 */

/** Bump ONLY to intentionally re-roll the whole roster. */
export const VOXEL_SKIN_SEED_NS = "ggd-voxel-skin@1";

/**
 * FNV-1a (32-bit) over the UTF-16 code units of `s`, low byte then high byte.
 * Byte-order is spelled out rather than left to a TextEncoder so the value is
 * identical in node, the browser and any future runtime.
 */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h ^= c & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    h ^= (c >> 8) & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * One independent random CHANNEL for a champion. `salt` is the collision
 * ratchet (1 normally; bumped only when two champions land the same look
 * signature); `channel` names the decision so two decisions never correlate.
 */
export function channel(id: string, salt: number, name: string): number {
  return fnv1a32(`${VOXEL_SKIN_SEED_NS}|${id}|${salt}|${name}`);
}

/** Pick from a FROZEN, ORDERED array. Reordering the array re-rolls the roster. */
export function pick<T>(id: string, salt: number, name: string, arr: readonly T[]): T {
  return arr[channel(id, salt, name) % arr.length] as T;
}

/** Uniform in [0,1). */
export function frac(id: string, salt: number, name: string): number {
  return channel(id, salt, name) / 4294967296;
}

/** Deterministic ±1 dither for per-texel shading noise (paint.ts). */
export function dither(seed: number, x: number, y: number): number {
  const h = fnv1a32(`${seed}:${x}:${y}`);
  return (h & 3) - 1.5; // -1.5, -0.5, 0.5, 1.5
}
