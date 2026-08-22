/**
 * `config.screen-fx@1` —— 全螢幕閃爍 / 相機震動 / 特效文字的**上限與無障礙**（GH#549）。
 *
 * ⭐ owner 2026-08-22（逐字）：
 *
 * > 「**畫面閃爍及震動 不然都不知道發生什麼事情**」
 *
 * ⚠️ 這條需求的重點是**資訊**不是華麗：一個大招在畫面外命中、一個爆擊落在腳下，
 * 目前兩者在螢幕上是同一件事（什麼都沒有）。所以這一層是「有事發生」的**全域**通道 ——
 * 而正因為它是全域的，它同時是這個 repo 裡**最容易變成傷害**的一層：
 *   · 全螢幕高頻閃爍是光敏性癲癇的直接誘因；
 *   · 相機位移是動暈症的直接誘因。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 為什麼這一份必須存在（＝為什麼上限不可以住在客戶端）
 * ═══════════════════════════════════════════════════════════════════════════
 * 這些值在 2026-08-22 之前住 `apps/client/src/render/screenFx.ts` 的
 * `DEFAULT_SCREEN_FX_LIMITS` —— 一個**編譯進映像**的常數。client 與 server 是
 * build 時烘進映像的，只有 `content/` 是 live bind-mount ⇒ 「畫面閃太亮」這種
 * 一定會被回報、一定要當場調的東西，改一次要**重建映像 + 重啟容器**。
 * 而它同時是一格無障礙設定：⛔ 讓一個會誘發癲癇的參數只能靠部署來調是不對的。
 *
 * ⚠️ ⭐ **上限夾在這一層，⛔ 不是在技能 JSON 裡。** 一支寫了 `peakAlpha: 1` 的
 * 技能不可以把畫面打成全白 —— 420 支技能各自守規矩是「判準」，一格全域上限是「閘」。
 * ⇒ 這一份的每一格都是**所有**技能共用的天花板，調小它，420 支自動跟著變溫柔。
 *
 * ⚠️ 兩層都要（CLAUDE.md 第一守則）：
 *   · 這裡的 Zod 是**拒**（越界的值存不進後台）；
 *   · `screenFx.ts` 的 `clampTo` 是**夾**（一份舊的 / 手改的文件不會炸掉畫面）。
 *   少了 Zod 那一層，50 打成 500 會過後台、然後在下游被靜默夾掉（#277 的形狀）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 兩份規格的欄位名不一致 —— 這裡跟的是**渲染側真的讀的那一份**
 * ═══════════════════════════════════════════════════════════════════════════
 * | 這裡（＝ `render/screenFx.ts` 的 `ScreenFxLimits`） | 另一份規格寫的 |
 * |---|---|
 * | `shakeMaxAmplitude` | `shakeMaxOffset` |
 * | `reducedMotionMode` ＋ `reducedFlashMult` / `reducedShakeMult` | 只有 `reducedMotionMode` |
 *
 * ⛔ 跟著名字錯的那一份走，會做出一格**後台存得起來、渲染永遠讀不到**的欄位
 * （第一·五守則：卡片上不可以有「說了但不會發生」的字）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔢 第〇·四守則：`reducedMotionMode` 與那兩個乘數**不是兩個住處**
 * ═══════════════════════════════════════════════════════════════════════════
 * 模式**選**哪一條路，乘數**參數化其中一條**：
 *
 * | `reducedMotionMode` | 閃爍殘量 | 震動殘量 |
 * |---|---|---|
 * | `off`    | 0 | 0 |
 * | `weaken` | `reducedFlashMult` | `reducedShakeMult` |
 * | `ignore` | 1 | 1 |
 *
 * ⇒ 解析在**載入時**（`resolveScreenFx`），⛔ 不是把 0 / 1 抄進 JSON 的第二個欄位。
 */
import { z } from "zod";

export const SCREEN_FX_DOC_ID = "screen-fx";
export const SCREEN_FX_SCHEMA_TAG = "config.screen-fx@1";

/**
 * 系統開了「減少動態」（`prefers-reduced-motion`）時怎麼辦。
 *
 *   `off`    完全不震不閃。最安全，代價是那一群玩家**拿不到**這一層想給的資訊
 *            （「有事發生」），於是他們回到 owner 抱怨的那個狀態。
 *   `weaken` **出貨值。** 強度打折（見下面兩格），而閃爍改成一次**沒有陡峭上升緣**
 *            的緩慢呼吸 —— 資訊在，誘因不在。
 *   `ignore` 照原樣播。⛔ 這一格存在只是為了「操作者明知後果仍要關掉這個行為」，
 *            ⛔ 不是一個值得推薦的選項。
 *
 * ⚠️ **出貨值是 `weaken`，而那是我挑的，⛔ 不是 owner 裁決過的** ——
 * 三選一的取捨列在 GH#549 的報告裡等他決定。
 */
export const SCREEN_FX_REDUCED_MOTION_MODES = ["off", "weaken", "ignore"] as const;
export type ScreenFxReducedMotionMode = (typeof SCREEN_FX_REDUCED_MOTION_MODES)[number];

/** 每一格的上下界。⚠️ Zod 的 min/max 要字面值，所以下面是抄這裡（守衛比對兩者）。 */
export const SCREEN_FX_BOUNDS = {
  flashMaxAlpha: { min: 0, max: 1 },
  flashMaxSec: { min: 0, max: 3 },
  shakeMaxAmplitude: { min: 0, max: 2 },
  shakeMaxSec: { min: 0, max: 3 },
  reducedFlashMult: { min: 0, max: 1 },
  reducedShakeMult: { min: 0, max: 1 },
  floatingTextScale: { min: 0.25, max: 4 },
  floatingTextMaxOnScreen: { min: 1, max: 200 },
} as const;

export const zConfigScreenFxDoc = z
  .object({
    id: z.literal(SCREEN_FX_DOC_ID),
    schema: z.literal(SCREEN_FX_SCHEMA_TAG),
    note: z.string().max(2000).optional(),
    /**
     * ⛔ 關掉 = 回到 owner 抱怨的那個狀態（「都不知道發生什麼事情」）。
     * 留著這一格是為了**一鍵回頭**（第〇·六守則），⛔ 不是為了觀望。
     */
    enabled: z.boolean(),
    /** 全螢幕閃爍能蓋掉畫面到什麼程度。0 = 閃爍整個關閉。 */
    flashMaxAlpha: z.number().min(0).max(1),
    /** 一發閃爍最久留多久（秒）。 */
    flashMaxSec: z.number().min(0).max(3),
    /** 相機位移的上限（世界單位）。0 = 震動整個關閉。 */
    shakeMaxAmplitude: z.number().min(0).max(2),
    /** 一發震動最久搖多久（秒）。 */
    shakeMaxSec: z.number().min(0).max(3),
    /** 系統「減少動態」時走哪一條路。 */
    reducedMotionMode: z.enum(SCREEN_FX_REDUCED_MOTION_MODES),
    /** `weaken` 那一條路上，閃爍還剩多少。⚠️ `off` / `ignore` 時這一格不被讀。 */
    reducedFlashMult: z.number().min(0).max(1),
    /** `weaken` 那一條路上，震動還剩多少。⚠️ `off` / `ignore` 時這一格不被讀。 */
    reducedShakeMult: z.number().min(0).max(1),
    /** 特效文字（`floatingText`）的全域字級倍率。 */
    floatingTextScale: z.number().min(0.25).max(4),
    /** 同時最多幾段特效文字在畫面上。 */
    floatingTextMaxOnScreen: z.number().int().min(1).max(200),
  })
  .strict();

export type ConfigScreenFxDoc = z.infer<typeof zConfigScreenFxDoc>;

/** 程式讀的那一份（去掉 id/schema/note 的殼）。 */
export interface ScreenFxPolicy {
  enabled: boolean;
  flashMaxAlpha: number;
  flashMaxSec: number;
  shakeMaxAmplitude: number;
  shakeMaxSec: number;
  reducedMotionMode: ScreenFxReducedMotionMode;
  reducedFlashMult: number;
  reducedShakeMult: number;
  floatingTextScale: number;
  floatingTextMaxOnScreen: number;
}

/**
 * 出貨預設。
 *
 * ⚠️ 每一格都逐字等於 `apps/client/src/render/screenFx.ts` 的
 * `DEFAULT_SCREEN_FX_LIMITS`（那一份是**畫面真的在用的**保險絲）——
 * ⛔ 這裡不是第四個住處，是那三個住處中的「Zod `DEFAULT_*`」那一格。
 *
 * · `reducedShakeMult: 0` —— 與既有的 `combatFeedback.cameraShakeScaleFor(q, reduced) → 0`
 *   同一個立場：相機位移沒有「弱一點的版本」，它要嘛動要嘛不動。
 * · `reducedFlashMult` ⛔ **不是 0** —— owner 要的是「知道發生什麼事情」，
 *   所以 reduced-motion 的人也要拿得到那個資訊，只是換成一層不閃的淡色壓底。
 * · `floatingTextMaxOnScreen` 是**可讀性**的閘，⛔ 不是效能保險絲：連段 × AoE
 *   會一次冒很多字，而一次冒 80 段的畫面等於一段都沒冒。
 */
export const DEFAULT_SCREEN_FX: ScreenFxPolicy = {
  enabled: true,
  flashMaxAlpha: 0.55,
  flashMaxSec: 0.6,
  shakeMaxAmplitude: 0.45,
  shakeMaxSec: 0.9,
  reducedMotionMode: "weaken",
  reducedFlashMult: 0.3,
  reducedShakeMult: 0,
  floatingTextScale: 1,
  floatingTextMaxOnScreen: 40,
};

/** `content/config/screen-fx.json` 的內容，一字不差（drift 測試比對這一份）。 */
export const SHIPPED_SCREEN_FX_JSON: ConfigScreenFxDoc = {
  id: SCREEN_FX_DOC_ID,
  schema: SCREEN_FX_SCHEMA_TAG,
  ...DEFAULT_SCREEN_FX,
};

/**
 * 文件 → 政策。缺席 / 壞掉一律回退到出貨預設，理由和 `resolveVictoryPodium` 同源：
 * 內容載不到是 2026-08-01 骨架事故那一條路，而在那條路上把上限變成 0
 * 會讓「內容全毀」看起來像「這一版把畫面特效拿掉了」。
 */
export function resolveScreenFx(doc: ConfigScreenFxDoc | null | undefined): ScreenFxPolicy {
  if (!doc) return DEFAULT_SCREEN_FX;
  return {
    enabled: doc.enabled,
    flashMaxAlpha: doc.flashMaxAlpha,
    flashMaxSec: doc.flashMaxSec,
    shakeMaxAmplitude: doc.shakeMaxAmplitude,
    shakeMaxSec: doc.shakeMaxSec,
    reducedMotionMode: doc.reducedMotionMode,
    reducedFlashMult: doc.reducedFlashMult,
    reducedShakeMult: doc.reducedShakeMult,
    floatingTextScale: doc.floatingTextScale,
    floatingTextMaxOnScreen: doc.floatingTextMaxOnScreen,
  };
}

/**
 * ⭐ 第〇·四守則：`reducedMotionMode` **在載入時**被解析成兩個乘數，
 * ⛔ 不是在 JSON 裡多寫兩個算好的欄位。
 *
 * ⚠️ 總開關（`enabled: false`）在這裡就把兩邊歸零 —— 讓「整層關掉」只有一個
 * 出口，⛔ 而不是散在渲染側的兩三個 `if`。
 */
export function screenFxReducedMultipliers(
  policy: ScreenFxPolicy,
): { flash: number; shake: number } {
  if (!policy.enabled) return { flash: 0, shake: 0 };
  switch (policy.reducedMotionMode) {
    case "off":
      return { flash: 0, shake: 0 };
    case "ignore":
      return { flash: 1, shake: 1 };
    default:
      return { flash: policy.reducedFlashMult, shake: policy.reducedShakeMult };
  }
}

/**
 * 後台欄位定義 —— 順序 / 標籤 / 分組 / 說明（說明寫「**它影響什麼**」，
 * ⛔ 不是複述欄位名）。integrator 把它翻成 `apps/admin/src/configForms.ts` 的
 * `ConfigDocSpec` 就完成第三個落點。
 *
 * ⚠️ 這一份**還不能掛成後台頁**：`ScreenFxLayer.setLimits()` 目前零 production
 * 呼叫端 ⇒ 掛上去就是「存了不生效」。帳單記在
 * `apps/admin/src/configDocCoverage.ts` 的 `screen-fx` DEFERRED 那一列。
 */
export const SCREEN_FX_FIELDS = [
  {
    key: "enabled",
    label: "畫面閃爍與震動總開關",
    group: "總開關",
    kind: "bool" as const,
    help: "關掉之後，大招命中、爆擊、被控住在螢幕上就再也沒有全域回饋 —— 也就是 owner 說的「都不知道發生什麼事情」。留著這一格是為了一鍵回頭（例如某台機器上震動掉幀），⛔ 不是為了觀望。",
  },
  {
    key: "flashMaxAlpha",
    label: "閃爍．最大不透明度",
    group: "全螢幕閃爍",
    kind: "number" as const,
    min: SCREEN_FX_BOUNDS.flashMaxAlpha.min,
    max: SCREEN_FX_BOUNDS.flashMaxAlpha.max,
    help: "**所有**技能的閃爍能蓋掉畫面到什麼程度 —— 這是一格天花板，不是一個效果。它擋的是「某一支技能寫了全白」這件事：一支技能守不守規矩是判準，這一格是閘。填 0 等於只關掉閃爍（震動照舊）。",
  },
  {
    key: "flashMaxSec",
    label: "閃爍．最長秒數",
    group: "全螢幕閃爍",
    kind: "number" as const,
    min: SCREEN_FX_BOUNDS.flashMaxSec.min,
    max: SCREEN_FX_BOUNDS.flashMaxSec.max,
    help: "一發閃爍最久留多久。⚠️ 太長會蓋住它自己想告訴玩家的那件事 —— 玩家看到閃光是要去看「誰打了我」，而不是看那道閃光。",
  },
  {
    key: "shakeMaxAmplitude",
    label: "震動．最大振幅",
    group: "相機震動",
    kind: "number" as const,
    min: SCREEN_FX_BOUNDS.shakeMaxAmplitude.min,
    max: SCREEN_FX_BOUNDS.shakeMaxAmplitude.max,
    help: "相機位移的上限（世界單位）。⚠️ 這是這一頁**最容易變成傷害**的一格：相機位移是動暈症的直接誘因，而它同時是「這一擊很重」唯一不靠顏色也不靠聲音的訊號。填 0 等於只關掉震動（閃爍照舊）。",
  },
  {
    key: "shakeMaxSec",
    label: "震動．最長秒數",
    group: "相機震動",
    kind: "number" as const,
    min: SCREEN_FX_BOUNDS.shakeMaxSec.min,
    max: SCREEN_FX_BOUNDS.shakeMaxSec.max,
    help: "一發震動最久搖多久。⚠️ 連段技能會一段一發，所以這一格乘上段數才是玩家實際感受到的長度 —— 調大之前先想那支八段的。",
  },
  {
    key: "reducedMotionMode",
    label: "系統「減少動態」時",
    group: "無障礙",
    kind: "enum" as const,
    options: SCREEN_FX_REDUCED_MOTION_MODES,
    help: "玩家在作業系統裡開了「減少動態」時走哪一條路。off＝完全不震不閃（最安全，代價是那群玩家拿不到「有事發生」這個資訊）；weaken＝強度打折、閃爍改成沒有陡峭上升緣的緩慢呼吸；ignore＝照原樣播。⚠️ 這一格影響的是**別人的身體**，⛔ 不是畫面好不好看。",
  },
  {
    key: "reducedFlashMult",
    label: "減少動態．閃爍殘量",
    group: "無障礙",
    kind: "number" as const,
    min: SCREEN_FX_BOUNDS.reducedFlashMult.min,
    max: SCREEN_FX_BOUNDS.reducedFlashMult.max,
    help: "上面那一格選 weaken 時，閃爍還剩多少（其餘兩個模式不讀這一格）。⛔ 出貨不是 0：owner 要的是「知道發生什麼事情」，所以留一層**不閃**的淡色壓底。要完全關掉就把上面那格選 off。",
  },
  {
    key: "reducedShakeMult",
    label: "減少動態．震動殘量",
    group: "無障礙",
    kind: "number" as const,
    min: SCREEN_FX_BOUNDS.reducedShakeMult.min,
    max: SCREEN_FX_BOUNDS.reducedShakeMult.max,
    help: "同上，但這一格是震動。出貨 0，與既有的戰鬥回饋同一個立場：相機位移沒有「弱一點的版本」，對會暈的人來說它要嘛動要嘛不動。",
  },
  {
    key: "floatingTextScale",
    label: "特效文字．字級倍率",
    group: "特效文字",
    kind: "number" as const,
    min: SCREEN_FX_BOUNDS.floatingTextScale.min,
    max: SCREEN_FX_BOUNDS.floatingTextScale.max,
    help: "技能冒出來那些字（連段第幾段、格擋、免疫…）的全域字級。⭐ 一格調全部，⛔ 不用去改每一支技能自己的尺寸。⚠️ 它疊在傷害數字那一層的上面，調大會先擠掉傷害數字。",
  },
  {
    key: "floatingTextMaxOnScreen",
    label: "特效文字．同時最多幾段",
    group: "特效文字",
    kind: "int" as const,
    min: SCREEN_FX_BOUNDS.floatingTextMaxOnScreen.min,
    max: SCREEN_FX_BOUNDS.floatingTextMaxOnScreen.max,
    help: "畫面上同時最多幾段特效文字，超過的直接不畫。⚠️ 這是**可讀性**的閘⛔ 不是效能保險絲：連段 × AoE 一次冒 80 段的畫面，等於一段都沒冒。",
  },
] as const;
