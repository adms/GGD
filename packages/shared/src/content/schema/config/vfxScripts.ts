import { z } from "zod";
import { zId } from "../common";

/**
 * config.vfx-scripts@1 — GH#838 特效工坊（演出腳本）的總開關。
 *
 * owner 常設指令「自己判斷但留後台開關可以簡易 rollback」的那一格：
 * `enabled:false` ⇒ `VfxScriptPlayer` 對每一個事件直接 return —— 有 script 的
 * 技能退回它沒有 script 時的樣子，**逐位元同今天**。⭐ 預設 on（第〇·六守則：
 * 優先權大的更新預設啟動 —— 這是 owner 2026-08-28 點名的新目標）。
 *
 * 為什麼自己一份文件而不塞 `config.feel-fx@1`：feel-fx 是打擊回饋的參數頁
 * （倍率／時長那一族），這一格是**一個子系統的存在開關** —— 語意不同層；
 * 而且 feel-fx 升版會讓線上存過的 overlay 全部要遷移（同 `config.block@1`
 * 檔頭記的理由）。
 *
 * 缺文件 = 出貨預設（on）—— ⛔ 不是關。一個 undefined 被讀成 off 的話，
 * 部署漏帶這份 JSON 就等於整座工坊靜默消失（fail-open 沒錯，靜默才是缺陷）。
 */
export const zConfigVfxScriptsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-scripts@1"),
    note: z.string().optional(),
    /** false ⇒ 播放器整個休眠，有 script 的技能退回預設演出（rollback 那一格）。 */
    enabled: z.boolean(),
    /**
     * ⭐ GH#1000：有 vfx-script 且宣告 `yields:["caster.castFx"]` 的技能，施法瞬間 GGD 預設畫在身體周圍的
     * 裝飾（光柱／家族美術／EX 爆發／電弧／焦痕／槍口）讓路給腳本。false ⇒ 每一份 `yields` 視為 `[]`
     * （逐位元回到 Codex `35b231ef3` 的行為）。缺席 ⇒ 開。
     */
    yieldDefaultCastFx: z.boolean().optional().describe("@zh 有腳本的技能：施法瞬間的預設裝飾讓路\n@note ⭐ GH#1000：vfx-script 宣告 yields:[\"caster.castFx\"] 的技能（04-03 龍破斬、08-04 阿邦快速劍X 兩對），施法那一幀 GGD 預設畫在身體周圍的裝飾（光柱／家族美術／EX 爆發／電弧／焦痕／槍口）讓路給腳本 —— 腳本自己畫的魔法陣才是主角。⚠️ 關掉 ＝ 每一份 yields 當成空的（逐位元回到 Codex 35b231ef3 的行為）。逐支回頭不用等這格：把那份 script 的 yields 改回 [] 即可。"),
  })
  .strict();
export type ConfigVfxScriptsDoc = z.infer<typeof zConfigVfxScriptsDoc>;

/** Zod 側的預設住處 —— 客戶端「缺文件」的退化讀這裡，⛔ 不是散落的字面 true。 */
export const DEFAULT_VFX_SCRIPTS = { enabled: true, yieldDefaultCastFx: true } as const;
