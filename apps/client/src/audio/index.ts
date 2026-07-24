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
 *   fireRingWindow the ONE derived number behind the late-round tension swap:
 *                 `combatMaxSec - fireRing.startSec` from config.match@1, plus
 *                 the runtime tripwire that shouts if the cue and the burn ever
 *                 drift apart again (re-exported through ./scene, #132)
 *   loginRotation pure (now single-theme) rotation for the auth screen (`menu`)
 *   bgmOverride   registry for a mounted screen to request a bespoke bed (#134)
 *   matchEndBed   pure rule handing the bed to 主題曲·寧靜女聲 once the WIN
 *                 sting has played itself out (driven by onBedEnded, never a
 *                 hardcoded clip length)
 *   bgmVariants   Samantha-James rotating-BGM registry + rotation store (#137)
 *   loginAmbience DORMANT calm-roar gate (its serene login bed moved to #134)
 *   countdownCue  pure last-5s tick for champ select + the prep window
 *                 (once/second, rising volume, ends on a distinct final cue)
 *   types         data shapes mirroring content/config/audio-map.json
 *   championVoice click-your-hero select quips (champion-voices.json + fallback)
 *   selectVoiceLadder the five-rung fallback that makes that click answer for
 *                 ALL 113 champions on the PUBLIC tier, plus the drop-in
 *                 manifest contract for the generated per-champion voice pack
 *   sfxManifest   which SFX each scene warms (task #63: per-scene SFX preload)
 *   victoryTaunt  round/match victory taunt VO — the line is DETERMINISTIC in
 *                 replicated state so every client hears the same joke (#93)
 */
export * from "./types";
export * from "./audioSelect";
export * from "./audioSettings";
export * from "./scene";
export * from "./loginRotation";
export * from "./bgmOverride";
export * from "./matchEndBed";
export * from "./bgmVariants";
export * from "./loginAmbience";
export * from "./sfxEdges";
export * from "./countdownCue";
export * from "./championVoice";
export * from "./selectVoiceLadder";
export * from "./sfxManifest";
export { AudioSystem, audioSystem, AUDIO_CONTENT_BASE, AUDIO_MAP_PATH, VOLUME_RAMP_MS } from "./AudioSystem";
export type { AudioSystemOptions, BedEndedEvent, SfxPlayOptions } from "./AudioSystem";
