import type { EffectKindSpec } from "./effectKind";
import { isTimeStopped, removeTimeStop, TIME_STOP_MAX_DURATION_SEC, TIME_STOP_MAX_RADIUS, TIME_STOP_MAX_HITS } from "../timeStop";
import { pauseTimeStopClocks } from "../timeStopClocks";

export const timeStopEffect: EffectKindSpec<"timeStop"> = {
  apply(e, ctx) {
    const { world, caster } = ctx, t = world.transform.get(caster), team = world.team.get(caster);
    if (!t || !team || !world.health.get(caster)?.alive || world.settledZones.has(t.zone) || isTimeStopped(world, caster)) return;
    // One field per owner: refresh cannot extend a queue indefinitely.
    for (const [id, f] of [...world.timeStop].sort((a, b) => a[0] - b[0])) if (f.owner === caster) removeTimeStop(world, id, "replaced", true);
    const id = world.spawn(), point = { ...(ctx.point ?? t.pos) };
    const duration = Math.max(1, Math.round(Math.min(TIME_STOP_MAX_DURATION_SEC, e.durationSec) / world.dt));
    world.timeStop.set(id, { owner: caster, team: team.teamId, origin: ctx.origin, zone: t.zone, round: world.round,
      point, radius: Math.max(0, Math.min(TIME_STOP_MAX_RADIUS, e.radius)), expiresAtTick: world.tick + duration,
      maxQueuedHits: Math.max(1, Math.min(TIME_STOP_MAX_HITS, Math.floor(e.maxQueuedHits ?? 64))), hits: [] });
    world.transform.set(id, { pos: point, vel: { x: 0, z: 0 }, facing: { x: 1, z: 0 }, radius: 0, zone: t.zone });
    pauseTimeStopClocks(world);
    world.emit("timeStopStart", { id, owner: caster, zone: t.zone, x: point.x, z: point.z, radius: world.timeStop.get(id)!.radius, teamId: team.teamId,
      expiresAtTick: world.tick + duration, durationMs: duration * world.dt * 1000 });
  },
};
