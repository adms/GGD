import { z } from "zod";
import { zId } from "../common";
import {
  MAX_MAX_PARTICLES_PER_SYSTEM,
  MAX_MAX_RATE_PER_SYSTEM,
  MIN_MAX_PARTICLES_PER_SYSTEM,
  MIN_MAX_RATE_PER_SYSTEM,
} from "../vfx";

/**
 * config.vfx-budget@1 — 粒子密度上限（GH#838）。
 *
 * owner 2026-08-28（逐字）：「所有特效粒子特效密度要受到上限值管制，後台可設定，
 * 這次的特效編輯器裡設定共同遵守上限值，這個上限值也會**卡入實際遊戲前端執行的
 * 單個特效上限值**」
 *
 * ⭐ 一份文件、一個住處、三個消費端共用：
 *   · 出貨前端 —— `particleFactory.capacityFor()` / `rateFor()`（**每一個**
 *     ParticleSystem 都從那兩支拿容量與噴發率）
 *   · 特效工坊 studio —— 同一支函式，所以編輯器裡看到的密度**就是**上線的密度
 *   · 後台這一頁 —— 轉旋鈕
 *
 * ⛔ 為什麼不塞進 `config.vfx-families@1`：那一份是 `vfxfam:build` 的**產物**
 * （手改會被下一次 sync 打回來），而這一格是 owner 要轉的旋鈕。
 * ⛔ 也不塞 `config.vfx-cleanup@1`：那一份管的是「回合之間還多少回去」，
 * 這一份管的是「**單發**可以多密」—— 語意不同層。
 *
 * 缺文件 = 出貨預設（1200 顆 / 600 顆每秒）—— ⛔ 不是 0（0 = 全遊戲沒有粒子，
 * 而部署漏帶一份 JSON 不該讓畫面整個空掉；fail-open 沒錯，靜默才是缺陷 ——
 * 所以 studio 會把「現在生效的上限」印在畫面上）。
 */
export const zConfigVfxBudgetDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-budget@1"),
    note: z.string().optional(),
    /** 單個特效（一個 ParticleSystem）最多幾顆粒子 —— 瞬間密度。 */
    maxParticlesPerSystem: z
      .number()
      .int()
      .min(MIN_MAX_PARTICLES_PER_SYSTEM)
      .max(MAX_MAX_PARTICLES_PER_SYSTEM),
    /** 單個持續型特效每秒最多噴幾顆 —— 時間軸上的密度。 */
    maxRatePerSystem: z
      .number()
      .int()
      .min(MIN_MAX_RATE_PER_SYSTEM)
      .max(MAX_MAX_RATE_PER_SYSTEM),
  })
  .strict();
export type ConfigVfxBudgetDoc = z.infer<typeof zConfigVfxBudgetDoc>;
