/**
 * MarkBar —— 「我還剩幾層？」
 *
 * 52-00【十二道試煉】的層數是一條**命**：受到致命傷害時燒掉一層換一次不死。
 * 玩家在戰鬥中要能一眼讀到它，否則「還剩 1 層」跟「已經 0 層」在螢幕上一樣，
 * 而那兩件事的正確打法完全相反。
 *
 * 兩段式，跟 SelfStatusBar / KillCombo 同一個形狀：
 *   • `MarkBarView` —— 純 props → markup（沒有 store、沒有計時器），可以在 node
 *     裡 renderToStaticMarkup 之後把畫出來的字讀回來；
 *   • `MarkBar`     —— 容器：訂閱 store、戰鬥階段閘、免死閃動的退場輪詢。
 *
 * 位置：本機英雄的自身狀態列**正上方**。這是關於你自己身體的一個數字，所以它
 * 跟 HP/MP 和 buff 列站在一起，而不是被丟到眼睛只有戰鬥空檔才會去的角落。
 * ⚠️ 它**不是** hudLayout 的四角槽位（跟 SelfStatusBar 一樣），所以不動那張
 * 槽位表，也就不會碰到 `skipTransient` 堆疊尾端必須是 fps 的那條斷言。
 */
import React from "react";
import { useHud } from "../../net/RoomStore";
import { HUD_STAMP_BAND, HUD_Z } from "./hudLayout";
import { MARK_SAVE_FLASH_MS, markColor, markRows, type MarkRow } from "./markModel";

/** 免死閃動要自己退場，而它沒有別的時鐘（事件驅動，不是每幀）。 */
const MARK_POLL_MS = 120;

export function MarkBarView({ rows }: { rows: readonly MarkRow[] }): React.JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <div
      data-mark-bar="root"
      style={{
        position: "fixed",
        left: "calc(env(safe-area-inset-left, 0px) + 12px)",
        // 疊在自身狀態列上面。從 HUD_STAMP_BAND 推導（#66 的版本徽章佔畫面底部
        // 那一條），跟 SelfStatusBar 用同一個基準，兩者不可能各自漂走。
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${HUD_STAMP_BAND + 190}px)`,
        zIndex: HUD_Z.slot,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxWidth: "min(46vw, 260px)",
      }}
      role="status"
      aria-live="polite"
    >
      {rows.map((r) => {
        const c = markColor(r);
        return (
          <div
            key={r.markId}
            data-mark-id={r.markId}
            data-mark-count={r.count}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: r.saving ? "5px 12px" : "3px 10px",
              borderRadius: 5,
              border: `1px solid ${c}`,
              background: r.saving ? "rgba(255,224,138,0.26)" : "rgba(12,14,20,0.82)",
              boxShadow: r.saving ? `0 0 16px ${c}88` : "0 2px 8px rgba(0,0,0,0.55)",
            }}
          >
            {r.icon ? (
              <img
                src={`/content/${r.icon}`}
                alt=""
                aria-hidden="true"
                style={{ width: 18, height: 18, borderRadius: 3, flexShrink: 0 }}
              />
            ) : (
              <span
                aria-hidden="true"
                style={{ width: 7, height: 7, borderRadius: 2, background: c, flexShrink: 0 }}
              />
            )}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: r.saving ? 15 : 13,
                fontWeight: r.saving ? 800 : 600,
                color: c,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textShadow: "0 1px 3px rgba(0,0,0,0.9)",
              }}
            >
              {r.label}
            </span>
            <span
              style={{
                fontSize: r.saving ? 16 : 14,
                fontWeight: 800,
                color: c,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                textShadow: "0 1px 3px rgba(0,0,0,0.9)",
              }}
            >
              {`×${r.count}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MarkBar(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const marks = useHud((s) => s.marks);
  const [nowMs, setNowMs] = React.useState(() => nowMsSafe());
  const flashing = marks.some((m) => m.savedAtMs !== null && nowMs - m.savedAtMs < MARK_SAVE_FLASH_MS);
  React.useEffect(() => {
    if (!flashing) return;
    const t = setInterval(() => setNowMs(nowMsSafe()), MARK_POLL_MS);
    return () => clearInterval(t);
  }, [flashing]);
  // 事件一進來就重新取樣，否則閃動的起點會晚一個輪詢週期。
  const seqSum = marks.reduce((a, m) => a + m.seq, 0);
  React.useEffect(() => setNowMs(nowMsSafe()), [seqSum]);
  // 戰鬥階段限定：商店畫面上飄著一行「試煉 ×11」是在講一件此刻不存在的事，
  // 而那個畫面是商店的（跟 SelfStatusBar 同一條規矩）。
  if (phase !== "combat") return null;
  return <MarkBarView rows={markRows(marks, nowMs)} />;
}

function nowMsSafe(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
