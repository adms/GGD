/** StatusSystem — drop expired status effects (slows/roots/stuns). */
import type { SimWorld } from "../SimWorld";

export function statusExpirySystem(world: SimWorld): void {
  for (const [, st] of world.status) {
    if (st.effects.length === 0) continue;
    st.effects = st.effects.filter((e) => e.expiresAtTick > world.tick);
  }
}
