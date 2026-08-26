/**
 * 兩格**誠信**開關（GH#726，接手 #104 / #144）—— 兩條都不是「少一個功能」，
 * 是**客戶端知道的事實伺服器不知道**。
 *
 * | 開關 | 出貨預設 | 為什麼是這一邊 |
 * |---|---|---|
 * | `championLockEnforced` | **true** | 第〇·六守則：「優先權大的更新後都是預設啟動」。伺服器不承認鎖定＝改造過的客戶端可以鎖定後一直換人 |
 * | `scoreCheatedMatches` | **false** | owner 明說的那一邊：「1 vs bot 可以用作弊碼，但**用了就沒有分數與藍水晶**」 |
 *
 * ⭐ 開關存在的理由是**回頭**，⛔ 不是觀望：
 * · 鎖定強制 —— 沙發同樂／賽事裁判可能真的要讓一個座位重選（`false` 沿用今天的行為）
 * · 作弊局計分 —— 內部壓力測試想要一份真的有結算的錄影時
 *
 * ── 三個住處（第一守則）───────────────────────────────────────────────
 *   ① `content/config/config.match.json` 的 `match.championLockEnforced` / `.scoreCheatedMatches`
 *   ② `packages/shared/src/content/schema/config/match.ts` 的 Zod（`.optional()`）
 *   ③ `apps/admin/src/matchConfig.ts` 的欄位表 + `MATCH_BOOL_LABELS` + 分組
 *
 * ⚠️ **今天只有①的解析端落地** —— ②③ 住在本 lane 的檔案柵欄外面。
 * ⇒ 這一支寫成**向前相容**的：欄位不存在就用上表的預設，欄位出現了就照用，
 * ⛔ 不需要回頭改這裡。⚠️ `config.match` 的 Zod 是 `.strict()`，所以在②落地
 * 之前把欄位寫進①會被 `content:build` 擋下 —— 那是**對的**順序。
 *
 * ⚠️ 這兩格**不是平衡旋鈕**（⛔ 不進 `owner-knobs.json`）：它們不改任何一個
 * 傷害數字，只決定伺服器承不承認一件事。
 */
import { Configs } from "@ggd/shared/content";

/** 伺服器要不要**拒絕**已鎖定座位的改選。 */
export const DEFAULT_CHAMPION_LOCK_ENFORCED = true;
/** 用過作弊碼的場次要不要照樣結算（分數／藍水晶）。owner 明說：不要。 */
export const DEFAULT_SCORE_CHEATED_MATCHES = false;

/**
 * ⚠️ `Configs.tryGet` **在讀的時候不重跑 Zod**（同 `rooms/emptyRoomPolicy.ts`），
 * 所以這裡自己確認型別再用，⛔ 不假設文件是合法的。
 *
 * ⚠️ 缺席 = 上面那張表的預設，⛔ 不是 `false`：一份這一格出現之前的舊文件應該
 * 拿到 owner 現在要的行為，而不是被靜默地退回「伺服器沒有意見」。
 */
function matchFlag(key: string, fallback: boolean): boolean {
  const doc = Configs.tryGet("config.match") as unknown as
    | { match?: Record<string, unknown> }
    | undefined;
  const raw = doc?.match?.[key];
  return typeof raw === "boolean" ? raw : fallback;
}

export function resolveChampionLockEnforced(): boolean {
  return matchFlag("championLockEnforced", DEFAULT_CHAMPION_LOCK_ENFORCED);
}

export function resolveScoreCheatedMatches(): boolean {
  return matchFlag("scoreCheatedMatches", DEFAULT_SCORE_CHEATED_MATCHES);
}
