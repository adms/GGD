/**
 * audio/types — plain data shapes for the client audio system. Structurally
 * identical to the authored `config.audio-map@1` doc (packages/shared) minus
 * the doc envelope, so `audioMapFromDoc` is a field pick, not a conversion.
 * No React, no Babylon, no WebAudio here — this file is pure data.
 */
import type { ConfigAudioMapDoc } from "@ggd/shared/content";

/**
 * BGM scenes. `menu`/`menuNocturne`/`lobby`/`room`/`champSelect`/
 * `intermission`/`combat`/`fireRing`/`settlement` are looping beds;
 * `battleStart`/`victory`/`defeat` are one-shot stings (the doc's `loop:false`
 * is the authority — this list is only the set of names the client knows how to
 * ask for).
 *
 * `menuNocturne` is the login screen's SECOND theme, not a screen of its own:
 * the auth screen alternates it with `menu` (see ./loginRotation).
 */
export type AudioScene =
  | "menu"
  | "menuNocturne"
  | "lobby"
  | "room"
  | "champSelect"
  | "intermission"
  | "battleStart"
  | "combat"
  | "fireRing"
  | "settlement"
  | "victory"
  | "defeat";

export const AUDIO_SCENES: readonly AudioScene[] = [
  "menu",
  "menuNocturne",
  "lobby",
  "room",
  "champSelect",
  "intermission",
  "battleStart",
  "combat",
  "fireRing",
  "settlement",
  "victory",
  "defeat",
];

/**
 * SFX event names. The first block mirrors the server's MSG.EVENT whitelist;
 * the rest are client-only UI/flow moments. Any string is accepted by the
 * schema — this union is just the compile-time convenience set.
 */
export type AudioEvent =
  // server events (MSG.EVENT whitelist)
  | "abilityCast"
  | "damage"
  | "death"
  | "projectileSpawn"
  | "projectileHit"
  | "levelUp"
  | "castBegin"
  | "castEnd"
  | "castInterrupt"
  | "attackWindup"
  | "basicAttack"
  | "basicAttackHit"
  | "flowerSpawn"
  | "flowerBurst"
  | "exUnlock"
  // client-derived moments
  | "kill"
  | "multiKill"
  | "allySlain"
  | "champSelectConfirm"
  // champ-select last-5-seconds countdown (rising volume, then the final cue)
  | "countTick"
  | "countFinal"
  | "matchStart"
  | "roundStart"
  | "taunt"
  // OPT-IN 地圖原聲 / map-flavour pools (task #40). The seven system announcer
  // events speak Japanese only, so the map's own zh announcer quips were parked
  // here rather than deleted: `mapFlavorIntro` holds the 8 s set pieces
  // (heycharlie, letsgo), `mapFlavorAnnounce` the 1-2 s stabs (up, die, 4die,
  // pcdie). Authored + test-covered but NOT YET FIRED — they need the settings
  // toggle that lives under ui/** (owned by #42). Never route AudioDirector's
  // system path here.
  | "mapFlavorIntro"
  | "mapFlavorAnnounce"
  // login / menu chrome moments
  | "dragonRoar"
  | "dragonRoarBig"
  | "uiClick"
  | "uiHover"
  | "uiHoverCyber"
  | "uiType";

export interface BgmTrack {
  /** content-relative path, "assets/audio/bgm/combat.mp3" */
  file: string;
  loop: boolean;
  /** per-track multiplier on top of the BGM bus (default 1) */
  gain?: number;
}

export interface SfxEntry {
  /** clip pool — one is picked at random per trigger */
  files: string[];
  /** per-event multiplier on top of the SFX bus (default 1) */
  gain?: number;
  /** minimum ms between two plays of this event */
  cooldownMs?: number;
  /** max simultaneously-playing voices for this event */
  maxConcurrent?: number;
}

export interface AudioMap {
  bgm: Record<string, BgmTrack>;
  /**
   * GH#531 — arena id (`arena.*`, exactly as `config.arena-pool@1` spells it)
   * to the battle theme that replaces the shared `combat` bed on that map.
   * Absent, or missing this arena, = keep the shared bed; ⛔ never silence.
   *
   * ⚠️ OPTIONAL on purpose. Making it required turned ten existing test
   * fixtures red for a field none of them cares about — and a fixture edited
   * only to satisfy the compiler is a fixture nobody re-read.
   */
  mapBgm?: Record<string, BgmTrack>;
  sfx: Record<string, SfxEntry>;
  /**
   * ⭐ GH#568 —— 一次施法最多疊幾層聲音（owner 2026-08-23 的混合方案）。
   * 解讀與夾住住 `audio/sfxLayerCap.ts`；缺這一格 = `DEFAULT_CAST_LAYER_CAP`。
   * ⚠️ OPTIONAL 的理由與 `mapBgm` 逐字相同（既有夾具不該為了一個它們不在乎的
   * 欄位而變紅）。
   */
  castLayerCap?: CastLayerCapValue;
  /**
   * ⭐ GH#605 —— 【移動中的模型特效】自帶音效的開關（`spawnModelFx.soundKey` /
   * `arriveSoundKey`）。解讀住 `audio/modelFxSound.ts`；缺這一格 =
   * `DEFAULT_MODEL_FX_SOUND`（兩半都開）。OPTIONAL 的理由同 `castLayerCap`。
   */
  modelFxSound?: ModelFxSoundValue;
  /**
   * ⭐ 技能升級鈴（`rankUp`）播誰的。解讀住 `audio/combatSfx.rankUpKey`；
   * 缺這一格 = `DEFAULT_RANK_UP_AUDIENCE`（＝ `"self"`，只播本人的）。
   * OPTIONAL 的理由同 `castLayerCap`。
   */
  rankUpAudience?: RankUpAudienceValue;
}

/** `config.audio-map@1.rankUpAudience` 的執行期形狀（與 Zod 逐字相同）。 */
export type RankUpAudienceValue = "self" | "all";

/** `config.audio-map@1.modelFxSound` 的執行期形狀（與 Zod 逐欄相同）。 */
export interface ModelFxSoundValue {
  enabled: boolean;
  arrive: boolean;
}

/** `config.audio-map@1.castLayerCap` 的執行期形狀（與 Zod 逐欄相同）。 */
export interface CastLayerCapValue {
  enabled: boolean;
  maxLayers: number;
  whitelist: string[];
}

/** The "no audio authored" map — every lookup misses and every play no-ops. */
export const EMPTY_AUDIO_MAP: AudioMap = { bgm: {}, mapBgm: {}, sfx: {} };

/** Which gain bus a sound rides. */
export type AudioBus = "bgm" | "sfx";

/**
 * Narrow an authored doc (or anything shaped like one) to the runtime map.
 * Returns null when the value is not a `config.audio-map@1` doc, so a bad or
 * missing fetch degrades to silence instead of throwing.
 */
export function audioMapFromDoc(doc: unknown): AudioMap | null {
  const d = doc as Partial<ConfigAudioMapDoc> | null | undefined;
  if (!d || d.schema !== "config.audio-map@1") return null;
  if (!d.bgm || !d.sfx || typeof d.bgm !== "object" || typeof d.sfx !== "object") return null;
  return {
    bgm: d.bgm as Record<string, BgmTrack>,
    // Optional in the doc and tolerated here: an older bundle without `mapBgm`
    // must keep playing the shared combat bed rather than failing to parse.
    mapBgm: (d.mapBgm ?? {}) as Record<string, BgmTrack>,
    sfx: d.sfx as Record<string, SfxEntry>,
    // ⭐ GH#568 —— 原封轉交，⛔ 這裡不解讀也不夾：`sfxLayerCap.readCastLayerCap`
    // 是**唯一**的解讀點（一份被截斷的後台 override 要逐格降級，不是整份丟掉）。
    castLayerCap: d.castLayerCap as CastLayerCapValue | undefined,
    // ⭐ GH#605 —— 同上，原封轉交（`modelFxSound.readModelFxSound` 是唯一解讀點）。
    modelFxSound: d.modelFxSound as ModelFxSoundValue | undefined,
    // ⭐ 同上（`combatSfx.setRankUpAudience` 是唯一解讀點）。
    rankUpAudience: d.rankUpAudience as RankUpAudienceValue | undefined,
  };
}
