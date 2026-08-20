/**
 * ⚙️ **產生檔 —— ⛔ 不要手改。** `pnpm anchors:build` 重量，`pnpm anchors:check` 逐位元組驗。
 *
 * 三個錨點（LV30 / LV50 / LV99）在**兩個空間**的中位數，母體＝
 * `content/champions` 的每一張卡，量法走出貨管線
 * （`championStatBase(卡, 屬性, 等級, 出貨 combat-env)`）。
 *
 * ⛔ **魔抗減傷不在這裡，也不在任何下游推導裡**（owner 2026-08-20：
 * 「不要計算 HP 系統倍率以及魔抗減傷 **會讓我誤判**」）。它只對魔法傷害成立，
 * 拿它量物理技能就是用一把不適用的尺。
 *
 * ⚠️ 兩個 env 輸入是從**出貨 config** 讀出來的快照，⛔ 不是程式預設。
 * owner 轉了 `combat-env.maxHealth` 或 `base-bonus.maxHealth`，`anchors:check` 會紅 ——
 * 那是刻意的閘，因為傷害五級距整條推導鏈掛在它們上面。
 */

/** 純基礎空間的中位**最大生命** —— ⛔ 無系統倍率、⛔ 無初始加成、⛔ 無魔抗。 */
export const MEDIAN_BASE_HP: Readonly<Record<number, number>> = Object.freeze({
  30: 2808.6,
  50: 4356.6,
  99: 8149.2,
});

/** 純基礎空間的中位**最大魔力** —— 同上三個⛔。 */
export const MEDIAN_BASE_MANA: Readonly<Record<number, number>> = Object.freeze({
  30: 1740.3,
  50: 2662.8,
  99: 4940.5,
});

/** `combat-env` 在最大生命上的 env 鏈乘積（出貨值的快照）。 */
export const HP_ENV_MULT = 4;
/** `combat-env` 在最大魔力上的 env 鏈乘積（出貨值的快照）。 */
export const MANA_ENV_MULT = 1;
/** `base-bonus.maxHealth` —— **倍率之外**的扁平贈禮（owner #273「不參與倍率計算」）。 */
export const HP_BASE_BONUS = 650;
/** `base-bonus.maxMana` —— 同上。 */
export const MANA_BASE_BONUS = 600;
