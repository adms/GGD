/**
 * PER-ROOM roguelite-mob toggle (#215, owner directive 2026-07-25: 肉鴿殭屍模式 as
 * a room switch, DEFAULT ON). The mob mechanic itself is covered in
 * packages/shared/src/sim/systems/MobSystem.test.ts; this proves the ONE thing
 * this task added — the deterministic gate at MatchController's arming site and
 * its replay round-trip:
 *   • rogueliteMobs true / undefined → mobs ARM and spawn (default-ON: absent
 *     never means OFF);
 *   • rogueliteMobs false → NO mobs ever, and the run is byte-identical (same
 *     digest) to a mobless (mobWaves:null) run — proving OFF adds no divergence;
 *   • the flag rides the ArenaRules spread into the replay header and rebuilds
 *     wholesale, so ON and OFF tapes both round-trip and a LEGACY tape with no
 *     key replays as ON (no migration).
 *
 * The gate is `this.rules.rogueliteMobs !== false && this.rules.mobWaves && …`;
 * the sim (packages/shared/src/sim) is untouched and still branches only on
 * world.mobRules, so determinism/purity is preserved.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { DEFAULT_MOB_WAVES_CONFIG, type MobWavesConfig } from "@ggd/shared/content";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import { DEFAULT_BASE_BONUS } from "@ggd/shared/sim/baseBonus";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { buildHeader } from "../replay/headerCodec";
import { rebuildRules } from "../replay/headerCodec";
import type { ReplayHeader } from "../replay/format";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

// A fast mob cadence that ARMS ON THE FIRST combat round (fromRound: 1) so the
// gate is exercised without playing through three rounds. First wave lands a few
// ticks into combat.
const MOB_WAVES: MobWavesConfig = { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1, firstWaveSec: 0.2, waveIntervalSec: 0.2 };

/** Rules with mobs armed; the caller decides the toggle. */
function rulesWith(rogueliteMobs: boolean | undefined): ArenaRules {
  // Cast lets us model the "absent key" (undefined) case the interface's plain
  // boolean type would otherwise forbid — exactly what an old room/replay yields.
  return { ...DEFAULT_ARENA_RULES, mobWaves: MOB_WAVES, rogueliteMobs: rogueliteMobs as boolean };
}

function tickUntil(ctl: MatchController, phase: string, maxTicks = 20000): void {
  let n = 0;
  while (ctl.phase.phase !== phase && n < maxTicks) {
    ctl.tick();
    n++;
  }
  expect(ctl.phase.phase).toBe(phase);
}

/** Reach combat (round 1) and tick a few frames so the first wave can land. */
function runToFirstWave(rules: ArenaRules, seed = 42): MatchController {
  const ctl = new MatchController("m-mob", seed, allBots(), FAST, 3, rules, SKELETON_ARENA);
  tickUntil(ctl, "combat");
  const firstWaveTicks = Math.round(MOB_WAVES.firstWaveSec / ctl.world.dt);
  for (let i = 0; i < firstWaveTicks + 4 && ctl.phase.phase === "combat"; i++) ctl.tick();
  return ctl;
}

describe("mob gate — default ON (#215 mob-gate-on)", () => {
  it("rogueliteMobs=true arms world.mobRules and spawns mobs from round 1", () => {
    cover("mob-gate-on");
    const ctl = runToFirstWave(rulesWith(true));
    expect(ctl.world.mobRules).not.toBeNull();
    expect(ctl.world.mob.size).toBeGreaterThan(0);
  });

  it("rogueliteMobs UNDEFINED (old room / old replay) also arms — absent === ON", () => {
    cover("mob-gate-undefined-on");
    const ctl = runToFirstWave(rulesWith(undefined));
    expect(ctl.world.mobRules).not.toBeNull();
    expect(ctl.world.mob.size).toBeGreaterThan(0);
  });

  it("the shipped DEFAULT_ARENA_RULES carries rogueliteMobs=true", () => {
    cover("mob-gate-default-true");
    expect(DEFAULT_ARENA_RULES.rogueliteMobs).toBe(true);
  });
});

describe("mob gate — OFF short-circuits (#215 mob-gate-off)", () => {
  it("rogueliteMobs=false never arms mobs and never spawns any", () => {
    cover("mob-gate-off");
    const ctl = runToFirstWave(rulesWith(false));
    expect(ctl.world.mobRules).toBeNull();
    expect(ctl.world.mob.size).toBe(0);
    // mobTicks < 0 is the disarmed sentinel — the sim's mobSystem returns early.
    expect(ctl.world.mobTicks).toBeLessThan(0);
  });

  it("an OFF run is byte-identical (same digest) to a mobless (mobWaves=null) run", () => {
    cover("mob-gate-off-byte-identical");
    // OFF: mobs configured but the room toggle disarms them.
    const off = runToFirstWave(rulesWith(false), 7);
    // MOBLESS: the mechanic was never configured at all. Same seed, same
    // everything else — the ONLY difference is how mobs are suppressed, and the
    // gate must make those two paths converge on an identical world.
    const mobless = runToFirstWave({ ...DEFAULT_ARENA_RULES, mobWaves: null }, 7);
    expect(off.world.mob.size).toBe(0);
    expect(mobless.world.mob.size).toBe(0);
    expect(off.world.digest()).toBe(mobless.world.digest());
  });
});

describe("mob toggle round-trips through the replay header (#215 mob-replay-parity)", () => {
  function headerWithRules(rules: ArenaRules): ReplayHeader {
    const ctl = new MatchController("m-hdr", 3, allBots(), FAST, 3, rules, SKELETON_ARENA);
    return buildHeader({
      matchId: "m-hdr",
      seed: 3,
      contentVersion: "cv-test",
      seats: ctl.seats,
      specIsBot: () => true,
      startingLives: 3,
      arena: SKELETON_ARENA,
      arenaPool: [],
      combatEnv: DEFAULT_COMBAT_ENV,
      baseBonus: DEFAULT_BASE_BONUS,
      phaseConfig: FAST,
      fireRing: null,
      arenaRules: rules,
      whitelist: ctl.whitelist,
      env: { whitelistBypass: true, combatEnvBypass: false, devCheats: true },
    });
  }

  it("an ON tape serializes rogueliteMobs=true and rebuilds to ON", () => {
    cover("mob-replay-on");
    const h = headerWithRules(rulesWith(true));
    expect((h.arenaRules as { rogueliteMobs?: boolean }).rogueliteMobs).toBe(true);
    expect(rebuildRules(h).rogueliteMobs).not.toBe(false); // gate passes → mobs
  });

  it("an OFF tape serializes rogueliteMobs=false and rebuilds to OFF", () => {
    cover("mob-replay-off");
    const h = headerWithRules(rulesWith(false));
    expect((h.arenaRules as { rogueliteMobs?: boolean }).rogueliteMobs).toBe(false);
    expect(rebuildRules(h).rogueliteMobs).toBe(false); // gate short-circuits → none
  });

  it("a LEGACY tape with no rogueliteMobs key rebuilds as ON — no migration", () => {
    cover("mob-replay-legacy-on");
    const h = headerWithRules(rulesWith(true));
    // Strip the key, mimicking a recording made before the toggle existed.
    delete (h.arenaRules as { rogueliteMobs?: boolean }).rogueliteMobs;
    const rebuilt = rebuildRules(h);
    expect(rebuilt.rogueliteMobs).toBeUndefined();
    expect(rebuilt.rogueliteMobs !== false).toBe(true); // the gate reads this as ON
  });
});
