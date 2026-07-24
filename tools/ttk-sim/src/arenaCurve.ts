/**
 * ARENA-CURVE PROBE — read-only instrumentation for the Team Health model.
 *
 * Drives the REAL MatchController with the REAL shipped content (arena-rules,
 * config.match phases + fire ring, combat-env, arena rotation, the whole
 * champion roster) and 12 Tier0 bots, to completion, and records everything the
 * team-health / economy / augment questions need:
 *
 *   • per round: team health for all 4 teams, alive count, the bye, whether
 *     High Stakes fired, duel outcomes, combat duration and phase wall clock
 *   • per round per seat at SHOP OPEN (intermission entry, after grants and
 *     after offers are rolled) and at COMBAT ENTRY (after bots have shopped):
 *     gold earned / held / spent, item count, stat-path stacks, K/D/A
 *   • EVERY augment offer: round, seat, requested tier, how many cards it
 *     actually produced, and how many of those came from the requested tier
 *     rather than the fallback ladder
 *
 * Nothing here mutates tuning. It is the companion to goldCurve.ts (which only
 * asks the gold question) and it is what teamHealth.test.ts's pinned numbers
 * were derived from.
 */
import { join } from "node:path";
import { ContentLoader, registerAll, Models, Configs } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions, Augments } from "@ggd/shared/sim/content/registry";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import { MatchController, type SeatSpec } from "@ggd/game-server/src/match/MatchController";
import { resolvePhaseConfig, resolveFireRing, resolveStartingTeamHealth } from "@ggd/game-server/src/match/phaseConfig";
import { resolveArenaRules } from "@ggd/game-server/src/match/arenaRules";
import { resolveArena, resolveArenaPool } from "@ggd/game-server/src/match/arenaSelect";
import { isHighStakesRound, teamHealthLost } from "@ggd/game-server/src/match/PairedDuels";

const CONTENT_DIR = join(new URL("../../../content", import.meta.url).pathname);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickChampions(roster: readonly string[], matchSeed: number): string[] {
  const rng = mulberry32(matchSeed);
  const pool = [...roster];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, 12);
}

export interface SeatSample {
  seat: number;
  team: number;
  earned: number;
  held: number;
  items: number;
  statStacks: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface OfferSample {
  round: number;
  seat: number;
  team: number;
  tier: string;
  requested: number;
  got: number;
  /** how many of the drawn cards were actually of the requested tier */
  onTier: number;
  /** true when this card was widened by a High Stakes draft bonus */
  widened: boolean;
}

export interface RoundSample {
  round: number;
  /** team health for teams 0..3 at INTERMISSION ENTRY (i.e. after last settle) */
  healthAtShop: number[];
  aliveAtShop: number;
  shop: SeatSample[];
  combatEntry: SeatSample[];
  /** filled at resolution */
  healthAfter: number[];
  combatSec: number;
  highStakes: boolean;
  bye: number | null;
  offers: OfferSample[];
}

export interface MatchResult {
  seed: number;
  startingTeamHealth: number;
  rounds: number;
  roundData: RoundSample[];
  finalHealth: number[];
  placements: [number, number][];
  /** elimination round per team (-1 = survived) */
  elimRound: number[];
  totalTicks: number;
}

export function runMatch(seed: number, roster: readonly string[], startingTeamHealth: number): MatchResult {
  const champions = pickChampions(roster, seed);
  const specs: SeatSpec[] = champions.map((cid, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
    championId: cid,
  }));

  const envDoc = Configs.tryGet("combat-env") as unknown as { multipliers?: Record<string, number> } | undefined;
  const combatEnv = normalizeCombatEnv(envDoc?.multipliers ?? {});
  const rules = resolveArenaRules();
  const baseOfferCount = rules.offerCount;

  const ctl = new MatchController(
    `arena-${seed}`,
    seed,
    specs,
    resolvePhaseConfig(),
    startingTeamHealth,
    rules,
    resolveArena(),
    /* whitelist */ undefined,
    combatEnv,
    resolveFireRing(),
    resolveArenaPool(),
  );

  const health = (): number[] => [0, 1, 2, 3].map((t) => ctl.teamHealth.get(t as never) ?? 0);
  const seatSamples = (): SeatSample[] => {
    const out: SeatSample[] = [];
    for (const s of ctl.seats.values()) {
      if (s.entityId === null) continue;
      const champ = ctl.world.champion.get(s.entityId);
      const st = ctl.world.matchStats.get(s.entityId);
      if (!champ) continue;
      out.push({
        seat: s.seatId as number,
        team: s.teamId as number,
        earned: st?.goldEarned ?? 0,
        held: champ.gold,
        items: champ.items.filter((i) => i !== null).length,
        statStacks: champ.statStacks,
        kills: st?.kills ?? 0,
        deaths: st?.deaths ?? 0,
        assists: st?.assists ?? 0,
      });
    }
    return out;
  };

  /** Snapshot the augment cards this intermission just rolled, before bots eat them. */
  const offerSamples = (round: number): OfferSample[] => {
    const out: OfferSample[] = [];
    for (const [, offer] of ctl.offers) {
      if (offer.kind !== "augment") continue;
      const seat = ctl.seats.get(offer.seatId);
      const onTier = offer.choices.filter((c) => Augments.tryGet(c)?.tier === offer.tier).length;
      out.push({
        round,
        seat: offer.seatId as number,
        team: (seat?.teamId as number) ?? -1,
        tier: offer.tier,
        // The width the host ASKED for is `rules.offerCount` (+1 for a High
        // Stakes draft bonus). The stored offer does not record it, so the base
        // is read from the same rules doc the controller used and the widening
        // is inferred from an over-wide result — sound because `offerAugments`
        // can only ever UNDER-fill, never over-fill.
        requested: baseOfferCount,
        got: offer.choices.length,
        onTier,
        widened: offer.choices.length > baseOfferCount,
      });
    }
    return out;
  };

  const roundData: RoundSample[] = [];
  const elimRound = [-1, -1, -1, -1];
  let prevHealth = health();
  let cur: RoundSample | null = null;
  let combatStart = 0;
  let prevPhase = ctl.phase.phase;
  let guard = 0;
  const MAX_TICKS = 30 * 60 * 90; // 90 sim-minutes — a hard stop, not an expectation

  while (ctl.phase.phase !== "matchEnd" && guard++ < MAX_TICKS) {
    ctl.tick();
    const p = ctl.phase.phase;
    if (p === prevPhase) continue;
    prevPhase = p;
    if (p === "intermission") {
      const round = ctl.phase.round;
      const h = health();
      cur = {
        round,
        healthAtShop: h,
        aliveAtShop: h.filter((x) => x > 0).length,
        shop: seatSamples(),
        combatEntry: [],
        healthAfter: h,
        combatSec: 0,
        highStakes: false,
        bye: null,
        offers: offerSamples(round),
      };
      roundData.push(cur);
    } else if (p === "combat") {
      combatStart = ctl.world.tick;
      if (cur) {
        cur.combatEntry = seatSamples();
        cur.bye = (ctl.bye as number | null) ?? null;
        cur.highStakes = isHighStakesRound(cur.round, ctl.bye !== null);
      }
    } else if (p === "resolution") {
      if (cur) {
        cur.combatSec = (ctl.world.tick - combatStart) / 30;
        cur.healthAfter = health();
        for (let t = 0; t < 4; t++) {
          if (prevHealth[t]! > 0 && cur.healthAfter[t]! <= 0 && elimRound[t] === -1) elimRound[t] = cur.round;
        }
        prevHealth = cur.healthAfter;
      }
    }
  }

  return {
    seed,
    startingTeamHealth,
    rounds: roundData.length,
    roundData,
    finalHealth: health(),
    placements: [...ctl.placements.entries()].map(([t, p]) => [t as number, p]),
    elimRound,
    totalTicks: ctl.world.tick,
  };
}

async function main(): Promise<void> {
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
  const roster = Champions.ids().filter((c) => Models.tryGet(Champions.get(c).modelKey) !== undefined);

  const nSeeds = Number(process.argv[2] ?? 30);
  const startingTeamHealth = Number(process.env.GGD_TEAM_HEALTH ?? resolveStartingTeamHealth());
  const seed0 = Number(process.env.GGD_SEED0 ?? 1000);
  const out: MatchResult[] = [];
  for (let i = 0; i < nSeeds; i++) {
    const seed = seed0 + i * 7;
    const t0 = Date.now();
    const m = runMatch(seed, roster, startingTeamHealth);
    process.stderr.write(
      `seed ${seed}: ${m.rounds} rounds, ${(m.totalTicks / 30 / 60).toFixed(1)} sim-min, ${((Date.now() - t0) / 1000).toFixed(1)}s wall\n`,
    );
    out.push(m);
  }
  process.stdout.write(
    JSON.stringify({
      startingTeamHealth,
      roster: roster.length,
      augmentPool: Augments.all().reduce<Record<string, number>>((acc, a) => {
        acc[a.tier] = (acc[a.tier] ?? 0) + 1;
        return acc;
      }, {}),
      costTable: Array.from({ length: 20 }, (_, i) => teamHealthLost(i + 1)),
      matches: out,
    }),
  );
}

if (process.argv[1] && process.argv[1].endsWith("arenaCurve.ts")) void main();
