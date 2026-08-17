/**
 * weaponTiers.ts —— 「這一回合的寶具三選一要從**哪一張**獎池抽」（owner 2026-08-17）。
 *
 *	「改寫為 **[EX解放]** 等級寶具，比 EX 更高級一點，隨機三選一會出現，
 *	  **特別是劣勢方出現機率會明顯變高**」
 *	「接下來我還會增加一個等級 **[EX∅ 根源]** 只會出現在**第九回合後**，
 *	  特別是劣勢方抽到機率明顯變高，用來**逆轉**」
 *
 * ── ⛔ 為什麼不是「為 EX解放 寫一段 if」（第〇·五守則）───────────────────────
 *
 * owner 的兩句話**形狀完全一樣**，只有三個參數不同（最低回合、基礎機率、劣勢機率）
 * 加上一張獎池。所以引擎裡只有**一個機制**：
 *
 *	一張有序的「更高階獎池」表，逐階問「這一回合開不開放 × 骰不骰得到」，
 *	第一個中的就用它的獎池；⛔ 全都沒中就走這一回合原本排的那一張。
 *
 * ⇒ owner 之後要加第三、第四階（或替某一階換池、關掉、只給劣勢方）都是**填一列**，
 * ⛔ 不改任何程式。EX∅ 根源出貨就是這樣：機制在、池是空的、owner 填 50~70 把。
 *
 * ── 空池不是「發不出卡」，是「往下一階讓」──────────────────────────────────
 *
 * ⚠️ 這一條是刻意的，而且是這個檔案唯一會咬人的地方：一階中了但它的池在這位玩家
 * 身上**一件都不合格**（還沒上架 / 已經持有 / 白名單關著 / owner 還沒填），
 * 天真的做法是照樣用那張池 ⇒ 那位玩家這一回合的三選一**是空的**，
 * 而畫面上跟「這回合本來就沒排寶具」長得一模一樣。
 * 所以 {@link pickWeaponTable} 收一個 `hasEligible` 探針，中了但探不到東西就繼續往下讓。
 *
 * ── 決定論 ─────────────────────────────────────────────────────────────────
 *
 * 骰子只來自 `rng.next()`，而且**逐階固定順序、每階剛好一次**（⛔ 不是「先過濾再骰」
 * —— 過濾會讓消耗的亂數個數取決於回合數，同一顆種子在不同回合走不出同一條流）。
 * 沒有 `Math.random`、沒有時鐘、沒有 Map 迭代。
 */

/** 一階更高階寶具的規則。⚠️ 每一格都是後台欄位（第一守則）。 */
export interface WeaponTierRule {
  /** 內部 id，會接在 offer tier 後面（`weapon:ex-release`）給畫面查標籤用。 */
  readonly id: string;
  /** 給玩家看的階級名（「EX解放」「EX∅ 根源」）。 */
  readonly label: string;
  /** 這一階的獎池（`content/loot-tables/<id>.json`）。 */
  readonly table: string;
  /** 第幾回合起才可能出現。owner：EX∅ 根源「只會出現在第九回合後」。 */
  readonly minRound: number;
  /** 領先／持平的玩家抽到這一階的百分比。 */
  readonly basePct: number;
  /** **劣勢方**抽到這一階的百分比（owner：「明顯變高」）。 */
  readonly underdogPct: number;
}

/** 只取 `next(): number ∈ [0,1)`，⛔ 不綁 SimWorld（測試可以塞一個假的）。 */
export interface TierRng {
  next(): number;
}

export interface WeaponTierPick {
  /** 真的要抽的那一張獎池。 */
  readonly table: string;
  /** offer 的 tier 字串：基礎池是 `weapon`，更高階是 `weapon:<id>`。 */
  readonly offerTier: string;
  /** 中的那一階；走基礎池時是 null。 */
  readonly rule: WeaponTierRule | null;
}

/** offer tier 的前綴 —— 與 `draft.ts` 的 `ITEM_OFFER_TIER` 是同一個字。 */
export const WEAPON_TIER_PREFIX = "weapon";

/** `weapon:ex-release` → `ex-release`；基礎池或不是武器卡 → null。 */
export function weaponTierIdOf(offerTier: string): string | null {
  const p = `${WEAPON_TIER_PREFIX}:`;
  return offerTier.startsWith(p) ? offerTier.slice(p.length) : null;
}

/**
 * 挑這一次要用的獎池。
 *
 * @param tiers      由**高到低**排好的階級表（呼叫端負責順序：出貨 JSON 的順序就是它）
 * @param round      這一回合的編號
 * @param underdog   這位玩家是不是劣勢方（落後領先者至少一勝）
 * @param baseTable  這一回合原本排的獎池
 * @param rng        `world.rng`
 * @param hasEligible 探針：這張池對這位玩家有沒有**至少一件**抽得到的東西
 */
export function pickWeaponTable(
  tiers: readonly WeaponTierRule[],
  round: number,
  underdog: boolean,
  baseTable: string,
  rng: TierRng,
  hasEligible: (table: string) => boolean,
): WeaponTierPick {
  let hit: WeaponTierRule | null = null;
  for (const t of tiers) {
    // ⚠️ 骰子**先擲**再判斷回合閘：這樣一位玩家消耗的亂數個數只跟階級**張數**有關，
    // ⛔ 不跟回合數有關 —— 否則同一顆種子在第 8 與第 9 回合會走岔。
    const roll = rng.next() * 100;
    if (hit !== null) continue; // 已經中了，但仍然要把後面幾階的骰子擲掉
    if (round < t.minRound) continue;
    const pct = underdog ? t.underdogPct : t.basePct;
    if (roll < pct && hasEligible(t.table)) hit = t;
  }
  if (hit === null) return { table: baseTable, offerTier: WEAPON_TIER_PREFIX, rule: null };
  return { table: hit.table, offerTier: `${WEAPON_TIER_PREFIX}:${hit.id}`, rule: hit };
}
