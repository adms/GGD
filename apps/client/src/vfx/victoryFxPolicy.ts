/**
 * victoryFxPolicy — 「這一場要不要放勝利煙火」的唯一一份現行答案。
 *
 * owner 2026-08-02：「請你直接取消煙火(變成後台開關)」。開關住在
 * `content/config/victory-fx.json`（schema `config.victory-fx@1`），出貨兩格
 * 都是 **false**；這個模組是那份文件與**畫面上真的會不會冒出粒子**之間的那一段。
 *
 * 為什麼是一個模組層的單例而不是一個參數：讀它的兩邊隔得很遠 ——
 *   · `vfx/VictoryFireworks.sync()`（Babylon，每幀跑，由 GameApp 持有）
 *   · `ui/panels/MatchEndPanel`（React，結算畫面，決定計分卡要不要讓路）
 * 而餵它的只有一個地方（`content/ContentDb.load()`）。把它做成建構參數就要在
 * 兩條完全不同的鏈上各傳一次，而漏掉任何一條的症狀是「後台關了，畫面上還在放」
 * —— 也就是第②號故障（算出來了但從沒送到）。同一個理由讓 `goreConfig` /
 * `damagePalette` 也長這個形狀。
 *
 * ⚠️ **預設是關的，而且必須是關的。** 這個模組在 `applyVictoryFxDoc` 被呼叫
 * *之前*就會被讀到（內容還在載、或內容整份載失敗退到骨架）。如果初始值是開的，
 * 那麼「內容載不到」這條路會把 owner 明說要拿掉的東西又點回來 —— 正好是最沒有
 * 人在看的那條路。`DEFAULT_ARENA_FIRE` 為了同一個理由也是關的。
 */
import { DEFAULT_VICTORY_FX, resolveVictoryFx } from "@ggd/shared/content";
import type { ConfigVictoryFxDoc, VictoryFxPolicy } from "@ggd/shared/content";

let current: VictoryFxPolicy = DEFAULT_VICTORY_FX;

/**
 * 把 `config/victory-fx@1` 推進特效層。文件缺席／schema 不合時傳 null，
 * 回退到 `DEFAULT_VICTORY_FX`（兩格都關）——**不是**「維持上一場的值」，
 * 因為那會讓一次成功的載入把設定黏在下一場失敗的載入上。
 */
export function applyVictoryFxDoc(doc: ConfigVictoryFxDoc | null | undefined): void {
  current = resolveVictoryFx(doc);
}

/** 現行政策。每一個決定「要不要放煙火」的地方都必須讀這一支。 */
export function victoryFxPolicy(): VictoryFxPolicy {
  return current;
}

/** 測試／teardown 專用：回到出貨值。 */
export function resetVictoryFxPolicy(): void {
  current = DEFAULT_VICTORY_FX;
}
