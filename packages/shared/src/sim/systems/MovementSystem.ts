/**
 * MovementSystem — integrates navigation into positions with collision:
 *   1. dash/knockback overrides win over normal movement,
 *   2. normal movement steers toward moveTarget at move speed (respecting
 *      root/stun and slow multipliers), with SMOOTH TURNING (facing rotates
 *      toward the move/attack direction by a bounded nlerp step instead of
 *      snapping), a short ACCELERATION RAMP (full speed over ~ACCEL_TICKS) and
 *      OBSTACLE AVOIDANCE (a pillar on the straight line to the destination is
 *      rounded on a tangent — see collision/avoid.ts — because collision alone
 *      can push a body out of a wall but never past one),
 *   3. wall push-out + slide + boundary clamp (per zone),
 *   4. unit-vs-unit soft separation (pairs within the same zone, ascending id).
 * Deterministic: entities iterate in id order; separation pairs are ordered;
 * turning uses vector nlerp only (NO trig — see math/vec2.ts).
 *
 * Design note (LoL-style): movement DIRECTION is the ordered direction
 * immediately — units go where told while the body visually turns (the one
 * exception is the obstacle-avoidance deflection above, which is a hard
 * geometric necessity, not a smoothing). Facing is cosmetic/aiming state, so
 * decoupling it from the velocity keeps controls responsive and needs no speed
 * clamp while turning.
 */
import type { SimWorld } from "../SimWorld";
import type { Vec2 } from "../math/vec2";
import { sub, len, scale, normalize, addScaled, dot, cross, perp, lenSq } from "../math/vec2";
import { moveWithCollision, separatePair, clampToBoundary, pushOutOfObstacle } from "../collision/resolve";
import { flightIgnoresObstacles, flightIgnoresUnits, flightStaysInBoundary } from "../flight";
import { steerAroundObstacles } from "../collision/avoid";
import { walkWaypoint, navRules } from "../navRoute";
import { activeObstacles, heldGates } from "../map/gates";
import { Stat } from "../stats/statTypes";
import { facingLockDir } from "../facingLock";
import {
  hitstopHoldsBody,
  stuckGuardTick,
  movementHoldWithStuckRelease,
} from "../combat/hitstopHold";
import { mobProfile } from "../mobs";
import { isCarried } from "../carry";
// 走過去放技能 (`config.cast-approach@1`)。⛔ 單向邊:`abilities/abilitySystem.ts`
// 不 import 這個檔,所以不會成環。
import { castApproachSystem } from "../abilities/abilitySystem";

/** Fallback move speed (units/sec) for entities without a stats component. */
const BASE_MOVE_SPEED = 6;

/**
 * Per-tick turn factor for facing nlerp (0..1). ~0.35 converges from a 90°
 * turn in ~6 ticks (200ms @30Hz) and bounds the per-tick rotation to ~28°.
 */
export const TURN_FACTOR = 0.35;

/** Facing snaps instead of lerping when already this closely aligned. */
const TURN_SNAP_DOT = 0.9995;

/** Ticks to reach full move speed from standstill (start/stop jerk removal). */
export const ACCEL_TICKS = 3;

/**
 * Rotate `facing` toward unit direction `desired` by one bounded nlerp step:
 * facing' = normalize(lerp(facing, goal, k)). When the two are nearly opposite
 * (dot < -0.95) the lerp degenerates (sum ~ 0), so the goal is replaced by the
 * perpendicular on the turn side (sign of cross; counter-clockwise on exact
 * 180°) — the unit pivots through 90° deterministically. NO trig.
 */
export function turnToward(facing: Vec2, desired: Vec2, k: number = TURN_FACTOR): Vec2 {
  if (lenSq(desired) < 1e-12) return facing;
  if (lenSq(facing) < 1e-12) return desired; // degenerate current facing
  const d = dot(facing, desired);
  if (d >= TURN_SNAP_DOT) return desired; // aligned: settle exactly
  let goal = desired;
  if (d < -0.95) {
    const p = perp(facing);
    goal = cross(facing, desired) >= 0 ? p : scale(p, -1);
  }
  const out = normalize({
    x: facing.x + (goal.x - facing.x) * k,
    z: facing.z + (goal.z - facing.z) * k,
  });
  return out.x === 0 && out.z === 0 ? desired : out;
}

export function movementSystem(world: SimWorld): void {
  const dt = world.dt;

  for (const [id, t] of world.transform) {
    if (world.projectile.has(id)) continue; // projectiles integrate in their own system
    const nav = world.nav.get(id);
    if (!nav) continue;
    const hp = world.health.get(id);
    if (hp && !hp.alive) {
      t.vel = { x: 0, z: 0 };
      continue;
    }

    // Combat-juice HITSTOP: freeze the body for the freeze window — including any
    // dash/knockback override, so the on-impact "hold" reads before the knockback
    // slide plays out. Deterministic (see SimWorld.hitstop docs).
    //
    // ⭐ 2026-08-23 —— 「**被普攻的時候好像會被角色黏住走不了**」(owner)。
    //    這一行在此之前是無條件的，而它正是那個症狀：一發普攻凍 2–8 tick、
    //    每一發傷害重新上值 ⇒ 被一群人貼身時**近四成的 tick 方向盤被拔掉**，
    //    而且身上一筆狀態都沒有、快照裡也沒有位元 ⇒ 客戶端影子照走、每 50 ms
    //    被 `reconcile` 拉回來一次。量到的數字、保留下來的那一半、以及那一格
    //    後台開關全部在 `combat/hitstopHold.ts` 的檔頭。
    // ⭐ I1 黏住累積保險絲（owner 2026-08-23:「黏超過 2秒一定可以離開」）——
    //    記帳**必須在** hitstop 的 continue 之前:被按住的 tick 正是要數的那些,
    //    放在後面的話保險絲只數得到自由的 tick,永遠不會跳。語意、界線與後台
    //    四格全部在 `combat/hitstopHold.ts` 的 `StuckGuardRules`。
    stuckGuardTick(world, id, nav.moveTarget !== null);

    if (hitstopHoldsBody(world, id)) {
      t.vel = { x: 0, z: 0 };
      continue;
    }

    // 面向鎖 (task #264)：這個單位剛剛「出手」(施法/揮劍) 所 commit 的瞄準方向。
    // 有鎖的期間，下面兩個原本無條件寫 facing 的地方都必須讓位 —— 這正是本系統
    // 過去把施法轉身吃掉的地方（搖桿每幀都合成 move 訂單，所以走位中施法的轉身
    // 存活 0 tick）。讀在這裡而不是用到的那兩行旁邊，是為了讓過期項目對每一個
    // 可導航單位都被回收一次（facingLockDir 讀到過期就刪）。
    // ⚠️ 永遠呼叫 facingLockDir,即使結果要丟掉 —— 它同時負責回收過期項目。
    // 用一個 `if` 把它跳過的話,`world.facingLock` 會在一場比賽裡單調長大。
    const lockDir = facingLockDir(world, id);
    // 面向的擁有權,由高到低 (owner 2026-07-28:「面向是瞄準優先」):
    //
    //   1. `aimedThisTick` —— 玩家這一 tick 真的在瞄。`orderSystem`(slot 4)
    //      已經把方向寫進 `t.facing` 了,所以這裡要做的是**完全不要碰它**。
    //   2. `lockDir` —— 出手 commit 的方向 (#264)。沒有瞄準輸入時照舊生效,
    //      「揮劍會轉向目標」仍然成立。
    //   3. 預設 —— 移動方向 / 攻擊目標方向。
    //
    // ⚠️ 為什麼是三段而不是兩段。第一版寫成 `aimLock = aimed ? null : lockDir`
    // 再 `if (aimLock) … else 轉向移動方向`,於是「玩家在瞄」會掉進 else,
    // **被移動方向蓋掉** —— 瞄準優先只在站著不動時成立,一邊走一邊瞄反而更糟。
    // 我自己的測試沒抓到,因為那條測試的瞄準方向和移動方向是同一個方向,
    // 兩種實作給出一樣的答案(失敗形狀 ④:斷言方向與缺陷無關)。
    const aimedThisTick = world.aimTick.get(id) === world.tick;

    // Status: root/stun stop movement; slows scale speed; stun also freezes
    // turning (rooted units may still rotate in place, LoL-style).
    //
    // ⚠️ GH#216 —— 這一段**搬到 `sim/movementHold.ts`** 了,不是為了好看。
    // 接敵規則(`systems/OrderSystem.ts` 的 `updateWalkStall`)必須問一模一樣的
    // 問題:「這個單位走不動,是被硬控按住的,還是撞到幾何?」。抄一份過去的話
    // 兩份會漂走,而漂走的那天不會有任何測試紅 —— 只有被定身的玩家會發現解控
    // 之後角色往反方向跑。所以兩邊讀的是同一個函式。
    // ⭐ 保險絲的釋放窗內,**擊倒的 root 部分**被遮掉(stun/root/施法鎖照舊 ——
    //    硬控是設計);其餘時刻與 `movementHold` 逐位元相同。
    const { speedMult, rooted, stunned } = movementHoldWithStuckRelease(world, id);

    const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;

    // 0) AIRBORNE (task #247): a leap is integrated by LeapSystem, which ran
    //    immediately before this system and already wrote t.pos/t.vel/t.facing
    //    absolutely from its arc. Touching the body here would (a) run
    //    moveWithCollision, the one call that must NOT happen because it is
    //    exactly what stops a body at a wall, and (b) overwrite the parametric
    //    position. So: leave it alone, and leave the velocity LeapSystem set
    //    (it is the real per-tick displacement, which the animation layer reads).
    if (nav.override?.kind === "leap") continue;

    // 0′) 背負 ([EX∅ 根源], sim/carry.ts): 箱子裡的身體不是自走的 —— 它的座標由
    //    `CarrySystem`(5a) 從載具重建，就在這個系統跑完之後的同一 tick。同一個
    //    形狀的先例就在上一行（airborne）：position is not its own。
    //    ⚠️ 速度**要**歸零而不是只 continue：`t.vel` 是動畫層唯一的讀數，留著上一
    //    tick 的殘值會讓被收進箱子的人在畫面上維持跑步姿勢滑過整個場地。
    //    ⚠️ 位置寫在這裡而不是只靠 5a 覆蓋：分離 pass（下面）在**同一 tick**就會
    //    讀 `t.pos`，而一個仍在自己走的乘客會在被複製回箱子之前先把載具推開。
    if (isCarried(world, id)) {
      t.vel = { x: 0, z: 0 };
      continue;
    }

    // 1) Movement override (dash/knockback) — ignores root by design (dashes
    //    committed before CC still complete; knockbacks are forced).
    if (nav.override) {
      const ov = nav.override;
      const stepLen = Math.min(ov.speed * dt, ov.remaining);
      const delta = scale(ov.dir, stepLen);
      const before = { x: t.pos.x, z: t.pos.z };
      const body = { pos: t.pos, radius: t.radius };
      moveWithCollision(body, delta, zone);
      t.pos = body.pos;
      ov.remaining -= stepLen;
      const moved = len(sub(t.pos, before));
      // Dash stopped early by a wall → end the dash.
      if (moved + 1e-6 < stepLen || ov.remaining <= 1e-6) nav.override = null;
      // Velocity is what the body ACTUALLY did (see the note in step 2).
      t.vel = scale(sub(t.pos, before), 1 / dt);
      continue;
    }

    // 2) Normal steering toward moveTarget.
    let moved = false;
    if (nav.moveTarget && !rooted) {
      // ⭐ GH#324 —— **繞牆走**。`steerAroundObstacles` 是無狀態的單切線啟發式，
      // 而且它明確跳過線段：垂直撞牆時切向分量為 0，單位會**原地卡死**
      // （`OrderSystem.updateWalkStall` 的註解記錄的實測是 2,240 tick）。
      //
      // 修法不是把避讓寫得更聰明，是**換掉它的目標**：從「最終目的地」換成
      // 「下一個路徑點」。路徑是產生器離線烘焙好的 next-hop 表，runtime 只查表 ——
      // 零搜尋、零三角函式、零 Map 迭代序問題（三個約束缺一不可）。
      //
      // ⚠️ `walkWaypoint` 回 null 有兩種意思（不需要繞路 / 到不了），兩種的處置
      // 一樣：直接朝最終目的地走，也就是**既有行為**。沒有導航表的 6 張手寫場地
      // 因此一個字都不用改。
      //
      // ⭐ 2026-08-23 —— 查表的**對象換了**（`sim/navRoute.ts`）。烘焙出來的
      // `nextHop` 有 24–36 % 指向一堵牆的另一邊（量到的，見那支檔頭），而這 6 張
      // graybox 的障礙物全部是 `box`，`steerAroundObstacles` **只認圓形** ⇒ 切向
      // 分量 0 ⇒ 原地卡死。修正表用**真實碰撞幾何＋身體半徑**重算鄰接，
      // 每一跳都保證走得過去。
      const zoneForNav = world.arena.zones[t.zone] ?? world.arena.zones[0];
      // ⭐ GH#324 —— 這一 tick 真的擋路的障礙物（開著的門不擋人）。
      // ⚠️ 沒有 gateSchedule 時 `activeObstacles` 原樣回傳 ⇒ 既有場地零成本。
      const liveObstacles =
        zoneForNav === undefined
          ? []
          : activeObstacles(
              zoneForNav.obstacles,
              world.gateSchedule,
              world.tick,
              // ⭐ 玩家站著撐開／壓住的門。⚠️ 位置**按 entity id 排序**取出來 ——
              //    Map 的插入序在 sim 裡是禁止的（purity 閘）。
              zoneForNav.gateHolds === undefined
                ? undefined
                : heldGates(
                    zoneForNav.gateHolds,
                    [...world.transform.keys()]
                      .sort((a, b) => a - b)
                      .filter((eid) => world.transform.get(eid)?.zone === t.zone)
                      .map((eid) => world.transform.get(eid)!.pos),
                  ),
            );
      // ⭐ 飛行：**不查導航表**（`navRoute.ts` 的 `flyersGoStraight`）。
      //    飛行的定義就是「穿過牆與柱子」，而導航表存在的唯一理由是繞開它們 ——
      //    讓她照著地面路線繞路是兩個機制互相矛盾，而且那條繞路是**客戶端預測
      //    算不出來的**（owner 2026-08-23:「後端計算與前端預測方法不同」）。
      //    ⚠️ 讀一次存起來：下面挑 `dir` 的那一行也要問同一個問題，
      //    ⛔ 兩次呼叫是兩份會漂走的答案。
      const flies = flightIgnoresObstacles(world, id);
      const waypoint =
        zoneForNav === undefined || (flies && navRules().flyersGoStraight)
          ? null
          : walkWaypoint({
              zone: zoneForNav,
              from: t.pos,
              to: nav.moveTarget,
              radius: t.radius,
              liveObstacles,
            });
      const to = sub(waypoint ?? nav.moveTarget, t.pos);
      const d = len(to);
      if (d > 1e-6) {
        moved = true;
        // A mob has NO StatsComp (deliberate, see components.ts MobComp), so it
        // used to fall straight through to BASE_MOVE_SPEED — a GENERAL fallback
        // that happens to be 6, i.e. TWICE the 3.0 `ms` of 喪標麥可, the very
        // champion it is a copy of. Since #215 the mob card owns its own speed
        // (owner 2026-07-27: 「移動速度也會減半」), read from `world.mobRules`
        // rather than a new MobComp field so the digest is untouched.
        // #262: read the speed for THIS mob's KIND (一般 / 特殊 / 殭屍王), not
        // the wave's — a king that walked at zombie speed would be a zombie with
        // more hp. `mobProfile` is the one place any system resolves it.
        const mobComp = world.mob.get(id);
        const mobSpeed =
          mobComp && world.mobRules !== null
            ? mobProfile(world.mobRules, mobComp.kind).moveSpeed
            : BASE_MOVE_SPEED;
        const baseSpeed =
          world.stats.get(id)?.final[Stat.MoveSpeed] ||
          (world.mob.has(id) ? mobSpeed : BASE_MOVE_SPEED);
        // acceleration ramp: full speed reached over ACCEL_TICKS ticks
        const ramp = Math.min(1, (t.accel ?? 0) + 1 / ACCEL_TICKS);
        t.accel = ramp;
        const speed = baseSpeed * speedMult * ramp;
        const stepLen = Math.min(speed * dt, d);
        // Steer AROUND a pillar standing in the way. Collision alone can only
        // push a body out of a wall, never past one, so a unit whose target sits
        // straight behind an obstacle used to cancel its whole step every tick
        // and freeze on the spot (the zone-centre pillar sits exactly between
        // the two middle spawns). Re-evaluated every tick, stateless.
        //
        // ⭐ A FOURTH EXEMPTION (#247), and it is the one the other three do not
        // cover. `moveWithCollision` below is what STOPS a body at a wall, and a
        // flyer already skips it — but avoidance runs BEFORE that and bends the
        // step around the pillar anyway, so a 「無視碰撞」 body still walked a
        // detour it had no reason to walk. Measured, not assumed: the 殭屍王's
        // closest approach to the zone-0 pillar was 3.645 with the grant on,
        // i.e. exactly the two radii — it never touched the thing it is supposed
        // to walk through (sim/mobBossNoClip.test.ts pins the number).
        // Avoidance is also the only obstacle path that can oscillate, which is
        // the other half of owner's 「被卡住永遠走不到」.
        const dir = flies
          ? { x: to.x / d, z: to.z / d }
          : steerAroundObstacles(t.pos, t.radius, { x: to.x / d, z: to.z / d }, d, zone.obstacles);
        // body turns toward the move direction; motion is the ordered direction.
        // 面向鎖優先 (task #264)：出手的那幾 tick，身體朝著瞄準方向，腳照走 ——
        // 走位與朝向解耦本來就是這個系統的設計（見檔頭 Design note），這裡只是把
        // 「誰決定朝向」從「永遠是移動方向」改成「出手時是瞄準方向」。
        // 1) 玩家正在瞄 → orderSystem 已經寫好了,一個字都不要動
        // 2) 出手鎖 → 朝著 commit 的方向,腳照走
        // 3) 其餘 → 朝著移動方向
        if (!aimedThisTick) {
          if (lockDir) t.facing = { x: lockDir.x, z: lockDir.z };
          else t.facing = turnToward(t.facing, dir);
        }
        const before = { x: t.pos.x, z: t.pos.z };
        const body = { pos: t.pos, radius: t.radius };
        // 飛行 (04-00 翔封界): `moveWithCollision` is the ONE call that stops a
        // body at a wall, so a flyer steps straight through instead. The
        // boundary is NOT skipped here — the post-separation sweep below still
        // clamps her to the arena disc — so this cannot walk anybody off the map.
        if (flies) {
          body.pos = { x: body.pos.x + dir.x * stepLen, z: body.pos.z + dir.z * stepLen };
          // ⚠️ THE BOUNDARY IS CLAMPED **HERE**, NOT ONLY IN THE POST PASS.
          // `t.vel` two lines below is derived from this step's real
          // displacement, and this file's own rule is that velocity must be
          // what the body ACTUALLY did (「a blocked unit must not report 5.8 u/s
          // while standing still, or the animation layer — and any future
          // stuck-detection — is lied to」). Clamping only later left a flyer
          // pressed against the arena edge reporting full speed forever, which
          // made `walkStall` never fire and silently removed 自動接敵 (#221)
          // from the only champion who can fly. Measured: 莉娜因巴斯 scored 0
          // auto-attacks in `autoAttackWhileMovingCensus`'s stalled-walk row.
          if (flightStaysInBoundary(world, id)) clampToBoundary(body, zone);
        } else {
          moveWithCollision(body, scale(dir, stepLen), zone, liveObstacles);
        }
        t.pos = body.pos;
        // Velocity is the ACTUAL post-collision displacement, never the intent:
        // a blocked unit must not report 5.8 u/s while standing still, or the
        // animation layer (and any future stuck-detection) is lied to.
        t.vel = scale(sub(t.pos, before), 1 / dt);
      }
    }
    if (!moved) {
      t.vel = { x: 0, z: 0 };
      t.accel = 0;
      // standing still (e.g. attacking in range): keep turning toward the
      // attack target so autos/aim read correctly; stun freezes rotation too.
      //
      // 面向鎖優先 (task #264)：技能瞄的點不一定是 `attackTarget`（對著 A 平砍、
      // 把 AoE 丟去 B 是常態），整段吟唱都被這裡慢慢轉回 A 就是 owner 說的
      // 「面向方向是錯誤的」。出手期間瞄準方向說了算。
      if (aimedThisTick) {
        // 玩家正在瞄:orderSystem 寫的就是答案,連攻擊目標都不得把它轉回去。
      } else if (lockDir) t.facing = { x: lockDir.x, z: lockDir.z };
      else if (!stunned && nav.attackTarget !== null) {
        const tgt = world.transform.get(nav.attackTarget);
        if (tgt && tgt.zone === t.zone) {
          const toTgt = sub(tgt.pos, t.pos);
          if (lenSq(toTgt) > 1e-12) t.facing = turnToward(t.facing, normalize(toTgt));
        }
      }
    }
  }

  // 4) Unit-vs-unit soft separation within each zone (ascending id pairs via
  //    the spatial grid; grid returns sorted ids).
  for (const [id, t] of world.transform) {
    if (world.projectile.has(id)) continue;
    // revive circles are ground area, not bodies — they never push and are
    // never pushed (they are also absent from the grid, so the inner loop
    // can never see one either)
    if (world.reviveCircle.has(id)) continue;
    // dropped coins (task #191) are loot on the floor: never push, never pushed
    // — and, being out of the grid, never visible to the inner loop either
    if (world.coin.has(id)) continue;
    // AURA CARRIERS (虛擬蝗蟲群) are a position, not a body. Being out of the
    // grid already hides them from the INNER loop, but the outer loop walks
    // `world.transform` directly — and a carrier is created MID-COMBAT, so mobs
    // spawned after it have HIGHER ids and would sail past the `otherId <= id`
    // gate and get shoved by an invisible thing. Guarded on both sides, exactly
    // like the coin/circle pair above.
    if (world.auraCarrier.has(id)) continue;
    // AIRBORNE (task #247): a leaping body is out of the planar physics world —
    // it must neither shove someone standing underneath it nor be shoved off
    // its arc. Same shape as the coin/revive-circle exemptions above, and
    // guarded on BOTH loops so the pair is skipped from either side.
    if (isAirborneNav(world, id)) continue;
    // 飛行 (04-00 翔封界, sim/flight.ts): a flyer neither shoves nor is shoved.
    // Guarded on BOTH loops, exactly like the airborne pair above — the outer
    // loop walks `world.transform` directly, so a one-sided guard would still
    // let a HIGHER-id body push the flyer.
    if (flightIgnoresUnits(world, id)) continue;
    // 背負: 箱子裡的身體既不推人也不被推 —— 它與載具**逐位元同座標**，所以不豁免
    // 的話 `separatePair` 每 tick 都會把載具從自己的乘客身上推開一步，而那一步是
    // 寫在載具身上的（乘客下一行就被複製回來，載具不會）：畫面上是一個抱著箱子
    // 的人自己往旁邊漂。⚠️ 兩個迴圈都要，與上面 airborne / 飛行那兩對同一個理由：
    // 外圈直接走 `world.transform`，單邊的閘擋不住 id 較大的那一側。
    if (isCarried(world, id)) continue;
    const hp = world.health.get(id);
    if (hp && !hp.alive) continue;
    const near = world.grid.queryCircle(t.pos, t.radius + 2);
    for (const otherId of near) {
      if (otherId <= id) continue; // each pair once, ordered
      if (world.projectile.has(otherId)) continue;
      if (isAirborneNav(world, otherId)) continue;
      if (flightIgnoresUnits(world, otherId)) continue;
      if (isCarried(world, otherId)) continue;
      const o = world.transform.get(otherId);
      if (!o || o.zone !== t.zone) continue;
      const oHp = world.health.get(otherId);
      if (oHp && !oHp.alive) continue;
      // STATIC props (flowers + neutral guardians, task #89): units are pushed
      // out of them like a soft pillar but the prop itself never moves. A
      // guardian is authoritative terrain placed at the zone centre by
      // GuardianSystem — it must stay put even when a champion body overlaps it.
      const aStatic = world.flower.has(id) || world.structure.has(id);
      const bStatic = world.flower.has(otherId) || world.structure.has(otherId);
      if (aStatic && bStatic) continue;
      if (aStatic || bStatic) {
        const anchor = aStatic ? t : o;
        const mover = aStatic ? { pos: o.pos, radius: o.radius } : { pos: t.pos, radius: t.radius };
        pushOutOfObstacle(mover, { kind: "circle", center: anchor.pos, radius: anchor.radius });
        if (aStatic) o.pos = mover.pos;
        else t.pos = mover.pos;
        continue;
      }
      const a = { pos: t.pos, radius: t.radius };
      const b = { pos: o.pos, radius: o.radius };
      separatePair(a, b, 0.6);
      t.pos = a.pos;
      o.pos = b.pos;
    }
  }

  // Post-separation: never leave anyone inside a wall or outside the boundary.
  for (const [id, t] of world.transform) {
    if (world.projectile.has(id)) continue;
    if (world.reviveCircle.has(id)) continue; // stays exactly on the corpse
    // A coin was already pushed out of obstacles + clamped at spawn (coinDropPos);
    // re-clamping it every tick would only re-derive the same point.
    if (world.coin.has(id)) continue;
    // An aura carrier's position is not its own: `auraCarrierSystem` copies it
    // from the host at the top of the NEXT tick, so pushing it out of a pillar
    // here would be undone before anything read it — and until then it would be
    // an aura centred somewhere its champion is not.
    if (world.auraCarrier.has(id)) continue;
    // Neutral guardians (task #89) are authoritative fixed terrain: never shove
    // them out of an obstacle or clamp them — GuardianSystem places one at the
    // zone CENTRE, which legitimately coincides with the centre pillar, and a
    // push-out would eject it ~one body-width off its post every combat tick.
    if (world.structure.has(id)) continue;
    // AIRBORNE (task #247): never push a body in flight out of an obstacle or
    // clamp it — a leap OVER a pillar that got pushed out every tick would be
    // teleported sideways at apex. The landing tick is not airborne any more,
    // so it DOES run this pass — and it is a no-op there, because the landing
    // point was relaxed at takeoff and `leapPosAt(N,N)` returns it verbatim.
    // No mid-flight boundary clamp is needed either: the boundary is a DISC,
    // a disc is convex, so the straight segment between two interior points is
    // wholly interior by construction.
    if (isAirborneNav(world, id)) continue;
    // 背負: 乘客的位置不是他自己的（同上面 aura carrier 那一段的理由，逐字）——
    // `CarrySystem` 在這個系統跑完後就把它寫成載具的座標，所以在這裡把他推出柱子
    // 只會在有人讀到之前被覆蓋掉；而載具自己**有**跑這一趟，所以箱子已經是合法的。
    if (isCarried(world, id)) continue;
    const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;
    const body = { pos: t.pos, radius: t.radius };
    // 飛行: the two halves of this sweep are asked SEPARATELY, because they are
    // separate decisions (sim/flight.ts). A flyer skips the pillar push-out —
    // that is what 「無視碰撞」 buys — but is STILL clamped to the arena disc
    // unless a grant explicitly opts out, which is the answer to 「會不會飛出
    // 場外」. Leaving the arena breaks every zone-scoped mechanic there is.
    if (!flightIgnoresObstacles(world, id)) {
      for (const ob of zone.obstacles) pushOutOfObstacle(body, ob);
    }
    if (flightStaysInBoundary(world, id)) clampToBoundary(body, zone);
    t.pos = body.pos;
  }

  // ⭐ 走過去放技能 (`config.cast-approach@1`, owner 2026-08-22:「超過施法距離
  //    人物不會走過去放技能（做成後台開關）」)。
  //
  //    ⚠️ 位置是硬約束,而且**必須是這裡**:身體這一 tick 的最終座標(推出牆、
  //    分離、邊界夾)剛剛才寫完。往前搬一格,「到射程了沒」問的就是上一 tick 的
  //    位置 —— 每一次接近都晚一個 tick 施放,而畫面上完全看不出來。
  //
  //    ⛔ 它刻意**不是** `SimWorld.step` 的一個新槽位:接近的每一步都是移動,
  //    而「走到了就放」是那一步的**終止條件**;拆成兩個槽位就多一個會漂走的
  //    順序約束。沒有待辦接近時是嚴格 early return(客戶端的預測影子永遠走它),
  //    所以每一份既有錄影逐位元不變。
  castApproachSystem(world);
}

/**
 * Is this body mid-LEAP (task #247)? Local so MovementSystem stays free of any
 * import from movement/leap.ts — the predicate is one field read.
 */
function isAirborneNav(world: SimWorld, id: import("../../ids").EntityId): boolean {
  return world.nav.get(id)?.override?.kind === "leap";
}

/**
 * Helper for abilities: begin a dash override on an entity.
 *
 * ⚠️ `authored: true` — every caller of this is an ability (`effects/dash.ts`,
 * i.e. `castType: "dash"`), so a dash is an AUTHORED displacement and gets the
 * same protection an authored 擊退 does: incoming damage does not silently
 * cancel it mid-flight while `combatFeel.knockback.authoredWins` is on. The
 * whiff over-commit lunge in BasicAttackSystem deliberately does NOT come
 * through here — it is cosmetic, and it should yield to a real hit.
 */
export function startDash(
  world: SimWorld,
  id: import("../../ids").EntityId,
  dir: { x: number; z: number },
  speed: number,
  distance: number,
): void {
  const nav = world.nav.get(id);
  if (!nav) return;
  const d = normalize(dir);
  if (d.x === 0 && d.z === 0) return;
  nav.override = { kind: "dash", dir: d, speed, remaining: distance, authored: true };
}

/** Predictive helper used by aiming: where will a target be after `secs`? */
export function extrapolate(pos: { x: number; z: number }, vel: { x: number; z: number }, secs: number): { x: number; z: number } {
  return addScaled(pos, vel, secs);
}

/** Whether `vel` is moving toward `point` (used by AI kiting later). */
export function movingToward(pos: { x: number; z: number }, vel: { x: number; z: number }, point: { x: number; z: number }): boolean {
  return dot(vel, sub(point, pos)) > 0;
}
