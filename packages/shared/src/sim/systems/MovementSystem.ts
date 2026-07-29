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
import { steerAroundObstacles } from "../collision/avoid";
import { Stat } from "../stats/statTypes";
import { facingLockDir } from "../facingLock";
import { mobProfile } from "../mobs";

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

    // Combat-juice HITSTOP: freeze the whole body — including any dash/knockback
    // override — for the freeze window, so the on-impact "hold" reads before the
    // knockback slide plays out. Deterministic (see SimWorld.hitstop docs).
    if ((world.hitstop.get(id) ?? 0) > 0) {
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
    // Knockdown (prone): rooted like a hard CC. The knockback override is
    // evaluated below BEFORE normal steering, so the victim still slides out,
    // then lies grounded until the getup. Turning is frozen too (stunned).
    if ((world.knockdown.get(id) ?? 0) > 0) {
      rooted = true;
      stunned = true;
    }

    const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;

    // 0) AIRBORNE (task #247): a leap is integrated by LeapSystem, which ran
    //    immediately before this system and already wrote t.pos/t.vel/t.facing
    //    absolutely from its arc. Touching the body here would (a) run
    //    moveWithCollision, the one call that must NOT happen because it is
    //    exactly what stops a body at a wall, and (b) overwrite the parametric
    //    position. So: leave it alone, and leave the velocity LeapSystem set
    //    (it is the real per-tick displacement, which the animation layer reads).
    if (nav.override?.kind === "leap") continue;

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
      const to = sub(nav.moveTarget, t.pos);
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
        const dir = steerAroundObstacles(
          t.pos,
          t.radius,
          { x: to.x / d, z: to.z / d },
          d,
          zone.obstacles,
        );
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
        moveWithCollision(body, scale(dir, stepLen), zone);
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
    const hp = world.health.get(id);
    if (hp && !hp.alive) continue;
    const near = world.grid.queryCircle(t.pos, t.radius + 2);
    for (const otherId of near) {
      if (otherId <= id) continue; // each pair once, ordered
      if (world.projectile.has(otherId)) continue;
      if (isAirborneNav(world, otherId)) continue;
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
    const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;
    const body = { pos: t.pos, radius: t.radius };
    for (const ob of zone.obstacles) pushOutOfObstacle(body, ob);
    clampToBoundary(body, zone);
    t.pos = body.pos;
  }
}

/**
 * Is this body mid-LEAP (task #247)? Local so MovementSystem stays free of any
 * import from movement/leap.ts — the predicate is one field read.
 */
function isAirborneNav(world: SimWorld, id: import("../../ids").EntityId): boolean {
  return world.nav.get(id)?.override?.kind === "leap";
}

/** Helper for abilities: begin a dash override on an entity. */
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
  nav.override = { kind: "dash", dir: d, speed, remaining: distance };
}

/** Predictive helper used by aiming: where will a target be after `secs`? */
export function extrapolate(pos: { x: number; z: number }, vel: { x: number; z: number }, secs: number): { x: number; z: number } {
  return addScaled(pos, vel, secs);
}

/** Whether `vel` is moving toward `point` (used by AI kiting later). */
export function movingToward(pos: { x: number; z: number }, vel: { x: number; z: number }, point: { x: number; z: number }): boolean {
  return dot(vel, sub(point, pos)) > 0;
}
