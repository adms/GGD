/**
 * W3xCastFx — the COMBAT renderer's path to `W3xEmitterRig`.
 *
 * WHY THIS FILE EXISTS. `content/vfx` carries the map's own emitter art and
 * `render/vfx/w3xAbilityArt` says which abilities are entitled to it, but
 * `VfxSystem` could only play it the way it plays a primitive: each doc pooled
 * separately and collapsed by `frontLoadDoc` into ONE capped burst. That throws
 * away everything the rig was built for — the authored emission stream, the
 * KP2E/KP2V tracks, the effect-wide particle budget, and the per-effect
 * lifetime that guarantees an emitter stops. This class is the branch that
 * hands a promoted cast to the rig instead, and it is deliberately the ONLY
 * thing in `vfx/` that knows the rig exists.
 *
 * WHY IT IS A SEPARATE CLASS AND NOT A METHOD ON VfxSystem. Every bound below
 * is testable without a cast event: `liveCount`, `systemCount` and
 * `rigTotalSystems` are the leak canaries, and the 12-champion worst case is
 * asserted directly against them.
 *
 * ---------------------------------------------------------------------------
 * WHY THE RIG IS IMPORTED DIRECTLY AND NOT THROUGH THE BARREL
 * ---------------------------------------------------------------------------
 * `render/vfx/index.ts` deliberately does not re-export `W3xEmitterRig`, and the
 * reason it gives is PURITY, not bundle size: the barrel has to stay importable
 * from the doc generator and from Node tests, so it may not pull in
 * `@babylonjs/*`. The comment there explicitly sanctions
 * `import … from "render/vfx/W3xEmitterRig"`, which is what this file does.
 * `VfxSystem` is already Babylon-side (it imports `Scene`, `Vector3` and
 * `ParticleSystem`), so nothing about that constraint is violated.
 *
 * It is a STATIC import on purpose. A `await import()` would make the first
 * promoted cast asynchronous, i.e. the one cast the whole batch exists to make
 * legible would draw NOTHING on the frame it fires and then pop in late. What
 * IS deferred is the rig OBJECT: it is constructed on the first promoted cast,
 * so a match in which nobody casts promoted art allocates no rig, no pool and
 * no ParticleSystem.
 *
 * ---------------------------------------------------------------------------
 * WHAT 12 CHAMPIONS CASTING AT ONCE COSTS, AND WHAT BOUNDS IT
 * ---------------------------------------------------------------------------
 * Measured with `planEffectBudget` over the 15 promoted families at quality 1,
 * against the real `content/vfx` docs:
 *   · median family: 2 systems / 112 live particles
 *   · worst family : `boomnl` (78-04 死亡噴射肘擊) — 5 emitters, 4 systems after
 *     the merge pass, 3400 authored particles/s at a 1 s lifetime, which
 *     `liveParticleEstimate` prices at **3400 live particles for one cast**:
 *     43% of the 8000 screen budget, by itself.
 *
 * THE OVERSHOOT `emitterBudget` DOCUMENTS IS REAL, AND IS CLOSED HERE.
 * `planEffectBudget` divides the screen budget by the number of effects LIVE AT
 * THAT MOMENT and a live effect then keeps the allocation it was given, so a
 * sequence of casts sums to more than the budget: 12 successive `boomnl` casts
 * plan to **19,624 particles — 2.45× the 8000 cap**. That is fine for the light
 * families the audition page measured (12 × DivineRing = 4,881) and not fine
 * for this one. So admission here is by MEASURED HEADROOM, not by count alone:
 * `play()` pre-plans the effect with the exact inputs the rig will use and
 * refuses it when the running committed total would exceed the budget. The same
 * 12-cast sequence now admits 2 `boomnl` effects (6,800 particles) and sends
 * the other 10 to the pooled primitive path — one capped burst each.
 *
 * FOUR bounds, and only the first depends on the budget maths being right:
 *   1. HEADROOM. Σ planned particles ≤ `SCREEN_PARTICLE_BUDGET × quality` AND
 *      Σ planned systems ≤ `SCREEN_SYSTEM_BUDGET × quality`, both enforced per
 *      play. The one exception is deliberate: the FIRST effect is always
 *      admitted however expensive, because `emitterBudget`'s rule is that an
 *      effect on screen always draws something.
 *   2. `MAX_LIVE_W3X_EFFECTS` (12 — one per champion) caps concurrency
 *      independently of any cost estimate, so a bug in (1) still cannot make
 *      this unbounded: `MAX_SYSTEMS_PER_EFFECT` = 6 pins the absolute ceiling
 *      at 72 ParticleSystems even with the headroom check removed.
 *   3. Every effect is one-shot with `durationSec = W3X_CAST_EMIT_SEC`, so no
 *      emitter here can become a fountain, and `W3xEmitterRig.maxEffectSec` is
 *      the backstop under that.
 *   4. `expireStale()` is a wall-clock reap that does not depend on `tick()`
 *      being called at all (see the #131 note below).
 *
 * MEASURED, 12 simultaneous casts of the SAME family, all 15 of them:
 *   · 13 families admit all 12 casts — worst is `flamessmoke` at 6,144
 *     particles / 48 systems, lightest is `gx` at 240 / 12.
 *   · `holyawakening` admits 10 (1,570 / 60) — the system budget binds.
 *   · `boomnl` admits 2 (6,800 / 8) — the particle budget binds, as it should
 *     when one cast is 43% of the screen.
 * Every row is inside 8000 particles and 64 systems. The casts that do not fit
 * are not dropped: they play their primitive, which is one capped burst.
 *
 * ---------------------------------------------------------------------------
 * #131 AND #17 — THE TWO FAILURES THIS MUST NOT REINTRODUCE
 * ---------------------------------------------------------------------------
 * #131 (persistent bright-white burst stuck in the arena corner) was an
 * orphaned CONTINUOUS emitter parented to a glb joint that got disposed. This
 * path plays at a WORLD POSITION, never parented to a champion node, so there
 * is no anchor to be orphaned — the rig's per-frame orphan guard has nothing to
 * catch here because nothing is ever attached. What replaces it as the risk is
 * "an emitter that nobody stopped", and that is covered three ways: the
 * per-effect `durationSec`, the rig's `maxEffectSec`, and `expireStale()`,
 * which is driven by WALL CLOCK rather than by accumulated `tick(dt)` — so even
 * a frame loop that stops pumping this layer cannot leave a stream running,
 * because the next `play()` reaps it first.
 *
 * #17 (stray oversized effect meshes) was baked geometry inside champion glbs.
 * The rig's emitter meshes are empty, invisible and (now) unpickable — they
 * carry no geometry to be oversized. Particle SIZES are the docs' own authored
 * values, byte-identical to what the pooled path already shipped; this change
 * moves where they are played, not how big they are.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { VfxDoc } from "@ggd/shared/content";
import { particleBudgetScale } from "../render/RenderConfig";
import { qualityController } from "../render/QualityController";
import {
  planEffectBudget,
  SCREEN_PARTICLE_BUDGET,
  SCREEN_SYSTEM_BUDGET,
} from "../render/vfx/emitterBudget";
// Direct, NOT through `render/vfx/index` — see the barrel note above.
import {
  atPosition,
  W3xEmitterRig,
  type W3xEffectHandle,
  type W3xEmitterRigOptions,
} from "../render/vfx/W3xEmitterRig";

/**
 * Concurrent rig effects. 12 = the arena's champion count, i.e. "everyone casts
 * their signature at once". Past this a cast degrades to the pooled primitive
 * rather than being dropped.
 */
export const MAX_LIVE_W3X_EFFECTS = 12;

/**
 * How long a cast's emitters EMIT (seconds). The rest of the effect is the
 * drain — particles already born finishing their authored lifetime.
 *
 * 0.55s is the cast-telegraph pillar's window (`CastPillarFx`, 0.6s) minus a
 * frame, so the map's art lands on the beat the rest of the cast feedback is
 * already tuned to. It is NOT a fidelity compromise on the emitter parameters
 * (rate, lifetime, colour, size and speed are all the doc's own) — it is the
 * WC3 "special effect destroyed after the spell resolves" lifetime, which the
 * ability art table does not carry and which every cast in this game shares.
 */
export const W3X_CAST_EMIT_SEC = 0.55;

/**
 * Hard ceiling on a cast effect's total life (emit + drain), seconds. Nothing
 * should reach it — the longest promoted doc lifetime is 1s on top of a 0.55s
 * emit window — so reaching it means something went wrong, and the point is
 * that "something went wrong" still ends.
 */
export const W3X_CAST_MAX_SEC = 3;

/** Largest `dt` one `tick` may advance the rig by (ms). */
const MAX_TICK_DT_MS = 1000;

export interface W3xCastFxOptions {
  /** quality-tier particle multiplier (default: live quality params) */
  getQualityScale?: () => number;
  /** concurrency cap override (tests) */
  maxLiveEffects?: number;
  /** budget overrides passed straight to the rig (tests / audition) */
  budget?: W3xEmitterRigOptions["budget"];
  /** test seam: NullEngine tests inject a stub texture factory */
  createTexture?: W3xEmitterRigOptions["createTexture"];
}

interface LiveCast {
  handle: W3xEffectHandle;
  /** wall-clock ms at which this effect was started */
  startedMs: number;
  /** what the rig's own plan committed — the headroom accounting units */
  particles: number;
  systems: number;
}

export class W3xCastFx {
  /** built on the FIRST promoted cast, never at construction time */
  private rig: W3xEmitterRig | null = null;
  /** set when constructing the rig threw — never retried, always degrades */
  private rigFailed = false;
  private live: LiveCast[] = [];
  /** Σ of every live effect's planned particle cost — bound (1) above. */
  private committedParticles = 0;
  /** Σ of every live effect's planned system (draw-call) count — bound (1). */
  private committedSystems = 0;
  private disposed = false;
  private readonly maxLive: number;
  private readonly getQualityScale: () => number;

  constructor(
    private readonly scene: Scene,
    private readonly opts: W3xCastFxOptions = {},
  ) {
    this.maxLive = Math.max(1, opts.maxLiveEffects ?? MAX_LIVE_W3X_EFFECTS);
    this.getQualityScale =
      opts.getQualityScale ??
      ((): number => particleBudgetScale(qualityController.getParams().particleDensity));
  }

  /** Live rig effects (the concurrency the cap bounds). */
  get liveCount(): number {
    return this.live.length;
  }

  /** Live ParticleSystems across every rig effect — the draw-call number. */
  get systemCount(): number {
    return this.rig?.systemCount ?? 0;
  }

  /**
   * Every system the rig has ever built and not destroyed, live or pooled.
   * This is the LEAK CANARY: it must plateau across repeated casts, never grow.
   */
  get rigTotalSystems(): number {
    return this.rig?.totalSystems ?? 0;
  }

  /** Whether the rig has been constructed at all (deferred-cost assertion). */
  get rigBuilt(): boolean {
    return this.rig !== null;
  }

  /**
   * Live particles every rig effect currently on screen has been PLANNED to
   * keep alive. The headroom bound is asserted directly against this.
   */
  get plannedParticles(): number {
    return this.committedParticles;
  }

  /**
   * Play a promoted effect's WHOLE emitter set at a world position.
   *
   * Returns FALSE for every reason a caller must degrade to the primitive:
   * no docs resolved, a non-finite position, the concurrency cap, a rig that
   * could not be built. It never throws and never half-plays — a false return
   * means nothing was drawn and the caller owes the player a primitive.
   */
  play(
    effectId: string,
    docs: readonly VfxDoc[],
    x: number,
    y: number,
    z: number,
    nowMs: number,
    /**
     * GH#392 —— 把這一次施法**掛在施法者模型的某一個掛點上**，而不是釘在
     * 世界座標。`root` 是那名英雄的 `champ-<id>` 節點，`attach` 是 WC3 的
     * 掛點字串（`chest` / `hand,left` / `weapon` / …）。
     *
     * ⚠️ 三件事一次到位，而且**全部是 `W3xEmitterRig` 早就做完的**：
     *   (a) 附著 —— `resolveAttachment()` 用正規化 token 比對 glb 的關節名
     *   (b) **跟隨** —— `em.mesh.parent = anchor`，Babylon 的父子關係就是
     *       每幀跟著骨骼的世界矩陣走，⛔ 不是生成當下取一次座標
     *   (c) 自己播動畫 —— emitter 的 KP2E/KP2V 軌照跑（`sampleTrack`）
     *
     * ⛔ 這裡沒有第二條附著實作。缺的一直是這個參數：在此之前 `play()`
     * **無條件** `atPosition(x,y,z)`，所以 62 支帶掛點的技能特效全部躺在
     * 腳底不動，而骨骼附著只在兩個試聽頁活著（失敗形態③：整條路可以刪掉
     * 而戰鬥完全沒感覺）。
     *
     * 省略 / 解析不到節點 → 走 `atPosition`，也就是這一版之前一位元不差的行為。
     */
    anchorTo?: { root: TransformNode; attach: string } | null,
  ): boolean {
    if (this.disposed || docs.length === 0) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    // Reap BEFORE the cap check, and by wall clock — so a frame loop that
    // stopped pumping tick() can never wedge this at the cap (or, worse, leave
    // a continuous emitter running: #131's shape, if not its cause).
    this.expireStale(nowMs);
    if (this.live.length >= this.maxLive) return false;
    const rig = this.rigOrNull();
    if (!rig) return false;

    // HEADROOM ADMISSION. Pre-plan with the exact inputs `W3xEmitterRig.play`
    // is about to use — same docs, same `liveEffects`, same quality, and no
    // `distinguish` because this path passes no runtime flags or stagger, so
    // the rig's discriminator is the empty string for every doc. The plan is
    // deterministic, so this preview and the rig's own plan agree; the preview
    // is only the doorman, and the rig's returned plan is what gets accounted.
    //
    // The FIRST effect is admitted whatever it costs: `emitterBudget`'s own
    // rule is that an effect on screen always draws something, and refusing
    // the only cast on screen would be the silent no-op this file exists to
    // prevent.
    const quality = Math.max(0.05, this.getQualityScale());
    if (this.live.length > 0) {
      const preview = planEffectBudget(docs, {
        liveEffects: this.live.length + 1,
        qualityScale: quality,
      });
      if (this.committedParticles + preview.particles > SCREEN_PARTICLE_BUDGET * quality) {
        return false;
      }
      // Same admission on DRAW CALLS. `emitterBudget` documents a +9% system
      // overshoot as acceptable, and it is — but the same running-total check
      // costs one line and turns "9% over the nominal cap" into "never over
      // it": measured, 12 concurrent `holyawakening` casts plan 70 systems
      // against a 64 budget, and this is what holds them at 64.
      if (this.committedSystems + preview.emitters.length > SCREEN_SYSTEM_BUDGET * quality) {
        return false;
      }
    }

    // GH#392 —— 有掛點就把整個效果交給那個節點（rig 會在它底下解析關節並
    // parent 上去）；沒有就走世界座標。⛔ 這是**同一條** rig 路徑的兩個
    // target，不是兩份播放實作。
    const anchored = anchorTo?.root && !anchorTo.root.isDisposed();
    const handle = rig.play(
      {
        id: effectId,
        emitters: docs.map((doc) => ({ doc })),
        durationSec: W3X_CAST_EMIT_SEC,
        ...(anchored ? { attach: anchorTo!.attach } : {}),
      },
      anchored ? { kind: "node", root: anchorTo!.root } : atPosition(x, y, z),
    );
    // The rig hands back a DEAD handle when it refused the play (disposed, no
    // emitters, non-finite target). Treat that exactly like "no art".
    if (!handle.alive) return false;
    this.live.push({
      handle,
      startedMs: nowMs,
      particles: handle.plan.particles,
      systems: handle.plan.emitters.length,
    });
    this.committedParticles += handle.plan.particles;
    this.committedSystems += handle.plan.emitters.length;
    return true;
  }

  /**
   * Per-frame. `dtMs` advances the rig's own clock (KP2 tracks, durations,
   * drains); `nowMs` drives the independent wall-clock backstop.
   */
  tick(dtMs: number, nowMs: number): void {
    if (this.disposed) return;
    this.rig?.tick(Math.min(MAX_TICK_DT_MS, Math.max(0, dtMs)));
    this.expireStale(nowMs);
  }

  /**
   * ROUND BOUNDARY (task #16 / #259). Give every Babylon object the rig is
   * holding back to the driver, WITHOUT killing this layer.
   *
   * 為什麼要整個丟掉 rig 而不是只清 live effects：rig 的 free-list 是
   * 「per-doc-id、只會長不會縮」—— 每個這回合出現過的技能都在池子裡留下
   * ParticleSystem + emitter mesh，下一回合換了英雄／換了場地，那些系統就
   * 永遠不會再被取用，但每一張 frame 都還在 scene 裡被走訪。回合之間沒有
   * 任何人在看畫面，這是把它們還回去最便宜的一刻。
   *
   * `rigFailed` 故意保留：一個建不起來的 rig 換一個回合也還是建不起來，
   * 重試只會每回合多噴一次 exception。
   */
  resetForRound(): void {
    if (this.disposed) return;
    for (const c of this.live) c.handle.cancel();
    this.live = [];
    this.committedParticles = 0;
    this.committedSystems = 0;
    this.rig?.dispose();
    this.rig = null; // 下一次 promoted cast 會經由 rigOrNull() 重建
  }

  /**
   * Release everything. After this the rig owns no Babylon object at all —
   * `rigTotalSystems` is 0, which is what the leak test asserts.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const c of this.live) c.handle.cancel();
    this.live = [];
    this.committedParticles = 0;
    this.committedSystems = 0;
    this.rig?.dispose();
    this.rig = null;
  }

  /**
   * Drop finished effects, and CANCEL any that have outlived the hard ceiling.
   *
   * The cancel branch is the one that matters: it is the only stop that does
   * not go through the rig's `tick()` accounting, so it holds even if this
   * layer stops being pumped entirely.
   */
  private expireStale(nowMs: number): void {
    if (this.live.length === 0) return;
    const kept: LiveCast[] = [];
    let particles = 0;
    let systems = 0;
    for (const c of this.live) {
      if (!c.handle.alive) continue;
      if (Number.isFinite(nowMs) && nowMs - c.startedMs >= W3X_CAST_MAX_SEC * 1000) {
        c.handle.cancel();
        continue;
      }
      kept.push(c);
      particles += c.particles;
      systems += c.systems;
    }
    this.live = kept;
    // recomputed, never decremented — a decrement can drift, and drift in the
    // headroom accounting would silently re-open the overshoot it closes
    this.committedParticles = particles;
    this.committedSystems = systems;
  }

  /** The rig, built on first use. Null forever once construction has failed. */
  private rigOrNull(): W3xEmitterRig | null {
    if (this.rig || this.rigFailed) return this.rig;
    try {
      this.rig = new W3xEmitterRig(this.scene, {
        getQualityScale: this.getQualityScale,
        maxEffectSec: W3X_CAST_MAX_SEC,
        ...(this.opts.budget ? { budget: this.opts.budget } : {}),
        ...(this.opts.createTexture ? { createTexture: this.opts.createTexture } : {}),
      });
    } catch {
      // A rig we cannot build must never take the cast down with it: the caller
      // reads `false` and plays the primitive, which is the whole contract.
      this.rigFailed = true;
      this.rig = null;
    }
    return this.rig;
  }
}
