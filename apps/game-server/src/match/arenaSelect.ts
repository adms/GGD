/**
 * arenaSelect — resolve a room's `mapId` to the sim's collision geometry.
 * Looks the id up in the content Arenas registry (populated at boot by
 * registerAll) and converts the doc into an ArenaDef. Falls back to the
 * built-in SKELETON_ARENA when the id is absent, unknown, or the content tree
 * never loaded — so a match ALWAYS gets a valid, playable map.
 */
import { Arenas } from "@ggd/shared/content";
import { SKELETON_ARENA, arenaDefFromDoc, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";

export function resolveArena(mapId?: string): ArenaDef {
  if (!mapId || mapId === SKELETON_ARENA.id) return SKELETON_ARENA;
  const doc = Arenas.tryGet(mapId);
  if (!doc) return SKELETON_ARENA;
  return arenaDefFromDoc(doc);
}

/**
 * The per-round arena ROTATION pool (task #145): every shipped arena, in a fixed
 * authored order so the seed→arena mapping is stable across server restarts (a
 * registry-iteration order would depend on content-load order). The MatchController
 * rotates through this deterministically each combat round.
 *
 * Fixed here rather than derived from `Arenas.ids()` on purpose: determinism must
 * not hinge on which docs happened to load or in what order. The skeleton is the
 * built-in fallback; the four themed maps come from content and are simply skipped
 * if a given install has not loaded them (so a bare boot still rotates over
 * whatever it has).
 */
export const ARENA_ROTATION_IDS: readonly string[] = [
  "arena.skeleton",
  "arena.castle",
  "arena.colosseum",
  "arena.dota",
  "arena.godie",
];

/**
 * Resolve {@link ARENA_ROTATION_IDS} to the loaded {@link ArenaDef}s, in order,
 * de-duplicated by id. Ids absent from the content registry are dropped (the
 * skeleton is always present as the built-in). An install with no themed arenas
 * loaded yields just `[SKELETON_ARENA]`, which the controller treats as "no
 * rotation" — behaviour identical to the pre-#145 fixed map.
 */
export function resolveArenaPool(): ArenaDef[] {
  const pool: ArenaDef[] = [];
  const seen = new Set<string>();
  for (const id of ARENA_ROTATION_IDS) {
    let def: ArenaDef | null = null;
    if (id === SKELETON_ARENA.id) def = SKELETON_ARENA;
    else {
      const doc = Arenas.tryGet(id);
      if (doc) def = arenaDefFromDoc(doc);
    }
    if (def && !seen.has(def.id)) {
      pool.push(def);
      seen.add(def.id);
    }
  }
  return pool;
}
