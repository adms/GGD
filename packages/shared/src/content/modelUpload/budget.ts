import shippedModelLod from "../../../../../content/config/model-lod.json";
import { DEFAULT_MODEL_LOD } from "../schema/config/modelLod";

/** Shared with tools/model-budget/limits.ts: iPad mini A17 Pro at 30 fps, estimated. */
export const C_CHAN_MS = 2.19 / 1476;
export const DERATE = 3;
export const ANIMATION_FRAME_MS = 9;
export const CHAMPION_INSTANCES = 12;
/**
 * ⭐ 公式**推導**出來的上限（160）—— ⚠️ 2026-09-10 起它**不再是出貨值**。
 *
 * > owner 2026-09-10（逐字）：「（每幀動畫通道上限 160）**太低了 至少要有 300以上每個**」
 *
 * ⇒ ⭐ 出貨值住 `content/config/model-lod.json` 的 `championChannelLimit`。
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
// The CLI reads this JSON when it starts; the browser worker bundles it at build time.
export const CHAMPION_CHANNEL_WARN = shippedModelLod.championChannelWarn ?? DEFAULT_MODEL_LOD.championChannelWarn;
export const CHAMPION_CHANNEL_LIMIT = shippedModelLod.championChannelLimit ?? DEFAULT_MODEL_LOD.championChannelLimit;

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
export const HERO_MODEL_BUDGET = {
  tris: { warn: 16_000, limit: 28_000 },
  meshes: { warn: 3, limit: 5 },
  texEdge: { warn: 512, limit: 1024 },
  // ⭐ GH#1164 —— 兩條線各自是 owner 指定的**字面值**，⛔ 不再由 `limit × 0.75` 推。
  //   ⚠️ 舊的 `0.75` 會讓警戒線變成 375 —— ⛔ 那不是他說的 300。
  channels: { warn: CHAMPION_CHANNEL_WARN, limit: CHAMPION_CHANNEL_LIMIT },
} as const;
