/**
 * idlePerform — what the player's hero DOES while you shop, and how often.
 *
 * owner, 2026-07-27: 「在商店 shop 時，玩家角色會隨機輪播動作跟語音」. The hero has
 * stood at the right of the counter since #146 looping a single idle clip; this
 * module is the pure decision layer that turns that statue into a performer —
 * WHICH of its baked clips are worth showing, in WHAT order, and WITH WHAT gap.
 * `IntermissionScene` is the imperative shell that maps a chosen NAME back to
 * its live AnimationGroup and plays it, exactly as it already does for the
 * purchase reaction (see reactionClip.ts, whose shape this deliberately
 * mirrors rather than re-invents).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CLIP INVENTORY IS THE WHOLE PROBLEM — so it was measured, not guessed
 * ═══════════════════════════════════════════════════════════════════════════
 * Every shipped champion .glb was parsed (the glTF JSON chunk's `animations[]`)
 * and cross-joined with `content/champions/*.json → modelKey → content/models`.
 * 115 champions resolve to a model; the clip families that actually exist are:
 *
 *   attack-ish   115/115   "Attack", "Attack Slam", "Attack 2", "Attack - 1"…
 *   spell-ish    105/115   "Spell", "Spell Slam", "Spell Throw", "Channel"
 *   alt stands    63/115   "Stand Ready" (44), "Stand 2" (33), "Stand 3"…
 *   celebration   48/115   "cheer" (45, the voxel family) + "Stand Victory" (3)
 *   talking       19/115   "Portrait Talk", "Portrait Talk 2"
 *
 * Read that list twice before touching the tiers. There is NO clip family that
 * every hero has except attack, and there is no "taunt"/"dance" anywhere in the
 * WC3-imported half of the roster — so a rotation keyed on a celebration clip
 * would be silent-by-default for 67 of 115 heroes, which is failure shape ⑤
 * (the thing tested is not the thing shipped). The tiers below are ranked by
 * how well the clip reads STANDING AT A COUNTER, and every hero lands in at
 * least one of them; the zero-clip case still degrades to a visible nod rather
 * than a freeze (see PerformKind "nod" and the scene's procedural pulse).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A PER-KIND CAP INSTEAD OF A FLAT POOL
 * ═══════════════════════════════════════════════════════════════════════════
 * A typical WC3 hero ships 3–4 attack clips and one "Stand Ready". Pooling
 * every legible clip flat would make the shop a weapons demo: ~80 % of the
 * rotation would be swings. {@link PER_KIND_CAP} takes at most two clips per
 * kind, so a hero with four attacks and one alternate stand rotates 2 attacks
 * + 1 stand — variety by construction, not by luck.
 */
import { nextTipIndex } from "./merchantTips";

/**
 * The flavour of a performance. Also the key the VOICE layer pairs against —
 * `audio/shopPerformVoice.PERFORM_VOICE_CATEGORIES` must have an entry for
 * every member, and shopPerformVoice.test.ts fails if one is ever added here
 * without a paired line (failure shape ②: the action ships mute).
 */
export type PerformKind = "celebrate" | "talk" | "pose" | "spell" | "attack" | "nod";

/** One rotatable performance: the exact AnimationGroup name plus its flavour. */
export interface PerformOption {
  readonly clip: string;
  readonly kind: PerformKind;
}

/**
 * Tier order = how well the clip reads as "my hero is hanging around a market
 * stall". A celebration or a chat beats a sword swing; a swing beats standing
 * frozen. The FIRST tier a clip matches claims it, so "Stand Channel" is a
 * pose, not a spell, and "Spell Throw" is a spell, not an attack.
 */
const TIERS: readonly { readonly kind: PerformKind; readonly re: RegExp }[] = [
  { kind: "celebrate", re: /victor|cheer|celebrat|\bwin\b|taunt|dance|emote|happy|clap/i },
  // ONLY the talking variant. A bare "Portrait" is the WC3 head-only clip that
  // drives the UI portrait; played on a full body it is usually a no-op, which
  // would read as "the rotation froze" — exactly the bug this feature fixes.
  { kind: "talk", re: /talk/i },
  // "Stand Victory" is deliberately NOT listed here — the celebrate tier's
  // /victor/ claims it first, which is the ranking we want.
  { kind: "pose", re: /stand\s*-?\s*[2-9]|stand\s+ready|stand\s+channel/i },
  { kind: "spell", re: /spell|cast|channel|magic/i },
  { kind: "attack", re: /attack|slash|punch|strike|swing|kick|shoot|throw|slam|combo|chop|stab/i },
];

/**
 * Clips the shop must never SHOW AT ALL, in any slot. A death/decay/dissipate
 * pose in the shop reads as the hero dropping dead at the counter; hurt/hit
 * reads as being mugged; walk/run/swim slide a rooted model; birth/morph/
 * portrait are one-shot spawn or UI clips that leave the rig in a state the
 * idle loop does not restore. This is reactionClip's EXCLUDE plus the four the
 * shop specifically cannot survive (birth, morph, bare portrait, decay), MINUS
 * the "idle" term — see {@link isRotatable}.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ONE PREDICATE AND NOT TWO REGEXES
 * ═══════════════════════════════════════════════════════════════════════════
 * The rotation ban and the resting-pose ban were separate ideas, and the
 * resting pose HAD NO BAN AT ALL: `pickIdleClip` matched /idle|stand/ and
 * nothing else, so four shipped champions rested at the counter in
 * "Attack Walk Stand Spin" — a walk/attack composite whose /stand/ substring is
 * pure coincidence. 犬妖-殺生丸's rig proves the rule is not theoretical, and
 * this file's own comment already said walk clips「slide a rooted model」.
 * Measured on today's 115-champion roster: godie-opgh (imported.zy3) — a NET
 * REGRESSION, it rested in a clean "Stand Defend" before this module existed —
 * plus godie-u01q / godie-u01u / godie-udre (imported.heromusashimiyamoto),
 * every one of which ships a clean "Stand" the picker walked straight past.
 *
 * So there is now ONE list of unshowable clips, consulted by both the picker
 * and the pool, and the only difference between the two is the idle family
 * itself: the resting clip must BE a stand, the rotation must never REPEAT it.
 */
const UNSHOWABLE =
  /death|dead|\bdie\b|decay|dissipate|dissolve|hurt|damage|\bhit\b|block|dodge|sleep|\blie\b|\bsit\b|birth|morph|\bwalk\b|\brun\b|swim|portrait(?!\s*talk)/i;

/**
 * May this clip be SHOWN at the market stall at all (in any slot)?
 *
 * Exported so a test can hold the roster to it without re-declaring the rule —
 * a second copy of the pattern is how the two bans drifted apart in the first
 * place.
 */
export function isShowable(name: string): boolean {
  return !UNSHOWABLE.test(name);
}

/**
 * May this clip enter the ROTATION? Everything `isShowable` allows, minus the
 * idle family — the hero is already standing in one of those, and rotating him
 * into another is a performance the player cannot see.
 */
function isRotatable(name: string): boolean {
  return isShowable(name) && !/idle/i.test(name);
}

/** At most this many clips per kind, so no one family floods the rotation. */
export const PER_KIND_CAP = 2;

/**
 * Build the rotation pool from a champion's real AnimationGroup names.
 *
 * `idleName` is the clip the scene loops as the resting state (the group
 * `setChampion` chose). It is excluded BY IDENTITY rather than by regex,
 * because the resting clip of a WC3 rig is literally called "Stand" while
 * "Stand 2" / "Stand Ready" are exactly the variants we want to show. Matching
 * on the name pattern alone would either drop the variants or rotate the hero
 * back into the pose he is already holding — a performance you cannot see.
 *
 * Returns [] when nothing legible survives; the caller must then degrade to the
 * procedural nod, NEVER to a freeze or a T-pose.
 */
export function buildPerformPool(
  names: readonly string[],
  idleName: string | null = null,
): PerformOption[] {
  const out: PerformOption[] = [];
  const taken = new Set<string>();
  for (const tier of TIERS) {
    let used = 0;
    for (const name of names) {
      if (used >= PER_KIND_CAP) break;
      if (name === idleName || taken.has(name)) continue;
      if (!isRotatable(name) || !tier.re.test(name)) continue;
      taken.add(name);
      out.push({ clip: name, kind: tier.kind });
      used++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// cadence
// ---------------------------------------------------------------------------

/**
 * Seconds before the FIRST performance of a shop visit.
 *
 * The market opens on a 900 ms camera ease (`ENTER_DURATION_MS`) with the
 * merchant waving 「いらっしゃい」 over it, and the black cover only lifts when
 * that resolves. Performing into that beat would collide with the greeting both
 * visually and on the SFX bus, so the hero holds his idle until the shot has
 * settled and the player has had a moment to read the card.
 */
export const FIRST_PERFORM_SEC = 5;

/**
 * The random gap between performances, in seconds.
 *
 * The intermission is 40 s (`content/config/config.match.json`
 * `match.intermissionSec`), and it already carries a BGM bed, the looping
 * 市場ざわめき murmur, and a merchant tip box rotating every 5 s. At 7.5–11.5 s
 * the hero performs 3–4 times per visit: often enough to read as alive, rare
 * enough that it never competes with the merchant or the music. Randomised
 * rather than fixed so it does not turn into a metronome the player can predict
 * (and so two players in the same shop are never in lockstep).
 */
export const PERFORM_GAP_MIN_SEC = 7.5;
export const PERFORM_GAP_MAX_SEC = 11.5;

/**
 * A uniform gap in [{@link PERFORM_GAP_MIN_SEC}, {@link PERFORM_GAP_MAX_SEC}].
 *
 * A non-finite `rand()` collapses to the midpoint rather than propagating NaN:
 * the due-time is compared against `elapsed`, and `elapsed < NaN` is false
 * FOREVER, which would turn one bad draw into a hero performing every single
 * frame. Clamping the input is the difference between a degraded cadence and a
 * seizure.
 */
export function performGapSec(rand: () => number = Math.random): number {
  const r = rand();
  const clamped = !Number.isFinite(r) ? 0.5 : r < 0 ? 0 : r > 1 ? 1 : r;
  return PERFORM_GAP_MIN_SEC + clamped * (PERFORM_GAP_MAX_SEC - PERFORM_GAP_MIN_SEC);
}

/**
 * The clip the hero RESTS in — and therefore the one the rotation must exclude.
 *
 * `IntermissionScene` used to take the first group whose name matched
 * /idle|stand/, which is order-dependent and wrong whenever a rig lists a
 * VARIANT first: 犬妖-殺生丸 (`imported.sesshomaru`) ships
 * ["Stand - 2", "Attack", …, "Stand", …], so he stood at the counter holding
 * his alternate pose while his canonical "Stand" went unused — and the rotation
 * inherited the mistake, losing its only non-attack option with it.
 *
 * So: throw out the clips no shop pose may use AT ALL ({@link isShowable} —
 * this is the step that was missing, and it is why 4 champions stood at the
 * counter mid-walk), then prefer a BASE idle (a stand/idle with no variant
 * qualifier), fall back to any stand/idle, then to any showable clip, and only
 * as a last ditch to the first clip at all. Pure, so the preference is
 * unit-tested without a GPU.
 *
 * THE /stand/ SUBSTRING IS NOT A PROMISE. "Attack Walk Stand Spin" contains it
 * and is a walk-attack composite: WC3 rigs concatenate every animation this
 * sequence serves into one name, so matching a family by substring MUST be
 * paired with the ban list or it silently accepts the union of five families.
 */
const IDLE_LIKE = /idle|stand/i;
const IDLE_VARIANT = /stand\s*-?\s*[2-9]|ready|channel|victory|hit|alternate|defend|\btalk\b/i;

export function pickIdleClip(names: readonly string[]): string | null {
  const showable = names.filter(isShowable);
  const idleLike = showable.filter((n) => IDLE_LIKE.test(n));
  return (
    idleLike.find((n) => !IDLE_VARIANT.test(n)) ??
    idleLike[0] ??
    showable[0] ??
    names[0] ??
    null
  );
}

/**
 * The index of the performance to play NEXT.
 *
 * Reuses `merchantTips.nextTipIndex`, so "random but never an immediate repeat"
 * is guaranteed BY CONSTRUCTION here exactly as it is for the merchant's tips
 * and the purchase lines — one rule, three surfaces. A repeat would read as the
 * rotation being stuck, which is indistinguishable from the bug being fixed.
 */
export function nextPerformIndex(
  current: number,
  count: number,
  rand: () => number = Math.random,
): number {
  return nextTipIndex(current, count, rand);
}
