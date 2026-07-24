/**
 * roundEnd.test.ts — task #208: "只剩一隊存活時立即宣佈回合勝利". Pins the
 * belt-and-suspenders invariant that a paired-duel round CONCLUDES the instant
 * every duel is decided, WITHOUT waiting for the combat phase timer, and that a
 * still-live zone keeps the round open (bye correctness stays intact).
 *
 * `checkCombatEnd` runs every combat tick and returns true the moment
 * `duelWinners.size === pairings.length`; the phase machine then advances to
 * `resolution`. So the only way this could regress is a change that stopped the
 * tick from concluding on a wipe — which is exactly what these assertions catch,
 * by wiping duels DIRECTLY (deterministically) and checking the round ends on
 * the very next tick while the phase timer still has almost all its budget left.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asTeamId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";

// A LONG combat budget so the phase timer can never be the thing that ends the
// round in these tests — if the round concludes, it concluded on a wipe.
const CFG = {
  champSelectTicks: 5,
  intermissionTicks: 20,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Drive a fresh controller to its first combat phase. */
function toCombat(seed: number): MatchController {
  const ctl = new MatchController("re", seed, allBots(), CFG);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  return ctl;
}

/** Kill every LIVING champion of `teamId` that is standing in `zone`. */
function wipeSideInZone(ctl: MatchController, teamId: number, zone: number): void {
  for (const seat of ctl.seats.values()) {
    if (seat.teamId !== teamId || seat.entityId === null) continue;
    const t = ctl.world.transform.get(seat.entityId);
    const hp = ctl.world.health.get(seat.entityId);
    if (t?.zone === zone && hp) {
      hp.alive = false;
      hp.hp = 0;
    }
  }
}

describe("round ends the instant every duel is decided (#208)", () => {
  it("concludes on the NEXT tick when both duels are wiped — no timer wait", () => {
    cover("round-end-immediate");
    const ctl = toCombat(1234);
    expect(ctl.phase.phase).toBe("combat");
    expect(ctl.pairings.length).toBe(2); // 4 alive teams → two zones
    expect(ctl.bye).toBeNull();

    // decide EVERY duel by wiping one side of each — the ≤1-living-team case
    for (const p of ctl.pairings) wipeSideInZone(ctl, p.sideB, p.zone);

    const before = ctl.phase.ticksLeft;
    expect(before).toBeGreaterThan(90_000); // almost the whole budget remains

    ctl.tick(); // checkCombatEnd sees 0 living on sideB of both → decides both
    expect(ctl.phase.phase).toBe("resolution"); // concluded immediately
    // and it was NOT the timer: combat used a handful of ticks, not ~100k
    expect(CFG.combatMaxTicks - before).toBeLessThan(5000);

    // the surviving side (sideA) is recorded as each zone's winner
    for (const p of ctl.pairings) expect(ctl.duelWinnerOf(p.zone)).toBe(p.sideA);
  });

  it("keeps the round LIVE while another zone is still fighting", () => {
    cover("round-end-immediate");
    const ctl = toCombat(4242);
    expect(ctl.pairings.length).toBe(2);

    // decide only ONE zone; the other stays a live 3v3
    const [first, second] = ctl.pairings;
    wipeSideInZone(ctl, first!.sideB, first!.zone);

    ctl.tick();
    expect(ctl.phase.phase).toBe("combat"); // NOT concluded — one duel still live
    expect(ctl.duelWinnerOf(first!.zone)).toBe(first!.sideA); // decided zone recorded
    expect(ctl.duelWinnerOf(second!.zone)).toBeUndefined(); // live zone undecided

    // now finish the second duel → the round concludes on the next tick
    wipeSideInZone(ctl, second!.sideA, second!.zone);
    ctl.tick();
    expect(ctl.phase.phase).toBe("resolution");
    expect(ctl.duelWinnerOf(second!.zone)).toBe(second!.sideB);
  });

  it("a bye round concludes on its single duel and never blocks on the bye team (#173)", () => {
    cover("round-end-immediate");
    // Force a 3-team round by eliminating team 3 before combat is armed, so
    // pairTeams yields ONE duel + a rotating bye.
    const ctl = new MatchController("re-bye", 77, allBots(), CFG);
    while (ctl.phase.phase === "champSelect") ctl.tick();
    ctl.teamHealth.set(asTeamId(3), 0); // eliminate one team during intermission
    let guard = 0;
    while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();

    expect(ctl.pairings.length).toBe(1); // 3 alive → one duel
    expect(ctl.bye).not.toBeNull();
    const bye = ctl.bye!;
    const byeHealthBefore = ctl.teamHealth.get(bye)!;

    const p = ctl.pairings[0]!;
    wipeSideInZone(ctl, p.sideB, p.zone);
    const before = ctl.phase.ticksLeft;

    ctl.tick();
    expect(ctl.phase.phase).toBe("resolution"); // one duel decided → round over
    expect(CFG.combatMaxTicks - before).toBeLessThan(5000); // not the timer
    expect(ctl.duelWinnerOf(p.zone)).toBe(p.sideA);
    // the bye team fought no duel and lost no health from the conclusion
    expect(ctl.teamHealth.get(bye)).toBe(byeHealthBefore);
  });
});
