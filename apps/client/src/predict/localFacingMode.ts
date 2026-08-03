/**
 * 自己英雄的面向來源 —— client 端的**現值** (GH#281 / owner 2026-08-03).
 *
 * 語意、合法值與出貨預設全部住在 `@ggd/shared/sim/facingLock`，這裡只做兩件事：
 *
 *   1. 從一份 `config.combat-feel@1` 文件把 `facing.localMode` 讀出來；
 *   2. 把它存成一個 client 端的現值，讓 `GameApp` 每一幀讀得到。
 *
 * ⚠️ 為什麼是一個模組級的現值而不是 `GameApp` 的建構參數：內容是**非同步**載入
 * 的（`ContentDb.load()` 在 `GameApp` 建好之後才 resolve），而一場比賽可能在
 * 內容抵達之前就開始。存成現值 = 內容一到就生效，不必重建 GameApp。
 *
 * ⚠️ 這個檔**不會自己去讀內容登錄表**。呼叫 `applyCombatFeelDoc` 的地方在
 * `apps/client/src/content/ContentDb.ts`（和 `applyGoreDoc` / `applyItemCardDoc`
 * 那一排同一個形狀）。在那一行接上之前，出貨路徑用的就是
 * `DEFAULT_LOCAL_FACING_MODE`，也就是 owner 裁決的 `hybrid` —— 功能是完整的，
 * 只是後台調不動。缺的那一行寫在交接的 needsOthers 裡。
 */
import {
  DEFAULT_LOCAL_FACING_MODE,
  parseLocalFacingMode,
  type LocalFacingMode,
} from "@ggd/shared/sim/facingLock";

let current: LocalFacingMode = DEFAULT_LOCAL_FACING_MODE;

/** 這一場實際生效的模式。 */
export function localFacingMode(): LocalFacingMode {
  return current;
}

/**
 * 套用一份 `config.combat-feel@1` 文件。缺文件 / 缺欄位 = 出貨預設（和 sim 端
 * `facingTicks` 對缺格的處理同一個規矩）。
 *
 * 認不得的字串會 fail-open 到預設，**而且會叫一聲** —— 一個打錯的
 * `localMode` 靜默退回，長得和「後台根本沒存過」一模一樣，那正是 CLAUDE.md
 * 說的「壞掉跟正常長得一樣」。
 */
export function applyCombatFeelDoc(doc: unknown): void {
  const facing = (doc as { facing?: { localMode?: unknown } } | null | undefined)?.facing;
  const raw = facing?.localMode;
  if (raw === undefined || raw === null) {
    current = DEFAULT_LOCAL_FACING_MODE;
    return;
  }
  const parsed = parseLocalFacingMode(raw);
  if (parsed !== raw) {
    console.warn(
      `[client] config.combat-feel@1 facing.localMode = ${JSON.stringify(raw)} 不是合法值; ` +
        `退回出貨預設 ${DEFAULT_LOCAL_FACING_MODE}`,
    );
  }
  current = parsed;
}

/** 測試用：把現值放回出貨預設。 */
export function resetLocalFacingMode(): void {
  current = DEFAULT_LOCAL_FACING_MODE;
}
