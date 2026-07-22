/**
 * victoryTrigger — the PURE edge-detector that turns the authoritative match
 * state into the two victory-celebration triggers (task #93). Babylon-free and
 * unit-tested, because the thing that goes wrong with a celebration is never
 * the particles — it is FIRING IT AT THE WRONG MOMENT: twice, for the loser,
 * on every frame of the resolution phase, or at the settlement of a match you
 * did not win.
 *
 * Two events, edge-triggered, for the LOCAL player's own team only:
 *
 *   ROUND WIN — my team's `roundWins` counter went up while the match is NOT
 *     yet decided. This is the small-firework + taunt tier. It fires once per
 *     increment; the `round` it reports seeds the volley scatter so no two
 *     rounds look alike.
 *   MATCH WIN (吃雞) — `outcomeDecided` latched AND my team placed first. The
 *     big roast-chicken tier. Fires exactly once; a match win is NEVER also
 *     reported as a round win on the same frame (the guard below), so the
 *     screen does not try to go grey and dark at once.
 *
 * Losing produces NOTHING here — a loser's screen is owned by the death-grey
 * (#85) and the settlement (#25), and celebrating at someone who just lost is
 * the exact opposite of the joke.
 */

/** The subset of MatchState this reads (keeps it decoupled from the schema). */
export interface VictoryInput {
  /** MatchState.phase */
  phase: string;
  /** MatchState.outcomeDecided */
  outcomeDecided: boolean;
  /** MatchState.round */
  round: number;
  /** the LOCAL player's team id, or -1 before it is known */
  myTeamId: number;
  /** my team's roundWins counter, or -1 if my team is not resolvable yet */
  myRoundWins: number;
  /** my team's final placement (1 = won the match, 0 = still playing) */
  myPlacement: number;
}

export type VictoryFire =
  | { kind: "none" }
  | { kind: "round"; round: number }
  | { kind: "match" };

/**
 * Edge-detecting victory gate. Feed it the authoritative state every frame;
 * it returns a fire event on the frame an edge is crossed and `none` otherwise.
 *
 * Deliberately conservative: every field it needs must be RESOLVED (team known,
 * counters non-negative) before it will fire, so a half-populated first
 * snapshot cannot mistrigger. A missed edge fails SILENT (no celebration),
 * which is the safe direction — a firework that does not play is a
 * disappointment; one that plays for the loser is a bug everyone sees.
 */
export class VictoryGate {
  private lastRoundWins = -1;
  private matchFired = false;
  /** true once we have a baseline to diff against (avoids firing on join) */
  private primed = false;

  /** Latest fire event for tests/introspection. */
  private last: VictoryFire = { kind: "none" };
  get lastFire(): VictoryFire {
    return this.last;
  }

  /**
   * Advance one frame. Returns the celebration to fire THIS frame (or none).
   */
  update(input: VictoryInput): VictoryFire {
    this.last = this.compute(input);
    return this.last;
  }

  private compute(input: VictoryInput): VictoryFire {
    // team not resolved yet: adopt whatever baseline arrives, never fire on it
    if (input.myTeamId < 0 || input.myRoundWins < 0) {
      this.primed = false;
      this.lastRoundWins = input.myRoundWins;
      return { kind: "none" };
    }

    // --- MATCH WIN: latched once, and it OWNS the frame ---------------------
    // Checked before the round edge so a final round that both increments
    // roundWins AND decides the match reports only the match win — otherwise
    // the screen would be asked to go grey (round) and dark (match) together.
    if (input.outcomeDecided && input.myPlacement === 1) {
      // adopt the round baseline so a later re-prime cannot replay the last
      // round win, and remember we fired so the latch survives the whole
      // outcomeDecided window (which spans several seconds of settlement)
      this.lastRoundWins = input.myRoundWins;
      if (!this.matchFired) {
        this.matchFired = true;
        this.primed = true;
        return { kind: "match" };
      }
      return { kind: "none" };
    }

    // outcome decided but NOT my win → the loser path: celebrate nothing, and
    // freeze the round baseline so nothing fires during the settlement freeze
    if (input.outcomeDecided) {
      this.lastRoundWins = input.myRoundWins;
      this.primed = true;
      return { kind: "none" };
    }

    // --- ROUND WIN: my roundWins counter went up ---------------------------
    if (!this.primed) {
      this.primed = true;
      this.lastRoundWins = input.myRoundWins;
      return { kind: "none" };
    }
    if (input.myRoundWins > this.lastRoundWins) {
      this.lastRoundWins = input.myRoundWins;
      return { kind: "round", round: input.round };
    }
    // counter can only reset downward on a fresh match; re-baseline silently
    if (input.myRoundWins < this.lastRoundWins) this.lastRoundWins = input.myRoundWins;
    return { kind: "none" };
  }

  /** Full reset — new match / room re-join. */
  reset(): void {
    this.lastRoundWins = -1;
    this.matchFired = false;
    this.primed = false;
    this.last = { kind: "none" };
  }
}
