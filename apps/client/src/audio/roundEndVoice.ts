/**
 * roundEndVoice —— 回合結束那一拍**誰可以出聲**的唯一一份答案（GH#527）。
 *
 * owner 2026-08-22 逐字：
 *   「**回合結束只播放角色自己語音，不要播放機械語音，重複播放太吵了**」
 *
 * ── 先量，再改（⛔ 不憑印象）──────────────────────────────────────────────
 * 從 `combat → resolution` 這一個相位邊緣往下追，量到的是**三支**語音打在同一拍：
 *
 * | # | 呼叫點 | 何時 | 播什麼 | 誰的聲音 |
 * |---|---|---|---|---|
 * | 1 | `ui/RoundEndVoice.speakRoundEnd` → `audio/nameVoice.playQuote` | t=0 | `assets/audio/voices/quotes/<champ>.mp3` | **機械** — macOS `say`（Kyoko／Otoya），`tools/tts-gen/src/build-champ-quotes.mjs` |
 * | 2 | `ui/RoundEndVoice.speakRoundEnd` → `audio/contextualVoice("victory")` | t=0 | 英雄語音包的 victory 台詞 | **角色自己** ✅ |
 * | 3 | `render/RoundWinnerStage` → `audio/victoryTaunt.playRound` | t=2200ms | `assets/audio/voice-taunt/round/*.mp3` | **機械** — `victory-taunts.json` 的 `direction` 自己寫著「Google-Assistant register」 |
 * | 4 | 1 沒有剪輯時 `speakRoundEnd` 的 `quote` 模式退回 | t=0 之後 | 又是 3 那一支 | **機械** |
 *
 * ⇒ owner 聽到的「重複」不是同一支播兩次，是**同一位英雄在同一拍講三句話**，
 * 而其中兩句還不是他的聲音。
 *
 * ── 為什麼閘在這裡而不是在呼叫點 ─────────────────────────────────────────
 * 三個呼叫點分屬 `ui/` 與 `render/` 兩條 lane，而**決策只有一個**。散在三處＝
 * 三份會各自腐爛的 if（第〇·五守則的形狀）。這裡是那一個決策，三支播放器各自
 * 問它一次。
 *
 * ── 為什麼需要「這一拍開著沒有」這個訊號 ─────────────────────────────────
 * `victoryTaunt.playRound` 只在回合結束用，但 `nameVoice.playQuote` 與
 * `contextualVoice("victory")` **同時**服務比賽結束（`ui/panels/MatchEndPanel`）
 * 與點自己英雄的名言。從播放器裡分不出來 —— 所以 `ui/AudioDirector`（本來就是
 * 全 app 唯一持有 phase 的音訊擁有者，它也已經用同一個形狀把座位 id 發給
 * `combatSfx.setCombatSfxSeat`）在 `resolution` 的**進**與**離**兩個邊緣開關這一拍。
 * ⛔ 這一拍關著的時候本模組什麼都不管，比賽結束那一拍逐位元不變。
 *
 * ⚠️ 設定住 `content/config/audio-mix.json` 的 `voice.roundEndMachineVoice` /
 * `voice.roundEndMinGapSec`（Zod + 出貨值在 `schema/audioMixDoc.ts`，後台在
 * 「混音」那一頁），⛔ 不是寫死的 —— 語音包目前只覆蓋 **51/113** 位英雄，所以
 * 「另外 62 位安靜」值不值得只有 owner 在真機上聽過才知道（第一守則）。
 */
import { DEFAULT_AUDIO_MIX, type ConfigAudioMixDoc } from "@ggd/shared/content";
import type { AudioMixRoundEndMachineVoice } from "@ggd/shared/content/schema/audioMixDoc";

/** 這一拍的兩種聲源。`machine` = macOS `say` 產的 TTS（名言／嘲諷）。 */
export type RoundEndVoiceSource = "champion" | "machine";

export interface RoundEndVoicePolicy {
  machineVoice: AudioMixRoundEndMachineVoice;
  minGapSec: number;
}

/** 出貨值 —— 也是文件缺席／載入失敗時退回的那一份（⛔ 不是「維持上一場」）。 */
export const SHIPPED_ROUND_END_VOICE: RoundEndVoicePolicy = {
  machineVoice: DEFAULT_AUDIO_MIX.voice.roundEndMachineVoice ?? "off",
  minGapSec: DEFAULT_AUDIO_MIX.voice.roundEndMinGapSec ?? 0,
};

/** 純決策：這一個聲源在這一拍**准不准**出聲。⛔ 不含「誰講過了」的記帳。 */
export function roundEndVoiceAllows(
  policy: RoundEndVoicePolicy,
  source: RoundEndVoiceSource,
  ctx: { hasChampionLine: boolean; lastGrantedMs: number | null; nowMs: number },
): boolean {
  // 「重複播放太吵了」那一半 —— 兩種聲源一起吃，所以先搶到的那一句就是這一拍
  // 唯一的一句。角色自己的宣言在 t=0、機械嘲諷在 t=2200ms ⇒ 角色永遠先搶到。
  if (policy.minGapSec > 0 && ctx.lastGrantedMs !== null) {
    if (ctx.nowMs - ctx.lastGrantedMs < policy.minGapSec * 1000) return false;
  }
  if (source === "champion") return true;
  switch (policy.machineVoice) {
    case "on":
      return true;
    case "fallback":
      // 這位英雄自己沒有語音包才退回機械語音 —— ⛔ 不是「角色那一句沒播成功」，
      // 因為名言比宣言**早**被呼叫，用「播成功了嗎」當條件會變成順序相依（失敗
      // 形態④：斷言方向跟缺陷無關）。「有沒有這一句」是同步問得到的事實。
      return !ctx.hasChampionLine;
    default:
      return false;
  }
}

// ── 執行期單例（形狀抄 `voiceMixPolicy`：餵它的只有 ContentDb，讀它的在很遠的
//    另一條鏈上，做成參數就要在三個模組之間多傳一層）───────────────────────

let policy: RoundEndVoicePolicy = { ...SHIPPED_ROUND_END_VOICE };
let beatOpen = false;
/** championId → 上一次在回合結束拿到語音的時刻（ms）。 */
const lastGranted = new Map<string, number>();
/** 「這位英雄有沒有自己的 victory 台詞」—— 由 `contextualVoice` 在載入時註冊。 */
let hasChampionLinePort: (championId: string) => boolean = () => false;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** 文件 → 政策。缺席／壞掉一律回退出貨值。由 `voiceMixPolicy.applyAudioMixDoc` 餵。 */
export function applyRoundEndVoiceDoc(doc: ConfigAudioMixDoc | null | undefined): void {
  const m = doc?.voice?.roundEndMachineVoice;
  const g = doc?.voice?.roundEndMinGapSec;
  policy = {
    machineVoice:
      m === "off" || m === "fallback" || m === "on" ? m : SHIPPED_ROUND_END_VOICE.machineVoice,
    // 後台 overlay 不走 Zod（GH#283），所以這裡再夾一次下界。
    minGapSec:
      typeof g === "number" && Number.isFinite(g) && g >= 0 ? g : SHIPPED_ROUND_END_VOICE.minGapSec,
  };
}

/** `contextualVoice` 用這一支把「這位英雄有沒有 victory 台詞」接進來（避免循環匯入）。 */
export function setRoundEndChampionLinePort(fn: (championId: string) => boolean): void {
  hasChampionLinePort = fn;
}

/** 進入 `resolution` 相位 —— 這一拍開始。由 `ui/AudioDirector` 在相位邊緣呼叫。 */
export function openRoundEndVoiceBeat(): void {
  beatOpen = true;
}

/** 離開 `resolution` 相位 —— 這一拍結束。⛔ 不清 `lastGranted`（那是跨拍的間隔）。 */
export function closeRoundEndVoiceBeat(): void {
  beatOpen = false;
}

/** 這一拍開著嗎。播放器用它判斷「這一次呼叫是不是回合結束的那一次」。 */
export function roundEndVoiceBeatOpen(): boolean {
  return beatOpen;
}

/**
 * 申請這一拍的發言權。**這一拍關著時一律 true**（＝這一支管不到的場合，例如
 * 比賽結束的結算或點自己的英雄，行為逐位元不變）。准了就記帳。
 */
export function grantRoundEndVoice(
  source: RoundEndVoiceSource,
  championId: string,
  nowMs: number = now(),
): boolean {
  if (!beatOpen) return true;
  if (!championId) return true;
  const ok = roundEndVoiceAllows(policy, source, {
    hasChampionLine: hasChampionLinePort(championId),
    lastGrantedMs: lastGranted.get(championId) ?? null,
    nowMs,
  });
  if (ok) lastGranted.set(championId, nowMs);
  return ok;
}

/** 現行政策（觀測／測試）。 */
export function roundEndVoicePolicy(): RoundEndVoicePolicy {
  return policy;
}

/** 測試／teardown 專用：回到出貨值並清掉記帳。 */
export function resetRoundEndVoice(): void {
  policy = { ...SHIPPED_ROUND_END_VOICE };
  beatOpen = false;
  lastGranted.clear();
}
