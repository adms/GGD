/**
 * Snapshot-rate resolution: the compiled default, the env override, and the
 * clamp. Guards the thing that was actually broken before this change — nothing
 * assigned Room.patchRate at all, so SNAPSHOT_HZ was decorative and the wire
 * rate was Colyseus's DEFAULT_PATCH_RATE (50 ms).
 */
import { describe, it, expect } from "vitest";
import { SNAPSHOT_HZ, SNAPSHOT_MS, TICK_HZ } from "@ggd/shared/constants";
import {
  resolveSnapshotHz,
  resolveSnapshotMs,
  MIN_SNAPSHOT_HZ,
  MAX_SNAPSHOT_HZ,
} from "./snapshotRate";

const env = (v?: string): NodeJS.ProcessEnv =>
  (v === undefined ? {} : { GGD_SNAPSHOT_HZ: v }) as NodeJS.ProcessEnv;

describe("snapshot rate resolution", () => {
  it("defaults to the compiled SNAPSHOT_HZ", () => {
    expect(resolveSnapshotHz(env())).toBe(SNAPSHOT_HZ);
    expect(resolveSnapshotMs(env())).toBeCloseTo(SNAPSHOT_MS, 9);
  });

  it("is NOT the Colyseus default any more", () => {
    // The regression this whole change exists to prevent: a 50 ms patch rate
    // silently inherited from the library because nobody assigned patchRate.
    expect(resolveSnapshotMs(env())).not.toBeCloseTo(50, 3);
    expect(resolveSnapshotMs(env())).toBeCloseTo(1000 / 30, 6);
  });

  it("honours a valid env override without a rebuild", () => {
    expect(resolveSnapshotHz(env("20"))).toBe(20);
    expect(resolveSnapshotMs(env("20"))).toBeCloseTo(50, 9);
    expect(resolveSnapshotHz(env("25"))).toBe(25);
  });

  it("falls back to the default for junk, empty and out-of-range values", () => {
    for (const bad of ["", "abc", "NaN", "0", "-30", "1000", String(TICK_HZ + 1)]) {
      expect(resolveSnapshotHz(env(bad))).toBe(SNAPSHOT_HZ);
    }
  });

  it("clamps to a band the interpolation buffer can actually work in", () => {
    expect(MIN_SNAPSHOT_HZ).toBe(TICK_HZ / 2);
    expect(MAX_SNAPSHOT_HZ).toBe(TICK_HZ);
    expect(resolveSnapshotHz(env(String(MIN_SNAPSHOT_HZ)))).toBe(MIN_SNAPSHOT_HZ);
    expect(resolveSnapshotHz(env(String(MAX_SNAPSHOT_HZ)))).toBe(MAX_SNAPSHOT_HZ);
    expect(resolveSnapshotHz(env(String(MIN_SNAPSHOT_HZ - 1)))).toBe(SNAPSHOT_HZ);
  });
});
