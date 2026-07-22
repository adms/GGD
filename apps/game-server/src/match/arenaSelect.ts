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
