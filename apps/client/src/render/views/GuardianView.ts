/**
 * GuardianView — pooled view for the NEUTRAL duel-zone GUARDIAN (task #89/#105,
 * EntityState.kind 4). Mirrors FlowerView's pooling contract (activate /
 * deactivate, registry-owned free-list) and its .glb-upgrade seam.
 *
 * The guardian's identity is PER-ARENA (#105): its `key` on the wire is one of
 * `prop.guardian` (石頭人 stone), `prop.guardian.beast` (巨獸人) or
 * `prop.guardian.treant` (樹人), each pointing at a distinct .glb. So the READABLE
 * element here is the MODEL, not a procedural stand-in — which is the whole
 * point of the task: a correctly-scaled, arena-appropriate objective instead of
 * the grey untinted humanoid the old kind-0 fall-through produced.
 *
 * Until the .glb resolves (async), a neutral procedural MONOLITH stands in — a
 * chunky faceted stone pillar, deliberately NOT a humanoid, on a warm bronze
 * ground ring — so the objective reads from frame one and never as a player.
 * When the model loads it is height-normalized to a fixed large size (so stone /
 * beast / treant all read at a consistent "big objective" scale regardless of
 * their native mesh height), grounded on the floor, and the stand-in body is
 * hidden; the ground ring stays as the neutral-objective marker. NO team tint is
 * ever applied — neutrality is the contract.
 *
 * The over-head HP bar is owned externally (overheadAnchors → frameBus →
 * WorldAnchorLayer) with the neutral GUARDIAN_BAR_COLOR at y≈3.5; nothing here
 * draws it. Damage flashes / AoE telegraphs / last-hit cues are VfxSystem's.
 */
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { ModelDoc } from "@ggd/shared/content";
import type { AssetManager } from "../AssetManager";
import { ClipAnimator } from "../ClipAnimator";

/** Target rendered height (world units) so every face reads as one big objective. */
const TARGET_HEIGHT = 3.2;
/** Below this native height a glb is treated as degenerate → use doc.scale. */
const MIN_NATIVE_HEIGHT = 0.05;

/** Neutral stone palette for the procedural stand-in (never a team colour). */
const STONE_BODY: [number, number, number] = [0.55, 0.5, 0.44];
const STONE_TOP: [number, number, number] = [0.72, 0.66, 0.55];
/** Warm bronze ground ring — matches overheadAnchors.GUARDIAN_BAR_COLOR. */
const RING_TINT: [number, number, number] = [0.79, 0.6, 0.36];

/** Idle bob (rad/ms, world units) — a slow "alive but rooted" breath. */
const BOB_AMPLITUDE = 0.08;
const BOB_SPEED = 0.0013;
const RING_SPIN = 0.0004;

function emissiveMat(name: string, scene: Scene, rgb: [number, number, number], alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(rgb[0] * 0.6, rgb[1] * 0.6, rgb[2] * 0.6);
  m.emissiveColor = new Color3(rgb[0], rgb[1], rgb[2]);
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  m.alpha = alpha;
  return m;
}

export class GuardianView {
  readonly root: TransformNode;
  private readonly body: TransformNode;
  private readonly parts: Mesh[] = [];
  private readonly ring: Mesh;
  private glbRoot: TransformNode | null = null;
  /**
   * Drives the adopted .glb's AnimationGroups (task #61). NULL for the two
   * guardians whose meshes genuinely carry no clips (stone / treant are static
   * by design); non-null for 巨獸人, whose glb ships six real
   * `Armature|Triceratops_*` clips that nothing was ever playing — a live
   * combat objective rendered as a frozen statue for every round.
   */
  private clipAnimator: ClipAnimator | null = null;
  /**
   * The grounding shift the adopted .glb needs so its lowest vertex sits on the
   * arena floor. `update()` writes `position.y` every frame for the idle bob, so
   * the shift has to be RE-ADDED there — before this it was applied once in
   * `tryUpgradeToGlb` and then overwritten on the very next frame, i.e. a
   * guardian whose rig does not happen to bake its feet at local y=0 floated or
   * sank as soon as the bob started.
   */
  private groundY = 0;
  private upgradeStarted = false;
  private disposed = false;
  private active = false;
  private alive = true;
  private phase = 0;

  constructor(scene: Scene) {
    this.root = new TransformNode("guardian", scene);
    // ── procedural stand-in monolith (chunky faceted stone, NOT humanoid) ──
    this.body = new TransformNode("guardian-body", scene);
    this.body.parent = this.root;
    const bodyMat = emissiveMat("guardian-stone", scene, STONE_BODY);
    // wide base drum
    const base = MeshBuilder.CreateCylinder("guardian-base", { diameterTop: 1.5, diameterBottom: 2.0, height: 1.1, tessellation: 8 }, scene);
    base.material = bodyMat;
    base.parent = this.body;
    base.position.y = 0.55;
    base.isPickable = false;
    this.parts.push(base);
    // tapered upper column
    const column = MeshBuilder.CreateCylinder("guardian-col", { diameterTop: 0.7, diameterBottom: 1.4, height: 2.0, tessellation: 8 }, scene);
    column.material = bodyMat;
    column.parent = this.body;
    column.position.y = 2.0;
    column.isPickable = false;
    this.parts.push(column);
    // glowing crown cap (the "eye"/core — reads as an animate objective)
    const cap = MeshBuilder.CreatePolyhedron("guardian-cap", { type: 1, size: 0.5 }, scene);
    cap.material = emissiveMat("guardian-core", scene, STONE_TOP);
    cap.parent = this.body;
    cap.position.y = 3.2;
    cap.isPickable = false;
    this.parts.push(cap);

    // ── neutral bronze ground ring (kept even after the glb adopts) ──
    this.ring = MeshBuilder.CreateTorus("guardian-ring", { diameter: 3.6, thickness: 0.16, tessellation: 40 }, scene);
    this.ring.material = emissiveMat("guardian-ring", scene, RING_TINT, 0.75);
    this.ring.parent = this.root;
    this.ring.position.y = 0.06;
    this.ring.isPickable = false;

    this.root.setEnabled(false);
  }

  get upgradeAttempted(): boolean {
    return this.upgradeStarted;
  }

  get hasGlb(): boolean {
    return this.glbRoot !== null;
  }

  activate(entityId: number): void {
    this.active = true;
    this.alive = true;
    this.phase = (entityId % 19) * 0.33 * Math.PI;
    this.setVisible(true);
  }

  deactivate(): void {
    this.active = false;
    this.setVisible(false);
  }

  setPose(x: number, z: number): void {
    this.root.position.x = x;
    this.root.position.z = z;
  }

  /** A dead-but-still-replicated guardian hides (the slain vfx carries death). */
  setAlive(alive: boolean): void {
    if (alive === this.alive) return;
    this.alive = alive;
    // Play the death clip on the frame the objective falls — it is visible for
    // the one frame before `setVisible(false)` and, more importantly, leaves the
    // rig on its collapsed pose so a re-shown corpse never snaps back to idle.
    if (!alive) this.clipAnimator?.play("death");
    this.setVisible(this.active && alive);
  }

  private setVisible(on: boolean): void {
    this.root.setEnabled(on);
  }

  /** Slow idle bob + ring spin + the model's own idle clip; once per frame. */
  update(nowMs: number): void {
    const src = this.glbRoot ?? this.body;
    // The bob is the ONLY life a clip-less guardian (stone / treant) has, so it
    // stays for every face. When the model does carry clips, its own idle plays
    // on top — `play` is idempotent per frame.
    src.position.y = this.groundY + BOB_AMPLITUDE * Math.sin(nowMs * BOB_SPEED + this.phase);
    this.ring.rotation.y = nowMs * RING_SPIN + this.phase;
    if (this.alive) this.clipAnimator?.play("idle");
  }

  /**
   * Swap in the arena's guardian .glb (async), height-normalized to a fixed
   * large size and grounded, hiding the procedural stand-in body. Idempotent;
   * only the first call with a doc loads. A geometry-less / degenerate glb keeps
   * the procedural monolith (never an invisible objective).
   */
  tryUpgradeToGlb(assets: AssetManager, doc: ModelDoc | null): void {
    if (!doc || this.upgradeStarted || this.disposed) return;
    this.upgradeStarted = true;
    void assets
      .load(doc.glbPath)
      .then((container) => {
        if (!container || this.disposed || this.glbRoot) return;
        const inst = container.instantiateModelsToScene((n) => `${this.root.name}-${n}`, false, {
          doNotInstantiate: true,
        });
        const glbRoot = new TransformNode(`${this.root.name}-glb`, this.root.getScene());
        glbRoot.parent = this.root;
        glbRoot.scaling.setAll(1);
        for (const node of inst.rootNodes) node.parent = glbRoot;
        const meshes = glbRoot.getChildMeshes(false);
        if (meshes.length === 0) {
          inst.dispose();
          glbRoot.dispose(false, false);
          return; // keep the procedural monolith
        }
        for (const mesh of meshes) mesh.isPickable = false;
        // height-normalize to TARGET_HEIGHT so stone/beast/treant read alike
        glbRoot.computeWorldMatrix(true);
        const native = glbRoot.getHierarchyBoundingVectors(true);
        const nativeH = native.max.y - native.min.y;
        const scale =
          Number.isFinite(nativeH) && nativeH > MIN_NATIVE_HEIGHT ? TARGET_HEIGHT / nativeH : doc.scale;
        glbRoot.scaling.setAll(scale);
        // ground the model on the arena floor (y=0)
        glbRoot.computeWorldMatrix(true);
        const { min } = glbRoot.getHierarchyBoundingVectors(true);
        if (Number.isFinite(min.y)) {
          this.groundY = -min.y;
          glbRoot.position.y = this.groundY;
        }
        this.glbRoot = glbRoot;
        // DRIVE THE MODEL'S OWN CLIPS (task #61). guardian_beast.glb ships six
        // `Armature|Triceratops_*` clips; nothing was ever playing them, so
        // 巨獸人 stood in every duel zone as a frozen statue. `hasClips` is
        // false for the genuinely static stone/treant meshes, so they keep the
        // bob-only presentation they were designed with.
        const animator = new ClipAnimator(inst.animationGroups, doc.clipMap);
        this.clipAnimator = animator.hasClips ? animator : null;
        if (!this.clipAnimator) animator.dispose();
        // hide the stand-in body (keep the neutral ground ring)
        for (const p of this.parts) p.setEnabled(false);
        this.body.setEnabled(false);
      })
      .catch(() => {
        /* the procedural monolith stands on its own */
      });
  }

  dispose(): void {
    this.disposed = true;
    // AnimationGroups are not nodes — `root.dispose()` never touches them, and
    // the scene walks them every frame. Free them FIRST, targets still alive.
    this.clipAnimator?.dispose();
    this.clipAnimator = null;
    this.root.dispose(false, true);
  }
}
