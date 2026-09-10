import type { Scaling } from "../effect";
import type { RankScalar } from "../../perRank";

/** Nonlethal payment by the caster, once per effect execution. */
export interface SpendHealthVariant {
  kind: "spendHealth";
  amount: Scaling;
  /** Additional fraction of the caster's maximum health, read at payment. */
  pctMaxHealth?: RankScalar;
  /** Additional fraction of the caster's current health, read at payment. */
  pctCurrentHealth?: RankScalar;
  /** Default 1. A caster already below this floor is never healed. */
  minimumHp?: number;
}
