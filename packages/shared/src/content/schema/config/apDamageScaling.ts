import { z } from "zod";
import {
  AP_CURVE_K_MAX,
  AP_CURVE_MAX_MULT_MAX,
  AP_DAMAGE_RATE_MAX,
  DEFAULT_AP_DAMAGE_SCALING,
} from "../../../sim/combat/apDamageScaling";

/**
 * `config.ap-damage-scaling@1` —— 「AP 是**原本傷害的額外加成**」。
 *
 * owner 2026-08-21：「技能傷害都套用公式 (1+AP*1%)⋯**=> 預設 0.5%**」。
 * ⭐ 這是調整**技能 vs 普攻**全域關係的**唯一**旋鈕；
 * 完整推導（含「為什麼掛在傷害佇列而不是五個傷害葉」、「為什麼反彈不吃」、
 * 以及 `apRatioMode` 那 115 個節點的量測）見 `sim/combat/apDamageScaling.ts` 檔頭。
 */
export const zConfigApDamageScalingDoc = z
  .object({
    id: z.literal("ap-damage-scaling"),
    schema: z.literal("config.ap-damage-scaling@1"),
    note: z.string().optional(),
    rate: z
      .number()
      .min(0)
      .max(AP_DAMAGE_RATE_MAX)
      .describe(
        // ⭐ GH#992 —— 後台那一頁的短名／說明從這裡推導，⛔ 不在 `apps/admin` 再打一份。
        "@zh 每 1 點法強讓技能多幾成傷害\n@note ⭐ **填 0 = 一鍵 rollback**：乘數恆為 1，逐位元回到這個欄位出現之前。⚠️ 上界不是保險起見 —— 那已經是「法強 200 的人技能打 ×11」的區間，再高就不是平衡而是打錯字（#277：50 打成 500 會過後台）。" +
          "每 1 點法強讓這一發傷害多幾成 —— 最終傷害 = 基礎傷害 × (1 + 法強 × 這一格)。" +
          "出貨 {{出貨值}}（＝0.5%/點：法強 100 → ×1.5、法強 200 → ×2.0）。" +
          "⭐ 調大 = 技能整體變重、堆法強的收益變陡、出身（法師 vs 射手）差距拉開；" +
          "調小 = 技能回到只吃自己卡面的數字。" +
          "⭐ 填 0 = 這一層**整個不存在**（乘數恆為 1），也就是一鍵 rollback 回到這個欄位出現之前。",
      ),
    scope: z
      .enum(["ability", "basic", "all"])
      .describe(
        "@zh 哪一類傷害吃這一層\n" +
        "@note 技能＝只有技能傷害（出貨值，owner 說的「**技能**傷害都套用」）：瞬發／吟唱技能、技能投射物、技能種下的持續傷害、代放，全部算。普攻＝只有普通攻擊。全部＝再加上道具／增益卡的觸發傷害、場地火焰、守衛塔、殭屍。⚠️ 選「全部」是一個**大得多**的平衡改動：每一件「造成 N 點傷害」的道具會跟著法強長，而那些道具的數字當初是照著沒有這一層設計的。逐一列出哪個來源落在哪一格的表在 `docs/editor-contract/ap-damage-scaling.md`（那張表是算出來的，不是寫上去的）。\n" +
        "哪一類傷害吃這一層。ability = 只有技能傷害（出貨值，owner 說的「技能傷害都套用」）——涵蓋瞬發／吟唱技能、技能投射物、技能掛上去的持續傷害、以及代放；basic = 只有普通攻擊；all = 全部再加上道具／增益卡的觸發傷害、場地火焰、守衛塔、殭屍。⚠️ 選 all 會讓每一件「造成 N 點傷害」的道具也跟著法強長，那是一個大得多的平衡改動。\n" +
        "@opt ability 技能傷害（出貨值）\n" +
        "@opt basic 只有普通攻擊\n" +
        "@opt all 全部傷害來源"
      ),
    apRatioMode: z
      .enum(["stack", "replace"])
      .describe(
        "@zh 與技能卡上既有的法強係數怎麼共存\n" +
        "@note 疊加＝兩層都吃（出貨值）：卡面係數決定「**這一支**特別吃法強」，上面那一格決定「技能**整體**吃多少」，兩者是不同的軸。取代＝卡面的法強係數在技能傷害上不算，只留上面那一層。⚠️ 選「取代」之前先看 `docs/editor-contract/ap-damage-scaling.md` 那張**量出來**的表：帶法強係數的技能傷害節點，絕大多數拿掉係數之後就**完全沒有屬性相依**（變成純固定值），而係數今天橫跨一個數量級 —— 取代會把「特別吃法強的大招」與「幾乎不吃的小招」壓成同一支。⭐ 它存在是為了**回頭**，⛔ 不是為了觀望。⚠️ 它只摀技能**傷害**：跟著法強長的治療與護盾一格都不動。\n" +
        "這一層與技能卡上既有的「法強係數」（ratios.ap）怎麼共存。stack = 兩層都吃（出貨值）：卡面係數決定「這一支特別吃法強」，這一格決定「技能整體吃多少」；replace = 卡面的法強係數在技能傷害上不算，只留這一層。⚠️ 選 replace 之前先讀 docs/editor-contract/ap-damage-scaling.md 那張**量出來**的表：帶法強係數的技能傷害節點，絕大多數拿掉係數之後就完全沒有屬性相依（變成純固定值），而係數今天橫跨一個數量級 —— 所以 replace 會把「特別吃法強的大招」與「幾乎不吃的小招」壓成同一支。\n" +
        "@opt stack 疊加：卡面係數 + 這一層（出貨值）\n" +
        "@opt replace 取代：只留這一層"
      ),
    /**
     * ⭐⭐ GH#929 —— **「目標最大生命 X%」那一族要不要吃這一層**。
     *
     * ⛔⛔ 在此之前這一格**只住在 sim 的 TS 裡**（`sim/combat/apDamageScaling.ts:130`）
     * ⇒ ⭐ 它是一個「引擎讀得到、⛔ 而後台調不到」的旗標 —— 第一守則的三個住處少了兩個。
     *
     * ⚠️ ⭐ 出貨 `true` 的理由是量到的：卡面寫「目標最大生命 **10%**」而實際打了
     * **27%** —— 因為那一發的量已經是「目標血量的一個比例」，
     * 再乘一次施法者的法強乘數就變成一句謊話（第一·五守則）。
     * ⭐ 而**反彈封包早就因為同一個理由被豁免了**（見上面 `note` 那一句）
     * ⇒ 這一格只是把同一條規則說出口。
     *
     * ⭐ 關掉它 ＝ 回到「連血量比例也吃法強」的舊行為（一鍵 rollback）。
     */
    resourcePctSkipsGlobalMult: z
      .boolean()
      .describe(
        "@zh 「目標最大生命 X%」要不要吃這一層\n" +
        "@note ⭐ 開著（出貨值）＝ **不吃** —— 卡面說「目標最大生命 10%」就真的是 10%。⚠️ ⭐ 關掉會回到這個欄位出現之前的行為,而那時**卡面說 10% 而實際打了 27%**:那一發的量已經是「目標血量的一個比例」,再乘一次施法者的法強乘數就變成一句謊話。⭐ 而**反彈封包早就因為同一個理由被豁免了**（它的三個讀數已經吃過攻擊者的乘數）⇒ 這一格只是把同一條規則說出口。⚠️ 它只影響「按比例吃血」那一族,⛔ 固定值與係數傷害一格都不動。\n" +
        "「目標最大生命 X%」這一族要不要吃全域 AP 乘法層。true（出貨值）＝ 不吃 —— 卡面說 10% 就真的是 10%；false ＝ 吃，也就是這個欄位出現之前的行為（那時卡面說 10% 而實際打 27%）。"
      ),
    /** ⭐ GH#1029 三段式的膝點 K。 */
    apCurveK: z
      .number()
      .positive()
      .max(AP_CURVE_K_MAX)
      .describe(
        "@zh 三段式：膝點 K（法強）\n@note " +
        "三段式的膝點：法強 ≤ 這一格逐位元等於直線 `1 + 法強 × 加成率`；超過之後裝備堆上來的每一點法強效益開始遞減。" +
          `出貨 {{出貨值}} —— owner：「K應該要設定在99級ap上限的數值(裸裝) 裝備帶來的ap價值會開始遞減才對」（LV99 裸裝最高 441）。`,
      ),
    /** ⭐ 邊際遞減指數 p（收成 1/20）。1.0 ＝ 直線（rollback）。 */
    apCurveP: z
      .number()
      .min(0.05)
      .max(1)
      .describe(
        "@zh 三段式：邊際遞減指數 p\n@note " +
        "膝點之後的邊際遞減強度：法強/K 的 p 次方。1.0 ＝ 直線（配上硬上界 0 就是逐位元回到今天的 rollback）；越小遞減越快。" +
          `出貨 {{出貨值}}。⚠️ 存檔時會收成 0.05 的整數倍（純度：不用 Math.pow，走有理根）。`,
      ),
    /** ⭐ 硬上界 M：乘數 ≤ 1 + M。0 ＝ 沒有上界。 */
    apCurveMaxMult: z
      .number()
      .min(0)
      .max(AP_CURVE_MAX_MULT_MAX)
      .describe(
        "@zh 三段式：硬上界 M\n@note " +
        "最後一道保險：乘數不超過 1 + 這一格。0 ＝ 沒有上界。" +
          `出貨 {{出貨值}}（×41）—— 加法天胡兩件全開只到 ×31 碰不到它；它實際上是千年積木那一件單品的煞車。`,
      ),
  })
  .strict();
export type ConfigApDamageScalingDoc = z.infer<typeof zConfigApDamageScalingDoc>;

/**
 * ⚠️ 缺文件 = 這一份，不是空物件 —— 一個 undefined 的 `rate` 會讓
 * `1 + ap * rate` 產出 **NaN**，而 NaN 傷害在畫面上等於「這一發沒扣血」。
 * ⛔ 三個值不抄字面量，從 `sim/combat/apDamageScaling.ts` 的出貨表推導。
 */
export const SHIPPED_AP_DAMAGE_SCALING: ConfigApDamageScalingDoc = {
  id: "ap-damage-scaling",
  schema: "config.ap-damage-scaling@1",
  rate: DEFAULT_AP_DAMAGE_SCALING.rate,
  scope: DEFAULT_AP_DAMAGE_SCALING.scope,
  apRatioMode: DEFAULT_AP_DAMAGE_SCALING.apRatioMode,
  // ⭐ GH#929 —— 同一顆出貨值（⛔ 不抄字面量,那會是第四個住處）。
  resourcePctSkipsGlobalMult: DEFAULT_AP_DAMAGE_SCALING.resourcePctSkipsGlobalMult,
  apCurveK: DEFAULT_AP_DAMAGE_SCALING.apCurveK,
  apCurveP: DEFAULT_AP_DAMAGE_SCALING.apCurveP,
  apCurveMaxMult: DEFAULT_AP_DAMAGE_SCALING.apCurveMaxMult,
};
