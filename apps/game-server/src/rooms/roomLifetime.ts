/**
 * 房間的**存活上限** —— owner 2026-08-23 的逐字裁決（GH#588 的第二半）：
 *
 * > 每間房間存活時間只要開始進入戰鬥後，存活時間最多30分鐘，避免幽靈房間
 *
 * ── 為什麼它必須是一條**獨立於相位機**的線 ─────────────────────────────
 * `finishMatch()` 是這間房**唯一**的主動關閉路徑（`MatchRoom.closeRoom` 之外），
 * 而練習房永遠走不到它：`MatchController.ts` 的 `if (this.practice?.endlessCombat) break;`
 * 讓相位機**永遠停在 `combat`**（實測 60,660 tick ≈ 34 分鐘，phase 從頭到尾是
 * `'combat'`）。⇒ 一條「等相位走完」的兜底對它是**結構性失明**的。
 * 所以這一條量的是**牆上時鐘**，⛔ 不是相位、⛔ 不是 tick 數：
 * 掉 tick 的房間跑得比真實時間慢，而幽靈房間吃的是**真實**的 CPU 秒。
 *
 * ── 為什麼起點是「進入戰鬥」而不是「建房」 ─────────────────────────────
 * owner 的原話是「**只要開始進入戰鬥後**」。選角／中場／商店都不計時 ——
 * 一間卡在選角的房有自己的兜底（`emptyRoomPolicy`），而一間**打起來**的房
 * 才是會 30Hz 燒下去的那一種。
 *
 * ── 三個住處（第一守則）───────────────────────────────────────────────
 *   ① `content/config/config.match.json` 的 `match.roomCombatMaxSec` / `.roomCombatCapEnabled`
 *   ② `packages/shared/src/content/schema/config/match.ts` 的 Zod（`.optional()`）
 *   ③ `apps/admin/src/matchConfig.ts` 的欄位表 + 標籤 + 分組
 *
 * ⚠️ **今天只有這一支（＝解析端）落地** —— ②③ 住在本 lane 的檔案柵欄外面
 * （`packages/shared/src/content/**` 與 `apps/admin/**`）。⇒ 這一支刻意寫成
 * **向前相容**的：欄位不存在就用 owner 說的 1800 秒，欄位出現了就照用，
 * ⛔ 不需要回頭改這裡。⚠️ `config.match` 的 Zod 是 `.strict()`，所以在 ② 落地
 * 之前把欄位寫進 ① 會被 `content:build` 擋下 —— 那是**對的**順序，⛔ 不是缺陷。
 *
 * ⚠️ 缺席 = **開著**（`true`）：一份這一格出現之前的舊文件應該拿到 owner 現在
 * 要的行為，而不是被靜默地退回「沒有兜底」。同 `emptyRoomPolicy` 的約定。
 */
import { Configs } from "@ggd/shared/content";

/** owner 2026-08-23：「存活時間最多**30分鐘**」。 */
export const DEFAULT_ROOM_COMBAT_MAX_SEC = 1800;
/** 兜底本身要不要開 —— 壓力測試／長時間錄影素材是關掉它的合法用途。 */
export const DEFAULT_ROOM_COMBAT_CAP_ENABLED = true;

export interface RoomCombatLifetime {
  enabled: boolean;
  maxSec: number;
}

/** 上下界：⛔ 下界不是 0（0 = 一進戰鬥就收房），上界 4 小時。 */
const MIN_SEC = 60;
const MAX_SEC = 14_400;

/**
 * ⚠️ `Configs.tryGet` **在讀的時候不重跑 Zod**（同 `emptyRoomPolicy.ts`），
 * 所以這裡自己確認型別與上下界再用，⛔ 不假設文件是合法的。
 */
export function resolveRoomCombatLifetime(): RoomCombatLifetime {
  const doc = Configs.tryGet("config.match") as unknown as
    | { match?: Record<string, unknown> }
    | undefined;
  const m = doc?.match;
  const rawEnabled = m?.roomCombatCapEnabled;
  const rawSec = m?.roomCombatMaxSec;
  const maxSec =
    typeof rawSec === "number" && Number.isFinite(rawSec)
      ? Math.min(MAX_SEC, Math.max(MIN_SEC, rawSec))
      : DEFAULT_ROOM_COMBAT_MAX_SEC;
  return {
    enabled: typeof rawEnabled === "boolean" ? rawEnabled : DEFAULT_ROOM_COMBAT_CAP_ENABLED,
    maxSec,
  };
}

/**
 * 這間房該不該因為「打太久」被收掉？
 *
 * ⭐ 純函式（⛔ 不讀時鐘、⛔ 不碰房間），所以守衛驗得到它的**邊界**而不必等
 * 30 分鐘。呼叫端負責提供 `nowMs` 與「戰鬥第一次開始的那一刻」。
 *
 * @param combatSinceMs 戰鬥**第一次**變成 active 的牆上時刻；`null` = 還沒打起來
 */
export function roomOutlivedCombatCap(
  rules: RoomCombatLifetime,
  combatSinceMs: number | null,
  nowMs: number,
): boolean {
  if (!rules.enabled) return false;
  if (combatSinceMs === null) return false;
  return nowMs - combatSinceMs >= rules.maxSec * 1000;
}
