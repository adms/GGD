/**
 * abilityHold — the "which ability button is PRESSED-AND-HELD right now" seam
 * (task #152). A HOLD (mouse-down on a desktop ability tile, or a finger down on
 * a touch ability button) drives two previews at once:
 *   • ui/AbilityDescriptionOverlay — the full name + description panel across the
 *     TOP of the screen, and
 *   • render/AimIndicator — the dashed cast-RANGE ring + AoE disc on the floor
 *     (GameApp reads `getHeldAbility()` every frame and resolves it against the
 *     live self position + combat-env `abilityRange` factor).
 *
 * Two consumers, two access shapes, ONE source of truth: a plain-mutable held
 * slot with a tiny subscribe list (the same framework-free store pattern as
 * cursor/useCursor). React reads it reactively via `useHeldAbility`; the
 * imperative render loop reads `getHeldAbility()` with no React coupling. Setting
 * it is a synchronous DOM-event call from the owning bar (press → slot, release →
 * null), so nothing here runs per frame.
 *
 * `describeHeldAbility` is the pure content resolver (no DOM/React) shared by the
 * overlay — it turns a seat + slot into the SAME name/description/meta the
 * ability-bar tooltip shows, so the held panel can never disagree with the tile.
 */
import { useSyncExternalStore } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { AbilitySlot, CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { exSlotView, type ExSlotSeat } from "./exSlot";
import {
  abilityMetaChips,
  castTypeLabel,
  docDescription,
  stripAbilityNumber,
} from "./components/abilityText";
import type { TooltipMeta } from "./components/Tooltip";

// ---------------------------------------------------------------------------
// held-slot store (plain mutable + subscribe — never React state)
// ---------------------------------------------------------------------------

let held: AbilitySlot | null = null;
const listeners = new Set<() => void>();

/** The slot whose button is held right now (null = nothing held). */
export function getHeldAbility(): AbilitySlot | null {
  return held;
}

/** Press → slot, release → null. No-op when unchanged (skips a needless notify). */
export function setHeldAbility(slot: AbilitySlot | null): void {
  if (held === slot) return;
  held = slot;
  for (const cb of listeners) cb();
}

export function subscribeHeldAbility(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** React binding — re-renders a component only when the held slot changes. */
export function useHeldAbility(): AbilitySlot | null {
  return useSyncExternalStore(subscribeHeldAbility, getHeldAbility, getHeldAbility);
}

// ---------------------------------------------------------------------------
// pure content resolver (shared by the overlay; node-testable)
// ---------------------------------------------------------------------------

const SLOT_INDEX: Record<CoreAbilitySlot, number> = { Q: 0, W: 1, E: 2, R: 3 };

/** The seat fields the resolver reads (SeatView satisfies this structurally). */
export interface HeldSeat extends ExSlotSeat {
  championId: string;
  abilityRanks: number[];
}

/** Everything the top-of-screen description panel renders for a held slot. */
export interface HeldAbilityInfo {
  /** slot badge — Q/W/E/R/EX */
  slot: AbilitySlot;
  /** clean display name (hero/skill number stripped) */
  name: string;
  /** full still-numbered name (kept for the source-of-truth tooltip parity) */
  fullName: string;
  /** description body (role markup preserved) — undefined when the doc has none */
  body?: string;
  /** cast-type / cooldown / mana (+ EX hotkey) chips, same rows as the bar tooltip */
  meta: TooltipMeta[];
}

/**
 * Resolve a held slot against the local seat into the panel content — the SAME
 * name + docDescription + cost/cooldown/cast-type rows the ability-bar Tooltip
 * builds. Returns null when there is nothing to show (no champion, or a still
 * LOCKED EX slot). Cooldown carries `{ base, factor: "cooldown" }` so the panel
 * renders the live post-multiplier final exactly like the tooltip.
 */
export function describeHeldAbility(seat: HeldSeat, slot: AbilitySlot): HeldAbilityInfo | null {
  if (slot === "EX") {
    const ex = exSlotView(seat);
    if (!ex) return null;
    const meta: TooltipMeta[] = [
      { label: "EX 技能", value: castTypeLabel(ex.castType) },
      { label: "冷卻", base: ex.cooldownSec, factor: "cooldown", unit: "s" },
    ];
    if (ex.manaCost !== undefined) meta.push({ label: "魔力", value: `${ex.manaCost}` });
    meta.push({ label: "快捷", value: "F / Back" });
    const info: HeldAbilityInfo = {
      slot,
      name: stripAbilityNumber(ex.name),
      fullName: ex.name,
      meta,
    };
    if (ex.description !== undefined) info.body = ex.description;
    return info;
  }

  if (!seat.championId) return null;
  const def = Champions.tryGet(seat.championId as ChampionId);
  if (!def) return null;
  const ability = def.abilities[slot];
  const rank = seat.abilityRanks[SLOT_INDEX[slot]] ?? 0;
  // rank-scaled numbers (rank-1 values before the ability is learned), mirroring
  // the AbilityBar tooltip so a held panel and its tile never disagree.
  const cdMeta = ability.cooldown[Math.max(0, rank - 1)] ?? ability.cooldown[0] ?? 0;
  const manaMeta = ability.manaCost[Math.max(0, rank - 1)] ?? ability.manaCost[0] ?? 0;
  const info: HeldAbilityInfo = {
    slot,
    name: stripAbilityNumber(ability.name),
    fullName: ability.name,
    meta: abilityMetaChips({
      castType: ability.castType,
      cooldownSec: cdMeta,
      manaCost: manaMeta,
    }),
  };
  const body = docDescription(ability);
  if (body !== undefined) info.body = body;
  return info;
}
