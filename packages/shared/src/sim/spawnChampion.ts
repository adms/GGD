/** Champion entity factory — wires every component + the passive ModifierSource. */
import type { ChampionId, EntityId, SeatId, TeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { Vec2 } from "./math/vec2";
import { Champions } from "./content/registry";
import { zeroStats } from "./stats/statTypes";
import { zeroAttrBonus } from "./stats/attributes";
import { recomputeStats } from "./stats/statPipeline";
import { createMatchStats } from "./stats/matchStats";
import { INVENTORY_SLOTS } from "./economy/shop";
import { innateSupersedesLegacyPassive, syncAbilityPassives } from "./abilities/abilityPassives";
import { installMarksForChampion } from "./markInstall";

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
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  world.champion.set(id, {
    championId: args.championId,
    level: args.level ?? 1,
    xp: 0,
    gold: 0,
    items: new Array(INVENTORY_SLOTS).fill(null),
    augments: [],
    statStacks: 0,
    // 三圍 bought this match (#260) — starts empty; every 能力屬性強化 pick adds
    // into it and `recomputeStats` feeds it straight into `championStatBase`.
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
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
    // The SIXTH slot — 天生技 / innate. Unlike EX it spawns at rank 1, because
    // the owner's rule is that it is OWNED FROM LEVEL 1, not learned and not
    // unlocked. Absent only for the 3 heroes with no `NN-00` in the source map.
    passiveSlot: def.passiveAbility
      ? { abilityId: def.passiveAbility, rank: 1, cooldownRemainingTicks: 0 }
      : null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.stats.set(id, {
    championId: args.championId,
    final: zeroStats(),
    dirty: true,
    // The LEGACY inline champion passive. Attached only when the standalone
    // sixth-slot doc has not superseded it — five champions carry the very same
    // 天生技 in both places, and attaching both would double it
    // (`innateSupersedesLegacyPassive`).
    sources:
      def.passive && !innateSupersedesLegacyPassive(def)
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

  // 技能文件宣告的具名標記（【試煉】【風王結界】【縮地】）在這裡發下去。
  // 必須在 `recomputeStats` 之前 —— `perStackLost` 是走 stats 那條路的。
  installMarksForChampion(world, id, args.championId);

  // Q starts learned, so its permanent passive (if any) is on from spawn — and
  // so is the 天生技 innate, which spawns at rank 1 by definition.
  syncAbilityPassives(world, id);

  recomputeStats(world, id);
  const hp = world.health.get(id)!;
  hp.hp = hp.maxHp;
  hp.mana = hp.maxMana;

  world.emit("championSpawn", { id, championId: args.championId, seatId: args.seatId });
  return id;
}
