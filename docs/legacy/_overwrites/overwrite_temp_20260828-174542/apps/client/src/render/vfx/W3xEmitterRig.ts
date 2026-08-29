/**
 * W3xEmitterRig — the BABYLON half of the rebuilt WC3 emitter.
 *
 * `w3xEmitter.ts` turns a WC3 `PRE2` parameter block into a `vfx@1` doc (pure,
 * no GPU). `vfx/particleFactory.toParticleSystem` turns a `vfx@1` doc into a
 * Babylon `ParticleSystem` (already shipped, already the one implementation for
 * client + editor). This file is the thin layer that closes the remaining gap:
 *
 *   · the WC3 behaviours a `vfx@1` doc CANNOT carry — model-space emission,
 *     flat XY quads, line emitters, and the `KP2E`/`KP2V` animation tracks that
 *     `DeathWave`'s entire performance lives inside;
 *   · **attaching an effect to a named attachment point on a champion model**
 *     (`attachment.ts` resolves the name, this parents the emitter to the joint);
 *   · **multi-emitter effects** — a WC3 effect is N emitters, and `vfxKey` is
 *     one string, so nothing in the client could play `DivineRing`'s 20
 *     emitters as one thing until now;
 *   · **pooling + guaranteed disposal**, budgeted through `emitterBudget.ts`.
 *
 * DISPOSAL IS A CORRECTNESS REQUIREMENT, NOT A NICETY. Task #131 ("persistent
 * bright-white burst stuck in the corner of the arena") was one orphaned
 * continuous emitter: the glb joint it hung off was disposed during a model
 * swap, Babylon reparented the emitter mesh into WORLD space at its local
 * (0,0,0), and it kept emitting at the arena origin for the rest of the match.
 * A finite-position check cannot catch that — (0,0,0) is perfectly finite. So
 * this rig re-checks every anchor EVERY frame and kills any effect whose anchor
 * died, and `dispose()` walks a registry of every system it ever created.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
// EAGER shader registration. Babylon lazily `import()`s the particle shaders
// the first time an effect compiles; if a system is built before that import
// settles, the ShaderStore lookup misses and Babylon falls back to fetching
// `src/Shaders/particles.vertex.fx` over HTTP — which, under a SPA dev server,
// returns index.html and the shader fails to compile with
// `VERTEX SHADER ERROR: 0:12: '<' : syntax error`. Observed live on the
// audition page. Importing them here makes the rig self-sufficient.
import "@babylonjs/core/Shaders/particles.vertex";
import "@babylonjs/core/Shaders/particles.fragment";
import type { VfxDoc } from "@ggd/shared/content";
import { burstNow, toParticleSystem } from "../../vfx/particleFactory";
import { clampFadeOutTail } from "../../vfx/fadeOut";
import { noteVfxRefired } from "../../vfx/vfxHardCap";
import { vfxDissipateMaxSec, vfxFadeOutMaxSec, vfxHardMaxLifeSec } from "../../vfx/vfxCleanupPolicy";
import { resolveAttachment, type AttachResolution } from "./attachment";
import { applyRateScale, planEffectBudget, type BudgetContext, type EffectBudgetPlan } from "./emitterBudget";
import { sampleTrack, type W3xEmitterRuntimeFlags } from "./w3xEmitter";

/** One emitter of an effect: its doc plus the WC3 flags the doc can't carry. */
export interface W3xEmitterSpec {
  doc: VfxDoc;
  runtime?: W3xEmitterRuntimeFlags;
  /**
   * Hold this emitter back for N seconds after the effect starts.
   *
   * WC3's Locust Swarm does not pop N members into existence on one frame — it
   * spawns one every `DataB` seconds (0.05 for `A0IB`), so the ring FILLS IN.
   * Without the stagger a 22-member swarm reads as a single flashbulb, which is
   * a different effect. Continuous emitters use Babylon's own `start(delayMs)`;
   * bursts are queued here because `burstNow` is immediate by design.
   */
  delaySec?: number;
}

/** A whole WC3 effect — every emitter that used to live in one `.mdx`. */
export interface W3xEffectSpec {
  /** stable id (the model stem, e.g. "godie-divinering") — pools key off this */
  id: string;
  emitters: readonly W3xEmitterSpec[];
  /**
   * WC3 attach string for the CHAMPION model (`"right,hand"`, `"chest"`, …).
   * Ignored when the effect is played at a world position.
   */
  attach?: string;
  /** seconds before a non-ambient effect stops emitting (WC3 timed life) */
  durationSec?: number;
}

export type W3xEffectTarget =
  | { kind: "position"; position: { x: number; y: number; z: number } }
  | { kind: "node"; root: TransformNode };

export interface W3xEmitterRigOptions {
  /** content-relative texture path → URL (defaults to the client's /content/) */
  resolveTextureUrl?: (contentPath: string) => string;
  /** test seam: NullEngine tests inject a stub so no image decode happens */
  createTexture?: (url: string, scene: Scene) => BaseTexture | null;
  /** RenderConfig particle-density multiplier; read fresh on every play() */
  getQualityScale?: () => number;
  /** budget overrides (tests / the audition page) */
  budget?: Omit<BudgetContext, "liveEffects" | "qualityScale">;
  /**
   * Hard ceiling on how long ANY non-ambient effect may live, in seconds. The
   * backstop against a caller that never calls `stop()`. Ambient effects opt
   * out explicitly by setting `ambient` on their docs.
   */
  maxEffectSec?: number;
  /**
   * ⏳ GH#570 —— **終極**上限的覆寫（秒）。省略 = 讀後台現在生效的那一格
   * （`config.vfx-cleanup@1.vfxHardMaxLifeSec`，出貨 3）。
   *
   * ⚠️ 出貨路徑**永遠不傳它**。它存在只為了**試演頁**：
   * `w3xEmitterAudition` / `w3xFamilyAudition` 的整個用途就是把一支效果放著看
   * 完，三秒切掉會讓那兩頁沒有辦法用。⇒ 那兩頁傳 `Infinity`，也就是把
   * 「我知道我在繞過那道兜底」**寫出來**（⛔ 不是靠 `maxEffectSec: 3600` 這種
   * 看起來像數值調整的東西默默繞過去）。
   */
  hardCapSec?: number;
}

/** Default hard stop for a one-shot effect that nobody stopped. */
const DEFAULT_MAX_EFFECT_SEC = 12;

interface LiveEmitter {
  ps: ParticleSystem;
  /** the invisible mesh the system emits from; parented to the anchor */
  mesh: Mesh;
  doc: VfxDoc;
  runtime?: W3xEmitterRuntimeFlags;
  /** emit rate before any KP2E modulation (already budget-scaled) */
  baseRate: number;
  /**
   * Effect age at which a STAGGERED emitter is due to start, or undefined when
   * it started with everyone else.
   *
   * Deliberately NOT Babylon's own `ParticleSystem.start(delayMs)`: that runs
   * off `setTimeout`, i.e. wall clock. Everything else in this rig advances on
   * `tick(dt)`, so a wall-clock start would drift out of step the moment the
   * match is paused, the tab is backgrounded, or a replay is stepped by hand.
   */
  pendingStartAtSec?: number;
}

interface LiveEffect {
  spec: W3xEffectSpec;
  emitters: LiveEmitter[];
  /** the node every emitter mesh hangs off; null for a world-position effect */
  anchor: TransformNode | null;
  /** the model root — used by the orphan guard, which anchors can outlive */
  root: TransformNode | null;
  ageSec: number;
  /** set when stop() was called: emission is off, particles are draining */
  drainingSec: number | null;
  /** longest particle lifetime, i.e. how long a drain takes */
  maxLifeSec: number;
  stopAtSec: number;
  /**
   * ⏳ GH#570 —— 這個效果從 `play()` 起最多活到第幾秒（含排空）。到期一律
   * `release(hard)`：發射器與 mesh 真的回池、在飛的粒子整批丟掉。
   * 常駐（`ambient`）效果是 `Infinity`。
   */
  hardCapSec: number;
  ambient: boolean;
  plan: EffectBudgetPlan;
  attach?: AttachResolution;
}

export interface W3xEffectHandle {
  readonly id: number;
  /** stop emitting and let the particles in flight finish naturally */
  stop(): void;
  /** kill immediately, including particles in flight */
  cancel(): void;
  readonly alive: boolean;
  /** what the budget decided — surfaced for the audition page and tests */
  readonly plan: EffectBudgetPlan;
  /** where the attachment actually landed (and whether it was exact) */
  readonly attach?: AttachResolution;
}

/** Every transform node under `root`, by name — the attachment lookup table. */
function nodeNamesUnder(root: TransformNode): string[] {
  const out = [root.name];
  for (const n of root.getChildTransformNodes(false)) out.push(n.name);
  return out;
}

/**
 * Find the node whose name matches `resolved` under `root`. glb instantiation
 * prefixes node names (`"7-Hand Right Ref"`), hence the `endsWith` pass —
 * exactly the convention `AmbientVfx.findBoneNode` already established.
 */
function findNode(root: TransformNode, name: string): TransformNode | null {
  if (root.name === name) return root;
  const nodes = root.getChildTransformNodes(false);
  for (const n of nodes) if (n.name === name) return n;
  for (const n of nodes) if (n.name.endsWith(name)) return n;
  return null;
}

export class W3xEmitterRig {
  private readonly live = new Map<number, LiveEffect>();
  /** per-doc-id free list; a WC3 effect replays constantly, so pooling matters */
  private readonly pool = new Map<string, LiveEmitter[]>();
  /**
   * EVERY system this rig ever built, pooled or live. `dispose()` walks this,
   * so a system can never escape by being in a state we forgot about.
   */
  private readonly allEmitters = new Set<LiveEmitter>();
  private nextId = 1;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly opts: W3xEmitterRigOptions = {},
  ) {}

  /** Live effects (the budget's `liveEffects` input). */
  get effectCount(): number {
    return this.live.size;
  }

  /** Live ParticleSystems — the draw-call number the budget protects. */
  get systemCount(): number {
    let n = 0;
    for (const e of this.live.values()) n += e.emitters.length;
    return n;
  }

  /** Pooled (idle) systems, for the leak assertions in tests. */
  get pooledCount(): number {
    let n = 0;
    for (const list of this.pool.values()) n += list.length;
    return n;
  }

  /** Every system ever built and not yet disposed — the leak canary. */
  get totalSystems(): number {
    return this.allEmitters.size;
  }

  /**
   * Play a WC3 effect. Returns a handle; the effect also self-terminates on its
   * `durationSec`, on `maxEffectSec`, or the moment its anchor dies.
   */
  play(spec: W3xEffectSpec, target: W3xEffectTarget): W3xEffectHandle {
    const id = this.nextId++;
    const dead: W3xEffectHandle = {
      id,
      stop: () => {},
      cancel: () => {},
      alive: false,
      plan: { emitters: [], dropped: [], systemsBeforeMerge: 0, systemsAfterMerge: 0, particles: 0, faithful: true },
    };
    if (this.disposed || spec.emitters.length === 0) return dead;

    // A non-finite spawn point is the OTHER half of the #131 guard: a pooled
    // system parked at NaN renders as a smear that never clears.
    if (target.kind === "position") {
      const p = target.position;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return dead;
    } else if (target.root.isDisposed()) {
      return dead;
    }

    const quality = this.opts.getQualityScale?.() ?? 1;
    // ⏱ GH#569 —— 讀**一次**，然後同時給 `toParticleSystem`（粒子活多久）與
    // 下面的 `maxLifeSec`（效果什麼時候被回收）。兩邊各讀一次的話，後台在這
    // 幾毫秒之間被存過就會讓「粒子」與「回收」用不同的上限。
    const fadeOutMaxSec = vfxFadeOutMaxSec();
    // 💨 GH#660 —— **兩格都要讀**。`clampFadeOutTail` 的第三參數預設等於第二參數，
    // 而出貨時兩格都是 0.5 ⇒ 看起來一致。⚠️ 但那正好遮住 rollback 那條路：
    // 只把 `vfxDissipateMaxSec` 拉高（＝ #660 的止血閥）時，這一支仍然拿 fadeOut
    // 那一格去算「效果什麼時候被回收」⇒ w3x 那一族**只回一半**：
    // 粒子照新上限活得更久，而發射器照舊上限提早被收走 —— 玩家看到的是特效被
    // **砍頭**，⛔ 而且沒有任何錯誤（一格轉不回去的旋鈕＝沒有那格旋鈕）。
    const dissipateMaxSec = vfxDissipateMaxSec();
    const runtimeByDocId = new Map(spec.emitters.map((e) => [e.doc.id, e.runtime]));
    const delayByDocId = new Map(spec.emitters.map((e) => [e.doc.id, e.delaySec ?? 0]));
    // Two emitters can be identical as docs and still be different effects,
    // because the doc cannot carry the emitter's PIVOT or its WC3 node flags.
    // DivineRing's 20 emitters differ ONLY in pivot, and that layout IS the
    // ring — merging on doc equality alone collapses it into one column.
    const distinguish = (doc: VfxDoc): string => {
      // …and two emitters that are identical in every way EXCEPT when they
      // start are also different effects: merging them silently deletes the
      // 蝗蟲群 stagger, which is the difference between a swarm filling in and
      // a single flashbulb.
      const delay = delayByDocId.get(doc.id) ?? 0;
      const rt = runtimeByDocId.get(doc.id);
      if (!rt) return delay ? `d${delay}` : "";
      const p = rt.pivotOffset;
      return `${p ? `${p.x},${p.y},${p.z}` : ""}|${rt.modelSpace ? 1 : 0}${rt.xYQuad ? 1 : 0}${rt.lineEmitter ? 1 : 0}|d${delay}`;
    };
    const plan = planEffectBudget(
      spec.emitters.map((e) => e.doc),
      { ...this.opts.budget, liveEffects: this.live.size + 1, qualityScale: quality, distinguish },
    );

    // resolve the attachment point on the champion model
    let anchor: TransformNode | null = null;
    let attach: AttachResolution | undefined;
    if (target.kind === "node") {
      if (spec.attach) {
        attach = resolveAttachment(spec.attach, nodeNamesUnder(target.root));
        anchor = attach.node ? findNode(target.root, attach.node) : null;
      }
      anchor ??= target.root;
    }

    const ambient = spec.emitters.some((e) => e.doc.ambient === true);
    const emitters: LiveEmitter[] = [];
    let maxLifeSec = 0;
    for (const budgeted of plan.emitters) {
      const doc = applyRateScale(budgeted.doc, budgeted.rateScale);
      const em = this.acquire(doc, fadeOutMaxSec, dissipateMaxSec);
      const runtime = runtimeByDocId.get(budgeted.doc.id);
      em.runtime = runtime;
      // A pooled system was built for the SAME doc id but possibly a different
      // budget (the arena was emptier last time), so re-apply the quantity.
      // Everything else about the doc is identical — the pool is keyed on id.
      em.doc = doc;
      if (doc.mode === "continuous") em.ps.emitRate = Math.max(1, Math.round(doc.rate ?? 30));
      this.applyRuntimeFlags(em, runtime);

      // The emitter's own PIVOT offset relative to wherever the effect is
      // anchored — this is what gives a multi-emitter effect its SHAPE.
      const pv = runtime?.pivotOffset;
      if (anchor) {
        em.mesh.parent = anchor;
        if (pv) em.mesh.position.set(pv.x, pv.y, pv.z);
        else em.mesh.position.setAll(0);
      } else if (target.kind === "position") {
        em.mesh.parent = null;
        em.mesh.position.set(
          target.position.x + (pv?.x ?? 0),
          target.position.y + (pv?.y ?? 0),
          target.position.z + (pv?.z ?? 0),
        );
      }

      const delaySec = Math.max(0, delayByDocId.get(budgeted.doc.id) ?? 0);
      em.pendingStartAtSec = undefined;
      if (doc.mode === "continuous") {
        em.baseRate = em.ps.emitRate;
        // A KP2E-driven emitter starts at its track value, not at full rate —
        // otherwise frame 0 dumps a puff the original never had.
        if (runtime?.emissionTrack) em.ps.emitRate = this.rateAt(em, 0);
      } else {
        em.baseRate = 0;
      }
      if (delaySec > 0) em.pendingStartAtSec = delaySec;
      else this.startEmitter(em);
      // A staggered member is still in flight `delaySec` after everyone else,
      // so the drain has to wait for it too — otherwise the last locusts of a
      // 22-member swarm get cut off mid-life.
      // ⏱ GH#569 第二句話（「一定要清理乾淨」）——「效果活多久」必須照**夾過
      // 尾段之後**的壽命算，⛔ 不是照文件寫的。少了這一行，`toParticleSystem`
      // 那邊的粒子 0.9 秒就死光了，而這個 `LiveEffect` 連同它的 4 個發射器與
      // mesh 還要再被 `release()` 等 8 秒 —— 畫面上完全看不出來的那種殘留
      // （失敗形態②的近親：夾了但沒有人跟著夾）。
      maxLifeSec = Math.max(
        maxLifeSec,
        clampFadeOutTail(doc, fadeOutMaxSec, dissipateMaxSec).lifetimeSec.max + delaySec,
      );
      emitters.push(em);
    }

    // ⏳ GH#570 —— owner 2026-08-23:「產生後生命週期最多維持三秒，三秒後一律
    // 強制清理回收」。⚠️ 這裡夾的是**效果總時間**（發射 + 排空），⛔ 不是粒子
    // 壽命 —— 那正是漏掉的那一層：`W3xCastFx` 只發射 0.55 秒，但 FlamesSmoke 的
    // 排空要 3.0 秒，加起來 3.55 秒，而#569 的粒子夾子對此是綠的。
    const hardCapSec = ambient ? Infinity : (this.opts.hardCapSec ?? vfxHardMaxLifeSec());
    // 排空也不可以超過總上限（`stopAtSec` 之後還要跑 `maxLifeSec`）。
    maxLifeSec = Math.min(maxLifeSec, hardCapSec);
    const maxEffect = Math.min(this.opts.maxEffectSec ?? DEFAULT_MAX_EFFECT_SEC, hardCapSec);
    const effect: LiveEffect = {
      spec,
      emitters,
      anchor,
      root: target.kind === "node" ? target.root : null,
      ageSec: 0,
      drainingSec: null,
      maxLifeSec,
      // ambient effects live with the entity; everything else has a hard stop
      stopAtSec: ambient ? Infinity : Math.min(spec.durationSec ?? maxEffect, maxEffect),
      hardCapSec,
      ambient,
      plan,
      ...(attach ? { attach } : {}),
    };
    this.live.set(id, effect);

    // `alive` reads the registry, never a captured flag — a handle held past
    // the effect's death must report dead, including after dispose().
    const rig = this;
    return {
      id,
      stop: () => rig.stop(id),
      cancel: () => rig.release(id, true),
      get alive(): boolean {
        return rig.live.has(id);
      },
      plan,
      ...(attach ? { attach } : {}),
    };
  }

  /** Stop emitting; particles in flight finish, then everything is pooled. */
  stop(id: number): void {
    const effect = this.live.get(id);
    if (!effect || effect.drainingSec !== null) return;
    for (const em of effect.emitters) em.ps.stop();
    effect.drainingSec = 0;
  }

  /** Stop every live effect anchored under `root` (entity teardown). */
  stopUnder(root: TransformNode): void {
    for (const [id, e] of this.live) if (e.root === root) this.stop(id);
  }

  /**
   * Per-frame. Advances the KP2 tracks, enforces durations, and — the #131
   * guard — kills any effect whose anchor died out from under it.
   */
  tick(dtMs: number): void {
    if (this.disposed) return;
    const dt = Math.max(0, dtMs) / 1000;
    for (const [id, effect] of [...this.live]) {
      // ORPHAN GUARD. When a glb joint or view root is disposed, Babylon
      // reparents its children into WORLD space at their local (0,0,0). A
      // continuous emitter left there paints a permanent burst at the arena
      // origin — task #131, exactly. Position checks cannot see it, so assert
      // the anchor is ALIVE instead.
      if ((effect.root && effect.root.isDisposed()) || (effect.anchor && effect.anchor.isDisposed())) {
        this.release(id, true);
        continue;
      }

      effect.ageSec += dt;

      // ⏳ GH#570 —— **終極**上限。⭐ 它在 `drainingSec` 的分支**外面**是刻意的:
      // 排空那一段正是超標的那一段(0.55 發射 + 3.0 排空 = 3.55 秒),所以這道閘
      // 必須管到整個效果的年齡,⛔ 不是只管發射窗口。`hard = true` ⇒ 在飛的粒子
      // 整批丟掉、發射器與 mesh 回池(owner 的第二句話「強制清理回收」)。
      if (effect.ageSec >= effect.hardCapSec) {
        this.release(id, true);
        continue;
      }

      if (effect.drainingSec === null) {
        for (const em of effect.emitters) {
          // a staggered member joins once the effect reaches its slot
          if (em.pendingStartAtSec !== undefined && effect.ageSec >= em.pendingStartAtSec) {
            em.pendingStartAtSec = undefined;
            this.startEmitter(em);
          }
          if (em.doc.mode !== "continuous") continue;
          const next = this.rateAt(em, effect.ageSec);
          if (next !== em.ps.emitRate) em.ps.emitRate = next;
        }
        if (effect.ageSec >= effect.stopAtSec) this.stop(id);
      } else {
        effect.drainingSec += dt;
        // every particle born before stop() has now expired
        if (effect.drainingSec >= effect.maxLifeSec) this.release(id, false);
      }
    }
  }

  /** Release everything. After this the rig owns no Babylon objects at all. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of [...this.live.keys()]) this.release(id, true);
    for (const em of [...this.allEmitters]) this.destroy(em);
    this.live.clear();
    this.pool.clear();
    this.allEmitters.clear();
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /**
   * Emission rate at `tSec`, folding KP2E (rate over time) and KP2V (visibility
   * gate). Babylon has NO animated-emitter concept, so this is the compromise
   * named in `w3xEmitter.ts`: the track is replayed onto `emitRate` every
   * frame. It reproduces `DeathWave`-style emitters whose whole performance is
   * in the track, at the cost of one scalar sample per emitter per frame.
   */
  /** Begin emitting. One place, so an immediate and a staggered start agree. */
  private startEmitter(em: LiveEmitter): void {
    em.ps.start();
    // the budget already scaled burstCount, so this asks for exactly `1×`
    if (em.doc.mode === "burst") burstNow(em.ps, em.doc, 1);
  }

  private rateAt(em: LiveEmitter, tSec: number): number {
    const rt = em.runtime;
    if (!rt) return em.baseRate;
    let rate = em.baseRate;
    if (rt.emissionTrack) {
      const peak = Math.max(...rt.emissionTrack.keys.map(([, v]) => v));
      // the track is authored in WC3 rate units; normalise against its own peak
      // so the budget's scaling of `baseRate` is preserved
      const s = peak > 0 ? sampleTrack(rt.emissionTrack, tSec, rt.trackFrameSec) / peak : 1;
      rate *= Math.max(0, s);
    }
    if (rt.visibilityTrack) {
      const v = sampleTrack(rt.visibilityTrack, tSec, rt.trackFrameSec);
      if (v <= 0) return 0;
    }
    return Math.max(0, Math.round(rate));
  }

  /** The WC3 flags that live on the ParticleSystem, not in the doc. */
  private applyRuntimeFlags(em: LiveEmitter, rt: W3xEmitterRuntimeFlags | undefined): void {
    // reset to the doc's defaults first — pooled systems carry the last use's
    // flags, and a stale isLocal is a very confusing bug to chase
    em.ps.isLocal = false;
    em.ps.isBillboardBased = true;
    if (!rt) return;
    // 0x80000 modelSpace: particles live in the emitter's frame, so they follow
    // a moving champion instead of being left behind. `isLocal` is Babylon's
    // exact equivalent.
    if (rt.modelSpace) em.ps.isLocal = true;
    // 0x100000 xYQuad: flat quads, not camera billboards. Babylon has no
    // "lie in the emitter's XY plane" mode; turning billboarding OFF makes
    // particles orient by their direction of travel, which is the closest
    // available behaviour (a ground rune reads as a ground rune, not a
    // camera-facing sprite).
    if (rt.xYQuad) em.ps.isBillboardBased = false;
    // 0x20000 lineEmitter: emission along a line, not across a rectangle. The
    // doc's cone is the closest vfx@1 shape; narrow it to a near-line here so
    // the difference is at least in the right direction.
    if (rt.lineEmitter) {
      const r = em.doc.emitter.shape === "point" ? 0.05 : em.doc.emitter.radius;
      em.ps.createConeEmitter(Math.max(0.001, r * 0.05), (Math.max(1, em.doc.emitter.shape === "cone" ? em.doc.emitter.angleDeg : 1) * Math.PI) / 180);
    }
  }

  /** Take a system for `doc` from the pool, or build one. */
  private acquire(doc: VfxDoc, fadeOutMaxSec: number, dissipateMaxSec: number): LiveEmitter {
    const list = this.pool.get(doc.id);
    const pooled = list?.pop();
    if (pooled && !pooled.mesh.isDisposed()) {
      // RESET TO -1, NOT 0. Babylon's `animate()` takes the manual-emission
      // branch whenever `manualEmitCount > -1`, and that branch sets the count
      // back to 0 — never to -1. So a pooled system left at 0 is permanently
      // deaf to `emitRate`: a CONTINUOUS effect replayed from the pool emits
      // NOTHING, forever, with no error anywhere. (Found by looking at the
      // audition page, not by a unit test — the systems were started, ready,
      // textured and at emitRate 600 with zero particles alive.)
      // -1 restores rate-driven emission; `burstNow()` re-arms the manual path
      // for burst docs on the very next line of `play()`.
      pooled.ps.manualEmitCount = -1;
      pooled.ps.reset();
      return pooled;
    }
    if (pooled) this.destroy(pooled); // never reuse a corpse (task #131)

    const mesh = new Mesh(`w3xfx-${doc.id}-${this.nextId}`, this.scene);
    mesh.isVisible = false;
    // Empty, invisible AND unpickable. It carries no geometry, so it cannot be
    // one of task #17's stray oversized effect meshes — but an invisible mesh
    // that still answers picks is its own quiet bug, and `AmbientVfx` already
    // sets this on its emitter meshes. Match it.
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = true;
    const ps = toParticleSystem(doc, this.scene, {
      name: `w3xfx-${doc.id}`,
      fadeOutMaxSec,
      dissipateMaxSec,
      ...(this.opts.resolveTextureUrl ? { resolveTextureUrl: this.opts.resolveTextureUrl } : {}),
      ...(this.opts.createTexture ? { createTexture: this.opts.createTexture } : {}),
    });
    ps.emitter = mesh;
    const em: LiveEmitter = { ps, mesh, doc, baseRate: ps.emitRate };
    this.allEmitters.add(em);
    return em;
  }

  /** Return an effect's emitters to the pool (or destroy them when orphaned). */
  private release(id: number, hard: boolean): void {
    const effect = this.live.get(id);
    if (!effect) return;
    this.live.delete(id);
    for (const em of effect.emitters) {
      em.ps.stop();
      if (hard) em.ps.reset(); // drop particles still in flight
      // A mesh whose parent was disposed is a corpse: reusing it resurrects the
      // emitter at world origin. Destroy instead of pooling.
      if (em.mesh.isDisposed() || (em.mesh.parent as TransformNode | null)?.isDisposed?.()) {
        this.destroy(em);
        continue;
      }
      em.mesh.parent = null;
      em.mesh.position.setAll(0);
      em.runtime = undefined;
      let list = this.pool.get(em.doc.id);
      if (!list) {
        list = [];
        this.pool.set(em.doc.id, list);
      }
      list.push(em);
    }
    effect.emitters.length = 0;
  }

  /** Hard-destroy one emitter and forget it. */
  private destroy(em: LiveEmitter): void {
    em.ps.dispose();
    if (!em.mesh.isDisposed()) em.mesh.dispose();
    this.allEmitters.delete(em);
    const list = this.pool.get(em.doc.id);
    if (list) {
      const i = list.indexOf(em);
      if (i >= 0) list.splice(i, 1);
    }
  }
}

/** Convenience for a world-position play site. */
export function atPosition(x: number, y: number, z: number): W3xEffectTarget {
  return { kind: "position", position: new Vector3(x, y, z) };
}
