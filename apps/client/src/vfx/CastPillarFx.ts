/**
 * CastPillarFx — the Babylon shell for the cast telegraph light pillar.
 *
 * A vertical column of light erupts around ANY champion that begins a cast and
 * lives exactly as long as the authoritative cast window does:
 *
 *     sim  abilitySystem.ts  →  castBegin {caster, ticks, castTimeSec}
 *     sim  CastResolveSystem →  castEnd    (resolved: release flash)
 *                            →  castInterrupt (stun/knockdown/death: snuffed)
 *
 * Those three events are already fanned out to EVERY client by MatchRoom (the
 * same stream the overhead cast bar rides), so the pillar appears for every
 * champion on the field, not just the local player — the whole point is that
 * the VICTIM sees it. Nothing here starts a timer of its own: `begin` is given
 * the real window, and the release/extinguish tails are the only fixed-length
 * beats, because they are reactions to an event rather than a prediction of one.
 *
 * COST. This now fires on every ability cast in the game rather than on the ten
 * abilities that happened to have a cast time, so it is built to allocate
 * NOTHING per cast after warm-up:
 *   · MAX_PILLARS slots, each owning its three meshes + three materials for the
 *     life of the scene. A cast re-enables a slot; it never builds one. Beyond
 *     the cap the slot whose cast is CLOSEST TO DONE is recycled (it is about
 *     to release anyway) rather than the newest, whose telegraph nobody has
 *     read yet.
 *   · three textures per instance, shared by every slot.
 *   · the rising motes ride the ordinary pooled `BurstPool`, keyed by element,
 *     so 12 casters of the same element share pooled systems.
 *   · per-frame work is one transform + three alpha writes per live pillar and
 *     no allocation at all (`Color3.set` / `Vector3.set`, never `new`).
 *
 * All curve/palette/crowding math is the pure `castPillar` module; this file
 * only owns Babylon lifetime.
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { BurstPool, type PresetSystemOptions } from "./vfxPresets";
// ⏱ GH#569 —— 上升餘燼的**生成窗口**是後台可調的（見 `moteEmitOpen`）。
import { castMoteEmitShare } from "./vfxCleanupPolicy";
import {
  CORE_RADIUS,
  EXTINGUISH_MS,
  GROUND_RADIUS,
  MAX_PILLARS,
  MOTE_PERIOD_MS,
  MOTE_COUNT,
  RELEASE_MS,
  SHELL_RADIUS,
  SHELL_TOP_TAPER,
  crowdAlphaScale,
  moteSpec,
  motePoolKey,
  motesPerPulse,
  moteEmitOpen,
  pillarShape,
  type PillarPalette,
  type PillarPhase,
} from "./castPillar";
import {
  BEAM_DEFAULT_HEADROOM,
  beamKnotHeight,
  beamRiseProfile,
  beamVerdict,
  castBeamPlan,
  type BeamVerdict,
} from "./castBeam";

/** Cylinder sides. 20 reads round at arena zoom; 16×3×MAX_PILLARS stays cheap. */
const SIDES = 20;
/** Angular flame licks baked into the shell's vertex alpha (0 = smooth core). */
const SHELL_FLUTES = 4;

/** Ground flare sits just above the floor, under the blob shadow's decal band. */
const GROUND_Y = 0.045;

/**
 * Emit cadence of the #233 descending impact knot. Faster than the rising
 * motes (150 ms) because the knot has to read as ONE object moving rather than
 * as a sequence of separate puffs — at 150 ms on a 0.6 s cast you would see
 * four unrelated sparks, not a countdown.
 */
const KNOT_PERIOD_MS = 70;
/** Particle budget of one knot pulse, relative to a mote pulse. */
const KNOT_SCALE = 3;

const GROUND_TEXTURE = "assets/textures/particles/magic_05.png";
/** Soft glow sheet the two shafts are masked with (shape only — see material). */
const SHAFT_TEXTURE = "assets/textures/particles/light_03.png";

/** Alpha below which a mesh is simply disabled (a 0.4% column is not a light). */
const ALPHA_EPS = 0.004;

/**
 * Bake the FF7 vertical gradient into the shaft as VERTEX ALPHA: blazing at the
 * caster's feet, dissipating toward the top.
 *
 * Measured, not guessed. The first cut used a uniform material alpha and the
 * ASCII framebuffer dump of the audition page came back BRIGHTEST AT THE TOP
 * with a nearly dark base — the column read as a floating tube rather than as
 * something erupting out of the ground. A per-vertex ramp is the cheapest fix
 * that keeps one draw call: additive blending is (SRC_ALPHA, ONE), so vertex
 * alpha directly scales how much light each band contributes.
 */
function bakeRiseGradient(mesh: Mesh, flutes: number): Float32Array {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!pos) return new Float32Array(0);
  const n = pos.length / 3;
  const ramp = new Float32Array(n);
  const colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3] as number;
    const y = pos[i * 3 + 1] as number;
    const z = pos[i * 3 + 2] as number;
    // the unit cylinder is centred on its origin: y runs -0.5 (foot) → +0.5
    const t = Math.max(0, Math.min(1, y + 0.5));
    // TASK #233: the profile now carries a TIP FLARE as well as the falloff, so
    // the column terminates in something instead of dissolving into the sky.
    // A beam the eye cannot find the end of does not read as reaching upward —
    // and now that the height is framed (see castBeamPlan) the tip is on screen
    // to be found.
    const rise = beamRiseProfile(t);
    // FLAME LICKS without a texture: a gentle angular ripple so the shaft reads
    // as fluted fire rather than a glass pipe. Deterministic (no rng anywhere
    // near the render loop) and free — it is baked once into the vertex buffer.
    const lick = flutes > 0 ? 0.78 + 0.22 * Math.sin(Math.atan2(z, x) * flutes) : 1;
    ramp[i] = rise * lick;
    colors[i * 4] = 1;
    colors[i * 4 + 1] = 1;
    colors[i * 4 + 2] = 1;
    colors[i * 4 + 3] = ramp[i] as number;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, true);
  mesh.hasVertexAlpha = true;
  return ramp;
}

/**
 * Re-tint a shaft's baked gradient to `rgb`.
 *
 * THE ELEMENT LIVES IN THE VERTEX COLOUR, not in `emissiveColor`, and that is
 * forced by Babylon, not preference: StandardMaterial REPLACES `emissiveColor`
 * with the emissive texture's rgb whenever one is bound, which made every
 * element render the same grey ([97,97,93] measured for fire / ice / void /
 * nature / holy alike on the audition page). Vertex colour multiplies the final
 * diffuse AFTER that substitution, so it is the one channel the texture cannot
 * eat. The buffer is preallocated per mesh and updated in place — a re-tint
 * allocates nothing.
 */
function tintGradient(
  mesh: Mesh,
  ramp: Float32Array,
  buf: Float32Array,
  rgb: readonly [number, number, number],
): void {
  for (let i = 0; i < ramp.length; i++) {
    buf[i * 4] = rgb[0];
    buf[i * 4 + 1] = rgb[1];
    buf[i * 4 + 2] = rgb[2];
    buf[i * 4 + 3] = ramp[i] as number;
  }
  mesh.updateVerticesData(VertexBuffer.ColorKind, buf);
}

export interface CastPillarDeps {
  /** rendered position of an entity (view space), or null if unknown */
  entityPos(id: number): { x: number; z: number } | null;
  /**
   * TASK #233. Vertical budget above a ground point through the camera that is
   * actually presenting, in world units — `render/effectFraming.verticalHeadroom`.
   *
   * Without it the column is a CONSTANT 6.4 u tall, and measured over the
   * ground positions the shipped combat camera can see, a 6.4 u column fits
   * inside the frame at 6% of them. The other 94% announce themselves off the
   * top of the screen. Optional so a NullEngine test can leave it out, but the
   * production wiring always supplies it (see VfxSystem).
   */
  headroomAt?(x: number, z: number): number | null;
}

export interface CastPillarOptions extends PresetSystemOptions {
  /** quality-tier particle budget multiplier for the motes (default 1) */
  getScale?: () => number;
}

interface Slot {
  pivot: TransformNode;
  shell: Mesh;
  core: Mesh;
  ground: Mesh;
  /** baked vertical ramp per vertex + a reusable rgba scratch, per shaft */
  shellRamp: Float32Array;
  coreRamp: Float32Array;
  shellBuf: Float32Array;
  coreBuf: Float32Array;
  shellMat: StandardMaterial;
  coreMat: StandardMaterial;
  groundMat: StandardMaterial;
  /** -1 when idle */
  entityId: number;
  phase: PillarPhase;
  /** ms the current PHASE started */
  phaseStartMs: number;
  /** length of the cast window (ms); the release/extinguish tails use their own */
  durationMs: number;
  palette: PillarPalette;
  moteKey: string;
  nextMoteMs: number;
  /** next frame the descending impact knot may emit (task #233) */
  nextKnotMs: number;
  /** whether this cast leaves a human ANY reaction time (task #233) */
  verdict: BeamVerdict;
  x: number;
  z: number;
  active: boolean;
}

export class CastPillarFx {
  private readonly slots: Slot[] = [];
  private readonly byEntity = new Map<number, Slot>();
  private readonly motes: BurstPool;
  private readonly getScale: () => number;
  private groundTex: BaseTexture | null = null;
  private shaftTex: BaseTexture | null = null;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly deps: CastPillarDeps,
    private readonly opts: CastPillarOptions = {},
  ) {
    this.getScale = opts.getScale ?? ((): number => 1);
    // one pooled system per element is plenty: Babylon simulates particles in
    // WORLD space, so a pulse keeps the position it was born at even after the
    // emitter is re-pointed at the next caster of the same element.
    this.motes = new BurstPool(scene, { ...opts, maxPerKey: 3 });
  }

  /** Pillars currently burning (test/observability seam). */
  get activeCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }

  /** Slots ever built — the allocation high-water mark (test seam). */
  get slotCount(): number {
    return this.slots.length;
  }

  /** True while `entityId` has a live column (test seam). */
  has(entityId: number): boolean {
    return this.byEntity.get(entityId)?.active === true;
  }

  /** Live per-frame alpha of an entity's shell (test seam). */
  shellAlphaOf(entityId: number): number | null {
    const s = this.byEntity.get(entityId);
    return s && s.active ? s.shellMat.alpha : null;
  }

  /** The phase an entity's column is in (test seam). */
  phaseOf(entityId: number): PillarPhase | null {
    const s = this.byEntity.get(entityId);
    return s && s.active ? s.phase : null;
  }

  /** Pooled mote systems held for a palette (test seam). */
  motesFor(palette: PillarPalette): number {
    return this.motes.countFor(motePoolKey(palette));
  }

  /**
   * A cast STARTED. `durationMs` is the sim's own window (castTimeSec, or the
   * tick count × TICK_MS) — never a constant chosen here.
   */
  begin(entityId: number, durationMs: number, palette: PillarPalette, nowMs: number): void {
    if (this.disposed || !Number.isFinite(durationMs) || durationMs <= 0) return;
    const pos = this.deps.entityPos(entityId);
    // FIX #131 discipline: never place an additive emitter at a non-finite
    // position — the GPU clamps it to a screen corner and it sticks there.
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const slot = this.acquire(entityId, nowMs);
    slot.entityId = entityId;
    slot.phase = "cast";
    slot.phaseStartMs = nowMs;
    slot.durationMs = durationMs;
    slot.palette = palette;
    slot.moteKey = motePoolKey(palette);
    slot.nextMoteMs = nowMs;
    slot.nextKnotMs = nowMs;
    // TASK #233: does this cast leave a human any reaction time at all? The
    // descending impact knot is only drawn when the answer is yes — see
    // castBeam.beamKnotHeight for why counting down to an unavoidable hit is
    // the one thing a telegraph must never do.
    slot.verdict = beamVerdict(durationMs);
    slot.x = pos.x;
    slot.z = pos.z;
    slot.active = true;
    // BELT AND BRACES on the element tint. Babylon substitutes the emissive
    // TEXTURE's rgb for `emissiveColor` when one is bound, so the colour is
    // written into BOTH channels: `emissiveColor` (used when the substitution
    // does not apply) and the vertex colours (which multiply the final diffuse
    // afterwards either way). Whichever path the material takes, the column is
    // the ability's element and never a colourless grey.
    tintGradient(slot.core, slot.coreRamp, slot.coreBuf, palette.core);
    tintGradient(slot.shell, slot.shellRamp, slot.shellBuf, palette.fringe);
    slot.coreMat.emissiveColor.set(palette.core[0], palette.core[1], palette.core[2]);
    slot.shellMat.emissiveColor.set(palette.fringe[0], palette.fringe[1], palette.fringe[2]);
    slot.groundMat.emissiveColor.set(palette.fringe[0], palette.fringe[1], palette.fringe[2]);
    this.byEntity.set(entityId, slot);
    slot.pivot.setEnabled(true);
    this.applyFrame(slot, nowMs, this.activeCount);
  }

  /** The cast RESOLVED (castEnd): a short outward release flash. */
  finish(entityId: number, nowMs: number): void {
    this.transition(entityId, "release", nowMs);
  }

  /** The cast was INTERRUPTED (castInterrupt / death): snuff it, no flash. */
  interrupt(entityId: number, nowMs: number): void {
    this.transition(entityId, "extinguish", nowMs);
  }

  private transition(entityId: number, phase: PillarPhase, nowMs: number): void {
    const slot = this.byEntity.get(entityId);
    if (!slot || !slot.active || slot.phase !== "cast") return;
    slot.phase = phase;
    slot.phaseStartMs = nowMs;
  }

  /** Advance every column. Call once per frame. */
  update(nowMs: number): void {
    if (this.disposed) return;
    const active = this.activeCount;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      // follow the caster (rooted casts barely move, but a dash-cast would)
      const pos = this.deps.entityPos(slot.entityId);
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
        slot.x = pos.x;
        slot.z = pos.z;
      }
      this.applyFrame(slot, nowMs, active);
    }
    this.motes.update(nowMs);
  }

  /** Kill every column immediately (round end / teardown). */
  clear(): void {
    for (const slot of this.slots) this.release(slot);
    this.byEntity.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      slot.shellMat.dispose();
      slot.coreMat.dispose();
      slot.groundMat.dispose();
      slot.shell.dispose(false, true);
      slot.core.dispose(false, true);
      slot.ground.dispose(false, true);
      slot.pivot.dispose();
    }
    this.slots.length = 0;
    this.byEntity.clear();
    this.motes.dispose();
    this.groundTex?.dispose();
    this.shaftTex?.dispose();
    this.groundTex = this.shaftTex = null;
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  /** Progress 0..1 through the slot's current phase. */
  private progress(slot: Slot, nowMs: number): number {
    const span =
      slot.phase === "cast" ? slot.durationMs : slot.phase === "release" ? RELEASE_MS : EXTINGUISH_MS;
    return (nowMs - slot.phaseStartMs) / Math.max(1, span);
  }

  /**
   * Write one frame of the column. Also owns the two things that end a pillar:
   * the release/extinguish tail running out, and a cast window that OVERRAN its
   * castEnd (a dropped event must not leave a column burning forever — the same
   * safety net CastTracker's grace window gives the cast bar).
   */
  private applyFrame(slot: Slot, nowMs: number, active: number): void {
    const u = this.progress(slot, nowMs);
    if (slot.phase !== "cast" && u >= 1) {
      this.release(slot);
      return;
    }
    if (slot.phase === "cast" && u >= 1 + RELEASE_MS / Math.max(1, slot.durationMs)) {
      // castEnd never arrived — fail closed rather than burn forever
      this.release(slot);
      return;
    }
    const shape = pillarShape(slot.phase, u);
    const crowd = crowdAlphaScale(active);
    // TASK #233 — the beam is as tall as the FRAME allows, not as tall as a
    // constant says. `PILLAR_HEIGHT` is now only the authoring reference the
    // plan is clamped against (see castBeam).
    const plan = castBeamPlan({
      headroom: this.deps.headroomAt?.(slot.x, slot.z) ?? BEAM_DEFAULT_HEADROOM,
    });
    const h = Math.max(0.001, shape.height) * plan.height;
    const r = Math.max(0.001, shape.radius);

    slot.pivot.position.set(slot.x, 0, slot.z);
    slot.shell.scaling.set(SHELL_RADIUS * 2 * r, h, SHELL_RADIUS * 2 * r);
    slot.shell.position.y = h / 2;
    slot.core.scaling.set(CORE_RADIUS * 2 * r, h * 0.94, CORE_RADIUS * 2 * r);
    slot.core.position.y = (h * 0.94) / 2;
    const gd = GROUND_RADIUS * 2 * r;
    slot.ground.scaling.set(gd, gd, 1);

    // CLAMPED, and not merely for tidiness: the release flash overshoots past
    // 1, and `StandardMaterial.needAlphaBlending()` tests `alpha < 1` — an
    // un-clamped 1.13 can drop a shaft out of the transparent pass for the one
    // frame that matters most and render it as an opaque tube over the caster.
    // A caster pinned against the edge of the frame has no room for a column at
    // all; drawing half of one there is noise, not information, so the ground
    // flare (which sits on the caster's own framed feet) carries the telegraph
    // alone until they move back into view.
    const shellA = plan.degraded ? 0 : Math.min(1, shape.shellAlpha * crowd);
    const coreA = plan.degraded ? 0 : Math.min(1, shape.coreAlpha * crowd);
    const groundA = Math.min(1, shape.groundAlpha * crowd);
    slot.shellMat.alpha = shellA;
    slot.coreMat.alpha = coreA;
    slot.groundMat.alpha = groundA;
    slot.shell.setEnabled(shellA > ALPHA_EPS);
    slot.core.setEnabled(coreA > ALPHA_EPS);
    slot.ground.setEnabled(groundA > ALPHA_EPS);

    // rising motes: only while the cast is still charging — the release has its
    // own flash and an interrupt must go quiet immediately.
    //
    // ⏱ GH#569 —— …AND only inside the backstage emission window
    // (`config.vfx-cleanup@1.castMoteEmitShare`, shipped 0.5). owner
    // 2026-08-23:「紅色粒子飄上天時間都要減半以上」。The mote LIFETIME is
    // already 0.175–0.35 s (GH#494); what ran long is the WINDOW — a 2 s cast
    // kept topping the embers up for all 2 s. See `moteEmitOpen`.
    if (slot.phase === "cast" && moteEmitOpen(u, castMoteEmitShare()) && nowMs >= slot.nextMoteMs) {
      slot.nextMoteMs = nowMs + MOTE_PERIOD_MS;
      const scale = (this.getScale() * motesPerPulse(active, 1)) / MOTE_COUNT;
      this.motes.fireAt(slot.moteKey, moteSpec(slot.palette), slot.x, slot.z, 0.15, nowMs, scale);
    }

    // TASK #233 — THE DESCENDING IMPACT KNOT. A bright cluster falls down the
    // beam and touches the floor on the frame the ability resolves, so the
    // telegraph says HOW LONG rather than only THAT. It rides the same pooled
    // mote systems (a separate key so the two never steal each other's
    // instances) and is skipped entirely for a cast nobody can react to.
    if (slot.phase === "cast" && !plan.degraded && nowMs >= slot.nextKnotMs) {
      const knot = beamKnotHeight(u, slot.verdict);
      if (knot !== null) {
        slot.nextKnotMs = nowMs + KNOT_PERIOD_MS;
        const scale = (this.getScale() * KNOT_SCALE) / MOTE_COUNT;
        this.motes.fireAt(
          `${slot.moteKey}/knot`,
          moteSpec(slot.palette),
          slot.x,
          slot.z,
          Math.max(0.05, knot * h),
          nowMs,
          scale,
        );
      }
    }
  }

  /** Put a slot back in the idle pool (meshes are kept, never disposed). */
  private release(slot: Slot): void {
    if (slot.entityId >= 0 && this.byEntity.get(slot.entityId) === slot) {
      this.byEntity.delete(slot.entityId);
    }
    slot.active = false;
    slot.entityId = -1;
    slot.pivot.setEnabled(false);
  }

  /**
   * A slot for this caster: its own live one (a recast restarts in place), then
   * an idle one, then a new one up to MAX_PILLARS, and finally the live column
   * CLOSEST TO FINISHING — recycling a cast that is about to pay off costs the
   * least information, where stealing the newest would erase a telegraph the
   * victim has not even seen yet.
   */
  private acquire(entityId: number, nowMs: number): Slot {
    const own = this.byEntity.get(entityId);
    if (own) return own;
    for (const s of this.slots) if (!s.active) return s;
    if (this.slots.length < MAX_PILLARS) return this.build();
    let best = this.slots[0]!;
    let bestU = -Infinity;
    for (const s of this.slots) {
      const u = this.progress(s, nowMs);
      if (u > bestU) {
        bestU = u;
        best = s;
      }
    }
    this.release(best);
    return best;
  }

  private texture(path: string, uScale: number): BaseTexture | null {
    const url = (this.opts.resolveTextureUrl ?? ((p: string): string => "/content/" + p))(path);
    const make =
      this.opts.createTexture ?? ((u: string, s: Scene): BaseTexture => new Texture(u, s));
    const tex = make(url, this.scene);
    if (tex && "wrapU" in tex) {
      const t = tex as Texture;
      t.hasAlpha = true;
      t.wrapU = Texture.WRAP_ADDRESSMODE;
      t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.uScale = uScale;
    }
    return tex;
  }

  /** The shared shaft mask (built once, reused by every slot). */
  private shaftTexture(): BaseTexture | null {
    if (!this.shaftTex) this.shaftTex = this.texture(SHAFT_TEXTURE, 1);
    return this.shaftTex;
  }

  private material(name: string, tex: BaseTexture | null): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(1, 1, 1);
    // ADDITIVE: light accumulates, so the caster is never HIDDEN by the column
    // — a victim must always be able to read WHO is casting, and an opaque
    // shell around a champion would take that away.
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.alpha = 0;
    // THE TEXTURE IS A MASK, NEVER A COLOUR — and this is not a style choice.
    // Babylon's StandardMaterial REPLACES `emissiveColor` with the emissive
    // texture's rgb when one is bound (the shader takes `vEmissiveInfos.y` as a
    // level, not a tint), so binding the flame sheet as `emissiveTexture` threw
    // the element away and every column rendered the same grey. Measured on the
    // audition page: the pillar's isolated pixel contribution was [97,97,93] for
    // fire, ice, void, nature and holy alike — 依文潔琳's ice erupting as
    // colourless fire, the exact defect this feature exists to avoid. Binding it
    // as `opacityTexture` only keeps the SHAPE and lets `emissiveColor` carry
    // the element, which is what ALPHA_ADD then scales.
    // TEXTURE ONLY WHERE IT CANNOT EAT THE ELEMENT. Measured on the audition
    // page, isolating the pillar's own pixel contribution:
    //   · `emissiveTexture` → Babylon's StandardMaterial REPLACES emissiveColor
    //     with the texture's rgb, so fire / ice / void / nature / holy all came
    //     back as the same grey [97,97,93]. 依文潔琳's ice erupting colourless
    //     is the exact defect this feature exists to avoid.
    //   · `opacityTexture` or `diffuseTexture` + useAlphaFromDiffuseTexture →
    //     the flame sheet's alpha zeroes the shaft: 0 changed pixels.
    // So the two SHAFTS carry no texture at all — their shape is the baked
    // vertex ramp + angular flutes, their colour is `emissiveColor`, and that
    // is the only combination that renders AND stays element-coloured. The
    // ground flare keeps its rune texture: it is a shape, not an identity.
    if (tex) {
      mat.emissiveTexture = tex;
      mat.opacityTexture = tex;
    }
    return mat;
  }

  private build(): Slot {
    const scene = this.scene;
    const ramps = new Map<Mesh, Float32Array>();
    if (!this.groundTex) this.groundTex = this.texture(GROUND_TEXTURE, 1);

    const pivot = new TransformNode("cast-pillar", scene);
    pivot.setEnabled(false);

    // unit cylinders (height 1, diameter 1) — every cast only rescales them
    const column = (name: string, top: number, flutes: number): Mesh => {
      const m = MeshBuilder.CreateCylinder(
        name,
        {
          height: 1,
          diameterTop: top,
          diameterBottom: 1,
          tessellation: SIDES,
          cap: 0, // Mesh.NO_CAP — an open shaft, never a lid
          sideOrientation: 2, // Mesh.DOUBLESIDE
        },
        scene,
      );
      m.isPickable = false;
      m.parent = pivot;
      ramps.set(m, bakeRiseGradient(m, flutes));
      return m;
    };
    const rampOf = (m: Mesh): Float32Array => ramps.get(m) ?? new Float32Array(0);
    const shell = column("cast-pillar-shell", SHELL_TOP_TAPER, SHELL_FLUTES);
    const core = column("cast-pillar-core", 0.85, 0);
    const shellRamp = rampOf(shell);
    const coreRamp = rampOf(core);
    const ground = MeshBuilder.CreatePlane(
      "cast-pillar-base",
      { size: 1, sideOrientation: 2 },
      scene,
    );
    ground.rotation.x = Math.PI / 2;
    ground.position.y = GROUND_Y;
    ground.isPickable = false;
    ground.parent = pivot;

    const shellMat = this.material("cast-pillar-shell-mat", this.shaftTexture());
    const coreMat = this.material("cast-pillar-core-mat", this.shaftTexture());
    const groundMat = this.material("cast-pillar-base-mat", this.groundTex);
    shell.material = shellMat;
    core.material = coreMat;
    ground.material = groundMat;

    const slot: Slot = {
      pivot,
      shell,
      core,
      ground,
      shellRamp,
      coreRamp,
      shellBuf: new Float32Array(shellRamp.length * 4),
      coreBuf: new Float32Array(coreRamp.length * 4),
      shellMat,
      coreMat,
      groundMat,
      entityId: -1,
      phase: "cast",
      phaseStartMs: 0,
      durationMs: 1,
      palette: { core: [1, 1, 1], fringe: [1, 1, 1], element: null },
      moteKey: "castpillar/default",
      nextMoteMs: 0,
      nextKnotMs: 0,
      verdict: "notice",
      x: 0,
      z: 0,
      active: false,
    };
    this.slots.push(slot);
    return slot;
  }
}
