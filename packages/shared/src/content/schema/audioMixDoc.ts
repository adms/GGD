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
  voice: { othersGain: 0.5 },
};
