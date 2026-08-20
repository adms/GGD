/**
 * 屬性上限 (stat caps) — 一般上限 vs **解鎖**上限 (GH#286).
 *
 * owner, 2026-07-28:「一般上限是 4.0,搭配特殊條件如技能、道具...等效果,
 * 可以解鎖最多到 10.0。這兩個參數也可以放到後台設定,也可以是技能模板的其中
 * 一項技能效果」.
 *
 * ---------------------------------------------------------------------------
 * 兩個數字,不是一個
 * ---------------------------------------------------------------------------
 * `base`      —— 沒有任何解鎖來源時,這條屬性被夾在哪裡。攻速 4.0。
 * `unlocked`  —— 解鎖來源**最多**能把它抬到哪裡。攻速 10.0,而且是**硬上限**:
 *                一個寫 `CapRaise 999` 的技能只能抬到 10.0。
 *
 * 解鎖的載體是 `ModOp.CapRaise`(sim/stats/modifiers.ts)。它的 `value` 是
 * 「把上限抬到多少」,**不是加成、不是倍率** —— 所以多個來源取 **max**,兩個
 * 5.0 / 7.0 的來源給的是 7.0 而不是 12.0。疊加語意會讓「三個小 buff 意外把
 * 天花板頂穿」變成常態,而 owner 要的是一個可以講清楚的天花板。
 *
 * 為什麼不需要新的 effect kind:`applyBuff` 早就帶著 `modifiers: StatModifier[]`
 * (content/schema/effect.ts),而 `zModOp = z.nativeEnum(ModOp)` 是整份 enum ——
 * 所以技能、道具、三選一、靈氣在 enum 多一個成員的那一刻**全部立刻能用**,
 * content schema 一行都不用改。這就是 owner 說的「也可以是技能模板的其中一項
 * 技能效果」。
 *
 * ---------------------------------------------------------------------------
 * 一層還是兩層,是逐條屬性的決定
 * ---------------------------------------------------------------------------
 * `base < unlocked` 才叫兩層,而兩層唯一的用途是餵 `ModOp.CapRaise`。全出貨內容
 * 只有兩件道具帶 `CapRaise`(夢幻嗜血劍 godie-i00l、endless-edge),而且兩件都
 * 只碰攻速。所以 2026-08-01 加進來的**法強**是 `base === unlocked` 的單層 ——
 * 見 `AP_CAP_OPEN`。單層不是「還沒做完的兩層」:它就是「這條屬性沒有解鎖語意」,
 * 而且後台把 `unlocked` 拉高就變成兩層,一行程式都不用改。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 缺文件 = 出貨預設,不是空表
 * ---------------------------------------------------------------------------
 * `statCapsFromDoc` 對「沒有文件 / 壞文件」回傳 `DEFAULT_STAT_CAPS`。回空表的話
 * `capFor` 會退回 `STAT_CLAMPS` 的上界,於是 `unlocked === base`,**解鎖功能整個
 * 靜默消失**:技能照放、buff 照掛、面板照顯示,攻速就是永遠上不去 4.0。沒有任何
 * 錯誤訊息會提到這件事。這是這個檔案最容易犯的錯,所以它有自己的守衛。
 */
import { STAT_CLAMPS, Stat } from "./stats/statTypes";

/**
 * ⛔ **這不是一個平衡錨點** —— 它是下面 7 條硬上限被算出來時用的那個等級。
 *
 * owner 2026-08-20（逐字，對 #447 的更正）：
 * > 「我的錨點有講過是 **LV 30/50/99 三個**，至少要滿足 **30(hard limit)**，
 * >  能 **50 比較好(soft limit)**, **99 是極限**」
 *
 * ⇒ 錨點住在 `content/balanceAnchors.ts` 的 `BALANCE_ANCHOR_LEVELS`，而這一格是
 * **18** —— 2026-08-12 那一批 `中位數 × 200` 是在 L18 量的，⛔ 還沒有被重算。
 *
 * ⭐ 它為什麼要存在：在此之前「18」只活在**一段註解**和**一條守衛的呼叫參數**裡
 *（`statCapsAreFences.test.ts` 的 `championStatBase(d, stat, 18)`）—— 也就是說
 * 一條**綠燈的守衛正在替一個過期的錨點背書**，而沒有任何東西看得到它。
 * 具名之後 `content/balanceAnchors.test.ts` 那道閘才問得到它。
 *
 * ⚠️ ⛔ **改這一格不會重算任何上限** —— 那 7 個數字是烘死的字面值。
 * 重算是一個**平衡決定**（會動到出貨數值），⛔ 不由程式順手做，要 owner 點頭。
 */
export const STAT_CAP_ANCHOR_LEVEL = 18;

/** 一條屬性的兩個天花板。`unlocked >= base` 由建構端保證。 */
export interface StatCap {
  /** 沒有解鎖來源時的上限 */
  base: number;
  /** 解鎖來源最多能抬到的上限(硬上限) */
  unlocked: number;
}

/** stat-keyed cap table. 缺鍵 = 沒有解鎖能力(見 `capFor`)。 */
export type StatCapTable = Readonly<Partial<Record<Stat, StatCap>>>;

/**
 * 法術強度的出貨天花板 —— **刻意開到頂,今天不夾任何人**。
 *
 * owner 2026-08-01,對「惡夢魔王碎片 + 死之王套裝 = AP ×3.0」的裁決:
 *   「加一個 ap 上限就是同一個檔多一列 + 後台一個欄位,存檔生效」
 *   「AP ×3.0 … => 運氣那麼好剛好抽到就算了」
 * 兩句話合起來的意思是**把旋鈕做出來,但出貨轉到底**:owner 要的是「以後想夾
 * 的時候不用改程式」,不是「現在就夾」。所以這一列存在的價值全部在**可調**,
 * 而它的值必須大到不會碰到任何人。
 *
 * 100000 是怎麼來的(量出來的,不是拍的)—— `statCapsApOpen.test.ts` 在真的
 * `SimWorld` 裡把出貨內容能組出來最強的 AP 組合跑出來:等級 99、三圍 +40、
 * 六格塞滿 AP 道具(傲慢水龍王 +300% / 惡夢魔王碎片 +100% / 雅典娜的驚嘆號
 * +33% / 天地崩裂魔杖 +10% …)= **4,125.7**。100000 是它的 **24 倍**,而那條
 * 守衛把「至少 10 倍餘裕」釘住 —— 內容膨脹到快要碰到天花板時,測試會在玩家
 * 被夾到**之前**先紅。
 *
 * ⚠️ `base === unlocked` 是**單層**,而且是刻意的,不是抄攻速那一對。攻速的兩層
 * 是為了 `ModOp.CapRaise`(夢幻嗜血劍 godie-i00l 的「攻速上限提升到10」、
 * endless-edge)—— 全樹只有這兩件道具用得到,而且**沒有任何一件碰 ap**。
 * 一個 `base` 就已經開到頂的屬性,再給它一個更高的 `unlocked` 是純粹的死設定:
 * 沒有東西打得到 base,更不可能需要解鎖。要把 AP 的解鎖語意打開,後台把
 * `unlocked` 調到比 `base` 高就成立,一行程式都不用改(見 `effectiveCap`)。
 */
export const AP_CAP_OPEN = 500000;
// ⚠️ 2026-08-13：100,000 → 500,000。owner 把 `intToAbilityPower` 從 1 調到 4
//   （理由：「技能傷害跟普通攻擊傷害落差實在太大了」），量到最強 AP 組合因此從
//   4,125.7 漲到 **16,545.5** —— 舊天花板只剩 6.0 倍餘裕，而守衛要求至少 10 倍。
//   ⭐ 守衛的訊息自己寫著「要嘛抬高 AP_CAP_OPEN，要嘛這就是 owner 想開始夾了」。
//   owner 2026-08-01 的裁決是「先不要夾」，所以抬高（30 倍餘裕）。

/**
 * 出貨預設。
 *
 * · 攻速 4.0 / 10.0 —— owner 2026-07-28 點名的那一對,`unlocked` 真的會被
 *   `ModOp.CapRaise` 用到。
 * · 法強 100000 / 100000 —— owner 2026-08-01「所以要有這個欄位,但先不要夾」。
 *   見 `AP_CAP_OPEN`。
 * · 吸血 0.8 / 1.0 —— owner 2026-08-03 的暴走定稿要求「吸血 **100%**」,而
 *   `STAT_CLAMPS[Stat.Lifesteal]` 的上界是 0.8。沒有這一列的話 `capFor` 會退回
 *   那個 0.8 而且 `base === unlocked`,於是 `flat 1.0` 被**靜默**夾成 0.8 ——
 *   面板寫 100%、實際回 80%,而且沒有任何一行訊息會提到它。第二層(1.0)只有
 *   帶著 `ModOp.CapRaise` 的來源(59-00 / 59-001 暴走)拿得到,所以對其他
 *   115 張卡與每一件吸血裝逐位元不變:一般上限仍然是 0.8。
 *
 * 其餘屬性仍然**故意沒有列**:替它們憑空發明一個 `unlocked` 等於默默放寬平衡。
 * 要新增就在後台(或這裡)明確加一列。
 *
 * ⚠️ 這張表必須和 `content/config/stat-caps.json` **逐格相同** ——
 * `sim/economy/capUnlockContent.test.ts` 的「文件與程式預設一致」在守它。
 * 兩邊不一致 = 後台顯示的預設、和沒有文件時實際生效的,是兩個不同的數字。
 */
export const DEFAULT_STAT_CAPS: StatCapTable = Object.freeze({
  [Stat.AttackSpeed]: Object.freeze({ base: 4.0, unlocked: 10.0 }),
  // 🔴 **AP 是 200× 通則唯一撞牆的地方，所以它留在「開到頂」。**
  //
  //   owner 2026-08-12 定「硬上限 = 母體中位數 × 200」。AP 的 L18 卡面中位是
  //   **47.2**，× 200 = **9,440**。看起來很寬 —— 但 `statCapsApOpen.test.ts`
  //   在真的 SimWorld 裡量到的**最強 AP 組合是 8,937.8**（等級 99、三圍 +40、
  //   六格塞滿 ×% AP 道具）。9,440 只高出它 **5.6%**。
  //
  //   ⇒ 套上去等於「**從現在開始夾**」，而且下一件 AP 道具就會把玩家推過去。
  //     那是一個平衡決定，不是一條保險絲，所以 ⛔ 我不替 owner 做。
  //
  //   ⭐ 順帶一提：8,937.8 / 47.2 = **189×** —— owner 的 200× 幾乎正好落在
  //     「現有最強組合」上。那個倍率不是憑感覺挑的，它量得出來。
  //
  //   要夾就把這一格改成 9440（後台一個欄位，存檔生效）。
  [Stat.AbilityPower]: Object.freeze({ base: AP_CAP_OPEN, unlocked: AP_CAP_OPEN }),
  // ⭐ 2026-08-12 owner：「**吸血可以超過 100%**，上限為 **20x**，傷害 100 回復 2000」
  //   → `unlocked` 從 1.0 提到 **20**。`base` 留 0.8（沒有解鎖來源時的一般上限，
  //   owner 2026-07-28 立的），所以每一件吸血裝與其餘 118 張卡逐位元不變 ——
  //   只有帶 `ModOp.CapRaise` 的來源（59-00 / 59-001 暴走）碰得到上面那一段。
  //   ⚠️ `STAT_CAP_MAX[Lifesteal]` 也要跟著抬，否則 20 會被 Zod 的保險絲擋在後台外面。
  [Stat.Lifesteal]: Object.freeze({ base: 0.8, unlocked: 20 }),
  // 2026-08-10 —— owner 要仙后座「CD 時間再減少 50%」。base 就是那個最大單件值;
  // unlocked 0.8 留給未來的 CapRaise。⚠️ 這一列與 content/config/stat-caps.json
  // 必須同時存在,capUnlockContent.test.ts 比對的就是兩者相等。
  [Stat.CooldownReduction]: Object.freeze({ base: 0.99, unlocked: 0.99 }),

  // ---- 2026-08-12 · 硬上限 = **中位數 × 200**（owner 直接給的倍率）---------------
  //
  // owner：「至於**硬上限 場中最終值（卡片 × 道具 × buff × 增幅）的天花板則是 200x**」
  //
  // ⭐ 所以這一批不再是我挑的整數，而是一條**算式**：
  //      base = unlocked = round(該屬性在 `STAT_CAP_ANCHOR_LEVEL`（**18**）的母體中位數 × 200)
  //    ⛔ 那個 18 **不是** owner 的錨點（LV 30/50/99，`content/balanceAnchors.ts`）——
  //    見 `STAT_CAP_ANCHOR_LEVEL` 的檔頭。要重算的是 `MEDIAN_X200_CAPPED_STATS` 那 7 條。
  //    中位數量自 73 位可達英雄（`docs/hero-archetypes.json`，`championStatBase`）。
  //
  // ⚠️ 為什麼是「場中最終值」而不是卡面：卡面 × 道具 × buff × 增幅 疊起來差很多級。
  //    實測最強 AP 組合是 **4,125.7**（`statCapsApOpen.test.ts` 在真的 SimWorld 裡跑），
  //    而 AP 的卡面 L18 中位只有 47.2 —— **88 倍**。這就是為什麼卡面規範（1.6~20×）
  //    與這一格（200×）是**兩把不同的尺**，見 `tools/hero-archetypes/build.ts`。
  //
  // ⚠️ 單層（base === unlocked）是刻意的：owner 只給了**一個**數字。多加一層
  //    `unlocked` 等於替他發明第二個決定。要開解鎖語意，後台把 unlocked 調高就成立
  //    （見 `effectiveCap`），一行程式都不用改。
  //
  // 🔴 只有一位英雄被這條規則夾到：**莉娜因巴斯的每秒回魔 1,014.5**，
  //    而母體中位是 4.63 —— **219 倍**，遠在 200× 之外。夾到 926 之後仍然等於無限魔力
  //    （中位的 200 倍），所以實質沒有變化；但那張卡本身值得看一眼。
  //
  // ⛔ 不碰 as / cdr / critChance / evasion —— 前兩者 owner 已經裁決過，
  //    後兩者的 1.0 是**語意邊界**（每刀必暴 / 打不到），200× 對它們沒有意義。
  [Stat.MaxHealth]: Object.freeze({ base: 375960, unlocked: 375960 }),
  [Stat.MaxMana]: Object.freeze({ base: 232150, unlocked: 232150 }),
  [Stat.HealthRegen]: Object.freeze({ base: 744, unlocked: 744 }),
  [Stat.ManaRegen]: Object.freeze({ base: 926, unlocked: 926 }),
  [Stat.AttackDamage]: Object.freeze({ base: 21200, unlocked: 21200 }),
  [Stat.Armor]: Object.freeze({ base: 5078, unlocked: 5078 }),
  [Stat.MagicResist]: Object.freeze({ base: 15344, unlocked: 15344 }),
  // owner 2026-08-12：「這個其實我已經有給過**上限是黑人牙膏 12** 了，
  //                      但**可以延伸到 16**」
  // 🔴 12 是**卡面**上限，16 是**最終值**上限，中間差的是體型：`finalizeStat` 對射程
  //    （也只有射程）多乘一道 `rangeScale`，`config.body-scale@1` 的曲線最高 **1.30×**。
  //    所以卡面 12 的大體型英雄最終是 **15.6** —— 用 12 當上限會夾掉 23% 而看不出來。
  //    ⛔ 射程不套 200×：它是**空間**不是強度，24 格就已經是整個決鬥區的半徑。
  [Stat.AttackRange]: Object.freeze({ base: 16, unlocked: 16 }),
  // 🔴 owner 2026-08-15 移速重新設計，同一天改了兩次：
  //
  //   第一版「極小5/小7/中10/大14/極大18，一般上限24，解鎖上限30」——
  //   踩過了上一版自己量出來的穿牆警戒線：30Hz tick × 0.6(身體半徑) = 18.0 是
  //   離散碰撞（`relax()` = move-then-resolve，⛔ 沒有掃描式碰撞，見
  //   `collision/resolve.ts`）的穿牆平手線，「18.0 本身就會穿，走路更是 100%
  //   必穿」；而那組的解鎖上限 30（每 tick 1.0u = 半徑 167%）遠在線外。
  //
  //   第二版（現在出貨的這組）「極小=缺陷/小=偏低/中=標準/大=優勢/極大=特化 ——
  //   極小5/小6/中8/大10/極大12，上限18」→ base 18、unlocked 18（owner 只給了
  //   一個「上限」，讀成單一硬上限，不再有解鎖空間）。
  //   ⭐ 這一版退回線內：極大 12 = 每 tick 0.4u = 半徑 67%，**跟穿牆事故發生前
  //   那版刻意選的安全解鎖值 12 一樣**；上限 18 = 每 tick 0.6u = 半徑 100%，
  //   貼著平手線本身但不超過。
  //   ⚠️ 新地圖的牆是整格厚（GH#324，2 世界單位），比舊註解假設的 0.4 深牆段厚
  //   很多，穿牆的實際機率因此比量測時低 —— 但沒有重新量過，這是「風險降低」
  //   不是「風險消失」，貼著線走仍然值得留意。
  //
  //   ⭐ **2026-08-18 第三版：`unlocked` 18 → 24，而且那個「風險消失」是有條件的。**
  //   owner 對 #60 立體機動裝置的裁決：「**改成飛行型態 並且移動速度上限就好**」。
  //   ⚠️ 這不是把上面那條平手線推翻掉 —— 它整條**不適用於飛行者**：
  //   `sim/flight.ts` 的飛行讓 `MovementSystem` 跳過**全部三處**推擠
  //   （`moveWithCollision` 撞牆、soft separation、`pushOutOfObstacle`），
  //   所以「會不會穿牆」對一個飛行單位**不是一個問題** —— 它本來就被允許穿過去。
  //   ⛔ 但 `unlocked` 是**全域**的：任何帶 `ms` capRaise 的來源都吃得到 24，
  //   包含**不會飛的**。那正是平手線會回來的那條路。
  //   ⇒ 所以這個耦合被寫成一道**閘**而不是一句提醒：
  //   `content/noOpModifierClaims.test.ts` 的「抬移速上限的文件必須同時給飛行」。
  //   ⚠️ 24 = 每 tick 0.8u = 身體半徑 133%，**確實在線外** —— 它安全的唯一理由
  //   就是持有者在飛。那道閘紅掉的時候，⛔ 不要改閘，去給那份文件飛行或改回 18。
  [Stat.MoveSpeed]: Object.freeze({ base: 18, unlocked: 24 }),
});

/**
 * ⭐ **這 7 條是 `STAT_CAP_ANCHOR_LEVEL` 的中位數 × 200 烘出來的**，其餘 6 條不是
 *（as / ap / lifesteal / cdr 是 owner 直接給的數字；attackRange 是「卡面 12 延伸到
 * 16」；moveSpeed 是穿牆平手線）。
 *
 * ⛔ 這張清單存在的理由不是好看，是**回答「重算要動哪幾格」** ——
 * 錨點從 18 換成 30/50/99 的那一天，要重算的正好是這 7 格，⛔ 不是整張表。
 * 沒有它的話，那個範圍只寫在一段散文裡，而散文不會紅。
 *
 * ⚠️ 兩件事由 `content/balanceAnchors.test.ts` 守著：
 * ① 每一條都真的在 `DEFAULT_STAT_CAPS` 裡且 `base === unlocked`（單層＝只有一個
 *    數字，那正是「owner 只給了一個倍率」的形狀）；
 * ② 反向 —— 名單以外的那幾條**不可以**混進來（混進來就是「它其實也錨在 18」，
 *    而重算時會被漏掉）。
 */
export const MEDIAN_X200_CAPPED_STATS: readonly Stat[] = Object.freeze([
  Stat.MaxHealth,
  Stat.MaxMana,
  Stat.HealthRegen,
  Stat.ManaRegen,
  Stat.AttackDamage,
  Stat.Armor,
  Stat.MagicResist,
]);

// ------------------------------------------------------------- bounds ------
/**
 * 一格天花板的合法區間 —— **兩端都要有**。
 *
 * 這一段是補一個 CLAUDE.md 2026-07-29 點名過的缺陷:`zConfigStatCapsDoc` 之前
 * 只寫 `z.number().finite()`,也就是**上下界都沒有**,後台頁也只檢查
 * 「unlocked ≥ base」。50 打成 500 會過表單、寫進耐久覆蓋層,然後在下游變成
 * 一條沒有人講得出來的規則。
 *
 * ⚠️ 下界為什麼是 `STAT_CLAMPS` 的**下**界而不是 0。`finalizeStat` 算的是
 * `Math.max(lo, Math.min(hi, out))`,`lo` 永遠來自 `STAT_CLAMPS`。所以一個比
 * 地板還低的天花板不是「更嚴格的上限」,而是**地板無條件獲勝** —— 攻速 base
 * 填 0.1 的結果是每個人的攻速都變成 0.2(地板),那一格從此完全沒有作用,而且
 * 畫面上看不出來。沒有 `STAT_CLAMPS` 的屬性(法強、生命上限…)下界是 0。
 *
 * ⚠️ 上界是**防打錯的保險絲,不是平衡政策** —— 和 `content/schema/common.ts`
 * 的 `ITEM_MODIFIER_LIMITS` 同一個定位。每一條都遠高於出貨內容打得到的值,所以
 * 它擋不到任何一個真實的調整,只擋多打一個零。三條「比例」屬性的 1.0 是**語意
 * 的邊界**而不是餘裕:暴擊率 1.0 = 每一刀都暴擊、冷卻縮減 1.0 = 零冷卻、
 * 迴避 1.0 = 打不到,再高沒有第二種意思。
 *
 * 刻意是 EXHAUSTIVE 的 `Record<Stat, number>`(同 `baseBonus.ts` 的
 * `BASE_BONUS_MAX`):新增一條屬性會在這裡變成型別錯誤,而不是悄悄拿到 0
 * (= 那一列永遠填不進去)或 Infinity(= 又變回沒有上界)。
 */
export const STAT_CAP_MAX: Readonly<Record<Stat, number>> = Object.freeze({
  // ⭐ G2（GH#354）—— 輸出倍率三兄弟。語意是**加成**（0 = ×1）。
  [Stat.OutputDamagePct]: 20,
  [Stat.OutputHealingPct]: 20,
  [Stat.OutputShieldPct]: 20,
  // ⭐ G12 / G13 —— 兩條都是**比例**，1 就是語意上的滿格（單發只吃 100% 血 = 沒上限、
  // 完全無法被迴避）。留 20 是給操作者調空間用的，⛔ 不是說 20 有意義。
  [Stat.MaxHitPctMaxHp]: 20,
  [Stat.UnavoidablePct]: 20,
  [Stat.CooldownDrainRate]: 20,
  // 量出來的:全 115 張卡最強的 baseStats.maxHealth 是 4977,乘 maxHealth 9.0
  // 的環境倍率大約 45k。100 萬留了 20 倍以上。
  [Stat.MaxHealth]: 1_000_000,
  [Stat.MaxMana]: 1_000_000,
  [Stat.HealthRegen]: 10_000,
  [Stat.ManaRegen]: 10_000,
  [Stat.AttackDamage]: 100_000,
  // 出貨值就坐在這個天花板上 —— 「開到頂」在這裡是字面意思。見 `AP_CAP_OPEN`:
  // 量到的最強 AP 組合是 4,125.7,所以這一格能填的範圍正好是「有意義的那一段」
  // (往下夾),而多打一個零(1,000,000)會被擋下來。
  [Stat.AbilityPower]: AP_CAP_OPEN,
  [Stat.Armor]: 10_000,
  // ⚠️ 2026-08-12 抬高：200× 規則讓魔抗的出貨上限變成 15,344，舊的 10,000
  //    保險絲會把它擋在 Zod 外面（後台存不進去，而錯誤訊息只說「超出範圍」）。
  [Stat.MagicResist]: 100_000,
  // 暴擊傷害是倍率(1.75 = +75%),100 已經是 10000% 額外傷害。
  [Stat.CritDamage]: 100,
  // 攻擊距離:競技場單一 zone 半徑 24。
  [Stat.AttackRange]: 100,
  // 攻速的硬上限出貨是 10.0;100 是它的十倍。
  [Stat.AttackSpeed]: 100,
  [Stat.MoveSpeed]: 100,
  // 以下三條的 1.0 是語意邊界,不是餘裕(見檔頭)。
  [Stat.CritChance]: 1,
  [Stat.CooldownReduction]: 1,
  // 吸血 > 1 仍然有意義(回血多於打出的傷害),所以它不在上面那一組。
  // ⚠️ 2026-08-12 抬高：owner 把吸血的硬上限定在 20（傷害 100 回復 2000）。
  [Stat.Lifesteal]: 100,
  [Stat.Evasion]: 1,
  // 技能吸血與吸血同理:> 1 仍然有意義(回血多於打出的傷害)。
  [Stat.SpellVamp]: 10,
});

/**
 * 全屬性最寬的那一條上界。用在**認不出是哪條屬性**的時候(schema 的
 * `catchall`),所以它只保證「有界」,不保證緊。
 */
export const STAT_CAP_CEILING: number = Object.values(STAT_CAP_MAX).reduce(
  (a, b) => (b > a ? b : a),
  0,
);

/** 這一條屬性的天花板可以填的區間 `[min, max]`,兩端都是閉區間。 */
export function statCapBounds(stat: Stat): readonly [number, number] {
  const clamp = STAT_CLAMPS[stat];
  return [clamp ? clamp[0] : 0, STAT_CAP_MAX[stat]];
}

/** 這一頁/這張表管得到的屬性:有夾限的,或出貨預設有列的。 */
export const CAPPABLE_STATS: readonly Stat[] = Object.freeze(
  Array.from(
    new Set<Stat>([
      ...(Object.keys(STAT_CLAMPS) as Stat[]),
      ...(Object.keys(DEFAULT_STAT_CAPS) as Stat[]),
    ]),
  ),
);

/**
 * 讀一條屬性的天花板。
 *
 * 表裡沒有這條 → 退回 `STAT_CLAMPS` 的**上界**,而且 `base === unlocked`:
 * 一條沒有被 cap 表描述的屬性**不能被解鎖**,`CapRaise` 對它是 no-op。完全沒有
 * 夾限的屬性(生命上限、攻擊力…)兩個都是 +∞,也就是原本就沒有上限。
 */
export function capFor(table: StatCapTable | undefined, stat: Stat): StatCap {
  const c = table?.[stat];
  if (c && Number.isFinite(c.base) && Number.isFinite(c.unlocked)) {
    return { base: c.base, unlocked: Math.max(c.base, c.unlocked) };
  }
  const clamp = STAT_CLAMPS[stat];
  const hi = clamp ? clamp[1] : Number.POSITIVE_INFINITY;
  return { base: hi, unlocked: hi };
}

/**
 * 這個單位、這條屬性,**現在**的上限。
 *
 *     clamp( max(base, raised), base, unlocked )
 *
 * `raised` 是該單位身上所有 `CapRaise` 取 max 的結果(0 = 沒有任何解鎖來源)。
 * 比 `base` 小的解鎖是 no-op —— 解鎖只能往上,不能拿來偷偷**降低**別人的上限,
 * 那會變成一個沒有人預期的削弱管道。
 */
export function effectiveCap(
  table: StatCapTable | undefined,
  stat: Stat,
  raised = 0,
): number {
  const { base, unlocked } = capFor(table, stat);
  const wanted = Number.isFinite(raised) && raised > base ? raised : base;
  return wanted < unlocked ? wanted : unlocked;
}

/**
 * 正規化操作者/文件給的表:只留真的 stat key、兩個都是有限數、夾進
 * `statCapBounds(stat)`,而且 `unlocked` 至少等於 `base`(打反了不會讓解鎖比
 * 一般上限還低)。
 * 未知的 key 直接 **丟掉**,不會夾帶著過去 —— 一個 typo 在下次稽核時會讀成
 * 「設定過了」。
 *
 * ⚠️ 夾進區間是**三層守衛的最裡面一層**(同 `baseBonus.ts` 的
 * `normalizeBaseBonus`):後台頁擋在前面、Zod schema 擋在中間,而這裡擋的是
 * **任何**繞過那兩層的來源 —— 手改 `data/content-overlay/overlay.json`、舊版
 * 主機寫下的文件、測試夾具。
 */
export function normalizeStatCaps(raw: unknown): StatCapTable {
  const out: Partial<Record<Stat, StatCap>> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    for (const stat of CAPPABLE_STATS) {
      const v = rec[stat];
      if (!v || typeof v !== "object") continue;
      const { base, unlocked } = v as { base?: unknown; unlocked?: unknown };
      if (typeof base !== "number" || !Number.isFinite(base)) continue;
      if (typeof unlocked !== "number" || !Number.isFinite(unlocked)) continue;
      const [lo, hi] = statCapBounds(stat);
      const fit = (n: number): number => (n < lo ? lo : n > hi ? hi : n);
      const b = fit(base);
      out[stat] = Object.freeze({ base: b, unlocked: Math.max(b, fit(unlocked)) });
    }
  }
  return Object.freeze(out);
}

/**
 * 讀一份 `config.stat-caps@1` 文件(兩邊的 `Configs` registry 共用這一支)。
 *
 * ⚠️ 缺文件 / schema 不符 / caps 不是物件 → **出貨預設**。回空表的話,攻速上限
 * 會靜默退回 `STAT_CLAMPS` 的 4.0 而且 `unlocked` 也變 4.0 —— 解鎖功能整個消失
 * 卻不會有任何錯誤。見檔頭。
 */
export function statCapsFromDoc(doc: unknown): StatCapTable {
  if (!doc || typeof doc !== "object") return DEFAULT_STAT_CAPS;
  const d = doc as { schema?: unknown; caps?: unknown };
  if (d.schema !== "config.stat-caps@1" || typeof d.caps !== "object" || d.caps === null) {
    return DEFAULT_STAT_CAPS;
  }
  return normalizeStatCaps(d.caps);
}
