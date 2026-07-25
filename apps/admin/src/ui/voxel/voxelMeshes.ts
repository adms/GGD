/**
 * voxelMeshes — the ONLY Babylon-aware module in 鑄形工坊, and deliberately a
 * MECHANICAL translation of `VoxelFigure`.
 *
 * It makes no shape decisions of its own: every position, size and colour comes
 * from `@ggd/shared/voxel`'s `buildFigure`, and every rotation from that
 * package's `sampleClip`. That is what makes the preview trustworthy — there is
 * no second opinion about the character in here to drift from the bake's.
 *
 * The `outlineRenderer` side-effect import is LOAD-BEARING, not tidiness: as
 * `ChampionView.ts` documents, without it `renderOverlay` / `overlayColor` /
 * `overlayAlpha` are inert expandos and the #64 hit-flash preview silently does
 * nothing while appearing to be wired up.
 */
import "@babylonjs/core/Rendering/outlineRenderer";
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { SampledPose, VoxelFigure } from "@ggd/shared/voxel";

export interface FigureNodes {
  readonly root: TransformNode;
  readonly joints: readonly TransformNode[];
  readonly meshes: readonly Mesh[];
  readonly materials: readonly StandardMaterial[];
  /** joint name → index, for posing */
  readonly jointIndex: Readonly<Record<string, number>>;
  dispose(): void;
}

/**
 * Build the whole figure. Called on a STRUCTURAL change (proportions, props);
 * a palette-only edit goes through `repaint` instead, so dragging a colour
 * picker never disposes a mesh.
 */
export function createFigure(scene: Scene, figure: VoxelFigure): FigureNodes {
  const root = new TransformNode("voxel-root", scene);
  const joints: TransformNode[] = [];
  const jointIndex: Record<string, number> = {};

  figure.joints.forEach((j, i) => {
    const node = new TransformNode(`joint:${j.name}`, scene);
    node.parent = j.parent >= 0 ? joints[j.parent]! : root;
    node.position = new Vector3(...j.localPosition);
    node.scaling = new Vector3(...j.localScale);
    node.rotation = new Vector3(0, 0, 0);
    joints[i] = node;
    jointIndex[j.name] = i;
  });

  // ONE material per distinct colour, not per box: #49's tint clones per SOURCE
  // material, so a small material count is what keeps team tinting cheap.
  const materials = new Map<string, StandardMaterial>();
  const materialList: StandardMaterial[] = [];
  const meshes: Mesh[] = [];

  for (const box of figure.boxes) {
    const mesh = CreateBox(
      box.name,
      { width: box.localSize[0], height: box.localSize[1], depth: box.localSize[2] },
      scene,
    );
    mesh.parent = joints[box.jointIndex] ?? root;
    mesh.position = new Vector3(...box.localCenter);
    mesh.isPickable = false;
    let mat = materials.get(box.color);
    if (!mat) {
      mat = new StandardMaterial(`voxel-mat-${materials.size}`, scene);
      mat.diffuseColor = Color3.FromHexString(box.color);
      mat.specularColor = new Color3(0.04, 0.04, 0.05);
      materials.set(box.color, mat);
      materialList.push(mat);
    }
    mesh.material = mat;
    meshes.push(mesh);
  }

  return {
    root,
    joints,
    meshes,
    materials: materialList,
    jointIndex,
    dispose() {
      for (const m of meshes) m.dispose();
      for (const m of materialList) m.dispose();
      for (const j of joints) j.dispose();
      root.dispose();
    },
  };
}

/**
 * Re-colour in place. A palette edit is by far the most common interaction and
 * it changes no geometry, so it must not cost a rebuild.
 */
export function repaint(nodes: FigureNodes, figure: VoxelFigure): void {
  figure.boxes.forEach((box, i) => {
    const mesh = nodes.meshes[i];
    if (!mesh) return;
    const mat = mesh.material as StandardMaterial | null;
    if (mat) mat.diffuseColor = Color3.FromHexString(box.color);
  });
}

/**
 * A structural rebuild is needed when the BOX SET or any transform changed.
 * Comparing the cheap signature (names + sizes + joint transforms) is what lets
 * `repaint` be safe: if this returns false, box i in the new figure is box i in
 * the old one.
 */
export function figureSignature(figure: VoxelFigure): string {
  const boxes = figure.boxes
    .map((b) => `${b.name}:${b.localSize.join(",")}:${b.localCenter.join(",")}`)
    .join("|");
  const joints = figure.joints
    .map((j) => `${j.name}:${j.localPosition.join(",")}:${j.localScale.join(",")}`)
    .join("|");
  return `${boxes}#${joints}`;
}

/**
 * Write one sampled clip frame onto the joint nodes.
 *
 * `poseBias` is added here (not baked into the node rest pose) for the reason
 * `archetypes.ts` gives: every clip drives every rotation channel, so a rest
 * tilt would be overwritten on the first frame. Doing it the same way as the
 * bake is the point — a preview that leaned differently would be a lie about
 * the undead.
 */
export function applyPose(
  nodes: FigureNodes,
  figure: VoxelFigure,
  pose: SampledPose,
  hipsBaseY: number,
): void {
  const bias = figure.look.poseBias;
  for (const [name, rot] of Object.entries(pose.rot)) {
    const idx = nodes.jointIndex[name];
    if (idx === undefined) continue;
    const node = nodes.joints[idx];
    if (!node) continue;
    const b = bias[name as keyof typeof bias] ?? [0, 0, 0];
    node.rotation.set(rot[0] + b[0], rot[1] + b[1], rot[2] + b[2]);
  }
  const hips = nodes.joints[nodes.jointIndex["hips"] ?? -1];
  if (hips) {
    hips.position.x = pose.hips[0];
    hips.position.y = hipsBaseY + pose.hips[1];
    hips.position.z = pose.hips[2];
  }
}

/** Reset every driven joint to bind (used when the scrubber is parked at 0). */
export function clearPose(nodes: FigureNodes, hipsBaseY: number): void {
  for (const node of nodes.joints) node.rotation.set(0, 0, 0);
  const hips = nodes.joints[nodes.jointIndex["hips"] ?? -1];
  if (hips) hips.position.set(0, hipsBaseY, 0);
}

/** #64's hit flash: paint every box, exactly as ChampionView does. */
export function setFlash(nodes: FigureNodes, on: boolean): void {
  for (const mesh of nodes.meshes) {
    mesh.renderOverlay = on;
    mesh.overlayColor = new Color3(1, 0.35, 0.3);
    mesh.overlayAlpha = 0.55;
  }
}

/** #49's team tint preview: multiply every material by the team colour. */
export function setTeamTint(
  nodes: FigureNodes,
  figure: VoxelFigure,
  tint: readonly [number, number, number] | null,
): void {
  figure.boxes.forEach((box, i) => {
    const mesh = nodes.meshes[i];
    const mat = mesh?.material as StandardMaterial | null;
    if (!mat) return;
    const base = Color3.FromHexString(box.color);
    mat.diffuseColor = tint === null ? base : new Color3(base.r * tint[0], base.g * tint[1], base.b * tint[2]);
  });
}
