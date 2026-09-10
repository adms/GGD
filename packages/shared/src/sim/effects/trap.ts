import type { EffectKindSpec } from "./effectKind";
import { removeTrap, TRAP_MAX_ALIVE, TRAP_MAX_DURATION_SEC, TRAP_MAX_RADIUS } from "../trapState";
export const trapEffect: EffectKindSpec<"trap"> = {
  apply(e, ctx) {
    const { world, caster } = ctx, t = world.transform.get(caster), team = world.team.get(caster);
    if (!t || !team || world.health.get(caster)?.alive !== true || world.settledZones.has(t.zone)) return;
    const max = Math.max(1, Math.min(TRAP_MAX_ALIVE, Math.floor(e.maxAlive ?? 1)));
    const live = [...world.trap].filter(([, a]) => a.ownerId === caster && a.origin === ctx.origin).sort((a, b) => a[0] - b[0]);
    while (live.length >= max) removeTrap(world, live.shift()![0], "replaced");
    const id = world.spawn(), point = ctx.point ?? t.pos;
    const duration = Math.max(1, Math.round(Math.min(TRAP_MAX_DURATION_SEC, e.durationSec) / world.dt));
    world.transform.set(id, { pos: { ...point }, vel: { x: 0, z: 0 }, facing: { x: 1, z: 0 }, radius: 0, zone: t.zone });
    world.team.set(id, { ...team });
    world.trap.set(id, { ownerId: caster, origin: ctx.origin, rank: ctx.rank,
      expiresAtTick: world.tick + duration,
      armedAtTick: world.tick + Math.min(duration - 1, Math.max(0, Math.round((e.armDelaySec ?? 0) / world.dt))),
      radius: Math.max(0, Math.min(TRAP_MAX_RADIUS, e.radius)),
      triggerAt: e.triggerAt ?? "attacker", cancelAttack: e.cancelAttack ?? true,
      onOwnerDeath: e.onOwnerDeath ?? "despawn", onTrigger: e.onTrigger, castInstance: ctx.castInstance });
    const placed = world.trap.get(id)!;
    world.emit("trapPlaced", { id, owner: caster, origin: ctx.origin, zone: t.zone, x: point.x, z: point.z,
      radius: placed.radius, teamId: team.teamId, armDelayMs: (placed.armedAtTick - world.tick) * world.dt * 1000 });
  },
  bake(e, ctx, bakeList) { return { ...e, onTrigger: bakeList(e.onTrigger, ctx) }; },
};
