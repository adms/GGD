/**
 * draftReveal — the SFX/animation schedule for the 3-choose-1 draft reveal
 * (task #110 draft cards + #82 legendary-orb gacha). Extracted pure so the
 * per-card sparkle, the legendary spin build-up and the jackpot land are
 * node-testable with no React/store/audio import (same pattern as
 * draftCardStyle / resolveChoice / prepCountdown).
 *
 * THREE CUES THIS SCHEDULE DRIVES (registry keys wired by a later audio-map
 * phase; `playSfx` no-ops harmlessly on an unmapped key until then):
 *
 *  • draftCardReveal — a sparkle / きらーん as EACH card flips face-up, one per
 *    card, staggered. Distinct from the `draftConfirm` lock-in cue that fires on
 *    PICK; this fires on REVEAL.
 *
 *  • legendaryRoll — the 効果音ラボ drum-roll spin build-up (#82) that starts the
 *    instant a LEGENDARY offer (tier `weapon` — the bought 傳說寶珠 gacha roll and
 *    the scheduled free legendary-weapon round both project as this tier) mounts,
 *    holding the player over the build-up before the cards flip. Played once as a
 *    one-shot: the clip is a build-up stinger that peaks and resolves, so it is
 *    retriggered per roll rather than gaplessly looped (see the clip note in #82).
 *
 *  • legendaryWin — the jackpot chime the moment the roll lands, fired just after
 *    the final card settles face-up on a legendary reveal.
 *
 * Augment rounds (silver/gold/prismatic) get ONLY the per-card sparkle — no roll,
 * no jackpot — so the legendary reveal stays special.
 */
import { ITEM_OFFER_TIER } from "@ggd/shared/sim/economy/draft";

/** audio-map sfx key: the per-card face-up sparkle (fires on REVEAL, not pick). */
export const DRAFT_CARD_REVEAL_SFX = "draftCardReveal";
/** audio-map sfx key: the legendary spin build-up (#82 傳說寶珠轉蛋 roll). */
export const LEGENDARY_ROLL_SFX = "legendaryRoll";
/** audio-map sfx key: the jackpot chime when the roll lands on a legendary. */
export const LEGENDARY_WIN_SFX = "legendaryWin";

/** Gap between consecutive card flips. */
export const CARD_REVEAL_STAGGER_MS = 220;
/** A legendary roll holds on the spin build-up before the first card flips. */
export const LEGENDARY_ROLL_LEAD_MS = 820;
/** An augment round flips almost at once — a light entrance, no build-up. */
export const AUGMENT_REVEAL_LEAD_MS = 120;
/** The jackpot lands a beat after the final legendary card settles. */
export const LEGENDARY_WIN_AFTER_LAND_MS = 160;

/**
 * True when an offer is a LEGENDARY reveal — the tier the bought 傳說寶珠 gacha
 * roll and the scheduled free legendary-weapon round both project as. These get
 * the roll build-up + jackpot; augment tiers do not.
 */
export function isLegendaryOffer(tier: string): boolean {
  return tier === ITEM_OFFER_TIER;
}

/** One scheduled cue: play `event` at `atMs` after the offer mounts. */
export interface RevealStep {
  atMs: number;
  event: string;
  /** 0-based card index for a per-card reveal; undefined for roll/win cues. */
  cardIndex?: number;
}

/**
 * The ordered cue schedule for an offer, in ms after mount:
 *   • legendary → legendaryRoll at 0, then a staggered draftCardReveal per card
 *     after the build-up lead, then legendaryWin just after the last card lands.
 *   • augment   → a staggered draftCardReveal per card after a short lead.
 * Deterministic and pure — the panel just fires each `event` on a timer and, for
 * a reveal step, flips that card face-up.
 */
export function revealSchedule(cardCount: number, legendary: boolean): RevealStep[] {
  const steps: RevealStep[] = [];
  if (cardCount <= 0) return steps;
  if (legendary) steps.push({ atMs: 0, event: LEGENDARY_ROLL_SFX });

  const lead = legendary ? LEGENDARY_ROLL_LEAD_MS : AUGMENT_REVEAL_LEAD_MS;
  let landAt = lead;
  for (let i = 0; i < cardCount; i++) {
    landAt = lead + i * CARD_REVEAL_STAGGER_MS;
    steps.push({ atMs: landAt, event: DRAFT_CARD_REVEAL_SFX, cardIndex: i });
  }

  if (legendary) {
    steps.push({ atMs: landAt + LEGENDARY_WIN_AFTER_LAND_MS, event: LEGENDARY_WIN_SFX });
  }
  return steps;
}
