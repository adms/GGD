/**
 * weaponTiers.ts —— 「這一回合的寶具三選一要從**哪一張**獎池抽」（owner 2026-08-17）。
 *
 * 階級：**EX ＜ [EX解放] ＜ [EX∅ 根源]**（owner 2026-08-17 正式定名，⛔「EX理外」已廢除
 * —— 理由是玩家拿到的是「既有能力被**解封**」，不是「一件裝備突然推翻所有規則」）。
 *
 *	[EX解放]   正常進入回合間的隨機三選一。「將英雄原本能做的事，推進到正常系統
 *	           無法到達的階段。」劣勢方權重明顯提高，**但領先方仍有低機率取得** ——
 *	           owner：「避免系統看起來像直接補償敗方」，所以 `basePct` ⛔ 不可以是 0。
 *	[EX∅ 根源] 只在**第九回合結束後、最終回合開始前**出現。「根源是**逆轉**，不是翻桌」——
 *	           它替劣勢方創造最後一次翻盤窗口，⛔ 但不直接宣判勝利。
 *
 * ── ⛔ 為什麼不是「為 EX解放 寫一段 if」（第〇·五守則）───────────────────────
 *
 * 兩個階級**形狀完全一樣**，只有參數不同（出現窗口、基礎機率、劣勢加權的強度與曲線、
 * 數量限制）加上一張獎池。所以引擎裡只有**一個機制**：
 *
 *	一張有序的「更高階獎池」表，逐階問「這一回合開不開放 × 骰不骰得到」，
 *	第一個中的就用它的獎池；⛔ 全都沒中就走這一回合原本排的那一張。
 *
 * ⇒ 之後要加第三、第四階（或替某一階換池、關掉、改窗口）都是**填一列**，⛔ 不改程式。
 * [EX∅ 根源] 出貨就是這樣：機制在、池還不存在，owner 填第一件的那天它自己就活了。
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
  /** 第幾回合起才可能出現。[EX∅ 根源]：「第九回合**結束後**」⇒ 10。 */
  readonly minRound: number;
  /**
   * 最後在第幾回合出現（含）。省略 = 沒有上界。
   * ⭐ [EX∅ 根源] 出貨是 **10..10**，而 `PairedDuels.FINAL_ROUND` 也是 10。
   * ⚠️ 這**不矛盾**：三選一發生在該回合的**商店階段**，也就是最終大亂鬥開打之前 ——
   * owner 要的「最終回合大戰**前**」拿到的就是這一張。
   */
  readonly maxRound?: number;
  /** **平手方**（D = 0）抽到這一階的百分比。 */
  readonly basePct: number;
  /** 劣勢加權強度：最終 = `basePct × (1 + factor × D^exponent)`。 */
  readonly underdogFactor: number;
  /** 劣勢加權曲線：1 = 線性（[EX解放]）、2 = 平方（[EX∅ 根源]）。 */
  readonly underdogExponent: number;
  /**
   * ⭐ **劣勢保底門檻**（owner 2026-08-18：「最後一回合弱勢保底可以抽根源」）。
   *
   * 設了之後這一階改走**保底曲線**，⛔ `underdogFactor` 不再參與：
   *
   *	pct(D) = basePct + (100 − basePct) × min(1, D / guaranteeAtD)^exponent
   *
   * 也就是「平手方 `basePct`，劣勢值到 `guaranteeAtD` 以上**必得**」，中間照
   * `underdogExponent` 的曲線爬上去。⛔ 刻意**不是**「超過門檻就跳到 100」——
   * 那個斷崖在門檻兩側差一個 D 的第三位小數就差 70 個百分點，玩家感受得到而且
   * 沒有道理。省略 = 沒有保底，走原本的倍率曲線。
   */
  readonly guaranteeAtD?: number;
  /** 數量限制算在誰頭上。 */
  readonly limitScope: "champion" | "team";
  /** 同一個 scope 最多幾件。 */
  readonly limitCount: number;
}

/**
 * 劣勢值 `D` —— owner 2026-08-17 逐字給的三項加權，各項**已經**正規化到 [0,1]。
 *
 *	D = 50% × 回合／隊伍生命差距 + 30% × 已完成裝備價值差距 + 20% × 最近三回合勝負差距
 *
 * ⭐ 為什麼三項而不是只看血量：owner「不能只用目前生命值判斷劣勢，否則容易被**刻意
 * 壓血**利用」。三項一起看才擋得住 —— 壓血壓得動第一項，壓不動裝備價值與勝負紀錄。
 *
 * ⚠️ 這一支是**純函式**且不吃 rng：它只把三個已經算好的比例合成一個數。三項各自
 * 怎麼量是 host 的事（sim 沒有回合勝場與道具價格那兩份帳），⛔ 不在 sim 裡重建。
 */
export interface DisadvantageParts {
  /** 回合勝場（或隊伍生命）差距，0 = 沒落後、1 = 落後到底。 */
  readonly roundGap: number;
  /** 已完成裝備價值差距。 */
  readonly itemValueGap: number;
  /** 最近三回合勝負差距。 */
  readonly recentForm: number;
}

export interface DisadvantageWeightsLike {
  readonly roundGapPct: number;
  readonly itemValueGapPct: number;
  readonly recentFormPct: number;
}

/** 三項加權合成 D ∈ [0,1]。權重總和不是 100 時**按總和正規化**，⛔ 不夾也不靜默。 */
export function disadvantageScore(
  parts: DisadvantageParts,
  w: DisadvantageWeightsLike,
): number {
  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const total = w.roundGapPct + w.itemValueGapPct + w.recentFormPct;
  if (total <= 0) return 0; // 三格都調成 0 = operator 明確關掉劣勢加權
  const sum =
    clamp01(parts.roundGap) * w.roundGapPct +
    clamp01(parts.itemValueGap) * w.itemValueGapPct +
    clamp01(parts.recentForm) * w.recentFormPct;
  return clamp01(sum / total);
}

/**
 * 這一階對劣勢值 `d` 的中獎百分比，夾在 [0,100]。⛔ 不用 `**`（sim 純度禁它）。
 *
 * 兩條曲線，看 {@link WeaponTierRule.guaranteeAtD} 有沒有設：
 *   · 有 —— `basePct + (100−basePct) × min(1, d/guaranteeAtD)^exponent`（保底）
 *   · 沒有 —— `basePct × (1 + factor × d^exponent)`（倍率）
 *
 * ⭐ 兩條都**對 d 單調遞增**，而那是這支函式唯一不可以壞的性質：劣勢方拿到的
 * 機率必須 ≥ 領先方。⚠️ 單調的是**這一階**，整條流程的單調性還要靠
 * {@link pickWeaponTable} 的「不可降級」—— 2026-08-18 的缺陷正是那一半破了。
 */
export function tierChancePct(t: WeaponTierRule, d: number): number {
  const x = d < 0 ? 0 : d > 1 ? 1 : d;
  // 指數只有 1..4 且是整數語意，逐次相乘即可 —— `**` 被 sim/purity.test.ts 禁掉。
  const n = Math.max(1, Math.round(t.underdogExponent));
  const g = t.guaranteeAtD;
  if (g !== undefined && g > 0) {
    const r = x >= g ? 1 : x / g;
    let curved = 1;
    for (let i = 0; i < n; i++) curved *= r;
    const pct = t.basePct + (100 - t.basePct) * curved;
    return pct < 0 ? 0 : pct > 100 ? 100 : pct;
  }
  let curved = 1;
  for (let i = 0; i < n; i++) curved *= x;
  const pct = t.basePct * (1 + t.underdogFactor * curved);
  return pct < 0 ? 0 : pct > 100 ? 100 : pct;
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
 * @param d          劣勢值 ∈ [0,1]（{@link disadvantageScore} 算出來的）
 * @param baseTable  這一回合原本排的獎池
 * @param rng        `world.rng`
 * @param hasEligible 探針：這張池對這位玩家有沒有**至少一件**抽得到的東西
 */
export function pickWeaponTable(
  tiers: readonly WeaponTierRule[],
  round: number,
  d: number,
  baseTable: string,
  rng: TierRng,
  hasEligible: (table: string) => boolean,
  /** 這一階對這位玩家還開不開（數量限制已經滿了就回 false）。省略 = 都開。 */
  underLimit: (tier: WeaponTierRule) => boolean = () => true,
): WeaponTierPick {
  // ⭐ **抽獎只能往上升級，⛔ 不能降級。**
  //
  // 這一回合原本排的池如果**本身就是某一階**（出貨：最終回合排 `ex-release-weapons`），
  // 那一階與它以下的每一階都不參加 —— 中了只會把玩家從那張池換到**同級或更差**的池。
  //
  // ⛔ 2026-08-18 量到的缺陷就是缺這一行，而且它把整個劣勢加權**倒過來**：
  // 當時最終回合的基礎池是 `ex-origin-weapons`（根源），而 `ex-release` 沒有回合上界，
  // 於是「ex-release 中了」＝ 把根源降級成解放。劣勢方的 ex-release 機率更高（37.5%
  // vs 15%），所以**劣勢方被降級得更頻繁** ⇒ 拿到根源 77.5%，領先方反而 86.2%。
  // 每一階自己都是單調遞增的，整體卻反過來 —— 這種缺陷分開檢查每一階永遠看不到。
  const baseRank = tiers.findIndex((t) => t.table === baseTable);
  let hit: WeaponTierRule | null = null;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    // ⚠️ 骰子**先擲**再判斷回合閘：這樣一位玩家消耗的亂數個數只跟階級**張數**有關，
    // ⛔ 不跟回合數有關 —— 否則同一顆種子在第 8 與第 9 回合會走岔。
    // ⚠️ 下面每一個 `continue` 都在這一行**之後**，包括不可降級那一條：任何提早
    // 跳過都會少擲一顆骰子，同一顆種子就走不出同一條流。
    const roll = rng.next() * 100;
    if (hit !== null) continue; // 已經中了，但仍然要把後面幾階的骰子擲掉
    if (baseRank >= 0 && i >= baseRank) continue; // 不可降級（含同級）
    if (round < t.minRound) continue;
    if (t.maxRound !== undefined && round > t.maxRound) continue;
    if (!underLimit(t)) continue;
    if (roll < tierChancePct(t, d) && hasEligible(t.table)) hit = t;
  }
  if (hit === null) return { table: baseTable, offerTier: WEAPON_TIER_PREFIX, rule: null };
  return { table: hit.table, offerTier: `${WEAPON_TIER_PREFIX}:${hit.id}`, rule: hit };
}
