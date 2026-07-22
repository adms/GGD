/**
 * audio/loginAmbience — PURE rule for what the login rotation's SERENE theme
 * does to the login scene's dragons (task #88, the dragon clash).
 *
 * THE PROBLEM, MEASURED. The auth screen alternates an epic theme with a
 * nocturne (./loginRotation) while two dragons circle the vista and cry on
 * their breath edges. The cry level was tuned against the EPIC bed and nothing
 * about it changes when the bed does — so the same sound meets a bed that is
 * 4 dB quieter (audio-map gain 0.55 vs 0.9) and full of deliberate silence
 * (the nocturne holds a 19.5 dB crest and a 9.8 s rest).
 *
 * Numbers below are from a headless render of the REAL scene: a LoginScene
 * driven under NullEngine for 360 s emits 61 ambient cries (one per ~5.9 s,
 * `volume` 0.373…1.116), of which 11-13 survive the audio-map's 2 s cooldown
 * inside any one 85.333 s segment. Mixing that timeline into the real beds
 * through the real gain chain, and asking how far a cry rises above the bed's
 * own level over a 400 ms window:
 *
 *              cries/segment   worst poke   p99     frames >+3 dB
 *   epic         13            +7.27 dB    +6.36        8.1 %   ← the shipped
 *   nocturne     13           +20.39 dB   +15.26       27.1 %   ← the clash
 *
 * +20 dB out of the bed, on a quarter of the segment. That is the stillness
 * being wrecked, and it is not an average-loudness problem — integrated
 * loudness only moves +2.2 dB. It is that the nocturne HAS silence and the cry
 * lands in it.
 *
 * THE RULE, and why each part earns its place (same measurement, worst of four
 * 85.333 s windows):
 *
 *   ceiling only                  11 cries   +16.11 dB
 *   ceiling + gap                  4 cries   +16.11 dB    1.5 % space kept
 *   duck alone (x0.25)            13 cries    +8.98 dB    1.1 % space kept
 *   ceiling + duck + gap           4 cries    +6.58 dB    1.4 % space kept
 *
 * 1. DISTANCE CEILING — every cry is clamped to {@link CALM_ROAR_CEILING},
 *    which IS the scene's own `ROAR_CFG.farVolume`: the level a dragon gets
 *    when it is at/beyond the far distance. So the serene theme leaves only
 *    the DISTANT cry. Clamping rather than dropping keeps the dragon audible
 *    while it visibly sweeps the camera — a dragon that crosses the view in
 *    total silence reads as a bug, not as calm.
 * 2. DUCK — the ceiling alone still pokes +16 dB, because the ceiling is a
 *    level and the rests are the problem. {@link CALM_ROAR_DUCK} is the swept
 *    value at which the worst-case poke (+6.58 dB) falls just under the poke
 *    the cry ALREADY has over the epic theme (+7.27 dB): the standard is "never
 *    more intrusive on the quiet track than it is on the loud one".
 * 3. SPACING — {@link CALM_ROAR_MIN_GAP_MS} thins 11-13 cries to 4. Ducking
 *    alone reaches the same integrated loudness (+0.10 dB either way) but keeps
 *    LESS of the silence (1.1 % vs 1.4 % of frames >20 dB below peak), because
 *    thirteen quiet cries cover more of a nocturne's rests than four do. Fewer
 *    and clearer beats constant and quiet.
 *
 * THE SCRIPTED ANGRY ROAR IS NOT TOUCHED, on purpose. It is +17.9 dB over the
 * nocturne bed and no duck would save it — but it only fires on the two SCREEN
 * TRANSITIONS, and neither can strand it on the nocturne:
 *   - the return-from-app intro fires at mount, and the rotation resets to
 *     LOGIN_THEMES[0] on every visit, so it always lands on the epic theme.
 *     `loginAmbience.test.ts` pins that invariant rather than trusting it.
 *   - the enter-transition roar is the player LEAVING — they pressed the
 *     button, the stillness is deliberately over, and muting it would gut the
 *     ride-dragon departure and pre-empt task #74's handoff.
 *
 * Pure + WebAudio-free like the rest of audio/; the imperative shell is the
 * `onRoar` funnel in ui/platform/AuthScreen.
 */
import type { AudioScene } from "./types";

/**
 * Login themes that ask the scene to hush. A third serene theme would only be
 * added here — the rule itself never names a track.
 */
export const CALM_LOGIN_THEMES: readonly AudioScene[] = ["menuNocturne"];

/**
 * Ceiling on an ambient cry's `volume` while a serene theme plays. This is
 * deliberately the SAME number as `ROAR_CFG.farVolume` in render/menu/
 * LoginScene — "as if the dragon were at the far distance" — so if task #75
 * re-tunes the near/far ramp, the calm level keeps meaning the same thing.
 */
export const CALM_ROAR_CEILING = 0.4;

/**
 * Extra attenuation under the ceiling. Swept against the real roar timeline:
 * 0.70 → +13.11 dB worst poke, 0.50 → +10.38, 0.40 → +8.65, 0.35 → +7.67,
 * **0.30 → +6.58**, 0.25 → +5.39. 0.30 is the first value whose worst case is
 * quieter, relative to its own bed, than the cry already is over the epic
 * theme (+7.27 dB). Below that the dragons stop reading as present at all.
 */
export const CALM_ROAR_DUCK = 0.3;

/**
 * Minimum ms between two ambient cries while a serene theme plays. 24 s over
 * the 85.333 s segment leaves 4 (measured), against 11-13 ungated. The bed's
 * own cooldown (audio-map `dragonRoar.cooldownMs`, 2 s) still applies under
 * this and is unrelated — it stops two dragons doubling, not the pacing.
 */
export const CALM_ROAR_MIN_GAP_MS = 24_000;

/** Whether `scene` is a login theme that asks the dragons to keep their distance. */
export function isCalmLoginTheme(scene: string | null): boolean {
  return scene !== null && (CALM_LOGIN_THEMES as readonly string[]).includes(scene);
}

/** Rolling state: when the last ambient cry was ALLOWED through the calm gate. */
export interface CalmRoarState {
  lastCalmRoarMs: number | null;
}

export const CALM_ROAR_INITIAL: CalmRoarState = { lastCalmRoarMs: null };

export interface CalmRoarInput {
  /** the bed actually playing (audioSystem.scene), not what React intends */
  scene: string | null;
  /**
   * Whether the BGM bus can be heard at all. With music muted or the slider at
   * zero there is no stillness to protect, and the cry's original level is the
   * designed one — so the calm lifts. This is what ties the rule to the mixer
   * (#14 toggle, #54 sliders) instead of second-guessing it.
   */
  bgmAudible: boolean;
  nowMs: number;
}

export interface CalmRoarDecision {
  /** null = drop this cry entirely (spacing); otherwise the volume to play at */
  volume: number | null;
  /** true when the calm rule changed anything (diagnostics + tests) */
  calmed: boolean;
}

/**
 * Decide what an emitted roar should actually sound like.
 *
 * `big` roars pass through untouched (see the module docstring). Ambient cries
 * pass through untouched unless a serene theme is audibly playing, in which
 * case they are clamped, ducked and spaced.
 */
export function stepCalmRoar(
  state: CalmRoarState,
  ev: { volume: number; big: boolean },
  input: CalmRoarInput,
): { decision: CalmRoarDecision; next: CalmRoarState } {
  const volume = Number.isFinite(ev.volume) ? Math.max(0, ev.volume) : 0;
  const calm = !ev.big && input.bgmAudible && isCalmLoginTheme(input.scene);
  if (!calm) {
    // untouched — and the spacing clock is NOT advanced, so a loud epic-theme
    // cry can never eat into the nocturne's first quiet window.
    return { decision: { volume, calmed: false }, next: state };
  }
  const last = state.lastCalmRoarMs;
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  // A clock that went backwards (suspended tab, manual clock change) must not
  // latch the gate shut: treat any non-positive elapsed as "long enough ago".
  const elapsed = last === null ? Infinity : nowMs - last;
  if (elapsed >= 0 && elapsed < CALM_ROAR_MIN_GAP_MS) {
    return { decision: { volume: null, calmed: true }, next: state };
  }
  return {
    decision: { volume: Math.min(volume, CALM_ROAR_CEILING) * CALM_ROAR_DUCK, calmed: true },
    next: { lastCalmRoarMs: nowMs },
  };
}
