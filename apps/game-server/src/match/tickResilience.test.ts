/**
 * tickResilience.test.ts — BUG A ("戰鬥開始後倒數時間突然停止卡住不動": the combat
 * countdown suddenly freezes). Escalated #46 (the sim intermittently STOPS
 * TICKING mid-match while the renderer stays 60fps), compounded by the
 * room-hardening wave that made MatchRoom DISCONNECT the whole room on a thrown
 * tick — so ANY exception in a sim tick permanently froze the countdown.
 *
 * The fix makes MatchController.tick() resilient: the phase clock is advanced
 * FIRST, then the sim step and the phase transition each run inside their own
 * fault container. A single bad tick is skipped (transient recovery); a
 * PERSISTENT fault keeps the countdown advancing and the match still marches to
 * a valid matchEnd instead of wedging.
 *
 * These tests inject faults directly into a headless MatchController (no
 * Colyseus, no sockets) and assert the clock never freezes and the match always
 * terminates.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController, type SeatSpec } from "./MatchController";

/** Fast phases so a full match runs in a few hundred ticks. */
const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
/** Tiny phases for the stall runs — every phase expires in a couple of ticks. */
const TINY = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 5, resolutionTicks: 2 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Reassign a controller's SimWorld.step (own-prop shadow) — the sim-fault seam. */
function setWorldStep(ctl: MatchController, fn: (intents: unknown) => void): void {
  (ctl.world as unknown as { step: (intents: unknown) => void }).step = fn;
}

function runToEnd(ctl: MatchController, maxTicks = 40000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < maxTicks) {
    ctl.tick();
    n++;
  }
  return n;
}

describe("tick resilience — a bad tick never freezes the countdown (#46/#100)", () => {
  // A persistent fault logs (throttled); silence console.error so the run is quiet.
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("a PERSISTENTLY throwing sim step never escapes tick(), the clock keeps advancing, and the match still ends", () => {
    cover("match-tickloop-clamp");
    const ctl = new MatchController("stall-persistent", 1234, allBots(), TINY);
    // Every sim step throws for the ENTIRE match — the worst case of #46.
    setWorldStep(ctl, () => {
      throw new Error("injected persistent sim fault");
    });

    let n = 0;
    const phasesSeen = new Set<string>();
    while (ctl.phase.phase !== "matchEnd" && n < 40000) {
      // must never propagate out of tick()
      expect(() => ctl.tick()).not.toThrow();
      phasesSeen.add(ctl.phase.phase);
      n++;
    }

    // the match REACHED a valid end despite every sim step throwing
    expect(ctl.phase.phase).toBe("matchEnd");
    expect(ctl.result).not.toBeNull();
    // it actually moved through the phase machine (the clock advanced)
    expect(phasesSeen.has("intermission")).toBe(true);
    expect(phasesSeen.has("combat")).toBe(true);
    expect(phasesSeen.has("resolution")).toBe(true);
    // faults were contained, not swallowed silently
    expect(ctl.faultCount).toBeGreaterThan(0);
    // proof the SIM never advanced (step never ran) yet the match still finished:
    // the phase clock, not the sim, is what carried it to the end.
    expect(ctl.world.tick).toBe(0);
    // a real winner exists with valid placements 1..4
    const placements = ctl.result!.teams.map((t) => t.placement).sort();
    expect(placements).toEqual([1, 2, 3, 4]);
  });

  it("the combat COUNTDOWN keeps ticking during a sustained mid-combat sim fault (the reported freeze)", () => {
    cover("match-tickloop-clamp");
    // long combat window so it can't just expire out from under us
    const cfg = { champSelectTicks: 3, intermissionTicks: 5, combatMaxTicks: 4000, resolutionTicks: 5 };
    const ctl = new MatchController("stall-combat", 77, allBots(), cfg);
    while (ctl.phase.phase !== "combat") ctl.tick();

    // the sim starts throwing MID-COMBAT (the "suddenly stops ticking" moment)
    setWorldStep(ctl, () => {
      throw new Error("injected mid-combat sim fault");
    });

    // the phase countdown (ctl.phase.ticksLeft) must STRICTLY decrease every tick
    // — before the fix it froze here (and the room disconnected).
    let prev = ctl.phase.ticksLeft;
    for (let i = 0; i < 30 && ctl.phase.phase === "combat"; i++) {
      ctl.tick();
      expect(ctl.phase.ticksLeft).toBeLessThan(prev);
      prev = ctl.phase.ticksLeft;
    }
    expect(ctl.faultCount).toBeGreaterThan(0);
  });

  it("a SINGLE transient bad tick is skipped, and the match otherwise runs to a real end", () => {
    cover("match-tickloop-clamp");
    const ctl = new MatchController("stall-transient", 4242, allBots(), FAST);
    const realStep = (ctl.world.step as (i: unknown) => void).bind(ctl.world);
    let thrown = false;
    setWorldStep(ctl, (intents) => {
      // throw exactly ONCE, the first combat tick, then behave normally forever
      if (!thrown && ctl.phase.phase === "combat") {
        thrown = true;
        throw new Error("injected one-off sim fault");
      }
      realStep(intents);
    });

    const ticks = runToEnd(ctl);
    expect(thrown).toBe(true); // the fault really fired
    expect(ctl.faultCount).toBe(1); // exactly one contained fault
    expect(ctl.phase.phase).toBe("matchEnd");
    expect(ticks).toBeLessThan(40000);
    expect(ctl.result).not.toBeNull();
    // the sim ran normally after the one skip, so a real fight happened
    const totalKills = [...ctl.kills.values()].reduce((a, b) => a + b, 0);
    expect(totalKills).toBeGreaterThan(0);
  });

  it("even a PERSISTENTLY throwing PHASE TRANSITION force-advances to matchEnd (transition failsafe)", () => {
    cover("match-tickloop-clamp");
    const ctl = new MatchController("stall-transition", 999, allBots(), TINY);
    // Break the normal transition path entirely; tick() must fall back to
    // forceAdvanceOnFault every expiry and still converge on a winner.
    (ctl as unknown as { advancePhase: () => void }).advancePhase = () => {
      throw new Error("injected transition fault");
    };

    let n = 0;
    while (ctl.phase.phase !== "matchEnd" && n < 40000) {
      expect(() => ctl.tick()).not.toThrow();
      n++;
    }
    expect(ctl.phase.phase).toBe("matchEnd");
    expect(ctl.faultCount).toBeGreaterThan(0);
    // lives strictly fell to a single survivor (the combat failsafe charges one
    // life per round), so the match genuinely ended rather than cycling forever.
    const alive = [...ctl.lives.entries()].filter(([, l]) => l > 0);
    expect(alive.length).toBe(1);
  });

  it("a healthy match is UNAFFECTED — no faults, normal result (no regression)", () => {
    cover("match-tickloop-clamp");
    const ctl = new MatchController("healthy", 1234, allBots(), FAST);
    runToEnd(ctl);
    expect(ctl.phase.phase).toBe("matchEnd");
    expect(ctl.faultCount).toBe(0); // nothing was contained on the happy path
    expect(ctl.result).not.toBeNull();
    expect(ctl.world.tick).toBeGreaterThan(0); // the sim really ran
  });
});
