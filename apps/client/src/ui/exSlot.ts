/**
 * exSlotView — the pure "should the EX button show, and what does it read" logic
 * shared by the desktop AbilityBar, the touch bar, and the couch HUD. Returns
 * null when the hero has no EX skill (exAbilityId "") or it is still LOCKED
 * (exRank 0), so the button renders ONLY once the EX unlocks. Pure + node-testable.
 */
import { TICK_HZ } from "@ggd/shared/constants";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { CastType } from "@ggd/shared/sim/content/defs";
import { docDescription } from "./components/abilityText";

export interface ExSlotSeat {
  exAbilityId: string;
  exRank: number;
  exCooldown: number;
}

export interface ExSlotView {
  /** EX ability display name (real Chinese map name, still numbered) */
  name: string;
  /** remaining cooldown in seconds */
  cdSecs: number;
  /** cooldown sweep fraction 0..1 (0 = ready) */
  sweep: number;
  /** w3x icon path ("assets/icons/…") or undefined → amber EX fallback tile */
  icon?: string;
  /** full cooldown (seconds) for the tooltip meta row */
  cooldownSec: number;
  /** cast type for the tooltip meta row */
  castType: CastType;
  /** rank-1 mana cost for the tooltip (omitted when 0) */
  manaCost?: number;
  /** human tooltip description recovered from the w3x source (#8) */
  description?: string;
}

export function exSlotView(seat: ExSlotSeat): ExSlotView | null {
  if (!seat.exAbilityId || seat.exRank <= 0) return null; // no EX / still locked
  const def = Abilities.tryGet(seat.exAbilityId as AbilityId);
  if (!def) return null;
  const cdSecs = (seat.exCooldown ?? 0) / TICK_HZ;
  const maxCd = def.cooldown[0] ?? 1;
  const view: ExSlotView = {
    name: def.name,
    cdSecs,
    sweep: cdSecs > 0 ? Math.min(1, cdSecs / maxCd) : 0,
    cooldownSec: maxCd,
    castType: def.castType,
  };
  if (def.icon !== undefined) view.icon = def.icon;
  const mana = def.manaCost[0];
  if (mana !== undefined && mana > 0) view.manaCost = mana;
  const desc = docDescription(def);
  if (desc !== undefined) view.description = desc;
  return view;
}
