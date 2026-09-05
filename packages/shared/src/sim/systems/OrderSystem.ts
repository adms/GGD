/**
 * OrderSystem — translates each seat's continuous `order` into concrete
 * navigation state (moveTarget / attackTarget). Runs before MovementSystem.
 * Deterministic: seats are applied in ascending seat id order.
 */
import { moveFeelRules } from "../moveFeel";
import type { EntityId, SeatId } from "../../ids";
import type { IntentFrame } from "../intents";
import type { SimWorld } from "../SimWorld";
import { distSq, lenSq } from "../math/vec2";
import {
  DEFAULT_AUTO_ENGAGE,
  DEFAULT_MANUAL_ORDER,
  type AutoEngageRules,
  type ManualOrderRules,
} from "../combatFeel";
import { bodyHeldByRules } from "../movementHold";
import { stuckEscapeRules, stuckEscapeTick } from "../stuckEscape";
import { berserkDropsOrders, berserkSeek, isBerserk } from "../berserk";
import { fearDropsOrders, fearPass } from "../fear";
import { chaosDropsOrders, chaosPass } from "../chaos";
import { reachTo } from "./BasicAttackSystem";
import { cancelRecoveryByOrder } from "../abilities/abilityRecovery";
import {
  ACQUIRE_LEASH,
  acquireRadius,
  acquireTarget,
  forcedTargetOf,
  isManuallyTargetable,
  rankOf,
  shouldSwapAutoTarget,
} from "../targeting";

/** Distance at which a move order counts as arrived. */
const ARRIVE_EPS = 0.05;

// ⭐ 搬去 `sim/moveFeel.ts` 了（2026-09-01）—— 住 `content/config/combat-feel.json` 的 `moveFeel`。

/**
 * 卡住就接敵的規則表 (GH#216)。缺格 → 出貨預設,**不是**空表 —— 空表的
 * `stallTicks` 是 undefined,`>=` 比較永遠 false,規則就靜默消失了
 * (`facingTicks` / `statCaps` 學到的同一課)。
 */
export function autoEngageRules(world: SimWorld): AutoEngageRules {
  return world.combatFeel.autoEngage ?? DEFAULT_AUTO_ENGAGE;
}

/**
 * 玩家點名的目標 vs 自動索敵的規則表 (GH#266)。缺格 → 出貨預設,理由與
 * `autoEngageRules` 完全一樣:空表的 `survivesGroundMove` 是 undefined,
 * 而 `!undefined` 是 true —— 規則會**反過來**靜默生效,比消失更糟。
 */
export function manualOrderRules(world: SimWorld): ManualOrderRules {
  return world.combatFeel.manualOrder ?? DEFAULT_MANUAL_ORDER;
}

/**
 * ⭐ 打帶跑 (GH#637) —— 「這一條 move 是**離散的點擊**還是**搖桿流的一拍**」的
 * 分界(tick)。上一條 move 距今 **< 這個數** = 流(不武裝冷卻窗口);**≥** = 點擊。
 *
 * 為什麼是 3(100ms):搖桿/虛擬搖桿每一拍送一條(理想間隔 1),網路抖動把兩則
 * 訊息擠進同一 tick 時會出現間隔 2 —— 3 把這兩種都收進「流」。而人手的連點
 * 要**持續** 10Hz 以上才會被誤判成流,那不是一個人做得到的節奏。誤判的代價也
 * 不對稱:把流誤判成點擊只是多一段 1 秒不索敵(推著搖桿時追擊本來就讓路、
 * standstill 也不讓走動中出手,幾乎看不到);把點擊誤判成流才是機制消失。
 * ⛔ 不做成後台欄位:它是「同一根搖桿」的物理判定,不是 owner 會調的手感。
 */
const MOVE_ORDER_STREAM_GAP_TICKS = 3;

/**
 * 玩家點了地板 ⇒ 武裝「不搶指揮權」窗口 (GH#637)。
 *
 * owner 2026-08-24:「我如果點了地板作為目標 要有1秒冷卻不能跑去打任何目標
 * (自動攻擊)讓我可以連續移動不被干擾來達成打帶跑(像是被打不能跟我搶指揮權
 * 跑去打人)」。窗口的**消費端**在 `autoAcquirePass`(不索新目標、反擊接管不生效、
 * 放下已握的自動目標);這裡只負責「什麼時候武裝」,三道閘缺一不可:
 *
 *   1. **真人座位** —— `MobRules.humanSeats`(GH#577 開的同一扇門:sim 對真人與
 *      bot 的 IntentFrame 逐位元同型,「誰是玩家」只有 host 每場戰鬥交進規則表
 *      這一條路)。缺席/空集合 ⇒ 永不武裝 ⇒ 舊行為逐位元不變 —— 每一份手搭
 *      夾具、客戶端預測影子、重播的純函式重新武裝,都刻意走那一邊(和 mobs.ts
 *      的 fallback 契約同一句話)。bot 因此一格都不受影響(#274 的 IDLE 守衛)。
 *   2. **離散的點擊** —— 搖桿流的每一拍都武裝的話,推著搖桿 = 永久關掉自動攻擊,
 *      那正是 #274 修掉的災難(它的 STICK 守衛就在量這個)。
 *   3. **機制開著** —— `moveOrderNoAggroSec: 0` 是 owner 的一鍵 rollback。
 *
 * ⚠️ 只管 `kind:"move"`。attackMove / attackTarget / stop / hold 是玩家自己下的
 * 戰鬥決策,不但不武裝,還會**作廢**現有窗口(呼叫端的 switch 前那一行)。
 */
function armMoveOrderNoAggro(
  world: SimWorld,
  id: EntityId,
  seatId: SeatId,
  mo: ManualOrderRules,
): void {
  const windowTicks = Math.round(mo.moveOrderNoAggroSec / world.dt);
  if (windowTicks <= 0) return;
  if (world.mobRules?.humanSeats?.has(seatId) !== true) return;
  const last = world.lastMoveOrderTick.get(id);
  world.lastMoveOrderTick.set(id, world.tick);
  if (last !== undefined && world.tick - last < MOVE_ORDER_STREAM_GAP_TICKS) return;
  world.moveOrderNoAggroUntil.set(id, world.tick + windowTicks);
}

/**
 * 這一 tick 更新一個單位的「走位卡住了幾個 tick」。
 *
 * 讀的是 `Transform.vel` —— movementSystem 上一 tick **實際**走出去的位移/dt,
 * 不是 `nav.moveTarget` 那種「想走」。撞牆、卡柱子、目的地在場外,三種都會讓
 * 實際位移歸零,而「想走」在三種情況下都還是滿的。這就是為什麼 #274 的
 * 「移動指令一律讓路」抓不到它們:那個條件只看意圖。
 *
 * 只有**移動指令**會累積。`attackMove` 本來就會追擊,`hold` / `stop` 是玩家
 * 明確要求站著,不該被解讀成卡住。
 *
 * ⚠️ **硬控的 tick 不算證據** (`ccPausesStall`, 2026-07-30)。被定身 / 昏迷 /
 * 擊倒 / 施法鎖住的單位速度也是 0,但那不是「玩家指的地方到不了」—— 那是遊戲
 * 把他按住。出貨內容有 47 支持續 ≥ 1 秒的硬控,最長 4 秒 = 120 tick,是這個
 * 窗口的四倍,所以在這一格之前,任何一發 1 秒定身都足以讓走位權被追擊搶走。
 * 被控已經夠慘,解控之後角色還往反方向跑,比原本的 bug 更糟。
 */
function updateWalkStall(world: SimWorld, id: EntityId, rules: AutoEngageRules): void {
  // ⭐ GH#677 —— 這一族現在有**兩個消費者**:接敵的 `world.walkStall`(vel 系,
  //   照舊)與單位互卡的脫困保險絲(`sim/stuckEscape.ts`,量實際座標差)。
  //   **門是同一組**(有 move 指令 / 還沒到站 / 硬控凍結),在這裡算一次,
  //   verdict 餵給兩邊 —— ⛔ 保險絲那頭沒有第二份 stall 偵測。
  const escOn = stuckEscapeRules(world).enabled;
  const nav = world.nav.get(id);
  const t = world.transform.get(id);
  if ((!rules.enabled && !escOn) || !nav || !t || nav.order?.kind !== "move" || nav.moveTarget === null) {
    world.walkStall.delete(id);
    if (t) stuckEscapeTick(world, id, "idle");
    return;
  }
  // 已經站在終點上 = 走完了,不是卡住。這一步是必要的:這個 pass 跑在
  // 「清掉抵達的走位」之前,所以一個已經到站、而客戶端每 tick 又重送同一條指令
  // 的單位,在這裡看起來和撞牆的單位一模一樣(有指令、有終點、速度 0)。少了
  // 這一行,站在自己指定的定點上一秒之後就會被判定成卡住而自動衝出去。
  if (distSq(t.pos, nav.moveTarget) <= ARRIVE_EPS * ARRIVE_EPS) {
    world.walkStall.delete(id);
    stuckEscapeTick(world, id, "idle");
    return;
  }
  // ---- 硬控:凍結計數,不累積也不歸零 ----
  // 判準讀的是 `movementHold.ts` 的 `bodyHeldByRules`,和 `MovementSystem` 決定
  // 「這一 tick 走不走得動」用的**同一個函式**(root / stun / 施法鎖 / recovery
  // 鎖 / 擊倒 / hitstop)。抄一份過來會漂走,而漂走那天不會有任何測試紅。
  //
  // 為什麼是**凍結**不是歸零:一個已經卡在柱子上 20 tick 的玩家吃到硬控,解控
  // 之後應該從 20 繼續數,不是重新等一秒 —— 硬控只是不算證據,不是把之前的證據
  // 抹掉。歸零的話,持續被點控的玩家會永遠攢不到 stallTicks,這條規則對他等於
  // 不存在。
  if (rules.ccPausesStall && bodyHeldByRules(world, id)) {
    stuckEscapeTick(world, id, "frozen");
    return;
  }
  // 接敵那一半:照舊讀 `t.vel`(分離 pass 之前的值 —— 對牆/柱子誠實,對互卡
  // 說謊;互卡是保險絲的轄區,牆才是接敵的)。⛔ 接敵關著時不留殭屍計數。
  if (!rules.enabled) {
    world.walkStall.delete(id);
  } else if (lenSq(t.vel) >= rules.stallSpeed * rules.stallSpeed) {
    world.walkStall.set(id, 0);
  } else {
    world.walkStall.set(id, (world.walkStall.get(id) ?? 0) + 1);
  }
  stuckEscapeTick(world, id, "walk");
}

/**
 * 這個單位的走位現在是不是「空轉」—— 手上有移動指令,但身體連續
 * `stallTicks` 個 tick 沒有真的走出去。
 */
function walkIsStalled(world: SimWorld, id: EntityId, rules: AutoEngageRules): boolean {
  if (!rules.enabled) return false;
  return (world.walkStall.get(id) ?? 0) >= rules.stallTicks;
}

/**
 * 追擊現在可不可以覆寫這個單位的移動通道?
 *
 * 走得動的走位 → 不行(#274 的走位權,一個 tick 都不讓)。
 * 空轉的走位 → 可以,而且一旦接手就**上鎖**(`world.autoEngaging`),否則身體
 * 一動就不再算空轉、追擊立刻放手、又撞回牆上,量到的淨位移是 3% 的正常速度。
 */
function autoEngageActive(world: SimWorld, id: EntityId, rules: AutoEngageRules): boolean {
  if (!rules.enabled) return false;
  return world.autoEngaging.has(id) || walkIsStalled(world, id, rules);
}

export function orderSystem(world: SimWorld, intents: ReadonlyMap<SeatId, IntentFrame>): void {
  // GH#216 —— 讀在最前面,因為**指令套用**那一段就已經要用到它了
  // (`respectLiveSteering`:一條新到的 move 當場把方向盤還給玩家)。
  const ae = autoEngageRules(world);
  // GH#266 —— 玩家點名的目標撐不撐得過一條移動指令 (sim/combatFeel.ts)。
  const mo = manualOrderRules(world);

  // Apply new orders in ascending seat order (Map iteration is insertion order,
  // so sort explicitly for determinism regardless of host map construction).
  const seatIds = [...intents.keys()].sort((a, b) => a - b);

  // Index: seat -> entity (champions carry TeamComp with their seat).
  for (const seatId of seatIds) {
    const frame = intents.get(seatId)!;
    if (!frame.order && !frame.aim) continue;

    for (const [id, tc] of world.team) {
      if (tc.seatId !== seatId) continue;
      const nav = world.nav.get(id);
      const t = world.transform.get(id);
      if (!nav || !t) continue;

      if (frame.aim) {
        const l2 = frame.aim.x * frame.aim.x + frame.aim.z * frame.aim.z;
        if (l2 > 1e-12) {
          const l = Math.sqrt(l2);
          t.facing = { x: frame.aim.x / l, z: frame.aim.z / l };
          // 瞄準優先 (owner 2026-07-28:「面向是瞄準優先」)。
          //
          // ⚠️ 只寫 `t.facing` 是不夠的,而這正是這個 bug 的形狀:這一行跑在
          // slot 4,而 slot 5 的 movementSystem 會把面向鎖(#264 出手 commit 的
          // 方向)重新蓋回去。也就是說「玩家正在推右類比」這件事,在同一個 tick
          // 之內被寫進去又被抹掉,而且沒有任何東西會紅 —— 兩邊各自的測試都只看
          // 自己那一半。標記在這裡,由 movementSystem 讓位。
          //
          // 退化向量(長度 0)不算瞄準:它進不了這個 if,所以「手放開類比」不會
          // 被誤判成「還在瞄」而永久壓住出手轉向。
          world.aimTick.set(id, world.tick);
        }
      }

      // ---- 暴走 (59-00 初號機):方向盤沒了 ----
      // 丟掉 `order`,但**不丟 `aim`**(上面已經套用完)—— 面向是表演,而且
      // 客戶端預測還在跑,強行歸零只會讓模型抽搐。玩家推搖桿還是能「看向那邊」,
      // 走不走由不得他。為什麼是這裡而不是 `movementHold`、為什麼不是 `root`,
      // 見 sim/berserk.ts 的決策 1。
      // ---- 恐懼:同一個模型的鏡像(sim/fear.ts) ----
      // 一樣只丟 `order`、一樣不丟 `aim`。差別在後面那一半:暴走把身體交還給
      // 自動索敵,恐懼把身體推離最近的敵人而且不攻擊(`fearPass`,這支函式的
      // 最後一步)。
      // ---- 混亂:第三個鏡像(sim/chaos.ts) ----
      // owner 2026-08-09:「完全無法指定目標,並且會亂走路,跟恐懼一樣」。
      // 一樣只丟 `order`、一樣不丟 `aim`。差別在後面那一半:恐懼逃離最近的敵人,
      // 混亂走 `world.rng` 抽出來的方向(`chaosPass`,這支函式的最後一步)。
      if (
        berserkDropsOrders(world, id) ||
        fearDropsOrders(world, id) ||
        chaosDropsOrders(world, id)
      )
        break; // one entity per seat
      const order = frame.order;
      if (!order) continue;
      nav.order = order;
      // ⭐ owner 2026-08-28 —— `idleAutoEngageSec` 的計時器：指令歸零。
      //    （成功施法的那一半在 `castAbility`；兩邊寫同一張 map。）
      //
      // ⭐⭐ GH#863：**「移動算不算戰鬥輸入」是版本的差別**，⛔ 不是缺陷。
      //   v3（出貨）＝ 算 ⇒ 逐位元維持 GH#652 的 LoL 語意（走位權是玩家的）。
      //   v4 ＝ ⛔ 不算 ⇒ spec §6/§50 逐字：「LS movement 不重置計時器」、
      //        「LS 按住 10 秒 → Auto Farm 仍然活著」。⚠️ 少了這一條，
      //        按住左搖桿的玩家**永遠**等不到自動清怪，而那是 v4 的整個前提。
      //   ⛔ 走位權不受影響：`autoEngageActive()` 只讓**空轉**的走位被接管，
      //     而「走得動的走位順手索到的目標不上鎖」（下面 nav.attackTargetAuto 那條路）。
      if (world.controllerScheme.combatInput.moveStick || order.kind !== "move")
        world.lastCommandTick.set(id, world.tick);
      // ---- GH#652 細節①: 後搖取消 (animation cancel) ----
      // LoL:結算**之後**的後搖，任何一條新指令都砍得掉，⭐ 而那一發照樣算數。
      // ⛔ 前搖不在這裡 —— `ab.windup` / `ab.cast` 一格未動,走開仍然作廢那一刀
      // (`BasicAttackSystem` 的 `standstillBlocks`,既有語意)。
      //
      // ⚠️ 三道閘,和 `armMoveOrderNoAggro` 同一組理由:
      //   1. **機制開著** —— `recoveryCancelOnOrder` 是 owner 的一鍵 rollback;
      //   2. **真人座位** —— bot 每 tick 都在下指令,一起放行等於把揮空懲罰整個
      //      從 AI 身上拿掉;缺席/空集合 ⇒ 舊行為**逐位元**不變(手搭夾具、
      //      客戶端預測影子、重播的純函式重新武裝全部走那一邊);
      //   3. **這一 tick 真的有一條指令** —— 上面那個 `if (!order) continue`。
      // ⚠️ 位置:orderSystem 是 step 4,而 `basicAttackSystem` 是 step 6 ⇒ 砍掉的
      // 那一 tick 就能出手,⛔ 不必再等一 tick(那會是「開關開著但慢半拍」)。
      if (
        mo.recoveryCancelOnOrder &&
        world.mobRules?.humanSeats?.has(seatId) === true
      ) {
        cancelRecoveryByOrder(world, id);
      }
      // GH#637 —— 任何**非 move** 的新指令(A移動/點名目標/S/H)都是玩家自己
      // 選擇開戰或停手:點地板的冷卻窗口當場作廢(他要打,就讓他打)。
      if (order.kind !== "move") world.moveOrderNoAggroUntil.delete(id);
      switch (order.kind) {
        // ⭐ 括號是 `no-case-declarations` 要的：這個 case 體裡有 `const keepsManual`，
        //   ⛔ 沒有自己的區塊時它會洩到整個 switch 的作用域（同 `case "attackTarget": {`）。
        // ⚠️ 註解放在群組**上面** —— 夾在兩個空 case 之間會踩 `no-fallthrough`。
        case "move":
        case "attackMove": {
          nav.moveTarget = order.point ? { x: order.point.x, z: order.point.z } : null;
          // A GROUND order re-points MOVEMENT, not targeting (task #274).
          //   - an EXPLICIT target is superseded, LoL-style: right-clicking the
          //     ground while attacking someone cancels that attack order;
          //   - the SIM'S OWN auto target is left standing. It was never the
          //     player's decision to make, and dropping it here would re-roll it
          //     from scratch on every one of the 30 orders a second an analog
          //     stick emits — defeating the leash/swap hysteresis in
          //     autoAcquirePass and, worse, blanking `attackTarget` for the whole
          //     of a committed wind-up (the A-click case that held a target 86%
          //     of the round and still landed 2 hits).
          //
          // ---- GH#266: …除非 owner 說玩家點名的目標最高優先 ----
          // ⭐ 決策點 `manualOrder.survivesGroundMove`(出貨 **true**)。上面那段
          // LoL 語意在**滑鼠**上是對的:右鍵一次點擊只送一條指令,所以「點地面」
          // 真的就是「我要取消攻擊」。壞掉的是把同一條規則套到**連續轉向**上 ——
          // 類比搖桿與虛擬搖桿推著的時候**每一拍都送一條 move**
          // (`GamepadInput` / `TouchInput`),那不是取消攻擊,那是走路。
          //
          // 量到的:一條明確的 `attackTarget` 指到特殊殭屍,之後每 tick 送一條
          // move → **下一個 tick** 目標就變成旁邊的普通殭屍(`attackTargetAuto`
          // false→true)。手選的壽命 = 1 tick。而且換掉之後回不來:比較器的
          // key 3 是「血量低的優先」,特殊殭屍血量遠高於雜魚,所以只要旁邊有雜魚
          // 自動索敵永遠不會挑它 —— 這就是 owner 的「玩家無法指定攻擊特殊殭屍」。
          //
          // ⚠️ 只放行 `kind:"move"`。`attackMove` 仍然取代手選目標(A 是玩家自己
          // 下的另一條戰鬥決策,而且沒有任何輸入裝置會連續送它)。
          const keepsManual = mo.survivesGroundMove && order.kind === "move";
          if (!nav.attackTargetAuto && !keepsManual) nav.attackTarget = null;
          // …連**被嘲弄暫存起來**的那一條也一起取消。同一條規則:一條地面指令
          // 取代玩家自己的攻擊指令。少了這一行,一個在嘲弄期間改用走位的玩家會
          // 在嘲弄退掉的那一 tick 被「還原」到他早就放棄的那個目標身上 ——
          // 而畫面上完全看不出來為什麼英雄突然自己跑去打別人。
          // (`keepsManual` 時一起留著,否則「嘲弄期間走了一步」= 永久忘記他點的
          // 那一隻,而沒有嘲弄的同一步卻記得 —— 兩種行為對玩家沒有任何區別。)
          if (!keepsManual) world.suspendedOrder.delete(id);
          // ---- GH#216: 玩家此刻正在轉方向盤 → 走位權無條件還給他 ----
          // 一條**新到的** move 是「玩家現在正在下指令」唯一誠實的訊號:搖桿與
          // 虛擬搖桿只在推著的時候每一拍送一條(GamepadInput / TouchInput),
          // 滑鼠右鍵一次點擊只送一條(InputCapture)。所以這一行救的是被卡住
          // 的滑鼠玩家,同時保證推著搖桿的人一個 tick 都不會被接管。
          //
          // 兩件事都要做,少一件都不夠:
          //   · 歸零 `walkStall` —— 否則沿著牆磨的搖桿玩家照樣會累積到
          //     `stallTicks`,`walkIsStalled` 一成立追擊當場就接手了(鎖不鎖
          //     根本來不及參與)。實測 |v| = 0.39~0.43,全部低於 0.5。
          //   · 解鎖 `autoEngaging` —— 這是「右鍵點進柱子 → 被接管 → 改用搖桿
          //     /再點一次別的地方」那條路徑的**唯一**出口。舊版只在
          //     `order.kind !== "move"` 時解鎖,所以再點一次地面(還是 move)
          //     解不開,新的目的地會被追擊一路蓋掉。
          if (ae.respectLiveSteering && order.kind === "move") {
            world.walkStall.set(id, 0);
            world.autoEngaging.delete(id);
          }
          // ---- GH#637: 打帶跑 —— 點地板 ⇒ 武裝「不搶指揮權」窗口 ----
          // 只有 `kind:"move"`(`attackMove` 是玩家自己下的戰鬥決策,上面那行
          // 已經把窗口作廢了)。三道閘(真人座位/離散點擊/機制開著)在函式裡。
          if (order.kind === "move") armMoveOrderNoAggro(world, id, seatId, mo);
          break;
        }
        case "attackTarget": {
          // 召喚物該不該被玩家手動點選 —— a DECISION POINT (sim/summonRules.ts),
          // default ON (WC3: a summoned unit is right-clickable). A summon the
          // content marked un-clickable resolves to NO target, i.e. the click
          // behaves exactly like clicking empty ground: `autoAcquirePass` sees
          // `attackTarget === null`, clears the spent order and re-acquires, so
          // the player is never left standing with a dead order in hand.
          //
          // ⚠️ This is NOT a general legality check on `order.entity` — see
          // `isManuallyTargetable`. Everything that is not a summon passes
          // through byte-identically to before.
          // 隱形 rides the SAME predicate (sim/stealth.ts): `id` is the seat's
          // own champion, so his ALLIES and his own body stay clickable while a
          // hidden ENEMY resolves to no target — which, as the paragraph above
          // says, behaves exactly like clicking empty ground rather than
          // leaving a dead order in hand.
          const wanted = order.entity ?? null;
          nav.attackTarget =
            wanted !== null && !isManuallyTargetable(world, wanted, id) ? null : wanted;
          nav.attackTargetAuto = false; // the seat chose it: hands off (task #221)
          nav.moveTarget = null;
          break;
        }
        case "stop":
        case "hold":
          nav.moveTarget = null;
          nav.attackTarget = null;
          nav.attackTargetAuto = false;
          // S / H 是「停手」。被嘲弄暫存起來的那條攻擊指令也一起取消 —— 否則
          // 玩家按了 S,嘲弄一退,英雄自己又衝回去打原本那個人。
          world.suspendedOrder.delete(id);
          break;
      }
      break; // one entity per seat
    }
  }

  // GH#216 —— 走位卡住偵測。必須跑在 autoAcquirePass **之前**:索敵半徑與追擊
  // 讓不讓路,兩邊讀的是同一個「這個走位空轉了幾 tick」,同一 tick 內必須一致。
  // 而它也必須跑在上面的**指令套用之後**:`respectLiveSteering` 剛剛把計數歸零,
  // 這裡才會從 0 開始重新累計(這一 tick 最多只能數到 1,永遠到不了 stallTicks)。
  {
    const ids: EntityId[] = [...world.champion.keys()].sort((a, b) => a - b);
    for (const id of ids) updateWalkStall(world, id, ae);
  }

  // ---- 暴走 (59-00):把身體交還給自動索敵 ----
  // 必須跑在 `autoAcquirePass` **之前**:它做的是「清掉玩家留下的指令與手選
  // 目標」,清完之後那個真空才輪得到索敵去填。跑在之後的話,暴走中的初號機會
  // 一路走向十秒前玩家點的那個地方,而且誰都不追(#274 的走位權讓路)。
  // 為什麼不自己選目標:sim/berserk.ts 決策 1 ②。
  {
    const ids: EntityId[] = [...world.champion.keys()].sort((a, b) => a - b);
    for (const id of ids) {
      if (isBerserk(world, id)) berserkSeek(world, id);
    }
  }

  // task #221: fill the targeting VACUUM (runs before the chase resolve below,
  // so a target acquired this tick both walks a melee hero in and fires the
  // ranged swing on the same tick).
  autoAcquirePass(world, ae, mo);

  // Resolve attackTarget chase: close only until the target is inside our own
  // ATTACK REACH, then stop. The reach is `reachTo` — the exact same function
  // BasicAttackSystem gates the swing on — so the approach and the attack can
  // never disagree: whenever the chase stops, the auto is guaranteed to fire.
  //
  // Chasing to BODY CONTACT instead (the old behaviour) broke twice over: a
  // range-12 mage walked 10 units past its own range into melee, and a melee
  // unit that halted in the gap between contact (radii + 0.5) and its reach
  // (max(range, radii + 0.1)) could neither attack nor move — soft separation
  // only fires on real overlap, so nothing ever restored it. Stopping at a
  // FRACTION of the reach puts the halt strictly inside the attack window.
  for (const [id, nav] of world.nav) {
    if (!nav.attackTarget) continue;
    const self = world.transform.get(id);
    const tgt = world.transform.get(nav.attackTarget);
    if (!self || !tgt) {
      nav.attackTarget = null;
      nav.attackTargetAuto = false;
      continue;
    }
    // ---- task #274: A LIVE WALK OWNS THE MOVEMENT CHANNEL ----
    // THIS is the line that actually conflicts with a player's move order —
    // not the acquisition. Having a target only makes you SWING (BasicAttack-
    // System gates on reach alone); it is the chase below that rewrites
    // `moveTarget`. So while an explicit `move` order is still walking, the
    // chase stands down and the destination the player asked for is left
    // exactly as ordered: you swing at whatever you pass, and you keep going
    // where you were going. `attackMove` is deliberately NOT covered — A-click
    // means "engage what you meet", and it is that chase which holds a champion
    // inside its own reach through the wind-up.
    //
    // ---- GH#216: …A WALK THAT IS GOING NOWHERE OWNS NOTHING ----
    // #274 read `nav.order` (the INTENT) and let it stand down the chase for the
    // order's whole life. A move order is only ever consumed by ARRIVE_EPS, so an
    // unreachable destination — a wall, a pillar, a click outside the zone —
    // makes that stand-down PERMANENT. Measured on the shipped Saber: one
    // right-click into an r1.8 pillar pinned it at |v| = 0.00 for 2,240
    // consecutive ticks (75 s) with the order still live, nearest enemy 16.25 u
    // away, 0 acquisitions and 0 swings for the entire round.
    // `autoEngageActive` reads the BODY (`Transform.vel`) instead, so a walk that
    // is really walking still owns the wheel to the tick, and one that is
    // grinding against geometry hands it back.
    if (
      nav.order?.kind === "move" &&
      nav.moveTarget !== null &&
      !autoEngageActive(world, id, ae)
    ) {
      continue;
    }
    const sc = world.stats.get(id);
    // Flowers are wide (0.7) STATIC props with no combat identity: keep the
    // legacy "walk up and touch" approach for them (a ranged champ holding at
    // range would otherwise never reach one it is trying to harvest).
    const reach = world.flower.has(nav.attackTarget)
      ? self.radius + tgt.radius + 0.1
      : sc
        ? reachTo(sc, self.radius, tgt.radius)
        : self.radius + tgt.radius + 0.1;
    const stop = reach * moveFeelRules(world).holdFraction;
    const d2 = distSq(self.pos, tgt.pos);
    // ⭐⭐ spec §25/§29/§31（GH#863）—— **自動**目標的追擊距離上限。
    //
    // ⚠️ 只管 `attackTargetAuto`：玩家**自己點的**目標照舊追到天涯海角
    //   （那是明確意圖，§23 只禁止「自動化決定走去哪」）。
    // ⛔ `enabled: false`（v3）⇒ 這一段逐位元不存在。
    //
    // ⭐ 「遠程⛔不追」是**推導**出來的，⛔ 不是職業判斷（§33）：
    //   追擊在 `d > reach×0.9` 觸發，貼近在 `d ≤ cap` 才准 ——
    //   近戰 (reach≈2.8) 兩區間相交於 2.5–3.0；遠程 (reach 8) 7.2 > 3.0 ⇒ 不相交。
    let chaseBlocked = false;
    // ⚠️⚠️ `attackMove` **不在這條規則裡**，而這是 `#274` 那條既有的整合測試抓到的：
    //   A 點地板是玩家逐字說「**走過去打**」—— 它索到的目標雖然是 `attackTargetAuto`，
    //   但那個「auto」指的是「不是手選的」，⛔ 不是「自動化自己決定的」。
    //   ⇒ spec §23 禁止的是**自動化**決定走去哪；A 點是明確意圖，一格都不該被限。
    //   ⛔ 少了這半句，v4 的 attack-move 會走到一半停住，而畫面上看起來像卡住。
    const orderedToFight = nav.order?.kind === "attackMove";
    if (nav.attackTargetAuto && !orderedToFight) {
      const ap = world.controllerScheme.autoApproach;
      if (ap.enabled) {
        // §31：**永遠**不自動追玩家（⛔ 這一條沒有例外，schema 也擋 false）。
        if (ap.pveOnly && world.champion.has(nav.attackTarget)) chaseBlocked = true;
        else if (!ap.allowBoss && world.mob.get(nav.attackTarget)?.kind === "boss")
          chaseBlocked = true; // §32：⛔ 不自動走向危險的王
        else {
          const cap = Math.min(reach * ap.maxRangeMult, ap.maxAbsoluteUnits);
          if (d2 > cap * cap) chaseBlocked = true;
        }
      }
    }
    if (!chaseBlocked && d2 > stop * stop) {
      nav.moveTarget = { x: tgt.pos.x, z: tgt.pos.z };
    } else {
      nav.moveTarget = null;
    }
  }

  // Clear arrived move targets.
  for (const [id, nav] of world.nav) {
    if (!nav.moveTarget) continue;
    const t = world.transform.get(id);
    if (!t) continue;
    if (distSq(t.pos, nav.moveTarget) <= ARRIVE_EPS * ARRIVE_EPS) {
      nav.moveTarget = null;
      if (nav.order && (nav.order.kind === "move" || nav.order.kind === "attackMove")) {
        nav.order = null;
      }
    }
  }

  // ---- 恐懼:逃 (sim/fear.ts) ----
  // ⚠️ **最後一步,而且必須是最後一步。** 上面每一段都會寫 `nav.moveTarget`:
  // 追擊迴圈把它指向攻擊目標、抵達檢查把它清成 null。跑在中間的話這一 tick 剛
  // 寫好的逃跑點會被追擊蓋回去 —— 而「被蓋回去」在畫面上就是**完全不逃**,
  // 狀態圖示還亮著(失敗形態 ②:算出來了但玩家拿不到)。
  //
  // 掃 `world.nav` 而不是 `world.champion`:#215 的殭屍也有 nav,而 52-002 /
  // 52-02 的範圍恐懼打到的多半正是它們。
  fearPass(world);
  // ---- 混亂:亂走 (sim/chaos.ts) ----
  // ⚠️ 和恐懼**同一個位置、同一個理由**:上面每一段都會寫 `nav.moveTarget`,
  // 跑在中間的話這一 tick 剛抽好的亂走點會被追擊蓋回去 —— 而「被蓋回去」在
  // 畫面上就是**完全正常地打架**,狀態圖示還亮著(失敗形態 ②)。
  // 一個人不可能同時恐懼又混亂到互相打架:兩支都只寫 `nav.moveTarget`,後跑的
  // 贏,而那是一個確定的答案(混亂贏),不是一個競態。
  chaosPass(world);
}

/**
 * AUTO-ACQUIRE (task #221) — the vacuum-filler.
 *
 * 「玩家操控的 近戰跟遠戰英雄 應該都要會自動攻擊附近英雄」. A champion with no
 * live target picks one itself, using the single shared rule in sim/targeting.ts
 * (威脅 → 低血 → 最近, champions before mobs, entity id as the final tiebreak).
 *
 * IT ONLY EVER FILLS A VACUUM. An explicit seat action always wins:
 *   - `attackTarget`  the player clicked THAT enemy → never re-pointed, never
 *                     leashed. Only when the target is gone (dead / despawned,
 *                     so `attackTarget` is already null) does the order get
 *                     consumed — otherwise one manual click that later dies
 *                     would suppress auto-attack for the rest of the match.
 *   - `move`          acquisition STAYS ON while walking (task #274). What a
 *                     walk suppresses is the CHASE — see the chase loop above —
 *                     so the player keeps the wheel and still swings at whatever
 *                     comes inside reach on the way past. #221 suppressed
 *                     ACQUISITION here instead, which silently switched
 *                     auto-attack off for the whole match for anyone using a
 *                     stick (a fresh move order every frame) or anyone who
 *                     right-clicked one unreachable spot.
 *   - `attackMove`    A-click MEANS "engage what you meet" → acquisition ON AND
 *                     the chase runs, so the champion closes and holds inside
 *                     its own reach through the wind-up.
 *   - `stop`          a real INTERRUPT, then over: the switch above clears the
 *                     targets, this pass skips acquisition for that one tick so
 *                     the press is observable, and clears `nav.order` so idle
 *                     re-acquires from the next tick. Leaving it sticky instead
 *                     would make S a permanent auto-attack OFF switch; skipping
 *                     the clear would make S a no-op.
 *   - `hold`          suppresses the CHASE, not the swing: only candidates
 *                     already inside the hold band are acquired and no
 *                     moveTarget is ever written for them.
 *
 * GATED ON `world.combatActive`. Three reasons, all load-bearing:
 *   1. the castability sweep (#128) steps NO_INTENTS with an adjacent enemy
 *      dummy and verdicts PASS on any damage event — un-gated acquisition would
 *      let a genuinely inert ability report PASS off a basic attack, silently
 *      inflating the ratchet;
 *   2. the round-settle freeze (#100) must stay frozen;
 *   3. it is `false` by default, so every pre-existing sim test that never sets
 *      it keeps hashing byte-identically. Same precedent as MobSystem /
 *      fireRing / coins.
 *
 * Mobs are NOT processed here — MobSystem owns their aggro (they are also not in
 * `world.champion`).
 */
/**
 * 嘲弄 vs 玩家自己點名的目標 —— TWO decisions, TWO fields (sim/taunt.ts).
 *
 * ⭐ 決策點 A `tauntRules.overridesManualOrder`（出貨 **false**）
 *   false = 嘲弄只接管自動索敵與 bot／小怪的 aggro（那三條路都走
 *   `acquireTarget` / `forcedTargetOf`），玩家右鍵點名的目標一個 tick 都不會
 *   被動到。owner 在**完全同一個題目**（系統要不要從玩家手上接管方向盤）推翻
 *   過自己一次 —— `autoEngage` 上鎖之後不放手，實測搶走 86.6% 的走位 tick，
 *   於是 `respectLiveSteering` 改成 true（sim/combatFeel.ts）。WC3 的嘲弄確實
 *   會蓋掉玩家指令，所以 true 是**保真**的那一側。
 *
 * ⭐ 決策點 B `tauntRules.restoreManualOrderOnLapse`（出貨 **true**）
 *   嘲弄退掉之後要不要把那個目標**還回去**。
 *
 *   ⚠️ B 以前不存在，而它的缺席不是「少一個選項」，是一個缺陷：舊實作把手選
 *   目標清成 null，然後下面通用那條路用 `attackTargetAuto = true` 重新填上 ——
 *   一次右鍵點名被**永久**轉成自動目標，嘲弄過期也回不來。一個布林值同時決定
 *   「接管」和「永不歸還」兩件事，而卡片上只寫了前者。
 *
 * 接管的做法是**清掉**手選目標而不是直接指派嘲弄者：清掉之後既有路徑會用
 * `best`（`acquireTarget` 保證那就是嘲弄者）重新填上，所以這裡沒有第二份
 * 「該打誰」的邏輯。歸還時寫回 `attackTargetAuto = false`，也就是還原成
 * **手選**，而不是留一個看起來一樣、但下一 tick 就會被自動索敵換掉的目標。
 */
function tauntVsManualOrder(
  world: SimWorld,
  id: EntityId,
  nav: import("../components").Navigation,
): void {
  const rules = world.tauntRules;
  const forced = rules.overridesManualOrder ? forcedTargetOf(world, id) : null;

  if (forced !== null) {
    if (nav.attackTarget !== null && !nav.attackTargetAuto) {
      // 記下來再清掉。最後一條手選指令勝出（玩家在被嘲弄期間又點了別人）。
      world.suspendedOrder.set(id, nav.attackTarget);
      nav.attackTarget = null;
      nav.attackTargetAuto = false;
    }
    return;
  }

  // 嘲弄退了（過期／嘲弄者死掉／超出牽引距離／規則被關掉）—— 方向盤還回去。
  const suspended = world.suspendedOrder.get(id);
  if (suspended === undefined) return;
  world.suspendedOrder.delete(id); // 一次性：還過就不再還
  if (!rules.restoreManualOrderOnLapse) return;
  // 只在玩家此刻**手上沒有自己的東西**時才還（他被嘲弄期間下的新指令永遠優先），
  // 而且那個目標要還活著 —— 對著屍體的指令不是「還原」，是一個死掉的指令。
  if (nav.attackTarget !== null && !nav.attackTargetAuto) return;
  if (!world.health.get(suspended)?.alive) return;
  nav.attackTarget = suspended;
  nav.attackTargetAuto = false;
}

/**
 * 這個實體是不是坐在一個**靶子座位**上（GH#657，`MobRules.inertSeats`）。
 *
 * ⚠️ 讀的是 `world.team` 的 `seatId`，與 GH#577 的 `humanSeats` 逐字同一條路 ——
 * sim 沒有「誰是靶子」這個概念，那是 host 每一場戰鬥開始交進來的知識。
 */
function isInertSeat(world: SimWorld, id: EntityId): boolean {
  const seatId = world.team.get(id)?.seatId;
  return seatId !== undefined && world.mobRules?.inertSeats?.has(seatId) === true;
}

function autoAcquirePass(
  world: SimWorld,
  ae: AutoEngageRules,
  mo: ManualOrderRules,
): void {
  if (!world.combatActive) return;

  // Explicit ascending-id iteration: `world.champion` is a Map, so its native
  // order is insertion order — an accident of spawn sequence, not a rule.
  const ids: EntityId[] = [...world.champion.keys()].sort((a, b) => a - b);

  for (const id of ids) {
    const nav = world.nav.get(id);
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const sc = world.stats.get(id);
    if (!nav || !t || !hp?.alive || !sc) {
      // GH#216: 死了 / 沒有身體就不可能在接敵。留著鎖的話,復活的那一 tick 這個
      // 單位會帶著上一條命的接敵狀態醒來,而 `walkStall` 早就被重設了。
      world.autoEngaging.delete(id);
      continue;
    }

    // ---- ⭐ GH#657: 練習靶 —— 這個座位整段索敵都不跑 ----
    // owner 2026-08-24:「練習模式預設對方三個英雄但**不會移動也不會攻擊、施放
    // 技能**」。⛔ 不移動、⛔ 不施法那兩半由 host 的 driver 負責（它一個 intent
    // 都不送）；**自動索敵**是 sim 自己會替單位做的唯一一件事，所以它是這裡的事。
    //
    // ⚠️ 位置在**最上面**是刻意的：放在 `tauntVsManualOrder` 之後的話，一個被
    // 嘲弄的靶子會被塞一個目標然後開始揮刀 —— 而「被打不還手」是這個功能的
    // 全部意義。⭐ 已握的自動目標當場放下（`dummyFightsBack` 從開切到關時，
    // 上一 tick 咬住的那個目標不可以留著）。
    //
    // ⚠️ 空集合（每一份測試夾具、客戶端預測影子、重播重新武裝、以及每一場正式
    // 比賽）⇒ 這一段逐位元不存在。
    if (world.mobRules?.inertSeats?.size && isInertSeat(world, id)) {
      if (nav.attackTargetAuto) {
        nav.attackTarget = null;
        nav.attackTargetAuto = false;
      }
      world.autoEngaging.delete(id);
      continue;
    }

    // ---- #216 × #221: STAND DOWN IN A SETTLED ZONE ----
    // `world.combatActive` is GLOBAL — it only drops once EVERY pairing is
    // decided — so between "my duel ended" and "the last duel ends" this pass
    // would hand a survivor a brand-new target and keep the fight running in a
    // zone whose round is already over. The defeated player is looking at the
    // shop by then (client shopGate), which is the exact 「回到商店…戰鬥沒真正
    // 結束」 report #216 exists to kill: its fire ring has stopped burning
    // (FireRingSystem) and its mobs have dropped aggro (MobSystem), so the
    // SIM-CHOSEN target must go the same way or the survivors would simply
    // switch to farming the stood-down zombies.
    //
    // Only the AUTO target is released. An EXPLICIT order the player gave is
    // left exactly as #216 shipped it — #216 deliberately scoped itself to what
    // the sim does ON THE PLAYER'S BEHALF, and silently cancelling a human's
    // own click here would be a second, unrelated behaviour change.
    if (world.settledZones.has(t.zone)) {
      if (nav.attackTargetAuto) {
        nav.attackTarget = null;
        nav.attackTargetAuto = false;
      }
      // GH#216: 這一場已經結束了,接敵的鎖也一起放掉 —— 留著的話下一回合開打的
      // 第一 tick 會帶著上一回合的接敵狀態,追擊直接無視玩家的走位。
      world.autoEngaging.delete(id);
      continue;
    }

    // A swing is already committed at a specific target: do not RE-POINT it
    // mid-wind-up. The wind-up itself carries its own target and survives
    // `nav.attackTarget` changing (BasicAttackSystem advances `ab.windup`
    // before it ever reads nav), but the CHASE reads nav — so re-pointing here
    // would walk the champion off the enemy it is already swinging at and the
    // blow would whiff.
    //
    // An EMPTY slot is a different thing entirely: it is a vacuum like any
    // other, and refusing to fill it was believed to be half of #274. A ground
    // order blanks `attackTarget`, the pass then skipped every tick of the
    // wind-up, so the chase had nothing to hold the champion in place with and
    // the player's own move order walked it out of its own range before the
    // damage point — 86.3% of ticks holding a target, 2 hits landed.
    //
    // ⚠️ CORRECTION (#274's adversarial pass): the `!== null` half of this
    // condition is currently UNREACHABLE, and the A-click recovery (4% → 75%
    // hit rate) came entirely from the `if (!nav.attackTargetAuto)` gate in the
    // ground-order branch above, NOT from here. Reverting this line to a bare
    // `windup` was measured: 0 tests red, and all five end-to-end scenarios
    // byte-identical. Once ground orders stopped blanking auto targets, the
    // only branch that nulls `attackTarget` mid-wind-up became unreachable, so
    // the vacuum this clause fills can no longer be constructed.
    //
    // It is kept as a cheap invariant, not as a fix — do not cite it as the
    // cause of anything, and do not build on the claim that it fires.
    if (world.abilities.get(id)?.windup && nav.attackTarget !== null) continue;

    // ---- 嘲弄 vs 玩家自己點名的目標 (sim/taunt.ts) ----
    // ⚠️ 位置很重要,而且它以前是錯的。這一段本來寫在這個迴圈的**尾巴**,可是
    // 上面那個 `case "attackTarget": if (nav.attackTarget !== null) continue;`
    // 會先把人踢出這一輪 —— 也就是說一個**真的右鍵點名**(`nav.order` 是
    // `attackTarget`)永遠走不到那一段,`overridesManualOrder: true` 對真實玩家
    // 指令一個 tick 都沒有生效過。既有那條測試看起來是綠的,是因為它自己手寫
    // `nav.attackTarget` 而**沒有** `nav.order`(失敗形態 ⑤)。搬到 switch 之前
    // 就是修正:接管與歸還都與玩家手上是哪一種指令無關。
    // 前搖那一行**仍然**在它上面 —— 前搖中改指向會讓那一刀砍空,那是既有且刻意
    // 的行為(見 taunt.test.ts 的「等這一刀收完」)。
    tauntVsManualOrder(world, id, nav);

    // ---- GH#266: 手選目標的牽引距離 ----
    // ⭐ 決策點 `manualOrder.leashUnits`(出貨 **0 = 不限制**,照 owner 的「永遠」)。
    // 它是 `survivesGroundMove` 的出口:目標留下來之後,走位一走完(`nav.order`
    // 被消耗成 null)追擊就會恢復,英雄會自己走回去找他點的那一隻。想要「跑遠了
    // 就算了」的人在後台填一個距離。
    //
    // 清成 null 之後,下面的 switch 會把那條用掉的 `attackTarget` 指令一起消耗
    // (`if (nav.attackTarget !== null) continue;` 不成立 → `nav.order = null`),
    // 所以玩家不會握著一條死掉的指令站在原地。
    //
    // 自動索敵自己的 `ACQUIRE_LEASH`(2)故意沒有套在這裡:那是給**系統挑的**
    // 目標用的滯後量,把它套上來等於偷偷把手選目標降級成自動目標。
    if (mo.leashUnits > 0 && nav.attackTarget !== null && !nav.attackTargetAuto) {
      const tgtT = world.transform.get(nav.attackTarget);
      const leash = mo.leashUnits;
      if (!tgtT || tgtT.zone !== t.zone || distSq(t.pos, tgtT.pos) > leash * leash) {
        nav.attackTarget = null;
        nav.attackTargetAuto = false;
      }
    }

    // ---- explicit-order suppression ----
    let holdPosition = false;
    const order = nav.order;
    // GH#216: 接敵的鎖只在「玩家手上是一條走不動的 move」時有意義。玩家一下別的
    // 指令(A-click / 點名目標 / S / H),或走位結束回到 idle,鎖就放掉 —— 這是
    // 玩家把方向盤要回去的**唯一**方式,所以它必須無條件、當場生效。
    if (order?.kind !== "move") world.autoEngaging.delete(id);
    if (order) {
      switch (order.kind) {
        case "attackTarget":
          if (nav.attackTarget !== null) continue; // the player's pick, still live
          nav.order = null; // it died / vanished — back to idle, re-acquire below
          break;
        case "move":
          // NO LONGER A SUPPRESSION (task #274). A walk owns MOVEMENT, and that
          // is enforced where movement is actually decided — the chase above.
          // Acquisition keeps running, so walking past an enemy makes you swing
          // at it without ever taking the wheel off the player.
          //
          // The old `if (nav.moveTarget !== null) continue` made every analog
          // stick a permanent auto-attack OFF switch: GamepadInput synthesises a
          // fresh `{kind:"move"}` order 4 u ahead EVERY FRAME it is deflected
          // (TouchInput does the same), so `moveTarget` was non-null on every
          // tick of the match and this pass skipped the seat forever. One
          // right-click on a spot the body can never stand on — outside the
          // zone, or inside a pillar — did it just as permanently.
          //
          // A FINISHED walk is still consumed here so a spent order does not
          // linger and keep the chase suppressed.
          //
          // ⚠️ GH#216 —— **不要**在接敵期間消耗掉它。接敵時追擊會在進入射程的那
          // 一 tick 把 `moveTarget` 設成 null(停下來打),那個 null 的意思是
          // 「追擊到位了」,不是「玩家走到了」。少了下面這個條件,一次點進柱子的
          // 走位會在接敵的第一場戰鬥就被當成已抵達吃掉 —— 玩家的目的地憑空消失,
          // 而他從來沒有走到過那裡。
          if (nav.moveTarget === null && !world.autoEngaging.has(id)) nav.order = null;
          break;
        case "attackMove":
          break; // A-click: engage while moving
        case "stop":
          // CONSUME IT, AND SKIP THIS TICK. Consuming matters because a sticky
          // `stop` would make S a permanent auto-attack OFF switch; skipping the
          // tick matters because re-acquiring in the very same tick the player
          // pressed S would make S do nothing observable at all. One tick of
          // idle is the whole difference between "interrupt" and "no-op".
          nav.order = null;
          continue;
        case "hold":
          holdPosition = true;
          break;
      }
    }

    // ---- GH#637: 打帶跑 —— 點地板後的冷卻窗口,自動索敵整段停擺 ----
    // owner 2026-08-24:「點了地板…要有1秒冷卻不能跑去打任何目標(自動攻擊)…
    // 像是被打不能跟我搶指揮權跑去打人」。窗口內(絕對 tick,exclusive):
    //   · 不索**新的**自動目標(下面的 acquireTarget/fill 整段跳過)——
    //     「誰在打我」的威脅鍵與 `shouldSwapAutoTarget` 的反擊接管都住在那一段,
    //     所以「被打反擊」跟著一起停,這正是 owner 點名的那一半;
    //   · 已握的**自動**目標當場放下 —— 少了這一下,點地板前就咬住的目標會在
    //     走位一結束時讓追擊接手(「跑去打人」的另一條路);
    //   · 玩家**自己點名**的目標一格都不動(`!attackTargetAuto` 那一側:那是
    //     他的指令,survivesGroundMove 的語意照舊)。
    // ⚠️ 嘲弄贏過窗口:`forcedTargetOf` 非 null 時窗口讓路 —— 被嘲弄就是被嘲弄,
    // 它連玩家自己的手選指令都能接管(tauntRules),沒有理由輸給一次點地板。
    // ⚠️ 前搖中的那一刀不歸這裡管:上面的 windup 守衛先 continue,已承諾的攻擊
    // 照舊收完(既有語意:不在前搖中改指向),下一 tick 才輪到這裡放下目標。
    {
      const noAggroUntil = world.moveOrderNoAggroUntil.get(id);
      if (noAggroUntil !== undefined) {
        // ⭐ owner 2026-08-24（GH#637 追加，逐字）：
        // > 「如果我按了某個地板移動過去**到目的地前** 我是不會被其他東西所吸引
        // >  除非嘲諷技能等 **就算敵人打我 我也不會被拉走** 直到 我走到目的地」
        //
        // ⇒ 窗口的長度**不再是那個秒數**：只要這條走位還在走（`nav.order` 還是
        //    move —— 抵達時 ARRIVE_EPS 會把它清成 null，非 move 指令會在上面那個
        //    switch 之前作廢窗口），指揮權就一直是玩家的。秒數退化成**下限**
        //    （點在腳邊那種一 tick 就到站的走位仍然有一小段保護）。
        //
        // ⚠️ **空轉時放手**：`walkIsStalled` = 有指令、卻連續 stallTicks 個 tick
        //    沒真的走出去（點在柱子中心那種永遠到不了的終點）。少了這一條，
        //    自動攻擊會被關掉**整個回合** —— 那正是 #274 修掉的災難。
        //    ⭐ 判準是**行為**（身體有沒有在前進），⛔ 不是再加一個秒數上限。
        //
        // ⚠️ 嘲弄照舊贏過窗口（owner:「除非嘲諷技能等」）。
        // ⛔⛔ **搖桿流不可以走這條路**。#274 的災難是「推著搖桿 = 永久關掉自動
        //    攻擊」,而搖桿每一拍都送一條 move ⇒ `nav.order` 永遠是 move ⇒
        //    只看 order 的話「撐到抵達」對搖桿玩家等於「撐到天荒地老」。
        //    ⭐ 判準用**武裝時的同一把尺**(`MOVE_ORDER_STREAM_GAP_TICKS`):
        //    最近一條移動指令已經隔了 ≥3 tick ⇒ 這是一次**離散點擊**之後的走位;
        //    流的話 `lastMoveOrderTick` 每 tick 都在動 ⇒ 退回秒數窗口(舊行為)。
        //    ⚠️ 這一條的守衛就是同一支測試裡的「搖桿流」那一案 —— 它在我第一版
        //    漏掉這個條件時**當場紅了**。
        const lastOrderTick = world.lastMoveOrderTick.get(id);
        const discreteWalk =
          lastOrderTick === undefined ||
          world.tick - lastOrderTick >= MOVE_ORDER_STREAM_GAP_TICKS;
        const stillWalking =
          mo.moveOrderNoAggroUntilArrival &&
          discreteWalk &&
          nav.order?.kind === "move" &&
          !walkIsStalled(world, id, ae);
        const holds = world.tick < noAggroUntil || stillWalking;
        if (holds && forcedTargetOf(world, id) === null) {
          if (nav.attackTargetAuto) {
            nav.attackTarget = null;
            nav.attackTargetAuto = false;
          }
          continue;
        }
        if (!holds) world.moveOrderNoAggroUntil.delete(id);
      }
    }

    // ---- radius ----
    // Derived from the champion's OWN reach (so a ranged hero opens fire at
    // range and a melee hero closes in) with a floor so melee is not limited to
    // bodies already touching it. `hold` shrinks it to the chase's own hold
    // point, which is what makes hold never produce a moveTarget.
    // `hold` uses tgtRadius = 0 — the SMALLEST reach any target could produce —
    // so the band is conservative and the chase below can never step forward.
    //
    // ---- GH#216: 卡住的時候,索敵半徑放大到 bot 的那一個 ----
    // `acquireRadius` 對 82 位近戰是 `MELEE_ACQUIRE_FLOOR = 6`,而 bot 的
    // `AI_ENGAGE_RANGE` 是 **48**(掃整個競技場)。所以一個走位卡死的玩家是全場
    // 唯一一個看得到敵人卻不會動的單位:實測右鍵點進柱子之後,最近的敵人 16.25
    // 單位遠 —— 6 的半徑整場一次都沒索到敵,而同一場的每個 bot 都在打架。
    // 只在卡住時放大,所以走得動的走位完全不受影響(半徑一格都沒變)。
    //
    // ---- W4 2026-07-31: 那個放大**只給卡住的人**,站著不動的人拿不到 ----
    // 上面那段只講了一半。同一個 `ae.seekRadius` 有兩種人拿不到:走得動的人
    // (刻意的,#274 的走位權),以及**完全站著不動**的人 —— 後者是量出來才發現
    // 的不對稱:一個手上什麼指令都沒有的玩家吃的是 `nearRadius`(近戰 6),所以
    // 「卡在柱子上」比「站著不動」更容易索到敵。實測
    // `apps/game-server/src/match/autoAcquireWhileMoving.test.ts` 的 `[idle]`:
    // 整場 2,410 tick 沒有任何敵方英雄靠到 14.95 單位以內 → 0 次索敵、0 次揮擊。
    //
    // 這是**手感的平衡決策**,不是缺陷,所以它是一個後台欄位而不是一行修正:
    // `idleSeeks` 出貨 `false` = 上面那個行為一個 tick 都沒變。理由與兩側的
    // 手感差別見 `sim/combatFeel.ts` 的 `AutoEngageRules.idleSeeks`。
    //
    // 讀的是**指令套用之後**的 `nav.order`(「此刻手上沒有任何指令」),不是
    // 迴圈上面那個先抓下來的 `order` —— 走完的走位在上面那個 switch 裡已經被
    // 消耗成 null,那種人也是站著不動的人。`hold` 不受影響(它先被三元的第一
    // 支接走,而且 `nav.order` 非 null)。
    // ══════════════════════════════════════════════════════════════════════
    // ⭐⭐ LoL 指令模型（GH#652）—— owner 2026-08-24 逐字：
    // 「這個操作要請你**完整拆解 LOL 的英雄控制指令與移動、攻擊、反擊邏輯**，
    //  現在玩 LOL 人數最多，**最容易被接受**」
    //
    // LoL 的一句話規格：**英雄的每一次出手都是玩家下的。** 逐條對照：
    //   · 右鍵地板（move）      → 走過去。⛔ 路上不出手、⛔ 被打不反擊
    //   · 右鍵敵人（attackTarget）→ 追著打他（GGD 的 `nav.attackTarget` 非 auto）
    //   · A + 地板（attackMove）→ 走過去**並打路上遇到的**  ← 唯一「自動」的入口
    //   · H（hold）             → 原地不動，只打射程內的
    //   · S（stop）             → 停手；⭐ 之後**站著不動不會自己找架打**
    //   · 沒有任何指令（idle）  → ⛔ 不索敵（LoL 英雄沒有 idle auto-acquire）
    //
    // ⇒ 整個模型在這裡收斂成**一個閘**：真人座位在 `"lol"` 模型下，只有
    //   attackMove / hold 這兩種「玩家說了要打」的指令才進索敵。
    //   已握的**手選**目標不受影響（下面 `!attackTargetAuto` 那條路），
    //   嘲弄照舊贏過一切（`forcedTargetOf`）。
    //
    // ⚠️ **只管真人**（GH#577 的 `humanSeats` 同一扇門）：bot 靠 `acquireTarget`
    //    打架，一起關掉等於整場沒有人動手。
    // ⚠️ 關掉（輔助模型）= 這一版之前的 GGD 行為（站著自動索敵、被打自動反擊、
    //    走位卡住自動接敵）⇒ 後台一格切回去就是完整 rollback。
    // ══════════════════════════════════════════════════════════════════════
    let idleEngaged = false;
    if (mo.lolControlModel && nav.attackTarget === null) {
      const seat = world.team.get(id)?.seatId;
      const isHuman = seat !== undefined && world.mobRules?.humanSeats?.has(seat) === true;
      const orderedToFight = order?.kind === "attackMove" || holdPosition;
      if (isHuman && !orderedToFight && forcedTargetOf(world, id) === null) {
        // ⭐⭐ owner 2026-08-28（逐字）：「如果沒有任何指令，停頓一段時間
        //    （N秒後台可設定）就會自動索敵攻擊」。
        //    GH#652 的 LoL 模型把 idle 索敵整段關掉（下面那個 continue）——
        //    owner 回報的「自動索敵不見了」正是它。這一段把「放著不管 N 秒」
        //    接回索敵，⛔ 而 LoL 語意（有指令就聽指令）一格不動：
        //    · 手上還有指令（move 進行中）⇒ 照舊不索（走位權是玩家的）
        //    · 計時器由任何指令／施法歸零（`world.lastCommandTick`）
        //    · `idleAutoEngageSec: 0` ⇒ 這一段逐位元不存在（純 LoL ＝ rollback）
        //    ⚠️ 首次見到（undefined）＝ **從這一 tick 起算**，⛔ 不是「從 tick 0」
        //    —— tick 是跨階段的絕對值，從 0 起算等於開戰當下直接接管。
        const idleTicks = Math.round(mo.idleAutoEngageSec / world.dt);
        // ⭐⭐ GH#863：v4 的走位**不是**「手上還有指令」的那種指令。
        //   ⚠️ 只改上面那個歸零是不夠的 —— 這個閘會單獨把整段擋掉，
        //     而症狀一模一樣（計時器跑完了卻永遠不索敵）。兩處要一起改。
        const idleUnblocked =
          nav.order === null ||
          (!world.controllerScheme.combatInput.moveStick && nav.order.kind === "move");
        if (idleTicks > 0 && idleUnblocked) {
          const last = world.lastCommandTick.get(id);
          if (last === undefined) world.lastCommandTick.set(id, world.tick);
          else if (world.tick - last >= idleTicks) idleEngaged = true;
        }
        if (!idleEngaged) {
          // 玩家沒有下「打」的指令 ⇒ 這一 tick 不索敵。⭐ 走位、追擊、施法、
          // 已承諾的前搖全部不受影響 —— 這裡只決定「要不要自己挑一個新目標」。
          world.autoEngaging.delete(id);
          continue;
        }
      }
    }

    const engaging = autoEngageActive(world, id, ae);
    // ⭐ idle 接管拿 `seekRadius`（W4 量過：近戰地板 6 在 bot 平均 40+ 單位遠的
    //    對局裡等於「開了跟沒開一樣」）。
    const idleSeeking = idleEngaged || (ae.enabled && ae.idleSeeks && nav.order === null);
    // ⭐ 近戰地板改成一格設定（`autoEngage.meleeAcquireFloor`）——
    //   ⛔ 在此之前它是 `targeting.ts` 的寫死常數。⚠️ 缺席 ⇒ 原本的 6。
    const nearRadius = acquireRadius(sc, t.radius, ae.meleeAcquireFloor);
    const radius = holdPosition
      ? reachTo(sc, t.radius, 0) * moveFeelRules(world).holdFraction
      : (engaging || idleSeeking) && ae.seekRadius > nearRadius
        ? ae.seekRadius
        : nearRadius;

    // ---- GH#652 細節②: A 移動打**離指令點最近**的 ----
    // LoL 的 attack-move 打離**游標**最近的那一個,⛔ 不是離角色最近、⛔ 也不是
    // 英雄優先。共用排序(英雄→召喚→小怪)是替**自動索敵**寫的:玩家沒指到任何
    // 地方,只好用「誰比較重要」代替「他想打誰」——A 有指令點,代替品就不需要了。
    // ⚠️ 只換**比較鍵**,半徑仍然量身體(見 `targeting.ts::acquireTarget` 的
    // `rankFrom`)。⚠️ `order` 是這一 tick 套用完的指令,所以「A 點在哪」永遠是
    // 最新那一次 —— ⛔ 不需要第二個住處記游標。
    const cursor =
      mo.attackMoveNearestToCursor && order?.kind === "attackMove" ? order.point : undefined;
    // ⭐ spec §8（GH#863）：**只有 v4 的 idle 自動清怪**帶 pveOnly。
    // ⛔ 其餘每一條路（bot、attackMove、被打反擊、v3 的 idle 索敵）逐位元不變 ——
    //   v3 的 `autoFarm.pveOnly` 是 false 而且帶著 waiver（出貨行為刻意保留）。
    const best = acquireTarget(
      world,
      id,
      radius,
      cursor,
      idleEngaged && world.controllerScheme.autoFarm.pveOnly,
    );

    // ---- keep, swap, or drop the held AUTO target ----
    if (nav.attackTarget !== null && nav.attackTargetAuto) {
      const held = rankOf(world, id, nav.attackTarget);
      // ⭐ 牽繩也是一格設定（`autoEngage.acquireLeash`）。⚠️ 缺席 ⇒ 原本的 2。
      //   ⛔ 玩家自己下的指令**永遠不受牽繩限制** —— 這一格只管自動索敵。
      const leash = radius + (world.combatFeel.autoEngage?.acquireLeash ?? ACQUIRE_LEASH);
      if (held && held.d2 <= leash * leash) {
        // Still legal and inside the leash. Only a CATEGORICALLY better target
        // (an enemy champion over a mob, or the enemy that just started hitting
        // me) takes it away — re-ranking on hp/distance every tick would swap
        // mid-approach and cancel the wind-up over and over.
        if (best && shouldSwapAutoTarget(world, held, best)) nav.attackTarget = best.id;
        // ⚠️ GH#216 —— 這裡也要上鎖,而且這是**量出來**才發現的。
        // 只在「索到新目標」那條路徑上鎖是不夠的:近戰的索敵半徑是 6、射程 1.6,
        // 所以一個站在牆邊的近戰在**第一 tick**(還沒卡滿 30 tick)就已經握著
        // 4.6 單位外的目標了,之後每一 tick 都走這條 `continue`,永遠到不了下面
        // 那個 `add`。結果是追擊一接手身體就動、動了就不算卡住、不算卡住就放手、
        // 放手就撞回牆上 —— 全角色矩陣量到的正是 83/83 位近戰的 `approach` 情境
        // 命中 0,而 36 位遠程(索敵半徑 = 射程,目標在半徑外才被索到)全都好的。
        if (engaging) world.autoEngaging.add(id);
        continue;
      }
      nav.attackTarget = null;
      nav.attackTargetAuto = false;
    }

    if (nav.attackTarget !== null) continue; // an explicit target we must not touch
    if (!best) {
      // 沒有可打的東西 = 沒有在接敵。鎖當場放掉,方向盤回到玩家手上 ——
      // 而且要把**玩家原本的目的地**放回 `moveTarget`。追擊在接敵期間可能把它
      // 設成 null(進入射程就停下來打),那個 null 屬於追擊,不屬於這條走位。
      if (world.autoEngaging.delete(id) && order?.kind === "move" && order.point) {
        nav.moveTarget = { x: order.point.x, z: order.point.z };
      }
      continue;
    }
    nav.attackTarget = best.id;
    nav.attackTargetAuto = true;
    // 只有「卡住時索到的目標」才上鎖。走得動的走位順手索到的目標**不上鎖**,
    // 所以 #274 的走位權在那條路徑上一個 tick 都沒有被動到。
    if (engaging) world.autoEngaging.add(id);
  }
}
