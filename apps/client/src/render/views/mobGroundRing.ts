/**
 * #247 —— 「這具身體腳下的圈圈要畫多大」, as ONE testable decision.
 *
 * ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
 *
 * It was inlined in `GameApp`'s `groundRingDiameterFor` hook first, and a
 * mutation run measured what that costs: replacing the whole expression with
 * `null` — i.e. deleting owner's 「圈圈會比較大」 outright — left BOTH typecheck
 * and every test green. `GameApp` is the composition root; nothing drives it
 * headlessly, so any decision that lives there is a decision nothing guards
 * (失敗形狀 ③, one layer above the render tree).
 *
 * So the decision moves here and `GameApp` keeps only the wire. Exactly the
 * shape `entityTintFor` (render/views/mobTint.ts) already uses for the tint
 * half of the same table, and for the same reason.
 *
 * ⚠️ MOBS ONLY, and that is the load-bearing half. A champion keeps
 * `ChampionView`'s built-in ring: it is the TEAM-IDENTITY affordance, it must be
 * the same size on every player, and #231 flags team colour as the highest-risk
 * surface in this area. Returning a number for a champion here would resize
 * twelve players' rings to whatever the zombie table happens to say.
 */
import { ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { mobGroundRingDiameter, type MobVisualTable } from "@ggd/shared/sim/mobs";
import type { EntityViewState } from "../EntityViewRegistry";

/**
 * The ground-ring diameter for `e` in GGD units, or `null` for 「use the view's
 * own champion ring」.
 *
 * `mobScale` is the per-entity 體型倍率 off the wire (`EntityState.mana`); absent
 * — a pre-GH#192 server, or a world that never armed the mechanic — reads as 1×,
 * which `mobGroundRingDiameter` turns back into the champion ring exactly.
 */
export function mobRingDiameterFor(
  e: Pick<EntityViewState, "kind" | "mobScale">,
  table: MobVisualTable,
): number | null {
  if (e.kind !== ENTITY_KIND.MOB) return null;
  return mobGroundRingDiameter(e.mobScale ?? 1, table);
}
