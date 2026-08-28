/**
 * 站台的品牌字串 —— **一個住處**（第〇·四守則）。
 *
 * ⚠️ 這一份原本住在 `apps/client/src/ui/platform/creditsData.ts`，而
 * 2026-08-28 後台要在每一頁的頁尾印同一行時，那個位置就用不了了：
 * `apps/admin/src/vfxLayers.ts:479` 逐字寫著「**後台不可以 import** 客戶端」。
 * ⇒ 兩個 app 都碰得到的地方只有 `packages/shared`，所以它搬到這裡，
 * ⛔ 而不是在後台再打一份一模一樣的字串（那一份會在改版權年的那一天漂掉，
 * 而且**沒有任何東西會紅**）。
 *
 * ⚠️ 年份是**發行年**，⛔ 刻意不是 `new Date().getFullYear()`：
 * 一個會自己往前跑的版權年，在「這份作品是哪一年發表的」這個問題上是說謊；
 * 而且它會讓任何逐位元組比對的閘永遠不相等（同 `caps:export` 不放時鐘的理由）。
 * 要改就是**改這一行**，而 `creditsData.test.ts` 釘著它含 `© 2026` 與作者名。
 */
export const COPYRIGHT_LINE = "© 2026 Moriyamouse/Adms 糟糕騎士團";
