/**
 * intermissionAudition — the dev-only review scene behind
 * `public/intermission-audition.html`, the 中場 twin of `groundAudition.ts`
 * (task #80). Its whole reason to exist is task #103 / int-28: the headless
 * sightline test can only cast against the FOOTPRINTS `layout.ts` records, so
 * this builds the REAL `IntermissionScene` — same layout numbers, same camera,
 * the shipped `.glb` instantiated into a live WebGL scene — and lets a person
 * LOOK at the composed shot AND re-fire `scene.multiPickWithRay` from the
 * composed eye against the actual instantiated meshes.
 *
 * It is not a mock: it constructs `IntermissionScene` unchanged, so what shows
 * here is what a match shows. Nothing in the app imports it; `public/*.html` is
 * not a Vite build entry, so it never reaches the shipped bundle.
 *
 * WHY autoStart:false + a manual pump. In an automated headless browser pane
 * `requestAnimationFrame` never fires, so the engine's own render loop paints
 * zero frames and the canvas stays black. This harness therefore drives
 * `scene.render()` itself. A happy side effect: with the loop off the camera
 * sits exactly on the resting `CAMERA_POSE` (no breathing drift), so the eye
 * used for the cast is byte-for-byte the `CAMERA_POSITION` the headless test
 * fires from — the two measurements are directly comparable.
 */
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { IntermissionScene } from "./IntermissionScene";
import {
  CAMERA_POSITION,
  CHAMPION_STAND,
  MERCHANT,
  SHOP_CARD_SIDE,
  SHOP_CARD_WIDTH_FRACTION,
} from "./layout";

/** A clean KayKit hero (champ.thorne) at its measured 1.7 u scale — a stand-in
 *  for "the player's own champion" so the shot reads as a real shop scene. No
 *  imported-model defect (task #68's face-down poses) to muddy the picture. */
const CHAMPION = { glbPath: "assets/models/champions/knight.glb", scale: 0.7328 } as const;

/** The three body-height samples int-28 fires at, verbatim. */
const SAMPLE_HEIGHTS: readonly (readonly [string, number])[] = [
  ["head", 1.62],
  ["chest", 1.2],
  ["feet", 0.15],
];

export interface Blocker {
  readonly name: string;
  readonly distance: number;
}
export interface SampleResult {
  readonly sample: string;
  readonly y: number;
  readonly blockers: Blocker[];
}
export interface SightlineResult {
  readonly subject: string;
  readonly clear: boolean;
  readonly samples: SampleResult[];
}
export interface CastReport {
  readonly eye: [number, number, number];
  readonly cameraGlobal: [number, number, number];
  readonly driftless: boolean;
  readonly results: SightlineResult[];
}

export interface AuditionHandle {
  readonly scene: IntermissionScene;
  readonly cardSide: string;
  readonly cardFraction: number;
  ready(timeoutMs?: number): Promise<boolean>;
  pump(frames?: number): void;
  resize(): void;
  /** Fire the live sightline cast against the instantiated meshes. */
  cast(): CastReport;
  /** Screen-space fraction (0..1 from the LEFT / TOP) of a world point. */
  project(x: number, y: number, z: number): { xFrac: number; yFrac: number };
}

export function startIntermissionAudition(canvas: HTMLCanvasElement): AuditionHandle {
  const scene = new IntermissionScene(canvas, {
    teamId: 0,
    champion: CHAMPION,
    autoStart: false, // rAF is dead in the pane — we pump renders ourselves
  });
  const b = scene.scene;

  const pump = (frames = 1): void => {
    for (let i = 0; i < frames; i++) b.render();
  };

  const ready = async (timeoutMs = 20000): Promise<boolean> => {
    const start = Date.now();
    while (!scene.isBuilt && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (scene.isBuilt) {
      // make the market meshes pickable — `place()` sets isPickable=false, and
      // although a multiPickWithRay predicate already bypasses that gate, this
      // removes any doubt that a "0 blockers" result is real and not filtered.
      for (const m of b.meshes) m.isPickable = true;
      pump(10); // warm up: compile shaders, settle the first full paint
    }
    return scene.isBuilt;
  };

  const resize = (): void => {
    scene.engine.resize();
    pump(2);
  };

  const inclusive = (m: AbstractMesh): boolean =>
    m.isEnabled() && m.isVisible && m.getTotalVertices() > 0;

  const castSubject = (rootName: string, sx: number, sz: number): SightlineResult => {
    const root = b.getTransformNodeByName(rootName);
    const eye = new Vector3(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
    const samples: SampleResult[] = [];
    for (const [label, y] of SAMPLE_HEIGHTS) {
      const target = new Vector3(sx, y, sz);
      const dir = target.subtract(eye);
      const dist = dir.length();
      dir.normalize();
      const ray = new Ray(eye, dir, dist + 0.5);
      const picks = b.multiPickWithRay(ray, inclusive) ?? [];
      const blockers = picks
        .filter((pi) => pi.hit && pi.pickedMesh !== null)
        // strictly BETWEEN eye and the subject point (things behind it are not occluders)
        .filter((pi) => pi.distance < dist - 0.02)
        // and never the subject's own body
        .filter((pi) => !(root !== null && pi.pickedMesh!.isDescendantOf(root)))
        .map((pi) => ({ name: pi.pickedMesh!.name, distance: Number(pi.distance.toFixed(2)) }))
        .sort((a, c) => a.distance - c.distance);
      samples.push({ sample: label, y, blockers });
    }
    return { subject: rootName, clear: samples.every((s) => s.blockers.length === 0), samples };
  };

  const cast = (): CastReport => {
    const cam = b.activeCamera;
    const g = cam ? cam.globalPosition : Vector3.Zero();
    return {
      eye: [CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z],
      cameraGlobal: [Number(g.x.toFixed(3)), Number(g.y.toFixed(3)), Number(g.z.toFixed(3))],
      driftless: !scene.isRunning,
      results: [
        castSubject("im-merchant", MERCHANT.x, MERCHANT.z),
        castSubject("im-champion", CHAMPION_STAND.x, CHAMPION_STAND.z),
      ],
    };
  };

  /**
   * Resolution-independent occlusion detail for the merchant's HEAD: sweep a
   * grid of rays across his head volume (not just the centre point int-28
   * fires) and report what fraction is blocked, and by which mesh. Answers
   * "how much of his head does the stall actually hide" without trusting a
   * downscaled screenshot.
   */
  const analyzeHead = (): {
    merchantWorldBBox: { min: number[]; max: number[] };
    headTopY: number;
    stallPrimitiveBBoxes: Record<string, { min: number[]; max: number[] }>;
    sweep: { total: number; blocked: number; blockedByStall: number; fraction: number; sampleBlockers: string[] };
  } => {
    const root = b.getTransformNodeByName("im-merchant");
    const meshes = b.meshes.filter(
      (m) => root !== null && m.isDescendantOf(root) && m.getTotalVertices() > 0,
    );
    // Fixed 3-tuples, not number[]: under noUncheckedIndexedAccess a plain
    // array makes min[0] a `number | undefined` and every use below a strict-
    // null error. The bbox is always exactly 3 axes, so a tuple is both correct
    // and what lets the arithmetic below stay untyped-noise-free.
    let min: [number, number, number] = [1e9, 1e9, 1e9];
    let max: [number, number, number] = [-1e9, -1e9, -1e9];
    for (const m of meshes) {
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      const lo = bb.minimumWorld;
      const hi = bb.maximumWorld;
      min = [Math.min(min[0], lo.x), Math.min(min[1], lo.y), Math.min(min[2], lo.z)];
      max = [Math.max(max[0], hi.x), Math.max(max[1], hi.y), Math.max(max[2], hi.z)];
    }
    // the merchant's head band: top ~18% of his silhouette height
    const headTopY = max[1];
    const headBottomY = min[1] + (max[1] - min[1]) * 0.82;
    const cx = (min[0] + max[0]) / 2;
    const cz = (min[2] + max[2]) / 2;
    const halfW = Math.max(0.12, (max[0] - min[0]) / 2);
    const eye = new Vector3(CAMERA_POSITION.x, CAMERA_POSITION.y, CAMERA_POSITION.z);
    let total = 0;
    let blocked = 0;
    let blockedByStall = 0;
    const sampleBlockers = new Set<string>();
    const N = 7;
    for (let ix = 0; ix < N; ix++) {
      for (let iy = 0; iy < N; iy++) {
        const tx = cx + (ix / (N - 1) - 0.5) * 2 * halfW;
        const ty = headBottomY + (iy / (N - 1)) * (headTopY - headBottomY);
        const target = new Vector3(tx, ty, cz);
        const dir = target.subtract(eye);
        const dist = dir.length();
        dir.normalize();
        const ray = new Ray(eye, dir, dist + 0.5);
        const picks = (b.multiPickWithRay(ray, inclusive) ?? []).filter(
          (pi) =>
            pi.hit &&
            pi.pickedMesh !== null &&
            pi.distance < dist - 0.02 &&
            !(root !== null && pi.pickedMesh.isDescendantOf(root)),
        );
        total++;
        if (picks.length > 0) {
          blocked++;
          for (const pi of picks) sampleBlockers.add(pi.pickedMesh!.name);
          if (picks.some((pi) => /MarketStand|Stand/i.test(pi.pickedMesh!.name))) blockedByStall++;
        }
      }
    }
    const stallPrimitiveBBoxes: Record<string, { min: number[]; max: number[] }> = {};
    for (const m of b.meshes) {
      if (!/MarketStand/i.test(m.name)) continue;
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      stallPrimitiveBBoxes[m.name] = {
        min: [bb.minimumWorld.x, bb.minimumWorld.y, bb.minimumWorld.z].map((n) => Number(n.toFixed(3))),
        max: [bb.maximumWorld.x, bb.maximumWorld.y, bb.maximumWorld.z].map((n) => Number(n.toFixed(3))),
      };
    }
    return {
      merchantWorldBBox: { min: min.map((n) => Number(n.toFixed(3))), max: max.map((n) => Number(n.toFixed(3))) },
      headTopY: Number(headTopY.toFixed(3)),
      stallPrimitiveBBoxes,
      sweep: {
        total,
        blocked,
        blockedByStall,
        fraction: Number((blocked / total).toFixed(3)),
        sampleBlockers: [...sampleBlockers],
      },
    };
  };

  const project = (x: number, y: number, z: number): { xFrac: number; yFrac: number } => {
    const cam = b.activeCamera!;
    const w = scene.engine.getRenderWidth();
    const h = scene.engine.getRenderHeight();
    const p = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      b.getTransformMatrix(),
      cam.viewport.toGlobal(w, h),
    );
    return { xFrac: p.x / w, yFrac: p.y / h };
  };

  return {
    scene,
    cardSide: SHOP_CARD_SIDE,
    cardFraction: SHOP_CARD_WIDTH_FRACTION,
    ready,
    pump,
    resize,
    cast,
    project,
  };
}
