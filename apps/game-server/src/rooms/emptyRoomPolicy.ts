/**
 * 選角結束時房裡沒有任何真人 —— 收房，還是照樣打完一整場？（GH#588 的第三項）
 *
 * owner 2026-08-23 的裁決是「收掉」，所以那是**出貨預設**。但「要不要」這件事
 * 本身是一個決策點（第一守則：拿不定主意的決策做成後台可切，⛔ 不是在註解裡
 * 辯護挑了哪一個），而且它有一個真的用途：
 * 壓力測試 / 錄影素材要的正是「沒有人在場也把 12 個 bot 配好打完一場」。
 *
 * ⚠️ **這一格不是平衡旋鈕**，所以它不進 `owner-knobs.json`：它不影響任何一場
 * 有人玩的比賽的數值，只決定一間**沒有人**的房要不要繼續吃 30Hz 的 CPU。
 *
 * 三個住處（第一守則）：
 *   ① `content/config/config.match.json` 的 `match.disposeEmptyChampSelect`
 *   ② `packages/shared/src/content/schema/config/match.ts` 的 Zod（`.optional()`）
 *   ③ `apps/admin/src/matchConfig.ts` 的欄位表 + `MATCH_BOOL_LABELS` + 分組
 *
 * ⚠️ 缺席 = `true`，⛔ 不是 `false`：一份**這一格出現之前**的舊文件（耐久覆蓋層
 * 裡真的存得到）應該拿到 owner 現在要的行為，而不是被靜默地退回舊行為。這跟隔壁
 * 三個 `.optional()` 布林的約定是同一條，只是它們的「owner 要的那一邊」剛好是
 * false 而這一格是 true。
 */
import { Configs } from "@ggd/shared/content";
import type { ConfigMatchDoc } from "@ggd/shared/content";

/** 出貨預設 —— owner 2026-08-23 明說的那一邊（收掉）。 */
export const DEFAULT_DISPOSE_EMPTY_CHAMP_SELECT = true;

/**
 * 選角結束時沒有真人 ⇒ 要不要收房。
 *
 * ⚠️ `Configs.tryGet` **在讀的時候不重跑 Zod**（同 `phaseConfig.ts` 的每一支
 * `resolve*`），所以這裡自己確認型別再用，⛔ 不假設文件是合法的。
 */
export function resolveDisposeEmptyChampSelect(): boolean {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  const raw = doc?.match?.disposeEmptyChampSelect;
  return typeof raw === "boolean" ? raw : DEFAULT_DISPOSE_EMPTY_CHAMP_SELECT;
}
