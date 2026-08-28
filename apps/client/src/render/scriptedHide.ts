/**
 * scriptedHide — GH#838 N6：**演出用的暫時隱形**（阿邦快速劍X 的招牌）。
 *
 * JASS `Trig_ABanX`（war3map.j:28905）逐字：`ShowUnitHide( GetTriggerUnit() )`
 * —— 小呆本人消失 1 秒，畫面上只有那道劍氣，1 秒後 `ShowUnitShow` 回來。
 *
 * ── ⚠️ 為什麼**不是**給 `ENTITY_FLAG.INVISIBLE` ──────────────────────────
 * 那一格是**權威隱身**：伺服器的索敵會拒絕鎖定它（#244/#249）。把演出借它來做
 * 會把一個純視覺的節拍變成一次**真的無敵窗**。⇒ 這裡走的是**客戶端自己的**
 * 一格 alpha 覆寫，⛔ 不動 sim。
 *
 * ── ⚠️ 為什麼是「每 sync 重問」而不是「當場 setEnabled(false)」 ──────────
 * 可見度是 `EntityViewRegistry` **每一次 sync 都重寫**的（死亡溶解、抽卡距離
 * 剔除、隱身 alpha 都掛在那一條路上，`setStealthAlpha` 的註解逐字寫著
 * 「Written every sync, never latched」）。當場關掉節點會在**下一幀被覆蓋**，
 * 而更糟的是它可能與死亡分支打架 ⇒ 一具永遠不回來的身體。
 * ⇒ 這支只記「誰、到什麼時候」，由 registry 在同一個合成點乘進去。
 *
 * ⭐ **自己會過期**是承重的：時間到就自動回來，⛔ 不需要任何人送「解除」訊息。
 * 一個要靠第二則事件才會解除的隱形，掉一則封包就是永久消失。
 */

/** entityId → 隱到什麼時候（毫秒時鐘，與 registry 的 sync 同一支）。 */
const until = new Map<number, number>();

/** 這一段演出要藏誰、藏多久（毫秒）。同一個人再喊一次＝取較晚的那個。 */
export function hideBodyFor(id: number, ms: number, nowMs: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const end = nowMs + Math.min(ms, MAX_HIDE_MS);
  const prev = until.get(id);
  if (prev === undefined || end > prev) until.set(id, end);
}

/**
 * 演出隱形的硬上限。⚠️ 這是**護欄**不是設定：一份寫錯的腳本不可以讓一個身體
 * 消失一整場。原作最長的那一發是 1 秒。
 */
export const MAX_HIDE_MS = 4000;

/** 現在該不該藏（順手清掉過期的 —— ⛔ 這張表不可以隨場次長大）。 */
export function isBodyHidden(id: number, nowMs: number): boolean {
  const end = until.get(id);
  if (end === undefined) return false;
  if (end <= nowMs) {
    until.delete(id);
    return false;
  }
  return true;
}

/** 回合邊界／離場時清空（`roundPurge` 那一族的規矩：跨回合不留東西）。 */
export function clearScriptedHides(): void {
  until.clear();
}

/** 活著的紀錄數（守衛量這個 —— 表不長大的證據）。 */
export function scriptedHideCount(): number {
  return until.size;
}
