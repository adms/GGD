/**
 * 施法特效播在離地多高 —— **一個有名字的接縫，取代四個匿名的 `1.0`** (#230).
 *
 * ---------------------------------------------------------------------------
 * 為什麼一個常數值得一個檔案
 * ---------------------------------------------------------------------------
 * `VfxSystem.playCastVfx` 的四條分支（家族 rig / pooled 文件 / `fx.prim.*` 退路 /
 * 單值 `vfxKey`）都把 `1.0` 直接寫在呼叫參數上。沒有人挑過這個數字 —— 它是
 * `VfxSystem.play()` 的預設高度，因為施法路徑從來沒有把「這一招應該多高」送進來。
 *
 * 而**高度是算得出來的**：`resolveFamilyArt()` 對每一支家族技能都算出一個
 * `heightY`（家族原型的基準高度，再疊上原圖 `SetUnitFlyHeight` 的覆寫），然後
 * `familyRow()` 把 `ResolvedFamilyArt` 塞進 `W3xAbilityArt` 時，那個介面**沒有這個
 * 欄位**，於是值在那一行蒸發 —— 第②號故障，和 2026-07-30 修掉的 alpha /
 * timeScale 是同一個形狀，只是 `heightY` / `anchor` 這兩個**空間**欄位還沒修。
 * 後台 `apps/admin/src/vfxForge.ts` 的 `DEAD_FAMILY_KNOBS` 白紙黑字列著它們。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 這裡**沒有**改變任何畫面 —— 落差有多大是量到的，不是估的
 * ---------------------------------------------------------------------------
 * 2026-07-30，把出貨的 `content/config/vfx-families.json` 餵給真的
 * `VfxSystem.handleEvent`、對 `W3X_FAMILY_ART` 的**全部 258 列**各發一次施法事件，
 * 從 Babylon 讀回每一個 `ParticleSystem` 的 emitter 世界座標：
 *
 *   · 258 列全部畫得出來（0 列生不出粒子），共 342 個 `ParticleSystem`
 *   · emitter 世界 Y 的直方圖是**單一一格**：`{ 1.0: 342 }`
 *   · 而 `resolveFamilyArt()` 算出來的 `heightY` 有 **229 列不是 1.0**：
 *
 *       shockwaveRing  91 支  想要 0.15（貼地的環）→ 畫在 1.0（浮空 0.85）
 *       burst          34 支  想要 0.9          → 1.0
 *       flamePillar    15 支  想要 0.1          → 1.0
 *       mark           13 支  想要 2.172        → 1.0
 *       dissipate      10 支  想要 0.9          → 1.0
 *       resurrect      10 支  想要 0.1          → 1.0
 *       lightColumn     8 支  想要 0.1          → 1.0
 *       resurrect       7 支  想要 1.272        → 1.0
 *       cloud           6 支  想要 1.2          → 1.0
 *       boltStrike      6 支  想要 3.2（從天而降）→ 1.0（胸口高度）
 *       …其餘 29 支（groundDust / shine / breath / portal / levelUp / tornado /
 *          uncategorised / mirrorImage / blink / missile）
 *
 *   （分母 258 = `W3X_FAMILY_ART` 的列數；229/258 = 88.8%。全部是量到的值，
 *     沒有一個是估的。原始量測檔：`/private/tmp/vfxfam/probe-all-258.json`。）
 *
 * **接上去 = 一次改動 229 支技能在畫面上的高度。** 那是要用眼睛驗收的視覺變更，
 * 一條看不到畫面的 lane 不該自己決定 —— 所以這個檔案**只是把那個數字命名**，
 * 出貨行為一位元不差。決定要不要接，改的是下面這一個函式，一行。
 *
 * ---------------------------------------------------------------------------
 * 這個接縫買到什麼
 * ---------------------------------------------------------------------------
 * `familyCastOnScreen.test.ts` 斷言的是「**渲染器宣稱的高度 == Babylon 真的拿到的
 * 高度**」。今天兩邊都是 1.0，測試綠；哪天有人把 `familyCastHeightY` 改成讀
 * `art.heightY`，這條測試會逼他證明那個值真的到得了引擎，而不是又在某個介面上
 * 蒸發一次。也就是說：②號故障在這條路上從此是**結構上不可能**的，而不是靠人記得。
 */
import type { W3xAbilityArt } from "./w3xAbilityArt";

/**
 * 出貨的施法高度（世界單位）。
 *
 * 1.0 ≈ 一位 1.7 單位高的英雄的胸口。這個值不是美術挑的，是
 * `VfxSystem.play()` 的預設值 —— 見檔頭。動它等於同時平移**每一支**技能的施法
 * 特效（家族的 258 支 + `fx.prim.*` 的那幾百支），所以它有名字。
 */
export const SHIPPED_CAST_HEIGHT_Y = 1.0;

/**
 * 這一次施法要播在哪個世界高度。
 *
 * 今天：永遠是出貨值。`art` 已經傳進來了，所以「改成讀 `art.heightY`」是**這一
 * 個函式裡的一行**，不是一次跨四個檔案的手術 —— 那正是這個接縫的用途。
 *
 * ⚠️ 不要在這裡「順手」接上 `heightY`。接上去是一個**視覺**決定（229 支，最大位移
 * 2.2 世界單位），要 owner 看過畫面才算數；檔頭有全部的量測數字可以直接拿去問。
 */
export function familyCastHeightY(_art: W3xAbilityArt | undefined): number {
  return SHIPPED_CAST_HEIGHT_Y;
}
