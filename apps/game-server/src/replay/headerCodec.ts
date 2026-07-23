/**
 * Header build + rebuild — the two halves of the replay identity contract.
 *
 * `buildHeader` runs once at match creation, from the live objects MatchRoom
 * just resolved. `rebuildRules` / `rebuildWhitelist` / `rebuildArena` run at
 * playback, turning the recorded values back into the exact constructor
 * arguments the original MatchController received. If a field is added to one
 * side and not the other, the replay quietly plays a different match — which is
 * why they live in one file, next to each other.
 */
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { arenaDefFromDoc, SKELETON_ARENA, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { Arenas } from "@ggd/shared/content";
import type { FireRingConfig } from "@ggd/shared/content";
import type { PhaseConfig } from "../match/PhaseMachine";
import { DEFAULT_ARENA_RULES, type ArenaRules, type RoundGrant } from "../match/arenaRules";
import { Whitelist } from "../curation/whitelist";
import type { Seat } from "../seat/Seat";
import { REPLAY_FORMAT_VERSION, type ReplayHeader, type ReplaySeat } from "./format";
import { buildStamp, registryFingerprint } from "./fingerprint";

/** `ArenaRules.rounds` is a Map; JSON needs it as entries. */
type SerializedArenaRules = Omit<ArenaRules, "rounds"> & { rounds: [number, RoundGrant][] };

export interface BuildHeaderInput {
  matchId: string;
  seed: number;
  contentVersion: string;
  seats: Iterable<[number, Seat]>;
  specIsBot: (seatId: number) => boolean;
  startingLives: number;
  arena: ArenaDef;
  arenaPool: readonly ArenaDef[];
  combatEnv: CombatEnvMultipliers;
  phaseConfig: PhaseConfig;
  fireRing: FireRingConfig | null;
  arenaRules: ArenaRules;
  whitelist: Whitelist;
  env: ReplayHeader["env"];
}

export function buildHeader(input: BuildHeaderInput): ReplayHeader {
  const seats: ReplaySeat[] = [];
  for (const [seatId, seat] of input.seats) {
    seats.push({
      seatId,
      teamId: seat.teamId,
      accountId: seat.accountId,
      displayName: seat.displayName,
      championId: seat.championId,
      isBot: input.specIsBot(seatId),
      driver: seat.driverKind,
    });
  }
  const rules: SerializedArenaRules = { ...input.arenaRules, rounds: [...input.arenaRules.rounds] };
  return {
    formatVersion: REPLAY_FORMAT_VERSION,
    matchId: input.matchId,
    startedAt: new Date().toISOString(),
    seed: input.seed,
    contentVersion: input.contentVersion,
    registryFingerprint: registryFingerprint(),
    buildStamp: buildStamp(),
    seats,
    startingLives: input.startingLives,
    arenaId: input.arena.id,
    arenaPoolIds: input.arenaPool.map((a) => a.id),
    combatEnv: input.combatEnv,
    phaseConfig: { ...input.phaseConfig },
    fireRing: input.fireRing,
    arenaRules: rules,
    whitelist: {
      bypass: input.whitelist.bypass,
      champions: input.whitelist.snapshotChampions(),
      items: input.whitelist.snapshotItems(),
      abilities: input.whitelist.snapshotAbilities(),
    },
    env: input.env,
  };
}

/** Turn the recorded rules back into a live ArenaRules (rounds Map restored). */
export function rebuildRules(header: ReplayHeader): ArenaRules {
  const raw = header.arenaRules as SerializedArenaRules | undefined;
  if (!raw || !Array.isArray(raw.rounds)) return DEFAULT_ARENA_RULES;
  return { ...raw, rounds: new Map(raw.rounds) };
}

/**
 * Rebuild the exact curation snapshot the match ran under — NOT whatever the
 * platform serves today. This is the whole reason the whitelist is in the
 * header: it is consulted before an rng roll (economy/legendaryOrb.ts), so
 * replaying under a different one shifts the random stream and desyncs the rest
 * of the match; and it fail-safes to allow-all on a platform outage, so "the
 * same server, same seed" is not a stable input at all.
 */
export function rebuildWhitelist(header: ReplayHeader): Whitelist {
  if (header.whitelist.bypass) return Whitelist.allowAll();
  return new Whitelist(
    {
      version: 0,
      champions: header.whitelist.champions,
      items: header.whitelist.items,
      abilities: header.whitelist.abilities,
    },
    false,
  );
}

/**
 * Resolve a recorded arena id against THIS host's content. Returns null when the
 * host does not have it — playback refuses rather than silently substituting the
 * skeleton, which would change collision geometry and every movement path.
 */
export function rebuildArena(id: string): ArenaDef | null {
  if (id === SKELETON_ARENA.id) return SKELETON_ARENA;
  const doc = Arenas.tryGet(id);
  return doc ? arenaDefFromDoc(doc) : null;
}
