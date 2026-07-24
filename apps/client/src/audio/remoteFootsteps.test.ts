/**
 * audio/remoteFootsteps — the eleven champions that make no sound today.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  RemoteFootsteps,
  REMOTE_FOOTSTEP_COOLDOWN_MS,
  REMOTE_FOOTSTEP_MAX_PER_FRAME,
  type FootstepSample,
} from "./remoteFootsteps";
import { FOOTSTEP_STRIDE } from "./footsteps";
import { TEXTURE_FAR } from "./spatial";

/** Walk one entity in a straight line, returning the frames that sounded. */
function walk(
  fs: RemoteFootsteps,
  id: number,
  startX: number,
  z: number,
  perFrame: number,
  frames: number,
  msPerFrame = 100,
): number {
  let fired = 0;
  for (let i = 0; i < frames; i++) {
    const out = fs.step([{ id, x: startX + i * perFrame, z }], 0, 0, i * msPerFrame);
    if (out.length > 0) fired++;
  }
  return fired;
}

describe("RemoteFootsteps (audio-remote-footsteps)", () => {
  it("fires roughly one step per stride for a champion inside the audible ring", () => {
    cover("audio-remote-footsteps");
    const fs = new RemoteFootsteps();
    // 20 frames × 0.4 u = 8 u of travel at stride 1.6 → ~5 steps, spread over
    // 2 s so the per-source cooldown never bites.
    const fired = walk(fs, 7, 0, 2, 0.4, 20, 200);
    expect(fired).toBeGreaterThanOrEqual(4);
    expect(fired).toBeLessThanOrEqual(5);
    expect(fs.tracked).toBe(1);
  });

  it("stays SILENT for a champion standing still", () => {
    cover("audio-remote-footsteps");
    const fs = new RemoteFootsteps();
    expect(walk(fs, 7, 3, 0, 0, 30, 200)).toBe(0);
  });

  it("stays silent for a champion beyond the texture cutoff", () => {
    cover("audio-remote-footsteps");
    const fs = new RemoteFootsteps();
    // walking hard, but 20 u away — past TEXTURE_FAR, so spatialMix would have
    // dropped it anyway. Filtering here stops it spending a per-frame slot.
    expect(TEXTURE_FAR).toBeLessThan(20);
    expect(walk(fs, 7, 20, 0, 0.5, 20, 200)).toBe(0);
  });

  it("keeps the accumulator running while inaudible, so arrival is not a burst", () => {
    cover("audio-remote-footsteps");
    const fs = new RemoteFootsteps();
    // 30 u out, walking toward the listener the whole time
    let t = 0;
    let sounded = 0;
    for (let x = 30; x > TEXTURE_FAR + 1; x -= 0.5) {
      t += 100;
      sounded += fs.step([{ id: 7, x, z: 0 }], 0, 0, t).length;
    }
    expect(sounded).toBe(0);
    // the very first audible frame must produce AT MOST one step, not the
    // dozen strides that were accumulated on the way in
    t += 100;
    const first = fs.step([{ id: 7, x: TEXTURE_FAR - 0.5, z: 0 }], 0, 0, t);
    expect(first.length).toBeLessThanOrEqual(1);
  });

  it("throttles a single source with the per-source cooldown", () => {
    cover("audio-remote-footsteps");
    const fs = new RemoteFootsteps();
    // teleport-free but very fast: a full stride every 50 ms, well inside the
    // 260 ms cooldown. Without it this one champion machine-guns the key.
    let fired = 0;
    for (let i = 0; i < 20; i++) {
      fired += fs.step([{ id: 7, x: i * FOOTSTEP_STRIDE, z: 1 }], 0, 0, i * 50).length;
    }
    const elapsed = 19 * 50;
    expect(fired).toBeLessThanOrEqual(Math.ceil(elapsed / REMOTE_FOOTSTEP_COOLDOWN_MS) + 1);
    expect(fired).toBeGreaterThan(0);
  });

  it("caps a stampede per frame and keeps the NEAREST bodies", () => {
    cover("audio-remote-footsteps");
    const fs = new RemoteFootsteps();
    // eleven champions, all walking, at increasing distance
    const at = (t: number): FootstepSample[] =>
      Array.from({ length: 11 }, (_, i) => ({ id: i + 1, x: (i + 1) * 1.1, z: t * 2 }));
    fs.step(at(0), 0, 0, 0); // baseline the cadences
    const out = fs.step(at(1), 0, 0, 100); // everyone moves 2 u → everyone strides
    expect(out.length).toBe(REMOTE_FOOTSTEP_MAX_PER_FRAME);
    // the three nearest ids, in order — not the first three in the array by luck
    expect(out.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("forgets an entity that stops being reported (despawn / cull / round end)", () => {
    cover("audio-remote-footsteps");
    const fs = new RemoteFootsteps();
    fs.step([{ id: 1, x: 0, z: 0 }, { id: 2, x: 1, z: 0 }], 0, 0, 0);
    expect(fs.tracked).toBe(2);
    fs.step([{ id: 1, x: 0.2, z: 0 }], 0, 0, 100);
    expect(fs.tracked).toBe(1);
    fs.reset();
    expect(fs.tracked).toBe(0);
  });

  it("ignores a non-finite position instead of tracking a NaN body", () => {
    cover("audio-remote-footsteps");
    const fs = new RemoteFootsteps();
    fs.step([{ id: 1, x: NaN, z: 0 }, { id: 2, x: 0, z: Infinity }], 0, 0, 0);
    expect(fs.tracked).toBe(0);
  });
});
