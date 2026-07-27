/**
 * arenaSelect — resolve a room's `mapId` to the sim's collision geometry.
 * Looks the id up in the content Arenas registry (populated at boot by
 * registerAll) and converts the doc into an ArenaDef. Falls back to the
 * built-in SKELETON_ARENA when the id is absent, unknown, or the content tree
 * never loaded — so a match ALWAYS gets a valid, playable map.
 */
import { Arenas } from "@ggd/shared/content";
import { SKELETON_ARENA, ROYALE_ARENA, arenaDefFromDoc, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";

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
 * The FINALE map (`arena.royale`) — deliberately NOT in {@link ARENA_ROTATION_IDS}.
 *
 * It is a single 42-radius zone laid out for twelve champions in four spawn
 * clusters; rolling it into an ordinary 3v3 round would put two teams in a field
 * built for four and leave two thirds of it empty. The MatchController selects it
 * by name for round `FINAL_ROUND` and only then.
 *
 * Falls back to the built-in {@link ROYALE_ARENA} when the content tree is not
 * loaded (unit tests, skeleton boot). The shipped doc and the constant are pinned
 * to each other by `royaleArena.test.ts`, so the fallback is the same arena a
 * player sees — never a second, untested geometry.
 */
export function resolveRoyaleArena(): ArenaDef {
  const doc = Arenas.tryGet(ROYALE_ARENA.id);
  return doc ? arenaDefFromDoc(doc) : ROYALE_ARENA;
}

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
