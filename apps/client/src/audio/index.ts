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
 *   crowdCheer    pure 觀眾歡呼 rule for a local kill (#234): which cheer clip
 *                 and how loud, with its OWN throttle that escalates a spree
 *                 into one BIGGER cheer instead of N overlapping copies
 *   types         data shapes mirroring content/config/audio-map.json
 *   championVoice click-your-hero select quips (champion-voices.json + fallback)
 *   selectVoiceLadder the five-rung fallback that makes that click answer for
 *                 ALL 113 champions on the PUBLIC tier, plus the drop-in
 *                 manifest contract for the generated per-champion voice pack
 *   sfxManifest   which SFX each scene warms (task #63: per-scene SFX preload)
 *   sfxPreloadPolicy WHEN those sets are warmed: the scene-successor graph and
 *                 the live-tunable enabled/lookahead knobs
 *                 (`content/audio-manifests/sfx-preload.json`), so the 2.7 MB
 *                 combat bucket is fetched during the shop rather than on the
 *                 combat edge, and the login screen still fetches none of it
 *   roundEndVoice GH#527 — 回合結束那一拍**誰可以出聲**：owner 2026-08-22
 *                 「只播放角色自己語音，不要播放機械語音，重複播放太吵了」。
 *                 三支播放器（nameVoice 名言／victoryTaunt 嘲諷＝macOS `say` 的
 *                 TTS，contextualVoice 的 victory＝英雄自己的語音包）各自來問它
 *                 一次；設定住 config/audio-mix.json 的 voice.roundEnd*
 *   victoryTaunt  round/match victory taunt VO — the line is DETERMINISTIC in
 *                 replicated state so every client hears the same joke (#93)
 *   spatial       PURE 3D sound-field geometry: world position + listener frame
 *                 → volume / pan / depth low-pass / priority. No WebAudio, no
 *                 Babylon — which is what lets the design be asserted against
 *                 known camera geometry instead of through a graph mock
 *   combatSfxSpatial  WHERE each combat event's sound is and WHOSE it is (keyed
 *                 by ev.type, never by SFX key, so sfxReachability stays intact)
 *   SpatialSfxQueue   one frame's batch, sorted by priority BEFORE the SfxGate
 *                 sees it — the half of 「不知道誰做了什麼」 that panning alone
 *                 cannot fix
 *   remoteFootsteps   derived walking cue for the OTHER eleven champions, which
 *                 the sim deliberately emits no event for
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
export * from "./crowdCheer";
export * from "./championVoice";
export * from "./selectVoiceLadder";
export * from "./contextualVoice";
export * from "./roundEndVoice";
export * from "./sfxManifest";
export * from "./sfxPreloadPolicy";
export * from "./abilitySfxCues";
export * from "./spatial";
export * from "./combatSfxSpatial";
export * from "./SpatialSfxQueue";
export * from "./remoteFootsteps";
export { AudioSystem, audioSystem, AUDIO_CONTENT_BASE, AUDIO_MAP_PATH, VOLUME_RAMP_MS } from "./AudioSystem";
export type { AudioSystemOptions, BedEndedEvent, SfxPlayOptions } from "./AudioSystem";

import { audioSystem } from "./AudioSystem";
import { championNameVoice } from "./nameVoice";
import { victoryTaunts } from "./victoryTaunt";
import { vfxSoundLayer } from "./vfxSound";
import { beatPerformance } from "../beat";

/**
 * GH#584 —— **進到房間那一格**（E3）。
 *
 * > owner 2026-08-22:「每次進到房間應該是**乾淨的開始**才對」
 * > owner 2026-08-23:「你**寧願多次清理乾淨開始回合 也不要漏清到**」
 *
 * 在這支之前 `main.tsx` 的 `startMatch()` 對音訊**一行都沒有** ——「乾淨的開始」
 * 完全是「上一場離開時有沒有收乾淨」的推論，而 GH#581/#582/#583 已經證明它沒有。
 *
 * ⭐ 收成**一支具名函式**而不是四行散在 `startMatch` 裡，是為了讓
 * `audioTeardownCoverage.test.ts` 有東西可以指名：任何一層漏掉，那條閘就紅。
 */
export function resetAudioForNewMatch(): void {
  audioSystem.stopAllVoices(); // GH#581 語音／GH#582 transient（含解碼中的）
  audioSystem.stopSustainedSfx(); // #216 的循環床（火圈／場地環境音）
  audioSystem.resetSceneElapsed(); // GH#589 上一張地圖的戰鬥曲相位
  championNameVoice.cancel(); // GH#583 名言（HTMLAudioElement，⛔ 不在 WebAudio 圖上）
  victoryTaunts.cancel(); // 同上，嘲諷 TTS 也是自己的 element
  vfxSoundLayer.reset(); // GH#580 上一回合的特效循環音登記表
  beatPerformance.reset(); // 「四拍令咒」的合成器貝斯（它自己的 synth，不走 SFX bus）
}
