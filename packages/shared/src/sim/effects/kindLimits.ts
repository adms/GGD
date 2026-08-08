/**
 * Lane 1（2026-08-08）四個新 effect kind 的**上下界**，schema 與 handler 共用一份。
 *
 * ── 為什麼是一支共用檔而不是四份各自的常數 ────────────────────────────────
 * 第零守則⑨：「N 個同型項目 = K 個模板 + 一張表」。這四個 kind 是同一個形狀
 * （`shape` + 決策欄位 + 一個 handler）的四個實例，它們的界如果各自寫在
 * `content/schema/effect.ts` 的字面量裡，就是四份**沒有守衛**的第二住處 ——
 * schema 改了、handler 的夾值沒改，而兩邊看起來都對。
 *
 * ⚠️ CLAUDE.md：「欄位要有**上界**，不是只有下界」。下面每一格都是**誤打守衛**
 * （50 打成 500 那一類），不是平衡政策 —— 平衡值住在 `content/` 與後台。
 */

/** `modifyCooldown.mode:"reduce"` 的比例上界。1 = 直接歸零（那時該用 `"reset"`）。 */
export const CD_REDUCE_MAX_PCT = 1;
/**
 * `modifyCooldown.mode:"reduceFlat"` 的秒數上界。
 * 120 = 出貨最長的 EX 冷卻；再大就不是「縮短」而是打錯字。
 */
export const CD_REDUCE_MAX_FLAT_SEC = 120;

/**
 * `weightedBranch.branches` 的分支數上界。
 * 12 ≈ 一場的總人數，也遠大於俄羅斯輪盤要的 3 —— 它擋的是「一份被程式產生器
 * 灌爆的文件」，不是設計空間。
 */
export const BRANCH_MAX_COUNT = 12;
/**
 * 單一分支的 `weight` 上界。權重是**相對**的，所以絕對值多大都不影響結果，
 * 上界純粹是誤打守衛（1e9 會讓總和的浮點精度開始說謊）。
 * ⚠️ 下界是 **0**（允許「先關掉這個分支」而不必刪掉它），所以「總和為 0」
 * 必須另外在**載入時**擋 —— 見 schema 的 `refineWeightedBranch`。
 */
export const BRANCH_MAX_WEIGHT = 1000;

/**
 * `swapResource.clampMin` 的上界。
 * §16.16 建議的下限是 1（交換不殺人）；做成欄位是因為「交換到 0 血算不算死」
 * 是真的設計決定。上界 100 —— 再高就會在低血上限的身體上把交換變成純加血。
 */
export const SWAP_CLAMP_MIN_MAX = 100;

/**
 * `eventValueConversion.ratio` 的上界。5 = 「轉出 5 倍」已經是一個迴圈，
 * 而 15-002 太陰道要的是 1 以下。
 */
export const CONVERT_MAX_RATIO = 5;
/** 轉換順帶給的臨時屬性加成的秒數上界（「**短暫**加成至 AP」）。 */
export const CONVERT_BUFF_MAX_SEC = 60;

// ═══════════════════════════════════════════════════════════════════════════
//  Lane 2（2026-08-08）—— 三個新 kind 的界，住進**同一張表**
//
//  ⚠️ 不另開 `lane2Limits.ts`。第零守則⑨：同型項目要收斂成一張表，兩張表的
//  那一天它們會分岔，而每一張看起來都對。下面每一格一樣是**誤打守衛**
//  （50 打成 500 那一類），不是平衡政策。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `randomArea.count`（一次施放總共落幾發）的上界。
 * 32 遠大於出貨最多的一支（13-04 龍星群 10 顆），擋的是「一份被程式產生器灌爆
 * 的文件」—— 而它同時是**決定性預算**的上界：一發落點吃 2 次 rng draw，
 * 所以一次施放最多推進亂數流 64 步，這個數字必須是**看得到**的。
 */
export const RANDOM_AREA_MAX_COUNT = 32;
/**
 * `randomArea.intervalSec` 的上界。
 * 10 秒 ≈ 一個回合的十分之一；再長就不是「一波齊射」而是打錯字。
 * ⚠️ 下界不在這裡：schema 用 `.positive()`，執行期再夾成**至少 1 tick**
 * （見 `randomArea.ts`）—— 0.001 秒與 0.033 秒在 30Hz 下是同一件事，
 * 而一個會算出 0 tick 間隔的排程會把整波塞進同一個 tick。
 */
export const RANDOM_AREA_MAX_INTERVAL_SEC = 10;
/**
 * `randomArea.scatterRadius`（落點散佈半徑）的上界，與 schema 既有的
 * `radius` 上界同一個數字 —— 兩者都是「這個效果碰得到多遠」，分開會讓
 * 「散佈可以超出競技場」變成一個沒有人發現的合法值（場地 `boundaryRadius` 是 24）。
 */
export const RANDOM_AREA_MAX_SCATTER_RADIUS = 40;

/**
 * `manaBarrier.perMana`（一點魔力抵幾點傷害）的上界。
 * 44-00 機警是 **3**。20 = 一點魔力抵二十點傷害已經讓魔力條變成第二條血條，
 * 而那是一個平衡決定，不該靠打錯字達成。
 */
export const MANA_BARRIER_MAX_PER_MANA = 20;
/** `manaBarrier.durationSec` 的上界。60 = 一個回合的長度量級。 */
export const MANA_BARRIER_MAX_DURATION_SEC = 60;

/**
 * `extendBuff.addSec`（滿一份門檻延長幾秒）的上界。52-01 狂戰士之怒是 **2**。
 */
export const EXTEND_BUFF_MAX_ADD_SEC = 30;
/**
 * ⭐ `extendBuff.maxRemainingSec` 的上界 —— 這一格是這個 kind 的**安全閥**。
 *
 * 「每承受 5% 最大生命的傷害就延長 2 秒」在一個高血量、高減傷的身體上是一條
 * 正回饋：挨得越多、狂怒越久。沒有上界它會變成**永久**，而且症狀是「這場比賽
 * 就是打不完」，不是一個看得出來的錯誤。所以 `maxRemainingSec` 是**必填**
 * （不是選填），這裡只是它自己的上界。
 */
export const EXTEND_BUFF_MAX_REMAINING_SEC = 120;
/**
 * `extendBuff.perDamagePctOfMaxHealth` 的上界。
 * 1 = 「承受一整條血才延長一次」，比它大的數字沒有語意。
 */
export const EXTEND_BUFF_MAX_THRESHOLD_PCT = 1;
