import { z } from "zod";
import { zId } from "../common";

/**
 * config.shield@1 — 護盾規則 (GH#289 lane P6)。
 *
 * 目前只有一格:**同一個單位身上有多個護盾池時,誰先被吃掉**。語意、三個值的
 * 差別、以及「為什麼這是欄位不是寫死的 if」全部寫在 `sim/shieldRules.ts`。
 *
 * ⚠️ 為什麼是自己一份文件,而不是塞進 `config.combat-feel@1`:
 *   · 語意上 combat-feel 是**手感**(擊退距離、打就站定、面向鎖窗口),護盾誰
 *     先吃是**傷害結算規則**,兩者一起調的機會是零;
 *   · 技術上 combat-feel 那一頁的後台欄位是 `deriveFields(zConfigCombatFeelDoc)`
 *     推導出來的,而那支推導器只認得 number / boolean —— enum 會被歸進
 *     `unsupported`,而 `apps/admin/src/combatFeel.test.ts` 斷言
 *     `unsupported` 必須是空陣列。把一個 enum 塞進去 = 隔壁工作流的頁面紅掉,
 *     而那個紅燈的意思是「有人要決定這一格的 UI 長怎樣」,不是「schema 錯了」。
 *
 * **缺文件 = 出貨預設**(`specificFirst` = 這條規則變成欄位之前的行為),不是空表。
 */
export const zConfigShieldDoc = z
  .object({
    id: zId,
    schema: z.literal("config.shield@1"),
    note: z.string().optional(),
    /**
     * 多個護盾池同時吃得下這一發時的消耗順序。
     *
     *   specificFirst   先花只吸這一型的池子(出貨值 = 舊行為)
     *   generalFirst    先花全類型的池子 —— 讓「先打掉泛用盾、逼出抗魔盾」
     *                   變成一個可以操作的節奏
     *   insertionOrder  不看類型專一性,純粹舊的先花 —— 護盾會過期,先花快到期
     *                   的那個才不會浪費
     *
     * 三個值都有行為守衛(sim/effects/shieldAbsorb.test.ts:同一組池子 + 同一發
     * 傷害 → 三種順序留下三組不同的剩餘量)。
     */
    absorbOrder: z.enum(["specificFirst", "generalFirst", "insertionOrder"]),
  })
  .strict();
export type ConfigShieldDoc = z.infer<typeof zConfigShieldDoc>;
