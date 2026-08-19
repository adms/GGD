/**
 * gen-decals — 產生地面痕跡貼圖 `content/assets/textures/decals/*.png`。
 *   Run: pnpm tsx apps/client/scripts/gen-decals.ts
 *
 * WHY GENERATED（和 `gen-ground.ts` 同一個理由，見那支的檔頭）：這個 repo 的
 * 游標、圖示、地面材質、音效、配樂全部是自己算出來的。這裡多的一個理由是
 * **授權**：Kenney 的 `particles` 包裡沒有任何一張「地面裂痕」，而 WarStomp
 * 那一族的痕跡是 Blizzard 的美術 —— 自己畫一張，`content/assets/CREDITS.md`
 * 就沒有東西要補（那份是追**第三方**出處的）。
 *
 * 決定論：只用 `texgen/noise.ts` 的 seeded 整數 hash，⛔ 沒有 `Math.random`，
 * 所以重跑逐位元組重現。
 *
 * ── ⭐ GH#453：一支組裝器 + 一張參數表，⛔ 不是三支各寫一遍 ────────────────
 * 第零守則⑨：「如果我要寫的第二個東西跟第一個只差**參數**，停手，先抽模板。」
 * 三張痕跡（裂痕／焦痕／揚塵）只差**用了哪幾層、各多重** ⇒ `MARKS` 是資料，
 * `paintMark()` 是機制。加第四張痕跡＝在 `MARKS` 加一列，⛔ 不是加一個函式。
 *
 * 五種圖層（全部住在 `paintMark()`）：
 *   `fissure`  Voronoi 的 **F2 − F1** ＝ 格子的**邊界**場：兩個最近特徵點等距的
 *              地方 = 0。反過來取窄的一條帶就得到一張連通的裂縫網 —— 這正是
 *              碎裂的地面在物理上的樣子（應力沿著最弱的界面走），⛔ 不是隨機畫線
 *   `burn`     徑向核心 × fbm 撕邊 —— 燒穿的地面中心實、邊緣爛
 *   `streaks`  被拉長的 fbm ＝ 拖行／揚起的塵土
 *   `soot`     高頻 fbm，把死板的邊緣打碎
 *   `motes`    ⭐ **魔力光點（藍白微塵）** —— FATE 的視覺語言裡**撐得過小尺寸**
 *              的那一半（見 `@ggd/shared/art/fatePalette` 檔頭那張表）。
 *              稀疏的 Voronoi 點，只有一小部分的格子真的長出一顆
 *
 * ── ⚠️ 顏色**不在這裡**，這件事是量到的不是慣例 ───────────────────────────
 * `GroundDecalPool.make()`（apps/client/src/vfx/GroundDecalPool.ts:88-94）開的是
 * `disableLighting = true` + `diffuseColor = (0,0,0)` + `emissiveColor = spec.tint`
 * + `useAlphaFromDiffuseTexture = true` ⇒ **貼圖的 RGB 一位元都不會被看到**，
 * 顏色 100% 來自 `spec.tint`。
 * ⇒ 所以 FATE token 落在 `apps/client/src/vfx/feedbackPresets.ts` 的 `*_TINT`
 *   （那三格現在是 `fateInk()` 算出來的），⛔ 不是落在這裡的像素上。
 *   在這裡寫顏色會是第一·五守則的形狀：檔案裡有、畫面上永遠不會發生。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeTexturePng } from "./png";
import { clamp01, fbm, fbmAniso, hash1, smoothstep, worley } from "./texgen/noise";

const SIZE = 256;
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(REPO, "content", "assets", "textures", "decals");

const byte = (x: number): number => Math.max(0, Math.min(255, Math.round(x * 255)));

/** 一張痕跡。⭐ 每一列**只是數字** —— `paintMark()` 對三張是同一支函式。 */
interface Mark {
  key: string;
  label: string;
  /** [粗裂縫的格數, 縫寬], [細裂縫的格數, 縫寬]；空陣列 = 這張沒有裂縫 */
  fissures: readonly (readonly [number, number])[];
  /** 徑向燒穿的強度（0 = 沒有） */
  burn: number;
  /** 拖曳條紋的強度（0 = 沒有） */
  streaks: number;
  /** 高頻碎屑的強度 */
  soot: number;
  /** ⭐ 魔力光點的密度（0 = 沒有）。⚠️ 這是 FATE 那一半**撐得過**縮圖的東西 */
  motes: number;
  /** 徑向收邊的起點（半徑 0..1）。⛔ 不收邊會看到方形的貼圖邊界 */
  falloff: number;
  seed: number;
}

/**
 * 三張出貨的痕跡。
 *
 * ⭐ `scorch_01` 與 `kickup_01` 是 GH#453 **新產的**：在此之前這兩種痕跡指到
 * Kenney 的 `assets/textures/particles/{scorch_01,dirt_02}.png`（CC0，
 * `content/assets/CREDITS.md:540`）—— 那兩張是**通用粒子**，不是為了「被踩在
 * 地上的痕跡」畫的，而且它們的形狀跟 FATE 一點關係也沒有。
 */
const MARKS: readonly Mark[] = [
  {
    key: "crack_01",
    label: "地面震裂",
    fissures: [
      [5, 0.085],
      [11, 0.05],
    ],
    burn: 0,
    streaks: 0,
    soot: 0.35,
    motes: 0.18,
    falloff: 0.35,
    seed: 1301,
  },
  {
    key: "scorch_01",
    label: "焦痕",
    fissures: [[7, 0.03]],
    burn: 1,
    streaks: 0.18,
    soot: 0.3,
    motes: 0.1,
    falloff: 0.14,
    seed: 2207,
  },
  {
    key: "kickup_01",
    label: "揚起的塵土",
    fissures: [],
    burn: 0.22,
    streaks: 1,
    soot: 0.42,
    motes: 0.06,
    falloff: 0.1,
    seed: 3313,
  },
];

/** 裂縫場：F2−F1 越小 = 越靠近格子邊界 = 越裂。`width` 是縫的寬度（cell 單位）。 */
function fissure(x: number, y: number, cells: number, width: number, seed: number): number {
  const { f1, f2 } = worley(x, y, cells, seed);
  return 1 - smoothstep(0, width, f2 - f1);
}

/** ⭐ 一支組裝器，三張痕跡共用。⛔ 這裡不可以出現 `if (key === …)`。 */
function paintMark(m: Mark): Buffer {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;

      let a = 0;
      // 主裂縫（少數幾條粗的）+ 次生碎裂（細密的）。第二層之後逐層減半。
      let w = 1;
      for (const [cells, width] of m.fissures) {
        a = Math.max(a, fissure(u, v, cells, width, m.seed + cells) * w);
        w *= 0.5;
      }
      if (m.burn > 0) {
        // 撕邊：把半徑本身用 fbm 擾動，⛔ 不是畫一個乾淨的圓（那是 UI 不是痕跡）
        const ragged = r * (0.72 + 0.56 * fbm(u, v, 5, 3, m.seed + 41));
        a = Math.max(a, (1 - smoothstep(0.1, 0.86, ragged)) * m.burn);
      }
      if (m.streaks > 0) {
        // 拖行：沿著 X 拉長的 fbm，再乘一個環形遮罩 → 從中心往外甩出去的塵
        const drag = fbmAniso(u, v, 7, 46, 3, m.seed + 57);
        const ring = smoothstep(0.05, 0.36, r) * (1 - smoothstep(0.4, 0.95, r));
        a = Math.max(a, clamp01((drag - 0.42) * 2.4) * ring * m.streaks);
      }
      // 沿著縫抖動寬度，免得每一條都是等寬的塑膠感。
      const jitter = 0.65 + 0.35 * fbm(u, v, 8, 3, m.seed + 7);
      a *= jitter;
      a = clamp01(a + (fbm(u, v, 34, 3, m.seed + 91) - 0.62) * m.soot);
      if (m.motes > 0) {
        // 魔力光點：只有 `motes` 那一小部分的格子真的長出一顆，半徑逐格不同 ——
        // ⛔ 每格都有 = 一張規律的網點，那是圖樣不是微塵。
        const cell = worley(u, v, 13, m.seed + 133);
        const on = hash1(cell.id, 17) < m.motes ? 1 : 0;
        const size = 0.06 + hash1(cell.id, 23) * 0.07;
        a = Math.max(a, on * smoothstep(size, size * 0.2, cell.f1) * 0.85);
      }
      // 徑向遮罩：中心 1 → 半徑 1 歸零。⛔ 不收邊會看到方形貼圖邊界。
      a *= 1 - smoothstep(m.falloff, 1, r);

      const i = (y * SIZE + x) * 4;
      // RGB 全白：顏色由 `spec.tint` 決定（見檔頭）。一張圖換不同 tint 就能重用。
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = byte(clamp01(a));
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const m of MARKS) {
  const out = join(OUT_DIR, `${m.key}.png`);
  writeFileSync(out, encodeTexturePng(SIZE, SIZE, paintMark(m), 4));
  console.log(`wrote ${m.key.padEnd(11)} ${m.label.padEnd(8)} ${out}`);
}
