/**
 * The client-side champion LOCK (champselect/lockGate). Covers the commit that
 * the champ-select bug report asked for: after 鎖定 the player can no longer
 * switch, before it they still can, and the clock running out auto-locks the
 * CURRENT pick (never clearing it — #130).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  stepLock,
  lockPick,
  pickAllowed,
  pickToCommitOnLock,
  observeLock,
  lockCurrentPick,
  __resetLock,
  LOCK_INITIAL,
  type LockState,
} from "./lockGate";

const M = "match-1";
const step = (
  state: LockState,
  secondsLeft: number,
  over: Partial<{ phase: string; matchId: string }> = {},
) => stepLock(state, { phase: over.phase ?? "champSelect", secondsLeft, matchId: over.matchId ?? M });

describe("champ-select lock — the commit that freezes a pick", () => {
  it("before the lock the player can still switch (pickAllowed = true)", () => {
    cover("client-champselect-lock");
    // fresh champ select, clock running: not locked, picks still land.
    const d = step(LOCK_INITIAL, 60);
    expect(d.locked).toBe(false);
    expect(pickAllowed(d.locked)).toBe(true);
  });

  it("locking sets locked and DISABLES re-pick (pickAllowed = false)", () => {
    cover("client-champselect-lock");
    let s = step(LOCK_INITIAL, 40).next;
    expect(pickAllowed(step(s, 40).locked)).toBe(true); // still switchable
    s = lockPick(s); // press 鎖定
    const d = step(s, 39);
    expect(d.locked).toBe(true);
    expect(pickAllowed(d.locked)).toBe(false); // roster/random no longer land
  });

  it("the lock is monotonic — it stays locked for the rest of the phase", () => {
    cover("client-champselect-lock");
    let s = lockPick(step(LOCK_INITIAL, 50).next);
    for (const sec of [40, 30, 10, 3, 1]) {
      const d = step(s, sec);
      expect(d.locked).toBe(true);
      s = d.next;
    }
  });

  it("auto-locks when the clock runs out, keeping the CURRENT pick (#130)", () => {
    cover("client-champselect-lock");
    // never pressed 鎖定; clock counts down to 0 → auto-locked.
    let s = step(LOCK_INITIAL, 5).next;
    expect(step(s, 5).locked).toBe(false);
    s = step(s, 2).next;
    expect(step(s, 2).locked).toBe(false);
    const timeout = step(s, 0);
    expect(timeout.locked).toBe(true);
    // the lock never invents or clears a pick — whatever the player had is kept.
    expect(pickToCommitOnLock("cook")).toBe("cook");
    expect(pickToCommitOnLock("")).toBe(""); // a genuinely empty pick stays empty (server fills it)
  });

  it("a reconnect in the SAME match keeps the lock", () => {
    cover("client-champselect-lock");
    const locked = lockPick(step(LOCK_INITIAL, 45).next);
    const reconnect = step(locked, 30); // same matchId, clock still running
    expect(reconnect.locked).toBe(true);
  });

  it("a NEW match rearms the lock (a fresh match starts unlocked)", () => {
    cover("client-champselect-lock");
    const locked = lockPick(step(LOCK_INITIAL, 40).next);
    expect(step(locked, 39).locked).toBe(true);
    const fresh = step(locked, 60, { matchId: "match-2" });
    expect(fresh.locked).toBe(false);
    expect(fresh.next.locked).toBe(false);
  });

  it("does not auto-lock outside champ select, but holds the same-match state", () => {
    cover("client-champselect-lock");
    // phase already moved on, clock at 0 → no spurious lock.
    const d = step(LOCK_INITIAL, 0, { phase: "intermission" });
    expect(d.locked).toBe(false);
    // and a lock set during champ select survives a non-champSelect sample.
    const locked = lockPick(step(LOCK_INITIAL, 40).next);
    expect(step(locked, 0, { phase: "intermission" }).locked).toBe(true);
  });

  it("tolerates a bogus clock without throwing (NaN → treated as 0 → auto-lock)", () => {
    cover("client-champselect-lock");
    const d = step(LOCK_INITIAL, Number.NaN);
    expect(d.locked).toBe(true); // NaN floors to 0 → the pick is treated as final
  });
});

describe("champ-select lock — the module singleton the panel shares", () => {
  it("observeLock + lockCurrentPick drive the shared lock across remounts", () => {
    cover("client-champselect-lock");
    __resetLock();
    // first sample: unlocked, still switchable.
    expect(observeLock({ phase: "champSelect", secondsLeft: 55, matchId: M })).toBe(false);
    // the panel presses 鎖定.
    lockCurrentPick();
    // a later sample (e.g. after a remount) still reports locked.
    expect(observeLock({ phase: "champSelect", secondsLeft: 40, matchId: M })).toBe(true);
    __resetLock();
    // a fresh singleton is unlocked again.
    expect(observeLock({ phase: "champSelect", secondsLeft: 55, matchId: M })).toBe(false);
  });

  it("observeLock auto-locks at the timeout without any explicit lock call", () => {
    cover("client-champselect-lock");
    __resetLock();
    expect(observeLock({ phase: "champSelect", secondsLeft: 3, matchId: M })).toBe(false);
    expect(observeLock({ phase: "champSelect", secondsLeft: 0, matchId: M })).toBe(true);
    __resetLock();
  });
});
