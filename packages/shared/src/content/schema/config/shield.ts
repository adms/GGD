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
    absorbOrder: z.enum(["specificFirst", "generalFirst", "insertionOrder"]).describe(
      "@zh 多盾同時在身上時的消耗順序\n" +
      "@note 決定「先打掉哪一種保護」。specificFirst 會先燒掉專用盾，所以泛用盾留到最後、對面的下一發不管什麼屬性都還擋得住；generalFirst 反過來，先把泛用盾清光，逼出只剩抗魔盾的空窗，讓物理輸出有一段真的打得進去的窗口；insertionOrder 完全不看屬性，先上的先花 —— 護盾**會過期**，通常先上的也先到期，所以這一格是「不要讓盾白白過期」的近似解。三種對防守方的總吸收量一樣，差別在對面能不能操作出破口，所以這是節奏設計不是強弱調整。\n" +
      "@opt specificFirst specificFirst 專用盾先花（出貨值＝改成欄位之前的行為）\n" +
      "@opt generalFirst generalFirst 泛用盾先花（逼出抗魔盾空窗）\n" +
      "@opt insertionOrder insertionOrder 不看屬性，先上的先花",
    ),
  })
  .strict()
  // ⭐ 文件層的人話也住這裡（GH#992）：後台那一頁由 `specFromZod()` 整份推導。
  .describe(
    "@title 護盾規則\n" +
    "@intro 同一個角色身上同時掛著兩道以上的護盾時，一發傷害先花掉哪一道。場上真的會同時出現：破法對咒是**別人**幫你上的抗魔盾，守護之光／機警則是全類型的盾，兩者疊在同一個人身上是常態而不是例外。\n" +
    "@intro 這一頁不改護盾的**數值**（吸收多少、持續幾秒寫在各自的技能文件裡，全域倍率在 戰鬥系統 的 shield 那一格），只改**消耗順序** —— 它決定同一波輸出打下去，對面還剩哪一種保護。\n" +
    "@intro ⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/shield.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。\n" +
    "@consumer packages/shared/src/sim/combat/damage.ts 的 absorbOrder()（每一發傷害封包都會呼叫，讀 world.shieldRules.absorbOrder）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.shieldRules\n" +
    "@effect **要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。這份文件不在 content-bus 的三份即時文件裡（那三份是白名單／戰鬥系統／系統運維），它是 shard 開機載入內容樹時讀一次就定格 —— 和 基礎加成 同一個形態(#278)，寫成「下一場生效」會害操作者以為功能壞了。",
  );
export type ConfigShieldDoc = z.infer<typeof zConfigShieldDoc>;
