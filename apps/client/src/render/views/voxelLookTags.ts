/**
 * `config.voxel-look@1` 的 `ignoredLookTags`，**執行期的那一份**（GH#881）。
 *
 * ⭐ 為什麼是一個註冊表而不是直接讀 config：
 * `generateVoxelSkin()` 的檔頭承諾「同一個 input 永遠得到同一個 recipe，
 * 在 node、在瀏覽器、跨 build」—— ⛔ 一個讀全域狀態的純函式做不到那件事。
 * ⇒ 清單由**呼叫端**交進去，而這一支就是客戶端那個呼叫端的住處。
 *
 * ⛔ 這不是第二條載入路徑：`ContentDb.load()` 是唯一的寫入端，
 * 與 `applyHudClusterOverride` / `voxelBodies` 同一個慣例。
 */
import { SHIPPED_LOOK_IGNORED_TAGS } from "@ggd/shared/content/schema/config";

let current: readonly string[] = SHIPPED_LOOK_IGNORED_TAGS;

/**
 * ⚠️ ⭐ **`null`／缺席 ≠ 空陣列。**
 * · 文件缺席（舊的 overlay、還沒載完）⇒ 回到**出貨清單** —— ⛔ 一次載入失誤
 *   不可以靜默把 9 隻英雄換上和服。
 * · 文件在、而清單是 `[]` ⇒ ⭐ 那是 owner **明確按下的 rollback**，照做。
 */
export function setIgnoredLookTags(tags: readonly string[] | null | undefined): void {
  current = tags ?? SHIPPED_LOOK_IGNORED_TAGS;
}

export function ignoredLookTags(): readonly string[] {
  return current;
}
