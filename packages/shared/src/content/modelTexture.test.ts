/**
 * Champion model TEXTURE guard (models.md: mdl-08 — no untextured champion).
 *
 * The w3x→glb exporter emits an 8x8 grey placeholder image for every material
 * whose .blp it could not resolve. Bulbasaur (妙蛙種子 / imported.bulbasaur)
 * skins itself with STOCK Blizzard textures that live in the retail MPQs rather
 * than the map archive, so its body + leaf materials both got the placeholder
 * and the champion shipped flat grey (task #32).
 *
 * Task #33 moved that retail-MPQ fallback into the importer itself
 * (w3xlib.models._find_texture_png), so SECONDARY materials — the flames, glows
 * and cloud billboards that skin themselves with stock Blizzard art — resolve
 * too. The guard is therefore tightened from "the body is painted" to "no
 * ACTIVE champion/skin glb embeds a placeholder image AT ALL".
 *
 * This suite reads the shipped .glb bytes directly (GLB container + JSON chunk +
 * PNG IHDR — no Babylon needed, the geometry is tiny), plus a per-model pin on
 * bulbasaur's silhouette height so a future re-bake cannot bring the 3.13u
 * giant back.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** the exporter's "texture missing" fallback is an 8x8 solid grey PNG */
const PLACEHOLDER_MAX = 8;

interface Img {
  width: number;
  height: number;
  bytes: number;
}
interface Glb {
  images: Img[];
  /** vertex count + material index of the largest primitive (the body) */
  body: { verts: number; material: number | null } | null;
  /** baseColorTexture image of each material, null when untextured */
  materialImages: (Img | null)[];
  /** POSITION bbox over every primitive, in mesh-local (== baked) space */
  height: number;
}

function readGlb(path: string): Glb {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf-8")) as {
    images?: { bufferView: number }[];
    textures?: { source: number }[];
    materials?: { pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }[];
    bufferViews?: { byteOffset?: number; byteLength: number }[];
    accessors?: { min?: number[]; max?: number[] }[];
    meshes?: { primitives: { material?: number; attributes: { POSITION: number } }[] }[];
  };
  const binOffset = 20 + jsonLen + 8; // skip the BIN chunk header
  const views = json.bufferViews ?? [];
  const images: Img[] = (json.images ?? []).map((im) => {
    const bv = views[im.bufferView]!;
    const at = binOffset + (bv.byteOffset ?? 0);
    // PNG: 8B signature + 4B length + "IHDR" then width/height (big-endian)
    return { width: buf.readUInt32BE(at + 16), height: buf.readUInt32BE(at + 20), bytes: bv.byteLength };
  });
  const materialImages = (json.materials ?? []).map((m) => {
    const ti = m.pbrMetallicRoughness?.baseColorTexture?.index;
    if (ti === undefined) return null;
    const src = json.textures?.[ti]?.source;
    return src === undefined ? null : (images[src] ?? null);
  });

  let body: { verts: number; material: number | null } | null = null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const acc = json.accessors?.[prim.attributes.POSITION];
      const verts = acc?.min && acc.max ? 1 : 0;
      if (acc?.min && acc.max) {
        lo = Math.min(lo, acc.min[1]!);
        hi = Math.max(hi, acc.max[1]!);
      }
      const count = (json.accessors?.[prim.attributes.POSITION] as { count?: number } | undefined)?.count ?? verts;
      if (!body || count > body.verts) body = { verts: count, material: prim.material ?? null };
    }
  }
  return { images, body, materialImages, height: hi > lo ? hi - lo : 0 };
}

const isReal = (img: Img | null): boolean =>
  !!img && (img.width > PLACEHOLDER_MAX || img.height > PLACEHOLDER_MAX);

/** every model key actually worn by a champion or skin */
function activeModelKeys(): string[] {
  const keys = new Set<string>();
  for (const collection of ["champions", "skins"]) {
    const dir = join(CONTENT_DIR, collection);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { modelKey?: string };
      if (doc.modelKey) keys.add(doc.modelKey);
    }
  }
  return [...keys].sort();
}

const models = activeModelKeys().map((modelKey) => {
  const doc = JSON.parse(
    readFileSync(join(CONTENT_DIR, `models/${modelKey}.json`), "utf8"),
  ) as { glbPath: string; scale: number };
  return { modelKey, doc, glb: readGlb(join(CONTENT_DIR, doc.glbPath)) };
});
// imported.collision is an empty glb (procedural fallback), nothing to texture
const painted = models.filter((m) => m.glb.images.length > 0 || m.glb.body !== null);

describe("no champion ships untextured (model-body-texture)", () => {
  it("paints every active champion/skin body with a real embedded texture", () => {
    cover("model-body-texture");
    expect(painted.length).toBeGreaterThan(40);
    for (const { modelKey, glb } of painted) {
      if (glb.images.length === 0) continue; // empty-glb fallback
      const mat = glb.body?.material;
      expect(mat, `${modelKey} body primitive has no material`).not.toBeNull();
      const img = glb.materialImages[mat!] ?? null;
      expect(
        isReal(img),
        `${modelKey} body material paints with the ${PLACEHOLDER_MAX}x${PLACEHOLDER_MAX} ` +
          `grey placeholder (unresolved .blp — see w3xlib/models.py STOCK_MPQS)`,
      ).toBe(true);
    }
  });

  it("embeds no placeholder image at all — secondary materials included", () => {
    cover("model-body-texture");
    // Every material, not just the body: flames/glows/clouds skin themselves
    // with stock Blizzard art, which the importer now resolves from the retail
    // MPQs. A placeholder here means an unresolved .blp slipped back in — see
    // tools/w3x-import/rebake_textures.py.
    for (const { modelKey, glb } of painted) {
      const grey = glb.images.filter((im) => !isReal(im));
      expect(
        grey.length,
        `${modelKey} embeds ${grey.length}/${glb.images.length} ` +
          `${PLACEHOLDER_MAX}x${PLACEHOLDER_MAX} grey placeholder image(s)`,
      ).toBe(0);
    }
  });

  it("keeps 妙蛙種子 (imported.bulbasaur) fully textured and champion-sized", () => {
    cover("model-body-texture");
    const bulba = models.find((m) => m.modelKey === "imported.bulbasaur")!;
    expect(bulba, "imported.bulbasaur missing from the roster").toBeTruthy();
    // all three materials (body / leaves / face decal) carry a real texture
    expect(bulba.glb.materialImages.length).toBe(3);
    for (const [i, img] of bulba.glb.materialImages.entries())
      expect(isReal(img), `bulbasaur mat${i} is a placeholder`).toBe(true);
    // ...and the whole silhouette (leaves included) renders at champion height,
    // not the pre-#32 3.13u giant that only normalized the trunk geoset
    const rendered = bulba.glb.height * bulba.doc.scale;
    expect(rendered).toBeGreaterThanOrEqual(1.5);
    expect(rendered).toBeLessThanOrEqual(1.9);
  });
});
