import type { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { TrapView } from "../../../client/src/render/views/TrapView";
/** Replay the same client marker from authoritative placement/removal events. */
export class TrapReplay {
  private readonly active = new Map<number, { view: TrapView; radius: number; team: number; armAt: number }>();
  private readonly pool: TrapView[] = [];
  constructor(private readonly scene: Scene) {}
  onEvent(event: EventMessage, atMs: number): void {
    const d = event.data, id = Number(d.id);
    if (!Number.isFinite(id)) return;
    if (event.type === "trapRemoved") {
      const entry = this.active.get(id);
      if (entry) { entry.view.deactivate(); this.pool.push(entry.view); this.active.delete(id); }
    } else if (event.type === "trapPlaced") {
      const x = Number(d.x), z = Number(d.z), radius = Number(d.radius), team = Number(d.teamId), delay = Number(d.armDelayMs);
      if (![x, z, radius, team, delay].every(Number.isFinite) || this.active.has(id)) return;
      const view = this.pool.pop() ?? new TrapView(this.scene);
      view.setPose(x, z); view.activate(radius, team, delay <= 0);
      this.active.set(id, { view, radius, team, armAt: atMs + delay });
    }
  }
  update(nowMs: number): void { for (const e of this.active.values()) e.view.activate(e.radius, e.team, nowMs >= e.armAt); }
  reset(): void { for (const e of this.active.values()) { e.view.deactivate(); this.pool.push(e.view); } this.active.clear(); }
  dispose(): void { this.reset(); for (const v of this.pool) v.dispose(); this.pool.length = 0; }
}
