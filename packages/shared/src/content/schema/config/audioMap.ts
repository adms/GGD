import { z } from "zod";
import { zId } from "../common";
import { zAudioAssetPath } from "./_shared";

/**
 * config.audio-map@1 — CLIENT audio bindings (`config/audio-map.json`):
 * scene → background-music track, and gameplay/UI event → SFX clip pool.
 * Consumed by the client's `audio/AudioSystem` (plain WebAudio, no Babylon):
 * `bgm` keys are scene names (menu/lobby/room/champSelect/intermission/
 * combat/fireRing/settlement + the one-shot stings battleStart/victory/
 * defeat), `sfx` keys are event names (the MSG.EVENT whitelist plus
 * client-only UI moments like `champSelectConfirm`). Both maps are OPEN
 * records: an unknown scene/event is simply silent, and a file that 404s is a
 * no-op — audio never throws into the frame loop.
 */
export const zAudioBgmTrack = z
  .object({
    /** path under content/, e.g. "assets/audio/bgm/combat.mp3" */
    file: zAudioAssetPath,
    /** true = seamless loop (the file is loop-joined); false = one-shot sting */
    loop: z.boolean(),
    /** per-track gain multiplier applied on top of the BGM bus (default 1) */
    gain: z.number().min(0).max(4).optional(),
  })
  .strict();

export const zAudioSfxEntry = z
  .object({
    /** clip pool — one file is picked at random per trigger */
    files: z.array(zAudioAssetPath).min(1),
    /** per-event gain multiplier applied on top of the SFX bus (default 1) */
    gain: z.number().min(0).max(4).optional(),
    /** minimum ms between two plays of this event (bursts are dropped) */
    cooldownMs: z.number().min(0).optional(),
    /** max simultaneously-playing voices for this event */
    maxConcurrent: z.number().int().min(1).optional(),
  })
  .strict();

export const zConfigAudioMapDoc = z
  .object({
    id: zId,
    schema: z.literal("config.audio-map@1"),
    /** scene name -> background-music track */
    bgm: z.record(z.string().min(1), zAudioBgmTrack),
    /**
     * ARENA id -> the battle theme that REPLACES the shared `combat` bed while
     * that arena is being played (GH#531, owner 2026-08-22:「因為現在地圖變多了，
     * 我們來為每張地圖創作新音樂吧」).
     *
     * Keys are `arena.*` ids exactly as `config.arena-pool@1` spells them, which
     * is also what the server puts in `MatchState.mapId` every tick — so the
     * client can resolve the bed from the snapshot with no extra fetch.
     *
     * ⚠️ OPEN and OPTIONAL, in that order. An arena with no entry falls back to
     * the shared `combat` scene rather than going silent, because a missing
     * track must never be able to mute a match. That fallback is exactly why
     * `mapBgmCoversArenaPool.test.ts` exists: it fails when an arena in the
     * rotation pool has no theme, so "arena #14 shipped without music" is a red
     * test rather than a silent reversion nobody notices.
     */
    mapBgm: z.record(z.string().min(1), zAudioBgmTrack).optional(),
    /** event name -> SFX clip pool + throttling */
    sfx: z.record(z.string().min(1), zAudioSfxEntry),
  })
  .strict();
export type AudioBgmTrack = z.infer<typeof zAudioBgmTrack>;
export type AudioSfxEntry = z.infer<typeof zAudioSfxEntry>;
export type ConfigAudioMapDoc = z.infer<typeof zConfigAudioMapDoc>;
