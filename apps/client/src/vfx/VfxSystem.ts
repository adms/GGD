/**
 * VfxSystem — consumes the MSG.EVENT fanout (abilityCast / projectileHit /
 * damage / death) drained once per frame by the GameApp:
 *   ability casts       → Telegraph ring (ground reads stay king) + the
 *                         ability's vfx doc played at the caster (EX casts
 *                         scale the burst up and add a layered shockwave pop).
 *                         The 30 abilities promoted to the map's OWN art
 *                         (render/vfx/w3xAbilityArt) instead play their whole
 *                         emitter SET through `W3xEmitterRig` — see
 *                         `playCastVfx`, whose fallback ladder guarantees a
 *                         promoted cast can never draw nothing.
 *   projectile hits     → the projectile's vfx doc burst at the target
 *                         (layered HitSpark impact as the doc-less fallback;
 *                         every landed hit also layers via `hitImpact`)
 *   damage              → damage number into the frameBus (world-anchored DOM)
 *   death               → layered kill pop: EX-grade impact + ash plume
 *   flowerSpawn/Burst   → dirt-kick sprout puff / layered heal pop (#34)
 *
 * IMPACT-FIRST PLAYBACK (task #33). Every doc played here is a ONE-SHOT, so
 * playback is retuned at THIS layer instead of hand-editing 228 imported
 * WC3 docs:
 *   · continuous → burst + tail: a stream doc's authored density
 *     (rate × avg life) is fired as ONE front-loaded burst on the impact frame
 *     (capped at MAX_FRONT_LOAD_BURST) instead of the old flat 650ms trickle.
 *     The ember tail is the burst's own WIDE lifetime spread — a burst system
 *     can never rate-emit afterwards (Babylon latches manualEmitCount; see
 *     particleFactory), so the short-lived majority carries the hit and the
 *     long-lived minority reads as the tail.
 *   · lifetime clamp: no one-shot particle outlives ONE_SHOT_MAX_LIFE_SEC, so
 *     imported 1–6s lifetimes stop hanging around as fog.
 *   · layering hooks: deaths, heal pickups and EX casts fire the pooled
 *     ImpactComposer (white-hot core flash + gravity/drag spark streaks +
 *     low-alpha smoke body + expanding ground shockwave) through HitSpark on
 *     the SAME frame as the doc, so hitstop/shake/flash/sound/particles land
 *     together. Tints are per-event constants (or quantized from the doc's own
 *     first color key) so the composer's pooled keys stay bounded.
 *
 * Particle systems are pooled per vfx doc id as a small FREE-LIST (cap 4
 * instances/doc): same-frame replays each get their own system, and when the
 * cap is hit the least-recently-used instance is stolen (its particles are
 * the oldest on screen).
 */
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities, Projectiles } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ProjectileId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import { TICK_MS } from "@ggd/shared/constants";
import { frameBus, pushCombatText } from "../frameBus";
import type { CombatTextRelation } from "../ui/combatText";
import { envFactor } from "../ui/displayFinal";
import { particleBudgetScale } from "../render/RenderConfig";
import { KIND_FLOWER, KIND_GUARDIAN } from "../render/overheadAnchors";
import { qualityController } from "../render/QualityController";
import { poseLookingAt, verticalHeadroom } from "../render/effectFraming";
import {
  ShadowLayer,
  SHADOW_CHAMPION_RADIUS,
  SHADOW_FLOWER_RADIUS,
  type ShadowInput,
} from "../render/shadows";
import { Telegraph, telegraphPaletteFor } from "./Telegraph";
import { TelegraphLayer } from "./TelegraphLayer";
import { resolveTelegraphShape, type TelegraphAbilityLike } from "./telegraphShape";
import type { TelegraphRelation } from "./telegraphChannel";
import { HitSpark } from "./HitSpark";
import { scaledBurstCount, toParticleSystem } from "./particleFactory";
import { frontLoadCounts, IMPACT_TINTS, type ImpactIntensity, type Rgb } from "./vfxPresets";
import { asImpactProfile, type SparkKind } from "../render/combatFeedback";
import { extraVfxDocIds, primitiveFallbackFor, w3xArtFor } from "../render/vfx/w3xAbilityArt";
import { W3xCastFx } from "./W3xCastFx";
import { BloodFx } from "./BloodFx";
import { CombatFeedbackFx } from "./CombatFeedbackFx";
import { GroundDecalPool } from "./GroundDecalPool";
import { castScorchSpec } from "./feedbackPresets";
import { StatusAuraFx } from "./StatusAuraFx";
import { CastPillarFx } from "./CastPillarFx";
import { pillarPalette, pillarTintFromRamp, type PillarPalette } from "./castPillar";
import { severityForHit, sprayDirection, damageScale, type Vec2 } from "./bloodPresets";
import { goreConfig, resolveGore } from "./goreConfig";

/** Reusable scratch for the #233 headroom probe — no per-frame allocation. */
const HEADROOM_F = new Vector3();

export interface VfxContext {
  /** rendered position of an entity (view space), or null if unknown */
  entityPos(id: number): { x: number; z: number } | null;
  /** authored vfx doc for a vfxKey, or null (docs are optional content) */
  vfxDoc?(key: string): VfxDoc | null;
  /**
   * OPTIONAL championId of an entity, used ONLY to resolve the per-champion
   * gore override (mechanical/undead champions spray sparks/ichor, never
   * blood — see goreConfig). Absent ⇒ every champion uses the global style.
   */
  championIdOf?(id: number): string | null;
  /**
   * Local player's entity id, or null before the match seat is known.
   * Floating combat text (task #92) is keyed on the RELATIONSHIP to the local
   * player — that is RO's axis and the axis the request names (造成/受到傷害,
   * 補血, 補魔 are relationships, not damage schools). Absent ⇒ every event
   * resolves as "unknown" and only the amount is drawn.
   */
  localEntityId?(): number | null;
  /** Team of an entity; null for neutrals (flowers) and unknown ids. */
  teamOf?(id: number): number | null;
  /**
   * The CAST BAR's own 0→1 wind-up fraction for an entity (task #228), or null
   * when it is not casting. Injected — never re-derived here — so the ground
   * telegraph fills over the SAME window the bar above the caster's head does
   * and can never drift from when the damage actually lands. GameApp passes
   * `CastTracker.progressFor`; absent ⇒ telegraphs still draw their shape but
   * cannot animate a wind-up.
   */
  castProgress?(id: number, nowMs: number): number | null;
}

// ---------------------------------------------------------------------------
// Impact-first one-shot playback knobs
// ---------------------------------------------------------------------------

/**
 * Hard lifetime ceiling for ONE-SHOT particles (seconds). Impact particles
 * read best at 0.15–0.5s; imported docs run 1–6s, which is what made casts
 * hang around as fog. Everything is gone within this long of the impact frame.
 */
export const ONE_SHOT_MAX_LIFE_SEC = 0.6;

/** Ceiling on a front-loaded burst (AAA impact band is ~24–80 particles). */
export const MAX_FRONT_LOAD_BURST = 80;

/**
 * Ember-tail spread for a converted stream doc: the burst's shortest life as a
 * fraction of its longest. Every particle is born on the impact frame; this
 * spread is what makes the majority die fast (the hit) while a minority lives
 * on (the tail) — the only tail a manually-burst system can have.
 */
export const TAIL_SPREAD = 0.3;

/** EX casts fire a bigger burst of their own doc (the fight-defining moment). */
export const EX_BURST_BOOST = 1.6;

/** Kill-pop tint: warm ash ember over the gray plume. */
const DEATH_TINT: Rgb = [1, 0.7, 0.42];

/** Heal-pickup tint: bright leaf green (flower color identity). */
const HEAL_TINT: Rgb = [0.5, 1, 0.55];

/** EX cast tint when the ability has no vfx doc to take a color from. */
const EX_DEFAULT_TINT: Rgb = [1, 0.95, 0.75];

/** Quantization step for doc-derived tints — bounds pooled composer keys. */
const TINT_STEP = 0.25;

/**
 * Built-in death pop (not content-authored: deaths always read the same).
 * The ash PLUME layer only — the bright core flash, ember streaks and ground
 * shockwave come from the EX-grade composer fired on the same frame. Pops in
 * large and shrinks (never the old grows-over-life mush), hot ash → gray →
 * gone in ≤0.55s; the wide lifetime spread leaves a sparse ash tail after the
 * bulk of the puff has already died.
 */
const DEATH_SMOKE: VfxDoc = {
  id: "fx.builtin-death-smoke",
  schema: "vfx@1",
  emitter: { shape: "sphere", radius: 0.45 },
  mode: "burst",
  burstCount: 26,
  lifetimeSec: { min: 0.16, max: 0.55 },
  // pop in large on the kill frame, then shrink to nothing (never the old
  // grows-over-life fog); legacy 2-stop fields mirror the tint/dead keys
  size: { start: 0.5, end: 0 },
  sizeStops: [
    [0, 0.5],
    [0.12, 1.15],
    [1, 0],
  ],
  color: { start: [0.62, 0.6, 0.62, 0.6], end: [0.2, 0.2, 0.24, 0] },
  colorStops: [
    [0, [1, 0.95, 0.86, 0.9]],
    [0.16, [0.62, 0.6, 0.62, 0.6]],
    [0.55, [0.4, 0.4, 0.46, 0.34]],
    [1, [0.2, 0.2, 0.24, 0]],
  ],
  blendMode: "alpha",
  gravityY: 1.1, // ash lifts as it dissipates
  speed: { min: 1.6, max: 4.2 },
  texture: "assets/textures/particles/smoke_05.png",
};

/**
 * Healing-flower lifecycle (task #34) reuses EXISTING hand-authored green
 * docs from content/vfx — no new vfx content: barkskin's green mote burst
 * reads as the heal, root-snare's dirt kick marks the sprout.
 */
export const FLOWER_BURST_VFX = "fx.barkskin";
export const FLOWER_SPAWN_VFX = "fx.root-snare";

/**
 * Revive circles (task #84). The RING itself is a persistent world view
 * (render/views/ReviveCircleView), not a particle one-shot — these are only
 * the punctuation at each end of its life:
 *   drop     — a modest flame kick, so the ring's arrival is noticed without
 *              competing with the death VFX firing on the same corpse;
 *   complete — the loudest cue in the mechanic: an EX-grade layered pop, i.e.
 *              the same weight as a kill, because it undoes one;
 *   fizzle   — nothing loud. A ring that expires is a non-event by design and
 *              must not read like something happened.
 */
const REVIVE_TINT: Rgb = [1, 0.72, 0.28];
/** Neutral guardian (task #89) — warm stone-bronze, matching its health bar. */
const GUARDIAN_TINT: Rgb = [0.95, 0.72, 0.42];
/** 陣亡投幣 (task #191) — bright gold, matching CoinView's own palette. */
const COIN_TINT: Rgb = [1, 0.88, 0.55];
export const REVIVE_SPAWN_VFX = "fx.root-snare";
export const REVIVE_COMPLETE_VFX = "fx.barkskin";

/** Max pooled ParticleSystem instances per doc id (LRU-stolen beyond). */
export const MAX_POOL_PER_DOC = 4;

/**
 * Aim memory used by the muzzle flash (task #39). `projectileSpawn` carries
 * only `{ id, owner, projectileId }` — no direction — so the last aim the
 * owner committed to (an ability's `direction`/`point`, or the position of a
 * basic attack's target) is remembered per entity and consumed on spawn.
 * Bounded by the number of live entities; cleared on death and on dispose.
 */
const AIM_FALLBACK: Vec2 = { x: 0, z: 1 };

/** Normalize an enriched dmgType (or the sim's raw `type`) to the union. */
function normalizeDmgType(v: unknown): "physical" | "magic" | "true" {
  return v === "magic" ? "magic" : v === "true" ? "true" : "physical";
}

/** Impact-particle tint by damage type: physical spark / arcane pop / white. */
function impactSparkColor(dmgType: "physical" | "magic" | "true"): [number, number, number] {
  if (dmgType === "magic") return [0.68, 0.5, 1]; // arcane
  if (dmgType === "true") return [1, 1, 1]; // white
  return [1, 0.72, 0.28]; // physical spark
}

/**
 * DEFENSIVE finite-position guard for the pooled-emitter spawn sites. NOTE: this
 * is NOT the fix for task #131 — the reproduced "persistent bright-white burst
 * stuck in a corner" was an orphaned CONTINUOUS ambient emitter left running at
 * world origin (0,0,0), a perfectly-FINITE position a check like this can never
 * catch (root cause + fix live in AmbientVfx.tick()'s orphan guard). This guard
 * stays as belt-and-braces: a NaN/Infinity emitter (a mid-despawn entity, an
 * un-interpolated pose, a corrupt event) would still get GPU-clamped to a screen
 * corner, so no spawn site here is allowed to place an emitter off the world.
 */
function isFinitePos(p: { x: number; z: number } | null): p is { x: number; z: number } {
  return p !== null && Number.isFinite(p.x) && Number.isFinite(p.z);
}

// ---------------------------------------------------------------------------
// Ground-follow layer (task #147): blob shadows + velocity-gated walking dust.
// Both are driven from a SINGLE per-frame pass over the live bodies the render
// layer already exposes (frameBus.champions → fresh pos via ctx.entityPos), so
// nothing here reads ChampionView or feeds the sim.
// ---------------------------------------------------------------------------

/**
 * A ROOTED PROP (healing flower / neutral guardian): a smaller blob shadow and
 * never any walking dust. Decided on the anchor's KIND rather than on
 * `teamId === -1`, which used to mean "flower" only because the flower was the
 * one team-less anchor — the guardian then arrived with seatId -1 and silently
 * inherited a flower-sized shadow under a 3u statue.
 */
function isRootedProp(kind: number | undefined, teamId: number): boolean {
  if (kind !== undefined) return kind === KIND_FLOWER || kind === KIND_GUARDIAN;
  return teamId < 0; // hand-built anchor (tests) — the legacy rule
}
/** Champion strides this far (world units) between walking-dust puffs. */
const WALK_STRIDE = 0.55;
/** Never more than one puff this often (ms) — caps a sprint's emit rate. */
const WALK_MIN_INTERVAL_MS = 120;
/** A jump larger than this is a teleport/respawn: re-baseline, emit nothing. */
const WALK_TELEPORT_DIST = 3.0;
/** How far BEHIND the foot the puff kicks up (world units, along −velocity). */
const WALK_PUFF_TRAIL = 0.22;
/** Ground-scorch footprint fallback when an ability declares no radius. */
const CAST_SCORCH_RADIUS = 0.9;
/** Concurrent cast-scorch decals (hard cap; LRU-stolen by the pool beyond). */
const MAX_CAST_DECALS = 12;

/** World y of a hit's contact point — torso height for a grounded fighter. */
const CONTACT_Y = 1.0;
/** How far toward the attacker to bloom the spark (body radius, world units). */
const CONTACT_OFFSET = 0.45;

/**
 * The CONTACT SURFACE for a hit: the victim's body edge FACING the attacker,
 * not its centre of mass. `dir` is the attacker→victim vector, so we step BACK
 * along it from the victim centre — the point where steel meets body (audit P1
 * 力量感). Degenerate `dir` (a self/degenerate hit) falls back to the centre.
 */
function contactPoint(pos: { x: number; z: number }, dir: Vec2): { x: number; z: number } {
  const len = Math.hypot(dir.x, dir.z);
  if (!(len > 1e-6)) return { x: pos.x, z: pos.z };
  return { x: pos.x - (dir.x / len) * CONTACT_OFFSET, z: pos.z - (dir.z / len) * CONTACT_OFFSET };
}

/**
 * Map the sim's resolved `sparkKind` to a DISTINCT spark tint + layered
 * intensity, so every situational hit reads instantly at the contact point:
 *   block   → cool-white steel (light) — a deflection, paired with a rebound fan
 *   counter → saturated RED, max layers (ex) — the punish flash
 *   magic   → arcane violet ; ice → icy cyan-white (opt-in element)
 *   heavy   → dmgType spark, heavy layers (+ ground ring)
 *   hit     → dmgType spark, light
 */
function sparkStyleFor(
  kind: SparkKind,
  dmgType: "physical" | "magic" | "true",
): { tint: Rgb; intensity: ImpactIntensity } {
  switch (kind) {
    case "block":
      return { tint: IMPACT_TINTS.guardBreak, intensity: "light" };
    case "counter":
      return { tint: IMPACT_TINTS.counter, intensity: "ex" };
    case "magic":
      return { tint: IMPACT_TINTS.magic, intensity: "heavy" };
    case "ice":
      return { tint: IMPACT_TINTS.ice, intensity: "heavy" };
    case "heavy":
      return { tint: impactSparkColor(dmgType), intensity: "heavy" };
    case "hit":
    default:
      return { tint: impactSparkColor(dmgType), intensity: "light" };
  }
}

/**
 * COLOR IDENTITY hook: a doc's own first color key, normalized to full
 * brightness and quantized, used to tint the layered pop fired alongside it —
 * an icy ability keeps an icy flash, a fire one stays fiery. Quantization
 * keeps the composer's per-tint pooled keys to a handful.
 */
export function tintOfDoc(doc: VfxDoc): Rgb {
  const stops = doc.colorStops;
  const rgb = stops && stops.length > 0 ? stops[0]![1] : doc.color.start;
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  if (peak < 0.05) return EX_DEFAULT_TINT; // near-black key → no usable hue
  const q = (c: number): number => Math.min(1, Math.round(c / peak / TINT_STEP) * TINT_STEP);
  return [q(rgb[0]), q(rgb[1]), q(rgb[2])];
}

/**
 * Clamp a one-shot's particle lifetime to the impact band. Returns the SAME
 * object when it already fits (identity = "nothing to retune").
 */
export function clampOneShotLife(life: { min: number; max: number }): {
  min: number;
  max: number;
} {
  if (life.max <= ONE_SHOT_MAX_LIFE_SEC) return life;
  return { min: Math.min(life.min, ONE_SHOT_MAX_LIFE_SEC * 0.5), max: ONE_SHOT_MAX_LIFE_SEC };
}

/**
 * Impact-first playback shape for a one-shot doc (PURE, unit-tested).
 * A `continuous` doc becomes ONE front-loaded burst carrying the SAME authored
 * density (rate × avg AUTHORED life, so clamping never thins the pop out) with
 * a wide lifetime spread standing in for the tail; a `burst` doc keeps its
 * authored counts and lifetime shape, and is only clamped when it runs long.
 */
export function frontLoadDoc(doc: VfxDoc): VfxDoc {
  const lifetimeSec = clampOneShotLife(doc.lifetimeSec);
  if (doc.mode === "burst") {
    return lifetimeSec === doc.lifetimeSec ? doc : { ...doc, lifetimeSec };
  }
  const avgLife = (doc.lifetimeSec.min + doc.lifetimeSec.max) / 2;
  // tailShare 0: a burst system can't rate-emit a tail, so ALL of the authored
  // energy lands on the impact frame and the spread below carries the tail
  const { burstCount } = frontLoadCounts(doc.rate ?? 30, avgLife, 0);
  // the authored stream rate is CONSUMED into burstCount — drop it so nothing
  // downstream can resurrect it as a trickle
  const { rate: _streamRate, ...rest } = doc;
  return {
    ...rest,
    mode: "burst",
    burstCount: Math.min(MAX_FRONT_LOAD_BURST, burstCount),
    lifetimeSec: {
      min: Math.min(lifetimeSec.min, lifetimeSec.max * TAIL_SPREAD),
      max: lifetimeSec.max,
    },
  };
}

interface PooledSystem {
  ps: ParticleSystem;
  lastUsedMs: number;
}

export class VfxSystem {
  /**
   * Un-owned one-shot rings (guardianMark's pre-land punish warning), which
   * have a real TICK-derived window and no per-entity cast to track.
   * Champion casts do NOT live here any more — they go through
   * `telegraphLayer`, which cancels on interrupt and fills off the cast bar.
   */
  private telegraphs: Telegraph[] = [];
  private sparks: HitSpark[] = [];
  /** per-doc-id free-list of pooled systems (cap MAX_POOL_PER_DOC) */
  private readonly pool = new Map<string, PooledSystem[]>();
  /** doc id → its impact-first playback shape (derived once per doc) */
  private readonly shaped = new Map<string, VfxDoc>();
  /** 濺血 / impact-debris layer (task #39) — pooled, allocates on first hit */
  private readonly blood: BloodFx;
  /** muzzle flash / landing dust / block clink (task #39) */
  private readonly feedback: CombatFeedbackFx;
  /** stun/root/slow/dash body auras (task #39) — inert until `status.set` is fed */
  private readonly status: StatusAuraFx;
  /** soft blob shadow under every live body (task #147) */
  private readonly shadows: ShadowLayer;
  /** fading ground scorch where an ability lands/casts (task #147) */
  private readonly castDecals: GroundDecalPool;
  /** 0.6s cast-telegraph light pillar, driven by the real castBegin window */
  private readonly pillars: CastPillarFx;
  /**
   * UNIVERSAL CAST TELEGRAPH (task #228): the ground shape every ability draws
   * while it winds up, derived from the ability doc and filled off the cast
   * bar's own progress. Owns the per-caster lifecycle the old ad-hoc
   * `telegraphs.push()` never had (it could not cancel on interrupt).
   */
  private readonly telegraphLayer: TelegraphLayer;
  /** vfxKey → resolved pillar palette (so a cast allocates nothing) */
  private readonly pillarPalettes = new Map<string, PillarPalette>();
  /** entityId → last walking-dust EMIT baseline {x,z} + time (task #147) */
  private readonly walkTrail = new Map<number, { ex: number; ez: number; lastMs: number }>();
  /** reused per-frame scratch for the shadow inputs (no per-frame alloc) */
  private readonly shadowScratch: ShadowInput[] = [];
  /** entityId → last committed aim, consumed by the muzzle flash */
  private readonly aim = new Map<number, Vec2>();
  /**
   * THE RIG PATH (task #182/#183 → combat). Promoted casts play their WHOLE
   * w3x emitter set through `W3xEmitterRig` instead of N pooled front-loaded
   * bursts. Constructing this allocates nothing: the rig itself is built on the
   * first promoted cast and stays null in a match that has none.
   */
  private readonly w3xCast: W3xCastFx;
  /** last `update()` timestamp — the rig ticks on dt, not on absolute time */
  private lastUpdateMs: number | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly ctx: VfxContext,
  ) {
    this.blood = new BloodFx(scene);
    this.feedback = new CombatFeedbackFx(scene);
    this.status = new StatusAuraFx(scene);
    this.shadows = new ShadowLayer(scene);
    this.castDecals = new GroundDecalPool(scene, { maxDecals: MAX_CAST_DECALS });
    this.pillars = new CastPillarFx(
      scene,
      {
        entityPos: (id) => this.ctx.entityPos(id),
        // TASK #233 — the beam is framed against the camera that is actually
        // presenting. `scene.activeCamera` is the right one in the single-view
        // case and the last-rendered viewport in the 4-up couch split; in the
        // split the four rigs share a pitch and a dolly, so the height they
        // disagree about is at most the difference their targets make, which is
        // far smaller than the 6.4 u constant this replaces.
        headroomAt: (x, z) => this.headroomAt(x, z),
      },
      { getScale: () => this.budgetScale() },
    );
    this.w3xCast = new W3xCastFx(scene, { getQualityScale: () => this.budgetScale() });
    this.telegraphLayer = new TelegraphLayer(scene, {
      entityPos: (id) => this.ctx.entityPos(id),
      castProgress: (id, nowMs) => this.ctx.castProgress?.(id, nowMs) ?? null,
    });
  }

  /**
   * Vertical budget above a ground point through the LIVE camera (task #233).
   *
   * Reads the real camera's eye + fov + aspect rather than reconstructing the
   * rig from constants, so a zoomed-out or panned camera gets the budget it
   * really has. Returns null when there is no camera (NullEngine tests), and
   * `castBeamPlan` falls back to the shipped default.
   */
  private headroomAt(x: number, z: number): number | null {
    const cam = this.scene.activeCamera;
    if (!cam) return null;
    const eye = cam.globalPosition;
    const m = cam.getWorldMatrix();
    const fwd = Vector3.TransformNormalFromFloatsToRef(0, 0, 1, m, HEADROOM_F).normalize();
    const target = {
      x: eye.x + fwd.x,
      y: eye.y + fwd.y,
      z: eye.z + fwd.z,
    };
    const pose = poseLookingAt({ x: eye.x, y: eye.y, z: eye.z }, target);
    return verticalHeadroom(pose, { x, z }, {
      fovRad: (cam as unknown as { fov?: number }).fov ?? undefined,
      aspect: this.scene.getEngine().getAspectRatio(cam),
    });
  }

  /** The universal cast-telegraph layer (test/observability seam, task #228). */
  get telegraphs228(): TelegraphLayer {
    return this.telegraphLayer;
  }

  /** The w3x rig path (test/observability seam). */
  get w3xCastFx(): W3xCastFx {
    return this.w3xCast;
  }

  /**
   * STATUS BODY AURAS (task #39). The authoritative CC bitmask
   * (`EntitySchema.flags`: 1 dashing / 2 rooted / 4 stunned / 8 slowed) has
   * shipped on the wire since the protocol was written. The game loop's
   * per-frame champion pass now feeds it in (GameApp step 4b:
   *   `vfx.statusFx.set(es.id, es.flags, pos.x, pos.z, nowMs)`),
   * so a stun/root/slow finally reads on the body; `update` below pumps the
   * pulses and `forget` (on despawn) sweeps them.
   */
  get statusFx(): StatusAuraFx {
    return this.status;
  }

  /** The blood layer (test/observability seam). */
  get bloodFx(): BloodFx {
    return this.blood;
  }

  /** The muzzle/dust/block layer (test/observability seam). */
  get feedbackFx(): CombatFeedbackFx {
    return this.feedback;
  }

  /** The blob-shadow layer (test/observability seam). */
  get shadowLayer(): ShadowLayer {
    return this.shadows;
  }

  /** Live cast-scorch decals on the floor (test/observability seam). */
  get castDecalCount(): number {
    return this.castDecals.activeCount;
  }

  /** The cast-telegraph pillar layer (test/observability seam). */
  get castPillarFx(): CastPillarFx {
    return this.pillars;
  }

  /**
   * The pillar palette for an ability, memoized by vfxKey.
   *
   * The element comes from the ability's OWN `fx.prim.<element>.…` binding
   * (task #79) so an ice spell erupts in white-blue and a fire spell in
   * white-gold — 依文潔琳's ice reading as orange fire is precisely the
   * mismatch the owner has rejected before. Imported docs with no element in
   * their id fall back to the doc's own colour RAMP, and only then to the FF7
   * limit-break gold. Memoized because this fires on EVERY cast now.
   *
   * The ramp, NOT `tintOfDoc`. `tintOfDoc` returns `colorStops[0]`, which is
   * correct for a particle system (the birth colour) and wrong for a light
   * column: every imported WC3 flame doc is authored white-hot → hue → black,
   * so stop 0 is `[1,1,1]`. Measured in a live match, that made 297 of 554
   * abilities (53.6%, incl. all 285 still on the `fx.ember-bolt-cast`
   * placeholder) erupt as a colourless white column. `pillarTintFromRamp`
   * scans the whole ramp for the most chromatic stop instead — for
   * `fx.ember-bolt-cast` that is `[1,0.6,0.2]`, the flame gold the doc was
   * always describing.
   */
  private pillarPaletteFor(abilityId: string | undefined): PillarPalette {
    const def = abilityId ? Abilities.tryGet(abilityId as AbilityId) : undefined;
    const key = def?.vfxKey;
    const cacheKey = key ?? "";
    let p = this.pillarPalettes.get(cacheKey);
    if (!p) {
      const doc = this.doc(key);
      p = pillarPalette(key, doc ? pillarTintFromRamp(doc.colorStops, doc.color.start) : null);
      this.pillarPalettes.set(cacheKey, p);
    }
    return p;
  }

  /** Memoized impact-first shape of a doc (gradients are baked per system). */
  private shapeOf(doc: VfxDoc): VfxDoc {
    let shaped = this.shaped.get(doc.id);
    if (!shaped) {
      shaped = frontLoadDoc(doc);
      this.shaped.set(doc.id, shaped);
    }
    return shaped;
  }

  /** ms after a play() during which an instance still shows live particles. */
  private busyWindowMs(doc: VfxDoc): number {
    // every particle is born on the impact frame → the longest life IS the run
    return doc.lifetimeSec.max * 1000;
  }

  /**
   * Fire a vfx doc at a world position, front-loaded (see frontLoadDoc).
   * Pooled per doc id with a small free-list so the same doc can play several
   * times in the same frame; when all instances are busy the least-recently-
   * used one is stolen. `boost` scales the burst (EX casts). Returns the
   * system used (test/observability seam).
   */
  play(
    rawDoc: VfxDoc | null,
    x: number,
    z: number,
    nowMs: number,
    y = 1.0,
    boost = 1,
  ): ParticleSystem | null {
    if (!rawDoc) return null;
    // FIX #131: never place a pooled system at a non-finite world position.
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return null;
    const doc = this.shapeOf(rawDoc);
    // live particle-density setting (0–1), driven by preset / adaptive manager
    const scale = particleBudgetScale(qualityController.getParams().particleDensity);
    let list = this.pool.get(doc.id);
    if (!list) {
      list = [];
      this.pool.set(doc.id, list);
    }
    // 1) an idle instance (its particles have all expired)
    let entry = list.find((e) => nowMs - e.lastUsedMs >= this.busyWindowMs(doc));
    // 2) grow the free-list up to the cap
    if (!entry && list.length < MAX_POOL_PER_DOC) {
      entry = { ps: toParticleSystem(doc, this.scene, { scale }), lastUsedMs: -Infinity };
      list.push(entry);
    }
    // 3) steal the least-recently-used (oldest particles on screen)
    if (!entry) {
      entry = list[0]!;
      for (const e of list) if (e.lastUsedMs < entry.lastUsedMs) entry = e;
    }
    entry.lastUsedMs = nowMs;
    const ps = entry.ps;
    (ps.emitter as Vector3).set(x, y, z);
    // a stopped system swallows bursts (animate() zeroes newParticles while
    // stopped), so always restart before firing — pooled instances outlive
    // many plays and must stay re-fireable forever
    ps.start();
    // ALL of the burst lands on this frame — that IS the impact
    ps.manualEmitCount = Math.max(1, Math.round(scaledBurstCount(doc, scale) * boost));
    return ps;
  }

  private doc(key: string | undefined): VfxDoc | null {
    if (!key) return null;
    return this.ctx.vfxDoc?.(key) ?? null;
  }

  /**
   * THE CAST'S OWN ART — a four-rung ladder that can never end in silence.
   *
   * 1. PROMOTED + RIG. When `w3xAbilityArt` says this ability owns the map's
   *    own effect, the WHOLE emitter set goes to `W3xEmitterRig` (see
   *    `W3xCastFx`): the docs' authored emission streams, planned against the
   *    screen particle budget, with a per-effect lifetime. A WC3 effect is a
   *    SET — `vfxKey` names only its dominant emitter — so this is the only rung
   *    that plays 世界終結's frost nova as the four emitters it really is.
   * 2. PROMOTED, RIG REFUSED. The rig says no when 12 effects are already live
   *    (or it could not be built at all). The docs still resolved, so they play
   *    through the ordinary pooled path — `frontLoadDoc` collapses each authored
   *    stream into ONE capped burst, which is cheap and still the right art.
   * 3. PROMOTED, ART MISSING. The content docs did not resolve (content not
   *    rebuilt, an older `contentVersion` still served). The ability's own
   *    `vfxKey` names the w3x doc, so there is nothing left on the doc side —
   *    fall back to the `fx.prim.*` key this row overrode.
   * 4. NOTHING LEFT. A hit spark, because a cast that draws literally nothing is
   *    the failure this whole batch exists to remove. Reached only for the 17
   *    off-roster rows, whose champions cannot be picked in a match.
   *
   * An ability with NO promotion is untouched: rung 1–4 do not apply and it
   * plays its one primitive exactly as before.
   */
  private playCastVfx(
    abilityId: string | undefined,
    doc: VfxDoc | null,
    pos: { x: number; z: number },
    nowMs: number,
    boost: number,
  ): void {
    const art = w3xArtFor(abilityId);
    if (!art) {
      this.play(doc, pos.x, pos.z, nowMs, 1.0, boost);
      return;
    }
    const set: VfxDoc[] = [];
    // `doc` IS the primary for every promoted row (the ability's `vfxKey` is
    // the family's dominant emitter, by construction). Reuse it rather than
    // resolving the same id twice — `ctx.vfxDoc` is a live content lookup, and
    // a double read would double-count in anything observing it.
    const primary = doc?.id === art.primary ? doc : this.doc(art.primary);
    if (primary) set.push(primary);
    for (const id of extraVfxDocIds(abilityId)) {
      const d = this.doc(id);
      if (d) set.push(d);
    }
    // 1
    if (this.w3xCast.play(art.family, set, pos.x, 1.0, pos.z, nowMs)) return;
    // 2
    if (set.length > 0) {
      for (const d of set) this.play(d, pos.x, pos.z, nowMs, 1.0, boost);
      return;
    }
    // 3
    const primitive = this.doc(primitiveFallbackFor(abilityId));
    if (primitive) {
      this.play(primitive, pos.x, pos.z, nowMs, 1.0, boost);
      return;
    }
    // 4
    this.sparks.push(new HitSpark(this.scene, pos.x, pos.z, nowMs));
  }

  /**
   * Resolve an event's world position: the enriched payload's own x/z when
   * present (the sim now stamps the impact point on the damage event), else the
   * rendered position of the referenced entity, else null.
   */
  private posFromEvent(ev: EventMessage, id: number | undefined): { x: number; z: number } | null {
    const x = ev.data.x;
    const z = ev.data.z;
    // FIX #131: reject a non-finite coordinate so it can never park an emitter
    // off-world (which renders as a stuck bright burst at a screen corner).
    if (typeof x === "number" && typeof z === "number") return isFinitePos({ x, z }) ? { x, z } : null;
    const p = id !== undefined ? this.ctx.entityPos(id) : null;
    return isFinitePos(p) ? p : null;
  }

  /**
   * How an entity relates to the local player — the axis floating combat text
   * is coloured on (task #92). "unknown" whenever the seat/team wiring is not
   * up yet or the entity is a neutral (a flower has no team): those events fall
   * into the low-priority third-party band rather than being mislabelled as
   * yours, which would put a stranger's chip damage in the biggest, reddest,
   * highest-priority slot on screen.
   */
  private relationOf(id: number | undefined): CombatTextRelation {
    if (id === undefined) return "unknown";
    const local = this.ctx.localEntityId?.() ?? null;
    if (local === null) return "unknown";
    if (id === local) return "self";
    const mine = this.ctx.teamOf?.(local) ?? null;
    const theirs = this.ctx.teamOf?.(id) ?? null;
    if (mine === null || theirs === null) return "unknown";
    return mine === theirs ? "ally" : "enemy";
  }

  /** Fire the pooled layered impact kit (flash + sparks + smoke [+ ring]). */
  private layeredPop(
    x: number,
    z: number,
    nowMs: number,
    intensity: ImpactIntensity,
    tint: Rgb,
  ): void {
    // FIX #131 (root cause): the abilityCast/flowerBurst/reviveComplete paths
    // reach here after only a NULL check on their position — but `entityPos`
    // can return a truthy `{x:NaN,z:NaN}` for a mid-spawn / un-interpolated
    // entity. `play()` already refuses a non-finite emitter, but this composer
    // fire (the BRIGHTEST, white-hot additive core — "ex" on an EX cast) did
    // NOT, so an EX cast by a not-yet-posed champion parked a persistent white
    // burst at the GPU-clamped screen corner and RE-FIRED it every cast. Guard
    // the single chokepoint so every current and future caller is covered.
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.sparks.push(new HitSpark(this.scene, x, z, nowMs, intensity, 260, tint));
  }

  /** Live quality-tier particle budget (shared by every layer). */
  private budgetScale(): number {
    return particleBudgetScale(qualityController.getParams().particleDensity);
  }

  /** Remember an entity's aim so its next projectile knows where it's going. */
  private noteAim(id: number | undefined, dir: Vec2 | null): void {
    if (id === undefined || !dir) return;
    const len = Math.hypot(dir.x, dir.z);
    if (!(len > 0)) return;
    this.aim.set(id, { x: dir.x / len, z: dir.z / len });
  }

  /**
   * The DAMAGE VECTOR for a hit: attacker → victim in rendered space, falling
   * back to the attacker's last aim and finally to a fixed direction, so a
   * spray is always aimed at SOMETHING rather than degenerating to a ball.
   */
  private damageVector(
    source: number | undefined,
    target: number | undefined,
    hitPos: { x: number; z: number },
  ): Vec2 {
    const from = source !== undefined ? this.ctx.entityPos(source) : null;
    const remembered = source !== undefined ? this.aim.get(source) : undefined;
    return sprayDirection(from, hitPos, remembered ?? AIM_FALLBACK);
  }

  /**
   * 濺血: the directional spray for a landed hit. Style + intensity come from
   * the gore config, narrowed by the VICTIM's per-champion override (a
   * mechanical champion never bleeds red). Fires ALONGSIDE the impact kit.
   */
  private bloodSpray(
    pos: { x: number; z: number },
    dir: Vec2,
    amount: number,
    dmgType: "physical" | "magic" | "true",
    opts: { crit?: boolean; killingBlow?: boolean; target?: number },
    nowMs: number,
  ): void {
    const championId = opts.target !== undefined ? (this.ctx.championIdOf?.(opts.target) ?? null) : null;
    const gore = resolveGore(goreConfig(), championId);
    if (gore.style === "off") return; // OFF EMITS NOTHING — not even a decal
    this.blood.fire({
      x: pos.x,
      z: pos.z,
      dir,
      severity: severityForHit(amount, opts),
      style: gore.style,
      // magnitude within the band: a poke drips, a big swing sprays
      intensity: gore.intensity * (0.55 + 0.45 * damageScale(amount)),
      dmgType,
      scale: this.budgetScale(),
      nowMs,
    });
  }

  /**
   * Derive + spawn the #228 telegraph for one cast.
   *
   * Everything it needs is already on the wire (`abilityCast` carries
   * `point`/`direction`) or in the ability doc the client already loaded — so
   * the drawn shape is the same geometry `abilitySystem`/`CastResolveSystem`
   * query, at the same post-`abilityRange` size (#136/#125). A shape that
   * cannot be derived draws NOTHING and is a red `telegraphCoverage.test.ts`,
   * never a plausible-looking guess.
   */
  private spawnTelegraph(
    caster: number,
    def: TelegraphAbilityLike,
    pos: { x: number; z: number },
    point: { x: number; z: number } | undefined,
    direction: { x: number; z: number } | undefined,
    nowMs: number,
  ): void {
    const shape = resolveTelegraphShape(
      def,
      {
        casterX: pos.x,
        casterZ: pos.z,
        point: point ?? null,
        direction: direction ?? null,
      },
      {
        abilityRange: envFactor("abilityRange"),
        projectile: (id) => Projectiles.tryGet(id as ProjectileId) ?? null,
      },
    );
    if (!shape) return;
    // `CombatTextRelation` and `TelegraphRelation` are the same four-way axis
    // (self/ally/enemy/unknown); the annotation keeps them from drifting apart.
    const relation: TelegraphRelation = this.relationOf(caster);
    const windupMs = ((def as { castTimeSec?: number }).castTimeSec ?? 0) * 1000;
    this.telegraphLayer.begin(caster, shape, relation, windupMs, nowMs);
  }

  handleEvent(ev: EventMessage, nowMs: number): void {
    switch (ev.type) {
      case "abilityCast": {
        const abilityId = ev.data.abilityId as string | undefined;
        const def = abilityId ? Abilities.tryGet(abilityId as AbilityId) : undefined;
        const point = ev.data.point as { x: number; z: number } | undefined;
        const caster = ev.data.caster as number | undefined;
        const pos = caster !== undefined ? this.ctx.entityPos(caster) : null;
        // ---- UNIVERSAL CAST TELEGRAPH (task #228) --------------------------
        // Every cast, every castType, derived from the ability doc — no longer
        // "whatever happened to carry a `point`" (which drew a FABRICATED
        // 0.72 u ring on 93 single-target cells and nothing at all on the 118
        // self/skillshot/dash ones). See telegraphShape.ts for the honesty
        // rules; the fill comes from the cast bar, not a local clock.
        if (typeof caster === "number" && def && isFinitePos(pos)) {
          this.spawnTelegraph(caster, def, pos, point, ev.data.direction as
            | { x: number; z: number }
            | undefined, nowMs);
        }
        // FIX #131: a null OR non-finite caster position spawns nothing — an
        // un-interpolated {x:NaN} would otherwise park the EX white-hot pop
        // (layeredPop) off-world at a screen corner.
        if (!isFinitePos(pos)) break;
        // remember where this cast was aimed — the muzzle flash of any
        // projectile it spawns reads the direction back off this
        const dir = ev.data.direction as { x: number; z: number } | undefined;
        this.noteAim(caster, dir ?? (point ? { x: point.x - pos.x, z: point.z - pos.z } : null));
        const doc = this.doc(def?.vfxKey);
        // EX = the fight-defining cast: scale the doc's burst up AND layer the
        // max-intensity pop (core flash + streaks + smoke + ground shockwave),
        // tinted from the ability's own color so its identity is preserved.
        const isEx = def?.slot === "EX";
        if (isEx) this.layeredPop(pos.x, pos.z, nowMs, "ex", doc ? tintOfDoc(doc) : EX_DEFAULT_TINT);
        this.playCastVfx(def?.id, doc, pos, nowMs, isEx ? EX_BURST_BOOST : 1);
        // GROUND SCORCH (task #147): stamp a fading dark mark where the ability
        // lands (its ground `point` when it targets the floor) or, failing that,
        // under the caster — so a cast scars the arena instead of leaving it
        // pristine. Pooled + hard-capped like the blood splats.
        const markX = point && isFinitePos(point) ? point.x : pos.x;
        const markZ = point && isFinitePos(point) ? point.z : pos.z;
        this.castDecals.spawn(markX, markZ, castScorchSpec(def?.radius ?? CAST_SCORCH_RADIUS), nowMs);
        break;
      }
      // ---- CAST TELEGRAPH: the 0.6 s light pillar ------------------------
      // 「施展技能的時候都要帶一段 0.6秒的施展光柱光芒來提示」. Driven by the
      // AUTHORITATIVE cast window, never a timer of our own: `castBegin`
      // carries the sim's `castTimeSec` (and its exact tick count as the
      // fallback), so the column rises and intensifies across the REAL window
      // for any cast length. MatchRoom fans these three events out to every
      // client — the same stream the overhead cast bar rides — so the pillar
      // appears for EVERY champion, which is the whole point: the victim is
      // the one who has to see it.
      //
      // An ability with NO cast time emits no `castBegin` at all and therefore
      // gets no pillar. That is deliberate: a telegraph for a window that does
      // not exist would be a lie about a dodge the victim cannot make.
      case "castBegin": {
        const caster = ev.data.caster as number | undefined;
        if (typeof caster !== "number") break;
        const secs = typeof ev.data.castTimeSec === "number" ? ev.data.castTimeSec : 0;
        const ticks = typeof ev.data.ticks === "number" ? ev.data.ticks : 0;
        const durationMs = secs > 0 ? secs * 1000 : ticks * TICK_MS;
        if (!(durationMs > 0)) break;
        this.pillars.begin(caster, durationMs, this.pillarPaletteFor(ev.data.abilityId as string | undefined), nowMs);
        break;
      }
      // resolved → a short outward release flash on the frame the effects land
      case "castEnd": {
        const caster = ev.data.caster as number | undefined;
        if (typeof caster === "number") {
          this.pillars.finish(caster, nowMs);
          // the ground shape pops on the SAME frame the sim runs the effects
          this.telegraphLayer.resolve(caster, nowMs);
        }
        break;
      }
      // stunned / knocked down / killed mid-cast → snuffed, never a flash.
      // A pillar that keeps burning after an interrupt is a lie.
      case "castInterrupt": {
        const caster = ev.data.caster as number | undefined;
        if (typeof caster === "number") {
          this.pillars.interrupt(caster, nowMs);
          // …and neither may the ground shape. Before #228 nothing removed a
          // telegraph, so a stunned caster's ring kept filling and still fired
          // its "it lands HERE" resolve pop for damage that never happened.
          this.telegraphLayer.interrupt(caster);
        }
        break;
      }
      // `basicAttackHit` is the RANGED AUTO's impact — the same shape as an
      // ability projectile landing, and it used to fall through to `default`,
      // so a ranged auto arrived with no arrival at all (task #60).
      case "projectileHit":
      case "basicAttackHit": {
        const target = ev.data.target as number | undefined;
        const pos = target !== undefined ? this.ctx.entityPos(target) : null;
        if (!isFinitePos(pos)) break; // #131
        const projectileId = ev.data.projectileId as string | undefined;
        const projDef = projectileId ? Projectiles.tryGet(projectileId as ProjectileId) : undefined;
        const doc = this.doc(projDef?.vfxKey);
        // landed hits ALSO get the layered pop via `hitImpact` (sim fires it
        // for every hit) — no second layer here, only the doc-less fallback
        if (doc) this.play(doc, pos.x, pos.z, nowMs);
        else this.sparks.push(new HitSpark(this.scene, pos.x, pos.z, nowMs));
        break;
      }
      // A missile that expired on a wall / at max range: a small FIZZLE so the
      // shot resolves visually instead of blinking out. `hit` is true when the
      // same event ends a projectile that already connected — that one keeps
      // its impact fx and gets nothing extra here.
      case "projectileEnd": {
        if (ev.data.hit) break;
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break; // #131
        this.sparks.push(new HitSpark(this.scene, x, z, nowMs, false, 140));
        break;
      }
      // FLOATING COMBAT TEXT (task #92). One code path for all four categories
      // the request names: 造成傷害 and 受到傷害 are the SAME `damage` event
      // split by whether the local player is the source or the target, and
      // 補血/補魔 arrive on the sim events added for this task.
      //
      // A fully-blocked hit (amount 0) is deliberately NOT skipped when it
      // landed on YOU — "that was absorbed" is information; a 0 on someone
      // else's body is not, and combatTextCategory drops it.
      case "damage": {
        const target = ev.data.target as number | undefined;
        const amount = ev.data.amount as number | undefined;
        if (amount === undefined) break;
        const blocked = Boolean(ev.data.blocked);
        if (amount <= 0 && !blocked) break;
        const pos = this.posFromEvent(ev, target);
        if (pos && target !== undefined) {
          pushCombatText({
            kind: "damage",
            amount,
            sourceRel: this.relationOf(ev.data.source as number | undefined),
            targetRel: this.relationOf(target),
            crit: Boolean(ev.data.crit),
            blocked,
            killingBlow: Boolean(ev.data.killingBlow),
            targetId: target,
            worldX: pos.x,
            worldZ: pos.z,
            nowMs,
          });
        }
        break;
      }
      // 補血 / 補魔 — see packages/shared/src/sim/combat/restore.ts. Discrete
      // restores only (ability heals, `restore` percentages, lifesteal, flower
      // bursts); per-tick passive regen is never emitted, so this cannot become
      // a 30 Hz stream of "+0" over every champion on the field.
      case "heal":
      case "manaRestore": {
        const target = ev.data.target as number | undefined;
        const amount = ev.data.amount as number | undefined;
        if (target === undefined || amount === undefined || amount <= 0) break;
        const pos = this.posFromEvent(ev, target);
        if (!pos) break;
        pushCombatText({
          kind: ev.type === "heal" ? "heal" : "mana",
          amount,
          sourceRel: this.relationOf(ev.data.source as number | undefined),
          targetRel: this.relationOf(target),
          crit: false,
          blocked: false,
          killingBlow: false,
          targetId: target,
          worldX: pos.x,
          worldZ: pos.z,
          nowMs,
        });
        break;
      }
      // IMPACT PARTICLES by dmgType (fires alongside `damage` on any landed hit;
      // hitImpact is the sim's dedicated "impact frame" timing event).
      case "hitImpact": {
        const target = ev.data.target as number | undefined;
        const source = ev.data.source as number | undefined;
        const pos = this.posFromEvent(ev, target ?? source);
        if (!isFinitePos(pos)) break;
        const dmgType = normalizeDmgType(ev.data.dmgType);
        const heavy = Boolean(ev.data.crit) || Boolean(ev.data.killingBlow);
        const amount = typeof ev.data.amount === "number" ? ev.data.amount : 0;
        const dir = this.damageVector(source, target, pos);
        // CONTACT-POINT SPARK (audit P1): bloom the spark at the strike SURFACE
        // facing the attacker, not the victim's centre of mass.
        const contact = contactPoint(pos, dir);
        // The sim's ImpactProfile resolves the DISTINCT spark identity
        // (block/counter/magic/ice/heavy/hit — content `hitFeel`-overridable);
        // fall back to the legacy blocked/heavy/type read for a pre-#133 replay.
        const profile = asImpactProfile(ev.data.profile);
        const kind: SparkKind = profile
          ? profile.sparkKind
          : ev.data.blocked
            ? "block"
            : heavy
              ? "heavy"
              : dmgType === "magic"
                ? "magic"
                : "hit";
        const isBlock = kind === "block" || Boolean(ev.data.blocked);
        const { tint, intensity } = sparkStyleFor(kind, dmgType);
        this.sparks.push(
          new HitSpark(this.scene, contact.x, contact.z, nowMs, intensity, 260, tint, CONTACT_Y),
        );
        // BLOCKED (task #39): a guard is metal on metal — the cool-white spark
        // above PLUS a spark fan REBOUNDING at the attacker, and NO blood.
        if (isBlock) {
          this.feedback.block({
            x: contact.x,
            z: contact.z,
            dir,
            power: 0.5 + 0.5 * damageScale(amount),
            scale: this.budgetScale(),
            nowMs,
          });
          break;
        }
        // …and the 濺血 layer on the SAME frame, never instead of the kit
        this.bloodSpray(
          pos,
          dir,
          amount,
          dmgType,
          { crit: Boolean(ev.data.crit), killingBlow: Boolean(ev.data.killingBlow), target },
          nowMs,
        );
        break;
      }
      // MUZZLE FLASH at the cast origin (task #39): projectiles used to appear
      // out of thin air. The payload carries no direction, so the owner's last
      // committed aim (ability direction / basic-attack target) supplies it.
      case "projectileSpawn": {
        const owner = ev.data.owner as number | undefined;
        const pos = owner !== undefined ? this.ctx.entityPos(owner) : null;
        if (!pos) break;
        const dir = (owner !== undefined ? this.aim.get(owner) : undefined) ?? AIM_FALLBACK;
        this.feedback.muzzle({ x: pos.x, z: pos.z, dir, scale: this.budgetScale(), nowMs });
        break;
      }
      // a basic attack commits an aim (used by the muzzle flash of the
      // projectile a ranged attack spawns a frame later)
      case "basicAttack":
      case "attackWindup": {
        const source = ev.data.source as number | undefined;
        const targetId = ev.data.target as number | undefined;
        const from = source !== undefined ? this.ctx.entityPos(source) : null;
        const to = targetId !== undefined ? this.ctx.entityPos(targetId) : null;
        if (from && to) this.noteAim(source, { x: to.x - from.x, z: to.z - from.z });
        break;
      }
      // LANDING DUST (task #39): a body slamming into the floor had no floor
      // reaction at all. The payload carries the impact point directly.
      case "knockdown": {
        const pos = this.posFromEvent(ev, ev.data.target as number | undefined);
        if (!pos) break;
        this.feedback.landingDust({ x: pos.x, z: pos.z, scale: this.budgetScale(), nowMs });
        break;
      }
      // 破防 guardBreak — a bigger cool-white shatter pop.
      case "guardBreak": {
        const pos = this.posFromEvent(ev, ev.data.target as number | undefined);
        if (pos) this.sparks.push(new HitSpark(this.scene, pos.x, pos.z, nowMs, true, 280, [0.9, 0.95, 1]));
        break;
      }
      case "death": {
        const id = ev.data.id as number | undefined;
        if (id !== undefined) {
          this.aim.delete(id); // aim memory dies with the entity
          this.status.forget(id); // …and so does any CC aura it was wearing
          // dying mid-cast snuffs the column even if the sim's castInterrupt
          // is dropped on the wire — a pillar over a corpse is the worst lie
          // of all (it says "still coming" about damage that never will)
          this.pillars.interrupt(id, nowMs);
          // …same reasoning for the ground shape (task #228)
          this.telegraphLayer.interrupt(id);
        }
        const pos = id !== undefined ? this.ctx.entityPos(id) : null;
        if (!isFinitePos(pos)) break; // #131
        // the ground under a corpse (the killing blow's own hitImpact already
        // sprayed the crit-grade blood on the previous frame)
        this.feedback.landingDust({ x: pos.x, z: pos.z, power: 0.75, scale: this.budgetScale(), nowMs });
        // a kill is the loudest moment in the fight: EX-grade layered pop
        // (white-hot core + ember streaks + ground shockwave) on the SAME
        // frame as the ash plume — never the old lone gray puff
        this.layeredPop(pos.x, pos.z, nowMs, "ex", DEATH_TINT);
        this.play(DEATH_SMOKE, pos.x, pos.z, nowMs);
        break;
      }
      // healing flowers (task #34): both events carry the flower's x/z
      // directly (the entity may already be despawned on burst)
      case "flowerSpawn": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined) break;
        // low-stakes cue: the dirt-kick doc alone (no layered pop to pay for)
        this.play(this.doc(FLOWER_SPAWN_VFX), x, z, nowMs, 0.4);
        break;
      }
      case "flowerBurst": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined) break;
        // heal pickup: green core flash + ground ring from the composer under
        // the rising green mote burst (doc-less → the pop alone still reads)
        this.layeredPop(x, z, nowMs, "heavy", HEAL_TINT);
        this.play(this.doc(FLOWER_BURST_VFX), x, z, nowMs, 0.9);
        break;
      }
      // 陣亡投幣 (task #191). Both events carry x/z BECAUSE the entity is gone
      // (or, on the drop, has only just appeared): the pickup destroys the coin
      // in the same sim tick it pays out, so there is nothing left to anchor to.
      case "coinDropped": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        // a small gold flare where it lands — the coin's own view carries the
        // steady 閃光, so this is only the arrival beat
        this.layeredPop(x, z, nowMs, "light", COIN_TINT);
        break;
      }
      case "coinPickedUp": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        // 撿到金幣 — a bright gold nova, the kill-grade pop, because someone just
        // walked off with a hundred gold and that should be unmissable.
        this.layeredPop(x, z, nowMs, "ex", COIN_TINT);
        break;
      }
      // revive circles (task #84): the events carry the circle's own x/z, so
      // the cue plays even though the entity is already gone on complete/end.
      case "reviveCircleSpawn": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined) break;
        this.play(this.doc(REVIVE_SPAWN_VFX), x, z, nowMs, 0.5);
        break;
      }
      case "reviveComplete": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined) break;
        // a rescue undoes a kill, so it gets a kill's weight
        this.layeredPop(x, z, nowMs, "ex", REVIVE_TINT);
        this.play(this.doc(REVIVE_COMPLETE_VFX), x, z, nowMs, 1);
        break;
      }
      // `reviveCircleEnd` is deliberately SILENT: a circle burning out is a
      // non-event and must not read as if something landed.

      // NEUTRAL GUARDIAN (task #89). The PRE-LAND punish telegraph: a ground
      // ring at every marked target that FILLS over the exact wind-up window
      // (impactTick − now), so a player can SEE the volley coming and step out —
      // consistent with the cast-telegraph contract (a dodge you cannot see is
      // not a dodge). `radius` is the post-abilityRange value (#125), so the ring
      // is exactly where the damage query will hit.
      case "guardianMark": {
        const targets = ev.data.targets as { x: number; z: number }[] | undefined;
        if (!Array.isArray(targets)) break;
        const radius = typeof ev.data.radius === "number" ? ev.data.radius : 3;
        const impactTick = typeof ev.data.impactTick === "number" ? ev.data.impactTick : ev.tick;
        const windupMs = Math.max(1, (impactTick - ev.tick) * TICK_MS);
        for (const t of targets) {
          if (!isFinitePos(t)) continue;
          // Same DANGER channel as an enemy champion's cast (#228): a neutral
          // guardian's volley is incoming damage to whoever is standing in it,
          // and one colour language for "get out" beats two.
          this.telegraphs.push(
            new Telegraph(this.scene, t.x, t.z, radius, nowMs, windupMs, undefined, {
              palette: telegraphPaletteFor("enemy"),
            }),
          );
        }
        break;
      }
      // the volley LANDS: a hit pop at the guardian's centre (the marks already
      // paid off their own resolve shockwave when their telegraphs fired).
      case "guardianImpact": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        this.layeredPop(x, z, nowMs, "heavy", GUARDIAN_TINT);
        break;
      }
      // the guardian was SLAIN (last-hit reward, task #89) — a kill-grade pop so
      // the payoff moment reads as loudly as a champion kill.
      case "guardianSlain": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        this.layeredPop(x, z, nowMs, "ex", GUARDIAN_TINT);
        break;
      }
      // the 鎮守之力 heir buff FIRED an AoE pulse (task #89): a light aura pop at
      // the bearer so the invisible enemies-only volley reads as a real burst of
      // guardian power radiating off the buff-holder — otherwise the damage lands
      // with no visual and looks like nothing happened. Kept at "light" (not the
      // "heavy" impact / "ex" slain pops) because it RECURS every volley period —
      // a loud pop each tick would fatigue rather than inform.
      case "guardianHeirPulse": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        this.layeredPop(x, z, nowMs, "light", GUARDIAN_TINT);
        break;
      }

      // WC3 dummy-effect-unit one-shots (task #9): the sim's spawnVfx effect
      // emits a world point + a vfx@1 doc id — play the doc there (HitSpark as
      // the doc-less fallback, matching projectileHit).
      case "vfxSpawn": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined || !isFinitePos({ x, z })) break; // #131
        const doc = this.doc(ev.data.vfxId as string | undefined);
        if (doc) this.play(doc, x, z, nowMs);
        else this.sparks.push(new HitSpark(this.scene, x, z, nowMs));
        break;
      }
      default:
        break;
    }
  }

  /**
   * GROUND-FOLLOW pass (task #147): one walk over the live bodies the render
   * layer exposes (frameBus.champions), reading each body's FRESH rendered
   * position via `ctx.entityPos` (the champion views are synced earlier in the
   * frame). It drives BOTH the blob shadows and the velocity-gated walking
   * dust, then prunes the per-entity walk state for bodies that despawned.
   */
  private syncGroundEntities(nowMs: number): void {
    const scratch = this.shadowScratch;
    scratch.length = 0;
    for (const anchor of frameBus.champions.values()) {
      const id = anchor.entityId;
      const pos = this.ctx.entityPos(id);
      if (!isFinitePos(pos)) continue;
      const prop = isRootedProp(anchor.kind, anchor.teamId);
      // shadow under every LIVE body (a corpse/despawned body drops its shadow)
      if (anchor.alive) {
        scratch.push({ id, x: pos.x, z: pos.z, radius: prop ? SHADOW_FLOWER_RADIUS : SHADOW_CHAMPION_RADIUS });
        // walking dust: champions only (a rooted prop never kicks dust)
        if (!prop) this.emitWalkDust(id, pos, nowMs);
      }
    }
    this.shadows.sync(scratch, nowMs);
    // prune walk state for bodies that are no longer on the field
    if (this.walkTrail.size > 0) {
      for (const id of this.walkTrail.keys()) {
        if (!frameBus.champions.has(id)) this.walkTrail.delete(id);
      }
    }
  }

  /**
   * Velocity-gated walking dust for ONE body. Gated on STRIDE distance (a still
   * body never accumulates it) paced by a min interval, so it reads like
   * footsteps and is frame-rate independent. A teleport/respawn jump re-baselines
   * without emitting. The puff kicks up slightly BEHIND the foot.
   */
  private emitWalkDust(id: number, pos: { x: number; z: number }, nowMs: number): void {
    const st = this.walkTrail.get(id);
    if (!st) {
      this.walkTrail.set(id, { ex: pos.x, ez: pos.z, lastMs: -Infinity });
      return;
    }
    const dx = pos.x - st.ex;
    const dz = pos.z - st.ez;
    const dist = Math.hypot(dx, dz);
    if (dist > WALK_TELEPORT_DIST) {
      st.ex = pos.x; // teleport/respawn — re-baseline, no puff
      st.ez = pos.z;
      return;
    }
    if (dist < WALK_STRIDE || nowMs - st.lastMs < WALK_MIN_INTERVAL_MS) return;
    const inv = 1 / dist;
    this.feedback.walkDust({
      x: pos.x - dx * inv * WALK_PUFF_TRAIL,
      z: pos.z - dz * inv * WALK_PUFF_TRAIL,
      scale: this.budgetScale(),
      nowMs,
    });
    st.ex = pos.x;
    st.ez = pos.z;
    st.lastMs = nowMs;
  }

  update(nowMs: number): void {
    // The rig advances on dt (KP2 tracks, effect durations, drains) — never on
    // wall clock, so a paused match or a hand-stepped replay stays in step. A
    // backgrounded tab returns with a huge dt, which RELEASES the live effects
    // rather than stranding them: the safe direction, deliberately not clamped
    // down to a small step here (`W3xCastFx` caps it at one second).
    const dtMs = this.lastUpdateMs === null ? 0 : nowMs - this.lastUpdateMs;
    this.lastUpdateMs = nowMs;
    this.w3xCast.tick(dtMs, nowMs);
    for (const t of this.telegraphs) t.update(nowMs);
    this.telegraphs = this.telegraphs.filter((t) => !t.done);
    // #228: re-reads the cast bar's fraction per caster and advances/reaps
    this.telegraphLayer.update(nowMs);
    for (const s of this.sparks) s.update(nowMs);
    this.sparks = this.sparks.filter((s) => !s.done);
    // decal fades + idle-pool reaping for the task #39 layers
    this.blood.update(nowMs);
    this.feedback.update(nowMs);
    this.status.update(nowMs);
    // ground-follow layer (task #147): shadows + walking dust + cast-scorch fades
    this.syncGroundEntities(nowMs);
    this.castDecals.update(nowMs);
    this.pillars.update(nowMs);
  }

  dispose(): void {
    for (const t of this.telegraphs) t.dispose();
    this.telegraphLayer.dispose();
    for (const s of this.sparks) s.dispose();
    for (const list of this.pool.values()) for (const e of list) e.ps.dispose();
    this.blood.dispose();
    this.feedback.dispose();
    this.status.dispose();
    this.shadows.dispose();
    this.castDecals.dispose();
    this.pillars.dispose();
    // The rig owns its own ParticleSystems and emitter meshes — its dispose()
    // walks every system it EVER built, pooled or live, so nothing can survive
    // this call by being in a state we forgot about (task #131's lesson).
    this.w3xCast.dispose();
    this.lastUpdateMs = null;
    this.telegraphs = [];
    this.sparks = [];
    this.pool.clear();
    this.shaped.clear();
    this.aim.clear();
    this.walkTrail.clear();
  }
}
