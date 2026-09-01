/**
 * scriptedMove — GH#838 **M1 逐刀瞬移** ＋ **M3 升空曲線**（超究武神霸斬的招牌）。
 *
 * owner 指名的驗收三招之一。原作 01-04 每一刀之前把小呆 `SetUnitPositionLoc` 到
 * 目標的**另一個角度**（M1），而第三段把兩個人一起 `SetUnitFlyHeight` 拉上天（M3）。
 *
 * ── ⭐ 一道機制，⛔ 不是兩道 ────────────────────────────────────────────────
 * 「瞬移」與「升空」在資料上是**同一件事**：把一具身體的**視覺位置**推到一個偏移。
 * 差別只有**怎麼過去**：`teleport` = 立刻、`arc` = 沿一條拋物線。
 * ⇒ ⭐ 一個 `mode` 參數，⛔ 不是兩個 segment kind（第〇·五守則）。
 *
 * ── ⚠️ 誠實邊界：它**只動畫面**，⛔ 不動 sim ─────────────────────────────
 * 判定框、索敵、碰撞**一格都不變** —— 與 `scriptedHide` 逐字同一個理由：
 * 把演出借給權威狀態，等於偷加一個位移／無敵窗。
 * ⇒ ⭐ 一刀砍完視覺回到原位，而伺服器從頭到尾知道他在哪。
 *
 * ── ⚠️ 為什麼是「每 sync 重問」而不是「當場 setPosition」──────────────────
 * 位置是 `EntityViewRegistry` **每一次 sync 都重寫**的（插值、死亡、剔除都掛在那
 * 一條路上）。當場寫下去會在**下一幀被覆蓋**。
 * ⇒ 這支只記「誰、偏移多少、到什麼時候」，由 registry 在同一個合成點加進去。
 *
 * ⭐ **自己會過期**是承重的：時間到就自動回原位，⛔ 不需要任何「解除」訊息。
 * 一個要靠第二則事件才會歸位的偏移，掉一則封包就是一具永遠站錯地方的身體。
 */

/** 演出位移的硬上限（毫秒）。⚠️ 護欄，⛔ 不是設定 —— 原作最長的一段約 1.2 秒。 */
export const MAX_MOVE_MS = 3000;
/** 偏移的硬上限（世界單位）。⚠️ 同上 —— 一份寫錯的腳本不可以把身體丟出場外。 */
export const MAX_MOVE_OFFSET = 12;

interface MoveEntry {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly startMs: number;
  readonly endMs: number;
  /** `true` = 沿拋物線過去（M3 升空）；`false` = 立刻到位（M1 瞬移）。 */
  readonly arc: boolean;
}

/** entityId → 這一段演出的偏移。 */
const moves = new Map<number, MoveEntry>();

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 登記一段演出位移。
 *
 * ⭐ 同一個人再喊一次 = **取代**（⛔ 不是疊加）—— 連段的第 2 刀要接續第 1 刀的
 * 落點，⛔ 而不是把兩個偏移加起來丟到場外。
 */
export function moveBodyFor(
  id: number,
  offset: { x: number; y: number; z: number },
  durationMs: number,
  arc: boolean,
  nowMs: number,
): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y) || !Number.isFinite(offset.z)) return;
  moves.set(id, {
    x: clamp(offset.x, -MAX_MOVE_OFFSET, MAX_MOVE_OFFSET),
    y: clamp(offset.y, -MAX_MOVE_OFFSET, MAX_MOVE_OFFSET),
    z: clamp(offset.z, -MAX_MOVE_OFFSET, MAX_MOVE_OFFSET),
    startMs: nowMs,
    endMs: nowMs + Math.min(durationMs, MAX_MOVE_MS),
    arc,
  });
}

/**
 * 這一幀該把這具身體推到哪裡（相對於它的權威位置）。沒有登記就回 `null`。
 *
 * ⭐ `teleport`：整段期間都在偏移點，時間到**瞬間**回來（原作就是這個節奏 ——
 * 一刀砍完就閃到下一個角度，⛔ 中間沒有滑行）。
 * ⭐ `arc`：`0 → 偏移 → 0` 的一條拋物線，⭐ 高度用 `sin(πt)` ⇒ 起訖都在地面。
 */
export function scriptedOffset(
  id: number,
  nowMs: number,
): { x: number; y: number; z: number } | null {
  const m = moves.get(id);
  if (m === undefined) return null;
  if (m.endMs <= nowMs) {
    moves.delete(id);
    return null;
  }
  if (!m.arc) return { x: m.x, y: m.y, z: m.z };
  const span = m.endMs - m.startMs;
  const t = span > 0 ? clamp((nowMs - m.startMs) / span, 0, 1) : 1;
  // ⭐ 水平線性、垂直半個正弦 —— ⛔ 不是三軸都用同一條曲線：
  //   原作的升空是「飛上去再落下」，而水平位移是**單程**的。
  return { x: m.x * t, y: m.y * Math.sin(Math.PI * t), z: m.z * t };
}

/** 測試／場次切換用 —— ⛔ 這張表不可以跨場次長大。 */
export function resetScriptedMoves(): void {
  moves.clear();
}
