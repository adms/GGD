/**
 * gen-ground — generates the arena floor PBR material sets into
 * content/assets/textures/ground/<style>/.
 *   Run: pnpm tsx apps/client/scripts/gen-ground.ts
 *
 * WHY THIS IS GENERATED, NOT DOWNLOADED (task #80). The project already builds
 * its cursors (scripts/gen-cursors.ts), its icons (scripts/gen-icons.ts), its
 * SFX (content/assets/audio/sfx/fx/GENERATE.sh) and its entire soundtrack
 * (tools/bgm-gen) from source. A CC0 pack off ambientCG or Poly Haven would
 * have been legal too, but it would not have fixed the actual complaint:
 * downloaded ground sets are SINGLE SEAMLESS TILES, and a single tile repeated
 * ~12× across a 48-unit arena is exactly the visible lattice the user is
 * objecting to. Generating lets the macro layer below exist at all.
 *
 * WHAT COMES OUT, per style:
 *   albedo.png  512² RGB  — sRGB-encoded base colour (Babylon reads it gamma)
 *   normal.png  512² RGB  — tangent-space, OpenGL/glTF +Y-up, LINEAR
 *   orm.png     512² RGB  — R = ambient occlusion, G = roughness, B = metallic
 *   macro.png   512² RGBA — the non-repeating arena-wide variation layer
 *
 * The first three TILE, once every TILE_WORLD_SIZE (4) world units. macro.png
 * does NOT tile: it is stretched once across the whole 48-unit zone.
 *
 * macro.png is packed for Babylon's built-in detail map, whose channel order is
 * NOT the obvious one. Verified against the shipped shader source in
 * @babylonjs/core 7.54.3 rather than from memory:
 *   bumpFragment.js          → `detailColor.wy*2.0-1.0` is the normal XY
 *   pbrBlockAlbedoOpacity.js → `detailColor.r` is the albedo detail
 *   pbrBlockReflectivity.js  → `detailColor.b` is the roughness detail
 * so the packing is R = albedo, G = normal.y, B = roughness, A = normal.x,
 * with 128 neutral in every channel. Get this wrong and the floor comes out
 * tinted by a normal map.
 */
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeTexturePng } from "./png";
import { blurWrapped, cavityAo, normalFromHeight, toSrgb, clamp01 } from "./texgen/noise";
import { GROUND_STYLES, TILE_WORLD_SIZE, ZONE_WORLD_SIZE, type GroundStyle } from "./texgen/styles";

/** Detail set resolution. 512² over a 4-unit tile is ~128 px per world unit;
 *  the in-game camera resolves ~64 px per world unit at its closest zoom
 *  (CameraRig DOLLY_MIN), so this is already 2× oversampled. 1K/2K/4K would be
 *  pure download weight for a browser game — the whole ground set is ~2 MB. */
const DETAIL = 512;
/** Macro map resolution. It is all low-frequency by construction, so 512²
 *  stretched over 48 units (~11 px/unit) has no visible steps. */
const MACRO = 512;

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_ROOT = join(REPO, "content", "assets", "textures", "ground");

const byte = (x: number): number => Math.max(0, Math.min(255, Math.round(x * 255)));

function generateDetail(style: GroundStyle, dir: string): void {
  const n = DETAIL * DETAIL;
  const albedo = Buffer.alloc(n * 3);
  const orm = Buffer.alloc(n * 3);
  const height = new Float32Array(n);
  const rough = new Float32Array(n);

  for (let y = 0; y < DETAIL; y++) {
    for (let x = 0; x < DETAIL; x++) {
      const i = y * DETAIL + x;
      // sample at texel CENTRES so the wrap is symmetric
      const t = style.paint((x + 0.5) / DETAIL, (y + 0.5) / DETAIL);
      albedo[i * 3] = byte(toSrgb(t.r));
      albedo[i * 3 + 1] = byte(toSrgb(t.g));
      albedo[i * 3 + 2] = byte(toSrgb(t.b));
      height[i] = clamp01(t.h);
      rough[i] = clamp01(t.rough);
    }
  }

  // Derive the normal from a 1-texel-blurred height. Texel-scale height noise
  // cannot survive mipmapping anyway, but it DOES produce specular shimmer as
  // the camera moves, and it is incompressible — it was over half the weight of
  // the whole set. The AO below still uses the unblurred field, where the fine
  // detail actually reads.
  const smoothed = blurWrapped(height, DETAIL, 1);
  // gain = relief per world unit ÷ world units per texel — keeps the apparent
  // relief fixed no matter what DETAIL or TILE_WORLD_SIZE become
  const gain = style.reliefWorld / (TILE_WORLD_SIZE / DETAIL);
  const { nx, ny, nz } = normalFromHeight(smoothed, DETAIL, gain);
  const ao = cavityAo(height, DETAIL, style.ao);
  const normal = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    normal[i * 3] = byte(nx[i]! * 0.5 + 0.5);
    normal[i * 3 + 1] = byte(ny[i]! * 0.5 + 0.5);
    normal[i * 3 + 2] = byte(nz[i]! * 0.5 + 0.5);
    orm[i * 3] = byte(ao[i]!); // R — ambient occlusion
    orm[i * 3 + 1] = byte(rough[i]!); // G — roughness
    orm[i * 3 + 2] = 0; // B — metallic; ground is dielectric everywhere
  }

  writeFileSync(join(dir, "albedo.png"), encodeTexturePng(DETAIL, DETAIL, albedo, 3));
  writeFileSync(join(dir, "normal.png"), encodeTexturePng(DETAIL, DETAIL, normal, 3));
  writeFileSync(join(dir, "orm.png"), encodeTexturePng(DETAIL, DETAIL, orm, 3));
}

function generateMacro(style: GroundStyle, dir: string): void {
  const n = MACRO * MACRO;
  const height = new Float32Array(n);
  const tint = new Float32Array(n);
  const rough = new Float32Array(n);

  for (let y = 0; y < MACRO; y++) {
    for (let x = 0; x < MACRO; x++) {
      const i = y * MACRO + x;
      const m = style.macro((x + 0.5) / MACRO, (y + 0.5) / MACRO);
      height[i] = clamp01(m.h);
      // Babylon's albedo detail is applied as albedo * (2*mix(0.5,R,level))²,
      // so R = 0.5 ± 0.10 lands around ×0.64 … ×1.44 at full blend level — a
      // strong but not blown-out swing. Wider than this and the floor posterises.
      tint[i] = 0.5 + clamp01((m.tint + 1) / 2) * 0.2 - 0.1;
      rough[i] = 0.5 + clamp01((m.rough + 1) / 2) * 0.32 - 0.16;
    }
  }

  const macroGain = style.macroReliefWorld / (ZONE_WORLD_SIZE / MACRO);
  const { nx, ny } = normalFromHeight(height, MACRO, macroGain);
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = byte(tint[i]!); // R — albedo detail
    out[i * 4 + 1] = byte(ny[i]! * 0.5 + 0.5); // G — normal Y
    out[i * 4 + 2] = byte(rough[i]!); // B — roughness detail
    out[i * 4 + 3] = byte(nx[i]! * 0.5 + 0.5); // A — normal X
  }
  writeFileSync(join(dir, "macro.png"), encodeTexturePng(MACRO, MACRO, out, 4));
}

const README = `# Arena ground material sets — GENERATED, DO NOT HAND-EDIT

Every PNG in this tree is written by \`apps/client/scripts/gen-ground.ts\`:

    pnpm tsx apps/client/scripts/gen-ground.ts

The generator is deterministic (seeded integer hashes, no \`Math.random\`), so a
re-run reproduces these files byte-for-byte. Edit the painters in
\`apps/client/scripts/texgen/styles.ts\` and re-run — do not retouch the PNGs.

## Provenance / licence

100% procedurally generated by this repo's own code. No third-party art, no
scanned photographs, no Blizzard assets, nothing downloaded. There is no
upstream licence to honour and no attribution obligation — these files are as
much first-party as the source that emits them. Nothing to add to
\`content/assets/CREDITS.md\`, which exists to track *third-party* provenance.

## Layout

Per style (\`stone\`, \`dirt\`, \`grass\`, \`sand\` — the four \`groundStyle\` values the
shipped arenas actually use):

| file | size | space | contents |
|---|---|---|---|
| \`albedo.png\` | ${DETAIL}² RGB | **sRGB** | base colour |
| \`normal.png\` | ${DETAIL}² RGB | linear | tangent-space normal, OpenGL/glTF +Y up |
| \`orm.png\` | ${DETAIL}² RGB | linear | R = occlusion, G = roughness, B = metallic (0) |
| \`macro.png\` | ${MACRO}² RGBA | linear | R = albedo, G = normal.y, B = roughness, A = normal.x |

\`albedo/normal/orm\` **tile**, one repeat per **${TILE_WORLD_SIZE} world units**.
\`macro.png\` does **not** tile — it is stretched exactly once across the zone's
${TILE_WORLD_SIZE * 12}-unit bounding square and is what stops the eye finding the repeat.

\`macro.png\`'s channel order is Babylon's \`detailMap\` packing, verified against
the shader source in \`@babylonjs/core\` 7.54.3 (\`detailColor.wy\` is the normal
XY, \`.r\` the albedo, \`.b\` the roughness) — it is not a conventional RGBA image
and will look like garbage in a viewer. Neutral is 128 in every channel.

Consume via \`apps/client/src/render/groundMaterials.ts\`, which owns the paths,
the colour spaces and the tiling maths.
`;

mkdirSync(OUT_ROOT, { recursive: true });
writeFileSync(join(OUT_ROOT, "README.md"), README, "utf8");

let total = 0;
for (const style of GROUND_STYLES) {
  const dir = join(OUT_ROOT, style.id);
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  generateDetail(style, dir);
  generateMacro(style, dir);
  let bytes = 0;
  for (const f of ["albedo.png", "normal.png", "orm.png", "macro.png"]) {
    bytes += statSync(join(dir, f)).size;
  }
  total += bytes;
  console.log(
    `${style.id.padEnd(6)} ${style.label.padEnd(32)} ${(bytes / 1024).toFixed(0).padStart(5)} KB  (${Date.now() - t0}ms)`,
  );
}
console.log(`\n${GROUND_STYLES.length} styles, ${(total / 1024 / 1024).toFixed(2)} MB total → content/assets/textures/ground/`);
