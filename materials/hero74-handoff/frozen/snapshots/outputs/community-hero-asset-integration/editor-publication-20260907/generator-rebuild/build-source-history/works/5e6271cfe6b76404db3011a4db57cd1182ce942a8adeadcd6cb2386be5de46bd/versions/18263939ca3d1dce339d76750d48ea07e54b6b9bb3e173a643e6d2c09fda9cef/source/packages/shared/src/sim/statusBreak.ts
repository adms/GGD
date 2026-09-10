/**
 * 「**受傷即提早解除這一筆** status」（C4 睡眠，#278）。
 *
 * ── 為什麼它不是 `clearPools` 的一個參數 ──────────────────────────────────
 * `clearPools` 的選擇軸是「哪一池 / 哪一種極性 / 拔幾層 / 先拔哪一邊」——
 * 全部是**集合**層級的。C4 要的是「拔掉**標了這一格**的那幾筆，其餘一格不動」，
 * 那是一個**述詞**，硬塞進 `ClearPoolsOpts` 會讓那支函式變成一個什麼都能做的
 * 萬用清除器，而它現在有四個呼叫端（復活／回合重置／淨化／破盾）都靠
 * 「它只會做那幾件事」在推理。
 *
 * ── ⛔ 它只拔標了 `breakOnDamage` 的那幾筆 ────────────────────────────────
 * 睡眠被打醒的同一發傷害**不可以**順手解掉身上的減速與詛咒 ——
 * 那是淨化不是打醒，而畫面上看不出差別（守衛兩個方向都讀）。
 *
 * ── 門檻是一格欄位，不是一個判斷式 ────────────────────────────────────────
 * 「多小的一下算把人打醒」是 CLAUDE.md 說的**決策點**：WC3 的沉睡是任何傷害
 * 都醒，但一個「被燃燒每 tick 3 點打醒」的睡眠在這個引擎裡等於沒有睡眠
 *（第 3 回合之後場上到處是 DoT）。所以 `breakOnDamageMin` 住在**文件上**，
 * 省略 = 0 = 任何傷害都醒（WC3 的語意，出貨預設）。
 *
 * ── purity ──────────────────────────────────────────────────────────────
 * 無 rng、無時鐘、無三角函式；只碰一個實體，所以沒有 Map 迭代順序問題。
 */
import type { SimWorld } from "./SimWorld";
import type { EntityId } from "../ids";

/**
 * 一發傷害落在 `victim` 身上之後呼叫。
 *
 * @param amount 這一發**實際扣掉的**傷害（護盾吃掉之後的那個數）。
 * @returns 拔掉了幾筆。
 */
export function breakStatusesOnDamage(
  world: SimWorld,
  victim: EntityId,
  amount: number,
): number {
  const st = world.status.get(victim);
  if (!st || st.effects.length === 0) return 0;
  // 快路徑：絕大多數實體身上沒有任何一筆標了這一格，而這支函式**每一發傷害
  // 都會被呼叫**（第 3 回合之後一場有數千發）。`some` 在沒有命中時不配置陣列。
  if (!st.effects.some((e) => e.breakOnDamage === true)) return 0;

  const before = st.effects.length;
  st.effects = st.effects.filter(
    (e) => !(e.breakOnDamage === true && amount >= (e.breakOnDamageMin ?? 0)),
  );
  return before - st.effects.length;
}
