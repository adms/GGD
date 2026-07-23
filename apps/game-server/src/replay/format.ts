/**
 * The on-disk replay format (task #175).
 *
 * WHY THIS EXISTS. The owner's chosen — and only — playtest feedback channel is
 * 「用回放重播的方式即可」: when a family member says 「第三回合怪怪的」he watches
 * that round. That is only possible because the sim is deterministic (fixed
 * 30 Hz step, no Math.random / Date.now anywhere under packages/shared/src/sim,
 * enforced by sim/purity.test.ts). A replay therefore does not store what
 * happened — it stores what went IN, and re-derives what happened by running the
 * same code again.
 *
 * WHICH MEANS THE HEADER IS THE WHOLE FEATURE. Everything the sim reads that is
 * not an input must be pinned here, or playback silently plays a DIFFERENT
 * match — the one failure mode that is worse than having no replay at all,
 * because the owner would then debug a match that never happened. The list
 * below is the audited set of every such input; each field carries the reason it
 * is here so a future edit cannot quietly drop one.
 *
 * FILE LAYOUT — newline-delimited JSON (JSONL), append-only, one record per line:
 *
 *   line 0      {"t":"header",  ...ReplayHeader}
 *   line 1..n   {"t":"i", "k":tick, "s":seatId, "f":IntentFrame}   raw seat intent
 *               {"t":"d", "k":tick, "s":seatId, "v":"human"|"ai"}  driver swap APPLIED
 *               {"t":"c", "k":tick, "s":seatId, "id":championId}   champion select
 *               {"t":"x", "k":tick, "s":seatId, "c":Cheat}         dev cheat
 *               {"t":"g", "k":firstTick, "w":[...], "h":[...]}     digest checkpoints
 *   last line   {"t":"footer", ...ReplayFooter}                    (absent if crashed)
 *
 * JSONL because it is append-only (no rewrite of earlier bytes on every flush),
 * survives a truncated tail (a crashed server still yields a playable prefix),
 * and gzips to ~1.4% of its raw size.
 */
import type { IntentFrame } from "@ggd/shared/sim/intents";
import type { Cheat } from "@ggd/shared/protocol/messages";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import type { FireRingConfig } from "@ggd/shared/content";

/**
 * Bumped whenever a change makes previously-written files unplayable by the
 * current player (a new required header field, a changed line shape). The player
 * REFUSES an unknown version rather than guessing.
 */
export const REPLAY_FORMAT_VERSION = 1;

/** How many per-tick digests are batched into one `g` line (10 s at 30 Hz). */
export const DIGEST_CHUNK_TICKS = 300;

/** One seat as it existed at match creation. */
export interface ReplaySeat {
  seatId: number;
  teamId: number;
  accountId: string;
  /** Player name AT MATCH TIME — this is why recordings are admin-only. */
  displayName: string;
  /** The champion locked in at creation ("" when the seat picked in champ-select). */
  championId: string;
  isBot: boolean;
  /** Driver at tick 0; later swaps ride the `d` lines. */
  driver: "human" | "ai";
}

/**
 * Everything outside the input stream that the sim reads. A mismatch between a
 * recording's header and the host replaying it is a REFUSAL, not a warning.
 */
export interface ReplayHeader {
  formatVersion: number;
  matchId: string;
  /** Wall-clock match start (presentation only — never read by the sim). */
  startedAt: string;

  // ---- the determinism key -------------------------------------------------
  /**
   * THE match seed. Deliberately NOT `MatchResult.seed`, which holds the FINAL
   * `world.rng.state` after the whole match — recording that and calling it the
   * seed would produce a plausible-looking replay of a match that never
   * happened.
   */
  seed: number;
  /**
   * `cv_…` from the loaded content manifest. Abilities/items/champions change
   * between builds; a replay recorded on cv_A and played on cv_B is a different
   * game, so the player refuses on mismatch.
   */
  contentVersion: string;
  /**
   * contentVersion is NOT sufficient on its own, twice over:
   *   (a) `hashCollection` SORTS entries before hashing, but `Augments.all()` and
   *       `Champions.ids()` are iterated in INSERTION order and indexed with
   *       `world.rng` — two trees with an identical cv_ can roll different
   *       augments and different champions;
   *   (b) `registerSkeletonContent()` injects champions/items/augments/a loot
   *       table from CODE on every match, after content, and moves no cv_.
   * This fingerprint hashes each registry's ids IN ORDER together with each
   * document's own hash, so it catches both. See fingerprint.ts.
   */
  registryFingerprint: string;
  /** Git short sha (or "dev"): the only signal for a pure code change. */
  buildStamp: string;

  // ---- match construction --------------------------------------------------
  seats: ReplaySeat[];
  startingLives: number;
  /** Champ-select / first-intermission arena id. */
  arenaId: string;
  /**
   * The per-round rotation pool, in resolution order. `pickRoundArena` is pure
   * in (seed, round) but indexes THIS list, so an install with a different arena
   * set produces a different rotation from the same seed.
   */
  arenaPoolIds: string[];
  /**
   * The combat-env multiplier table snapshotted at creation. Live values on a
   * real host are NOT the neutral table (this box: damageDealt 0.5, maxHealth 8,
   * cooldown 0.25, abilityRange 0.6), so a player that assumed DEFAULT_COMBAT_ENV
   * would play a completely different game.
   */
  combatEnv: CombatEnvMultipliers;
  /** Phase durations from `config.match@1` — they retime every round. */
  phaseConfig: {
    champSelectTicks: number;
    intermissionTicks: number;
    combatMaxTicks: number;
    resolutionTicks: number;
  };
  /** Round-pacing fire ring from the same doc; null = mechanic off. */
  fireRing: FireRingConfig | null;
  /** EX/ult unlock rounds, augment schedule, flower/revive/guardian arming. */
  arenaRules: unknown;
  /**
   * The operator curation snapshot. It reaches the sim as `world.itemEligible`
   * and is consulted BEFORE an rng roll (economy/legendaryOrb.ts), so a
   * whitelist difference shifts the rng stream and desyncs the whole remainder.
   * It also fail-safes to allow-all when the platform is unreachable, so the
   * same host replays the same seed differently depending on whether the
   * platform happened to be up — which is exactly why it is stored in full.
   */
  whitelist: { bypass: boolean; champions: string[]; items: string[]; abilities: string[] };
  /**
   * Process env that silently changes what the sim sees. Presentation +
   * diagnosis only (a bypass flag is already reflected in `whitelist.bypass` and
   * `combatEnv`), but it is what turns 「為什麼跟我玩的不一樣」 into an answer.
   */
  env: { whitelistBypass: boolean; combatEnvBypass: boolean; devCheats: boolean };
}

/** Written when the match ends normally; absent means the recording was cut short. */
export interface ReplayFooter {
  endedAt: string;
  /** Last tick recorded (inclusive). */
  finalTick: number;
  rounds: number;
  /** Contained tick faults. A replay whose fault count differs has diverged. */
  faultCount: number;
  /** `world.digest()` and the extended host digest at the final tick. */
  finalWorldDigest: number;
  finalHostDigest: number;
  /** Per-team lives / placement at the end — the human-readable result. */
  teams: { teamId: number; lives: number; placement: number }[];
}

export type ReplayLine =
  | ({ t: "header" } & ReplayHeader)
  | { t: "i"; k: number; s: number; f: IntentFrame }
  | { t: "d"; k: number; s: number; v: "human" | "ai" }
  | { t: "c"; k: number; s: number; id: string }
  | { t: "x"; k: number; s: number; c: Cheat }
  | { t: "g"; k: number; w: number[]; h: number[] }
  /**
   * A phase/round boundary. Derived state — playback re-derives it exactly — but
   * recorded anyway so the 「跳到第三回合」 control can build its index the moment
   * a recording is opened, instead of having to simulate the whole match first.
   */
  | { t: "r"; k: number; p: string; r: number }
  | ({ t: "footer" } & ReplayFooter);

/** Serialize one record to a JSONL line (trailing newline included). */
export function encodeLine(line: ReplayLine): string {
  return JSON.stringify(line) + "\n";
}

/**
 * Parse a JSONL body into records, TOLERATING a truncated final line — a server
 * killed mid-match leaves a half-written line, and the prefix before it is still
 * a perfectly good replay of everything up to that point.
 */
export function decodeLines(body: string): { lines: ReplayLine[]; truncated: boolean } {
  const out: ReplayLine[] = [];
  let truncated = false;
  const raw = body.split("\n");
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]!;
    if (s.length === 0) continue;
    try {
      out.push(JSON.parse(s) as ReplayLine);
    } catch {
      // Only the LAST non-empty line may legitimately be half-written.
      if (i >= raw.length - 2) truncated = true;
      else throw new Error(`replay file is corrupt at line ${i + 1}`);
    }
  }
  return { lines: out, truncated };
}
