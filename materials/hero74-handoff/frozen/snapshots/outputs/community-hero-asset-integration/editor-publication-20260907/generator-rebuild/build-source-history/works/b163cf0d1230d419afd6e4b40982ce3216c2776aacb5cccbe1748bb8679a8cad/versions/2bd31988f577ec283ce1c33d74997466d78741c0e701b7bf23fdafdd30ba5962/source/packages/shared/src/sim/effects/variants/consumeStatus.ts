import type { StatusId } from "../../../ids";
import type { EffectDef } from "../effect";

export interface ConsumeStatusVariant {
  kind: "consumeStatus";
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  statusId: StatusId;
  count: number | "all";
  /** self: debit once, preserve the shaped target list for the selected branch.
   * target (default): decide separately for each shaped target. */
  subject?: "self" | "target";
  /** Missing = all appliers. self = only records explicitly owned by caster. */
  appliedBy?: "self";
  onConsumed: EffectDef[];
  onMissing?: EffectDef[];
}
