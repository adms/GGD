/**
 * voxelFoundryPaint — the preview for 體素鑄造廠, drawn with a 2D canvas and
 * nothing else.
 *
 * ── WHY NOT BABYLON ─────────────────────────────────────────────────────────
 * 鑄形工坊's preview is a real Babylon scene, which is why 鑄形工坊 can never be
 * in a production bundle: `contentGate.test.ts` fails a build that emits
 * `ArcRotateCamera` / `HemisphericLight` / `BABYLON` anywhere, and it is right
 * to — ~1 MB of engine shipped to every operator so a figure can spin is a bad
 * trade on a page whose entire subject is asset weight.
 *
 * A blocky humanoid is 14 AXIS-ALIGNED BOXES. Under an orthographic camera that
 * is 14 hexagons, and painter's-algorithm depth sorting is exact for
 * non-intersecting axis-aligned boxes at a fixed view angle. So the honest
 * amount of code for this preview is this file, and the honest dependency count
 * is zero.
 *
 * ── WHAT IT IS ALLOWED TO CLAIM ─────────────────────────────────────────────
 * It draws `buildFigure(look).boxes` — the SAME boxes the bake writes, the same
 * palette slots, the same joint-scale chain — so "the shape is right" is true
 * by construction. It does NOT claim to be the in-game render: no skinning, no
 * animation, no lighting model beyond a fixed per-face shade. The three
 * face shades are the same 4 %-per-row darkening the palette texture bakes, so
 * the colours match what the material samples rather than approximating it.
 */
import { buildFigure, type VoxelFigure, type VoxelLook } from "@ggd/shared/voxel";

/** Camera yaw/pitch in radians — a three-quarter view, like champ-select. */
const YAW = -0.62;
const PITCH = 0.28;

/** Per-face brightness. Top brightest, front mid, side darkest. */
const SHADE = { top: 1.0, front: 0.86, side: 0.68 } as const;

type P3 = readonly [number, number, number];

function rotate(p: P3): P3 {
  const [x, y, z] = p;
  const cy = Math.cos(YAW);
  const sy = Math.sin(YAW);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const cp = Math.cos(PITCH);
  const sp = Math.sin(PITCH);
  const y1 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  return [x1, y1, z2];
}

function shadeHex(hex: string, k: number): string {
  const h = hex.replace("#", "");
  const r = Math.min(255, Math.round(parseInt(h.slice(0, 2), 16) * k));
  const g = Math.min(255, Math.round(parseInt(h.slice(2, 4), 16) * k));
  const b = Math.min(255, Math.round(parseInt(h.slice(4, 6), 16) * k));
  const two = (v: number): string => v.toString(16).padStart(2, "0");
  return `#${two(r)}${two(g)}${two(b)}`;
}

interface Face {
  /** four corners in rotated space */
  pts: P3[];
  color: string;
  /** depth key — larger draws later (nearer the camera) */
  depth: number;
}

/** The 8 corners of an axis-aligned box, in world units. */
function corners(center: P3, size: P3): P3[] {
  const [cx, cy, cz] = center;
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const out: P3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) out.push([cx + sx * hx, cy + sy * hy, cz + sz * hz]);
    }
  }
  return out;
}

/** Index into `corners()` output: bit 2 = x sign, bit 1 = y sign, bit 0 = z sign. */
const IDX = (sx: 0 | 1, sy: 0 | 1, sz: 0 | 1): number => sx * 4 + sy * 2 + sz;

/**
 * The three faces of a box that can face the camera under this fixed view:
 * +Y (top), and one each of ±X / ±Z chosen by the camera direction. Drawing
 * only three is not an optimisation, it is correctness — the back faces would
 * overpaint the front ones under a painter's algorithm.
 */
function visibleFaces(c: P3[], color: string): Face[] {
  const rot = c.map(rotate);
  const key = (ids: number[]): number =>
    ids.reduce((m, i) => Math.max(m, rot[i]![2]), -Infinity);
  const face = (ids: number[], shade: number): Face => ({
    pts: ids.map((i) => rot[i]!),
    color: shadeHex(color, shade),
    depth: key(ids),
  });
  // With YAW < 0 the camera sees +X and +Z. Those signs are fixed by the two
  // constants above, so this does not need a per-box normal test.
  return [
    face([IDX(0, 1, 0), IDX(0, 1, 1), IDX(1, 1, 1), IDX(1, 1, 0)], SHADE.top),
    face([IDX(0, 0, 1), IDX(0, 1, 1), IDX(1, 1, 1), IDX(1, 0, 1)], SHADE.front),
    face([IDX(1, 0, 0), IDX(1, 1, 0), IDX(1, 1, 1), IDX(1, 0, 1)], SHADE.side),
  ];
}

export interface PaintOptions {
  /** canvas background; `null` leaves it transparent */
  background?: string | null;
  /** draw the 0..1.8 u height ruler */
  ruler?: boolean;
}

/**
 * Paint a look into a canvas. Returns false when there is no 2D context (a
 * headless test env), so the caller can degrade honestly instead of showing an
 * empty box and calling it a preview.
 */
export function paintFigure(
  canvas: HTMLCanvasElement,
  look: VoxelLook,
  opts: PaintOptions = {},
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const figure = buildFigure(look);
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, w, h);
  }

  const faces: Face[] = [];
  for (const box of figure.boxes) {
    faces.push(
      ...visibleFaces(corners(box.center as P3, box.size as P3), box.color),
    );
  }
  if (faces.length === 0) return true;

  // fit: measure the projected extent, then scale so the figure fills ~86 %
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const f of faces) {
    for (const p of f.pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((w * 0.86) / spanX, (h * 0.86) / spanY);
  const ox = w / 2 - ((minX + maxX) / 2) * scale;
  // canvas y grows downward; the figure's y grows upward
  const oy = h / 2 + ((minY + maxY) / 2) * scale;
  const px = (p: P3): [number, number] => [ox + p[0] * scale, oy - p[1] * scale];

  faces.sort((a, b) => a.depth - b.depth);
  for (const f of faces) {
    ctx.beginPath();
    const first = px(f.pts[0]!);
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < f.pts.length; i++) {
      const q = px(f.pts[i]!);
      ctx.lineTo(q[0], q[1]);
    }
    ctx.closePath();
    ctx.fillStyle = f.color;
    ctx.fill();
    // a hairline in the same colour closes the seams antialiasing opens up
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (opts.ruler) drawRuler(ctx, figure, w, h, scale, oy);
  return true;
}

/** The 1.8 u target-height mark — the #150 number, drawn rather than asserted. */
function drawRuler(
  ctx: CanvasRenderingContext2D,
  figure: VoxelFigure,
  w: number,
  h: number,
  scale: number,
  oy: number,
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  for (const [u, label] of [
    [0, "0"],
    [figure.height, `${figure.height.toFixed(2)}u`],
  ] as const) {
    const y = oy - u * scale;
    if (y < 0 || y > h) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.fillText(label, 4, y - 3);
    ctx.setLineDash([3, 3]);
  }
  ctx.restore();
}

/** The numbers the page prints under the canvas — measured, not guessed. */
export function figureReadout(look: VoxelLook): {
  height: number;
  docScale: number;
  triangles: number;
  boxes: number;
} {
  const f = buildFigure(look);
  return { height: f.height, docScale: f.docScale, triangles: f.triCount, boxes: f.boxes.length };
}
