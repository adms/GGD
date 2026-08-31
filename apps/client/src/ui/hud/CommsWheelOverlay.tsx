/**
 * CommsWheelOverlay —— 通訊輪盤的畫面（GH#731）。
 *
 * ⭐ **為什麼它不是一個 HUD slot**：輪盤畫在**指標按下去的那一點**，⛔ 不在任何角落。
 * 它是一層 `pointerEvents: none` 的覆蓋層，只在按住的那幾百毫秒存在
 * ⇒ ⛔ 不佔任何既有 slot 的版面預算（`MapCornerLabel` 檔頭量過：每個角都有預算了）。
 *
 * ⚠️ ⭐ 這個檔**一格文案都沒有** —— 格數、字、語音類別全部從
 * `config.ui-cues@1` 的 `commsWheel.entries` 來。⛔ 想加第六格不必碰這裡。
 */
import type { CSSProperties } from "react";
import { HUD_Z } from "./hudLayout";
import { PANEL_BG, PANEL_BORDER, TEXT_MAIN } from "../theme";
import type { CommsWheelEntry } from "../../game/commsWheel";
import { useHud } from "../../net/RoomStore";

/** 圓盤半徑（px）。⭐ 與 `wheelIndexAt` 的死區（28px）成比例。 */
const RADIUS = 108;

export interface CommsWheelOverlayProps {
  /** 圓心（螢幕座標）。`null` ＝ 沒開，⇒ 什麼都不畫。 */
  readonly centre: { x: number; y: number } | null;
  readonly entries: readonly CommsWheelEntry[];
  /** 指到第幾格。`null` ＝ 在死區裡（放開＝取消）。 */
  readonly hovered: number | null;
}

/**
 * 純的那一半（⭐ 守衛餵得進假資料，⛔ 不需要一個能收鍵盤的瀏覽器）。
 */
export function CommsWheelOverlayView({
  centre,
  entries,
  hovered,
}: CommsWheelOverlayProps): React.JSX.Element | null {
  if (!centre || entries.length === 0) return null;
  const n = entries.length;
  return (
    <div
      data-hud-surface="comms-wheel"
      style={{
        position: "fixed",
        left: centre.x,
        top: centre.y,
        width: 0,
        height: 0,
        zIndex: HUD_Z.screen,
        pointerEvents: "none",
      }}
    >
      {/* ⭐ 死區的圈 —— 讓「放開＝取消」看得出來，⛔ 不是裝飾 */}
      <div
        style={{
          position: "absolute",
          left: -28,
          top: -28,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: PANEL_BORDER,
          background: hovered === null ? "rgba(255,255,255,0.14)" : "transparent",
        }}
      />
      {entries.map((e, i) => {
        // ⭐ 與 `wheelIndexAt` **同一個幾何**：12 點鐘是第 0 格的中央、順時針。
        const a = (i / n) * Math.PI * 2;
        const style: CSSProperties = {
          position: "absolute",
          left: Math.sin(a) * RADIUS,
          top: -Math.cos(a) * RADIUS,
          transform: "translate(-50%, -50%)",
          padding: "6px 12px",
          borderRadius: 8,
          whiteSpace: "nowrap",
          fontSize: 15,
          fontWeight: hovered === i ? 700 : 400,
          color: TEXT_MAIN,
          background: PANEL_BG,
          border: PANEL_BORDER,
          outline: hovered === i ? "2px solid rgba(255,255,255,0.85)" : "none",
        };
        return (
          <div key={e.id} data-comms-entry={e.id} style={style}>
            {e.zh}
          </div>
        );
      })}
    </div>
  );
}

/** 出貨的那一個：從 HUD store 讀現值。 */
export function CommsWheelOverlay(): React.JSX.Element | null {
  const w = useHud((s) => s.commsWheel);
  return (
    <CommsWheelOverlayView
      centre={w?.centre ?? null}
      entries={w?.entries ?? []}
      hovered={w?.hovered ?? null}
    />
  );
}
