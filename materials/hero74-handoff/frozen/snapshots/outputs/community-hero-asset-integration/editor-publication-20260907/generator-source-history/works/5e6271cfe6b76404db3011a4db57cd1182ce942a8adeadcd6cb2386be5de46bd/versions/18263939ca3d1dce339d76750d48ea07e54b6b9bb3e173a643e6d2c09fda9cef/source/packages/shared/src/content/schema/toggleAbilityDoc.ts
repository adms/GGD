/**
 * `config.toggle-ability@1` —— 開關型技能（風王結界那一族）的「**開啟中**」外觀（GH#546）。
 *
 * ⭐ owner 2026-08-22（逐字）：
 *
 * > 「**風王結界這種開關型按鈕 圖示跟特效要明顯看出是開還是關狀態**
 * >  （w3x會有**特殊攻擊特效跟隨手部**、**圖示也會有流轉**作為打開中顯示）」
 *
 * ⚠️ 這一份只管**圖示**那一半（流轉的顏色/速度/粗細）。
 * **手部跟隨特效**那一半走 `ability@1.persistentVfx`（GH#539 的機制）＋ `attach: "hand,right"`，
 * ⛔ 不在這裡 —— 兩者是不同的東西（一個是 HUD、一個是世界上的掛件）。
 *
 * ⚠️ 出貨值逐格等於 `apps/client/src/ui/toggleAbility.ts` 的 `SHIPPED_TOGGLE_ABILITY`
 * （第一守則的三個住處）。
 */
import { z } from "zod";

export const TOGGLE_ABILITY_DOC_ID = "toggle-ability";

export const zConfigToggleAbilityDoc = z
  .object({
    id: z.literal(TOGGLE_ABILITY_DOC_ID),
    schema: z.literal("config.toggle-ability@1"),
    note: z.string().max(2000).optional(),
    /** ⛔ 關掉 = 開著的技能與單純冷卻完畢**長得一模一樣**（那正是 owner 回報的問題）。 */
    enabled: z.boolean(),
    /** 流轉掃一圈幾毫秒。太快會變成閃爍（致暈），太慢看不出它在動。 */
    sweepMs: z.number().min(200).max(8000),
    /** 流轉光邊的粗細（px）。 */
    rimPx: z.number().min(0.5).max(12),
    /** 外溢的輝光半徑（px）。0 = 只有硬邊。 */
    glowPx: z.number().min(0).max(40),
    /**
     * 流轉的顏色（CSS 顏色字串）。
     * ⭐ **空字串 = 用技能自己那一族的顏色**（主動／EX／被動各有一個 ready 色），
     *   而那是出貨值 —— ⛔ 不是「沒填」：開關態沿用該族的顏色才不會在畫面上多出
     *   一個與技能種類無關的新色。⚠️ 填了就是**全部**開關型技能共用同一個顏色。
     * ⚠️ 要與 ready 框的顏色**分得開**（明度或飽和度），否則「開著」與「冷卻好了」
     *   又混在一起 —— 那正是 owner 回報的問題。
     */
    color: z.string().max(64),
  })
  .strict();

export type ConfigToggleAbilityDoc = z.infer<typeof zConfigToggleAbilityDoc>;
