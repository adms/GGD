/**
 * Room-cap mutability (cap-01..cap-04).
 *
 * The concurrent-match ceiling became operator-editable (admin 系統運維). The
 * one thing that must be true, and the reason this file exists: LOWERING THE
 * CAP BELOW THE LIVE COUNT MUST NOT END A SINGLE MATCH. A config field that can
 * stop 13 games in progress is a kill switch wearing a number.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import {
  RoomRegistry,
  clampCapacity,
  DEFAULT_MAX_ROOMS,
  MAX_ROOM_CAPACITY,
  MIN_ROOM_CAPACITY,
} from "./roomRegistry";

describe("room registry: a mutable ceiling", () => {
  it("cap-01: lowering the cap under the live count drains, it never evicts", () => {
    cover("cap-01");
    const reg = new RoomRegistry(200);
    for (let i = 0; i < 63; i++) expect(reg.tryAcquire()).toBe(true);
    expect(reg.active).toBe(63);
    expect(reg.draining).toBe(false);

    // The operator saves 50 while 63 matches are running.
    expect(reg.setCapacity(50)).toBe(true);

    // Nothing was ended. This is the whole point.
    expect(reg.active).toBe(63);
    expect(reg.capacity).toBe(50);
    expect(reg.draining).toBe(true);
    // What the operator sees: 63 進行中 / 上限 50 — no new match starts.
    expect(reg.stats()).toEqual({ active: 63, capacity: 50, draining: true });
    expect(reg.tryAcquire()).toBe(false);

    // 12 matches finish on their own → still over the line, still refusing.
    for (let i = 0; i < 12; i++) reg.release();
    expect(reg.active).toBe(51);
    expect(reg.tryAcquire()).toBe(false);

    // The 13th finishes → admission resumes at exactly the new ceiling.
    reg.release();
    expect(reg.active).toBe(50);
    expect(reg.draining).toBe(false);
    expect(reg.tryAcquire()).toBe(false); // 50 live, ceiling 50 → still full
    reg.release();
    expect(reg.tryAcquire()).toBe(true);
    expect(reg.active).toBe(50);
  });

  it("cap-02: garbage is refused, not applied — a config outage keeps the last good ceiling", () => {
    cover("cap-02");
    const reg = new RoomRegistry(50);

    // 0 is not a small ceiling, it is a total outage: every create would throw.
    expect(reg.setCapacity(0)).toBe(false);
    expect(reg.capacity).toBe(50);

    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 12.5, MAX_ROOM_CAPACITY + 1]) {
      expect(reg.setCapacity(bad)).toBe(false);
      expect(reg.capacity).toBe(50);
    }

    // The bounds themselves are legal values.
    expect(reg.setCapacity(MIN_ROOM_CAPACITY)).toBe(true);
    expect(reg.capacity).toBe(MIN_ROOM_CAPACITY);
    expect(reg.setCapacity(MAX_ROOM_CAPACITY)).toBe(true);
    expect(reg.capacity).toBe(MAX_ROOM_CAPACITY);
  });

  it("cap-03: raising the cap admits again immediately", () => {
    cover("cap-03");
    const reg = new RoomRegistry(2);
    expect(reg.tryAcquire()).toBe(true);
    expect(reg.tryAcquire()).toBe(true);
    expect(reg.tryAcquire()).toBe(false);
    reg.setCapacity(4);
    expect(reg.tryAcquire()).toBe(true);
    expect(reg.active).toBe(3);
  });

  it("cap-04: the shipped ceiling is 50 and a bad constructor argument cannot install an outage", () => {
    cover("cap-04");
    expect(DEFAULT_MAX_ROOMS).toBe(50);
    expect(clampCapacity(50)).toBe(50);
    expect(clampCapacity(0)).toBeNull();
    expect(clampCapacity(501)).toBeNull();
    expect(clampCapacity("50")).toBeNull();

    // A registry built from junk falls back to the hard ceiling rather than to
    // zero: refusing every match is worse than allowing too many.
    expect(new RoomRegistry(Number.NaN).capacity).toBe(MAX_ROOM_CAPACITY);
    expect(new RoomRegistry(0).capacity).toBe(MAX_ROOM_CAPACITY);
  });
});
