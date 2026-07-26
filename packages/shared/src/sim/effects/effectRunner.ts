/**
 * effectRunner — the ONE interpreter for EffectDef[]. Abilities, item passives,
 * augment hooks, and buffs all execute through here. Handlers mutate the world
 * only via well-defined paths (damage queue, shields, statuses, buff sources,
 * dash overrides, projectile spawns).
 */
import type { EffectContext, EffectDef } from "./effect";
import { resolveScaling } from "./effect";
import { Stat } from "../stats/statTypes";
import { attachSource } from "../stats/statPipeline";
import { addShield } from "../combat/damage";
import { healTarget, restoreMana } from "../combat/restore";
import { recordCc } from "../stats/matchStats";
import { startDash } from "../systems/MovementSystem";
import { startLeap, resolveLandingPoint } from "../movement/leap";
import { Projectiles } from "../content/registry";
import { resolveAbilityRange } from "../abilities/abilitySystem";
import { normalize, sub } from "../math/vec2";

export function runEffects(effects: readonly EffectDef[], ctx: EffectContext): void {
  for (const e of effects) applyEffect(e, ctx);
}

function casterStats(ctx: EffectContext): Record<Stat, number> {
  return ctx.world.stats.get(ctx.caster)?.final ?? ({} as Record<Stat, number>);
}

function applyEffect(e: EffectDef, ctx: EffectContext): void {
  const { world } = ctx;
  switch (e.kind) {
    case "damage": {
      const stats = casterStats(ctx);
      for (const target of ctx.targets) {
        let amount = resolveScaling(stats, e.amount, ctx.rank);
        let crit = false;
        if (e.canCrit) {
          const cc = stats[Stat.CritChance] ?? 0;
          if (cc > 0 && ctx.rng.chance(cc)) {
            crit = true;
            amount *= stats[Stat.CritDamage] || 1.75;
          }
        }
        world.damageQueue.push({
          source: ctx.caster,
          target,
          amount,
          type: e.damageType,
          crit,
          origin: ctx.origin,
        });
      }
      break;
    }
    case "heal": {
      const stats = casterStats(ctx);
      // global combat-env healing factor (world.combatEnv, see combatEnv.ts)
      const amount = resolveScaling(stats, e.amount, ctx.rank) * world.combatEnv.healing;
      for (const target of ctx.targets) {
        // same clamp + same recordHealing(actual restored) as before; the
        // helper additionally emits `heal` so the client can draw 補血 (#92).
        healTarget(world, {
          source: ctx.caster,
          target,
          amount,
          origin: ctx.origin,
          score: true,
        });
      }
      break;
    }
    case "shield": {
      const stats = casterStats(ctx);
      // global combat-env shield-strength factor
      const amount = resolveScaling(stats, e.amount, ctx.rank) * world.combatEnv.shield;
      for (const target of ctx.targets) {
        addShield(world, target, amount, e.duration, ctx.origin);
      }
      break;
    }
    case "applyStatus": {
      const expiresAtTick = world.tick + Math.round(e.duration / world.dt);
      // hard/soft CC (stun/root/slow) applied to an enemy scores ccAppliedTicks
      const isCc = e.stun === true || e.root === true || (e.moveSpeedMult !== undefined && e.moveSpeedMult < 1);
      for (const target of ctx.targets) {
        const st = world.status.get(target);
        if (!st) continue;
        // refresh rule: same status id + origin replaces (no stacking in skeleton)
        const existing = st.effects.find(
          (s) => s.statusId === e.statusId && s.sourceId === ctx.origin,
        );
        let addedTicks = 0;
        if (existing) {
          addedTicks = Math.max(0, expiresAtTick - existing.expiresAtTick);
          existing.expiresAtTick = Math.max(existing.expiresAtTick, expiresAtTick);
        } else {
          addedTicks = Math.max(0, expiresAtTick - world.tick);
          st.effects.push({
            statusId: e.statusId,
            sourceId: ctx.origin,
            expiresAtTick,
            moveSpeedMult: e.moveSpeedMult,
            root: e.root,
            stun: e.stun,
          });
        }
        if (isCc) recordCc(world, ctx.caster, target, addedTicks);
      }
      break;
    }
    case "applyBuff": {
      // rank-indexed variant wins when authored (WC3 buff columns are per
      // ability level); clamp past the last entry so a GGD maxRank beyond the
      // native level count keeps the highest authored row instead of vanishing.
      const rk = e.perRank?.[Math.min(Math.max(1, ctx.rank), e.perRank.length) - 1];
      const modifiers = rk?.modifiers ?? e.modifiers;
      const duration = rk?.duration ?? e.duration;
      const expiresAtTick = world.tick + Math.round(duration / world.dt);
      for (const target of ctx.targets) {
        // #244 STACKING PATH: one source per key, `stacks` counts applications.
        // Fixes the same-tick collision the id below has (two mobs killed by one
        // AoE on one tick used to overwrite each other and only pay once) and
        // keeps the source list O(1) instead of one entry per proc.
        if (e.stackKey !== undefined) {
          const sc = world.stats.get(target);
          if (!sc) continue;
          const id = `buff:stack:${e.stackKey}`;
          const existing = sc.sources.find((s) => s.id === id);
          if (existing) {
            const cap = e.maxStacks ?? Number.POSITIVE_INFINITY;
            existing.stacks = Math.min((existing.stacks ?? 1) + 1, cap);
            existing.expiresAtTick = expiresAtTick;
            sc.dirty = true;
          } else {
            attachSource(world, target, {
              id,
              kind: "buff",
              modifiers,
              expiresAtTick,
              stacks: 1,
              ...(e.stackVisual ? { visualStacks: true } : {}),
            });
          }
          continue;
        }
        attachSource(world, target, {
          id: `buff:${ctx.origin}#${world.tick}`,
          kind: "buff",
          modifiers,
          expiresAtTick,
        });
      }
      // ONE discrete `buffApply` cue for the status-up (audio COMBAT-AUDIO): the
      // client plays the 增益 cast on the first buffed target. Fired only when a
      // buff actually attached, so an empty target set makes no sound.
      if (ctx.targets.length > 0) {
        world.emit("buffApply", { source: ctx.caster, target: ctx.targets[0], origin: ctx.origin });
      }
      break;
    }
    case "restore": {
      // Fraction of the TARGET's own maximum (WC3 SetUnit{Life,Mana}PercentBJ).
      // Health restored is scored as healing, exactly like `heal`.
      for (const target of ctx.targets) {
        const hp = world.health.get(target);
        if (!hp?.alive) continue;
        if (e.healthPct !== undefined) {
          healTarget(world, {
            source: ctx.caster,
            target,
            amount: hp.maxHp * e.healthPct * world.combatEnv.healing,
            origin: ctx.origin,
            score: true,
          });
        }
        if (e.manaPct !== undefined) {
          // NOTE: mana restore is deliberately NOT scaled by combatEnv.healing
          // (it never was) — that factor is the HEALING knob, not a mana knob.
          restoreMana(world, {
            source: ctx.caster,
            target,
            amount: hp.maxMana * e.manaPct,
            origin: ctx.origin,
          });
        }
      }
      break;
    }
    case "dash": {
      const t = world.transform.get(ctx.caster);
      if (!t) break;
      const dir =
        e.mode === "toPoint" && ctx.point
          ? normalize(sub(ctx.point, t.pos))
          : ctx.direction ?? t.facing;
      startDash(world, ctx.caster, dir, e.speed, e.maxDistance);
      break;
    }
    case "leap": {
      // Task #247. The FLYER is either the caster (the shipped self-leaps: 蒼月潮
      // 07-03, 01-02 隕石擊, 76-04 三檔) or each resolved target (the thrown arcs:
      // 52-02 蹂躪編年史, 77-00 浮雲-旋一閃) — one primitive, two subjects.
      const applyTo = e.applyTo ?? "self";
      const flyers = applyTo === "target" ? ctx.targets : [ctx.caster];
      for (const flyer of flyers) {
        const ft = world.transform.get(flyer);
        if (!ft) continue;
        // "inPlace" is a vertical hop (76-04 三檔.巨人迴旋彈 has NO
        // SetUnitPositionLoc on the caster anywhere in its cluster); "toPoint"
        // aims at the snapshotted cast point, or — for a thrown target with no
        // point — straight along the caster's facing by the arc's own reach.
        let requested = { x: ft.pos.x, z: ft.pos.z };
        if (e.mode === "toPoint") {
          if (applyTo === "target" && ctx.point === undefined) {
            // A thrown victim on a UNIT-targeted ability has no cast point to
            // aim at, so it flies `throwDistance` along the caster's facing —
            // the JASS's own PolarProjection(caster, 400, facing) (j:51767),
            // put through the #136 reach factor like every other length.
            const ct = world.transform.get(ctx.caster);
            const dir = ctx.direction ?? ct?.facing ?? { x: 0, z: 1 };
            const reach = resolveAbilityRange(world, e.throwDistance ?? 0);
            requested = { x: ft.pos.x + dir.x * reach, z: ft.pos.z + dir.z * reach };
          } else if (ctx.point) {
            requested = { x: ctx.point.x, z: ctx.point.z };
          }
        }
        // The landing point is proved LEGAL here, once, at takeoff — the arc is
        // re-aimed rather than corrected at touchdown (see movement/leap.ts).
        // "Legal" means obstacle-free and inside the zone boundary; it does NOT
        // mean range-clamped, and there is deliberately no clamp here. Reach was
        // already bounded upstream, where the ability's range is known: a
        // "ground" cast has its point clamped to `resolveAbilityRange(def.range)`
        // by abilitySystem, a "targeted" cast rejects an out-of-range target
        // outright, and the thrown-victim branch above flies its own
        // `throwDistance` (already through the #136 reach factor). The clamp this
        // call used to carry was passed `len(requested - flyer.pos)` — its own
        // input distance — so it could never fire; see resolveLandingPoint.
        const to = resolveLandingPoint(world, flyer, requested);
        startLeap(world, flyer, {
          to,
          apexHeight: e.apexHeight,
          durationSec: e.durationSec,
          ...(e.landRadius !== undefined ? { landRadius: e.landRadius } : {}),
          ...(e.onLand !== undefined ? { onLand: e.onLand } : {}),
          casterId: ctx.caster,
          rank: ctx.rank,
          origin: ctx.origin,
          ...(ctx.abilitySlot !== undefined ? { slot: ctx.abilitySlot } : {}),
        });
      }
      break;
    }
    case "spawnProjectile": {
      const t = world.transform.get(ctx.caster);
      if (!t) break;
      const def = Projectiles.get(e.projectileId);
      const dir = ctx.direction ?? (ctx.point ? normalize(sub(ctx.point, t.pos)) : t.facing);
      if (dir.x === 0 && dir.z === 0) break;
      const id = world.spawn();
      world.transform.set(id, {
        pos: { x: t.pos.x, z: t.pos.z },
        vel: { x: dir.x * def.speed, z: dir.z * def.speed },
        facing: dir,
        radius: def.hitRadius,
        zone: t.zone,
      });
      world.projectile.set(id, {
        projectileId: e.projectileId,
        ownerId: ctx.caster,
        dir,
        speed: def.speed,
        // combat-env `abilityRange` (task #136) scales an ability skillshot's
        // TRAVEL range through the SAME seam as its cast range / AoE radius /
        // hit radius (resolveAbilityRange), so the distance the missile flies
        // matches the ×abilityRange number the client tooltip shows — displayed
        // == actual. Basic-attack missiles are spawned in BasicAttackSystem and
        // never pass through here, so their reach (attackRange) is untouched.
        remainingRange: resolveAbilityRange(world, def.maxRange),
        hitRadius: def.hitRadius,
        pierce: def.pierce ?? false,
        hitSet: new Set(),
        onHit: e.onHit,
        rank: ctx.rank,
        origin: ctx.origin,
        abilitySlot: ctx.abilitySlot,
      });
      world.emit("projectileSpawn", { id, owner: ctx.caster, projectileId: e.projectileId });
      break;
    }
    case "spawnVfx": {
      // Cosmetic only: resolve a world point and emit a vfxSpawn event for the
      // client's VfxSystem. No world mutation, no rng → deterministic (two
      // seeded runs emit identical events from identical transforms).
      const at = e.at ?? "self";
      let pos: { x: number; z: number } | undefined;
      if (at === "point") {
        pos = ctx.point;
      } else if (at === "target") {
        const tid = ctx.targets[0];
        pos = (tid !== undefined ? world.transform.get(tid)?.pos : undefined) ?? ctx.point;
      }
      if (!pos) pos = world.transform.get(ctx.caster)?.pos;
      if (!pos) break;
      world.emit("vfxSpawn", {
        vfxId: e.vfxId,
        x: pos.x,
        z: pos.z,
        caster: ctx.caster,
        ...(e.durationSec !== undefined ? { durationSec: e.durationSec } : {}),
      });
      break;
    }
  }
}
