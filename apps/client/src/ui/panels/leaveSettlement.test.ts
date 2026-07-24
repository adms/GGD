/**
 * leave-settlement-gate (task #193): the PURE decision that a leaving player
 * whose team is eliminated must pass through the settlement screen before the
 * lobby, and that everyone else leaves directly. No React/DOM/store.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  localTeamEliminated,
  shouldSettleBeforeLeave,
  type LeaveSeat,
  type LeaveTeam,
} from "./leaveSettlement";

const seats: LeaveSeat[] = [
  { seatId: 0, teamId: 0 },
  { seatId: 1, teamId: 0 },
  { seatId: 3, teamId: 1 },
];

describe("localTeamEliminated", () => {
  it("is true when the local seat's team is flagged eliminated", () => {
    cover("leave-settlement-gate");
    const teams: LeaveTeam[] = [
      { teamId: 0, eliminated: true },
      { teamId: 1, eliminated: false },
    ];
    expect(localTeamEliminated(teams, seats, 0)).toBe(true);
    expect(localTeamEliminated(teams, seats, 1)).toBe(true); // seat 1 is also team 0
  });

  it("is false when the local seat's team survives", () => {
    cover("leave-settlement-gate");
    const teams: LeaveTeam[] = [
      { teamId: 0, eliminated: true },
      { teamId: 1, eliminated: false },
    ];
    expect(localTeamEliminated(teams, seats, 3)).toBe(false); // seat 3 → team 1, alive
  });

  it("is false for a spectator with no seat, or an unknown team", () => {
    cover("leave-settlement-gate");
    const teams: LeaveTeam[] = [{ teamId: 0, eliminated: true }];
    expect(localTeamEliminated(teams, seats, null)).toBe(false);
    expect(localTeamEliminated(teams, seats, 99)).toBe(false); // no such seat
    expect(localTeamEliminated([], seats, 0)).toBe(false); // team not in snapshot yet
  });
});

describe("shouldSettleBeforeLeave", () => {
  it("gates ONLY when the team is out, a payload exists, and we are not at matchEnd", () => {
    cover("leave-settlement-gate");
    expect(
      shouldSettleBeforeLeave({ phase: "combat", teamEliminated: true, hasSettlement: true }),
    ).toBe(true);
    expect(
      shouldSettleBeforeLeave({ phase: "resolution", teamEliminated: true, hasSettlement: true }),
    ).toBe(true);
  });

  it("does not gate an alive player — they leave directly", () => {
    cover("leave-settlement-gate");
    expect(
      shouldSettleBeforeLeave({ phase: "combat", teamEliminated: false, hasSettlement: true }),
    ).toBe(false);
  });

  it("does not gate without a settlement payload — never trap on a blank card", () => {
    cover("leave-settlement-gate");
    expect(
      shouldSettleBeforeLeave({ phase: "combat", teamEliminated: true, hasSettlement: false }),
    ).toBe(false);
  });

  it("does not re-gate at matchEnd — MatchEndPanel already owns that screen", () => {
    cover("leave-settlement-gate");
    expect(
      shouldSettleBeforeLeave({ phase: "matchEnd", teamEliminated: true, hasSettlement: true }),
    ).toBe(false);
  });
});
