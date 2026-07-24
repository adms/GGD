import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * seat-reservation-window — the guard for the defect that made every remote
 * one-click bot match bounce with "could not join the match: seat reservation
 * expired".
 *
 * Colyseus defaults a reservation to 15 SECONDS. Nothing overrode it, and the
 * client cannot possibly arrive that fast from a cold cache: the platform
 * reserves the seat and pushes it over the lobby WS, and only THEN does the
 * browser download a 2.8 MB entry chunk, the content tree and the champion
 * models before it opens the game socket.
 *
 * PROVEN, not reasoned about. A probe drove the real path — register → lobby WS
 * → POST /rooms/solo → wait → consumeSeatReservation — against a live platform
 * and game server, with a deliberate 20 s pause standing in for the asset
 * download:
 *
 *   setSeatReservationTime(15)  → "seat reservation expired."   (the owner's bug)
 *   setSeatReservationTime(120) → joined, room alive, state populated
 *
 * Same script, same wait, only the constant differed.
 *
 * This test reads the source rather than instantiating a Room because
 * `seatReservationTime` is protected in @colyseus/core and the setter is the
 * only supported way in — so the thing worth pinning is that the call exists
 * with a value large enough to survive a slow first load. 60 s is the floor:
 * below it we are back to betting that the owner's LAN speed is what every
 * family member has.
 */
describe("seat reservation window (seat-reservation-window)", () => {
  for (const room of ["MatchRoom.ts", "ReplayRoom.ts"]) {
    it(`${room} sets a reservation window long enough for a cold client`, () => {
      const src = readFileSync(join(HERE, room), "utf8");
      const m = /setSeatReservationTime\(\s*(\d+)\s*\)/.exec(src);
      expect(m, `${room} must call setSeatReservationTime — Colyseus defaults to 15 s, which is not survivable`).not.toBeNull();
      const seconds = Number(m![1]);
      expect(
        seconds,
        `${room} reserves seats for ${seconds}s; a cold client downloading the full asset set needs more. ` +
          `15s is the Colyseus default that caused "seat reservation expired" on every remote match.`,
      ).toBeGreaterThanOrEqual(60);
    });
  }
});
