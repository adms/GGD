/**
 * 邀請的陣營意向，畫面那一半（GH#655）—— owner 2026-08-24 逐字：
 *
 * > 「大廳邀請對象進房間應該要能選擇是**隊友**還是**敵對方**」
 *
 * ⭐ 這裡**只做顯示**：誰坐哪一隊的答案完全來自伺服器的 `RoomMember.team`，
 * 而那一格是**落座那支函式本身**（Go `room.PlanSeats`，開打時用的同一支）算出來的。
 * ⛔ 客戶端刻意不重算一次落座 —— 那會是同一條規則的第二個住處，而兩份規則一旦
 * 漂開，畫面上顯示的隊伍就會和開打後的隊伍不一樣，那比什麼都不顯示更糟。
 */
import type { RoomMember } from "./types";

/** 隊伍代號：0 → A、1 → B…。⛔ 不印 `0`，那是實作細節不是給人看的。 */
export function teamLabel(team: number): string {
  return `${String.fromCharCode(65 + Math.max(0, team))} 隊`;
}

/**
 * 這個人的**意向被滿足了嗎**。
 *
 * ⚠️ 這正是那張票要的「⛔ 不是靜默換邊」：意向是偏好，想要的那一隊滿了伺服器就
 * 讓位到下一隊 —— 而回 `false` 讓那顆徽章在**開打之前**就變色說出來。
 *
 * 沒有意向（從房間列表或集合令走進來的人）一律回 `true`：他沒有被辜負任何事。
 */
export function sideHonored(members: readonly RoomMember[], m: RoomMember): boolean {
  if (!m.side || m.team === undefined) return true;
  const host = members.find((x) => x.isHost);
  if (!host || host.team === undefined) return true;
  return m.side === "ally" ? m.team === host.team : m.team !== host.team;
}
