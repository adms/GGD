/**
 * DecorFade — pure segment-vs-AABB + easing math, and the material fade
 * lifecycle (ghost while blocked → restore when clear) on Babylon's
 * NullEngine (headless).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import {
  DecorFader,
  DECOR_FADE_ALPHA,
  easeFadeStep,
  segmentIntersectsAabb,
} from "./DecorFade";

describe("segmentIntersectsAabb", () => {
  // tower-like box: x/z ∈ [-1, 1], y ∈ [0, 6]
  const box = [-1, 0, -1, 1, 6, 1] as const;
  const hit = (
    p0: [number, number, number],
    p1: [number, number, number],
  ): boolean =>
    segmentIntersectsAabb(...p0, ...p1, box[0], box[1], box[2], box[3], box[4], box[5]);

  it("detects a camera→hero segment passing through the box", () => {
    // camera south+above, hero hidden north behind the box
    expect(hit([0, 8, -6], [0, 1.1, 3])).toBe(true);
  });

  it("misses when the sightline passes beside the box", () => {
    expect(hit([10, 8, -6], [10, 1.1, 3])).toBe(false);
  });

  it("misses when the segment ends before reaching the box", () => {
    // hero stands SOUTH of the box — nothing between camera and hero
    expect(hit([0, 8, -6], [0, 1.1, -3])).toBe(false);
  });

  it("handles axis-parallel (degenerate) segments", () => {
    expect(hit([0, -1, 0], [0, 7, 0])).toBe(true); // vertical through
    expect(hit([5, -1, 0], [5, 7, 0])).toBe(false); // vertical beside
  });

  it("treats a segment starting inside the box as blocked", () => {
    expect(hit([0, 1, 0], [0, 9, -9])).toBe(true);
  });
});

describe("easeFadeStep", () => {
  it("moves toward the target without overshooting", () => {
    const a = easeFadeStep(1, DECOR_FADE_ALPHA, 16);
    expect(a).toBeLessThan(1);
    expect(a).toBeGreaterThan(DECOR_FADE_ALPHA);
  });

  it("converges and snaps exactly onto the target", () => {
    let v = 1;
    for (let i = 0; i < 200; i++) v = easeFadeStep(v, DECOR_FADE_ALPHA, 16);
    expect(v).toBe(DECOR_FADE_ALPHA);
    for (let i = 0; i < 200; i++) v = easeFadeStep(v, 1, 16);
    expect(v).toBe(1);
  });

  it("is a no-op at the target", () => {
    expect(easeFadeStep(1, 1, 16)).toBe(1);
    expect(easeFadeStep(DECOR_FADE_ALPHA, DECOR_FADE_ALPHA, 16)).toBe(DECOR_FADE_ALPHA);
  });
});

describe("DecorFader (NullEngine)", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterAll(() => {
    scene.dispose();
    engine.dispose();
  });

  it("ghosts a blocking prop and restores it once the sightline clears", () => {
    const root = new TransformNode("tower", scene);
    const box = MeshBuilder.CreateBox("t-box", { width: 2, height: 6, depth: 2 }, scene);
    box.position.y = 3;
    box.parent = root;
    const mat = new StandardMaterial("t-mat", scene);
    box.material = mat;
    const originalMode = mat.transparencyMode;
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);

    const fader = new DecorFader();
    fader.register(root, min, max);
    expect(fader.size).toBe(1);

    // camera follows the hero standing 3u NORTH of the tower → blocked
    const cams = [{ x: 0, y: 8.19, z: -2.74 }];
    const heroes = [{ x: 0, z: 3 }];
    fader.update(16, cams, 1, heroes, 1);
    expect(mat.alpha).toBeLessThan(1); // easing started
    for (let i = 0; i < 300; i++) fader.update(16, cams, 1, heroes, 1);
    expect(mat.alpha).toBe(DECOR_FADE_ALPHA);
    expect(mat.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);

    // hero steps far aside → sightline clear → prop restores fully
    heroes[0]!.x = 30;
    for (let i = 0; i < 300; i++) fader.update(16, cams, 1, heroes, 1);
    expect(mat.alpha).toBe(1);
    expect(mat.transparencyMode).toBe(originalMode);

    fader.clear();
    expect(fader.size).toBe(0);
  });
});
