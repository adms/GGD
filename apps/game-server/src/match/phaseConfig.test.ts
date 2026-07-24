/**
 * Phase durations come from CONTENT, not a constant (task #38). The regression
 * this pins is the one that existed for months: `config.match@1` declared
 * `intermissionSec` and nothing read it, so editing the doc changed nothing.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { cover } from "@ggd/shared/testkit/cover";
import { TICK_HZ } from "@ggd/shared/constants";
import { Configs } from "@ggd/shared/content";
import { DEFAULT_PHASE_CONFIG } from "./PhaseMachine";
import { phaseConfigFromSeconds, resolveStartingLives } from "./phaseConfig";
import { DEFAULT_STARTING_LIVES, MAX_STARTING_LIVES } from "./PairedDuels";
import { MatchController, type SeatSpec } from "./MatchController";

describe("phaseConfig", () => {
  it("converts an authored seconds block into tick counts", () => {
    cover("phase-config-content");
    const cfg = phaseConfigFromSeconds({
      champSelectSec: 30,
      intermissionSec: 60,
      combatMaxSec: 90,
      resolutionSec: 6,
    });
    expect(cfg.champSelectTicks).toBe(30 * TICK_HZ);
    expect(cfg.intermissionTicks).toBe(60 * TICK_HZ);
    expect(cfg.combatMaxTicks).toBe(90 * TICK_HZ);
    expect(cfg.resolutionTicks).toBe(6 * TICK_HZ);
  });

  it("the SHIPPED prep window is 60 s and the doc is what sets it", () => {
    cover("phase-config-prep-window");
    // The content doc is the authority; the fallback constant must agree with
    // it so a skeleton boot and a content boot never disagree on prep length.
    expect(DEFAULT_PHASE_CONFIG.intermissionTicks).toBe(60 * TICK_HZ);
    // …and a DIFFERENT authored value actually takes effect (the bug: it didn't).
    expect(phaseConfigFromSeconds({ intermissionSec: 45 }).intermissionTicks).toBe(45 * TICK_HZ);
  });

  it("falls back per-field on a missing / nonsense duration, never to 0 ticks", () => {
    cover("phase-config-fallback");
    const cfg = phaseConfigFromSeconds({ intermissionSec: 45, combatMaxSec: 0, resolutionSec: -3 });
    expect(cfg.intermissionTicks).toBe(45 * TICK_HZ);
    expect(cfg.champSelectTicks).toBe(DEFAULT_PHASE_CONFIG.champSelectTicks); // absent
    expect(cfg.combatMaxTicks).toBe(DEFAULT_PHASE_CONFIG.combatMaxTicks); // zero
    expect(cfg.resolutionTicks).toBe(DEFAULT_PHASE_CONFIG.resolutionTicks); // negative
    // a duration that would round to nothing still advances normally
    expect(phaseConfigFromSeconds({ intermissionSec: 0.001 }).intermissionTicks).toBeGreaterThan(0);
  });
});

/**
 * `match.startingTeamLives` had exactly the #38 disease one field over: authored
 * in `config.match@1`, validated by the schema, offered by the editor, and read
 * by NOBODY — `MatchRoom.onCreate` passed a literal 3. Lives is the knob that
 * decides HOW MANY ROUNDS a match lasts (round count = reservoir / drain rate,
 * see PairedDuels.livesLost), so this was the match-length dial wired to nothing.
 */
describe("resolveStartingLives", () => {
  const doc = (match: Record<string, unknown>) =>
    ({ id: "config.match", schema: "config@1", match }) as never;

  afterEach(() => Configs.clear());

  it("an authored value actually reaches the match (the bug: it did not)", () => {
    cover("starting-lives-content");
    Configs.register(doc({ startingTeamLives: 8 }));
    expect(resolveStartingLives()).toBe(8);
    // …and it is not merely returned, it seeds the team reservoirs.
    const specs: SeatSpec[] = Array.from({ length: 12 }, (_, i) => ({
      seatId: i,
      teamId: Math.floor(i / 3),
      isBot: true,
    }));
    const ctl = new MatchController("m-lives", 1, specs, undefined, resolveStartingLives());
    expect(ctl.startingLives).toBe(8);
    expect([...ctl.lives.values()]).toEqual([8, 8, 8, 8]);
  });

  it("falls back to the lives-model default on an absent or mis-schema'd doc", () => {
    cover("starting-lives-fallback");
    expect(resolveStartingLives()).toBe(DEFAULT_STARTING_LIVES); // registry empty
    Configs.register({ id: "config.match", schema: "config.arena-rules@1" } as never);
    expect(resolveStartingLives()).toBe(DEFAULT_STARTING_LIVES); // wrong schema
    Configs.clear();
    Configs.register(doc({}));
    expect(resolveStartingLives()).toBe(DEFAULT_STARTING_LIVES); // key absent
  });

  it("clamps a nonsense edit instead of shipping an unfinishable match", () => {
    cover("starting-lives-clamp");
    // 0 / negative / non-finite are unreachable through the schema but reachable
    // through a hand-edited doc; none of them may produce a match that ends on
    // round 1 or never ends at all.
    for (const bad of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      Configs.clear();
      Configs.register(doc({ startingTeamLives: bad }));
      expect(resolveStartingLives()).toBe(DEFAULT_STARTING_LIVES);
    }
    // A fat-fingered 800 would be a many-hour match; clamp, do not obey.
    Configs.clear();
    Configs.register(doc({ startingTeamLives: 800 }));
    expect(resolveStartingLives()).toBe(MAX_STARTING_LIVES);
    // The clamp is a typo guard, NOT a balance opinion: the owner's own value
    // and any plausible neighbour pass through untouched.
    for (const ok of [1, 3, 5, 8, 12, MAX_STARTING_LIVES]) {
      Configs.clear();
      Configs.register(doc({ startingTeamLives: ok }));
      expect(resolveStartingLives()).toBe(ok);
    }
  });

  it("the SHIPPED config value is what the owner authored, not the old constant", () => {
    cover("starting-lives-shipped");
    // Reads the real content doc off disk: this is the assertion that would have
    // caught the original bug, because it compares the file to the running game.
    const shipped = JSON.parse(
      readFileSync(new URL("../../../../content/config/config.match.json", import.meta.url), "utf8"),
    ) as { match: { startingTeamLives: number } };
    Configs.register(doc({ startingTeamLives: shipped.match.startingTeamLives }));
    expect(resolveStartingLives()).toBe(shipped.match.startingTeamLives);
  });
});

