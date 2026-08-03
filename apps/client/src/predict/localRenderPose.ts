/**
 * 自己英雄那一幀的 render pose —— 位置與**面向**分別由誰決定 (GH#281).
 *
 * ⚠️ 這支函式存在的理由是「守衛得到」。它原本是 `GameApp.poseFor` 裡的一個
 * inline 分支，而 `GameApp` 要一整套 Babylon + Colyseus 才起得來，所以那個分支
 * 可以整段刪掉而全套測試照樣全綠（CLAUDE.md 失敗形態 ③）。拆成純函式之後
 * `localRenderPose.test.ts` 直接對它做行為斷言。
 *
 * 決定：
 *   · **位置永遠來自預測**。三個模式都一樣 —— 把位置交回權威會把 #43 修掉的
 *     30Hz judder 整個放回來，而且自己的英雄會晚一趟 RTT。
 *   · **面向依模式**。`authoritative` = 只信伺服器；其餘 = 用影子算出來的
 *     （影子本身已經吃過 (a) 的 snap，所以 `hybrid` 兩者兼得）。
 */
import { facingModePredictsLocally, type LocalFacingMode } from "@ggd/shared/sim/facingLock";
import type { RenderPose } from "./LocalPrediction";

/** 權威快照上的面向（`EntityState.fx/fz`）。 */
export interface AuthFacing {
  fx: number;
  fz: number;
}

/**
 * `out` 是呼叫端持有的可重複使用緩衝 —— `poseFor` 一秒被呼叫上千次，這條路徑上
 * 的 per-frame 配置是量得到的 GC 壓力。回傳的一定是 `predicted` 或 `out` 其中
 * 一個，呼叫端不得保留參照跨幀。
 */
export function localRenderPose(
  mode: LocalFacingMode,
  predicted: RenderPose,
  auth: AuthFacing,
  out: RenderPose,
): RenderPose {
  if (facingModePredictsLocally(mode)) return predicted;
  out.x = predicted.x;
  out.z = predicted.z;
  // 退化的權威面向（快照還沒 materialise）→ 留著預測的那一個。零向量會讓下游的
  // yaw nlerp 除以零，而且畫面上會是一個瞬間亂轉的身體。
  if (auth.fx * auth.fx + auth.fz * auth.fz > 1e-12) {
    out.fx = auth.fx;
    out.fz = auth.fz;
  } else {
    out.fx = predicted.fx;
    out.fz = predicted.fz;
  }
  return out;
}
