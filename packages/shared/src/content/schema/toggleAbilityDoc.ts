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
    enabled: z.boolean().describe(
      "@zh 開啟中流轉總開關\n" +
      "@note 關掉之後，開著的開關型技能和「冷卻剛好」長得**一模一樣** —— 那正是 owner 回報的狀況。留著這一格是為了能一鍵回到那個舊畫面（例如流轉在某個瀏覽器上掉幀時），⛔ 不是為了觀望。",
    ),
    /** 流轉掃一圈幾毫秒。太快會變成閃爍（致暈），太慢看不出它在動。 */
    sweepMs: z.number().min(200).max(8000).describe(
      "@zh 流轉掃一圈幾毫秒\n" +
      "@note 光點繞技能格一圈的時間。⚠️ **兩端都會弄壞它想傳達的訊息**：太快（幾百毫秒）會從「在流轉」變成「在閃爍」，而高頻閃爍是光敏性癲癇的直接誘因；太慢（好幾秒）則在一場交戰的視線停留時間內看起來根本沒動，玩家仍然分不出開還是關。",
    ),
    /** 流轉光邊的粗細（px）。 */
    rimPx: z.number().min(0.5).max(12).describe(
      "@zh 流轉光邊粗細（px）\n" +
      "@note 那一圈光本身有多寬。技能格在手機上只有幾十 px，所以這一格調大的代價不是「更明顯」而是「蓋住圖示」——圖示看不見的話，玩家知道有東西開著卻不知道是哪一個。",
    ),
    /** 外溢的輝光半徑（px）。0 = 只有硬邊。 */
    glowPx: z.number().min(0).max(40).describe(
      "@zh 外溢輝光半徑（px）\n" +
      "@note 光邊往外暈開多遠。0 ＝ 只有一條硬邊（最省，也最不會糊到隔壁那一格）。技能列是六格並排的，這一格調大時**相鄰兩格的光會互相溢進去**，於是「哪一格開著」又變得要猜。",
    ),
    /**
     * 流轉的顏色（CSS 顏色字串）。
     * ⭐ **空字串 = 用技能自己那一族的顏色**（主動／EX／被動各有一個 ready 色），
     *   而那是出貨值 —— ⛔ 不是「沒填」：開關態沿用該族的顏色才不會在畫面上多出
     *   一個與技能種類無關的新色。⚠️ 填了就是**全部**開關型技能共用同一個顏色。
     * ⚠️ 要與 ready 框的顏色**分得開**（明度或飽和度），否則「開著」與「冷卻好了」
     *   又混在一起 —— 那正是 owner 回報的問題。
     */
    color: z.string().max(64).describe(
      "@zh 流轉顏色\n" +
      "@note 留**空**＝用技能自己那一族的顏色（主動／EX／被動各有一個），也就是不在畫面上多出一個與技能種類無關的新色。填 `#rrggbb` 則是**所有**開關型技能共用同一個顏色。⚠️ 填的時候要和 ready 框那個顏色**在明度或飽和度上分得開** —— 兩個顏色太近的話，這一整頁想解決的「開著 vs 冷卻好了」就又混回去了。",
    ),
  })
  .strict();

export type ConfigToggleAbilityDoc = z.infer<typeof zConfigToggleAbilityDoc>;
