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
      .max(MAX_MAX_PARTICLES_PER_SYSTEM).describe(
      "@zh 單個特效最多幾顆粒子\n" +
      "@note 一個粒子系統的容量天花板（瞬間密度）。調小＝畫面乾淨、GPU 負擔低，代價是爆炸類特效會被削薄；調大＝更濃，但一發大招就可能把整場的預算吃掉。⚠️ 這一格夾的是**容量**，所以它同時決定了記憶體：一顆粒子的 buffer 是固定的，1200 顆 × 場上十幾個系統就是實際的 VRAM 成本。",
    ),
    /** 單個持續型特效每秒最多噴幾顆 —— 時間軸上的密度。 */
    maxRatePerSystem: z
      .number()
      .int()
      .min(MIN_MAX_RATE_PER_SYSTEM)
      .max(MAX_MAX_RATE_PER_SYSTEM).describe(
      "@zh 單個持續特效每秒最多噴幾顆\n" +
      "@note 持續型（stream）特效每秒的噴發上限（時間軸密度）。⭐ 它與上面那一格是**兩個軸**：顆數管「同時最多幾顆在畫面上」，噴發率管「補得多快」。只夾顆數的話，一個高噴發率的系統會一直撞天花板然後抖動；兩格一起夾才穩。",
    ),
    /**
     * ⭐⭐ GH#900 —— **同一 frame 最多幾發 `additive` 特效**照全亮播。
     *
     * owner 2026-09-01（逐字）：
     * > 「太多亮光束特效 太誇張了 **變成全白戰鬥** 克制一下特效使用量好嗎」
     *
     * ⭐ 量到的根因：出貨 **662 份 vfx 裡 581 份（88%）是 `additive`**。
     * additive 在算術上是 `out = dst + src` ⇒ ⭐ **它只會變亮，而且會疊** ——
     * 團戰中每個像素被加 N 次 ⇒ 飽和成純白，⛔ 角色／血條／地形全部被蓋掉。
     *
     * ⚠️ 上面那兩格管的是**單個特效有多密**，⛔ 管不到「同時有幾發」——
     * ⭐ 而全白是**後者**造成的。這是它們刻意分開的理由。
     *
     * ⛔ **0 = 不限**（逐位元回到 2026-09-01 之前的行為）。
     */
    maxConcurrentAdditive: z.number().int().min(0).max(64).optional().describe(
      "@zh 同時最多幾發「會發亮」的特效照全亮播\n" +
      "@note ⭐ **這是 GH#900 的 rollback 開關之一**。owner 2026-09-01 逐字：「太多亮光束特效 太誇張了 **變成全白戰鬥** 克制一下特效使用量好嗎」。⭐ 量到的根因：出貨 **662 份特效裡 581 份（88%）是 additive**，而 additive 在算術上只會**加**（`out = dst + src`）⇒ 團戰中每個像素被加 N 次 ⇒ 飽和成純白。⚠️ 上面那兩格管的是**單個特效有多密**，⛔ 管不到「同時有幾發」—— ⭐ 而全白是**後者**造成的。⛔ **0 = 不限**（逐位元回到 2026-09-01 之前）。",
    ),
    /**
     * ⭐ 超過上限之後那幾發的**亮度倍率**（0–1）。
     *
     * ⚠️ 票文逐字要求兩格都要有，理由是它們的效果**不同**：
     * > 「『調暗』與『限量』是兩種解法⋯調暗會讓單一特效看起來弱，
     * >   限量會讓第 N 個特效不出現。⇒ **兩者都做成欄位**，⛔ 不要在程式裡選一個」
     *
     * ⭐ **0** ＝ 純限量（第 N+1 發**不出現**）· **1** ＝ 不減光（＝關掉這個機制）。
     * 出貨 **0.35** ＝ 超出的那幾發仍然看得見，⛔ 但不再把畫面推白。
     */
    additiveOverflowBrightness: z.number().min(0).max(1).optional().describe(
      "@zh 超出上限的那幾發，亮度打幾折（0–1）\n" +
      "@note ⭐ **這是 GH#900 的另一半**。票文逐字要求兩格都要有，理由是效果**不同**：「調暗會讓單一特效看起來弱，限量會讓第 N 個特效**不出現**」。⭐ **0** ＝ 純限量（第 N+1 發不出現）· **1** ＝ 不減光（＝關掉這個機制）。出貨 **{{出貨值}}** ＝ 超出的那幾發仍然看得見，⛔ 但不再把畫面推白。",
    ),
  })
  .strict();
export type ConfigVfxBudgetDoc = z.infer<typeof zConfigVfxBudgetDoc>;
