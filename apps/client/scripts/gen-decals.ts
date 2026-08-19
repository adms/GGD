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
 * ── 裂痕怎麼畫的 ─────────────────────────────────────────────────────────
 * Voronoi 的 **F2 − F1**（`worley`）就是「格子的邊界」場：兩個最近特徵點等距的
 * 地方 = 0，格子中心 = 大。把它反過來取窄的一條帶就得到一張連通的裂縫網 ——
 * 這正是碎裂的地面在物理上的樣子（應力沿著最弱的界面走），⛔ 不是隨機畫線。
 *
 * 兩層 Voronoi 疊加：粗的一層是主裂縫，細的一層是次生碎裂。再乘上一個**徑向
 * 遮罩**（中心最強、邊緣歸零），因為它是被 `GroundDecalPool` 貼成一個圓片，
 * 邊緣不收乾淨會看到方形的貼圖邊界。
 *
 * ── 輸出格式 ─────────────────────────────────────────────────────────────
 * RGBA 256²，**alpha 帶形狀**、RGB 全白。`GroundDecalPool` 開
 * `useAlphaFromDiffuseTexture` 並把 `spec.tint` 寫進 `emissiveColor`，
 * 所以顏色由 spec 決定、貼圖只提供遮罩 —— 一張圖換不同 tint 就能重用。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeTexturePng } from "./png";
import { clamp01, fbm, smoothstep, worley } from "./texgen/noise";

const SIZE = 256;
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(REPO, "content", "assets", "textures", "decals");

const byte = (x: number): number => Math.max(0, Math.min(255, Math.round(x * 255)));

/** 裂縫場：F2−F1 越小 = 越靠近格子邊界 = 越裂。`width` 是縫的寬度（cell 單位）。 */
function fissure(x: number, y: number, cells: number, width: number, seed: number): number {
  const { f1, f2 } = worley(x, y, cells, seed);
  return 1 - smoothstep(0, width, f2 - f1);
}

function crackAlpha(): Buffer {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      // 主裂縫（少數幾條粗的）+ 次生碎裂（細密的）。
      const main = fissure(u, v, 5, 0.085, 1301);
      const fine = fissure(u, v, 11, 0.05, 4409) * 0.5;
      // 沿著縫抖動寬度，免得每一條都是等寬的塑膠感。
      const jitter = 0.65 + 0.35 * fbm(u, v, 8, 3, 907);
      // 徑向遮罩：中心 1 → 半徑 0.5 歸零。⛔ 不收邊會看到方形貼圖邊界。
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const mask = 1 - smoothstep(0.35, 1, r);
      const a = clamp01(Math.max(main, fine) * jitter) * mask;
      const i = (y * SIZE + x) * 4;
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = byte(a);
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, "crack_01.png");
writeFileSync(out, encodeTexturePng(SIZE, SIZE, crackAlpha(), 4));
console.log(`wrote ${out}`);
