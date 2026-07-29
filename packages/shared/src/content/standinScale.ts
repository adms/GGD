/**
 * standinScale — 「這個英雄**回退到替身**的時候應該多大」。
 *
 * ── 為什麼需要第二個數字 ────────────────────────────────────────────────────
 *
 * #150 之後,螢幕上的身高是 `TARGET_HEIGHT(1.8u) × relativeScale` —— 先把載進來
 * 的 glb 整個輪廓正規化到 1.8u,再乘上這個英雄的相對倍率。只要「一個英雄一直穿
 * 同一具網格」,一個數字就夠了。
 *
 * GH#31 讓這個前提不成立。40 位共用替身的英雄改成載入各自的 Warcraft III 模型
 * (`assets/blizzard-local/models/*.glb`),而那些模型的原生高度彼此差很多,所以
 * `relativeScale` 被重算成
 *
 *     relativeScale = (該 WC3 模型 rawHeight ÷ HeroPaladin 115.63) × usca
 *
 * 這個式子是對的 —— **但只在那具 WC3 模型真的載進來的時候**。
 *
 * 而它常常沒有載進來:
 *
 *   • `data/blizzard-overlay/` 是 git-ignored 的本機資產,`fullAssetsEnabled()`
 *     沒開(預設 = dev build)的 bundle 從來不會去抓 manifest;
 *   • manifest 抓不到 / 沒有這一位的條目 → `BlizzardOverlayModels.resolve()`
 *     回傳出貨的替身 doc;
 *   • `preferVoxelBody`(#231 的體素身體,而且是**後台可切的**開關 ——
 *     「要替換成體素是我從後台設定套用才生效」)→ `ChampionView` 根本不採用
 *     任何 glb,直接留在程序生成的方塊人上。
 *
 * 這三條路的終點都是**替身**:一具在 0..32 voxel-px 信封裡生出來的身體,正規化
 * 之後「整個輪廓就是身體」。對它而言正確的倍率是地圖的 `usca` 本身,而不是那個
 * 帶著 WC3 身高比的乘積。把 WC3 的數字套在替身上,誤差就是那個身高比整項:
 * `godie-h02s`(死亡騎士,relativeScale 6.795,usca 1.0)會變成
 * **12.2u 高的方塊人**站在 1.8u 的隊友旁邊。
 *
 * ── 這支檔案是那個選擇 ─────────────────────────────────────────────────────
 *
 * `standinRelativeScaleOf` 回答「回退時該用哪個數字」,`isStandinBodyGlb` 回答
 * 「現在腳下這具網格是不是替身」。兩個都是純函式、都沒有 babylon 相依,所以
 * 渲染層(`ChampionView`)和內容守衛讀到的是**同一個**答案 —— 失敗形態 ⑤
 * 「被測的不是出貨的那個」在這裡結構上不可能發生。
 *
 * ⚠️ 已知缺口(寫下來而不是假裝沒有):`GameApp.modelOverrideFor` 會把**變身
 * 倍率**乘進 `relativeScale`(#249 GH#288),但不會乘進 `standinRelativeScale`
 * —— 後者是絕對值。今天沒有任何一位共用替身的英雄同時帶著 `scaleMult`
 * (`content/config/form-visuals.json` 只有 godie-o00x / godie-e00l,兩位都穿
 * 自己的模型),所以這條縫現在是空的;`standinScale.test.ts` 有一條守衛盯著它,
 * 哪天有人替替身英雄加變身縮放就會紅。
 */

/**
 * 所有**生成身體**的出貨路徑前綴。
 *
 * `tools/voxel-gen` 寫進這個資料夾的東西只有兩種:四具共用的 `blocky-*.glb`
 * 替身,以及特徵生成的 per-champion `voxel-<championId>.glb`。兩種都是在同一個
 * 0..32 voxel-px 信封裡生出來的,正規化之後高度一致,所以對兩者而言正確的倍率
 * 都是地圖的 usca —— 這也是為什麼這裡比對的是**資料夾**而不是 `blocky-` 前綴。
 *
 * 這個字串是 `apps/client/src/render/views/blizzardOverlay.ts` 的
 * `STOCK_CHAMPION_GLB_PREFIX` 的鏡像(那一支是 client-only,shared 不可以 import
 * 它);`standinScale.test.ts` 對著實際出貨的 model doc 驗證兩邊指的是同一批檔案。
 */
export const GENERATED_BODY_GLB_PREFIX = "assets/models/champions/";

/**
 * 這具 glb 是不是「替身身體」(生成的方塊人),而不是英雄自己的模型。
 * `null`/`undefined` = 還沒有 / 不會有任何 glb → 現在畫面上是程序生成的體素
 * 身體,那**也是**替身,所以回 true。
 */
export function isStandinBodyGlb(glbPath: string | null | undefined): boolean {
  if (!glbPath) return true;
  return glbPath.startsWith(GENERATED_BODY_GLB_PREFIX);
}

/**
 * `content/models/_standin-overrides.json` 一筆條目裡跟尺寸有關的欄位。
 * 刻意只宣告這幾個:這支檔案是純計算,不該知道 glbPath / clipMap / voxel。
 */
export interface StandinScaleFields {
  /** #150/#77/GH#31 —— 英雄**穿自己那具模型**時的相對倍率。 */
  relativeScale?: number;
  /**
   * 回退到替身身體時的相對倍率。地圖的 `usca` 逐字照抄就是預設答案 ——
   * 替身正規化之後「整個輪廓就是身體」,所以身高比不需要再乘一次。
   * 沒有這個欄位 = 這一筆的 `relativeScale` 本來就是對著替身網格手調的
   * (#77/#150 的既有條目),回退值就是它自己。
   */
  standinRelativeScale?: number;
  /**
   * 地圖宣告的 Scaling Value(`usca`);地圖沒寫時 WC3 的預設值是 1.0,這裡就
   * 記 1.0。**純出處紀錄,不參與計算** —— 計算一律走 `standinRelativeScale`,
   * 因為有幾位的出貨值是 owner 依角色設定手調、刻意跟地圖不同的
   * (熊貓 usca 2.00 / 出貨 0.80)。守衛拿它來對帳。
   */
  usca?: number;
  /**
   * 地圖宣告的模型路徑(`umdl`),原樣照抄 war3map.w3u。**這就是「真模型指向」**
   * —— 在此之前它只活在人類讀的 `note` 散文裡,機器讀不到,也就沒有東西守得住。
   * 地圖沒有覆寫 `umdl`(繼承 base unit)的那幾位沒有這個欄位。
   */
  mapModel?: string;
}

/** 有限、>0 才算數 —— 0 / 負數 / NaN 一律當「沒設定」。 */
function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 英雄**穿自己那具模型**時的相對倍率(#150 的原始語意)。沒有 / 不合法 → 1.0。
 *
 * 與 `EntityViewRegistry.relativeScaleOf` 同語意;那一支多接受一個 legacy 的
 * `scale` 欄位(pre-#150 的絕對值)並刻意忽略它,這裡不需要。
 */
export function modelRelativeScaleOf(ov: StandinScaleFields | null | undefined): number {
  return positive(ov?.relativeScale) ?? 1;
}

/**
 * 回退到**替身身體**時該用的相對倍率。
 * 有 `standinRelativeScale` 就用它,否則沿用 `relativeScale`(= 今天的行為,
 * 對那些本來就是照著替身網格調出來的條目而言是正確的)。
 */
export function standinRelativeScaleOf(ov: StandinScaleFields | null | undefined): number {
  return positive(ov?.standinRelativeScale) ?? modelRelativeScaleOf(ov);
}
