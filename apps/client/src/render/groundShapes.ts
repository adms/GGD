/**
 * groundShapes — the flat-on-the-floor primitives shared by every ground
 * indicator: the #152 aim/hold preview (`AimIndicator`) and the #228 cast
 * telegraph (`TelegraphLayer`).
 *
 * It exists so the telegraph is NOT a parallel renderer. Before #228 the only
 * corridor geometry in the client was `AimIndicator.makeLine()` — a private
 * method on a class that can, by construction, only ever draw for the local
 * player (it is fed from `hudStore.localSeatId`). Rather than copy those six
 * lines into the enemy-facing layer and let the two drift, the geometry moved
 * here and both callers use it.
 *
 * CONVENTION. A "ground quad" is a unit `CreatePlane` rotated flat into XZ.
 * After `rotation.x = π/2` the plane's local +Y points along world +Z, so
 * `scaling.set(width, length, 1)` gives a corridor of `width` across and
 * `length` along its yaw, and `rotation.y = atan2(dirX, dirZ)` aims it. The
 * plane is CENTRED, so a corridor that starts at the caster is positioned at
 * `from + dir · length / 2`.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

/** A unit plane lying flat in XZ, double-sided, non-pickable. */
export function createGroundQuad(scene: Scene, name: string): Mesh {
  const mesh = MeshBuilder.CreatePlane(name, { size: 1, sideOrientation: 2 /* DOUBLESIDE */ }, scene);
  mesh.rotation.x = Math.PI / 2;
  mesh.isPickable = false;
  return mesh;
}

/**
 * Aim + stretch a ground quad into the corridor `from → from + dir·length`.
 * `dir` must be unit length (both call sites normalise before they get here).
 */
export function placeGroundQuad(
  mesh: Mesh,
  fromX: number,
  fromZ: number,
  dirX: number,
  dirZ: number,
  length: number,
  width: number,
  y: number,
): void {
  mesh.scaling.set(width, length, 1);
  mesh.rotation.y = Math.atan2(dirX, dirZ);
  mesh.position.set(fromX + (dirX * length) / 2, y, fromZ + (dirZ * length) / 2);
}
