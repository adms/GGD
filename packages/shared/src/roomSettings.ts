/**
 * roomSettings —— **開房房主的每房設定**（選角 / 商店 / 每回合時間 + 總回合數）。
 *
 * owner 2026-08-08:
 *   「開房房主可以設定 選角、商店、每回合的時間跟總回合數，
 *     但**預設值保留現在**（包含 vs bot）」
 *
 * ── 這個檔是**契約**，不是實作 ────────────────────────────────────────────
 * 四層會讀它（client 表單的 min/max、game-server 的權威夾取、config@1 的 Zod
 * 上下界、後台顯示），所以界限只能有**一份**。這是 `markLimits.ts` /
 * `knockbackLimits.ts` 那個「一張表、多個消費者」的形狀。
 *
 * ⛔ Go 那一層（`apps/platform`）**故意不驗**，只做透明轉送 —— 和 #215 的
 * `rogueliteMobs *bool` 同一條路。權威在 game-server：多一個驗證點就是多一份
 * 會漂的界限，而 Go 沒有辦法 import 這張表。
 *
 * ── 三條語意，每一條都是踩過的坑 ──────────────────────────────────────────
 *
 * ① **缺席 ≠ 重設。** 每一格都是 optional。房主沒碰的欄位要退回
 *    `content/config/config.match.json` 的出貨值，**包含 vs bot 的 320 秒選角**
 *    （`champSelectSecVsBot`）。這正是 owner 說的「預設值保留現在」。
 *    ⚠️ 反面：如果把缺席當成 0 或當成「用最小值」，開一個房不設定任何東西
 *    就會靜默改掉 vs bot 的節奏，而畫面上看不出來。
 *
 * ② **越界就拒絕，不靜默夾取。** #279 已經記過「clamp 靜默吃掉數字」這個形狀：
 *    使用者打 5000，系統存 600，而畫面上沒有任何東西說它被改過。
 *    所以 {@link sanitizeRoomSettings} 回傳 `rejected` 清單，呼叫端有義務讓它
 *    被看見（表單擋在前面、伺服器記一行指名欄位）。
 *    ⚠️ 「回傳一個安全值」在這個 repo 是 fail-open，而 CLAUDE.md 的判準是
 *    「誰會知道它退回了？」—— `rejected` 就是那個答案。
 *
 * ③ **`combatMaxSec` 的下界是推導的，不是常數。** `config@1` 有一條跨欄位
 *    不變式（schema/config.ts 的 refine）：
 *        `fireRing.startSec + 整個火圈收完要幾秒 <= combatMaxSec`
 *    否則火圈還在縮就被硬底線強制結束。那條 refine **只在載入內容時跑**，
 *    完全攔不到房間設定 —— 房主把「每回合時間」調到 60 秒就會安靜地踩破它。
 *    所以每回合時間的最小值要用 {@link minCombatMaxSecFor} 從**出貨的火圈設定**
 *    算出來，不可以寫死一個數字（寫死的那個數字在 owner 調火圈的那一天就會過期）。
 */

/** 房主可調的四格。每一格 optional —— 缺席 = 用 `config.match@1` 的出貨值。 */
export interface RoomMatchSettings {
  /** 選角階段秒數。設了就**同時覆蓋** PvP 與 vs bot 兩條分支（房主明說要幾秒就是幾秒）。 */
  champSelectSec?: number;
  /** 商店／中場階段秒數（`intermissionSec`）。 */
  intermissionSec?: number;
  /** 每回合戰鬥上限秒數（`combatMaxSec`）。下界見 {@link minCombatMaxSecFor}。 */
  combatMaxSec?: number;
  /** 總回合數。{@link MAX_ROUNDS_UNLIMITED} = 無上限（＝今天的行為）。 */
  maxRounds?: number;
}

export const ROOM_SETTING_KEYS = [
  "champSelectSec",
  "intermissionSec",
  "combatMaxSec",
  "maxRounds",
] as const;

export type RoomSettingKey = (typeof ROOM_SETTING_KEYS)[number];

/**
 * `maxRounds` 的「不設限」哨兵。
 *
 * ⚠️ **0 而不是 undefined / -1**：`undefined` 已經被語意①用掉了（缺席 = 用出貨值），
 * 而出貨值本身也要能表達「不設限」，所以需要一個**可以被寫進 JSON 的**值。
 * 選 0 不選 -1 是因為 Zod 那一格是 `int().min(0)`，負數在 schema 就擋掉，
 * 不必在四個地方各寫一次「-1 是特別的」。
 *
 * 出貨預設是 0 —— 今天沒有房主層的回合上限，而 owner 說預設值保留現在。
 *
 * ⛔ **「打到某隊團隊生命歸零」不是結束條件，不要這樣寫。** owner 2026-07-27 裁定
 * 「不管前面被淘汰與否，大家都回來打第 10 回合」之後，團隊生命**不淘汰任何人**，
 * 它只是計分板（排 2/3/4 名）。唯一的結束條件是
 * `apps/game-server/src/match/PairedDuels.ts` 的 `FINAL_ROUND`。
 * ⚠️ 所以 `maxRounds` 只能**縮短**一場比賽：設得 >= `FINAL_ROUND` 不會有任何效果，
 * 因為賽制本來就在那裡結束。這件事要寫在房主看得到的說明上，否則他設 20 會以為
 * 加長了（失敗形態②的一種：設定收下了，行為沒變）。
 */
export const MAX_ROUNDS_UNLIMITED = 0;

/** 每一格的上下界。⛔ 只有這一份 —— 其他地方一律 import，不要抄字面值。 */
export const ROOM_SETTING_LIMITS: Readonly<
  Record<RoomSettingKey, { readonly min: number; readonly max: number; readonly int: boolean }>
> = Object.freeze({
  /** 上界 600 與 `config@1.match.champSelectSec` 同源（schema/config.ts 2026-08-03 補的）。 */
  champSelectSec: { min: 5, max: 600, int: false },
  intermissionSec: { min: 5, max: 600, int: false },
  /**
   * 30 是**絕對**下界；真正生效的下界由 {@link minCombatMaxSecFor} 從火圈設定推導，
   * 兩者取大。上界 1800（30 分鐘）—— 硬底線 `roundHardCapSec` 本來就會先收掉，
   * 這一格擋的是「180 打成 18000」那種誤植。
   */
  combatMaxSec: { min: 30, max: 1800, int: false },
  /** 0 = 不設限。上界 50 是誤植攔截（一場 50 回合已經遠超任何實打長度）。 */
  maxRounds: { min: MAX_ROUNDS_UNLIMITED, max: 50, int: true },
});

/** {@link minCombatMaxSecFor} 需要的火圈欄位。 */
export interface FireRingCloseShape {
  startSec: number;
  shrinkSec: number;
  stage2StartSec?: number;
  stage2ShrinkSec?: number;
}

/**
 * 火圈**整個收完**要幾秒（兩段都算）。
 *
 * ⚠️ 這與 `schema/config.ts` 的 `ringFullCloseSec` 是同一個算式。這裡重寫一份
 * 是因為 schema 那一份沒有匯出，而讓 schema 匯入這個檔會把「內容驗證」
 * 綁到「房間設定」上（相依方向反了）。守衛 `roomSettings.test.ts` 用同一份
 * 出貨火圈設定跑兩邊比對，所以任何一邊改了都會紅。
 */
export function ringFullCloseSec(ring: FireRingCloseShape): number {
  const stage1End = ring.startSec + ring.shrinkSec;
  if (ring.stage2StartSec === undefined || ring.stage2ShrinkSec === undefined) {
    return stage1End - ring.startSec;
  }
  const stage2End = ring.stage2StartSec + ring.stage2ShrinkSec;
  return Math.max(stage1End, stage2End) - ring.startSec;
}

/**
 * 這一場的 `combatMaxSec` 最小可以設多少 —— **從出貨的火圈設定推導**。
 *
 * 沒有火圈（`undefined`）就只剩絕對下界。有火圈的話，回合必須長到讓圈收完，
 * 否則 `config@1` 的那條不變式在房間層被踩破：圈還在縮，硬底線先到。
 */
export function minCombatMaxSecFor(ring: FireRingCloseShape | undefined): number {
  const floor = ROOM_SETTING_LIMITS.combatMaxSec.min;
  if (!ring) return floor;
  return Math.max(floor, ring.startSec + ringFullCloseSec(ring));
}

/** 一格被拒絕的原因，要讓使用者看得到（語意②）。 */
export interface RejectedRoomSetting {
  key: RoomSettingKey;
  /** 原始送進來的東西，原封不動（可能是任何型別）。 */
  received: unknown;
  reason: "not-a-number" | "below-min" | "above-max" | "not-an-integer";
  min: number;
  max: number;
}

export interface SanitizedRoomSettings {
  settings: RoomMatchSettings;
  /** 空陣列 = 全部收下。非空 = 呼叫端**必須**讓它被看見，不可以吞掉。 */
  rejected: readonly RejectedRoomSetting[];
}

/**
 * 把任意來源（HTTP body / Colyseus options / 表單）洗成可信的房間設定。
 *
 * @param raw 任意物件；非物件視為「沒有任何設定」。
 * @param minCombatMaxSec 由 {@link minCombatMaxSecFor} 算出的動態下界；
 *        省略則只用絕對下界（單元測試與沒有火圈的場合）。
 */
export function sanitizeRoomSettings(
  raw: unknown,
  minCombatMaxSec?: number,
): SanitizedRoomSettings {
  const settings: RoomMatchSettings = {};
  const rejected: RejectedRoomSetting[] = [];
  if (typeof raw !== "object" || raw === null) return { settings, rejected };
  const src = raw as Record<string, unknown>;

  for (const key of ROOM_SETTING_KEYS) {
    const received = src[key];
    // 語意①：缺席 ≠ 重設。null 也算缺席（JSON 常把「沒填」送成 null）。
    if (received === undefined || received === null) continue;

    const lim = ROOM_SETTING_LIMITS[key];
    const min =
      key === "combatMaxSec" && minCombatMaxSec !== undefined
        ? Math.max(lim.min, minCombatMaxSec)
        : lim.min;

    const n = typeof received === "number" ? received : Number(received);
    if (typeof received === "boolean" || !Number.isFinite(n)) {
      rejected.push({ key, received, reason: "not-a-number", min, max: lim.max });
      continue;
    }
    if (lim.int && !Number.isInteger(n)) {
      rejected.push({ key, received, reason: "not-an-integer", min, max: lim.max });
      continue;
    }
    // 語意②：越界就拒絕（回退到出貨值），不靜默夾成邊界值。
    if (n < min) {
      rejected.push({ key, received, reason: "below-min", min, max: lim.max });
      continue;
    }
    if (n > lim.max) {
      rejected.push({ key, received, reason: "above-max", min, max: lim.max });
      continue;
    }
    settings[key] = n;
  }
  return { settings, rejected };
}

/** 這一場有沒有回合上限。`undefined` / 0 都是沒有。 */
export function hasRoundCap(maxRounds: number | undefined): boolean {
  return maxRounds !== undefined && maxRounds > MAX_ROUNDS_UNLIMITED;
}

/**
 * 打完 `roundNumber` 之後，這一場是不是該因為**回合上限**而結束。
 *
 * ⚠️ 只回答上限這一半。既有那條是 `PairedDuels.FINAL_ROUND`（賽制的最後一回合），
 * 兩條是 OR，而且**既有那條不可以被這條改掉** —— 沒設上限時這個函式恆回 false，
 * 所以出貨預設（0）下整條機制在行為上不存在。
 *
 * ⛔ 既有那條**不是**「團隊生命歸零」。生命歸零不淘汰任何人（owner 2026-07-27），
 * 它只是計分板。寫錯這句的代價是把 `maxRounds` 說成「可以延長」，而它只能縮短。
 */
export function roundCapReached(roundNumber: number, maxRounds: number | undefined): boolean {
  return hasRoundCap(maxRounds) && roundNumber >= (maxRounds as number);
}
