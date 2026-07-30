/**
 * OrderSystem — translates each seat's continuous `order` into concrete
 * navigation state (moveTarget / attackTarget). Runs before MovementSystem.
 * Deterministic: seats are applied in ascending seat id order.
 */
import type { EntityId, SeatId } from "../../ids";
import type { IntentFrame } from "../intents";
import type { SimWorld } from "../SimWorld";
import { distSq, lenSq } from "../math/vec2";
import { DEFAULT_AUTO_ENGAGE, type AutoEngageRules } from "../combatFeel";
import { bodyHeldByRules } from "../movementHold";
import { berserkDropsOrders, berserkSeek, isBerserk } from "../berserk";
import { reachTo } from "./BasicAttackSystem";
import {
  ACQUIRE_LEASH,
  acquireRadius,
  acquireTarget,
  isManuallyTargetable,
  rankOf,
  shouldSwapAutoTarget,
} from "../targeting";

/** Distance at which a move order counts as arrived. */
const ARRIVE_EPS = 0.05;

/**
 * Fraction of the effective attack reach a chase closes to before stopping.
 * The 10% gap is HYSTERESIS: the unit halts strictly INSIDE its own reach, so
 * separation jitter, a shuffling target or the acceleration ramp can nudge it
 * without immediately dropping it out of range and restarting the chase.
 */
const HOLD_FRACTION = 0.9;

/**
 * 卡住就接敵的規則表 (GH#216)。缺格 → 出貨預設,**不是**空表 —— 空表的
 * `stallTicks` 是 undefined,`>=` 比較永遠 false,規則就靜默消失了
 * (`facingTicks` / `statCaps` 學到的同一課)。
 */
export function autoEngageRules(world: SimWorld): AutoEngageRules {
  return world.combatFeel.autoEngage ?? DEFAULT_AUTO_ENGAGE;
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
  const nav = world.nav.get(id);
  const t = world.transform.get(id);
  if (!rules.enabled || !nav || !t || nav.order?.kind !== "move" || nav.moveTarget === null) {
    world.walkStall.delete(id);
    return;
  }
  // 已經站在終點上 = 走完了,不是卡住。這一步是必要的:這個 pass 跑在
  // 「清掉抵達的走位」之前,所以一個已經到站、而客戶端每 tick 又重送同一條指令
  // 的單位,在這裡看起來和撞牆的單位一模一樣(有指令、有終點、速度 0)。少了
  // 這一行,站在自己指定的定點上一秒之後就會被判定成卡住而自動衝出去。
  if (distSq(t.pos, nav.moveTarget) <= ARRIVE_EPS * ARRIVE_EPS) {
    world.walkStall.delete(id);
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
  if (rules.ccPausesStall && bodyHeldByRules(world, id)) return;
  if (lenSq(t.vel) >= rules.stallSpeed * rules.stallSpeed) {
    world.walkStall.set(id, 0);
    return;
  }
  world.walkStall.set(id, (world.walkStall.get(id) ?? 0) + 1);
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
      if (berserkDropsOrders(world, id)) break; // one entity per seat
      const order = frame.order;
      if (!order) continue;
      nav.order = order;
      switch (order.kind) {
        case "move":
        case "attackMove":
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
          if (!nav.attackTargetAuto) nav.attackTarget = null;
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
          break;
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
  autoAcquirePass(world, ae);

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
    const stop = reach * HOLD_FRACTION;
    if (distSq(self.pos, tgt.pos) > stop * stop) {
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
function autoAcquirePass(world: SimWorld, ae: AutoEngageRules): void {
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
    const engaging = autoEngageActive(world, id, ae);
    const nearRadius = acquireRadius(sc, t.radius);
    const radius = holdPosition
      ? reachTo(sc, t.radius, 0) * HOLD_FRACTION
      : engaging && ae.seekRadius > nearRadius
        ? ae.seekRadius
        : nearRadius;

    const best = acquireTarget(world, id, radius);

    // ---- keep, swap, or drop the held AUTO target ----
    if (nav.attackTarget !== null && nav.attackTargetAuto) {
      const held = rankOf(world, id, nav.attackTarget);
      const leash = radius + ACQUIRE_LEASH;
      if (held && held.d2 <= leash * leash) {
        // Still legal and inside the leash. Only a CATEGORICALLY better target
        // (an enemy champion over a mob, or the enemy that just started hitting
        // me) takes it away — re-ranking on hp/distance every tick would swap
        // mid-approach and cancel the wind-up over and over.
        if (best && shouldSwapAutoTarget(held, best)) nav.attackTarget = best.id;
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
