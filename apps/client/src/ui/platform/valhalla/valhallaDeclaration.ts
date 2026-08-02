/**
 * valhallaDeclaration — 英靈殿展示時的「宣言」語音來源 (GH#256 的英靈殿那半)。
 *
 * owner 原話：「英靈殿 展示的時候要發出該角色的自己語音宣言」
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 誠實地說：**名言內容還不存在**
 * ---------------------------------------------------------------------------
 * 實測 119 隻英雄的 `quote` / `famousQuote` 欄位是 **0 / 119** —— 一句都沒有。
 * #139（每支英雄的名言）與 #142（全 113 支的日文名言 VO）都還 pending。
 * 所以現在**沒有任何一句真的「宣言」可以播**。
 *
 * 那要做什麼？把**播放點**先接好，接到既有的 per-champion 語音（#27「點自己的
 * 英雄會播該英雄的語音」，也就是 `playChampionSelectVoice` 那條五段梯子：
 * authored 地圖語音 → 生成語音包 → WC3 soundset → 名乗り → 名言）。英靈殿因此
 * **今天就會出聲**，而且出的是**那一隻英雄自己的聲音**，不是通用系統音。
 *
 * ---------------------------------------------------------------------------
 * 這個檔案存在的唯一理由：**留一個具名的接縫**
 * ---------------------------------------------------------------------------
 * {@link playValhallaDeclaration} 就是那個接縫。#139/#142 的真名言 VO landed
 * 之後，要換的只有這一支函式的內部 —— 呼叫端（`ValhallaSandboxPanel` /
 * `ValhallaPanel`）一行都不用改。
 *
 * ⛔ 不要把 `playChampionSelectVoice` 直接寫在 UI 裡。那樣做的話「宣言」這個
 * 需求就消失在一個看起來像 #27 的呼叫裡，交接的人永遠不會知道它是暫代品，
 * 而 owner 會以為名言已經有了。這正是 CLAUDE.md 第三守則講的「註解會說謊」的
 * 反面做法：把**未完成**寫進型別與函式名，而不是寫進一句會腐爛的註解。
 */
import { playChampionSelectVoice } from "../../../audio/championVoice";

/** 這一次的聲音是從哪一層來的。 */
export type DeclarationSource =
  /** #139/#142 的真名言 VO。**目前永遠不會出現** —— 內容還不存在。 */
  | "famous-quote"
  /** #27 的 per-champion 語音（authored / 生成語音包 / soundset / 名乗り）。今天的實際來源。 */
  | "champion-voice"
  /** 靜音（混音器鎖住、或這隻英雄連 fallback 都沒有）。 */
  | "silent";

export interface DeclarationResult {
  source: DeclarationSource;
  /** 真的有聲音出去了嗎。false ≠ 錯誤 —— 靜音是合法結果（音量鎖、未解鎖）。 */
  played: boolean;
}

/**
 * 目前有沒有真的「名言」可播。
 *
 * **永遠回 false**，而且那是對的：`quote` 欄位在 119 隻英雄上全是空的。
 * 這一支不是佔位符 —— 它是 #139/#142 的**驗收條件**：那兩張單做完之後，把這裡
 * 改成真的去查名言資料，`playValhallaDeclaration` 的分支就會自己走到新的那一側。
 */
export function hasFamousQuoteVo(_championId: string): boolean {
  return false;
}

/**
 * 播放英靈殿的宣言。
 *
 * 今天走的是 `champion-voice`（#27 的梯子）。#139/#142 landed 之後，
 * `hasFamousQuoteVo` 會開始回 true，這裡的第一個分支才會活起來。
 */
export async function playValhallaDeclaration(championId: string): Promise<DeclarationResult> {
  if (!championId) return { source: "silent", played: false };
  if (hasFamousQuoteVo(championId)) {
    // #139/#142 的落點。目前不可達（見 hasFamousQuoteVo）。
    return { source: "famous-quote", played: false };
  }
  const played = await playChampionSelectVoice(championId);
  return { source: played ? "champion-voice" : "silent", played };
}

/**
 * 交接用的一句話。UI 把它印在按鈕的 `title` 上，這樣連**畫面上**都不會有人
 * 誤以為名言已經做好了。
 */
export const DECLARATION_PROVENANCE_NOTE =
  "目前播放的是該英雄自己的語音（#27）。專屬名言 VO 尚未製作（#139 / #142），做好後會自動改播名言。";
