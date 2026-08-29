/**
 * SelfStatusBar — 「我怎麼了?」
 *
 * owner, 2026-07-27: 「我也看不出來自己暈眩還是發生什麼事情，應該要有提示自己的
 * 負面/正面 buff」.
 *
 * Two pieces, like KillCombo: a PURE view (props → markup, no store, no timers)
 * so a test can render it headlessly and read the painted text back out, and a
 * container that subscribes to the seat.
 *
 * PLACEMENT: directly under the local player's own HP/MP cluster. This answers
 * a question about YOUR body, so it belongs beside your body's other numbers —
 * not in a corner the eye only visits between fights.
 */
import React from "react";
import { useHud } from "../../net/RoomStore";
import { HUD_STAMP_BAND, HUD_Z } from "./hudLayout";
import { selfStatusRows, statusColor, type SelfStatusRow } from "./selfStatusModel";

/**
 * REACT KEYS — ⛔ 不可以是裸的 `statusId`（GH#837）。
 *
 * 線上的 `statusIds` / `statusRemainTicks` 是**逐層**的兩條對齊陣列，⛔ 不是一個
 * 集合：兩個來源各給一層 30% 減速 ⇒ 陣列裡真的有**兩筆 `slow30`**，而
 * `selfStatusRows()` 刻意保留兩列（兩層 = 兩顆圖示，玩家要看得到自己疊了幾層）。
 * ⇒ 拿 `r.id` 當 key 就是**兩個 child 同一把 key**：戰鬥中每幀刷 React 警告，
 * 而 React 的語意是重複 key 的 child **可能被吃掉** —— 少畫的那一顆正是
 * 「我身上疊了第二層」這個資訊。
 *
 * ⭐ 用**同 id 的第幾次出現**當後綴，⛔ 不是陣列 index：上面插進一列不相干的
 * 狀態時，index 會讓後面每一列的 key 全部位移（整批重掛），而出現序不會動。
 * 第一次出現保持裸 id，所以最常見的「每個狀態各一層」逐字元不變。
 */
export function selfStatusRowKeys(rows: readonly SelfStatusRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const nth = (seen.get(r.id) ?? 0) + 1;
    seen.set(r.id, nth);
    return nth === 1 ? r.id : `${r.id}#${nth}`;
  });
}

export function SelfStatusBarView({ rows }: { rows: readonly SelfStatusRow[] }): React.JSX.Element | null {
  if (rows.length === 0) return null;
  const keys = selfStatusRowKeys(rows);
  return (
    <div
      data-self-status="root"
      style={{
        position: "fixed",
        left: "calc(env(safe-area-inset-left, 0px) + 12px)",
        // Sits above the ability cluster, and DERIVED from the build-stamp band
        // (#66 paints the version badge in the bottom HUD_STAMP_BAND px of every
        // screen) so it tracks the band instead of guessing a number that could
        // silently fall inside it later. versionBadgeBand.test.ts enforces this.
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${HUD_STAMP_BAND + 122}px)`,
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
      {rows.map((r, i) => {
        const c = statusColor(r);
        return (
          <div
            key={keys[i]}
            data-status-id={r.id}
            data-status-polarity={r.polarity}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: r.disabling ? "5px 12px" : "3px 10px",
              borderRadius: 5,
              border: `1px solid ${c}`,
              // a disabling effect gets a filled plate, not just an outline —
              // it is the one the player is asking about
              background: r.disabling ? "rgba(255,77,109,0.24)" : "rgba(12,14,20,0.82)",
              boxShadow: r.disabling ? `0 0 14px ${c}66` : "0 2px 8px rgba(0,0,0,0.55)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: r.polarity === "buff" ? "50%" : 1,
                background: c,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: r.disabling ? 15 : 13,
                fontWeight: r.disabling ? 800 : 600,
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
                fontSize: r.disabling ? 14 : 12,
                fontWeight: 700,
                color: c,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {r.secondsLeft}s
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SelfStatusBar(): React.JSX.Element | null {
  const phase = useHud((s) => s.phase);
  const localSeatId = useHud((s) => s.localSeatId);
  const seats = useHud((s) => s.seats);
  const seat = localSeatId === null ? undefined : seats.find((x) => x.seatId === localSeatId);
  // Combat only: a leftover 「暈眩 2s」 floating over the shop card would be a
  // lie, and the shop owns that screen.
  if (phase !== "combat" || !seat) return null;
  return <SelfStatusBarView rows={selfStatusRows(seat.statusIds, seat.statusRemainTicks)} />;
}
