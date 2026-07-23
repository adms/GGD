/**
 * arenaSelect — task #145 (client half). Resolve which arena the client should
 * RENDER this round from the authoritative match state.
 *
 * The sim now picks a NEW arena each round and broadcasts the chosen id in the
 * round/match state. This pure resolver reads that id, PREFERRING a dedicated
 * per-round field when the sim exposes one, and falling back to the match-level
 * `mapId` (the only arena field that exists today) so the client keeps working
 * unchanged while the sim change is still landing. Every field is optional and
 * read structurally, so a missing/absent field is "" — never a crash — and the
 * caller then simply keeps the current arena.
 *
 * Pure + node-testable (no Babylon, no state store), in the spirit of
 * settlementCamera.ts / viewportRects.ts.
 */

/**
 * The (all-optional) arena-id fields this resolver understands, most-specific
 * first. The exact per-round field name the sim lands on is not frozen yet, so
 * a few likely spellings are accepted; whichever one carries a non-empty string
 * wins. `mapId` is the match-level fallback that exists in the schema today.
 */
export interface ArenaIdSource {
  /** dedicated per-round arena id (future sim field candidates) */
  roundArenaId?: string;
  roundMapId?: string;
  arenaId?: string;
  /** match-level fallback (present in the schema today) */
  mapId?: string;
}

/**
 * The arena id to render, or "" when the state exposes none (the caller no-ops,
 * keeping whatever arena is already built). A per-round field only WINS over
 * `mapId` when it is a non-empty string, so an absent/empty per-round field can
 * never blank out the working `mapId`.
 */
export function resolveArenaId(state: ArenaIdSource | null | undefined): string {
  if (!state) return "";
  const perRound = firstNonEmpty(state.roundArenaId, state.roundMapId, state.arenaId);
  if (perRound) return perRound;
  return typeof state.mapId === "string" ? state.mapId : "";
}

/** First argument that is a non-empty string, or "" when none qualify. */
function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}
