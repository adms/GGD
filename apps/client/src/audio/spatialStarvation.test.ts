/**
 * spatialStarvation — the adversarial finding that stopped the spatial-audio
 * feature from shipping, reproduced against the REAL gate and then closed.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG, AND WHY NO EXISTING TEST COULD SEE IT
 * ═══════════════════════════════════════════════════════════════════════════
 * `audio/remoteFootsteps` gives the other eleven champions a walking sound —
 * the highest-value item in the whole request, since a flanker you cannot see is
 * exactly what a fixed camera hides. But all twelve bodies feed ONE audio-map
 * key, `footstep` (`cooldownMs 170, maxConcurrent 2`), and `SfxGate` rate-limits
 * by that key alone with a CROSS-FRAME cooldown. Eleven new feeders do not share
 * that budget with the incumbent; they take it.
 *
 * `SpatialSfxQueue` sorts by priority, which looks like the defence — and is
 * not, because it sorts WITHIN one frame's batch. A local step and a remote step
 * essentially never land in the same 16 ms, so the sort never compares them.
 * Every unit test of the queue passed, because each one hands it a single
 * synthetic batch. The defect only exists ACROSS frames, which is why the test
 * below runs a 60-second walk at 60 fps through the real `SfxGate` instead.
 *
 * The measured shape (before `spatial.gateKeyFor`):
 *     0 remote champions  → 224 / 224 own steps heard  (100 %)
 *     3 remote champions  →  48 / 224                  ( 21 %)
 * i.e. the feature whose entire purpose was legibility deleted 79 % of the one
 * sound the player was certain about.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE ASSERTS
 * ═══════════════════════════════════════════════════════════════════════════
 * The property, not the number: WITH remote champions walking around you, your
 * own footsteps must be heard exactly as often as they are with nobody there.
 * `NOTHING GOT QUIETER` is the whole contract, and it is asserted against the
 * real gate, the real map entry, and the real cadence — the three things a
 * mocked port cannot tell you about.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { SfxGate, DEFAULT_COOLDOWN_MS, DEFAULT_MAX_CONCURRENT } from "./audioSelect";
import { SpatialSfxQueue } from "./SpatialSfxQueue";
import { gateKeyFor, GATE_BAND_WORLD, PAN_SKIP, type SpatialListener } from "./spatial";
import type { SfxEntry } from "./types";

const REPO = join(__dirname, "..", "..", "..", "..");

/** The REAL authored entry — the numbers that actually gate the game. */
const FOOTSTEP: SfxEntry = (() => {
  const map = JSON.parse(readFileSync(join(REPO, "content", "config", "audio-map.json"), "utf8")) as {
    sfx: Record<string, SfxEntry>;
  };
  const e = map.sfx.footstep;
  if (!e) throw new Error("audio-map.json has no sfx.footstep — this test is measuring nothing");
  return e;
})();

/** Clip length used to model when a voice frees its concurrency slot. */
const CLIP_MS = 320;

/**
 * A minimal stand-in for the AudioSystem's play path: the same SfxGate, the same
 * entry, and a release scheduled at the clip's end — which is what makes
 * `maxConcurrent` mean anything across frames.
 */
class GatedMixer {
  readonly gate = new SfxGate();
  readonly heard: { key: string; gateKey: string; centred: boolean; t: number }[] = [];
  private readonly pending: { gateKey: string; endsAt: number }[] = [];

  /** advance the clock; frees any voice whose clip has finished */
  tick(nowMs: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i]!.endsAt <= nowMs) {
        this.gate.release(this.pending[i]!.gateKey);
        this.pending.splice(i, 1);
      }
    }
  }

  play(key: string, nowMs: number, opts?: { gateKey?: string }): boolean {
    const gk = opts?.gateKey ?? key;
    if (!this.gate.tryAcquire(gk, FOOTSTEP, nowMs)) return false;
    this.pending.push({ gateKey: gk, endsAt: nowMs + CLIP_MS });
    // WHOSE step this was is decided by `opts === undefined` (the centred, local
    // one) and NOT by the gate key — otherwise removing the banding would also
    // remove the test's ability to tell the two populations apart, and the
    // mutation check would report a meaningless number.
    this.heard.push({ key, gateKey: gk, centred: opts === undefined, t: nowMs });
    return true;
  }
}

const LISTENER: SpatialListener = { levelX: 0, levelZ: 0, dirX: 0, dirZ: 0 };

/**
 * Walk for `seconds` at 60 fps. The local champion emits a step every
 * LOCAL_STEP_MS; each of `remotes` emits one every REMOTE_STEP_MS, offset so they
 * do NOT coincide with the local one — which is the realistic case and the one
 * the within-frame sort cannot help with.
 */
const LOCAL_STEP_MS = 268; // ≈224 steps/min, the cadence FootstepCadence yields at run speed
const REMOTE_STEP_MS = 300;

function walk(seconds: number, remotes: number): { own: number; total: number; world: number } {
  const mixer = new GatedMixer();
  const queue = new SpatialSfxQueue();
  const frames = Math.round(seconds * 60);
  let nextLocal = 0;
  const nextRemote = Array.from({ length: remotes }, (_, i) => 37 + i * 91); // deliberately off-phase
  let ownEmitted = 0;

  for (let f = 0; f < frames; f++) {
    const now = Math.round((f * 1000) / 60);
    mixer.tick(now);

    if (now >= nextLocal) {
      queue.push("footstep", null); // centred — exactly how GameApp queues yours
      ownEmitted++;
      nextLocal += LOCAL_STEP_MS;
    }
    for (let r = 0; r < remotes; r++) {
      if (now >= nextRemote[r]!) {
        // 2.5 u away: well inside TEXTURE_FAR, so spatialMix admits it
        queue.push("footstep", { x: 2.5, z: 0.5 + r, cls: "texture", relation: "enemy" });
        nextRemote[r] = nextRemote[r]! + REMOTE_STEP_MS;
      }
    }
    queue.flush(LISTENER, (key, opts) => mixer.play(key, now, opts));
  }

  const own = mixer.heard.filter((h) => h.centred).length;
  const world = mixer.heard.filter((h) => !h.centred).length;
  return { own, total: ownEmitted, world };
}

describe("your own footsteps survive a crowd (spatial-no-starvation)", () => {
  it("every own step that fires is heard when nobody else is near", () => {
    cover("spatial-no-starvation");
    const alone = walk(60, 0);
    expect(alone.own).toBe(alone.total);
    expect(alone.total).toBeGreaterThan(200); // sanity: the walk really ran
  });

  it("THE FINDING: three champions nearby must not cost you a single step", () => {
    cover("spatial-no-starvation");
    const alone = walk(60, 0);
    const crowd = walk(60, 3);
    // This is the assertion that was 48 vs 224 before spatial.gateKeyFor.
    expect(crowd.own).toBe(alone.own);
  });

  it("holds at ELEVEN — the real worst case, a full twelve-body fight", () => {
    cover("spatial-no-starvation");
    const alone = walk(60, 0);
    const full = walk(60, 11);
    expect(full.own).toBe(alone.own);
    // and the remote layer is genuinely audible, not silently starved to zero —
    // an "everyone else is muted" fix would pass the assertion above and be
    // worse than the defect.
    expect(full.world).toBeGreaterThan(50);
  });

  it("the world band is CAPPED by the same authored numbers, not unbounded", () => {
    cover("spatial-no-starvation");
    // Eleven feeders do not get eleven budgets. They share ONE entry's worth of
    // cooldown+concurrency, so the added voice rate is bounded by the map the
    // owner tuned — roughly one band's worth, never one per champion.
    const full = walk(60, 11);
    const three = walk(60, 3);
    expect(full.world).toBeLessThan(three.world * 2);
    // upper bound from the entry itself: a 170 ms cooldown can admit at most
    // ~353 voices per minute in one band.
    const ceiling = Math.ceil(60_000 / (FOOTSTEP.cooldownMs ?? DEFAULT_COOLDOWN_MS));
    expect(full.world).toBeLessThanOrEqual(ceiling);
  });
});

describe("the banding itself (spatial-no-starvation)", () => {
  it("self and victim keep the BARE key — today's budget, unchanged", () => {
    cover("spatial-no-starvation");
    expect(gateKeyFor("footstep", "self")).toBe("footstep");
    expect(gateKeyFor("damage", "victim")).toBe("damage");
  });

  it("everyone else is banded away from it", () => {
    cover("spatial-no-starvation");
    for (const r of ["enemy", "ally", "third"] as const) {
      expect(gateKeyFor("footstep", r)).toBe("footstep" + GATE_BAND_WORLD);
    }
  });

  it("the band suffix cannot collide with a real authored event name", () => {
    cover("spatial-no-starvation");
    const map = JSON.parse(readFileSync(join(REPO, "content", "config", "audio-map.json"), "utf8")) as {
      sfx: Record<string, unknown>;
    };
    for (const key of Object.keys(map.sfx)) {
      expect(key.includes("\0"), `event name ${JSON.stringify(key)} contains NUL`).toBe(false);
    }
    // and the cap the world band inherits is a real number, not a default
    expect(FOOTSTEP.maxConcurrent ?? DEFAULT_MAX_CONCURRENT).toBeGreaterThan(0);
  });

  it("a centred cue asks for no panner at all (node budget)", () => {
    cover("spatial-no-starvation");
    const queue = new SpatialSfxQueue();
    const seen: (import("./AudioSystem").SfxPlayOptions | undefined)[] = [];
    queue.push("footstep", null);
    // a source at the direction anchor: mathematically pan 0
    queue.push("footstep", { x: 0, z: 0, cls: "texture", relation: "enemy" });
    queue.flush(LISTENER, (_k, o) => {
      seen.push(o);
      return true;
    });
    expect(seen[0]).toBeUndefined(); // centred → byte-identical to playSfx(key)
    expect(seen[1]?.pan).toBeUndefined(); // |pan| < PAN_SKIP → no node
    expect(PAN_SKIP).toBeGreaterThan(0);
  });

  it("but a real lateral offset still pans", () => {
    cover("spatial-no-starvation");
    const queue = new SpatialSfxQueue();
    const seen: (import("./AudioSystem").SfxPlayOptions | undefined)[] = [];
    queue.push("footstep", { x: 6, z: 0, cls: "texture", relation: "enemy" });
    queue.flush(LISTENER, (_k, o) => {
      seen.push(o);
      return true;
    });
    expect(seen[0]?.pan).toBeCloseTo(0.47636, 4); // PAN_MAX·tanh(6/8) = 0.75·0.635149
  });
});
