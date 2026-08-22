import { z } from "zod";
import { zId } from "../common";
import { zColorHex } from "./_shared";

/**
 * 地面預告的一條**通道**（自己／隊友／來襲）—— 四格全部是「怎麼分辨這一圈是誰的」。
 *
 * ⚠️ 為什麼是四格而不是一個顏色：#85 的觀戰去飽和會把**色相**壓平，色盲玩家也
 * 讀不到色相，所以「自己 vs 來襲」不可以只靠顏色。三個非色相載體各自獨立可調：
 * 填滿色（實心 vs 只有外框的觀感）、不透明度（誰最吵）、虛線、脈動。
 */
const zTelegraphChannelStyle = z
  .object({
    /** 外圈／走廊邊緣的顏色 */
    ring: zColorHex,
    /** 魔法陣填滿的顏色（outline 級距不畫填滿，這一格就看不到） */
    fill: zColorHex,
    /** 起手完成那一刻的最大不透明度 */
    alpha: z.number().min(0).max(1),
    /** 虛線邊 = 一個**不靠色相**的分辨器；false = 實線 */
    dashed: z.boolean(),
    /** 起手末段的急迫脈動（Hz）。0 = 這條通道永遠不動 */
    pulseHz: z.number().min(0).max(20),
  })
  .strict();

/**
 * config.range-guide@1 — 技能範圍指引 + 地面預告通道 (GH#376).
 *
 * ── 為什麼有這一份 ─────────────────────────────────────────────────────────
 * GH#367 落地時，六個決策點（hover 延遲 · 兩組顏色 · 兩組填滿透明度 · 邊框透明度
 * · 邊框粗細）被收斂成 `apps/client/src/ui/abilityRangeGuide.ts` 裡的**一個具名
 * 物件**。那比散在三個檔的魔術數字好，但它**還不是第一守則要的東西**：改一個
 * 數字仍然等於改程式、rebuild、重啟容器。這份文件把那六個旋鈕變成後台欄位。
 *
 * ── 為什麼**預告通道**也在這一份裡（而不是自己一份） ──────────────────────
 * 它們是同一個問題的兩半。#367 把 hold 預覽從虛線外框改成「實心邊框 + 半透明
 * 填滿」（owner 明說的規格），代價是 #228 預告層原本用「虛線＝#152 的語彙」來
 * 分辨自己 vs 來襲 —— 那個語彙的另一半沒有了。⭐ 兩邊的顏色也是**互相定義**的：
 * `telegraph.self` 出貨值就是 `aoeColor`（自己的預告要和剛剛瞄準的那一圈連續），
 * 而 `telegraph.incoming` 的紅刻意離兩組預覽色都很遠。分在兩份文件裡，調了一邊
 * 忘了另一邊的那一天不會有任何東西紅。
 *
 * ⚠️ **顏色是 `#rrggbb` 不是三個 0..1 的浮點數**：後台要畫得出取色器，而 8-bit
 * 量化正是 GPU 最後那一步本來就會做的事（framebuffer 是 8-bit），所以換成 hex
 * 之後畫面上一個像素都不會變。
 */
export const zConfigRangeGuideDoc = z
  .object({
    id: zId,
    schema: z.literal("config.range-guide@1"),
    note: z.string().optional(),
    /**
     * 滑鼠停在技能圖示上幾毫秒後浮出地板範圍圈。
     *
     * ⚠️ 不是 0：技能列是六格緊鄰的按鈕，游標從畫面一端掃到另一端會**依序**經過
     * 全部六格，零延遲 = 地板上閃六個圈。上界 2000 是誤植守衛（#277 的形狀）：
     * 打成 14000 等於「hover 從此不會出圈」，而畫面上看起來就是功能壞了。
     */
    hoverDelayMs: z.number().int().min(0).max(2000),
    // ⛔ `hoverOpensBanner` / `pressOpensBanner` **2026-08-22 退休**。
    //
    // owner 逐字：「戰鬥回合按下QWER出現技能說明**遮住戰鬥畫面**」
    //             「**根本不需要顯示那麼大的技能說明區塊，請你移除這個功能到
    //               legacy 不要再出現了**」
    //
    // ⭐ 兩格都只做一件事:開不開 `AbilityDescriptionOverlay`。那個面板已經移到
    //    `docs/legacy/_retired-ui/` ⇒ 留著這兩格就是「後台存得起來、遊戲裡什麼
    //    都不會發生」（第一·五守則）。
    // ⚠️ 技能說明**沒有消失** —— 技能格自己的 tooltip / 選人畫面 / 後台都還在。
    /** 施法距離圈的顏色 —— 「我打得到多遠」。 */
    rangeColor: zColorHex,
    /** 距離圈的半透明填滿。⚠️ 刻意很淡，理由在後台那一頁。 */
    rangeFillAlpha: z.number().min(0).max(1),
    /** 命中範圍圈的顏色 —— 「它落在哪」。 */
    aoeColor: zColorHex,
    /** AoE 圈小得多，所以可以濃一點 —— 這是玩家真正要瞄的那一圈。 */
    aoeFillAlpha: z.number().min(0).max(1),
    /** 「特殊顏色框框」的不透明度。框要比填滿實得多，否則邊界讀不出來。 */
    rimAlpha: z.number().min(0).max(1),
    /**
     * 框的粗細（世界單位，torus 的管徑）。⚠️ 是**絕對**值不是半徑比例。
     * 上界 2 ≈ 三個角色身寬：再粗的話小技能的框會把自己的圈整個填滿。
     */
    rimThickness: z.number().min(0.01).max(2),
    /** #228 地面預告的三條通道。 */
    telegraph: z
      .object({
        /** 我自己放的 */
        self: zTelegraphChannelStyle,
        /** 隊友放的 —— 「有東西會落在那裡，但不是衝著你來」 */
        ally: zTelegraphChannelStyle,
        /**
         * 打向我的（`relationOf` 回 `unknown` 時也走這一條 —— 失敗要往危險的
         * 那一邊倒，把還沒解析的施法者畫成無害的會藏起一發真的 AoE）。
         */
        incoming: zTelegraphChannelStyle,
      })
      .strict(),
  })
  .strict();
/** 一條地面預告通道的樣式（自己／隊友／來襲共用同一個形狀）。 */
export type TelegraphChannelStyle = z.infer<typeof zTelegraphChannelStyle>;
export type ConfigRangeGuideDoc = z.infer<typeof zConfigRangeGuideDoc>;
