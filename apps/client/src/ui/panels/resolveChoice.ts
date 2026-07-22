/**
 * resolveChoice — pure resolution of an augment-draft offer id to a display
 * name + description (+ w3x icon when present). Extracted from AugmentDraftPanel
 * so it is node-testable (no React/store import), mirroring the exSlot / icons
 * pattern. A draft choice is an augment, an ABILITY/augment doc, or a weapon
 * (item); each surfaces its w3x `icon` field via the same iconSrc/IconImg path
 * — icon-less choices fall back to the text card.
 */
import { Abilities, Augments, Items } from "@ggd/shared/sim/content/registry";
import type { AbilityId, AugmentId, ItemId } from "@ggd/shared/ids";
import { docDescription } from "../components/abilityText";

export interface ResolvedChoice {
  name: string;
  desc: string;
  /** w3x icon path ("assets/icons/…") or undefined → text card fallback */
  icon?: string;
}

export function resolveChoice(choice: string): ResolvedChoice {
  // augments (skeleton pool) carry a description but no w3x art
  const aug = Augments.tryGet(choice as AugmentId);
  if (aug) return { name: aug.name, desc: aug.description ?? "" };

  // ability/augment choice → surface its w3x icon + recovered description
  const ability = Abilities.tryGet(choice as AbilityId);
  if (ability) {
    const out: ResolvedChoice = { name: ability.name, desc: docDescription(ability) ?? "" };
    if (ability.icon !== undefined) out.icon = ability.icon;
    return out;
  }

  // weapon cards (legendary items) → item icon + cost
  const item = Items.tryGet(choice as ItemId);
  if (item) {
    const out: ResolvedChoice = { name: item.name, desc: `${item.cost} g` };
    if (item.icon !== undefined) out.icon = item.icon;
    return out;
  }

  return { name: choice, desc: "" };
}
