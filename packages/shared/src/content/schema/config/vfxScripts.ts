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
  })
  .strict();
export type ConfigVfxScriptsDoc = z.infer<typeof zConfigVfxScriptsDoc>;

/** Zod 側的預設住處 —— 客戶端「缺文件」的退化讀這裡，⛔ 不是散落的字面 true。 */
export const DEFAULT_VFX_SCRIPTS = { enabled: true } as const;
