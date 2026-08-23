/**
 * GOLD-CURVE PROBE (throwaway measurement tool, not shipped content).
 *
 * Drives the REAL MatchController with the REAL production content config
 * (arena-rules, config.match phases + fire ring, combat-env, arena rotation)
 * and 12 Tier0 bots, to completion, and records per-round per-seat:
 *   goldEarned (matchStats), goldHeld (champ.gold), goldSpent (earned - held),
 *   at SHOP OPEN (intermission entry, after that round's grants) and at
 *   COMBAT ENTRY (after bots have shopped).
 *
 * Nothing here mutates tuning. Read-only instrumentation.
 */
import { join } from "node:path";
import { registerAll, Models } from "@ggd/shared/content";
import { loadContentCached } from "@ggd/shared/content/cache/index";
import { Champions } from "@ggd/shared/sim/content/registry";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import { MatchController, type SeatSpec } from "@ggd/game-server/src/match/MatchController";
import { resolvePhaseConfig, resolveFireRing, resolveStartingTeamHealth } from "@ggd/game-server/src/match/phaseConfig";
import { resolveArenaRules } from "@ggd/game-server/src/match/arenaRules";
import { resolveArena, resolveArenaPool } from "@ggd/game-server/src/match/arenaSelect";
import { Configs } from "@ggd/shared/content";

const CONTENT_DIR = join(new URL("../../../content", import.meta.url).pathname);
const ORB_PRICE = 2400;

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

interface SeatSample {
  seat: number;
  team: number;
  champ: string;
  earned: number;
  held: number;
  items: number;
  kills: number;
  deaths: number;
  assists: number;
}
interface RoundSample {
  round: number;
  at: "shopOpen" | "combatEntry";
  seats: SeatSample[];
  livesByTeam: number[];
  winsByTeam: number[];
}

export interface MatchResult {
  seed: number;
  rounds: number;
  combatSec: number[];
  samples: RoundSample[];
  /** team -> cumulative round wins at match end */
  finalWins: number[];
  finalLives: number[];
  placements: [number, number][];
}

export function runMatch(seed: number, roster: readonly string[]): MatchResult {
  const champions = pickChampions(roster, seed);
  const specs: SeatSpec[] = champions.map((cid, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
    championId: cid,
  }));

  const envDoc = Configs.tryGet("combat-env") as unknown as { multipliers?: Record<string, number> } | undefined;
  const combatEnv = normalizeCombatEnv(envDoc?.multipliers ?? {});

  const ctl = new MatchController(
    `gold-${seed}`,
    seed,
    specs,
    resolvePhaseConfig(),
    // Team Health, resolved from content exactly as MatchRoom does — the probe
    // must run the shipped reservoir, not a literal. GGD_TEAM_HEALTH overrides
    // for a what-if sweep (GGD_LIVES kept as the legacy spelling).
    /* startingTeamHealth */ Number(process.env.GGD_TEAM_HEALTH ?? process.env.GGD_LIVES ?? resolveStartingTeamHealth()),
    resolveArenaRules(),
    resolveArena(),
    /* whitelist */ undefined,
    combatEnv,
    resolveFireRing(),
    resolveArenaPool(),
  );

  let combatSecOut: number[] = [];
  const samples: RoundSample[] = [];
  const snap = (at: "shopOpen" | "combatEntry"): void => {
    const seats: SeatSample[] = [];
    for (const s of ctl.seats.values()) {
      if (s.entityId === null) continue;
      const champ = ctl.world.champion.get(s.entityId);
      const st = ctl.world.matchStats.get(s.entityId);
      if (!champ) continue;
      seats.push({
        seat: s.seatId as number,
        team: s.teamId as number,
        champ: champ.championId,
        earned: st?.goldEarned ?? 0,
        held: champ.gold,
        items: champ.items.filter((i) => i !== null).length,
        kills: st?.kills ?? 0,
        deaths: st?.deaths ?? 0,
        assists: st?.assists ?? 0,
      });
    }
    samples.push({
      round: ctl.phase.round,
      at,
      seats,
      livesByTeam: [0, 1, 2, 3].map((t) => ctl.lives.get(t as never) ?? 0),
      winsByTeam: [0, 1, 2, 3].map((t) => ctl.roundWins.get(t as never) ?? 0),
    });
  };

  let prevPhase = ctl.phase.phase;
  let guard = 0;
  let combatStart = 0;
  const combatSec: number[] = [];
  const MAX_TICKS = 30 * 60 * 60; // 60 sim-minutes
  while (ctl.phase.phase !== "matchEnd" && guard++ < MAX_TICKS) {
    ctl.tick();
    const p = ctl.phase.phase;
    if (p !== prevPhase) {
      if (p === "intermission") snap("shopOpen");
      else if (p === "combat") {
        snap("combatEntry");
        combatStart = ctl.world.tick;
      } else if (p === "resolution") combatSec.push((ctl.world.tick - combatStart) / 30);
      prevPhase = p;
    }
  }
  combatSecOut = combatSec;

  return {
    seed,
    rounds: Math.max(0, ...samples.map((s) => s.round)),
    combatSec: combatSecOut,
    samples,
    finalWins: [0, 1, 2, 3].map((t) => ctl.roundWins.get(t as never) ?? 0),
    finalLives: [0, 1, 2, 3].map((t) => ctl.lives.get(t as never) ?? 0),
    placements: [...ctl.placements.entries()].map(([t, p]) => [t as number, p]),
  };
}

async function main(): Promise<void> {
  const res = await loadContentCached({ rootDir: CONTENT_DIR });
  registerAll(res.store);
  const roster = Champions.ids().filter((c) => Models.tryGet(Champions.get(c).modelKey) !== undefined);

  const nSeeds = Number(process.argv[2] ?? 8);
  const out: MatchResult[] = [];
  for (let i = 0; i < nSeeds; i++) {
    const seed = 1000 + i * 7;
    const t0 = Date.now();
    const m = runMatch(seed, roster);
    process.stderr.write(`seed ${seed}: ${m.rounds} rounds, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    out.push(m);
  }
  process.stdout.write(JSON.stringify({ orbPrice: ORB_PRICE, matches: out }, null, 1));
}

if (process.argv[1] && process.argv[1].endsWith("goldCurve.ts")) void main();
