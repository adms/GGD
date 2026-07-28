/**
 * voxel:build — 特徵生成 batch three's LOCAL half (docs/_體素特徵生成規格.md §5.2).
 *
 *   pnpm voxel:build           write content/assets/models/champions/voxel-*.{png,glb}
 *   pnpm voxel:build --check   verify the shipped files match, byte for byte
 *
 * ── WHY THIS IS A LOCAL CLI AND NOT A SERVER ROUTE ─────────────────────────
 * The owner's constraint on the whole feature is 「後台自動產出，但貼圖在地端
 * 生成」, and §5.3 turns that into a contract: 條碼規格 JSON 是唯一契約；後台永遠
 * 不產生像素，地端永遠不決定顏色. This file is the 地端 side. It reads
 * `content/models/_voxel-barcodes.json` and decides NOTHING about colour — every
 * hex it writes came out of that file. What it does decide is bytes: which
 * texel, which PNG, which .glb.
 *
 * ── THE PIPELINE IS THE EXISTING ONE ───────────────────────────────────────
 *   barcode JSON → paintVoxelAtlas (voxelSkin/paint)  → 64×64 RGBA
 *                → encodePng      (voxel/pngWrite)    → the .png on disk
 *                → bakeBarcodeLook(voxel/bake → glbWrite) → the .glb on disk
 * No second painter, no second encoder, no second emitter. The PNG written
 * beside the .glb and the PNG embedded INSIDE it are the same bytes, which is
 * what `build.test.ts` checks rather than assumes.
 *
 * ── ONLY APPROVED BARCODES ARE BUILT ───────────────────────────────────────
 * 規格 §5.2 says 「讀已核准條碼」. Approved means BOTH: the barcode is paintable
 * (`barcodeErrors` empty) and its authority is settled — `manual` is the owner's
 * own L0 decision, and an `extracted` one has to carry a PASS verdict. Anything
 * else is printed with its reason and skipped. A build that quietly shipped a
 * FAIL-graded extraction would be the whole guard table wasted.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bakeBarcodeLook,
  barcodeFigureLook,
  barcodeFileNames,
  encodePng,
} from "@ggd/shared/voxel";
import {
  ATLAS_H,
  ATLAS_W,
  barcodeErrors,
  generateVoxelSkin,
  paintVoxelAtlas,
  voxelSkinInputOf,
  type VoxelBarcode,
  type VoxelBarcodesFile,
  type VoxelSkinInput,
  type VoxelSkinOverride,
  type VoxelSkinOverridesFile,
} from "@ggd/shared/content/voxelSkin";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../..");
export const CONTENT_DIR = path.join(REPO_ROOT, "content");
export const OUT_DIR = path.join(REPO_ROOT, "content/assets/models/champions");
export const BARCODES_FILE = path.join(CONTENT_DIR, "models/_voxel-barcodes.json");

export interface BuildRow {
  championId: string;
  barcode: VoxelBarcode;
  /** the 64×64 RGBA atlas — the ONE artefact everything else is derived from */
  atlas: Uint8ClampedArray;
  png: Uint8Array;
  glb: Uint8Array;
  triangles: number;
}

export interface SkippedRow {
  championId: string;
  reasons: string[];
}

/** Read the barcode file. Throws loudly — a missing contract is not a warning. */
export function readBarcodes(file = BARCODES_FILE): VoxelBarcodesFile {
  return JSON.parse(fs.readFileSync(file, "utf8")) as VoxelBarcodesFile;
}

/**
 * 已核准 — see the header. Returns the reasons it is NOT approved, empty when it
 * is, so the caller can print them instead of a bare boolean.
 */
export function approvalReasons(barcode: VoxelBarcode): string[] {
  const reasons = barcodeErrors(barcode).map((i) => i.message);
  if (barcode.source === "extracted") {
    const verdict = barcode.extraction?.verdict;
    if (verdict !== "PASS") reasons.push(`extraction verdict ${verdict ?? "(missing)"} ≠ PASS`);
  } else if (barcode.source !== "manual") {
    reasons.push(`source '${barcode.source}' 未經核准（只有 manual 或 extracted+PASS 會出貨）`);
  }
  return reasons;
}

/**
 * The generator input for a champion, from its authored doc when one exists.
 *
 * READ ONLY, and never written back — champion docs are mirrored storage. The
 * doc matters because the recipe supplies the FACE and the chest emblem that
 * sit on top of the bands, and the client builds its recipe from the same
 * fields (`voxelSkinInputOf`). Feeding this build a thinner input would give the
 * shipped .png a different face from the one the game paints at runtime — two
 * generators wearing one name, which is the failure #229 exists to prevent.
 */
export function inputForChampion(championId: string, contentDir = CONTENT_DIR): VoxelSkinInput {
  const file = path.join(contentDir, "champions", `${championId}.json`);
  if (!fs.existsSync(file)) return { id: championId };
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  return voxelSkinInputOf({ ...(doc as { id: string }), id: championId });
}

/** The L1 hand-authored overrides, the same sidecar the client fetches. */
export function readOverrides(contentDir = CONTENT_DIR): Record<string, VoxelSkinOverride> {
  const file = path.join(contentDir, "models/_voxel-skins.json");
  if (!fs.existsSync(file)) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as VoxelSkinOverridesFile;
  return parsed.overrides ?? {};
}

/** Build every approved barcode. Pure over the filesystem it reads. */
export function buildAll(contentDir = CONTENT_DIR): { rows: BuildRow[]; skipped: SkippedRow[] } {
  const file = readBarcodes(path.join(contentDir, "models/_voxel-barcodes.json"));
  const overrides = readOverrides(contentDir);
  const rows: BuildRow[] = [];
  const skipped: SkippedRow[] = [];
  for (const [championId, barcode] of Object.entries(file.barcodes)) {
    const reasons = approvalReasons(barcode);
    if (reasons.length > 0) {
      skipped.push({ championId, reasons });
      continue;
    }
    const recipe = generateVoxelSkin(inputForChampion(championId, contentDir), {
      override: overrides[championId] ?? null,
    });
    const atlas = paintVoxelAtlas(recipe, barcode);
    const rgba = new Uint8Array(atlas.buffer.slice(0));
    const png = encodePng(ATLAS_W, ATLAS_H, rgba);
    const baked = bakeBarcodeLook(championId, barcodeFigureLook(championId), rgba);
    rows.push({
      championId,
      barcode,
      atlas,
      png,
      glb: baked.bytes,
      triangles: baked.stats.triangles,
    });
  }
  return { rows, skipped };
}

function main(): void {
  const check = process.argv.includes("--check");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { rows, skipped } = buildAll();
  let stale = 0;
  for (const row of rows) {
    const names = barcodeFileNames(row.championId);
    for (const [name, bytes] of [
      [names.png, row.png],
      [names.glb, row.glb],
    ] as const) {
      const file = path.join(OUT_DIR, name);
      if (check) {
        const same = fs.existsSync(file) && Buffer.from(bytes).equals(fs.readFileSync(file));
        if (!same) {
          stale++;
          console.error(`STALE  ${path.relative(REPO_ROOT, file)}`);
        }
      } else {
        fs.writeFileSync(file, bytes);
      }
    }
    console.log(
      `${check ? "check" : "wrote"}  ${row.championId}  ` +
        `${row.png.length} B png  ${row.glb.length} B glb  ${row.triangles} tris  ` +
        `sleeve ${row.barcode.sleeve}  source ${row.barcode.source}`,
    );
  }
  for (const s of skipped) {
    console.error(`SKIP   ${s.championId}: ${s.reasons.join("; ")}`);
  }
  console.log(`${rows.length} built, ${skipped.length} skipped (未核准)`);
  if (check && stale > 0) {
    console.error(`\n${stale} file(s) differ from the generator — run \`pnpm voxel:build\`.`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
