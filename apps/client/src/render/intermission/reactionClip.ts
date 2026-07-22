/**
 * reactionClip — choose the champion's PURCHASE reaction clip.
 *
 * The user asked that buying something make your hero react: 「購買的時候 勝利
 * 或攻擊動作」 — a victory OR an attack. But the clip inventories differ wildly
 * across the roster and there is no single canonical name:
 *
 *   • KayKit stand-ins carry 76 clips, celebration included ("Cheer").
 *   • w3x-imported heroes carry 1–24, named "Attack - 1", "Spell Throw", …
 *   • some imports have NO attack clip at all (task #69).
 *
 * So this is a PREFERENCE ORDER over the .glb's actual AnimationGroup names,
 * with a hard exclusion of the clips that would read WRONG as a celebration
 * (idle/walk/death/hurt/…). It returns null when nothing legible is left, and
 * the caller degrades to a procedural "pop" — no champion is allowed to freeze
 * or throw. The model's `clipMap` is deliberately NOT consulted: it only names
 * six logical states (no "victory" key), and matching the raw group names is
 * what lets one rule serve both the KayKit and the imported families.
 *
 * This module is pure so the whole decision is unit-tested without a GPU; the
 * scene only maps the chosen NAME back to its live AnimationGroup and plays it.
 */

/** Which flavour of reaction was chosen (diagnostics / tests). */
export type ReactionKind = "victory" | "attack" | "cast";

export interface ReactionPick {
  /** the exact AnimationGroup name to play */
  readonly clip: string;
  /** why it was chosen — the tier it matched */
  readonly kind: ReactionKind;
}

/**
 * Preference order. `victory` first (the user's first choice), then `attack`
 * (their second), then a spell/cast as a last legible "did something" action.
 * The FIRST tier with any surviving match wins.
 */
const TIERS: readonly { readonly kind: ReactionKind; readonly re: RegExp }[] = [
  { kind: "victory", re: /victor|cheer|celebrat|\bwin\b|taunt|dance|emote|happy|clap/i },
  { kind: "attack", re: /attack|slash|punch|strike|swing|kick|shoot|throw|slam|combo|chop|stab/i },
  { kind: "cast", re: /spell|cast|channel|magic|skill/i },
];

/**
 * Clips that must never be picked as a celebration even if a tier regex would
 * otherwise match them — a hurt/lie/death pose reads as the opposite of a win,
 * and idle/walk/run are the resting states we return TO, not react WITH.
 */
const EXCLUDE = /idle|stand|\bwalk\b|\brun\b|death|dead|\bdie\b|decay|dissipate|dissolve|hurt|damage|\bhit\b|block|dodge|sleep|lie|sit|portrait|jump/i;

/**
 * Pick the best reaction clip from a champion's AnimationGroup names.
 * Returns null when no legible celebration/action clip exists (caller pops).
 */
export function pickReactionClip(names: readonly string[]): ReactionPick | null {
  for (const tier of TIERS) {
    const hit = names.find((n) => tier.re.test(n) && !EXCLUDE.test(n));
    if (hit !== undefined) return { clip: hit, kind: tier.kind };
  }
  return null;
}
