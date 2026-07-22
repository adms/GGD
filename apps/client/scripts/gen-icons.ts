/**
 * gen-icons — programmatically renders the PWA / apple-touch icons (no image
 * dependencies: raw RGBA pixels → the shared scripts/png encoder). A voxel-
 * style blocky "G" in GGD gold on the app's dark navy, rounded-square like
 * iOS expects. Run: tsx apps/client/scripts/gen-icons.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// palette (matches ui/theme.ts / index.html)
const BG: RGBA = [0x10, 0x16, 0x24, 255]; // panel navy
const BG_EDGE: RGBA = [0x0b, 0x0e, 0x14, 255]; // page background
const GOLD: RGBA = [0xf2, 0xc6, 0x37, 255];
const GOLD_DARK: RGBA = [0xb8, 0x92, 0x1f, 255];

type RGBA = [number, number, number, number];

/** 8x8 blocky "G" (voxel look). */
const G_ROWS = [
  ".######.",
  "##....##",
  "##......",
  "##......",
  "##..####",
  "##....##",
  "##....##",
  ".######.",
];

// ---------------------------------------------------------------- drawing --

function drawIcon(size: number): Buffer {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const half = size / 2;
  const corner = size * 0.22; // iOS-ish rounded square
  const gCell = Math.floor((size * 0.6) / 8);
  const gSize = gCell * 8;
  const gOrigin = Math.floor((size - gSize) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-square mask
      const ax = Math.abs(x + 0.5 - c);
      const ay = Math.abs(y + 0.5 - c);
      const qx = Math.max(0, ax - (half - corner));
      const qy = Math.max(0, ay - (half - corner));
      const inside = Math.sqrt(qx * qx + qy * qy) <= corner;
      let color: RGBA = [0, 0, 0, 0];
      if (inside) {
        // subtle radial darkening toward the edges
        const d = Math.sqrt(ax * ax + ay * ay) / half;
        color = d > 0.82 ? BG_EDGE : BG;
        const gx = Math.floor((x - gOrigin) / gCell);
        const gy = Math.floor((y - gOrigin) / gCell);
        if (gx >= 0 && gx < 8 && gy >= 0 && gy < 8 && G_ROWS[gy]![gx] === "#") {
          // fake voxel bevel: darker on the lower-right of each cell
          const inX = (x - gOrigin) % gCell;
          const inY = (y - gOrigin) % gCell;
          const bevel = inX > gCell * 0.72 || inY > gCell * 0.72;
          color = bevel ? GOLD_DARK : GOLD;
        }
      }
      const i = (y * size + x) * 4;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = color[3];
    }
  }
  return px;
}

// ------------------------------------------------------------------- main --

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size] of [
  ["icon-180.png", 180],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
] as const) {
  writeFileSync(join(OUT_DIR, name), encodePng(size, size, drawIcon(size)));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
