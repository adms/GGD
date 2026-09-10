/**
 * ⭐ GH#662 —— 「這一份 `applyBuff` 來源**明確地**只往下拉」的**唯一**判準。
 *
 * ── 它為什麼存在（量到的，2026-08-24）─────────────────────────────────────
 *
 * `clearPools.polarityPasses` 採「不知道就不當成是」，而那是**對的規則**
 * （寧可漏拔也不要把玩家自己買的裝備被動當成減益剝掉）。⛔ 但它把
 * 「作者沒填欄位」與「這是一份增益」畫上了等號 —— 於是出貨內容裡
 * **12 份文件**的減速／破甲／降攻速／降吸血在任何【淨化】／免疫面前都是無敵的
 * （實測：初號機暴走期間 ms 10→**5**，整段暴走都是 5）。
 *
 * ── ⛔ 這**不是**「從欄位猜極性」──────────────────────────────────────────
 *
 * `applyBuff` 的 `polarity` 註解逐字寫著「不可以事後推導：一個來源可以同時帶
 * `{ms,+0.3}` 與 `{armor,-0.5}`，任何啟發式都會在某一張卡上錯」。**那句話仍然
 * 成立，而這支函式沒有違反它** —— 它問的是一個**嚴格窄**得多的問題：
 *
 *   > 這份來源的 modifier **每一條**都是「明確地把一個數字往下拉」嗎？
 *
 * 混了方向的（`{as,+1.0}` ＋ `{healthRegen,-10}`）一律**回 false**，
 * 而那正是出貨內容裡的 **6 個**「代價型自我增益」（59-00 那一族的狂化：
 * 攻速上去、回血下去）。它們是增益，⛔ 不可以被當成減益拔掉。
 * ⇒ 判準不是「有沒有負數」，是「**有沒有任何一條不是負的**」。
 *
 * 量到的（2026-08-24，出貨 `content/{abilities,items,augments,champions}`）：
 *
 * | | 節點數 |
 * |---|---:|
 * | `applyBuff` 總數 | 284 |
 * | 帶**任何**負值 | 46 |
 * | ⭐ **全部**負值（＝這支會回 true） | 40 |
 * | 其中沒標 `polarity` ⇒ 淨化拔不到 | **12**（12 份文件） |
 * | 混了方向而沒標 polarity（⇒ 這支回 false，正確） | 6 |
 *
 * ── ⛔ 為什麼 op 要白名單，而不是只看 `value < 0` ─────────────────────────
 *
 * 三個 op 的負值**不是**「往下拉」：
 *   · `override`   —— 覆寫成一個絕對值。`-1` 是一個荒謬的值，不是一份減益。
 *   · `capRaise` / `capRaisePct` —— 它們是「把天花板搬到多高」，多個來源取
 *     **max**，所以負值逐位元等於 no-op（第一·五守則的形狀）。
 * ⇒ 遇到這三個一律回 false（＝「我不知道」），⛔ 不是「當成負的」。
 *
 * ⚠️ 純函式：無 rng、無 `Date.now`、無三角函式、無 `**`（`sim/purity.test.ts`）。
 */
import { ModOp } from "./stats/modifiers";

/**
 * 一條 modifier 的**最小**形狀 —— 刻意不吃 `StatModifier`，因為
 * **內容側的閘也要問同一個問題**（`content/negativeBuffPolarity.test.ts`
 * 走的是生 JSON，`op` 只是一個字串）。同一份判準兩邊共用，⛔ 不是兩份會漂的抄本。
 */
export interface NegativeProbe {
  op: string;
  value: number;
}

/**
 * ⭐ 哪幾個 op 的「負值」真的是「把這個數字往下拉」。
 * ⛔ 白名單，不是黑名單：下一個 op 加進 {@link ModOp} 時預設落在
 * 「我不知道」那一邊，而那是安全的方向。
 */
const DIRECTIONAL_OPS: readonly string[] = [
  ModOp.Flat,
  ModOp.PercentAdd,
  ModOp.PercentMult,
  ModOp.PercentOf,
];

/** 這一條 modifier 是不是**明確地**往下拉。 */
export function isDownwardModifier(m: NegativeProbe): boolean {
  return DIRECTIONAL_OPS.includes(m.op) && m.value < 0;
}

/**
 * ⭐ 這一組 modifier **全部**明確往下拉嗎（＝「這是別人塞給你的減益」）。
 *
 * ⚠️ 空陣列回 **false**，⛔ 不是 true：一份沒有 modifier 的 `applyBuff`
 * （只帶 `hooks` / 只帶授予的那些）沒有方向可言，把它推論成減益等於讓一發
 * 「淨化敵方減益」拔掉一份純粹的 hook 載體。
 */
export function allModifiersDownward(mods: readonly NegativeProbe[]): boolean {
  if (mods.length === 0) return false;
  for (const m of mods) if (!isDownwardModifier(m)) return false;
  return true;
}
