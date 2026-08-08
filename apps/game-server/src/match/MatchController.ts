/**
 * MatchController — the headless authoritative match orchestrator. Owns the
 * SimWorld, Seats, PhaseMachine, PairedDuels pairing, offers, and rewards.
 * The Colyseus MatchRoom is a thin network wrapper around this class, so the
 * whole match flow is unit-testable without sockets.
 */
import {
  SEAT_COUNT,
  TEAM_COUNT,
  TEAM_SIZE,
  TICK_HZ,
} from "@ggd/shared/constants";
import { asSeatId, asTeamId, type AugmentId, type ChampionId, type EntityId, type ItemId, type SeatId, type TeamId } from "@ggd/shared/ids";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { DEFAULT_COMBAT_ENV, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { baseBonusFromDoc, type BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import { statCapsFromDoc, type StatCapTable } from "@ggd/shared/sim/statCaps";
import {
  COMBAT_FEEL_DOC_ID,
  combatFeelFromDoc,
  type CombatFeelRules,
} from "@ggd/shared/sim/combatFeel";
import {
  SHIELD_DOC_ID,
  shieldRulesFromDoc,
  type ShieldRules,
} from "@ggd/shared/sim/shieldRules";
import {
  BLOCK_DOC_ID,
  blockRulesFromDoc,
  type BlockRules,
} from "@ggd/shared/sim/blockRules";
import {
  BERSERK_DOC_ID,
  berserkRulesFromDoc,
  type BerserkRules,
} from "@ggd/shared/sim/abilities/berserkRules";
import { clearForFreshBody } from "@ggd/shared/sim/clearPools";
import { resetMarksForRound } from "@ggd/shared/sim/marks";
import {
  DISPEL_DOC_ID,
  dispelRulesFromDoc,
  type DispelRules,
} from "@ggd/shared/sim/dispelRules";
import {
  woundRulesFromDoc,
  WOUNDS_DOC_ID,
  type WoundRules,
} from "@ggd/shared/sim/grievousWounds";
import {
  damageRulesFromDoc,
  DAMAGE_RULES_DOC_ID,
  type DamageRules,
} from "@ggd/shared/sim/damageRules";
import {
  AUGMENT_ENEMY_FILTER_DOC_ID,
  augmentEnemyFilterFromDoc,
  type AugmentEnemyFilter,
} from "@ggd/shared/sim/augmentEnemyFilter";
import {
  STEALTH_DOC_ID,
  stealthRulesFromDoc,
  type StealthRules,
} from "@ggd/shared/sim/stealth";
import {
  TAUNT_DOC_ID,
  tauntRulesFromDoc,
  type TauntRules,
} from "@ggd/shared/sim/taunt";
import {
  BODY_SCALE_DOC_ID,
  bodyScaleRulesFromDoc,
  type BodyScaleRules,
} from "@ggd/shared/sim/bodyScale";
import {
  REGEN_DOC_ID,
  regenRulesFromDoc,
  type RegenRules,
} from "@ggd/shared/sim/regenRules";
import {
  SKELETON_ARENA,
  ROYALE_ARENA,
  pickRoundArena,
  royaleSpawnAt,
  type ArenaDef,
} from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions, Abilities, LootTables } from "@ggd/shared/sim/content/registry";
import { Configs, Models } from "@ggd/shared/content";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import { grade, perMatchRanks, rankScore, survivalBonus, type RankEntry } from "@ggd/shared/sim/stats/rating";
import {
  MatchLedger,
  createRoundPlayerRecord,
  diffMatchStats,
  gradeRoundRecord,
  statPathSnapshotOf,
  type CastHandle,
  type LineupSide,
  type OfferKind,
  type RoundPlayerRecord,
} from "@ggd/shared/sim/stats/matchLedger";
import type {
  MatchSettlement,
  RoundStatDelta,
  RoundStatsEntry,
  SettlementPlayer,
} from "@ggd/shared/protocol/messages";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import {
  beginCombatFlowers,
  endCombatFlowers,
  flowerRulesFromConfig,
  pickFlowerSpawnPos,
  spawnFlower,
} from "@ggd/shared/sim/flowers";
import {
  beginCombatRevives,
  endCombatRevives,
  reviveRulesFromConfig,
} from "@ggd/shared/sim/revive";
import {
  beginCombatFireRing,
  bossRoundExtensionTicks,
  combatDeadlineTick,
  endCombatFireRing,
  fireRingRulesFromConfig,
  isCombatTimeUp,
} from "@ggd/shared/sim/fireRing";
import {
  beginCombatGuardians,
  endCombatGuardians,
  guardianRulesFromConfig,
} from "@ggd/shared/sim/systems/GuardianSystem";
import { beginCombatCoins, endCombatCoins, coinRulesFromConfig } from "@ggd/shared/sim/coins";
import {
  beginCombatNightPact,
  endCombatNightPact,
  nightPactRulesFromConfig,
} from "@ggd/shared/sim/nightPact";
import { beginCombatMobs, endCombatMobs } from "@ggd/shared/sim/systems/MobSystem";
import {
  anyMobsAlive,
  anyMobsAliveOfKinds,
  mobRulesFromConfig,
  pickMobChampion,
  ROUND_HOLD_KINDS,
  DEFAULT_ROUND_HOLD_KINDS,
  DEFAULT_STOP_SPAWN_ON_TEAM_WIPE,
  type MobChampionPicker,
} from "@ggd/shared/sim/mobs";
import { DEFAULT_FLOWER_CONFIG, type FireRingConfig } from "@ggd/shared/content";
import type { IntentFrame, AbilitySlot } from "@ggd/shared/sim/intents";
import type { Cheat } from "@ggd/shared/protocol/messages";
import {
  offerAugments,
  applyAugmentPick,
  offerItems,
  applyItemPick,
  ITEM_OFFER_TIER,
  type AugmentOffer,
  type ItemOffer,
} from "@ggd/shared/sim/economy/draft";
import { rollItemReward, grantItemFree, commitShopSession } from "@ggd/shared/sim/economy/shop";
import { releaseOrbSlot } from "@ggd/shared/sim/economy/legendaryOrb";
import { DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES } from "@ggd/shared/sim/economy/offerEligibility";
import { applyAttrPick, rollAttrChoices, ATTR_OFFER_TIER } from "@ggd/shared/sim/economy/attrDraft";
import { rankUpAbility, learnEx } from "@ggd/shared/sim/abilities/abilitySystem";
import {
  grantGold,
  grantLevels,
  grantXp,
  GOLD_REWARDS,
  XP_REWARDS,
  LEVEL_CAP,
  STARTING_GOLD,
} from "@ggd/shared/sim/economy/progression";
import { Seat, type SeatDriver } from "../seat/Seat";
import { AIDriver } from "../ai/Tier0Brain";
import { Whitelist } from "../curation/whitelist";
import { Ownership } from "../curation/ownership";
import { PhaseMachine, type MatchPhase, type PhaseConfig, DEFAULT_PHASE_CONFIG } from "./PhaseMachine";
import { resolveVsBotPacing, type VsBotPacing } from "./phaseConfig";
import { roundCapReached } from "@ggd/shared/roomSettings";
import {
  pairTeams,
  royaleBout,
  isRoyaleRound,
  teamHealthLost,
  isHighStakesRound,
  FINAL_ROUND,
  HIGH_STAKES_REWARD,
  ROYALE_COMBAT_SEC,
  ROYALE_FIRE_RING_START_SEC,
  DEFAULT_STARTING_TEAM_HEALTH,
  type DuelPairing,
  type RoyaleBout,
} from "./PairedDuels";
import { DEFAULT_ARENA_RULES, grantForRound, type ArenaRules } from "./arenaRules";
import { resolveRoyaleArena } from "./arenaSelect";

/**
 * Strip the FIGHTING half of a produced intent while combat is not live, so a
 * champion cannot move-to-engage, attack or cast between the moment a round
 * settles and the moment the next round's combat is armed (#100). The economy
 * half — buy / sell / rank / ready / offer picks / recall — is preserved so the
 * intermission shop keeps working with the fighters standing still.
 *
 * Pure and deterministic (a function only of the frame): the caller gates it on
 * `world.combatActive`, host state that flips on combat entry/exit identically
 * on every replica, so client prediction replays the freeze byte-for-byte.
 */
function freezeCombatIntent(frame: IntentFrame): IntentFrame {
  return {
    // An explicit `stop` (not merely a dropped order) so any sticky nav target
    // that survived the settling tick is re-cleared EVERY frame — the OrderSystem
    // chase loop re-derives movement from a persisting attackTarget, so leaving
    // the order undefined would let a champion keep closing on its last foe.
    order: { kind: "stop" },
    // aim intentionally dropped: no need to keep re-facing a corpse.
    commands: frame.commands.filter((c) => c.kind !== "castAbility" && c.kind !== "useItem"),
  };
}

export interface SeatSpec {
  seatId: number;
  teamId: number;
  accountId?: string;
  displayName?: string;
  championId?: string;
  isBot: boolean;
}

/**
 * The match RECORDER seam (task #175). A recorder is attached by MatchRoom and
 * observes the three things a replay cannot re-derive:
 *
 *   - the raw per-seat intent frame, captured BEFORE `sanitizeIntent` and
 *     `freezeCombatIntent` — both of those are pure functions of the frame plus
 *     recorded state, so playback re-applies them itself and re-recording their
 *     output would double-apply the freeze;
 *   - driver swaps at the tick they are APPLIED, because `driverKind` is read by
 *     the intermission offer auto-pick and therefore changes the match;
 *   - a per-tick digest checkpoint, so playback can name the first divergent
 *     tick instead of discovering the problem at the end.
 *
 * The interface is deliberately narrow and the field is optional: with no
 * recorder attached every call site below is one `?.` on a null, and the sim
 * path is byte-identical to before this feature existed.
 */
export interface MatchRecorderSink {
  onIntent(tick: number, seatId: SeatId, frame: IntentFrame): void;
  onDriverSwap(tick: number, seatId: SeatId, kind: "human" | "ai"): void;
  onTickEnd(ctl: MatchController): void;
}

/**
 * 對戰統計的**寫出去**那一端 (#207)。
 *
 * ⚠️ 這個介面存在的唯一理由,就是 #207 最容易犯的那一種故障:**算出來了但從
 * 沒送達**。`ctl.ledger` 是記憶體裡的累積器,它一直都會是對的 —— 一場打完裡面
 * 躺著完整的選角/技能/三選一/名次,而如果沒有人把它寫出去,那些資料在
 * `onDispose` 的那一毫秒全部消失,而**沒有任何測試會發現**,因為每一條讀
 * `ctl.ledger` 的斷言都還是綠的。
 *
 * 所以斷言必須讀**檔案**(analytics.test.ts 全部從 `loadMatchStats()` 讀回
 * 來),而這個介面把「寫」隔成一個可以被拔掉的東西 —— 拔掉它,那些測試才會紅。
 *
 * 和 {@link MatchRecorderSink} 同一個形狀:欄位可為 null,沒接的時候每一個
 * 呼叫點都是一個 `?.`,tick path 與這個功能不存在時位元相同。
 */
export interface MatchStatsSink {
  /** 一個回合結算完(`concludeCombat` 之後、`settleRound` 之前的那一份 delta)。 */
  onRoundSettled(ctl: MatchController, round: number, roundTicks: number): void;
}

/**
 * Outcome of a SELECT_CHAMPION. On rejection the `reason` is surfaced to the
 * client so champ-select can explain WHY (wrong phase / unknown champion /
 * not on the content whitelist), never a silent no-op.
 */
export type SelectReason =
  | "wrong-phase"
  | "no-seat"
  | "unknown-champion"
  | "not-whitelisted"
  | "not-owned";
export type SelectResult = { ok: true } | { ok: false; reason: SelectReason };

export interface TeamResult {
  teamId: number;
  placement: number;
  members: { seatId: number; accountId: string; kills: number; deaths: number; isBot: boolean }[];
}

export interface MatchResult {
  matchId: string;
  mode: "PairedDuels";
  seed: number;
  rounds: number;
  teams: TeamResult[];
}

/**
 * The 能力屬性強化 三選一 (#260) as the host stores it. Deliberately the same
 * entity/tier/choices/picked shape as the other two, so the OfferState snapshot
 * projection, the AI auto-pick and the #207 expiry net stay kind-agnostic.
 */
export interface AttrOffer {
  entity: EntityId;
  /** always ATTR_OFFER_TIER — discriminates from AugmentTier / weapon offers */
  tier: string;
  /** encoded 力/敏/智 cards, e.g. "attr:str:14" (economy/attrDraft) */
  choices: string[];
  picked: string | null;
}

/**
 * A stored intermission offer: an augment draft, a free-item ("legendary
 * weapon") draft, or the 能力屬性強化 力/敏/智 card. All three expose
 * tier/choices/picked, so the OfferState snapshot projection and the AI
 * auto-pick path stay kind-agnostic.
 */
export type StoredOffer = (
  | ({ kind: "augment" } & AugmentOffer)
  | ({ kind: "item" } & ItemOffer)
  | ({ kind: "attr" } & AttrOffer)
) & {
  seatId: SeatId;
  createdTick: number;
  /**
   * True for a 傳說寶玉 card, which reserved an inventory slot when it rolled
   * (task #82). `applyPick` releases the reservation as the card resolves.
   */
  reservesSlot?: boolean;
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GH#264 —— 「什麼叫做被淘汰」是一個決策點，不是一個常數
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * #193 的中途結算卡原本掛在「團隊生命歸零」上，因為當時歸零**就是**出局。
 * owner 2026-07-27 取消淘汰之後這兩件事分家了：
 *
 *   · 「血耗光」= 計分板見底，這一隊**照樣打完十回合**（{@link participatingTeams}）
 *   · 「出局」  = 不存在了 —— 第 1 名由決賽決定、**不看團隊生命**
 *
 * 於是一支第 7 回合把血打光的隊伍會先收到一張 `winnerTeam: -1` 的「戰鬥結束」
 * 卡（客戶端 `LeaveSettlementOverlay` 用它換掉 #271 的離場確認框，直接提供
 * 「返回大廳」），然後在第 10 回合奪冠。seed 4242 就是這一場：team 0 在第 7 回合
 * 歸零、拿到卡、最後拿第 1 名。玩家按下去就是**放棄一場自己會贏的比賽**。
 *
 * ── 為什麼這是欄位而不是一行修正 ────────────────────────────────────────────
 * 「0 血照樣參戰還能奪冠」本身是 owner 明說的設計，所以缺陷不在血量模型，而在
 * **那張卡什麼時候該發**。那是一個決策點（CLAUDE.md 第一守則），兩邊都有人要：
 *
 *   關（出貨）= 比賽沒結束就沒有人出局，沒有人拿得到那張卡。
 *   開（舊行為）= 血一歸零就發，讓計分板墊底的人可以提早看評價、提早離場。
 *
 * 出貨值選 owner 明說的那一側：「不管前面被淘汰與否，大家都回來打第 10 回合」。
 *
 * ⚠️ 它**不是** sim 規則，所以和隔壁那一票 `*FromDoc` 不同，它不寫進 `SimWorld`
 * 也不進 `digest()` —— 它決定的是 host 往外送什麼，不是場上算什麼。這也是為什麼
 * 讀它不會動到重播的決定性（`takeEliminationSettlements` 是純輸出，
 * settlement.test.ts 的「draining the queue mutates nothing」在守這件事）。
 */
export const DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT = false;

/** `config.match@1` 的文件 id（`phaseConfig` 的三支 resolve* 讀的是同一份）。 */
const MATCH_CONFIG_DOC_ID = "config.match";

/**
 * `match.settlementCardOnHealthSpent` 的**現行值**。
 *
 * 缺文件 / 缺欄位 / schema 對不上 ⇒ {@link DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT}。
 * 缺席就是出貨預設，和 `resolveVsBotPacing` 同一個約定：一份還沒有這一格的舊
 * `config.match.json` 應該得到 owner 現在要的行為，不是隨機的一半。
 */
export function settlementCardOnHealthSpentFromDoc(doc: unknown): boolean {
  const d = doc as { schema?: string; match?: { settlementCardOnHealthSpent?: unknown } } | undefined;
  if (d?.schema !== "config@1") return DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT;
  const v = d.match?.settlementCardOnHealthSpent;
  return typeof v === "boolean" ? v : DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT;
}

export class MatchController {
  readonly world: SimWorld;
  readonly seats = new Map<SeatId, Seat>();
  readonly phase: PhaseMachine;
  /**
   * TEAM HEALTH per team — LoL Arena's 20-point pool, −2/−4/−6 per lost duel by
   * round band, +15 to a High Stakes winner. Drained in {@link settleRound}.
   *
   * SINCE 2026-07-27 IT IS A SCOREBOARD, NOT A LIFE BAR. Owner: 「只是計分板，
   * 不影響決賽」. Reaching 0 no longer removes a team from anything — it decides
   * places 2/3/4 ({@link finalStandings}) and sets the wire's `eliminated` flag,
   * which the client's #193 leave-through-settlement flow reads. Place 1 belongs
   * to whoever survives the finale, however little health they have left.
   */
  readonly teamHealth = new Map<TeamId, number>();
  readonly placements = new Map<TeamId, number>();
  /**
   * Teams that won a High Stakes duel and have not yet spent the draft half of
   * that win — GGD's stand-in for Arena's LUCKY DICE (see {@link settleRound}).
   * Cleared as the next augment offer is rolled.
   */
  private readonly highStakesDraftBonus = new Set<TeamId>();

  /**
   * @deprecated Vocabulary alias for {@link teamHealth} — the SAME Map object,
   * so `for…of`, `.get`, `.size` and `new Map(ctl.lives)` all behave identically.
   *
   * It exists because the readers of this field live in lanes this one does not
   * own: `net/snapshot.ts` (→ `TeamState.lives` on the wire), `replay/digest.ts`,
   * `replay/Recorder.ts`, and the client's TeamLivesBar / CouchHudGrid. Renaming
   * the field outright would have been a cross-lane break for a vocabulary win;
   * the alias buys the correct name here and leaves the wire rename to the lane
   * that owns the protocol.
   *
   * ⚠️ HAND-OFF for the client lane: `TeamLivesBar` renders one ❤ per unit of
   * this value. That was a sane 3-8 hearts under the old lives model; it is now
   * a 20-point pool that can reach 35+ after a High Stakes win, so the bar needs
   * to become a BAR (or a number) rather than a row of hearts.
   */
  get lives(): Map<TeamId, number> {
    return this.teamHealth;
  }

  /** @deprecated Vocabulary alias for {@link startingTeamHealth}. */
  get startingLives(): number {
    return this.startingTeamHealth;
  }
  readonly kills = new Map<SeatId, number>();
  readonly deaths = new Map<SeatId, number>();
  /**
   * PER-ROUND kill/death tallies — the same events as `kills`/`deaths`, but
   * ZEROED at every combat entry (see resetRoundTallies). They ride the snapshot
   * (SeatState.roundKills/roundDeaths) so the round-end presentation — the
   * winner model (#143) and the round-end quote VO (#142) — can name THIS
   * round's MVP on the leading team instead of a fixed representative seat.
   * They must stay per-ROUND: a cumulative tally would simply pin the match's
   * overall best killer on screen every round, which is the same bug in a new
   * shape.
   */
  readonly roundKills = new Map<SeatId, number>();
  readonly roundDeaths = new Map<SeatId, number>();
  /**
   * PER-ROUND 存活順序 (GH#257 的金銀銅頒獎台):每個座位這一回合**最後一次**倒下的
   * **絕對** sim tick。`0` = 這一回合沒被記過陣亡(還活著、輪空被停在場邊、或還沒
   * 生成實體)。生命週期與 roundKills 完全相同 —— 在 resetRoundTallies 歸零。
   *
   * ⚠️ 它與 `roundDeaths` 不可互相取代:`roundDeaths` 答「倒了幾次」,
   * `roundDeathTick` 答「什麼時候倒的」。兩個各死一次的人在前者上完全相同,
   * 所以**次數永遠推不出先後**,頒獎台要的是後者。
   *
   * 為什麼記「最後一次」而不是第一次:#84 的復活圈會把人拉起來,被拉起來又再
   * 倒下的人真正離場的時間是後面那一次。
   */
  readonly roundDeathTick = new Map<SeatId, number>();
  /**
   * PER-ROUND participation + duel result per TEAM (a ROUND_OUTCOME value), with
   * exactly the roundKills lifetime: NONE for everyone at combat entry, FOUGHT
   * the moment enterCombat places a team's seats into a duel zone, WON/LOST when
   * settleRound resolves the duel — and then readable, unchanged, through the
   * whole `resolution` + shop beat the round-end presentation fires in.
   *
   * It exists because a BYE team is indistinguishable from a wiped one on the
   * rest of the snapshot: enterCombat parks every seat dead and only revives the
   * seats belonging to a pairing, so the bye team ends the round alive:false /
   * roundKills:0 / roundDeaths:0 — and it never even emits a death event, since
   * the parking mutates hp directly. Without this map the presentation would
   * happily pick the standings leader that sat the round out, find no survivors
   * and no scorers, and fall back to its lowest seatId: 「每回合都是同一個英雄」.
   */
  readonly roundOutcome = new Map<TeamId, number>();
  /**
   * MATCH-LIFETIME count of duels this team has won — the edge the client's
   * victory gate (vfx/victoryTrigger) fires the small round-win firework on.
   * Deliberately NOT in `resetRoundTallies`: it is a monotonically rising
   * counter, and the client detects a WIN as `roundWins > lastRoundWins`, so
   * zeroing it every round would either fire nothing or fire on the re-climb.
   *
   * Separate from `roundOutcome` even though settleRound writes both on the
   * same line: roundOutcome answers 「這一回合你做了什麼」 (and is wiped every
   * round), roundWins answers 「你到目前贏了幾場」. Projected as uint8, which
   * caps at 255 — a match is a handful of rounds, so the clamp is unreachable.
   */
  readonly roundWins = new Map<TeamId, number>();
  /**
   * Current round's pairings + bye. EMPTY on the finale — round
   * {@link FINAL_ROUND} is one twelve-player bout, not a set of 3v3s, and it
   * lives in {@link royale} instead. Anything that iterates `pairings` therefore
   * no-ops on the finale by construction, which is why every consumer below has
   * an explicit royale branch rather than a silent zero-length loop.
   */
  pairings: DuelPairing[] = [];
  bye: TeamId | null = null;
  /**
   * The FINALE bout (round {@link FINAL_ROUND}) — all teams, one zone — or null
   * on an ordinary duel round. Mutually exclusive with `pairings`.
   */
  royale: RoyaleBout | null = null;
  /**
   * The team that WON the finale: the match champion (owner: 「最後存活的那一隊
   * 就是全場冠軍…不看團隊生命」). Null until the finale settles.
   */
  royaleWinner: TeamId | null = null;
  /** open intermission offers per seat (offerId -> augment/item offer) */
  readonly offers = new Map<string, StoredOffer>();
  result: MatchResult | null = null;

  /**
   * True once the MATCH outcome is decided (<=1 team left). Set at the end of the
   * final combat round, so it flips during the last `resolution` phase — a few
   * seconds BEFORE matchEnd. While set, tick() STOPS gathering seat intents
   * (human AND AI), so champions idle and the settlement front-view shows a
   * still hero. Deterministic (derived from team health), so client prediction
   * replays the freeze identically.
   */
  outcomeDecided = false;

  /**
   * The victory-settlement payload (per-player scoreboard + grade + rank +
   * winner), computed once at matchEnd. MatchRoom broadcasts it on MSG.EVENT.
   */
  settlement: MatchSettlement | null = null;

  /**
   * Per-team settlement snapshots queued when a team is ELIMINATED mid-match
   * (task #193). Each entry is the full scoreboard snapshot taken at the moment
   * that team's life hit 0, tagged with the eliminated team id. MatchRoom drains
   * this every tick and broadcasts each on MSG.EVENT (TEAM_SETTLEMENT_EVENT), so
   * a player whose team is out can open their evaluation screen before leaving.
   *
   * NOT part of sim/world state and never serialized — draining it changes no
   * digest, so replays stay deterministic. Only populated for eliminations that
   * do NOT end the match; the deciding elimination is covered by the final
   * matchEnd settlement (maybeFinish), so it is never double-broadcast.
   *
   * ⚠️ GH#264: 「被淘汰」 is {@link eliminatedTeams}, NOT 「血耗光」. On the shipped
   * default this queue therefore stays EMPTY for a whole match — see
   * {@link DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT} for why that is the correct
   * reading of owner's 取消淘汰 ruling and how to switch the old trigger back on.
   */
  private eliminationSettlements: { teamId: number; settlement: MatchSettlement }[] = [];

  /**
   * Teams already announced through {@link eliminationSettlements}. Replaces the
   * old `!this.placements.has(teamId)` test, which only worked because a placement
   * WAS an elimination; placements are now assigned once at match end, so the
   * "have we told this team yet" fact needs its own home or every subsequent round
   * would re-queue the same card.
   */
  private readonly healthSpentAnnounced = new Set<TeamId>();

  /**
   * PER-ROUND HISTORY — the settlement chart's only possible data source.
   *
   * `PlayerMatchStats` is cumulative from champion spawn and is never reset per
   * round, so "the damage I did in round 7" does not exist as a stored number
   * anywhere, server included. This array is how it comes to exist: at every
   * combat settle we diff the cumulative scoreboard against the previous settle
   * and keep the DELTA.
   *
   * NOT sim state and never serialized into the schema or the digest — it is
   * derived, append-only host bookkeeping, exactly like eliminationSettlements.
   * A replay of the same seed produces the same deltas because the counters it
   * reads are themselves part of the deterministic world state.
   */
  private readonly roundHistory: RoundStatsEntry[] = [];

  /**
   * ROUNDS THIS SEAT WAS STILL STANDING AT SETTLE TIME (owner, 2026-07-27:
   * 「每回合 RANK 計算，存活下來的人額外 +200分」·「明明活到最後卻不是贏家很怪」).
   *
   * Derived host bookkeeping, exactly like {@link roundHistory} — NOT sim state,
   * never serialized into the schema or the digest, so replays stay
   * deterministic. It is counted off the SAME `hpRatio > 0` the per-round chart
   * already computes, rather than a second opinion about who was alive.
   */
  private readonly roundsSurvived = new Map<SeatId, number>();

  /**
   * The cumulative scoreboard AS OF the previous round settle, keyed by seat —
   * the subtrahend for the next delta. Seeded lazily: a seat absent here diffs
   * against zero, which is correct for the first round a champion exists.
   */
  private readonly lastRoundCumulative = new Map<SeatId, RoundStatDelta>();

  /**
   * Dev-cheat toggles (offline testing only; MatchRoom hard-gates the channel).
   * Keyed by seatId so they survive champion swaps (which change entityId). The
   * per-tick sustain in tick() honors them AFTER the sim step.
   */
  private readonly godModeSeats = new Set<SeatId>();
  private readonly zeroCdSeats = new Set<SeatId>();

  /**
   * Replay recorder, or null when this match is not being recorded (unit tests,
   * playback itself). See {@link MatchRecorderSink}.
   */
  recorder: MatchRecorderSink | null = null;

  /**
   * 這一場的**分析帳本** (#207) —— 選角 / 陣容 / 每一次技能施放 / 道具 / 三選一
   * (含沒選的那兩張) / 每回合成績 / 團隊積分。barrier lane 定義,三個消費端
   * (#207 後台覆盤、#211 商店 N/20、#212 回合勝利畫面)共用同一份型別。
   *
   * 它**不在 SimWorld 裡**,這是刻意的:它記的是 host 才知道的事(champ-select
   * 什麼時候開的、玩家有沒有按隨機、三選一的哪兩張沒被選),塞進 world state 會
   * 讓 `digest()` 開始依賴 host 的節奏,而 client 的預測影子沒有這些事件 —— 那
   * 是一條保證 desync 的路。代價是決定性由這裡負責:下面每一支
   * `ledger.*` 都傳**絕對 tick**(事件自己帶的 `ev.tick`,不是 `Date.now`)。
   *
   * 一直存在、一直累積,即使 {@link statsSink} 是 null(單元測試)。累積是免費
   * 的(幾個陣列 push),而「只有正式伺服器才記」會讓測試永遠測不到記的內容。
   */
  readonly ledger: MatchLedger;

  /**
   * 把 {@link ledger} 寫到磁碟的那一端,null = 這一場不寫(單元測試、回放播放)。
   * 見 {@link MatchStatsSink} —— 它被抽成一個介面就是為了「拔掉它會紅」。
   */
  statsSink: MatchStatsSink | null = null;

  /** 上一次回合結算時的累積計分板,用來對 `diffMatchStats` 相減出這一回合。 */
  private readonly lastLedgerStats = new Map<SeatId, PlayerMatchStats>();
  /** 上一次回合結算時的累積小怪擊殺數(`world.mobKills` 不在 matchStats 裡)。 */
  private readonly lastLedgerMobKills = new Map<SeatId, number>();
  /** 這一回合每個座位打死的王 / 特殊怪(`mobBossSlain`),每回合開打時歸零。 */
  private readonly roundBossKills = new Map<SeatId, number>();
  /** 一個座位手動鎖定英雄的絕對 tick;沒有 = 從未鎖定(系統代選)。 */
  private readonly pickLockTick = new Map<SeatId, number>();
  /**
   * 每個 (座位, 技能) **最近一次**施放的 handle。後到的傷害/治療掛回那一次。
   *
   * ⚠️ 已知且刻意的近似:同一個座位在自己的 DoT 還在跳的時候再放一次同一支
   * 技能,後面那些 tick 會記到**第二次**施放身上。要精確歸屬得讓 sim 的
   * damage packet 帶 castId,而 `packages/shared` 不在這一批的可動範圍。影響
   * 面是「單次施放的效益」這一欄,聚合值(`aggregateAbilityUse`)不受影響 ——
   * 總量仍然是對的,只是分配到哪一次施放可能偏。
   */
  private readonly castByAbility = new Map<string, CastHandle>();
  /** 這一回合戰鬥開始的絕對 tick —— `RoundGradeContext.roundTicks` 的減數。 */
  private combatStartTick = 0;

  private specs = new Map<SeatId, SeatSpec>();
  private duelWinners = new Map<number, TeamId>(); // zone -> winner this round

  /**
   * #L2 — zone → the team that OUTLIVED the others there while the round was
   * being held open by 「場上還有殭屍」.
   *
   * WHY IT HAS TO EXIST. Owner's two extra rules interact: 「場上還有任何殭屍
   * 時,只剩一隊也不結束」 delays the win, and 「玩家全滅 → 立即結束」 fires on
   * total wipe. Without a memory, a team that wiped the enemy at 70 s and then
   * burned to death in the fire ring at 95 s (with a 殭屍王 still standing)
   * would reach the both-sides-dead branch and have the round it WON decided by
   * `rng.chance(0.5)`. That is not a tie-break, it is a coin flip on a settled
   * fight. This map remembers who was standing when the hold started, so the
   * total-wipe branch pays the team that actually earned it and only falls back
   * to the coin for a genuine simultaneous wipe.
   *
   * HOST state, not sim state: it never reaches a system, only `checkCombatEnd`
   * reads it, and it is written from the same deterministic pass. Cleared in
   * `enterCombat` alongside `duelWinners`.
   */
  private pendingDuelWinners = new Map<number, TeamId>();

  /**
   * #L2 — how much of the sim's 殭屍王 extension this round's PHASE COUNTDOWN has
   * already been credited with. `bossRoundExtensionTicks(world)` is a running
   * total (two kings = 10800), so the difference is what still has to be handed
   * to `PhaseMachine.ticksLeft`; without the memo the same 5400 would be added
   * on every one of the 5400 remaining ticks. Reset per combat entry.
   */
  private appliedBossExtensionTicks = 0;

  /**
   * The match seed, captured for the DETERMINISTIC per-round arena pick (task
   * #145). Deliberately NOT `world.rng.state` — that advances every tick, so it
   * is not a stable function of (seed, round); the raw seed is. Arena selection
   * hashes (seed, round) independently of world.rng, so it perturbs no sim
   * randomness and same-seed replay stays byte-identical.
   */
  private readonly matchSeed: number;

  /**
   * vs bot 的節奏規則 (owner 2026-08-03, A1 強制結算 / A2 選角早退)。
   *
   * ⚠️ 在建構子裡解析一次就凍結,和 `phaseCfg` 完全一樣的理由:比賽中途換規則
   * 等於在跑到一半的相位底下改結束條件。`soloVsBots` 從 **seatSpecs** 推導
   * (錄影 header 帶著 `isBot`,所以重播重現同一個判斷);兩個旗標讀
   * `config.match@1`,和 `combatFeel` / `shieldRules` 同一條路 —— 含同一個已知
   * 限制:`Configs` 是 **boot 時**載入的,後台改了要重啟 shard。
   */
  public readonly vsBotPacing: VsBotPacing;

  constructor(
    public readonly matchId: string,
    seed: number,
    seatSpecs: SeatSpec[],
    phaseCfg: PhaseConfig = DEFAULT_PHASE_CONFIG,
    /**
     * Shared TEAM HEALTH at match start. The CALLER resolves this: MatchRoom
     * from `config.match@1` (`phaseConfig.resolveStartingTeamHealth`), and the
     * replay player from `ReplayHeader.startingLives` — never re-resolved here,
     * so a recording always replays on the reservoir it was recorded with.
     *
     * Positional, so the rename does not reach MatchRoom (which passes it by
     * position). Readers of the old property name get {@link startingLives}.
     */
    public readonly startingTeamHealth = DEFAULT_STARTING_TEAM_HEALTH,
    /** round-rules table; DEFAULT_ARENA_RULES = exact legacy behavior */
    public readonly rules: ArenaRules = DEFAULT_ARENA_RULES,
    /**
     * ACTIVE map geometry (collision truth); default = built-in skeleton. NOT
     * readonly: when `arenaPool` is non-empty this is swapped each combat round
     * to the deterministically-chosen arena (task #145). The champ-select /
     * first-intermission spawn uses whatever is passed here; combat rounds
     * rotate.
     */
    public arena: ArenaDef = SKELETON_ARENA,
    /**
     * Content whitelist snapshot resolved at match creation. Default =
     * allow-all, so every existing call site and unit test is unchanged; the
     * platform-driven path (MatchRoom) passes the fetched whitelist.
     */
    public readonly whitelist: Whitelist = Whitelist.allowAll(),
    /**
     * Global combat-environment multiplier table, resolved BY THE CALLER at
     * match creation (MatchRoom merges the config.combat-env@1 content
     * defaults + the admin 戰鬥系統 override, same pattern as the whitelist —
     * see config/combatEnv.ts). Injected into the SimWorld before tick 0 so
     * determinism holds; the DEFAULT all-1.0 table keeps every existing call
     * site and unit test byte-identical.
     */
    public readonly combatEnv: CombatEnvMultipliers = DEFAULT_COMBAT_ENV,
    /**
     * Round-pacing FIRE RING schedule (task #132), resolved BY THE CALLER from
     * `config.match@1`'s `match.fireRing` block (MatchRoom → resolveFireRing()).
     * `startSec` is the SINGLE SOURCE OF TRUTH for round length — the ring
     * closes in at that combat-elapsed time and burns every living champion with
     * an escalating %-HP true-damage ramp so a stalemate settles by ~3-4 min.
     * null (the default: unit tests, skeleton boot, an operator who authored no
     * ring) leaves the mechanic OFF — enterCombat never arms it, so behavior is
     * byte-identical to the pre-ring sim. Armed on combat entry / disarmed on
     * exit exactly like the flowers; the LIVE-combat gate in FireRingSystem
     * makes it stop the instant a round settles (coordinates with task #100).
     */
    public readonly fireRing: FireRingConfig | null = null,
    /**
     * The per-round arena ROTATION pool (task #145). Empty (the default: unit
     * tests, skeleton boot, any caller that wants a fixed map) leaves the arena
     * pinned to `arena` for the whole match — byte-identical to the pre-#145
     * behaviour. When non-empty, each combat round deterministically selects a
     * map from this pool (see selectRoundArena); the chosen id rides the snapshot
     * so every client agrees. MatchRoom passes the full loaded pool.
     */
    public readonly arenaPool: readonly ArenaDef[] = [],
    /**
     * Per-account champion OWNERSHIP snapshot (task #201). Default = allow-all
     * (every account unenforced), so every existing call site, unit test and the
     * replay player are byte-identical; the platform-driven path (MatchRoom)
     * passes the real per-seat ownership rebuilt from the signed match-create
     * body. Enforced INDEPENDENTLY of the whitelist: a lock-in must be BOTH
     * whitelisted (available) AND owned. See curation/ownership.ts.
     */
    public readonly ownership: Ownership = Ownership.allowAll(),
    /**
     * 基礎加成 (`config.base-bonus@1`, owner 2026-07-28) — flat per-stat grants
     * applied AFTER the combat-env multiplier, so they do NOT ride the倍率.
     *
     * ⚠️ IT IS A CONSTRUCTOR ARGUMENT SINCE #278, not a `Configs.tryGet` in the
     * body. Reading it here meant the value was whatever the PROCESS BOOTED
     * WITH: the admin page's 「下一場生效」 was a lie and an operator edit needed
     * a shard restart. MatchRoom now resolves it AT MATCH CREATION through the
     * same TTL-cache shape combat-env uses (config/baseBonus.ts), and the replay
     * player passes the table recorded in the header. The default keeps every
     * unit test and dev caller byte-identical to the pre-#278 behaviour.
     */
    baseBonus: BaseBonusTable = baseBonusFromDoc(Configs.tryGet("base-bonus")),
    /**
     * 屬性上限表 (`config.stat-caps@1`, GH#286) —— 一般上限 / 解鎖上限。
     * 和 `baseBonus` 同一條路:由**呼叫端**在建立比賽時解析並凍結,不在這裡讀
     * `Configs`。預設值只服務單元測試與骨架開機。
     */
    statCaps: StatCapTable = statCapsFromDoc(Configs.tryGet("stat-caps")),
    /**
     * 戰鬥手感 (`config.combat-feel@1`, GH#193) —— 擊退法則 + 打就站定開關。
     * 和 `baseBonus` / `statCaps` 同一條路(見上面 #278 的說明):由呼叫端在建立
     * 比賽時解析並凍結。預設值只服務單元測試與骨架開機。
     *
     * ⚠️ 已知且刻意,和 `statCaps` 完全一樣的限制:MatchRoom 沒有覆寫這個參數,
     * 所以它走的是這裡的預設值 —— `Configs` 是 **boot 時**載入的,後台改了要重啟
     * shard 才會生效。#278 只替 `baseBonus` 做了 TTL 快取;這一份還沒有,不要
     * 以為它和隔壁一樣是即時的。
     */
    combatFeel: CombatFeelRules = combatFeelFromDoc(Configs.tryGet(COMBAT_FEEL_DOC_ID)),
    /**
     * 護盾規則 (`config.shield@1`, GH#289 lane P6) —— 多個護盾池誰先被吃掉。
     * 和 `combatFeel` 完全同一條路(含同一個已知限制:`Configs` 是 boot 時載入
     * 的,後台改了要重啟 shard;#278 的 TTL 快取還沒延伸到這一份)。
     * 出貨值 `specificFirst` = 這條規則變成欄位之前的行為。
     */
    shieldRules: ShieldRules = shieldRulesFromDoc(Configs.tryGet(SHIELD_DOC_ID)),
    /**
     * 格擋規則 (`config.block@1`) —— 多個格擋來源怎麼疊。和 `shieldRules` 完全
     * 同一條路(含同一個已知限制:`Configs` 是 boot 時載入的,後台改了要重啟
     * shard)。出貨值 `independent` = owner 2026-07-31 的裁決,**它會改變平衡**
     * (兩件 30% 致死格擋從 30% 變成 51%),這一點和 `shieldRules` 相反。
     */
    blockRules: BlockRules = blockRulesFromDoc(Configs.tryGet(BLOCK_DOC_ID)),
    /**
     * 暴走規則 (`config.berserk@1`) —— 主動暴走的生命門檻與暴走中的冷卻倍率。
     * 和 `blockRules` 完全同一條路（含同一個已知限制：`Configs` 是 boot 時載入的，
     * 後台改了要重啟 shard）。
     *
     * ⚠️ 這一格在 2026-08-05 之前**整條路都不存在** —— sim 讀 `world.berserkRules`、
     * `berserkRulesFromDoc()` 也在，但沒有文件、沒有 schema、沒有這個參數，
     * 所以那個解析器從上架起沒有拿到過一份真的文件。出貨值逐字等於
     * `DEFAULT_BERSERK_RULES`，所以接上它不改變平衡。
     */
    berserkRules: BerserkRules = berserkRulesFromDoc(Configs.tryGet(BERSERK_DOC_ID)),
    /**
     * 淨化規則 (`config.dispel@1`) —— 【淨化】拔哪幾池、拔幾層。
     * 和 `blockRules` 完全同一條路（含同一個已知限制：後台改了要重啟 shard）。
     */
    dispelRules: DispelRules = dispelRulesFromDoc(Configs.tryGet(DISPEL_DOC_ID)),
    woundRules: WoundRules = woundRulesFromDoc(Configs.tryGet(WOUNDS_DOC_ID)),
    damageRules: DamageRules = damageRulesFromDoc(Configs.tryGet(DAMAGE_RULES_DOC_ID)),
    /**
     * 增益卡敵方過濾 (`config.augment-filter@1`, 批 1 決策點 1-1) —— 殭屍算不算
     * `victim: "enemyChampion"` 的敵人。和 `blockRules` 完全同一條路(含同一個
     * 已知限制:`Configs` 是 boot 時載入的,後台改了要重啟 shard)。
     * 出貨值 `false` = 字面語意 = 這個欄位出現之前的行為,所以它不改變平衡。
     */
    augmentEnemyFilter: AugmentEnemyFilter = augmentEnemyFilterFromDoc(
      Configs.tryGet(AUGMENT_ENEMY_FILTER_DOC_ID),
    ),
    /**
     * 隱形規則 (`config.stealth@1`, 隱形原語 lane D) —— 隱形擋不擋自動索敵/
     * 手動點選/技能 AoE、破隱條件、兩個渲染不透明度。和 `shieldRules` 完全同
     * 一條路(含同一個已知限制:`Configs` 是 boot 時載入的,後台改了要重啟
     * shard)。出貨值 = WC3 原作行為,所以這一格出現本身不改變任何一場比賽。
     */
    stealthRules: StealthRules = stealthRulesFromDoc(Configs.tryGet(STEALTH_DOC_ID)),
    /**
     * 嘲弄規則 (`config.taunt@1`, see sim/taunt.ts) —— 總開關、要不要蓋掉玩家
     * 手選的目標、小怪吃不吃、衝突怎麼解、全域持續時間倍率。和 `stealthRules`
     * 完全同一條路(含同一個已知限制:`Configs` 是 boot 時載入的,後台改了要
     * 重啟 shard)。出貨值 = 保守側,見 `DEFAULT_TAUNT_RULES`。
     */
    tauntRules: TauntRules = tauntRulesFromDoc(Configs.tryGet(TAUNT_DOC_ID)),
    /**
     * 身體放大倍數 → 攻擊距離 (`config.body-scale@1`, GH#252) —— 總開關 +
     * 係數 + 體型上下界。和 `tauntRules` 完全同一條路(含同一個已知限制:
     * `Configs` 是 boot 時載入的,後台改了要重啟 shard)。
     *
     * ⚠️ 出貨值**會改變平衡**,和 `shieldRules` 相反:這一格出現之前射程完全
     * 不看體型,所以係數 1 不是「維持原狀」而是 owner 要的新行為。
     */
    bodyScaleRules: BodyScaleRules = bodyScaleRulesFromDoc(Configs.tryGet(BODY_SCALE_DOC_ID)),
    /**
     * 百分比回血**與百分比扣血** (`config.regen@1`, GH#253) —— 百分比與固定值
     * 的關係、保底、以及自傷停在哪裡。
     * 和 `tauntRules` 完全同一條路(含同一個已知限制:重啟 shard 才生效)。
     * ⚠️ **出貨值會改變平衡**:owner 2026-08-02 的「Berserker 是每秒損失 1%生命,
     * 直到生命不足1%」就住在這裡 —— 出貨英雄卡只有 `godie-hapm` 填了
     * `healthDrainPctOfMax: 0.01`,而回血那一族目前沒有任何一位英雄在用。
     */
    regenRules: RegenRules = regenRulesFromDoc(Configs.tryGet(REGEN_DOC_ID)),
    /**
     * GH#264 —— 血耗光的隊伍要不要**當場**收到 #193 的中途結算卡
     * (`config.match@1` 的 `match.settlementCardOnHealthSpent`)。
     * 完整的理由寫在 {@link DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT} 的檔頭。
     *
     * 和 `combatFeel` 同一條路（含同一個已知限制:`Configs` 是 boot 時載入的,
     * 後台改了要重啟 shard），但**不寫進 `SimWorld`**：它是 host 的輸出策略，
     * 不是場上的規則，所以碰不到 `digest()`，重播照樣逐位元相同。
     */
    public readonly settlementCardOnHealthSpent: boolean = settlementCardOnHealthSpentFromDoc(
      Configs.tryGet(MATCH_CONFIG_DOC_ID),
    ),
  ) {
    this.matchSeed = seed;
    // owner 2026-08-03 的兩個 vs bot 節奏旗標。判準是「人類座位數 <= 1」,不是
    // 「場上有 bot」—— MatchRoom 把每個空位都填成 isBot,所以後者在每一場都成立。
    this.vsBotPacing = resolveVsBotPacing(seatSpecs);
    // #207 的分析帳本。matchId 是它唯一的建構參數,而且它從第 0 tick 就存在 ——
    // champ-select 的 `selectOpenTick` 是 tick 0,晚一點建立就記不到那件事。
    this.ledger = new MatchLedger(matchId);
    registerSkeletonContent();
    this.world = new SimWorld(arena, seed);
    this.world.combatEnv = combatEnv;
    // Snapshotted before tick 0 — a match in progress can never see a change.
    this.world.baseBonus = baseBonus;
    // 屬性上限 (`config.stat-caps@1`, GH#286) —— 一般上限 / 解鎖上限。
    //
    // ⚠️ 走**建構子參數**,和 baseBonus 同一條路,不是在這裡讀 `Configs`。
    // 合併 v0.9.11 三組時,攻速那一組寫的是 `statCapsFromDoc(Configs.tryGet(...))`
    // —— 那正是 #278 剛剛修掉的缺陷:`Configs` 是 **boot 時**載入的,所以後台存檔
    // 之後要重啟 shard 才生效,而頁面上寫著「從下一場開始生效」。一個修好了、
    // 隔壁又原樣長回來,是最容易在合併時發生的事。
    this.world.statCaps = statCaps;
    // 戰鬥手感 (`config.combat-feel@1`, GH#193) —— 擊退法則 + 打就站定開關。
    // 同樣在 tick 0 之前定格,比賽中途不會變。
    this.world.combatFeel = combatFeel;
    // 護盾規則 (`config.shield@1`, GH#289 lane P6) —— 同樣在 tick 0 之前定格。
    this.world.shieldRules = shieldRules;
    // 格擋規則 (`config.block@1`) —— 同樣在 tick 0 之前定格。
    this.world.blockRules = blockRules;
    // 暴走規則 (`config.berserk@1`) —— 同樣在 tick 0 之前定格。
    this.world.berserkRules = berserkRules;
    // 淨化規則 (`config.dispel@1`) —— 同樣在 tick 0 之前定格。
    this.world.dispelRules = dispelRules;
    this.world.woundRules = woundRules;
    this.world.damageRules = damageRules;
    // 增益卡敵方過濾 (`config.augment-filter@1`) —— 同樣在 tick 0 之前定格。
    //
    // ⛔ 2026-08-05：**這一行本來不存在，而它上面那句註解一直在那裡。**
    // 建構子第 799 行收下了參數、後台有整頁在編輯它、`configForms.ts` 的說明
    // 甚至逐字寫著「文件由 game-server 的 MatchController 在開場 tick 0 之前灌進
    // world.augmentEnemyFilter」—— 而全樹沒有任何一處寫過它。
    // `hooks.ts:82` 讀到的永遠是 `SimWorld.ts:684` 的出貨預設。
    //
    // 後果：`mobsCountAsEnemy` 這個開關**從來沒有在任何一場比賽裡生效過**，
    // 而畫面上、後台上、註解上全部說它有。失敗形態 ②（算了但沒送到）＋
    // 第三守則（註解說謊），兩個同時發生在同一個五行窗口裡。
    this.world.augmentEnemyFilter = augmentEnemyFilter;
    // 隱形規則 (`config.stealth@1`) —— 同樣在 tick 0 之前定格。
    this.world.stealthRules = stealthRules;
    // 嘲弄規則 (`config.taunt@1`) —— 同樣在 tick 0 之前定格。
    this.world.tauntRules = tauntRules;
    // 身體放大倍數 → 攻擊距離 (`config.body-scale@1`, GH#252) —— tick 0 之前定格。
    this.world.bodyScaleRules = bodyScaleRules;
    // 百分比回血 (`config.regen@1`, GH#253) —— tick 0 之前定格。
    this.world.regenRules = regenRules;
    // Project the operator whitelist into the sim as a pure predicate. The
    // 傳說寶玉 rolls its 3-choose-1 inside the sim (so the roll rides world.rng
    // and replays identically) and must filter the pool BEFORE rolling — the
    // round-2/5 cards roll first and filter after, which is exactly how task
    // #47's "the card silently grants nothing" bug happened. allowAll leaves
    // this a constant-true, so nothing changes on the default path.
    this.world.itemEligible = this.whitelist.bypass ? null : (itemId) => this.whitelist.allowsItem(itemId);
    // craftRole 排除清單 (owner 2026-08-04「49支可被隨機三選一 就好」). Same shape
    // as `itemEligible` above: host CONFIG, assigned once before tick 0, read by
    // `economy/offerEligibility.itemOfferableTo` — the ONE predicate both the
    // round card (`economy/draft`) and the 傳說寶玉 (`economy/legendaryOrb`) use.
    // Before this it lived as a hard-coded Set inside legendaryOrb ALONE, which
    // is why the same 合成原料 was card-offerable but orb-unrollable.
    this.world.offerExcludedCraftRoles =
      this.rules.itemDraft.excludedCraftRoles ?? DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES;
    this.phase = new PhaseMachine(phaseCfg);

    for (const spec of seatSpecs) {
      const seatId = asSeatId(spec.seatId);
      // The bot's build path is whitelist-aware: a buildPriority entry the
      // operator has not enabled is SKIPPED, not stalled on. Without this the
      // buyItem filter below silently freezes a bot on its first blocked rung.
      const seat = new Seat(
        seatId,
        asTeamId(spec.teamId),
        new AIDriver((itemId) => this.whitelist.allowsItem(itemId)),
      );
      seat.accountId = spec.accountId ?? `bot-${spec.seatId}`;
      seat.displayName = spec.displayName ?? (spec.isBot ? `Bot ${spec.seatId}` : `Player ${spec.seatId}`);
      if (spec.championId) seat.championId = spec.championId;
      this.seats.set(seatId, seat);
      this.specs.set(seatId, spec);
      this.kills.set(seatId, 0);
      this.deaths.set(seatId, 0);
      this.roundKills.set(seatId, 0);
      this.roundDeaths.set(seatId, 0);
      this.roundDeathTick.set(seatId, 0);
    }
    for (let t = 0; t < TEAM_COUNT; t++) {
      this.teamHealth.set(asTeamId(t), startingTeamHealth);
      this.roundOutcome.set(asTeamId(t), ROUND_OUTCOME.NONE);
      this.roundWins.set(asTeamId(t), 0);
    }
  }

  // ---------- champ select ----------

  selectChampion(seatId: SeatId, championId: string): SelectResult {
    if (this.phase.phase !== "champSelect") return { ok: false, reason: "wrong-phase" };
    const seat = this.seats.get(seatId);
    if (!seat) return { ok: false, reason: "no-seat" };
    if (!Champions.tryGet(championId as ChampionId)) return { ok: false, reason: "unknown-champion" };
    // AUTHORITATIVE whitelist gate: a champion not enabled by the operator can
    // never be selected online (allow-all in dev/bypass leaves this open).
    if (!this.whitelist.allowsChampion(championId)) return { ok: false, reason: "not-whitelisted" };
    // AUTHORITATIVE ownership gate (task #201): a champion the ACCOUNT has not
    // unlocked can never be locked in, MANUAL or RANDOM, even when it is on the
    // whitelist — the two predicates are independent (owned ∩ available). The
    // client filters its roster to the same set, but that filter is bypassable,
    // so this server-side reject is the load-bearing one: a crafted or replayed
    // SELECT_CHAMPION for an unowned champion is refused here. Fail-open for a
    // seat whose ownership we were never told (bots / dev joins), so #130's
    // "always at least the free roster" floor is never turned into a dead seat.
    if (!this.ownership.owns(seat.accountId, championId)) return { ok: false, reason: "not-owned" };
    seat.championId = championId;
    // #207 選角紀錄的 `lockTick`。記在**成功**的那一支上,所以被拒的選取
    // (非白名單 / 未擁有 / 錯的階段)不會留下一個假的鎖定時間。改選會覆蓋 ——
    // 「決定花了多久」問的是最後那一次決定,不是第一次動念。
    this.pickLockTick.set(seatId, this.world.tick);
    return { ok: true };
  }

  /**
   * A2 的閘:人類座位全部鎖定了嗎（所以選角可以立刻結束）。
   *
   * 「鎖定」讀的是 {@link pickLockTick} —— 它只由**成功的** `selectChampion`
   * 寫入,被拒的選取（非白名單 / 未擁有 / 錯的階段）不會留下記號。客戶端一次
   * 點擊就是「選 + 鎖」（`ChampSelectPanel.commit`，鎖定之後名單就凍結），所以
   * 這一格不會被 hover 觸發。
   *
   * ⚠️ **沒有第三種選項「等 bot 也選完」。** bot 根本不在選角階段選 —— 牠們是在
   * 階段結束時由 `autoPickAndSpawn` 一次配好的,所以「等 bot」在程式上不存在。
   * 這也是為什麼這個決策點只需要一個布林欄位。
   *
   * ⚠️ 零個人類座位回 false（見 `resolveVsBotPacing`）:全 bot 的沙盒沒有人在等,
   * 而「全部鎖定」對空集合恆真 —— 少了那一關,每一條 all-bot 測試都會在第 1 個
   * tick 跳過選角。
   */
  private champSelectEarlyStartDue(): boolean {
    if (!this.vsBotPacing.earlyStart || !this.vsBotPacing.soloVsBots) return false;
    let humans = 0;
    for (const [seatId, spec] of this.specs) {
      if (spec.isBot) continue;
      humans++;
      if (!this.pickLockTick.has(seatId)) return false;
    }
    return humans > 0;
  }

  /**
   * The champion pool a RANDOM/bot pick draws from: content-loaded champions
   * that have a model, intersected with the whitelist. If the whitelist yields
   * an empty pool (fresh/empty install) the server FALLS BACK to the full pool
   * so a botted match still runs — the human empty-state is a champ-select
   * concern on the client, never a crashed match here.
   */
  randomChampionPool(): ChampionId[] {
    const all = Champions.ids();
    const withModel = all.filter((cid) => Models.tryGet(Champions.get(cid).modelKey) !== undefined);
    const base = withModel.length > 0 ? withModel : all;
    const allowed = this.whitelist.filterChampions(base) as ChampionId[];
    if (allowed.length > 0) return allowed;
    if (!this.whitelist.bypass) {
      console.warn(
        `[match ${this.matchId}] whitelist enables no playable champion — bots fall back to the ` +
          `full pool so the match runs. Enable champions in the admin console.`,
      );
    }
    return base;
  }

  /**
   * 殭屍的 隨機英雄 抽籤 (#289) — the host half of the feature, handed to
   * `mobRulesFromConfig` at combat entry.
   *
   * ── WHY THE DRAW LIVES HERE AND NOT IN THE SIM ─────────────────────────────
   * Two things the sim must not have: the ROSTER (the whitelist is a host
   * concept — `sim/**` has no idea what a curated champion is) and a SOURCE OF
   * RANDOMNESS. `sim/purity.test.ts` bans `Math.random` outright, and `world.rng`
   * is off-limits by a stronger rule: #215 deliberately spends ZERO rng on mobs
   * so the shared stream (crit / evasion / 傳說寶玉) is bit-identical to a
   * mobless build. Drawing from it here would shift every later roll in the
   * match — the mechanic would be paid for by every OTHER random system.
   *
   * So the draw is a pure hash of `(matchSeed, round, slot)` over the SAME pool
   * `autoPickAndSpawn` uses — `randomChampionPool()`, i.e. 有模型 ∩ 白名單, with
   * its own empty-pool fallback + warning. Same seed and round ⇒ same zombie, so
   * a replay re-derives it; `world.rng.state` never moves.
   *
   * The pool is resolved LAZILY (first call only) so an arena that authors no
   * `championSource: "random"` never touches the champion/model registries at
   * all — arming a mobless or all-指定 round is byte-identical to pre-#289.
   */
  private mobChampionPicker(): MobChampionPicker {
    let pool: ChampionId[] | null = null;
    return (slot, round) => {
      pool ??= this.randomChampionPool();
      // `null` (an empty pool — impossible in practice, `randomChampionPool`
      // falls back to the full roster) degrades to 「沿用」 in the sim.
      return pickMobChampion(pool, this.matchSeed, round, slot) ?? undefined;
    };
  }

  /**
   * A championId that is safe to lock in and spawn: enabled by the whitelist AND
   * a real, loaded champion. Empty (the no-pick seat), stale, or otherwise
   * unknown ids all fail here — including a bogus id that the dev `bypass`
   * whitelist would otherwise wave through (`allowsChampion` is unconditionally
   * true under bypass), which would make `spawnChampion` throw on
   * `Champions.get`. autoPickAndSpawn re-rolls anything that fails into a random
   * ENABLED champion (from the model-backed `randomChampionPool`), so a seat can
   * never drop into round 1 as a broken/un-spawnable 0-HP unit (#130).
   */
  private isEnabledSpawnablePick(championId: string, accountId?: string): boolean {
    if (!championId) return false;
    if (!this.whitelist.allowsChampion(championId)) return false;
    // A carried pick the account does not own is NOT spawnable — re-roll it into
    // an owned champion below (task #201). A seat with unknown ownership (bot /
    // dev join) owns everything, so this is a no-op on that path.
    if (!this.ownership.owns(accountId, championId)) return false;
    return Champions.tryGet(championId as ChampionId) !== undefined;
  }

  private autoPickAndSpawn(): void {
    // uniform pick over the whitelisted, model-backed champion pool (falls back
    // to the full pool when the whitelist would starve the match — see
    // randomChampionPool).
    const pool = this.randomChampionPool();
    for (const [seatId, seat] of this.seats) {
      // AUTO-ASSIGN (the 隨機英雄 path): a seat with no pick, or one carrying a
      // champion that is no longer enabled / no longer a valid model-backed
      // champion / not owned by this account, gets a random champion at lock-in.
      // This is what keeps a player who let the champ-select clock run out from
      // spawning into a confusing dead/spectator state (0 HP, ☠觀戰中) in round 1
      // — they drop in ALIVE as a real character instead (#130).
      // #207:「這隻英雄是**怎麼**到手的」。在重擲之前先看一眼 —— 重擲之後
      // `seat.championId` 就是系統選的那一隻,分不出玩家有沒有選過。
      const lockedManually = this.isEnabledSpawnablePick(seat.championId, seat.accountId);
      if (!lockedManually) {
        // The random draw is over the whitelisted pool INTERSECTED with this
        // account's owned set, so a random/timed-out pick can never land on a
        // locked champion (task #201). If ownership would empty the pool (a
        // mis-provisioned account, never a real one thanks to #130's free
        // floor) we fall back to the whitelisted pool so the match still runs —
        // mirroring randomChampionPool's own "the match must not brick" stance.
        const owned = this.ownership.filterOwned(seat.accountId, pool);
        const drawPool = owned.length > 0 ? owned : pool;
        seat.championId = drawPool[this.world.rng.int(drawPool.length)]!;
      }
      // spawn at team's eventual side; positions are reset at each combat entry
      const zone = 0;
      const side = seat.teamId % 2;
      const slot = seatId % TEAM_SIZE;
      const spawn = this.arena.zones[zone]!.spawns[side as 0 | 1]![slot]!;
      seat.entityId = spawnChampion(this.world, {
        championId: seat.championId as ChampionId,
        seatId,
        teamId: seat.teamId,
        pos: spawn,
        zone,
      });
      // #207 選角紀錄。寫在這裡而不是 `selectChampion`,因為這裡才是**每一個
      // 座位的英雄定案**的唯一一點:沒選的、選了但被白名單/擁有權擋掉的、
      // 選了而且過關的,三種都從這一行走過去。寫在 selectChampion 只會記到
      // 第三種,而「有多少人根本沒選」正是這份資料要回答的問題之一。
      //
      // ⚠️ `source` 今天只可能是 "manual" / "auto"。barrier lane 的 schema 有
      // 第三種 "random"(玩家自己按隨機鈕),但 `SelectChampionMessage` 上只有
      // 一個 `championId` —— 客戶端的隨機鈕自己抽完之後送的是一樣的訊息,伺服
      // 器**分不出來**。要分得出來得在 protocol 上加一個旗標,那在
      // `packages/shared`,不在這一批的可動範圍。記在這裡免得有人日後看到
      // `randomPicks: 0` 以為是沒人按。
      this.ledger.recordPick({
        seatId,
        teamId: seat.teamId,
        // champ-select 的出生區。**不是**每回合的對戰區 —— 那個每回合會變,
        // 記在 `RoundPlayerRecord.zone`。
        zone,
        championId: seat.championId,
        source: lockedManually ? "manual" : "auto",
        // champ-select 從第 0 tick 就開著(PhaseMachine 的起始階段),所以開啟
        // 時間是 0 而不是某個要另外記的東西。
        selectOpenTick: 0,
        // 從未鎖定 → -1(**不是 0**:第 0 tick 鎖定是真的會發生的事,而 0 在
        // 平均值裡會被讀成「秒選」,和「完全沒選」意思相反)。
        lockTick: lockedManually ? (this.pickLockTick.get(seatId) ?? -1) : -1,
      });
      // Starting gold. 600, not 500 (task #82 found the drift): every design
      // document — the shop pacing, starter.go's `startingGold`, the 7600g
      // match-income arithmetic the whole price ladder is derived from —
      // assumes 600. At 500 the turn-1 purse buys ONE 300g SIMPLE item instead
      // of two, which deletes the opening decision the prices exist to create.
      //
      // 回合發放倍率 (owner 2026-08-04). ⚠️ THE OPENING PURSE IS IN THE 回合
      // BUCKET, and that is a judgement the owner should see: it is not paid
      // "per round", but it IS the deterministic schedule income the round
      // grants belong to, and `STARTING_GOLD` is a CONSTANT with no 後台 field
      // of its own (`config.match economy.startingGold` is read-only and unread
      // — see apps/admin/src/matchConfig.ts's header), so this multiplier is
      // currently the only knob that reaches it at all. The cost of the choice,
      // stated: at 0.5 the purse is 300, which buys ONE 300g SIMPLE item and
      // deletes the turn-1 fork task #82 built the price ladder around.
      grantGold(this.world, seat.entityId, STARTING_GOLD, "round");
    }
  }

  // ---------- round lifecycle ----------

  /**
   * Every team in the match — which, since the owner's 2026-07-27 ruling, is
   * every team, always. 「不管前面被淘汰與否，大家都回來打第 10 回合」.
   *
   * ⚠️ THIS REPLACED `aliveTeams()`, and the rename is the whole change. The old
   * predicate was `teamHealth > 0`, and it gated FIVE different things: who gets
   * paired, who gets the round's levels/gold/augments, who gets a revive charge,
   * whose Ready the intermission waits for, and when the match ends. Team health
   * reaching 0 therefore removed a team from the match entirely. Owner's ruling
   * keeps team health as a SCOREBOARD (it orders places 2/3/4 — see
   * {@link finalStandings}) and strips it of that removal power, so every one of
   * those five gates now reads this list instead.
   *
   * What did NOT change is the MEANING of `teams[].eliminated` on the wire:
   * `net/snapshot.ts` still derives it as `lives <= 0`, i.e. 「生命耗盡」, and
   * `leaveSettlement.localTeamEliminated` (#193 — a knocked-out player must pass
   * through the settlement screen before leaving) still keys off it. Forcing that
   * flag to a constant false would have silently deleted that whole path; the
   * flag keeps its meaning and merely stops ending anyone's match.
   */
  private participatingTeams(): TeamId[] {
    return [...this.teamHealth.keys()];
  }

  /**
   * Teams whose health pool is SPENT (0). Not "out of the match" — see
   * {@link participatingTeams} — just bottom of the scoreboard. Used for the
   * #193 settlement queue and for the final 2/3/4 ordering.
   */
  private healthSpentTeams(): TeamId[] {
    return [...this.teamHealth.entries()].filter(([, hp]) => hp <= 0).map(([t]) => t);
  }

  /**
   * 「誰**出局了**」—— #193 那張中途結算卡唯一該發給的隊伍（GH#264）。
   *
   * ⚠️ 它刻意**不是** {@link healthSpentTeams}。那個函式自己的註解就寫著
   * 「Not "out of the match" — just bottom of the scoreboard」，而 #193 的佇列
   * 從 2026-07-27 取消淘汰之後一直把兩者當成同一件事。分家之後：
   *
   *   · 血耗光 → 計分板見底，照樣打完十回合、照樣拿等級/金錢/三選一，
   *     **而且照樣可能在決賽奪冠**（第 1 名不看團隊生命）。
   *   · 出局   → 這一隊不會再參加任何一回合。`participatingTeams()` 是全部的
   *     隊伍，所以在比賽結束之前這個集合是**空的**。
   *
   * 後台把舊行為留成一個開關（{@link settlementCardOnHealthSpent}）：打開就退回
   * 「血一歸零就發卡」，也就是這一格出現之前的行為。
   */
  private eliminatedTeams(): TeamId[] {
    if (this.settlementCardOnHealthSpent) return this.healthSpentTeams();
    // 「存在但不再參賽的隊伍」。owner 2026-07-27:「不管前面被淘汰與否，大家都
    // 回來打第 10 回合」—— `participatingTeams()` 就是全部，所以今天這個補集是
    // 空的，而且**是推導出來的空，不是寫死的 `[]`**：哪一天淘汰回來了
    // (`participatingTeams` 開始變小)，這張卡會自己跟著活過來。
    const playing = new Set(this.participatingTeams());
    return [...this.teamHealth.keys()].filter((t) => !playing.has(t));
  }

  /**
   * Seats that still play, in map order. Every spawned seat qualifies: a team at
   * 0 health keeps 「照樣正常參戰、照樣拿每回合的等級/金錢/三選一」, so the old
   * `teamHealth <= 0 → skip` gate (which silently starved such a team of levels,
   * gold, EX unlocks and augment cards) is gone.
   */
  private *activeSeats(): Generator<[SeatId, Seat, EntityId]> {
    for (const [seatId, seat] of this.seats) {
      if (seat.entityId === null) continue;
      yield [seatId, seat, seat.entityId];
    }
  }

  private enterIntermission(): void {
    this.world.economyOpen = true;
    this.world.combatActive = false; // scoreboard time-alive pauses between rounds
    // 結算窗口結束 —— 中場對所有人開放，不再需要「只有陣亡者」那條規則。
    this.world.roundResolving = false;
    for (const seat of this.seats.values()) seat.ready = false;
    const round = this.phase.round;
    // Project the deterministic round into the sim so the stat-path capstone
    // round-gate (task #104) can withhold 傳說·萬象強化 before 「大約是第五場
    // 之後」. Shop buys happen during this intermission, so setting it here — the
    // one place `round` is already read — is the right seam and timing.
    this.world.round = round;

    // arena rules: once the ult unlock round is reached, R ranks at any level
    if (this.rules.ultUnlockRound !== null && round >= this.rules.ultUnlockRound) {
      this.world.ultGateOverride = true;
    }

    // arena rules: at the EX-unlock round, every active champion that HAS a
    // per-hero EX skill unlocks it (WC3 level-30 gate). learnEx is idempotent
    // and a no-op for heroes without an exSlot; it emits `exUnlock` for the HUD
    // toast + VFX cue. Runs once per champion (rank 0 -> 1). The EX ability is a
    // separately-curated unlockable, so it only unlocks when the ability is on
    // the whitelist (bypass/allow-all lets every EX through, unchanged).
    if (this.rules.exUnlockRound !== null && round >= this.rules.exUnlockRound) {
      for (const [, , entity] of this.activeSeats()) {
        const exId = this.world.abilities.get(entity)?.exSlot?.abilityId;
        if (exId && this.whitelist.allowsAbility(exId)) learnEx(this.world, entity);
      }
    }

    const grant = grantForRound(this.rules, round);

    // 1) deterministic round grants BEFORE offers: levels -> auto-learn -> gold
    if (grant) {
      for (const [, , entity] of this.activeSeats()) {
        if (grant.grantLevels) grantLevels(this.world, entity, grant.grantLevels);
        if (grant.autoLearn) {
          for (const slot of grant.autoLearn) {
            const ab = this.world.abilities.get(entity);
            if (ab && ab.slots[slot].rank === 0) rankUpAbility(this.world, entity, slot);
          }
        }
        // 回合發放倍率 (owner 2026-08-04) —— arena-rules 的每回合排程金.
        if (grant.grantGold) grantGold(this.world, entity, grant.grantGold, "round");
      }
    }

    // 2) augment offers (3-choose-1) on scheduled rounds — 4-choose-1 for a
    //    team holding an unspent HIGH STAKES draft bonus (the Lucky Dice
    //    stand-in; see settleRound for why it is offer WIDTH and not a reroll).
    if (grant?.augmentTier) {
      const spentBonus = new Set<TeamId>();
      for (const [seatId, seat, entity] of this.activeSeats()) {
        const bonus = this.highStakesDraftBonus.has(seat.teamId) ? 1 : 0;
        if (bonus) spentBonus.add(seat.teamId);
        const offer = offerAugments(this.world, entity, grant.augmentTier, this.rules.offerCount + bonus);
        if (offer.choices.length > 0) {
          this.offers.set(`${round}:${seatId}`, {
            kind: "augment",
            ...offer,
            seatId,
            createdTick: this.world.tick,
          });
        }
      }
      // The bonus is spent by the offer it widened, not by the round it was won
      // in: a High Stakes round is not necessarily an augment round, so the
      // reward waits for the next draft rather than evaporating.
      for (const teamId of spentBonus) this.highStakesDraftBonus.delete(teamId);
    }

    // 3) legendary-weapon offers (3-choose-1, granted FREE on pick).
    //
    //    GH#249 —「傳說武器有時候只有跳出一個而不是三選一」. These two lines used
    //    to be ROLL-THEN-FILTER:
    //
    //        const offer = offerItems(world, entity, table, offerCount);
    //        offer.choices = this.whitelist.filterItems(offer.choices);
    //
    //    Every rolled entry the operator had not enabled was DELETED off the
    //    finished card, so a 49-entry pool behind a stale whitelist handed the
    //    player 2 cards, or 1, or none — at random, because it depended on what
    //    the dice picked. The whitelist is now inside the pool the roll draws
    //    from (`world.itemEligible` → `economy/draft.eligibleItemPool`, the same
    //    place the 傳說寶玉 has always checked it), so the card is full whenever
    //    `offerCount` enabled weapons exist. `filterItems` is GONE from this
    //    path on purpose: a second, later filter is the defect, not a safety net.
    if (grant?.weaponLootTable) {
      for (const [seatId, , entity] of this.activeSeats()) {
        const offer = offerItems(
          this.world,
          entity,
          grant.weaponLootTable,
          this.rules.offerCount,
          this.rules.itemDraft,
        );
        if (offer.choices.length > 0) {
          this.offers.set(`${round}:${seatId}:w`, {
            kind: "item",
            ...offer,
            seatId,
            createdTick: this.world.tick,
          });
          if (offer.choices.length < this.rules.offerCount) {
            // Reachable ONLY through genuine pool exhaustion now (see above),
            // which is a content/curation fact worth saying out loud rather
            // than a dice outcome. Says the size so the operator can tell
            // "I enabled two weapons" from "this hero owns everything else".
            console.warn(
              `[match ${this.matchId}] round ${round} seat ${seatId}: the ` +
                `${grant.weaponLootTable} card is ${offer.choices.length} wide, not ` +
                `${this.rules.offerCount} — only ${offer.choices.length} eligible weapons ` +
                `remain for this champion (owned / not enabled in 內容白名單 / wrong attack type).`,
            );
          }
        } else {
          // Task #47's silent failure, still AUDIBLE. With the whitelist ahead
          // of the roll this can only mean the eligible pool was EMPTY.
          console.warn(
            `[match ${this.matchId}] round ${round} seat ${seatId}: the ${grant.weaponLootTable} ` +
              `pool holds nothing this champion may be offered — this seat gets NO weapon. Enable ` +
              `more items in the admin console (內容白名單).`,
          );
        }
      }
    }

    // 4) legacy item gacha reward (道具抽卡) for every surviving seat, rolled
    //    only over whitelisted loot entries.
    if (this.rules.gacha && round >= this.rules.gacha.fromRound) {
      const table = this.rules.gacha.lootTable;
      for (const [, , entity] of this.activeSeats()) {
        this.grantGachaReward(entity, table);
      }
    }
  }

  /**
   * One gacha grant, whitelist-aware. In bypass/allow-all this delegates to the
   * shared roll for byte-identical legacy behavior; otherwise it rolls a
   * weighted pick restricted to whitelisted loot entries (skips when none
   * qualify), so a non-enabled item is never granted.
   */
  private grantGachaReward(entity: EntityId, tableId: string): void {
    if (this.whitelist.bypass) {
      rollItemReward(this.world, entity, tableId);
      return;
    }
    const table = LootTables.tryGet(tableId);
    if (!table) return;
    const pool = table.entries.filter((e) => this.whitelist.allowsItem(e.itemId));
    if (pool.length === 0) return;
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let roll = this.world.rng.next() * total;
    let picked = pool[pool.length - 1]!.itemId;
    for (const e of pool) {
      roll -= e.weight;
      if (roll <= 0) {
        picked = e.itemId;
        break;
      }
    }
    grantItemFree(this.world, entity, picked);
  }

  /**
   * Choose THIS combat round's arena deterministically from the rotation pool
   * (task #145) and make it active for both the controller (spawn placement) and
   * the sim (collision). Seeded off (matchSeed, round) via a pure hash that never
   * touches world.rng, so:
   *   • server-authoritative + reproducible — every client/replica computes the
   *     same id, and a same-seed replay is byte-identical,
   *   • stable within a round (picked once here, at combat entry — never re-picked
   *     mid-round),
   *   • it varies across rounds (consecutive rounds never repeat; see
   *     pickRoundArena).
   * An empty/singleton pool is a no-op, so a match without rotation keeps its
   * fixed `arena` exactly as before. The chosen id is exposed on the broadcast
   * state as `mapId` (projectSnapshot reads ctl.arena.id), which the client-render
   * agent watches to swap the scene; per-arena guardian identities (#105) and the
   * fire-ring/flower arming below all key off this same active arena.
   */
  private selectRoundArena(): void {
    // THE FINALE OVERRIDES THE ROTATION. Round FINAL_ROUND is a twelve-player
    // royale and the rotation maps are two 24-radius duel zones — half the room
    // and the wrong shape. `arena.royale` is one 42-radius zone with four spawn
    // clusters (see ArenaDef.ROYALE_ARENA), and picking it here is what makes the
    // enlarged boundary REACH THE PLAYER: `net/snapshot` publishes `ctl.arena.id`
    // as `mapId` every tick, the client's GameApp.applyArena re-fetches the doc
    // with that id and rebuilds the ground, the minimap terrain and the fire-ring
    // band from it. Scaling a zone in server memory instead would have moved the
    // collision boundary while every client still drew (and read the ring
    // against) the old 24-radius disc.
    if (isRoyaleRound(this.phase.round)) {
      const royale = this.royaleArena();
      this.arena = royale;
      this.world.setArena(royale);
      return;
    }
    const picked = pickRoundArena(this.arenaPool, this.matchSeed, this.phase.round);
    if (!picked) return; // empty pool → keep the current (fixed) arena
    this.arena = picked;
    this.world.setArena(picked);
  }

  /**
   * The finale map: the loaded `arena.royale` content doc when the content tree
   * is present (live play, and any test that loads content), otherwise the
   * built-in {@link ROYALE_ARENA} with the same id and the same geometry.
   *
   * The two are pinned together by `royaleArena.test.ts`, which parses the
   * SHIPPED json and compares it field-by-field with the constant — so the "no
   * content" fallback can never quietly become a different arena from the one
   * players get, and the doc can never be deleted without a red test.
   */
  private royaleArena(): ArenaDef {
    return resolveRoyaleArena();
  }

  /**
   * Zero the PER-ROUND presentation inputs: the K/D tallies and every team's
   * roundOutcome. Called at COMBAT ENTRY — deliberately not at concludeCombat —
   * because the round-end beat (the `resolution` phase, and the shop
   * intermission after it) is exactly when the client reads them to present the
   * round's MVP. Resetting on the way OUT of combat would blank the numbers one
   * tick before anyone looks at them; resetting on the way IN keeps the just
   * -finished round's tally readable until the next round actually starts.
   */
  private resetRoundTallies(): void {
    for (const seatId of this.seats.keys()) {
      this.roundKills.set(seatId, 0);
      this.roundDeaths.set(seatId, 0);
      // 不清掉的話,上一回合的陣亡先後會原封不動沿用到這一回合的頒獎台。
      this.roundDeathTick.set(seatId, 0);
    }
    for (const teamId of this.roundOutcome.keys()) this.roundOutcome.set(teamId, ROUND_OUTCOME.NONE);
  }

  private enterCombat(): void {
    this.world.economyOpen = false;
    this.world.combatActive = true; // scoreboard time-alive accrues during combat
    // 保險：正常路徑上 enterIntermission 已經清過，但 skipPhase / failsafe
    // 會直接跳到這裡，而一個沒清掉的 roundResolving 會讓下一次結算的判斷失真。
    this.world.roundResolving = false;
    // #207:一張走到這裡還沒被解決的卡,是「發了但沒有人拿」。今天 #207 的過期
    // 安全網會在中場結束時把每一張都自動選掉,所以這個迴圈**正常情況下是空
    // 的** —— 它在的理由是:哪天安全網被繞過(skipPhase 作弊、fault failsafe
    // 強制推進階段),那三張卡的存在會被記下來而不是憑空消失。picked=null 的
    // 紀錄讓 `offered = picked + autoPicked + declined` 這條等式仍然成立。
    // ⭐ 2026-08-06 —— 這裡以前只是**記下來**再 `clear()`,也就是把卡丟掉。
    // owner:「我前面已購買 寶玉 或 強化屬性 出現隨機三選一來不及選,請隨機幫我
    // 選一個避免買了沒選到吃虧」。
    //
    // ⛔ 上面那段舊註解說「正常情況下這個迴圈是空的,#207 的過期安全網會處理」
    // —— 那句話**有一個沒說出口的前提**:安全網只跑在 `case "intermission"` 裡。
    // 而寶玉／強化屬性是在**商店**買的,陣亡者可以在**戰鬥中**買
    //(見 `sim/economy/shopAccess.ts`),所以那張卡是在 `combat` 相位生出來的,
    // 中間經過 resolution 完全沒有人管它。只要相位被 skipPhase 或 failsafe 推進,
    // 它就走到這裡被丟掉 —— 而玩家已經付了 2400 金或 375 金。
    //
    // 改成**在丟掉之前一定先自動選**,用與 #207 完全同一支 `autoPickIndex`
    //(seeded off the match,不是 Math.random / world.rng),所以同種子重播一致。
    // `applyPick` 自己記帳(auto=true → 算進 `autoPicked` 而不是 `picked`)也自己
    // 從 `offers` 移除,所以這裡不再需要手動 recordOffer。
    //
    // ⚠️ 用快照迭代:`applyPick` 會動 `this.offers`(同 intermission 那一支)。
    for (const [offerId, offer] of [...this.offers]) {
      this.applyPick(offerId, offer, this.autoPickIndex(offerId, offer), true);
    }
    this.offers.clear();
    // 這一回合的戰鬥從這一 tick 開始 —— `RoundGradeContext.roundTicks` 的減數。
    this.combatStartTick = this.world.tick;
    this.roundBossKills.clear();
    this.duelWinners.clear();
    this.pendingDuelWinners.clear(); // #L2 — last round's held-open state must not decide this one
    this.appliedBossExtensionTicks = 0; // …and last round's king does not lengthen this round
    // …and the sim's mirror of it (#216): every zone is UNDECIDED again, so the
    // fire ring burns and the mob waves arrive in all of them from tick 0.
    this.world.settledZones.clear();
    // …以及「一隊全滅就停止生怪」那一格（owner 2026-08-02）。跟 settledZones 同一
    // 個生命週期:不清掉的話,上一回合被打光的那個 zone 這一回合一隻殭屍都不會生。
    this.world.spawnHaltedZones.clear();
    // 【具名標記】的回合邊界 —— `resetOn:"round"` 的標記在這裡補回 initial。
    //
    // ⚠️ 決策點：重置該放「上一回合結束（concludeCombat / enterIntermission）」
    // 還是「下一回合開始（這裡）」？選了**下一回合開始**，三個理由：
    //  1) 中場商店看到的是**真實剩餘層數**。玩家在商店做的決策（買什麼、要不要
    //     留錢）建立在「我這回合燒掉了幾層」上；提早補滿會把那段資訊抹掉，
    //     跟 `resetRoundTallies` 刻意不在 concludeCombat 清 K/D 是同一個理由。
    //  2) 與 hp/mana 同一個生命週期 —— 兩個 placement 迴圈也是在 enterCombat
    //     才 `hp.hp = hp.maxHp`。標記是「新身體」的一部分,跟著 `clearForFreshBody`
    //     走（同一個相位）語意才一致。
    //  3) ⛔ `enterIntermission` **是可以被跳過的**（skipPhase 作弊 / fault
    //     failsafe 直接推進到 enterCombat,見上面 roundResolving 那段保險）。
    //     重置放在中場 = 那些路徑會讓玩家帶著上一回合花掉的層數開打。
    //     enterCombat 是每一回合**必經**的那一個。
    //
    // 呼叫一次就夠：它是 world 級的（掃 world.marks 全表）,所以決鬥與大亂鬥
    // 兩條 placement 路徑共用這一行,不會有「只改一條」的那種隨機故障。
    // `resetOn:"match"` / `"never"` 的標記它不碰 —— 十二道試煉跨回合共享 12 層
    // 就是靠這個區分,無條件全部重置會讓那個機制整個消失。
    resetMarksForRound(this.world);
    this.resetRoundTallies();

    // Per-round arena rotation (task #145): pick THIS round's map deterministically
    // from the pool BEFORE anyone is placed, so fighters spawn into it and the
    // guardian / fire-ring / flower arming below all read the same geometry.
    this.selectRoundArena();

    // COMMIT the shopping session: drop every champion's buy/sell undo history so
    // a purchase made this round can no longer be reversed once combat starts
    // (task #121) — this is the seam that makes a cross-round buy→sell→undo cycle
    // impossible to exploit for gold.
    for (const seat of this.seats.values()) {
      if (seat.entityId !== null) commitShopSession(this.world, seat.entityId);
    }

    // THE FINALE (round FINAL_ROUND): one bout, every team, one zone. On any
    // other round the classic round-robin split into two duel zones.
    if (isRoyaleRound(this.phase.round)) {
      this.pairings = [];
      this.bye = null;
      this.royale = royaleBout(this.participatingTeams());
      // Re-arming the finale re-opens it. Only the skipPhase cheat and the
      // fault failsafe can enter round FINAL_ROUND twice, but a stale winner
      // would make `checkRoyaleEnd` return true on the re-entry's first tick.
      this.royaleWinner = null;
      // …and give the round the clock it needs. `config.match@1` ships
      // combatMaxSec: 100, but the finale's fire ring does not ignite until 180 s
      // (owner: 決賽要給玩家足夠時間真的打一場). Left on the normal phase timer the
      // round would be force-settled on HP percentages at 100 s and the delayed
      // ring would be a number nobody ever sees. Written straight onto the phase
      // machine's counter — the phase was entered one line before this call, so
      // this is the same instant `enter()` set it, and `Math.max` means a config
      // with an ALREADY longer combat phase is never shortened.
      //
      // Gated on a configured ring on purpose: with `fireRing === null` (unit
      // tests, skeleton boot) there is nothing to wait for, so the finale keeps
      // the caller's own combat length and those matches stay fast.
      //
      // #L2: the number itself now comes from {@link combatMaxTicksForRound},
      // the SAME function that feeds the sim's `combatMaxTicks`. Two copies of
      // 「決賽有多長」 is precisely how the phase clock and the sim deadline would
      // end up 5,700 ticks apart on round 10 and nowhere else.
      this.phase.ticksLeft = this.combatMaxTicksForRound(this.phase.round);
    } else {
      this.royale = null;
      const { pairings, bye } = pairTeams(this.participatingTeams(), this.phase.round);
      this.pairings = pairings;
      this.bye = bye;
    }

    // park everyone dead first; revive the fighters at their duel spawns
    for (const seat of this.seats.values()) {
      if (seat.entityId === null) continue;
      const hp = this.world.health.get(seat.entityId);
      if (hp) {
        hp.alive = false;
        hp.hp = 0;
      }
      const nav = this.world.nav.get(seat.entityId);
      if (nav) {
        nav.order = null;
        nav.moveTarget = null;
        nav.attackTarget = null;
        nav.attackTargetAuto = false;
        nav.override = null;
      }
      // #247: a round boundary drops anyone still mid-leap out of the air. The
      // override and the airborne entry are cleared together, always.
      this.world.airborne.delete(seat.entityId);
    }
    // The champions actually SCHEDULED into a bout this round — filled by the
    // placement loop below (or by placeRoyale on the finale) and handed to
    // beginCombatCoins. A bye team never reaches that loop, so it gets no coin
    // budget and therefore cannot throw into someone else's duel (task #191).
    const fighters: EntityId[] = [];
    if (this.royale) this.placeRoyale(this.royale, fighters);
    for (const pairing of this.pairings) {
      const zoneDef = this.arena.zones[pairing.zone]!;
      for (const [side, teamId] of [
        [0, pairing.sideA],
        [1, pairing.sideB],
      ] as const) {
        // THIS is the authoritative "participated this round" seam: a team is
        // marked FOUGHT exactly where its seats are placed into a duel zone. The
        // bye team never reaches this loop, so it stays NONE — the one signal
        // that separates 「輪空」 from 「被團滅」 (both read alive:false, 0/0).
        // settleRound later upgrades this to WON/LOST.
        this.roundOutcome.set(teamId, ROUND_OUTCOME.FOUGHT);
        let slot = 0;
        for (const seat of this.seats.values()) {
          if (seat.teamId !== teamId || seat.entityId === null) continue;
          const t = this.world.transform.get(seat.entityId)!;
          const spawn = zoneDef.spawns[side]![slot % TEAM_SIZE]!;
          t.pos = { x: spawn.x, z: spawn.z };
          t.zone = pairing.zone;
          t.facing = { x: side === 0 ? 1 : -1, z: 0 };
          const hp = this.world.health.get(seat.entityId)!;
          hp.alive = true;
          hp.hp = hp.maxHp;
          hp.mana = hp.maxMana;
          // A4(#278) —— 見 `sim/clearPools.ts`。這一段以前漏掉 `world.dot`,
          // 所以上一回合的燃燒會燒進新回合的開場。
          clearForFreshBody(this.world, seat.entityId);
          fighters.push(seat.entityId);
          slot++;
        }
      }
    }
    // clear stray projectiles between rounds
    for (const [id] of this.world.projectile) this.world.destroy(id);

    // arm the healing-flower schedule for this round's duel zones (despawns
    // any stale flowers first; no-op when the rules doc has no flowers block)
    if (this.rules.flowers) {
      beginCombatFlowers(
        this.world,
        flowerRulesFromConfig(this.rules.flowers, this.world.dt),
        this.activeZones(),
      );
    } else {
      endCombatFlowers(this.world);
    }

    // arm the revive circles for this round (task #84). Charges are per TEAM
    // per ROUND, so they are handed out here — to EVERY team still alive,
    // including the bye — and cleared by concludeCombat. Absent block = the
    // mechanic is simply off, exactly like the flowers' legacy-compat rule.
    if (this.rules.reviveCircles) {
      beginCombatRevives(
        this.world,
        reviveRulesFromConfig(this.rules.reviveCircles, this.world.dt),
        this.participatingTeams(),
      );
    } else {
      endCombatRevives(this.world);
    }

    // arm the ROUND-PACING FIRE RING (task #132). Its combat-elapsed counter
    // starts at 0 here and the ring stays dormant until `startSec` — the single
    // source of truth for round length — then closes in with the escalating
    // %-HP true burn. FireRingSystem gates every burn on `world.combatActive`,
    // so the instant a round settles (task #100 flips it false in concludeCombat)
    // the ring stops: a LIVE-combat finish accelerator, never a post-settle
    // grinder. Absent config = OFF, exactly like the flowers' legacy-compat rule.
    //
    // #E (owner 2026-07-27): the FINALE ignites at 180 s instead of 60 s, and its
    // start radius is the royale zone's own 42 — the ring reads `boundaryRadius`
    // off the ACTIVE zone (fireRing.ts `currentFireRingRadius`), so selecting the
    // bigger arena above already widened the first circle. Had it not, the very
    // first contraction would have started 18 units inside the field and wiped
    // every team at once.
    //
    // #L2 — THE THIRD ARGUMENT IS THE WHOLE TASK. Until now this call passed two
    // arguments, so `FireRingRules.combatMaxTicks` came out `Infinity`: the sim
    // had NO enforceable round deadline, `isCombatTimeUp` was false forever, and
    // `extendRoundForBoss` refused to move anything (its half-state gate). Handing
    // it the SAME backstop the phase machine runs on — `combatMaxTicksForRound`,
    // converted back to seconds because that is the unit the sim's config
    // converter takes — is what makes 「殭屍王出現回合結束時間延長 3 分鐘(火圈時間
    // 也延後)」 real rather than a knob wired to nothing.
    const ring = this.fireRingForRound(this.phase.round);
    if (ring) {
      beginCombatFireRing(
        this.world,
        fireRingRulesFromConfig(
          ring,
          this.world.dt,
          this.combatMaxTicksForRound(this.phase.round) / TICK_HZ,
        ),
      );
    } else {
      endCombatFireRing(this.world);
    }

    // arm the neutral duel-zone GUARDIANS (task #89): one per ACTIVE duel zone
    // (the bye has no pairing, so no guardian). `round` scales guardian HP +
    // volley damage. Cleared by concludeCombat so no post-round PvE farming.
    // Absent config = OFF (same legacy-compat rule as flowers/revives). The
    // guardian is a neutral structure (no team/seat/nav/stats) so duel
    // resolution, team health, placement and the scoreboard stay blind to it.
    if (this.rules.guardianTower) {
      beginCombatGuardians(
        this.world,
        guardianRulesFromConfig(this.rules.guardianTower, this.world.dt),
        this.activeZones(),
        this.phase.round,
      );
    } else {
      endCombatGuardians(this.world);
    }

    // arm 陣亡投幣 (task #191): ten 100-gold throws for every champion actually
    // placed into a duel this round. `fighters` — not `this.seats` — is the
    // authoritative list, which is what makes a bye/eliminated seat's throw come
    // back as `not-in-round` without any team-lives plumbing reaching the sim.
    // Absent config = OFF (same legacy-compat rule as flowers/revives/guardians).
    if (this.rules.goldDrop) {
      beginCombatCoins(this.world, coinRulesFromConfig(this.rules.goldDrop), fighters);
    } else {
      endCombatCoins(this.world);
    }

    // arm 71-00 暗夜契約 (死之王 godie-u00k). Same legacy-compat shape as the four
    // systems above: absent config = OFF. This call is the ONLY thing that was
    // missing — the sim, the guards, the Zod block and `snapshot.ts:353`'s flag
    // radius were all already built, so `world.nightPactRules` stayed null and
    // `nightPactSystem` returned at its first line every tick. The whole 天生技
    // did nothing in a real match while `nightPact.test.ts` stayed green,
    // because that test calls `beginCombatNightPact` itself (failure shape ②).
    if (this.rules.nightPact) {
      beginCombatNightPact(this.world, nightPactRulesFromConfig(this.rules.nightPact));
    } else {
      endCombatNightPact(this.world);
    }

    // arm the ROGUELITE MOB WAVES (task #215): from `mobWaves.fromRound` onward,
    // voxel-zombie mobs (喪標麥可) stream in from the EDGES of each ACTIVE duel
    // zone (the bye has no pairing, so no mobs) and escalate with combat time.
    // `round` gates it; the dedicated mobTicks clock resets to 0 here. Cleared by
    // concludeCombat so there is no post-round PvE farming. Absent config OR a
    // round before fromRound = OFF (same legacy-compat rule as guardians). A mob
    // is a MONSTER-team neutral with no ChampionComp, so duel resolution, team
    // health, placement and the scoreboard stay blind to it.
    // The PER-ROOM toggle (#215) short-circuits the whole arm: `!== false` so
    // absent/undefined/true all pass (default ON — old rooms/replays keep
    // spawning), and only an explicit `false` from a room override falls through
    // to the else-branch endCombatMobs → zero mobs, byte-identical mobless run.
    if (
      this.rules.rogueliteMobs !== false &&
      this.rules.mobWaves &&
      this.phase.round >= this.rules.mobWaves.fromRound
    ) {
      // #217: the ROUND is the mob's LEVEL channel. `this.phase.round` is the same
      // deterministic host counter that already arms guardian HP two blocks up;
      // mobRulesFromConfig bakes level = baseLevel + levelPerRound*(round-fromRound)
      // — round 3 → lv3, round 4 → lv4 — and the levelled maxHp/regen into the
      // rules ONCE, here. The sim never sees a round, and a replay re-arms from its
      // own recorded ArenaRules + its own replayed round, so it round-trips exactly.
      beginCombatMobs(
        this.world,
        // #289 — the fifth argument is the 隨機英雄 draw. THE ONLY PRODUCTION
        // CALL SITE that passes one: everything else (the client's prediction
        // shadow, the replay player's pure re-arm, every unit test) calls with
        // four arguments or fewer and gets 「沿用今天的行為」.
        mobRulesFromConfig(
          this.rules.mobWaves,
          this.world.dt,
          this.phase.round,
          // ⚠️ `undefined`, NOT `this.combatEnv`. This call has ALWAYS used the
          // shipped coefficients (the parameter default) and swapping in the
          // live table here would silently re-scale every hero-derived king /
          // special on any host with a tuned 戰鬥系統 — a balance edit disguised
          // as a plumbing change. Stated explicitly because the slot is now
          // visible in the call rather than omitted.
          undefined,
          this.mobChampionPicker(),
        ),
        this.activeZones(),
      );
    } else {
      endCombatMobs(this.world);
    }
  }

  /**
   * The zones a bout is being fought in this round: the two duel zones normally,
   * the single royale zone on the finale. Flowers, guardians and mob waves are
   * all armed per active zone, so this is the one place the "the finale is one
   * zone" fact needs to be stated for all three.
   *
   * ⚠️ ONE GUARDIAN ON THE FINALE, by construction — a list of one zone arms one
   * tower at that zone's centre (#89's rule is "one per active zone", not "two").
   */
  private activeZones(): number[] {
    if (this.royale) return [this.royale.zone];
    return this.pairings.map((p) => p.zone);
  }

  /**
   * The fire-ring schedule for `round`: the authored block, except on the FINALE
   * where `startSec` becomes {@link ROYALE_FIRE_RING_START_SEC} (180 s).
   *
   * PER-ROUND, NOT GLOBAL: rounds 1-9 keep the shipped 60 s from #195 untouched.
   * Returning a fresh object rather than mutating `this.fireRing` matters — the
   * config object is also written into the replay header, and mutating it would
   * make round 10 retroactively rewrite what rounds 1-9 recorded.
   */
  private fireRingForRound(round: number): FireRingConfig | null {
    if (!this.fireRing) return null;
    if (!isRoyaleRound(round)) return this.fireRing;
    return { ...this.fireRing, startSec: ROYALE_FIRE_RING_START_SEC };
  }

  /**
   * THE ONE definition of 「這一回合的戰鬥最長多久」, in ticks (#L2).
   *
   * TWO CONSUMERS, ONE NUMBER, and that is the point:
   *   · `enterCombat` writes it onto `PhaseMachine.ticksLeft` (the countdown the
   *     snapshot ships as `phaseTicksLeft`);
   *   · the same value / TICK_HZ is `fireRingRulesFromConfig`'s third argument,
   *     i.e. the sim's `combatMaxTicks` — the deadline `extendRoundForBoss`
   *     moves and `isCombatTimeUp` compares against.
   *
   * Before #L2 only the first existed and the second was `Infinity`, which is
   * why a 殭屍王 could not extend anything. Deriving both from here means the
   * finale's 210 s substitution can never apply to one clock and not the other.
   *
   * `this.phase.cfg.combatMaxTicks` is the AUTHORED backstop (`combatMaxSec` in
   * `config.match@1`, resolved by `phaseConfigFromSeconds`) — read from the
   * phase machine rather than re-resolved from content, so an operator edit
   * lands on both clocks or neither.
   */
  private combatMaxTicksForRound(round: number): number {
    const authored = this.phase.cfg.combatMaxTicks;
    // The finale needs long enough for the 180 s ring to actually arrive; see
    // ROYALE_COMBAT_SEC. Gated on a configured ring exactly as the old inline
    // `if (this.fireRing)` was: a ringless match (unit tests, skeleton boot) has
    // nothing to wait for and keeps the caller's own combat length.
    if (!this.fireRing || !isRoyaleRound(round)) return authored;
    return Math.max(authored, Math.round(ROYALE_COMBAT_SEC * TICK_HZ));
  }

  /**
   * Place every team into the FINALE zone: four clusters of three, one cluster
   * per team, spaced around the rim (owner: 「出生點改成環狀均分（每隊 3 人一組、
   * 四組等距，讓隊友生在一起而四隊互相拉開）」).
   *
   * The cluster a team gets is its index in the bout's ASCENDING team list, so
   * the layout is a pure function of who is playing — deterministic, and
   * identical under same-seed replay.
   *
   * FACING is computed toward the zone centre rather than read from a table, so
   * it stays correct if an operator re-authors `arena.royale.json` into a
   * different shape. Only +-*\/ and Math.sqrt, all IEEE-correctly-rounded, so two
   * replicas agree bit-for-bit (the same standard the sim's own purity gate
   * holds; no trig, no transcendentals).
   */
  private placeRoyale(bout: RoyaleBout, fighters: EntityId[]): void {
    const zoneDef = this.arena.zones[bout.zone] ?? this.arena.zones[0]!;
    bout.teams.forEach((teamId, group) => {
      // Same seam as the duel path: FOUGHT is written exactly where a team's
      // seats are placed, so a team that never got placed reads NONE.
      this.roundOutcome.set(teamId, ROUND_OUTCOME.FOUGHT);
      let slot = 0;
      for (const seat of this.seats.values()) {
        if (seat.teamId !== teamId || seat.entityId === null) continue;
        const t = this.world.transform.get(seat.entityId)!;
        const spawn = royaleSpawnAt(zoneDef, group, slot % TEAM_SIZE);
        t.pos = { x: spawn.x, z: spawn.z };
        t.zone = bout.zone;
        const dx = zoneDef.center.x - spawn.x;
        const dz = zoneDef.center.z - spawn.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        t.facing = len > 0 ? { x: dx / len, z: dz / len } : { x: 1, z: 0 };
        const hp = this.world.health.get(seat.entityId)!;
        hp.alive = true;
        hp.hp = hp.maxHp;
        hp.mana = hp.maxMana;
        // A4(#278) —— 大亂鬥那一條路。⚠️ **兩個 enterCombat 站點都要改** ——
        // 只改決鬥那一條會讓大亂鬥回合的殘留活下來,而決鬥回合是乾淨的,
        // 測起來像隨機故障。
        clearForFreshBody(this.world, seat.entityId);
        fighters.push(seat.entityId);
        slot++;
      }
    });
  }

  private teamAliveCount(teamId: TeamId, zone: number): number {
    let n = 0;
    for (const seat of this.seats.values()) {
      if (seat.teamId !== teamId || seat.entityId === null) continue;
      const t = this.world.transform.get(seat.entityId);
      const hp = this.world.health.get(seat.entityId);
      if (t?.zone === zone && hp?.alive) n++;
    }
    return n;
  }

  private teamHpPct(teamId: TeamId, zone: number): number {
    let sum = 0;
    for (const seat of this.seats.values()) {
      if (seat.teamId !== teamId || seat.entityId === null) continue;
      const t = this.world.transform.get(seat.entityId);
      const hp = this.world.health.get(seat.entityId);
      if (t?.zone === zone && hp?.alive && hp.maxHp > 0) sum += hp.hp / hp.maxHp;
    }
    return sum;
  }

  /**
   * The decided winner of the duel in `zone`, or undefined while that duel is
   * still LIVE (undecided, in combat). Public because the snapshot projection
   * (net/snapshot.ts) mirrors it onto `MatchState.duels` so a spectating client
   * knows which zones are still fighting (task #208). A read-only view of the
   * private `duelWinners` map — nothing outside this class mutates duel results.
   */
  duelWinnerOf(zone: number): TeamId | undefined {
    return this.duelWinners.get(zone);
  }

  /**
   * Check duel outcomes; returns true when every pairing is decided.
   *
   * This is the "conclude the instant one side is wiped" seam (task #208 / the
   * ≤1-living-team case): it runs EVERY combat tick (advancePhase → "combat"),
   * and the MOMENT a side's in-zone living count reaches 0 the duel is recorded
   * for that zone. The round ends as soon as `duelWinners.size` reaches
   * `pairings.length`, so a fully-decided round never waits for the phase timer
   * — no explicit extra guard is needed, and this is pinned by
   * roundEnd.test.ts. Determinism holds: the only tie-breaks (double-KO, an
   * equal-HP timer expiry) draw from `world.rng`, never Math.random/Date.now.
   * Bye correctness (#173) is structural: a bye team is in no pairing, so it is
   * never counted here and never blocks the conclusion.
   *
   * ── #L2: THE THREE WAYS A ROUND ENDS (owner 2026-07-30) ──────────────────
   *
   *   1. 玩家全滅            → immediately, mobs or no mobs;
   *   2. 只剩一隊存活 **且** 場上沒有殭屍 → immediately (this is #208, now
   *      qualified: with zombies still standing the duel is remembered but the
   *      round stays LIVE — 「場上還有任何殭屍時,只剩一隊也不結束」);
   *   3. 時間到              → force-settled on team-HP fraction, and `timerExpired`
   *      overrides the mob hold so rule 2 can never outlast the clock.
   *
   * The TIMER itself is no longer `PhaseMachine.ticksLeft`; see
   * {@link combatTimeUp} for why it is the sim's absolute deadline instead.
   */
  private checkCombatEnd(timerExpired: boolean): boolean {
    // ⚠️ THE FINALE MUST BE CHECKED FIRST. The duel path below concludes when
    // `duelWinners.size === pairings.length`, and on the finale BOTH are 0 — so
    // falling through would declare round 10 finished on its very first combat
    // tick, before a single blow was struck. The royale has its own end rule.
    if (this.royale) return this.checkRoyaleEnd(this.royale, timerExpired);
    for (const pairing of this.pairings) {
      if (this.duelWinners.has(pairing.zone)) continue;
      const aAlive = this.teamAliveCount(pairing.sideA, pairing.zone);
      const bAlive = this.teamAliveCount(pairing.sideB, pairing.zone);
      if (aAlive === 0 && bAlive === 0) {
        // 玩家全滅 → 立即結束,不管殭屍在不在 (owner 2026-07-30). The mob hold
        // below deliberately does NOT reach this branch: with no champion left
        // there is nobody for the zombies to keep the round open FOR, and the
        // 保底 that ends such a round would then be the phase timer alone.
        //
        // The winner is the team the hold was already crediting, if there was
        // one — see {@link pendingDuelWinners}. Only a genuine simultaneous
        // wipe (nothing pending) falls through to the coin, exactly as before.
        const pending = this.pendingDuelWinners.get(pairing.zone);
        this.recordDuelWinner(
          pairing.zone,
          pending ?? (this.world.rng.chance(0.5) ? pairing.sideA : pairing.sideB),
        );
      } else if (bAlive === 0 || aAlive === 0) {
        const survivor = bAlive === 0 ? pairing.sideA : pairing.sideB;
        // 只剩一隊時,回合要不要結束 (owner 2026-07-30 → **改過** 2026-08-02).
        //
        // 2026-07-30 的規則是「場上還有**任何**殭屍就不結束」。2026-08-02 owner
        // 實打之後收窄：「已經只剩我方英雄 敵方英雄全死 並且**場上沒有殭屍王**
        // 回合應該要馬上勝利結算才對」。所以現在讀後台的
        // `mobWaves.roundHoldMobKinds`（出貨值 `"boss"`），不是寫死「任何」。
        //
        // ⚠️ 舊規則之所以變成玩家眼中的 bug，是因為它跟生成閘門形成一個
        // **自我維持的迴圈**：
        //     一隊全滅 → 想記勝負 → 場上有殭屍 → 不記
        //                             ↓
        //             沒記 = 沒進 settledZones = 繼續生成殭屍 ──┘
        // 唯一能打破它的是火圈的百分比真實傷害，所以體感就是「一定要等火圈」。
        // 下面兩行是那個迴圈的兩個切點，**兩個都要**：
        //   · `spawnHaltedZones` —— 一隊全滅的那一刻就停止生怪（不等勝負被記下）
        //   · `roundHoldMobKinds` —— 只有王（預設）壓得住回合
        // 只切一刀都還會留尷尬：只停生成，場上剩的十幾隻仍要慢慢清；只收窄壓制，
        // 結束那一瞬間可能還有殭屍在生。
        //
        // `timerExpired` 依然永遠贏：階段硬底線是這個 hold 不會無限延長的保證。
        this.pendingDuelWinners.set(pairing.zone, survivor);
        const mobRules = this.world.mobRules;
        if (mobRules?.stopSpawnOnTeamWipe ?? DEFAULT_STOP_SPAWN_ON_TEAM_WIPE) {
          this.world.spawnHaltedZones.add(pairing.zone);
        }
        const holdKinds = ROUND_HOLD_KINDS[mobRules?.roundHoldMobKinds ?? DEFAULT_ROUND_HOLD_KINDS];
        if (!timerExpired && anyMobsAliveOfKinds(this.world, pairing.zone, holdKinds)) continue;
        this.recordDuelWinner(pairing.zone, survivor);
      } else if (timerExpired) {
        const aPct = this.teamHpPct(pairing.sideA, pairing.zone);
        const bPct = this.teamHpPct(pairing.sideB, pairing.zone);
        this.recordDuelWinner(
          pairing.zone,
          aPct > bPct ? pairing.sideA : bPct > aPct ? pairing.sideB : this.world.rng.chance(0.5) ? pairing.sideA : pairing.sideB,
        );
      }
    }
    // A1 —— vs bot 的強制結算 (owner 2026-08-03:「如果是 vs bot，玩家場勝負結算，
    // 另一場的 bot 還沒則強制結算，不要讓玩家白等」)。
    //
    // 為什麼**放在迴圈之後**:上面那個迴圈才是「這一 tick 有沒有人分出勝負」的
    // 唯一判定。放在前面的話,人類那一區在**這一 tick**剛剛結束的那一次會被漏掉,
    // 強制結算要等到下一 tick —— 差一格看不出來,但它會讓守衛只在某些排列下綠。
    if (this.forceSettleVsBotDue()) this.forceSettleRemainingZones();
    return this.duelWinners.size === this.pairings.length;
  }

  /**
   * A1 的閘:現在該不該把還在打的 bot 區直接判掉。
   *
   * 三個條件缺一不可,而**第三個是這條規則的全部意義**:
   *   · 後台開著（`config.match@1` 的 `forceSettleVsBot`）;
   *   · 這是一場「只有一個人類」的 bot 局（見 `resolveVsBotPacing` 為什麼不是
   *     「場上有 bot」，也為什麼零個人類不算）;
   *   · **人類自己那一區已經有勝負** —— 沒有這一條就不是「不要讓玩家白等」，
   *     而是「回合一開打就結束」。
   *
   * ⚠️ 人類這一隊**輪空**（這一回合沒有配對）時刻意**不**觸發:那時候
   * `humanZones` 是空的,而「每一個都有勝負」對空集合恆真 —— 直接回 true 會讓
   * 那一回合在第一個 combat tick 就結束,畫面上是一場零秒的比賽。空集合走
   * `length > 0` 這一關擋掉。
   */
  private forceSettleVsBotDue(): boolean {
    if (!this.vsBotPacing.forceSettle || !this.vsBotPacing.soloVsBots) return false;
    if (this.duelWinners.size === this.pairings.length) return false;
    const humanZones = this.humanDuelZones();
    return humanZones.length > 0 && humanZones.every((z) => this.duelWinners.has(z));
  }

  /** 這一回合有人類座位在裡面的 zone（通常剛好一個）。 */
  private humanDuelZones(): number[] {
    const humanTeams = new Set<TeamId>();
    for (const [seatId, spec] of this.specs) {
      if (!spec.isBot) humanTeams.add(this.seats.get(seatId)!.teamId);
    }
    return this.pairings
      .filter((p) => humanTeams.has(p.sideA) || humanTeams.has(p.sideB))
      .map((p) => p.zone);
  }

  /**
   * 把還沒定勝負的 zone 用**和時間到完全一樣的裁決**判掉:團隊血量比例高的贏,
   * 完全平手擲 `world.rng`。
   *
   * ⚠️ 刻意複用 `timerExpired` 那一條分支的規則,而不是發明第二套(例如「A 隊
   * 直接贏」或「兩邊都算輸」)。這一格只縮短**等待**,不改變任何一區的勝負規則
   * —— 一套只在 bot 局跑的獨立裁決會是玩家看不到、也沒有人在測的第二種結局。
   * 亂數同樣走 `world.rng`,所以同 seed 的重播判出同一個結果。
   */
  private forceSettleRemainingZones(): void {
    for (const pairing of this.pairings) {
      if (this.duelWinners.has(pairing.zone)) continue;
      const aPct = this.teamHpPct(pairing.sideA, pairing.zone);
      const bPct = this.teamHpPct(pairing.sideB, pairing.zone);
      this.recordDuelWinner(
        pairing.zone,
        aPct > bPct
          ? pairing.sideA
          : bPct > aPct
            ? pairing.sideB
            : this.world.rng.chance(0.5)
              ? pairing.sideA
              : pairing.sideB,
      );
    }
  }


  /**
   * Record a zone's duel winner — and, in the SAME instant, tell the SIM that
   * this zone is done (task #216).
   *
   * `world.combatActive` is global: it only drops once every pairing is decided
   * (concludeCombat), so between "my 3v3 ended" and "the last 3v3 ends" the sim
   * still treated a finished zone as live combat and kept burning its survivors
   * with the fire ring (and kept feeding it mob waves). Since a player who went
   * down this round is already looking at the shop (client shopGate), that is
   * exactly the reported 「回到商店…還會有火圈聲音跟血量會降低」.
   *
   * `settledZones` is SIM state, not host state, precisely so the systems can
   * read it and the replay digest can hash it. This is the ONLY writer, it is
   * called from the deterministic `checkCombatEnd` (whose only tie-breaks draw
   * from `world.rng`), and `enterCombat` is the only clearer — no wall clock, no
   * client input, nothing that could differ between replicas.
   */
  private recordDuelWinner(zone: number, winner: TeamId): void {
    this.duelWinners.set(zone, winner);
    this.world.settledZones.add(zone);
  }

  /**
   * THE FINALE'S END RULE: the last team with anyone still standing in the royale
   * zone takes the match (owner: 「最後存活的那一隊就是全場冠軍…不看團隊生命」).
   *
   * Three ways it ends, all deterministic:
   *  · ONE team left standing → that team, immediately (the same 「只剩一隊存活
   *    時立即宣佈」 beat as #208, now at match scale rather than duel scale) —
   *    EXCEPT while zombies are still standing in the zone, which holds the
   *    crown back exactly as the duel path holds a duel (#L2);
   *  · EVERYBODY down in the same instant (a mutual wipe, or the closed fire ring
   *    burning out the last survivors together) → an rng coin among the entrants,
   *    exactly how the existing double-KO tie-break behaves;
   *  · TIMER expiry with several teams alive → most surviving team HP fraction,
   *    with rng breaking an exact tie.
   *
   * `world.rng` — never Math.random / Date.now — so a same-seed replay picks the
   * same champion. Ties are compared on `>` with a symmetric coin, so the answer
   * cannot depend on iteration order beyond the ascending-team-id list.
   */
  private checkRoyaleEnd(bout: RoyaleBout, timerExpired: boolean): boolean {
    if (this.royaleWinner !== null) return true;
    const standing = bout.teams.filter((t) => this.teamAliveCount(t, bout.zone) > 0);
    if (standing.length === 1) {
      // #L2, same two owner rules as the duel path (see checkCombatEnd): the
      // last team standing has WON, but 「場上還有任何殭屍時…不會提前結束」
      // applies to the finale too — mob waves arm on the royale zone exactly
      // like a duel zone (`activeZones()`), so a 殭屍王 alive here would
      // otherwise be cut off mid-fight by the crown being awarded.
      this.pendingDuelWinners.set(bout.zone, standing[0]!);
      if (timerExpired || !anyMobsAlive(this.world, bout.zone)) {
        return this.recordRoyaleWinner(bout, standing[0]!);
      }
      return false;
    }
    if (standing.length === 0) {
      // 玩家全滅 → 立即結束. The crown goes to whoever was last standing while
      // the round was held open for the zombies; only a genuine simultaneous
      // wipe (nothing pending) is a coin among the entrants, as it always was.
      const pending = this.pendingDuelWinners.get(bout.zone);
      return this.recordRoyaleWinner(
        bout,
        pending ?? bout.teams[this.world.rng.int(bout.teams.length)]!,
      );
    }
    if (!timerExpired) return false;
    let best = standing[0]!;
    let bestPct = this.teamHpPct(best, bout.zone);
    for (const t of standing.slice(1)) {
      const pct = this.teamHpPct(t, bout.zone);
      if (pct > bestPct || (pct === bestPct && this.world.rng.chance(0.5))) {
        best = t;
        bestPct = pct;
      }
    }
    return this.recordRoyaleWinner(bout, best);
  }

  /**
   * Latch the finale's winner and tell the SIM the zone is settled — the same
   * `settledZones` write `recordDuelWinner` does, and for the same #216 reason:
   * the fire ring and the mob waves both skip a settled zone, so without it the
   * ring would keep burning the champion while the victory screen came up.
   */
  private recordRoyaleWinner(bout: RoyaleBout, winner: TeamId): boolean {
    this.royaleWinner = winner;
    this.world.settledZones.add(bout.zone);
    return true;
  }

  /**
   * Settle every decided duel into TEAM HEALTH, then lock any eliminations.
   *
   * The model is LoL Arena's, which the owner chose over the old lives table:
   *   • the LOSER of each duel drops `teamHealthLost(round)` — −2 (R1-3),
   *     −4 (R4-6), −6 (R7+);
   *   • on a HIGH STAKES round (5, then every 4th) the WINNER gains
   *     `HIGH_STAKES_REWARD` (+15) — the mechanic that lets a winning team
   *     pull far enough ahead that the match has a long tail instead of four
   *     teams dying within a round of each other;
   *   • 0 = the pool is SPENT — which since the owner's 2026-07-27 ruling costs
   *     the team nothing but standing: it keeps playing every remaining round
   *     (see {@link participatingTeams}) and its final place is 2/3/4 by health.
   *
   * See `PairedDuels.isHighStakesRound` for why a BYE round pays nobody.
   */
  private settleRound(): void {
    // THE FINALE settles on its own terms: a champion, no team-health movement.
    // Owner point 5 scopes the health drain to 「第 1~9 回合」, and it would be
    // meaningless here anyway — health orders places 2/3/4 and the finale decides
    // place 1, so charging the finale's losers would only scramble the very
    // ranking the ten rounds were played to earn.
    if (this.royale) {
      this.settleRoyale(this.royale);
      return;
    }
    // Same round + same bye for every pairing, so hoist the payout decision out
    // of the loop: a High Stakes round pays EVERY duel winner, or none of them.
    const highStakes = isHighStakesRound(this.phase.round, this.bye !== null);
    for (const pairing of this.pairings) {
      const winner = this.duelWinners.get(pairing.zone);
      if (winner === undefined) continue;
      const loser = winner === pairing.sideA ? pairing.sideB : pairing.sideA;
      // Upgrade FOUGHT → WON/LOST. The round-end presentation prefers a team that
      // actually WON its duel, which also stops it ever naming the round's LOSER
      // — possible on standings alone, because the lives deduction below can
      // still leave the loser above the winner (loser 3→2 outranks winner 1).
      this.roundOutcome.set(winner, ROUND_OUTCOME.WON);
      this.roundOutcome.set(loser, ROUND_OUTCOME.LOST);
      // …and bump the MATCH-lifetime win counter the client's victory gate
      // edge-detects to fire the small round-win firework (#93). Clamped to the
      // uint8 the schema replicates it as; a match never gets near 255 rounds.
      this.roundWins.set(winner, Math.min(255, (this.roundWins.get(winner) ?? 0) + 1));
      this.teamHealth.set(
        loser,
        Math.max(0, (this.teamHealth.get(loser) ?? 0) - teamHealthLost(this.phase.round)),
      );
      if (highStakes) {
        // HIGH STAKES payout. No cap, exactly as in Arena: the whole point is
        // that a team which keeps winning the marquee rounds buys runway no
        // amount of ordinary winning could.
        this.teamHealth.set(winner, (this.teamHealth.get(winner) ?? 0) + HIGH_STAKES_REWARD);
        // …and the DRAFT half of the reward — GGD's stand-in for Arena's Lucky
        // Dice. Arena hands each member of the winning team an extra reroll for
        // their augment/anvil pick. GGD HAS NO PLAYER-FACING REROLL: the only
        // `rerollOffers` in the codebase is a dev cheat (applyCheat, gated
        // behind DEV_CHEATS and exposed solely in CheatConsole), so there is no
        // "extra reroll" to grant and shipping one would mean a new command, a
        // new protocol message and new UI in three lanes this one does not own.
        //
        // The intent of a reroll is AGENCY IN THE DRAFT — a second look at the
        // cards. The smallest thing in GGD that carries that intent is the
        // offer WIDTH, which is already a parameter (`rules.offerCount`): a
        // High Stakes winner's next augment offer is 4-choose-1 instead of
        // 3-choose-1. Same currency (more of the pool visible before you
        // commit), zero new surface, and it is deterministic so replays are
        // unaffected. Flagged in the hand-off as the deliberate substitution it
        // is, not a silent omission.
        this.highStakesDraftBonus.add(winner);
      }

      for (const seat of this.seats.values()) {
        if (seat.entityId === null) continue;
        if (seat.teamId === winner) {
          // 回合發放倍率 (owner 2026-08-04) —— 回合勝/負/輪空與決賽結算金全部同一格.
          grantGold(this.world, seat.entityId, GOLD_REWARDS.roundWin, "round");
          grantXp(this.world, seat.entityId, XP_REWARDS.roundSurvive);
        } else if (seat.teamId === loser) {
          grantGold(this.world, seat.entityId, GOLD_REWARDS.roundLose, "round");
          grantXp(this.world, seat.entityId, Math.floor(XP_REWARDS.roundSurvive / 2));
        }
      }
      const winTeamIdx = winner as number;
      void winTeamIdx;
    }
    // bye team gets loser-level gold (didn't fight). Its roundOutcome stays NONE
    // — deliberately: "didn't fight" is exactly what the presentation must read,
    // so it never celebrates a team that sat the round out.
    if (this.bye !== null) {
      for (const seat of this.seats.values()) {
        if (seat.teamId === this.bye && seat.entityId !== null) {
          grantGold(this.world, seat.entityId, GOLD_REWARDS.roundLose, "round");
        }
      }
    }

    this.queueEliminationSettlements();
  }

  /**
   * Settle the FINALE: the survivor is the match champion, everyone else lost the
   * decider. No team-health movement (see settleRound's royale branch) and no
   * placements yet — the full 1/2/3/4 board is assembled once, in
   * {@link finalStandings}, so the champion and the health ranking are decided by
   * one function instead of two that could disagree.
   */
  private settleRoyale(bout: RoyaleBout): void {
    const winner = this.royaleWinner;
    for (const teamId of bout.teams) {
      this.roundOutcome.set(teamId, teamId === winner ? ROUND_OUTCOME.WON : ROUND_OUTCOME.LOST);
    }
    if (winner !== null) {
      // The client's victory gate (vfx/victoryTrigger) edge-detects roundWins, so
      // the finale must bump it exactly like any other round win or the champion
      // gets no firework at the one moment the fireworks exist for (#93/#235).
      this.roundWins.set(winner, Math.min(255, (this.roundWins.get(winner) ?? 0) + 1));
    }
    for (const seat of this.seats.values()) {
      if (seat.entityId === null) continue;
      if (seat.teamId === winner) {
        grantGold(this.world, seat.entityId, GOLD_REWARDS.roundWin, "round");
        grantXp(this.world, seat.entityId, XP_REWARDS.roundSurvive);
      } else {
        grantGold(this.world, seat.entityId, GOLD_REWARDS.roundLose, "round");
        grantXp(this.world, seat.entityId, Math.floor(XP_REWARDS.roundSurvive / 2));
      }
    }
  }

  /**
   * #193: the moment a team's health pool hits 0 — while the match is STILL
   * RUNNING for everyone, itself included — snapshot the scoreboard and queue it
   * for that team, so its players can open the evaluation screen before leaving.
   *
   * ⚠️ GH#264 CORRECTED WHAT "ELIMINATED" MEANS HERE. This used to read
   * {@link healthSpentTeams} — 「血耗光」—— which stopped meaning 「出局」 the day
   * elimination was removed. The predicate is now {@link eliminatedTeams}, and the
   * legacy trigger survives as an operator switch
   * ({@link settlementCardOnHealthSpent}) rather than as the hardcoded default:
   * deleting the queue outright would have been the silent feature withdrawal the
   * hand-off warned about, and leaving it on the old predicate handed the eventual
   * CHAMPION a 「戰鬥結束」 card mid-match.
   *
   * ⚠️ `teams[].eliminated` on the wire is untouched — it is still `lives <= 0`,
   * and the client's leave-flow still gates on it
   * (`leaveSettlement.localTeamEliminated`). What changed is only whether a card
   * is queued to go with it; with no card, `shouldSettleBeforeLeave`'s
   * `hasSettlement` is false and that player gets the ordinary #271 leave
   * confirmation instead. No client change is needed for either mode.
   *
   * Suppressed on the LAST round (the finale, or the host's round cap — #288):
   * `maybeFinish` broadcasts the authoritative final settlement seconds later and
   * a duplicate card would only race it. Same predicate, one home
   * ({@link isLastRound}).
   */
  private queueEliminationSettlements(): void {
    const newlyOut = this.eliminatedTeams().filter((t) => !this.healthSpentAnnounced.has(t));
    if (newlyOut.length === 0) return;
    for (const teamId of newlyOut) this.healthSpentAnnounced.add(teamId);
    if (this.isLastRound()) return;
    const snapshot = this.buildSettlement();
    for (const teamId of newlyOut) {
      this.eliminationSettlements.push({ teamId, settlement: snapshot });
    }
  }

  /**
   * The FINAL 1/2/3/4 board, assembled once at match end.
   *
   *   • place 1 = the FINALE's survivor, whatever its team health is. Owner:
   *     「最後存活的那一隊就是全場冠軍。不看團隊生命。」 A champion sitting on 0
   *     health is not a contradiction, it is the design — ten rounds of team
   *     health decide who played best, one royale decides who wins.
   *   • places 2/3/4 = the rest by TEAM HEALTH descending — 「它決定這十回合誰
   *     打得好與全場 2/3/4 名」 — then by round wins, then by team id. The chain
   *     is total and made of integers, so it is deterministic and replay-stable.
   */
  private finalStandings(): TeamId[] {
    const champion = this.royaleWinner;
    const rest = this.participatingTeams().filter((t) => t !== champion);
    rest.sort((a, b) => {
      const ha = this.teamHealth.get(a) ?? 0;
      const hb = this.teamHealth.get(b) ?? 0;
      if (ha !== hb) return hb - ha;
      const wa = this.roundWins.get(a) ?? 0;
      const wb = this.roundWins.get(b) ?? 0;
      if (wa !== wb) return wb - wa;
      return a - b;
    });
    return champion === null ? rest : [champion, ...rest];
  }

  /**
   * Drain the per-team elimination settlements queued since the last call
   * (task #193). MatchRoom calls this once per tick and broadcasts each entry.
   * Returns and clears; a second call in the same tick yields nothing.
   */
  takeEliminationSettlements(): { teamId: number; settlement: MatchSettlement }[] {
    if (this.eliminationSettlements.length === 0) return [];
    const drained = this.eliminationSettlements;
    this.eliminationSettlements = [];
    return drained;
  }

  /**
   * Wrap up a finished combat round: despawn flowers, settle team health, stop
   * time-alive accrual, and — if the MATCH is now decided — latch outcomeDecided
   * and freeze every champion so the settlement front-view shows a still hero.
   * Shared by the normal combat→resolution transition and the skipPhase cheat.
   */
  private concludeCombat(): void {
    endCombatFlowers(this.world); // round over: all flowers despawn
    endCombatRevives(this.world); // …and every circle + in-flight channel dies
    endCombatFireRing(this.world); // …and the round-pacing fire ring re-idles (#132)
    endCombatGuardians(this.world); // …and every neutral guardian despawns (no post-round farming, #89)
    endCombatCoins(this.world); // …and every unclaimed coin BURNS — no carry into the next round (#191)
    endCombatNightPact(this.world); // …and every 暗夜旗 + 黑夜靈氣 clears (71-00)
    endCombatMobs(this.world); // …and every mob despawns — no post-round PvE farming (#215)
    // PER-ROUND SNAPSHOT — must run BEFORE settleRound(). settleRound is where
    // a team can be ELIMINATED, and an elimination there immediately builds a
    // #193 settlement for the knocked-out players. Recording afterwards would
    // hand those players a card whose per-round history is missing the very
    // round that just knocked them out, while its whole-match totals include it
    // — the two halves of one payload disagreeing. roundHistory.test.ts pins
    // this by summing an elimination payload's rounds against its own totals.
    this.recordRoundHistory();
    // #207:同一個瞬間、同一個理由(見上)。`recordRoundHistory` 之後才跑,是
    // 因為兩者都讀 world.matchStats 的**同一個**累積值,而 settleRound 之後就
    // 不是「戰鬥剛結束」了。兩份 delta 各自維護自己的減數(`lastRoundCumulative`
    // vs `lastLedgerStats`),所以誰先誰後不影響對方的數字。
    this.recordLedgerRound();
    this.settleRound();
    this.world.combatActive = false;
    // ⭐ 結算窗口開始（owner 2026-08-06：「只要我回合被打倒就可以到商店購買，
    // 但是被復活就又不行」）。在這一格之前，這裡到中場之間 `shopAccess` 推導出
    // `"closed"`，連剛剛被打倒的人都被拒 —— 而 #208「只剩一隊存活就立即宣佈回合
    // 勝利」讓那常常就是他被打倒的同一瞬間。復活發生在中場，所以「被復活就不行」
    // 由 `alive` 自己表達，不需要在這裡做任何事。
    this.world.roundResolving = true;
    // The round is SETTLED: halt every champion RIGHT NOW (#100) — clear the
    // in-flight swing/cast, sticky nav targets and residual momentum — so the
    // scene freezes for the round-win / settlement beat instead of letting the
    // bots keep trading blows through `resolution` and the next shop. From here
    // the intent seam (freezeCombatIntent, gated on combatActive) keeps them
    // frozen until enterCombat re-parks and re-arms combat next round.
    this.freezeControls();
    // THE MATCH IS DECIDED WHEN THE FINALE IS OVER — not when someone runs out of
    // team health, because nobody is removed by that any more. …or when the host's
    // round cap is reached (#288). This is the same predicate `maybeFinish` uses
    // one resolution phase later; latching it here is what stops the bots trading
    // blows through the victory beat (#100).
    if (this.isLastRound()) {
      this.outcomeDecided = true;
    }
  }

  /**
   * Halt every champion: clear nav orders/targets/overrides and any in-progress
   * cast / basic-attack wind-up, and zero residual momentum. Called at EVERY
   * round settle (concludeCombat) and again at matchEnd (maybeFinish). Combined
   * with the intent seam refusing to feed combat orders while combat is not live
   * (freezeCombatIntent, gated on world.combatActive) — and, at match end,
   * skipping intent gathering entirely while outcomeDecided is set — this pins
   * each champion idle for the round-win / victory settlement beat (still hero,
   * no drift/casts). Deterministic — mutates only world state the sim already owns.
   */
  private freezeControls(): void {
    for (const seat of this.seats.values()) {
      if (seat.entityId === null) continue;
      const nav = this.world.nav.get(seat.entityId);
      if (nav) {
        nav.order = null;
        nav.moveTarget = null;
        nav.attackTarget = null;
        nav.attackTargetAuto = false;
        nav.override = null;
      }
      // #247: a round boundary drops anyone still mid-leap out of the air. The
      // override and the airborne entry are cleared together, always.
      this.world.airborne.delete(seat.entityId);
      const t = this.world.transform.get(seat.entityId);
      if (t) {
        t.vel = { x: 0, z: 0 }; // kill residual momentum so the hero stands still
        t.accel = 0;
      }
      const ab = this.world.abilities.get(seat.entityId);
      if (ab) {
        ab.cast = null;
        ab.windup = null;
      }
    }
  }

  /**
   * Snapshot THIS round's contribution for every seat and append it to
   * {@link roundHistory}. Called once per settled combat round, from
   * concludeCombat, BEFORE settleRound pays out — nothing it reads is touched
   * by the payout, but reading first keeps "the instant combat ended" literal.
   *
   * Every counter is stored as a DELTA against the previous settle; `hpRatio`
   * is a LEVEL (see RoundStatDelta). Pure reads of world state + a Map write on
   * the controller: no rng, no clock, no digest movement.
   */
  private recordRoundHistory(): void {
    const players: RoundStatDelta[] = [];
    for (const [seatId, seat] of this.seats) {
      if (seat.entityId === null) continue;
      const s = this.world.matchStats.get(seat.entityId) ?? createMatchStats();
      const hp = this.world.health.get(seat.entityId);
      const ratio = hp && hp.alive && hp.maxHp > 0 ? hp.hp / hp.maxHp : 0;
      const cur: RoundStatDelta = {
        seatId,
        hpRatio: ratio < 0 ? 0 : ratio > 1 ? 1 : ratio,
        kills: s.kills,
        deaths: s.deaths,
        assists: s.assists,
        damageDealt: s.damageDealt,
        damageTaken: s.damageTaken,
        damageBlocked: s.damageBlocked,
        healingDone: s.healingDone,
        ccAppliedTicks: s.ccAppliedTicks,
        timeAliveTicks: s.timeAliveTicks,
        revivesPerformed: s.revivesPerformed,
        mobKills: this.world.mobKills.get(seat.entityId) ?? 0,
        bye: this.roundOutcome.get(seat.teamId) === ROUND_OUTCOME.NONE,
      };
      const prev = this.lastRoundCumulative.get(seatId);
      players.push({
        seatId,
        hpRatio: cur.hpRatio, // a level, never differenced
        kills: cur.kills - (prev?.kills ?? 0),
        deaths: cur.deaths - (prev?.deaths ?? 0),
        assists: cur.assists - (prev?.assists ?? 0),
        damageDealt: cur.damageDealt - (prev?.damageDealt ?? 0),
        damageTaken: cur.damageTaken - (prev?.damageTaken ?? 0),
        damageBlocked: cur.damageBlocked - (prev?.damageBlocked ?? 0),
        healingDone: cur.healingDone - (prev?.healingDone ?? 0),
        ccAppliedTicks: cur.ccAppliedTicks - (prev?.ccAppliedTicks ?? 0),
        timeAliveTicks: cur.timeAliveTicks - (prev?.timeAliveTicks ?? 0),
        revivesPerformed: cur.revivesPerformed - (prev?.revivesPerformed ?? 0),
        mobKills: cur.mobKills - (prev?.mobKills ?? 0),
        bye: cur.bye,
      });
      // 「活下來」= still standing when the round settled. A bye round does not
      // count: nobody fought, so nobody survived anything.
      if (cur.hpRatio > 0 && !cur.bye) {
        this.roundsSurvived.set(seatId, (this.roundsSurvived.get(seatId) ?? 0) + 1);
      }
      this.lastRoundCumulative.set(seatId, cur);
    }
    this.roundHistory.push({ round: this.phase.round, players });
  }

  /**
   * Assemble the victory-settlement payload: every player's scoreboard, their
   * role-normalised grade (vs the lobby), and their per-match rank 1..N, plus
   * the winning team. Pure read of world.matchStats + the rating module. The
   * ranked ladder deltas (pointsDelta / tier) are left undefined — the platform
   * fills them on the leaderboard screen.
   */
  private buildSettlement(): MatchSettlement {
    const players: SettlementPlayer[] = [];
    const entries: RankEntry[] = [];
    for (const [seatId, seat] of this.seats) {
      if (seat.entityId === null) continue;
      const stats = this.world.matchStats.get(seat.entityId) ?? createMatchStats();
      const cdef = Champions.tryGet(seat.championId as ChampionId);
      const role = cdef?.role ?? "fighter";
      entries.push({ stats, role, roundsSurvived: this.roundsSurvived.get(seatId) ?? 0 });
      players.push({
        seatId,
        accountId: seat.accountId,
        champ: seat.championId,
        teamId: seat.teamId,
        role,
        grade: "C", // replaced below (kept non-optional for the type)
        rank: 0, // replaced below
        stats,
      });
    }
    const lobby = entries.map((e) => e.stats);
    const ranks = perMatchRanks(entries);
    players.forEach((p, i) => {
      p.grade = grade(entries[i]!.stats, lobby, entries[i]!.role);
      p.rank = ranks[i]!;
      // The SAME expression the placement sorted on. Printing a different number
      // beside the rank it did not produce is how a scoreboard starts lying.
      p.score = rankScore(entries[i]!, lobby);
      p.survivalBonus = survivalBonus(entries[i]!);
    });
    // #212 團隊累積積分 → 帳本。餵的是**同一批** RankEntry,所以隊伍分是成員
    // 結算分的和,而不是另一條路推出來的第二個數字(回合畫面和結算畫面對不上
    // 的時候,玩家會相信比較大的那一個)。
    this.ledger.setTeamScores(
      players.map((p, i) => ({ ...entries[i]!, seatId: p.seatId, teamId: p.teamId })),
    );
    let winnerTeam = -1;
    for (const [teamId, place] of this.placements) if (place === 1) winnerTeam = teamId;
    // DEEP-COPIED per round, not handed out by reference: the elimination path
    // (#193) builds a settlement mid-match and the controller keeps recording
    // rounds afterwards. A shared array would let an already-broadcast payload
    // grow rounds the player never saw when it was sent.
    //
    // PINNED BY roundHistory.test.ts —— 「the elimination payload does NOT grow」
    // (the outer array) and 「every payload is an independent tree」 (entries,
    // players array, and each delta). Both assert against the UN-COPIED object
    // the controller handed out; a test that deep-copies the payload first
    // cannot see this defect at all, which is how it went unguarded once.
    const rounds = this.roundHistory.map((r) => ({
      round: r.round,
      players: r.players.map((p) => ({ ...p })),
    }));
    return { matchId: this.matchId, winnerTeam, perPlayer: players, rounds };
  }

  /**
   * DETERMINISTIC auto-pick index for a draft that reached the timer unanswered
   * (task #207: 三選一來不及選 → 自動隨機幫選一個). The choice is a pure function
   * of the MATCH SEED and the offer's identity (its createdTick + its offerId —
   * the offerId disambiguates two offers a seat can hold on the same tick, e.g.
   * an augment card and a legendary-weapon card), so:
   *   • it is genuinely varied per offer (not the fixed choices[0] it replaced),
   *   • it consumes NO `world.rng` and never calls `Math.random`, so it perturbs
   *     no other randomness and a same-seed REPLAY resolves the auto-pick to the
   *     identical card — the digest stays byte-identical (see replay.test.ts),
   *   • it is stable regardless of WHICH tick the safety-net fires on, since it
   *     hashes the offer's createdTick rather than `world.tick`.
   * Mirrors the arena-rotation hash (ArenaDef.pickRoundArena) in spirit: seed-
   * derived, world.rng-independent. Returns 0 for a 0/1-card offer.
   */
  private autoPickIndex(offerId: string, offer: StoredOffer): number {
    const n = offer.choices.length;
    if (n <= 1) return 0;
    let h = (this.matchSeed ^ Math.imul(offer.createdTick | 0, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < offerId.length; i++) {
      h = Math.imul(h ^ offerId.charCodeAt(i), 0x01000193) >>> 0; // FNV-1a mix
    }
    // splitmix32 finalizer (same avalanche as ArenaDef.hash32)
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    return h % n;
  }

  /**
   * 一個 StoredOffer 的三選一種類,barrier lane 的 {@link OfferKind} 說法。
   *
   * `reservesSlot` 是 傳說寶玉 卡的標記(#82:它從擲出那一刻就佔住一個道具
   * 格),而它在 host 裡是以 `kind: "item"` 存的 —— 和第 2/5 回合免費武器卡
   * 同一個形狀。分析上這兩者**完全不是同一件事**(一個是花 2400g 抽的,一個是
   * 白送的),混成一格會讓「傳說寶玉值不值得買」永遠算不出來。
   */
  private static offerKindOf(offer: StoredOffer): OfferKind {
    if (offer.reservesSlot) return "legendary";
    return offer.kind;
  }

  /**
   * Apply an offer pick (augment or free item) and consume the offer.
   *
   * `auto` = 這一次不是玩家的意思(AI 座位的自動選、或 #207 的過期安全網)。
   * 它必須傳進來而不是在這裡推導:同一支 `applyPick` 兩個呼叫點,一個是玩家
   * 的 `pickOffer` 事件、一個是 `advancePhase` 的安全網,而「選取率」把這兩種
   * 混在一起就是一半的樣本是隨機數 —— 隨機數的選取率沒有任何意義。
   */
  private applyPick(offerId: string, offer: StoredOffer, choiceIdx: number, auto: boolean): void {
    const choice = offer.choices[choiceIdx] ?? offer.choices[0]!;
    // #207:記在 apply 的入口,**在任何一條 return 之前**。下面 attr 那一支
    // (`applyAttrPick`)是有可能失敗的,但卡片已經被消耗掉了(這個方法無條件
    // `offers.delete`),所以那仍然是「這張被選走了」。
    this.ledger.recordOffer({
      seatId: offer.seatId,
      round: this.phase.round,
      tick: this.world.tick,
      kind: MatchController.offerKindOf(offer),
      offered: [...offer.choices],
      picked: choice,
      auto,
      // `declined` 由 recordOffer 自己從 offered − picked 推導 —— 呼叫端不算,
      // 不然「沒選的那兩張」會有兩個版本。
    });
    if (offer.kind === "item") {
      // A 傳說寶玉 card holds an inventory slot from the moment it is rolled
      // (task #82). Release it FIRST so the grant below can use the very slot
      // the reservation was protecting, and release it on every exit path —
      // this method deletes the offer unconditionally, so a reservation that
      // outlived its card would cost the player a slot for the rest of the
      // match.
      if (offer.reservesSlot) releaseOrbSlot(this.world, offer.entity);
      applyItemPick(this.world, offer, choice as ItemId);
    } else if (offer.kind === "attr") {
      // 能力屬性強化 (#260). The 375g was charged when the card OPENED, so the
      // pick is a pure grant: it adds the rolled 力/敏/智 magnitude into
      // `champ.attrBonus`, which `championStatBase` folds into the base stat.
      // No slot is reserved — 屬性強化 has never occupied one.
      if (applyAttrPick(this.world, offer.entity, choice)) offer.picked = choice;
    } else {
      applyAugmentPick(this.world, offer, choice as AugmentId);
    }
    this.offers.delete(offerId);
  }

  /**
   * Register the 3-choose-1 card a purchased 傳說寶玉 rolled. Keyed by tick +
   * seat so a player who buys two orbs in one shopping phase gets two distinct
   * cards rather than silently overwriting the first (they paid 4800g).
   *
   * The offer is deliberately shaped exactly like a round-5 weapon offer
   * (`kind: "item"`, `tier: ITEM_OFFER_TIER`), so it inherits the whole
   * existing lifecycle for free: the client's pick message, the AI's
   * auto-pick-after-10-ticks, the "intermission cannot end with an open offer"
   * rule, and the expiry safety net.
   */
  private registerOrbOffer(entity: EntityId, choices: ItemId[]): void {
    const seat = [...this.seats.values()].find((s) => s.entityId === entity);
    if (!seat || choices.length === 0) {
      // The sim already charged 2400g and reserved a slot; if no card can be
      // registered for it, hand the slot back rather than leaking a permanent
      // reservation on top of the lost gold.
      releaseOrbSlot(this.world, entity);
      return;
    }
    this.offers.set(`orb:${this.world.tick}:${seat.seatId}`, {
      kind: "item",
      entity,
      tier: ITEM_OFFER_TIER,
      choices: [...choices],
      picked: null,
      seatId: seat.seatId,
      createdTick: this.world.tick,
      reservesSlot: true,
    });
  }

  /**
   * Register the 力/敏/智 三選一 a purchased 能力屬性強化 rolled (#260).
   *
   * Keyed by tick + seat exactly like the 傳說寶玉 card, so a player who buys
   * two ticks in one shopping phase gets two distinct cards instead of silently
   * overwriting the first (they paid 750g).
   */
  private registerAttrOffer(entity: EntityId, choices: string[]): void {
    const seat = [...this.seats.values()].find((s) => s.entityId === entity);
    if (!seat || choices.length === 0) return;
    this.offers.set(`attr:${this.world.tick}:${seat.seatId}`, {
      kind: "attr",
      entity,
      tier: ATTR_OFFER_TIER,
      choices: [...choices],
      picked: null,
      seatId: seat.seatId,
      createdTick: this.world.tick,
    });
  }

  /**
   * 「**這一回合是這一場的最後一回合嗎**」—— 唯一的住處。
   *
   * 兩條結束條件，OR：
   *   ① 決賽打完了（`isRoyaleRound`）—— owner 2026-07-27 的裁定，取消淘汰之後
   *      這一直是唯一的一條；
   *   ② 房主設的**總回合數上限**打到了（#288，owner 2026-08-08）。
   *
   * ⛔ ① **沒有被改掉**：沒設上限時 `roundCapReached` 恆回 false（`maxRounds`
   * 是 0 / undefined），所以出貨預設下這整條機制在行為上**不存在** ——
   * 這就是 owner 那句「預設值保留現在」的一半。
   *
   * ⚠️ 上限 >= {@link FINAL_ROUND} 沒有效果，這是對的：兩條是 OR，決賽先到。
   *
   * ⛔ 而且它是**一個**謂詞，被三個地方讀（中途結算卡的抑制、`concludeCombat`
   * 的凍結latch、`maybeFinish` 的收場）。另開一條平行的結束路徑 = 兩份「比賽
   * 怎麼結束」的邏輯，那正是這個檔在 2026-07-27 花一整段註解拆掉的東西。
   */
  private isLastRound(): boolean {
    return (
      isRoyaleRound(this.phase.round) || roundCapReached(this.phase.round, this.rules.maxRounds)
    );
  }

  /**
   * End the match — iff the FINALE has been played, **or the host's round cap
   * has been reached** (#288; see {@link isLastRound}).
   *
   * ⚠️ THIS IS THE ONLY END CONDITION LEFT, and it is the load-bearing half of
   * the owner's ruling. The old test was `aliveTeams().length <= 1`, i.e. "team
   * health eliminated everyone but one"; with elimination gone that predicate is
   * unreachable and a match would cycle intermission→combat→resolution forever.
   * Reaching round {@link FINAL_ROUND}'s resolution ends it, and the standings are
   * written here in one place ({@link finalStandings}).
   *
   * ⚠️ A CAPPED last round is an ORDINARY duel round, not a royale: `royaleWinner`
   * is null, so {@link finalStandings} orders EVERY team by team health → round
   * wins → team id. That is exactly 「名次照剩餘團隊生命」 — the cap borrows the
   * settlement path (#193), it does not invent a second one.
   */
  private maybeFinish(): boolean {
    if (!this.isLastRound()) return false;
    // 1/2/3/4 for EVERY team — champion first, then team health. Assigning all
    // four (rather than only the winner) is what keeps the settlement board a
    // total order instead of "#1 and three blanks".
    this.finalStandings().forEach((teamId, i) => this.placements.set(teamId, i + 1));
    // outcome is final — freeze input for the settlement (idempotent; normally
    // already latched by concludeCombat one resolution phase earlier)
    this.outcomeDecided = true;
    this.world.combatActive = false;
    this.freezeControls();
    this.phase.end();
    this.result = {
      matchId: this.matchId,
      mode: "PairedDuels",
      seed: this.world.rng.state,
      rounds: this.phase.round,
      teams: [...this.teamHealth.keys()].map((teamId) => ({
        teamId,
        placement: this.placements.get(teamId) ?? 1,
        members: [...this.seats.values()]
          .filter((s) => s.teamId === teamId)
          .map((s) => ({
            seatId: s.seatId,
            accountId: s.accountId,
            kills: this.kills.get(s.seatId) ?? 0,
            deaths: this.deaths.get(s.seatId) ?? 0,
            isBot: this.specs.get(s.seatId)?.isBot ?? s.driverKind === "ai",
          })),
      })),
    };
    // Everything that landed AFTER the final round's snapshot belongs to that
    // round — otherwise the settlement's per-round chart and its own totals
    // disagree. See foldFinalRoundResidual.
    this.foldFinalRoundResidual();
    // victory settlement (per-player scoreboard + grade + rank), broadcast by
    // MatchRoom on MSG.EVENT for the client's settlement screen
    this.settlement = this.buildSettlement();
    return true;
  }

  /**
   * THE LAST ROUND'S TAIL (found while re-seeding for #260, fixed here).
   *
   * `recordRoundHistory` snapshots at `concludeCombat`, and combat does not stop
   * dead there: a projectile already in flight, a DoT tick or a mob swing can
   * still land during the `resolution` phase that follows. For rounds 1..n−1
   * that is harmless — the straggler simply lands inside the NEXT round's delta
   * and the sum is still right. For the FINAL round there is no next snapshot,
   * so the damage is counted in `world.matchStats` (which the settlement's
   * totals read) and in NO round bucket at all.
   *
   * Measured: 12-bot match seed 4242 lost 96.4 of one seat's 19,123 damage, and
   * 2–4 of any 10 seeds show the same gap. `roundHistory.test.ts`'s
   * 「the per-round deltas SUM to the whole-match totals」 is the guard that
   * catches it; it passed for years only because its pinned seed happened to end
   * with nothing in flight. #260/#261 changed which match that seed plays and
   * the gap surfaced.
   *
   * The fix folds the residual into the LAST recorded round rather than
   * appending an extra one: no new round appears on the chart, `hpRatio` (a
   * LEVEL, not a delta) and `bye` are left alone, and `lastRoundCumulative` is
   * advanced so a second call is a no-op. Called ONLY from `maybeFinish`, so a
   * mid-match #193 elimination payload — built while the match is still running
   * — is untouched.
   */
  private foldFinalRoundResidual(): void {
    const last = this.roundHistory[this.roundHistory.length - 1];
    if (!last) return;
    for (const [seatId, seat] of this.seats) {
      if (seat.entityId === null) continue;
      const s = this.world.matchStats.get(seat.entityId) ?? createMatchStats();
      const prev = this.lastRoundCumulative.get(seatId);
      if (!prev) continue;
      const delta = last.players.find((p) => p.seatId === seatId);
      if (!delta) continue;
      const mobKills = this.world.mobKills.get(seat.entityId) ?? 0;
      delta.kills += s.kills - prev.kills;
      delta.deaths += s.deaths - prev.deaths;
      delta.assists += s.assists - prev.assists;
      delta.damageDealt += s.damageDealt - prev.damageDealt;
      delta.damageTaken += s.damageTaken - prev.damageTaken;
      delta.damageBlocked += s.damageBlocked - prev.damageBlocked;
      delta.healingDone += s.healingDone - prev.healingDone;
      delta.ccAppliedTicks += s.ccAppliedTicks - prev.ccAppliedTicks;
      delta.timeAliveTicks += s.timeAliveTicks - prev.timeAliveTicks;
      delta.revivesPerformed += s.revivesPerformed - prev.revivesPerformed;
      delta.mobKills += mobKills - prev.mobKills;
      // advance the baseline so calling this twice adds nothing
      this.lastRoundCumulative.set(seatId, {
        ...prev,
        kills: s.kills,
        deaths: s.deaths,
        assists: s.assists,
        damageDealt: s.damageDealt,
        damageTaken: s.damageTaken,
        damageBlocked: s.damageBlocked,
        healingDone: s.healingDone,
        ccAppliedTicks: s.ccAppliedTicks,
        timeAliveTicks: s.timeAliveTicks,
        revivesPerformed: s.revivesPerformed,
        mobKills,
      });
    }
  }

  // ---------- per-tick ----------

  /**
   * Every spawned seat has readied up. The old `teamHealth <= 0 → skip` clause is
   * gone with elimination: a 0-health team is still shopping and still playing, so
   * the intermission must wait for its Ready exactly like anyone else's.
   */
  get allSeatsReady(): boolean {
    for (const seat of this.seats.values()) {
      if (seat.entityId === null) continue;
      if (!seat.ready) return false;
    }
    return true;
  }

  /**
   * Drop shop `buyItem` commands for non-whitelisted items BEFORE they reach
   * the sim — the authoritative shop-catalogue filter. Allow-all/bypass returns
   * the frame untouched (zero overhead on the default path). Human OR AI, the
   * server never lets a disabled item be purchased.
   */
  private sanitizeIntent(frame: IntentFrame): IntentFrame {
    if (this.whitelist.bypass) return frame;
    if (!frame.commands.some((c) => c.kind === "buyItem" && !this.whitelist.allowsItem(c.itemId))) {
      return frame;
    }
    return {
      ...frame,
      commands: frame.commands.filter((c) => c.kind !== "buyItem" || this.whitelist.allowsItem(c.itemId)),
    };
  }

  /** Advance one tick. Returns the current phase after the tick. */
  tick(): MatchPhase {
    // 1) driver swaps land at the tick boundary
    for (const seat of this.seats.values()) {
      // A swap is recorded at the tick it is APPLIED, not requested: that is the
      // tick from which the new driver's `driverKind` is visible to the offer
      // auto-pick, so it is the tick playback must re-apply it on.
      if (seat.applyPendingDriver()) this.recorder?.onDriverSwap(this.world.tick, seat.seatId, seat.driverKind);
    }

    // 2) phase timer — ADVANCED FIRST, before any fallible work, so the visible
    //    countdown can never freeze even if the sim step or a phase transition
    //    below throws. Task #46: an intermittently throwing/stalling tick used to
    //    stop the clock dead — and, after the room-hardening wave, take the whole
    //    room down with it (MatchRoom disconnected the room on a thrown tick), so
    //    a single bad tick permanently froze the match. The clock now moves
    //    regardless of what happens further down the tick.
    const expired = this.phase.tickTimer();

    // 3+4) intents → sim step → event drain → cheat sustain, CONTAINED. A throw
    //    here (a sim edge case, an input that slipped validation, a fire-ring /
    //    flower / guardian corner) must NOT wedge the match: log + recover, then
    //    still run the phase transition below so the round can settle. A single
    //    bad tick is skipped, not fatal; a persistent one keeps the clock moving.
    try {
      this.stepSim();
    } catch (err) {
      this.onTickFault("sim-step", err);
    }

    // 5) phase transitions, CONTAINED with a force-advance failsafe. The normal
    //    path reads only guarded world state so it survives a corrupt/stale sim;
    //    if it ever throws (e.g. enterCombat on a bad arena geometry) we still
    //    push the phase forward on timer expiry, so a persistently faulting match
    //    marches to matchEnd rather than hanging in one phase forever.
    try {
      this.advancePhase(expired);
    } catch (err) {
      this.onTickFault("phase-transition", err);
      if (expired) this.forceAdvanceOnFault();
    }

    // 6) replay checkpoint, LAST — so the digest covers the sim step AND the
    //    phase transition that ran on this tick (team health, placements and round
    //    tallies all move in step 5, and they are host state the sim digest
    //    cannot see).
    this.recorder?.onTickEnd(this);
    return this.phase.phase;
  }

  // ---------- #207 對戰事件記錄 ----------

  /**
   * 這個 entityId 屬於哪個**真的座位**;不是座位(小怪、召喚物、守衛、花)回
   * null。
   *
   * 讀 `world.team.get(id).seatId` 而不是掃 `this.seats` —— 那是 sim 自己寫的
   * 那一份(`spawnChampion` 設,小怪是 `seatId: -1`),而且它是 O(1)。再對
   * `this.seats` 驗一次,因為變身/換英雄的作弊路徑會換掉 entityId。
   */
  private seatOfEntity(id: EntityId): SeatId | null {
    const seatId = this.world.team.get(id)?.seatId;
    if (seatId === undefined || (seatId as number) < 0) return null;
    const seat = this.seats.get(seatId);
    return seat && seat.entityId === id ? seatId : null;
  }

  /** `ability:<id>` 這種 origin 帶的技能 id;不是技能傷害回 null。 */
  private static abilityOfOrigin(origin: unknown): string | null {
    if (typeof origin !== "string") return null;
    const ix = origin.indexOf("ability:");
    return ix < 0 ? null : origin.slice(ix + "ability:".length);
  }

  private castKey(seatId: SeatId, abilityId: string): string {
    return `${seatId as number}:${abilityId}`;
  }

  /**
   * 一個 sim 事件 → 帳本。**唯讀觀察者**:它不改任何 world / 控制器狀態,除了
   * 自己的幾張表,所以 digest 不動、回放不變。
   *
   * ⚠️ 這裡只認**已經存在**的事件。沒有為統計新增任何 emit —— `packages/shared`
   * 不在這一批的可動範圍,而且新增 emit 會動到 client 的事件扇出。代價寫在下面
   * 各分支的註解裡,不要事後當成「本來就這樣」。
   */
  private ledgerObserve(type: string, tick: number, data: Record<string, unknown>): void {
    switch (type) {
      case "abilityCast": {
        const seatId = this.seatOfEntity(data.caster as EntityId);
        if (seatId === null) return;
        const abilityId = String(data.abilityId ?? "");
        if (!abilityId) return;
        const handle = this.ledger.beginCast({
          seatId,
          round: this.phase.round,
          tick,
          abilityId,
          slot: String(data.slot ?? ""),
        });
        // 後到的傷害/治療掛回**最近一次**同座位同技能的施放,見
        // {@link castByAbility} 的已知近似說明。
        this.castByAbility.set(this.castKey(seatId, abilityId), handle);
        return;
      }
      case "damage": {
        const seatId = this.seatOfEntity(data.source as EntityId);
        if (seatId === null) return;
        const target = data.target as EntityId;
        const targetIsHero = this.seatOfEntity(target) !== null;
        const targetIsMob = this.world.mob.has(target);
        // 守衛塔 / 花 / 復活圈既不是英雄也不是小怪 —— 兩欄都不加,而不是隨便
        // 塞進小怪那一欄。「對小怪的傷害」被守衛塔灌水的話,殭屍波的平衡數字
        // 就沒有意義了。
        if (!targetIsHero && !targetIsMob) return;
        const abilityId = MatchController.abilityOfOrigin(data.origin);
        if (abilityId === null) return; // 普攻不開 cast 列,見下面 basicAttack 的說明
        const handle = this.castByAbility.get(this.castKey(seatId, abilityId));
        if (handle === undefined) return;
        const amount = Number(data.amount ?? 0);
        this.ledger.creditCast(handle, {
          heroHits: targetIsHero ? 1 : 0,
          mobHits: targetIsMob ? 1 : 0,
          damageToHeroes: targetIsHero ? amount : 0,
          damageToMobs: targetIsMob ? amount : 0,
          // `killingBlow` 是 damage packet 自己標的「這一發把血打到 0」——
          // 從 `death` 事件反推的話拿不到是哪一支技能收的尾。
          heroKills: targetIsHero && data.killingBlow === true ? 1 : 0,
        });
        return;
      }
      case "heal": {
        const seatId = this.seatOfEntity(data.source as EntityId);
        if (seatId === null) return;
        const abilityId = MatchController.abilityOfOrigin(data.origin);
        if (abilityId === null) return;
        const handle = this.castByAbility.get(this.castKey(seatId, abilityId));
        if (handle === undefined) return;
        this.ledger.creditCast(handle, { healingDone: Number(data.amount ?? 0) });
        return;
      }
      case "itemBought":
      case "itemSold": {
        const seatId = this.seatOfEntity(data.id as EntityId);
        if (seatId === null) return;
        // 金額讀 `champ.undoStack` 最上面那一筆 —— 那是 shop.ts **實際套用**的
        // goldDelta(買 = −cost,賣 = 已 floor 的 40% 退款)。重新從
        // `Items.get(itemId).cost` 推導會在 floor 的地方和真正扣的錢差一塊,
        // 而 #121 的 undo 正是為了「永遠是同一個數字」才把它存起來的。
        const champ = this.world.champion.get(data.id as EntityId);
        const txn = champ?.undoStack[champ.undoStack.length - 1];
        this.ledger.recordItemTxn({
          seatId,
          round: this.phase.round,
          tick,
          kind: type === "itemBought" ? "buy" : "sell",
          itemId: String(data.itemId ?? ""),
          // 只有最上面那一筆真的是**這一次**交易時才採用它的金額。commitShop
          // Session 會在戰鬥開始清空 undoStack,所以「有事件但沒有 txn」是可能
          // 的(理論上不該發生,但 0 比一個別人的金額誠實)。
          goldDelta: txn !== undefined && txn.itemId === data.itemId ? txn.goldDelta : 0,
        });
        return;
      }
      case "shopUndone": {
        const seatId = this.seatOfEntity(data.id as EntityId);
        if (seatId === null) return;
        // 撤銷一筆購買 (#121)。schema 的 kind 只有 buy/sell/grant,所以撤銷記
        // 成**反向的那一種**:撤銷買 = 道具離開背包、錢回來 = 一筆 sell;撤銷
        // 賣 = 道具回來、錢付出去 = 一筆 buy。這是刻意的取捨,說在這裡免得日後
        // 有人看到「賣出次數」偏高以為是玩家愛賣東西 —— 讀的人要扣掉撤銷。
        // 好處是金流仍然守恆:把所有 goldDelta 加起來就是這一場道具花掉的淨額。
        this.ledger.recordItemTxn({
          seatId,
          round: this.phase.round,
          tick,
          kind: data.kind === "buy" ? "sell" : "buy",
          itemId: String(data.itemId ?? ""),
          goldDelta: 0, // 精確金額在 sim 內部被 pop 掉了;淨額由原始那筆 + 這筆抵銷
        });
        return;
      }
      case "itemPicked":
      case "gachaItem": {
        // 三選一發的 / 抽卡發的 —— 沒花錢,goldDelta 0。
        const entity = (data.entity ?? data.id) as EntityId;
        const seatId = this.seatOfEntity(entity);
        if (seatId === null) return;
        this.ledger.recordItemTxn({
          seatId,
          round: this.phase.round,
          tick,
          kind: "grant",
          itemId: String(data.itemId ?? ""),
          goldDelta: 0,
        });
        return;
      }
      case "mobBossSlain": {
        // 殭屍王 / 特殊殭屍的最後一擊。`RoundPerformance.bossKills` 的來源 ——
        // `world.mobKills` 只數一般小怪,不分王。
        const seatId = data.killerSeatId as number;
        if (typeof seatId !== "number" || seatId < 0 || !this.seats.has(asSeatId(seatId))) return;
        const key = asSeatId(seatId);
        this.roundBossKills.set(key, (this.roundBossKills.get(key) ?? 0) + 1);
        return;
      }
      default:
        // 普攻(`basicAttack` / `basicAttackHit`)刻意**不開 cast 列**:一場
        // 12 人 10 回合會多出幾萬列,而它問的問題(命中率/輸出)`PlayerMatchStats`
        // 的 `basicAttackHits` 已經答了。cast 列是給「這一支技能值不值得放」用的。
        return;
    }
  }

  /**
   * 一個回合結算完 → 帳本的陣容 + 每個座位的成績,然後**寫出去**。
   *
   * 從 `concludeCombat` 呼叫,在 `recordRoundHistory` 之後、`settleRound`
   * 之前 —— 和 #173 選的是同一個瞬間,理由也一樣:settleRound 會扣團隊生命、
   * 可能觸發淘汰結算,那之後再讀就不是「戰鬥剛結束的那一刻」了。
   */
  private recordLedgerRound(): void {
    const round = this.phase.round;
    const roundTicks = Math.max(0, this.world.tick - this.combatStartTick);

    // ── 陣容(成對才有意義)────────────────────────────────────────────
    // ⚠️ 決賽(royale)沒有陣容紀錄。`ZoneLineupRecord` 的形狀是**兩方**,而
    // 決賽是四隊同場混戰 —— 硬拆成兩兩對戰會捏造出六場從來沒發生過的對局。
    // 少一筆真話,好過多六筆假話。決賽每個人的成績仍然在 players 裡。
    for (const pairing of this.pairings) {
      const winner = this.duelWinners.get(pairing.zone);
      const sideOf = (teamId: TeamId): LineupSide => ({
        teamId,
        championIds: [...this.seats.values()]
          .filter((s) => s.teamId === teamId && s.entityId !== null)
          .map((s) => s.championId),
        won: winner === teamId,
      });
      this.ledger.recordLineup(round, pairing.zone, sideOf(pairing.sideA), sideOf(pairing.sideB));
    }

    // ── 每個座位這一回合的成績 ─────────────────────────────────────────
    const zoneOfTeam = new Map<TeamId, number>();
    for (const p of this.pairings) {
      zoneOfTeam.set(p.sideA, p.zone);
      zoneOfTeam.set(p.sideB, p.zone);
    }
    if (this.royale) for (const t of this.royale.teams) zoneOfTeam.set(t, this.royale.zone);

    const records: RoundPlayerRecord[] = [];
    for (const [seatId, seat] of this.seats) {
      if (seat.entityId === null) continue;
      const cum = this.world.matchStats.get(seat.entityId) ?? createMatchStats();
      // 每一欄都是 DELTA。`diffMatchStats` 用 `createMatchStats()` 的 key 全集
      // 迭代,所以 `PlayerMatchStats` 新增欄位的那一刻它自動涵蓋 —— 手寫這個
      // 減法漏掉一欄不會有任何測試發現(#173 的教訓)。
      const prev = this.lastLedgerStats.get(seatId) ?? createMatchStats();
      const d = diffMatchStats(prev, cum);
      const hp = this.world.health.get(seat.entityId);
      const ratio = hp && hp.alive && hp.maxHp > 0 ? hp.hp / hp.maxHp : 0;
      const mobKillsCum = this.world.mobKills.get(seat.entityId) ?? 0;
      const path = statPathSnapshotOf(this.world, seat.entityId);
      records.push(
        createRoundPlayerRecord({
          round,
          seatId,
          teamId: seat.teamId,
          zone: zoneOfTeam.get(seat.teamId) ?? -1,
          championId: seat.championId,
          // 輪空:這一隊這一回合根本沒被排進任何 zone。所有計數都會是 0,而
          // 那和「被瞬間團滅」位元相同 —— 消費端必須靠這個旗標分開(#173)。
          bye: this.roundOutcome.get(seat.teamId) === ROUND_OUTCOME.NONE,
          kills: d.kills,
          deaths: d.deaths,
          assists: d.assists,
          killParticipation: d.killParticipation,
          damageDealt: d.damageDealt,
          damageTaken: d.damageTaken,
          damageBlocked: d.damageBlocked,
          healingDone: d.healingDone,
          ccAppliedTicks: d.ccAppliedTicks,
          abilityCasts: d.abilityCasts,
          abilityHits: d.abilityHits,
          abilityWhiffs: d.abilityWhiffs,
          mobKills: Math.max(0, mobKillsCum - (this.lastLedgerMobKills.get(seatId) ?? 0)),
          bossKills: this.roundBossKills.get(seatId) ?? 0,
          survivedTicks: d.timeAliveTicks,
          goldEarned: d.goldEarned,
          xp: d.xp,
          hpRatio: ratio < 0 ? 0 : ratio > 1 ? 1 : ratio,
          alive: hp?.alive === true && ratio > 0,
          // #211 的 N/20 —— 帳本不另外數,直接轉交商店面板呼叫的同一支。
          statStacks: path.stacks,
          statTarget: path.target,
          statCapstonePct: path.capstonePct,
          placement: 0, // 下面排完才填
        }),
      );
      this.lastLedgerStats.set(seatId, { ...cum });
      this.lastLedgerMobKills.set(seatId, mobKillsCum);
    }

    // ── 這一回合的名次 ─────────────────────────────────────────────────
    // 用 `gradeRoundRecord` 的 score 排 —— 也就是 #232 商店面板要顯示的**同一個
    // 分數**。另外發明一套排序的話,商店會說你這回合 S,而覆盤報表說你墊底。
    // 輪空的不排(placement 0);同分照 seatId 升冪,完全決定性。
    const scored = records
      .filter((r) => !r.bye)
      .map((r) => ({ r, score: gradeRoundRecord(r, { roundTicks })?.score ?? 0 }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.r.seatId - b.r.seatId));
    scored.forEach((row, i) => {
      row.r.placement = i + 1;
    });

    for (const r of records) this.ledger.recordRound(r);
    this.roundBossKills.clear();

    // ⚠️ 這一行就是「寫出去」。拿掉它,帳本仍然完整、每一條讀 `ctl.ledger` 的
    // 斷言仍然全綠,而磁碟上什麼都沒有 —— 那正是 #207 要防的第②種故障。
    // `analytics.test.ts` 的每一條斷言都從檔案讀回來,所以拿掉它們會紅。
    this.statsSink?.onRoundSettled(this, round, roundTicks);
  }

  /**
   * Steps 3–4 of a tick: gather seat intents, advance the deterministic sim one
   * fixed step, drain the sim events the controller must act on, and sustain any
   * dev cheats. Extracted so tick() can CONTAIN a throw here (task #46) and still
   * run the phase transition, keeping the match clock alive.
   */
  private stepSim(): void {
    // gather intents + step the sim (sim runs in every phase; combat rules
    // only differ by economyOpen and by who is alive)
    const intents = new Map<SeatId, IntentFrame>();
    // FREEZE: once the match outcome is decided, stop gathering seat intents
    // (human AND AI) so champions idle through the resolution/matchEnd settlement
    // — the front-view shows a still hero. Champions were already halted
    // (freezeControls) when the outcome latched, so the empty map keeps them put.
    if (!this.outcomeDecided && this.phase.phase !== "champSelect" && this.phase.phase !== "matchEnd") {
      for (const [seatId, seat] of this.seats) {
        // RECORD THE RAW FRAME, before either derived transform below. Both
        // `sanitizeIntent` (whitelist filter — the whitelist is in the replay
        // header) and `freezeCombatIntent` (a pure function of the frame and
        // `world.combatActive`) are re-applied identically during playback.
        const raw = seat.produceIntent(this.world, this.world.tick);
        this.recorder?.onIntent(this.world.tick, seatId, raw);
        let frame = this.sanitizeIntent(raw);
        // ROUND-SETTLE FREEZE (#100): `combatActive` is the single "a duel is
        // LIVE" flag, but nothing on the combat path or this seam ever consulted
        // it — so the sim kept stepping attacks/casts/movement in EVERY phase.
        // A round settles (checkCombatEnd → concludeCombat) while both teams in a
        // timer-decided duel are still alive and adjacent, so the bots brawled on
        // through `resolution` and the next `intermission` (up to ~65s) until
        // enterCombat re-parked them. While combat is not live we strip the
        // FIGHTING half of every produced intent (the move/attack order + any
        // cast / active-item command) and keep the economy half (shop / rank /
        // ready / offer picks), so champions ACTUALLY STOP for the settlement beat
        // yet the intermission shop still works. Deterministic: a pure function
        // of the frame + world.combatActive (host state set on combat entry/exit).
        if (!this.world.combatActive) frame = freezeCombatIntent(frame);
        intents.set(seatId, frame);
      }
    }
    this.world.step(intents);

    // 4) drain sim events the controller must act on
    for (const ev of this.world.events) {
      // #207 的分析帳本先看一眼每一個事件。放在既有分派的**前面**而不是包進
      // 某一個分支裡:它感興趣的事件(abilityCast / damage / heal / itemBought…)
      // 和控制器自己要處理的那幾種幾乎不重疊,寫成兩層 if 只會讓「這個事件
      // 有沒有被記到」變成要讀完整個 200 行才答得出來的問題。
      this.ledgerObserve(ev.type, ev.tick, ev.data);
      if (ev.type === "pickOffer") {
        // clients pick by "offerId#choiceIdx"; a plain offerId -> first choice
        const raw = ev.data.offerId as string;
        const hash = raw.lastIndexOf("#");
        const offerId = hash >= 0 ? raw.slice(0, hash) : raw;
        const choiceIdx = hash >= 0 ? Number(raw.slice(hash + 1)) : 0;
        const offer = this.offers.get(offerId);
        if (offer && offer.seatId === (ev.data.seatId as SeatId)) {
          // auto = false —— 這是玩家(或 AI 的 brain)真的按下去的那一張。
          this.applyPick(offerId, offer, Number.isInteger(choiceIdx) ? choiceIdx : 0, false);
        }
      } else if (ev.type === "legendaryOrbRolled") {
        // 傳說寶玉 (task #82): the SIM rolled the 3-choose-1 (so it rides
        // world.rng and replays byte-identically); offers are HOST state, so
        // the card is registered here — the same shape the round-5 weapon card
        // produces, which means the existing pick / AI-autopick / expiry paths
        // handle it with no special cases. The pool was already whitelist-
        // filtered BEFORE the roll (world.itemEligible), so unlike the round
        // cards this can never arrive empty.
        this.registerOrbOffer(ev.data.id as EntityId, ev.data.choices as ItemId[]);
      } else if (ev.type === "statUpgradeBought") {
        // 能力屬性強化 (#260) — the same sim/host split as the orb above: the SIM
        // rolled the three magnitudes off world.rng (so a replay reproduces them
        // byte for byte) and the OFFER is host state, registered here. Without
        // this branch the 375g would buy a card that never appears — the player
        // pays and nothing at all happens.
        this.registerAttrOffer(ev.data.id as EntityId, ev.data.choices as string[]);
      } else if (ev.type === "ready") {
        const seat = [...this.seats.values()].find((s) => s.seatId === (ev.data.seatId as SeatId));
        if (seat) seat.ready = true;
      } else if (ev.type === "death") {
        const victim = ev.data.id as EntityId;
        const killer = ev.data.killer as EntityId | null;
        // only champion deaths feed the K/D stats — flower (neutral) deaths
        // never award a kill (they reward the HP/MP burst instead)
        const victimIsChampion = [...this.seats.values()].some((s) => s.entityId === victim);
        for (const seat of this.seats.values()) {
          if (seat.entityId === victim) {
            this.deaths.set(seat.seatId, (this.deaths.get(seat.seatId) ?? 0) + 1);
            this.roundDeaths.set(seat.seatId, (this.roundDeaths.get(seat.seatId) ?? 0) + 1);
            // 同一個事件,存活順序那一格(GH#257)。覆寫而非累加 —— 復活後再倒下的
            // 人,真正離場的是後面那一次。夾 >= 1 是因為 0 是「沒倒過」的哨兵。
            this.roundDeathTick.set(seat.seatId, Math.max(1, this.world.tick));
          }
          if (victimIsChampion && killer !== null && seat.entityId === killer) {
            this.kills.set(seat.seatId, (this.kills.get(seat.seatId) ?? 0) + 1);
            // same event, per-ROUND bucket: this is what the round-end MVP
            // presentation reads (reset at the next enterCombat).
            this.roundKills.set(seat.seatId, (this.roundKills.get(seat.seatId) ?? 0) + 1);
          }
        }
      }
    }

    // 4b) sustain dev cheats AFTER the sim step (god mode / 0-CD). Dev-only and
    //     off by default, so this branch is dead weight in normal play.
    if (this.godModeSeats.size > 0 || this.zeroCdSeats.size > 0) this.sustainCheats();
  }

  /**
   * Step 5 of a tick: the phase state-machine transitions. Reads only guarded
   * world state (optional chaining throughout checkCombatEnd / teamAliveCount),
   * so it survives a corrupt or stale sim; tick() still wraps it and force-
   * advances on expiry if it ever throws, so the match can never wedge in a phase.
   */
  private advancePhase(expired: boolean): void {
    switch (this.phase.phase) {
      case "champSelect":
        // A2 —— vs bot 的選角早退 (owner 2026-08-03:「vs bot 選角後就可以開始
        // 進入戰鬥不用等，一樣是因為不用等其他 bot」)。走的是**同一條**出口
        // (`autoPickAndSpawn` 幫 bot 配好 → advance → enterIntermission),所以
        // 早退和倒數到底的結果一模一樣,只是不用等。
        if (expired || this.champSelectEarlyStartDue()) {
          this.autoPickAndSpawn();
          this.phase.advance(); // -> intermission (round 1)
          this.enterIntermission();
        }
        break;
      case "intermission": {
        // AI-driven seats auto-pick their first offer (augment OR weapon)
        // after a short delay; also the safety net for offers left unpicked
        // at the timer. Task #207 (三選一來不及選 → 自動隨機幫選一個): a draft
        // that reaches the timer unanswered is auto-resolved to a RANDOM one of
        // its choices — for HUMANS and bots alike — so nobody ever enters combat
        // with an empty augment slot, and so the client's AugmentDraftPanel
        // focus-scrim (driven by SeatState.offers) is torn down the moment the
        // offer is consumed rather than left stuck over the combat view. The
        // index is DETERMINISTIC (autoPickIndex, seeded off the match, never
        // Math.random / world.rng), so a same-seed replay resolves it identically.
        for (const [offerId, offer] of [...this.offers]) {
          const seat = this.seats.get(offer.seatId);
          const age = this.world.tick - offer.createdTick;
          if ((seat?.driverKind === "ai" && age > 10) || expired) {
            // auto = true —— 系統代選(AI 座位的延遲自動選,或 #207 的過期
            // 安全網)。`aggregateOfferChoices` 把它算進 `autoPicked` 而不是
            // `picked`,所以取捨率不會被代選稀釋。
            this.applyPick(offerId, offer, this.autoPickIndex(offerId, offer), true);
          }
        }
        if (expired || (this.allSeatsReady && this.offers.size === 0)) {
          this.phase.advance(); // -> combat
          this.enterCombat();
        }
        break;
      }
      case "combat":
        if (this.checkCombatEnd(this.combatTimeUp(expired))) {
          this.concludeCombat(); // despawn flowers + settle + maybe latch freeze
          this.phase.advance(); // -> resolution
        }
        break;
      case "resolution":
        if (expired) {
          if (!this.maybeFinish()) {
            this.phase.advance(); // -> next intermission
            this.enterIntermission();
          }
        }
        break;
      case "matchEnd":
        break;
    }
  }

  /**
   * IS THE COMBAT PHASE OUT OF TIME? — the #L2 replacement for reading
   * `PhaseMachine.ticksLeft` directly.
   *
   * WHY THE COUNTDOWN CANNOT BE THE ANSWER ANY MORE. `ticksLeft` is a
   * DECREMENTING counter seeded once at combat entry; a 殭屍王 walking in has to
   * push the end of the round out by 180 s, and the only way to do that to a
   * countdown is `ticksLeft += 5400` — the pattern CLAUDE.md forbids. The sim
   * instead carries the deadline as an ABSOLUTE combat-elapsed tick
   * (`FireRingRules.combatMaxTicks`, moved by `extendRoundForBoss` at the exact
   * instant `summonMobBoss` runs) and compares it against the very counter the
   * ring already runs on. This reads THAT, so the extension needs no second
   * plumbing and the ring's ignition and the round's end can never drift apart.
   *
   * THE SIDE EFFECT IS LOAD-BEARING, not bookkeeping. `phaseTicksLeft` on the
   * wire (net/snapshot.ts) is the player's round countdown. Leave it alone and a
   * boss-extended round shows 0:00 for three minutes while combat visibly
   * continues — 「算出來了但從沒送到客戶端」. So the countdown is handed the same
   * ticks the sim deadline gained, once each.
   *
   * ⚠️ WHY THE COUNTDOWN IS ADJUSTED BY A DELTA AND NOT OVERWRITTEN WITH
   * `deadline - world.fireRingTicks`. That mirror is tidier and it silently
   * re-opens task #46. `fireRingTicks` only advances inside `stepSim`, which
   * `tick()` deliberately CONTAINS: a sustained sim fault stops the counter
   * while the match keeps ticking, so an overwritten countdown would pin itself
   * to a constant — the frozen clock #46 exists to prevent — and
   * `isCombatTimeUp` would never fire, wedging the round forever. Adjusting the
   * counter instead leaves `tickTimer()`'s unconditional decrement in charge of
   * the fall-through, which is exactly the property `tickResilience.test.ts`
   * pins. `phaseExpired ||` keeps that failsafe load-bearing: under a HEALTHY
   * sim the two clocks are equal by construction (both start at
   * `combatMaxTicksForRound`, both move one per tick, both take the same
   * extensions), so the `||` never fires early; under a stalled one the host
   * clock still ends the round.
   *
   * FALLBACK. `combatDeadlineTick` is `Infinity` when no ring is armed (unit
   * tests, skeleton boot, an operator with no `match.fireRing` block) — then
   * there is no sim clock to read and the phase countdown remains the only
   * answer, byte-identical to the pre-#L2 behaviour.
   */
  private combatTimeUp(phaseExpired: boolean): boolean {
    if (!Number.isFinite(combatDeadlineTick(this.world))) return phaseExpired;
    // Hand the phase countdown the SAME ticks the sim deadline just gained, once
    // each. `bossRoundExtensionTicks` is a running TOTAL, so the delta is what a
    // second king adds and a re-read adds nothing.
    //
    // ⚠️ #248: that total is what the sim ACTUALLY applied after 回合硬上限
    // clipped it, not `boss.extendCombatSec` × summons. So once a round reaches
    // the cap this delta is 0 and the player's countdown stops growing — which
    // is the whole point: a countdown that kept adding 180 s the sim will not
    // honour would show 0:00 arriving three minutes late (失敗形態 ②, inverted).
    const extended = bossRoundExtensionTicks(this.world);
    if (extended > this.appliedBossExtensionTicks) {
      this.phase.ticksLeft += extended - this.appliedBossExtensionTicks;
      this.appliedBossExtensionTicks = extended;
    }
    return phaseExpired || isCombatTimeUp(this.world);
  }

  /**
   * Force the phase machine forward when the NORMAL transition threw (task #46
   * failsafe). Uses ONLY host state — the phase machine, team health, placements
   * and the rng — never the possibly-corrupt sim world, so a match whose sim or
   * enterCombat keeps throwing still converges to matchEnd instead of freezing
   * the countdown. The combat branch charges one life to a deterministically-
   * chosen alive team, so team health strictly decreases across rounds and the match
   * can never cycle phases forever without ending.
   */
  private forceAdvanceOnFault(): void {
    switch (this.phase.phase) {
      case "champSelect":
        try {
          this.autoPickAndSpawn();
        } catch (err) {
          this.onTickFault("auto-pick", err);
        }
        this.phase.advance();
        try {
          this.enterIntermission();
        } catch (err) {
          this.onTickFault("enter-intermission", err);
        }
        break;
      case "intermission":
        this.phase.advance();
        try {
          this.enterCombat();
        } catch (err) {
          this.onTickFault("enter-combat", err);
        }
        break;
      case "combat": {
        // We could not compute the bout's outcome. CONVERGENCE IS NO LONGER THIS
        // BRANCH'S JOB: the match now ends at round FINAL_ROUND whatever happens,
        // so even a match that faults every single round terminates on schedule.
        // What is still worth doing is charging the round's team-health cost to a
        // deterministically-chosen team, so a faulting round still MOVES the
        // scoreboard that decides places 2/3/4 instead of leaving four teams tied
        // at their starting reservoir. No placement is locked here — placements
        // are assigned once, in maybeFinish.
        const teams = this.participatingTeams();
        if (teams.length > 1) {
          const loser = teams[this.world.rng.int(teams.length)]!;
          this.teamHealth.set(
            loser,
            Math.max(0, (this.teamHealth.get(loser) ?? 0) - teamHealthLost(this.phase.round)),
          );
        }
        this.phase.advance(); // -> resolution
        break;
      }
      case "resolution": {
        let finished = false;
        try {
          finished = this.maybeFinish();
        } catch (err) {
          this.onTickFault("maybe-finish", err);
        }
        if (!finished) {
          this.phase.advance();
          try {
            this.enterIntermission();
          } catch (err) {
            this.onTickFault("enter-intermission", err);
          }
        }
        break;
      }
      case "matchEnd":
        break;
    }
  }

  /** Total contained tick faults (sim-step / phase-transition) — health telemetry. */
  get faultCount(): number {
    return this.tickFaults;
  }

  private tickFaults = 0;
  private loggedTickFaults = 0;

  /**
   * Record + throttle-log a contained tick fault. The first few faults are
   * logged in full; thereafter only every 300th (~10s at 30Hz), so a
   * DETERMINISTIC fault repeating every tick leaves a clear trail in the log
   * without flooding it.
   */
  private onTickFault(where: string, err: unknown): void {
    this.tickFaults++;
    if (this.loggedTickFaults < 5 || this.tickFaults % 300 === 0) {
      this.loggedTickFaults++;
      console.error(
        `[match ${this.matchId}] contained a ${where} fault in phase ${this.phase.phase} at sim tick ` +
          `${this.world.tick} (fault #${this.tickFaults}); the phase clock keeps advancing so the round ` +
          `can still settle`,
        err,
      );
    }
  }

  // ---------- dev cheats (offline testing) ----------

  /**
   * Re-assert god-mode / zero-cooldown flags each tick, after the sim has run.
   * God mode: top hp/mana back off and revive (so a lethal burst this tick is
   * undone before the snapshot — the client never sees the corpse). Zero-CD:
   * clear ability + basic-attack cooldowns and refill mana so casts never run
   * dry (mana refill is intentional — noted in the cheat contract).
   */
  private sustainCheats(): void {
    for (const seatId of this.godModeSeats) {
      const seat = this.seats.get(seatId);
      if (!seat || seat.entityId === null) continue;
      const hp = this.world.health.get(seat.entityId);
      if (!hp) continue;
      hp.hp = hp.maxHp;
      hp.mana = hp.maxMana;
      hp.alive = true;
    }
    for (const seatId of this.zeroCdSeats) {
      const seat = this.seats.get(seatId);
      if (!seat || seat.entityId === null) continue;
      const ab = this.world.abilities.get(seat.entityId);
      if (ab) {
        for (const slot of ["Q", "W", "E", "R"] as const) ab.slots[slot].cooldownRemainingTicks = 0;
        if (ab.exSlot) ab.exSlot.cooldownRemainingTicks = 0;
        ab.basicAttackCdTicks = 0;
        ab.cast = null;
        ab.windup = null;
      }
      const hp = this.world.health.get(seat.entityId);
      if (hp) hp.mana = hp.maxMana; // spammable casts shouldn't starve on mana
    }
  }

  /**
   * Apply a cheat to `seatId`'s champion. Callers (MatchRoom) resolve seatId
   * from the client's OWN session, so a client can never target a foreign seat;
   * the channel itself is hard-gated to dev mode (see cheatGate.ts). Returns
   * true when the cheat was applied.
   */
  applyCheat(seatId: SeatId, cheat: Cheat): boolean {
    const seat = this.seats.get(seatId);
    if (!seat) return false;

    // toggles are keyed by seat and valid even before an entity exists
    if (cheat.kind === "godMode") {
      if (cheat.enabled) this.godModeSeats.add(seatId);
      else this.godModeSeats.delete(seatId);
    } else if (cheat.kind === "zeroCooldown") {
      if (cheat.enabled) this.zeroCdSeats.add(seatId);
      else this.zeroCdSeats.delete(seatId);
    }
    // grantMCoin is a platform-wallet concept with no in-sim representation —
    // accepted (so the client flow stays uniform) but a graceful no-op.
    if (cheat.kind === "grantMCoin") return true;

    const entity = seat.entityId;

    switch (cheat.kind) {
      case "swapChampion": {
        if (!Champions.tryGet(cheat.championId as ChampionId)) return false;
        return this.swapChampion(seatId, cheat.championId as ChampionId);
      }
      case "godMode":
      case "zeroCooldown":
        // toggle handled above; also seed the effect immediately when entity ready
        if (entity !== null && cheat.kind === "godMode" && cheat.enabled) {
          const hp = this.world.health.get(entity);
          if (hp) {
            hp.hp = hp.maxHp;
            hp.mana = hp.maxMana;
            hp.alive = true;
          }
        }
        return true;
    }

    if (entity === null) return false;

    switch (cheat.kind) {
      case "setLevel": {
        const champ = this.world.champion.get(entity);
        if (!champ) return false;
        const target = Math.max(1, Math.min(LEVEL_CAP, Math.floor(cheat.level)));
        if (target > champ.level) {
          grantLevels(this.world, entity, target - champ.level);
        } else if (target < champ.level) {
          // grantLevels only raises; drop directly for a lower target (dev-only)
          champ.level = target;
          const sc = this.world.stats.get(entity);
          if (sc) sc.dirty = true;
        }
        return true;
      }
      case "grantGold":
        // 刻意不乘倍率:開發者作弊指令說「給我 N」就必須給 N,
        // 否則除錯工具自己在說謊(見 GoldPayoutCategory 的 unscaled).
        grantGold(this.world, entity, Math.floor(cheat.amount), "unscaled");
        return true;
      case "maxAbilities": {
        const ab = this.world.abilities.get(entity);
        if (!ab) return false;
        for (const slot of ["Q", "W", "E", "R"] as const) {
          const inst = ab.slots[slot];
          inst.rank = Abilities.get(inst.abilityId).maxRank; // R included, no gate
        }
        if (ab.exSlot) learnEx(this.world, entity); // dev "max" also unlocks EX
        return true;
      }
      case "rankAbility":
        return this.cheatRankAbility(entity, cheat.slot);
      case "giveItem":
        return grantItemFree(this.world, entity, cheat.itemId as ItemId) >= 0;
      case "fullHeal": {
        const hp = this.world.health.get(entity);
        if (!hp) return false;
        hp.hp = hp.maxHp;
        hp.mana = hp.maxMana;
        hp.alive = true;
        return true;
      }
      case "resetCooldowns": {
        const ab = this.world.abilities.get(entity);
        if (!ab) return false;
        for (const slot of ["Q", "W", "E", "R"] as const) ab.slots[slot].cooldownRemainingTicks = 0;
        if (ab.exSlot) ab.exSlot.cooldownRemainingTicks = 0;
        ab.basicAttackCdTicks = 0;
        ab.cast = null;
        ab.windup = null;
        return true;
      }
      case "killEnemies":
        return this.cheatKillEnemies(seat.teamId, entity);
      case "spawnFlower":
        return this.cheatSpawnFlower(entity);
      case "skipPhase":
        return this.cheatSkipPhase();
      case "rerollOffers":
        return this.cheatRerollOffers(seatId, entity);
    }
    return false;
  }

  /** Rank one slot for a seat, bypassing the point cost and the R round-gate. */
  private cheatRankAbility(entity: EntityId, slot: AbilitySlot): boolean {
    const ab = this.world.abilities.get(entity);
    if (!ab) return false;
    if (slot === "EX") return false; // EX is unlocked (learnEx), not ranked
    const inst = ab.slots[slot];
    if (inst.rank >= Abilities.get(inst.abilityId).maxRank) return false;
    ab.unspentPoints++; // grant the point this rank-up will consume
    const prevGate = this.world.ultGateOverride;
    if (slot === "R") this.world.ultGateOverride = true; // lift the 6/11/16 gate
    const ok = rankUpAbility(this.world, entity, slot);
    if (slot === "R") this.world.ultGateOverride = prevGate;
    if (!ok) ab.unspentPoints--; // roll the point back if the rank-up was refused
    return ok;
  }

  /** Despawn the seat's champion and respawn as `championId`, same seat/team/pos. */
  private swapChampion(seatId: SeatId, championId: ChampionId): boolean {
    const seat = this.seats.get(seatId);
    if (!seat) return false;
    let pos = { x: 0, z: 0 };
    let zone = 0;
    if (seat.entityId !== null) {
      const t = this.world.transform.get(seat.entityId);
      if (t) {
        pos = { x: t.pos.x, z: t.pos.z };
        zone = t.zone;
      }
      this.world.destroy(seat.entityId);
    }
    seat.championId = championId;
    seat.entityId = spawnChampion(this.world, {
      championId,
      seatId,
      teamId: seat.teamId,
      pos,
      zone,
    });
    return true;
  }

  /**
   * Spawn a healing flower in the caller's zone (dev testing aid). Uses the
   * active flower rules; matches without a flowers block fall back to the
   * contract defaults so the cheat still works for testing. The flower joins
   * the normal burst-on-death flow (FlowerSystem).
   */
  private cheatSpawnFlower(entity: EntityId): boolean {
    const t = this.world.transform.get(entity);
    if (!t) return false;
    if (!this.world.flowerRules) {
      this.world.flowerRules = flowerRulesFromConfig(
        this.rules.flowers ?? DEFAULT_FLOWER_CONFIG,
        this.world.dt,
      );
    }
    const pos = pickFlowerSpawnPos(this.world, t.zone);
    spawnFlower(this.world, t.zone, pos, this.world.flowerRules.hp);
    return true;
  }

  /** Kill every alive enemy champion sharing the caller's zone (fast-forward). */
  private cheatKillEnemies(myTeam: TeamId, myEntity: EntityId): boolean {
    const t = this.world.transform.get(myEntity);
    if (!t) return false;
    for (const [id, team] of this.world.team) {
      if (team.teamId === myTeam) continue;
      if (!this.world.champion.has(id)) continue;
      const et = this.world.transform.get(id);
      const hp = this.world.health.get(id);
      if (et?.zone === t.zone && hp?.alive) {
        hp.hp = 0;
        hp.alive = false; // checkCombatEnd resolves the duel next tick
      }
    }
    return true;
  }

  /** Force the current phase forward: intermission→combat, or end the round. */
  private cheatSkipPhase(): boolean {
    switch (this.phase.phase) {
      case "champSelect":
        this.autoPickAndSpawn();
        this.phase.advance(); // -> intermission (round 1)
        this.enterIntermission();
        return true;
      case "intermission":
        this.offers.clear();
        this.phase.advance(); // -> combat
        this.enterCombat();
        return true;
      case "combat":
        // decide any undecided duels immediately, then settle + resolve
        this.checkCombatEnd(true);
        this.concludeCombat(); // despawn flowers + settle + maybe latch freeze
        this.phase.advance(); // -> resolution
        return true;
      case "resolution":
        if (!this.maybeFinish()) {
          this.phase.advance(); // -> next intermission
          this.enterIntermission();
        }
        return true;
      default:
        return false;
    }
  }

  /** Re-roll this seat's open augment / weapon offers with fresh choices. */
  private cheatRerollOffers(seatId: SeatId, entity: EntityId): boolean {
    let rerolled = false;
    for (const [offerId, offer] of [...this.offers]) {
      if (offer.seatId !== seatId) continue;
      if (offer.kind === "augment") {
        const fresh = offerAugments(this.world, entity, offer.tier, this.rules.offerCount);
        this.offers.set(offerId, { kind: "augment", ...fresh, seatId, createdTick: this.world.tick });
      } else if (offer.kind === "attr") {
        // 能力屬性強化 (#260): re-roll the three magnitudes off world.rng, keeping
        // the one-card-per-attribute shape. Routed through the same
        // `rollAttrChoices` a purchase uses so the dev cheat can never produce a
        // card the real path could not.
        this.offers.set(offerId, {
          kind: "attr",
          entity,
          tier: offer.tier,
          choices: rollAttrChoices(this.world),
          picked: null,
          seatId,
          createdTick: this.world.tick,
        });
      } else {
        // item offers don't retain their table id; re-roll from the same choices' pool
        const fresh = offerItems(this.world, entity, offer.tier, this.rules.offerCount);
        // offerItems keys off a loot-table id; fall back to keeping choices if empty
        const next = fresh.choices.length > 0 ? fresh.choices : offer.choices;
        this.offers.set(offerId, {
          kind: "item",
          entity,
          tier: offer.tier,
          choices: next,
          picked: null,
          seatId,
          createdTick: this.world.tick,
        });
      }
      rerolled = true;
    }
    return rerolled;
  }
}
