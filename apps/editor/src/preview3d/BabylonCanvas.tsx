/**
 * <BabylonCanvas> — owns ONE Babylon Engine + Scene bound to a canvas.
 *
 * Mount-once semantics: the engine/scene are created exactly once per mounted
 * panel (parent re-renders do NOT recreate them); `onReady` runs at mount and
 * may return a cleanup fn. Live updates flow through the `BabylonStage` handle
 * the parent captures in a ref. Disposes everything on unmount. DPR capped at
 * 2 so 4K/retina screens don't melt in a side panel.
 */
import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

export interface BabylonStage {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
}

export interface BabylonCanvasProps {
  /** called once after engine/scene creation; may return a cleanup fn */
  onReady: (stage: BabylonStage) => void | (() => void);
  /** scene clear color, default editor panel dark */
  clearColor?: [number, number, number, number];
  cameraRadius?: number;
  cameraTarget?: [number, number, number];
  height?: number;
}

const DPR_CAP = 2;

export function BabylonCanvas({
  onReady,
  clearColor = [0.09, 0.1, 0.13, 1],
  cameraRadius = 6,
  cameraTarget = [0, 1, 0],
  height = 260,
}: BabylonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // latest onReady without retriggering the mount effect
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const initialRef = useRef({ clearColor, cameraRadius, cameraTarget });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { stencil: false }, false);
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    engine.setHardwareScalingLevel(1 / dpr);

    const scene = new Scene(engine);
    const init = initialRef.current;
    scene.clearColor = new Color4(...init.clearColor);

    const camera = new ArcRotateCamera(
      "orbit",
      -Math.PI / 2.5,
      Math.PI / 3,
      init.cameraRadius,
      new Vector3(...init.cameraTarget),
      scene,
    );
    camera.lowerRadiusLimit = 0.5;
    camera.upperRadiusLimit = init.cameraRadius * 40;
    camera.wheelDeltaPercentage = 0.02;
    camera.panningSensibility = 200;
    camera.attachControl(canvas, true);

    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 0.75;
    hemi.groundColor = new Color3(0.25, 0.24, 0.3);
    const dir = new DirectionalLight("sun", new Vector3(-0.4, -1, -0.35), scene);
    dir.intensity = 0.9;

    const cleanup = onReadyRef.current({ engine, scene, camera });

    engine.runRenderLoop(() => scene.render());
    const resize = new ResizeObserver(() => engine.resize());
    resize.observe(canvas);

    return () => {
      resize.disconnect();
      engine.stopRenderLoop();
      if (typeof cleanup === "function") cleanup();
      scene.dispose();
      engine.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="preview3d-canvas" style={{ height }} />;
}
