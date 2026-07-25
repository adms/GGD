/**
 * figure — resolve a `VoxelLook` into the concrete boxes and joint transforms a
 * renderer can draw, in WORLD UNITS, with feet at y = 0.
 *
 * This is the one function the admin studio, the offline bake and (once #226's
 * client half lands) `ChampionView` all call. Everything downstream is a thin
 * adapter: the studio turns `FigureBox[]` into Babylon boxes, the bake turns
 * the same list into glTF primitives. Because the geometry decision happens
 * exactly once, "the preview shows what ships" is a property of the code rather
 * than a promise in a comment.
 *
 * ── UNITS ───────────────────────────────────────────────────────────────────
 * `boxman.ts` authors in VOXEL PX (integers, 32 px = one figure). Everything
 * this module RETURNS is in WORLD UNITS (px × PX). Mixing the two is the
 * likeliest way to break the share, so the conversion happens in exactly one
 * place, at the end of `buildFigure`.
 *
 * ── #150 (uniform on-screen height) ─────────────────────────────────────────
 * A studio that lets an operator scale the head and the legs can trivially
 * produce a 2.6 u figure, and #150's whole point is that every champion renders
 * at the same height. So `buildFigure` MEASURES the posed silhouette and
 * reports `docScale = TARGET_HEIGHT / height`, which is what `toModelDoc`
 * writes into `model@1.scale`. The operator cannot break uniform height by
 * dragging a slider; he can only change the shape that gets normalised. The
 * default look measures exactly 32 px → 1.8 u → `docScale === 1`, which is
 * #226's "honest 1.0" invariant, asserted in `figure.test.ts`.
 *
 * ── #68/#1 (orientation) ────────────────────────────────────────────────────
 * Forward is +Z, matching `glbFacing.NATIVE_GLB_YAW_OFFSET = 0`. The `face`
 * box on the head's +Z side is the witness: `figure.test.ts` asserts its centre
 * has a positive z, so a bake that flipped the axis fails a test instead of
 * shipping a champion who runs backwards.
 */
import {
  BOXES,
  JOINTS,
  JOINT_INDEX,
  PROP_JOINTS,
  PX,
  SLOT,
  jointGlobals,
  type BoxDef,
  type PropGroup,
  type SlotName,
} from "./boxman";
import {
  jointOffsetOf,
  jointScaleOf,
  SHAPED_JOINTS,
  type PropKey,
  type ShapedJoint,
  type Vec3,
  type VoxelLook,
} from "./look";

/** #150's normalisation target — the same constant as `ChampionView.TARGET_HEIGHT`. */
export const TARGET_HEIGHT = 1.8;

export interface FigureJoint {
  readonly name: string;
  readonly parent: number;
  /** translation from the PARENT joint, world units (parent's scale already applied) */
  readonly localPosition: Vec3;
  /** scale to write on this node; multiplies down the hierarchy, as Babylon does */
  readonly localScale: Vec3;
  /** absolute position in world units, feet-relative (y = 0 is the floor) */
  readonly position: Vec3;
}

export interface FigureBox {
  readonly name: string;
  readonly joint: string;
  readonly jointIndex: number;
  readonly slot: SlotName;
  readonly group: PropGroup;
  /** centre relative to its joint's node, world units, BEFORE the joint's scale */
  readonly localCenter: Vec3;
  /** un-scaled box size in world units (the node's scale supplies the rest) */
  readonly localSize: Vec3;
  /** absolute centre, world units, feet-relative — for measuring and testing */
  readonly center: Vec3;
  /** absolute size after the joint's scale chain */
  readonly size: Vec3;
  /** `#rrggbb` from the look's palette */
  readonly color: string;
}

export interface VoxelFigure {
  readonly look: VoxelLook;
  readonly joints: readonly FigureJoint[];
  /** VISIBLE boxes only — a collapsed prop is absent, not a zero-size mesh */
  readonly boxes: readonly FigureBox[];
  /** measured silhouette height in world units */
  readonly height: number;
  /** widest horizontal extent, for the collision-radius sanity readout */
  readonly halfWidth: number;
  /** 12 triangles per visible box */
  readonly triCount: number;
  /** what `model@1.scale` must be so this figure renders TARGET_HEIGHT tall */
  readonly docScale: number;
  readonly attachPoints: Readonly<Record<string, { x: number; y: number; z: number }>>;
}

type Triple = [number, number, number];

const mul = (a: Triple, b: Triple): Triple => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

const isShaped = (name: string): name is ShapedJoint =>
  (SHAPED_JOINTS as readonly string[]).includes(name);

/** Joints a prop group owns, so the mask can collapse them. */
const PROP_JOINT_OWNER: Readonly<Record<string, PropKey>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PROP_JOINTS).flatMap(([group, joints]) =>
      joints.map((j) => [j, group as PropKey]),
    ),
  ),
);

/**
 * The local scale a joint gets under this look: the author's proportion slider
 * for a body joint, and 0 (fully collapsed) for a prop carrier the look does
 * not wear. Zeroing the CARRIER rather than deleting the box is #226's
 * mechanism and is what lets one baked mesh serve every prop combination.
 */
function localScaleFor(look: VoxelLook, jointName: string): Triple {
  const owner = PROP_JOINT_OWNER[jointName];
  if (owner !== undefined) return look.props.includes(owner) ? [1, 1, 1] : [0, 0, 0];
  if (isShaped(jointName)) {
    const s = jointScaleOf(look, jointName);
    return [s[0], s[1], s[2]];
  }
  return [1, 1, 1];
}

function localOffsetFor(look: VoxelLook, jointName: string): Triple {
  if (!isShaped(jointName)) return [0, 0, 0];
  const o = jointOffsetOf(look, jointName);
  return [o[0], o[1], o[2]];
}

function colorFor(look: VoxelLook, slot: SlotName): string {
  return look.palette[SLOT[slot]] ?? "#ffffff";
}

/**
 * Resolve a look into drawable geometry.
 *
 * The joint maths mirrors what a scene graph does, deliberately: a child's
 * translation is expressed in the PARENT's scaled space, so scaling the chest
 * moves the arms with it exactly as Babylon (and glTF) would. Reimplementing it
 * any other way here would make the preview subtly disagree with the runtime
 * the moment a non-unit scale appears — which is the first thing an operator
 * does.
 */
export function buildFigure(look: VoxelLook): VoxelFigure {
  const bind = jointGlobals();
  const chain: Triple[] = [];
  const absPx: Triple[] = [];
  const localPx: Triple[] = [];
  const localScale: Triple[] = [];

  JOINTS.forEach((j, i) => {
    const parentChain: Triple = j.parent >= 0 ? chain[j.parent]! : [1, 1, 1];
    const parentPos: Triple = j.parent >= 0 ? absPx[j.parent]! : [0, 0, 0];
    const off = localOffsetFor(look, j.name);
    const local: Triple = [
      (j.local[0] + off[0]) * parentChain[0],
      (j.local[1] + off[1]) * parentChain[1],
      (j.local[2] + off[2]) * parentChain[2],
    ];
    const s = localScaleFor(look, j.name);
    localScale[i] = s;
    localPx[i] = local;
    absPx[i] = [parentPos[0] + local[0], parentPos[1] + local[1], parentPos[2] + local[2]];
    chain[i] = mul(parentChain, s);
  });

  const visible = (box: BoxDef): boolean => {
    const owner = PROP_JOINT_OWNER[box.joint];
    return owner === undefined || look.props.includes(owner);
  };

  interface Raw {
    def: BoxDef;
    jointIndex: number;
    centerPx: Triple;
    sizePx: Triple;
    localCenterPx: Triple;
  }

  const raws: Raw[] = [];
  for (const def of BOXES) {
    if (!visible(def)) continue;
    const ji = JOINT_INDEX[def.joint];
    if (ji === undefined) continue;
    const g = bind[ji]!;
    const c = chain[ji]!;
    // centre expressed relative to the joint's BIND position, then re-anchored
    // at the joint's posed position through the joint's own scale chain
    const rel: Triple = [def.center[0] - g[0], def.center[1] - g[1], def.center[2] - g[2]];
    const p = absPx[ji]!;
    raws.push({
      def,
      jointIndex: ji,
      centerPx: [p[0] + rel[0] * c[0], p[1] + rel[1] * c[1], p[2] + rel[2] * c[2]],
      sizePx: [def.size[0] * c[0], def.size[1] * c[1], def.size[2] * c[2]],
      localCenterPx: rel,
    });
  }

  // measure BEFORE converting, so the floor shift is one subtraction
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let halfWidthPx = 0;
  for (const r of raws) {
    minY = Math.min(minY, r.centerPx[1] - r.sizePx[1] / 2);
    maxY = Math.max(maxY, r.centerPx[1] + r.sizePx[1] / 2);
    halfWidthPx = Math.max(
      halfWidthPx,
      Math.abs(r.centerPx[0]) + r.sizePx[0] / 2,
      Math.abs(r.centerPx[2]) + r.sizePx[2] / 2,
    );
  }
  if (!Number.isFinite(minY)) {
    minY = 0;
    maxY = 0;
  }
  const heightPx = Math.max(maxY - minY, 1e-6);

  const joints: FigureJoint[] = JOINTS.map((j, i) => ({
    name: j.name,
    parent: j.parent,
    localPosition: [
      localPx[i]![0] * PX,
      (j.parent >= 0 ? localPx[i]![1] : localPx[i]![1] - minY) * PX,
      localPx[i]![2] * PX,
    ] as Vec3,
    localScale: localScale[i]! as Vec3,
    position: [absPx[i]![0] * PX, (absPx[i]![1] - minY) * PX, absPx[i]![2] * PX] as Vec3,
  }));

  const boxes: FigureBox[] = raws.map((r) => ({
    name: r.def.name,
    joint: r.def.joint,
    jointIndex: r.jointIndex,
    slot: r.def.slot,
    group: r.def.group,
    localCenter: [r.localCenterPx[0] * PX, r.localCenterPx[1] * PX, r.localCenterPx[2] * PX] as Vec3,
    localSize: [r.def.size[0] * PX, r.def.size[1] * PX, r.def.size[2] * PX] as Vec3,
    center: [r.centerPx[0] * PX, (r.centerPx[1] - minY) * PX, r.centerPx[2] * PX] as Vec3,
    size: [r.sizePx[0] * PX, r.sizePx[1] * PX, r.sizePx[2] * PX] as Vec3,
    color: colorFor(look, r.def.slot),
  }));

  const height = heightPx * PX;
  const at = (name: string): Triple => {
    const i = JOINT_INDEX[name];
    if (i === undefined) return [0, 0, 0];
    const p = absPx[i]!;
    return [p[0] * PX, (p[1] - minY) * PX, p[2] * PX];
  };
  // The grip joint hangs off the right hand; mirroring its LOCAL offset gives
  // an honest left-hand point without inventing a second joint the bake would
  // not emit.
  const weapon = at("weapon");
  const handRight = at("handRight");
  const handLeft = at("handLeft");
  const grip: Triple = [
    weapon[0] - handRight[0],
    weapon[1] - handRight[1],
    weapon[2] - handRight[2],
  ];

  return {
    look,
    joints,
    boxes,
    height,
    halfWidth: halfWidthPx * PX,
    triCount: boxes.length * 12,
    docScale: TARGET_HEIGHT / height,
    attachPoints: {
      rightHand: { x: r3(weapon[0]), y: r3(weapon[1]), z: r3(weapon[2]) },
      leftHand: {
        x: r3(handLeft[0] + grip[0]),
        y: r3(handLeft[1] + grip[1]),
        z: r3(handLeft[2] + grip[2]),
      },
      chest: { x: r3(at("chest")[0]), y: r3(at("chest")[1]), z: r3(at("chest")[2]) },
      overhead: { x: 0, y: r3(height + 0.15), z: 0 },
    },
  };
}

/** 4 decimals — enough for a millimetre at this scale, stable across a JSON round-trip. */
function r3(v: number): number {
  return Math.round(v * 10000) / 10000;
}
