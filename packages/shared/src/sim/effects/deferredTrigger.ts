/**
 * ⭐【延遲脈絡】—— 一份 `TriggerDamage` 快照要跨過 **tick 邊界**時，唯一該走的那道門。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼需要「定基」，而不是原封不動搬過去
 *
 * `TriggerDamage` 的讀數不是同一種東西：
 *   · `raw` / `mitigated` / `hpLost` / `origin` / `type` / `crit` / …
 *     —— 都是**那一發封包自己**的性質。它們跨 tick 仍然為真。
 *   · `reflectDepth` —— **鏈**的性質。跨 tick 仍然為真，而且 ⛔ **絕對不可以重設**：
 *     `effects/damage.ts` 的終止性整個掛在「嚴格遞增 + 上界」上，重設成 0
 *     等於把 A↔B 互彈變成無界迴圈，而**沒有任何東西會報錯**（失敗形態②）。
 *   · `resolvePass` —— **那一個 tick 的排空迴圈**的性質。搬到未來的 tick 就是一個
 *     型別對、語意錯的數字：一發在第 3 輪落地的反彈所觸發的七刀，會被
 *     `damage.ts` 的閘門（`resolvePass + 1 >= DAMAGE_QUEUE_MAX_PASSES`）整串
 *     丟掉，而畫面上的症狀是「這招**有時候**完全沒傷害」。
 *
 * ⭐ 所以定基只動 `resolvePass` 這一格，而且值是**算得出來的**，不是挑的：
 * 延遲付款的系統（`delayedSystem`，`SimWorld.step()` 的 7e′）跑在
 * `combatResolveSystem` **之前**，所以它排出來的封包一定落在**第 0 輪**。
 * 閘門問的是「我即將排的這一發落在第幾輪」＝ `resolvePass + 1`，
 * 要它等於 0，`resolvePass` 就是 **-1**。
 *
 * ⚠️ 冪等：對已經定基過的快照再跑一次是同一個值，所以巢狀 `delayed` 安全。
 * ⚠️ 這個函式**不碰任何身體**：`TriggerDamage` 只有數字與字串，沒有 `EntityId`。
 *    所以觸發者／攻擊者在延遲期間死掉、離場、被移除，這份快照都還是合法的。
 *    「死了要不要繼續」是**另外兩格既有欄位**的事（`delayed.stopOnCasterDeath` /
 *    `dropDeadTargets`），⛔ 不在這裡再開第三個判斷。
 *
 * ⛔ 這個檔不可以 import 任何有執行期的東西 —— 只有一個 `import type`，
 *    所以 `effects/damage → hooks → effectRunner → effectRegistry → damage`
 *    那個環碰不到它。
 */
import type { TriggerDamage } from "./effect";

/**
 * 「這一次執行發生在排空迴圈**之外**」—— `resolvePass + 1 === 0` ＝ 我排出來的
 * 封包落在第 0 輪。⛔ 不是「未知」也不是「0」：0 會宣稱反彈落在第 1 輪，
 * 那是一個 off-by-one 的謊，今天無害（上界 4），改天調 `DAMAGE_QUEUE_MAX_PASSES`
 * 就會變成「最後一輪的反彈連鎖莫名少一段」。
 */
export const DEFERRED_RESOLVE_PASS = -1;

/**
 * 把一份觸發封包快照定基到「未來某個 tick、在排空迴圈之前執行」的座標系。
 *
 * 唯一的呼叫點在 `effects/delayed.ts`（**排程那一刻**做，⛔ 不是到期才做 ——
 * 到期做等於每一發各算一次同一件事，而且會讓「這份快照已經離開它的 tick 了」
 * 這個事實在佇列裡看不出來）。
 *
 * ⚠️ `randomArea` / `spawnProjectile.onHit` / `leap.onLand` 今天**同樣**把
 * `ctx.incoming` 丟掉（GH issue 已開）。它們之後要接同一條線時 import 這一支，
 * ⛔ 不要各自重推一次 —— 重推最容易錯的正是「順手把 reflectDepth 也歸零」。
 */
export function rebaseTriggerForDeferred(trig: TriggerDamage): TriggerDamage {
  return { ...trig, resolvePass: DEFERRED_RESOLVE_PASS };
}
