/**
 * statPreview — "what would my stats be if I owned this", answered by the REAL
 * shared pipeline and nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS CANNOT BE A UI RE-DERIVATION
 * ---------------------------------------------------------------------------
 * The sim's stat model is LAYERED and clamped and then scaled by task #28's
 * global combat-env table (an operator can change it live):
 *
 *     final = clamp_ENV( (base + Σflat) · (1 + ΣpctAdd) · Π pctMult ,  env )
 *
 * so a percentage item's real `+N` depends on the champion's CURRENT base+flat
 * (it changes as they buy other items), two flat items do not simply add when a
 * clamp bites, and the same item previews differently under different env
 * settings. Echoing the raw modifier value is wrong for every one of those
 * cases — and those are exactly the cases where a player is making a real
 * decision. So the preview is computed by SPAWNING a scratch champion in a
 * throwaway `SimWorld`, attaching the reconstructed inventory (plus the
 * hypothetical item), and running the SAME `recomputeStats` the server runs.
 * statPreview.test.ts pins this against the real sim so the two can never drift.
 *
 * ---------------------------------------------------------------------------
 * RECONSTRUCTION, AND THE ONE THING IT CANNOT SEE
 * ---------------------------------------------------------------------------
 * The client never receives the champion's `sc.sources` — only a `SeatView`.
 * Every source is rebuilt from it against the content registries:
 *   champion passive       ← Champions.get(championId).passive
 *   ability passives Q/W/E/R/EX ← SeatView.abilityRanks + exAbilityId/exRank
 *   items                  ← SeatView.items
 *   augments               ← SeatView.augments
 *   capstone (傳說·萬象強化) ← capstoneModifiers(SeatView.statCapstonePct)
 *
 * The 20 stat-tick rolls (`stat:<N>`, economy/statPath.ts) are the ONE source
 * NOT on the wire: only the streak COUNT rides `SeatView.statStacks`, and the
 * streak resets to 0 on any item purchase while the rolled sources stay
 * attached — so a player who dabbled in the stat path then bought an item
 * carries flat bonuses the client cannot see. We detect that honestly rather
 * than paper over it: `previewExactness` compares the reconstructed maxHealth /
 * maxMana against the authoritative values the wire DOES carry (EntityState hp)
 * and reports whether the panel can be trusted to the last point. For every
 * UNCLAMPED stat the item DELTA is exact regardless (a hidden flat never shifts
 * another source's multiplier); only a clamped stat's delta can be off, and only
 * when a hidden tick rolled that same stat — which is what the exactness flag
 * warns about.
 */
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { syncAbilityPassives } from "@ggd/shared/sim/abilities/abilityPassives";
import { attachSource, recomputeStats } from "@ggd/shared/sim/stats/statPipeline";
import { Champions, Items, Augments } from "@ggd/shared/sim/content/registry";
import { capstoneModifiers } from "@ggd/shared/sim/economy/itemTiers";
import { ALL_STATS, Stat, type StatBlock } from "@ggd/shared/sim/stats/statTypes";
import {
  DEFAULT_COMBAT_ENV,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";
import {
  asSeatId,
  asTeamId,
  type AugmentId,
  type ChampionId,
  type EntityId,
  type ItemId,
} from "@ggd/shared/ids";

/** Everything the pipeline needs about the local champion, from a SeatView. */
export interface ChampionStatContext {
  championId: string;
  level: number;
  /** Q W E R ranks (SeatView.abilityRanks). Missing entries read as 0. */
  abilityRanks: readonly number[];
  exAbilityId?: string;
  exRank?: number;
  /** 6 inventory slots ("" = empty), SeatView.items. */
  items: readonly string[];
  augments: readonly string[];
  statCapstonePct: number;
  /** live combat-env table; defaults to neutral if absent. */
  env?: CombatEnvMultipliers;
}

const ZERO_ITEMS: readonly string[] = ["", "", "", "", "", ""];

/**
 * Spawn a scratch champion and attach the reconstructed inventory. Uses the
 * REAL sim entry points (spawnChampion / syncAbilityPassives / attachSource /
 * recomputeStats) so there is no second implementation to keep in sync.
 * Returns null when the champion is not in the registry (champ-select, an
 * un-whitelisted hero) — the caller renders no panel rather than a wrong one.
 */
function buildWorld(ctx: ChampionStatContext): { world: SimWorld; id: EntityId } | null {
  if (!Champions.tryGet(ctx.championId as ChampionId)) return null;

  const world = new SimWorld(SKELETON_ARENA, 1);
  world.combatEnv = ctx.env ?? DEFAULT_COMBAT_ENV;
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = spawnChampion(world, {
    championId: ctx.championId as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
    level: Math.max(1, Math.floor(ctx.level) || 1),
  });

  // ability ranks → ability-passive sources (spawn left Q at rank 1)
  const ab = world.abilities.get(id);
  if (ab) {
    ab.slots.Q.rank = ctx.abilityRanks[0] ?? ab.slots.Q.rank;
    ab.slots.W.rank = ctx.abilityRanks[1] ?? 0;
    ab.slots.E.rank = ctx.abilityRanks[2] ?? 0;
    ab.slots.R.rank = ctx.abilityRanks[3] ?? 0;
    if (ab.exSlot && (ctx.exRank ?? 0) > 0) ab.exSlot.rank = ctx.exRank!;
    syncAbilityPassives(world, id);
  }

  // items (owned) into their reported slots, attached exactly as buyItem does
  const champ = world.champion.get(id);
  if (champ) {
    const items = ctx.items.length > 0 ? ctx.items : ZERO_ITEMS;
    items.forEach((itemId, slot) => {
      if (!itemId || slot >= champ.items.length) return;
      const def = Items.tryGet(itemId as ItemId);
      if (!def) return;
      champ.items[slot] = itemId as ItemId;
      attachSource(world, id, {
        id: `item:${itemId}#${slot}`,
        kind: "item",
        modifiers: def.modifiers,
        hooks: def.passive,
      });
    });
  }

  // augments (as draft.ts attaches them)
  for (const augId of ctx.augments) {
    const def = Augments.tryGet(augId as AugmentId);
    if (!def) continue;
    attachSource(world, id, {
      id: `aug:${augId}`,
      kind: "augment",
      modifiers: def.modifiers,
      hooks: def.hooks,
    });
  }

  // capstone (statPath.ts grantCapstone) — rebuilt from its rolled magnitude
  if (ctx.statCapstonePct > 0) {
    attachSource(world, id, {
      id: "stat:capstone",
      kind: "augment",
      modifiers: capstoneModifiers(ctx.statCapstonePct),
    });
  }

  recomputeStats(world, id);
  return { world, id };
}

/** Snapshot a StatBlock (the pipeline's cache is a live object). */
function copyBlock(b: StatBlock): StatBlock {
  const out = {} as StatBlock;
  for (const s of ALL_STATS) out[s] = b[s];
  return out;
}

/**
 * The champion's CURRENT stat block, resolved through the pipeline. null when
 * the champion is not reconstructable (see buildWorld).
 */
export function computeStatBlock(ctx: ChampionStatContext): StatBlock | null {
  const built = buildWorld(ctx);
  if (!built) return null;
  return copyBlock(built.world.stats.get(built.id)!.final);
}

export interface ItemPreview {
  /** false when the sim would refuse the buy for a reason the panel can see. */
  buyable: boolean;
  reason?: "slot-full" | "unknown-item";
  before: StatBlock;
  after: StatBlock;
  /** after − before, only the stats that actually moved. */
  deltas: Partial<Record<Stat, number>>;
}

/**
 * Preview owning `itemId` ON TOP of the champion's current inventory: attach it
 * into the next free slot and re-run the pipeline. The delta is the exact change
 * the server will produce (same code, same env, same clamps). `slot-full`
 * mirrors the sim's `no-slot`, so the panel and the server agree on refusal.
 */
export function previewItem(ctx: ChampionStatContext, itemId: string): ItemPreview | null {
  const built = buildWorld(ctx);
  if (!built) return null;
  const { world, id } = built;
  const before = copyBlock(world.stats.get(id)!.final);

  const def = Items.tryGet(itemId as ItemId);
  if (!def) return { buyable: false, reason: "unknown-item", before, after: before, deltas: {} };

  const champ = world.champion.get(id)!;
  const slot = champ.items.findIndex((s) => s === null);
  if (slot < 0) return { buyable: false, reason: "slot-full", before, after: before, deltas: {} };

  champ.items[slot] = itemId as ItemId;
  attachSource(world, id, {
    id: `item:${itemId}#${slot}`,
    kind: "item",
    modifiers: def.modifiers,
    hooks: def.passive,
  });
  recomputeStats(world, id);
  const after = copyBlock(world.stats.get(id)!.final);

  const deltas: Partial<Record<Stat, number>> = {};
  for (const s of ALL_STATS) {
    const d = after[s] - before[s];
    if (d !== 0) deltas[s] = d;
  }
  return { buyable: true, before, after, deltas };
}

export interface Exactness {
  /** true when the reconstruction accounts for every source the server has. */
  exact: boolean;
  /** why not, for the panel's disclosure line. */
  reason?: "hidden-stat-ticks";
}

/**
 * Can the panel be trusted to the last point? It can, unless the champion is
 * carrying stat-tick rolls the wire never sent (economy/statPath.ts). Two
 * independent tells: an active streak (`statStacks > 0`), and a reconstructed
 * maxHealth / maxMana that disagrees with the authoritative value the wire DID
 * carry (a post-reset residual that moved HP or mana). Either one flips the
 * panel into its "≈" disclosure; the item deltas stay exact for every unclamped
 * stat regardless.
 */
export function previewExactness(
  reconBlock: StatBlock,
  opts: {
    statStacks: number;
    authMaxHp?: number;
    authMaxMana?: number;
  },
): Exactness {
  if (opts.statStacks > 0) return { exact: false, reason: "hidden-stat-ticks" };
  const agrees = (recon: number, auth?: number): boolean => {
    if (auth === undefined || auth <= 0) return true; // nothing to check against
    return Math.abs(recon - auth) <= Math.max(1.5, auth * 0.01);
  };
  if (!agrees(reconBlock[Stat.MaxHealth], opts.authMaxHp)) {
    return { exact: false, reason: "hidden-stat-ticks" };
  }
  if (!agrees(reconBlock[Stat.MaxMana], opts.authMaxMana)) {
    return { exact: false, reason: "hidden-stat-ticks" };
  }
  return { exact: true };
}

/** Build a stat context straight off the SeatView-shaped fields the HUD holds. */
export function statContextFromSeat(
  seat: {
    championId: string;
    level: number;
    abilityRanks: readonly number[];
    exAbilityId: string;
    exRank: number;
    items: readonly string[];
    augments: readonly string[];
    statCapstonePct: number;
  },
  env?: CombatEnvMultipliers,
): ChampionStatContext {
  return {
    championId: seat.championId,
    level: seat.level,
    abilityRanks: seat.abilityRanks,
    exAbilityId: seat.exAbilityId,
    exRank: seat.exRank,
    items: seat.items,
    augments: seat.augments,
    statCapstonePct: seat.statCapstonePct,
    env,
  };
}
