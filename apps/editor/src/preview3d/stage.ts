/**
 * Scene-building helpers shared by the 3D panels. All functions take a Scene
 * and return meshes, so they run under NullEngine in tests (the model
 * inspector's hitbox overlay + the arena primitives are covered there).
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export function flatColorMaterial(
  scene: Scene,
  name: string,
  hex: string,
  opts: { alpha?: number; wireframe?: boolean } = {},
): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  const c = Color3.FromHexString(hex);
  mat.emissiveColor = c;
  mat.diffuseColor = c.scale(0.4);
  mat.specularColor = Color3.Black();
  mat.disableLighting = true;
  if (opts.alpha !== undefined) mat.alpha = opts.alpha;
  if (opts.wireframe) mat.wireframe = true;
  return mat;
}

/** Faint reference grid on the ground plane (line system, no triangles). */
export function createGroundGrid(scene: Scene, size = 10, step = 1): Mesh {
  const half = size / 2;
  const lines: Vector3[][] = [];
  for (let i = -half; i <= half; i += step) {
    lines.push([new Vector3(i, 0, -half), new Vector3(i, 0, half)]);
    lines.push([new Vector3(-half, 0, i), new Vector3(half, 0, i)]);
  }
  const grid = CreateLineSystem("ground-grid", { lines }, scene);
  grid.color = Color3.FromHexString("#39404f");
  grid.isPickable = false;
  return grid;
}

export const COLLISION_CYLINDER_HEIGHT = 1.8;

/**
 * Wireframe hitbox overlay: a UNIT-radius cylinder whose x/z scaling IS the
 * collision radius (so live radius edits are a scaling write, not a rebuild).
 */
export function createCollisionCylinder(scene: Scene, radius: number): Mesh {
  const mesh = CreateCylinder(
    "collision-radius",
    { diameter: 2, height: COLLISION_CYLINDER_HEIGHT, tessellation: 32, subdivisions: 1 },
    scene,
  );
  mesh.position.y = COLLISION_CYLINDER_HEIGHT / 2;
  mesh.material = flatColorMaterial(scene, "collision-radius-mat", "#e06c5b", {
    wireframe: true,
    alpha: 0.8,
  });
  mesh.isPickable = false;
  setCollisionRadius(mesh, radius);
  return mesh;
}

export function setCollisionRadius(mesh: Mesh, radius: number): void {
  mesh.scaling.x = radius;
  mesh.scaling.z = radius;
}

/** Horizontal disc (ground patch / obstacle footprint) at y just above 0. */
export function createFlatDisc(
  scene: Scene,
  name: string,
  center: { x: number; z: number },
  radius: number,
  hex: string,
  opts: { alpha?: number; y?: number } = {},
): Mesh {
  const disc = CreateDisc(name, { radius, tessellation: 48 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(center.x, opts.y ?? 0.01, center.z);
  disc.material = flatColorMaterial(scene, `${name}-mat`, hex, { alpha: opts.alpha });
  disc.isPickable = false;
  return disc;
}

/** Thin wall box between two ground points (segment obstacles). */
export function createSegmentWall(
  scene: Scene,
  name: string,
  a: { x: number; z: number },
  b: { x: number; z: number },
  hex: string,
  opts: { alpha?: number; height?: number; thickness?: number } = {},
): Mesh {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 0.001;
  const height = opts.height ?? 1.2;
  const box = CreateBox(name, { width: len, height, depth: opts.thickness ?? 0.3 }, scene);
  box.position.set((a.x + b.x) / 2, height / 2, (a.z + b.z) / 2);
  box.rotation.y = -Math.atan2(dz, dx);
  box.material = flatColorMaterial(scene, `${name}-mat`, hex, { alpha: opts.alpha });
  box.isPickable = false;
  return box;
}
