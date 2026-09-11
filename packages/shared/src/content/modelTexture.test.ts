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

/**
 * ⭐ **宣告過的缺席資產**（`content/assets-offdisk.json`）—— 位元組住 S3，
 * ⛔ 不在 git 裡（owner 2026-09-08 的歸屬表：成品進 git、素材本體進 S3）。
 *
 * ⚠️ ⛔ 這裡**不可以**靜默跳過：一顆「宣告過所以不在」與一顆「真的掉了」
 * 在 `existsSync` 眼中一模一樣（CLAUDE.md：fail-open 沒錯，**靜默才是缺陷**）。
 * ⇒ ⭐ 只跳**宣告過的那些**，⛔ 沒宣告就照樣讓 `readGlb` 炸開；
 *   而跳了幾顆會在下面那條「量尺自證」裡被印出來。
 */
const OFFDISK: ReadonlySet<string> = new Set(
  Object.keys(
    (
      JSON.parse(readFileSync(join(CONTENT_DIR, "assets-offdisk.json"), "utf8")) as {
        entries?: Record<string, unknown>;
      }
    ).entries ?? {},
  ),
);

/**
 * ⭐ **今天還帶著佔位貼圖的模型** —— ⛔ 這張名單**只能變短**。
 *
 * ⚠️ 每一列都要寫得出**是哪一塊、多大、為什麼還沒修**（⛔ 不是「還沒排到」）。
 *
 * ⭐ 這條缺陷在此之前是**看不見的**：這個測試檔整支
 * 因為讀一顆宣告在 `assets-offdisk.json` 的模型而 ENOENT 崩掉
 * ⇒ 下面每一條斷言**一次都沒跑過**（假綠燈⑨：一條從來沒人看它綠過的閘，
 *   與一個不存在的閘沒有差別）。修好載入之後它第一次開口，就指出了這一顆。
 */
const KNOWN_PLACEHOLDER: ReadonlySet<string> = new Set([
  // b2-matthias（馬提亞斯）的**現役**身體。3 張貼圖裡的 image1 是 8×8 灰
  // ⇒ 掛在一塊 **16 個三角**的小配件上（本體 9,716 三角／512² 是好的）。
  // ⛔ 修法是**重轉檔**（來源 .blp 當時查不到 —— `w3xlib/models.py` STOCK_MPQS），
  //    ⛔ 不是在這裡改數字。票：GH#1242。
  "version.body.75e3f6c83377e20f63b8d3646cab3cf783c5b5789552744c",
]);

const skippedOffdisk: string[] = [];
const models = activeModelKeys().flatMap((modelKey) => {
  const doc = JSON.parse(
    readFileSync(join(CONTENT_DIR, `models/${modelKey}.json`), "utf8"),
  ) as { glbPath: string; scale: number };
  if (OFFDISK.has(doc.glbPath)) {
    skippedOffdisk.push(modelKey);
    return [];
  }
  return [{ modelKey, doc, glb: readGlb(join(CONTENT_DIR, doc.glbPath)) }];
});
// imported.collision is an empty glb (procedural fallback), nothing to texture
const painted = models.filter((m) => m.glb.images.length > 0 || m.glb.body !== null);

describe("no champion ships untextured (model-body-texture)", () => {
  it("⭐ 量尺自證：真的掃到模型，⛔ 而且跳過的每一顆都說得出是誰", () => {
    // ⛔ 沒有這一條，一個把全部模型都跳掉的 bug 會讓下面那條**結構上永遠綠**
    //   （它的迴圈會一次都不跑）——⭐ 而那正是「壞掉跟正常長得一樣」。
    expect(models.length, "⛔ 一顆模型都沒掃到 —— 偵測壞了").toBeGreaterThan(40);
    // ⭐ 把跳過的數量印出來：⛔ 一個安靜的 skip 與「驗過而且全過」長得一模一樣。
    expect(
      skippedOffdisk.length,
      `⭐ 跳過 ${skippedOffdisk.length} 顆**宣告在 content/assets-offdisk.json** 的模型` +
        `（位元組住 S3，⛔ 不在 git）：${skippedOffdisk.slice(0, 5).join("、")}` +
        `${skippedOffdisk.length > 5 ? " …" : ""}\n` +
        "⚠️ 這個數字若**暴增**，代表有人把成品搬出了 git —— " +
        "⭐ 而 owner 2026-09-08 的歸屬表說**成品要進 git**。",
    ).toBeLessThan(models.length);
  });

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
      if (KNOWN_PLACEHOLDER.has(modelKey)) continue;
      const grey = glb.images.filter((im) => !isReal(im));
      expect(
        grey.length,
        `${modelKey} embeds ${grey.length}/${glb.images.length} ` +
          `${PLACEHOLDER_MAX}x${PLACEHOLDER_MAX} grey placeholder image(s)`,
      ).toBe(0);
    }
  });

  it("⭐ 豁免名單只能變短（⛔ 修好了卻留在名單上 ⇒ 紅）", () => {
    // ⛔ 一張只會變長的豁免名單，與把斷言刪掉沒有差別。
    // ⇒ 這一條從**反方向**問：名單上的還在壞嗎？不壞了就要把它拿掉。
    const healed = [...KNOWN_PLACEHOLDER].filter((k) => {
      const m = painted.find((p) => p.modelKey === k);
      return m !== undefined && m.glb.images.every((im) => isReal(im));
    });
    expect(
      healed,
      "⭐ 這幾顆模型的佔位貼圖**已經補好了** —— 把 id 從 `KNOWN_PLACEHOLDER` 拿掉，" +
        "⛔ 否則這張名單會慢慢把真的缺陷一起放行。",
    ).toEqual([]);
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
