/**
 * voiceMixPolicy —— 「別人的語音要多大聲」的唯一一份現行答案。
 *
 * owner 2026-08-17（GH#339）：「相較於自己英雄的語音 其他角色的語音音量應該減少一半」。
 * 那個「一半」住在 `content/config/audio-mix.json`（schema `config.audio-mix@1`）的
 * `voice.othersGain`，⛔ 不是寫死的 0.5 —— 太小 = 打起來像在打空氣、太大 = 十二個人
 * 同時講話蓋掉自己的角色，哪一邊比較好只有 owner 在真機上打過才知道（第一守則）。
 *
 * ── 為什麼是模組層的單例而不是一個參數（形狀抄 `vfx/victoryFxPolicy`）─────────
 * 餵它的只有一個地方（`content/ContentDb.load()`），讀它的在很遠的另一條鏈上：
 * `GameApp.flushContextualVoices` → `voiceSpatialMix` → `voicePlayOptions`，
 * 而那條鏈每幀跑、途中經過三個不持有 ContentDb 的模組。做成建構參數就要在整條鏈上
 * 多傳一層，而漏掉的症狀是「後台把滑桿拉到 0.2，場上還是一樣吵」——
 * 也就是第②號故障（算出來了但從沒送到）。
 *
 * ⚠️ 初始值是**出貨值**（`DEFAULT_AUDIO_MIX`），不是 1。這個模組在
 * `applyAudioMixDoc` 被呼叫之前就會被讀到（內容還在載、或整份載失敗退到骨架），
 * 而那條路上 owner 要的仍然是「別人小聲一半」。⛔ 初始值寫 1 等於讓最沒有人在看的
 * 那條路把他剛裁決掉的行為又點回來。
 */
import { DEFAULT_AUDIO_MIX, type ConfigAudioMixDoc } from "@ggd/shared/content";

const SHIPPED = DEFAULT_AUDIO_MIX.voice.othersGain;

let current: number = SHIPPED;

/**
 * 文件 → 政策。文件缺席／schema 不合／欄位不是有限數時傳 null，回退到出貨值 ——
 * ⛔ **不是**「維持上一場的值」，因為那會讓一次成功的載入把設定黏在下一場失敗的
 * 載入上（理由同 `applyVictoryFxDoc`）。
 *
 * 夾在 [0,1] 是因為這一層只准**衰減**：>1 會把語音推過 SFX bus 的頂（`hurt`／`defeat`
 * 本來就是整包裡最大聲的幾支）。Zod 那邊已經有同一組上下界，這裡再夾一次是為了
 * 「後台 overlay 沒走 Zod」那條路（GH#283）。
 */
export function applyAudioMixDoc(doc: ConfigAudioMixDoc | null | undefined): void {
  const g = doc?.voice?.othersGain;
  current = typeof g === "number" && Number.isFinite(g) ? Math.min(1, Math.max(0, g)) : SHIPPED;
}

/** 現行倍率。每一個決定「別人的語音多大聲」的地方都必須讀這一支。 */
export function othersVoiceGain(): number {
  return current;
}

/** 測試／teardown 專用：回到出貨值。 */
export function resetVoiceMixPolicy(): void {
  current = SHIPPED;
}
