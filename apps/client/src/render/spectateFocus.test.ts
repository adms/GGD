/**
 * spectate-live-zone (task #208): the pure "which zone should I watch" decision
 * for a spectator whose own duel is already over. GGD rounds are paired duels;
 * when your 3v3 is decided but another zone is still fighting the camera must
 * jump to the live fight instead of leaving you on your finished/empty zone.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ownDuelDecided, pickSpectateZone, type DuelView } from "./spectateFocus";

/** Shorthand for a duel view. */
function duel(zone: number, live: boolean): DuelView {
  return { zone, live };
}

describe("ownDuelDecided (spectate-live-zone)", () => {
  it("is false while my own duel is still live", () => {
    cover("spectate-live-zone");
    expect(ownDuelDecided(0, [duel(0, true), duel(1, true)])).toBe(false);
  });

  it("is true once my own duel is decided", () => {
    cover("spectate-live-zone");
    expect(ownDuelDecided(0, [duel(0, false), duel(1, true)])).toBe(true);
  });

  it("degrades to false (still live) when my zone is unknown or absent", () => {
    cover("spectate-live-zone");
    // null zone (no local champion) — never redirect, keep #85 armed
    expect(ownDuelDecided(null, [duel(0, false)])).toBe(false);
    // my zone is not among the duels (bye team, or stale frame)
    expect(ownDuelDecided(9, [duel(0, false), duel(1, false)])).toBe(false);
    // no duels at all (outside combat)
    expect(ownDuelDecided(0, [])).toBe(false);
  });
});

describe("pickSpectateZone (spectate-live-zone)", () => {
  it("stays put (null) while my own duel is still live", () => {
    cover("spectate-live-zone");
    // both zones fighting → keep following my own fight, never hijack the camera
    expect(pickSpectateZone(0, [duel(0, true), duel(1, true)])).toBeNull();
  });

  it("jumps to the OTHER live zone once my duel is decided", () => {
    cover("spectate-live-zone");
    expect(pickSpectateZone(0, [duel(0, false), duel(1, true)])).toBe(1);
    // symmetric: if zone 1 is mine and decided, watch the live zone 0
    expect(pickSpectateZone(1, [duel(0, true), duel(1, false)])).toBe(0);
  });

  it("does not matter whether I won or lost my duel — only that it is decided", () => {
    cover("spectate-live-zone");
    // The function has no notion of who won; a decided own-duel + a live other
    // zone always redirects, so both the dead loser and the idle winner watch.
    const duels = [duel(0, false), duel(1, true)];
    expect(pickSpectateZone(0, duels)).toBe(1);
  });

  it("picks the LOWEST live zone id deterministically when several are live", () => {
    cover("spectate-live-zone");
    // my zone 3 decided; zones 2 and 1 both live → the lowest (1), stably
    const duels = [duel(3, false), duel(2, true), duel(1, true)];
    expect(pickSpectateZone(3, duels)).toBe(1);
    // order in the array must not change the pick
    const shuffled = [duel(1, true), duel(3, false), duel(2, true)];
    expect(pickSpectateZone(3, shuffled)).toBe(1);
  });

  it("stays put (null) when my duel is decided but NO other zone is live", () => {
    cover("spectate-live-zone");
    // every duel decided → the round is about to conclude; hold for the beat
    expect(pickSpectateZone(0, [duel(0, false), duel(1, false)])).toBeNull();
    // single-duel round (3 alive → 1 duel + bye, or 2 alive): nothing else to watch
    expect(pickSpectateZone(0, [duel(0, false)])).toBeNull();
  });

  it("never redirects while my zone is unknown", () => {
    cover("spectate-live-zone");
    expect(pickSpectateZone(null, [duel(0, true), duel(1, true)])).toBeNull();
    // even if another zone is decided/live, an unknown own-zone means "don't touch"
    expect(pickSpectateZone(null, [duel(0, false), duel(1, true)])).toBeNull();
  });
});
