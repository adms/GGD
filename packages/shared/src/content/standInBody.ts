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
 * ── registry 沒有那份模型文件時 ──────────────────────────────────────────
 * 純 Node 的離線場合（讀磁碟的測試、不載 registry 的工具）只拿得到 modelKey。
 * 那時退回 `STAND_IN_MODEL_KEYS` 那 4 顆**種子** —— 它們在出貨內容上**全部**也被 glb 規則標出
 * （`apps/client/src/ui/platform/valhallaShippedRoster.test.ts` 釘住「種子 ⊆ 推導」），
 * 所以退路**只會少標、不會多標**。呼叫端手上有模型文件時請直接傳進來（`resolvedAppearance` 就是）。
 */
import { Models } from "./registries";
import { STAND_IN_MODEL_KEYS } from "./voxelSkin/types";

/** in-house 通用 blocky 身體包的 glb 前綴（overlay 的 `STOCK_CHAMPION_GLB_PREFIX` 就是它）。 */
export const STOCK_BODY_GLB_PREFIX = "assets/models/champions/";

/** 這個 glb 路徑是不是通用身體包（＝不是任何一位英雄本人的模型）。 */
export function isStockBodyGlbPath(glbPath: string | null | undefined): boolean {
  return typeof glbPath === "string" && glbPath.startsWith(STOCK_BODY_GLB_PREFIX);
}

/**
 * modelKey 指到的是不是替身身體。
 * 手上有模型文件就傳 `doc`（最準）；否則查 `Models` registry；registry 也沒有 ⇒ 種子表。
 */
export function isStandInModel(
  modelKey: string | null | undefined,
  doc?: { glbPath?: unknown } | null,
): boolean {
  if (typeof modelKey !== "string" || modelKey === "") return false;
  const model = doc ?? Models.tryGet(modelKey);
  if (model && typeof model.glbPath === "string") return isStockBodyGlbPath(model.glbPath);
  return STAND_IN_MODEL_KEYS.includes(modelKey);
}
