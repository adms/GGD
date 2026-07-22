/**
 * audio — the client sound system. Framework-free by design: plain WebAudio +
 * pure decision modules, so it is unit-testable without a browser and callable
 * from both the React HUD (ui/useAudio, ui/AudioDirector) and any imperative
 * seam. NOTHING here runs per frame — audio reacts to discrete scene changes
 * and discrete events only.
 *
 *   AudioSystem   imperative shell (WebAudio graph, buffers, unlock, dispose)
 *   audioSelect   pure decisions (clip pick, cooldown gate, fades, volumes)
 *   audioSettings persisted master/BGM/SFX volumes + mute
 *   scene         pure app-state → BGM scene mapping
 *   loginRotation pure two-theme rotation for the auth screen (epic ⇄ nocturne)
 *   loginAmbience what the serene theme does to the login scene's dragon cries
 *   countdownCue  pure last-5s tick for champ select + the prep window
 *                 (once/second, rising volume, ends on a distinct final cue)
 *   types         data shapes mirroring content/config/audio-map.json
 *   championVoice click-your-hero select quips (champion-voices.json + fallback)
 */
export * from "./types";
export * from "./audioSelect";
export * from "./audioSettings";
export * from "./scene";
export * from "./loginRotation";
export * from "./loginAmbience";
export * from "./sfxEdges";
export * from "./countdownCue";
export * from "./championVoice";
export { AudioSystem, audioSystem, AUDIO_CONTENT_BASE, AUDIO_MAP_PATH, VOLUME_RAMP_MS } from "./AudioSystem";
export type { AudioSystemOptions, SfxPlayOptions } from "./AudioSystem";
