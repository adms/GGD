/**
 * Numeric format contract for generated combat FX that are committed under
 * `content/assets/audio/sfx/fx/`. Source containers and archive masters are
 * preserved separately and are deliberately outside this shipping contract.
 *
 * ⭐ owner 2026-09-15「實際遊戲會使用的語音跟音效是 128bit 44khz mp3」⇒ 這一份是**出貨音訊格式的唯一住處**：
 * 語音管線（`tools/voice-gen/engine.py`）、原作匯入（`tools/voice-gen/import-original-direct.py`）、
 * 入庫檢查（`tools/audio-intake/audio_intake.py`）與批次瘦身（`tools/audio-optimize/optimize.sh`）
 * 都從這裡讀，⛔ 不各自抄一份（閘：`packages/shared/src/ops/audioPolicySingleHome.test.ts`）。
 */
export const GENERATED_COMBAT_FX_AUDIO_POLICY = {
  container: "mp3",
  codec: "MPEG-1 Layer III",
  channels: 1,
  sampleRateHz: 44_100,
  bitrateKbpsMax: 128,
} as const;

/**
 * 音效的長度下限（秒）。⛔ 刻意不套語音的 0.15 秒 —— 出貨的 11 支音效本來就比它短
 * （`sfx/fx/tick.mp3` 0.04 秒、`sfx/ui-type.mp3` 0.045 秒、`sfx/fx/footstep.mp3` 0.07 秒…，2026-09-15 實測），
 * 那是設計上的「一下」，⛔ 不是壞檔。0.02 秒 ＜ 一個 MP3 幀（1152／44100 ≈ 26 ms）⇒ 判準等於「至少有一幀聲音」。
 */
export const SFX_MIN_SECONDS = 0.02;
