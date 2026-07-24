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
import type { CastableSlot, ChampionAbilitySlot, CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { exSlotView, type ExSlotSeat } from "./exSlot";
import { innateCastNote, innateKindLabel, passiveSlotView, PASSIVE_SLOT_LABEL } from "./passiveSlot";
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

// The held slot is a CHAMPION slot (6 values). All six can be held for the
// description panel; five of them plus an ACTIVE 天生技 are also castable.
let held: ChampionAbilitySlot | null = null;
const listeners = new Set<() => void>();

/** The slot whose button is held right now (null = nothing held). */
export function getHeldAbility(): ChampionAbilitySlot | null {
  return held;
}

/**
 * The held slot AS AN AIM TARGET — what the floor range/AoE telegraph reads.
 *
 * PASSIVE is passed THROUGH now that the sixth slot is castable, and the
 * castability question is answered exactly once, downstream: `GameApp`'s
 * `abilityForSeat` returns an ability for an `innateKind: "active"` innate and
 * null for a permanent one, so a held 主動 innate draws its real range ring and
 * a held 被動 tile still draws nothing. Deciding it here as well would be a
 * second copy of the rule, free to drift from the one that governs the cast.
 */
export function getHeldAimSlot(): CastableSlot | null {
  return held;
}

/** Press → slot, release → null. No-op when unchanged (skips a needless notify). */
export function setHeldAbility(slot: ChampionAbilitySlot | null): void {
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
export function useHeldAbility(): ChampionAbilitySlot | null {
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
  /** slot badge — Q/W/E/R/EX/PASSIVE */
  slot: ChampionAbilitySlot;
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
export function describeHeldAbility(seat: HeldSeat, slot: ChampionAbilitySlot): HeldAbilityInfo | null {
  // 天生技 (the SIXTH slot). Its chips lead with 「天生 · 被動/主動」 and say in
  // words that it is owned from level 1 — a held panel that only showed the
  // description would leave the player guessing why the tile has no hotkey.
  if (slot === "PASSIVE") {
    const innate = passiveSlotView(seat.championId);
    if (!innate) return null;
    const meta: TooltipMeta[] = [
      { label: PASSIVE_SLOT_LABEL, value: innateKindLabel(innate.innateKind) },
    ];
    if (innate.innateKind === "active") {
      meta.push({ label: "施法", value: castTypeLabel(innate.castType) });
      if (innate.cooldownSec !== undefined) {
        meta.push({ label: "冷卻", base: innate.cooldownSec, factor: "cooldown", unit: "s" });
      }
      if (innate.manaCost !== undefined) meta.push({ label: "魔力", value: `${innate.manaCost}` });
      // the sixth slot HAS a hotkey now — say it here exactly like EX says F
      meta.push({ label: "快捷", value: "D / ✛↑" });
    }
    meta.push({ label: "取得", value: innateCastNote(innate.innateKind, innate.effective) });
    const info: HeldAbilityInfo = {
      slot,
      name: innate.displayName,
      fullName: innate.name,
      meta,
    };
    if (innate.description !== undefined) info.body = innate.description;
    return info;
  }

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
