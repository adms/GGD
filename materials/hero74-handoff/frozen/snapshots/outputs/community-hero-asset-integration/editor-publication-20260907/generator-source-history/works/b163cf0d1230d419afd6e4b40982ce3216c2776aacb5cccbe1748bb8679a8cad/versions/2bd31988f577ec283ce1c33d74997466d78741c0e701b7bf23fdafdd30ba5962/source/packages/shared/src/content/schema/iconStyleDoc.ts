/**
 * `config.icon-style@1` —— **地端產圖**的風格與火候。
 *
 * ── 為什麼這份東西要是資料 ────────────────────────────────────────────────
 * 圖示是用 `tools/icon-gen/local/` 的**兩階段**地端 Stable Diffusion 產的：
 *   PASS 1（特徵）text2img 先把「這張圖畫的是什麼」畫清楚；
 *   PASS 2（風格）img2img 再把**風格**塗上去。
 * 兩階段是為了修一個真的踩過的缺陷：單階段餵一段很重的風格提示詞，主體會被
 * 塗成一團看不出是什麼的東西（`keywords.py` 檔頭記著這件事）。
 *
 * 而 PASS 2 的那一段風格字串，在這份文件出現之前是**寫死在 Python 常數裡的**
 * （`keywords.ANIME_STYLE` / `ANIME_NEGATIVE`），沒有任何後台入口 —— 改一個字
 * 就要改程式。owner 2026-08-17 的要求是「**日本 2D RPG**、精緻，但**不要過度
 * 花俏複雜的顏色**」，而「精緻到哪裡」「花俏到哪裡算過頭」是**看過圖才知道**的
 * 體感取捨，不是事實。第一守則：這種東西一律做成可調。
 *
 * ── ⚠️ 這一頁的生效時機跟其他 config 都不一樣 ──────────────────────────────
 * 其他 config 是**遊戲執行時**讀的，改了下一場就不同。這一份不是：它是
 * **產圖那台機器（authoring 動作）**讀的。改完之後**已經產出的 .webp 一張都不會
 * 變**，要重跑產圖（`--force`）才看得到差別。⛔ 這是操作者最容易誤會的一件事，
 * 所以後台頁的 `effect` 必須把它講死。
 *
 * ── 上下界的理由（兩端都有界，#277）─────────────────────────────────────
 * 每一格都是**餵給取樣器的參數**，不是平衡數值 —— 打錯一個 0 的後果不是「圖比較
 * 醜」，是那一批 61 張全部重畫（每張數秒到十幾秒，全量以分鐘計）。所以上界的角色
 * 是**誤讀保險絲**：`pass2Steps: 300` 讀作「這是打錯」而不是「操作者想要很慢」。
 */
import { z } from "zod";

/** 取樣步數的兩端。8 以下 SD1.5 出來的是噪點；80 以上早就收斂，只是在燒時間。 */
export const ICON_STEPS_MIN = 8;
export const ICON_STEPS_MAX = 80;
/** CFG 的兩端。1 = 幾乎不看提示詞；20 以上會過曝並把顏色燒成色塊。 */
export const ICON_GUIDANCE_MIN = 1;
export const ICON_GUIDANCE_MAX = 20;

export const zConfigIconStyleDoc = z
  .object({
    id: z.literal("icon-style"),
    schema: z.literal("config.icon-style@1"),
    note: z.string().optional(),

    stylePrompt: z
      .string()
      .min(1)
      .max(600)
      .describe(
        "PASS 2(風格)的**正向**提示詞 —— 這一整段就是「圖長什麼風格」。" +
          "出貨值落實 owner 2026-08-17 的原話:日本 2D RPG、精緻、" +
          "⛔ 顏色不要過度花俏(限制色數 · 柔和自然色 · 清楚的輪廓線)。" +
          "⚠️ ⛔ 不要在這裡描述**畫的是什麼**(角色/物件) —— 那是 PASS 1 的工作," +
          "寫進來會把每一張圖都拉向同一個主體,也就是兩階段當初要修的那個缺陷。",
      ),
    negativePrompt: z
      .string()
      .min(1)
      .max(600)
      .describe(
        "PASS 2 的**負向**提示詞 —— 明著排除掉的東西。" +
          "除了老三樣(文字/浮水印/邊框/畸形)之外,出貨值特別排除**霓虹 · 過飽和 · " +
          "彩虹漸層 · 過度發光 · 雜亂細節**,那幾個字就是 owner 說的「過度花俏複雜」。" +
          "⚠️ 這裡多寫一個詞的代價是**那個東西整批消失**,所以要排除的是風格不是題材" +
          "(寫 `fire` 會讓所有火焰技能的圖示一起沒有火)。",
      ),

    /**
     * ⭐ GH#457 —— owner 2026-08-19：「我們應該要**能支援 LoRA 跟 SDXL 等更新版本**才對」。
     *
     * ⚠️ **`.optional()` 是強制的**（見下面 `DEFAULT_ICON_STYLE` 的警告）：線上已經
     * 存過的耐久 override 沒有這一格，少了 optional 會讓整份 config 被 Zod 拒絕。
     *
     * ⛔ 路徑**相對於 `tools/icon-gen/models/`**，⛔ 不放絕對路徑 —— 這份 JSON 是
     * 會被 commit、被部署的內容，而 LoRA 檔本身是 gitignore 的機器本機檔。一個
     * `/Users/xxx/...` 進了 content，就是把某一台機器的路徑塞進共用資料。
     */
    loras: z
      .array(
        z
          .object({
            path: z
              .string()
              .min(1)
              .max(300)
              .describe(
                "LoRA 的 .safetensors 路徑,相對於 `tools/icon-gen/models/`。" +
                  "⚠️ 架構(SD1.5 / SDXL)是從**檔頭**讀出來的,⛔ 不看檔名 —— " +
                  "跟 checkpoint 對不起來時產圖器會**當場停下來**,⛔ 不會靜默略過。",
              ),
            weight: z
              .number()
              .min(0)
              .max(2)
              .describe(
                "這顆 LoRA 的強度。1.0 = 作者訓練時的強度;0 = 等於沒掛。" +
                  "上界 2 是誤讀保險絲 —— 再高只會把畫面燒成色塊,⛔ 不會更像。",
              ),
          })
          .strict(),
      )
      .max(8)
      .optional()
      .describe(
        "掛在產圖模型上的 LoRA 清單。⛔ 空陣列(出貨值)= 不掛任何 LoRA。" +
          "⚠️ 改這一格會讓**全部既有圖示失效並在下一次 batch.py 重畫** —— " +
          "它跟兩段提示詞一樣進了 sidecar 的新鮮度戳記,因為它一樣會改變畫面。",
      ),

    strength: z
      .number()
      .min(0.1)
      .max(0.9)
      .describe(
        "PASS 2 的 img2img **重畫幅度**:模型被允許把 PASS 1 的圖改掉多少。" +
          "0.58(出貨值)＝保留主體的輪廓與顏色,同時真的把畫風換掉。" +
          "調高 → 風格更統一,但**主體會開始被塗掉**(0.8 以上幾乎等於重畫一張新圖," +
          "也就是兩階段當初要修的缺陷回來了);" +
          "調低 → 主體很安全,但風格幾乎沒套上去,看起來還是 PASS 1 的半成品。",
      ),

    pass1Steps: z
      .number()
      .int()
      .min(ICON_STEPS_MIN)
      .max(ICON_STEPS_MAX)
      .describe(
        "PASS 1(特徵)的取樣步數。這一階決定「看不看得出畫的是什麼」,所以它是" +
          "**辨識度**的旋鈕。出貨 26。往下調省時間但輪廓會糊掉;往上調到 40 以上" +
          "幾乎看不出差別,只是讓全量那一批多跑幾分鐘。",
      ),
    pass1Guidance: z
      .number()
      .min(ICON_GUIDANCE_MIN)
      .max(ICON_GUIDANCE_MAX)
      .describe(
        "PASS 1 的 CFG(有多聽話)。出貨 7.5。調高 → 更貼特徵描述,但構圖會變僵硬、" +
          "顏色容易燒;調低 → 更自然,但常常畫出描述以外的東西(那正是「這張到底是哪一招」" +
          "的來源)。",
      ),
    pass2Steps: z
      .number()
      .int()
      .min(ICON_STEPS_MIN)
      .max(ICON_STEPS_MAX)
      .describe(
        "PASS 2(風格)的取樣步數。出貨 30。⚠️ 它跟 `strength` 相乘才是真正的工作量" +
          "(img2img 只跑 strength 那一段),所以兩格同時調大,時間是相乘的。",
      ),
    pass2Guidance: z
      .number()
      .min(ICON_GUIDANCE_MIN)
      .max(ICON_GUIDANCE_MAX)
      .describe(
        "PASS 2 的 CFG。出貨 7.0。這一格對「顏色會不會太花」最敏感:調高會把畫風推向" +
          "高飽和的動漫海報(＝ owner 不要的那一種),想更收斂就往 6~7 調。",
      ),

    size: z
      .number()
      .int()
      .min(32)
      .max(512)
      .describe(
        "存檔的圖示邊長(像素,正方形)。出貨 128 —— 全 app 最大的使用面是登入頁跑馬燈的" +
          "54 CSS px(DPR 2 = 108 裝置像素),128 已經超取樣。⚠️ 模型一律在 512 算完再縮," +
          "所以這一格**不影響產圖時間**,只影響檔案大小與放大時的銳利度。",
      ),
  })
  .strict();

export type ConfigIconStyleDoc = z.infer<typeof zConfigIconStyleDoc>;

/**
 * 出貨值 —— 也是**文件讀不到時**（舊部署／檔案被刪／`content/` 沒同步）
 * `tools/icon-gen/local/keywords.py` 退回的那一份。
 *
 * ⚠️ 這份物件與 `content/config/icon-style.json` 必須**逐字相同**（第一守則的
 * 三個住處）。⛔ 未來要加欄位的話**一律 `.optional()`** —— 線上已經存過的耐久
 * override 不會有那一格，少了 optional 會讓整份 config 被 Zod 拒絕 → 內容載入
 * 全滅 → 退回 2 隻骨架英雄（2026-08-02 事故的形狀）。
 */
export const DEFAULT_ICON_STYLE: ConfigIconStyleDoc = {
  id: "icon-style",
  schema: "config.icon-style@1",
  // ⭐ owner 2026-08-19：「請你幫我生成圖示得部分加註**包含 prompt 都要 FATE 風格**」
  //
  // ⚠️ FATE（型月／ufotable）的視覺語言與「**64px 讀得懂**」直接衝突，而解法
  //    ⛔ 不是在兩者之間折衷，是分清楚 FATE 的**哪一半撐得過縮圖**：
  //
  //      撐得過（→ stylePrompt）        撐不過（→ negativePrompt）
  //      ─────────────────────         ─────────────────────────
  //      三色調：金 × 靛藍 × 緋紅       鎏金蕾絲 / 巴洛克捲飾
  //      魔力光點（藍白微塵）           細碎裝飾線
  //      ufotable 的高對比邊光          **符文** / 銘刻符號
  //      厚塗筆觸與可見顏料質地         彩繪玻璃分割
  //
  // ⚠️ `runes` 是**兩用**的：符文在 40px 是一團泥，而且圖像模型會把它當成
  //    「可以畫文字」的邀請 —— 負向本來就有 `text`，但實測風格詞會壓過它。
  //
  // ⭐ **順序是刻意的**：FATE 撐不過縮圖的那一組排最前面，通用品質詞墊底。
  //    （這一條保留自 2026-08-17 —— 當時的理由是 CLIP 77 token 截斷，
  //    ⛔ 而那個理由後來被推翻了：`pipeline._encode_long()` 會切成 75-token 窗格
  //    逐段編碼再串接，**沒有東西被截斷**。順序留著是因為它本來就是對的優先序，
  //    ⛔ 不是因為那個已經不成立的理由。）
  //
  // ⛔ 這裡曾經寫著「守衛：`tools/icon-gen/local/test_icon_style_fits.py`」——
  //    **那個檔案從來不存在**（第三守則：註解會說謊），而且它宣稱要守的那件事
  //    （CLIP 77 token）本身也是誤診。
  //    2026-08-19 量到的真相是：這段字串有 **三個住處**，而**零個守衛** ——
  //      ① content/config/icon-style.json（出貨值，產圖器真的讀的那一份）
  //      ② 這裡的 DEFAULT_ICON_STYLE（**零個 import**，純文件）
  //      ③ tools/icon-gen/local/keywords.py 的 _ICON_STYLE_FALLBACK（fail-open 退路）
  //    ⇒ ①②在 2026-08-19 之前就已經漂移（negativePrompt 不同），而**沒有任何東西紅**。
  //    現在的守衛是 `iconStylePromptHomes.test.ts`（三份逐字比對）。
  stylePrompt:
    "Fate Type-Moon anime illustration in the ufotable style, hand-painted " +
    "digital art, confident brush strokes with visible paint texture, clean ink " +
    "outline, cel shading in two tone steps, warm gold key light from the upper " +
    "left with a cool azure rim light down the lower right, restrained palette of " +
    "burnished gold and deep indigo over muted steel and leather lifted by one " +
    "crimson accent, a few drifting blue-white magical motes, plain near-black " +
    "background, bold readable silhouette, high local contrast, chunky forms",
  negativePrompt:
    "gilded lace, baroque scrollwork, fine ornamental linework, runes, inscribed " +
    "symbols, stained-glass tracery, neon, oversaturated, garish clashing colours, " +
    "rainbow gradient, glitter, excessive glow, lens flare, chromatic aberration, " +
    "busy cluttered detail, kaleidoscope, mandala, emblem, logo, photorealistic, " +
    "photograph, 3d render, glossy plastic, chrome, specular highlight, depth of " +
    "field, text, letters, watermark, signature, border, frame, ui panel, multiple " +
    "views, collage, grid, blurry, lowres, deformed, extra limbs, extra fingers, " +
    "mutated, western cartoon, sketch, monochrome",
  // ⭐ GH#457：出貨**空的**。⛔ 不是「還沒做」——「掛哪一顆 LoRA」是 owner 看過圖
  //    才決定的取捨，而 LoRA 檔本身是 gitignore 的本機檔（`tools/icon-gen/models/`）。
  //    出貨一個路徑等於出貨一個在別人機器上不存在的檔，而產圖器對此是 fail-LOUD 的。
  loras: [],
  strength: 0.58,
  pass1Steps: 26,
  pass1Guidance: 7.5,
  pass2Steps: 30,
  pass2Guidance: 7.0,
  size: 128,
};
