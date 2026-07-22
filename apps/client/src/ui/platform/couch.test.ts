/**
 * couch-guest-labels: guest pseudo-id naming/display helpers (mirrors the Go
 * platform's gamelink/guest.go) + member seat badges.
 * couch-matchready-seattokens: the lobby reducer accepts the additive
 * seatTokens[] on match_ready and drops malformed arrays safely.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { guestAccountId, splitGuestId, guestDisplayName, memberSeatLabel, playerBadge, seatSum } from "./couch";
import { initialLobbyWsState, reduceLobbyMessage } from "./lobbyReducer";
import type { MatchReadyMsg } from "./types";

describe("guest naming (couch-guest-labels)", () => {
  it("builds and splits ':pN' pseudo-ids round-trip", () => {
    cover("couch-guest-labels");
    expect(guestAccountId("01HOST", 2)).toBe("01HOST:p2");
    expect(splitGuestId("01HOST:p2")).toEqual({ base: "01HOST", player: 2 });
    expect(splitGuestId("01HOST:p4")).toEqual({ base: "01HOST", player: 4 });
    expect(splitGuestId("01HOST")).toEqual({ base: "01HOST", player: 1 });
    // junk suffixes are NOT guests
    expect(splitGuestId("01HOST:pX")).toEqual({ base: "01HOST:pX", player: 1 });
    expect(splitGuestId("01HOST:p1")).toEqual({ base: "01HOST:p1", player: 1 });
  });

  it("formats guest display names and badges", () => {
    cover("couch-guest-labels");
    expect(guestDisplayName("Riko", 2)).toBe("Riko (2P)");
    expect(guestDisplayName("Riko", 4)).toBe("Riko (4P)");
    expect(guestDisplayName("Riko", 1)).toBe("Riko");
    expect(guestDisplayName("", 3)).toBe("(3P)");
    expect(playerBadge(0)).toBe("1P");
    expect(playerBadge(3)).toBe("4P");
  });

  it("member seat labels: '×N (本機)' only for couch members", () => {
    cover("couch-guest-labels");
    expect(memberSeatLabel(1)).toBe("");
    expect(memberSeatLabel(0)).toBe("");
    expect(memberSeatLabel(2)).toBe("×2 (本機)");
    expect(memberSeatLabel(4)).toBe("×4 (本機)");
  });

  it("seatSum totals localPlayers with a default of 1", () => {
    cover("couch-guest-labels");
    expect(seatSum([])).toBe(0);
    expect(seatSum([{ localPlayers: 3 }, {}, { localPlayers: 2 }])).toBe(6);
  });
});

describe("match_ready seatTokens[] (couch-matchready-seattokens)", () => {
  const base = {
    type: "match_ready",
    matchId: "m_1",
    endpoint: "ws://game:2567",
    seatToken: '{"room":"r"}',
  };

  it("carries a valid seatTokens array through to the store state", () => {
    cover("couch-matchready-seattokens");
    const msg = {
      ...base,
      seatTokens: [
        { accountId: "01A", seatToken: "t1" },
        { accountId: "01A:p2", seatToken: "t2" },
      ],
    };
    const next = reduceLobbyMessage(initialLobbyWsState(), msg);
    const mr = next.matchReady as MatchReadyMsg;
    expect(mr).not.toBeNull();
    expect(mr.seatTokens).toHaveLength(2);
    expect(mr.seatTokens![1]).toEqual({ accountId: "01A:p2", seatToken: "t2" });
    expect(mr.seatToken).toBe(base.seatToken); // compat field intact
  });

  it("old-style pushes without seatTokens still work (compat)", () => {
    cover("couch-matchready-seattokens");
    const next = reduceLobbyMessage(initialLobbyWsState(), base);
    expect(next.matchReady).not.toBeNull();
    expect((next.matchReady as MatchReadyMsg).seatTokens).toBeUndefined();
  });

  it("malformed seatTokens arrays are DROPPED, not fatal", () => {
    cover("couch-matchready-seattokens");
    for (const bad of [[], "nope", [{ accountId: 1 }], [{ seatToken: "x" }], 42]) {
      const next = reduceLobbyMessage(initialLobbyWsState(), { ...base, seatTokens: bad });
      const mr = next.matchReady as MatchReadyMsg;
      expect(mr).not.toBeNull();
      expect(mr.seatTokens).toBeUndefined();
      expect(mr.seatToken).toBe(base.seatToken);
    }
  });

  it("a match_ready missing the compat seatToken stays rejected", () => {
    cover("couch-matchready-seattokens");
    const state = initialLobbyWsState();
    const next = reduceLobbyMessage(state, { type: "match_ready", endpoint: "ws://x" });
    expect(next).toBe(state);
  });
});
