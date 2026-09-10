import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zGrantAttribute =
/**
 * grantAttribute (07-00 獸化心靈) — mirrors the `grantAttribute` member of
 * `EffectDef`.
 *
 * BOTH counters are bounded ON TOP as well as below (CLAUDE.md
 * 「欄位要有上界」). `everyNth` at 1000 is not a slow passive, it is a passive
 * that never fires in a 3-minute round — indistinguishable in play from the
 * feature being broken, which is precisely the class of typo #277 is about.
 * `maxAttribute` is capped where `CONDITION_ABSOLUTE_MAX` caps an attribute
 * comparison, so 「敏捷 < 120」 written as a condition and 「敏捷上限 120」
 * written here cannot disagree about what an attribute may be.
 */
z
  .object({
    kind: z.literal("grantAttribute"),
    ...EFFECT_COMMON_SHAPE,
    attr: z.enum(["str", "agi", "int"]),
    /**
     * "flat" (預設) = 加 `amount` 點; "pctOfCurrent" = 加「現有屬性 × amount」,
     * 所以 1.0 就是 owner 說的「×2」。這是一個決策點, 不是實作細節 ——
     * 定值在 1 級大得離譜、在 9 級形同沒有。
     */
    mode: z.enum(["flat", "pctOfCurrent"]).optional(),
    /**
     * 每次**發放**的量 (不是每次觸發)。上界 100 對 flat 是「一次加 100 點三圍
     * 一定是打錯」; 對 pctOfCurrent 它是 100 倍, 同樣是 MIS-PARSE 護欄而不是
     * 平衡政策 —— 想要 ×2 就寫 1。
     */
    amount: z.number().positive().max(100),
    /**
     * 缺省 = **永久**(獸化心靈)。有值 = 到期自動收回(龍紋記憶 3 秒)。
     *
     * ⚠️ 下界 0.067 秒不是隨便挑的: `world.tick + Math.round(duration/dt)`
     * 在 dt=1/30 之下, 0.034 秒以下會變成 0 或 1 tick —— **兩個都是空包彈**。
     * 讓它變成存檔錯誤, 而不是一個上線後沒人看得出來為什麼沒作用的欄位。
     */
    durationSec: z.number().min(0.067).max(300).optional(),
    /** 每 N 次觸發才發一次。缺省/1 = 每次。獸化心靈 = 8 */
    everyNth: z.number().int().min(1).max(1000).optional(),
    /** 該屬性 (含成長與本場加成) 到這個值就不再發。獸化心靈 = 120 */
    maxAttribute: z.number().min(0).max(10000).optional(),
    /**
     * `maxAttribute` 量的是**哪一種**三圍 —— 決策點做成欄位 (第一守則),
     * 而且這個軸是**原始地圖自己就有的**, 不是這裡發明的:
     * `GetHeroStatBJ(stat, unit, includeBonuses)` 的第三個參數。
     * 傷害公式一律 `…,true)`(含裝備), 而獸化心靈的隱藏上限寫的是
     * `GetHeroStatBJ(1,GetKillingUnit(),false)`(**不**含裝備)。
     *
     *   · `"base"`(缺省)= 天生 + 成長 + 三選一 + 先前的 grantAttribute。
     *     這是獸化心靈 JASS 量的東西, 也是**保守**的那一個: 帶一把
     *     朗基努斯之槍(敏捷+12)不會偷偷把蒼月潮的天生技提早關掉, 而且與
     *     「道具還不能給三圍」的年代逐位元相同。
     *   · `"total"` = 含裝備, 給未來那種上限本來就該讀「總敏捷」的卡。
     */
    maxAttributeBasis: z.enum(["base", "total"]).optional(),
    /**
     * 點數存到哪裡 —— 決策點做成欄位, 而差別就是「賣掉之後還在不在」。
     *
     *   · `"champion"`(缺省, 與這個欄位出現之前的每一份文件逐位元相同)=
     *     `ChampionComp.attrBonus`, WC3 `ModifyHeroStat`。永久, 而且與造成它
     *     的東西無關 —— 蒼月潮 07-00 獸化心靈是自己打出來的, 那就是他的。
     *   · `"source"` = 記在**觸發這一次的那個來源**身上
     *     (`ModifierSource.attrEarned`)。甘豆腐之袍 godie-i03f「每殺死一名英雄
     *     可以額外獲得 10點智慧，上限 160」—— 道具疊出來的層數屬於道具, 賣掉
     *     袍子 160 點智慧就跟著走。
     *
     * ⚠️ `"source"` 只能掛在 **hook** 上(道具被動 / 靈氣投射的 hook / 增益),
     * 因為記帳的地方就是那個 source。掛在技能自己的 effects 上沒有來源可記,
     * 這時候**拒絕發放**(而不是偷偷改記進 `attrBonus` —— 那會是一個名字寫著
     * 「賣掉就沒」、行為卻是「永久帶著走」的欄位)。
     */
    store: z.enum(["champion", "source"]).optional(),
    /**
     * `store: "source"` 專用 —— **這一個來源自己一共發過多少**的上限, 逐屬性。
     * 甘豆腐之袍的「上限 160」= 16 層 × 10 點。
     *
     * ⚠️ 它**不是** `maxAttribute`。`maxAttribute` 封的是英雄那條三圍的
     * **絕對值**(獸化心靈的「敏捷 < 120」, 含等級成長), 所以掛在一件智慧裝上
     * 會在高等級法師身上直接把第一層就擋掉 —— 一張什麼都不做的卡。這一條只數
     * 這件裝備自己發出去的量。
     *
     * 上界 10000 與 `maxAttribute` 同一個數字, 理由也同一個: 它是 MIS-PARSE
     * 護欄(160 打成 16000), 不是平衡政策。下界 0 之外還有 `.positive()` 的
     * 意義: 0 是一件「疊層」卡片寫著、但第一層就被夾成 0 的裝備 —— 正是這一批
     * 要消滅的「描述承諾了、資料沒有付」。
     */
    maxSourceTotal: z.number().positive().max(10000).optional(),
  })
  .strict();

/**
 * ⭐ 分片前這一段住在 `refineEffectDef` 的結尾（`if (e.kind !== "grantAttribute") return;`
 * 之後那一整段，逐字搬過來）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "grantAttribute" }>,
  ctx: z.RefinementCtx,
): void => {
  if (e.store !== "source") {
    if (e.maxSourceTotal !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxSourceTotal"],
        message:
          'maxSourceTotal 只有 store:"source" 讀得到 —— 沒有 store 的話這個上限' +
          "永遠不會被檢查, 是一個看起來有設、其實無限疊的欄位",
      });
    }
    return;
  }
  // 「到期收回」與「記在來源上」是兩套互相看不見的帳: `attrGrantExpirySystem`
  // 只反轉 `ChampionComp.attrBonus`, 所以一筆 timed 的 source 存款永遠不會被收回。
  // 要限時, 把這個 hook 掛在一個帶 `expiresAtTick` 的 buff source 上。
  if (e.durationSec !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationSec"],
      message:
        'store:"source" 不能配 durationSec —— 到期收回只認得 attrBonus, ' +
        "記在來源上的存款不會被收回(要限時就把 hook 掛在有期限的 buff 上)",
    });
  }
};
