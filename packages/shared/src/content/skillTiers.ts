/**
 * 技能級距的**單一梯子**（GH#414）—— 四軸共用一組級距名與一條推導規則。
 *
 * owner 2026-08-19：
 * > 「總之請你將**技能相關設定正規化成五級距**
 * >  並且將相關**文件 JSON 編輯器 後台設定 都統一**」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼這是一個檔案，而不是四張各自維護的表（第零守則⑨）
 *
 * 2026-08-19 之前這個 repo 有**兩套**級距詞彙在跑：
 *
 *     AoE          小 / 中 / 大 / 超大      （`aoeTiers.ts`）
 *     位移          小 / 中 / 大 / 極大      （`displacementTiers.ts`）
 *                            ↑ 同一格叫不同名字
 *
 * `displacementTiers.ts` 的檔頭自己記著這件事（「⚠️ 用 owner 的『極大』，
 * ⛔ 不是 AoE 那份的『超大』—— 兩套詞彙的合併走 issue」）。一份**知道自己不一致
 * 卻靠散文守著**的契約就是 CLAUDE.md 第三守則的形狀：它不會紅，只會讓下一個人
 * 在編輯器上看到兩個下拉選單、同一個位置寫著不同的字。
 *
 * ⇒ 級距名只有**這裡**一份。四軸都從 {@link SKILL_TIER_NAMES} 取，
 *   ⛔ 沒有任何一個軸可以自己再宣告一組。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 梯級是**推導**出來的，⛔ 不是挑的
 *
 * 錨是 owner 自己給 AoE 的那一句（`aoe-tiers.json` 的 note）：
 *
 *     「決鬥區半徑 24：大 = 1/4、超大 = 1/3」
 *
 * 把它讀成**分母**：大 = R/4、超大 = R/3。往兩邊延伸成一條分母數列，
 * 得到六根橫木（R = 決鬥區半徑）：
 *
 *     | 分數  | 分母  | R=24  |
 *     |------|------|-------|
 *     | 1/12 | 12   |  2    |
 *     | 1/8  |  8   |  3    |
 *     | 3/16 |  5⅓  |  4.5  |
 *     | 1/4  |  4   |  6    |   ← owner 指定
 *     | 1/3  |  3   |  8    |   ← owner 指定
 *     | 1/2  |  2   | 12    |
 *
 * ⭐ **這條梯子逐位元重現了出貨的全部 12 個數字**，一個都沒有動到：
 *
 *     AoE     3 / 4.5 / 6 / 8            = 橫木 [1..4]
 *     擊退     2 / 3 / 4.5 / 6            = 橫木 [0..3]
 *     衝刺     5.5 / 8.25 / 11 / 14.67    = 橫木 [1..4] × 11/6
 *
 * 也就是說：出貨的三張表**本來就是同一條梯子的三個視窗**，只是沒有人把它寫下來。
 * 這個檔案是把那件既成事實變成程式，⛔ 不是一次新的平衡設計。
 *
 * ⇒ **五級 = 每個視窗往上再取一根橫木。既有的四個數字一格不動。**
 *   那是這個做法唯一重要的性質：110 支填了 `radiusTier` 的技能，
 *   一支都不會因為「從四級變五級」而改變手感。
 *
 * ⚠️ 比值刻意不是等比也不是等差：1.5 / 1.333 / 1.333 / 1.5（對稱）。
 *   等比會把 owner 指定的 R/4 與 R/3 之中至少一個擠掉，而那兩格是**規格**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ R = 24 是**參考值**，不是真理
 *
 * 真正的決鬥區半徑住在 `content/arenas/*.json` 的 `zones[].boundaryRadius`。
 * 這裡的 24 只用來算**出貨預設值**（`DEFAULT_*` 需要一個編譯期常數）。
 * 兩者要一致，`skillTierLadder.test.ts` 從 `Arenas` 推導再比對 —— 有人把決鬥區
 * 改小的那天，那條守衛會紅並指名新的半徑，⛔ 不必手改這個數字之外的任何東西。
 */

/** 出貨決鬥區半徑。⚠️ 只用來算 `DEFAULT_*`；真值從 `Arenas` 推導，守衛在對帳。 */
export const DUEL_ZONE_RADIUS_REF = 24;

/**
 * 五個級距名，**全專案唯一一份**。⛔ 順序就是由小到大 —— 後台下拉、編輯器選單、
 * 產生的文件、Zod enum 全部共用這個陣列，所以順序本身是契約。
 *
 * ⭐ 這五個字是 **owner 指定的**，⛔ 不是推導出來的：
 * > owner 2026-08-19：「明明就是 **極小 小 中 大 極大** 五級距怎麼又變成六了，
 * >  **沒有超大這種東西**哪裡來的？」
 * 他給冷卻級距時也是同一組：「一樣是**極小小中大極大**」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 2026-08-19 早上這裡曾經是 `["小","中","大","超大","極大"]`，而那是**挑錯了版本**
 *
 * ⚠️ 「超大」**不是憑空發明的** —— owner 2026-08-11 給 AoE 級距時親口說過它，
 * 當時是**四級**：
 * > 「小(大約5人範圍) / 中(大約10人範圍) / 大(1/4競技場) / **超大**(1/3競技場:500以上)」
 *
 * 而 owner 在 **2026-08-19 同一天**給冷卻級距時，用的是**另一組五個字**：
 * > 「冷卻的階段只會分幾種 一樣是**極小小中大極大**」
 *
 * ⇒ 那一天有**兩份 owner 規格並存**，而我合併時挑了**舊的那一份**。
 * 照第〇·六守則，第 1 層裡**新的贏**（同一天的兩份也一樣）——
 * 所以錯的不是「造了一個字」，是**沒有發現同一天已經有更新的詞彙**，
 * 而我把它當成「兩套內部詞彙要調和」的技術問題來解（GH#463）。
 *
 * ⚠️ **改回來的那一次遷移，是這個檔案最危險的一次操作**，理由值得留著：
 * 「小」在改名前後**都是合法值**，只是從第 1 格變成第 2 格。所以只改這一行、
 * 不同時重寫內容的話，**253 筆 `*Tier` 會被靜默重新解讀成大一級** ——
 * 而 Zod 過、`content:build` 過、全套測試綠，因為每一個零件都是對的。
 * ⇒ 遷移是**同一個 commit 裡的兩件事**：改這一行 ＋ 機械重寫 505 筆內容。
 *
 * ⭐ 而且那次遷移**一個數值都沒有動**：五格取的仍然是 {@link LADDER_FRACTIONS}
 * 的第 1–5 根橫木（3 / 4.5 / 6 / 8 / 12），只有名字整體左移一格。
 * 第 0 根橫木（R/12 = 2）仍然空著 —— owner 規格明寫「施法距離2」的那幾支
 * 落在那裡，要不要讓「極小」改指它是**下一個**決定（GH#463），⛔ 不是這一次。
 *
 * 守衛：`skillTierNames.test.ts`（比對這一行與 owner 的原話，並確認 `content/`
 * 裡不存在任何不在名單上的級距詞）。
 */
export const SKILL_TIER_NAMES = ["極小", "小", "中", "大", "極大"] as const;
export type SkillTierName = (typeof SKILL_TIER_NAMES)[number];

/**
 * 梯子的六根橫木，寫成**決鬥區半徑的分數**。
 * ⛔ 不要在這裡寫 `3` / `4.5` —— 那會把推導關係換成一組看不出來源的數字，
 * 而下一個調整決鬥區大小的人就再也對不回來。
 */
export const LADDER_FRACTIONS = [1 / 12, 1 / 8, 3 / 16, 1 / 4, 1 / 3, 1 / 2] as const;

/** 兩位小數 —— 內容存長度的精度（與 `templates/expand.ts` 的 `round2` 同一格）。 */
const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * 從梯子取一個**五格視窗**。
 *
 * @param zoneRadius 決鬥區半徑（錨）
 * @param from       起始橫木索引（0 = 最小的 R/12）
 * @param scale      整條視窗的縮放。衝刺梯用 11/6，其餘用 1
 *
 * ⚠️ `from` 只有 0 與 1 是有意義的（六根橫木取五格），越界會拿不到五格 ——
 * 呼叫端全部是本檔的三個常數，所以這裡不做防禦性夾取：夾了反而會讓
 * 一個打錯的索引安靜地產出一張看起來正常的表。
 */
export function ladderWindow(
  zoneRadius: number,
  from: 0 | 1,
  scale = 1,
): Readonly<Record<SkillTierName, number>> {
  const out = {} as Record<SkillTierName, number>;
  SKILL_TIER_NAMES.forEach((name, i) => {
    out[name] = round2(zoneRadius * LADDER_FRACTIONS[from + i]! * scale);
  });
  return Object.freeze(out);
}

/**
 * 衝刺梯相對 AoE 梯的縮放，**逐位元從出貨值反推**：
 * 5.5/3 = 8.25/4.5 = 11/6 = 14.67/8 = 1.8333… = 11/6。
 * ⛔ 不是「挑一個順眼的倍數」—— 出貨的四個衝刺距離全部由它重現。
 */
export const TRAVEL_SCALE = 11 / 6;

/** 收值規則。⭐ 這是**決策點**，所以它是一格後台欄位而不是一個寫死的選擇。 */
export const SNAP_POLICIES = ["nearest", "down", "up"] as const;
export type SnapPolicy = (typeof SNAP_POLICIES)[number];

/**
 * 把一個自由數字收進級距，回傳級距名。
 *
 * ⚠️ 三種政策的差別是**方向**，不是精度：
 *   · `nearest` 最忠實 —— 離哪一格近就是哪一格（出貨預設）
 *   · `down`    一律往小收 —— owner 抱怨「普遍超遠／超大」時要的就是這個
 *   · `up`      一律往大收
 *
 * ⛔ 這支函式**不**知道那個數字是半徑還是距離；級距表由呼叫端給。
 */
export function snapToTier(
  value: number,
  table: Readonly<Record<SkillTierName, number>>,
  policy: SnapPolicy = "nearest",
): SkillTierName {
  const rungs = SKILL_TIER_NAMES.map((n) => [n, table[n]] as const);
  if (policy === "down") {
    for (let i = rungs.length - 1; i >= 0; i--) if (rungs[i]![1] <= value) return rungs[i]![0];
    return rungs[0]![0];
  }
  if (policy === "up") {
    for (const [name, v] of rungs) if (v >= value) return name;
    return rungs[rungs.length - 1]![0];
  }
  let best = rungs[0]!;
  for (const r of rungs) if (Math.abs(r[1] - value) < Math.abs(best[1] - value)) best = r;
  return best[0];
}

/**
 * 一個值離它被收進去的那一級有多遠，**相對級距值**。
 * 產生器用它挑出「離任何一級都遠」的那些拿給 owner ——
 * ⛔ 不要自己四捨五入掉再假裝它一直都是那一級（第〇·六守則）。
 */
export function snapGap(
  value: number,
  table: Readonly<Record<SkillTierName, number>>,
  policy: SnapPolicy = "nearest",
): number {
  const t = table[snapToTier(value, table, policy)];
  return t === 0 ? 0 : Math.abs(value - t) / t;
}
