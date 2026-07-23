/**
 * ChampionView — the DEFAULT visual is a PROCEDURAL Minecraft-like voxel
 * figure built from Babylon boxes (head / torso / 2 arms / 2 legs, classic
 * 8:12:4 proportions), team-tinted, animated by deterministically swinging
 * the limb boxes. When a model doc exists for the modelKey, the AssetManager
 * loads its .glb (KayKit rigged character) and swaps it in: a ClipAnimator
 * then drives the real AnimationGroups via the doc's clipMap — the
 * procedural figure remains the instant fallback (client-06). Every champion
 * also gets a team-colored ground ring + blob shadow (KayKit models are not
 * team-tinted; the ring is the team read).
 */
import type { Scene } from "@babylonjs/core/scene";
// SIDE EFFECT, LOAD-BEARING: `mesh.renderOverlay` (the hit-flash channel used by
// applyFlash below) does not exist until this module installs the accessor on
// Mesh.prototype and registers the OutlineRenderer scene component that draws
// the overlay pass. Without it every flash wrote an inert expando and NOTHING
// was ever rendered — verified against the client's exact babylon module set.
import "@babylonjs/core/Rendering/outlineRenderer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { ModelDoc } from "@ggd/shared/content";
import { AnimationStateMachine, type AnimState, type AnimPulse } from "../anim/AnimationStateMachine";
import { ClipAnimator } from "../ClipAnimator";
import type { AssetManager } from "../AssetManager";
import {
  facingToYaw,
  nlerpFacing,
  smoothingAlpha,
  TELEPORT_STEP_UNITS,
  type Facing2,
} from "../math/motion";
import { FLASH_ALPHA, FLASH_MS, hitstopShiver } from "../combatFeedback";
import { glbYawOffset } from "./glbFacing";
import { castFollowThroughMs, castStrikeFractionFor } from "../anim/castStrike";

/**
 * Yaw turn rate (per second) for visual rotation smoothing. The rendered model
 * eases toward the authoritative facing instead of snapping. ~14/s ≈ a 70 ms
 * time constant — quick enough to feel responsive, slow enough to read as a
 * turn. Exposed so it can be tuned (or hooked to settings) in one place.
 */
export const YAW_SMOOTH_RATE = 14;

/** Team palette (team 0..3). */
export const TEAM_COLORS: readonly [number, number, number][] = [
  [0.25, 0.45, 0.95], // blue
  [0.92, 0.28, 0.25], // red
  [0.28, 0.8, 0.42], // green
  [0.95, 0.78, 0.22], // gold
];

/** Champion accent colors by modelKey (robe/armor tint). */
const ACCENTS: Record<string, [number, number, number]> = {
  "champ.sela": [0.62, 0.36, 0.85], // ember-mage purple
  "champ.thorne": [0.35, 0.52, 0.3], // bramble green
};

const PX = 1.8 / 32; // 32 voxel-pixels tall → 1.8 world units

/**
 * HEIGHT-NORMALIZATION target (task #150). Every loaded champion .glb is scaled
 * so its full silhouette stands ≈ this many world units tall, REGARDLESS of the
 * glb's native mesh height — which varies wildly per champion (measured 1.70u to
 * 2.32u rendered across the roster; the four shared CC0 stand-in meshes are the
 * oversized group, champ.sela renders 2.32u, while imported.heroshana renders
 * 1.70u and reads small next to them). Before #150 the render scale was the model
 * doc's raw `scale` applied as an ABSOLUTE — so consistency depended on every
 * doc.scale being hand-tuned per glb (fragile: any new/un-tuned import renders
 * wrong). Normalizing here makes size CONSISTENT by construction. A per-champion
 * RELATIVE multiplier (see tryUpgradeToGlb's `relativeScale`, from
 * content/models/_standin-overrides.json) then intentionally shrinks lore-small
 * creatures / enlarges giants. ~1.8u ≈ a standing human (夏娜 = the normal case).
 */
export const TARGET_HEIGHT = 1.8;

/**
 * A glb whose measured native height is below this (world units at scale 1) is
 * treated as unmeasurable — a degenerate / geometry-less rig — and falls back to
 * the model doc's declared `scale` rather than producing an absurd normalization
 * factor (dividing the target by a near-zero height). Real champions measure
 * >1u; this only trips on broken geometry.
 */
const MIN_NATIVE_HEIGHT = 0.05;

export class ChampionView {
  readonly root: TransformNode;
  readonly anim = new AnimationStateMachine();

  private readonly bodyRoot: TransformNode;
  private readonly head: Mesh;
  private readonly torso: Mesh;
  private readonly armL: TransformNode;
  private readonly armR: TransformNode;
  private readonly legL: TransformNode;
  private readonly legR: TransformNode;
  private readonly proceduralParts: Mesh[] = [];
  /** meshes tinted by the hit flash (procedural parts + any loaded .glb meshes). */
  private readonly flashMeshes: AbstractMesh[] = [];
  /**
   * Materials THIS VIEW CREATED — the only ones `dispose()` may destroy. A .glb
   * mesh's material belongs to the AssetManager's container cache, not to us.
   */
  private readonly ownedMaterials: StandardMaterial[] = [];
  private readonly teamRing: Mesh;
  private readonly blobShadow: Mesh;

  private clipAnimator: ClipAnimator | null = null;
  private glbRoot: TransformNode | null = null;
  /** The render scale actually applied to the adopted .glb — the height-normalized
   *  factor × the per-champion relative multiplier (task #150; #77 declared scale). */
  private declaredScaleValue: number | null = null;
  private upgradeStarted = false;
  private walkPhase = 0;
  private lastPose = { x: 0, z: 0 };
  private deathT = 0;
  /** hit flash (white physical/true, red magic) — brief emissive-style overlay. */
  private flashUntilMs = 0;
  private flashRgb: [number, number, number] = [1, 1, 1];
  /** per-flash overlay strength (0..1) — tier-driven, defaults to FLASH_ALPHA. */
  private flashAlpha = FLASH_ALPHA;
  private flashActive = false;
  /** hitstop: freeze this model's animation until this time (sim-synced). */
  private hitstopUntilMs = 0;
  /** follow-through span of the in-flight cast (set by `beginCast`). */
  private castTailMs = 0;
  /** true while the body is offset by the hitstop micro-shiver (needs a reset). */
  private shiverActive = false;
  private disposed = false;
  /** smoothed facing state (unit vectors); yaw eases cur→target every frame */
  private curFacing: Facing2 = { x: 0, z: 1 };
  private targetFacing: Facing2 = { x: 0, z: 1 };
  private facingInit = false;

  constructor(
    scene: Scene,
    readonly entityId: number,
    readonly modelKey: string,
    teamId: number,
  ) {
    this.root = new TransformNode(`champ-${entityId}`, scene);
    this.bodyRoot = new TransformNode(`champ-${entityId}-body`, scene);
    this.bodyRoot.parent = this.root;

    const team = TEAM_COLORS[((teamId % 4) + 4) % 4]!;
    const accent = ACCENTS[modelKey] ?? [0.5, 0.5, 0.55];

    const mat = (name: string, rgb: [number, number, number]): StandardMaterial => {
      const m = new StandardMaterial(`champ-${entityId}-${name}`, scene);
      m.diffuseColor = new Color3(rgb[0], rgb[1], rgb[2]);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      this.ownedMaterials.push(m);
      return m;
    };
    const skinMat = mat("skin", [0.87, 0.72, 0.58]);
    const teamMat = mat("team", team);
    const accentMat = mat("accent", accent);

    const box = (
      name: string,
      w: number,
      h: number,
      d: number,
      m: StandardMaterial,
      parent: TransformNode,
      y: number,
    ): Mesh => {
      const b = MeshBuilder.CreateBox(`champ-${entityId}-${name}`, { width: w * PX, height: h * PX, depth: d * PX }, scene);
      b.material = m;
      b.parent = parent;
      b.position.y = y * PX;
      b.isPickable = false;
      this.proceduralParts.push(b);
      this.flashMeshes.push(b); // procedural parts flash by default
      return b;
    };

    // Minecraft proportions (voxel px): legs 12, torso 12, head 8 → 32 tall.
    this.torso = box("torso", 8, 12, 4, teamMat, this.bodyRoot, 18);
    this.head = box("head", 8, 8, 8, skinMat, this.bodyRoot, 28);

    // limbs pivot at their attachment point (shoulder/hip)
    const limb = (
      name: string,
      m: StandardMaterial,
      px: number,
      pivotY: number,
    ): TransformNode => {
      const pivot = new TransformNode(`champ-${entityId}-${name}-pivot`, scene);
      pivot.parent = this.bodyRoot;
      pivot.position.set(px * PX, pivotY * PX, 0);
      box(name, 4, 12, 4, m, pivot as TransformNode, -6);
      return pivot;
    };
    this.armL = limb("armL", accentMat, -6, 24);
    this.armR = limb("armR", accentMat, 6, 24);
    this.legL = limb("legL", teamMat, -2, 12);
    this.legR = limb("legR", teamMat, 2, 12);

    // ---- team identity ring + blob shadow (independent of model source) ----
    const ringMat = new StandardMaterial(`champ-${entityId}-ring`, scene);
    ringMat.emissiveColor = new Color3(team[0], team[1], team[2]);
    ringMat.disableLighting = true;
    ringMat.alpha = 0.85;
    this.ownedMaterials.push(ringMat);
    this.teamRing = MeshBuilder.CreateTorus(
      `champ-${entityId}-teamring`,
      { diameter: 1.25, thickness: 0.07, tessellation: 40 },
      scene,
    );
    this.teamRing.material = ringMat;
    this.teamRing.parent = this.root;
    this.teamRing.position.y = 0.04;
    this.teamRing.isPickable = false;

    const shadowMat = new StandardMaterial(`champ-${entityId}-blob`, scene);
    shadowMat.diffuseColor = new Color3(0, 0, 0);
    shadowMat.emissiveColor = new Color3(0, 0, 0);
    shadowMat.specularColor = new Color3(0, 0, 0);
    shadowMat.alpha = 0.38;
    this.ownedMaterials.push(shadowMat);
    this.blobShadow = MeshBuilder.CreateDisc(
      `champ-${entityId}-shadow`,
      { radius: 0.52, tessellation: 24 },
      scene,
    );
    this.blobShadow.material = shadowMat;
    this.blobShadow.parent = this.root;
    this.blobShadow.rotation.x = Math.PI / 2;
    this.blobShadow.position.y = 0.03;
    this.blobShadow.isPickable = false;
  }

  /**
   * Imperative transform write — never routed through React/Zustand. Position
   * is applied immediately; the authoritative facing is only recorded as the
   * TARGET here (the yaw eases toward it in `update`), except on the very first
   * pose where there is no prior orientation to preserve, so we snap once.
   */
  setPose(x: number, z: number, fx: number, fz: number): void {
    const dx = x - this.lastPose.x;
    const dz = z - this.lastPose.z;
    const step = Math.sqrt(dx * dx + dz * dz);
    // The limb swing is driven by DISTANCE TRAVELLED, so a relocation (spawn,
    // respawn, blink) would spin the walk cycle through a random phase in one
    // frame. A step this large is never locomotion (the fastest dash covers
    // ~1 u per 30 Hz tick), so treat it as a teleport and hold the phase.
    if (step < TELEPORT_STEP_UNITS) this.walkPhase += step * 4.2;
    this.lastPose = { x, z };
    this.root.position.x = x;
    this.root.position.z = z;
    if (fx * fx + fz * fz > 1e-9) {
      this.targetFacing.x = fx;
      this.targetFacing.z = fz;
      if (!this.facingInit) {
        this.facingInit = true;
        this.curFacing = nlerpFacing(this.curFacing, this.targetFacing, 1); // snap on spawn
        this.root.rotation.y = facingToYaw(this.curFacing.x, this.curFacing.z);
      }
    }
  }

  /**
   * Ease the rendered yaw toward the authoritative facing. Runs every frame
   * regardless of the model source (procedural or .glb), so the fix applies to
   * every champion. nlerp on the 2D facing vector → bounded step → never snaps.
   */
  private stepFacing(dtMs: number): void {
    if (!this.facingInit) return;
    this.curFacing = nlerpFacing(this.curFacing, this.targetFacing, smoothingAlpha(YAW_SMOOTH_RATE, dtMs));
    this.root.rotation.y = facingToYaw(this.curFacing.x, this.curFacing.z);
  }

  /**
   * Event-driven animation pulse (attack/cast/hurt) from MSG.EVENT fanout.
   * `windowMs` holds the state for a real event-derived duration (cast time /
   * attack wind-up); `clipWindowMs` stretches/squeezes the one-shot clip to
   * that span; `restartClip: false` extends the state without re-firing the
   * clip (basicAttack landing mid-wind-up must not restart the swing).
   */
  pulse(
    kind: AnimPulse,
    nowMs: number,
    opts?: { windowMs?: number; clipWindowMs?: number; restartClip?: boolean },
  ): void {
    this.anim.trigger(kind, nowMs, opts?.windowMs);
    if (this.clipAnimator) {
      const clipWin = opts?.clipWindowMs ?? opts?.windowMs;
      if (clipWin !== undefined || opts?.restartClip !== false) {
        // a restarting pulse (re)defines its window; a non-restarting extend
        // (basicAttack mid-wind-up) leaves the wind-up's window in place
        this.clipAnimator.setPulseWindow(kind, clipWin !== undefined ? clipWin / 1000 : undefined);
      }
      if (opts?.restartClip !== false) this.clipAnimator.restart(kind);
    }
  }

  /**
   * The fraction of this model's cast clip that has played at the release
   * frame — the strike fraction the whole cast alignment is built on. Per-model
   * (see anim/castStrike), so a rig whose clip throws early/late can be tuned
   * without touching content/** or the sim.
   */
  get castStrikeFraction(): number {
    return castStrikeFractionFor(this.modelKey);
  }

  /**
   * CAST WIND-UP — the honest version (task: "stop the body lying").
   *
   * `startupMs` is the sim's authoritative wind-up: `castBegin` fires now and
   * `CastResolveSystem` runs the effects exactly that long afterwards. The clip
   * is planned so its RELEASE FRAME lands on that damage tick, with the
   * anticipation before it and the follow-through after — the same treatment
   * `attackWindup` already gives basic attacks. The state window is the whole
   * span (startup + tail), not just the startup, so the follow-through has
   * somewhere to play.
   *
   * The old call spanned the clip across `startupMs` itself, which threw the
   * move ~(1 - f) × startup EARLY — 240 ms on a 0.6 s cast at f = 0.6.
   */
  beginCast(startupMs: number, nowMs: number): void {
    const f = this.castStrikeFraction;
    const startup = Math.max(1, startupMs);
    this.castTailMs = castFollowThroughMs(startup, f);
    this.anim.trigger("cast", nowMs, startup + this.castTailMs);
    if (this.clipAnimator) {
      this.clipAnimator.setPulseAlignment("cast", {
        startupSec: startup / 1000,
        strikeFraction: f,
      });
      this.clipAnimator.restart("cast");
    }
  }

  triggerHurt(nowMs: number): void {
    this.pulse("hurt", nowMs);
  }

  /**
   * Bigger reaction for an unblocked heavy hit → KNOCKDOWN: hold the hurt flinch
   * for a longer window (the sim roots the victim prone for a short getup).
   */
  triggerKnockdown(nowMs: number): void {
    this.pulse("hurt", nowMs, { windowMs: 550, clipWindowMs: 550 });
  }

  /**
   * HIT FLASH — briefly tint the struck model (white physical/true, red magic)
   * via a per-mesh render overlay (never mutates shared .glb materials, so one
   * champion's flash can't bleed onto another sharing the material). Duration +
   * strength are tier-driven by combatFeedback's plan; both default to the
   * medium-hit values (FLASH_MS / FLASH_ALPHA) for direct callers.
   */
  flash(
    rgb: [number, number, number],
    nowMs: number,
    durMs: number = FLASH_MS,
    alpha: number = FLASH_ALPHA,
  ): void {
    this.flashRgb = rgb;
    this.flashAlpha = alpha;
    this.flashUntilMs = Math.max(this.flashUntilMs, nowMs + durMs);
  }

  /**
   * HITSTOP — freeze this model's animation until `nowMs + ms`, syncing the
   * struck model to the sim's deterministic hitstop tick-freeze so the hit reads
   * as impact. Only the animation clip freezes; the imperative position write
   * keeps flowing, so knockback still slides.
   */
  setHitstop(ms: number, nowMs: number): void {
    if (!(ms > 0)) return;
    const prevEnd = this.hitstopUntilMs;
    this.hitstopUntilMs = Math.max(prevEnd, nowMs + ms);
    // A mid-cast hit freezes the CLIP (ClipAnimator.setFrozen) and the sim
    // freezes the cast wind-up with it (CastResolveSystem skips a tick while
    // world.hitstop > 0). The pulse WINDOW is wall-clock, though, so without
    // this it would expire while the frozen clip still has frames to play and
    // the body would snap to idle before the move came out. Grow it by exactly
    // the freeze the model actually gained.
    const gained = this.hitstopUntilMs - Math.max(prevEnd, nowMs);
    if (gained > 0) this.anim.extendPulse("cast", gained);
  }

  /**
   * The sim RESOLVED the cast (castEnd) — the damage has landed on this exact
   * frame. Do NOT cut the clip here: the release frame is playing right now and
   * the follow-through is what sells it. Re-anchor the tail on the real event
   * instead of the predicted one, because hitstop/hitstun legitimately push
   * `castEnd` past `castTimeSec`. The tail is movement-interruptible (the sim
   * has already dropped the cast root).
   */
  releaseCast(nowMs: number): void {
    this.anim.release("cast", nowMs, this.castTailMs);
    this.castTailMs = 0;
  }

  /** The cast was BROKEN (castInterrupt: stun/knockdown/death) — cut the pose. */
  endCast(): void {
    this.castTailMs = 0;
    this.anim.cancel("cast");
  }

  /** Advance the visual animation for this frame. */
  update(state: AnimState, nowMs: number, dtMs: number, speedUnitsPerSec = 0): void {
    this.stepFacing(dtMs); // yaw smoothing — model-source independent
    const frozen = nowMs < this.hitstopUntilMs; // hitstop window
    this.applyHitstopShiver(nowMs, frozen); // 破碎 buzz on the frozen body
    if (this.clipAnimator?.hasClips) {
      this.clipAnimator.setFrozen(frozen); // freeze/unfreeze the clip
      if (!frozen) {
        this.clipAnimator.setLocomotionSpeed(speedUnitsPerSec); // foot-slide fix
        this.clipAnimator.play(state);
        // release a HELD clip start (a cast clip too short to fill its window
        // waits on its opening frame so the strike still lands on the tick).
        // Inside the !frozen branch on purpose: hitstop must pause the hold.
        this.clipAnimator.advance(dtMs);
      }
      // keep the team ring readable but dim it for the dead
      const dead = state === "death";
      this.teamRing.setEnabled(!dead);
      this.blobShadow.setEnabled(!dead);
      this.applyFlash(nowMs);
      return;
    }
    // ---- procedural voxel animation ----
    if (frozen) {
      // hitstop: hold the current limb pose, only keep the flash alive
      this.applyFlash(nowMs);
      return;
    }
    const dt = Math.min(dtMs, 100) / 1000;
    const swing = Math.sin(this.walkPhase);

    let armL = 0;
    let armR = 0;
    let leg = 0;
    let bob = 0;
    if (state === "run") {
      armL = swing * 0.8;
      armR = -swing * 0.8;
      leg = swing * 0.75;
      bob = Math.abs(Math.cos(this.walkPhase)) * 0.05;
    } else if (state === "attack") {
      armR = -2.0; // raised strike
      armL = 0.3;
    } else if (state === "cast") {
      armL = -1.6; // both arms forward/up
      armR = -1.6;
    } else if (state === "hurt") {
      armL = 0.5;
      armR = 0.5;
    } else if (state === "idle") {
      const idleSway = Math.sin(nowMs / 600) * 0.06;
      armL = idleSway;
      armR = -idleSway;
    }

    if (state === "death") {
      this.deathT = Math.min(1, this.deathT + dt * 2.5);
    } else {
      this.deathT = Math.max(0, this.deathT - dt * 5);
    }
    // fall backward + sink slightly
    this.bodyRoot.rotation.x = -this.deathT * (Math.PI / 2);
    this.bodyRoot.position.y = -this.deathT * 0.35;
    this.teamRing.setEnabled(this.deathT < 0.5);
    this.blobShadow.setEnabled(this.deathT < 0.5);

    const k = 1 - Math.pow(0.5, dtMs / 40); // limb smoothing
    this.armL.rotation.x += (armL - this.armL.rotation.x) * k;
    this.armR.rotation.x += (armR - this.armR.rotation.x) * k;
    this.legL.rotation.x += (leg - this.legL.rotation.x) * k;
    this.legR.rotation.x += (-leg - this.legR.rotation.x) * k;
    this.bodyRoot.position.y = this.bodyRoot.position.y + bob;

    this.applyFlash(nowMs);
  }

  /**
   * HITSTOP MICRO-JITTER (audit strong-P2 / 破碎 buzz): while the body is frozen
   * on contact, offset it by a tiny high-frequency shiver (~1–2px) so the freeze
   * BUZZES with impact energy instead of reading as a dead pause. Client-only and
   * cosmetic — it moves `bodyRoot` (the visual body), never the `root` world
   * transform (position/ring/shadow keep flowing, so knockback still slides), and
   * it snaps to zero the instant the freeze lifts (收尾精準, no settle tail).
   * Edge-guarded: costs nothing outside the hitstop window.
   */
  private applyHitstopShiver(nowMs: number, frozen: boolean): void {
    if (!frozen) {
      if (this.shiverActive) {
        this.bodyRoot.position.x = 0;
        this.bodyRoot.position.z = 0;
        this.shiverActive = false;
      }
      return;
    }
    // phase off the entity id so attacker + victim don't buzz in lock-step
    const s = hitstopShiver(nowMs, this.hitstopUntilMs, this.entityId * 0.7);
    this.bodyRoot.position.x = s.x;
    this.bodyRoot.position.z = s.z;
    this.shiverActive = true;
  }

  /**
   * Drive the hit-flash render overlay. Edge-guarded: writes every frame while
   * lit (colour is stable + cheap), clears once on the trailing edge, and does
   * nothing while idle — no per-frame cost outside the ~80 ms flash window.
   */
  private applyFlash(nowMs: number): void {
    const on = nowMs < this.flashUntilMs;
    if (!on && !this.flashActive) return;
    for (const m of this.flashMeshes) {
      m.renderOverlay = on;
      if (on) {
        m.overlayColor.copyFromFloats(this.flashRgb[0], this.flashRgb[1], this.flashRgb[2]);
        m.overlayAlpha = this.flashAlpha;
      }
    }
    this.flashActive = on;
  }

  get hasGlb(): boolean {
    return this.glbRoot !== null;
  }

  /**
   * The live clip animator, or null while the champion is still on its
   * procedural stand-in. READ-ONLY DIAGNOSTICS: the /frame-data audition page
   * uses it to read back the plan a real `beginCast` produced on a real .glb,
   * so the page proves the RENDERER's timing rather than re-deriving it.
   * Nothing in the game should drive animation through this — go through
   * `pulse`/`beginCast`/`update`.
   */
  get animator(): ClipAnimator | null {
    return this.clipAnimator;
  }

  /**
   * The render scale actually applied to the adopted .glb, or null while the
   * champion is still on its procedural stand-in. As of task #150 this is the
   * HEIGHT-NORMALIZED factor (TARGET_HEIGHT ÷ the glb's native height) times the
   * per-champion `relativeScale` multiplier — NOT the model doc's raw `scale`
   * (which is now only a fallback for a degenerate glb). It never silently
   * substitutes a generic default (task #77): the procedural voxel figure stands
   * in only when there is genuinely no renderable model.
   */
  get declaredScale(): number | null {
    return this.declaredScaleValue;
  }

  get upgradeAttempted(): boolean {
    return this.upgradeStarted;
  }

  /**
   * Swap in the model doc's .glb (async). Idempotent — safe to call every
   * frame until a doc is available; only the first call with a doc loads.
   *
   * `relativeScale` (task #150, default 1.0) is the per-champion INTENTIONAL size
   * multiplier applied on top of height-normalization: 1.0 renders at the common
   * TARGET_HEIGHT, <1 deliberately smaller (lore-small creatures/mascots), >1
   * bigger (giants/mecha). It comes from content/models/_standin-overrides.json
   * via EntityViewRegistry.modelOverrideFor and is the ONLY size-exception knob —
   * the doc's raw `scale` no longer sets the on-screen size.
   */
  tryUpgradeToGlb(assets: AssetManager, doc: ModelDoc | null, relativeScale = 1): void {
    if (!doc || this.upgradeStarted || this.disposed) return;
    this.upgradeStarted = true;
    void assets
      .load(doc.glbPath)
      .then((container) => {
        if (!container || this.disposed || this.glbRoot) return;
        const inst = container.instantiateModelsToScene((n) => `${this.entityId}-${n}`, false, {
          doNotInstantiate: true,
        });
        const glbRoot = new TransformNode(`champ-${this.entityId}-glb`, this.root.getScene());
        glbRoot.parent = this.root;
        // Measure at the NATIVE scale first (task #150): normalization needs the
        // glb's own height before any scaling is applied.
        glbRoot.scaling.setAll(1);
        // facing convention lives in one place (glbFacing); imported .glbs
        // need a different offset than native/KayKit ones. Yaw is about Y, so it
        // does not affect the vertical bounding measure below.
        glbRoot.rotation.y = glbYawOffset(doc.glbPath, this.modelKey);
        for (const node of inst.rootNodes) node.parent = glbRoot;
        const glbMeshes = glbRoot.getChildMeshes(false);
        // EMPTY-GLB → KEEP THE PROCEDURAL FALLBACK (task #69). A few imported
        // "models" are geometry-less WC3 dummies — e.g. `imported.collision`, a
        // 0-mesh bone-only unit whose only clip is a static "Stand" (godie-u011
        // is mapped to it, intentionally, as the procedural-fallback case the
        // model-scale/bbox/texture guards document). Adopting it anyway hid the
        // voxel figure AND installed a ClipAnimator whose "attack" resolved to
        // "Stand" — an INVISIBLE champion that never animates a swing. Discard
        // the empty instance and let the procedural figure (which DOES animate
        // attack/hurt/run) stand in. `upgradeStarted` stays true, so no retry.
        if (glbMeshes.length === 0) {
          inst.dispose(); // frees the cloned nodes + skeletons + animation groups
          glbRoot.dispose(false, false);
          return;
        }
        for (const mesh of glbMeshes) {
          mesh.isPickable = false;
          this.flashMeshes.push(mesh); // .glb meshes flash via per-mesh overlay
        }
        // HEIGHT-NORMALIZE (task #150): scale the glb so its full silhouette
        // stands ≈ TARGET_HEIGHT tall, then apply the champion's relative
        // multiplier — REPLACING the old raw-doc.scale-as-absolute so every
        // champion reads a consistent size regardless of its native mesh height.
        // A degenerate/geometry-less glb (native height unmeasurable) falls back
        // to the doc's declared scale rather than a nonsense normalization factor.
        glbRoot.computeWorldMatrix(true);
        const native = glbRoot.getHierarchyBoundingVectors(true);
        const nativeH = native.max.y - native.min.y;
        const rel = relativeScale > 0 ? relativeScale : 1;
        const baseScale =
          Number.isFinite(nativeH) && nativeH > MIN_NATIVE_HEIGHT
            ? TARGET_HEIGHT / nativeH
            : doc.scale;
        const finalScale = baseScale * rel;
        glbRoot.scaling.setAll(finalScale);
        // GROUND (task #61 "flying"/"sinking" fix): lift the model so its lowest
        // vertex sits on the arena floor (y=0). Imported rigs bake their feet at
        // an arbitrary local Y — `imported.ma` floats 0.72u above the origin,
        // `imported.picacugy`/`gumdam` dip ~0.6u below it (half-buried). This is
        // the SAME per-model root shift StorePreview (#129) and the intermission
        // mount (#111 int-32) apply, ported to the in-arena view so every
        // champion stands ON the ground, not above or sunk into it. Runs after
        // the FINAL scaling so the shift is in the rendered (scaled) frame.
        glbRoot.computeWorldMatrix(true);
        const { min } = glbRoot.getHierarchyBoundingVectors(true);
        if (Number.isFinite(min.y)) glbRoot.position.y = -min.y;
        this.glbRoot = glbRoot;
        this.declaredScaleValue = finalScale; // the render scale actually applied
        this.clipAnimator = new ClipAnimator(inst.animationGroups, doc.clipMap);
        // hide the procedural fallback
        for (const p of this.proceduralParts) p.setEnabled(false);
      })
      .catch((err) => {
        /* keep the procedural figure */
        console.warn(`[ChampionView] glb upgrade failed for ${this.modelKey}:`, err);
      });
  }

  /**
   * MATERIAL OWNERSHIP — why this does NOT pass `disposeMaterialAndTextures`.
   * `tryUpgradeToGlb` instantiates with `cloneMaterials: false`, so every .glb
   * child mesh points straight at the AssetContainer's material — the object
   * `AssetManager` CACHES per glb path and hands to every other champion on
   * that model and to every future spawn. Babylon's `dispose(_, true)` runs
   * `material.dispose(false, true)` on EVERY child mesh (note: forceDisposeTextures),
   * so the first champion to despawn would strip the shared material and its
   * textures out from under everyone still using it. We therefore let materials
   * outlive the view and dispose only the ones we created ourselves.
   */
  dispose(): void {
    this.disposed = true;
    // ANIMATION GROUPS are not nodes: `instantiateModelsToScene` clones the
    // container's groups into `scene.animationGroups` (a list Babylon walks
    // every frame) and `root.dispose()` below never touches them. Free them
    // FIRST, while their targets are still alive.
    this.clipAnimator?.dispose();
    this.clipAnimator = null;
    this.root.dispose(false, false);
    for (const m of this.ownedMaterials) m.dispose(false, true);
    this.ownedMaterials.length = 0;
  }
}
