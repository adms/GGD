/**
 * movementHold — 「這個 tick,身體是被**遊戲**按住的嗎?」的**唯一**判準。
 *
 * ── 為什麼要有這個檔案 ──────────────────────────────────────────────────────
 * 這段判斷原本只活在 `systems/MovementSystem.ts` 的迴圈裡。GH#216 的接敵規則
 * 需要問**同一個問題**(「走不動是地形造成的,還是硬控造成的?」),而
 * 「再寫一份」是這個 repo 反覆吃過的虧:兩份會漂走,而漂走的那一天沒有任何東西
 * 會紅 —— 只有玩家會發現被定身之後角色往反方向跑。所以判斷抽到這裡,
 * MovementSystem 與 OrderSystem 讀的是**同一個函式**。
 *
 * ⚠️ 這裡回的是「按住」,不是「沒在動」。撞牆、卡柱子、走到場邊沿著邊界滑 ——
 * 那些都是**幾何**造成的靜止,`Transform.vel` 一樣是 0,但它們**不**屬於這裡。
 * GH#216 要救的正是那些人;要放過的是這裡回 true 的人。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { Champions } from "./content/registry";

export interface MovementHold {
  /** 減速的連乘積(1 = 沒被減速)。 */
  speedMult: number;
  /** 腳被釘住:root / stun / 施法鎖 / recovery 鎖 / 擊倒。 */
  rooted: boolean;
  /** 連轉身都被凍住(stun / 擊倒)。rooted 的真子集。 */
  stunned: boolean;
}

/**
 * 這個 tick 的移動限制。**唯一** writer 是各系統自己,這裡只讀。
 *
 * 四個來源,順序不影響結果(全部是 OR / 連乘):
 *   1. `StatusComp` 上還沒到期的 root / stun / moveSpeedMult
 *   2. 施法 startup 的 channel lock (`abilities.cast.rooted`)
 *   3. 出手後的 recovery,而且該技能有 opt-in (`recovery.roots`)
 *   4. 擊倒 (`world.knockdown`) —— 硬控等級,連轉身一起凍
 */
export function movementHold(world: SimWorld, id: EntityId): MovementHold {
  let speedMult = 1;
  let rooted = false;
  let stunned = false;
  const st = world.status.get(id);
  if (st) {
    for (const e of st.effects) {
      if (e.expiresAtTick <= world.tick) continue;
      if (e.root || e.stun) rooted = true;
      if (e.stun) stunned = true;
      if (e.moveSpeedMult !== undefined) speedMult *= e.moveSpeedMult;
    }
  }
  // Casting an ability with cast time roots the caster (channel lock).
  const abComp = world.abilities.get(id);
  if (abComp?.cast?.rooted) rooted = true;
  // Post-resolve RECOVERY roots ONLY when the ability opted in
  // (`recoveryRoots: true`). The default deliberately leaves footwork free —
  // startup already hard-roots, and stacking a second root on every ability
  // press reads as a frozen game. See abilities/abilityRecovery.ts DECISION 2.
  if (abComp?.recovery && abComp.recovery.roots && abComp.recovery.ticksLeft > 0) rooted = true;
  // ⭐ 70-00【紮根】—— **這具身體本來就不會走**（英雄卡的 `immobile`）。
  // owner 2026-08-13：「應該是狀態改變，類似定身（可攻擊跟施展技能但不能移動），
  // 並非把移動速度調整到 0」。
  //
  // ⚠️ 它放在這裡而不是 `world.status`，是因為它**不是 CC**：不可被【淨化】剝掉、
  //    不被免控 buff 拒絕、不計進 `ccAppliedTicks` 戰績。跟上面的施法定身
  //    (`cast.rooted`) 與下面的擊倒完全同一個出口 —— ⛔ 開第二套並行的判斷
  //    就是兩份會各自腐爛的程式。
  // ⭐ 而且它跟著 `championForm` 進出：切回行走形態的那一 tick，`championId`
  //    換回本體、這一格自然消失。⛔ 不需要時鐘（切換技沒有時鐘）。
  const champ = world.champion.get(id);
  if (champ !== undefined && Champions.tryGet(champ.championId)?.immobile === true) {
    rooted = true;
  }
  // Knockdown (prone): rooted like a hard CC. The knockback override is
  // evaluated by MovementSystem BEFORE normal steering, so the victim still
  // slides out, then lies grounded until the getup. Turning is frozen too.
  if ((world.knockdown.get(id) ?? 0) > 0) {
    rooted = true;
    stunned = true;
  }
  return { speedMult, rooted, stunned };
}

/**
 * 「這個 tick,身體是被**規則**按住的」—— GH#216 的接敵規則問的就是這一句。
 *
 * = `movementHold(...).rooted` **加上 hitstop**。hitstop 之所以在這裡而不在
 * `movementHold` 裡,是因為 `MovementSystem` 對它的處理位置不同:hitstop 在
 * 迴圈更前面就 `continue` 掉了(連 dash/擊退 override 都凍住),根本走不到
 * `rooted` 那幾行。但對「走位有沒有卡住」這個問題來說,兩者是同一件事 ——
 * 速度是 0,而且**不是**玩家指的地方到不了。
 *
 * ⚠️ 擊退/dash override **不在**這裡,而且是刻意的:那些 tick 身體是真的在
 * 位移,`Transform.vel` 讀出來就是實際位移,速度門檻自己就處理掉了。
 */
export function bodyHeldByRules(world: SimWorld, id: EntityId): boolean {
  if ((world.hitstop.get(id) ?? 0) > 0) return true;
  return movementHold(world, id).rooted;
}
