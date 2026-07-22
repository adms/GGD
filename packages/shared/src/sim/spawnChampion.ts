/** Champion entity factory — wires every component + the passive ModifierSource. */
import type { ChampionId, EntityId, SeatId, TeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { Vec2 } from "./math/vec2";
import { Champions } from "./content/registry";
import { zeroStats } from "./stats/statTypes";
import { recomputeStats } from "./stats/statPipeline";
import { createMatchStats } from "./stats/matchStats";
import { INVENTORY_SLOTS } from "./economy/shop";
import { syncAbilityPassives } from "./abilities/abilityPassives";

export interface SpawnChampionArgs {
  championId: ChampionId;
  seatId: SeatId;
  teamId: TeamId;
  pos: Vec2;
  zone: number;
  level?: number;
}

export function spawnChampion(world: SimWorld, args: SpawnChampionArgs): EntityId {
  const def = Champions.get(args.championId);
  const id = world.spawn();

  world.transform.set(id, {
    pos: { x: args.pos.x, z: args.pos.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: args.zone,
  });
  world.team.set(id, { teamId: args.teamId, seatId: args.seatId });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null });
  world.status.set(id, { effects: [] });
  world.champion.set(id, {
    championId: args.championId,
    level: args.level ?? 1,
    xp: 0,
    gold: 0,
    items: new Array(INVENTORY_SLOTS).fill(null),
    augments: [],
    statStacks: 0,
    statCapstonePct: 0,
    pendingOrbSlots: 0,
  });
  world.abilities.set(id, {
    slots: {
      Q: { abilityId: def.abilities.Q.id, rank: 1, cooldownRemainingTicks: 0 }, // Q starts learned
      W: { abilityId: def.abilities.W.id, rank: 0, cooldownRemainingTicks: 0 },
      E: { abilityId: def.abilities.E.id, rank: 0, cooldownRemainingTicks: 0 },
      R: { abilityId: def.abilities.R.id, rank: 0, cooldownRemainingTicks: 0 },
    },
    // EX slot exists only for heroes that have one; rank 0 = locked until the
    // arena EX-unlock point (see learnEx / MatchController).
    exSlot: def.exAbility ? { abilityId: def.exAbility, rank: 0, cooldownRemainingTicks: 0 } : null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.stats.set(id, {
    championId: args.championId,
    final: zeroStats(),
    dirty: true,
    sources: def.passive
      ? [
          {
            id: `passive:${args.championId}`,
            kind: "passive",
            modifiers: def.passive.modifiers,
            hooks: def.passive.hooks,
          },
        ]
      : [],
  });
  // health starts empty; first recompute fills maxima and we top off
  world.health.set(id, {
    hp: 0,
    maxHp: 0,
    mana: 0,
    maxMana: 0,
    alive: true,
    shields: [],
  });
  // per-player match scoreboard (accumulated by the combat/death/heal/ability/
  // flower/economy paths; graded at match end)
  world.matchStats.set(id, createMatchStats());

  // Q starts learned, so its permanent passive (if any) is on from spawn.
  syncAbilityPassives(world, id);

  recomputeStats(world, id);
  const hp = world.health.get(id)!;
  hp.hp = hp.maxHp;
  hp.mana = hp.maxMana;

  world.emit("championSpawn", { id, championId: args.championId, seatId: args.seatId });
  return id;
}
