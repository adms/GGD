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
import { MARK_SAVE_FLASH_MS, markColor, markRows, markViewsFromWire, type MarkRow } from "./markModel";

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
              {/* ⭐ 決策點（GH#304）：**層數是 1 也印數字**，不套「多數遊戲
                  ×1 不顯示」那條慣例。理由是這個引擎的計數器**下界是 0 而且 0
                  有意義** —— 一個 0 層的標記仍然掛在身上，而「你沒有免死了」
                  正是玩家最需要看到的那一格（見 markModel 的 `MarkView.count`）。
                  0 一定要印，那 1 就不能藏：0、(空白)、2、3 這個序列在戰鬥中
                  讀起來是壞掉的。那條慣例來自「層數歸 0 就整格消失」的遊戲，
                  我們不是。 */}
              {`×${r.count}`}
            </span>
              {/* ⭐⭐ GH#899 —— 「已經失去的層數換來了多少」。owner 逐字：
                  「Berserker 12試煉 **復活12次沒有加12次攻擊力與生命力**」——
                  ⭐ 伺服器**真的有加**（四條守衛驗過），⛔ 而玩家在任何地方都看不到它：
                  右下角那張全屬性面板是**英雄卡**視角，任何 live modifier 都不顯示。
                  ⇒ ⭐ 畫在標記本人旁邊，⛔ 而不是再開一條「客戶端重算全部屬性」的路
                  （那會是第〇·四守則的第二個住處，而且它一定會跟伺服器漂）。
                  ⛔ 沒有 `perStackLost` 的標記這一格是 null ⇒ 逐位元不變。 */}
              {r.bonus !== null && (
                <span
                  data-mark-bonus={r.markId}
                  style={{ fontSize: 10, fontWeight: 700, color: c, opacity: 0.85,
                           whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
                >
                  {r.bonus}
                </span>
              )}
          </div>
        );
      })}
    </div>
  );
}

export function MarkBar(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);
  // 免死閃動（`savedAtMs` / `seq`）—— 只有這個還是事件驅動的。
  const marks = useHud((s) => s.marks);
  const seat = localSeatId === null ? undefined : seats.find((x) => x.seatId === localSeatId);
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
  if (phase !== "combat" || !seat) return null;
  // ⭐ 層數讀**快照**（GH#304），閃動讀事件。所以一個剛連上的客戶端從第一份
  // 快照就畫得出正確層數 —— 這正是 owner 選「加欄位」而不是「發事件」的理由。
  return <MarkBarView rows={markRows(markViewsFromWire(seat.counterIds, seat.counterCounts, marks), nowMs)} />;
}

function nowMsSafe(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
