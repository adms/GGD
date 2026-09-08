/**
 * 「這個身體某一格技能現在是第幾階」—— `GetUnitAbilityLevelSwapped(rawcode, unit)` 的
 * GGD 對應物（GH#1020）。
 *
 * 兩個讀者共用這一支，⛔ 不是各抄一份：
 *   · `Scaling.slotRankRatios`（傷害隨**另一格**技能的階級成長 —— 小傑 06-00 猜猜拳
 *     「石頭 = 350 + 150 × 強的等級」那一族，JASS 的傷害公式裡到處是別的技能的等級）
 *   · `condition` 的 `learned` 葉（「EX 已解鎖」—— 原作 `udg_EX_Mode` 那 52 處檢查）
 *
 * ⚠️ 為什麼是 `sim/effects/` 底下的一支獨立小檔，⛔ 不是塞進 `content/condition.ts`：
 * `content/condition.ts` 已經 import `effects/effectCommon.ts`（`hasStatus`），而
 * `effectCommon.ts` 要建 `casterSlotRank(ctx)` ⇒ 反向 import 就是一條 ESM 迴圈。
 * 這一支只依賴 `SimWorld` 的型別與 `intents` 的槽位 enum，兩邊都 import 得安全。
 *
 * 語意（與 `spawnChampion` / `unlockEx` 的寫入端逐字對齊）：
 *   · Q/W/E/R ⇒ `slots[slot].rank`（未學 = 0）
 *   · EX ⇒ `exSlot.rank`（`unlockEx` 把它從 0 撥成 1；沒有 EX 技的英雄 = 0）
 *   · PASSIVE ⇒ `passiveSlot.rank`（天生技出生就是 1；沒有天生技 = 0）
 *   · 沒有 `AbilitiesComp` 的身體（小怪、召喚物）⇒ 0 —— 「沒學」與「學不了」對一條
 *     `× 階級` 的傷害公式是同一個數字，⛔ 不做成 `null` 讓每個呼叫端再判一次。
 *
 * purity：純讀元件，⛔ 無 rng、無時鐘、無三角。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { CastableSlot } from "../intents";

export function slotRankOf(world: SimWorld, id: EntityId, slot: CastableSlot): number {
  const ab = world.abilities.get(id);
  if (!ab) return 0;
  if (slot === "EX") return ab.exSlot?.rank ?? 0;
  if (slot === "PASSIVE") return ab.passiveSlot?.rank ?? 0;
  return ab.slots[slot]?.rank ?? 0;
}
