/**
 * shopAccess — THE single rule for 「現在可以開商店嗎？」, and the only place it
 * may live.
 *
 * WHY THIS EXISTS (task #38). The shop used to be gated by one global boolean,
 * `world.economyOpen`, consulted inline in CommandSystem:
 *
 *     case "buyItem":
 *       if (world.economyOpen) buyItem(world, entity, cmd.itemId as ItemId);
 *
 * Two things were wrong with that. First it is BINARY — it cannot express the
 * arena rule the design actually wants, 「這一輪已經被打倒的人，到本輪結束前還
 * 能繼續買東西」: a champion who died this combat round keeps shop access until
 * the round resolves, while their living opponents do not. Second, both the
 * out-of-phase drop AND every `BuyResult` from `buyItem` were SWALLOWED (task
 * #60), so a player who could not afford an item, had no free slot, or already
 * owned a unique got a dead button and no explanation.
 *
 * So the rule is factored out here, expressed over a THREE-VALUE phase plus the
 * requester's own alive state, and returns a REASON on denial:
 *
 *   prep    → open for everyone (intermission = 備戰時間)
 *   combat  → open ONLY to a champion who is down this round
 *   closed  → open to nobody (champ select / resolution / match end)
 *
 * The client HUD mirrors the same predicate for button-enablement, but it is
 * pure convenience: the SERVER runs this on the authoritative world in
 * CommandSystem, so a hand-rolled `buyItem` command sent during combat by a
 * living champion is rejected no matter what the sender's UI believed.
 *
 * Pure and dependency-light on purpose: {@link shopOpen} takes plain values so
 * both sides can call it (the client only ever knows the phase STRING and its
 * own alive flag, never `world.economyOpen`), and {@link shopAccess} is the
 * thin SimWorld adapter the sim uses.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";

/**
 * The shop-relevant projection of a match phase. Deliberately coarser than
 * `MatchPhase` — champSelect / resolution / matchEnd all shop-behave the same,
 * and collapsing them means a new phase can never silently open the shop.
 */
export type ShopPhase = "prep" | "combat" | "closed";

/** Why a shop action was refused. `ok` never appears here — see ShopAccess. */
export type ShopDenyReason =
  /** the requester has no champion entity (pre-spawn / spectator) */
  | "no-champion"
  /** combat is live and the requester is still standing — the headline rule */
  | "combat-alive"
  /** not a shopping phase at all (champ select / resolution / match end) */
  | "phase-closed";

export type ShopAccess = { readonly open: true } | { readonly open: false; readonly reason: ShopDenyReason };

const OPEN: ShopAccess = { open: true };
const DENY_COMBAT_ALIVE: ShopAccess = { open: false, reason: "combat-alive" };
const DENY_PHASE: ShopAccess = { open: false, reason: "phase-closed" };
const DENY_NO_CHAMPION: ShopAccess = { open: false, reason: "no-champion" };

/**
 * THE RULE, pure. `alive` is the REQUESTER's own state — during combat only a
 * champion who is already down may shop, which is what makes death in a duel a
 * head start on the next round instead of pure dead time.
 */
export function shopOpen(phase: ShopPhase, alive: boolean): ShopAccess {
  if (phase === "prep") return OPEN;
  if (phase === "combat") return alive ? DENY_COMBAT_ALIVE : OPEN;
  return DENY_PHASE;
}

/**
 * Map a `MatchPhase` name onto the shop's three-value phase. Lives here (not in
 * the client) so the HUD gate and the sim gate can never drift apart; an
 * unknown/absent phase string is treated as CLOSED, which is the safe default.
 */
export function shopPhaseOf(matchPhase: string): ShopPhase {
  if (matchPhase === "intermission") return "prep";
  if (matchPhase === "combat") return "combat";
  return "closed";
}

/**
 * SimWorld adapter — the authoritative call site (CommandSystem). Derives the
 * shop phase from the two flags the match host already maintains:
 * `economyOpen` is set for the whole intermission and `combatActive` for the
 * whole combat round, so no new state is introduced and determinism is
 * unaffected (both flags are plain world state the client replays).
 */
export function shopAccess(world: SimWorld, entity: EntityId): ShopAccess {
  if (!world.champion.has(entity)) return DENY_NO_CHAMPION;
  const phase: ShopPhase = world.economyOpen ? "prep" : world.combatActive ? "combat" : "closed";
  // A champion with no health component cannot be proven down, so it is treated
  // as alive — denial is the safe direction for an authoritative gate.
  const alive = world.health.get(entity)?.alive ?? true;
  return shopOpen(phase, alive);
}
