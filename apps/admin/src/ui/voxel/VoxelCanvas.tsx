/**
 * <VoxelCanvas> — the live 3D preview for 鑄形工坊.
 *
 * The Engine/Scene/camera/light setup is COPIED from
 * `apps/editor/src/preview3d/BabylonCanvas.tsx`, and the ground grid +
 * collision cylinder from that folder's `stage.ts`. Copied rather than
 * imported: apps/admin has no workspace dependency on apps/editor, they are
 * separate vite apps, and inventing one to share ~260 lines would drag the
 * editor's `@tanstack/react-query` + `@babylonjs/loaders` + editor store into
 * the admin's dev chunk. The repo already made this call once, deliberately,
 * for `src/dev/loopbackOnly.ts`.
 *
 * WHAT IS NOT COPIED, on purpose: `loadGlb.ts`. A procedural generator loads
 * nothing, so `@babylonjs/loaders` is not a dependency of this app — there is
 * no import path in the studio, anywhere, that can ingest a third-party model.
 *
 * This module is lazily imported by VoxelStudioPage so that opening 英雄管理
 * does not pull ~1 MB of Babylon into the dev content chunk. That is
 * ergonomics; the SECURITY gate is App.tsx's `import.meta.env.DEV` guard above
 * `import("./ContentPage")`, unchanged and not touched by this page.
 */
import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { findClip, sampleClip, type ClipState, type VoxelFigure } from "@ggd/shared/voxel";
import {
  applyPose,
  clearPose,
  createFigure,
  figureSignature,
  repaint,
  setFlash,
  setTeamTint,
  type FigureNodes,
} from "./voxelMeshes";

const DPR_CAP = 2;
const TARGET_HEIGHT = 1.8;

export interface VoxelCanvasProps {
  readonly figure: VoxelFigure;
  readonly clip: ClipState;
  /** false ⇒ the scrubber owns the time */
  readonly playing: boolean;
  /** 0..1 position inside the clip when `playing` is false */
  readonly phase: number;
  /** team colour multiplier, or null for the authored palette */
  readonly teamTint: readonly [number, number, number] | null;
  readonly flash: boolean;
  readonly showCollision: boolean;
  readonly collisionRadius: number;
  readonly height?: number;
}

/** Faint reference grid, from preview3d/stage.ts. */
function createGroundGrid(scene: Scene, size = 6, step = 0.5): Mesh {
  const half = size / 2;
  const lines: Vector3[][] = [];
  for (let i = -half; i <= half + 1e-9; i += step) {
    lines.push([new Vector3(i, 0, -half), new Vector3(i, 0, half)]);
    lines.push([new Vector3(-half, 0, i), new Vector3(half, 0, i)]);
  }
  const grid = CreateLineSystem("ground-grid", { lines }, scene);
  grid.color = Color3.FromHexString("#39404f");
  grid.isPickable = false;
  return grid;
}

/**
 * The 1.8 u height rule: a vertical bar the figure must exactly reach. #150's
 * normalisation happens inside `buildFigure`, so this is not a control — it is
 * the visible proof that the operator does not have to think about it.
 */
function createHeightRule(scene: Scene): Mesh {
  const lines: Vector3[][] = [
    [new Vector3(-1.4, 0, 0), new Vector3(-1.4, TARGET_HEIGHT, 0)],
    [new Vector3(-1.5, TARGET_HEIGHT, 0), new Vector3(-1.3, TARGET_HEIGHT, 0)],
    [new Vector3(-1.5, 0, 0), new Vector3(-1.3, 0, 0)],
  ];
  const rule = CreateLineSystem("height-rule", { lines }, scene);
  rule.color = Color3.FromHexString("#e8c15a");
  rule.isPickable = false;
  return rule;
}

/** Wireframe collision cylinder, from preview3d/stage.ts (unit radius, scaled). */
function createCollisionCylinder(scene: Scene, radius: number): Mesh {
  const mesh = CreateCylinder(
    "collision-radius",
    { diameter: 2, height: TARGET_HEIGHT, tessellation: 32, subdivisions: 1 },
    scene,
  );
  mesh.position.y = TARGET_HEIGHT / 2;
  const mat = new StandardMaterial("collision-radius-mat", scene);
  const c = Color3.FromHexString("#e06c5b");
  mat.emissiveColor = c;
  mat.diffuseColor = c.scale(0.4);
  mat.specularColor = Color3.Black();
  mat.disableLighting = true;
  mat.wireframe = true;
  mat.alpha = 0.8;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.scaling.x = radius;
  mesh.scaling.z = radius;
  return mesh;
}

interface Live {
  scene: Scene;
  nodes: FigureNodes;
  signature: string;
  collision: Mesh;
  /** the hips node's bind height — clip hips translation is an OFFSET from it */
  hipsBaseY: number;
  startMs: number;
}

function hipsBindY(nodes: FigureNodes): number {
  const idx = nodes.jointIndex["hips"];
  return idx === undefined ? 0 : (nodes.joints[idx]?.position.y ?? 0);
}

export function VoxelCanvas(props: VoxelCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<Live | null>(null);
  // latest props without re-creating the engine
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { stencil: false }, false);
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, DPR_CAP));

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.055, 0.07, 0.11, 1);

    const camera = new ArcRotateCamera(
      "orbit",
      -Math.PI / 2.5,
      Math.PI / 2.6,
      4.2,
      new Vector3(0, 0.9, 0),
      scene,
    );
    camera.lowerRadiusLimit = 1.2;
    camera.upperRadiusLimit = 20;
    camera.wheelDeltaPercentage = 0.02;
    camera.panningSensibility = 300;
    camera.attachControl(canvas, true);

    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 0.8;
    hemi.groundColor = new Color3(0.25, 0.24, 0.3);
    const dir = new DirectionalLight("sun", new Vector3(-0.4, -1, -0.35), scene);
    dir.intensity = 0.85;

    createGroundGrid(scene);
    createHeightRule(scene);
    const collision = createCollisionCylinder(scene, propsRef.current.collisionRadius);

    const initial = propsRef.current;
    const nodes = createFigure(scene, initial.figure);
    liveRef.current = {
      scene,
      nodes,
      signature: figureSignature(initial.figure),
      collision,
      hipsBaseY: hipsBindY(nodes),
      startMs: performance.now(),
    };

    engine.runRenderLoop(() => {
      const live = liveRef.current;
      const p = propsRef.current;
      if (live) {
        const clip = findClip(p.clip);
        if (clip) {
          // `clipRate` > 1 means SLOWER (the undead shamble), so it divides
          // elapsed time — the same convention the bake applies to durations.
          const t = p.playing
            ? (performance.now() - live.startMs) / 1000 / Math.max(p.figure.look.clipRate, 0.01)
            : p.phase * clip.duration;
          applyPose(live.nodes, p.figure, sampleClip(clip, t), live.hipsBaseY);
        } else {
          clearPose(live.nodes, live.hipsBaseY);
        }
      }
      scene.render();
    });

    const resize = new ResizeObserver(() => engine.resize());
    resize.observe(canvas);

    return () => {
      resize.disconnect();
      engine.stopRenderLoop();
      liveRef.current?.nodes.dispose();
      liveRef.current = null;
      scene.dispose();
      engine.dispose();
    };
  }, []);

  // ---- structural rebuild vs. repaint --------------------------------------
  useEffect(() => {
    const live = liveRef.current;
    if (!live) return;
    const sig = figureSignature(props.figure);
    if (sig !== live.signature) {
      live.nodes.dispose();
      live.nodes = createFigure(live.scene, props.figure);
      live.signature = sig;
      live.hipsBaseY = hipsBindY(live.nodes);
    }
    if (props.teamTint === null) repaint(live.nodes, props.figure);
    else setTeamTint(live.nodes, props.figure, props.teamTint);
    setFlash(live.nodes, props.flash);
  }, [props.figure, props.teamTint, props.flash]);

  useEffect(() => {
    const live = liveRef.current;
    if (!live) return;
    live.collision.setEnabled(props.showCollision);
    live.collision.scaling.x = props.collisionRadius;
    live.collision.scaling.z = props.collisionRadius;
  }, [props.showCollision, props.collisionRadius]);

  useEffect(() => {
    const live = liveRef.current;
    if (live) live.startMs = performance.now();
  }, [props.clip, props.playing]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: props.height ?? 420,
        display: "block",
        borderRadius: 8,
        outline: "none",
        touchAction: "none",
      }}
    />
  );
}

export default VoxelCanvas;
