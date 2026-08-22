/**
 * clientGlobals —— **一場比賽的邊界上，模組層全域要被清乾淨的那一張表**（GH#585 · GH#586）。
 *
 * > owner 2026-08-23：「**每次進到房間應該是乾淨的開始**才對」
 * > 「所以離開 到 進練習模式 也是有問題 沒清理乾淨 因為這都是**獨立該檢查清乾淨的地方**
 * >  不管是**出口**還是**入口**還是**每回合進商店前**」
 * > 「你**寧願多次清理乾淨開始回合 也不要漏清到**」
 *
 * ── 為什麼需要這個檔（⛔ 不是「整理」）──────────────────────────────────────
 * 客戶端有一族**模組層可變狀態**，它們刻意不是 React state（per-frame / per-move
 * 資料不走 React，client-08）。代價是：**React 卸載不會清掉它們**。
 * HUD 在 `screen !== "match"` 時整棵 unmount，於是
 *
 *   • `ui/castFeedback` 的 `current` notice 沒有人清 —— 它的 TTL 計時器住在
 *     `CastNotice.tsx` 的 `useEffect` 裡，而 cleanup 是 `clearTimeout` ⇒
 *     ⭐ **卸載＝取消那顆計時器，⛔ 不是清掉那句話**。下一次重掛時
 *     `useState(() => getCastNotice())` 又把它讀回來 ⇒ 新房間第一秒印出
 *     **上一間房**那句「魔力不足」，再吃滿一次完整 TTL（GH#585）。
 *   • `ui/abilityHold` 的 `held` 沒有人清 ⇒ 新房間地板上憑空亮著上一場那支技能的
 *     施法距離圈（`GameApp` 每幀讀 `getHeldAimSlot()`）。而 `clearHeldAbility(slot)`
 *     **只清得掉同一格** ⇒ 玩家不去 hover 那一格它就不會自己消失（GH#586）。
 *   • `ui/abilityRangeGuide` 的 hover 計時器沒有人取消 —— React 卸載時 ⛔ 不發
 *     `pointerleave` ⇒ 起手 hover 之後直接離場，**140ms 後那顆計時器照樣把
 *     `held` 設起來**，而沒有任何人按過任何按鈕（GH#586 的第二條）。
 *
 * ── ⚠️ 這個檔要接在**入口**與**出口**兩邊 ────────────────────────────────────
 * owner 的不變式是**入口**的（「每次進到房間應該是乾淨的開始」），而入口的清理
 * ⭐ **不依賴出口有沒有跑到** —— 一次 teardown 例外（GH#597）就會讓出口整段不跑。
 * 出口那一次是省下「大廳畫面上還留著上一場的東西」，兩邊都要，
 * 逐字照 owner：「寧願多次清理乾淨開始回合 也不要漏清到」。
 *
 * ⛔⛔ **接線住在 `apps/client/src/main.tsx`，而它不在這條 lane 的柵欄內。**
 * 現況（2026-08-23）：`startMatch()`（`main.tsx:80`）與 `stopMatch()`（`:107`）
 * **各有一次 `resetHudStore()`**，這支就掛在它們旁邊各一行：
 *
 *     import { resetClientGlobals } from "./clientGlobals";
 *     …
 *     resetHudStore();
 *     resetClientGlobals();   // ← 兩處都要
 *
 * ⚠️ 少了那兩行，這個檔就是**失敗形態③**（可以整個刪掉而測試全綠）。
 *
 * ── ⛔ 為什麼不掛進 `net/RoomStore.resetHudStore()` ──────────────────────────
 * 那是唯一一個「已經被兩個邊界呼叫」的現成鉤子，但 `net/*` **不可以 import
 * `ui/*`**（`RoomConnection.ts` 的檔頭寫著這條規則，`evadeSightings.test.ts` 在守），
 * 而且實測會造出一個真的環：
 * `RoomStore → clientGlobals → ui/abilityHold → ui/components/abilityText →
 *  ui/components/Tooltip → ui/displayFinal → net/RoomStore`。
 */
import { resetCastFeedback } from "./ui/castFeedback";
import { setHeldAbility } from "./ui/abilityHold";
import { cancelHoverGuide } from "./ui/abilityRangeGuide";

/**
 * 把每一格「跨得過一次 React 卸載」的客戶端模組全域打回出生狀態。
 *
 * ⚠️ 這裡**只收 UI 層的模組全域**。網路那一側（`RoomConnection` 的
 * `queuedEvents` / `evadeSightings`、`RoomStore` 的 `hudStore` 與 `ownerMatchId`）
 * 各自在 `leave()` / `resetHudStore()` 裡清，⛔ 不要在這裡再清一次 ——
 * 第二個住處就是下一次會過期的那一個。
 *
 * ⛔ **不在這張表裡的（帶理由，⛔ 不是「還沒收」）**：
 * | 模組 | 為什麼不收 |
 * |---|---|
 * | `audio/roundEndVoice`（`resetRoundEndVoice`）· `audio/roundVictoryMemory`（`resetRoundVictoryMemory`）· `audio/beatPerformance` | 同一族缺陷（寫好了、零出貨呼叫端），⛔ 但 `audio/**` 不在 GH#585 這條 lane 的柵欄內。⇒ 已在報告裡點名，要另開一張票 |
 * | `net/*` 的每一格 | 見上一段：它們的清理點是 `leave()` / `resetHudStore()`，⛔ 不是這裡 |
 */
export function resetClientGlobals(): void {
  // GH#585 —— 上一間房那句提示（含它的 seq 與 flash map）。
  resetCastFeedback();
  // GH#586 —— 兩行缺一不可：
  //   `cancelHoverGuide()` 殺掉**還沒開火**的那顆 hover 計時器（⛔ 少了它，
  //   它會在離場之後才把 `held` 設起來 —— 清乾淨之後又被弄髒）；
  //   `setHeldAbility(null)` 清掉**已經按住**的那一格。
  // ⚠️ 順序是刻意的：先取消計時器再清值。反過來會留下一個 140ms 的窗。
  cancelHoverGuide();
  setHeldAbility(null);
}
