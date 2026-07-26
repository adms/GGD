/**
 * beat — 「四拍令咒」 as a musical performance (task #257).
 *
 *   beatSynth        (audio/)  the analog synth bass, generated from eight MIDI
 *                              numbers at play time — no file, no download
 *   beatDance        (render/) the procedural shuffle + the camera gate that
 *                              proves it is visible at the shipped combat rig
 *   beatPerformance            the conductor: phrase cursor, tempo readout, and
 *                              THE INTERFACE the unmerged #252 kit calls
 *
 * The two halves live in the audio/ and render/ trees because that is where
 * they belong; the conductor lives here because it belongs to neither and
 * because a third workstream owns each of those directories this cycle.
 */
import { audioSystem } from "../audio/AudioSystem";
import { BeatPerformance } from "./beatPerformance";

export * from "./beatPerformance";

/**
 * Process-wide conductor. Constructing it is side-effect free: `BeatSynth`
 * builds no AudioContext until a note is actually played AND `gate()` says the
 * autoplay unlock has already happened, so importing this from anywhere —
 * including a test — is safe and silent.
 *
 * The gate is the mixer's own `isUnlocked`, not a second gesture listener:
 * whichever pointer/key press woke the sample player woke this too, and there is
 * exactly one definition of "the user has interacted".
 */
export const beatPerformance = new BeatPerformance({
  synthOptions: { gate: () => audioSystem.isUnlocked },
});
