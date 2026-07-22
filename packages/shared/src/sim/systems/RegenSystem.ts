/** RegenSystem — hp/mana regeneration from final stats (per second → per tick). */
import type { SimWorld } from "../SimWorld";
import { Stat } from "../stats/statTypes";

export function regenSystem(world: SimWorld): void {
  for (const [id, hp] of world.health) {
    if (!hp.alive) continue;
    const sc = world.stats.get(id);
    if (!sc) continue;
    hp.hp = Math.min(hp.maxHp, hp.hp + sc.final[Stat.HealthRegen] * world.dt);
    hp.mana = Math.min(hp.maxMana, hp.mana + sc.final[Stat.ManaRegen] * world.dt);
  }
}
