import type { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { TimeStopView } from "../../../client/src/render/views/TimeStopView";

/** Placement and removal follow Sim events, including early owner death.
 * Actor hold state comes from the authoritative scenario pose, not this ring. */
export class TimeStopReplay {
  private readonly active = new Map<number, TimeStopView>();
  private readonly pool: TimeStopView[] = [];
  constructor(private readonly scene: Scene) {}
  onEvent(event: EventMessage): void {
    const d = event.data, id = Number(d.id);
    if (!Number.isFinite(id)) return;
    if (event.type === "timeStopEnd") {
      const view = this.active.get(id);
      if (view) { view.deactivate(); this.pool.push(view); this.active.delete(id); }
    } else if (event.type === "timeStopStart" && !this.active.has(id)) {
      const x = Number(d.x), z = Number(d.z), radius = Number(d.radius);
      if (![x, z, radius].every(Number.isFinite) || radius <= 0) return;
      const view = this.pool.pop() ?? new TimeStopView(this.scene);
      view.setPose(x, z); view.activate(radius); this.active.set(id, view);
    }
  }
  reset(): void { for (const v of this.active.values()) { v.deactivate(); this.pool.push(v); } this.active.clear(); }
  dispose(): void { this.reset(); for (const v of this.pool) v.dispose(); this.pool.length = 0; }
}
