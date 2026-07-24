/**
 * audio/SpatialSfxQueue — the assertion that maps directly onto the owner's
 * complaint 「不知道誰做了什麼」.
 *
 * `SfxGate` caps `abilityCast` at `maxConcurrent 1` / `cooldownMs 1200`, keyed on
 * the event string alone. Before this queue existed, the one cast you got to
 * hear per 1.2 s was whichever event happened to be drained first. The test
 * below pushes a third party's cast FIRST and your own SECOND, runs them through
 * a gate that admits exactly one, and requires YOURS to be the one that sounds.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { SpatialSfxQueue, QUEUE_MAX } from "./SpatialSfxQueue";
import type { SfxPlayOptions } from "./AudioSystem";
import type { SpatialListener, SpatialSource } from "./spatial";

const LISTENER: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 0 };

function src(x: number, z: number, relation: SpatialSource["relation"]): SpatialSource {
  return { x, z, relation, cls: "focus" };
}

/** A play() spy with an optional one-slot cap, standing in for the SfxGate. */
function recorder(cap = Infinity): {
  play: (key: string, opts?: SfxPlayOptions) => boolean;
  calls: { key: string; opts?: SfxPlayOptions }[];
} {
  const calls: { key: string; opts?: SfxPlayOptions }[] = [];
  let admitted = 0;
  return {
    calls,
    play: (key, opts) => {
      if (admitted >= cap) return false; // gate refuses — exactly like a full key
      admitted++;
      calls.push({ key, opts });
      return true;
    },
  };
}

describe("SpatialSfxQueue priority (audio-spatial-priority-gate)", () => {
  it("gives the ONE gate slot to your own cast, not to the one that arrived first", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    // arrival order is deliberately hostile: the stranger is pushed first
    q.push("abilityCast", src(20, 0, "third"));
    q.push("abilityCast", src(0, 0, "self"));
    const r = recorder(1); // maxConcurrent 1, like the real audio-map entry
    expect(q.flush(LISTENER, r.play)).toBe(1);
    expect(r.calls.length).toBe(1);
    // yours is at distance 0 → unattenuated. The stranger's would have been ~0.09.
    expect(r.calls[0]!.opts!.volume).toBeCloseTo(1, 6);
    // …and it asks for NO PAN AT ALL rather than a pan of zero. `pan` present is
    // what makes AudioSystem build a StereoPannerNode, so a mathematically
    // centred source omits the field (spatial.PAN_SKIP) and costs one node, the
    // same as it did before this feature existed.
    expect(r.calls[0]!.opts!.pan).toBeUndefined();
    // it also stays in the SELF gate band — the bare key, not `key\0world`
    expect(r.calls[0]!.opts!.gateKey).toBe("abilityCast");
  });

  it("orders a whole frame's batch by relation band, then by nearness", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    q.push("d", src(25, 0, "third"));
    q.push("c", src(2, 0, "ally"));
    q.push("a", src(0, 0, "victim"));
    q.push("b", src(3, 0, "enemy"));
    q.push("e", src(12, 0, "third"));
    const r = recorder();
    q.flush(LISTENER, r.play);
    expect(r.calls.map((c) => c.key)).toEqual(["a", "b", "c", "e", "d"]);
  });

  it("keeps arrival order as the tie-break (the sort is stable)", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    q.push("first", src(4, 0, "enemy"));
    q.push("second", src(4, 0, "enemy"));
    q.push("third", src(4, 0, "enemy"));
    const r = recorder();
    q.flush(LISTENER, r.play);
    expect(r.calls.map((c) => c.key)).toEqual(["first", "second", "third"]);
  });

  it("empties itself on flush and reports its size", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    q.push("x", src(1, 0, "enemy"));
    q.push("y", null);
    expect(q.size).toBe(2);
    q.flush(LISTENER, recorder().play);
    expect(q.size).toBe(0);
    q.push("z", null);
    q.reset();
    expect(q.size).toBe(0);
    expect(q.flush(LISTENER, recorder().play)).toBe(0);
  });
});

describe("SpatialSfxQueue emission (audio-spatial-priority-gate)", () => {
  it("does not call play AT ALL for an out-of-range source", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    q.push("hit", src(31, 0, "enemy")); // past SPATIAL_FAR
    const r = recorder();
    expect(q.flush(LISTENER, r.play)).toBe(0);
    // THE POINT: a distant fight must not merely be quiet, it must never enter
    // the mixer — otherwise it eats the gate slot the near fight needs.
    expect(r.calls.length).toBe(0);
  });

  it("passes NO options at all for a deliberately centred cue", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    q.push("footstep", null);
    const r = recorder();
    q.flush(LISTENER, r.play);
    // identical to today's `playSfx("footstep")` — no panner, no filter, no
    // volume multiplier, so a centred cue cannot regress the existing mix.
    expect(r.calls[0]!.opts).toBeUndefined();
  });

  it("omits lowpassHz entirely when there is no depth to render", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    q.push("near", src(3, -6, "enemy")); // toward the viewer → never filtered
    q.push("far", src(3, 12, "enemy")); // away → filtered
    const r = recorder();
    q.flush(LISTENER, r.play);
    const near = r.calls.find((c) => c.key === "near")!;
    const far = r.calls.find((c) => c.key === "far")!;
    expect("lowpassHz" in near.opts!).toBe(false);
    expect(far.opts!.lowpassHz).toBeCloseTo(3008.48, 1);
  });

  it("degrades to CENTRED, never to silence, when there is no listener yet", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    q.push("hit", src(5, 0, "enemy"));
    q.push("crit", src(500, 0, "third")); // even one that WOULD be culled
    const r = recorder();
    expect(q.flush(null, r.play)).toBe(2);
    // Pre-spawn / settlement freeze has no local body. Going quiet there would
    // be a regression against today's behaviour, which is the one thing this
    // feature must never do.
    expect(r.calls.every((c) => c.opts === undefined)).toBe(true);
  });
});

describe("SpatialSfxQueue overflow (audio-spatial-priority-gate)", () => {
  it("evicts the WORST entry at the cap, not the newest", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    for (let i = 0; i < QUEUE_MAX; i++) q.push(`junk${i}`, src(10, 0, "third"));
    expect(q.size).toBe(QUEUE_MAX);
    q.push("mine", src(0, 0, "victim")); // arrives last, matters most
    expect(q.size).toBe(QUEUE_MAX);
    const r = recorder(1);
    q.flush(LISTENER, r.play);
    expect(r.calls[0]!.key).toBe("mine");
  });

  it("ignores an empty key", () => {
    cover("audio-spatial-priority-gate");
    const q = new SpatialSfxQueue();
    q.push("", src(1, 0, "enemy"));
    expect(q.size).toBe(0);
  });
});
