/**
 * standInBody —— 「這位英雄穿的是**替身**身體嗎」的**唯一**判準（GH#1250）。
 *
 * > owner 2026-09-14 02:20（逐字）：「英靈殿一堆無法顯示 3d model 請開票修正」
 *
 * ── 在此之前有兩份判法，而且答案不一樣 ─────────────────────────────────────
 *  ① `STAND_IN_MODEL_KEYS`（`voxelSkin/types.ts`）—— **手寫**的 4 個 modelKey
 *  ② `blizzardOverlay.hasDedicatedShippedModel` —— 看 `glbPath` 在不在通用身體包底下
 * `godie-zombiex` 的 `champ.godie-zombiex` 指到 `blocky-undead.glb`，與殭屍小怪
 * `champ.mob.zombie*`／`champ.blocky.undead` **同一顆檔** ⇒ ② 說是替身、① 說不是
 * ⇒ 英靈殿／選人畫面**沒有徽章**，玩家看到一隻小怪身體卻像正常模型（失敗形態⑫：只從宣告那頭走）。
 *
 * ⭐ 現在：**看 glb 住在哪**（②那一條，overlay 早就在用）。一個模型文件的 `glbPath` 在
 * `assets/models/champions/` 底下 ＝ 站在 in-house 產生的通用 blocky 身體包上
 * （含 `versions/` 裡那幾顆內容雜湊的副本 —— 量過：它們逐位元組等於 blocky-barbarian/knight/mage）。
 * 每一顆**本人**的模型都住在 `imported/`、`community/` 或 overlay 的本機路徑。
 * ⇒ 新增一位站在通用身體上的英雄**不必改任何手寫表**就會被標出來。
 *
 * ⚠️ 已知的邊：`assets/models/champions/voxel-*.glb`（程序化體素匯出）也在這個前綴下，
 * 今天沒有任何模型文件引用它們（2026-09-15 量過）；哪天有人引用，它會被判成替身 ——
 * 那與 overlay 的判法一致（overlay 同樣會替它找原作模型）。
 *
 * ── 資料從哪來（⭐ 規則只有一條，⛔ 不因資料來源而變）──────────────────────
 * 判準只讀**模型文件的 `glbPath`**。呼叫端三選一：
 *  · 傳 `doc`（一份模型文件）⇒ 看它（`resolvedAppearance`、讀磁碟的測試）
 *  · 傳 `null` ⇒ 呼叫端已確認「沒有這份文件」⇒ `false`（沒有證據 ≠ 替身；客戶端骨架退路走這條）
 *  · 省略 ⇒ 查 `Models` registry；⛔ **registry 一份模型文件都沒有（從沒載入）⇒ 丟錯**
 *
 * ⚠️ 2026-09-15 更正（GH#1250 審查）：這一段以前寫「registry 沒有時退回 `STAND_IN_MODEL_KEYS`
 * 那 4 顆種子，只會少標、不會多標」—— ⛔ 那就是**第二條規則**：同一個 `champ.godie-zombiex`
 * 在載了 registry 的畫面上是替身、在不載 registry 的棘輪／身分排序裡不是（失敗形態⑤：
 * 被量的不是出貨的那一條）。⇒ 種子退路拿掉；離線呼叫端要自己把模型文件傳進來，
 * 忘了傳就在第一次呼叫當場紅，⛔ 不再靜靜換一條規則。
 */
import { Models } from "./registries";

/** in-house 通用 blocky 身體包的 glb 前綴（overlay 的 `STOCK_CHAMPION_GLB_PREFIX` 就是它）。 */
export const STOCK_BODY_GLB_PREFIX = "assets/models/champions/";

/** 這個 glb 路徑是不是通用身體包（＝不是任何一位英雄本人的模型）。 */
export function isStockBodyGlbPath(glbPath: string | null | undefined): boolean {
  return typeof glbPath === "string" && glbPath.startsWith(STOCK_BODY_GLB_PREFIX);
}

/** 判準只讀這一格。 */
export interface StandInModelDocLike {
  readonly glbPath?: unknown;
}

/**
 * modelKey 指到的是不是替身身體 —— ⭐ 它的模型文件 glb 在通用身體包底下。
 * `doc`：一份模型文件／`null`（確認沒有）／省略（查 registry，沒載入就丟錯）。見檔頭。
 */
export function isStandInModel(
  modelKey: string | null | undefined,
  doc?: StandInModelDocLike | null,
): boolean {
  if (typeof modelKey !== "string" || modelKey === "" || doc === null) return false;
  const model = doc ?? registryModelDoc(modelKey);
  return typeof model?.glbPath === "string" && isStockBodyGlbPath(model.glbPath);
}

function registryModelDoc(modelKey: string): StandInModelDocLike | undefined {
  if (Models.ids().length === 0) {
    throw new Error(
      `⛔ standInBody.isStandInModel("${modelKey}")：Models registry 沒有載入任何模型文件 —— ` +
        "離線呼叫端要把模型文件傳進來（例：packages/shared/testkit/shippedModelDocs.ts），" +
        "⛔ 不再退回手寫的 4 顆種子（GH#1250）。",
    );
  }
  return Models.tryGet(modelKey);
}
