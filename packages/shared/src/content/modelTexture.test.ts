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
 * champion/skin glb embeds a placeholder image AT ALL".
 *
 * ⭐ GH#1242：「champion/skin glb」＝**現役 `modelKey` ＋ 後台下拉選得到的 `modelVersions[].modelKey`**。
 * ⛔ 在此之前只掃現役 ⇒ 一顆被換下來的身體（仍是一鍵 rollback 的選項）帶什麼都不會紅。
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
import { createHash } from "node:crypto";
import { cover } from "../../testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** the exporter's "texture missing" fallback is an 8x8 solid grey PNG */
const PLACEHOLDER_MAX = 8;

interface Img {
  width: number;
  height: number;
  bytes: number;
  /** 內嵌 PNG 位元組的 sha256 —— 只給 {@link ORIGINAL_TINY_TEXTURE} 逐位元組比對用 */
  sha256: string;
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
    return {
      width: buf.readUInt32BE(at + 16),
      height: buf.readUInt32BE(at + 20),
      bytes: bv.byteLength,
      sha256: createHash("sha256").update(buf.subarray(at, at + bv.byteLength)).digest("hex"),
    };
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

/** modelKey → 現役？ —— 英雄卡/造型穿著的（true），加上後台版本下拉選得到的（false） */
function bodyKeys(): [string, boolean][] {
  const keys = new Map<string, boolean>();
  for (const collection of ["champions", "skins"]) {
    const dir = join(CONTENT_DIR, collection);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        modelKey?: string;
        modelVersions?: { modelKey: string }[];
      };
      if (doc.modelKey) keys.set(doc.modelKey, true);
      for (const v of doc.modelVersions ?? []) if (!keys.has(v.modelKey)) keys.set(v.modelKey, false);
    }
  }
  return [...keys].sort(([a], [b]) => a.localeCompare(b));
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
 * ⭐ **帶著佔位貼圖的身體** —— ⛔ 這張名單**只能變短**，⛔ 而且**只豁免後台版本**（現役身體帶佔位，名單救不了它）。
 *
 * ⚠️ 每一列都要寫得出**是哪一塊、多大、為什麼還沒修**（⛔ 不是「還沒排到」）。
 *
 * ⚠️ GH#1242：這裡曾經列著 `version.body.75e3f6c8…`，註解寫「馬提亞斯的**現役**身體、image1 是 8×8 灰佔位」。
 * ⛔ 兩個前提都不成立（2026-09-15 實測）：① 現役早在 818566183（PR #1152）換成 `f91fa769…`，
 * 75e3f6c8 只剩後台版本 —— ⛔ 而舊的反方向檢查寫的是 `m !== undefined && …` ⇒ 一列不再被掃到的**永遠綠**
 * （假綠燈⑫）；② 那張 8×8 是**白**的、而且是原作 `Textures\white.blp`（證據見 {@link INTENTIONAL_TINY_TEXTURE}）。
 */
const KNOWN_PLACEHOLDER: ReadonlySet<string> = new Set<string>();

/**
 * ⭐ **刻意的極小貼圖** —— 以內嵌 PNG 的**逐位元組 sha256** 為鍵（⛔ 不是以模型或尺寸）。
 *
 * ⚠️ 這條閘的判準是尺寸（≤ 8×8 ＝ 查不到 .blp 時退回的佔位），⛔ 而有兩種 ≤8×8 是對的：
 * 原作本身就把**單色**存成極小圖、或第 3 階自製替身用一張**調色盤圖集**。⇒ 只放行**證據指得到的那一張位元組**：
 * 換了任何一個位元組、或另一顆模型帶進別的 8×8，照樣紅。
 * ⭐ 每一列要寫得出**原件在哪、怎麼比過**；名單上的位元組不再出現在任何可選身體上 ⇒ 下面那條會紅（幽靈列）。
 */
const INTENTIONAL_TINY_TEXTURE: Readonly<Record<string, string>> = {
  // PR #1152 合併準備（2026-09-14）—— b2-popp 作用中的 Infinity Strash PN020/02＋Kagayaki（owner 裁決的手動預設）
  "49b3c8029c9d698cc15576386397b1c7f5cc55fc8ea9580c2239e07e0a8e8d40":
    "Infinity Strash `T_PN020_00_Hair_Base`（波普髮色底色）原作就是 8×8 單色 (70,73,78)：" +
    "UModel 匯出的 `GGD-Asset-Library/conversions/infinity-strash-popp-pn020-00-delivery-v1/textures-v1/" +
    "Strash/Chara/Player/PN020/Hair/T_PN020_00_Hair_Base.png` 與內嵌這一張 sha256 相同（2026-09-14 實比）。" +
    "髮絲明暗在原作由 `T_PN020_00_Hair_Bundle`（1024²，G 通道遮罩）＋ `_Shade`（8×8）在卡通材質裡合成 —— " +
    "⚠️ GGD 的 PBR 材質只取了底色，那是**保真度缺口**（要補的是烘焙 Bundle），⛔ 不是換掉這一張。" +
    "⭐ 同一張位元組也在 godie-nbbc（達伊）現役 ee41ff0f／版本 d3f99e89 上：`infinity-strash-dai-pn010-05-daino-tsurugi-" +
    "delivery-v1/stages/body/textures-v1/Strash/Chara/Player/PN010/Hair/T_PN010_00_Hair_Base.png` 與它 sha256 相同（2026-09-15 實比）。",
  // GH#1242 —— b2-matthias 三個後台版本 75e3f6c8／eb4aebd7／581a61a4（都是 ou99.465884 `qiye345.mdx`）的 mat1（16 三角）
  "47c0b232b83e0aaf92d46f39b9066c67528fc4c31fc88bc50d7d8e2291137145":
    "ou99 465884 `qiye345.mdx` 的 texture[1] 是 `Textures\\white.blp`（material 1 → 16 三角那個 geoset），" +
    "而原始壓縮檔自己就帶著這張 `textures/white.blp`（1,350 B，sha256 df5b9778…）：解出來 8×8 全白 (255,255,255)，" +
    "用 `w3xlib.models._encode(decode_blp(…))` 重編碼後與內嵌這一張 sha256 相同（2026-09-15 實比）。" +
    "⇒ ⛔ 不是查不到 .blp 的佔位，是原作用一張 8×8 白圖。現役 f91fa769（0b547fe6….glb）把同一塊改成無貼圖＋baseColorFactor [1,1,1,1]，畫面等價。",
  // GH#1242 —— community-review-14-20260907（殺老師）後台版本 b5d66346「GGD 黃色觸手教師替身」
  "f95aeb28cfb49b97a8d494e81c0c13e83a08d302d81a02f40d1aba8be7f52f25":
    "第 3 階自製替身的**調色盤圖集**：glb `asset.generator` = `GGD original cartoon proxy generator`、材質 `Cartoon palette`、" +
    "取樣器 NEAREST＋CLAMP（9728／33071），4×2 八個像素八種顏色（UV 指到格子取色）。" +
    "同一支英雄較新的 a8ced1f9／1649f8ff（d54eacf8….glb）是同一張調色盤放大成 16×8。",
};

/** 量尺：≤ 8×8 而**不是**名單上那幾張刻意的位元組 */
const greyImages = (glb: Glb): Img[] =>
  glb.images.filter((im) => !isReal(im) && !(im.sha256 in INTENTIONAL_TINY_TEXTURE));

const skippedOffdisk: string[] = [];
const models = bodyKeys().flatMap(([modelKey, active]) => {
  const doc = JSON.parse(
    readFileSync(join(CONTENT_DIR, `models/${modelKey}.json`), "utf8"),
  ) as { glbPath: string; scale: number };
  if (OFFDISK.has(doc.glbPath)) {
    skippedOffdisk.push(modelKey);
    return [];
  }
  return [{ modelKey, active, doc, glb: readGlb(join(CONTENT_DIR, doc.glbPath)) }];
});
// imported.collision is an empty glb (procedural fallback), nothing to texture
const painted = models.filter((m) => m.glb.images.length > 0 || m.glb.body !== null);

describe("no champion ships untextured (model-body-texture)", () => {
  it("⭐ 量尺自證：真的掃到模型，⛔ 而且跳過的每一顆都說得出是誰", () => {
    // ⛔ 沒有這一條，一個把全部模型都跳掉的 bug 會讓下面那條**結構上永遠綠**
    //   （它的迴圈會一次都不跑）——⭐ 而那正是「壞掉跟正常長得一樣」。
    expect(models.length, "⛔ 一顆模型都沒掃到 —— 偵測壞了").toBeGreaterThan(40);
    // ⭐ 分母要印出來（⛔ 不是只回一個「綠」）：現役幾顆、後台版本幾顆、跳過幾顆
    const versionOnly = models.filter((m) => !m.active).length;
    console.info(
      `[modelTexture] 掃 ${models.length} 顆身體：現役 ${models.length - versionOnly}、` +
        `只在後台版本 ${versionOnly}；offdisk 跳過 ${skippedOffdisk.length}`,
    );
    // ⛔ 沒有這一條，一個讀不到 modelVersions 的 bug 會讓「後台選得到的身體」整批靜默出界（GH#1242）
    expect(versionOnly, "⛔ 一顆後台版本身體都沒掃到 —— modelVersions 沒被讀").toBeGreaterThan(0);
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

  it("paints every champion/skin body (active + admin versions) with a real embedded texture", () => {
    cover("model-body-texture");
    expect(painted.length).toBeGreaterThan(40);
    for (const { modelKey, glb } of painted) {
      if (glb.images.length === 0) continue; // empty-glb fallback
      const mat = glb.body?.material;
      expect(mat, `${modelKey} body primitive has no material`).not.toBeNull();
      const img = glb.materialImages[mat!] ?? null;
      expect(
        isReal(img) || (img !== null && img.sha256 in INTENTIONAL_TINY_TEXTURE),
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
    for (const { modelKey, active, glb } of painted) {
      if (KNOWN_PLACEHOLDER.has(modelKey) && !active) continue;
      const grey = greyImages(glb);
      expect(
        grey.length,
        `${modelKey}（${active ? "現役" : "後台版本"}）embeds ${grey.length}/${glb.images.length} ` +
          `${PLACEHOLDER_MAX}x${PLACEHOLDER_MAX} grey placeholder image(s)`,
      ).toBe(0);
    }
  });

  it("⭐ 刻意極小貼圖的名單沒有幽靈列 —— 每一列都還在某顆可選身體上，⭐ 而且量尺真的把它量成 ≤8×8", () => {
    // ⭐ 量尺的「已知極小的量得到」這一邊（「已知正常的量不到」是上面的 body 那條＋妙蛙種子那條）：
    //   isReal 若壞成永遠 true，這裡的集合是空的 ⇒ 每一列都變幽靈 ⇒ 紅。
    const tiny = new Set(painted.flatMap((m) => m.glb.images.filter((im) => !isReal(im)).map((im) => im.sha256)));
    expect(Object.keys(INTENTIONAL_TINY_TEXTURE).filter((sha) => !tiny.has(sha))).toEqual([]);
  });

  it("⭐ 佔位名單只能變短、沒有幽靈列（⛔ 修好了、或已經沒有英雄卡引用它 ⇒ 紅）", () => {
    // ⛔ 舊版是 `m !== undefined && …` ⇒ 一列不再被任何英雄卡引用時**結構上永遠綠**（假綠燈⑫，GH#1242 的 75e3f6c8）。
    const stale = [...KNOWN_PLACEHOLDER].filter((k) => {
      const m = painted.find((p) => p.modelKey === k);
      return m === undefined || greyImages(m.glb).length === 0;
    });
    expect(
      stale,
      "⭐ 這幾顆的佔位貼圖**已經補好**、或已經**沒有英雄卡/版本引用**（也可能位元組搬去 offdisk 驗不到）—— " +
        "把 id 從 `KNOWN_PLACEHOLDER` 拿掉，⛔ 否則這張名單會慢慢把真的缺陷一起放行。",
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
