/**
 * The intermission market's ASSET CONTRACT, checked against the shipped files.
 *
 * `layout.ts` names three .glb paths, four animation clips and one mesh prefix.
 * Every one of them is a STRING that no compiler checks and that the headless
 * scene test cannot verify either — under NullEngine the model fetch fails and
 * the scene correctly degrades to an empty market, which is exactly the failure
 * mode that would hide a typo'd path or a renamed clip until someone looked at
 * the screen. So this reads the real files off disk.
 *
 * It parses the glTF-Binary container directly (12-byte header, then chunks;
 * chunk 0 is the JSON scene description) rather than booting Babylon — the
 * names live in that JSON, and a dependency-free reader keeps this test fast
 * and immune to loader-version changes.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  DRESSING,
  MERCHANT_CLIPS,
  MERCHANT_HIDDEN_MESH_PREFIX,
  SHOP_MODELS,
  TORCHES,
  bannerFor,
  silhouettes,
  CART,
  MERCHANT,
  STALL,
} from "./layout";

/** repo content/ mount — the same tree the client fetches /content/ from */
const CONTENT_DIR = join(__dirname, "../../../../../content");

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

interface GltfJson {
  meshes?: { name?: string }[];
  animations?: { name?: string }[];
  nodes?: { name?: string }[];
}

/** Read a .glb's JSON chunk (the scene description) without a glTF loader. */
function readGlbJson(relPath: string): GltfJson {
  const buf = readFileSync(join(CONTENT_DIR, relPath));
  expect(buf.readUInt32LE(0), `${relPath} is a glTF-Binary file`).toBe(GLB_MAGIC);
  let offset = 12; // magic + version + total length
  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (chunkType === CHUNK_JSON) {
      return JSON.parse(buf.subarray(start, start + chunkLength).toString("utf8")) as GltfJson;
    }
    offset = start + chunkLength;
  }
  throw new Error(`${relPath} has no JSON chunk`);
}

const names = (list: { name?: string }[] | undefined): string[] =>
  (list ?? []).map((x) => x.name ?? "");

describe("intermission asset contract", () => {
  it("every model the market places actually ships", () => {
    cover("intermission-assets");
    const referenced = [
      ...Object.values(SHOP_MODELS),
      ...[STALL, CART, MERCHANT, ...TORCHES, ...DRESSING, ...silhouettes()].map((p) => p.model),
      // every team's banner, not just the one this run happens to fly
      ...[0, 1, 2, 3].map((t) => bannerFor(t).model),
      "assets/models/props/floor_tile_large.glb",
      "assets/models/hex/hex_grass.glb",
    ];
    const missing = [...new Set(referenced)].filter((p) => !existsSync(join(CONTENT_DIR, p)));
    expect(missing, "referenced .glb paths that do not exist under content/").toEqual([]);
  });

  it("the merchant really carries a sword mesh for the scene to hide", () => {
    cover("intermission-assets");
    // If Quaternius ever renames it, `setEnabled(false)` would silently no-op
    // and the 店員 would stand behind his counter armed — which is precisely
    // the thing the hide exists to prevent.
    const gltf = readGlbJson(SHOP_MODELS.merchant);
    const meshNames = names(gltf.meshes);
    const swords = meshNames.filter((n) => n.includes(MERCHANT_HIDDEN_MESH_PREFIX));
    expect(swords.length, `meshes matching "${MERCHANT_HIDDEN_MESH_PREFIX}": ${meshNames.join(", ")}`)
      .toBeGreaterThan(0);
    // …and hiding it must not take the whole merchant with it
    expect(meshNames.length).toBeGreaterThan(swords.length);
  });

  it("every animation clip the scene drives exists on the rig", () => {
    cover("intermission-assets");
    const gltf = readGlbJson(SHOP_MODELS.merchant);
    const clips = names(gltf.animations);
    for (const [role, clip] of Object.entries(MERCHANT_CLIPS)) {
      expect(clips, `clip for "${role}"`).toContain(clip);
    }
    // Idle and the two gestures must be DIFFERENT clips or the merchant would
    // never visibly react to anything.
    expect(new Set([MERCHANT_CLIPS.idle, MERCHANT_CLIPS.wave, MERCHANT_CLIPS.interact]).size).toBe(3);
  });

  it("the stall and cart are static props with no animation to drive", () => {
    cover("intermission-assets");
    // documents the asymmetry: only the merchant is skinned/animated, which is
    // why only he gets a clip index and a gesture API
    expect(names(readGlbJson(SHOP_MODELS.stall).animations)).toEqual([]);
    expect(names(readGlbJson(SHOP_MODELS.cart).animations)).toEqual([]);
  });
});
