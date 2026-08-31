/**
 * `onReflectSuccess` DISPATCH —— 「反彈成功時」（owner 2026-08-05：「onReflect／
 * 反彈成功時 這個也要」；2026-08-08 更名並補上 provenance）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼是一個系統，而不是在封包解算處直接 `fireHooks`
 *
 * 兩個理由，而且**只有第二個在 2026-08-08 之後還成立**：
 *
 * ① （歷史）事件本來是在 `effects/damage.ts` 排出反彈封包的那一行發的，而那個檔
 *    直接 import `fireHooks` 會關上一個環：
 *
 *        effects/damage → effects/hooks → effectRunner → effectRegistry → effects/damage
 *
 *    `effectRegistry.ts` 的檔頭自己指名這個危害，而且說它**不是**編譯錯誤 ——
 *    是某個打包順序下一個執行期 `undefined` 的 handler，也就是整張效果表在某一份
 *    build 裡靜默消失。發射點搬走之後這一條不再適用（`combat/damage.ts` 本來就
 *    import 得起 `fireHooks`），但留著，因為它解釋了這個檔為什麼長這樣。
 *
 * ② **排序與終止性**，這一條今天仍然是它存在的理由：
 *    · 跑在 `deathSystem` **之前** → 一個被同一發封包打死的人不會「死後才反彈」；
 *    · 跑在 `combatResolveSystem` 的排空迴圈**之外** → hook 排出來的傷害進的是
 *      **下一個 tick** 的佇列，不是正在走的那一批 pass。A 反彈 B、B 的 hook 又
 *      打 A、A 再反彈…… 這條鏈因此每 tick 只推進一步，而不是在一個 tick 裡遞迴。
 *
 * ⚠️ ①那一段推導是逐字照抄 `CcHookSystem.ts` 的，因為它是**同一個**危害。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 「反彈成功」的定義，以及為什麼要窄
 *
 * 只有**一發 `reflectDepth > 0` 的封包真的落地**才算。兩層閘，兩層都是既有的
 * 程式碼，這個檔裡**沒有**第二套判斷：
 *
 *   Ⅰ 封包生得出來 —— `effects/damage.ts` 的 `incomingPct` 四道：
 *     ① 沒有觸發封包（`ctx.incoming === undefined`）—— 這一發不是被打出來的
 *     ② `reflectDepth > maxChainDepth` —— 反彈鏈到底了
 *     ③ 排空預算來不及，而 `whenTooLate` 是 `"drop"`（出貨預設）
 *     ④ **反彈量 ≤ 0 不發封包** —— 原傷害被完全擋下時就是這一道。
 *        ⭐ 「什麼算 0」是作者的 `incomingPct.basis`（raw / mitigated / hpLost）
 *        決定的，所以那個決策點**早就是一個欄位**，不需要在這裡再開一個。
 *
 *   Ⅱ 封包真的解算了 —— 目標活著、沒有無敵免疫、沒有被技能迴避擋掉。
 *
 * 全部都不算成功。一個在「其實沒反彈到」時照樣觸發的事件，會讓「反彈時回血」
 * 實際上變成「被打時回血」—— 那是另一支技能，而畫面上看不出差別。
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
    // ⭐ 第六個參數 = **反彈傷害的 provenance**。少了它，`onReflectSuccess` 的
    // 效果裡的 `damage.incomingPct` 會走 `ctx.incoming === undefined` 那個
    // early-return，於是 20-002「每次造成 7 倍[反彈]傷害」整條靜默變成 0 ——
    // 一個做了但玩家拿不到的功能（失敗形態 ②）。
    fireHooks(world, ev.reflector, "onReflectSuccess", ev.attacker, undefined, ev.incoming);

    // ⭐⭐ GH#885 —— **演出軸**。在此之前 `onReflectSuccess` 只走 `fireHooks`
    //    （＝內容的效果鏈），⛔ **零 emit** ⇒ 客戶端完全不知道有這一刻發生過
    //    ⇒ ⭐ owner 指名的驗收三招之一「20-002 理想鄉EX」（由反彈成功觸發）
    //      在 `vfx-script@1` 裡**寫不出來**。
    //
    // ⚠️ ⭐ **歸屬**：`ev.incoming.origin` 是那一發**反彈封包自己的** provenance
    //    （`combat/damage.ts:61` 的 `` `ability:${id}` ``）—— 而反彈封包的來源是
    //    **防禦者**，所以它指的正是**他自己那支反彈技能**。
    //    ⇒ ⛔ 播放器不需要新的 dep，用既有的 `scriptFor(abilityId)`。
    //
    // ⛔ 這裡**不加任何新的迴圈或佇列** —— 它就跟在既有的 `fireHooks` 後面，
    //    由同一組界（`reflectDepth` ＋ `DAMAGE_QUEUE_MAX_PASSES`）夾住。
    const rt = world.transform.get(ev.reflector);
    world.emit("reflectSuccess", {
      reflector: ev.reflector,
      attacker: ev.attacker,
      origin: ev.incoming.origin,
      amount: ev.incoming.hpLost,
      x: rt?.pos.x ?? 0,
      z: rt?.pos.z ?? 0,
    });
  }
}
