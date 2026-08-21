/**
 * castStrike — WHERE IN A CAST CLIP THE MOVE IS ACTUALLY THROWN.
 *
 * THE BUG THIS EXISTS TO FIX. The cast telegraph is a fighting-game frame-data
 * problem: the sim owns WHEN the damage lands (CastResolveSystem fires the
 * effects exactly `round(castTimeSec / dt)` ticks after `castBegin`), and the
 * renderer may only ALIGN to that — never drive it. Until now `castBegin`
 * stretched the whole cast clip across the whole startup window:
 *
 *     pulse("cast", now, { windowMs: durMs, clipWindowMs: durMs })
 *
 * Artists do NOT put the release frame at the END of a cast clip; they put it
 * somewhere around 60–80% through, with the rest as follow-through/recovery.
 * So spanning the clip over the startup made the BODY throw the move ~0.2 s
 * before the damage tick, while the ground ring stayed honest. Players believe
 * the body, so the ring read as laggy and the ability as unresponsive.
 *
 * The fix: treat the startup as the part of the clip BEFORE the strike frame,
 * and play the clip over `startupMs / strikeFraction` so the strike frame lands
 * ON the damage tick and the follow-through plays AFTER it.
 *
 * ⚠️ This header used to say the fix was "the pattern already used on the
 * basic-attack path (EntityViewRegistry, ATTACK_STRIKE_FRACTION)". That was
 * false in the half that mattered (third rule: comments lie, go and check) —
 * the attack path only WIDENED its pulse window by that fraction and then let
 * `pulseSpeedRatio` fit the clip to it, so the rate clamp moved the contact
 * frame off the damage tick with nothing saying so. GH#40 put the swing on
 * this same plan; see {@link DEFAULT_ATTACK_STRIKE_FRACTION}.
 *
 * WHY A TABLE. 0.6 is a good default for a hand-authored one-shot cast clip,
 * but this roster is not uniform. Measured by `scripts/probeCastFrameData.ts`
 * against the shipped .glb bytes (117 model docs; the cast clip is whatever each
 * doc's clipMap resolves through the real `resolveClips`):
 *
 *     115 resolve a real "cast" clip (only prop.flower / prop.guardian do not);
 *     111 of those have a non-zero length, ranging 0.033 s
 *     (imported.windmissle "stand") to 21.333 s (imported.grandorcaura and
 *     imported.grandundeadaura, both "Stand").
 *
 * At the owner's new 0.6 s default, 94 of those 111 threw the move EARLY under
 * the old spanning behaviour. Several of the long ones are looping ambient/aura
 * clips with no release frame at all, which no single fraction can fix.
 * Per-model tuning has to be possible without touching content/** (the model@1
 * schema lives in packages/shared and is shared with the sim/editor/admin mirror
 * machinery), so it lives here, keyed by the same `modelKey` ChampionView
 * already carries — verified 1:1 with the model doc ids the audition page emits
 * (all 55 distinct champion modelKeys are model doc ids, 0 mismatches).
 *
 * HOW TO FILL IT IN. Open `/frame-data.html` (dev server), pick the champion,
 * and scrub the strike marker until the release pose sits on the tick ruler's
 * damage tick. The page prints the exact line to paste here. Deliberately
 * EMPTY on landing: an invented number is worse than the honest default,
 * because it would look tuned. Every entry added must come from that page.
 */

/**
 * Fraction of a cast clip that has played when the move is released. The
 * default assumes a conventional one-shot cast clip (anticipation → release at
 * ~60% → follow-through).
 */
export const DEFAULT_CAST_STRIKE_FRACTION = 0.6;

/**
 * Same idea for the BASIC ATTACK swing (GH#40). A melee swing's contact frame
 * sits earlier in its clip than a cast's release frame does, which is why this
 * default is not the cast one.
 *
 * ⚠️ This number used to live as `const ATTACK_STRIKE_FRACTION = 0.5` inside
 * `EntityViewRegistry`, where it did HALF a job: it widened the pulse window to
 * `windup / 0.5`, but nothing ever planned the clip against that window, so the
 * `ClipAnimator` rate clamp ([0.5x, 3x]) silently moved the contact frame off
 * the damage tick for every rig outside that band — the exact failure
 * {@link alignPulseClip} was written to compensate for on the cast path. The
 * value is unchanged; what changed is that the swing now goes through the same
 * alignment plan the cast does.
 */
export const DEFAULT_ATTACK_STRIKE_FRACTION = 0.5;

/**
 * Per-`modelKey` overrides of {@link DEFAULT_CAST_STRIKE_FRACTION}. Values must
 * be strictly between 0 and 1; anything else is ignored by
 * {@link castStrikeFractionFor} (a 0 or 1 would divide the startup by zero /
 * leave no follow-through).
 *
 * Example of the shape the audition page emits:
 *   "champ.sela": 0.72,
 */
export const CAST_STRIKE_FRACTION_BY_MODEL: Readonly<Record<string, number>> = {};

/**
 * Per-`modelKey` overrides of {@link DEFAULT_ATTACK_STRIKE_FRACTION}, same
 * shape and the same clamp.
 *
 * ⛔ DELIBERATELY EMPTY, for the reason in this file's header: a big axe really
 * does connect at ~0.7 and a jab at ~0.25, but an INVENTED number looks tuned
 * while being no more true than the default. Every entry has to come off the
 * `/frame-data.html` ruler.
 */
export const ATTACK_STRIKE_FRACTION_BY_MODEL: Readonly<Record<string, number>> = {};

/** Smallest/largest fraction that still leaves both an anticipation and a tail. */
const MIN_FRACTION = 0.05;
const MAX_FRACTION = 0.95;

/**
 * One resolver for both tables: an unknown model, a non-finite entry, or one
 * outside [MIN_FRACTION, MAX_FRACTION] falls back to the honest default.
 */
function resolveFraction(
  table: Readonly<Record<string, number>>,
  modelKey: string | null | undefined,
  fallback: number,
): number {
  const f = modelKey ? table[modelKey] : undefined;
  if (typeof f !== "number" || !Number.isFinite(f)) return fallback;
  if (f < MIN_FRACTION || f > MAX_FRACTION) return fallback;
  return f;
}

/**
 * Resolve the CAST strike fraction for a model, falling back to the default for
 * an unknown model or an out-of-range override. Pure — unit-tested directly.
 */
export function castStrikeFractionFor(modelKey: string | null | undefined): number {
  return resolveFraction(CAST_STRIKE_FRACTION_BY_MODEL, modelKey, DEFAULT_CAST_STRIKE_FRACTION);
}

/** Resolve the BASIC-ATTACK strike fraction for a model (GH#40). Pure. */
export function attackStrikeFractionFor(modelKey: string | null | undefined): number {
  return resolveFraction(ATTACK_STRIKE_FRACTION_BY_MODEL, modelKey, DEFAULT_ATTACK_STRIKE_FRACTION);
}

/**
 * How long the clip keeps playing AFTER the damage tick, for a given startup.
 * This is the follow-through/recovery tail: the body finishes throwing the move
 * once the sim has already resolved it.
 */
export function castFollowThroughMs(startupMs: number, strikeFraction: number): number {
  if (!(startupMs > 0)) return 0;
  const f = strikeFraction > 0 && strikeFraction < 1 ? strikeFraction : DEFAULT_CAST_STRIKE_FRACTION;
  return startupMs * (1 / f - 1);
}
