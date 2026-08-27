/** Client<->server message names + payloads (Colyseus onMessage channel). */
import type { Order, Command, AbilitySlot, CastableSlot } from "../sim/intents";
import type { Vec2 } from "../sim/math/vec2";
import type { PlayerMatchStats } from "../sim/stats/matchStats";
import type { Grade } from "../sim/stats/rating";

export const MSG = {
  // client -> server
  INPUT: "input", // continuous + discrete, seq-stamped
  SELECT_CHAMPION: "selectChampion",
  /**
   * ⭐ GH#726 ① —— **鎖定英雄**。⛔ 這件事在此之前**只存在於客戶端**
   * （`ui/panels/champselect/lockGate.ts` 的檔頭逐字自承 CLIENT-SIDE ONLY），
   * 所以改造過的客戶端鎖定之後可以一直換人，而其他玩家也看不到誰鎖了。
   *
   * ⚠️ 為什麼是一個**新訊息**而不是「第一次 `SELECT_CHAMPION` 就算鎖定」：
   * 出貨的客戶端在鎖定時**再送一次同一個 `SELECT_CHAMPION`**
   * （`ChampSelectPanel.lockIn` → `pickToCommitOnLock`），而點格子本身也送 ——
   * ⇒ 「第一次成功就鎖」會讓**每一次正常的鎖定**都收到一則 REJECT。
   * 一個把出貨流程弄壞的權威閘不是修好，是換一個缺陷。
   *
   * ⚠️ 舊客戶端從不送這一則 ⇒ 對它們**逐位元零改變**（鎖定仍然只在本機）。
   * 伺服器側的洞要等客戶端把 `lockIn()` 接上這一則才真的關上。
   */
  LOCK_CHAMPION: "lockChampion",
  CHEAT: "cheat", // dev-only offline testing aid (server hard-gates on dev mode)
  // server -> client (events; state rides the schema)
  EVENT: "event", // sim events fanout {type, tick, data}
  EVENT_BATCH: "evbatch", // N events from ONE tick, in order (see EventBatchMessage)
  REJECT: "reject", // {seq?, reason}
  PHASE: "phase", // {phase, round}
} as const;

export interface InputMessage {
  seq: number;
  order?: Order;
  aim?: Vec2;
  commands?: Command[];
}

export interface SelectChampionMessage {
  championId: string;
}

/**
 * GH#726 ① —— 鎖定這個座位現在選的英雄。
 *
 * ⚠️ 帶著 `championId` 而不是一個空訊息，理由和 `lockIn()` 重送一次 pick 一樣：
 * 「我要鎖定的是**這一個**」比「鎖定我現在不知道是什麼的那個」少一次競態
 * （點擊與鎖定之間的封包重排會把玩家鎖進上一個 hover）。
 */
export interface LockChampionMessage {
  championId: string;
}

/**
 * Offline cheat commands (single-player testing aid). Sent on the MSG.CHEAT
 * channel and applied to the SENDER's own seat only. The server hard-gates
 * these to dev mode (no PLATFORM_GAME_SHARED_SECRET + devCheats flag on) and
 * NEVER trusts the client's "offline" claim — see cheatGate.ts.
 */
export type Cheat =
  | { kind: "setLevel"; level: number } // 1..18
  | { kind: "grantGold"; amount: number }
  | { kind: "grantMCoin"; amount: number } // no wallet in-sim → no-op server-side
  | { kind: "maxAbilities" } // learn + max Q/W/E/R (R past the round gate)
  | { kind: "rankAbility"; slot: AbilitySlot } // rank one slot (R bypasses gate)
  | { kind: "giveItem"; itemId: string } // grantItemFree into the first open slot
  | { kind: "swapChampion"; championId: string } // despawn + respawn same seat/team/pos
  | { kind: "fullHeal" } // hp + mana to full, revive
  | { kind: "godMode"; enabled: boolean } // invuln: hp/mana topped off every tick
  | { kind: "zeroCooldown"; enabled: boolean } // 0 CD 釋放: abilities never on cooldown
  | { kind: "resetCooldowns" } // one-shot cooldown refresh
  | { kind: "killEnemies" } // kill all enemy champions in my zone (fast-forward)
  | { kind: "spawnFlower" } // spawn a healing flower in my zone (flower testing)
  | { kind: "skipPhase" } // force intermission→combat / end the round
  | { kind: "rerollOffers" } // re-roll this seat's open augment/weapon offers
  /**
   * 即時生成殭屍（GH#343，owner 2026-08-17「以及即時生成殭屍等特殊單位」）。
   *
   * `what` 逐字沿用 sim 的 {@link MobKind}（一般 / 特殊 / 殭屍王），⛔ 不另外發明
   * 一套 grunt/elite 的詞彙 —— 兩套名字之於同一件事，就是遲早會對不上的那種債。
   *
   * `count` 省略時走 `config.practice@1` 的「生怪指令的預設數量」。⚠️ 無論填多少，
   * 伺服器一律吃小怪波設定的**每區同時存活上限**，撞到就停：練習房不可以被自己
   * 生出來的怪打死（那會讓沙盒變成一個沒得練的地方）。
   */
  | { kind: "spawnMob"; what: "normal" | "special" | "boss"; count?: number }
  /**
   * ── 練習面板（GH#365）的六個分頁需要的六個機制 ────────────────────────────
   *
   * owner 2026-08-18：「請你修正到練習模式可以開出各種**經驗值、等級、寶具、
   * 屬性、技能、狀態開關、殭屍生成**等調整介面出來」。
   *
   * ⭐ 六個 kind，⛔ 不是六十個。每一格 UI 按鈕都是這六個之一**帶不同參數** ——
   * 40 種狀態是 `setStatus` 的 40 個 `statusId`，23 條屬性是 `setStat` 的 23 個
   * `stat`，⛔ 不是 63 個 cheat kind（第零守則⑨：N 個同型 = K 個模板 + 一張表）。
   * 那張「表」不在這裡也不在 UI 裡 —— 它**從出貨註冊表推導**（`StatusEffects` /
   * `Stat` enum / `Items`），所以新增一份 status 文件，面板隔天自己就多一格。
   */
  /** 成長分頁 —— 直接灌經驗值（`setLevel` 是另一半：直接設等級）。 */
  | { kind: "grantXp"; amount: number }
  /**
   * 屬性分頁 —— 把**一條**屬性直接設成 `value`。
   *
   * `stat` 同時吃兩個身分空間，而它們在引擎裡本來就是兩套東西：
   *   · 三圍（`"str" | "agi" | "int"`）→ 走 `ModifierSource.attributes`，
   *     因為一點力量會餵進生命/回復/攻擊三條線（`stats/attributes.ts`）；
   *   · {@link Stat} 的成員（`"ad"` / `"as"` / `"maxHealth"` …）→ 走
   *     `ModOp.Override`，那正是「直接改」在管線裡的名字。
   * ⛔ 不拆成兩個 kind：對使用者而言這一格就是「把某條數字設成 N」，
   * 拆開只會讓 UI 必須先知道哪一格是三圍（一份會過期的名單）。
   */
  | { kind: "setStat"; stat: string; value: number }
  /** 技能分頁 —— 無限魔力（每 tick 補滿）。`zeroCooldown` 是它的冷卻孿生兄弟。 */
  | { kind: "infiniteMana"; enabled: boolean }
  /**
   * 技能分頁 —— **指定施放**。伺服器對自己的實體呼叫出貨的 `castAbility`，
   * 所以射程/魔力/冷卻/沉默每一道閘都照跑，⛔ 不繞過它們（繞過的話練習房測到的
   * 就不是真的技能了）。要無視冷卻就先開「0 CD」那一格 —— 兩個機制各自獨立。
   */
  | { kind: "castAbility"; slot: CastableSlot }
  /**
   * 狀態分頁 —— 掛上／解除**一種**狀態。`on:false` 時 `durationSec` 被忽略。
   *
   * ⚠️ 機制旗標（暈眩/定身/恐懼/減速…）**從那份 `status-effect@1` 文件的 tags
   * 推導**（`sim/cheatStatusFlags.ts`），⛔ 不由客戶端指定：讓 UI 送旗標等於
   * 讓面板自己發明一個「暈眩是什麼」的第二份定義。
   */
  | { kind: "setStatus"; statusId: string; on: boolean; durationSec?: number }
  /**
   * 殭屍分頁 —— **指定波次**：把小怪波的時鐘搬到「下一 tick 就是第 k 波」。
   *
   * ⚠️ 它動的是 `world.mobTicks`（波次時鐘），⛔ 不是憑空生一批怪 —— 那是
   * `spawnMob` 的工作。分開的理由是它們回答不同的問題：「我要看第 30 波長什麼
   * 樣子」vs「我要 5 隻特殊殭屍站在這裡」。
   */
  | { kind: "setWave"; wave: number };

export interface CheatMessage {
  cheat: Cheat;
}

export interface EventMessage {
  type: string;
  tick: number;
  data: Record<string, unknown>;
}

/**
 * MANY `EventMessage`s from ONE tick, in one Colyseus message.
 *
 * WHY. Every `broadcast(MSG.EVENT, …)` is one `ws.send()` PER CLIENT — colyseus
 * only queues messages while a client is still JOINING (`WebSocketClient.
 * enqueueRaw`, @colyseus/ws-transport 0.16.5), so a joined room does no
 * coalescing of its own. MEASURED on a real 12-socket room replaying a real
 * 900-tick sim: 8.7 fanned-out events/tick at the shipped mob cap is 98 WebSocket
 * frames per tick (2,947/s), and 353/tick (10,615/s) at 600 zombies/zone. Each
 * of those frames pays a colyseus envelope, a WS frame header, a socket write —
 * and, above `wsCompression`'s 256 B threshold, its own deflate job.
 *
 * SHAPE. `evs` is a positional pair per event so the field names are not repeated
 * N times, and the ARRAY ORDER IS THE DELIVERY ORDER — see `unpackEventBatch`.
 * `tick` is carried once because every event in a batch is from the same tick;
 * that is what makes batching latency-free, and it is why there is no
 * cross-tick mode (owner: 「不要跨 tick 合批」 — 順暢 over 省頻寬).
 */
export interface EventBatchMessage {
  /** the single tick every event in this batch was emitted on */
  tick: number;
  /** [type, data] pairs, IN EMISSION ORDER */
  evs: [string, Record<string, unknown>][];
}

/**
 * Batch → the exact `EventMessage` sequence the unbatched wire would have sent.
 *
 * THE ORDER IS THE CONTRACT. Sim events are causally linked (`castBegin` before
 * `castRejected`, `attackWindup` before `basicAttackHit`, `damage` before
 * `death`), and the client's drain applies them in arrival order. Any reshuffle
 * here — sorting, grouping by type, reversing — is a behaviour change even
 * though every event still arrives. `eventBatch.test.ts` mutates exactly that.
 *
 * Defensive on shape, not on content: a malformed pair is skipped rather than
 * throwing, because one bad entry must not take the whole tick's combat visuals
 * down with it.
 */
export function unpackEventBatch(msg: EventBatchMessage): EventMessage[] {
  const out: EventMessage[] = [];
  if (!Array.isArray(msg?.evs)) return out;
  for (const pair of msg.evs) {
    if (!Array.isArray(pair) || typeof pair[0] !== "string") continue;
    out.push({ type: pair[0], tick: msg.tick, data: (pair[1] ?? {}) as Record<string, unknown> });
  }
  return out;
}

/**
 * Victory-settlement event type broadcast on the MSG.EVENT channel once the
 * match ends (phase -> matchEnd). Carries the full per-player scoreboard, grade
 * and per-match rank so the client can render the settlement screen + ranking
 * table. `pointsDelta` / `tierBefore` / `tierAfter` are OPTIONAL — the game
 * server leaves them undefined; the platform/ranked layer fills them in on the
 * leaderboard screen (the client's "查看戰績變化" flow).
 */
export const SETTLEMENT_EVENT = "matchSettlement" as const;

/**
 * Per-team settlement broadcast the moment a team is ELIMINATED mid-match
 * (task #193). Same `MatchSettlement` payload shape as {@link SETTLEMENT_EVENT},
 * but it fires while the match is still running for the surviving teams, so a
 * player whose team's life is gone can see their evaluation screen BEFORE they
 * choose to leave — rather than being dropped straight to the lobby. `winnerTeam`
 * is -1 (undecided) until the final `matchSettlement` at matchEnd. The client
 * records it into the same settlement slot and only surfaces it on the
 * leave-flow for a player whose own team is out (see ui/panels/leaveSettlement).
 *
 * It is a DISTINCT event name on purpose: a prior attempt reused an event key
 * the client never handled ("a dead key at matchEnd"), so the card never
 * arrived. This constant is imported by BOTH the server broadcaster and the
 * client handler, so the wire key can never drift between them again.
 */
export const TEAM_SETTLEMENT_EVENT = "teamSettlement" as const;

export interface SettlementPlayer {
  seatId: number;
  accountId: string;
  /** champion id (content key) for the portrait */
  champ: string;
  teamId: number;
  /** champion role (drives the role-normalised grade) */
  role: string;
  grade: Grade;
  /** 1..N placement across ALL players in the match */
  rank: number;
  stats: PlayerMatchStats;
  /**
   * THE NUMBER ON THE SETTLEMENT SCREEN — `rankScore`, i.e. the very expression
   * `perMatchRanks` sorted on. Optional only because a pre-feature server does
   * not send it; the panel then shows the rank alone rather than inventing one.
   */
  score?: number;
  /**
   * The survival half of `score`, alone (owner, 2026-07-27: 「每回合 RANK 計算，
   * 存活下來的人額外 +200分」). Broken out so the settlement can SHOW why a
   * turtle out-placed a damage dealer — otherwise the bonus is invisible and
   * the player cannot tell it exists, which is this repo's #1 failure.
   */
  survivalBonus?: number;
  /** ranked-ladder deltas — filled by the platform layer, not the game server */
  pointsDelta?: number;
  tierBefore?: string;
  tierAfter?: string;
}

/**
 * ONE PLAYER'S CONTRIBUTION IN ONE ROUND — a DELTA, never a running total.
 *
 * This shape exists because per-round performance was, until now, unobtainable
 * anywhere in the system. `PlayerMatchStats` lives in SimWorld, is cumulative
 * from champion spawn and is never reset per round (roundReport.ts §2(a) says
 * so at length: 「there is no such number as "the damage I did this round"
 * anywhere in the system, server included」). The only per-round facts on the
 * wire were `SeatState.roundKills/roundDeaths` — four integers, no damage, no
 * healing, no mob kills. A per-round chart cannot be drawn from that.
 *
 * So MatchController snapshots the cumulative scoreboard at every combat settle
 * and ships the DIFFERENCE against the previous settle. Deltas rather than
 * running totals on purpose: a chart of cumulative damage only ever slopes up
 * and says nothing about which round a player actually showed up in.
 *
 * `hpRatio` is the exception and is deliberately NOT a delta — it is a level,
 * read off `Health` at the instant the round settled (0 when dead). It is the
 * 存活HP比例 the MVP formula rewards.
 */
export interface RoundStatDelta {
  seatId: number;
  /** hp / maxHp at the moment the round settled, clamped to [0,1]; 0 if dead. */
  hpRatio: number;
  kills: number;
  deaths: number;
  assists: number;
  /** damage to ENEMY CHAMPIONS only — recordDamage drops non-champion targets. */
  damageDealt: number;
  /** HP actually lost. Includes zombie damage (#215) — owner-accepted. */
  damageTaken: number;
  damageBlocked: number;
  healingDone: number;
  ccAppliedTicks: number;
  /** ticks alive while combat was live — how long you lasted THIS round. */
  timeAliveTicks: number;
  revivesPerformed: number;
  /** world.mobKills delta: 殭屍 this player put down this round (#215). */
  mobKills: number;
  /**
   * This seat's team drew the BYE (TeamState.roundOutcome === NONE) — it never
   * fought. Every counter above is 0 and hpRatio is 0, because enterCombat
   * parks a bye team's seats DEAD without emitting a death: byte-identical to
   * a team that was instantly wiped (#173 is the bug that proved it). Without
   * this flag the chart would plot a sat-out round as "ranked last, zero
   * damage" — a lie about play that never happened. Consumers must SKIP these
   * rounds rather than score them.
   */
  bye: boolean;
}

/** Every player's delta for one settled combat round. */
export interface RoundStatsEntry {
  /** 1-based round number this delta covers (PhaseMachine.round at settle). */
  round: number;
  players: RoundStatDelta[];
}

/**
 * 【回合分數與排名】GH#737（接手 #14）—— 戰鬥中與回合結束的**同一則**廣播。
 *
 * > owner（#14 原引）：「進入戰鬥房間，**隨時顯示**玩家自己回合累積分數及排名，
 * >  **回合結束提示排名變化**」
 *
 * ## ⭐ 為什麼是**事件**而不是 seat 欄位
 * `defineTypes` 是 APPEND-ONLY —— 加三個 seat 欄位是**不可逆**的協定決定，而
 * 這三個數字是**推導值**（`rankScore` 的輸出），不是權威世界狀態。
 * 一則 1 Hz 的事件（12 席 × 4 個數字）可以隨時撤掉，一格 schema 欄位不行。
 *
 * ## ⭐ 為什麼「即時」與「回合結束」共用同一個型別
 * 兩者是**同一個式子的兩次取樣**。分成兩個型別就會有兩個計算點，而
 * 「畫面上的分數 ≠ 結算頁的分數」正是這張票要修的病（第〇·四守則：一個住處）。
 * `final` 分辨這一則是不是回合結算的那一次（⭐ 只有它帶 {@link RoundScoreEntry.prevRank}）。
 */
export const ROUND_SETTLEMENT_EVENT = "roundSettlement" as const;

/** 一個座位在某一次取樣時的分數與排名。 */
export interface RoundScoreEntry {
  seatId: number;
  /**
   * ⭐ **`rankScore` 這個式子本身的輸出** —— 與結算頁 `SettlementPlayer.score`
   * 逐位元同一條路（同一個 `RankEntry` / 同一份 lobby）。
   * ⛔ 客戶端不可以自己再算一次：兩個式子遲早會漂，而玩家會相信比較大的那個。
   */
  score: number;
  /** `score` 裡屬於「活下來」的那一半（owner 2026-07-27 的每回合 +200） */
  survivalBonus: number;
  /** 1..N，全場排名（`perMatchRanks` 的輸出，與結算頁同一支） */
  rank: number;
  /**
   * 上一次**回合結算**時的排名。⭐ 只有 `final: true` 的那一則帶它 ——
   * 「排名變化」是回合與回合之間的事，戰鬥中每秒抖動一次的箭頭沒有意義。
   * 第一回合（沒有上一次）留 `undefined`，⛔ 不是 0（0 會被畫成「從第 0 名掉下來」）。
   */
  prevRank?: number;
}

export interface RoundSettlement {
  /** 1-based：這一則講的是第幾回合（戰鬥中的取樣＝**進行中**的那一回合） */
  round: number;
  /**
   * `true` = 這一回合剛剛結算完的那一次取樣（⭐ 帶 `prevRank`，客戶端在這一則
   * 上跳「排名變化」提示）；`false` = 戰鬥中的即時取樣。
   */
  final: boolean;
  players: RoundScoreEntry[];
}

export interface MatchSettlement {
  matchId: string;
  /** team id that placed 1st (winner), or -1 if undecided */
  winnerTeam: number;
  perPlayer: SettlementPlayer[];
  /**
   * Per-round history, oldest round first — the input to the settlement's
   * 每回合戰績變化 chart. OPTIONAL because a pre-feature server (and every
   * hand-built test fixture) simply has no such field; the client falls back to
   * "no per-round data" rather than drawing a chart out of nothing.
   */
  rounds?: RoundStatsEntry[];
}
