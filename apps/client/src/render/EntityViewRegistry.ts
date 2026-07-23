/**
 * EntityViewRegistry — diffs the authoritative entity set into Babylon views
 * and writes per-frame transforms IMPERATIVELY (never via React/Zustand).
 * Champions get a procedural voxel figure immediately (with an async .glb
 * upgrade once the entity's model doc is known); projectiles come from a
 * pooled billboard cache styled by their vfx doc; neutral healing flowers
 * (kind 2) come from a pooled FlowerView (voxel fallback + .glb upgrade);
 * revive circles (kind 3) come from a pooled ReviveCircleView, a purely
 * procedural team-tinted fire ring (no model doc at all).
 * Animation states are derived from authoritative flags + MSG.EVENT pulses.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { ModelDoc, VfxDoc } from "@ggd/shared/content";
import { TICK_MS } from "@ggd/shared/constants";
import { ChampionView } from "./views/ChampionView";
import { ProjectileView, type ProjectileMeshShape } from "./views/ProjectileView";
import { FlowerView } from "./views/FlowerView";
import { ReviveCircleView } from "./views/ReviveCircleView";
import { applyModelTint, releaseModelTint, type ModelTint } from "./views/modelTint";
import type { AssetManager } from "./AssetManager";
import {
  ATTACKER_FLASH_MS,
  ATTACKER_FLASH_RGB,
  asImpactProfile,
  planImpactFeedback,
} from "./combatFeedback";
import { TELEPORT_STEP_UNITS } from "./math/motion";

/** Per-champion vertex-tint bookkeeping (task #49). */
interface TintState {
  /** resolved tint, or null once we know the champion is untinted */
  tint: ModelTint | null;
  /** true once the tint has been applied to the .glb meshes (they arrive late) */
  glbPainted: boolean;
}

/** EMA factor for the observed ground speed fed to run-rate sync. */
const SPEED_SMOOTH = 0.25;
/** Assumed strike point within an attack clip (fraction of the clip). */
const ATTACK_STRIKE_FRACTION = 0.5;

/** Plain snapshot of one entity (adapter over the schema EntityState). */
export interface EntityViewState {
  id: number;
  kind: number; // 0 champion, 1 projectile, 2 flower, 3 revive circle
  seatId: number;
  key: string; // modelKey / projectileId
  teamId: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
  alive: boolean;
  /**
   * Revive circles (kind 3) only — decoded by the caller from the reused
   * EntityState float slots (see protocol ENTITY_KIND). Absent for every other
   * kind, so the shape stays a strict superset of the old one.
   */
  revive?: {
    /** channel fill 0..1 */
    progress: number;
    /** fraction of lifetime still to run, 1 → 0 */
    lifeLeft: number;
    /** authoritative ring radius (world units) */
    radius: number;
    channelling: boolean;
    contested: boolean;
  };
}

/** Optional content lookups (return null until docs are fetched). */
export interface ViewContentHooks {
  /** seatId lets the caller substitute per-seat skins (equipped cosmetics) */
  modelDocFor?(modelKey: string, seatId?: number): ModelDoc | null;
  projectileVfxFor?(projectileKey: string): VfxDoc | null;
  /** 3D body shape of the flying missile (projectile@1 `meshShape`). */
  projectileMeshShapeFor?(projectileKey: string): ProjectileMeshShape | null;
  /**
   * w3x vertex tint + alpha for a champion entity (task #49). The registry
   * CANNOT resolve this itself: the entity → championId step needs the seat
   * table, which lives in the HUD store, and client-08 keeps render/** out of
   * that store. GameApp supplies it (`championIdForSeat` + `championTintForId`);
   * headless tests either stub it or omit it to opt out of tinting entirely.
   * `undefined` = not resolvable yet (retry next frame), `null` = resolved and
   * untinted.
   */
  championTintFor?(e: EntityViewState): ModelTint | null | undefined;
  /**
   * Per-champion model/scale OVERRIDE (task #77). A stand-in champion shares one
   * of the four CC0 meshes via its `modelKey`, so `modelDocFor` (keyed only by
   * modelKey) cannot give it the size the MAP declared — e.g. 小叮噹/哆啦A夢
   * (godie-n00b) should render at ~0.6 scale, not the shared mage's 0.77, and 18
   * champions on `champ.sela` otherwise render identically sized. Because the
   * championId lives behind the seat table that render/** is walled off from
   * (client-08), the composition root (GameApp) resolves the override and injects
   * it here; the registry then applies it to the resolved doc so the fallback
   * PRESERVES the declared model+scale instead of dropping to the generic
   * stand-in size. Returns null/undefined for champions with no override (the
   * common case) — behaviour is then exactly as before.
   */
  modelOverrideFor?(e: EntityViewState): ModelDocOverride | null | undefined;
}

/**
 * A champion-specific override of the shared stand-in's model doc (task #77/#150).
 *
 * `relativeScale` (task #150) is the per-champion INTENTIONAL size multiplier on
 * top of ChampionView's height-normalization: 1.0 = the common target height,
 * <1 = deliberately smaller, >1 = bigger. It is the size-exception knob (small
 * creatures / large giants) and threads to `ChampionView.tryUpgradeToGlb`.
 *
 * The optional `glbPath`/`clipMap` swap in a genuinely different model when one
 * exists. `scale` is the LEGACY (pre-#150) absolute render scale — retained only
 * so `applyModelOverride` can still carry a swapped model's own declared scale
 * into the doc; it no longer sets the on-screen SIZE (normalization does). Any
 * omitted field keeps the doc's.
 */
export interface ModelDocOverride {
  scale?: number;
  relativeScale?: number;
  glbPath?: string;
  clipMap?: ModelDoc["clipMap"];
}

/**
 * The per-champion relative size multiplier from an override (task #150), or 1.0
 * when there is none / it is non-positive. Prefers the #150 `relativeScale`; a
 * legacy override that only carries `scale` is treated as normal-sized (1.0), so
 * an old absolute scale is never mistaken for a relative multiplier.
 */
export function relativeScaleOf(override: ModelDocOverride | null | undefined): number {
  const r = override?.relativeScale;
  return typeof r === "number" && r > 0 ? r : 1;
}

/** Apply a per-champion override to a resolved model doc (task #77). */
export function applyModelOverride(
  doc: ModelDoc | null,
  override: ModelDocOverride | null | undefined,
): ModelDoc | null {
  if (!doc || !override) return doc;
  const next: ModelDoc = { ...doc };
  if (typeof override.scale === "number" && override.scale > 0) next.scale = override.scale;
  if (override.glbPath) next.glbPath = override.glbPath;
  if (override.clipMap) next.clipMap = override.clipMap;
  return next;
}

export interface SyncArgs {
  entities: Iterable<EntityViewState>;
  /** pose override seam: interpolation (remotes) / prediction (local) */
  poseFor: (
    e: EntityViewState,
  ) => { x: number; z: number; fx: number; fz: number };
  nowMs: number;
  dtMs: number;
  /** try to upgrade champions to .glb models (disabled in headless tests) */
  loadModels?: boolean;
  /**
   * Draw-distance cull: hide champions farther than `maxDistance` planar units
   * from `(cx, cz)` (the followed champion). Omit for no culling.
   */
  cull?: { cx: number; cz: number; maxDistance: number };
}

export class EntityViewRegistry {
  private readonly champions = new Map<number, ChampionView>();
  private readonly projectiles = new Map<number, ProjectileView>();
  private readonly pool: ProjectileView[] = [];
  private readonly flowers = new Map<number, FlowerView>();
  private readonly flowerPool: FlowerView[] = [];
  private readonly reviveCircles = new Map<number, ReviveCircleView>();
  private readonly revivePool: ReviveCircleView[] = [];
  private readonly lastPos = new Map<number, { x: number; z: number }>();
  /** smoothed ground speed (units/s) per champion for run-rate sync. */
  private readonly speedEma = new Map<number, number>();
  /** last-applied cull visibility per champion (avoid redundant setEnabled). */
  private readonly culled = new Map<number, boolean>();
  /** w3x vertex tint state per champion (task #49); see `applyTint`. */
  private readonly tinted = new Map<number, TintState>();

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetManager,
    private readonly content: ViewContentHooks = {},
  ) {}

  get championCount(): number {
    return this.champions.size;
  }

  get projectileCount(): number {
    return this.projectiles.size;
  }

  get flowerCount(): number {
    return this.flowers.size;
  }

  get reviveCircleCount(): number {
    return this.reviveCircles.size;
  }

  getChampionView(entityId: number): ChampionView | undefined {
    return this.champions.get(entityId);
  }

  /** Last rendered planar position of an entity (view space), if known. */
  posOf(entityId: number): { x: number; z: number } | null {
    const p = this.lastPos.get(entityId);
    return p ? { x: p.x, z: p.z } : null;
  }

  /** Event fanout → animation pulses on the affected views. */
  handleEvent(ev: EventMessage, nowMs: number): void {
    switch (ev.type) {
      // castBegin carries the real cast STARTUP: the sim resolves the ability
      // exactly that long from now. `beginCast` plans the clip so its release
      // frame lands ON that damage tick (see views/ChampionView + anim/castStrike)
      // instead of spanning the clip across the startup, which threw the move
      // ~0.24 s early on a 0.6 s cast. abilityCast (instant abilities, ct = 0)
      // keeps the short default pulse — there is no wind-up to align to.
      //
      // `ticks` is the authority when both are present: it is the integer tick
      // count CastResolveSystem actually counts down (`round(castTimeSec / dt)`),
      // so it already carries the sim's rounding. castTimeSec is the fallback for
      // an older/partial payload.
      case "castBegin": {
        const caster = ev.data.caster as number | undefined;
        if (caster === undefined) break;
        const secs = typeof ev.data.castTimeSec === "number" ? ev.data.castTimeSec : 0;
        const ticks = typeof ev.data.ticks === "number" ? ev.data.ticks : 0;
        const startupMs = Math.max(1, ticks > 0 ? ticks * TICK_MS : secs * 1000);
        this.champions.get(caster)?.beginCast(startupMs, nowMs);
        break;
      }
      case "abilityCast": {
        const caster = ev.data.caster as number | undefined;
        if (caster !== undefined) this.champions.get(caster)?.pulse("cast", nowMs);
        break;
      }
      // castEnd and castInterrupt are NOT the same moment and must not share a
      // branch any more. castEnd = the sim resolved the ability, so the release
      // frame is playing right now and the follow-through has to finish (cutting
      // it here reintroduces the lie from the other side). castInterrupt = the
      // cast was BROKEN by a stun/knockdown/death, so the move never comes out
      // and the pose is cut.
      case "castEnd": {
        const caster = ev.data.caster as number | undefined;
        if (caster !== undefined) this.champions.get(caster)?.releaseCast(nowMs);
        break;
      }
      case "castInterrupt": {
        const caster = ev.data.caster as number | undefined;
        if (caster !== undefined) this.champions.get(caster)?.endCast();
        break;
      }
      // attackWindup leads the swing: play the attack clip so its strike
      // point (~mid-clip) lands when the wind-up completes (the damage
      // point, where basicAttack fires).
      case "attackWindup": {
        const source = ev.data.source as number | undefined;
        if (source === undefined) break;
        const ticks = typeof ev.data.ticks === "number" ? ev.data.ticks : 0;
        const windupMs = Math.max(1, ticks * TICK_MS);
        this.champions.get(source)?.pulse("attack", nowMs, {
          windowMs: windupMs / ATTACK_STRIKE_FRACTION,
          clipWindowMs: windupMs / ATTACK_STRIKE_FRACTION,
        });
        break;
      }
      // basicAttack fires at the swing/damage point. If a wind-up already
      // started the clip, just extend the attack state — restarting here
      // would visibly reset the swing mid-strike.
      case "basicAttack": {
        const source = ev.data.source as number | undefined;
        if (source !== undefined) {
          const view = this.champions.get(source);
          // ATTACKER FLASH (task #69): the swing connects → a brief white impact
          // pop on the attacker. Melee autos never flashed the attacker before,
          // so the strike read only on the victim. `[...]` copies the readonly
          // tunable into the mutable tuple `flash` expects.
          view?.pulse("attack", nowMs, { restartClip: false });
          view?.flash([...ATTACKER_FLASH_RGB], nowMs, ATTACKER_FLASH_MS);
        }
        break;
      }
      // hitImpact → the ONE orchestrated on-hit moment. combatFeedback turns the
      // sim's single ImpactProfile into ONE coordinated set of reactions; here we
      // DISPATCH the three we own onto the two views — hurt flinch + victim flash
      // + AUTHORITATIVE hitstop on the victim, and a matching freeze + white "I
      // connected" pop on the attacker (Capcom "both freeze") — all scaled by the
      // SAME tier. The freeze comes VERBATIM from profile.hitstopTicks (never
      // re-derived from the damage amount), so a fully-blocked hit (dmg 0 but
      // impact ≥ the sim floor) still freezes both bodies and the pose un-freezes
      // exactly with the body. `hitImpact` co-ticks with `damage`, and always
      // carries the profile, so it is the single source for the freeze window.
      // The plan's `shake` REQUEST + spark/camera/sfx/number hooks are consumed
      // by later waves (GameApp/VfxSystem/UI), not here.
      case "hitImpact": {
        const profile = asImpactProfile(ev.data.profile);
        if (!profile) break; // pre-profile replay / malformed payload → no-op
        const target = ev.data.target as number | undefined;
        const source = ev.data.source as number | undefined;
        const dmgType = (ev.data.dmgType ?? ev.data.type) as string | undefined;
        const plan = planImpactFeedback(profile, { dmgType, tickMs: TICK_MS });
        if (target !== undefined) {
          const view = this.champions.get(target);
          if (view) {
            view.triggerHurt(nowMs);
            view.flash(plan.victimFlash.rgb, nowMs, plan.victimFlash.ms, plan.victimFlash.alpha);
            view.setHitstop(plan.freezeMs, nowMs);
          }
        }
        if (source !== undefined) {
          const sourceView = this.champions.get(source);
          sourceView?.flash(
            plan.attackerFlash.rgb,
            nowMs,
            plan.attackerFlash.ms,
            plan.attackerFlash.alpha,
          );
          sourceView?.setHitstop(plan.freezeMs, nowMs);
        }
        break;
      }
      // unblocked heavy hit → KNOCKDOWN: a longer prone/getup flinch on the victim.
      case "knockdown": {
        const target = ev.data.target as number | undefined;
        if (target !== undefined) this.champions.get(target)?.triggerKnockdown(nowMs);
        break;
      }
      default:
        break;
    }
  }

  /**
   * w3x VERTEX TINT (task #49) — multiply the champion's materials by its
   * ported `tint` and set `alpha` when it is translucent.
   *
   * Two things make this a small state machine rather than a one-liner:
   *   1. the seat table behind `championTintFor` is not populated the instant
   *      the entity appears, so an unresolved lookup must be RETRIED, not
   *      cached as "untinted";
   *   2. the .glb arrives asynchronously (`tryUpgradeToGlb`), so the tint has
   *      to be re-applied once its meshes exist. `applyModelTint` is
   *      idempotent, so the second pass only touches the new meshes.
   * Untinted champions (93 of 113) settle to `tint: null` and cost one map
   * lookup per frame from then on.
   */
  private applyTint(e: EntityViewState, view: ChampionView): void {
    let st = this.tinted.get(e.id);
    if (!st) {
      const resolved = this.content.championTintFor?.(e);
      if (resolved === undefined) return; // seat/content not known yet — retry
      st = { tint: resolved, glbPainted: false };
      this.tinted.set(e.id, st);
      if (!resolved) return; // resolved and neutral: never touch the materials
      applyModelTint(view.root, resolved); // procedural figure / early meshes
    }
    if (!st.tint || st.glbPainted || !view.hasGlb) return;
    st.glbPainted = true;
    applyModelTint(view.root, st.tint); // the .glb meshes just landed
  }

  /** Per-frame diff + imperative transform/animation write. */
  sync(args: SyncArgs): void {
    const seen = new Set<number>();

    for (const e of args.entities) {
      seen.add(e.id);
      if (e.kind === 1) {
        let view = this.projectiles.get(e.id);
        if (!view) {
          view = this.pool.pop() ?? new ProjectileView(this.scene);
          view.activate(
            this.content.projectileVfxFor?.(e.key) ?? null,
            this.content.projectileMeshShapeFor?.(e.key) ?? "bolt",
          );
          this.projectiles.set(e.id, view);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        continue;
      }

      if (e.kind === 2) {
        // neutral healing flower — pooled like projectiles, .glb-upgraded
        // like champions (model doc keyed by es.key = "prop.flower")
        let view = this.flowers.get(e.id);
        if (!view) {
          view = this.flowerPool.pop() ?? new FlowerView(this.scene);
          view.activate(e.id);
          this.flowers.set(e.id, view);
        }
        if (args.loadModels !== false && !view.upgradeAttempted) {
          view.tryUpgradeToGlb(this.assets, this.content.modelDocFor?.(e.key) ?? null);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        view.setAlive(e.alive);
        view.update(args.nowMs);
        this.lastPos.set(e.id, { x: pose.x, z: pose.z });
        continue;
      }

      if (e.kind === 3) {
        // revive circle — pooled, fully procedural (no model doc). Progress /
        // lifetime / contest all come off the wire; the view only paints them.
        const rv = e.revive;
        let view = this.reviveCircles.get(e.id);
        if (!view) {
          view = this.revivePool.pop() ?? new ReviveCircleView(this.scene);
          view.activate(e.id, e.teamId, rv?.radius ?? 2);
          this.reviveCircles.set(e.id, view);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        view.update(args.nowMs, {
          progress: rv?.progress ?? 0,
          lifeLeft: rv?.lifeLeft ?? 1,
          channelling: rv?.channelling ?? false,
          contested: rv?.contested ?? false,
        });
        this.lastPos.set(e.id, { x: pose.x, z: pose.z });
        continue;
      }

      let view = this.champions.get(e.id);
      if (!view) {
        view = new ChampionView(this.scene, e.id, e.key, e.teamId);
        this.champions.set(e.id, view);
      }
      // idempotent: no-ops once started or while no model doc is available.
      // A per-champion override (task #77) preserves the map's declared model
      // (glbPath/clipMap) over the shared stand-in doc; its `relativeScale`
      // (task #150) is threaded through as the intentional size multiplier on top
      // of ChampionView's height-normalization, before the glb is adopted.
      if (args.loadModels !== false && !view.upgradeAttempted) {
        const override = this.content.modelOverrideFor?.(e);
        const baseDoc = this.content.modelDocFor?.(e.key, e.seatId) ?? null;
        const doc = applyModelOverride(baseDoc, override);
        view.tryUpgradeToGlb(this.assets, doc, relativeScaleOf(override));
      }
      this.applyTint(e, view);
      const pose = args.poseFor(e);
      view.setPose(pose.x, pose.z, pose.fx, pose.fz);

      // draw-distance cull: hide champions beyond the configured radius
      if (args.cull) {
        const dx = pose.x - args.cull.cx;
        const dz = pose.z - args.cull.cz;
        const hidden = dx * dx + dz * dz > args.cull.maxDistance * args.cull.maxDistance;
        if (this.culled.get(e.id) !== hidden) {
          view.root.setEnabled(!hidden);
          this.culled.set(e.id, hidden);
        }
        if (hidden) continue; // skip anim work for culled champions
      } else if (this.culled.get(e.id)) {
        view.root.setEnabled(true);
        this.culled.set(e.id, false);
      }

      // authoritative anim inputs: alive flag + observed movement
      const last = this.lastPos.get(e.id);
      const distSq = last
        ? (pose.x - last.x) * (pose.x - last.x) + (pose.z - last.z) * (pose.z - last.z)
        : 0;
      // A relocation (spawn/respawn/zone change/blink) is not locomotion: the
      // pose seam SNAPS across it by design, so feeding that one-frame jump
      // into the run-rate EMA would fire off a phantom sprint. Ignore the frame
      // for animation purposes and resync from the new position next frame.
      const teleported = distSq > TELEPORT_STEP_UNITS * TELEPORT_STEP_UNITS;
      const moving = last && !teleported ? distSq > 1e-6 * args.dtMs : false;
      // smoothed ground speed (u/s) → run-clip rate sync (foot-slide fix)
      const instSpeed =
        last && !teleported ? (Math.sqrt(distSq) / Math.max(args.dtMs, 1)) * 1000 : 0;
      const prevSpeed = this.speedEma.get(e.id) ?? instSpeed;
      const speed = prevSpeed + (instSpeed - prevSpeed) * SPEED_SMOOTH;
      this.speedEma.set(e.id, speed);
      this.lastPos.set(e.id, { x: pose.x, z: pose.z });
      const state = view.anim.update({ alive: e.alive, moving }, args.nowMs);
      view.update(state, args.nowMs, args.dtMs, speed);
    }

    // removals
    for (const [id, view] of this.champions) {
      if (!seen.has(id)) {
        // hand the shared source materials back BEFORE the view goes away:
        // ChampionView.dispose() only frees the materials it created itself, so
        // an unreleased tint clone would leak and leave the cached .glb
        // material swapped out of the meshes that still need it.
        if (this.tinted.get(id)?.tint) releaseModelTint(view.root);
        view.dispose();
        this.champions.delete(id);
        this.lastPos.delete(id);
        this.speedEma.delete(id);
        this.culled.delete(id);
        this.tinted.delete(id);
      }
    }
    for (const [id, view] of this.projectiles) {
      if (!seen.has(id)) {
        view.deactivate();
        this.projectiles.delete(id);
        this.pool.push(view);
      }
    }
    for (const [id, view] of this.flowers) {
      if (!seen.has(id)) {
        view.deactivate();
        this.flowers.delete(id);
        this.lastPos.delete(id);
        this.flowerPool.push(view);
      }
    }
    for (const [id, view] of this.reviveCircles) {
      if (!seen.has(id)) {
        view.deactivate();
        this.reviveCircles.delete(id);
        this.lastPos.delete(id);
        this.revivePool.push(view);
      }
    }
  }

  dispose(): void {
    for (const [id, v] of this.champions) {
      if (this.tinted.get(id)?.tint) releaseModelTint(v.root);
    }
    this.tinted.clear();
    for (const v of this.champions.values()) v.dispose();
    for (const v of this.projectiles.values()) v.dispose();
    for (const v of this.pool) v.dispose();
    for (const v of this.flowers.values()) v.dispose();
    for (const v of this.flowerPool) v.dispose();
    for (const v of this.reviveCircles.values()) v.dispose();
    for (const v of this.revivePool) v.dispose();
    this.champions.clear();
    this.projectiles.clear();
    this.pool.length = 0;
    this.flowers.clear();
    this.flowerPool.length = 0;
    this.reviveCircles.clear();
    this.revivePool.length = 0;
  }
}
