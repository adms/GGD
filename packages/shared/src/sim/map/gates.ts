/**
 * 可開關的幾何（GH#324 Phase 5 的機制，Phase 3 先落地）。
 *
 * ⭐ **三個關鍵性質**，缺一個這個功能就會變成 desync 製造機：
 *
 *  ① 狀態是 **(doc, absoluteTick) 的純函式** ⇒ 伺服器與客戶端各自算出同一個答案，
 *     **wire 成本 0、沒有 desync 通道**。⛔ 不是「伺服器算完送過去」——
 *     那會重新打開 `ArenaDef.ts:141` 記錄的那個洞（伺服器碰撞半徑 42、玩家看到 24）。
 *  ② **絕對 tick**，⛔ 不用遞減計數器（`sim/**` 的硬性約束）。
 *  ③ 「永不困住玩家」是**驗證器的性質**，不是這裡的 if —— 每一個組態的圖都必須
 *     全連通、所有出生點與互動點可達，否則產生器拒絕輸出。
 *
 * ⭐ 這個機制順便給了城門、崩塌的橋、可破壞的牆 ——
 * 七張圖的機制**有五個是這個形狀**（希干希納城門、黑泥封路、守護者封鎖、
 * 魔法門、競技場開放／封閉）。⛔ 不要為它們各寫一個 if。
 */
import type { Obstacle } from "../world/ArenaDef";

/** 排程：週期性地在幾組「哪些 gate 關上」之間輪替。 */
export interface GateSchedule {
  kind: "periodic";
  periodTicks: number;
  telegraphTicks: number;
  /** 每個組態列出**關上的** gateGroup id。至少兩組才叫「交換」。 */
  configurations: string[][];
}

/**
 * 在 `tick` 這一刻，哪些 gateGroup 是**關上的**（＝擋路）。
 *
 * ⚠️ 回傳排序過的陣列 —— 呼叫端可能拿它做集合比對，未排序會讓兩邊「內容一樣、
 * 順序不同」而誤判成不一致。
 */
export function closedGatesAt(schedule: GateSchedule | undefined, tick: number): string[] {
  if (schedule === undefined || schedule.configurations.length === 0) return [];
  const period = Math.max(1, Math.floor(schedule.periodTicks));
  // ⚠️ 絕對 tick 整除 —— 沒有累積狀態，所以 replay 到任何一 tick 都得到同一個答案。
  const idx = Math.floor(tick / period) % schedule.configurations.length;
  return [...(schedule.configurations[idx] ?? [])].sort();
}

/**
 * 這一 tick 之後多久會換組態。給預告用（`telegraphTicks` 內就該閃）。
 * 沒有排程時回 `Number.POSITIVE_INFINITY`。
 */
export function ticksUntilGateSwap(schedule: GateSchedule | undefined, tick: number): number {
  if (schedule === undefined || schedule.configurations.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const period = Math.max(1, Math.floor(schedule.periodTicks));
  return period - (tick % period);
}

/**
 * 這一 tick **真的擋路**的障礙物。
 *
 * ⚠️ 沒有 `gateGroup` 的障礙物永遠擋路 —— 那是既有 6 張手寫場地的行為，
 * ⛔ 不可以因為引入 gate 就改變它們。
 */
export function activeObstacles(
  obstacles: readonly Obstacle[],
  schedule: GateSchedule | undefined,
  tick: number,
): Obstacle[] {
  if (schedule === undefined) return obstacles as Obstacle[];
  const closed = new Set(closedGatesAt(schedule, tick));
  // ⚠️ 語意：`gateGroup` 在 closed 清單裡 = 這道門**關著** = 擋路。
  //    不在清單裡 = 開著 = 這一 tick 它不存在。
  return obstacles.filter((ob) => ob.gateGroup === undefined || closed.has(ob.gateGroup));
}
