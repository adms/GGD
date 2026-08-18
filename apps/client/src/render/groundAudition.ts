/**
 * groundAudition — the scene behind `public/ground-audition.html`, a dev-only
 * review page for the task #80 arena floor (same role as the task #52 BGM
 * audition page: something the change can actually be LOOKED at and approved
 * in, without playing a match to get there).
 *
 * The point of it is that it is not a mock-up. It calls the REAL
 * `buildZoneGround`, the REAL `setupLighting`, the shipped zone radius and the
 * shipped camera geometry (CameraRig's pitch at DOLLY_MIN — the CLOSEST zoom;
 * ⚠️ GH#361 moved the shipped default out to the far clamp), so what shows up
 * here is what shows up in a
 * match. A prettier stand-in scene would be worse than useless — it could
 * approve a floor the game never renders.
 *
 * It lives in src/render/ because that is the only place the architecture gate
 * (client-08) allows @babylonjs imports, and because letting Vite resolve
 * Babylon normally is load-bearing: an earlier cut imported it straight from
 * /node_modules in the HTML, which bypassed dependency resolution and fed
 * Babylon the dev server's SPA fallback page as shader source.
 *
 * Nothing in the shipped app imports this — `public/*.html` is not a build
 * entry, so it never reaches the bundle.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { buildContactShadows, buildZoneGround } from "./ArenaGround";
import { setupLighting } from "./Lighting";
import { CAMERA_PITCH_RAD, DOLLY_MIN } from "./CameraRig";

/** Every shipped arena zone has this radius (content/arenas/*.json). */
const R = 24;
const ZONE = { center: { x: 0, z: 0 }, boundaryRadius: R };
/** Where the height references and their contact blobs stand. */
const REF_SPOTS: [number, number][] = [
  [0, 0],
  [8, -6],
  [-11, 9],
  [0, R - 1.2],
  [R - 1.2, 0],
];

export interface AuditionHandle {
  setStyle(style: string): void;
  setPreset(preset: "game" | "rim" | "whole"): void;
  setRefsVisible(on: boolean): void;
  orbit(deltaYawRad: number): void;
  zoom(factor: number): void;
  readonly stats: () => { dolly: number; yawDeg: number; meshes: number; tris: number; fps: number };
}

export function startGroundAudition(canvas: HTMLCanvasElement): AuditionHandle {
  const engine = new Engine(canvas, true, { stencil: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.043, 0.055, 0.078, 1); // Renderer.ts
  setupLighting(scene);

  const camera = new TargetCamera("audition-cam", new Vector3(0, 0, 0), scene);
  scene.activeCamera = camera;

  // 1.7u capsules — the shortest hero's head height, the same figure the
  // sightline math is built on. Without a body in frame there is no way to
  // judge whether the floor detail is at a sane scale.
  const refs = new TransformNode("height-refs", scene);
  const refMat = new StandardMaterial("ref-mat", scene);
  refMat.diffuseColor = new Color3(0.55, 0.57, 0.62);
  refMat.specularColor = new Color3(0.05, 0.05, 0.05);
  for (const [x, z] of REF_SPOTS) {
    const c = MeshBuilder.CreateCapsule("ref", { height: 1.7, radius: 0.45 }, scene);
    c.position.set(x, 0.85, z);
    c.material = refMat;
    c.parent = refs;
  }

  let root: TransformNode | null = null;
  const rebuild = (style: string): void => {
    if (root) {
      for (const m of root.getChildMeshes(false)) m.dispose(false, true);
      root.dispose();
    }
    root = new TransformNode("ground-root", scene);
    buildZoneGround(scene, root, ZONE, 0, style);
    buildContactShadows(
      scene,
      root,
      REF_SPOTS.map(([x, z]) => ({ x, z, radius: 0.5 })),
    );
  };
  rebuild("stone");

  let target = { x: 0, z: 0 };
  let dolly = DOLLY_MIN;
  let yaw = 0;
  const place = (): void => {
    const h = dolly * Math.sin(CAMERA_PITCH_RAD);
    const d = dolly * Math.cos(CAMERA_PITCH_RAD);
    camera.position.set(target.x + Math.sin(yaw) * d, h, target.z - Math.cos(yaw) * d);
    camera.setTarget(new Vector3(target.x, 0.9, target.z));
  };
  place();

  engine.runRenderLoop(() => scene.render());
  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  // dev handle, same idea as Renderer.ts's __ggdScene — this page exists to be
  // poked at, and a floor that renders black is far easier to diagnose from the
  // console than by squinting at a screenshot
  (window as unknown as { __ggdGroundScene?: Scene }).__ggdGroundScene = scene;

  return {
    setStyle: (style) => rebuild(style),
    setPreset: (preset) => {
      // "game" is the real in-match framing AND the worst case for spotting a
      // texture repeat, because the floor is at its largest on screen there.
      if (preset === "game") ({ target, dolly, yaw } = { target: { x: 0, z: 0 }, dolly: DOLLY_MIN, yaw: 0 });
      else if (preset === "rim") ({ target, dolly, yaw } = { target: { x: 0, z: R - 2 }, dolly: 14, yaw: 0 });
      else ({ target, dolly, yaw } = { target: { x: 0, z: 0 }, dolly: 62, yaw: 0 });
      place();
    },
    setRefsVisible: (on) => refs.setEnabled(on),
    orbit: (d) => {
      yaw += d;
      place();
    },
    zoom: (factor) => {
      dolly = Math.min(120, Math.max(6, dolly * factor));
      place();
    },
    stats: () => ({
      dolly,
      yawDeg: (yaw * 180) / Math.PI,
      meshes: scene.meshes.length,
      tris: scene.getActiveIndices() / 3,
      fps: engine.getFps(),
    }),
  };
}
