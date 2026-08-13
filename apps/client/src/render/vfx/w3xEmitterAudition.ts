/**
 * w3xEmitterAudition — the scene behind `public/w3x-emitter-audition.html`.
 *
 * THIS EXISTS TO SATISFY CONDITION 3 OF THE ACCEPTANCE BAR: the rebuild has to
 * be LOOKED AT, not just unit-tested. Unit tests prove the numbers map; only a
 * running scene proves the result reads as the effect it is supposed to be.
 *
 * It drives the REAL pipeline end to end with nothing stubbed:
 *
 *   the WC3 `PRE2` parameter block decoded from the binary
 *     → `w3xEmitterToVfxDoc`   (this lane's mapping)
 *     → `planEffectBudget`     (this lane's budget)
 *     → `toParticleSystem`     (the SHIPPED factory, same as in a match)
 *     → `W3xEmitterRig`        (attachment, KP2 tracks, pooling, disposal)
 *
 * and shows, side by side, the WC3 source numbers, the Babylon numbers they
 * became, and the LEDGER OF EVERY APPROXIMATION — so what was judged rather
 * than measured is visible on screen instead of buried in a commit message.
 *
 * The champion stand-in is a procedural figure whose joints are named exactly
 * as a WC3 `.mdx` export names them (`Hand Right Ref`, `Chest Ref`,
 * `Overhead Ref`, `Weapon Ref`, `Origin Ref`), so the attachment resolution
 * being exercised is the same one a real champion glb exercises — verified
 * against the node census of this repo's 337 glb files.
 */
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Particles/particleSystemComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";

import { W3xEmitterRig, type W3xEffectHandle, type W3xEmitterSpec } from "./W3xEmitterRig";
import {
  W3X_FILTER_MODE,
  W3X_HEAD_OR_TAIL,
  W3X_MODEL_UNIT,
  W3X_NODE_FLAG,
  w3xEmitterToVfxDoc,
  type W3xMappingNote,
  type W3xParticleEmitter,
} from "./w3xEmitter";

const PARTICLES = "assets/textures/particles/";

// ---------------------------------------------------------------------------
// The decoded originals
// ---------------------------------------------------------------------------

/** Shared PRE2 defaults so a fixture states only the fields it actually sets. */
function pre2(over: Partial<W3xParticleEmitter> & { name: string }): W3xParticleEmitter {
  return {
    speed: 100,
    variation: 0,
    latitude: 10,
    gravity: 0,
    lifespan: 1,
    emissionRate: 20,
    length: 10,
    width: 10,
    filterMode: W3X_FILTER_MODE.additive,
    rows: 1,
    cols: 1,
    headOrTail: W3X_HEAD_OR_TAIL.head,
    tailLength: 0,
    timeMiddle: 0.5,
    segmentColor: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    segmentAlpha: [255, 255, 0],
    segmentScaling: [10, 10, 10],
    ...over,
  };
}

export interface AuditionEffect {
  key: string;
  /** what the player would call it */
  label: string;
  /** provenance: which model, which emitters, decoded from what */
  source: string;
  /** the WC3 attach point on the champion, or undefined = play at a point */
  attach?: string;
  emitters: { pre2: W3xParticleEmitter; texture: string }[];
}

/**
 * `DivineRing.mdx` — 20 `PRE2` emitters, ZERO geosets. The 1,020-byte glb is
 * an empty shell because the entire asset IS these emitters (#98). Two visual
 * layers decoded from the binary: a gold ring (15 stacked copies) and a blue
 * inner ring (5 copies, emitters 6–10).
 */
const DIVINE_RING: AuditionEffect = {
  key: "divinering",
  label: "神聖光環 DivineRing（20 個發射器 / 0 個三角形）",
  source:
    "DivineRing.mdx · PRE2 ×20 · mdx 7,268 B → glb 1,020 B（空殼）· 用於 A0TP 球體(趙雲) / A10W 78-002 加速爆體 / 21-04 討滅封絕。" +
    "發射器參數（speed/variation/lifespan/rate/色階/scaling/貼圖）全部來自二進位解碼；" +
    "但 PIVT 尚未解碼，環的半徑是示意值，不是移植值。",
  attach: "chest",
  emitters: [
    ...Array.from({ length: 15 }, (_, i) => ({
      texture: PARTICLES + "fire_01.png",
      pre2: pre2({
        name: `BlizParticle-gold-${i}`,
        // THE RING IS THE PIVOT LAYOUT. Each emitter sits at a point on a
        // circle in the model's XY plane (MDX is Z-up); their PARAMETERS are
        // near-identical. Collapse the pivots and 20 identical emitters render
        // as one blinding column — exactly what this page showed before pivots
        // were carried through.
        //
        // HONESTY NOTE: the emitter parameters above are DECODED from the
        // binary (docs/legacy/_vfx-fidelity-w3x.md §4.4). This RADIUS is not — the
        // archaeology did not decode DivineRing's PIVT chunk, so 18 model units
        // is an ILLUSTRATIVE layout chosen to show what pivots do, and the page
        // says so. Do not treat it as a ported value
        // ([[ggd-faithful-import-over-rescale]]: never invent a WC3 number).
        pivot: [Math.cos((i / 15) * Math.PI * 2) * 18, Math.sin((i / 15) * Math.PI * 2) * 18, 0],
        speed: 200,
        variation: 0.02,
        latitude: 0,
        lifespan: 0.5,
        emissionRate: 40,
        length: 4,
        width: 4,
        segmentColor: [
          [1, 0.902, 0.247],
          [0.988, 0.867, 0.043],
          [1, 1, 0.749],
        ],
        segmentAlpha: [255, 255, 0],
        segmentScaling: [20, 20, 20],
        flags: W3X_NODE_FLAG.particleEmitter | W3X_NODE_FLAG.unshaded,
      }),
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      texture: PARTICLES + "light_01.png",
      pre2: pre2({
        name: `BlizParticle-blue-${i}`,
        // the inner ring: same (illustrative) layout at half the radius,
        // carrying the DECODED blue second layer
        pivot: [Math.cos((i / 5) * Math.PI * 2) * 9, Math.sin((i / 5) * Math.PI * 2) * 9, 0],
        speed: 150,
        variation: 0.02,
        latitude: 0,
        lifespan: 0.5,
        emissionRate: 40,
        length: 4,
        width: 4,
        segmentColor: [
          [0, 0.502, 1],
          [0, 0.502, 1],
          [0.6, 0.8, 1],
        ],
        segmentAlpha: [128, 128, 0],
        segmentScaling: [20, 20, 20],
        flags: W3X_NODE_FLAG.particleEmitter | W3X_NODE_FLAG.unshaded,
      }),
    })),
  ],
};

/**
 * `flamessmoke.mdx` — 4 `PRE2` emitters over FOUR triangles. The glb converts
 * "fine" (5,164 B, 1 geoset) and draws as debris, because the effect was never
 * the geometry.
 */
const FLAMES_SMOKE: AuditionEffect = {
  key: "flamessmoke",
  label: "火焰濃煙 flamessmoke（4 個發射器 / 4 個三角形）",
  source: "flamessmoke.mdx · PRE2 ×4 · glb 5,164 B 但只有 4 tri — 幾何從來就不是本體",
  emitters: [
    {
      texture: PARTICLES + "smoke_03.png",
      pre2: pre2({
        name: "BlizParticle01",
        speed: 160,
        variation: 0.5,
        latitude: 12,
        lifespan: 2,
        emissionRate: 75,
        length: 125,
        width: 125,
        segmentColor: [
          [0, 0.518, 1],
          [1, 0.471, 0],
          [1, 0.918, 0],
        ],
        segmentAlpha: [200, 220, 0],
        segmentScaling: [10, 50, 20],
      }),
    },
    {
      texture: PARTICLES + "flame_04.png",
      pre2: pre2({
        name: "BlizParticle03",
        speed: 400,
        variation: 0.4,
        latitude: 45,
        gravity: 300,
        lifespan: 4,
        emissionRate: 3,
        length: 40,
        width: 40,
        segmentColor: [
          [1, 0.8, 0.3],
          [1, 0.35, 0.05],
          [0.4, 0.1, 0],
        ],
        segmentAlpha: [255, 200, 0],
        segmentScaling: [6, 6, 2],
      }),
    },
  ],
};

/**
 * A hand-held orb — the `Asph` shape (76 abilities in the map) that the engine
 * could not express at all: a persistent emitter bound to a champion's hand.
 * Uses a KP2E track so the animated-emission compromise is visible too.
 */
const HAND_ORB: AuditionEffect = {
  key: "handorb",
  label: "球體 Asph（常駐掛在右手 · 帶 KP2E 動畫軌）",
  source: "Asph 附著型球體（地圖最常用的 base，76 個自訂技能）· 附著點 right,hand",
  attach: "right,hand",
  emitters: [
    {
      texture: PARTICLES + "magic_05.png",
      pre2: pre2({
        name: "OrbCore",
        speed: 30,
        variation: 0.8,
        latitude: 180,
        lifespan: 0.9,
        emissionRate: 60,
        length: 12,
        width: 12,
        segmentColor: [
          [0.85, 0.6, 1],
          [0.55, 0.25, 0.95],
          [0.2, 0.05, 0.4],
        ],
        segmentAlpha: [255, 200, 0],
        segmentScaling: [4, 9, 1],
        flags: W3X_NODE_FLAG.particleEmitter | W3X_NODE_FLAG.modelSpace,
        emissionTrack: { keys: [[0, 20], [700, 90], [1400, 20]], interp: 1 },
      }),
    },
    {
      texture: PARTICLES + "spark_04.png",
      pre2: pre2({
        name: "OrbSparks",
        speed: 90,
        variation: 0.6,
        latitude: 180,
        gravity: 60,
        lifespan: 0.6,
        emissionRate: 18,
        length: 6,
        width: 6,
        headOrTail: W3X_HEAD_OR_TAIL.tail,
        tailLength: 2.5,
        segmentColor: [
          [1, 0.95, 1],
          [0.8, 0.5, 1],
          [0.3, 0.1, 0.5],
        ],
        segmentAlpha: [255, 255, 0],
        segmentScaling: [2, 2, 0],
      }),
    },
  ],
};

export const AUDITION_EFFECTS: AuditionEffect[] = [DIVINE_RING, FLAMES_SMOKE, HAND_ORB];

/** Map an audition effect through THIS lane's pipeline into rig emitters. */
export function buildEmitters(effect: AuditionEffect): { emitters: W3xEmitterSpec[]; notes: W3xMappingNote[] } {
  const emitters: W3xEmitterSpec[] = [];
  const notes: W3xMappingNote[] = [];
  effect.emitters.forEach((e, i) => {
    const m = w3xEmitterToVfxDoc(e.pre2, { id: `${effect.key}-p${i}`, texture: e.texture });
    emitters.push({ doc: m.doc, runtime: m.runtime });
    for (const n of m.notes) {
      if (!notes.some((x) => x.field === n.field && x.detail === n.detail)) notes.push(n);
    }
  });
  return { emitters, notes };
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

/** A champion stand-in whose joints carry the REAL WC3 attachment names. */
export function championStandIn(scene: Scene, index: number, x: number, z: number): TransformNode {
  const prefix = `${index}-`;
  const root = new TransformNode(`${prefix}root`, scene);
  root.position.set(x, 0, z);

  const mat = new StandardMaterial(`champ-mat-${index}`, scene);
  mat.diffuseColor = new Color3(0.32, 0.36, 0.46);
  mat.specularColor = new Color3(0.05, 0.05, 0.07);

  const body = CreateBox(`${prefix}body`, { width: 0.42, height: 1.05, depth: 0.3 }, scene);
  body.material = mat;
  body.position.y = 0.72;
  body.parent = root;
  const head = CreateBox(`${prefix}headMesh`, { size: 0.32 }, scene);
  head.material = mat;
  head.position.y = 1.42;
  head.parent = root;
  for (const [name, px] of [
    [`${prefix}armR`, 0.34],
    [`${prefix}armL`, -0.34],
  ] as const) {
    const arm = CreateBox(name, { width: 0.14, height: 0.66, depth: 0.14 }, scene);
    arm.material = mat;
    arm.position.set(px, 0.78, 0);
    arm.parent = root;
  }

  // WC3 attachment points, named exactly as an .mdx export names them. Their
  // positions are where a WC3 artist puts them, so an orb really does sit in
  // the hand rather than in the middle of the model.
  const joints: [string, Vector3][] = [
    ["Origin Ref", new Vector3(0, 0.02, 0)],
    ["Chest Ref", new Vector3(0, 0.95, 0.12)],
    ["Overhead Ref", new Vector3(0, 1.85, 0)],
    ["Head Ref", new Vector3(0, 1.42, 0)],
    ["Hand Right Ref", new Vector3(0.36, 0.44, 0.06)],
    ["Hand Left Ref", new Vector3(-0.36, 0.44, 0.06)],
    ["Weapon Ref", new Vector3(0.46, 0.6, 0.2)],
    // the deforming bone, listed BEFORE the attachment point as a real export
    // does — the resolver must still prefer the Ref
    ["Bone_Hand_R", new Vector3(0.3, 0.5, 0)],
  ];
  for (const [name, pos] of joints) {
    const n = new TransformNode(prefix + name, scene);
    n.position.copyFrom(pos);
    n.parent = root;
  }
  return root;
}

export interface AuditionStats {
  effects: number;
  systems: number;
  pooled: number;
  totalSystems: number;
  fps: number;
  plan: {
    systemsBeforeMerge: number;
    systemsAfterMerge: number;
    kept: number;
    dropped: number;
    particles: number;
    rateScale: number;
    faithful: boolean;
  } | null;
  attach: string | null;
  notes: W3xMappingNote[];
  /** live particle counts per system — the "is anything actually drawing?" check */
  alive: number[];
  meshes: number;
  /** per-system diagnostics; the screenshot automation reads these */
  debug: {
    name: string;
    started: boolean;
    ready: boolean;
    rate: number;
    capacity: number;
    life: [number, number];
    power: [number, number];
    tex: boolean;
    texReady: boolean;
    raw: string;
  }[];
}

export interface AuditionHandle {
  /** (re)play `effectKey` on `champions` stand-ins */
  play(effectKey: string, champions: number): void;
  /** stop everything and let it drain — the disposal path, watchable */
  stopAll(): void;
  /**
   * Advance the simulation by hand: `frames` × `stepMs`, ticking the rig and
   * rendering each step.
   *
   * The render loop is `requestAnimationFrame`-driven, which a browser SUSPENDS
   * while the tab is hidden — so a headless screenshot of a background tab
   * captures frame 0 (an empty scene) no matter how long you wait. This is the
   * frame-stepped capture seam: drive N deterministic frames, THEN screenshot.
   */
  step(frames: number, stepMs?: number): void;
  stats(): AuditionStats;
  dispose(): void;
}

export function startW3xEmitterAudition(canvas: HTMLCanvasElement): AuditionHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.027, 0.031, 0.047, 1);

  const camera = new ArcRotateCamera("cam", -Math.PI / 2, 1.02, 7.5, new Vector3(0, 1.0, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 2.5;
  camera.upperRadiusLimit = 30;
  camera.wheelDeltaPercentage = 0.02;

  const light = new HemisphericLight("light", new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 0.75;

  const ground = CreateGround("ground", { width: 30, height: 30 }, scene);
  const gm = new StandardMaterial("ground-mat", scene);
  gm.diffuseColor = new Color3(0.07, 0.08, 0.11);
  gm.specularColor = Color3.Black();
  ground.material = gm;

  const rig = new W3xEmitterRig(scene, { maxEffectSec: 3600 });

  let stands: TransformNode[] = [];
  let handles: W3xEffectHandle[] = [];
  let notes: W3xMappingNote[] = [];
  let attachText: string | null = null;

  const clearStands = (): void => {
    for (const h of handles) h.cancel();
    handles = [];
    for (const s of stands) s.dispose(false, true);
    stands = [];
  };

  const play = (effectKey: string, champions: number): void => {
    clearStands();
    const effect = AUDITION_EFFECTS.find((e) => e.key === effectKey) ?? AUDITION_EFFECTS[0]!;
    const built = buildEmitters(effect);
    notes = built.notes;
    attachText = null;

    const n = Math.max(1, Math.min(12, Math.trunc(champions)));
    // a ring, so 12 champions are all visible at once — the real worst case
    const radius = n === 1 ? 0 : 1.1 + n * 0.16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const root = championStandIn(scene, i, Math.cos(a) * radius, Math.sin(a) * radius);
      stands.push(root);
      const spec = { id: effect.key, emitters: built.emitters, ...(effect.attach ? { attach: effect.attach } : {}) };
      const h = rig.play(spec, { kind: "node", root });
      handles.push(h);
      if (i === 0 && h.attach) attachText = h.attach.reason;
    }
    camera.setTarget(new Vector3(0, effect.attach === "chest" || effect.attach ? 1.0 : 0.6, 0));
    camera.radius = Math.max(5, radius * 2.4 + 3.4);
  };

  let last = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    rig.tick(dt);
    scene.render();
  });
  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  play(AUDITION_EFFECTS[0]!.key, 1);

  return {
    play,
    stopAll: () => {
      for (const h of handles) h.stop();
    },
    step: (frames: number, stepMs = 16.7) => {
      for (let i = 0; i < Math.max(1, Math.trunc(frames)); i++) {
        rig.tick(stepMs);
        scene.render();
      }
    },
    stats: () => {
      const plan = handles[0]?.plan ?? null;
      return {
        effects: rig.effectCount,
        systems: rig.systemCount,
        pooled: rig.pooledCount,
        totalSystems: rig.totalSystems,
        fps: Math.round(engine.getFps()),
        plan: plan
          ? {
              systemsBeforeMerge: plan.systemsBeforeMerge,
              systemsAfterMerge: plan.systemsAfterMerge,
              kept: plan.emitters.length,
              dropped: plan.dropped.length,
              particles: plan.particles,
              rateScale: plan.emitters[0]?.rateScale ?? 1,
              faithful: plan.faithful,
            }
          : null,
        attach: attachText,
        notes,
        alive: scene.particleSystems.map(
          (ps) => (ps as unknown as { particles?: unknown[] }).particles?.length ?? ps.getActiveCount(),
        ),
        meshes: scene.meshes.length,
        debug: scene.particleSystems.map((ps) => ({
          name: ps.name,
          started: ps.isStarted(),
          ready: ps.isReady(),
          rate: ps.emitRate,
          capacity: (ps as unknown as { getCapacity(): number }).getCapacity(),
          life: [ps.minLifeTime, ps.maxLifeTime] as [number, number],
          power: [ps.minEmitPower, ps.maxEmitPower] as [number, number],
          tex: !!ps.particleTexture,
          texReady: ps.particleTexture?.isReady() ?? false,
          raw: JSON.stringify({
            stopped: (ps as unknown as { _stopped: boolean })._stopped,
            started: (ps as unknown as { _started: boolean })._started,
            frame: (ps as unknown as { _actualFrame: number })._actualFrame,
            rid: (ps as unknown as { _currentRenderId: number })._currentRenderId,
            sceneFrame: scene.getFrameId(),
            ratio: scene.getAnimationRatio(),
            pEnabled: scene.particlesEnabled,
            active: (scene as unknown as { _activeParticleSystems: { length: number } })._activeParticleSystems?.length,
            manual: ps.manualEmitCount,
            excess: (ps as unknown as { _newPartsExcess: number })._newPartsExcess,
            updSpeed: ps.updateSpeed,
            emitterType: (ps as unknown as { particleEmitterType?: { getClassName?(): string } }).particleEmitterType?.getClassName?.(),
            emitterNode: typeof ps.emitter === "object" && ps.emitter && "name" in ps.emitter ? (ps.emitter as { name: string }).name : "vec",
          }),
        })),
      };
    },
    dispose: () => {
      window.removeEventListener("resize", onResize);
      clearStands();
      rig.dispose();
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    },
  };
}

/** The world-unit conversion, re-exported so the page can show it. */
export const AUDITION_WORLD_SCALE = W3X_MODEL_UNIT;
