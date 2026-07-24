/**
 * The client-side champion LOCK (champselect/lockGate). Covers the commit that
 * the champ-select bug report asked for: after 鎖定 the player can no longer
 * switch, before it they still can, and the clock running out auto-locks the
 * CURRENT pick (never clearing it — #130).
 *
 * AND the playtest P1 regression — 「auto-locks you into NOTHING」:
 *   1. the PRE-ROLL snapshot. MatchRoom.onCreate publishes room state with a
 *      real matchId while MatchState's schema defaults still read
 *      phase="champSelect" / phaseTicksLeft=0, and GameApp.connect() feeds that
 *      state straight in. The old `sec <= 0` rule read it as the buzzer and
 *      latched the lock (monotonic!) before the player picked anything.
 *   2. the EMPTY LOCK. Even a genuine timeout must never present 「🔒 已鎖定」
 *      over a seat with no champion.
 * The two blocks at the bottom are the focused proof for both.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  stepLock,
  lockPick,
  lockBanner,
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
  over: Partial<{ phase: string; matchId: string; pick: string }> = {},
) =>
  stepLock(state, {
    phase: over.phase ?? "champSelect",
    secondsLeft,
    matchId: over.matchId ?? M,
    // default to a champion in hand: these cases are about the FREEZE, not the
    // empty-seat trap (which has its own block below).
    pick: over.pick ?? "zoro",
  });

describe("champ-select lock — the commit that freezes a pick", () => {
  it("before the lock the player can still switch (pickAllowed = true)", () => {
    cover("client-champselect-lock");
    // fresh champ select, clock running: not locked, picks still land.
    const d = step(LOCK_INITIAL, 60);
    expect(d.locked).toBe(false);
    expect(d.status).toBe("open");
    expect(pickAllowed(d.locked)).toBe(true);
  });

  it("locking sets locked and DISABLES re-pick (pickAllowed = false)", () => {
    cover("client-champselect-lock");
    let s = step(LOCK_INITIAL, 40).next;
    expect(pickAllowed(step(s, 40).locked)).toBe(true); // still switchable
    s = lockPick(s); // press 鎖定
    const d = step(s, 39);
    expect(d.locked).toBe(true);
    expect(d.status).toBe("locked");
    expect(d.autoAssigned).toBe(false); // the player chose it themselves
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
    expect(timeout.status).toBe("locked");
    // the pick was the player's own, so it is NOT announced as a random hand-out
    expect(timeout.autoAssigned).toBe(false);
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
    expect(fresh.next.clockSeen).toBe(true); // rearmed, then this sample observed
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
});

// ---------------------------------------------------------------------------
// P1 — 「champ-select AUTO-LOCKS you into NOTHING」
// ---------------------------------------------------------------------------

describe("P1 — the PRE-ROLL snapshot must not latch a lock", () => {
  it("phase=champSelect + secondsLeft=0 as the FIRST sample is not an expiry", () => {
    cover("client-champselect-lock");
    // EXACTLY what GameApp.connect() feeds in right after join: a real matchId
    // with MatchState's schema defaults (phase "champSelect", phaseTicksLeft 0)
    // because MatchRoom.onCreate publishes before the first projectSnapshot.
    const preroll = step(LOCK_INITIAL, 0, { pick: "" });
    expect(preroll.locked).toBe(false); // the old code returned true here
    expect(preroll.status).toBe("open");
    expect(pickAllowed(preroll.locked)).toBe(true); // the roster stays usable
  });

  it("the real clock then arrives and the phase behaves normally", () => {
    cover("client-champselect-lock");
    let s = step(LOCK_INITIAL, 0, { pick: "" }).next; // pre-roll
    s = step(s, 40, { pick: "" }).next; // first real snapshot
    expect(step(s, 40, { pick: "" }).locked).toBe(false);
    // ...the player picks and the clock runs down; still open until the buzzer
    s = step(s, 12, { pick: "zoro" }).next;
    expect(step(s, 12, { pick: "zoro" }).locked).toBe(false);
    const buzzer = step(s, 0, { pick: "zoro" });
    expect(buzzer.locked).toBe(true); // a REAL expiry still locks
    expect(buzzer.status).toBe("locked");
  });

  it("several pre-roll zeros in a row still cannot lock", () => {
    cover("client-champselect-lock");
    let s = LOCK_INITIAL;
    for (let i = 0; i < 5; i++) {
      const d = step(s, 0, { pick: "" });
      expect(d.locked).toBe(false);
      s = d.next;
    }
    expect(step(s, 40, { pick: "" }).locked).toBe(false);
  });

  it("a bogus clock (NaN) is not evidence the phase ended", () => {
    cover("client-champselect-lock");
    const d = step(LOCK_INITIAL, Number.NaN, { pick: "" });
    expect(d.locked).toBe(false); // was: auto-locked, i.e. locked onto nothing
    // and once a real clock has been seen, a NaN sample still does not lock
    const seen = step(LOCK_INITIAL, 30, { pick: "" }).next;
    expect(step(seen, Number.NaN, { pick: "" }).locked).toBe(false);
  });
});

describe("P1 — a frozen seat is NEVER presented as locked onto nothing", () => {
  it("expiry with no champion reads awaiting-auto, not locked", () => {
    cover("client-champselect-lock");
    const s = step(LOCK_INITIAL, 3, { pick: "" }).next; // clock seen running
    const timeout = step(s, 0, { pick: "" });
    expect(timeout.locked).toBe(true); // the roster IS frozen (server decides now)
    expect(timeout.status).toBe("awaiting-auto"); // but nothing claims to be locked
    expect(lockBanner(timeout.status, timeout.autoAssigned, "")).toEqual({
      tone: "waiting",
      text: "⏳ 時間到 — 系統正在為你隨機選一隻英雄…",
    });
  });

  it("the server's random arrives and it is ANNOUNCED, never silent", () => {
    cover("client-champselect-lock");
    let s = step(LOCK_INITIAL, 3, { pick: "" }).next;
    s = step(s, 0, { pick: "" }).next; // buzzer, still empty
    const assigned = step(s, 0, { pick: "zoro" }); // autoPickAndSpawn filled the seat
    expect(assigned.status).toBe("locked");
    expect(assigned.autoAssigned).toBe(true);
    expect(lockBanner(assigned.status, assigned.autoAssigned, "索隆")).toEqual({
      tone: "auto",
      text: "🎲 已為你隨機選擇：索隆",
    });
  });

  it("no reachable state ever renders a lock banner without a champion name", () => {
    cover("client-champselect-lock");
    // exhaustive over the decision surface: status x autoAssigned x name
    for (const status of ["open", "awaiting-auto", "locked"] as const) {
      for (const auto of [false, true]) {
        for (const name of ["", "   ", "索隆"]) {
          const banner = lockBanner(status, auto, name);
          if (banner === null) {
            expect(status).toBe("open");
            continue;
          }
          // the invariant: anything that CLAIMS a commit names the champion
          if (banner.tone === "locked" || banner.tone === "auto") {
            expect(banner.text).toContain(name.trim());
            expect(name.trim()).not.toBe("");
          } else {
            expect(banner.text).not.toContain("已鎖定");
          }
        }
      }
    }
  });

  it("an explicit 鎖定 on an empty pick still cannot claim a lock", () => {
    cover("client-champselect-lock");
    // the panel guards this (lockIn returns early without a pick), but the gate
    // must not depend on that guard for the invariant.
    const forced = step(lockPick(step(LOCK_INITIAL, 30, { pick: "" }).next), 25, { pick: "" });
    expect(forced.locked).toBe(true);
    expect(forced.status).toBe("awaiting-auto");
  });
});

describe("champ-select lock — the module singleton the panel shares", () => {
  it("observeLock + lockCurrentPick drive the shared lock across remounts", () => {
    cover("client-champselect-lock");
    __resetLock();
    // first sample: unlocked, still switchable.
    expect(observeLock({ phase: "champSelect", secondsLeft: 55, matchId: M, pick: "zoro" }).locked).toBe(
      false,
    );
    // the panel presses 鎖定.
    lockCurrentPick();
    // a later sample (e.g. after a remount) still reports locked.
    const after = observeLock({ phase: "champSelect", secondsLeft: 40, matchId: M, pick: "zoro" });
    expect(after.locked).toBe(true);
    expect(after.status).toBe("locked");
    __resetLock();
    // a fresh singleton is unlocked again.
    expect(observeLock({ phase: "champSelect", secondsLeft: 55, matchId: M, pick: "zoro" }).locked).toBe(
      false,
    );
    __resetLock();
  });

  it("observeLock auto-locks at the timeout without any explicit lock call", () => {
    cover("client-champselect-lock");
    __resetLock();
    expect(observeLock({ phase: "champSelect", secondsLeft: 3, matchId: M, pick: "zoro" }).locked).toBe(
      false,
    );
    expect(observeLock({ phase: "champSelect", secondsLeft: 0, matchId: M, pick: "zoro" }).locked).toBe(
      true,
    );
    __resetLock();
  });

  it("REGRESSION: the singleton survives the join sequence unlocked", () => {
    cover("client-champselect-lock");
    __resetLock();
    // the exact live sequence: pre-roll state, then snapshots at 20 Hz.
    const preroll = observeLock({ phase: "champSelect", secondsLeft: 0, matchId: "dev-ab12cd34", pick: "" });
    expect(preroll.locked).toBe(false);
    expect(preroll.status).toBe("open");
    for (const sec of [40, 40, 39, 39, 38]) {
      const d = observeLock({ phase: "champSelect", secondsLeft: sec, matchId: "dev-ab12cd34", pick: "" });
      expect(d.locked).toBe(false);
      expect(d.status).toBe("open");
    }
    __resetLock();
  });
});
