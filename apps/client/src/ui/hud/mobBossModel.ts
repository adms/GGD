/**
 * mobBossModel — 殭屍王降臨橫幅 + 分紅結算面板 (task #262, GH #190).
 *
 * ⚠️ #291（owner 2026-08-03「特殊殭屍 不應該用殭屍王 分紅結算畫面」）:
 * 這一面板現在同時服務**兩種怪**。`mobBossSlain` 是王與特殊殭屍共用的事件
 * （sim/systems/MobSystem 的 #288 決定），`kind` 一直都在 payload 上而客戶端
 * 從來沒讀 —— 於是一隻特殊殭屍的結算穿著王的字、佔著王那唯一一格面板。
 * 現在 `MobBossView.mobKind` 帶著它過來，而**抬頭與呈現模式是後台欄位**
 * （`mobWaves.boss.settlementTitle` / `mobWaves.special.settlementTitle` /
 * `mobWaves.special.settlementMode`），入口是 {@link mobSettlementWording}。
 *
 * owner, 2026-07-28:
 *   「打死殭屍王的話,結算參與傷害的英雄,照傷害比例發獎金,補最後一刀的人獎金翻倍」
 *   「要播放恐怖音效3~5秒，打贏要播放中獎慶祝音效5~7秒」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ACTUALLY MISSING — and it was not the mechanic.
 *
 * v0.9.11 shipped the whole king: the summon at 100 personal zombie kills, the
 * 12k-HP body, the proportional payout, the last-hitter weight, and BOTH events
 * on the wire (`mobBossSpawn` / `mobBossSlain`, guarded by
 * apps/game-server/src/net/mobBossWire.test.ts). What it did not ship was a
 * single client consumer. So the player's entire experience of 100 rounds' work
 * was: a zombie that is bigger for no stated reason, and a gold counter that
 * jumps by ~3,000 with no explanation. That is failure shape ② — 「算出來了但
 * 從來沒送到」 — one layer further out than usual: the event DID cross the wire,
 * and then nothing read it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① THE ONE THING THE PANEL MUST EXPLAIN, OR IT LOOKS LIKE A BUG
 *
 * 「補最後一刀的人獎金翻倍」 HAS TWO IMPLEMENTATIONS AND THE PANEL MUST SAY WHICH
 * ONE IT IS LOOKING AT (packages/shared/src/sim/mobBoss.ts, rule 2 —
 * `boss.lastHitMode`, admin-switchable):
 *
 *   · `"weight"` — the last hitter's DAMAGE counts `lastHitMultiplier`× in the
 *     denominator, so the doubling is baked into the proportions and
 *     `sum(payout) === pool` exactly, always.
 *   · `"bonus"`  — THE SHIPPED DEFAULT since GH#206. Split by raw damage, then
 *     hand the last hitter one EXTRA copy of their own share. The total is
 *     deliberately NOT conserved: it lands in `[pool, pool × mult]`, hitting the
 *     ceiling when one champion did all the damage AND landed the blow (the
 *     owner's own worked example: 「全傷害 + 補刀 = 200%」).
 *
 * ⚠️ UNTIL v0.9.12 THIS MODULE ONLY KNEW THE FIRST ONE. `BOSS_RULE_NOTE` was a
 * single constant ending 「所以總獎金固定，不會因為誰補到最後一刀而變多」 — a
 * sentence that is FALSE in the mode the game actually ships, printed directly
 * under a total that had just exceeded the configured pool. The sim moved and
 * the panel kept reciting the old rule: not a stale comment — a false statement
 * about money, on the player's screen. Hence {@link bossRuleNote} TAKES THE MODE
 * and both sentences exist.
 *
 * Either way the note is not flavour text — it is the panel's reason to exist.
 * A player who did half the damage and did not last-hit sees less than half and
 * reads it as a rounding bug unless the rule is said out loud, and
 * `mobBoss.test.ts` asserts the RIGHT sentence for the mode reaches the rendered
 * DOM as VISIBLE text (not an aria-label).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② WHERE IT PAINTS (#107 safe-area contract) — DERIVED, NEVER CHOSEN
 *
 * Not a `hudLayout` corner slot, for the two reasons `killComboModel` already
 * states: HUD_SLOTS is a FOUR-CORNER registry and this is horizontally centred,
 * and a new non-transient bottom-left slot would break hudLayout.test.ts's
 * `hudStackEnd("bottom-left", {skipTransient}) === hudSlotBand("fps").end`
 * contract. So it obeys the same rule the other two unslotted centred clusters
 * obey: it is measured against the reserved rect of every persistent slot and
 * it never lands on one, and when there is genuinely no room it returns `null`
 * — which means NOTHING IS DRAWN, not 「draw it anyway at 0,0」.
 *
 * It takes the TOP of the centre corridor (under the PhaseTimer cluster,
 * `TOP_CENTRE_BAND_END`) and the 連殺 counter keeps the bottom. When the
 * corridor cannot hold both — a 375px-tall landscape phone has ~81px of
 * corridor in total — THE COMBO COUNTER YIELDS, via the `bossRect` opt that
 * `killComboRect` already had the vocabulary for (it is the identical mechanism
 * as `legendUp`). That precedence is a decision, not an accident: a 連殺 number
 * is juice that re-fires every few seconds, while the king is a once-per-100-
 * kills event whose panel is the ONLY place the money is ever explained.
 *
 * ③ WHEN THE PANEL DOES NOT FIT AT ALL, IT SHRINKS RATHER THAN LIES.
 * A 6-row table needs ~196px and a phone corridor has ~81. Clipping rows would
 * silently hide a player's own payout, so instead the layout falls back to
 * COMPACT: the LOCAL player's row, the pool total, the rule in one line, and an
 * honest 「+N 名參戰者」 count of the rows that did not fit. `mobBoss.test.ts`
 * proves that at every guard viewport SOME layout is produced and that the
 * local seat's row is in it.
 */
import {
  HUD_GAP,
  HUD_SLOTS,
  hudRectsOverlap,
  hudSlotRect,
  hudStampBandRect,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";
import {
  ABILITY_CLUSTER_H,
  ABILITY_CLUSTER_W,
  TOP_CENTRE_BAND_END,
} from "../controlLegendModel";
import { legendObstacleRects } from "./killComboModel";
import { Configs } from "@ggd/shared/content";
import {
  DEFAULT_MOB_SETTLEMENT_WORDING,
  mobSettlementWordingFromDoc,
  type MobSettlementMode,
  type MobSettlementWording,
} from "@ggd/shared/content";
import type { MobBossLastHitMode, MobBossShareView, MobBossView } from "../../net/RoomStore";

export type { MobSettlementMode, MobSettlementWording };

/* ═══════════════════════════════════════════════════════════════════════════
 * ① LIFETIME
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * How long the 降臨 banner holds, in ms.
 *
 * PINNED TO THE SOUND, not picked: the owner asked for a 3-5 second horror cue
 * and the shipped clip is 4.40 s (content/assets/audio/sfx/fx/boss-horror.mp3).
 * A banner shorter than its own sound leaves the last second of dread playing
 * over an empty screen, which reads as a stray sound rather than as an event.
 * `bossSfxDuration.test.ts` measures the mp3 and this is asserted to cover it.
 */
export const BOSS_BANNER_MS = 4600;

/**
 * How long the 分紅結算 panel holds. The jackpot cue is 6.00 s and the panel
 * is a TABLE the player has to read mid-fight, so it outlives the sound by a
 * couple of seconds rather than vanishing on the last chord.
 */
export const BOSS_SETTLEMENT_MS = 8200;

/** Shrink-and-fade exit, after the hold. Same idea as KILL_COMBO_EXIT_MS. */
export const BOSS_EXIT_MS = 480;

/** How often the container re-asks 「am I still up?」 (no per-frame stream). */
export const BOSS_POLL_MS = 100;

export type BossPhase = "live" | "out";

/** The hold window for a beat — exported so the test cannot restate it. */
export function bossHoldMs(kind: MobBossView["kind"]): number {
  return kind === "spawn" ? BOSS_BANNER_MS : BOSS_SETTLEMENT_MS;
}

export interface BossLifetime {
  phase: BossPhase;
  /** 0..1 — 1 while live, ramping to 0 across the exit */
  opacity: number;
}

/**
 * PURE: is this beat still on screen, and in which phase? `null` = nothing.
 *
 * The expiry is the half that must never silently stop working: without it the
 * last king's settlement would sit over the rest of the match. So every expiry
 * test asserts the NULL, not the value.
 */
export function bossLifetime(view: MobBossView | null, nowMs: number): BossLifetime | null {
  if (!view) return null;
  const age = nowMs - view.atMs;
  // a clock that ran backwards shows nothing, never a stuck panel
  if (age < 0) return null;
  const hold = bossHoldMs(view.kind);
  if (age > hold + BOSS_EXIT_MS) return null;
  const out = age > hold;
  const exited = out ? (age - hold) / BOSS_EXIT_MS : 0;
  return { phase: out ? "out" : "live", opacity: Math.max(0, Math.min(1, 1 - exited)) };
}

/**
 * IS THIS KING MINE TO LOOK AT? — the duel-zone gate.
 *
 * Both king events are fanned out to EVERY client in the match (game-server
 * net/eventFanout), but a king is summoned into exactly ONE of the four duel
 * zones. `audio/combatSfx.bossHorrorKey` already refuses to play the 4.4 s
 * dread drone into the other arena's ears — 「there the wrong SEAT heard it,
 * here the wrong ARENA would」 — and the screen owes the same courtesy for a
 * strictly larger reason: this overlay eats the centre corridor AND the 連殺
 * counter yields to it. Un-gated, six players in arena B lose their counter and
 * a strip of HUD for 4.6 s + 8.2 s, to be told about a monster they cannot see,
 * cannot fight, and will never be paid by — with no sound, because the sound
 * was gated and the picture was not.
 *
 * FAIL OPEN, exactly like the cue. Only a DEFINITE mismatch hides anything:
 * both zones known and different. `-1` on either side means 「不知道」 (no seat,
 * no live entity — you are dead or spectating, or an old payload carried no
 * zone), and an unresolved lookup must never be what silences the one panel
 * that explains the money.
 */
export function bossVisibleInZone(view: MobBossView | null, localZone: number): boolean {
  if (!view) return false;
  if (view.zone < 0 || localZone < 0) return true;
  return view.zone === localZone;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ② THE WORDS
 * ═══════════════════════════════════════════════════════════════════════════ */

export const BOSS_BANNER_TITLE = "殭屍王降臨";
/**
 * 殭屍王結算的**出貨**抬頭。
 *
 * ⚠️ 這不再是「畫面上一定是這幾個字」—— 它是 `mobWaves.boss.settlementTitle`
 * 讀不到時的保險絲（#291）。畫的時候一律走 {@link bossSettlementTitle}，
 * 因為特殊殭屍有它自己的一格。
 */
export const BOSS_SETTLEMENT_TITLE = DEFAULT_MOB_SETTLEMENT_WORDING.bossTitle;
/** 特殊殭屍結算的出貨抬頭（`mobWaves.special.settlementTitle`）。 */
export const BOSS_SPECIAL_SETTLEMENT_TITLE = DEFAULT_MOB_SETTLEMENT_WORDING.specialTitle;
export const BOSS_LAST_HIT_TAG = "補刀";

/** 這一份 arena-rules 編輯的 config 文件 id。 */
export const ARENA_RULES_DOC_ID = "arena-rules";

/**
 * #291 —— 生效中的結算措辭：後台 overlay ?? `content/config/arena-rules.json`
 * ?? {@link DEFAULT_MOB_SETTLEMENT_WORDING}。
 *
 * 走 `Configs`（開機時 bootContent 灌進去的那一份，和 `bossIntroRules()` 同一條
 * 路）而不是 `MatchState`：分紅結算整段活在客戶端，走 sim 只會多一趟 schema→
 * armed rules→snapshot 的接線，而每一段都是一個會斷掉的地方。
 */
export function mobSettlementWording(): MobSettlementWording {
  return mobSettlementWordingFromDoc(Configs.tryGet(ARENA_RULES_DOC_ID));
}

/**
 * PURE：這一則結算的抬頭。**這就是 owner 那句抱怨的答案** ——
 * 「特殊殭屍 不應該用殭屍王 分紅結算畫面」(2026-08-03)。
 */
export function bossSettlementTitle(view: MobBossView, wording: MobSettlementWording): string {
  return view.mobKind === "special" ? wording.specialTitle : wording.bossTitle;
}

/**
 * PURE：這一則結算要怎麼呈現。
 *
 * 殭屍王**永遠**是 `"panel"` —— `settlementMode` 只掛在 `special` 上，因為那是
 * owner 抱怨「怎麼會收到好幾次分紅結算」的那一種怪（一回合會死好幾隻），而王一個
 * 回合最多一隻（`boss.maxPerRound`）。給王一個關得掉的開關等於讓那 30,000 金
 * 有機會沒有任何畫面解釋它。
 */
export function bossSettlementMode(
  view: MobBossView,
  wording: MobSettlementWording,
): MobSettlementMode {
  return view.mobKind === "special" ? wording.specialMode : "panel";
}

/**
 * `"toast"` 模式那一行字：抬頭 · 實發總額 · 你自己那一份。
 *
 * 為什麼還是印「你那一份」而不是只印抬頭：一行只講「有人分了錢」等於一個沒有資訊
 * 的通知。`localSeatId` 不在名單上（你在別的競技場、或你一下都沒打）就只印總額 ——
 * 不印一個假的 0。
 */
export function bossToastLine(
  view: MobBossView,
  title: string,
  localSeatId: number | null,
): string {
  const gold = Math.max(0, Math.trunc(view.totalGold));
  const mine =
    localSeatId === null
      ? undefined
      : view.shares.find((s) => s.seatId >= 0 && s.seatId === localSeatId);
  const head = `${title} · 總獎金 ${gold} 金`;
  return mine ? `${head} · 你 +${Math.max(0, Math.trunc(mine.gold))} 金` : head;
}

/**
 * THE SENTENCE THIS WHOLE PANEL EXISTS FOR (see the module doc, ①), in the
 * SHIPPED `"bonus"` mode.
 *
 * It states the mechanism (an extra copy of the last hitter's own share, paid
 * on top) AND the consequence — that the total therefore OVERSHOOTS the
 * configured prize, and the number above it is what was really handed out.
 * Without the consequence, a reader who knows the pool is 30,000 and sees
 * 60,000 assumes the panel is broken.
 */
export const BOSS_RULE_NOTE_BONUS =
  // ⚠️ 「合計」 and not 「等於」 on purpose: `mobBoss.test.ts` proves that a sheet
  // where nobody gained a level paints NO 「等」 anywhere, and 「等於」 would put the
  // character back on screen and make that guard unfalsifiable.
  "獎金照傷害比例分。補刀者除了自己那份，再多領一份自己的份額（合計 ×%MULT%）——" +
  "所以實發總額會超出原本的獎金池，上面顯示的是實際發出去的金額。";

/**
 * The same sentence for the conserving `"weight"` mode — kept whole, because
 * the mode is admin-switchable and the moment somebody flips it back this is
 * the only true description of the payout again.
 */
export const BOSS_RULE_NOTE_WEIGHT =
  "獎金照傷害比例分。補刀者的傷害以 ×%MULT% 權重計入分母，不是事後把他那份乘 %MULT%——" +
  "所以總獎金固定，不會因為誰補到最後一刀而變多。";

/**
 * The rule sentence for THIS match's mode, with its real multiplier in it.
 *
 * ⚠️ `mode` IS REQUIRED, deliberately. A default would let a caller that forgot
 * to thread `view.lastHitMode` through keep compiling while printing the wrong
 * rule — which is exactly how the panel came to be lying in the first place.
 */
export function bossRuleNote(lastHitMultiplier: number, mode: MobBossLastHitMode): string {
  const m = formatMultiplier(lastHitMultiplier);
  const base = mode === "weight" ? BOSS_RULE_NOTE_WEIGHT : BOSS_RULE_NOTE_BONUS;
  return base.split("%MULT%").join(m);
}

/** The same rule in ONE line, for the compact layout. Same mode contract. */
export function bossRuleNoteShort(lastHitMultiplier: number, mode: MobBossLastHitMode): string {
  const m = formatMultiplier(lastHitMultiplier);
  return mode === "weight"
    ? `補刀是 ×${m} 權重，總獎金固定不變`
    : `補刀者多領一份自己的份額（×${m}），實發總額超出獎金池`;
}

/** `2` not `2.0`; `1.5` stays `1.5`. Whole numbers must not read as decimals. */
export function formatMultiplier(mult: number): string {
  const m = Number.isFinite(mult) ? Math.max(1, mult) : 1;
  return Number.isInteger(m) ? String(m) : String(Math.round(m * 100) / 100);
}

/** 「你的 128 隻擊殺召喚了牠」 / 「{name} 的 128 隻擊殺召喚了牠」. */
export function bossSummonLine(view: MobBossView, summonerName: string): string {
  const kills = Math.max(0, Math.trunc(view.kills));
  const who = view.mine ? "你" : summonerName || "某位英雄";
  return `${who}累積擊殺 ${kills} 隻殭屍，召喚了牠`;
}

/**
 * 「總獎金 3000 金 · 1200 經驗 · 2 等」 — WHAT WAS ACTUALLY PAID.
 *
 * ⚠️ EVERY NUMBER HERE COMES OFF THE EVENT, NEVER OFF THE CONFIG. In the shipped
 * `"bonus"` mode the sum of the shares exceeds the admin's 獎金池 (up to ×mult),
 * so a panel that printed `boss.bountyGold` would show 30,000 under a table of
 * rows adding to 60,000. This is the line that had to stop being a config echo.
 *
 * 等級 IS OMITTED WHEN NOBODY GAINED ONE — and only then. `bountyLevels` is 0 in
 * plenty of configs and `grantLevels` stops at `LEVEL_CAP`, so 「· 0 等」 would be
 * a permanent piece of noise on most matches; a non-zero grant is news and is
 * always shown.
 */
export function bossTotalLine(view: MobBossView): string {
  const gold = Math.max(0, Math.trunc(view.totalGold));
  const xp = Math.max(0, Math.trunc(view.totalXp));
  const levels = Math.max(0, Math.trunc(view.totalLevels));
  const head = `總獎金 ${gold} 金 · ${xp} 經驗`;
  return levels > 0 ? `${head} · ${levels} 等` : head;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ③ THE TABLE
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface BossSettlementRow {
  seatId: number;
  name: string;
  damage: number;
  gold: number;
  xp: number;
  /** 等級提升 actually granted to this champion (0 = none; the row omits it) */
  levels: number;
  lastHit: boolean;
  /** true = this is the local player's own line (the panel highlights it) */
  you: boolean;
}

export type BossSettlementMode = "full" | "compact";

export interface BossSettlementLayout {
  mode: BossSettlementMode;
  rows: BossSettlementRow[];
  /** participants NOT shown (compact mode only); 0 in full mode */
  hiddenCount: number;
  /** px the layout needs — what `mobBossRect` was asked for */
  height: number;
}

/** Header block (title + total line) heights, full / compact. */
export const BOSS_HEADER_H = 44;
export const BOSS_HEADER_COMPACT_H = 34;
/** One participant row. */
export const BOSS_ROW_H = 20;
/** The rule note, wrapped over two lines / squeezed to one. */
export const BOSS_NOTE_H = 32;
export const BOSS_NOTE_COMPACT_H = 18;

/** px a FULL table with `n` rows needs. */
export function bossFullHeight(n: number): number {
  return BOSS_HEADER_H + Math.max(1, n) * BOSS_ROW_H + BOSS_NOTE_H;
}

/** px the COMPACT fallback needs (one row, one-line rule). */
export const BOSS_COMPACT_H = BOSS_HEADER_COMPACT_H + BOSS_ROW_H + BOSS_NOTE_COMPACT_H;

/**
 * #291 `"toast"` 模式的高度 —— 一行字加上下留白。它**不是**一個更小的面板：
 * 沒有表格、沒有規則句，只有 {@link bossToastLine} 那一行。
 */
export const BOSS_TOAST_H = 30;

/**
 * Order the payout sheet the way a player reads it: BIGGEST PAYOUT FIRST, ties
 * broken by damage and then by seat so two clients never disagree. (The sim
 * emits ascending ENTITY id — deterministic, but meaningless to a human.)
 *
 * ⚠️ IT SORTS BY GOLD, NOT BY DAMAGE, AND THAT IS THE WHOLE POINT. It used to
 * lead with `b.damage - a.damage`, on the assumption that 「傷害最高」 and
 * 「拿最多」 are the same row — true only in `"weight"` mode, where the payout is
 * a monotone function of the weighted damage. In the shipped `"bonus"` mode the
 * last hitter is paid an extra copy of their own share, so a 1,000-damage 補刀
 * can out-earn a 4,000-damage teammate and the old comparator put the biggest
 * EARNER halfway down a sheet whose one job is to explain who got paid what.
 * Damage survives as the tie-break — it is the share basis, so it is the right
 * answer whenever two people took home the same money.
 */
export function bossSortedShares(shares: readonly MobBossShareView[]): MobBossShareView[] {
  return [...shares].sort((a, b) => b.gold - a.gold || b.damage - a.damage || a.seatId - b.seatId);
}

/**
 * Which rows to draw, given the height the corridor can actually give.
 *
 * `null` only when there are no participants at all — a king that drowned in
 * the fire ring pays nobody, and an empty table saying nothing is worse than no
 * table (the sim can and does produce that case; see splitBossBounty's
 * degenerate list).
 *
 * COMPACT NEVER DROPS *YOUR* ROW. If the local seat is on the sheet it is the
 * one kept; only when it is not (you were in the other arena, or you did no
 * damage) does the BIGGEST EARNER stand in — `bossSortedShares[0]`, which since
 * GH#206 is not necessarily the biggest damager. Hiding the reader's own payout
 * to fit the box would be the exact defect this panel exists to fix.
 */
export function bossSettlementLayout(
  view: MobBossView,
  localSeatId: number | null,
  nameOf: (seatId: number) => string,
  availableH: number,
): BossSettlementLayout | null {
  const sorted = bossSortedShares(view.shares);
  if (sorted.length === 0) return null;
  const row = (s: MobBossShareView): BossSettlementRow => ({
    seatId: s.seatId,
    name: nameOf(s.seatId),
    damage: Math.round(s.damage),
    gold: s.gold,
    xp: s.xp,
    levels: Math.max(0, Math.trunc(s.levels)),
    lastHit: s.lastHit,
    you: localSeatId !== null && s.seatId >= 0 && s.seatId === localSeatId,
  });
  const full = bossFullHeight(sorted.length);
  if (availableH >= full) {
    return { mode: "full", rows: sorted.map(row), hiddenCount: 0, height: full };
  }
  const mine = sorted.find((s) => localSeatId !== null && s.seatId >= 0 && s.seatId === localSeatId);
  const keep = mine ?? sorted[0]!;
  return {
    mode: "compact",
    rows: [row(keep)],
    hiddenCount: sorted.length - 1,
    height: BOSS_COMPACT_H,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ④ PLACEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Preferred width. Wide enough for a name + damage + gold + xp + 等 + 補刀 row. */
export const BOSS_PREF_W = 420;
/** Below this the row cannot be read at all → `null`, i.e. nothing is drawn. */
export const BOSS_MIN_W = 220;

/** The 降臨 banner's box (title line + summon line). */
export const BOSS_BANNER_H = 74;
export const BOSS_BANNER_MIN_H = 52;

export interface BossPlacementOpts {
  touch: boolean;
  /** the round-1 ControlLegend is up — see killComboModel's identical opt */
  legendUp: boolean;
  couchPlayers?: number;
  /** px the caller wants; the result is capped by the corridor */
  wantH: number;
  /** below this the caller would rather draw nothing */
  minH: number;
  /**
   * #247 —— 殭屍王長血條 while it is up (`bossHealthBarModel.bossHealthBarSpec`), or
   * null. THE BAR OUTRANKS THIS OVERLAY: the bar is PERSISTENT (it lives as long
   * as the king does) and this banner/panel is a 4.6 s / 8.2 s beat, so the
   * transient yields — the same precedence, and the same mechanism, this file
   * already applies to the 連殺 counter one level down (`bossRect`).
   *
   * Absent ⇒ nothing moves, so every existing caller and every existing test is
   * byte-identical.
   */
  barRect?: HudRect | null;
}

/**
 * Every rect the boss overlay must stay off: the reserved box of each
 * PERSISTENT corner slot, the two centred clusters that own no corner, the
 * build-stamp / ping gutter, and — while it is up — the round-1 control legend.
 *
 * (The 連殺 counter is NOT in this list, and that is the precedence rule, not
 * an omission: the counter yields to this overlay via `killComboRect`'s
 * `bossRect` opt. See the module doc, ②.)
 */
export function mobBossObstacles(
  viewport: HudViewport,
  opts: BossPlacementOpts,
): { id: string; rect: HudRect }[] {
  const out = HUD_SLOTS.filter((s) => !s.transient).map((s) => ({
    id: s.id,
    rect: hudSlotRect(s.id as HudSlotId, viewport, opts.touch),
  }));
  out.push({ id: "ability-cluster", rect: abilityClusterRect(viewport) });
  out.push({ id: "stamp-band", rect: hudStampBandRect(viewport) });
  legendObstacleRects(viewport, {
    touch: opts.touch,
    legendUp: opts.legendUp,
    couchPlayers: opts.couchPlayers,
  }).forEach((rect, i) => out.push({ id: `control-legend-${i}`, rect }));
  return out;
}

function abilityClusterRect(viewport: HudViewport): HudRect {
  return {
    x: Math.max(0, (viewport.width - ABILITY_CLUSTER_W) / 2),
    y: Math.max(0, viewport.height - ABILITY_CLUSTER_H),
    w: Math.min(ABILITY_CLUSTER_W, viewport.width),
    h: Math.min(ABILITY_CLUSTER_H, viewport.height),
  };
}

/**
 * The rectangle the overlay may paint in, or `null` when this viewport has no
 * room for it.
 *
 * TOP-ANCHORED in the centre corridor: it hangs under the phase timer, where a
 * MOBA puts an objective announcement, and leaves the bottom of the corridor
 * (over the ability bar) to the 連殺 counter.
 */
export function mobBossRect(viewport: HudViewport, opts: BossPlacementOpts): HudRect | null {
  const mid = viewport.width / 2;
  // `let`, not `const`: the #247 長血條 can be anchored at the BOTTOM of this
  // corridor, and then it is `bottom` that yields rather than `top`.
  let bottom = viewport.height - ABILITY_CLUSTER_H - HUD_GAP;
  let top = TOP_CENTRE_BAND_END + HUD_GAP;

  // A legend that is up AND CENTRED owns the top of this corridor outright, so
  // start below it. Its desktop `column` shape hugs the left flank instead and
  // is handled by the side scan — which is why this tests the RECT's geometry.
  for (const legend of legendObstacleRects(viewport, {
    touch: opts.touch,
    legendUp: opts.legendUp,
    couchPlayers: opts.couchPlayers,
  })) {
    if (legend.x < mid && legend.x + legend.w > mid) {
      top = Math.max(top, legend.y + legend.h + HUD_GAP);
    }
  }
  // …and the 長血條 (#247), which is anchored in this same corridor and outranks
  // this overlay. Same geometry test as the legend's (must straddle the centre
  // line), but it can be anchored at EITHER end, so the yield goes both ways:
  // a top bar pushes `top` down, a bottom bar pulls `bottom` up. Deciding by
  // WHICH HALF the bar sits in — rather than by reading its `anchor` — keeps
  // this file free of the bar's vocabulary and cannot disagree with the rect
  // that was actually resolved.
  if (opts.barRect) {
    const b = opts.barRect;
    if (b.x < mid && b.x + b.w > mid) {
      if (b.y + b.h <= (top + bottom) / 2) top = Math.max(top, b.y + b.h + HUD_GAP);
      else bottom = Math.min(bottom, b.y - HUD_GAP);
    }
  }

  const corridor = bottom - top;
  if (corridor < opts.minH) return null;
  const h = Math.min(opts.wantH, corridor);
  if (h < opts.minH) return null;
  const y = top;

  // How far chrome reaches INTO this y-band, per side — measured from the rects
  // rather than guessed from a corner's widest slot.
  let left = 0;
  let right = 0;
  for (const { rect: r } of mobBossObstacles(viewport, opts)) {
    if (r.y >= y + h || r.y + r.h <= y) continue; // no vertical overlap
    // Anything STRADDLING the centre line leaves no centred gap at all — say so
    // rather than paint over it.
    if (r.x < mid && r.x + r.w > mid) return null;
    if (r.x + r.w <= mid) left = Math.max(left, r.x + r.w);
    else right = Math.max(right, viewport.width - r.x);
  }

  const halfFree = Math.min(mid - left, mid - right) - HUD_GAP;
  const w = Math.min(BOSS_PREF_W, halfFree * 2);
  if (w < BOSS_MIN_W) return null;

  return { x: Math.round((viewport.width - w) / 2), y: Math.round(y), w: Math.round(w), h };
}

/**
 * Everything the resolved rect actually touches — empty is the only passing
 * answer.
 *
 * ⚠️ DELIBERATELY NOT BUILT FROM {@link mobBossObstacles}, for exactly the
 * reason `killComboCollisions` states: checking a placement against the very
 * list the placement consulted is a tautology — drop a slot from that list and
 * the overlay lands on it while this function, reading the same shortened list,
 * still reports 「clear」. The duplication IS the guard.
 */
export function mobBossCollisions(viewport: HudViewport, opts: BossPlacementOpts): string[] {
  const rect = mobBossRect(viewport, opts);
  if (!rect) return [];
  const hits: string[] = [];
  for (const s of HUD_SLOTS) {
    if (s.transient) continue;
    if (hudRectsOverlap(rect, hudSlotRect(s.id as HudSlotId, viewport, opts.touch))) hits.push(s.id);
  }
  if (hudRectsOverlap(rect, abilityClusterRect(viewport))) hits.push("ability-cluster");
  if (hudRectsOverlap(rect, hudStampBandRect(viewport))) hits.push("stamp-band");
  legendObstacleRects(viewport, {
    touch: opts.touch,
    legendUp: opts.legendUp,
    couchPlayers: opts.couchPlayers,
  }).forEach((r, i) => {
    if (hudRectsOverlap(rect, r)) hits.push(`control-legend-${i}`);
  });
  return hits.sort();
}

/**
 * The overlay's rect for a live beat, or null. ONE entry point so the renderer
 * and the 連殺 counter's yield can never resolve different boxes: `KillCombo`
 * passes the result of this straight into `killComboRect({ bossRect })`.
 *
 * For a `slain` beat the height is negotiated: ask for the full table, and if
 * the corridor cannot give it, ask again for the compact fallback rather than
 * returning null and showing the player nothing about their own money.
 */
export function mobBossOverlayRect(
  view: MobBossView | null,
  viewport: HudViewport,
  opts: {
    touch: boolean;
    legendUp: boolean;
    couchPlayers?: number;
    barRect?: HudRect | null;
    /**
     * #291 —— 這一則結算的呈現模式（{@link bossSettlementMode}）。省略 ⇒
     * `"panel"`，也就是這一格出現之前的行為，所以既有的呼叫端與測試一個字都不用改。
     *
     * ⚠️ 它在**這裡**而不是在元件裡分岐，因為連殺計數器的讓位
     * （`killComboRect({ bossRect })`）讀的是這一支的結果：`"off"` 的時候要真的
     * 回 `null`，否則走廊被一個沒有人畫的矩形佔著，連殺計數器白白讓位 8 秒。
     */
    settlementMode?: MobSettlementMode;
  },
): HudRect | null {
  if (!view) return null;
  const base = {
    touch: opts.touch,
    legendUp: opts.legendUp,
    couchPlayers: opts.couchPlayers,
    barRect: opts.barRect,
  };
  if (view.kind === "spawn") {
    return mobBossRect(viewport, { ...base, wantH: BOSS_BANNER_H, minH: BOSS_BANNER_MIN_H });
  }
  if (view.shares.length === 0) return null;
  const mode = opts.settlementMode ?? "panel";
  if (mode === "off") return null;
  if (mode === "toast") {
    return mobBossRect(viewport, { ...base, wantH: BOSS_TOAST_H, minH: BOSS_TOAST_H });
  }
  const full = bossFullHeight(view.shares.length);
  return (
    mobBossRect(viewport, { ...base, wantH: full, minH: full }) ??
    mobBossRect(viewport, { ...base, wantH: BOSS_COMPACT_H, minH: BOSS_COMPACT_H })
  );
}
