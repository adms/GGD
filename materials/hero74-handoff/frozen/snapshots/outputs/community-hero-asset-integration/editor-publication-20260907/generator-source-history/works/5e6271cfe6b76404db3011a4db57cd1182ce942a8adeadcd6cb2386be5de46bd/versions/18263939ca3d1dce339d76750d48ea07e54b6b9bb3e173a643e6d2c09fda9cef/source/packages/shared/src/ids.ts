/** Branded numeric id types — cheap, comparable, GC-friendly, and type-safe. */

export type EntityId = number & { readonly __brand: "EntityId" };
export type SeatId = number & { readonly __brand: "SeatId" };
export type TeamId = number & { readonly __brand: "TeamId" };

export const asEntityId = (n: number): EntityId => n as EntityId;
export const asSeatId = (n: number): SeatId => n as SeatId;
export const asTeamId = (n: number): TeamId => n as TeamId;

/** String ids for data-driven content (champions, abilities, items, …). */
export type ChampionId = string & { readonly __brand: "ChampionId" };
export type AbilityId = string & { readonly __brand: "AbilityId" };
export type ItemId = string & { readonly __brand: "ItemId" };
export type AugmentId = string & { readonly __brand: "AugmentId" };
export type ProjectileId = string & { readonly __brand: "ProjectileId" };
export type StatusId = string & { readonly __brand: "StatusId" };
export type VfxId = string & { readonly __brand: "VfxId" };
export type ArenaId = string & { readonly __brand: "ArenaId" };
export type ModelId = string & { readonly __brand: "ModelId" };
