/**
 * Headless TTK harness (task #153).
 *
 * FIDELITY: this drives the REAL match combat. It instantiates the actual
 * `MatchController` (apps/game-server) with `AIDriver` (Tier0Brain) bots and
 * steps the authoritative `SimWorld` tick-by-tick through a live combat round —
 * the same systems (movement, autos, abilities, projectiles, damage/mitigation,
 * regen, death) the online server runs. Round-end is read exactly as the
 * server reads it: a duel is decided the tick one side's in-zone alive-count
 * hits 0 (the `teamAliveCount` logic in MatchController.checkCombatEnd).
 *
 * We import — never modify — packages/shared/sim and apps/game-server. The only
 * knobs we set are the ones a match host legitimately sets before tick 0:
 * `world.combatEnv` (via the constructor), the arena rules, and the phase
 * timings.
 *
 * WHAT WE MEASURE. COMBAT duration = ticks from combat-entry to team-elimination
 * ÷ TICK_HZ = seconds, per duel (each combat round runs two 3v3 duels in
 * parallel, so one match yields two independent samples).
 *
 * TWO MODES.
 *  - "natural" (fire ring OFF): the pure champion-vs-champion elimination time.
 *    This is the clean, monotonic HP→TTK signal used to interpolate the
 *    multiplier, and it is what pins the MINIMUM round length: the fire ring can
 *    only SHORTEN a round (it burns %HP once a stalemate passes `startSec`), so
 *    the fastest kill — the round most at risk of being "too short" — is never
 *    touched by the ring and equals the natural elimination time.
 *  - "production" (fire ring ON, real config.match@1 schedule): the realistic
 *    round length, with the ring resolving Tier-0 stalemates around 180–240 s
 *    exactly as the live server does.
 *
 * MID-MATCH LOADOUT. A naked level-1 duel is not representative. We grant each
 * bot a mid-match power level at the (single) intermission before combat —
 * levels, gold to spend down its real buildPriority, an augment, and unlocked R
 * — so damage and HP scale like a round 3–4 fight rather than level 1. See
 * MID_MATCH_GRANT.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerAll, Models } from "@ggd/shared/content";
import type { FireRingConfig } from "@ggd/shared/content";
import { loadContentCached } from "@ggd/shared/content/cache/index";
import { Champions } from "@ggd/shared/sim/content/registry";
import { normalizeCombatEnv, type CombatEnvKey } from "@ggd/shared/sim/combatEnv";
import { TICK_HZ } from "@ggd/shared/constants";
import { DEFAULT_BURN_CURVE } from "@ggd/shared/sim/fireRing";
import { MatchController, type SeatSpec } from "@ggd/game-server/src/match/MatchController";
import { type PhaseConfig } from "@ggd/game-server/src/match/PhaseMachine";
import { DEFAULT_ARENA_RULES, type ArenaRules, type RoundGrant } from "@ggd/game-server/src/match/arenaRules";

/** Content tree root (monorepo `content/`), resolved relative to this tool. */
export const CONTENT_DIR = join(new URL("../../../content", import.meta.url).pathname);

/**
 * The mid-match loadout applied at the single pre-combat intermission. Chosen to
 * approximate an "average" round (~round 3–4): level 6 (from 1, +5), Q/W/E
 * learned and R unlocked (ultUnlockRound=1), ~5000 g total (600 start + 4400) to
 * buy 2–3 items off the champion's real buildPriority, and one gold-tier augment.
 * A knob, not a law — documented as a fidelity caveat in the report.
 */
export const MID_MATCH_GRANT: RoundGrant = {
  grantLevels: 5,
  grantGold: 4400,
  autoLearn: ["Q", "W", "E"],
  augmentTier: "gold",
};

/** Raw `multipliers` block of a content tree's `config/combat-env.json`. */
function shippedMultipliers(contentDir: string = CONTENT_DIR): Record<string, number> {
  const raw = JSON.parse(readFileSync(join(contentDir, "config", "combat-env.json"), "utf8")) as {
    multipliers?: Record<string, number>;
  };
  return { ...(raw.multipliers ?? {}) };
}

/**
 * The shipped combat-env base MINUS maxHealth, which every caller overrides per
 * run. `normalizeCombatEnv` ignores keys outside `COMBAT_ENV_KEYS`, so handing
 * it the whole block is safe.
 *
 * ⚠️ GH#297 — THIS USED TO BE TWO HAND-COPIED LITERALS (`cooldown: 0.25`,
 * `abilityRange: 0.6`) and it had gone stale: the shipped file moved cooldown to
 * 0.2 and grew `manaRegen: 8` / `strTo*` / gold factors, none of which this
 * table knew about. `ttk248.ts`'s header已經寫著這件事, and it worked around it
 * by reading the file itself — so the repo already had TWO readings of "the
 * shipped env" and the harness was the wrong one. Ability uptime (cooldown +
 * manaRegen) is one of the two biggest inputs to TTK, so a stale base does not
 * shift the numbers slightly — it moves them off the shipped balance entirely,
 * which is how `harness.test.ts` ended up asserting against a world that had
 * not existed for weeks.
 *
 * CLAUDE.md 第二守則: a shipped number lives in `content/config/` + the Zod
 * `DEFAULT_*` + the admin `SHIPPED_*`, and a fourth copy in a fixture has no
 * drift guard, so it WILL expire. Derive it; never re-type it.
 */
export function shippedEnvBase(contentDir: string = CONTENT_DIR): Partial<Record<CombatEnvKey, number>> {
  const t = shippedMultipliers(contentDir);
  delete t.maxHealth; // varied per run — the whole point of the sweep
  return t as Partial<Record<CombatEnvKey, number>>;
}

/** The shipped `multipliers.maxHealth`. The ONE probe point that is real. */
export function shippedMaxHealth(contentDir: string = CONTENT_DIR): number {
  const v = shippedMultipliers(contentDir).maxHealth;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    throw new Error(`combat-env.json has no usable multipliers.maxHealth (got ${String(v)})`);
  }
  return v;
}

/** @deprecated name kept for `sweep.ts`; it is now DERIVED, not hand-copied. */
export const COMBAT_ENV_BASE: Partial<Record<CombatEnvKey, number>> = shippedEnvBase();

/**
 * Real fire-ring schedule from content/config/config.match.json (match.fireRing).
 *
 * #195 REPLACED THE SHAPE, so any TTK number produced before it is stale: the
 * ring now ignites at 60 s (not 180) and CONTRACTS over 20 s, burning only what
 * is outside it. #153's HP tuning was measured against 180 s rounds with a
 * global burn; re-run the sweep rather than reading the old table across.
 */
export const PRODUCTION_FIRE_RING: FireRingConfig = {
  // #218 殭屍王延長：0/0 = 這個模擬器不模擬王。⚠️ 出貨值是 180/180，
  // 但 TTK 掃描要的是「沒有王的那條基線」，把 180 抄進來會讓每一格 TTK
  // 都多算三分鐘的火圈延後 —— 抄出貨值在這裡剛好是錯的。
  boss: { extendCombatSec: 0, delayFireRingSec: 0 },
  startSec: 60,
  shrinkSec: 20,
  minRadius: 0.5,
  burnCurve: [...DEFAULT_BURN_CURVE], // 出貨曲線的唯一字面值住在 sim/fireRing.ts
  maxPctPerSec: 1,
  // GH#287 出貨預設：火圈無視免死。TTK 掃描不裝任何免死標記，所以這一格在這裡
  // 只有型別意義（`.default()` 讓它在 Zod 的 OUTPUT 型別上是必填）。
  lethalSaveApplies: false,
  // ⚠️ PRE-EXISTING BREAKAGE, fixed in passing 2026-08-02: this literal is typed
  // `FireRingConfig` (the Zod OUTPUT type, where `.default()` fields are
  // REQUIRED) and has been missing `roundHardCapSec` since #248 added it — so
  // `pnpm --filter ttk-sim typecheck` was already red on main, independently of
  // the burn curve. 300 mirrors 出貨; with `boss` at 0/0 the cap can never bind
  // here anyway, so it changes no TTK number.
  roundHardCapSec: 300,
};

export interface DuelSample {
  maxHealth: number;
  /** combatEnv.damageDealt factor this duel ran at (1.0 for the #153 sweep). */
  damageDealt: number;
  matchSeed: number;
  zone: number;
  champsA: string[];
  champsB: string[];
  /** COMBAT seconds from combat-entry to this duel's team-elimination. */
  ttkSec: number;
  /** false = never eliminated within the cap (a stalemate: censored at capSec). */
  decisive: boolean;
}

export interface RunOptions {
  maxHealth: number;
  /**
   * combatEnv.damageDealt factor. Applied ONCE per DamagePacket PRE-mitigation
   * (packages/shared combat/damage.ts combatResolveSystem, line ~397:
   * `pkt.amount *= world.combatEnv.damageDealt`) and THEN mitigate() reduces it
   * by the classic multiplicative resist curve `amount·100/(100+resist)` — so
   * damageDealt and defense are BOTH pure multiplicative factors on impact.
   * The non-linearity that makes lowering damage a more-than-linear survival
   * lever is NOT the (percentage) armor curve but FLAT sustain: health regen is
   * a per-tick absolute add (RegenSystem: `hp += HealthRegen·dt`) that does not
   * scale with damageDealt, so at half damage net-DPS drops by MORE than half.
   * Defaults to 1.0 (neutral) so the #153 single-axis sweep is byte-unchanged.
   */
  damageDealt?: number;
  matchSeed: number;
  /** arm the real fire ring (production round length) vs off (natural TTK). */
  fireRing: boolean;
  /** hard cap in seconds; also the phase combatMax. Undecided → censored here. */
  capSec: number;
  roster: readonly string[];
}

let cachedRoster: string[] | null = null;

/**
 * Load the full content tree into the sim registries (idempotent) and return the
 * model-backed champion roster — exactly the pool a live random/bot pick draws
 * from (MatchController.randomChampionPool).
 */
export async function loadRoster(contentDir: string = CONTENT_DIR): Promise<string[]> {
  if (cachedRoster) return cachedRoster;
  const res = await loadContentCached({ rootDir: contentDir });
  registerAll(res.store);
  cachedRoster = Champions.ids().filter((c) => Models.tryGet(Champions.get(c).modelKey) !== undefined);
  return cachedRoster;
}

/** Small deterministic PRNG for champion shuffling (independent of the sim rng). */
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

/**
 * Pick the 12 champions for a match, deterministically from matchSeed and
 * INDEPENDENT of maxHealth — so a given matchSeed fights the identical 6-vs-6
 * matchup in each zone at every HP value (a controlled HP→TTK comparison). Seats
 * 0–2 = team 0, 3–5 = team 1, 6–8 = team 2, 9–11 = team 3; PairedDuels then
 * pairs 0v1 (zone 0) and 2v3 (zone 1).
 */
export function pickChampions(roster: readonly string[], matchSeed: number): string[] {
  const rng = mulberry32(matchSeed);
  const pool = [...roster];
  // Seeded Fisher–Yates (NOT `sort(() => rng()-0.5)`, whose argument-ignoring
  // comparator makes the permutation depend on V8's sort internals — a
  // reproducibility hazard). This is a pure function of matchSeed.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, 12);
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

function champsForTeam(ctl: MatchController, teamId: number): string[] {
  return [...ctl.seats.values()].filter((s) => s.teamId === teamId).map((s) => s.championId);
}

/**
 * Run one bot-vs-bot match through its FIRST combat round and return one
 * DuelSample per active duel (normally two: zone 0 and zone 1).
 */
export function runMatchDuels(opts: RunOptions): DuelSample[] {
  const { maxHealth, damageDealt = 1, matchSeed, fireRing, capSec, roster } = opts;

  const env = normalizeCombatEnv({ ...COMBAT_ENV_BASE, maxHealth, damageDealt });
  const champions = pickChampions(roster, matchSeed);
  const specs: SeatSpec[] = champions.map((cid, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
    championId: cid,
  }));

  // Isolate the HP→TTK signal: real per-round LEVEL/GOLD/AUGMENT scaling, but the
  // sustain/round-pacing mechanics (flowers, revives, guardians) OFF so they do
  // not confound the measurement. The fire ring is armed only in production mode.
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
    intermissionTicks: 40 * TICK_HZ, // ample; advances early once bots ready + offers auto-pick
    combatMaxTicks: capSec * TICK_HZ,
    resolutionTicks: 1,
  };

  const ctl = new MatchController(
    `ttk-${maxHealth}-${matchSeed}`,
    matchSeed,
    specs,
    phase,
    /* startingLives */ 8,
    rules,
    /* arena */ undefined, // SKELETON_ARENA: 2 zones, 32u spawn separation — identical to every shipped arena
    /* whitelist */ undefined, // allow-all
    env,
    fireRing ? PRODUCTION_FIRE_RING : null,
    /* arenaPool */ [],
  );

  // Drive champ-select → intermission → combat.
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 100_000) ctl.tick();
  if (ctl.phase.phase !== "combat") throw new Error("harness: match never reached combat");
  const entryTick = ctl.world.tick;
  const pairings = ctl.pairings.map((p) => ({ ...p })); // snapshot before combat mutates

  const decidedAt = new Map<number, number>();
  guard = 0;
  const maxCombatTicks = (capSec + 5) * TICK_HZ;
  while (ctl.phase.phase === "combat" && guard++ < maxCombatTicks) {
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
    return {
      maxHealth,
      damageDealt,
      matchSeed,
      zone: p.zone,
      champsA: champsForTeam(ctl, p.sideA),
      champsB: champsForTeam(ctl, p.sideB),
      ttkSec: ticks === undefined ? capSec : ticks / TICK_HZ,
      decisive: ticks !== undefined,
    };
  });
}
