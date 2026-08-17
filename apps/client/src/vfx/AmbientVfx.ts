/**
 * AmbientVfx — the AMBIENT vfx channel (task #30): per-model particle/ribbon
 * attachments that live while the entity lives (WC3 hero glows, smolder
 * trails, ribbon wings). Bindings come from the `ambient-vfx` config doc
 * (modelKey → [{ vfx: docId }]); each bound vfx@1 doc gets a pooled
 * ParticleSystem whose emitter is a tiny invisible Mesh parented to the doc's
 * `anchorBone` glb joint (resolved by node name under the entity's view root,
 * re-scanned while the async .glb streams in, falling back to the root), and
 * each ribbon@1 doc gets a pooled RibbonTrail on the same anchor.
 *
 * BOTH trail channels are SWING-GATED (task #37). A ribbon only lays samples
 * while its anchor bone moves fast relative to the entity root, and a shared
 * RibbonBudget caps how many are live at once. The particle emitters pinned to
 * weapon/hand bones are weapon trails too: they are retuned into the same 刀光
 * budget when built (`shapeSwingTrailDoc` — clamped lifetime, live-count-capped
 * rate, a ramp that actually reaches alpha 0) and their emit rate is folded
 * down to a faint idle ember unless the bone is genuinely being swung. So an
 * idle or walking champion draws no trail at all. Pooled trails and emitters
 * are reused across attach cycles forever — repeated swings allocate no mesh,
 * material, texture or particle system.
 *
 * API: attach(entityId, modelKey, rootNode) / detach(entityId) /
 * sweep(keepIds) / tick(nowMs, dtMs). Driven by GameApp off the PUBLIC
 * EntityViewRegistry surface — nothing under render/ is touched.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { VfxDoc, RibbonDoc } from "@ggd/shared/content";
import { particleBudgetScale } from "../render/RenderConfig";
import { qualityController } from "../render/QualityController";
import { scaledBurstCount, toParticleSystem } from "./particleFactory";
import { RibbonBudget, RibbonTrail } from "./RibbonTrail";
import { isSwingTrailDoc, shapeSwingTrailDoc, swingEmitScale } from "./swingTrailMath";

/** how often an unresolved anchor bone is re-searched (glb loads async) */
const BONE_RESCAN_MS = 500;
/** give up re-scanning after this long and stay parented to the root */
const BONE_RESCAN_MAX_MS = 15000;

export interface AmbientContentHooks {
  /** ambient bindings for a modelKey ([] when none / config not loaded) */
  bindingsFor(modelKey: string): readonly { vfx: string }[];
  vfxDocFor(id: string): VfxDoc | null;
  ribbonDocFor(id: string): RibbonDoc | null;
}

export interface AmbientVfxOptions {
  /** quality-tier particle budget multiplier (default: live quality params) */
  getScale?: () => number;
}

interface PooledEmitter {
  ps: ParticleSystem;
  emitterMesh: Mesh;
  /** quality-scaled emit rate at full swing (the swing gate scales this down) */
  baseRate: number;
}

interface AmbientItem {
  anchorBone?: string;
  boneResolved: boolean;
  nextScanMs: number;
  giveUpMs: number;
  /** particle attachment (vfx@1) */
  emitter?: PooledEmitter;
  vfxDoc?: VfxDoc;
  /** ambient burst docs re-fire on a lifetime cycle */
  nextBurstMs?: number;
  /** ribbon attachment (ribbon@1) */
  ribbon?: RibbonTrail;
  /** task #37: this emitter is a weapon trail → gate its rate on the swing */
  swingGated?: boolean;
  /** previous anchor/root positions for the relative-speed measurement */
  prevPos?: Vector3;
  prevRef?: Vector3;
}

interface Attachment {
  modelKey: string;
  root: TransformNode;
  items: AmbientItem[];
}

/** glb instantiation prefixes node names ("<entityId>-Bone_Chest"). */
function findBoneNode(root: TransformNode, bone: string): TransformNode | null {
  const nodes = root.getChildTransformNodes(false);
  for (const n of nodes) if (n.name === bone) return n;
  for (const n of nodes) if (n.name.endsWith(bone)) return n;
  return null;
}

export class AmbientVfx {
  private readonly attachments = new Map<number, Attachment>();
  /** freed particle emitters per vfx doc id (reused across attach cycles) */
  private readonly psPool = new Map<string, PooledEmitter[]>();
  /** freed ribbon trails per ribbon doc id */
  private readonly ribbonPool = new Map<string, RibbonTrail[]>();
  /** shared cap on CONCURRENT swing trails (task #37 overdraw discipline) */
  private readonly ribbonBudget = new RibbonBudget();
  private readonly getScale: () => number;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly hooks: AmbientContentHooks,
    opts: AmbientVfxOptions = {},
  ) {
    this.getScale =
      opts.getScale ??
      ((): number => particleBudgetScale(qualityController.getParams().particleDensity));
  }

  has(entityId: number): boolean {
    return this.attachments.has(entityId);
  }

  /**
   * Bind the modelKey's ambient docs under `rootNode`. Idempotent per
   * (entityId, modelKey, rootNode); a changed model re-binds. Call only once
   * content is loaded — an empty binding list is recorded as-is.
   */
  attach(entityId: number, modelKey: string, rootNode: TransformNode): void {
    if (this.disposed) return;
    const existing = this.attachments.get(entityId);
    if (existing && existing.modelKey === modelKey && existing.root === rootNode) return;
    if (existing) this.detach(entityId);

    const items: AmbientItem[] = [];
    for (const binding of this.hooks.bindingsFor(modelKey)) {
      const vfxDoc = this.hooks.vfxDocFor(binding.vfx);
      const ribbonDoc = vfxDoc ? null : this.hooks.ribbonDocFor(binding.vfx);
      if (!vfxDoc && !ribbonDoc) continue; // unauthored id — degrade to no-op
      const anchorBone = (vfxDoc ?? ribbonDoc)!.anchorBone;
      const item: AmbientItem = {
        boneResolved: anchorBone === undefined,
        nextScanMs: 0,
        giveUpMs: Infinity, // set on the first tick (we don't own the clock)
        ...(anchorBone !== undefined ? { anchorBone } : {}),
      };
      const node = anchorBone !== undefined ? findBoneNode(rootNode, anchorBone) : null;
      if (node) item.boneResolved = true;
      const target = node ?? rootNode;
      if (vfxDoc) {
        const emitter = this.acquireEmitter(vfxDoc);
        emitter.emitterMesh.parent = target;
        emitter.emitterMesh.position.setAll(0);
        if (vfxDoc.mode === "continuous") {
          // a weapon trail opens up only while the blade is swung; start it at
          // the idle floor so the very first frame can't dump a full-rate puff
          if (isSwingTrailDoc(vfxDoc)) {
            item.swingGated = true;
            emitter.ps.emitRate = Math.max(1, Math.round(emitter.baseRate * swingEmitScale(0)));
          }
          emitter.ps.start();
        } else {
          item.nextBurstMs = 0; // first tick fires the burst
        }
        item.emitter = emitter;
        item.vfxDoc = vfxDoc;
      } else if (ribbonDoc) {
        const ribbon = this.ribbonPool.get(ribbonDoc.id)?.pop() ??
          new RibbonTrail(this.scene, ribbonDoc, { budget: this.ribbonBudget });
        item.ribbon = ribbon;
        // seeded properly on the first tick (needs nowMs); park it at target.
        // `rootNode` is the swing reference: the trail measures the weapon
        // bone's speed RELATIVE to the entity so walking never draws a streak.
        ribbon.attachTo(target, 0, rootNode);
      }
      items.push(item);
    }
    this.attachments.set(entityId, { modelKey, root: rootNode, items });
  }

  /** Unbind and return every pooled resource (safe when not attached). */
  detach(entityId: number): void {
    const att = this.attachments.get(entityId);
    if (!att) return;
    for (const item of att.items) {
      if (item.emitter && item.vfxDoc) {
        item.emitter.ps.stop();
        // The emitter MESH can already be dead when the anchor root it hung off
        // was disposed out from under us (glb adoption / LOD swap / view
        // teardown — see the orphan guard in tick()). Never pool a corpse: a
        // reused disposed emitter would resurrect at world origin (task #131).
        if (item.emitter.emitterMesh.isDisposed()) {
          item.emitter.ps.dispose();
        } else {
          item.emitter.emitterMesh.parent = null;
          let list = this.psPool.get(item.vfxDoc.id);
          if (!list) {
            list = [];
            this.psPool.set(item.vfxDoc.id, list);
          }
          list.push(item.emitter);
        }
      }
      if (item.ribbon) {
        item.ribbon.detach();
        let list = this.ribbonPool.get(item.ribbon.doc.id);
        if (!list) {
          list = [];
          this.ribbonPool.set(item.ribbon.doc.id, list);
        }
        list.push(item.ribbon);
      }
    }
    this.attachments.delete(entityId);
  }

  /** Detach every entity NOT in `keep` (frame-loop diff helper). */
  sweep(keep: ReadonlySet<number>): void {
    for (const id of [...this.attachments.keys()]) {
      if (!keep.has(id)) this.detach(id);
    }
  }

  /** Per-frame: late bone resolution, ambient burst cycles, ribbon sampling. */
  tick(nowMs: number, dtMs: number): void {
    if (this.disposed) return;
    let dead: number[] | null = null; // attachment roots disposed out from under us
    for (const [entityId, att] of this.attachments) {
      // ORPHAN GUARD — the actual root cause of task #131 (the "persistent
      // bright-white burst stuck in a corner"). The node a pooled emitter mesh
      // hangs off — a glb joint or the view root — can be disposed out from
      // under us when the champion's model is swapped (procedural→glb adoption,
      // LOD-tier swap) or its view is torn down before detach()/sweep() reaches
      // us. Babylon reparents the orphaned child into WORLD space at its local
      // (0,0,0), and a CONTINUOUS emitter left running there paints a permanent
      // additive white burst at the arena origin (0,0,0) — which, under the
      // zone-following combat camera, sits fixed in a screen corner the whole
      // match. A finite-position check can't catch it: (0,0,0) is perfectly
      // finite. So we assert the anchor is alive every frame instead: drop the
      // whole attachment if its root died; otherwise re-home any orphaned
      // emitter back onto the live root so it can never emit off its champion.
      if (att.root.isDisposed()) {
        (dead ??= []).push(entityId);
        continue;
      }
      for (const item of att.items) {
        const em = item.emitter?.emitterMesh;
        if (em && !em.isDisposed()) {
          const parent = em.parent;
          if (parent === null || parent.isDisposed()) {
            em.parent = att.root; // re-anchor to the live root...
            em.position.setAll(0); // ...at its origin, exactly as attach() does
            item.boneResolved = item.anchorBone === undefined; // re-find the joint
            item.nextScanMs = 0;
          }
        }
        if (item.giveUpMs === Infinity) item.giveUpMs = nowMs + BONE_RESCAN_MAX_MS;
        // the .glb (and its joints) streams in async — keep re-searching
        if (!item.boneResolved && item.anchorBone !== undefined && nowMs >= item.nextScanMs) {
          if (nowMs >= item.giveUpMs) {
            item.boneResolved = true; // stay on the root
          } else {
            const node = findBoneNode(att.root, item.anchorBone);
            if (node) {
              item.boneResolved = true;
              if (item.emitter) item.emitter.emitterMesh.parent = node;
              if (item.ribbon) item.ribbon.attachTo(node, nowMs, att.root);
            }
            item.nextScanMs = nowMs + BONE_RESCAN_MS;
          }
        }
        if (item.emitter && item.vfxDoc && item.nextBurstMs !== undefined && nowMs >= item.nextBurstMs) {
          if (!item.emitter.ps.isStarted()) item.emitter.ps.start();
          item.emitter.ps.manualEmitCount = scaledBurstCount(item.vfxDoc, this.getScale());
          item.nextBurstMs = nowMs + item.vfxDoc.lifetimeSec.max * 1000;
        }
        if (item.swingGated && item.emitter) this.tickSwingGate(item, att.root, dtMs);
        item.ribbon?.tick(nowMs, dtMs);
      }
    }
    // detach() mutates the attachments map — do it after the walk, not during.
    if (dead) for (const id of dead) this.detach(id);
  }

  /**
   * 回合邊界（GH#337）：把兩個 free-list 整個還給引擎。
   *
   * ⚠️ **⛔ 不碰 `attachments`。** 活著的英雄身上的常駐特效是 WC3 語意（英雄光暈、
   * 武器餘燼、緞帶）—— 清掉的話玩家會看到「第二回合開始鋼彈的推進器熄了」，
   * 那是把一個殘留缺陷換成一個更明顯的缺陷。這裡只回收**已經沒有主人**的東西。
   *
   * 為什麼非做不可：`psPool` / `ribbonPool` 是 **per-doc-id 的 free-list，只增不減**，
   * 而在此之前它們唯一的回收路徑是 `dispose()`（＝整個 GameApp 被銷毀）。一場
   * 比賽看過的 modelKey 是一直在增加的（升級解鎖形態、第 3 回合起殭屍加入、
   * 每回合換地圖），所以每個閒置的 emitter 都帶著一個 ParticleSystem + 一個 Mesh
   * 留在 `scene` 上被每一幀走訪。⚠️ `content/config/vfx-cleanup.json` 的 note
   * 從 GH#270 起就寫著「AmbientVfx.psPool 同樣只增不減」—— 文件承認了、程式沒修。
   */
  resetForRound(): void {
    if (this.disposed) return;
    this.drainPools();
  }

  dispose(): void {
    if (this.disposed) return;
    for (const id of [...this.attachments.keys()]) this.detach(id);
    this.disposed = true;
    this.drainPools();
  }

  /** 兩個 free-list 上的閒置資源全部 dispose 並清空（回合邊界與 teardown 共用）。 */
  private drainPools(): void {
    for (const list of this.psPool.values()) {
      for (const e of list) {
        e.ps.dispose();
        e.emitterMesh.dispose(false, true);
      }
    }
    for (const list of this.ribbonPool.values()) for (const r of list) r.dispose();
    this.psPool.clear();
    this.ribbonPool.clear();
  }

  /**
   * Weapon-trail emit gate (task #37): fold the emit rate down to a faint
   * ember unless the anchor bone is actually moving RELATIVE to the entity
   * root, so a standing or walking champion never paints a trail. Measured
   * from the emitter mesh's own world position — it is parented to the bone,
   * so this is the same signal RibbonTrail gates on.
   */
  private tickSwingGate(item: AmbientItem, root: TransformNode, dtMs: number): void {
    const emitter = item.emitter!;
    const p = emitter.emitterMesh.getAbsolutePosition();
    const r = root.getAbsolutePosition();
    let relSpeed = 0;
    if (item.prevPos && item.prevRef && dtMs > 0) {
      const dx = p.x - item.prevPos.x - (r.x - item.prevRef.x);
      const dy = p.y - item.prevPos.y - (r.y - item.prevRef.y);
      const dz = p.z - item.prevPos.z - (r.z - item.prevRef.z);
      relSpeed = (Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000) / dtMs;
    }
    item.prevPos = (item.prevPos ?? new Vector3()).copyFrom(p);
    item.prevRef = (item.prevRef ?? new Vector3()).copyFrom(r);
    emitter.ps.emitRate = Math.max(1, Math.round(emitter.baseRate * swingEmitScale(relSpeed)));
  }

  private acquireEmitter(doc: VfxDoc): PooledEmitter {
    const pooled = this.psPool.get(doc.id)?.pop();
    if (pooled) return pooled;
    const emitterMesh = new Mesh(`ambient-${doc.id}-emitter`, this.scene);
    emitterMesh.isVisible = false;
    emitterMesh.isPickable = false;
    // weapon trails are retuned into the 刀光 budget before they are ever
    // built: clamped lifetime, live-count-capped rate, hot→cool ramp that
    // reaches alpha 0, pop-shrink sizes (see swingTrailMath)
    const ps = toParticleSystem(shapeSwingTrailDoc(doc), this.scene, { scale: this.getScale() });
    ps.emitter = emitterMesh;
    return { ps, emitterMesh, baseRate: ps.emitRate };
  }
}
