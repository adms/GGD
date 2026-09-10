import type { AbilityId, EntityId } from "../../ids";
import type { CastableSlot } from "../intents";

/** One accepted player cast, shared by its immediate and deferred payloads. */
export interface CastInstance {
  readonly caster: EntityId;
  readonly abilityId: AbilityId;
  readonly slot: CastableSlot;
  readonly tick: number;
  readonly serial: number;
  /** Logical owner/source/hook keys which have already received this cast. */
  readonly creditedHooks: string[];
}
