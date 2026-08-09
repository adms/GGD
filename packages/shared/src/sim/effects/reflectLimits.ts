/**
 * [反彈] 的邊界常數 —— 一份、只有一份,sim 與 Zod mirror 共用。
 *
 * 跟 `spreadLimits.ts` / `knockbackLimits.ts` 同一個模式:數字住在 sim 這一側,
 * `content/schema/effect.ts` 匯入它當上界。理由是這裡的兩個上界**不是平衡值**,
 * 它們是**終止性證明的一部分**,而終止性是 sim 的性質 —— 把它們寫在 schema 裡,
 * 證明就跟被證明的那段程式分家了。
 *
 * ⚠️ 這個檔不可以 import 任何東西。`sim/combat/damage.ts`(排空迴圈)、
 * `sim/effects/damage.ts`(反彈本體)與 `content/schema/effect.ts`(欄位上界)
 * 三邊都讀它,任何一條 import 都會變成三角形。
 */

/**
 * 傷害佇列一個 tick 之內最多排空幾輪 —— `combatResolveSystem` 的 `pass < N`。
 *
 * 本來是寫死在 `sim/combat/damage.ts` 裡的字面量 `4`。搬出來的原因不是整潔,
 * 是**下面那個上界是用它算出來的**:兩個數字分開放,改了一個沒改另一個,
 * 反彈鏈就會安靜地開始溢到下一個 tick,而沒有任何測試會紅。
 */
export const DAMAGE_QUEUE_MAX_PASSES = 4;

/** `damage.incomingPct.perRank` 的下界。0 = 反彈 0%,合法(等於關掉)。 */
export const INCOMING_PCT_MIN = 0;

/**
 * `damage.incomingPct.perRank` 一欄的上界 = 1000%。
 *
 * ⭐ 2026-08-09（GH#299 第 1 條）從 5 抬到 10：20-002「每次造成 7 倍[反彈]傷害」
 * 是 owner 的文案，而 7 被一條**自稱是打錯數字的守衛**擋下來 —— 護欄裝錯位置。
 * 10 仍然遠低於那個真的會發生的手誤（下面那一段），所以擋掉的東西一個都沒少。
 *
 * ⚠️ 這是**打錯數字的守衛**,不是平衡政策(跟 `HP_PCT_DAMAGE_MAX` 同性質)。
 * 出貨最強的一筆是反射之盾的 2.0(owner 的文案「反彈普通攻擊傷害 200%」),
 * 而 10 擋住那個真的會發生的手誤:
 * 「200」打在該寫「2.00」的格子裡。那不是一件很強的裝備,那是 20,000% 反彈 ——
 * 任何人普攻你一下就當場死亡,而且在 JSON diff 裡跟正確值長得一模一樣
 * (#277 的形態:2026-07-29 之前 `validateField` 只檢查 `min`)。
 */
export const INCOMING_PCT_MAX = 10;

/** `damage.incomingPct.maxChainDepth` 的下界。0 = 反彈不會再被反彈(預設)。 */
export const REFLECT_MIN_CHAIN_DEPTH = 0;

/**
 * `damage.incomingPct.maxChainDepth` 的上界 —— **必要條件,不是充分條件**。
 *
 * ⚠️ 2026-08-01 更正。這個常數以前的說明宣稱它是「終止性證明」,而那個證明有一個
 * 沒有人在守的前提:**觸發反彈的那一發封包在第 0 輪落地**。
 *
 * 推導本身沒錯 —— 一條從第 0 輪起跳的鏈,深度 d 的封包在第 d 輪落地,
 * `maxChainDepth = M` 能生出來的最深封包是 M+1,要塞進 `DAMAGE_QUEUE_MAX_PASSES`
 * 輪就得 `M + 1 <= DAMAGE_QUEUE_MAX_PASSES - 1`,即 `M <= 2`。錯的是那個前提:
 * **hook 排出來的封包不在第 0 輪落地**。一個 `on: onDamageDealt` 的 [On-Hit] 效果
 * 在第 0 輪被觸發、封包在第 1 輪才解算,從它起跳的反彈鏈整條往後平移一輪 ——
 * 49 件傳說裡有 16 件是 [On-Hit],所以這是**常態**,不是邊角。
 *
 * 實測(`incomingReflect.test.ts` 的「排空預算」那一段):`maxChainDepth = 2` +
 * 一個 on-hit proc,深度 3 的那一發留在 `world.damageQueue` 裡等下一個 tick。
 *
 * 所以現在分工是:
 *   · 這個常數 = 一條鏈**最好的情況**(第 0 輪起跳)能有多深。超過它,連最好的
 *     情況都塞不下,那種文件應該進不來 —— 這一半仍然成立,`zEffectDef` 照夾。
 *   · 「反彈一定在同一個 tick 之內落地」由**執行期**的閘門保證,不是由算術:
 *     `effects/damage.ts` 讀 `TriggerDamage.resolvePass`,一發塞不進剩餘輪數的
 *     反彈按 `incomingPct.whenTooLate` 處置(預設 `"drop"`,不排進佇列)。
 *     一個晚一 tick 才出現的反彈是 bug report,不是設計。
 */
export const REFLECT_MAX_CHAIN_DEPTH = DAMAGE_QUEUE_MAX_PASSES - 2;
