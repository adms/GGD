/**
 * phaseConfig — resolve the match PHASE DURATIONS (and the two other
 * `config.match@1` knobs that shape a match's clock: the fire ring and the
 * starting team lives) from content instead of hard-coding them, the same way
 * `arenaRules.ts` resolves the round table.
 *
 * ---------------------------------------------------------------------------
 * WHY (task #38): the prep window was a hard-coded number in the WRONG PLACE
 * ---------------------------------------------------------------------------
 * `content/config/config.match.json` has carried `match.champSelectSec /
 * intermissionSec / combatMaxSec / resolutionSec` since the content pipeline
 * landed, the `config@1` Zod schema validates them, and the editor offers them
 * for editing — but NOTHING READ THEM. `MatchRoom.onCreate` passed
 * `DEFAULT_PHASE_CONFIG` literally, so the real prep window was the constant in
 * `PhaseMachine.ts` and the content doc was decoration. Editing the JSON (or
 * the admin/editor field) changed nothing, which is worse than an honest
 * constant: it looks configurable and silently is not.
 *
 * The durations are NOT in `constants.ts` (that owns TICK_HZ / seat counts) and
 * NOT in `arena-rules.json` (that owns per-ROUND grants, augment tiers and
 * unlock rounds — a different axis: what a round GIVES, not how long a phase
 * LASTS). `config.match@1` is where they already are declared, so this makes
 * that declaration load-bearing rather than adding a fifth home for a timer.
 *
 * Seconds → TICKS happens here, once, against the authoritative TICK_HZ, so the
 * PhaseMachine keeps running on tick counts (deterministic, never wall clock).
 * A missing/mis-schema'd doc — unit tests, a bare skeleton boot — falls back to
 * {@link DEFAULT_PHASE_CONFIG} exactly as before.
 */
import { TICK_HZ } from "@ggd/shared/constants";
import { Configs } from "@ggd/shared/content";
import type { ConfigMatchDoc, FireRingConfig } from "@ggd/shared/content";
import { MAX_ROUNDS_UNLIMITED, type RoomMatchSettings } from "@ggd/shared/roomSettings";
import { DEFAULT_PHASE_CONFIG, type PhaseConfig } from "./PhaseMachine";
import { DEFAULT_STARTING_TEAM_HEALTH, MAX_STARTING_TEAM_HEALTH } from "./PairedDuels";

/** The seconds block of `config.match@1` this module consumes. */
export interface PhaseSeconds {
  champSelectSec: number;
  /** vs bot 的一鍵開打專用；缺席就退回 `champSelectSec`（＝不特別處理）。 */
  champSelectSecVsBot?: number;
  intermissionSec: number;
  combatMaxSec: number;
  resolutionSec: number;
}

/**
 * Lower bound on any phase, in ticks. A phase of 0 ticks would expire on the
 * tick it is entered (PhaseMachine.tickTimer returns true at 0), so a doc that
 * rounds to nothing would spin the match through its phases in a few frames.
 * One tick is the smallest value that still advances normally.
 */
const MIN_PHASE_TICKS = 1;

const toTicks = (seconds: number, fallback: number): number => {
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return Math.max(MIN_PHASE_TICKS, Math.round(seconds * TICK_HZ));
};

/** Convert an authored seconds block into the PhaseMachine's tick config. */
export function phaseConfigFromSeconds(
  sec: Partial<PhaseSeconds>,
  fallback: PhaseConfig = DEFAULT_PHASE_CONFIG,
  /**
   * 這一場有沒有**人類對手**。owner 2026-08-03:「vs bot 一鍵開打的時候，
   * 選角色時間可以延長+300秒」。
   *
   * ⚠️ 判準是「除了我以外還有沒有別的人」,不是「有沒有 bot」—— 每一場都有 bot
   * 填空位（MatchRoom 把沒人坐的座位一律標成 isBot）,所以用「有 bot」判會讓
   * **每一場**都吃到 320 秒,包括三個朋友一起打的那種。
   *
   * 預設 `false`(＝當成有人類對手,用一般值)是刻意的保守面:呼叫端忘了傳,
   * 結果是 PvP 的 20 秒,不是讓所有人一起等 5 分鐘。
   */
  hasHumanOpponent = true,
  /**
   * 房主在開房面板設的秒數（#288），**已經過 `sanitizeRoomSettings` 洗過**。
   * 每一格 optional，而 optional 在這裡的語意是語意①：**缺席 ≠ 重設** ——
   * 缺席的那一格原封不動地用下面算出來的出貨基準值，包含 vs bot 的那一格。
   */
  host: RoomMatchSettings = {},
): PhaseConfig {
  // ── 覆蓋順序（owner「預設值保留現在（包含 vs bot）」的精確實現）────────────
  // ① 先按 hasHumanOpponent 選出**基準值**：PvP 用 champSelectSec，
  //    vs bot 用 champSelectSecVsBot。
  const baseChampSelect = hasHumanOpponent
    ? sec.champSelectSec
    : (sec.champSelectSecVsBot ?? sec.champSelectSec);
  // ② 房主有設 → 房主贏，**兩條分支都一樣**（他明說要幾秒就是幾秒，bot 局也是）。
  // ③ 房主沒設 → 基準值原封不動。
  //
  // ⚠️ 兩個方向都會壞而且都很安靜：只把房主的值套在 PvP 分支上 → 房主在 bot 局
  // 設了完全沒反應；房主沒設時去碰 vs bot 分支 → 320 秒被靜默換成 20 秒。
  const champSelect = host.champSelectSec ?? baseChampSelect;
  return {
    champSelectTicks: toTicks(champSelect ?? NaN, fallback.champSelectTicks),
    intermissionTicks: toTicks(
      host.intermissionSec ?? sec.intermissionSec ?? NaN,
      fallback.intermissionTicks,
    ),
    combatMaxTicks: toTicks(host.combatMaxSec ?? sec.combatMaxSec ?? NaN, fallback.combatMaxTicks),
    // 結算秒數不是房主可調的四格之一（契約只開了三個時間 + 總回合數）。
    resolutionTicks: toTicks(sec.resolutionSec ?? NaN, fallback.resolutionTicks),
  };
}

/**
 * The ACTIVE phase config: the `config.match@1` doc when the content tree is
 * loaded (boot), otherwise the built-in defaults. Called once per match at
 * room creation, so the durations are frozen for the match's lifetime — a
 * mid-match content reload can never retime a phase under a running sim.
 */
export function resolvePhaseConfig(
  hasHumanOpponent = true,
  /** 房主覆寫（#288）。空物件 = 沒有人碰過任何一格 = 完全等於這一格出現之前。 */
  host: RoomMatchSettings = {},
): PhaseConfig {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  const authored = !doc || doc.schema !== "config@1" || !doc.match ? {} : doc.match;
  // ⚠️ 缺文件時**不能**直接 return DEFAULT_PHASE_CONFIG —— 那會讓房主的設定在
  // 骨架開機／單元測試底下靜靜地消失。空的 `authored` 走同一條路，每一格都退回
  // `fallback`，結果與舊的早退逐格相同。
  return phaseConfigFromSeconds(authored, DEFAULT_PHASE_CONFIG, hasHumanOpponent, host);
}

/**
 * 這一場的**總回合數上限**（#288）—— 打完第 N 回合就結束，名次照剩餘團隊生命。
 *
 * 語意①（缺席 ≠ 重設）：房主沒設 → 退回 `config.match@1` 的 `match.maxRounds`
 * 出貨值；那一格也沒有 → {@link MAX_ROUNDS_UNLIMITED}（0，＝今天的行為）。
 *
 * ⚠️ 讀 doc 時走的是**寬鬆的 cast**，理由和 {@link resolveStartingTeamHealth} 的
 * `Math.floor` + clamp 同一條：`Configs.tryGet` **在讀的時候不重跑 Zod**，所以
 * 這裡拿到的可能是後台耐久覆蓋層寫進來、從沒被驗過的任何東西（#283）。
 * 非數字 / 非有限 / <= 0 一律讀成「不設限」＝今天的行為，而不是丟例外把房間弄死。
 *
 * ⛔ 這裡**不夾取**、也不判上界 —— 房主那一側的界限由 `sanitizeRoomSettings`
 * 一份表管完（語意②：越界拒絕，不靜默夾取）。內容那一側由 Zod 管。
 */
export function resolveMaxRounds(host?: number): number {
  if (host !== undefined) return host;
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  const m = doc?.schema === "config@1" ? (doc.match as { maxRounds?: unknown } | undefined) : undefined;
  const authored = m?.maxRounds;
  if (typeof authored !== "number" || !Number.isFinite(authored) || authored <= 0) {
    return MAX_ROUNDS_UNLIMITED;
  }
  return Math.floor(authored);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * vs bot 的兩個節奏旋鈕 (owner 2026-08-03)
 *
 *   A1「強制結算」:「如果是 vs bot，玩家場勝負結算，另一場的 bot 還沒則強制結算，
 *                   不要讓玩家白等。」
 *   A2「選角早退」:「vs bot 選角後就可以開始進入戰鬥不用等，一樣是因為不用等
 *                   其他 bot。」
 *
 * ⚠️ **判準是「人類座位數 <= 1」,不是「場上有 bot」** —— 和 `champSelectSecVsBot`
 * (v0.9.29) 同一條。`MatchRoom` 把每一個沒人坐的座位都填成 `isBot: true`,所以
 * 「有 bot」在**每一場**都成立;用它判會讓三個朋友一起打的局也吃到 bot 局的規則。
 *
 * ⚠️ 而且**零個人類座位不算 vs bot 局**。純 bot 沙盒(單元測試、AI 對打的
 * 觀察局)沒有任何人在等,把它當成 bot 局的話:A2 會在第一個 tick 就跳過選角、
 * A1 會在第一個 zone 分出勝負的那一刻結束整個回合 —— 兩件都會靜默改寫每一條
 * 既有的 all-bot 測試與每一份既有錄影,而畫面上沒有任何人被服務到。
 * ═══════════════════════════════════════════════════════════════════════════ */

/** vs bot 的節奏規則,由 {@link resolveVsBotPacing} 在建立比賽時解析並凍結。 */
export interface VsBotPacing {
  /**
   * 這一場是不是「只有一個人類、其餘都是 bot」。
   * 兩個旗標都必須**同時**和它成立才會生效 —— 它是那個判準本身。
   */
  soloVsBots: boolean;
  /** A1:人類那一區記下勝負的同一 tick,強制結算其餘還在打的 bot 區。 */
  forceSettle: boolean;
  /** A2:人類座位全部鎖定英雄後,不等選角倒數直接進戰鬥。 */
  earlyStart: boolean;
}

/**
 * 出貨預設 = owner 明說的那一側(兩個都開)。⚠️ `soloVsBots: false` 是刻意的
 * 保守面,和 `phaseConfigFromSeconds` 的 `hasHumanOpponent = true` 同一個方向:
 * 一個沒有告訴我們座位的呼叫端拿到的是**今天的行為**,不是被靜默加速的比賽。
 */
export const DEFAULT_VS_BOT_PACING: VsBotPacing = Object.freeze({
  soloVsBots: false,
  forceSettle: true,
  earlyStart: true,
});

/** `SeatSpec` 裡這支函式唯一在意的那一格 —— 避免把整個型別拖進來。 */
interface SeatIsBot {
  isBot: boolean;
}

/**
 * 這一場的 vs bot 節奏規則。
 *
 * 兩個旗標讀 `config.match@1`(後台可調),`soloVsBots` 從**座位**推導 ——
 * 座位不是設定,它是這一場的事實,而且它跟著錄影的 header 走,所以重播會重現
 * 同一個判斷。
 *
 * 缺文件 / 缺欄位 ⇒ 出貨預設(兩個都開)。缺席不代表關掉:一份沒有這兩格的舊
 * `config.match.json` 應該得到 owner 現在要的行為。
 */
export function resolveVsBotPacing(seats: readonly SeatIsBot[]): VsBotPacing {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  const m = doc?.schema === "config@1" ? doc.match : undefined;
  const humans = seats.reduce((n, s) => n + (s.isBot ? 0 : 1), 0);
  return {
    // 「<= 1」是 owner 的判準,「>= 1」是上面那一段:沒有人類就沒有人在等。
    soloVsBots: humans === 1,
    forceSettle: m?.forceSettleVsBot ?? DEFAULT_VS_BOT_PACING.forceSettle,
    earlyStart: m?.champSelectEarlyStartVsBot ?? DEFAULT_VS_BOT_PACING.earlyStart,
  };
}

/**
 * The ACTIVE fire-ring schedule (task #132) — the round-pacing accelerator that
 * lives in `config.match@1`'s `match.fireRing` block, next to `combatMaxSec`
 * (its single source of truth for round length: `startSec` is the intended
 * round length and the schema forbids it exceeding `combatMaxSec`). Resolved
 * ONCE per match at room creation and handed to the MatchController, which arms
 * it on combat entry via `beginCombatFireRing`.
 *
 * Returns null when the doc / block is absent (unit tests, a skeleton boot, or
 * an operator who authored no ring): the MatchController then never arms the
 * ring, exactly the legacy behavior. Kept SEPARATE from resolvePhaseConfig so
 * the ring is a pure additive: a match with fire-ring config still resolves its
 * phase durations identically.
 */
export function resolveFireRing(): FireRingConfig | null {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  if (!doc || doc.schema !== "config@1" || !doc.match?.fireRing) return null;
  return doc.match.fireRing;
}

/**
 * The ACTIVE starting TEAM HEALTH — `match.startingTeamLives` in `config.match@1`.
 *
 * NAME MISMATCH, ON PURPOSE. The model is LoL Arena's Team Health (a 20-point
 * pool drained 2/4/6 per lost duel), not lives; the code says so, the content
 * key does not. The key is declared in a `.strict()` Zod object in
 * `packages/shared/src/content/schema/config.ts`, offered by the editor, and
 * written by `exportContentToJson` — none of which this lane owns — so renaming
 * it would be a cross-lane content migration for zero mechanical gain. It is
 * the same scalar reservoir under either spelling. See
 * `PairedDuels.DEFAULT_STARTING_TEAM_HEALTH`.
 *
 * SAME BUG AS #38, one field over. The key has been in the doc since the content
 * pipeline landed, `zConfigMatchDoc` validates it as a positive int, and the
 * editor offers it — but `MatchRoom.onCreate` passed a literal `3` to the
 * MatchController, so the authored value was decoration. Worse than the phase
 * durations were, in fact: this is the single knob that sets HOW LONG A MATCH
 * IS (round count = reservoir / drain, see PairedDuels.teamHealthLost), so the
 * owner had the match-length dial in his hands and turning it did nothing. That
 * is fixed, and the team-health rewrite deliberately did NOT reintroduce it:
 * the 20 is authored in `config.match.json`, not hardcoded here.
 *
 * Resolved ONCE per match at room creation, exactly like the phase durations and
 * the fire ring, and then frozen: the MatchController seeds `this.teamHealth`
 * from it in the constructor, so a mid-match content reload can never hand a
 * running match a different reservoir than the one its rounds have been draining.
 *
 * FALLBACK is {@link DEFAULT_STARTING_TEAM_HEALTH} for an absent / mis-schema'd
 * doc — a skeleton boot or a unit test still gets a playable match.
 *
 * REPLAY. This function is deliberately NOT called on the playback path.
 * `ReplayHeader.startingLives` records what the match actually ran on, and
 * `replay/Player.reset` feeds that recorded number back to the MatchController.
 * So a replay taken at 3 still plays at 3 after the live config moves to 20 —
 * see `replay.test.ts` ("recorded lives survive a config change").
 */
export function resolveStartingTeamHealth(): number {
  const doc = Configs.tryGet("config.match") as unknown as ConfigMatchDoc | undefined;
  const authored = doc?.schema === "config@1" ? doc.match?.startingTeamLives : undefined;
  if (typeof authored !== "number" || !Number.isFinite(authored)) return DEFAULT_STARTING_TEAM_HEALTH;
  // Non-integers and 0/negatives can only reach here from an unvalidated doc
  // (Configs.tryGet is not re-validated at read time); floor + clamp rather than
  // throw, so a bad edit degrades to a playable match instead of a dead room.
  const n = Math.floor(authored);
  if (n < 1) return DEFAULT_STARTING_TEAM_HEALTH;
  return Math.min(MAX_STARTING_TEAM_HEALTH, n);
}

/**
 * @deprecated Vocabulary alias for {@link resolveStartingTeamHealth}. `MatchRoom`
 * (another lane's file) calls this name; the alias keeps the rename from
 * reaching across the boundary.
 */
export const resolveStartingLives = resolveStartingTeamHealth;

