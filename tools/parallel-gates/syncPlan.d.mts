/**
 * `syncPlan.mjs` 的型別 —— 守衛（TS）與 `sync.mjs`（JS）共用同一支實作。
 * ⚠️ 只宣告**守衛真的用到的**那幾個匯出，⛔ 不是把整支檔案抄成型別
 *（那會是第二個住處，而它會在下一次改動時靜靜漂開）。
 */
export declare function planFromPaths(
  paths: readonly string[],
  repo?: string,
): {
  full: boolean;
  fullReason: string | null;
  unknown: string[];
  unmeasured: string[];
  steps: string[];
  skipped: string[];
  layerNames: string[][];
  reasons: Record<string, string>;
  ms: number;
  msAll: number;
};
