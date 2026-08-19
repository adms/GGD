/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { StatusId } from "../../../ids";
import type { Scaling } from "../effect";

/**
 * spendMana — 消耗法力. The MIRROR of `restore.manaPct`, and the missing half
 * of the vocabulary: every path that could move mana before this only ever
 * moved it UPWARDS (`restore`, `Stat.ManaRegen`) or charged it as an
 * ABILITY's own `manaCost` at cast time (abilities/abilitySystem.ts).
 *
 * WHY IT HAD TO EXIST — a real card the old vocabulary could only lie about.
 * 20-01 風王結界 (`godie-e002.w`, w3a `A0DZ`) is a WC3 ORB: while the barrier
 * is up, EVERY BASIC ATTACK spends 30 mana and adds bonus damage. That cost
 * is not the ability's `manaCost` — the toggle is cast once and the charge is
 * paid per SWING, from a hook, and the swing still lands when the pool is
 * empty (the orb simply does not fire). `manaCost` charges once, at cast, and
 * REFUSES the cast when short; those are different rules, so this is a
 * different mechanism, not a re-use of that one.
 *
 * ⚠️ IT DOES NOT GATE ITSELF. This effect SPENDS; deciding whether there was
 * enough to spend is the hook's `condition` (sim/content/condition.ts —
 * 「自身法力 >= 30」). Folding a threshold in here would have built a second,
 * invisible copy of the condition system whose number could drift out of sync
 * with the visible one, and would have made the same effect un-authorable for
 * 「花光剩下的法力」 cards. What it DOES guarantee is that the pool never goes
 * negative: the spend is clamped at 0 (see effects/spendMana.ts).
 */
export interface SpendManaVariant {
  kind: "spendMana";
  /** flat mana to burn, per application. Resolved against the CASTER's stats. */
  amount: Scaling;
  /**
   * ADDITIONAL 0..1 fraction of the payer's OWN max mana, added to `amount`.
   * Both terms exist because WC3 authors both forms (`Ncl6`-style flat costs
   * and the percentage drains); absent = 0, so a flat-only card is unchanged.
   */
  pctMaxMana?: number;
  /**
   * ADDITIONAL 0..1 fraction of the payer's **CURRENT** mana — 熾天使之弓
   * godie-i012 「每次削去敵方英雄**現存** MP 3%」(owner 2026-08-01 把 5% 調成 3%)。
   * ABSENT = 0,所以每一份
   * 既有文件完全不變。加在 `amount` 與 `pctMaxMana` 之上。
   *
   * ⚠️ 為什麼是**第二個欄位**而不是給 `pctMaxMana` 加一個 `basis`:
   * `pctMaxMana` 這個名字寫著 **Max**,而且已經出貨在內容裡。加一個
   * `basis: "current"` 會讓那個名字在一半的取值下變成謊話 —— CLAUDE.md
   * 第一守則末段點名的正是這種事(「語意改了,舊文案就是謊話」)。兩個
   * 名字各自誠實、相加,語意也清楚:兩個都是「這次要提多少」。
   *
   * ⚠️ 分母永遠是**付款人自己的**條(跟 `pctMaxMana` 一樣),即使
   * `applyTo: "target"` —— 「削去敵方現存 MP 3%」的 3% 當然是敵方的魔,
   * 這是這個機制唯一說得通的讀法,也是 spendMana 檔頭已經寫下的規則。
   */
  pctCurrentMana?: number;
  /** who pays: the hook/ability owner (default) or each resolved target (mana burn) */
  applyTo?: "self" | "target";
  /**
   * 把**這一次實際扣掉的法力**存進一個標記,讓稍後的 `damage.bankedBonus`
   * 讀得到。ABSENT = 不存(今天五支 spendMana 有四支不需要)。
   *
   * WHY IT EXISTS AT ALL — owner 2026-07-31 對 13-002 絕。暗殺奧義:
   * 「現存 MP 的 20% 傷害」。那一招把法力燒到 0,而送傷害的免費牙突是
   * hook 上的 `onAbilityHit`,幾秒後才可能打中人。那時 `hp.mana` 已經是 0,
   * 所以「在傷害那一刻讀法力」永遠算出 0 —— 失敗形態②。存款是唯一能
   * 表達「在消耗全魔的那一刻結算」的形狀。
   *
   * ⚠️ 存的是**實扣量**不是 `want`:法力不夠時 spendMana 會夾到剩下的量,
   * 而玩家買到的傷害必須對應他真的付出去的東西。
   */
  bankAs?: { statusId: StatusId; durationSec: number };
}
