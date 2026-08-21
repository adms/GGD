/**
 * PadHudFocusBanner — 「我現在在操作介面，不是在操作英雄」的那一句話（GH#508）。
 *
 * ⚠️ 這不是裝飾。HUD 焦點模式把方向鍵與 A 從英雄手上接走，⭐ 而一個**看不出來**
 * 的模式切換，畫面上跟「手把壞了」一模一樣（失敗形態①：算出來了但玩家看不到）。
 * 所以模式一定要有一個擋不掉的視覺狀態：整個畫面一圈邊框 + 一條說明橫幅。
 *
 * `pointerEvents: "none"` 全程 —— 它只是說話，⛔ 不吃任何一個點擊；
 * 邊框那一層蓋住整個視窗，若吃事件就等於整場比賽點不到地面。
 */
import { useSyncExternalStore } from "react";
import { padHudFocusMode, padHudFocusTuning, subscribePadHudFocus } from "./padHudFocus";
import { TEXT_MAIN } from "../theme";

const RING = "#7fd0ff";

export function PadHudFocusBanner(): React.JSX.Element | null {
  const on = useSyncExternalStore(subscribePadHudFocus, padHudFocusMode, () => false);
  const tuning = padHudFocusTuning();
  if (!on || !tuning.showBanner) return null;
  return (
    <div data-pad-hud-focus-banner="" style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: `2px solid ${RING}`,
          boxShadow: `inset 0 0 24px rgba(127,208,255,0.28)`,
          borderRadius: 4,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 18,
          transform: "translateX(-50%)",
          padding: "5px 16px",
          background: "rgba(12,26,38,0.92)",
          border: `1px solid ${RING}`,
          borderRadius: 999,
          color: TEXT_MAIN,
          fontSize: 12.5,
          fontWeight: 700,
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        🎮 介面操作模式 — 方向鍵移動 · A 確定 · View/B 回到操控英雄
      </div>
    </div>
  );
}
