import { z } from "zod";

/**
 * `config.weakness@1` —— 【虛弱】的全域定義（GH#301-4）。
 *
 * owner 2026-08-09：「虛弱 => **攻擊速度暫時減半、AP/AD 造成傷害暫時減半**」。
 *
 * ⚠️ 這三格**不在卡片上**，這是它與【重創】的分野：重創的倍率逐卡不同（「這一支
 * 技能的重創有多重」），而虛弱是 owner 給的一個**全域定義**（「虛弱就是減半」）。
 * 定義住在一個地方，所以調整它只要動這一頁，不用逐卡改。
 *
 * ⚠️ 兩個倍率兩端都有界（#277）：上界 1 不是平衡政策，是保險絲 —— 一個 >1 的
 * 「虛弱」會讓中了虛弱的人變強，而畫面上只看得到「他怎麼突然打很痛」。
 * 完整推導（為什麼砍封包不砍屬性、為什麼層數不放大它）見 `sim/weakness.ts` 檔頭。
 */
export const zConfigWeaknessDoc = z
  .object({
    id: z.literal("weakness"),
    schema: z.literal("config.weakness@1"),
    note: z.string().optional(),
    statusTag: z
      .string()
      .min(1)
      .max(64)
      .describe(
        "@zh 哪一個狀態分類算虛弱\n" +
        "@note 引擎不認任何寫死的狀態編號 —— 它問的是「這個人身上有沒有一筆帶著這個分類的狀態」。所以只要一份狀態文件的 tags 帶了這個字，任何技能掛上它就會虛弱。⚠️ 目前出貨的 28 份狀態沒有一份帶這個分類，所以在那一份文件上架之前，這個機制一場比賽裡一次都不會發生。\n" +
        "哪一個**狀態分類**算虛弱（狀態文件 tags 上的一個字串）。引擎不認任何寫死的狀態編號 —— 只要一份 status-effect 文件的 tags 帶了這個字，掛上它就會觸發虛弱。改這一格＝換一個分類。"
      ),
    attackSpeedMult: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "@zh 被虛弱時攻速乘多少\n" +
        "@note 0.5 = 減半（出貨值）。1 = 把攻速那一半關掉，只留傷害那一半。0 = 完全打不出普攻。⚠️ 它乘的是最終攻速，不進屬性面板。\n" +
        "被虛弱時攻擊速度乘多少。0.5 = 減半（出貨值，owner 2026-08-09）；1 = 這一半關掉；0 = 完全打不出來。"
      ),
    damageDealtMult: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "@zh 被虛弱時造成的傷害乘多少\n" +
        "@note 0.5 = 減半（出貨值）。⚠️ 是「他打出去的」不是「他受到的」—— 單挑時兩者看起來一樣，混戰裡完全不同：虛弱的人打誰都軟。普攻／技能／持續傷害／道具觸發全部走同一條隊列，所以每一發各打折一次。\n" +
        "被虛弱時**造成**的傷害乘多少。0.5 = 減半（出貨值）。⚠️ 是「他打出去的」不是「他受到的」，而且連固定值傷害一起打折（砍 AD/AP 屬性的寫法對固定值完全沒作用）。"
      ),
  })
  .strict();
export type ConfigWeaknessDoc = z.infer<typeof zConfigWeaknessDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件（同 `SHIPPED_WOUNDS` 的規矩）。 */
export const SHIPPED_WEAKNESS: ConfigWeaknessDoc = {
  id: "weakness",
  schema: "config.weakness@1",
  statusTag: "weakness",
  attackSpeedMult: 0.5,
  damageDealtMult: 0.5,
};
