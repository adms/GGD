/**
 * 具名標記（層數）的上下界 —— **一份表，兩個消費端**。
 *
 * 照 `sim/effects/knockbackLimits.ts` 的形狀：這裡的常數同時被
 *   ① `content/schema/mark.ts` 的 Zod（載入/存檔時擋下越界的作者）
 *   ② `sim/marks.ts` 的執行期夾取（後台 override 是第二條寫入路徑）
 * 消費，所以 schema 與 sim **結構上不可能漂移**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ `PERMANENT` 是一個哨兵值,不是一個很大的數字
 *
 * owner 2026-08-08 要的是「持續時間可設定 (-1~99999秒)，這次應該是 -1 (永久)」。
 * 用 `-1` 而不是「99999 秒」表達永久,是因為兩者在**回合邊界**上行為不同:
 * 一個 99999 秒的標記在第 3 回合仍然帶著第 1 回合的絕對到期 tick,而
 * `resetOn: "round"` 的標記每回合都要重新發 —— 兩件事混在同一個數字裡,
 * 「永久但每回合重置」就寫不出來。所以到期與重置是**兩根獨立的軸**。
 *
 * ⛔ 而 `-1` 這個哨兵**只活在內容層**。進到 `MarkState.expiresAtTick` 之後它是
 * {@link MARK_NEVER_EXPIRES},一個絕對 tick 的哨兵 —— sim 端**永遠不做**
 * 「剩幾秒」的遞減計數(CLAUDE.md 硬性技術約束,`sim/purity.test.ts` 在守)。
 */

/** 內容層寫 `-1` = 永久。這是**作者面**的哨兵值。 */
export const MARK_DURATION_PERMANENT = -1;

/**
 * 執行期的「不會過期」哨兵,存在 `MarkState.expiresAtTick`。
 *
 * 選 `-1` 而不是 `Infinity`:`expiresAtTick` 會被寫進 replay 與 digest,而
 * `Infinity` 在 JSON 往返後變成 `null`(#278 的殭屍波曾經踩過同一個坑)。
 * 一個永遠小於 `world.tick` 的整數 sentinel 走的是整數路徑,序列化安全。
 * 讀的地方一律用 {@link markExpired},不要自己比大小。
 */
export const MARK_NEVER_EXPIRES = -1;

/**
 * 最短持續時間 = 30 Hz 的一個 tick。
 *
 * 理由與 `applyStatus.duration` 的 `.min(0.034)` 完全相同,而那一格是踩出來的:
 * 任何小於半 tick 的數字會 `Math.round` 成 **0 tick**,標記掛上去的同一瞬間就
 * 過期,玩家永遠拿不到（失敗形態②：做了但沒有人收得到）。
 */
export const MARK_MIN_DURATION_SEC = 0.034;

/** owner 指定的上界（「-1~99999秒」）。約 27.7 小時 —— 遠超一場比賽,那是刻意的。 */
export const MARK_MAX_DURATION_SEC = 99999;

/**
 * 一個標記最多疊幾層。
 *
 * 上界 999 擋的是**小數點/多打一個零**:十二道試煉是 12,而一個打成 120 的
 * 免死次數等於那個英雄整場無敵。下界 0 是合法的(「初始 0 層,打中才給」)。
 */
export const MARK_MAX_COUNT = 999;

/**
 * 每失去一層給的永久加成,單根 modifier 的絕對值上界。
 *
 * 十二道試煉是 `+10% AD / +10% maxHealth`(= 0.1)。上界 10 = **+1000%/層**,
 * 給了一百倍的空間而仍然擋得住「0.1 打成 10」這種一層就把人變成神的錯字。
 * ⚠️ 下界是負的:「每失去一層,永久**降低**移速」是一個合法的設計。
 */
export const MARK_MAX_PER_STACK_VALUE = 10;

/**
 * ⭐ GH#306 —— 免死救活時,`surviveHpPct` 是**這一發的扣血上限**還是**救完的血量**。
 *
 * 這一格存在的理由是一句被寫壞的卡片文案:「免死,並留在 20% 生命」。
 * 在它之前只有一種行為 —— `combat/damage.ts` 的 `max(0, hp - floor)` ——
 * 那是「這一發最多扣到 floor」,所以血**已經低於** floor 的時候免死攔住了你、
 * 一格血都不補,下一隻殭屍碰一下就死。而編輯器上這個欄位看起來完全正常
 * (CLAUDE.md 失敗形態②:靜默)。
 *
 * ⭐ owner 2026-08-09 把語意講死了:
 *
 * > 「是**到生命 0 以下,再回到 20%**,不是停在 20%」
 *
 * 所以 `"restore"` 是一個**無條件設值**,不是一個條件式補血:免死觸發之後
 * 血量恆等於 floor,**與觸發前的血量無關**。60% 血挨一發致命傷 → 20%(降下來);
 * 5% 血挨一發 → 20%(升上去)。⛔ 只驗其中一邊的守衛分不出這三種語意
 * (夾取 / 低於才補 / 無條件設值),對三種實作都會過(失敗形態④)。
 *
 * 兩個都是合法設計,所以它是一格下拉選單而不是一行寫死的政策(第一守則):
 *   · `"clamp"`   —— **出貨預設 = 今天的行為**。缺席的每一份文件語意逐字不變。
 *   · `"restore"` —— 救完血量 = floor,不管挨打前是多少(卡片文案的字面意思)。
 *
 * ⛔ 預設不可以改成 `"restore"`:那會靜默改變每一份既有的免死內容
 * (十二道試煉的 floor 是 1%,它靠緊接著的 `restore` 效果回血,不是靠 floor)。
 */
export const MARK_LETHAL_RESTORE_MODES = ["clamp", "restore"] as const;
export type MarkLethalRestoreMode = (typeof MARK_LETHAL_RESTORE_MODES)[number];
/** 省略 `restoreMode` 時的意思 —— 今天的行為。 */
export const MARK_LETHAL_RESTORE_MODE_DEFAULT: MarkLethalRestoreMode = "clamp";

/** `expiresAtTick` 是不是「永不過期」。**唯一**該做這個判斷的地方。 */
export function markNeverExpires(expiresAtTick: number): boolean {
  return expiresAtTick === MARK_NEVER_EXPIRES;
}

/** 這個標記在 `tick` 這一刻是不是已經過期了。 */
export function markExpired(expiresAtTick: number, tick: number): boolean {
  return !markNeverExpires(expiresAtTick) && expiresAtTick <= tick;
}

/** [0, MARK_MAX_COUNT] 夾取 —— 執行期的唯一一道（schema 已經擋過一次）。 */
export function clampMarkCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const i = Math.trunc(n);
  if (i < 0) return 0;
  if (i > MARK_MAX_COUNT) return MARK_MAX_COUNT;
  return i;
}
