/**
 * RoomStore — projects the Colyseus schema into a Zustand store for the React
 * HUD. DISCRETE-RATE ONLY: phase/round/timer-seconds, economy (gold/level/xp),
 * cooldowns, lives, offers, picks, K/D tallies. Entity transforms NEVER pass
 * through here — they flow schema → InterpolationBuffer → Babylon transforms
 * imperatively. Every write is change-guarded so snapshot patches that don't
 * alter HUD-visible values cause zero re-renders.
 */
import { createStore } from "zustand/vanilla";
import { perfBus } from "../perfBus";
import { useStore } from "zustand";
import { TICK_HZ } from "@ggd/shared/constants";
import { KILL_COMBO_EVENT } from "@ggd/shared/sim/combat/killCombo";
import {
  MOB_BOSS_SLAIN_EVENT,
  MOB_BOSS_SPAWN_EVENT,
  type LastHitMode,
} from "@ggd/shared/sim/mobBoss";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { ENTITY_KIND, formIndexFromFlags } from "@ggd/shared/protocol/schema";
import type { EventMessage, MatchSettlement } from "@ggd/shared/protocol/messages";
import type { MarkView } from "../ui/hud/markModel";
// ⛔⛔ GH#816 —— `state.entities` 是 **view-gated**，view 裡一個實體都沒有的時候
// Colyseus **整格不送** ⇒ 客戶端讀到 `undefined`（⛔ 不是 size 0 的空 map）。
// 本檔在 2026-08-29 之前有 5 處無條件 `state.entities.get/forEach`，它們沒有一起
// 爆掉純粹是因為外圈剛好都有 `entityId > 0` 的 if —— 那是**巧合，⛔ 不是保證**。
// ⇒ 唯一入口是 `entitiesOf()`；閘是 `viewGatedReads.test.ts`（掃出貨原始碼）。
import { entitiesOf } from "./viewGatedEntities";

export interface OfferView {
  offerId: string;
  tier: string;
  choices: string[];
}

/**
 * The outcome of the LOCAL champion's last shop action (task #38/#60). The sim
 * emits `itemBought` / `itemSold` / `buyRejected` / `sellRejected`; this is the
 * raw projection of one of those, deliberately WITHOUT any user-facing text —
 * turning a reason into a sentence is `ui/panels/shopFeedback`'s job, so the
 * net layer never owns UI copy.
 *
 * `seq` increments on every recorded event so the HUD can re-show an identical
 * outcome (clicking a too-expensive item twice must beep twice).
 */
export interface ShopEventView {
  kind: "bought" | "sold" | "buyRejected" | "sellRejected" | "undone" | "undoRejected";
  itemId: string;
  /** inventory slot for a sale / a completed purchase; -1 when not applicable */
  slot: number;
  /** rejection reason from the sim; "" on success */
  reason: string;
  /** gold AFTER the transaction; -1 when the event carried none */
  gold: number;
  /**
   * WHICH transaction an `undone` event reversed — the sim's `shopUndone`
   * carries the popped entry's own `kind` ("buy" | "sell") so the toast can say
   * 「已復原賣出」 rather than a generic "undone". "" for every other event.
   */
  undoneKind: string;
  seq: number;
}

export interface SeatView {
  seatId: number;
  teamId: number;
  displayName: string;
  connected: boolean;
  driver: string;
  championId: string;
  /**
   * 這個座位的**積分**（平台 MMR），GH#492 —— owner:「明顯提示姓名與**積分**、
   * 所選英雄」。0 = 平台沒給（bot 座位、dev/LAN 直連），名冊上不畫數字。
   */
  rating?: number;
  /**
   * 這個位子**屬於一個人**嗎（GH#492）。⛔ 不是 `driver !== "ai"` —— 一個斷線的
   * 真人 driver 就是 "ai"，而 owner 要的名冊必須在那一刻仍然看得見他。
   *
   * OPTIONAL，理由和 `roundDeathTick` 一樣：手刻的夾具省略它就是在斷言
   * 「這不是一個真人的位子」，而那正是缺席該有的意思。
   */
  human?: boolean;
  entityId: number;
  level: number;
  gold: number;
  xp: number;
  /**
   * Vitals of THIS seat's champion entity, derived from the snapshot entities
   * map (the same source the overhead HP bars read) — NOT a separate schema
   * field. 0 / false / -1 while the seat has no live entity (champ-select,
   * pre-spawn). Snapshot-rate, same as `cooldowns`; the top-left enemy panel
   * (EnemyTeamPanel) reads them so it needs no server change.
   */
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shield: number;
  alive: boolean;
  /**
   * 這一回合**最後一次**陣亡的絕對 sim tick;0 = 這一回合沒被記過陣亡
   * (還活著 / 輪空被停在場邊 / 還沒生成實體)。GH#257 的金銀銅頒獎台就靠它。
   *
   * 直接從 `SeatState.roundDeathTick` 抄過來,**不是**從 death 事件自己數的:
   * 重連的客戶端沒有事件歷史,而每個螢幕都必須算出同一份名次。
   *
   * OPTIONAL,理由和 `formIndex` 一樣:手刻的 fixture 省略它就是在斷言
   * 「這一回合沒倒過」,而那正是缺席該有的意思。
   */
  roundDeathTick?: number;
  /** duel zone of this seat's entity (-1 = no entity); duel enemies share the local seat's zone */
  zone: number;
  /**
   * WHICH BODY this seat is wearing right now — 0 = 本體, 1..3 = 變身態,
   * decoded off the entity's FORM bits with `formIndexFromFlags` (never by
   * testing bits by hand; see protocol/schema).
   *
   * ⚠️ It exists because `championId` FREEZES at champ-select: 變身 swaps the
   * body on the SAME seat and the SAME entity, so every consumer that reads the
   * seat alone answers 「本體」 for a transformed hero. render/** already had
   * this problem and solved it four times over (championBody / formVisual);
   * the HUD had no way to ask at all, which is why the bottom-right portrait
   * needs it (ui/hud/hudBottomCluster.heroPortraitChampionId).
   *
   * 0 while the seat has no live entity, same convention as the vitals above.
   * OPTIONAL for the same reason `attrBonus` is: a hand-built fixture that
   * omits it is asserting 「本體」, which is exactly what an absent value means.
   */
  formIndex?: number;
  ready: boolean;
  unspentPoints: number;
  items: string[];
  augments: string[];
  abilityRanks: number[];
  /** remaining cooldown ticks Q W E R */
  cooldowns: number[];
  /** per-hero EX skill: id ("" = hero has none), rank (0 locked / 1 unlocked), cd ticks */
  exAbilityId: string;
  exRank: number;
  exCooldown: number;
  /**
   * 天生技 (6th slot) remaining cooldown ticks. No id/rank beside it: which
   * innate the hero owns follows from `championId` (ui/passiveSlot) and its rank
   * is 1 from spawn. 0 for a permanent 被動 innate and for the 3 heroes with none.
   */
  passiveCooldown: number;
  /**
   * ⭐【開關型技能現在開著沒有】—— 六格各一顆 bit（GH#546）。
   * bit i = `CASTABLE_SLOTS[i]`（Q W E R EX PASSIVE），與 `cooldowns` 的索引同一套。
   *
   * ⛔ **讀端一律走 `ui/abilityReadyFrame.ts::seatToggleOn`**，⛔ 不要自己 `& (1 << i)`。
   *
   * ⚠️ 這一格在 2026-08-23 之前**不存在，而下游全都寫好了**：`SeatState.toggleMask`
   * 在線路上、`toggleMaskHas` 是唯一解碼器、`seatToggleOn` 是唯一讀端、六個算繪點
   * 全部呼叫 `AbilityTileFrame` —— 而這一行不在，於是 `seat.toggleMask ?? 0` 永遠是
   * 0，六個算繪點一輩子畫不出開啟框。**消費端存在，但它消費不到**（失敗形態⑧）。
   * ⛔ 而且它連型別都紅不了：唯一的守衛用的是 `{…} as unknown as SeatView` 手刻夾具
   * （失敗形態⑤），所以夾具裡填得進去、出貨路徑上填不進去，兩件事互相看不見。
   *
   * OPTIONAL 的理由與 `attrBonus` 一字不差：省略的夾具就是在斷言「沒有任何技能
   * 開著」，而那正是這一格出現之前畫面上唯一畫得出來的狀態。
   */
  toggleMask?: number;
  /**
   * 能力屬性強化 progress (task #82). `statStacks` is the CONSECUTIVE stat-tick
   * count the shop renders as "N / 20"; it drops to 0 the moment the player
   * buys any real item, so the shop MUST be able to warn before that click.
   * `statCapstonePct` is 0 until 傳說·萬象強化 is earned, then the rolled
   * 10..100 magnitude — so "the path is still live" is `statCapstonePct === 0`.
   * The shop scene (#38) owns how this is drawn; this is the state it reads.
   */
  statStacks: number;
  statCapstonePct: number;
  /**
   * WHAT those ticks bought — the three 三圍 totals 力/敏/智, in `ATTR_KEYS`
   * order (#260). `statStacks` alone is a streak counter and answers nothing
   * about what you actually bought; this is what lets the shop panel print a
   * real 三圍 row and a real (+xxx), and drop its 「≈ 屬性強化未同步」 disclaimer.
   * Empty on a legacy snapshot or a seat with no champion — both mean "nothing
   * bought". OPTIONAL so the many hand-built SeatView fixtures across the test
   * suite stay valid: a fixture that omits it is asserting "no attributes
   * bought", which is exactly what an absent array means on the wire too.
   */
  attrBonus?: number[];
  /**
   * YOUR OWN active status effects — doc ids, and TICKS REMAINING on each.
   * Index-aligned. OPTIONAL for the same reason `attrBonus` is: a hand-built
   * fixture that omits them is asserting 「沒有任何狀態」, which is exactly what
   * an absent array means on the wire.
   */
  statusIds?: string[];
  statusRemainTicks?: number[];
  /**
   * ⭐【具名計數器】(GH#304) —— 你身上每一個計數器的 id 與層數，index-aligned。
   * 一套涵蓋兩個機制：具名標記（十二道試煉的 12 條命）與有 `stacks` 的狀態。
   *
   * ⚠️ 它取代不了 `markChanged` 事件，它取代的是**事件當成狀態用**：事件是
   * 瞬間的，重連/中途加入的客戶端補不回層數，所以層數的**數字**從這裡讀。
   * 事件仍然負責「剛剛免死了」那一下的閃動（`HudState.marks.savedAtMs`）——
   * 那是一個表演，本來就不該在重連後還亮著。
   *
   * OPTIONAL 的理由與 `statusIds` 一字不差：省略的夾具就是在斷言「沒有任何
   * 計數器」，而那正是空陣列在線路上的意思。
   */
  counterIds?: string[];
  counterCounts?: number[];
  /**
   * ⭐【逐格退款】(owner 2026-08-17) —— `items` 每一格現在賣掉拿多少金幣，
   * 以及那一把是不是**隨機取得**的（三選一／寶玉）。index-aligned。
   *
   * ⛔ 客戶端算不出來，所以它必須從線上讀：退款＝**那一格實付**的金額 × 後台
   * 退款率，而實付只有伺服器有。用 `def.cost × 退款率` 推的話，49 把寶具全部
   * 得到 0（標價是 0）、免費發的武器得到一個玩家拿不到的數字。
   *
   * OPTIONAL 的理由與 `statusIds` 一字不差；⚠️ 但這一格缺席的意思是「**還不
   * 知道**」而不是「0」—— 商店那邊要顯示「?」，⛔ 不可以寫 0（那會讓玩家以為
   * 系統把錢吃掉了）。
   */
  itemRefund?: number[];
  itemRandom?: boolean[];
  /**
   * How many buy/sell steps of THIS shopping session can still be reversed
   * (task #121) — the server's own `champ.undoStack.length`.
   *
   * WHY IT IS READ HERE AND NOT INFERRED. The shop used to decide whether to
   * show 「↩ 復原上一步」 from the LAST SHOP EVENT ("was it a bought/sold?"),
   * which is a heuristic and was wrong in both directions: it kept the button
   * lit after the stack had been emptied (so the third press was a silent
   * no-op), and it would have hidden a still-undoable step the moment any other
   * shop event — a rejection — landed on top. The server has always projected
   * the exact depth; this is the field that makes the button's visibility a
   * FACT. 0 while the seat has no champion, and 0 again the instant combat
   * commits the session.
   */
  undoDepth: number;
  /**
   * Kills/deaths this seat scored IN THE CURRENT ROUND — server-authoritative
   * (SeatState.roundKills/roundDeaths), zeroed at every combat entry. NOT the
   * cumulative `kills`/`deaths` records below, which are a local tally off death
   * events and are therefore incomplete for a late/reconnecting client. The
   * round-end presentation (winner model #143 + quote VO #142) ranks the leading
   * team's survivors by these, so every client names the same round MVP.
   */
  roundKills: number;
  roundDeaths: number;
  /**
   * 陣亡投幣 throws left this round (task #191), 0..10. Server-authoritative
   * (SeatState.coinsLeft) for the same reason `undoDepth` is: a dead player's
   * only remaining action must read the same number after a reconnect, and a
   * client-side tally off `coinDropped` events has no history to count.
   */
  coinsLeft: number;
  /**
   * 殭屍擊殺數 — server-authoritative (`SeatState.mobKills`, task #258),
   * MATCH-cumulative, the same counter that grants a level every 30 kills.
   *
   * OPTIONAL for the same reason `statRollCounts` is: the many hand-built
   * SeatView fixtures across the suite omit it, and omitting it asserts 「零隻」,
   * which is exactly what an absent field means on the wire too.
   */
  mobKills?: number;
  offers: OfferView[];
}

export interface TeamView {
  teamId: number;
  lives: number;
  eliminated: boolean;
  placement: number;
  /**
   * What this team did in the round that just ran — a protocol ROUND_OUTCOME
   * value (NONE / FOUGHT / LOST / WON), server-authoritative and reset at every
   * combat entry. NONE means it did not fight: it drew the BYE, is eliminated,
   * or the round is not settled yet. The round-end presentation (winner model
   * #143 + quote VO #142) needs this because a bye team is parked dead and
   * scores nothing, so it is otherwise indistinguishable from a wiped one.
   */
  roundOutcome: number;
}

/**
 * 一場配對決鬥的**權威結果**,`MatchState.duels` 的逐欄投影 (GH#265)。
 *
 * `winner` 是伺服器在「這一區有一邊被清空」的那一 tick 記下的 teamId,
 * `-1` = 這一區還在打(或這份快照不帶配對)。`render/spectateFocus.DuelView`
 * 只把它壓成 `live = winner < 0`,因為攝影機只關心「還在不在打」;頒獎台關心
 * 的是**誰贏**,所以這裡把整個號碼留著。
 */
export interface DuelWinnerView {
  zone: number;
  teamA: number;
  teamB: number;
  /** 勝方 teamId;-1 = 尚未定勝負 */
  winner: number;
}

/** One couch player of THIS machine (player 0 = the owner/primary). */
export interface LocalPlayerView {
  player: number;
  accountId: string;
  seatId: number;
  entityId: number | null;
  teamId: number;
  displayName: string;
  /** integers, snapshot-rate (mini-HUD bars) */
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shield: number;
}

export interface HudState {
  connected: boolean;
  matchId: string;
  phase: string;
  /**
   * The arena being played this round (`MatchState.mapId`, e.g. "arena.nazarick"),
   * "" before a match. GH#531 — the mixer resolves the `combat` bed from it, so
   * each map plays its own battle theme. It is a per-ROUND value: the controller
   * swaps arenas at combat entry and the server re-stamps it every tick.
   */
  mapId: string;
  round: number;
  phaseSecondsLeft: number;
  localSeatId: number | null;
  localEntityId: number | null;
  /**
   * The match's active combat-env multiplier table as JSON (MatchState
   * .combatEnvJson, task #28). The shop's stat preview decodes it with
   * `parseCombatEnvJson` so a hypothetical item is resolved through the SAME
   * env the sim uses — a preview under a non-neutral table must not silently
   * fall back to the all-1.0 defaults. "" = neutral.
   */
  combatEnvJson: string;
  /**
   * 基礎加成 table as JSON (`MatchState.baseBonusJson`) — the FLAT per-stat
   * grants the sim adds AFTER the combat-env multiplier (sim/baseBonus.ts).
   * "" = 「這一場沒帶」, which the reader resolves to the shipped default table,
   * NOT to zero: an empty string must never quietly cost the player 300 HP on
   * the display while the server still gives it to them.
   */
  baseBonusJson: string;
  /**
   * 屬性上限表 as JSON (`MatchState.statCapsJson`, GH#286) —— 每條屬性的一般上限
   * 與解鎖上限 (sim/statCaps.ts)。"" = 「這一場沒帶」,讀取端解成**出貨預設表**,
   * 不是空表:空表會讓解鎖上限塌回一般上限,面板於是永遠印不出 4.0 以上的攻速,
   * 而伺服器照樣讓玩家打到 10.0。
   */
  statCapsJson: string;
  /**
   * 殭屍外觀表 as JSON (`MatchState.mobVisualJson`, GH#192 + #247) —— 染黑強度、
   * 腳下圈圈,以及 #247 的**殭屍王長血條三格**(要不要亮 / 在畫面哪裡 / 什麼時候
   * 亮)。"" = 「這一場沒帶」,`parseMobVisualJson` 逐欄位解成出貨值。
   *
   * ⚠️ 為什麼是 RAW STRING 而不是解好的表:跟上面三格同一個理由 —— 這個 store
   * 只做「把 `MatchState` 上的字串搬過來」,解析留給讀的人(`parseMobVisualJson`),
   * 於是 store 不必知道那張表的形狀,加一格欄位不會動到這個檔。
   *
   * ⚠️ 而且 `GameApp` **也**解它一份(給 3D 那一側的染色與圈圈用)。兩份解析、
   * 同一個字串、同一個純函式,所以不會出現兩種答案。
   */
  mobVisualJson: string;
  /**
   * FIRE RING (#195), replicated straight off `MatchState` — the sim's
   * combat-elapsed ring counter (-1 = disarmed) and the ring's CURRENT world
   * radius. The minimap's danger rim is drawn at this radius rather than at the
   * zone boundary, so the map shows the hazard that exists instead of a rim
   * that pulses over nothing. Deliberately NOT derived from `phaseSecondsLeft`:
   * the ring freezes on round settle while the phase clock keeps running.
   */
  fireRingTicks: number;
  fireRingRadius: number;
  seats: SeatView[];
  teams: TeamView[];
  /**
   * 這一回合的**逐區勝負**,`MatchState.duels` 原封不動抄過來 (GH#265)。
   *
   * ⚠️ 這是伺服器對「誰贏了這一場 3v3」的**權威答案**,而且它是**按 zone** 的。
   * `TeamState.roundOutcome` 不能取代它:一回合有兩個 zone,兩隊都會是 `WON`,
   * 所以任何只讀 `teams` 的推導都必須自己再挑一個 —— 而它挑的是**戰績最好的**
   * 那一隊,不是**你這一區**贏的那一隊。owner 2026-08-03:
   * 「為什麼我最後活著 勝利的還是顯示別的隊伍」就是這麼來的。
   *
   * `render/RoundWinnerStage.planRoundWinnerShow` 讀的就是這一格。之前它整條線
   * 都在(伺服器算了、`net/snapshot.ts` 也送了),只差**沒有人把它搬進 HUD 投影**
   * —— 失敗形態 ②「算出來了但從沒送到客戶端」的最後一哩。
   *
   * 空陣列 = 這一份快照沒有配對(選角 / 中場 / 決賽單場)。
   */
  duels: DuelWinnerView[];
  /** client-side K/D tally from death events (not in the schema) */
  kills: Record<number, number>;
  deaths: Record<number, number>;
  /** local champion resource bars (integers; snapshot-rate, change-guarded) */
  localHp: number;
  localMaxHp: number;
  localMana: number;
  localMaxMana: number;
  localShield: number;
  /** local champion alive state (drives the death-spectator HUD hint) */
  localAlive: boolean;
  lastReject: string | null;
  /** connected gamepad indices (discrete: set on connect/disconnect only) */
  gamepadIndices: number[];
  /** couch players on THIS machine (length 1 = classic single-player) */
  localPlayers: LocalPlayerView[];
  /**
   * Victory-settlement scoreboard: the one-shot MatchSettlement payload the
   * server broadcasts on MSG.EVENT ("matchSettlement") at match end (drives the
   * settlement screen). Null until the match ends. Discrete (fires once), so it
   * belongs here beside the other event-driven projections, not a per-frame path.
   */
  settlement: MatchSettlement | null;
  /**
   * The LOCAL champion's last shop outcome. Discrete (one per click), so it
   * belongs here beside the other event-driven projections. Null until the
   * player's first purchase attempt of the match.
   */
  shopEvent: ShopEventView | null;
  /**
   * The LOCAL player's live 連殺 chain (owner, 2026-07-27), or null.
   *
   * Discrete and event-driven, like `shopEvent` and `settlement` above — NOT a
   * snapshot projection. The count is decided in the sim off `world.tick`
   * (shared/sim/combat/killCombo) and arrives on the `killCombo` event; it is
   * deliberately NOT replicated on `MatchState`, because a 5-second transient
   * would then cost bandwidth every tick to say "still nothing".
   */
  killCombo: KillComboView | null;
  /**
   * 殭屍來襲 (task #258) — how many roguelite MOBS are alive in the LOCAL
   * player's own duel zone right now.
   *
   * WHY IT IS COUNTED FROM THE ENTITY MAP AND NOT SENT AS ITS OWN FIELD. The
   * mobs are already on the wire: they are `EntityState` rows with
   * `kind === ENTITY_KIND.MOB`, and the client renders every one of them. A
   * dedicated counter would be a SECOND opinion about how many zombies exist,
   * which is exactly how a HUD number starts disagreeing with the screen. This
   * is a projection of the authoritative set, so 「來襲」 fires on the same
   * snapshot that puts the first zombie on the floor.
   *
   * SCOPED TO YOUR OWN ZONE, like the minimap (#67): the other arena's wave is
   * not coming for you, and a count that includes it would make the banner fire
   * while your own floor is still empty.
   */
  mobsAlive: number;
  /**
   * 殭屍王 (task #262 / GH #190) — the LAST king moment this client saw, or null.
   *
   * ONE SLOT FOR BOTH HALVES (降臨 banner and 分紅結算), because they are two
   * beats of the same event and only one of them can be the current one: the
   * king has to be summoned before it can be killed, and the settlement is the
   * thing you want on screen the instant it lands. A `slain` therefore
   * OVERWRITES a `spawn` — see `recordMobBossEvent`.
   *
   * Discrete and event-driven, exactly like `killCombo` / `settlement` above:
   * `mobBossSpawn` / `mobBossSlain` cross the wire once per king (eventFanout),
   * and NOTHING about the split is on `MatchState` — the damage ledger is
   * sim-only, so this event is the only way the numbers can ever reach a screen.
   */
  mobBoss: MobBossView | null;
  /**
   * 場上**現在還活著的每一隻王**的降臨事件 (GH#268)。空陣列 = 沒有王。
   *
   * ⚠️ 為什麼這不是 {@link HudState.mobBoss} 的一個查詢，而是第二個欄位：
   * 上面那一格是「**最後一則**王的消息」，這一格是「**現在**有哪些王」——
   * 兩個不同壽命的問題，而把它們塞進同一個槽正是 GH#268 的根因。
   *
   * 自 #288 起**每一隻特殊殭屍死掉也會發 `mobBossSlain`**
   * （`sim/systems/MobSystem.ts`），所以 `mobBoss` 一秒內會被翻好幾次；長血條
   * 讀它就會在王滿血的時候消失。這裡只認 `bossId`：一顆 `mobBossSpawn` 進來就
   * 入列，**只有同一顆 bossId 的 `mobBossSlain`** 能把它移出，別區的王、別隻精英
   * 都動不了別人那一筆。
   *
   * ⚠️ **是清單不是一格**：王的每回合上限預設算「每個戰場」
   * （`MobBossRules.maxPerRoundScope` 出貨 `"zone"`），四個 duel zone 可以同時各有
   * 一隻王，而事件是廣播給整場的。用一格存就變成「隔壁區一召喚，我的血條就沒了」。
   *
   * ⚠️ 回合結束時小怪是**靜默 despawn** 的（`MobSystem` 不發 `mobBossSlain`），
   * 所以一筆過期的紀錄可能留在這裡。它是惰性的 —— `mobBossMarkerFor` 要求那一列
   * 還在快照裡而且 alive —— 而且清單被截到 {@link MAX_LIVE_BOSSES} 筆，不會長大。
   *
   * 消費者：`GameApp.updateFrameBus` → `frameBus.mobBoss` → `ui/hud/BossHealthBar`
   * 與小地圖的紅點。⚠️ 分紅結算面板（`MobBossOverlay`）**不可以**改讀這一格 ——
   * 它要的正是「最後一則結算」，那是 `mobBoss`。
   */
  mobBossLive: MobBossView[];
  /**
   * 【具名標記】—— 本機英雄身上每一個標記的層數（GH#278）。
   *
   * ⛔ **這一格已經不是層數的來源了（GH#304）。** 這裡原本寫著「`markChanged`
   * / `lethalSaved` 這兩顆事件是層數唯一能到螢幕的通道」，而 owner 2026-08-09
   * 裁決加一個快照欄位之後那句話是假的（第三守則）：層數走
   * `SeatView.counterIds` / `counterCounts`，`MarkBar` 從那裡讀。
   *
   * 這一格活下來只為了**免死那一下的閃動**（`savedAtMs`）與重播閃動的 `seq`。
   * 那是一個瞬間的表演，事件正是它該走的通道 —— 反過來，層數是**狀態**，而
   * 事件補不回中途加入／重連的客戶端漏掉的歷史，那就是 owner 選欄位的理由。
   * `count` 仍然被寫進來（同一顆事件帶著它），但畫面不讀它。
   *
   * 只收**自己**的：事件帶的是 ENTITY id，`recordMarkEvent` 拿它跟
   * `localEntityId` 比對，跟 `killCombo` 用 seat 比對是同一條規矩。敵人剩幾層
   * 試煉不是這一格要回答的問題。
   */
  marks: MarkView[];
  /**
   * ⭐ GH#737 —— 這一場我的分數／排名（伺服器 1 Hz 送，回合結束再送一則 `final`）。
   *
   * ⚠️ ⭐ **客戶端刻意不自己算**：`score` 是 `rankScore` 那個式子的輸出，
   * 與結算頁 `SettlementPlayer.score` **逐位元同一條路**。
   * ⛔ 在這裡再算一次 = 兩個式子，而它們遲早會漂 —— 而玩家會相信比較大的那個
   * （第〇·四守則：一個值一個住處）。
   *
   * `null` = 還沒收到第一則（比賽剛開始）。
   */
  roundScore: RoundScoreView | null;
  /**
   * ⭐ GH#731 通訊輪盤的**畫面狀態**（圓心／格子／指到誰）。
   * `null` ＝ 沒開。⛔ 它不是輸入狀態 —— 真正的狀態機住 `game/commsWheel.ts`，
   * 這裡只是**畫它需要的那幾個數字**（⭐ 讓 HUD 不必 import GameApp）。
   */
  commsWheel: {
    centre: { x: number; y: number };
    entries: readonly { id: string; zh: string; voiceCategory: string }[];
    hovered: number | null;
  } | null;
}

/**
 * One live combo. `atMs` is a `performance.now()`-style stamp (monotone — it
 * cannot jump when the OS clock is corrected mid-fight); `seq` bumps on every
 * credited kill so the HUD can restart its pop animation on a re-hit, which
 * re-assigning the same CSS animation name would not do.
 */
export interface KillComboView {
  count: number;
  atMs: number;
  seq: number;
}

/**
 * How 「補最後一刀的人獎金翻倍」 was paid out for this king.
 *
 * ALIASED FROM THE SIM'S OWN UNION rather than re-typed as a string literal
 * pair: the mode decides which sentence the settlement panel prints, so a third
 * mode added in `sim/mobBoss.ts` must break this file's `switch`-shaped code at
 * typecheck instead of silently falling through to the 「總獎金固定」 wording.
 */
export type MobBossLastHitMode = LastHitMode;

/** One participant's line on the king's payout sheet (sim/mobBoss.BossBountyShare). */
export interface MobBossShareView {
  /** seat of the paid champion; -1 when the sim could not resolve one */
  seatId: number;
  /**
   * damage this champion did to the king — the SHARE BASIS, before either mode's
   * 補刀 handling. ⚠️ IT DOES NOT RANK THE SHEET: in `"bonus"` mode the biggest
   * damager is not necessarily the biggest earner (see `bossSortedShares`).
   */
  damage: number;
  gold: number;
  xp: number;
  /**
   * 等級提升 actually GRANTED to this champion (GH#206). `MobSystem.payBossBounty`
   * sends what `grantLevels` handed out, not what the split requested — the two
   * diverge at `LEVEL_CAP`, and a sheet that printed the request would promise a
   * level 99 champion a level it never got.
   */
  levels: number;
  /**
   * true = this champion landed the killing blow.
   *
   * ⚠️ WHAT THAT PAYS DEPENDS ON {@link MobBossView.lastHitMode} — this used to
   * say 「the 翻倍 WEIGHT, not a bonus」 and since GH#206 that is only true in
   * `"weight"` mode. In the shipped `"bonus"` mode the last hitter is paid their
   * proportional share AND ONE EXTRA COPY OF IT, so the sheet's rows can sum to
   * more than the configured pool. Nothing here re-derives either way; both the
   * per-row numbers and the totals arrive already paid.
   */
  lastHit: boolean;
}

/**
 * A 殭屍王 beat, projected off the wire. Same clock discipline as
 * {@link KillComboView}: `atMs` is `comboNowMs()` (monotone), `seq` bumps per
 * recorded event so a second king restarts the entry animation.
 */
/**
 * #291 —— **哪一種怪**打完了這一場分紅：殭屍王，還是一隻特殊殭屍。
 *
 * ⚠️ 名字刻意不叫 `kind`。`MobBossView.kind` 已經是 `"spawn" | "slain"`（哪一個
 * 節拍），而 payload 上的 `kind` 是 `"boss" | "special"`（哪一種怪）—— 兩個不同
 * 的問題共用一個字，就是下一個人寫 `view.kind === "special"` 然後永遠拿到 false
 * 的方式。
 */
export type MobBossMobKind = "boss" | "special";

export interface MobBossView {
  kind: "spawn" | "slain";
  /**
   * #291 —— 這一則說的是**王**還是**特殊殭屍**。
   *
   * owner 2026-08-03:「特殊殭屍 不應該用殭屍王 分紅結算畫面」。兩種怪走的是同一顆
   * `mobBossSlain`（sim/systems/MobSystem 的 #288 決定，理由寫在那裡），而
   * `kind` **一直都在 payload 上**；缺的是這一行讀它。MobSystem 自己的註解就把
   * 代價寫出來了：「until the client reads `kind`, a special's settlement renders
   * with the king's wording and takes the king's single panel slot」——
   * 也就是失敗形態 ②，資料過了線但沒有人接。
   */
  mobKind: MobBossMobKind;
  atMs: number;
  seq: number;
  /** spawn: the summoner's seat (-1 unknown); slain: unused */
  summonerSeatId: number;
  /** spawn: TRUE when the local seat is the one whose 100 kills summoned it */
  mine: boolean;
  /** spawn: the summoner's cumulative zombie tally that crossed the threshold */
  kills: number;
  /**
   * spawn: WHOSE FACE the king walked in wearing — the champion id the sim
   * resolved at arm time (`MobBossRules.championId`). `""` = unknown.
   *
   * ⚠️ NOT DERIVABLE FROM THE MESH, which is why it rides the wire: the shipped
   * `mobWaves.boss.championSource` is `"random"`, so the king is a DIFFERENT
   * champion from one arm to the next, and `EntityState.key` names a model doc,
   * not a character. `ui/hud/bossIntroModel` looks this id up to find the 名言／
   * 描述／攻略要點／弱點 that the 出場演出 shows.
   *
   * Empty on `slain`: the settlement is about money, not about who it was.
   */
  championId: string;
  /** slain: the whole split, ascending by entity id as the sim emitted it */
  shares: MobBossShareView[];
  /**
   * slain: what was ACTUALLY PAID (the sum of the shares), never the configured
   * pool — so the panel cannot invent a total.
   *
   * ⚠️ SINCE GH#206 THIS CAN EXCEED THE CONFIGURED POOL. In the shipped
   * `"bonus"` mode the last hitter is paid an extra copy of their own share, so
   * the sum lands in `[pool, pool × lastHitMultiplier]` — a champion who did all
   * the damage and landed the blow takes 200%. Any consumer that substitutes the
   * admin's `bountyGold` for this is lying to the player.
   */
  totalGold: number;
  totalXp: number;
  /** slain: 等級提升 actually granted across every share (post-`LEVEL_CAP`) */
  totalLevels: number;
  /** slain: `boss.lastHitMultiplier` — what the 補刀 is worth, in either mode */
  lastHitMultiplier: number;
  /**
   * slain: HOW the 補刀 was paid (sim `boss.lastHitMode`, admin-switchable).
   *
   *   · `"bonus"`  (shipped default) — split by raw damage, then hand the last
   *     hitter one EXTRA copy of their own share. THE TOTAL IS NOT CONSERVED.
   *   · `"weight"` — the last hitter's damage counts ×mult in the denominator,
   *     so `sum(payout) === pool` exactly.
   *
   * The panel's rule sentence is chosen by this (`bossRuleNote`): the two modes
   * need opposite sentences and printing the wrong one is a false statement
   * about the player's money.
   */
  lastHitMode: MobBossLastHitMode;
  /** slain: seat that landed the killing blow, -1 when nobody did */
  killerSeatId: number;
  /** the king's entity id (`ev.data.id`), -1 unknown — the key that lets a
   *  `slain` inherit the `zone` its own `spawn` carried. */
  bossId: number;
  /**
   * THE DUEL ZONE THE KING BELONGS TO, -1 when it could not be resolved.
   *
   * Both events are FANNED OUT TO EVERY CLIENT IN THE MATCH (game-server
   * net/eventFanout), but a king is summoned into exactly ONE of the four duel
   * zones. `combatSfx.bossHorrorKey` already refuses to play the 4.4 s dread
   * drone in the other arena's ears for precisely this reason; the SCREEN owes
   * the same courtesy, and owes it harder — the banner and the settlement sheet
   * eat the centre corridor and the 連殺 counter yields to them, so an
   * un-gated king costs a player in arena B real HUD for a fight in arena A
   * that he cannot see, cannot join and will never be paid by.
   *
   * `mobBossSlain` does NOT carry a zone (the king's entity is already
   * destroyed by then), so it inherits the one its matching `mobBossSpawn`
   * carried — see `recordMobBossEvent`.
   */
  zone: number;
}

const initial: HudState = {
  connected: false,
  matchId: "",
  phase: "connecting",
  mapId: "",
  round: 0,
  phaseSecondsLeft: 0,
  localSeatId: null,
  localEntityId: null,
  combatEnvJson: "",
  baseBonusJson: "",
  statCapsJson: "",
  mobVisualJson: "",
  fireRingTicks: -1,
  fireRingRadius: 0,
  seats: [],
  teams: [],
  duels: [],
  kills: {},
  deaths: {},
  localHp: 0,
  localMaxHp: 0,
  localMana: 0,
  localMaxMana: 0,
  localShield: 0,
  localAlive: false,
  lastReject: null,
  gamepadIndices: [],
  localPlayers: [],
  settlement: null,
  shopEvent: null,
  killCombo: null,
  mobsAlive: 0,
  mobBoss: null,
  mobBossLive: [],
  marks: [],
  roundScore: null,
  commsWheel: null,
};

let shopEventSeq = 0;

export const hudStore = createStore<HudState>(() => ({ ...initial }));

/**
 * The store as `useStore` sees it, with ONE field overridden: the SERVER
 * snapshot is the LIVE state, not the module-load state.
 *
 * WHY — and this is the same trap `ui/leaveFlow.useLeaveConfirm` and
 * `ui/platform/store.useApp` each hand-rolled a hook to escape. zustand's
 * `useStore` passes `api.getInitialState` to `useSyncExternalStore` as the
 * server snapshot, and `react-dom/server`'s `renderToStaticMarkup` is the ONLY
 * way this repo's `node`-env client tests render React. Under the default, a
 * test that puts the HUD into combat and then renders `<HudRoot />` gets the
 * store AS IT LOOKED AT MODULE LOAD — the 「Connecting to match…」 box — so every
 * 「the mounted HUD really paints it」 guard silently asserts against a blank
 * page. That is this repo's failure ③ (deletable from the render tree, still
 * green) built into the plumbing.
 *
 * Overriding the field rather than hand-rolling the hook keeps `net/*` free of
 * a direct React import, which `architecture.test.ts` (client-08) enforces —
 * zustand's `useStore` is the one React seam this layer is allowed.
 *
 * There is no correctness cost: `HudState` has no server/client split, the
 * browser path already reads `getState`, and a real SSR pass of the in-match
 * HUD does not exist.
 */
const hudApi = { ...hudStore, getInitialState: hudStore.getState };

/** React hook (typed selector over the vanilla store). */
export function useHud<T>(selector: (s: HudState) => T): T {
  return useStore(hudApi, selector);
}

// ---------------------------------------------------------------------------
// schema → store projection (called from room.onStateChange, at SNAPSHOT_HZ)
// ---------------------------------------------------------------------------

let seatsCacheKey = "";
let teamsCacheKey = "";
let duelsCacheKey = "";
let localsCacheKey = "";

/**
 * ⭐ GH#618 —— **`offers` 的身分要跟著內容走，⛔ 不跟著快照走。**
 *
 * 這個檔的檔頭逐字承諾「Every write is change-guarded so snapshot patches that
 * don't alter HUD-visible values cause zero re-renders」，而 `seats` 那道
 * change-guard 只保護**整個陣列**：它的快取鍵含 `cooldowns` / `mana` /
 * `statusRemainTicks`，中場每一張快照都在動 ⇒ `patch.seats` 每張都換一次身分，
 * 於是**巢狀在裡面的 `offers` 也每張換一次**。
 *
 * ⚠️ 對只讀純量的消費端無所謂（`IntermissionStage` 的 `offerCount`、
 * `PrepClock` 都刻意只取數字並逐字寫下理由），但 `AugmentDraftPanel` 訂的是
 * **陣列本身** —— 那是全 client 唯一一個 ⇒ 三選一子樹從卡片出現到玩家選完為止，
 * **每一張快照重跑一次 React**（量到：20 張快照 = 20 次 commit）。
 *
 * ⭐ 修在**來源**而不是那個面板上：這樣任何未來訂 `offers` 的消費端都免疫，
 * 而且「這一份 offer 有沒有變」只有一個住處。
 * ⛔ 不可以用 `seatsCacheKey` 代替 —— 它含每幀都在動的欄位，永遠不相等。
 */
const offersCache = new Map<number, { key: string; view: OfferView[] }>();

/** 同一個座位、同樣的三張牌 ⇒ 回**上一次那一個陣列**（身分不變）。 */
function stableOffers(seatId: number, next: OfferView[]): OfferView[] {
  const key = JSON.stringify(next);
  const hit = offersCache.get(seatId);
  if (hit && hit.key === key) return hit.view;
  offersCache.set(seatId, { key, view: next });
  return next;
}
/** couch accountIds of this machine, index = local player (0 = primary) */
let localAccounts: string[] = [];

export function resetHudStore(): void {
  // ⭐ GH#570 —— 換場了,下一張快照重新 claim。⛔ 忘了這一行會讓上一場的
  //    matchId 永遠贏,而新的一場整個 HUD 是空的（突變③驗的就是這個方向）。
  ownerMatchId = null;
  hudStore.setState({ ...initial }, true);
  seatsCacheKey = "";
  teamsCacheKey = "";
  duelsCacheKey = "";
  localsCacheKey = "";
  // ⛔ 換場了就丟掉 offer 的身分快取 —— 留著會讓下一場「同一個座位、同一組牌」
  //    拿到**上一場**那個陣列（同型於上面那條 matchId）。
  offersCache.clear();
  localAccounts = [];
  shopEventSeq = 0;
}

/** Register this machine's couch accountIds (MultiSession, at connect). */
export function setLocalAccounts(accounts: string[]): void {
  localAccounts = [...accounts];
}

/**
 * ⭐ GH#570 —— **這一場**的 matchId。第一張快照 claim，`resetHudStore()` 清掉。
 *
 * ⛔ 在此之前 `syncHudFromState` 對「這張快照來自**哪一間房**」零檢查 ——
 * 而 `hudStore` 是**模組層全域**的。一間幽靈房（我離開之後才抵達、卻被接上的房）
 * 因此可以每 20 Hz 覆寫玩家的 matchId / phase / **血條**。
 *
 * ⭐ 量到的：離開房間 → 進練習模式，320 秒之後幽靈房的 champSelect 到期
 * → `autoPickAndSpawn()` → 我的座位被 AI 接管 → 那個「我」繼續挨打
 * ⇒ **練習模式畫面上的血條被打到 0/6761**。逐字就是 owner 說的
 * 「隱形的英雄在攻擊我、喊出語音、特效、給我傷害」。
 *
 * ⚠️ 這是**縱深**那一層：F1（`bind()` 的閘）已經擋住來源，這一格讓未來任何一條
 * 漏網的 socket **無害**，而且它會**出聲**（`perfBus.foreignSnapshots`）。
 */
let ownerMatchId: string | null = null;

export function syncHudFromState(state: MatchState, localAccountId: string): void {
  // ⭐ 第一張快照 claim 這一場;之後任何**別人的** matchId 一律丟掉並記一筆。
  if (ownerMatchId === null) {
    if (state.matchId) ownerMatchId = state.matchId;
  } else if (state.matchId && state.matchId !== ownerMatchId) {
    perfBus.foreignSnapshots++;
    return;
  }
  const prev = hudStore.getState();
  const patch: Partial<HudState> = {};

  if (!prev.connected) patch.connected = true;
  if (prev.matchId !== state.matchId) patch.matchId = state.matchId;
  if (prev.phase !== state.phase) patch.phase = state.phase;
  // GH#531 — the arena drives which battle theme the mixer plays. Diffed
  // like every other field so a 20 Hz snapshot of an unchanged arena is a
  // no-op and never restarts the bed mid-round.
  if (prev.mapId !== state.mapId) patch.mapId = state.mapId;
  if (prev.round !== state.round) patch.round = state.round;

  const secondsLeft = Math.max(0, Math.ceil(state.phaseTicksLeft / TICK_HZ));
  if (prev.phaseSecondsLeft !== secondsLeft) patch.phaseSecondsLeft = secondsLeft;

  if (prev.combatEnvJson !== state.combatEnvJson) patch.combatEnvJson = state.combatEnvJson;
  if (prev.baseBonusJson !== state.baseBonusJson) patch.baseBonusJson = state.baseBonusJson;
  if (prev.statCapsJson !== state.statCapsJson) patch.statCapsJson = state.statCapsJson;
  // #247 —— 殭屍王長血條的三格設定騎在這張表上;HUD 讀它決定要不要畫、畫在哪。
  if (prev.mobVisualJson !== state.mobVisualJson) patch.mobVisualJson = state.mobVisualJson;

  // fire ring (#195): change-guarded like everything else here, but the radius
  // moves 0.039 u per sim tick while shrinking, so in practice it patches on
  // every snapshot for those 20 seconds — which is the point.
  if (prev.fireRingTicks !== state.fireRingTicks) patch.fireRingTicks = state.fireRingTicks;
  if (prev.fireRingRadius !== state.fireRingRadius) patch.fireRingRadius = state.fireRingRadius;

  // ---- seats (sorted by seatId; JSON key change-guard) ----
  const seats: SeatView[] = [];
  let localSeatId: number | null = null;
  let localEntityId: number | null = null;
  state.seats.forEach((ss) => {
    if (ss.accountId === localAccountId) {
      localSeatId = ss.seatId;
      localEntityId = ss.entityId > 0 ? ss.entityId : null;
    }
    // vitals from the entity snapshot (same map the overhead HP bars use); a
    // DEAD champion stays in the map with hp 0 / alive false, so the enemy
    // panel greys it out rather than losing the row.
    let hp = 0;
    let maxHp = 0;
    let mana = 0;
    let maxMana = 0;
    let shield = 0;
    let alive = false;
    let zone = -1;
    let formIndex = 0;
    if (ss.entityId > 0) {
      const es = entitiesOf(state).get(String(ss.entityId));
      if (es) {
        hp = Math.round(es.hp);
        maxHp = Math.round(es.maxHp);
        mana = Math.round(es.mana);
        maxMana = Math.round(es.maxMana);
        shield = Math.round(es.shield);
        alive = es.alive;
        zone = es.zone;
        formIndex = formIndexFromFlags(es.flags ?? 0);
      }
    }
    seats.push({
      seatId: ss.seatId,
      teamId: ss.teamId,
      displayName: ss.displayName,
      connected: ss.connected,
      driver: ss.driver,
      championId: ss.championId,
      // GH#492 積分。`?? 0` 是給手刻 fixture 與舊 snapshot 的：缺席讀成「平台沒給」,
      // 而那正是缺席該有的意思。
      rating: ss.rating ?? 0,
      human: ss.human ?? false,
      entityId: ss.entityId,
      level: ss.level,
      gold: ss.gold,
      xp: ss.xp,
      hp,
      maxHp,
      mana,
      maxMana,
      shield,
      alive,
      // GH#257: read off the SEAT (authoritative, survives a reconnect), not
      // tallied from the death-event stream this file also happens to see.
      roundDeathTick: ss.roundDeathTick ?? 0,
      zone,
      formIndex,
      ready: ss.ready,
      unspentPoints: ss.unspentPoints,
      items: [...ss.items],
      augments: [...ss.augments],
      abilityRanks: [...ss.abilityRanks],
      cooldowns: [...ss.cooldowns],
      exAbilityId: ss.exAbilityId,
      exRank: ss.exRank,
      exCooldown: ss.exCooldown,
      passiveCooldown: ss.passiveCooldown,
      // ⭐【開關型技能開著沒有】GH#546 —— 這一行是「開著」這件事到得了螢幕的**全部**。
      // ⛔ 少了它，`seatToggleOn()` 永遠回 false，而「永遠關著」與「這支技能沒有
      // 開關」在畫面上逐位元一模一樣（宣告上寫著為什麼型別層也擋不住）。
      // `?? 0` 覆蓋舊/未投影的快照 —— 讀成「沒有任何技能開著」。
      toggleMask: ss.toggleMask ?? 0,
      statStacks: ss.statStacks,
      statCapstonePct: ss.statCapstonePct,
      attrBonus: [...(ss.attrBonus ?? [])],
      statusIds: [...(ss.statusIds ?? [])],
      statusRemainTicks: [...(ss.statusRemainTicks ?? [])],
      // 【具名計數器】(GH#304)。`?? []` 覆蓋舊/未投影的快照 —— 讀成「沒有任何
      // 計數器」,跟這裡每一個 append 上來的欄位同一種降級。
      counterIds: [...(ss.counterIds ?? [])],
      counterCounts: [...(ss.counterCounts ?? [])],
      // 【逐格退款】(owner 2026-08-17)。⚠️ 舊/未投影的快照留下**空陣列**，而
      // 商店讀的是 `itemRefund[slot] === undefined` → 顯示「?」。⛔ 不要在這裡
      // 補 0：那會把「還不知道」變成一個看起來很確定的假金額。
      itemRefund: [...(ss.itemRefund ?? [])],
      itemRandom: [...(ss.itemRandom ?? [])],
      undoDepth: ss.undoDepth,
      roundKills: ss.roundKills,
      roundDeaths: ss.roundDeaths,
      coinsLeft: ss.coinsLeft,
      // 殭屍擊殺數 (#258). `?? 0` covers a legacy/unprojected snapshot, which
      // reads as 「還沒殺過」 — the same degradation every other appended field
      // gets here.
      mobKills: ss.mobKills ?? 0,
      // ⭐ GH#618 —— 內容沒變就回**同一個陣列**（見 `stableOffers` 的宣告）。
      offers: stableOffers(
        ss.seatId,
        ss.offers.map((o) => ({
          offerId: o.offerId,
          tier: o.tier,
          choices: [...o.choices],
        })),
      ),
    });
  });
  seats.sort((a, b) => a.seatId - b.seatId);
  const seatsKey = JSON.stringify(seats);
  if (seatsKey !== seatsCacheKey) {
    seatsCacheKey = seatsKey;
    patch.seats = seats;
  }
  if (prev.localSeatId !== localSeatId) patch.localSeatId = localSeatId;
  if (prev.localEntityId !== localEntityId) patch.localEntityId = localEntityId;

  // ---- teams ----
  const teams: TeamView[] = state.teams.map((t) => ({
    teamId: t.teamId,
    lives: t.lives,
    eliminated: t.eliminated,
    placement: t.placement,
    roundOutcome: t.roundOutcome,
  }));
  const teamsKey = JSON.stringify(teams);
  if (teamsKey !== teamsCacheKey) {
    teamsCacheKey = teamsKey;
    patch.teams = teams;
  }

  // ---- duels (GH#265): 伺服器逐區記下的勝負,原封不動 ----
  // `?? []` 是給舊快照 / 手刻 fixture 的:沒有這一欄讀成「這一份不帶配對」,
  // 頒獎台於是退回推導,而不是炸掉。
  const duels: DuelWinnerView[] = [...(state.duels ?? [])].map((d) => ({
    zone: d.zone,
    teamA: d.teamA,
    teamB: d.teamB,
    winner: d.winner,
  }));
  const duelsKey = JSON.stringify(duels);
  if (duelsKey !== duelsCacheKey) {
    duelsCacheKey = duelsKey;
    patch.duels = duels;
  }

  // ---- couch players (per-viewport mini-HUD; length 1 in classic play) ----
  const accounts = localAccounts.length > 0 ? localAccounts : [localAccountId];
  const locals: LocalPlayerView[] = [];
  state.seats.forEach((ss) => {
    const player = accounts.indexOf(ss.accountId);
    if (player < 0) return;
    const entityId = ss.entityId > 0 ? ss.entityId : null;
    const lp: LocalPlayerView = {
      player,
      accountId: ss.accountId,
      seatId: ss.seatId,
      entityId,
      teamId: ss.teamId,
      displayName: ss.displayName,
      hp: 0,
      maxHp: 0,
      mana: 0,
      maxMana: 0,
      shield: 0,
    };
    if (entityId !== null) {
      const es = entitiesOf(state).get(String(entityId));
      if (es) {
        lp.hp = Math.round(es.hp);
        lp.maxHp = Math.round(es.maxHp);
        lp.mana = Math.round(es.mana);
        lp.maxMana = Math.round(es.maxMana);
        lp.shield = Math.round(es.shield);
      }
    }
    locals.push(lp);
  });
  locals.sort((a, b) => a.player - b.player);
  const localsKey = JSON.stringify(locals);
  if (localsKey !== localsCacheKey) {
    localsCacheKey = localsKey;
    patch.localPlayers = locals;
  }

  // ---- 殭屍來襲 (#258): mobs alive in the LOCAL player's own duel zone ----
  // Counted from the authoritative entity map rather than sent as its own
  // field: the zombies are already replicated (kind 6) and already rendered, so
  // a second counter could only ever disagree with the screen. Zone-scoped like
  // the minimap (#67) — the other arena's wave is not coming for you.
  let mobsAlive = 0;
  if (localEntityId !== null) {
    const me = entitiesOf(state).get(String(localEntityId));
    if (me) {
      const myZone = me.zone;
      entitiesOf(state).forEach((es) => {
        if (es.kind === ENTITY_KIND.MOB && es.alive && es.zone === myZone) mobsAlive++;
      });
    }
  }
  if (prev.mobsAlive !== mobsAlive) patch.mobsAlive = mobsAlive;

  // ---- local resource bars (integers to bound update rate) ----
  if (localEntityId !== null) {
    const es = entitiesOf(state).get(String(localEntityId));
    if (es) {
      const hp = Math.round(es.hp);
      const maxHp = Math.round(es.maxHp);
      const mana = Math.round(es.mana);
      const maxMana = Math.round(es.maxMana);
      const shield = Math.round(es.shield);
      if (prev.localHp !== hp) patch.localHp = hp;
      if (prev.localMaxHp !== maxHp) patch.localMaxHp = maxHp;
      if (prev.localMana !== mana) patch.localMana = mana;
      if (prev.localMaxMana !== maxMana) patch.localMaxMana = maxMana;
      if (prev.localShield !== shield) patch.localShield = shield;
      if (prev.localAlive !== es.alive) patch.localAlive = es.alive;
    }
  }

  if (Object.keys(patch).length > 0) hudStore.setState(patch);
}

/** Tally K/D from death events (kills/deaths aren't in the schema). */
export function recordDeathEvent(ev: EventMessage, state: MatchState): void {
  if (ev.type !== "death") return;
  const victimEntity = ev.data.id as number | undefined;
  const killerEntity = ev.data.killer as number | null | undefined;
  if (victimEntity === undefined) return;
  const bySeat = (entityId: number | null | undefined): number | null => {
    if (entityId === null || entityId === undefined) return null;
    let found: number | null = null;
    state.seats.forEach((ss) => {
      if (ss.entityId === entityId) found = ss.seatId;
    });
    return found;
  };
  const victimSeat = bySeat(victimEntity);
  const killerSeat = bySeat(killerEntity);
  if (victimSeat === null && killerSeat === null) return;
  const prev = hudStore.getState();
  const deaths = { ...prev.deaths };
  const kills = { ...prev.kills };
  if (victimSeat !== null) deaths[victimSeat] = (deaths[victimSeat] ?? 0) + 1;
  if (killerSeat !== null && killerSeat !== victimSeat) kills[killerSeat] = (kills[killerSeat] ?? 0) + 1;
  hudStore.setState({ deaths, kills });
}

export function recordReject(reason: string): void {
  hudStore.setState({ lastReject: reason });
}

/* ── 連殺 COMBO (owner 2026-07-27) ──────────────────────────────────────────
 * 「戰鬥時擊殺殭屍或英雄間隔5秒內會顯示 combo 連殺數量」.
 *
 * The COUNT is not computed here — the sim decides it off `world.tick`, so
 * every client and the replay agree (shared/sim/combat/killCombo.ts). This is
 * only the projection of the `killCombo` event onto the HUD store, and it lives
 * in THIS file because `architecture.test.ts` (client-08) allows zustand
 * `setState` in exactly one place: an event fan-out that writes stores from all
 * over the client is how a per-frame re-render storm gets in.
 *
 * WHOSE COMBO: yours. `killerSeatId` gates it exactly as `guardianSlain` /
 * `coinPickedUp` gate their cues on the local seat — a teammate's zombie sweep
 * reading as your own chain would break the feedback loop the feature is for.
 */

/**
 * PURE: the chain length this event credits to `localSeatId`, or null when it
 * is not a combo, not ours, or malformed. Split out so 「someone else's kill
 * must not show on my screen」 is a direct assertion, not a store inference.
 */
export function localKillComboCount(ev: EventMessage, localSeatId: number | null): number | null {
  if (ev.type !== KILL_COMBO_EVENT) return null;
  if (localSeatId === null || localSeatId === undefined) return null;
  const seat = ev.data.killerSeatId;
  if (typeof seat !== "number" || seat !== localSeatId) return null;
  const count = ev.data.count;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) return null;
  return count;
}

/** Record one drained `killCombo` event (called from GameApp's event drain). */
export function recordKillComboEvent(ev: EventMessage, nowMs: number = comboNowMs()): void {
  const prev = hudStore.getState();
  const count = localKillComboCount(ev, prev.localSeatId);
  if (count === null) return;
  hudStore.setState({
    killCombo: { count, atMs: nowMs, seq: (prev.killCombo?.seq ?? 0) + 1 },
  });
}

/* ── 【具名標記】(GH#278) ────────────────────────────────────────────────────
 * owner 的規格：「初始擁有十二層 [試煉] 標記。受到致命傷害時消耗一層試煉…」
 *
 * 層數是 sim 決定的（`shared/sim/marks.ts` + `combat/lethalSave.ts`），這裡只做
 * 事件 → store 的投影，理由跟 `recordKillComboEvent` 一模一樣：
 * `architecture.test.ts`(client-08) 只准這一支檔案呼叫 zustand `setState`。
 *
 * 兩顆事件都收，而且它們**不重複**：
 *   markChanged  `{ id, markId, count }`    —— 層數變了（進場發放 / 消耗 / 回合重置）
 *   lethalSaved  `{ id, markId, remaining, spent, hp }` —— 剛剛靠它免死了
 * 免死那一刻 `lethalSave.ts` 會**先**發 markChanged 再發 lethalSaved，所以第二顆
 * 帶的 `remaining` 跟第一顆的 `count` 一致；這裡兩邊都讀，任一顆掉包了層數也對。
 */

/** 這顆事件是不是標記事件（GameApp 的 drain 用來省掉一次函式呼叫）。 */
export function isMarkEvent(type: string): boolean {
  return type === MARK_CHANGED_EVENT || type === LETHAL_SAVED_EVENT;
}

const MARK_CHANGED_EVENT = "markChanged";
const LETHAL_SAVED_EVENT = "lethalSaved";

/**
 * PURE：這顆事件對**本機英雄**說了什麼，或 null（不是標記事件 / 不是我的 / 壞的）。
 *
 * 拆出來的理由跟 {@link localKillComboCount} 一樣 ——「別人的試煉不可以畫在我的
 * HUD 上」要能被直接斷言，而不是繞過 store 去推論。
 */
export function localMarkUpdate(
  ev: EventMessage,
  localEntityId: number | null,
): { markId: string; count: number; saved: boolean } | null {
  if (!isMarkEvent(ev.type)) return null;
  if (localEntityId === null) return null;
  const id = ev.data.id;
  if (typeof id !== "number" || id !== localEntityId) return null;
  const markId = ev.data.markId;
  if (typeof markId !== "string" || markId.length === 0) return null;
  const saved = ev.type === LETHAL_SAVED_EVENT;
  const raw = saved ? ev.data.remaining : ev.data.count;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  return { markId, count: Math.trunc(raw), saved };
}

/** 記下一顆已 drain 的標記事件（由 GameApp 的事件 drain 呼叫）。 */
/** ⭐ GH#737 —— HUD 上的分數列。⛔ 全部由伺服器給，客戶端一個數字都不算。 */
export interface RoundScoreView {
  /** `rankScore` 的輸出 —— ⛔ 與結算頁同一個值。 */
  score: number;
  /** 其中屬於「活下來」的那一半。 */
  survivalBonus: number;
  /** 1..N 全場排名。 */
  rank: number;
  /**
   * 上一次**回合結算**時的排名。⭐ 只有回合結束那一則帶它 ——
   * ⛔ 戰鬥中每秒抖一次的箭頭沒有意義。`null` = 第一回合或還沒結算過。
   */
  prevRank: number | null;
  /** 這一則是不是回合結算的那一次（⇒ 要不要演排名變化）。 */
  final: boolean;
}

/**
 * ⭐ GH#737 —— 收下伺服器的回合分數。
 *
 * 在此之前 `MatchRoom.ts:889` 每 tick 廣播 `roundSettlement`，⛔ **而客戶端零個收端**
 * ⇒ 玩家在戰鬥中看不到自己的分數與排名（失敗形態②：算出來了但從沒送到畫面）。
 *
 * ⚠️ ⭐ 只取**自己那一格**：payload 帶全場每一個座位，⛔ 而 HUD 只畫自己的。
 */
export function recordRoundSettlement(ev: EventMessage, localSeatId: number | null): void {
  if (localSeatId === null) return;
  const data = ev.data as { final?: boolean; entries?: readonly Record<string, number>[] } | undefined;
  const mine = data?.entries?.find((e) => e["seatId"] === localSeatId);
  if (!mine) return;
  hudStore.setState({
    roundScore: {
      score: Number(mine["score"] ?? 0),
      survivalBonus: Number(mine["survivalBonus"] ?? 0),
      rank: Number(mine["rank"] ?? 0),
      prevRank: typeof mine["prevRank"] === "number" ? mine["prevRank"] : null,
      final: data?.final === true,
    },
  });
}

/**
 * ⭐ GH#731 —— 輪盤畫面狀態的唯一寫入端。
 *
 * ⚠️ ⭐ **它必須住這個檔**：`client architecture gate (client-08)` 逐字禁止
 * 「`net/RoomStore.ts` 以外的 zustand setState」與「逐幀寫入」。
 * ⇒ 呼叫端只給值，⛔ 它自己決定要不要寫。
 *
 * ⭐ **同值就不寫** —— 指標每動一個 px 都會叫它，⛔ 而只有「指到的格子換了」
 * 才是一次真的狀態改變。⇒ 逐幀 setState 會讓整個 HUD 每幀重繪。
 */
export function recordCommsWheel(next: HudState["commsWheel"]): void {
  const prev = hudStore.getState().commsWheel;
  if (prev === next) return;
  if (prev && next && prev.hovered === next.hovered && prev.centre === next.centre) return;
  hudStore.setState({ commsWheel: next });
}

export function recordMarkEvent(
  ev: EventMessage,
  localEntityId: number | null,
  nowMs: number = comboNowMs(),
): void {
  const upd = localMarkUpdate(ev, localEntityId);
  if (!upd) return;
  const prev = hudStore.getState().marks;
  const idx = prev.findIndex((m) => m.markId === upd.markId);
  const old = idx >= 0 ? prev[idx]! : null;
  const next: MarkView = {
    markId: upd.markId,
    count: upd.count,
    seq: (old?.seq ?? 0) + 1,
    // 免死的那一刻蓋上時戳；一般的層數變動保留舊時戳，讓閃動照自己的節奏退場。
    savedAtMs: upd.saved ? nowMs : (old?.savedAtMs ?? null),
  };
  const marks = prev.slice();
  if (idx >= 0) marks[idx] = next;
  else marks.push(next);
  hudStore.setState({ marks });
}

/* ── 殭屍王 (task #262 / GH #190) ───────────────────────────────────────────
 * owner, 2026-07-28: 「打死殭屍王的話,結算參與傷害的英雄,照傷害比例發獎金,
 * 補最後一刀的人獎金翻倍」 + 「要播放恐怖音效3~5秒，打贏要播放中獎慶祝音效5~7秒」.
 *
 * v0.9.11 put `mobBossSpawn` / `mobBossSlain` on the wire and NOTHING consumed
 * them — the whole mechanic reached the player as a gold counter jumping by
 * ~3,000 with no explanation. These two projections are the wire→screen half.
 *
 * NOTHING IS RECOMPUTED HERE. The split arrives whole (`shares[]` with each
 * champion's damage / gold / xp / lastHit) because the damage ledger is
 * sim-only; a client that re-derived any of it would be a second opinion about
 * money, which is the one number that must never have two.
 */

/**
 * PURE: the boss beat this event describes, or null when it is not one / is
 * malformed. Split out of the recorder for the same reason
 * {@link localKillComboCount} is — 「這顆事件到底帶了什麼」 is then a direct
 * assertion instead of an inference through the store.
 *
 * NOT SEAT-GATED, unlike the combo. A king is a WORLD event: everyone in the
 * duel fought it and everyone on the payout sheet is entitled to see the sheet.
 * `mine` records whether the LOCAL seat is the one whose 100 kills summoned it,
 * so the banner can say 「你的」 without the panel having to hide from anyone.
 */
export function parseMobBossEvent(
  ev: EventMessage,
  localSeatId: number | null,
  nowMs: number,
  seq: number,
  prev: MobBossView | null = null,
): MobBossView | null {
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  if (ev.type === MOB_BOSS_SPAWN_EVENT) {
    const summonerSeatId = num(ev.data.summonerSeatId, -1);
    return {
      kind: "spawn",
      // 只有王會announce自己 —— `sim/mobs.summonMobBoss` 是 `mobBossSpawn` 唯一的
      // 發射點,特殊殭屍是波裡生出來的,從來不發這顆事件。
      mobKind: "boss",
      atMs: nowMs,
      seq,
      summonerSeatId,
      // seat -1 is 「沒有座位」, never 「等於我的 null seat」
      mine: localSeatId !== null && summonerSeatId >= 0 && summonerSeatId === localSeatId,
      kills: Math.max(0, Math.trunc(num(ev.data.kills, 0))),
      // 出場演出 (owner 2026-08-02). A non-string (old server, garbled packet)
      // degrades to 「不知道是誰」 and the intro draws nothing — never to a
      // champion id the sim did not send.
      championId: typeof ev.data.championId === "string" ? ev.data.championId : "",
      shares: [],
      totalGold: 0,
      totalXp: 0,
      totalLevels: 0,
      lastHitMultiplier: 1,
      // a 降臨 pays nobody, so no mode has been applied yet; the shipped default
      // is the honest placeholder (the banner never prints a rule sentence).
      lastHitMode: "bonus",
      killerSeatId: -1,
      bossId: num(ev.data.id, -1),
      // the ONE payload that knows which arena this is (sim/mobs.summonMobBoss)
      zone: num(ev.data.zone, -1),
    };
  }
  if (ev.type !== MOB_BOSS_SLAIN_EVENT) return null;
  const raw = Array.isArray(ev.data.shares) ? (ev.data.shares as unknown[]) : [];
  const shares: MobBossShareView[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const s = r as Record<string, unknown>;
    shares.push({
      seatId: num(s.seatId, -1),
      damage: Math.max(0, num(s.damage, 0)),
      gold: Math.max(0, Math.trunc(num(s.gold, 0))),
      xp: Math.max(0, Math.trunc(num(s.xp, 0))),
      levels: Math.max(0, Math.trunc(num(s.levels, 0))),
      lastHit: s.lastHit === true,
    });
  }
  const bossId = num(ev.data.id, -1);
  return {
    kind: "slain",
    // #291 —— THE LINE THAT WAS MISSING. Everything else about the special
    // already worked; the settlement just wore the king's words.
    mobKind: slainMobKind(ev.data.kind, bossId, prev),
    atMs: nowMs,
    seq,
    summonerSeatId: -1,
    mine: false,
    kills: 0,
    // the settlement never introduces anybody — the intro already happened
    championId: "",
    shares,
    // TAKEN OFF THE WIRE, NEVER RE-DERIVED FROM `shares`. These are the sums the
    // sim actually paid (MobSystem.payBossBounty), and in `"bonus"` mode they
    // deliberately EXCEED the configured pool.
    totalGold: Math.max(0, Math.trunc(num(ev.data.totalGold, 0))),
    totalXp: Math.max(0, Math.trunc(num(ev.data.totalXp, 0))),
    totalLevels: Math.max(0, Math.trunc(num(ev.data.totalLevels, 0))),
    // 1 is the identity weight: a malformed payload must degrade to 「沒有翻倍」,
    // never to a multiplier the sim did not apply.
    lastHitMultiplier: Math.max(1, num(ev.data.lastHitMultiplier, 1)),
    // ⚠️ AN UNKNOWN MODE DEGRADES TO `"bonus"`, THE SHIPPED DEFAULT — and that
    // direction is the safe one on purpose. Only `"weight"` licenses the panel to
    // promise 「總獎金固定」, so an absent/garbled field must never buy that
    // sentence: the worst case here is a true-but-vaguer note, not a false claim
    // about the player's money.
    lastHitMode: ev.data.lastHitMode === "weight" ? "weight" : "bonus",
    killerSeatId: num(ev.data.killerSeatId, -1),
    bossId,
    // MobSystem.settleBoss emits no `zone` — the king's entity is destroyed by
    // then. -1 here, and `recordMobBossEvent` inherits the spawn's.
    zone: num(ev.data.zone, -1),
  };
}

/**
 * #291 —— 這一顆 `mobBossSlain` 說的是王還是特殊殭屍。
 *
 * ① `kind` 在 payload 上就直接用它。這是今天每一個 build 都會走的那條路
 *    （`MobSystem.settleBoss` 一律帶 `kind`）。
 *
 * ② 沒有 `kind`（舊 server、壞掉的封包）**不猜，去驗一個關係**：這一隻有沒有
 *    一顆 bossId 相同的 `mobBossSpawn` 出現過。王一定會 announce（`summonMobBoss`
 *    發 `mobBossSpawn`），特殊殭屍**從來不會**，所以「有降臨橫幅」是王的正面證據。
 *
 *    ⚠️ 這正是 `recordMobBossEvent` 的 zone 繼承**已經在依賴的同一個假設**
 *    （「王的 spawn 一定先到、而且就在 store 裡」）。用同一個關係回答同一種問題，
 *    比在這裡發明第二套猜法好 —— 兩套會在不同情況下給出不同答案。
 *
 *    沒有證據 ⇒ `"special"`。方向是刻意的：舊 server 只有王會發這顆事件，而王的
 *    spawn 必定先到，所以那條路走的是上面那個 `"boss"`；真的走到這裡（沒有 kind
 *    又沒有降臨橫幅）比較像是一隻沒 announce 過的怪，而 owner 抱怨的正是特殊殭屍
 *    穿著王的字。
 */
function slainMobKind(
  raw: unknown,
  bossId: number,
  prev: MobBossView | null,
): MobBossMobKind {
  if (raw === "boss" || raw === "special") return raw;
  const announced = prev !== null && prev.kind === "spawn" && bossId >= 0 && prev.bossId === bossId;
  return announced ? "boss" : "special";
}

let mobBossSeq = 0;

/**
 * 同時存在的王最多幾隻 —— 一個 duel zone 一隻（`MobBossRules.maxPerRoundScope`
 * 出貨 `"zone"`，而地圖是四座競技場）。它的作用是**兜底**，不是規則：回合結束的
 * 靜默 despawn 不發 `mobBossSlain`，沒有上限的話這個清單會隨著比賽單向長大。
 */
export const MAX_LIVE_BOSSES = 4;

/**
 * TWO SLOTS, TWO QUESTIONS (GH#268).
 *
 * `mobBoss`     = 「最後一則王的消息」. A `slain` overwrites a still-showing
 *                 `spawn` on purpose: the settlement is strictly newer news than
 *                 the arrival, and two king panels stacked on each other is the
 *                 failure that single slot exists to prevent.
 * `mobBossLive` = 「現在場上有哪些王」. A `spawn` 入列，而**只有同一顆 `bossId` 的
 *                 `slain`** 能把它移出。
 *
 * ⛔ 為什麼一定要拆：自 #288 起**每一隻特殊殭屍死掉也會發 `mobBossSlain`**
 * （`sim/systems/MobSystem.ts` 的決定，理由寫在那裡），而事件是廣播給整場的。
 * 所以「最後一則消息」這一格一回合會被翻好幾次 —— 長血條讀它，就會在王**滿血**
 * 的時候消失。owner 為此回報了兩次。
 *
 * ⚠️ 移出的判準是 `bossId` 相等，不是「來了一顆 slain」。這一行就是整個修正：
 * 別區的王、本區的特殊殭屍、任何一隻精英的結算，都動不了別人那一筆。
 */
export function recordMobBossEvent(ev: EventMessage, nowMs: number = comboNowMs()): void {
  const prev = hudStore.getState();
  // #291 —— `prev.mobBoss` 是 `slainMobKind` 的交叉判斷用的（沒有 `kind` 的舊
  // payload:「有沒有一顆同 id 的降臨橫幅」）。它同時也是下面 zone 繼承的來源,
  // 兩者刻意讀同一個東西。
  const view = parseMobBossEvent(ev, prev.localSeatId, nowMs, mobBossSeq + 1, prev.mobBoss);
  if (!view) return;
  // ZONE INHERITANCE. `mobBossSlain` cannot carry a zone — by the time it is
  // emitted the king's entity (and with it its position) is gone. The matching
  // `mobBossSpawn` did carry one and always arrives first, over the same
  // ordered channel, so the settlement borrows it by entity id. Without this
  // the payout sheet is the one half of the feature that STAYS un-gated, and
  // the arena that never fought the king gets its centre corridor taken for
  // eight seconds to read somebody else's money.
  if (view.kind === "slain" && view.zone < 0 && prev.mobBoss && prev.mobBoss.bossId === view.bossId) {
    view.zone = prev.mobBoss.zone;
  }
  mobBossSeq++;
  // 「現在場上有哪些王」。⚠️ 只有**王**會 announce（`sim/mobs.summonMobBoss` 是
  // `mobBossSpawn` 的唯一發射點，特殊殭屍是波裡生出來的），所以 `spawn` 一定是一隻
  // 王；而移出必須認 id —— `view.bossId` 不等於某一筆的話，那顆結算說的是別隻怪。
  const rest = prev.mobBossLive.filter((b) => b.bossId !== view.bossId);
  const live = view.kind === "spawn" ? [...rest, view].slice(-MAX_LIVE_BOSSES) : rest;
  hudStore.setState({ mobBoss: view, mobBossLive: live });
}

/**
 * WHICH DUEL ZONE THE LOCAL PLAYER IS FIGHTING IN, or -1 when it cannot be
 * resolved (no seat yet, or the seat has no live entity — i.e. you are dead or
 * spectating).
 *
 * ONE definition, read by BOTH gates: `audio/combatSfx.localDuelZone` (the
 * 恐怖 drone) and `ui/hud/MobBossOverlay` (the 降臨 banner + 分紅 sheet). They
 * were two answers to the same question and they disagreed — the sound refused
 * to haunt the other arena while the screen happily announced a king six
 * players could not see. A single source of truth is what stops that drifting
 * apart again.
 *
 * -1 IS 「不知道」, NOT 「不同區」. Every caller must fail OPEN on it: a headline
 * beat must never be lost to a lookup that happened to be empty this frame.
 */
export function localDuelZone(s: HudState = hudStore.getState()): number {
  if (s.localSeatId === null) return -1;
  return s.seats.find((x) => x.seatId === s.localSeatId)?.zone ?? -1;
}

/** True when this event is a 殭屍王 beat (cheap pre-filter for the drain). */
export function isMobBossEvent(type: string): boolean {
  return type === MOB_BOSS_SPAWN_EVENT || type === MOB_BOSS_SLAIN_EVENT;
}

/**
 * The clock the counter lives on: `performance.now()` where it exists,
 * `Date.now()` otherwise. Both the stamp above and the HUD's expiry poll read
 * THIS function, so they can never be measured against different clocks.
 * (Wall time is fine here and banned in the sim for the same reason — this side
 * only decides when to stop DRAWING; the count itself was decided in ticks.)
 */
export function comboNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * Sim event types that describe a shop outcome (task #38/#60).
 *
 * ── THE UNDO PAIR WAS MISSING (task #121) ───────────────────────────────────
 * The sim has emitted `shopUndone` / `undoRejected` since the undo landed, and
 * `eventFanout` has fanned both out to the owning client — but neither was in
 * this map, so `isShopEvent` dropped them on the floor and pressing 復原上一步
 * produced NO toast and NO sound. The gold moved correctly and the player was
 * told nothing; a third press on an empty stack was indistinguishable from a
 * dead button. Both are here now, and `undoneKind` carries which transaction
 * was reversed so the sentence can name it.
 */
const SHOP_EVENT_KIND: Record<string, ShopEventView["kind"]> = {
  itemBought: "bought",
  itemSold: "sold",
  buyRejected: "buyRejected",
  sellRejected: "sellRejected",
  shopUndone: "undone",
  undoRejected: "undoRejected",
};

/** True when this event is one the shop HUD wants (cheap pre-filter for the drain). */
export function isShopEvent(type: string): boolean {
  return type in SHOP_EVENT_KIND;
}

/**
 * Record the LOCAL champion's shop outcome. Events for OTHER players are
 * dropped here — MatchRoom broadcasts them on the shared channel (as it does
 * damage and deaths), and the shop toast is a private matter.
 *
 * The payloads name the acting entity differently: the success events
 * (`itemBought` / `itemSold`) carry it as `id`, the rejections as `entity`.
 * Both are read so a rename on either side surfaces as a dropped toast, not a
 * mis-attributed one.
 */
export function recordShopEvent(ev: EventMessage, localEntityId: number | null): void {
  const kind = SHOP_EVENT_KIND[ev.type];
  if (!kind || localEntityId === null) return;
  const actor = (ev.data.id ?? ev.data.entity) as number | undefined;
  if (actor !== localEntityId) return;
  shopEventSeq++;
  hudStore.setState({
    shopEvent: {
      kind,
      itemId: typeof ev.data.itemId === "string" ? ev.data.itemId : "",
      slot: typeof ev.data.slot === "number" ? ev.data.slot : typeof ev.data.itemSlot === "number" ? ev.data.itemSlot : -1,
      reason: typeof ev.data.reason === "string" ? ev.data.reason : "",
      gold: typeof ev.data.gold === "number" ? ev.data.gold : -1,
      // only `shopUndone` carries this; every other payload leaves it ""
      undoneKind: kind === "undone" && typeof ev.data.kind === "string" ? ev.data.kind : "",
      seq: shopEventSeq,
    },
  });
}

/** Record the match-end settlement payload (drained once from MSG.EVENT). */
export function recordSettlement(settlement: MatchSettlement): void {
  hudStore.setState({ settlement });
}

/** Clear the settlement payload (match teardown / restart). */
export function resetSettlement(): void {
  hudStore.setState({ settlement: null });
}

/** Gamepad connect/disconnect (event-driven, never per-frame). */
export function setGamepadIndices(indices: number[]): void {
  const prev = hudStore.getState().gamepadIndices;
  if (prev.length === indices.length && prev.every((v, i) => v === indices[i])) return;
  hudStore.setState({ gamepadIndices: [...indices] });
}
