/**
 * voxel-gen — bake the five blocky-humanoid .glb files (owner directive #226).
 *
 *   pnpm voxel:gen           write content/assets/models/champions/blocky-*.glb
 *   pnpm voxel:gen --check   verify the shipped files match, byte for byte
 *
 * ── THIS FILE IS NOW A CLI, NOT A GENERATOR (task #229) ─────────────────────
 * Every line that decides what a character LOOKS LIKE or what bytes come out
 * lives in `@ggd/shared/voxel` (`boxman` / `clips` / `archetypes` / `look` /
 * `bake` / `glbWrite` / `pngWrite`). What is left here is file I/O and a
 * report: read `--check`, write or compare, print the budget line.
 *
 * That move is the owner's 「不要 fork 第二個產生器」 requirement made
 * mechanical. Before it, `tools/voxel-gen/` carried its own copies of the part
 * tables AND the only implementation of the emitter, so the 後台 page could
 * preview a figure but never produce one — the .glb still had to come out of a
 * terminal. The tables' own headers had already written down the intended fix
 * ("should become `export * from "@ggd/shared/voxel/boxman"`"); this is that
 * fix, extended to the emitter.
 *
 * Nothing about the OUTPUT changed: `gen.test.ts` pins the sha256 of all five
 * files and compares them against the bytes on disk, and those pins are
 * untouched. A single shifted byte would turn five assertions red.
 *
 * NO MOJANG / MINECRAFT ASSET IS INVOLVED. Nothing is downloaded and nothing is
 * derived from any third-party model, skin or texture. Every vertex comes from
 * `boxman.ts`, every keyframe from `clips.ts`, every colour from
 * `archetypes.ts`. The blocky STYLE is not a protectable element; the geometry
 * is this project's own and has been drawn procedurally by `ChampionView`
 * since task #64.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHETYPES,
  NATIVE_HEIGHT,
  bakeAll,
  blockyFileName,
  type Archetype,
} from "@ggd/shared/voxel";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../..");
export const OUT_DIR = path.join(REPO_ROOT, "content/assets/models/champions");

export function outPath(arch: Archetype): string {
  return path.join(OUT_DIR, blockyFileName(arch.key));
}

export { ARCHETYPES, NATIVE_HEIGHT, bakeAll };

function main(): void {
  const check = process.argv.includes("--check");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rows = bakeAll();
  let bad = 0;
  let total = 0;
  for (const { arch, bytes, stats } of rows) {
    const file = outPath(arch);
    total += bytes.length;
    if (check) {
      const same =
        fs.existsSync(file) && Buffer.from(bytes).equals(fs.readFileSync(file));
      if (!same) {
        bad++;
        console.error(`STALE  ${path.relative(REPO_ROOT, file)}`);
      }
    } else {
      fs.writeFileSync(file, bytes);
    }
    console.log(
      `${check ? "check" : "wrote"}  ${blockyFileName(arch.key)}  ` +
        `${stats.triangles} tris  ${stats.vertices} verts  ${stats.bytes} B  ` +
        `${stats.joints} joints  ${stats.clips} clips  ${stats.channelsPerFrame} ch  ` +
        `${stats.meshes} mesh/${stats.materials} mat  tex ${stats.texEdge}²  ${stats.sha256.slice(0, 12)}`,
    );
  }
  console.log(
    `total ${rows.reduce((n, r) => n + r.stats.triangles, 0)} tris, ${total} B ` +
      `across ${rows.length} files; native height ${NATIVE_HEIGHT.toFixed(4)} u`,
  );
  if (check && bad > 0) {
    console.error(`\n${bad} file(s) differ from the generator — run \`pnpm voxel:gen\`.`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
