/**
 * status-effect@1 — minimal metadata for statuses referenced by
 * `applyStatus.statusId`. The mechanical parameters (slow %, root, stun) live
 * inline on the effect; these docs give statuses a display identity (name,
 * icon, tags) and an existence check (soft ref — warn only).
 *
 * `tags` 是一個**開放**的分類集合（自由字串，不是固定選單）。出貨的詞彙與逐份
 * 對照表在 `docs/技能標記機制與效果規則.md` §7.2，而那一張表是**從這些文件的
 * `tags` 欄位逐檔數出來的**（`pnpm spec:build`），⛔ 不是手抄的 ——
 * 加一份新狀態，那張表自己會長出來。
 *
 * ⚠️ 舊的 `docs/_status-effect-tag-vocabulary.md` 已退役（2026-08-16）：它的檔頭
 * 宣稱「資料來源：content/status-effects/*.json（27 份、78 個標籤）」，而那是一次
 * 手抄 —— 實際已經是 29 份、82 個，沒有任何東西叫。
 */
import { z } from "zod";
import type { StatusId } from "../../ids";
import { zIdFor } from "./common";
import { STATUS_TAG_MAX_LEN, STATUS_TAG_MIN_LEN } from "../../sim/content/condition";

/**
 * 一份狀態最多帶幾個 tag。
 *
 * owner 2026-08-08：「[狀態 tag]**應該要做成開放架構，tag 盡可能多不要共用**」。
 * 所以這個集合刻意是**自由字串**（`z.enum` 會讓外部編輯器每加一個分類就要改一次
 * 程式並重新部署映像 —— 那與「開放架構」直接衝突，而且 `content/` 是 live
 * bind-mount、映像不是，那正是 2026-08-02 那次「內容載入整份失敗」的形狀）。
 *
 * ⚠️ 開放不等於無界（第一守則：欄位要有上界，不是只有下界）。這條上界擋的是
 * 兩件真的會發生的事，兩件都**不會**在畫面上看起來壞掉：
 *   ① 有人把一整段描述 `split` 進來（40 份「tag」，每一個都是一個詞）；
 *   ② 機器產生的匯入器把某個欄位整包倒進 tags。
 * 兩者都會讓編輯器的「類別條件」下拉選單變成一面牆，也讓 `hasStatusTag` 的線性
 * 掃描對每一顆條件葉、每一次揮擊都多走幾十格。
 *
 * 32 是「出貨最多的那一份（11 個）的三倍」——**誤植攔截，不是設計政策**。真的有
 * 一份狀態需要第 33 個分類時，把這個數字調大是一行；它擋的從來不是分類本身。
 */
export const STATUS_TAGS_MAX = 32;

/**
 * 一個 tag 字串本身的形狀。
 *
 * 長度上下界跟**條件葉那一格共用同一對常數**（`sim/content/condition.ts` 的
 * `STATUS_TAG_MIN_LEN` / `STATUS_TAG_MAX_LEN`），而且必須共用：條件葉 `{tag:"…"}`
 * 是**逐字**比對這裡寫下的字串，兩邊上界不同的那一天，會出現一種「文件存得進去、
 * 但沒有任何條件寫得出來比中它」的 tag —— 一個從畫面上看起來完全正常的死法。
 *
 * ⛔ 前後空白直接拒絕。`" stun"` 在表單上跟 `"stun"` 長得一模一樣，存得進去，
 * 然後**永遠比不中任何條件**（七種失敗形態 ②：算出來了但這一半從沒送到）。
 * 中間的空白是允許的 —— 有人想寫 `"crowd control"` 那是他的自由，開放架構。
 */
const zStatusTag = z
  .string()
  .min(STATUS_TAG_MIN_LEN)
  .max(STATUS_TAG_MAX_LEN)
  .regex(/^\S(?:.*\S)?$/, "tag 前後不可有空白（會讓它永遠比不中任何條件）");

export const zStatusEffectDoc = z
  .object({
    id: zIdFor<StatusId>(),
    schema: z.literal("status-effect@1"),
    name: z.string().min(1),
    description: z.string().optional(),
    iconKey: z.string().optional(),
    /** presentation hint for the HUD (debuff = red border, etc.) */
    polarity: z.enum(["buff", "debuff"]).optional(),
    /**
     * 開放的分類集合 —— **專屬 tag（等同它自己的身分）＋ 所有適用的類別 tag**。
     *
     * owner 2026-08-08 否決了「同類共用一個 tag」的做法（破防兩支共用 `shred`、
     * 失手類共用 `miss`）：共用把「**這是什麼**」與「**它屬於哪一類**」壓進同一格，
     * 於是想精確查【破魔】的人只查得到「所有破防」。兩個都要給。
     *
     * ⛔ 同一份文件裡不可以有重複的 tag。重複只可能是複製貼上的手滑，而它對
     * `hasStatusTag` 完全沒有作用 —— 一個看起來寫了東西、卻什麼都沒改變的編輯。
     */
    tags: z
      .array(zStatusTag)
      .max(STATUS_TAGS_MAX)
      .refine((t) => new Set(t).size === t.length, "同一份狀態不可以有重複的 tag")
      .optional(),
  })
  .strict();

export type StatusEffectDoc = z.infer<typeof zStatusEffectDoc>;
