/**
 * NoChampionNotice — `noChampionNotice()` 的畫面那一半。
 *
 * 決策全部在 `./noChampionNoticeModel`（純函式、可在 node 直接測）；這裡只把它畫出來。
 * 分成兩個檔的理由跟 `shopGate` / `MerchantShop` 一樣：這個專案沒有元件 render
 * 的測試環境（`apps/client` 沒有 jsdom 也沒有 testing-library），所以能被真的
 * 「跑起來驗行為」的部分要放在不碰 React 的那一側。
 *
 * ⚠️ 樣式刻意抄 `HudRoot` 自己的「Connecting to match…」方框（同一組
 * `PANEL_BG` / `PANEL_BORDER`、同樣的置中定位），而不是去搶
 * `hud/hudSurfaces` 的安全區插槽。理由：那個插槽系統（#107）是給**會同時
 * 出現的常駐 chrome** 排隊用的，而這個告示出現的時候，那些會跟它搶位置的東西
 * （商店、倒數、技能列、血條）**全部都不存在** —— 它們不存在正是它出現的原因。
 * 佔一個插槽等於為了一個永遠不會發生的碰撞付出協調成本。
 *
 * `pointerEvents: "none"` —— 它只是說明，不可以吃掉玩家對場景的點擊。
 */
import React from "react";
import { useHud } from "../../net/RoomStore";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { noChampionNotice } from "./noChampionNoticeModel";

export function NoChampionNotice(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  // 與 `HudRoot` / `MerchantShop` / `useHudPanels` 用的是同一個判準
  // （`localMaxHp > 0`），不是第二個意見 —— 兩個答案就是漂移。
  const hasChampion = useHud((s) => s.localMaxHp > 0);
  const view = noChampionNotice(phase, hasChampion);
  if (view === null) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: 420,
        padding: "16px 24px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 10,
        color: TEXT_MAIN,
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600 }}>{view.title}</div>
      <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 8, lineHeight: 1.6 }}>
        {view.detail}
      </div>
    </div>
  );
}
