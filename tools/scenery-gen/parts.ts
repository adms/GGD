/**
 * scenery-gen / parts — the ASSEMBLER. One box vocabulary, N pieces.
 *
 * ⭐ 第〇·五守則的形狀，搬到模型上：**機制在這裡，物件在 `pieces.ts`。**
 * 這個檔案知道「怎麼把一個帶錐度／帶傾角的箱體變成三角形、法線、UV 與 .glb
 * 位元組」；它**不知道**鳥居是什麼。鳥居是 `pieces.ts` 裡的八列參數。
 * ⛔ 如果這裡出現 `if (key === "torii")`，那就是越線了 —— 第二件物件跟第一件
 * 只能差參數。
 *
 * ── 一件物件 = 一個 mesh / 一個 material / 一個 draw call ───────────────────
 * `arena-decor` 的閘（`tools/model-budget/limits.ts`）寫得很直白：擺設可以被
 * 放 50 份，所以 mesh 數 warn 1 / limit 2、動畫通道 warn 0 / limit 0
 * （「一棵 74 面的樹帶 1 根骨頭，就會讓 50 棵樹變成 100 個無法 instance 的
 * draw call」）。所以這裡**沒有 skin、沒有 animation、沒有第二個 primitive**。
 * 顏色全部走一張 16×16 調色盤貼圖，跟 `tools/voxel-gen` 同一招。
 *
 * ── 兩條由**建構方式**保證的不變量（⛔ 不是「記得檢查」）──────────────────
 * 1. **不會穿地板**：`bake()` 量完所有頂點之後把整件往上推 `-minY`，所以
 *    bbox 最低點**逐位元組等於 0**（`y - minY` 在 `y === minY` 時就是 0.0）。
 *    POSITION accessor 帶 min/max，所以守衛可以直接從**出貨的位元組**讀回來，
 *    ⛔ 不必相信參數表（失敗形態⑤：被測的不是出貨的那個）。
 * 2. **不會擋視線**：`SCENERY_HEIGHT_CAP` = `ArenaScene.SIGHTLINE_HEIGHT_CAP`
 *    = 2.4u。`occludesPlayArea()` 對 `topY <= 2.4` 一律回 false，所以每一件都
 *    **在型別上**不可能觸發 dressArena 的 Y 壓扁，也不可能整個蓋掉一位英雄 ——
 *    不管 lane L 把它放在哪裡。`bake()` 超標就 throw。
 *
 * ── 決定性 ─────────────────────────────────────────────────────────────────
 * sin/cos 在**進入矩陣之前**就被 `q()` 夾到 1e-6 網格，所以之後全部是 IEEE-754
 * 雙精度四則運算 —— 逐位元跨平台相同。`glbWrite` 出去前再夾一次。
 */
import { GlbBuilder, q } from "../../packages/shared/src/voxel/glbWrite";
import { encodePng } from "../../packages/shared/src/voxel/pngWrite";
import { sha256Hex } from "../../packages/shared/src/voxel/bytes";

/** 貼圖邊長。16 欄 = 16 個顏色槽，16 列 = 16 級明暗。 */
export const TEX_EDGE = 16;
/** 每一列比上一列暗多少。列 0 = 原色（朝上的面），列 3 = 側面，列 6 = 底面。 */
export const SHADE_STEP = 0.035;
const ROW_TOP = 0;
const ROW_SIDE = 3;
const ROW_BOTTOM = 6;

/** `ArenaScene.SIGHTLINE_HEIGHT_CAP`。⚠️ 改這個數字之前先讀那份檔頭的推導。 */
export const SCENERY_HEIGHT_CAP = 2.4;
/** `arena-decor` 閘的 warn 是 4000 面；這裡自訂一條更緊的，理由見 README。 */
export const TRI_BUDGET = 300;

/**
 * 一個零件。⭐ **這就是全部的詞彙** —— 15 件物件、113 個零件，沒有第 2 種基元。
 */
export interface Part {
  /** 調色盤欄位 0..15 */
  c: number;
  /** 錐度前的尺寸 [寬X, 高Y, 深Z]，世界單位 */
  size: readonly [number, number, number];
  /** 底面中心的位置 [x, y, z]。⭐ y 是**底**不是中心 —— 疊箱子時不用心算 */
  at: readonly [number, number, number];
  /** 頂面的 XZ 縮放。1 = 箱子，0.5 = 梯形柱，0.06 = 尖刺。⛔ 不可以是 0（退化三角形） */
  taper?: number;
  /** 繞自身底面中心的旋轉（度）：[繞X, 繞Y偏航, 繞Z] */
  rot?: readonly [number, number, number];
}

/** 一件物件 = 一組參數。⛔ 不是一段程式。 */
export interface Piece {
  /** 檔名字根 → `content/assets/models/scenery/<key>.glb` */
  key: string;
  /** 中文名（README 與回報用） */
  label: string;
  /** 題材族群，決定哪張圖該放它 */
  theme: "wafu" | "graveyard" | "ice" | "ruins" | "colosseum";
  /** 顏色槽，index = `Part.c`。最多 16 個 */
  palette: readonly string[];
  parts: readonly Part[];
}

export interface BakeStats {
  triangles: number;
  vertices: number;
  bytes: number;
  /** [minX,minY,minZ, maxX,maxY,maxZ]，從**寫出去的** POSITION accessor 讀回 */
  bbox: readonly [number, number, number, number, number, number];
  sha256: string;
}

export interface BakeResult {
  piece: Piece;
  bytes: Uint8Array;
  stats: BakeStats;
}

// ---------------------------------------------------------------------------
// 幾何
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;
/** ⭐ 先夾再算：libm 的最後幾個 bit 到不了輸出。 */
const sinD = (deg: number): number => q(Math.sin(deg * DEG));
const cosD = (deg: number): number => q(Math.cos(deg * DEG));

/**
 * 一個箱體的 8 個角，索引 = ix*4 + iy*2 + iz。
 * 頂面（iy=1）的 XZ 乘上 taper —— 這一格就是尖刺、屋頂、樹幹收窄的全部來源。
 */
function corners(p: Part): number[][] {
  const [w, h, d] = p.size;
  const taper = p.taper ?? 1;
  const [rx, ry, rz] = p.rot ?? [0, 0, 0];
  const sy = sinD(ry);
  const cy = cosD(ry);
  const sx = sinD(rx);
  const cx = cosD(rx);
  const sz = sinD(rz);
  const cz = cosD(rz);
  const out: number[][] = [];
  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        const s = iy === 1 ? taper : 1;
        let x = (ix - 0.5) * w * s;
        let y = iy * h;
        let z = (iz - 0.5) * d * s;
        // 繞 Y（偏航）→ 繞 X（前後傾）→ 繞 Z（左右傾），樞紐都是底面中心
        [x, z] = [x * cy + z * sy, -x * sy + z * cy];
        [y, z] = [y * cx - z * sx, y * sx + z * cx];
        [x, y] = [x * cz - y * sz, x * sz + y * cz];
        out.push([x + p.at[0], y + p.at[1], z + p.at[2]]);
      }
    }
  }
  return out;
}

const K = (ix: number, iy: number, iz: number): number => ix * 4 + iy * 2 + iz;

/**
 * 六個面，每個面 4 個角，順序讓 (v0,v1,v2) 的外積指向面外。
 * ⚠️ 每個面都有**自己的 4 個頂點**（平面著色 + 每個面自己的明暗列），
 * 所以一個零件 = 24 頂點 / 12 三角面。
 */
const FACES: readonly (readonly number[])[] = [
  [K(1, 0, 0), K(1, 1, 0), K(1, 1, 1), K(1, 0, 1)], // +X
  [K(0, 0, 0), K(0, 0, 1), K(0, 1, 1), K(0, 1, 0)], // -X
  [K(0, 1, 0), K(0, 1, 1), K(1, 1, 1), K(1, 1, 0)], // +Y
  [K(0, 0, 0), K(1, 0, 0), K(1, 0, 1), K(0, 0, 1)], // -Y
  [K(0, 0, 1), K(1, 0, 1), K(1, 1, 1), K(0, 1, 1)], // +Z
  [K(0, 0, 0), K(0, 1, 0), K(1, 1, 0), K(1, 0, 0)], // -Z
];

/**
 * ⚠️ Babylon 的 glTF loader 用 `scaling = (-1, 1, 1)` 的 `__root__` 換手性 ——
 * 它翻的是 **X**（實測見 `packages/shared/src/voxel/bake.ts` 的檔頭）。
 * 鏡射是**改變定向**的，所以這裡是兩件事：位置與法線的 X 取負，**而且**三角形
 * 繞序反轉，否則每一個面都會翻到裡面去。
 */
const mirror = (v: readonly number[]): number[] => [-v[0]!, v[1]!, v[2]!];

interface Geometry {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  triangles: number;
}

function buildGeometry(piece: Piece): Geometry {
  const g: Geometry = { positions: [], normals: [], uvs: [], indices: [], triangles: 0 };
  for (const part of piece.parts) {
    if (part.c < 0 || part.c >= piece.palette.length) {
      throw new Error(`${piece.key}: part uses colour slot ${part.c}, palette has ${piece.palette.length}`);
    }
    if ((part.taper ?? 1) <= 0) {
      throw new Error(`${piece.key}: taper must be > 0 (0 makes a degenerate triangle)`);
    }
    const cs = corners(part);
    for (const face of FACES) {
      const v0 = cs[face[0]!]!;
      const v1 = cs[face[1]!]!;
      const v2 = cs[face[2]!]!;
      const e1 = [v1[0]! - v0[0]!, v1[1]! - v0[1]!, v1[2]! - v0[2]!];
      const e2 = [v2[0]! - v0[0]!, v2[1]! - v0[1]!, v2[2]! - v0[2]!];
      const n = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const len = Math.sqrt(n[0]! * n[0]! + n[1]! * n[1]! + n[2]! * n[2]!) || 1;
      const nn = [n[0]! / len, n[1]! / len, n[2]! / len];
      // 明暗列從**世界法線的 Y** 挑，不是從面的編號挑 —— 所以一根傾斜的梁，
      // 朝上的那一面真的會亮起來。一張貼圖換到免費的體積感。
      const row = nn[1]! > 0.5 ? ROW_TOP : nn[1]! < -0.5 ? ROW_BOTTOM : ROW_SIDE;
      const u = (part.c + 0.5) / TEX_EDGE;
      const v = (row + 0.5) / TEX_EDGE;
      const base = g.positions.length / 3;
      for (const ci of face) {
        g.positions.push(...mirror(cs[ci]!));
        g.normals.push(...mirror(nn));
        g.uvs.push(u, v);
      }
      // 繞序反轉（X 鏡射改變定向）
      g.indices.push(base + 0, base + 2, base + 1, base + 0, base + 3, base + 2);
      g.triangles += 2;
    }
  }
  return g;
}

/** 16×16 調色盤：欄 = 顏色槽，列 = 明暗級。整欄填滿，所以任何濾波都糊不出第三種顏色。 */
export function paletteRgba(palette: readonly string[]): Uint8Array {
  const px = new Uint8Array(TEX_EDGE * TEX_EDGE * 4);
  for (let x = 0; x < TEX_EDGE; x++) {
    const hex = palette[x % palette.length] ?? "#ff00ff";
    const h = hex.startsWith("#") ? hex.slice(1) : hex;
    const rgb = [
      parseInt(h.slice(0, 2), 16) || 0,
      parseInt(h.slice(2, 4), 16) || 0,
      parseInt(h.slice(4, 6), 16) || 0,
    ];
    for (let y = 0; y < TEX_EDGE; y++) {
      const shade = 1 - y * SHADE_STEP;
      const o = (y * TEX_EDGE + x) * 4;
      for (let k = 0; k < 3; k++) {
        px[o + k] = Math.max(0, Math.min(255, Math.round(rgb[k]! * shade)));
      }
      px[o + 3] = 255;
    }
  }
  return px;
}

/** 把一件物件烤成 .glb 位元組。⭐ 這支函式對所有 15 件是**同一支**。 */
export function bake(piece: Piece): BakeResult {
  const geo = buildGeometry(piece);
  if (geo.triangles > TRI_BUDGET) {
    throw new Error(`${piece.key}: ${geo.triangles} triangles > budget ${TRI_BUDGET}`);
  }
  // 不變量①：整件往上推到 bbox 最低點 = 0。⛔ 不是檢查，是建構。
  let minY = Infinity;
  for (let i = 1; i < geo.positions.length; i += 3) minY = Math.min(minY, geo.positions[i]!);
  let maxY = -Infinity;
  for (let i = 1; i < geo.positions.length; i += 3) {
    geo.positions[i] = geo.positions[i]! - minY;
    maxY = Math.max(maxY, geo.positions[i]!);
  }
  // 不變量②：高過 2.4u 的東西會被 dressArena 壓扁，也可能整個蓋掉一位英雄。
  if (q(maxY) > SCENERY_HEIGHT_CAP) {
    throw new Error(
      `${piece.key}: ${maxY.toFixed(3)}u tall > SIGHTLINE_HEIGHT_CAP ${SCENERY_HEIGHT_CAP}u ` +
        `— dressArena would Y-squash it (see ArenaScene.occludesPlayArea)`,
    );
  }

  const b = new GlbBuilder();
  const accPos = b.addFloat("VEC3", geo.positions, { minMax: true, target: 34962 });
  const accNrm = b.addFloat("VEC3", geo.normals, { target: 34962 });
  const accUv = b.addFloat("VEC2", geo.uvs, { target: 34962 });
  const accIdx = b.addIndices(geo.indices);
  const png = encodePng(TEX_EDGE, TEX_EDGE, paletteRgba(piece.palette));
  b.addRawView(png, "palette");
  const imageView = b.rawViewSlot(0);

  const bytes = b.build({
    asset: { version: "2.0", generator: "ggd-scenery-gen" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: piece.key, mesh: 0 }],
    meshes: [
      {
        name: piece.key,
        primitives: [
          {
            attributes: { POSITION: accPos, NORMAL: accNrm, TEXCOORD_0: accUv },
            indices: accIdx,
            material: 0,
            mode: 4,
          },
        ],
      },
    ],
    materials: [
      {
        name: `scenery-${piece.key}`,
        pbrMetallicRoughness: {
          // 白色底色：#49 的 `applyModelTint` 是**相乘**的，從白開始才是乾淨的疊色。
          baseColorFactor: [1, 1, 1, 1],
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
        doubleSided: false,
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
    images: [{ name: "palette", mimeType: "image/png", bufferView: imageView }],
  });

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < geo.positions.length; i += 3) {
    minX = Math.min(minX, geo.positions[i]!);
    maxX = Math.max(maxX, geo.positions[i]!);
    minZ = Math.min(minZ, geo.positions[i + 2]!);
    maxZ = Math.max(maxZ, geo.positions[i + 2]!);
  }
  return {
    piece,
    bytes,
    stats: {
      triangles: geo.triangles,
      vertices: geo.positions.length / 3,
      bytes: bytes.length,
      bbox: [q(minX), 0, q(minZ), q(maxX), q(maxY), q(maxZ)],
      sha256: sha256Hex(bytes),
    },
  };
}
