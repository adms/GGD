/**
 * audio/matchEndBed — 主題曲 · 寧靜女聲 on the match-end screen.
 *
 * THE GAP THIS FILLS. `sceneForMatch` resolves `matchEnd` to the `victory`
 * sting for the winner, and that sting is `loop: false` — it plays once and
 * stops. Everything the #93 presentation does (dark wash → giant roast-chicken
 * shell → savage 吃雞 VO → the local champion's 名言) is over inside the first
 * few seconds, but the player then sits reading the settlement card and the
 * ranking table (#25/#36, which auto-scrolls to their own row) with NOTHING
 * playing once the sting runs out. `menuNocturne` — the calm high-soprano theme,
 * 85 s and looping — is exactly the bed that belongs under that reading, and it
 * is the home task #134 was reaching for when it asked for "the leaderboard /
 * ranked-ladder screen".
 *
 * WHY THE RULE IS A PURE FUNCTION HERE, NOT A TIMER IN THE PANEL. The obvious
 * implementation — "start the nocturne N seconds after the panel mounts" —
 * requires knowing how long the win sting is, and that is NOT a constant:
 * `victory.mp3` is 18.34 s, but the task-#137 rotation alternates it with
 * `victory.samantha.mp3` at 14.52 s, and either can be re-rendered by
 * `tools/bgm-gen` at any time. So the handover is driven by the ONLY thing that
 * knows which file played and when it stopped: `AudioSystem.onBedEnded`, which
 * fires on the NATURAL end of a non-looping bed and never on a crossfade, a
 * replacement or an early stop. This module is just the two-input rule that
 * turns that event into an override request, so it unit-tests without React.
 *
 * WIN ONLY. A defeat keeps its own `defeat` sting and then silence; celebrating
 * the loser with the serene theme is a design call the owner has not made.
 */
import type { AudioScene } from "./types";

/**
 * The one-shot sting the WINNER's match-end screen opens on — i.e. what
 * `sceneForMatch({ phase: "matchEnd", placement: 1 })` resolves to. Named here
 * so the handover watches the same scene the director actually plays; the test
 * pins the two together so a change to the mapping cannot silently orphan this.
 */
export const MATCH_WIN_STING: AudioScene = "victory";

/** 主題曲 · 寧靜女聲 — the calm, serene bed that takes over once the sting ends. */
export const MATCH_WIN_BED: AudioScene = "menuNocturne";

/**
 * The bed the match-end screen wants RIGHT NOW, for `useBgmSceneOverride`.
 *
 * `null` means "declare nothing", which is what the screen must say both while
 * the win sting is still playing (the nocturne must not step on the sting, the
 * chicken beat or the savage VO) and on a defeat. Only once the winner's sting
 * has genuinely finished does the nocturne take the bed — and the panel's
 * unmount releases it, restoring the scene the director derives from store state.
 */
export function matchEndBedScene(won: boolean, stingEnded: boolean): AudioScene | null {
  return won && stingEnded ? MATCH_WIN_BED : null;
}
