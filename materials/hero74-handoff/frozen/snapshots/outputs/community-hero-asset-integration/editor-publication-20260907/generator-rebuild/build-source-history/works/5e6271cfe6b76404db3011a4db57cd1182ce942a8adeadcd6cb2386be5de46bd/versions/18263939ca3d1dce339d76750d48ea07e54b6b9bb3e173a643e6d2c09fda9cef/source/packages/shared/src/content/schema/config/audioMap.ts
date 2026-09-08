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

/**
 * ⭐ GH#568 —— 一次施法**最多疊幾層聲音**（owner 2026-08-23 的混合方案）。
 *
 * owner 逐字：「**設定上限**但同時也**讓我知道哪些碰到上限**，我可以**額外審查白名單**，
 * 但**疊超過又不是白名單雖然不會砍但也不會播出來超過的音效**」。
 *
 * ⛔ 「不會砍」是這一格的重點：`content/config/vfx-families.json`（`pitch:build` 的產物）
 * 與逐支覆寫**一個位元組都不動**，
 * 夾住只發生在**播放的那一刻**（`apps/client/src/audio/sfxLayerCap.ts`）。所以把 `enabled`
 * 關掉、或把一支技能放進 `whitelist`，聲音**原封回來**，⛔ 不必重建任何內容。
 *
 * 層的順序是固定的（與 `tools/sfx-bind/usage_table.ts` 產的那張表同一份）：
 * 施法音 → 特效發射 → 特效命中 → 特效循環 → 特效消散。超出上限的從**後面**開始不播，
 * 所以被丟掉的永遠是最邊緣的那幾層（消散／循環），⛔ 不會是施法音本身。
 */
export const zAudioCastLayerCap = z
  .object({
    /** false = 一層都不夾（＝這一格出現之前的行為，逐位元不變）。 */
    enabled: z.boolean(),
    /**
     * 一次施法最多播幾層。⚠️ 這是**同一次施法的整條生命週期**（發射／命中／循環／消散
     * 不是同一瞬間），與那張產生的表用的是同一個數法。出貨分佈：1 層 212 支、2 層 42 支、
     * 3 層 147 支、4 層 4 支、**5 層 15 支**。
     *
     * ⭐ 出貨值是 **5 ＝今天一層都不夾**（⛔ 我沒有替 owner 挑一個會當場砍掉聲音的
     * 數字）。要真的變安靜就往下調：4 夾掉那 15 支的消散音、3 再夾掉循環音。
     * 每一次調整都**只影響播放**，`content/config/vfx-families.json`（`pitch:build` 的產物）
     * ⛔ 一個位元組都不會動。
     */
    maxLayers: z.number().int().min(1).max(8),
    /**
     * ⭐ **owner 的白名單** —— 這幾支技能 id 不受上限限制（「我可以額外審查白名單」）。
     * 值是 `ability@1.id`（例：`godie-e008.r`）。⛔ 不是英雄 id。
     */
    whitelist: z.array(z.string().min(1)).max(200),
  })
  .strict();

/**
 * ⭐ GH#605 —— 【移動中的模型特效】自帶音效的**回頭開關**。
 *
 * owner 2026-08-23 的常設指令：「沒做完以前別問我了自己判斷 但是**留後台開關可以
 * 簡易 rollback**」。⇒ 這一格存在的理由是**回頭**，⛔ 不是觀望：出貨值是
 * 「兩半都開」（＝我挑的那個），關掉就逐位元回到 `spawnModelFx` 沒有聲音的那一版。
 *
 * ⚠️ 兩格分開是因為它們是**兩個決定**：`enabled` 是「這一族到底要不要出聲」，
 * `arrive` 是我自己挑的那一半（「動地剁是**落點**有聲、飛行段沒有」）——
 * 落點那一發是**客戶端排的**（sim 送 `arriveDelaySec`），所以它比發射那一發多一個
 * 可能出錯的環節，值得能單獨關掉而不必連發射音一起犧牲。
 */
export const zAudioModelFxSound = z
  .object({
    /** false = `spawnModelFx` 的 `soundKey` / `arriveSoundKey` 兩格都不播（＝ GH#605 之前）。 */
    enabled: z.boolean(),
    /** false = 只播施放那一刻的 `soundKey`，落點那一發不排。 */
    arrive: z.boolean(),
  })
  .strict();

/**
 * ⭐ 技能升級鈴（`rankUp`）**播誰的**的回頭開關（lane D 2026-08-23）。
 *
 * ⚠️ `rankUp` 是**廣播**事件（`eventFanout.ts` 的註解逐字寫著「`id` 是 ENTITY，
 * 不是 seat，所以只該替本人響的客戶端提示**必須自己夾**」）—— 而在此之前沒有人夾，
 * 於是六個人每按一次 Q，你就聽見一次自己的升級鈴。
 *
 * owner 2026-08-23 的常設指令：「沒做完以前別問我了自己判斷 但是**留後台開關可以
 * 簡易 rollback**」⇒ 出貨值是我挑的 `"self"`；`"all"` 逐位元回到夾之前的行為。
 *
 * ⛔ 刻意**只有兩個值**：稽核提過第三種「別人的播小聲一點」，而今天的
 * `combatSfxKey` 只回一個 key、沒有任何 per-event 音量的縫（音量在 audio-map 的
 * `sfx[key].gain`，那是逐 key 不是逐事件）。⇒ 收一個做不到的值進來，就是第一·五
 * 守則點名的那種「設定得起來、遊戲裡什麼都不會發生」。
 */
export const zAudioRankUpAudience = z.enum(["self", "all"]);

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
    /**
     * ⭐ GH#568 —— 一次施法的音效層數上限（見 {@link zAudioCastLayerCap}）。
     *
     * ⚠️ OPTIONAL 是刻意的，理由與 `mapBgm` 那一格逐字相同：把它設成必填會讓十幾份
     * 既有的 audio-map 夾具為了一個它們不在乎的欄位而變紅，而**只為了讓編譯器閉嘴而
     * 改過的夾具，是沒有人重讀過的夾具**。缺這一格 = 走 `DEFAULT_CAST_LAYER_CAP`。
     */
    castLayerCap: zAudioCastLayerCap.optional(),
    /**
     * ⭐ GH#605 —— 移動中的模型特效自帶音效的開關（見 {@link zAudioModelFxSound}）。
     * ⚠️ OPTIONAL 的理由與 `castLayerCap` / `mapBgm` 逐字相同。缺這一格 = 出貨預設。
     */
    modelFxSound: zAudioModelFxSound.optional(),
    /**
     * ⭐ 技能升級鈴要播誰的（見 {@link zAudioRankUpAudience}）。
     * ⚠️ OPTIONAL 的理由與 `castLayerCap` / `mapBgm` 逐字相同。缺這一格 = `"self"`。
     */
    rankUpAudience: zAudioRankUpAudience.optional().describe(
      "@zh 技能升級鈴播誰的\n" +
      "@note `rankUp` 是**廣播**事件，所以在夾之前，場上六個人每按一次 Q，你就聽見一次自己的升級鈴。self＝只有本人聽得到；all＝逐位元回到夾之前的行為。⛔ 刻意沒有第三種「別人的播小聲一點」——今天的音量是逐 key 的（下面那張 SFX 表），沒有逐事件的縫，收一個做不到的值進來就是一格設定得起來、遊戲裡什麼都不會發生的欄位。\n" +
      "@opt self self 只播本人的（出貨）\n" +
      "@opt all all 全場每一次升級都響（夾之前的行為）",
    ),
  })
  .strict();
export type AudioBgmTrack = z.infer<typeof zAudioBgmTrack>;
export type AudioSfxEntry = z.infer<typeof zAudioSfxEntry>;
export type AudioCastLayerCap = z.infer<typeof zAudioCastLayerCap>;
export type AudioModelFxSound = z.infer<typeof zAudioModelFxSound>;
export type AudioRankUpAudience = z.infer<typeof zAudioRankUpAudience>;
export type ConfigAudioMapDoc = z.infer<typeof zConfigAudioMapDoc>;
