/**
 * ⭐⭐ **按住 Tab 的全員面板**（GH#894）。
 *
 * owner 2026-09-01（逐字）：
 * > 「tab鍵 按住應該要能看到**所有人的等級、生命、AD、AP、寶具與固有技能**」
 *
 * ⭐ 六欄，⛔ 一欄都不少：等級 · 生命 · AD · AP · 寶具 · 固有技能。
 *
 * ⚠️ ⭐ **為什麼是「按住」而不是「切換」**：owner 說的是「按住」，
 * ⛔ 而切換式面板會在團戰中被忘記關掉 —— 那正是這塊面板要避免的東西
 * （它蓋住的是戰場）。⇒ `keydown` 開、`keyup` 關，⛔ 沒有第三種狀態。
 *
 * ⚠️ ⭐ **Tab 的預設行為要擋掉**（`preventDefault`）：
 * ⛔ 否則瀏覽器會把焦點移到下一個可聚焦元素，而玩家放開 Tab 之後
 * 鍵盤輸入會跑到一個他看不見的按鈕上。
 */
import React from "react";
import { useHud } from "../../net/RoomStore";

const TEXT = "#c8d0e0";
const DIM = "#7b8496";

function useHeldTab(): boolean {
  const [held, setHeld] = React.useState(false);
  React.useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code !== "Tab" || e.repeat) return;
      // ⛔ 不擋的話焦點會跳到下一個可聚焦元素（見檔頭）。
      e.preventDefault();
      setHeld(true);
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code !== "Tab") return;
      e.preventDefault();
      setHeld(false);
    };
    // ⭐ 視窗失焦也要關 —— ⛔ 否則 alt-tab 出去再回來，面板會卡在畫面上
    //   （`keyup` 在別的視窗發生，這個頁面收不到）。
    const blur = (): void => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return held;
}

const TH: React.CSSProperties = {
  fontSize: 10,
  color: DIM,
  fontWeight: 600,
  textAlign: "left",
  padding: "2px 6px",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  fontSize: 11.5,
  color: TEXT,
  padding: "3px 6px",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

export function AllPlayersPanel(): React.JSX.Element | null {
  const held = useHeldTab();
  const seats = useHud((s) => s.seats);
  if (!held || seats.length === 0) return null;

  const rows = [...seats].sort((a, b) => a.teamId - b.teamId || a.seatId - b.seatId);

  return (
    <div
      style={{
        position: "absolute",
        top: "12%",
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(8,12,20,0.92)",
        border: "1px solid #2c3448",
        borderRadius: 10,
        padding: 10,
        pointerEvents: "none",
        zIndex: 60,
        maxWidth: "92vw",
        overflowX: "auto",
      }}
    >
      <div style={{ fontSize: 10, color: DIM, marginBottom: 6 }}>全員狀態（按住 Tab）</div>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["", "等級", "生命", "AD", "AP", "寶具", "固有技能"].map((h) => (
              <th key={h} style={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.seatId} style={{ borderTop: "1px solid #1b2230" }}>
              <td style={{ ...TD, color: s.teamId === 0 ? "#6fb3ff" : "#ff8a7a" }}>
                {s.displayName || s.championId || `座位 ${s.seatId}`}
              </td>
              <td style={TD}>{s.level}</td>
              <td style={TD}>
                {Math.round(s.hp ?? 0)} / {Math.round(s.maxHp ?? 0)}
              </td>
              <td style={TD}>{s.adNow ?? 0}</td>
              <td style={TD}>{s.apNow ?? 0}</td>
              {/* ⭐ 寶具與固有只印**數量與名字** —— ⛔ 不印圖示：
                  這塊面板蓋在戰場上，而一排圖示會把它撐成半個畫面。 */}
              <td style={TD}>{(s.items ?? []).filter((i) => i !== "").length}</td>
              <td style={TD}>{(s.augments ?? []).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
