/**
 * The victory-trigger contract (task #93). Everything here is a way the
 * celebration could fire at the WRONG moment — which is the only failure mode
 * that matters, since firing the roast chicken at the player who just lost is
 * worse than not firing it at all.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { VictoryGate, type VictoryInput } from "./victoryTrigger";

const base: VictoryInput = {
  phase: "combat",
  outcomeDecided: false,
  round: 1,
  myTeamId: 0,
  myRoundWins: 0,
  myPlacement: 0,
};

describe("victory trigger", () => {
  it("fires nothing on the first snapshot (joining mid-match must not celebrate)", () => {
    const g = new VictoryGate();
    expect(g.update({ ...base, myRoundWins: 2 }).kind).toBe("none");
    // and it adopts 2 as the baseline: no retroactive round win
    expect(g.update({ ...base, myRoundWins: 2 }).kind).toBe("none");
  });

  it("fires ONE round win when my roundWins increments", () => {
    cover("victory-trigger");
    const g = new VictoryGate();
    g.update(base); // prime at 0
    expect(g.update({ ...base, myRoundWins: 1, round: 2 })).toEqual({ kind: "round", round: 2 });
    // ...and not again while it stays at 1
    expect(g.update({ ...base, myRoundWins: 1, round: 2 }).kind).toBe("none");
    expect(g.update({ ...base, myRoundWins: 1, round: 3 }).kind).toBe("none");
  });

  it("fires a fresh round win for each subsequent increment", () => {
    const g = new VictoryGate();
    g.update(base);
    expect(g.update({ ...base, myRoundWins: 1, round: 2 }).kind).toBe("round");
    for (let f = 0; f < 5; f++) g.update({ ...base, myRoundWins: 1, round: 2 }); // hold
    expect(g.update({ ...base, myRoundWins: 2, round: 3 })).toEqual({ kind: "round", round: 3 });
  });

  it("NEVER fires a round win for the losing team (their counter never moved)", () => {
    cover("victory-trigger");
    const g = new VictoryGate();
    g.update({ ...base, myRoundWins: 0 });
    for (let r = 2; r <= 5; r++) {
      // rounds pass, the enemy's wins climb, mine stay 0 → nothing
      expect(g.update({ ...base, myRoundWins: 0, round: r }).kind).toBe("none");
    }
  });

  it("fires the MATCH win exactly once when I place first", () => {
    cover("victory-trigger");
    const g = new VictoryGate();
    g.update(base);
    const decided = { ...base, phase: "resolution", outcomeDecided: true, myPlacement: 1 };
    expect(g.update(decided)).toEqual({ kind: "match" });
    // outcomeDecided stays latched for the whole settlement — must not repeat
    for (let f = 0; f < 30; f++) expect(g.update(decided).kind).toBe("none");
  });

  it("NEVER fires a match win for a team that did not place first", () => {
    cover("victory-trigger");
    const g = new VictoryGate();
    g.update(base);
    const lost = { ...base, phase: "resolution", outcomeDecided: true, myPlacement: 3 };
    for (let f = 0; f < 20; f++) expect(g.update(lost).kind).toBe("none");
  });

  it("reports the FINAL round as a match win only, never both at once", () => {
    cover("victory-trigger");
    const g = new VictoryGate();
    g.update({ ...base, myRoundWins: 2 }); // prime at 2
    // the deciding frame bumps roundWins AND decides the match in my favour
    const deciding = {
      ...base,
      phase: "resolution",
      outcomeDecided: true,
      myRoundWins: 3,
      myPlacement: 1,
      round: 6,
    };
    expect(g.update(deciding)).toEqual({ kind: "match" });
    // the screen never gets asked to go grey (round) and dark (match) together
    for (let f = 0; f < 10; f++) expect(g.update(deciding).kind).toBe("none");
  });

  it("does not fire while the team is unresolved, then primes cleanly", () => {
    const g = new VictoryGate();
    // team not known yet
    expect(g.update({ ...base, myTeamId: -1, myRoundWins: -1 }).kind).toBe("none");
    expect(g.update({ ...base, myTeamId: -1, myRoundWins: -1 }).kind).toBe("none");
    // team resolves at 1 win already banked → adopt as baseline, no fire
    expect(g.update({ ...base, myRoundWins: 1 }).kind).toBe("none");
    // the NEXT increment is a real round win
    expect(g.update({ ...base, myRoundWins: 2, round: 4 })).toEqual({ kind: "round", round: 4 });
  });

  it("re-arms after reset for a new match", () => {
    const g = new VictoryGate();
    g.update(base);
    g.update({ ...base, phase: "resolution", outcomeDecided: true, myPlacement: 1 }); // match win
    g.reset();
    // fresh match: prime at 0, then a round win fires again
    expect(g.update(base).kind).toBe("none");
    expect(g.update({ ...base, myRoundWins: 1, round: 2 }).kind).toBe("round");
  });

  it("survives a roundWins counter reset (new match without an explicit reset)", () => {
    const g = new VictoryGate();
    g.update({ ...base, myRoundWins: 2 }); // primed at 2
    // a new match snapshot resets the counter to 0 — must NOT read as -2 or fire
    expect(g.update({ ...base, myRoundWins: 0, round: 1 }).kind).toBe("none");
    expect(g.update({ ...base, myRoundWins: 1, round: 2 })).toEqual({ kind: "round", round: 2 });
  });
});
