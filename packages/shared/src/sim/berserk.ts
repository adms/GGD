/**
 * 暴走 —— 「不可控制並自動尋敵」(59-00 初號機 暴走).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * owner 2026-07-31,逐字:
 *
 *   「生命降低於 5% 時變為**不可控制並自動尋敵**的 buff [暴走],但額外獲得
 *     吸血 10%、攻擊速度 ×4 以及解開攻擊速度上限至 10,持續 10 秒」
 *
 * 這一支只負責那八個字。其餘三項(吸血/攻速/解鎖上限)是純 `StatModifier`,
 * 走的是既有的 `applyBuff` + `ModOp.PercentMult` + `ModOp.CapRaise`,一行程式
 * 都不需要 —— 見 `content/abilities/godie-e00r.passive.json`。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 決策 1 —— 它是「拿走方向盤」,不是「拿走身體」。這是整支的分水嶺。
 *
 * 最省事的寫法是 `applyStatus { root: true }`,而那是**錯的**,錯得很具體:
 * 一台生命剩 5% 的初號機被釘在原地,結果是站著被打死。owner 要的相反 ——
 * 原文說暴走「等於讓敵方多一個單位」,也就是它**要能動、要能追、要能打**,
 * 只是聽的人不再是玩家。
 *
 * 所以介入點是 `orderSystem` 對 `IntentFrame` 的採納,不是 `movementHold`。
 * 兩個動作,缺一不可:
 *
 *   ① {@link berserkDropsOrders} —— 這個座位這一 tick 送來的 order 直接丟掉。
 *      **`aim` 不丟**:面向是表演,而且客戶端預測還在跑,強行歸零會讓畫面上的
 *      模型每 tick 抽搐。玩家推搖桿只剩下「看向那邊」,走不走由不得他。
 *   ② {@link berserkSeek} —— 把身體交還給 `autoAcquirePass`(#221 的索敵真空
 *      填補器)。它已經是「威脅 → 低血 → 最近」那份唯一的索敵規則,追擊迴圈
 *      也已經會把身體帶進自己的攻擊距離。暴走**沒有**第二套索敵,這一點是刻意
 *      的:多一套就多一份會漂走的排序(CLAUDE.md 第三守則)。
 *
 * ⚠️ 2026-07-30 剛修好「硬控搶方向盤」那個 bug(`ccPausesStall`),這一支
 * **不是**把它改回去。那個 bug 是「玩家被控 → 系統誤判成卡住 → 替他決定去哪」,
 * 是系統多事;暴走是內容明說要奪權,而且有 10 秒的到期、有 5% 的門檻、有一發
 * 冷卻,三個都是編輯器上的數字。差別在於**誰授權的**。
 *
 * ⭐ 決策 2 —— 它住在 `StatusEffect` 上,不是一條屬性、也不是第三個 CC 旗標。
 *   · 屬性是常駐的、面板上的;暴走是十秒的、會到期的。
 *   · CC 旗標(`root`/`stun`)會被 `refusesControl` 擋掉 —— 而暴走是**自己給
 *     自己的**,一個魔免 buff 不該讓初號機暴走不了。`applyStatus` 的 `isCc`
 *     判定刻意不含 `berserk`,所以它既不記 ccAppliedTicks,也不被免控攔。
 *   · 掛在 status 上等於免費拿到 `statusExpirySystem` 的清除,所以「永久失去
 *     方向盤」在結構上不可能發生。這正是 `missChance` 選同一個位置的理由。
 *
 * ⭐ 決策 3 —— 重複觸發的防線是 `HookDef.internalCooldown`,**不是**這支檔案。
 *   血量在 5% 上下抖動時,若沒有閘,每一 tick 都會重新暴走一次(而且每次都把
 *   到期往後推 10 秒 = 永久暴走)。閘寫在**文件**裡:59-00 的 hook 帶
 *   `internalCooldown: 45`,而 `effects/hooks.ts` 對「條件不成立」是不燒冷卻的,
 *   所以那 45 秒是從**真的暴走過一次**開始算。做成欄位而不是常數,是因為
 *   「一場能暴走幾次」是平衡問題,owner 一定會想調。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 純讀 `world.status` + `world.tick` 的比較。沒有 rng、沒有時鐘、沒有三角函式、
 * 沒有 `**`,也沒有 Map/Set 迭代(只有一個實體的 `effects` 陣列線性掃描)。
 * 到期一律是絕對 tick 比較,和 `refusesDamage` 同一個形狀。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";

/**
 * 這個單位現在是不是暴走狀態。
 *
 * 掃的是**還沒到期**的 status(`expiresAtTick > world.tick`)—— 和
 * `statusExpirySystem` 的過濾條件逐字相同,所以「這一 tick 到底算不算暴走」
 * 不會因為 orderSystem(slot 4)跑在 statusExpirySystem(slot 2)之後而有兩個
 * 答案。
 */
export function isBerserk(world: SimWorld, id: EntityId): boolean {
  const st = world.status.get(id);
  if (st === undefined) return false;
  for (const e of st.effects) {
    if (e.berserk === true && e.expiresAtTick > world.tick) return true;
  }
  return false;
}

/**
 * 這個座位的 `order` 這一 tick 該不該被丟掉。
 *
 * 分成兩支函式(而不是讓 `orderSystem` 直接呼叫 {@link isBerserk})純粹是為了
 * 讓呼叫點讀起來是一句話:「暴走就不收指令」。
 */
export function berserkDropsOrders(world: SimWorld, id: EntityId): boolean {
  return isBerserk(world, id);
}

/**
 * 把暴走中的單位交還給自動索敵。
 *
 * 做的事只有兩件,而且都是**清除**而不是指派 —— 真正選目標的是
 * `autoAcquirePass`,追擊的是它下面那個迴圈:
 *
 *   · `nav.order = null`
 *     否則玩家暴走前最後那一條 `move` 會永遠留在手上,而追擊迴圈看到
 *     「有 move 指令而且還在走」就會讓路(#274 的走位權),於是暴走的初號機
 *     會忠實地走向十秒前玩家點的那個地方,一路上誰都不追。
 *   · 玩家**手選**的目標(`attackTargetAuto === false`)也要放掉。
 *     `autoAcquirePass` 明文只填真空:手選的目標它一律不碰。不清掉的話,暴走
 *     會變成「繼續打玩家剛剛點的那一個」—— 那是聽話,不是失控。
 *     自動選的目標**留著**:那本來就是系統自己挑的,重挑只會讓它每 tick 換
 *     一次目標(索敵有 leash / swap 遲滯,重置等於把遲滯關掉)。
 *
 * ⚠️ 不寫 `moveTarget`。追擊迴圈這一 tick 稍後就會依 `reachTo` 算出該停在哪,
 * 這裡先寫一個位置只會被覆蓋,而且會讓「停在攻擊距離內」的遲滯短路。
 */
export function berserkSeek(world: SimWorld, id: EntityId): void {
  const nav = world.nav.get(id);
  if (nav === undefined) return;
  nav.order = null;
  if (nav.attackTarget !== null && !nav.attackTargetAuto) {
    nav.attackTarget = null;
  }
}
