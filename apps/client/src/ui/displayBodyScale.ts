/**
 * displayBodyScale —— 身體放大倍數 → 攻擊距離 (GH#252),面板與 sim 讀同一份規則。
 *
 * #125 要求玩家看到的數字就是他真的拿得到的。體型連動之後,一位 bodyScale 3.0 的
 * 英雄實際射程是卡面的 3 倍,面板若還印卡面值就是一個「比較小的合理數字」——
 * 最難發現的那一種謊。
 *
 * ⚠️ 和 `displayStatCaps.ts` 的差別,寫在這裡而不是假裝沒有:
 * **這一份沒有 wire 來源**。`MatchState` 沒有 `bodyScaleJson`,而 Colyseus 的
 * `defineTypes` 是 APPEND-ONLY(加錯回不去),所以這一版不為了顯示去佔一格。
 * 後果是:比賽跑到一半、操作者又改了後台,面板會先看到新規則而伺服器仍用開賽
 * 定格的那一份。那個窗口只在「操作者在一場比賽進行中改這一頁」時存在,而這一頁
 * 本來就要重啟 shard 才生效(同 shieldRules / blockRules / tauntRules)。
 * 要關掉這個窗口,正確做法是替這三份 rules 一起加一格 wire 欄位,不是這裡。
 */
import { Configs } from "@ggd/shared/content";
import {
  BODY_SCALE_DOC_ID,
  bodyScaleRulesFromDoc,
  type BodyScaleRules,
} from "@ggd/shared/sim/bodyScale";

/** 內容文件(含 #189 的耐久覆蓋層)裡的規則;缺 = 出貨預設,不是「關掉」。 */
export function contentBodyScaleRules(): BodyScaleRules {
  return bodyScaleRulesFromDoc(Configs.tryGet(BODY_SCALE_DOC_ID));
}
