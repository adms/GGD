/**
 * DeathSystem — hp<=0 → dead; kill credit to the last damager (tracked via
 * damage events this tick), XP/gold rewards, onKill hooks.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { grantXp, grantGold, XP_REWARDS, GOLD_REWARDS } from "../economy/progression";
import { fireHooks } from "../effects/hooks";
import { recordChampionDeath, recordFlowerEaten } from "../stats/matchStats";

export function deathSystem(world: SimWorld): void {
  // last damage source per target this tick (events are ordered)
  const lastDamager = new Map<EntityId, EntityId>();
  for (const ev of world.events) {
    if (ev.type === "damage") {
      lastDamager.set(ev.data.target as EntityId, ev.data.source as EntityId);
    }
  }

  for (const [id, hp] of world.health) {
    if (!hp.alive || hp.hp > 0) continue;
    hp.hp = 0;
    hp.alive = false;
    const killer = lastDamager.get(id) ?? null;
    world.emit("death", { id, killer });

    if (world.flower.has(id)) {
      // Flowers are not kills: no XP/gold/onKill — their reward is the HP/MP
      // burst (FlowerSystem consumes this death event right after this system).
      // The killing blow still scores as a "flower eaten" for the killer.
      if (killer !== null && world.champion.has(killer)) recordFlowerEaten(world, killer);
    } else if (world.champion.has(id)) {
      // champion death: scoreboard (deaths / kills / assists / KP / multikills)
      recordChampionDeath(world, id, killer);
      if (killer !== null && world.champion.has(killer)) {
        grantXp(world, killer, XP_REWARDS.kill);
        grantGold(world, killer, GOLD_REWARDS.kill);
        fireHooks(world, killer, "onKill", id);
      }
    }
  }
}
