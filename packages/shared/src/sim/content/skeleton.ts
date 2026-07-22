/**
 * Skeleton content — 2 champions, 4 items, 3 augments, 1 loot table, projectiles.
 * TS literals for now; the content pipeline (task #7) migrates these to JSON
 * with identical shapes. Register via `registerSkeletonContent()`.
 */
import type { AbilityId, AugmentId, ChampionId, ItemId, ProjectileId, StatusId } from "../../ids";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import type { AugmentDef, ChampionDef, ItemDef, LootTable, ProjectileDef } from "./defs";
import { registerChampion, Items, Augments, Projectiles, LootTables } from "./registry";

const id = <T extends string>(s: string): T => s as T;

// ---------- projectiles ----------
const PROJECTILES: ProjectileDef[] = [
  {
    id: id<ProjectileId>("sela.q.bolt"),
    speed: 24,
    maxRange: 14,
    hitRadius: 0.5,
    vfxKey: "fx.ember-bolt",
  },
  {
    id: id<ProjectileId>("thorne.e.thorn"),
    speed: 20,
    maxRange: 10,
    hitRadius: 0.45,
    vfxKey: "fx.thorn",
  },
];

// ---------- champions ----------
export const SELA: ChampionDef = {
  id: id<ChampionId>("sela"),
  name: "Sela, the Ember Sage",
  role: "mage",
  attackType: "ranged",
  modelKey: "champ.sela",
  missileSpeed: 22,
  attackDamagePoint: 0.3,
  baseStats: {
    [Stat.MaxHealth]: 520,
    [Stat.HealthRegen]: 1.2,
    [Stat.MaxMana]: 400,
    [Stat.ManaRegen]: 1.6,
    [Stat.AttackDamage]: 52,
    [Stat.AbilityPower]: 0,
    [Stat.Armor]: 20,
    [Stat.MagicResist]: 28,
    [Stat.AttackSpeed]: 0.65,
    [Stat.MoveSpeed]: 6.6,
    [Stat.CritChance]: 0,
    [Stat.CritDamage]: 1.75,
    [Stat.CooldownReduction]: 0,
    [Stat.Lifesteal]: 0,
    [Stat.AttackRange]: 11,
  },
  growth: {
    [Stat.MaxHealth]: 90,
    [Stat.HealthRegen]: 0.12,
    [Stat.MaxMana]: 45,
    [Stat.ManaRegen]: 0.16,
    [Stat.AttackDamage]: 3,
    [Stat.Armor]: 4,
    [Stat.MagicResist]: 1.2,
    [Stat.AttackSpeed]: 0.02,
  },
  abilities: {
    Q: {
      id: id<AbilityId>("sela.q"),
      name: "Ember Bolt",
      slot: "Q",
      castType: "skillshot",
      maxRank: 5,
      cooldown: [6, 5.5, 5, 4.5, 4],
      manaCost: [50, 55, 60, 65, 70],
      range: 14,
      effects: [
        {
          kind: "spawnProjectile",
          projectileId: id<ProjectileId>("sela.q.bolt"),
          onHit: [
            {
              kind: "damage",
              damageType: "magic",
              amount: { flat: 20, perRank: [60, 95, 130, 165, 200], ratios: [{ stat: Stat.AbilityPower, coeff: 0.7 }] },
            },
          ],
        },
      ],
      vfxKey: "fx.ember-bolt-cast",
    },
    W: {
      id: id<AbilityId>("sela.w"),
      name: "Cinder Ward",
      slot: "W",
      castType: "self",
      maxRank: 5,
      cooldown: [16, 15, 14, 13, 12],
      manaCost: [60, 65, 70, 75, 80],
      range: 0,
      effects: [
        {
          kind: "shield",
          amount: { flat: 40, perRank: [40, 70, 100, 130, 160], ratios: [{ stat: Stat.AbilityPower, coeff: 0.5 }] },
          duration: 3,
        },
        {
          kind: "applyBuff",
          modifiers: [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 25 }],
          duration: 3,
        },
      ],
      vfxKey: "fx.cinder-ward",
    },
    E: {
      id: id<AbilityId>("sela.e"),
      name: "Scorch Ring",
      slot: "E",
      castType: "ground",
      maxRank: 5,
      cooldown: [12, 11, 10, 9, 8],
      manaCost: [70, 75, 80, 85, 90],
      range: 12,
      radius: 3,
      targetsEnemies: true,
      effects: [
        {
          kind: "damage",
          damageType: "magic",
          amount: { flat: 40, perRank: [30, 60, 90, 120, 150], ratios: [{ stat: Stat.AbilityPower, coeff: 0.5 }] },
        },
        {
          kind: "applyStatus",
          statusId: id<StatusId>("slow40"),
          duration: 1.5,
          moveSpeedMult: 0.6,
        },
      ],
      vfxKey: "fx.scorch-ring",
    },
    R: {
      id: id<AbilityId>("sela.r"),
      name: "Firestorm",
      slot: "R",
      castType: "ground",
      maxRank: 3,
      cooldown: [110, 95, 80],
      manaCost: [100, 100, 100],
      range: 10,
      radius: 5,
      targetsEnemies: true,
      castTimeSec: 0.5,
      effects: [
        {
          kind: "damage",
          damageType: "magic",
          amount: { perRank: [200, 325, 450], ratios: [{ stat: Stat.AbilityPower, coeff: 0.9 }] },
        },
        {
          kind: "applyStatus",
          statusId: id<StatusId>("burnstun"),
          duration: 0.75,
          stun: true,
        },
      ],
      vfxKey: "fx.firestorm",
    },
  },
  passive: {
    name: "Kindling",
    // every ability hit sears the target briefly (tiny magic burn, 2s ICD)
    hooks: [
      {
        on: "onAbilityHit",
        internalCooldown: 2,
        effects: [{ kind: "damage", damageType: "magic", amount: { flat: 12 } }],
      },
    ],
  },
  skillOrder: ["Q", "E", "W", "R"],
  buildPriority: [id<ItemId>("ember-rod"), id<ItemId>("ironhide-vest")],
  tags: ["mage", "burst", "ranged"],
};

export const THORNE: ChampionDef = {
  id: id<ChampionId>("thorne"),
  name: "Thorne, the Bramble Knight",
  role: "bruiser",
  attackType: "melee",
  modelKey: "champ.thorne",
  attackDamagePoint: 0.25,
  baseStats: {
    [Stat.MaxHealth]: 640,
    [Stat.HealthRegen]: 1.8,
    [Stat.MaxMana]: 280,
    [Stat.ManaRegen]: 1.2,
    [Stat.AttackDamage]: 62,
    [Stat.AbilityPower]: 0,
    [Stat.Armor]: 32,
    [Stat.MagicResist]: 32,
    [Stat.AttackSpeed]: 0.7,
    [Stat.MoveSpeed]: 6.9,
    [Stat.CritChance]: 0,
    [Stat.CritDamage]: 1.75,
    [Stat.CooldownReduction]: 0,
    [Stat.Lifesteal]: 0,
    [Stat.AttackRange]: 1.6,
  },
  growth: {
    [Stat.MaxHealth]: 110,
    [Stat.HealthRegen]: 0.16,
    [Stat.MaxMana]: 30,
    [Stat.ManaRegen]: 0.1,
    [Stat.AttackDamage]: 3.6,
    [Stat.Armor]: 4.6,
    [Stat.MagicResist]: 2,
    [Stat.AttackSpeed]: 0.025,
  },
  abilities: {
    Q: {
      id: id<AbilityId>("thorne.q"),
      name: "Thorn Lash",
      slot: "Q",
      castType: "dash",
      maxRank: 5,
      cooldown: [9, 8, 7, 6, 5],
      manaCost: [40, 40, 40, 40, 40],
      range: 6,
      effects: [
        { kind: "dash", mode: "forward", speed: 28, maxDistance: 6 },
      ],
      vfxKey: "fx.thorn-lash",
    },
    W: {
      id: id<AbilityId>("thorne.w"),
      name: "Barkskin Bulwark",
      slot: "W",
      castType: "self",
      maxRank: 5,
      cooldown: [14, 13, 12, 11, 10],
      manaCost: [50, 55, 60, 65, 70],
      range: 0,
      effects: [
        {
          kind: "shield",
          amount: { flat: 60, perRank: [50, 85, 120, 155, 190], ratios: [{ stat: Stat.MaxHealth, coeff: 0.06 }] },
          duration: 3,
        },
        {
          kind: "applyBuff",
          modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 30 }],
          duration: 3,
        },
      ],
      vfxKey: "fx.barkskin",
    },
    E: {
      id: id<AbilityId>("thorne.e"),
      name: "Root Snare",
      slot: "E",
      castType: "skillshot",
      maxRank: 5,
      cooldown: [13, 12, 11, 10, 9],
      manaCost: [60, 65, 70, 75, 80],
      range: 10,
      effects: [
        {
          kind: "spawnProjectile",
          projectileId: id<ProjectileId>("thorne.e.thorn"),
          onHit: [
            {
              kind: "damage",
              damageType: "physical",
              amount: { flat: 20, perRank: [40, 70, 100, 130, 160], ratios: [{ stat: Stat.AttackDamage, coeff: 0.6 }] },
            },
            { kind: "applyStatus", statusId: id<StatusId>("root"), duration: 1.25, root: true },
          ],
        },
      ],
      vfxKey: "fx.root-snare",
    },
    R: {
      id: id<AbilityId>("thorne.r"),
      name: "Bramble Burst",
      slot: "R",
      castType: "ground",
      maxRank: 3,
      cooldown: [100, 85, 70],
      manaCost: [100, 100, 100],
      range: 1,
      radius: 4.5,
      targetsEnemies: true,
      castTimeSec: 0.4,
      effects: [
        {
          kind: "damage",
          damageType: "physical",
          amount: { perRank: [150, 250, 350], ratios: [{ stat: Stat.AttackDamage, coeff: 0.8 }] },
        },
        {
          kind: "applyStatus",
          statusId: id<StatusId>("slow40"),
          duration: 2,
          moveSpeedMult: 0.6,
        },
      ],
      vfxKey: "fx.bramble-burst",
    },
  },
  passive: {
    name: "Barkskin",
    // flat bonus armor baked as a permanent modifier source
    modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 8 }],
  },
  skillOrder: ["E", "Q", "W", "R"],
  buildPriority: [id<ItemId>("serrated-edge"), id<ItemId>("ironhide-vest")],
  tags: ["bruiser", "engage", "melee"],
};

// ---------- items ----------
const ITEMS: ItemDef[] = [
  {
    id: id<ItemId>("ember-rod"),
    name: "Ember Rod",
    cost: 900,
    tier: 2,
    modifiers: [{ stat: Stat.AbilityPower, op: ModOp.Flat, value: 45 }],
    tags: ["ap"],
  },
  {
    id: id<ItemId>("ironhide-vest"),
    name: "Ironhide Vest",
    cost: 1000,
    tier: 2,
    modifiers: [
      { stat: Stat.Armor, op: ModOp.Flat, value: 45 },
      { stat: Stat.MaxHealth, op: ModOp.Flat, value: 150 },
    ],
    tags: ["tank"],
  },
  {
    id: id<ItemId>("serrated-edge"),
    name: "Serrated Edge",
    cost: 1100,
    tier: 3,
    modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 35 }],
    passive: [
      {
        on: "onBasicAttack",
        effects: [
          {
            kind: "damage",
            damageType: "physical",
            amount: { flat: 8, ratios: [{ stat: Stat.AttackDamage, coeff: 0.15 }] },
          },
        ],
      },
    ],
    tags: ["ad", "onhit"],
  },
  {
    id: id<ItemId>("swift-boots"),
    name: "Swift Boots",
    cost: 600,
    tier: 1,
    unique: true,
    modifiers: [{ stat: Stat.MoveSpeed, op: ModOp.Flat, value: 1.2 }],
    tags: ["boots"],
  },
];

// ---------- augments ----------
const AUGMENTS: AugmentDef[] = [
  {
    id: id<AugmentId>("bloodlust"),
    name: "Bloodlust",
    description: "+15% Attack Damage and +8% Lifesteal.",
    tier: "silver",
    weight: 100,
    modifiers: [
      { stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 0.15 },
      { stat: Stat.Lifesteal, op: ModOp.Flat, value: 0.08 },
    ],
    tags: ["ad", "sustain"],
  },
  {
    id: id<AugmentId>("chill-touch"),
    name: "Chill Touch",
    description: "Your Q also slows enemies by 25% for 1.5s.",
    tier: "gold",
    weight: 60,
    hooks: [
      {
        on: "onAbilityHit",
        abilitySlot: "Q",
        effects: [
          {
            kind: "applyStatus",
            statusId: id<StatusId>("slow25"),
            duration: 1.5,
            moveSpeedMult: 0.75,
          },
        ],
      },
    ],
    tags: ["utility"],
  },
  {
    id: id<AugmentId>("aegis-surge"),
    name: "Aegis Surge",
    description: "On ability cast, gain a shield for 8% max HP (3s cooldown).",
    tier: "prismatic",
    weight: 30,
    hooks: [
      {
        on: "onAbilityCast",
        internalCooldown: 3,
        effects: [
          {
            kind: "shield",
            amount: { ratios: [{ stat: Stat.MaxHealth, coeff: 0.08 }] },
            duration: 2.5,
          },
        ],
      },
    ],
    tags: ["defense"],
  },
];

const ROUND_LOOT: LootTable = {
  id: "round-reward",
  entries: [
    { itemId: id<ItemId>("ember-rod"), weight: 30 },
    { itemId: id<ItemId>("ironhide-vest"), weight: 30 },
    { itemId: id<ItemId>("serrated-edge"), weight: 25 },
    { itemId: id<ItemId>("swift-boots"), weight: 15 },
  ],
};

let registered = false;

/** Idempotent registration of all skeleton content. */
export function registerSkeletonContent(): void {
  if (registered) return;
  registered = true;
  for (const p of PROJECTILES) Projectiles.register(p.id, p);
  registerChampion(SELA);
  registerChampion(THORNE);
  for (const i of ITEMS) Items.register(i.id, i);
  for (const a of AUGMENTS) Augments.register(a.id, a);
  LootTables.register(ROUND_LOOT.id, ROUND_LOOT);
}
