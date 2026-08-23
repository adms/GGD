/**
 * TTK for task #248 — does the derived stat sheet still play at maxHealth ×4?
 *
 * METHOD: identical to #153 / the ×0.5 re-tune. It reuses the SAME harness
 * primitives (`loadRoster`, `pickChampions`, `MID_MATCH_GRANT`, the same
 * MatchController + AIDriver + SimWorld tick loop, the same round-end read:
 * a duel is decided the tick one side's in-zone alive-count hits 0). The only
 * two things this file changes versus `sweep.ts`/`retune.ts` are:
 *
 *   1. the CONTENT TREE is a CLI argument, so the identical matchups can be
 *      fought once on the SHIPPED champion cards and once on the #248 DERIVED
 *      cards (str/agi/int → HP/AD/armor/AS/mana/AP), and
 *   2. the combat-env base is read from the TARGET TREE's own
 *      content/config/combat-env.json (`shippedEnvBase(contentDir)`), because
 *      the two trees may configure it differently.
 *
 *      ⚠️ This used to also be a WORKAROUND: harness.ts's `COMBAT_ENV_BASE` was
 *      hand-copied and had gone stale (cooldown 0.25 vs the shipped 0.2, and no
 *      manaRegen at all — both of which move ability uptime and therefore TTK).
 *      GH#297 made that constant DERIVED and moved the reader into harness.ts,
 *      so there is now ONE implementation and this file just passes a directory.
 *
 * Champion matchup is a pure function of the match seed and INDEPENDENT of
 * both the content tree and maxHealth, so every cell fights the identical
 * duels — a controlled comparison.
 *
 *   npx tsx src/ttk248.ts <contentDir> <label> [hp,hp,...] [matches]
 *
 * Emits one JSON line per cell on stdout (prefixed `RESULT `).
 */
import { registerAll, Models } from "@ggd/shared/content";
import type { FireRingConfig } from "@ggd/shared/content";
import { loadContentCached } from "@ggd/shared/content/cache/index";
import { Champions } from "@ggd/shared/sim/content/registry";
import { normalizeCombatEnv, type CombatEnvKey } from "@ggd/shared/sim/combatEnv";
import { TICK_HZ } from "@ggd/shared/constants";
import { MatchController, type SeatSpec } from "@ggd/game-server/src/match/MatchController";
import { type PhaseConfig } from "@ggd/game-server/src/match/PhaseMachine";
import { DEFAULT_ARENA_RULES, type ArenaRules, type RoundGrant } from "@ggd/game-server/src/match/arenaRules";
import { MID_MATCH_GRANT, PRODUCTION_FIRE_RING, pickChampions, shippedEnvBase } from "./harness";

async function loadTree(contentDir: string): Promise<string[]> {
  const res = await loadContentCached({ rootDir: contentDir });
  registerAll(res.store);
  return Champions.ids().filter((c) => Models.tryGet(Champions.get(c).modelKey) !== undefined);
}

function aliveInZone(ctl: MatchController, teamId: number, zone: number): number {
  let n = 0;
  for (const seat of ctl.seats.values()) {
    if (seat.teamId !== teamId || seat.entityId === null) continue;
    const t = ctl.world.transform.get(seat.entityId);
    const hp = ctl.world.health.get(seat.entityId);
    if (t?.zone === zone && hp?.alive) n++;
  }
  return n;
}

interface Sample {
  ttkSec: number;
  decisive: boolean;
}

function runMatch(opts: {
  envBase: Partial<Record<CombatEnvKey, number>>;
  maxHealth: number;
  matchSeed: number;
  fireRing: boolean;
  capSec: number;
  roster: readonly string[];
}): Sample[] {
  const env = normalizeCombatEnv({ ...opts.envBase, maxHealth: opts.maxHealth });
  const champions = pickChampions(opts.roster, opts.matchSeed);
  const specs: SeatSpec[] = champions.map((cid, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
    championId: cid,
  }));
  const rules: ArenaRules = {
    ...DEFAULT_ARENA_RULES,
    ultUnlockRound: 1,
    exUnlockRound: null,
    rounds: new Map<number, RoundGrant>([[1, MID_MATCH_GRANT]]),
    overflow: null,
    gacha: null,
    flowers: null,
    reviveCircles: null,
    guardianTower: null,
  };
  const phase: PhaseConfig = {
    champSelectTicks: 1,
    intermissionTicks: 40 * TICK_HZ,
    combatMaxTicks: opts.capSec * TICK_HZ,
    resolutionTicks: 1,
  };
  const ring: FireRingConfig | null = opts.fireRing ? PRODUCTION_FIRE_RING : null;
  const ctl = new MatchController(
    `t248-${opts.maxHealth}-${opts.matchSeed}`,
    opts.matchSeed,
    specs,
    phase,
    8,
    rules,
    undefined,
    undefined,
    env,
    ring,
    [],
  );
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 100_000) ctl.tick();
  if (ctl.phase.phase !== "combat") throw new Error("never reached combat");
  const entryTick = ctl.world.tick;
  const pairings = ctl.pairings.map((p) => ({ ...p }));
  const decidedAt = new Map<number, number>();
  guard = 0;
  while (ctl.phase.phase === "combat" && guard++ < (opts.capSec + 5) * TICK_HZ) {
    for (const p of pairings) {
      if (decidedAt.has(p.zone)) continue;
      if (aliveInZone(ctl, p.sideA, p.zone) === 0 || aliveInZone(ctl, p.sideB, p.zone) === 0) {
        decidedAt.set(p.zone, ctl.world.tick - entryTick);
      }
    }
    ctl.tick();
  }
  return pairings.map((p) => {
    const ticks = decidedAt.get(p.zone);
    return { ttkSec: ticks === undefined ? opts.capSec : ticks / TICK_HZ, decisive: ticks !== undefined };
  });
}

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const k = (s.length - 1) * p;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo]! + (s[hi]! - s[lo]!) * (k - lo);
}

async function main(): Promise<void> {
  const [contentDir, label, hpArg, matchesArg] = process.argv.slice(2);
  if (!contentDir || !label) throw new Error("usage: ttk248 <contentDir> <label> [hps] [matches]");
  const hps = (hpArg ?? "4,6,8,10,12").split(",").map(Number);
  const matches = Number(matchesArg ?? 30);
  const roster = await loadTree(contentDir);
  const envBase = shippedEnvBase(contentDir);
  process.stderr.write(`[${label}] roster ${roster.length}, envBase ${JSON.stringify(envBase)}\n`);
  for (const mode of ["natural", "production"] as const) {
    const fireRing = mode === "production";
    const capSec = fireRing ? 240 : 600;
    for (const maxHealth of hps) {
      const all: Sample[] = [];
      for (let m = 0; m < matches; m++) {
        all.push(...runMatch({ envBase, maxHealth, matchSeed: 1000 + m, fireRing, capSec, roster }));
      }
      const dec = all.filter((s) => s.decisive).map((s) => s.ttkSec);
      const dur = all.map((s) => s.ttkSec);
      const out = {
        label,
        mode,
        maxHealth,
        n: all.length,
        decisive: dec.length,
        stallPct: 1 - dec.length / all.length,
        min: dec.length ? Math.min(...dec) : null,
        p10: dec.length ? pct(dec, 0.1) : null,
        median: dec.length ? pct(dec, 0.5) : null,
        mean: dec.length ? dec.reduce((a, b) => a + b, 0) / dec.length : null,
        max: dec.length ? Math.max(...dec) : null,
        roundMedian: pct(dur, 0.5),
        roundMean: dur.reduce((a, b) => a + b, 0) / dur.length,
      };
      process.stdout.write("RESULT " + JSON.stringify(out) + "\n");
    }
  }
}

void main();
