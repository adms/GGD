/**
 * audio/modelFxSound —— ⭐ 【移動中的模型特效】自帶的音效（GH#605）。
 *
 * owner 2026-08-23：「**也別忘了動地剁，跟相關的音效要播出來**」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 缺的不是一支技能的接線，是**整族**沒有聲音通道
 * ═══════════════════════════════════════════════════════════════════════════
 * 動地剁（38-03 的 `imported.tectonicfury` radial×12）五層逐層都通：模型 → glb →
 * sim emit → fanout 白名單 → 客戶端 `case "modelFxSpawn"`。⛔ 而 `spawnModelFx`
 * 這個 effect kind 的 payload 裡**一個聲音鍵都沒有** ⇒ 三個模板家族（三條黑龍／
 * 衝擊波／動地剁）＋ 四支橫放光束砲**畫面有、完全無聲**。
 *
 * `performanceEventsHaveConsumers.test.ts` 對此是綠的 —— 它驗「`modelFxSpawn`
 * 有消費端」，而它**有**（畫模型那一半）。「它應該也要發出聲音」從來不是任何斷言
 * 的反面（第一·五守則的形狀）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這一支只做**解讀**，⛔ 不碰 WebAudio
 * ═══════════════════════════════════════════════════════════════════════════
 * 播放一律回到 `vfxSound.ts` → `SpatialSfxQueue` → `AudioSystem` 那條既有管線，
 * 於是總音量／SFX 開關／SfxGate 的冷卻與同時發聲數／空間音場政策表／#568 的
 * **層數上限**全部自動適用。⛔ 一條繞過玩家設定的新音訊路徑就是缺陷。
 */
import type { AudioModelFxSound } from "@ggd/shared/content";
import type { CastSoundLayer } from "./sfxLayerCap";

/**
 * ⭐ 出貨值 —— **兩半都開**，而這是我挑的（owner 常設指令：「沒做完以前別問我了
 * 自己判斷 但是留後台開關可以簡易 rollback」）。
 *
 * ⚠️ 預設值不是中立的：這一族在此之前是**完全無聲**，而 owner 的話是「音效要播
 * 出來」⇒ 「開」才是他要的那一邊；開關存在是為了**回頭**（`content/config/
 * audio-map.json` 的 `modelFxSound`），⛔ 不是為了觀望。
 */
export const DEFAULT_MODEL_FX_SOUND: AudioModelFxSound = { enabled: true, arrive: true };

/**
 * 把任意輸入解讀成一份政策。**逐格**降級（⛔ 不是整份二選一）——理由與
 * `sfxLayerCap.readCastLayerCap` 逐字相同：一份存了一半的後台 override 要保住
 * owner 真的存過的那幾格。
 */
export function readModelFxSound(raw: unknown): AudioModelFxSound {
  const d = raw as Partial<AudioModelFxSound> | null | undefined;
  if (!d || typeof d !== "object") return DEFAULT_MODEL_FX_SOUND;
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_MODEL_FX_SOUND.enabled,
    arrive: typeof d.arrive === "boolean" ? d.arrive : DEFAULT_MODEL_FX_SOUND.arrive,
  };
}

/** `modelFxSpawn` 事件裡與聲音有關的那幾格（sim/effects/spawnModelFx.ts 寫的）。 */
export interface ModelFxSoundEvent {
  /** 施放那一刻要播的 audio-map key。 */
  readonly soundKey?: string;
  /** 落點那一刻要播的 audio-map key。 */
  readonly arriveSoundKey?: string;
  /** 落點在多久之後（秒）。走最久的那一具算的，⛔ 一次施放一發。 */
  readonly arriveDelaySec: number;
  /** `"ability:<id>"`；層數上限要問技能 id。 */
  readonly origin?: string;
  /** 施法者 —— 空間音場的錨（政策表決定留不留得住）。 */
  readonly caster?: number;
}

/**
 * 兩格聲音鍵各自落在 #568 的哪一層。
 *
 * `soundKey` = 施放那一刻 ⇒ **特效發射**；`arriveSoundKey` = 落點 ⇒ **特效命中**。
 * ⭐ 復用同一份層序（`sfxLayerCap.CAST_LAYER_ORDER`），⛔ 不發明第六層 ——
 * 發明一層會讓 owner 那張「哪些碰到上限」的表少算這一族。
 */
export const MODEL_FX_LAUNCH_LAYER: CastSoundLayer = "特效發射";
export const MODEL_FX_ARRIVE_LAYER: CastSoundLayer = "特效命中";

/** 事件 payload → 這一支看得懂的形狀。⛔ 不驗值，那是播放端的事。 */
export function readModelFxSoundEvent(data: Record<string, unknown>): ModelFxSoundEvent {
  const str = (k: string): string | undefined => {
    const v = data[k];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const delay = data["arriveDelaySec"];
  return {
    ...(str("soundKey") !== undefined ? { soundKey: str("soundKey")! } : {}),
    ...(str("arriveSoundKey") !== undefined ? { arriveSoundKey: str("arriveSoundKey")! } : {}),
    arriveDelaySec: typeof delay === "number" && Number.isFinite(delay) && delay > 0 ? delay : 0,
    ...(str("origin") !== undefined ? { origin: str("origin")! } : {}),
    ...(typeof data["caster"] === "number" ? { caster: data["caster"] as number } : {}),
  };
}
