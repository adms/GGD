/**
 * 小地圖規格的**上下界**（GH#324 Phase 1）。
 *
 * owner 2026-08-14 定死了一套「所有動漫場地共用」的規格：20×16～26×20 格、
 * 橫跨 12–20 秒、4–6 個地圖區域（最推薦 5）、≤1 條死路、≥2 條迴圈、
 * 2–3 個瓶頸、0–2 個捷徑、6–10 個互動點、**最多 1 個特殊機制**。
 *
 * ⭐ 那些**出貨值**住在 `content/config/map-spec.json`（第一守則的三個住處）。
 *    這個檔只放**界**：欄位合法的範圍，以及 Zod 用得到的常數。
 *
 * ⛔ 為什麼界要放在這裡而不是直接寫進 Zod：
 *    產生器（`compile.ts`）與驗證器（`validate.ts`）都要用同一組界。
 *    寫進 Zod 再抄一份到驗證器 = 第四個住處，而它沒有守衛（第零守則）。
 *    比照 `content/schema/mitigationDoc.ts` 從 `sim/combat/penetration.ts` import 界的做法。
 *
 * ⚠️ 這個檔**不在** `src/sim/` 底下，所以不受 `purity.test.ts` 管 —— 烘焙期可以自由用
 *    `Math.hypot` 與三角函式。runtime 消費端在 `src/sim/map/`，那三個檔全部是查表。
 */

/** 一格等於幾個世界單位的合法範圍。 */
export const TILE_SIZE_MIN = 0.5;
export const TILE_SIZE_MAX = 8;

/**
 * ⭐ 出貨的 `tileSize`（2026-08-14 由 Claude 決定，owner 授權「你自己決定合理 tileSize」）。
 *
 * **選 2.0 的唯一理由**：24×18 格 = **48×36 世界單位**，與今天的對戰分區
 * （`boundaryRadius` 24 ⇒ 直徑 48）**同尺度**。於是 `aoeTiers` 的 6.0/8.0 級距、
 * 火圈的 Zod 上界、以及**全部 90 支技能的射程**一格都不用重算。
 *
 * ⚠️ 任何其他值都會把這批工作變成「順便重調全部技能」。要改它之前先讀
 * `docs/_新場地計畫.md` 的 A3。
 */
export const TILE_SIZE_SHIPPED = 2;

/** 格線尺寸的**硬**界（Zod 用）。owner 的規格窗（20–26 / 16–20）是**出貨值**，住在 config。 */
export const GRID_COLS_MIN = 8;
export const GRID_COLS_MAX = 64;
export const GRID_ROWS_MIN = 8;
export const GRID_ROWS_MAX = 64;

/** 地圖區域數的硬界。⚠️ 上限刻意寬過規格窗 —— 規格是品味，這是誤讀保險絲。 */
export const REGIONS_MIN = 1;
export const REGIONS_MAX = 16;

/** 互動點數的硬界。 */
export const INTERACTIONS_MAX = 64;

/** 一張圖最多幾個特殊機制。⛔ owner 定死 1，這不是可調的。 */
export const GIMMICKS_PER_MAP_MAX = 1;

/**
 * ⭐ 一張編譯出來的場地**至少**要有幾個對戰分區。
 *
 * owner 2026-08-14「這是一個 3v3 地形」⇒ 一張地圖 = 一個對戰分區的地形，
 * 產生器把同一份佈局**實例化 N 份**填進 `arena@1` 的 `zones[]`。
 *
 * ⛔ 這個 2 不是品味，是**正確性**：`pairTeams` 在 4 隊存活時一定吐出 zone 0 與 zone 1
 * （`PairedDuels.ts`），而 `MatchController` 是 `this.arena.zones[pairing.zone]!`
 * （非空斷言）。只有一個分區的場地放進輪替池，**第 1–9 回合會解參考 undefined**。
 * schema 只要求 `zones.min(1)`，所以這個保證必須由產生器與驗證器提供。
 */
export const DUEL_ZONES_PER_MAP_MIN = 2;

/** 驗證器對「品味項」的處置：擋下來，還是只記在報告上。 */
export type MapCheckSeverity = "error" | "warn" | "off";

/**
 * ⛔ **連通性不可調**。
 *
 * 「有區域走不到」「出生點不可達」「某個 gate 組態把圖切成兩半」——
 * 產生器一律拒絕輸出，與 config 的 severity 無關。那不是品味，那是正確性。
 * 可調的只有**品味項**：死路數、迴圈數、瓶頸數、捷徑數、互動點數。
 */
export const HARD_CHECKS = [
  "disconnectedRegions",
  "unreachableSpawn",
  "unreachableInteraction",
  "gateTrapsPlayers",
  "duelZoneCount",
] as const;
export type HardCheck = (typeof HARD_CHECKS)[number];
