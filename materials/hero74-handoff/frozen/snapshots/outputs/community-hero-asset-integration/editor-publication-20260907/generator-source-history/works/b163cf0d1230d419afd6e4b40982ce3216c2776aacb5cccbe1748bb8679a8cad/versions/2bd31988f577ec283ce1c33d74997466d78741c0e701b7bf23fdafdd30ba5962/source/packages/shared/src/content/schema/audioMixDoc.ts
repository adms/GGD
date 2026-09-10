/**
 * `config.audio-mix@1` 的 Zod —— **混音**的決策點。
 *
 * 今天只有一格：**其他角色的語音要多大聲**。
 *
 * ── 為什麼是一份自己的文件 ────────────────────────────────────────────────
 * `config.combat-env@1` 每格是**倍率**、`config.base-bonus@1` 每格是**加數**、
 * `config.vfx-cleanup@1` 管的是特效層的池子 —— 三份都不是「聲音多大聲」。
 * 而混音一定會長大（音樂/環境/技能音效各自的相對音量都是同一類決策），
 * 所以它從第一格就住自己的文件，⛔ 不寄生在別份文件的角落。
 *
 * ── 為什麼是資料不是常數 ─────────────────────────────────────────────────
 * 「別人的語音比自己小聲多少」是**體感取捨**不是事實：太小 = 打起來像在打空氣，
 * 太大 = 十二個人同時講話蓋掉自己的角色。哪一邊比較好只有 owner 在真機上打過
 * 才知道，而寫死的話改一格 = 一次 client rebuild + 一次完整部署（第一守則）。
 *
 * ⚠️ 這一格**疊在** #253 的空間化衰減之上，不取代它：遠處的敵人仍然更小聲，
 * 這一格只是把「不是我」那一整族整體壓下去。
 */
import { z } from "zod";

/**
 * 語音那一層的混音。
 *
 * ⛔ 只收「其他角色」這一格 —— **自己**的語音沒有對應的旋鈕，因為它是 1.0 的
 * 定義本身（這一格是相對於自己的倍率）。給自己也開一格等於兩個地方管同一件事，
 * 而它們一定會分歧。
 */
/**
 * 回合結束那一拍，**機械語音**（macOS `say` 產的 TTS）要不要出聲 —— GH#527。
 *
 * owner 2026-08-22 逐字：「**回合結束只播放角色自己語音，不要播放機械語音，
 * 重複播放太吵了**」。
 *
 * ⚠️ 「機械語音」不是形容詞，是量到的事實。回合結束那一拍上有**三支**語音，
 * 其中兩支是 TTS：
 *
 *   · **名言**（`audio/nameVoice.playQuote`）—— `tools/tts-gen/src/build-champ-quotes.mjs`
 *     用 macOS `say` 的 **Kyoto/Otoya** 產的。
 *   · **嘲諷**（`audio/victoryTaunt.playRound`）—— `content/config/victory-taunts.json`
 *     的 `direction` 自己寫著「Flat, crisp, emotionless — **Google-Assistant
 *     register**」，`voices` 是 Shelley / Kyoko / Karen，也是 `say`。
 *   · **角色自己的勝利宣言**（`audio/contextualVoice` 的 `victory` 類別）——
 *     `content/assets/audio/voices/champions/MANIFEST.json` 的英雄語音包，
 *     **這一支才是 owner 要留的那一支**。
 *
 *   `off`      **出貨值**。回合結束只留角色自己的勝利宣言，名言與嘲諷都不放。
 *              ＝ owner 那句話的字面意思（第〇·六守則：優先權大的更新預設啟動）。
 *   `fallback` 角色自己**沒有**語音包的那些英雄才退回機械語音。
 *              ⚠️ 這一格存在是因為量到的覆蓋率：語音包目前是 **51/113 位英雄**，
 *              所以 `off` 之下另外 62 位的回合結束是**真的安靜**。安靜是不是問題
 *              是體感取捨，不是事實 —— 所以它是一格下拉，不是我替 owner 挑的答案。
 *   `on`       三支都放（2026-08-22 之前的行為）。配 `roundEndMinGapSec: 0`
 *              就是逐字的一鍵 rollback。
 */
export const AUDIO_MIX_ROUND_END_MACHINE_VOICES = ["off", "fallback", "on"] as const;
export type AudioMixRoundEndMachineVoice = (typeof AUDIO_MIX_ROUND_END_MACHINE_VOICES)[number];

/** 同一位英雄兩句回合結束語音之間的最短間隔（秒）的上界。 */
export const AUDIO_MIX_ROUND_END_MIN_GAP_SEC_MAX = 60;

export const zAudioMixVoice = z
  .object({
    othersGain: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "**其他角色**（敵人／隊友／小怪，也就是除了你自己以外）的語音音量倍率，" +
          "疊在 #253 的空間化衰減之上。" +
          "owner 2026-08-17：其他角色語音應該是自己的一半 ⇒ 出貨 0.5。" +
          "1 = 跟自己一樣大聲（＝2026-08-17 之前的行為）。",
      ),
    /**
     * ⚠️ `.optional()` 是刻意的（同 `victoryPodium.podiumZoneSource`）：這份文件
     * 已經有耐久覆蓋層可能存在線上，一份存於這一格之前的 override 少了必填欄會被
     * Zod 整份退回 → 內容載入失敗 → fail-open 退回骨架（2026-08-02 事故的形狀）。
     * 缺席 ⇒ `DEFAULT_AUDIO_MIX` 的那一格。
     */
    roundEndMachineVoice: z
      .enum(AUDIO_MIX_ROUND_END_MACHINE_VOICES)
      .optional()
      .describe(
        "GH#527。回合結束那一拍，TTS 機械語音（名言／嘲諷）要不要出聲：" +
          "off = 只留角色自己的勝利宣言（出貨值，owner 2026-08-22 的原話）；" +
          "fallback = 只有沒有語音包的英雄才退回機械語音；" +
          "on = 三支都放（＝2026-08-22 之前的行為）。",
      ),
    /**
     * 同一位英雄的兩句**回合結束**語音之間的最短間隔（秒）。⛔ 它只管回合結束
     * 那一拍，⛔ 不動戰鬥中的擊殺／受傷台詞（那些有自己的 `policyFor` 冷卻）。
     */
    roundEndMinGapSec: z
      .number()
      .min(0)
      .max(AUDIO_MIX_ROUND_END_MIN_GAP_SEC_MAX)
      .optional()
      .describe(
        "GH#527 的「重複播放太吵了」那一半。同一位英雄在回合結束拿到一句語音之後，" +
          "這麼多秒之內不會再拿到第二句（無論是角色語音還是機械語音）。" +
          "0 = 沒有間隔限制（＝2026-08-22 之前的行為）。",
      ),
  })
  .strict();

export const zConfigAudioMixDoc = z
  .object({
    id: z.literal("audio-mix"),
    schema: z.literal("config.audio-mix@1"),
    note: z.string().optional(),
    voice: zAudioMixVoice,
  })
  .strict();

export type AudioMixVoice = z.infer<typeof zAudioMixVoice>;
export type ConfigAudioMixDoc = z.infer<typeof zConfigAudioMixDoc>;

/**
 * 出貨值 —— 也是**文件不在時**（舊部署／內容載入失敗／後台把它刪掉）消費端
 * 退回的那一份。
 *
 * ⭐ `othersGain: 1` 逐字等於 2026-08-17 之前的行為，所以它同時是 owner 的
 * 一鍵 rollback —— ⛔ 不另外開一個 boolean（兩格管同一件事只會分歧，
 * 理由與 `zConfigMitigationDoc` 的 `negativeResistAmplifyCeiling` 相同）。
 */
export const DEFAULT_AUDIO_MIX: ConfigAudioMixDoc = {
  id: "audio-mix",
  schema: "config.audio-mix@1",
  voice: {
    othersGain: 0.5,
    // GH#527 —— owner 2026-08-22：「回合結束只播放角色自己語音，不要播放機械語音」。
    roundEndMachineVoice: "off",
    // 「重複播放太吵了」。6 秒＝回合結束那一拍上三支語音的總跨度還有餘裕
    // （名言 t=0、嘲諷 t=2200ms，加上最長的剪輯），所以一拍只出得了一句。
    roundEndMinGapSec: 6,
  },
};
