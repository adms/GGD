/**
 * 單位圓的多邊形近似（GH#324 Phase 3）。
 *
 * ⭐ **它住在 `map/` 而不是 `sim/`，是刻意的。**
 * `sim/**` 的 purity 閘用**掃原始碼**的方式禁三角函式，而它不管那行是不是只在
 * 模組載入時跑一次 —— 一個「編譯期常數表」在它眼裡跟 runtime 呼叫沒有差別。
 * 那個嚴格是對的：⛔ 不要為了繞過它而改閘。
 *
 * ⇒ 表在這裡算好（`map/` 不受閘管），`sim/map/bounds.ts` 只 import 資料。
 */
export const CIRCLE_STEPS = 64;

/** 單位圓上 `CIRCLE_STEPS + 1` 個點（首尾重複，方便線性內插）。 */
export const UNIT_CIRCLE: readonly { x: number; z: number }[] = Array.from(
  { length: CIRCLE_STEPS + 1 },
  (_, i) => {
    const a = (i / CIRCLE_STEPS) * Math.PI * 2;
    return { x: Math.cos(a), z: Math.sin(a) };
  },
);
