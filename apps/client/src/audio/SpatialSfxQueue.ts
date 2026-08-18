/**
 * audio/SpatialSfxQueue — one frame's worth of combat sound, sorted by what
 * matters before any of it reaches `playSfx`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS (it is not a performance buffer)
 * ---------------------------------------------------------------------------
 * `SfxGate` (audio/audioSelect) rate-limits by the EVENT KEY ALONE — one
 * cooldown and one voice cap per key, with no notion of a source. From
 * `content/config/audio-map.json`: `abilityCast` is `cooldownMs 1200,
 * maxConcurrent 1`. In a twelve-champion fight that is at most ONE ability
 * whoosh per 1.2 seconds arena-wide, and today the winner is whichever event
 * happened to be drained first — a lottery. Panning that arbitrary winner
 * perfectly changes nothing about 「不知道誰做了什麼」.
 *
 * So the frame's events are collected here, sorted by `mix.priority` DESCENDING,
 * and only then emitted. The gate now sees the best candidate first instead of
 * the earliest.
 *
 * ---------------------------------------------------------------------------
 * THE SORT IS NOT ENOUGH ON ITS OWN — AND THAT WAS A REAL DEFECT
 * ---------------------------------------------------------------------------
 * The first build of this file claimed the sort gave the local player priority
 * for a contested slot. It does not, and the claim was false in exactly the case
 * it was written for. `SfxGate`'s cooldown is CROSS-FRAME; this sort is
 * WITHIN-frame. Your footstep and a stranger's almost never land in the same
 * 16 ms, so the sort never gets to compare them — whoever arrives while the
 * 170 ms `footstep` cooldown happens to be open wins. MEASURED over a 60 s walk
 * on the real gate: 224/224 of your own steps with nobody near you, 48/224
 * (21 %) with three champions near you. Adding eleven footstep sources had made
 * the game QUIETER for the one body the player is actually driving.
 *
 * The fix is `spatial.gateKeyFor`, applied at flush: `self`/`victim` sounds keep
 * the BARE event key — i.e. precisely the budget they had before any of this
 * existed — and everyone else competes in a parallel `key\0world` band. The sort
 * still decides who wins the world band. Both halves are needed: the band stops
 * the starvation, the sort makes the survivor the right one.
 *
 * ---------------------------------------------------------------------------
 * IT ALSO FIXES A ONE-FRAME STALENESS, FOR FREE
 * ---------------------------------------------------------------------------
 * In `GameApp.frame` the event drain is step 1, `views.sync` (which updates the
 * position registry) is step 4, and the camera rigs update in step 5. A pan
 * computed inline at the drain would therefore use LAST frame's listener. The
 * queue is flushed after step 5, so the listener is exactly current. The cost is
 * up to one frame (16–33 ms) of added audio latency on a one-shot — an order of
 * magnitude under the network jitter already in the pipe. The queue had to exist
 * for the priority sort anyway.
 */
import type { SfxPlayOptions } from "./AudioSystem";
import {
  gateKeyFor,
  PAN_SKIP,
  spatialMix,
  spatialPriority,
  type SpatialListener,
  type SpatialSource,
} from "./spatial";

/**
 * Hard cap on one frame's batch. A frame that somehow produced more than this
 * is already past every gate cap combined (Σ maxConcurrent over the combat keys
 * is 115), so the excess could only ever be dropped — the question is WHICH.
 * Dropping the newest would reinstate arrival-order bias, so at the cap the
 * lowest-priority entry is evicted instead.
 */
export const QUEUE_MAX = 192;

export interface QueuedSfx {
  key: string;
  /**
   * Where the sound is, or **null** for a deliberately CENTRED in-world cue
   * (`audio/combatSfxSpatial.CENTRED_EVENTS`, the local champion's own
   * footstep, an entity whose position is not resolvable on its first frame).
   * A centred entry plays with NO options at all — byte-identical to today's
   * `playSfx(key)` — so it allocates no spatial node and cannot regress the
   * existing mix.
   */
  source: SpatialSource | null;
  /** priority used for a centred entry (see `push`). */
  centredPriority: number;
  /**
   * 呼叫端的音量倍率（GH#390 的 `soundGain`）。1 = 不動 = 這個功能出現之前的
   * 每一個呼叫端走的那條路：`volume` 完全不出現在 opts 裡，centred 那一支仍然
   * 是**一個 option 都沒有**的 `playSfx(key)`。
   *
   * ⛔ 它不可以變成「乘在 spatialMix 之後就好」—— centred 那一支根本不走
   * `spatialMix`，只在那裡乘的話 `soundGain` 對每一發置中的音**逐位元等於不存在**
   * （第一·五守則的形狀：欄位存在、後台存得起來、而它什麼都不做）。
   */
  gain: number;
}

/**
 * Priority given to a deliberately-centred cue. `self` band, distance 0 — these
 * are the local player's own body and clock (a revive completing on you, your
 * own footstep, the guardian gold chime), so they must outrank a stranger's
 * chatter for a contested gate slot. They still yield to a `victim` event: a hit
 * landing on you always wins.
 */
const CENTRED_PRIORITY = spatialPriority("self", 0);

export class SpatialSfxQueue {
  private readonly items: QueuedSfx[] = [];

  /**
   * Queue one sound. `source === null` means "play it, centred" — NOT "drop it".
   * The decision to drop belongs to `spatialMix` (out of range / cross-zone) and
   * is taken at flush, when the listener is known.
   */
  push(key: string, source: SpatialSource | null, gain = 1): void {
    if (!key) return;
    const item: QueuedSfx = { key, source, centredPriority: CENTRED_PRIORITY, gain };
    if (this.items.length < QUEUE_MAX) {
      this.items.push(item);
      return;
    }
    // At the cap: evict the current worst rather than refusing the newcomer, so
    // an overflowing frame still keeps its most important sounds.
    let worst = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (this.rawPriority(this.items[i]!) < this.rawPriority(this.items[worst]!)) worst = i;
    }
    if (this.rawPriority(item) > this.rawPriority(this.items[worst]!)) this.items[worst] = item;
  }

  /**
   * Emit the frame's batch, best first, then clear.
   *
   * A **null listener** (no local champion yet: pre-match, mid-spawn, the
   * settlement freeze) degrades every entry to centred rather than to silence.
   * Going quiet there would be a regression against today's behaviour, and the
   * one thing this feature must never do is make the game quieter than it was.
   *
   * Returns how many sounds were handed to `play` (diagnostics / tests).
   */
  flush(listener: SpatialListener | null, play: (key: string, opts?: SfxPlayOptions) => boolean): number {
    if (this.items.length === 0) return 0;

    const resolved: { key: string; opts: SfxPlayOptions | undefined; priority: number }[] = [];
    for (const item of this.items) {
      if (!item.source || !listener) {
        // centred: no opts at all → identical to the pre-spatial call path, and
        // it keeps the BARE gate key (the self band), which is the same budget
        // it competed in before this feature existed.
        resolved.push({
          key: item.key,
          opts: item.gain === 1 ? undefined : { volume: item.gain },
          priority: item.centredPriority,
        });
        continue;
      }
      const mix = spatialMix(listener, item.source);
      if (!mix) continue; // out of range / cross-zone → never enters the mixer
      resolved.push({
        key: item.key,
        opts: {
          volume: mix.volume * item.gain,
          // NODE BUDGET: `pan` present at all is what makes `makeSpatialChain`
          // build a StereoPannerNode, so an inaudible pan is omitted rather than
          // rounded. See spatial.PAN_SKIP — this is what keeps the local
          // player's own centred cues at exactly one node per voice, the cost
          // they had before this feature.
          ...(Math.abs(mix.pan) >= PAN_SKIP ? { pan: mix.pan } : {}),
          ...(mix.lowpassHz !== null ? { lowpassHz: mix.lowpassHz } : {}),
          // BAND, not event: eleven remote feeders must not eat the local
          // player's cooldown slots. See spatial.gateKeyFor for the measurement
          // that made this necessary.
          gateKey: gateKeyFor(item.key, item.source.relation),
        },
        priority: mix.priority,
      });
    }
    this.items.length = 0;

    // Array.prototype.sort is stable (spec-guaranteed), so equal priorities keep
    // their arrival order — the tie-break stays deterministic.
    resolved.sort((a, b) => b.priority - a.priority);
    let emitted = 0;
    for (const r of resolved) {
      if (play(r.key, r.opts)) emitted++;
    }
    return emitted;
  }

  /** Drop the batch without playing (match teardown, scene change). */
  reset(): void {
    this.items.length = 0;
  }

  get size(): number {
    return this.items.length;
  }

  private rawPriority(item: QueuedSfx): number {
    return item.source ? spatialPriority(item.source.relation, 0) : item.centredPriority;
  }
}
