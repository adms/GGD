import { z } from "zod";
import { zId } from "../common";
// 嘲弄規則的上界 —— 定義在 sim/taunt.ts(sim 也夾同一個數字),schema 只是把它
// 接上 Zod,所以兩層守的不可能是兩個數字。
import { TAUNT_DURATION_MULT_MAX, TAUNT_LEASH_MAX, TAUNT_MAX_TARGETS } from "../../../sim/taunt";

/**
 * config.taunt@1 — 嘲弄規則 (鍊金術之盾 godie-i06q 的 [嘲弄]).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在
 * `packages/shared/src/sim/taunt.ts` 的 {@link TauntRules}。
 *
 * ⚠️ **缺文件 = `DEFAULT_TAUNT_RULES`(出貨值)**,不是空表。空表在 TypeScript
 * 底下會讓 `enabled` 讀成 `undefined`(falsy),也就是嘲弄靜默消失 —— 道具照樣
 * 買得到、描述照樣寫著「吸引周圍敵人」、內部冷卻照樣在跑,而場上沒有任何人被
 * 拉走。這是 `stealthRules` / `statCaps` 學過的同一課。
 *
 * 為什麼是自己一份文件而不是塞進 `config.combat-feel@1`:combat-feel 是**手感**
 * (擊退距離、打就站定、面向鎖窗口),嘲弄是**索敵規則**,兩者一起調的機會是零;
 * 而且 combat-feel 那一頁的欄位是 `deriveFields(zConfigCombatFeelDoc)` 推導的,
 * 而那支推導器不認得 enum(`conflictMode` 會落進 `unsupported`,而
 * `apps/admin/src/combatFeel.test.ts` 斷言 `unsupported` 必須是空陣列)——
 * 塞進去就是把隔壁工作流的頁面弄紅。同 `config.shield@1` 的理由。
 */
export const zConfigTauntDoc = z
  .object({
    id: zId,
    schema: z.literal("config.taunt@1"),
    note: z.string().optional(),
    /** 總開關;false = 嘲弄完全不存在(既有紀錄讀不出來,新的也寫不進去) */
    enabled: z.boolean(),
    /**
     * **決策點**:嘲弄要不要蓋掉玩家**自己右鍵點名**的目標。
     * 出貨 false = 只接管自動索敵與 bot／小怪 aggro,玩家手上的方向盤不動。
     * true = WC3 原作行為(嘲弄連玩家指令一起蓋掉)。
     */
    overridesManualOrder: z.boolean(),
    /**
     * **決策點**:上面那格開著時,嘲弄退掉之後要不要把玩家原本點名的目標
     * **還回去**。出貨 true。
     *
     * ⚠️ 它以前不存在,而缺席不是「少一個選項」是一個缺陷:被搶走的手選目標
     * 會被 `attackTargetAuto = true` 重新填上,也就是一次右鍵點名被**永久**
     * 轉成自動目標。一個布林值決定兩件事,而卡片上只寫了前一件。
     */
    restoreManualOrderOnLapse: z.boolean(),
    /** **決策點**:小怪(殭屍/殭屍王)吃不吃嘲弄。出貨 true。 */
    appliesToMobs: z.boolean(),
    /**
     * **決策點**:小怪被嘲弄時,嘲弄者是**取代**牠的最近敵人掃描(出貨
     * `replace`),還是只**偏袒**(`nearestFirst` —— 掃描照跑,嘲弄者只有在沒有
     * 更近的敵人時才贏)。
     */
    mobTauntMode: z.enum(["replace", "nearestFirst"]),
    /**
     * **決策點**:嘲弄在索敵比較器裡站哪一格。
     * `absolute`(出貨,= owner 卡面「優先攻擊自己」)= sort key 0,壓過
     * 「敵方英雄優先」與「威脅」;`aboveThreatOnly` = 排在「敵方英雄優先」
     * 之後。差別只在嘲弄者與另一個候選**種類不同**時看得到。
     */
    priority: z.enum(["absolute", "aboveThreatOnly"]),
    /**
     * **決策點**:一個被嘲弄的身體最多被拖多遠(GGD 單位)。0 = 不限制。
     * 出貨 24 = 一個決鬥區的半徑;上界 100 是誤植守衛(區域直徑才 48)。
     */
    leashUnits: z.number().min(0).max(TAUNT_LEASH_MAX),
    /**
     * **決策點**:一發**範圍**嘲弄最多拉幾個人。卡片沒寫 `maxTargets` 時用
     * 它,卡片寫了也夾不過它。出貨 20 = 這一格出現前寫死的那個數字。
     */
    maxTargetsCap: z.number().int().min(1).max(TAUNT_MAX_TARGETS),
    /**
     * **決策點**:上面那個上限砍人時**留下哪幾個**。
     * `nearest`(出貨,由近到遠)/ `lowestHp`(血最低先拉)/ `id`(先生成先拉)。
     */
    capOrder: z.enum(["nearest", "lowestHp", "id"]),
    /**
     * **決策點**:同一個人被兩個敵人先後嘲弄時誰贏。
     * newest(出貨)= 最後喊的贏;longest = 剩餘時間長的贏。
     */
    conflictMode: z.enum(["newest", "longest"]),
    /**
     * 全域持續時間倍率,乘在內容自己寫的秒數上。1 = 照文件寫的。
     * 上界 10 是誤植守衛(#277 的形狀):0.5 秒打成 40 倍就是 20 秒,
     * 整整一波交戰所有人都在打同一個人,而畫面上看起來就是「索敵壞掉了」。
     */
    durationMult: z.number().min(0).max(TAUNT_DURATION_MULT_MAX),
  })
  .strict();
export type ConfigTauntDoc = z.infer<typeof zConfigTauntDoc>;
