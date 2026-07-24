/**
 * passiveSlotView — the pure "what does the SIXTH slot read" logic, the exact
 * mirror of `ui/exSlot`'s role for the 5th.
 *
 * ---------------------------------------------------------------------------
 * WHY A SIXTH SLOT EXISTS
 * ---------------------------------------------------------------------------
 * 「每個人應該是六種，被動也是包含 slot，我說過他是等級1就獲得」 — every champion
 * in the source map owns Q/W/E/R/EX **plus a 天生技 (innate) it has from level 1**.
 * The importer dropped it; the NN-00 recovery put it back as a STANDALONE ability
 * doc referenced by `champion.passiveAbility`, so the resolution seam is the
 * shared registry helper `championPassive()` — never an embedded copy, never the
 * legacy `champion.passive` hook block (that is a modifier bag on 7 champion
 * docs, not a slot).
 *
 * TWO KINDS, ONE SLOT (`AbilityDef.innateKind`):
 *   • "passive" — no cooldown, [被動]/[靈氣]: auras, evasion, on-hit procs. It is
 *     NEVER pressable; the tile must not look like a button that does nothing.
 *   • "active"  — a real-cooldown WC3 D-slot ability. Still owned from level 1,
 *     but it is a castable-shaped thing, so it must be visually distinguishable
 *     from a pure passive.
 *
 * `ChampionAbilitySlot` (shared/sim/intents) is the 6-value enum; `AbilitySlot`
 * stays 5-valued on purpose so a cast/rank Command can still only name a
 * castable slot. This module therefore returns view data only — it never issues
 * a command, and the bars wire no hotkey to it.
 *
 * Pure + node-testable: no React, no DOM.
 */
import { championPassive } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { CastType } from "@ggd/shared/sim/content/defs";
import { docDescription, stripAbilityNumber } from "./components/abilityText";

/** The two shapes an innate NN-00 can take. Defaults to "passive" when unset. */
export type InnateKind = "passive" | "active";

export interface PassiveSlotView {
  /** standalone ability doc id (`<championId>.passive`) */
  id: string;
  /** display name as authored — still carries the 「NN-00 」hero-number prefix */
  name: string;
  /** name with the hero-number prefix stripped (what a tile shows) */
  displayName: string;
  /** w3x-recovered description, or undefined when the map carried none */
  description?: string;
  /** w3x icon path, or undefined → the caller draws its 天生 fallback tile */
  icon?: string;
  /** "passive" = never pressable; "active" = a real-cooldown D-slot innate */
  innateKind: InnateKind;
  /** full cooldown in seconds — omitted for a pure passive (always 0) */
  cooldownSec?: number;
  /** mana cost — omitted when free */
  manaCost?: number;
  /** cast type, for the 施法 meta chip on an active innate */
  castType: CastType;
}

/** Slot badge for the innate. NOT "被動" — half of them are active abilities. */
export const PASSIVE_SLOT_LABEL = "天生";

/** The whole point of the slot: it is owned from level 1, never learned. */
export const PASSIVE_LEVEL_NOTE = "等級 1 起自動擁有";

/** Violet accent — deliberately not any Q/W/E/R blue-green or the EX amber. */
export const PASSIVE_ACCENT = "#a98cf0";

/** 被動 / 主動 — the sub-kind shown next to the 天生 badge. */
export function innateKindLabel(kind: InnateKind): string {
  return kind === "active" ? "主動" : "被動";
}

/**
 * One line of copy that makes the tile's castability honest. A pure passive is
 * permanently on and has no button; an active innate is a real ability the map
 * gives you at level 1.
 */
export function innateCastNote(kind: InnateKind): string {
  return kind === "active" ? "天生主動技 · 等級 1 起自動擁有" : "天生被動 · 永久生效，不需施放";
}

/**
 * Resolve a champion's SIXTH slot. Returns null when the champion genuinely has
 * no NN-00 — three of the 111 heroes really do not have one (godie-h02n 腦包英雄,
 * godie-u01q 測試英雄, godie-ogld 美白大法師), and that absence is a RECOVERED
 * FACT, not a gap to paper over: those three simply show five slots.
 */
export function passiveSlotView(championId: string | null | undefined): PassiveSlotView | null {
  if (!championId) return null;
  const def = championPassive(championId as ChampionId);
  if (!def) return null;
  const view: PassiveSlotView = {
    id: def.id,
    name: def.name,
    displayName: stripAbilityNumber(def.name),
    innateKind: def.innateKind ?? "passive",
    castType: def.castType,
  };
  if (def.icon !== undefined) view.icon = def.icon;
  const cd = def.cooldown[0];
  if (cd !== undefined && cd > 0) view.cooldownSec = cd;
  const mana = def.manaCost[0];
  if (mana !== undefined && mana > 0) view.manaCost = mana;
  const desc = docDescription(def);
  if (desc !== undefined) view.description = desc;
  return view;
}
