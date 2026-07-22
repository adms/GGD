/**
 * Tier-0 AI driver: functional-but-dumb, per the plan.
 * Combat: acquire the nearest living enemy in the zone, attack-move at it,
 * cast any ready ability at it (self-buffs on self). Non-combat: step along the
 * champion's buildPriority (first unowned affordable item), rank abilities per
 * skillOrder, ready-up. Thinks every AI_REPLAN_INTERVAL_TICKS, staggered by
 * seat so 12 brains never spike one tick.
 */
import { AI_REPLAN_INTERVAL_TICKS } from "@ggd/shared/constants";
import type { EntityId, ItemId } from "@ggd/shared/ids";
import type { Command, IntentFrame, Order } from "@ggd/shared/sim/intents";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import { distSq } from "@ggd/shared/sim/math/vec2";
import type { Seat, SeatDriver } from "../seat/Seat";

/** Below this HP fraction the bot prefers an in-zone healing flower. */
const FLOWER_SEEK_HP_PCT = 0.65;
/** Max distance (units) at which a flower is worth walking to. */
const FLOWER_SEEK_RANGE = 12;

/**
 * Max distance (units) at which a bot walks to its team's REVIVE CIRCLE
 * (task #84). 18u covers the MAXIMUM measured death-to-nearest-ally distance
 * (17.04u over 406 revivable deaths), so a bot never ignores a circle it could
 * physically have reached inside the 6s lifetime — and never crosses the whole
 * 24u-radius zone for one it could not.
 *
 * Tier-0 is deliberately dumb: no risk assessment, no "am I winning this
 * fight". It walks in and stands there, exactly like the flower rule, and its
 * abilities keep firing at the enemy meanwhile. Without this the mechanic is
 * invisible in every bot match and a human playtesting with bot teammates
 * would never once be revived.
 */
const REVIVE_SEEK_RANGE = 18;

/**
 * The next item to buy off a build path: the first entry we do not already own,
 * can afford, and are actually allowed to buy. Returns null when the build is
 * finished, unaffordable, or the inventory is full.
 *
 * CONTRACT: buildPriority is authored in ASCENDING cost order. The two rules
 * together are what make a bot climb its own ladder — skipping owned entries
 * advances it one step per purchase, and ascending order means "can't afford
 * the next step" makes it SAVE rather than skip ahead to something cheaper.
 * Without the owned-check the loop re-picks entry #1 every replan and the bot
 * finishes the match on one item.
 *
 * `buyable` is the BUILD-TOLERANCE seam (task #70). MatchController drops a
 * `buyItem` command for a non-whitelisted item BEFORE the sim sees it, so a
 * buildPriority entry the operator has not enabled can never be owned — and
 * without this predicate the loop re-picks that same entry on every replan and
 * the bot stalls on it FOREVER, buying nothing else for the rest of the match.
 * That is a live case, not a hypothetical: godie-i003 聖光石 sits in seven of
 * the thirteen demo-starter builds and is excluded from the shop because its
 * whole payload is an unported active (see starter.go gate S3). Skipping such
 * an entry, instead of stopping at it, is the difference between a bot that
 * finishes its ladder and a bot frozen at rung one. Defaults to "everything is
 * buyable", so the no-whitelist path is unchanged.
 */
export function nextBuildPurchase(
  build: readonly ItemId[],
  owned: readonly (ItemId | null)[],
  gold: number,
  costOf: (id: ItemId) => number | null,
  buyable: (id: ItemId) => boolean = () => true,
): ItemId | null {
  if (!owned.includes(null)) return null; // no free slot
  for (const itemId of build) {
    if (owned.includes(itemId)) continue;
    if (!buyable(itemId)) continue; // skip, never stall (see above)
    const cost = costOf(itemId);
    // A 0g rung is a DRAFT/LEGENDARY reward, not a shop entry (task #82): the
    // sim refuses to sell it, so `gold >= 0` would otherwise make the bot
    // re-issue a rejected buy every replan and stall forever — the same
    // never-stall rule as the whitelist skip above.
    if (cost !== null && cost > 0 && gold >= cost) return itemId;
  }
  return null;
}

export class AIDriver implements SeatDriver {
  readonly kind = "ai" as const;
  private plan: { order?: Order; commands: Command[] } = { commands: [] };
  private didReady = false;

  /**
   * @param buyable optional purchasability predicate (the match's content
   * whitelist). Omitted = everything is buyable, the pre-whitelist behavior.
   */
  constructor(private readonly buyable?: (id: ItemId) => boolean) {}

  onAttach(_seat: Seat): void {
    this.plan = { commands: [] };
  }

  onDetach(): void {
    this.plan = { commands: [] };
  }

  produceIntent(seat: Seat, world: SimWorld, tick: number): IntentFrame {
    // staggered re-plan: seat k thinks on ticks where tick % N == k % N
    if (tick % AI_REPLAN_INTERVAL_TICKS === seat.seatId % AI_REPLAN_INTERVAL_TICKS) {
      this.replan(seat, world);
    }
    const frame: IntentFrame = { order: this.plan.order, commands: this.plan.commands };
    this.plan = { order: undefined, commands: [] }; // orders are sticky in the sim; commands consumed
    return frame;
  }

  private replan(seat: Seat, world: SimWorld): void {
    const id = seat.entityId;
    if (id === null) return;
    const t = world.transform.get(id);
    const hp = world.health.get(id);
    const commands: Command[] = [];

    if (!t || !hp?.alive) {
      this.plan = { commands };
      return;
    }

    // ----- intermission decisions -----
    if (world.economyOpen) {
      const champ = world.champion.get(id);
      const ab = world.abilities.get(id);
      if (champ && ab) {
        // rank up per skill order
        if (ab.unspentPoints > 0) {
          const def = Champions.tryGet(champ.championId);
          for (const slot of def?.skillOrder ?? ["Q", "W", "E", "R"]) {
            commands.push({ kind: "rankUpAbility", slot });
          }
        }
        // walk the champion's build path one affordable step at a time
        const def = Champions.tryGet(champ.championId);
        const buy = nextBuildPurchase(
          (def?.buildPriority ?? []) as ItemId[],
          champ.items,
          champ.gold,
          (itemId) => Items.tryGet(itemId)?.cost ?? null,
          this.buyable,
        );
        if (buy !== null) commands.push({ kind: "buyItem", itemId: buy });
        if (!this.didReady) {
          commands.push({ kind: "ready" });
          this.didReady = true;
        }
      }
    } else {
      this.didReady = false;
    }

    // ----- combat: nearest living enemy in my zone -----
    const myTeam = world.team.get(id);
    let nearest: EntityId | null = null;
    let nearestD2 = Infinity;
    for (const [otherId, otherTeam] of world.team) {
      if (otherId === id) continue;
      if (myTeam && otherTeam.teamId === myTeam.teamId) continue;
      if (!world.champion.has(otherId)) continue;
      const oh = world.health.get(otherId);
      const ot = world.transform.get(otherId);
      if (!oh?.alive || !ot || ot.zone !== t.zone) continue;
      const d2 = distSq(t.pos, ot.pos);
      if (d2 < nearestD2) {
        nearestD2 = d2;
        nearest = otherId;
      }
    }

    // ----- utility rule: hurt + a healing flower nearby -> harvest it -----
    // (flowers only exist during combat; deterministic: lowest-distance, then
    // lowest id via ascending store iteration)
    let flowerTarget: EntityId | null = null;
    if (hp.maxHp > 0 && hp.hp < hp.maxHp * FLOWER_SEEK_HP_PCT) {
      let bestD2 = FLOWER_SEEK_RANGE * FLOWER_SEEK_RANGE;
      for (const [fid, f] of world.flower) {
        if (f.zone !== t.zone) continue;
        const ft = world.transform.get(fid);
        const fhp = world.health.get(fid);
        if (!ft || !fhp?.alive) continue;
        const d2 = distSq(t.pos, ft.pos);
        if (d2 < bestD2) {
          bestD2 = d2;
          flowerTarget = fid;
        }
      }
    }

    let order: Order | undefined;
    if (nearest !== null) {
      order = { kind: "attackTarget", entity: nearest };
      // cast any ready, learned ability
      const ab = world.abilities.get(id);
      const tgtT = world.transform.get(nearest)!;
      if (ab) {
        for (const slot of ["Q", "W", "E", "R"] as const) {
          const inst = ab.slots[slot];
          if (inst.rank <= 0 || inst.cooldownRemainingTicks > 0) continue;
          const abilityDef = Champions.tryGet(world.champion.get(id)!.championId)?.abilities[slot];
          if (!abilityDef) continue;
          const mana = abilityDef.manaCost[inst.rank - 1] ?? 0;
          if ((world.health.get(id)?.mana ?? 0) < mana) continue;

          switch (abilityDef.castType) {
            case "self":
              commands.push({ kind: "castAbility", slot, target: { type: "self" } });
              break;
            case "targeted":
              if (nearestD2 <= abilityDef.range * abilityDef.range)
                commands.push({ kind: "castAbility", slot, target: { type: "entity", entityId: nearest } });
              break;
            case "skillshot":
            case "dash": {
              // Exactly the range the sim honours. The old 1.2 fudge factor let
              // the bot fire from 10% beyond its reach: the skillshot is
              // direction-based so it simply fell short, burning mana and the
              // cooldown for a shot that could never connect.
              if (nearestD2 <= abilityDef.range * abilityDef.range) {
                const dir = { x: tgtT.pos.x - t.pos.x, z: tgtT.pos.z - t.pos.z };
                commands.push({ kind: "castAbility", slot, target: { type: "dir", dir } });
              }
              break;
            }
            case "ground":
              if (nearestD2 <= abilityDef.range * abilityDef.range)
                commands.push({
                  kind: "castAbility",
                  slot,
                  target: { type: "point", point: { x: tgtT.pos.x, z: tgtT.pos.z } },
                });
              break;
          }
        }
      }
    }

    // the flower wins the ORDER slot when hurt (abilities above still fire at
    // the enemy — the bot heals up while continuing the fight)
    if (flowerTarget !== null) {
      order = { kind: "attackTarget", entity: flowerTarget };
    }

    // ----- utility rule: my team dropped a revive circle -> go stand in it ---
    // Outranks the flower: 18% HP is worth less than a whole teammate. A circle
    // is ground area, not a unit, so this is a MOVE order (attackTarget would
    // find nothing to hit); arriving is the channel. Deterministic — the
    // reviveCircle store iterates in ascending id order.
    if (world.reviveRules) {
      let bestD2 = REVIVE_SEEK_RANGE * REVIVE_SEEK_RANGE;
      let seek: { x: number; z: number } | null = null;
      for (const [cid, rc] of world.reviveCircle) {
        if (rc.zone !== t.zone) continue;
        if (!myTeam || rc.teamId !== myTeam.teamId) continue; // only my own team's
        if (rc.ownerId === id) continue; // cannot channel your own corpse
        const ct = world.transform.get(cid);
        if (!ct) continue;
        const d2 = distSq(t.pos, ct.pos);
        if (d2 < bestD2) {
          bestD2 = d2;
          seek = { x: ct.pos.x, z: ct.pos.z };
        }
      }
      if (seek) order = { kind: "move", point: seek };
    }

    this.plan = { order, commands };
  }
}
