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
import { baseBonusFromDoc, normalizeBaseBonus, type BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import { Configs } from "@ggd/shared/content";
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
  baseBonus: BaseBonusTable;
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
    baseBonus: { ...input.baseBonus },
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

/**
 * Turn the recorded rules back into a live ArenaRules (rounds Map restored).
 *
 * ⚠️ 這裡是**整份 spread**，不是逐格複製 —— 所以 `ArenaRules` 新增的欄位
 * （例：#340 的 `draftConflict`）自動被錄下來也自動被還原，⛔ 不需要在這裡列名。
 *
 * ⚠️ 2026-08-17 之前錄的表頭**沒有** `draftConflict`，所以還原出來是 `undefined`。
 * 那**正是對的**：那些場次真的是兩張三選一一起發的，而 `grailDraftAllowed` /
 * `weaponDraftAllowed` 對 undefined 的答案就是「兩張都發」。⛔ 不要在這裡補
 * `?? DEFAULT_DRAFT_CONFLICT` —— 那會讓舊錄影用**今天的規則**重播，發卡少一張、
 * rng 串流從那一刻起整個錯開。回放要重現的是當時發生的事，不是現在的設計。
 */
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

/**
 * Rebuild the 基礎加成 table the match actually ran on (task #278).
 *
 * A PRE-#278 recording has no `baseBonus` field. Falling back to this host's
 * content doc is right for exactly that case — back then the table WAS the
 * boot-time content value, and there was no other source. From #278 on the
 * field is always written, so the fallback only ever serves old files.
 */
export function rebuildBaseBonus(header: ReplayHeader): BaseBonusTable {
  if (!header.baseBonus) return baseBonusFromDoc(Configs.tryGet("base-bonus"));
  return normalizeBaseBonus(header.baseBonus);
}
