import { z } from "zod";
import { zId } from "../common";

/**
 * config.unsafe-textures@1 — **不安全 VFX 貼圖的隔離契約**（Codex 阻塞清單 P0-6）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 為什麼這份文件存在：安全是**兩個名詞的關係**，⛔ 不是貼圖自己的屬性
 * ════════════════════════════════════════════════════════════════════════════
 * Codex 的回報把五張貼圖列成同一種「透明底板 blocker」。⛔ 第一次逐張量過之後，
 * 那五張**不是同一個病**；後續修復器已替五張全部補上透明黑邊，目前仍以
 * **實際使用的混合模式**決定是否安全：
 *
 *   additive 混合下 **RGB 黑 ＝ 不可見**。⇒ 一張 alpha 全 255 的不透明 PNG，
 *   只要它的**邊緣是黑的**，在 additive 下就**不會**變成白卡或棋盤格。
 *   同一張貼圖換成 `alpha` / `modulate` 混合，那個 255 就立刻變成一塊實心方板。
 *
 * ⇒ ⭐ 判準是 `(貼圖, blendMode)` 這個**配對**，⛔ 不是「這張貼圖好不好」。
 *   這正是 CLAUDE.md 記過的失敗形態：**只驗名詞的後置條件，在相容性故障面前
 *   必然是綠的**（2026-08-02 四項全綠而網站不能玩）。所以 `safeBlendModes`
 *   是這份 schema 的主詞，⛔ 而不是一格布林。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 每一列都要寫得出**量到的數字**，⛔ 不接受「它看起來不好」
 * ════════════════════════════════════════════════════════════════════════════
 * `measured` 那一塊是**證據**，不是註解。它由 PNG 的實際位元組解出來：
 *   · `hasAlphaShape` —— alpha 通道**帶不帶形狀**（`alphaRange > 8`）。
 *      ⚠️ 修復前曾有 alpha **平在 253** 的案例；修復後必須由守衛重新解 PNG，
 *      不可讓舊量測繼續描述新位元組。
 *   · `borderEffAdditive` —— **1px 外框**的「有效加光量」＝ `亮度 × alpha/255`。
 *      ⭐ 這一個數字就是「它會不會變成一塊發光的方板」的答案：
 *      ≈0 ⇒ 邊緣在 additive 下消失（安全）；顯著 >0 ⇒ 一塊方板（隔離）。
 *   · `edgeEffAdditive` —— 上下左右**各一個**數字。⚠️ 四邊分開記是必要的：
 *      修復前 `ribbonblur1` 的平均 59.1 幾乎完全來自**左邊那一條 208.3**（其餘三邊 ≤17.6）
 *      —— 一個平均值會把「一條亮邊」讀成「整體偏亮」，而那是兩種不同的缺陷。
 *
 * ⛔ **這份文件本身不修貼圖**；修復由資產工具執行。它交付的是**契約與量測**：
 * 哪幾張不能用、在什麼條件下不能用、以及**憑什麼這樣說**。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 為什麼 `usage` 的三個數字可以住在這裡（第〇·四守則的例外要帶理由）
 * ════════════════════════════════════════════════════════════════════════════
 * 它們**確實**是從 `content/` 算得出來的，也就是說它們是「第二個住處」。
 * ⇒ 所以守衛 `unsafeTextureQuarantine.test.ts` **每一次都重新算一遍再逐格比對**。
 * ⭐ 它們不是被信任的數字，是**被釘住的宣稱** —— 內容漂了就**紅**，
 * ⛔ 而不是靜靜地變成一份過期的普查。（⚠️ 這正是本 repo 記過的
 * 「一個被 glob 灌大的統計，讀起來跟真的一模一樣」的反面做法。）
 *
 * ⭐ `sha256` 同理：它把「這些量測描述的是**哪一份位元組**」釘死。
 * 美術哪天真的修了那張 PNG，hash 一變守衛就紅 —— ⛔ 而不是讓一份
 * 描述舊檔案的量測繼續服務新的檔案（第三守則：註解會說謊，去驗證）。
 */

/** 引擎認得的混合模式 —— 逐字等於 `content/vfx/*.json` 的 `blendMode` 值域。 */
export const VFX_BLEND_MODES = ["additive", "alpha", "modulate", "alphaKey"] as const;

export const zUnsafeTextureEntry = z
  .object({
    file: z
      .string()
      .min(1)
      .describe("repo 相對路徑。⭐ 守衛會確認它**真的存在於磁碟上** —— 一個指向不存在檔案的隔離是空的。"),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .describe("量測當下那份位元組的 hash。檔案被改過 ⇒ 守衛紅 ⇒ 重新量，⛔ 不是沿用舊結論。"),
    status: z
      .enum(["quarantined", "safe"])
      .describe(
        "⭐ `quarantined` ＝ **default resolver 不得選用、作者資源池不得列為 SAFE**（Codex P0-6 的兩條禁令）。" +
          "`safe` ＝ 可以用，⛔ 但**只在 `safeBlendModes` 列出的混合模式下**。",
      ),
    safeBlendModes: z
      .array(z.enum(VFX_BLEND_MODES))
      .describe(
        "⭐ 這張貼圖在**哪些混合模式**下量到是安全的。`quarantined` 的必須是**空陣列**" +
          "（沒有任何模式救得了它）。⚠️ 這一格是這份契約的主詞：`zap1` 在 additive 下" +
          "邊緣有效加光 4.3（看不見），換成 alpha 就是一塊 128×64 的實心方板。",
      ),
    measured: z
      .object({
        size: z.string().regex(/^\d+x\d+$/).describe("像素尺寸。"),
        hasAlphaShape: z
          .boolean()
          .describe(
            "alpha 通道帶不帶形狀 ＝ `alphaRange > 8`。⭐ `false` ＝ alpha 是一個常數" +
              "⇒ **形狀完全住在 RGB 裡** ⇒ 只有 additive 讀得出來。",
          ),
        opaquePct: z
          .number()
          .min(0)
          .max(100)
          .describe(
            "alpha === 255 的像素百分比。⚠️⚠️ **這一格自己會說謊，⛔ 不要單獨讀它**：" +
              "修復前曾有 alpha 常數 **253**，這一格因此算出 **0%** —— " +
              "讀起來像「整張全透明」，實際卻幾乎完全不透明。" +
              "⇒ 判斷有沒有形狀要看 `alphaRange` / `distinctAlphaValues`，⛔ 不是這一格。",
          ),
        minAlpha: z.number().int().min(0).max(255).describe("整張最小的 alpha。"),
        maxAlpha: z.number().int().min(0).max(255).describe("整張最大的 alpha。"),
        alphaRange: z
          .number()
          .int()
          .min(0)
          .max(255)
          .describe(
            "⭐ `maxAlpha - minAlpha` —— **alpha 通道到底帶不帶形狀**的答案。" +
              "0 ＝ 整張同一個值 ⇒ 形狀完全住在 RGB 裡 ⇒ 只有 additive 讀得出來。",
          ),
        distinctAlphaValues: z
          .number()
          .int()
          .min(1)
          .describe("alpha 通道用到幾個相異值。1 ＝ 平的。⭐ 與 `alphaRange` 互為佐證（兩把尺，⛔ 不是一把）。"),
        borderEffAdditive: z
          .number()
          .min(0)
          .max(255)
          .describe("⭐ 1px 外框的 `亮度 × alpha/255` 平均 —— 「它會不會變成一塊發光方板」的答案。"),
        edgeEffAdditive: z
          .object({
            top: z.number().min(0).max(255),
            bottom: z.number().min(0).max(255),
            left: z.number().min(0).max(255),
            right: z.number().min(0).max(255),
          })
          .strict()
          .describe("⭐ 四邊**分開**記 —— 平均值會把「一條亮邊」讀成「整體偏亮」，而那是兩種缺陷。"),
      })
      .strict(),
    usage: z
      .object({
        vfxDocs: z.number().int().min(0).describe("引用這張貼圖的 `content/vfx/*.json` 份數。"),
        reachableVfxDocs: z
          .number()
          .int()
          .min(0)
          .describe(
            "⭐ 其中**被 content/ 任何一份文件引用得到**的份數。⚠️ 差額是**孤兒** —— " +
              "它們在磁碟上，⛔ 但玩家到不了。⭐ 這才是 blocker 的合理分母。",
          ),
        abilities: z.number().int().min(0).describe("經由技能直接引用或 `ability-vfx-bindings` 到得了的技能數。"),
        champions: z.number().int().min(0).describe("經由英雄文件或 `ambient-vfx`（modelKey）到得了的英雄數。"),
      })
      .strict()
      .describe("⭐ 守衛**每次重算**再逐格比對 —— 這是被釘住的宣稱，⛔ 不是被信任的數字。"),
    why: z
      .string()
      .min(12)
      .describe(
        "⭐ 為什麼是這個 status —— 一個**引用得到量測數字**的理由，⛔ 不是「它看起來不好」。" +
          "三個月後那個人要靠這句話判斷「這一列可以解除了嗎」。",
      ),
  })
  .strict()
  .superRefine((e, ctx) => {
    // ⛔ 一張被隔離的貼圖如果還留著「安全的混合模式」,那個隔離是假的 ——
    //    default resolver 只要挑那個模式就繞過去了。
    if (e.status === "quarantined" && e.safeBlendModes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `「${e.file}」被隔離卻列了 safeBlendModes —— 那等於留一條繞過去的路。隔離的必須是空陣列。`,
      });
    }
    // ⛔ 一張「安全」但一個模式都沒列的貼圖,對消費端等於沒有答案。
    if (e.status === "safe" && e.safeBlendModes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `「${e.file}」標成 safe 卻沒有任何 safeBlendModes —— 消費端讀不出「可以怎麼用」。`,
      });
    }
  });

export const zConfigUnsafeTexturesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.unsafe-textures@1"),
    note: z.string().max(4000).optional(),
    /**
     * ⭐ 棘輪基準線：被隔離的張數**只能變少**。
     * ⛔ 它刻意**不是**「≤ 某個常數」的散文，而是一個守衛讀得到的數字 ——
     * 修好一張就把它調小一格，⛔ 而想多隔離一張就會撞到它並且必須解釋。
     */
    quarantineRatchet: z
      .number()
      .int()
      .min(0)
      .describe("⭐ 允許的最大隔離張數。守衛斷言 `實際隔離數 ≤ 這個值` —— 只准往下調。"),
    textures: z.array(zUnsafeTextureEntry).min(1),
  })
  .strict();

export type ConfigUnsafeTexturesDoc = z.infer<typeof zConfigUnsafeTexturesDoc>;
