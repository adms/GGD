/**
 * `onReflect` DISPATCH —— 「反彈成功時」（owner 2026-08-05：「onReflect／反彈成功時
 * 這個也要」）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼是一個系統，而不是在 `effects/damage.ts` 裡直接 `fireHooks`
 *
 * 那個 import 會關上一個環：
 *
 *     effects/damage → effects/hooks → effectRunner → effectRegistry → effects/damage
 *
 * `effectRegistry.ts` 的檔頭自己指名這個危害，並且說它**不是**編譯錯誤（沒有），
 * 而是某個打包順序下一個執行期 `undefined` 的 handler —— 也就是整張效果表在某一份
 * build 裡靜默消失。所以 `effects/damage.ts` 只做一件不需要 import 任何東西的事
 *（往 `world.pendingReflectHooks` push 一筆），由這裡把它變成 hook。
 *
 * ⚠️ 這一段推導是逐字照抄 `CcHookSystem.ts` 的，因為它是**同一個**危害。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 「反彈成功」的定義，以及為什麼要窄
 *
 * 只有**一發反彈封包真的被排進 `damageQueue`** 才算。`incomingPct` 有三道閘會讓
 * 反彈整條不發生：
 *
 *   ① 沒有觸發封包（`ctx.incoming === undefined`）—— 這一發不是被打出來的
 *   ② `reflectDepth > maxChainDepth` —— 反彈鏈到底了
 *   ③ 排空預算來不及，而 `whenTooLate` 是 `"drop"`（出貨預設）
 *
 * 三種都**不算成功**。一個在「其實沒反彈到」時照樣觸發的 `onReflect`，會讓
 * 「反彈時回血」實際上變成「被打時回血」—— 那是另一支技能，而畫面上看不出差別。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它在 tick 裡的位置
 *
 * 緊接在 `ccHookSystem`（8a）之後、`deathSystem` 之前 —— 與 `onStunned` 同一格的
 * 理由：反彈封包是在 `combatResolveSystem`（步驟 8）的排空迴圈裡生出來的，所以
 * 那是一個 tick 裡最早「每一發反彈都已經發生過」的點。放在 `deathSystem` 之後會
 * 讓一個在同一 tick 被打死的人「死後才反彈」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 決定性
 *
 * 依 **push 順序** 排空一個陣列（每一個複本都一樣 —— **不是** `world.events`，
 * 那個在 `step()` 第一行就被清掉）。無 Map 迭代、無時鐘、無自己的 rng。
 * `fireHooks` 可能會抽 `world.rng`（作者寫了 `chance`/`condition` 時），
 * 而那發生在每一個複本的同一個固定點。沒有人反彈的世界只做一次陣列掃描。
 */
import type { SimWorld } from "../SimWorld";
import { fireHooks } from "../effects/hooks";

export function reflectHookSystem(world: SimWorld): void {
  const queue = world.pendingReflectHooks;
  if (queue.length === 0) return;
  // 先把整批 splice 出來：`fireHooks` 跑出來的效果可能再排出反彈封包，
  // 那些必須進**下一個** tick 的批次，而不是被附加到正在走的這個陣列上
  //（一個無界迴圈 + 一個沒有作者推理得出來的同 tick 重入）。
  const batch = queue.splice(0, queue.length);
  for (const ev of batch) {
    // `fireHooks` 本來就會拒絕死掉的持有者；這裡的顯式守衛是為了上面那個
    // **排序**主張 —— 這個系統跑在 `deathSystem` 之前，所以一個被同一發封包
    // 打死的人仍然是 `alive`，否則他會在死掉的那一 tick 觸發反彈 hook。
    const hp = world.health.get(ev.reflector);
    if (hp && !hp.alive) continue;
    fireHooks(world, ev.reflector, "onReflect", ev.victim);
  }
}
