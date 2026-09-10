/** Shared with tools/model-budget/limits.ts: iPad mini A17 Pro at 30 fps, estimated. */
export const C_CHAN_MS = 2.19 / 1476;
/**
 * ms／每個常駐 mesh —— **量到的**（task #80 的 A/B：同一個場景 279 vs 713 個
 * mesh，p50 5.6 vs 9.2 ms，兩點連線的斜率）。
 *
 * ⚠️ 它原本只住 `tools/model-budget/limits.ts`，而那支檔案 **import 這一支** ⇒
 * 反向 import 會是循環相依。⭐ 搬到這裡（與 `C_CHAN_MS` 同一個住處），
 * `limits.ts` 改成從這裡 re-export —— ⛔ 同一個量測值不可以有兩份（第〇·四守則）。
 */
export const C_MESH_MS = (9.2 - 5.6) / (713 - 279);
export const DERATE = 2.4;
export const ANIMATION_FRAME_MS = 9;
export const CHAMPION_INSTANCES = 12;
/**
 * ⭐ 公式**推導**出來的上限（160）—— ⚠️ 2026-09-10 起它**不再是出貨值**。
 *
 * > owner 2026-09-10（逐字）：「（每幀動畫通道上限 160）**太低了 至少要有 300以上每個**」
 *
 * ⇒ ⭐ 出貨值住 `content/config/model-lod.json` 的 `championChannelLimit`（**300**）。
 * ⭐ 這個常數留著當**診斷**：它回答「照原本那組假設，上限會是多少」，
 * ⛔ 而它**不再決定**任何一顆模型過不過（第〇·四守則：上限只有一個住處）。
 */
export const DERIVED_CHAMPION_CHANNEL_LIMIT = Math.floor(ANIMATION_FRAME_MS / (C_CHAN_MS * DERATE) / CHAMPION_INSTANCES / 10) * 10;

/**
 * ⛔ 讀不到設定時的保底 —— ⭐ 與 `DEFAULT_MODEL_LOD` 的兩格**同一個數字**。
 *
 * > owner 2026-09-10（逐字）：「你改成 **300 warning, 500 limit**」
 *
 * ⭐ 兩條線的意思不同：**警戒**只印一行、⛔ 不擋；**上限**才讓 `guard.ts` 回非零。
 */
export const CHAMPION_CHANNEL_WARN = 300;
export const CHAMPION_CHANNEL_LIMIT = 500;

/**
 * ⭐ 這一格設成 N 等於**多大的保守餘裕**？（⛔ 診斷用，不決定任何事）
 *
 * ⚠️ 原本的 `DERATE = 3` 自稱是「a conservative **planning assumption**, not a support
 * scope」—— ⭐ 也就是說它**沒有人量過**。⇒ 這支函式讓「調高上限的代價」看得見：
 * `championChannelLimit: 300` ⇒ 餘裕約 **1.6 倍**（⛔ 不是 3 倍）。
 */
export function derateFor(perChampionChannels: number): number {
  return ANIMATION_FRAME_MS / (C_CHAN_MS * perChampionChannels * CHAMPION_INSTANCES);
}
/**
 * ⭐ 每支英雄的 draw call 上限 —— 2026-09-10 起**接上場景預算的推導鏈**。
 *
 * ⚠️ 在此之前這一格是 `{warn: 3, limit: 5}` 的**字面值,⛔ 沒有任何出處** ——
 * 而同一個 repo 的 `tools/model-budget/limits.ts` 早就有一條場景級的推導：
 *   `MESH_LIMIT = round(6.0ms ÷ (C_MESH_MS × DERATE), 10)`
 * ⇒ 那條線在 DERATE=3 時是 **240 個 mesh／畫面**，而 12 具英雄佔其中 5×12 = **60**
 *   ⇒ 英雄這一族的份額是 **25%**（其餘留給場地、道具、特效、怪物）。
 *
 * ⭐ 判準：**份額不動，讓裝置代差去移那條線**（⛔ 不是反過來為了塞內容調份額）。
 * DERATE 3 → 2.4（最低配備 A17 Pro → M1，見 limits.ts）⇒ MESH_LIMIT 240 → 300
 * ⇒ 300 × 25% ÷ 12 = **6.25** ⇒ 上限 **6**，警戒維持 1:2 的比例 ⇒ **3**。
 *
 * ⚠️ 誠實地說：這只解開 41 顆裡的 1 顆（`ou99.491448` draw=6）。
 * 另外 3 顆（7／7／8）與 `ou99.497211`（58,410 三角面）要靠**貼圖圖集與減面**，
 * ⛔ 不是靠再調這一格 —— owner 2026-09-10 逐字：「貼圖圖集跟減面的優化
 * 還是可以做的 是獨立考量」。
 */
const MESH_SCENE_LIMIT = Math.round(6.0 / (C_MESH_MS * DERATE) / 10) * 10;
const CHAMPION_MESH_SHARE = 0.25;
/**
 * ⭐ 英雄貼圖的邊長 —— 2026-09-10 起從**螢幕解析度反推**，⛔ 不再是 512/1024 的字面值。
 *
 * > owner 2026-09-10（逐字）：「貼圖圖集 應該也可以縮小尺寸及壓縮到可接受的程度嗎
 * >  因為**我們不是在做4k遊戲 頂多HD1080**」
 *
 * 量到的（出貨鏡頭參數 + 1080p）：
 * · `content/config/camera.json` 的 `defaultDolly 18` / `minDolly 10`，Babylon fov 0.8 rad
 * · 英雄身高固定 1.7 世界單位（`models.py` 的 `HERO_TARGET_HEIGHT`）
 * ⇒ 一具英雄在畫面上 **121 像素高**（預設鏡頭）· **217 像素**（滾到最近）
 * ⇒ 螢幕佔用約 150×250 ≈ **37,500 個像素**
 *
 * | 貼圖 | texel | 相對螢幕像素 |
 * |---|---:|---:|
 * | 1024² | 1,048,576 | 過取樣 28.0× |
 * | 512² | 262,144 | 過取樣 7.0× |
 * | **256²** | **65,536** | **過取樣 1.7×** ⭐ |
 * | 128² | 16,384 | 0.4×（不足） |
 *
 * ⭐ 視覺證明：西索（5 張貼圖）在 512²／256²／192² 三個版本的實拍逐像素比對，
 * **256² 與 512² 的平均每通道差 0.10 / 255**（192² 是 0.19）——
 * ⚠️ 而那是在實拍台的 ~300 像素，**比遊戲裡最近的 217 像素更嚴苛**。
 *
 * ⇒ 警戒 **256**（設計目標）／上限 **512**（真的需要細節的角色的硬天花板）。
 *
 * ⛔⛔ 而「壓縮」對這一格**沒有用**：`emit_report.ts` 的 `vramOf` 逐字是
 * 「RGBA8（Babylon 把每一種壓縮來源都解成 RGBA8）× 4/3 給 mip」
 * ⇒ PNG/JPEG 只縮**下載量**，VRAM 一個位元組都不會少。
 * ⭐ 真正能再省的只有 **KTX2/ASTC**（GPU 壓縮格式在 VRAM 裡保持壓縮，4–8×）。
 */
const HERO_TEXTURE_EDGE = { warn: 256, limit: 512 } as const;
export const HERO_MODEL_BUDGET = {
  tris: { warn: 16_000, limit: 28_000 },
  meshes: {
    warn: Math.floor(MESH_SCENE_LIMIT * CHAMPION_MESH_SHARE / CHAMPION_INSTANCES / 2),
    limit: Math.floor(MESH_SCENE_LIMIT * CHAMPION_MESH_SHARE / CHAMPION_INSTANCES),
  },
  texEdge: HERO_TEXTURE_EDGE,
  // ⭐ GH#1164 —— 兩條線各自是 owner 指定的**字面值**，⛔ 不再由 `limit × 0.75` 推。
  //   ⚠️ 舊的 `0.75` 會讓警戒線變成 375 —— ⛔ 那不是他說的 300。
  channels: { warn: CHAMPION_CHANNEL_WARN, limit: CHAMPION_CHANNEL_LIMIT },
} as const;
