/**
 * `config.hud-layout@1` —— **HUD 底部叢集的版面旋鈕**（GH#873）。
 *
 * ⭐ 這份文件存在的理由是**一條被複驗推翻的宣稱**：
 *
 * > 「開關 `goldLevelTouchLayout`（預設 `strip`）滿足 #873 的 AC3『一格後台開關』」
 *
 * ⛔ 2026-08-30 量到那不成立：`applyHudClusterOverride` 的**生產呼叫端是零**
 *   （`grep -rn applyHudClusterOverride apps packages` 只命中它自己的定義、
 *    文件註解與測試），而 `content/config/` 底下**沒有任何 hud 的 JSON**。
 *   ⇒ ⭐ **一格轉不到的旋鈕，不是 rollback 開關** —— 它只是一個 `export`。
 *
 * ⚠️ 而 owner 的常設指令逐字是：
 *
 * > 「別問我了自己判斷 **但是留後台開關可以簡易 rollback**」
 *
 * ⇒ ⭐ 「留開關」不是形式：它是那條指令**唯一**能成立的理由 ——
 *   我挑錯的成本必須是「他改一格下拉選單」，⛔ 不是「一次 PR ＋ 重跑全套 ＋ 一次部署」。
 *
 * ── ⛔ 為什麼是一份新文件 ──────────────────────────────────────────────────
 * `hudBottomCluster.ts` 的檔頭註解逐字寫著「the day `config.hud-layout@1` exists」
 * —— ⭐ 也就是說這個名字**在程式碼裡等了很久**。
 * ⚠️ 而它塞不進任何既有文件：`ui-cues` 是「畫面有沒有回話」、
 *   `lobby-layout` 是大廳、`camera` 是鏡頭。⛔ 把版面塞進其中一份，
 *   下一輪讀的人找不到它（第〇·四守則的反面：**沒有住處**）。
 *
 * ⚠️ 每一格的出貨值**刻意不抄字面值** —— 它們從 `SHIPPED_HUD_CLUSTER` 鏡射，
 *   而那一份自己又從 `hudLayout` 讀 `goldLevelTouchLayout`
 *   （值住在真正拿它算保留矩形的地方）。
 */
import { z } from "zod";

export const HUD_LAYOUT_DOC_ID = "hud-layout";

export const zConfigHudLayoutDoc = z
  .object({
    id: z.literal(HUD_LAYOUT_DOC_ID),
    schema: z.literal("config.hud-layout@1"),
    note: z.string().optional(),
    /**
     * ⭐ **觸控下右下角讀數（金錢／等級）的形狀。**
     *
     * · `"strip"`（出貨）—— 攻擊鈕**底下**的一條。
     * · `"column"` —— 2026-08-29 以前那一疊。⛔ **這是 rollback，不是對等選項**：
     *   量到它與攻擊鈕重疊 **88×86 ＝ 攻擊鈕的 97.7%**（三個橫向 viewport 全中）
     *   ⇒ 玩家按得到、看不到。
     *
     * ⚠️ ⭐ 而它只在**預設 HUD 縮放（中／100%）**下完全歸零 ——
     *   `gold-level` 不在 `SCALED_SLOTS` 裡（`hudLayout.ts:662` 只有 `enemy-team`），
     *   所以它的保留高度是固定 30px 而觸控矩形會跟著縮放走。
     *   ⇒ 小尺寸下仍有殘留（實測 small 70.4×8 · xsmall 44×20 · min 44×30），
     *   ⛔ **但每一格都比 `column` 少**（那一疊是 44×44 ~ 70.4×70.4）。
     */
    goldLevelTouchLayout: z.enum(["strip", "column"]),
    /** HP/MP 板與技能列之間的間距（px）。0 ＝ 兩個框貼著（相鄰不算重疊）。 */
    barsToAbilitiesGapPx: z.number().int().min(0).max(64),
    /** 視窗底緣到叢集底部的距離（px）。 */
    clusterBottomPx: z.number().int().min(0).max(400),
    /** 同上，但在觸控裝置（那裡沒有技能列，板子會掉到拇指區）。 */
    clusterTouchBottomPx: z.number().int().min(0).max(400),
    /** 叢集與它上方那條「施法被拒」訊息的間距（px）。 */
    castNoticeGapPx: z.number().int().min(0).max(64),
    /**
     * true ＝ 置中會撞到底部兩角時把叢集讓開；false ＝ 一律置中並蓋過去。
     * ⚠️ 關掉是 rollback（780×360 那個案例會回來），⛔ 不是對等選項。
     */
    keepClearOfCorners: z.boolean(),
    /** 右下角頭像顯示哪一位英雄。 */
    heroPortrait: z.enum(["current-form", "base-form", "none"]),
    /** 那個頭像的邊長（px）。 */
    heroPortraitPx: z.number().int().min(0).max(160),
  })
  .strict();

export type ConfigHudLayoutDoc = z.infer<typeof zConfigHudLayoutDoc>;

/**
 * ⚠️ ⭐ 出貨值**不在這裡** —— 它們是 `apps/client` 的 `SHIPPED_HUD_CLUSTER`，
 * 而那一份自己又從 `hudLayout` 讀 `goldLevelTouchLayout`。
 * ⇒ 這裡刻意**不放** `DEFAULT_HUD_LAYOUT` 的字面值，⛔ 否則就是第三個住處。
 * ⭐ 對帳由 `apps/client/src/ui/hud/hudBottomCluster.test.ts` 負責（它 import 兩邊）。
 */
