/**
 * 練習靶的 driver（GH#657）—— owner 2026-08-24 逐字：
 *
 * > 「練習模式**預設對方三個英雄**但**不會移動也不會攻擊、施放技能**」
 *
 * ⭐ 這一支就是那句話的**一半**，而且它刻意什麼都不做：`SeatDriver` 這個介面
 * 本來就是「這個座位這一 tick 想做什麼」的唯一入口（見 `seat/Seat.ts` 的檔頭：
 * `setDriver()` 是接管的縫），所以「不會移動、不會施放技能」的正確實作是
 * **一個永遠回空 intent 的 driver**，⛔ 不是在 sim 裡替靶子寫一個 if
 * （第〇·五守則：引擎做機制、內容做東西）。
 *
 * ⚠️ 它管不到的那一半是**自動索敵** —— 那件事是 sim 自己替單位做的，
 * 一個 tick 的 intent 都不需要。所以「不會攻擊」的另一半住在
 * `MobRules.inertSeats`（`sim/systems/OrderSystem.ts::autoAcquirePass`）。
 * ⛔ 少了那一格，一個近戰靶子照樣會對走進 6 單位內的玩家揮刀。
 *
 * ⚠️ `kind` 仍然是 `"ai"`，⛔ 不是一個新的第三種。`driverKind` 已經被
 * **快照**（`net/snapshot.ts`）、**重播檔頭**（`replay/headerCodec.ts`）、
 * **決定性摘要**（`replay/digest.ts`）與 bot 商店折扣讀走，加寬那個聯集
 * 會讓那四處各自需要一個新的分支，而靶子在那四處的正確答案全部都是「當它是 bot」。
 */
import { EMPTY_INTENT, type IntentFrame } from "@ggd/shared/sim/intents";
import type { SeatDriver } from "../seat/Seat";

export class DummyDriver implements SeatDriver {
  readonly kind = "ai" as const;
  onAttach(): void {}
  onDetach(): void {}
  produceIntent(): IntentFrame {
    return EMPTY_INTENT;
  }
}
