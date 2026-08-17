/**
 * CastResolveSystem — ticks down in-progress ability casts (cast time > 0) and
 * fires their effects deterministically when the wind-up elapses. Runs BEFORE
 * commandSystem so a cast begun on tick T resolves exactly round(ct/dt) ticks
 * later, and a cast that finishes this tick clears its root before movement.
 *
 * Interrupt: a stunned or dead caster loses the cast (mana already spent at
 * cast-begin, LoL-style — no refund). No effects fire on an interrupt.
 */
import type { SimWorld } from "../SimWorld";
import { Abilities } from "../content/registry";
import { runEffects } from "../effects/effectRunner";
import { fireHooks } from "../effects/hooks";
import { enemiesInCircle, resolveAbilityRadius } from "../abilities/abilitySystem";
import { applyAugmentToEffects, collectAugmentOps } from "../abilities/abilityAugment";
import { armRecovery } from "../abilities/abilityRecovery";

export function castResolveSystem(world: SimWorld): void {
  for (const [id, ab] of world.abilities) {
    const cast = ab.cast;
    if (!cast) continue;

    const hp = world.health.get(id);
    const st = world.status.get(id);
    const stunned = st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick) ?? false;

    // 被打中斷 (`AbilityDef.interruptOn: "damage"`, 後台/編輯器可調).
    //
    // ABSENT on every shipped ability but 揍敵客阿福 R 龍星群, so this line is a
    // strict no-op for the rest of the roster: `interruptOn` undefined → the
    // whole term is false and only the three pre-existing causes below apply.
    //
    // 「被打」 IS DEFINED AS 「HP 比開始吟唱時低」, and the two consequences are
    // deliberate rather than overlooked: a hit fully eaten by a shield does NOT
    // break the channel (nothing hurt you), and the fire-ring burn DOES (it is
    // damage, and standing in the fire while channelling a 2-second ultimate
    // should cost you). Compared against the cast's OWN snapshot, so regen
    // ticking the bar back up mid-channel cannot un-interrupt anything and a
    // second cast starts from a fresh baseline.
    const def = Abilities.get(cast.abilityId);
    const damaged =
      def.interruptOn === "damage" && hp !== undefined && hp.hp < cast.hpAtStart;

    // interrupt: death, stun, or a knockdown cancels the cast (mana stays spent)
    if (!hp?.alive || stunned || damaged || (world.knockdown.get(id) ?? 0) > 0) {
      ab.cast = null;
      world.emit("castInterrupt", { caster: id, slot: cast.slot, abilityId: cast.abilityId });
      continue;
    }

    // Combat-juice hitstop PAUSES the cast wind-up (a mid-channel hit hitches
    // the animation) without interrupting it or refunding — resumes after.
    if ((world.hitstop.get(id) ?? 0) > 0) continue;
    // Combat-juice HITSTUN (victim-only) also pauses the cast: the defender is
    // action-locked past the shared freeze (frame advantage) so a mid-channel
    // hit hitches the wind-up longer for the one who got hit. No refund/
    // interrupt — resumes after. See combat/damage.ts.
    if ((world.hitstun.get(id) ?? 0) > 0) continue;

    cast.ticksLeft--;
    if (cast.ticksLeft > 0) continue;

    // wind-up elapsed — resolve.
    ab.cast = null;
    // GROUND AoE: re-query the circle NOW instead of trusting the membership
    // snapshotted at cast-begin. With a cast time the snapshot hit whoever
    // stood there when the key was pressed even if they walked out, and missed
    // anyone who walked in — an AoE that ignores the telegraph it just drew.
    // Everything else (targeted / self / skillshot / dash) keeps its resolved
    // target: those are locked at cast-begin by design.
    const groundBlast = def.castType === "ground" && cast.point;
    const targets = groundBlast
      ? // combat-env `abilityRange` (task #136) shrinks the resolve-time AoE too
        enemiesInCircle(world, id, cast.point!, resolveAbilityRadius(world, def.radius ?? 1))
      : cast.targets;
    // The AoE detonates at the point NOW that the wind-up elapsed — the discrete
    // `explosion` / 爆裂 cue for a cast-time ground ability (audio COMBAT-AUDIO;
    // the instant-cast twin fires in abilitySystem).
    if (groundBlast) {
      world.emit("explosion", { caster: id, abilityId: cast.abilityId, x: cast.point!.x, z: cast.point!.z });
    }
    // ⭐ G6-1 —— 【跨技能強化】。有吟唱的技能在這裡結算，所以這一行是
    // `abilitySystem.ts::castAbility` 那一行的雙胞胎。⛔ 只接一邊的話
    // 「強化一支有吟唱的技能」會安靜地失效，而畫面上跟沒強化一模一樣。
    const augmentedEffects = applyAugmentToEffects(
      def.effects,
      collectAugmentOps(world, id, cast.abilityId),
    );
    runEffects(augmentedEffects, {
      world,
      caster: id,
      rank: cast.rank,
      targets,
      point: cast.point,
      direction: cast.direction,
      origin: `ability:${cast.abilityId}`,
      abilitySlot: cast.slot,
      rng: world.rng,
    });
    fireHooks(world, id, "onAbilityCast", targets[0], cast.slot);
    for (const hitId of targets) {
      if (hitId !== id) fireHooks(world, id, "onAbilityHit", hitId, cast.slot);
      // GH#354 —— 事件流上的「技能命中」。⚠️ 它**只**餵 `onUltimateHit`
      // （WorldHookSystem 用 slot 切片），⛔ 不是 `onAbilityHit` 的第二條路：
      // 那一支就在上面一行直接發，兩條路會讓同一張卡響兩次。
      if (hitId !== id) world.emit("abilityHit", { caster: id, target: hitId, slot: cast.slot });
    }
    world.emit("castEnd", { caster: id, slot: cast.slot, abilityId: cast.abilityId });
    // RECOVERY begins at the END of startup — this tick, never later. Effects
    // above only QUEUED their damage; combatResolveSystem drains it later in
    // the SAME tick (step 8), so a connect cancels this recovery immediately.
    armRecovery(world, id, cast.slot, def, targets);
  }
}
