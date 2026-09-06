/**
 * matchLedger —— 一場對戰的**分析帳本**:#207(後台覆盤)、#211(商店 N/20)、
 * #212(回合勝利畫面 + 團隊累積積分)三個消費端唯一的資料來源。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼它是一個 barrier
 * ─────────────────────────────────────────────────────────────────────────────
 * 三個功能讀的是同一批事實(誰選了誰、誰打了多少、誰買了什麼、誰沒選哪兩張)。
 * schema 不先定死,三邊會各記一份對不起來的數字,而且沒有任何測試會發現——
 * 三個畫面各自都「有數字」,只是彼此不同。所以型別定在這裡,四條下游 lane 照著
 * 接,誰要多一個欄位就回來改這一份。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它**不在** SimWorld 裡,這是刻意的
 * ─────────────────────────────────────────────────────────────────────────────
 * `PlayerMatchStats`(matchStats.ts)是 world state,會進 `digest()`,兩次同種子
 * 重跑必須位元相同。這一份帳本記的是 host 才知道的事:champ-select 什麼時候
 * 開的、玩家是不是按了隨機、三選一的哪兩張沒被選、回合什麼時候結算的。把它塞
 * 進 SimWorld 會讓 digest 開始依賴 host 的節奏,而 client 的預測影子根本沒有這些
 * 事件 —— 那是一條保證會 desync 的路。
 *
 * 代價是:**它的決定性由呼叫端負責**。所以這裡的每一支 API 都要求傳入絕對
 * tick,沒有任何一支自己去讀時鐘(沒有 `Date.now`,sim/** 的純度閘在守),
 * 內部只有一個單調遞增的整數 `nextCastId`,不使用 `Map` 的迭代順序。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * statStacks 只有一個來源
 * ─────────────────────────────────────────────────────────────────────────────
 * #211 的「N / 20」分子是 `ChampionComp.statStacks`,分母是
 * `STAT_TICK_TARGET`。這裡**不另開計數器**,只提供 {@link statPathSnapshotOf},
 * 它把兩個值原封不動交給 `statPathView`(economy/statPath.ts)—— 商店面板呼叫
 * 的同一支。`matchLedger.test.ts` 用突變測試釘住這件事:把 snapshot 改成讀帳本
 * 自己數的一個計數器,測試會紅。
 */
import { DEFAULT_ECONOMY, economyRules } from "../economy/economyRules";
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { STAT_TICK_TARGET } from "../economy/itemTiers";
import { statPathView, type StatPathView } from "../economy/statPath";
import { createMatchStats, type PlayerMatchStats } from "./matchStats";
import { rankScore, type RankEntry } from "./rating";
import { gradeRound, type RoundGradeContext, type RoundGradeResult, type RoundPerformance, type RoundGradeConfig } from "./roundGrade";

// ───────────────────────────────────────────────────────────────────────────
// 選角
// ───────────────────────────────────────────────────────────────────────────

/** 玩家是**怎麼**拿到這隻英雄的 —— 選取率分析要能把三者分開。 */
export type PickSource =
  /** 玩家自己點的 */
  | "manual"
  /** 玩家自己按了隨機鈕 */
  | "random"
  /** 沒鎖定,系統代選(#207 / #130 的自動補選) */
  | "auto";

/**
 * 一個座位的選角紀錄。
 *
 * `lockTick` 是**絕對 tick**,不是倒數 —— sim/** 的到期一律用絕對 tick,而且
 * 「還剩幾秒」在事後分析裡是無法還原的量。沒鎖定就是 -1(不是 0:第 0 tick
 * 鎖定是一件真的會發生的事)。
 */
export interface ChampionPickRecord {
  seatId: number;
  teamId: number;
  /** 這一場這個座位打的對戰區 */
  zone: number;
  championId: string;
  source: PickSource;
  /** champ-select 開啟的絕對 tick */
  selectOpenTick: number;
  /** 鎖定的絕對 tick;-1 = 從未鎖定(被系統代選) */
  lockTick: number;
}

/**
 * 這一次選角花了幾個 tick。從未鎖定 → -1(**不是 0**:0 會在平均值裡被讀成
 * 「秒選」,那和「完全沒選」是相反的行為)。
 */
export function pickDecisionTicks(rec: ChampionPickRecord): number {
  if (rec.lockTick < 0 || rec.lockTick < rec.selectOpenTick) return -1;
  return rec.lockTick - rec.selectOpenTick;
}

// ───────────────────────────────────────────────────────────────────────────
// 陣容組合(組合強度分析要成對)
// ───────────────────────────────────────────────────────────────────────────

/** 一個 zone 裡的一方。`championIds` 已排序 —— 陣容是集合,不是順序。 */
export interface LineupSide {
  teamId: number;
  /** 升冪排序後的 championId,所以同樣三隻英雄永遠得到同一個 key */
  championIds: string[];
  won: boolean;
}

/**
 * 一個回合、一個 zone 裡的**一對**陣容。
 *
 * 成對才有意義:「這三隻贏了 60%」沒有告訴你任何事,「這三隻對上那三隻贏了
 * 60%」才是組合強度。`sides` 依 teamId 升冪,所以同一組對局永遠產生同一個 key。
 */
export interface ZoneLineupRecord {
  round: number;
  zone: number;
  sides: [LineupSide, LineupSide];
}

/** 一方陣容的正規化 key(排序後以 `|` 相接)。 */
export function lineupKey(side: LineupSide): string {
  return [...side.championIds].sort().join("|");
}

/**
 * 一場對局的正規化 key —— 兩個陣容 key 依字典序排序後以 ` vs ` 相接。
 *
 * 排序過所以 A-vs-B 和 B-vs-A 是同一個桶。要知道誰贏了,讀 `sides[i].won`。
 */
export function matchupKey(rec: ZoneLineupRecord): string {
  const a = lineupKey(rec.sides[0]);
  const b = lineupKey(rec.sides[1]);
  return a <= b ? `${a} vs ${b}` : `${b} vs ${a}`;
}

// ───────────────────────────────────────────────────────────────────────────
// 技能
// ───────────────────────────────────────────────────────────────────────────

/** 一次施放的效益。全部是這一次施放**自己**打出來的量。 */
export interface AbilityCastCredit {
  /** 打中敵方英雄的次數 */
  heroHits: number;
  /** 打中小怪的次數 */
  mobHits: number;
  /** 對英雄的傷害 */
  damageToHeroes: number;
  /** 對小怪(含王)的傷害 */
  damageToMobs: number;
  healingDone: number;
  ccTicksApplied: number;
  /** 這一次施放拿到的擊殺(英雄) */
  heroKills: number;
}

/**
 * ⭐ **GH#658 —— 一個「打在單一英雄身上」的傷害封包**。owner 2026-08-24：
 *
 *   > 「後台單次傷害排行榜（**另外標記該傷害是否一擊超過英雄目標 80% 生命傷害**）」
 *
 * ⚠️ 為什麼要**逐目標**記，而不是拿榜上那一列的 `damage`（＝這次施放打出的
 * **總**傷害）去除以某個最大生命：AoE 打三個人各 1000 的話總傷害是 3000，
 * 而**沒有任何一個人**掉了 3000 —— 用總傷害算出來的百分比會在卡面上印一句
 * 不會發生的話（第一·五守則）。所以帳本存的是「這一次施放對**單一**目標的
 * 最大一擊」與**那個人當下的最大生命**兩個原始事實，百分比在後台推導
 * （第〇·四守則：能算出來的不要存第二份）。
 */
export interface HeroHitSample {
  /** 這一個封包對那個英雄打出的傷害 */
  damage: number;
  /** 命中**當下**那個英雄的最大生命；≤0 = 不知道（呼叫端讀不到 Health） */
  victimMaxHp: number;
}

/**
 * 一次技能施放。
 *
 * ⚠️ 為什麼是「一次施放」而不是「每個技能一列」:傷害是**之後**才到的(投射
 * 物飛出去、DoT 跳、AoE 分批結算)。聚合成一列的話,`beginCast` 之後所有進來的
 * 傷害都只能歸到那一列,於是「這一顆火球打中幾個人」永遠算不出來。要看聚合值
 * 呼叫 {@link aggregateAbilityUse}。
 */
export interface AbilityCastRecord extends AbilityCastCredit {
  /** 帳本內單調遞增的序號,同時是 {@link MatchLedger.creditCast} 的 handle */
  castId: number;
  seatId: number;
  round: number;
  /** 施放的絕對 tick */
  tick: number;
  abilityId: string;
  /**
   * "Q" / "W" / "E" / "R" / "EX" / "PASSIVE"。
   *
   * ⛔ **永遠不會是 `"basic"`**（GH#1015）：cast 列只由 `abilityCast` 事件開，而普攻
   * 沒有「一次施放」這個單位 ⇒ 普攻的傷害住在 {@link UncastDamageRecord}（family
   * `"basic"`），⛔ 不在這張表。在此之前這一行寫著 `"basic"` 是可能的值，而那是一句
   * 從來不會成立的話（第三守則：註解會說謊）。
   */
  slot: string;
  /**
   * GH#658 —— 這一次施放打在**單一英雄**身上的最大一擊（取 max，⛔ 不是累加）。
   * 0 = 這次施放一個英雄都沒打到（只打小怪 / 只治療 / 只上控）。
   */
  topHeroHit: number;
  /** 上面那一擊命中當下，**那個目標**的最大生命。0 = 不知道（見 {@link HeroHitSample}）。 */
  topHeroHitMaxHp: number;
  /**
   * ⭐ GH#914 —— **施放當下**施法者的等級。
   *
   * ⚠️ **可缺席**：這一格之前寫進帳本的每一次施放都沒有它。
   * ⛔ 後台看到缺席要畫「—」，⛔ **不是 0** —— 0 是一個真的等級（而且不可能）。
   * ⭐ 而它必須在**開 cast 的當下**讀 —— ⛔ 事後讀會拿到「這一場結束時」的等級，
   *   那對一張「哪一發最痛」的榜是錯的分母。
   */
  casterLevel?: number;
}

/** {@link MatchLedger.beginCast} 回傳的 handle。 */
export type CastHandle = number;

/**
 * ⭐ GH#1015 —— **掛不到任何一次施放的傷害**，按來源家族、每座位每回合一列。
 *
 * ── 為什麼需要它 ──────────────────────────────────────────────────────────
 * cast 列只由 `abilityCast` 事件開 ⇒ 普攻（origin `"basic"`）、道具／被動的 hook 觸發
 * （`hook:<id>`）、免死標記（`mark:<id>`）、以及帶 `ability:` 前綴卻沒開過 cast 的傷害
 * （toggle／proxyCast／被動）**在進帳本之前就被 `return` 掉了**。
 * ⇒ 「傷害排行榜前 100 名全是技能」是那個 `return` 的必然結果，⛔ 不是平衡的發現；
 * ⇒ 而「`damageDealt − Σcasts` ＝ 普攻」這個減法**不成立**（量到的，見 #1015 報告）：
 *    `damageDealt` 是**減傷後、護盾前、只對敵方英雄**的量（matchStats.ts），
 *    cast 列記的是 `damage` 事件的 `amount`（**護盾後**實際扣血、英雄＋小怪）——
 *    兩個空間不同，中間還有 hook／mark 這些第三種來源。
 *
 * ── 形狀 ────────────────────────────────────────────────────────────────────
 * ⛔ **不是每次普攻一列**（一場 12 人 10 回合會多出幾萬列，票文 Known risks 逐字），
 * ⭐ 是每（座位, 回合, 家族）**累加成一列**。它與 cast 列量的是**同一個空間**
 * （同一個 `damage` 事件的同一個 `amount`），所以 **Σcasts ＋ Σuncast ＝ 這個座位打出的
 * 每一發 `damage` 事件**，⛔ 不靠減法 —— `analytics.test.ts` 用真的比賽釘住這個恆等式。
 */
export interface UncastDamageRecord {
  seatId: number;
  round: number;
  /** 來源家族，見 {@link uncastFamilyOf}：`"basic"` / `"hook"` / `"mark"` / `"ability"`（有 id 但沒開過 cast）/ 其餘原字串 */
  family: string;
  /** 打中敵方英雄的次數（一發封包 = 1） */
  heroHits: number;
  /** 打中小怪的次數 */
  mobHits: number;
  /** 對英雄的傷害（`damage` 事件的 `amount`，與 cast 列同一個空間） */
  damageToHeroes: number;
  /** 對小怪的傷害 */
  damageToMobs: number;
}

/** {@link MatchLedger.creditUncast} 收的那四格。 */
export type UncastDamageCredit = Pick<
  UncastDamageRecord,
  "heroHits" | "mobHits" | "damageToHeroes" | "damageToMobs"
>;

/**
 * 一個 damage `origin` 屬於哪個**家族** —— {@link UncastDamageRecord.family} 唯一的來源。
 *
 * ⭐ 一個地方決定，⛔ 不在呼叫端各寫一套字串比對：
 *   · `"basic"`        → `"basic"`（普攻 —— 這張票要量的那一格）
 *   · `"ability:<id>"` → `"ability"`（有技能 id 卻掛不到 cast：toggle／proxyCast／被動）
 *   · `"hook:<id>"`    → `"hook"`（道具／被動的觸發傷害）、`"mark:<id>"` → `"mark"`，
 *     其餘帶 `:` 的一律取冒號前的前綴
 *   · 其他字串原樣（`"fireRing"` / `"guardian"` …）；不是字串 → `"unknown"`
 */
export function uncastFamilyOf(origin: unknown): string {
  if (typeof origin !== "string" || origin === "") return "unknown";
  const colon = origin.indexOf(":");
  return colon < 0 ? origin : origin.slice(0, colon);
}

/** 一個座位、一個家族在整場的聚合 —— 後台「cast 列以外的傷害」表格與 final 行讀這個。 */
export interface UncastDamageUsage extends UncastDamageCredit {
  seatId: number;
  family: string;
}

/** 一個座位、一個技能在整場的聚合效益 —— 後台「技能效益」表格讀這個。 */
export interface AbilityUsage extends AbilityCastCredit {
  seatId: number;
  abilityId: string;
  casts: number;
  /** 一次都沒有打到任何東西的施放數(命中率的分母另一半) */
  whiffs: number;
}

// ───────────────────────────────────────────────────────────────────────────
// 道具與三選一
// ───────────────────────────────────────────────────────────────────────────

/** 一筆道具異動。`goldDelta` 是**實際套用**的金錢變化,不是重新推導的。 */
export interface ItemTxnRecord {
  seatId: number;
  round: number;
  tick: number;
  /** grant = 三選一發的、任務給的,沒有花錢 */
  kind: "buy" | "sell" | "grant";
  itemId: string;
  /** 買 = 負,賣 = 正,grant = 0 */
  goldDelta: number;
}

/** 三選一的種類。 */
export type OfferKind = "augment" | "item" | "attr" | "legendary";

/**
 * 一次三選一 —— **沒選的那兩張也在裡面**。
 *
 * `declined` 是強度分析的對照組。只記被選的那一張,得到的是「被選的卡勝率
 * 55%」這種沒有對照組的數字;要說「這張卡比另外兩張強」,必須知道當時它是在
 * 跟誰競爭。這正是 owner 說的「三選一沒選的那兩張也要記」。
 *
 * `auto` 區分「玩家選的」與「來不及選、系統代選的」(#207)。混在一起會讓
 * 選取率變成一半是隨機數,而隨機數的選取率沒有任何意義。
 */
export interface OfferRecord {
  seatId: number;
  round: number;
  tick: number;
  kind: OfferKind;
  /** 當時發出來的所有選項,照發牌順序 */
  offered: string[];
  /** 被選的那一張;null = 過期而且沒有代選 */
  picked: string | null;
  /** `offered` 扣掉 `picked` —— 對照組。由 {@link MatchLedger.recordOffer} 推導。 */
  declined: string[];
  /** true = 系統代選,不是玩家的意思 */
  auto: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// 每回合
// ───────────────────────────────────────────────────────────────────────────

/**
 * 一個玩家在一個回合的完整成績。
 *
 * 它是 {@link RoundPerformance} 的超集,所以可以直接餵給 `gradeRound`。
 *
 * ⚠️ 除了 `hpRatio` / `alive` / `statStacks` / `statCapstonePct` / `placement`
 * 之外,每一個計數欄位都是 **DELTA**(這一回合打出來的),不是整場累積。累積值
 * 畫成圖只會單調上升,說不出玩家在哪一回合真的出現過。
 */
export interface RoundPlayerRecord extends RoundPerformance {
  round: number;
  seatId: number;
  teamId: number;
  zone: number;
  championId: string;
  /**
   * 這一隊這一回合輪空。所有計數都是 0 而且 `hpRatio` 是 0 —— 和「被瞬間團滅」
   * 位元相同(#173 就是這個 bug)。消費端必須**跳過**輪空回合,不是把它當成
   * 「墊底、零傷害」來評分,那是在對沒有發生過的比賽說謊。
   */
  bye: boolean;
  killParticipation: number;
  abilityCasts: number;
  goldEarned: number;
  xp: number;
  /** 回合結算那一刻的 hp/maxHp,夾在 [0,1];死了是 0。這是 LEVEL,不是 delta。 */
  hpRatio: number;
  /** 回合結算時還站著 */
  alive: boolean;
  /**
   * #211 的 N/20 分子。**從 `ChampionComp.statStacks` 搬來的**,見
   * {@link statPathSnapshotOf} —— 帳本不另外數。
   */
  statStacks: number;
  /** 分母。永遠是 `STAT_TICK_TARGET`,和商店面板同源。 */
  statTarget: number;
  /** 已擲出的傳說·萬象強化倍率(0 = 還沒拿到) */
  statCapstonePct: number;
  /** 這個回合的名次 1..N;0 = 還沒排(輪空或資料不全) */
  placement: number;
}

/** 一個空的回合紀錄 —— 呼叫端只填有變化的欄位。 */
export function createRoundPlayerRecord(over: Partial<RoundPlayerRecord> = {}): RoundPlayerRecord {
  return {
    round: 0,
    seatId: 0,
    teamId: 0,
    zone: 0,
    championId: "",
    bye: false,
    kills: 0,
    deaths: 0,
    assists: 0,
    killParticipation: 0,
    damageDealt: 0,
    damageTaken: 0,
    damageBlocked: 0,
    healingDone: 0,
    ccAppliedTicks: 0,
    abilityCasts: 0,
    abilityHits: 0,
    abilityWhiffs: 0,
    mobKills: 0,
    bossKills: 0,
    survivedTicks: 0,
    goldEarned: 0,
    xp: 0,
    hpRatio: 0,
    alive: false,
    statStacks: 0,
    statTarget: DEFAULT_ECONOMY.statTickTarget,
    statCapstonePct: 0,
    placement: 0,
    ...over,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// statStacks:唯一來源
// ───────────────────────────────────────────────────────────────────────────

/**
 * #211 的「N / 20」—— 直接讀 `ChampionComp`,交給商店面板呼叫的**同一支**
 * `statPathView`。
 *
 * 這裡沒有 `+= 1`,一次都沒有。帳本自己數的話,兩個數字會在以下情形分岔而且
 * 沒有人會發現:買道具的 `歸零`(resetStatPath)、undo 一筆購買(#121 會把
 * `statStacksBefore` 還回去)、重連後的重建。商店會顯示 3/20 而覆盤報表顯示
 * 11/20,兩邊都言之鑿鑿。
 *
 * 沒有這個 champion(還沒選角、觀戰、測試用的裸 entity)→ 一份 0 的 view。
 */
export function statPathSnapshotOf(world: SimWorld, id: EntityId): StatPathView {
  const champ = world.champion.get(id);
  const target = economyRules(world).statTickTarget;
  if (!champ) return statPathView(0, 0, target);
  return statPathView(champ.statStacks, champ.statCapstonePct, target);
}

// ───────────────────────────────────────────────────────────────────────────
// 團隊累積積分(#212)
// ───────────────────────────────────────────────────────────────────────────

/** 帶座位/隊伍身分的排名輸入。 */
export interface SeatRankEntry extends RankEntry {
  seatId: number;
  teamId: number;
}

/** 一隊的累積積分。`memberScores` 和 `seatIds` 同索引。 */
export interface TeamScore {
  teamId: number;
  /** 升冪排序 */
  seatIds: number[];
  /** 每個成員的結算分數,和 `seatIds` 同索引 */
  memberScores: number[];
  /** 成員分數的總和 —— #212 畫面上的那個數 */
  total: number;
}

/**
 * 團隊累積積分 —— **和結算畫面同一個數**。
 *
 * 每個成員的分數是 `rankScore(entry, lobby)`,也就是 `perMatchRanks` 排序用的、
 * 結算畫面印出來的那一個表達式(rating.ts 已經為了同一個理由把它拆出來)。
 * 這裡再推導一次的話,回合畫面的隊伍分和結算畫面的個人分加起來會對不上,而
 * 玩家會相信畫面上比較大的那一個。
 *
 * 輸出依 teamId 升冪,成員依 seatId 升冪 —— 完全決定性,沒有 Map 迭代順序。
 */
export function teamScores(entries: readonly SeatRankEntry[]): TeamScore[] {
  const lobby = entries.map((e) => e.stats);
  const byTeam = new Map<number, { seatId: number; score: number }[]>();
  for (const e of entries) {
    const row = { seatId: e.seatId, score: rankScore(e, lobby) };
    const bucket = byTeam.get(e.teamId);
    if (bucket) bucket.push(row);
    else byTeam.set(e.teamId, [row]);
  }
  const teamIds = [...byTeam.keys()].sort((a, b) => a - b);
  return teamIds.map((teamId) => {
    const rows = byTeam.get(teamId)!.slice().sort((a, b) => a.seatId - b.seatId);
    let total = 0;
    for (const r of rows) total += r.score;
    return {
      teamId,
      seatIds: rows.map((r) => r.seatId),
      memberScores: rows.map((r) => r.score),
      total,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 累積計分板的差分
// ───────────────────────────────────────────────────────────────────────────

/**
 * `largestSingleHit` 是**極值**,不是總量,所以它不能相減。
 *
 * 從兩個累積快照無法還原「這一回合最大的一擊」——只知道整場的最大值有沒有被
 * 刷新。所以這個欄位在 delta 裡是 `after` 的**水位**,語意是「到目前為止最大的
 * 一擊」。這是刻意的例外,`matchLedger.test.ts` 把它釘住,免得有人「順手修好」
 * 成 after - before(那會產出一個沒有意義的差值)。
 */
export const LEVEL_FIELDS: readonly (keyof PlayerMatchStats)[] = Object.freeze(["largestSingleHit"]);

/**
 * 兩個累積快照相減 → 這一段期間的 DELTA。
 *
 * host 每次回合結算拍一張 `PlayerMatchStats`,和上一張相減就得到「這一回合」。
 * 手寫這個減法是 `RoundStatDelta` 目前的做法,而它漏掉一個欄位不會有任何測試
 * 發現;這一支用 `createMatchStats()` 的 key 全集迭代,所以
 * `PlayerMatchStats` 新增欄位的那一刻它自動涵蓋,而漏掉的那一天會被
 * `matchLedger.test.ts` 的全欄位斷言抓到。
 *
 * 負值夾成 0:計數器是單調的,出現負值只可能是英雄重生換了 entity(計分板重新
 * 從 0 開始),那一回合的貢獻應該讀成 0,不是一個大負數。
 */
export function diffMatchStats(before: PlayerMatchStats, after: PlayerMatchStats): PlayerMatchStats {
  const out = createMatchStats();
  const keys = Object.keys(out) as (keyof PlayerMatchStats)[];
  for (const k of keys) {
    if (LEVEL_FIELDS.includes(k)) {
      out[k] = after[k];
      continue;
    }
    const d = after[k] - before[k];
    out[k] = d > 0 ? d : 0;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// 帳本本體
// ───────────────────────────────────────────────────────────────────────────

/** 一整場的快照 —— 送去後台覆盤 (#207) 的就是這個形狀。 */
export interface MatchLedgerSnapshot {
  matchId: string;
  picks: ChampionPickRecord[];
  lineups: ZoneLineupRecord[];
  casts: AbilityCastRecord[];
  /** ⭐ GH#1015 —— cast 列以外的傷害（普攻在這裡，family `"basic"`）。 */
  uncast: UncastDamageRecord[];
  itemTxns: ItemTxnRecord[];
  offers: OfferRecord[];
  rounds: RoundPlayerRecord[];
  teams: TeamScore[];
}

/**
 * 一場對戰的累積器。**host 持有**,不在 SimWorld 裡(見檔頭)。
 *
 * 所有 API 都要求絕對 tick,內部唯一的狀態是一個單調遞增的 `nextCastId`。
 * 沒有時鐘、沒有亂數、沒有 Map 迭代順序 —— 同樣的呼叫序列產生同樣的快照。
 */
export class MatchLedger {
  readonly matchId: string;
  private readonly picks: ChampionPickRecord[] = [];
  private readonly lineups: ZoneLineupRecord[] = [];
  private readonly casts: AbilityCastRecord[] = [];
  private readonly uncast: UncastDamageRecord[] = [];
  private readonly itemTxns: ItemTxnRecord[] = [];
  private readonly offers: OfferRecord[] = [];
  private readonly rounds: RoundPlayerRecord[] = [];
  private teams: TeamScore[] = [];
  private nextCastId = 0;

  constructor(matchId: string) {
    this.matchId = matchId;
  }

  // ── 選角 ──────────────────────────────────────────────────────────────

  recordPick(rec: ChampionPickRecord): void {
    this.picks.push({ ...rec });
  }

  /** 一個座位的選角紀錄(沒有 → null)。 */
  pickOf(seatId: number): ChampionPickRecord | null {
    for (const p of this.picks) if (p.seatId === seatId) return p;
    return null;
  }

  // ── 陣容 ──────────────────────────────────────────────────────────────

  /** 記一個 zone 的對局。`sides` 會依 teamId 升冪、championIds 排序後存入。 */
  recordLineup(round: number, zone: number, a: LineupSide, b: LineupSide): void {
    const norm = (s: LineupSide): LineupSide => ({
      teamId: s.teamId,
      championIds: [...s.championIds].sort(),
      won: s.won,
    });
    const sides: [LineupSide, LineupSide] =
      a.teamId <= b.teamId ? [norm(a), norm(b)] : [norm(b), norm(a)];
    this.lineups.push({ round, zone, sides });
  }

  // ── 技能 ──────────────────────────────────────────────────────────────

  /**
   * 開一次施放,回傳 handle。傷害/治療/控制之後用 {@link creditCast} 掛進來。
   */
  beginCast(args: {
    seatId: number;
    round: number;
    tick: number;
    abilityId: string;
    slot: string;
    /** ⭐ 施放當下的等級（GH#914）。缺席 ⇒ 這一筆沒有等級（⛔ 不是 0）。 */
    casterLevel?: number;
  }): CastHandle {
    const castId = this.nextCastId;
    this.nextCastId += 1;
    this.casts.push({
      castId,
      seatId: args.seatId,
      round: args.round,
      tick: args.tick,
      abilityId: args.abilityId,
      slot: args.slot,
      heroHits: 0,
      mobHits: 0,
      damageToHeroes: 0,
      damageToMobs: 0,
      healingDone: 0,
      ccTicksApplied: 0,
      heroKills: 0,
      topHeroHit: 0,
      topHeroHitMaxHp: 0,
      // ⭐ `undefined` 要**留著**（⛔ 不是補 0）：後台靠它分辨「舊資料」與「等級 0」。
      ...(args.casterLevel === undefined ? {} : { casterLevel: args.casterLevel }),
    });
    return castId;
  }

  /**
   * 把後到的效益掛到某一次施放上。未知 handle 是 no-op —— 一顆在回合結束後才
   * 落地的投射物不應該讓 host 爆掉。
   *
   * ⚠️ `heroHit`（GH#658）與其他每一格**不同方向**：其餘是累加，它是**取最大**
   * —— 它回答的是「這一次施放最狠的那一下打在誰身上、他有多厚」，累加會把
   * AoE 的三個人加成一個不存在的目標。
   */
  creditCast(
    handle: CastHandle,
    credit: Partial<AbilityCastCredit> & { heroHit?: HeroHitSample },
  ): void {
    const rec = this.casts[handle];
    if (!rec || rec.castId !== handle) return;
    rec.heroHits += credit.heroHits ?? 0;
    rec.mobHits += credit.mobHits ?? 0;
    rec.damageToHeroes += credit.damageToHeroes ?? 0;
    rec.damageToMobs += credit.damageToMobs ?? 0;
    rec.healingDone += credit.healingDone ?? 0;
    rec.ccTicksApplied += credit.ccTicksApplied ?? 0;
    rec.heroKills += credit.heroKills ?? 0;
    const hit = credit.heroHit;
    if (hit !== undefined && hit.damage > rec.topHeroHit) {
      rec.topHeroHit = hit.damage;
      rec.topHeroHitMaxHp = hit.victimMaxHp > 0 ? hit.victimMaxHp : 0;
    }
  }

  /**
   * ⭐ GH#1015 —— 一發**掛不到任何施放**的傷害封包 → 累加進（座位, 回合, 家族）那一列。
   * 呼叫端是 `MatchController.ledgerObserve` 的 `damage` 分支：找不到 cast handle 的
   * 那一條路（在此之前是一個 `return`）。列的順序 = 第一次出現的順序（事件序，決定性）。
   */
  creditUncast(seatId: number, round: number, family: string, credit: Partial<UncastDamageCredit>): void {
    let rec: UncastDamageRecord | undefined;
    for (const r of this.uncast) {
      if (r.seatId === seatId && r.round === round && r.family === family) {
        rec = r;
        break;
      }
    }
    if (rec === undefined) {
      rec = { seatId, round, family, heroHits: 0, mobHits: 0, damageToHeroes: 0, damageToMobs: 0 };
      this.uncast.push(rec);
    }
    rec.heroHits += credit.heroHits ?? 0;
    rec.mobHits += credit.mobHits ?? 0;
    rec.damageToHeroes += credit.damageToHeroes ?? 0;
    rec.damageToMobs += credit.damageToMobs ?? 0;
  }

  // ── 道具 ──────────────────────────────────────────────────────────────

  recordItemTxn(rec: ItemTxnRecord): void {
    this.itemTxns.push({ ...rec });
  }

  /**
   * 記一次三選一。`declined` 由 `offered` 扣掉 `picked` 推導 —— 呼叫端不用
   * (也不該)自己算,不然「沒選的那兩張」會有兩個版本。
   *
   * 同一張卡在 `offered` 裡出現兩次時只扣掉**一份**,剩下那一份仍然是被拒絕
   * 的 —— 對照組不該因為一次重複發牌就整個消失。
   */
  recordOffer(rec: Omit<OfferRecord, "declined">): void {
    const declined: string[] = [];
    let removed = false;
    for (const id of rec.offered) {
      if (!removed && rec.picked !== null && id === rec.picked) {
        removed = true;
        continue;
      }
      declined.push(id);
    }
    this.offers.push({ ...rec, offered: [...rec.offered], declined });
  }

  // ── 回合 ──────────────────────────────────────────────────────────────

  recordRound(rec: RoundPlayerRecord): void {
    this.rounds.push({ ...rec });
  }

  /** 某一回合的所有紀錄,依 seatId 升冪。 */
  roundRecords(round: number): RoundPlayerRecord[] {
    return this.rounds.filter((r) => r.round === round).sort((a, b) => a.seatId - b.seatId);
  }

  /** 某個座位的所有回合,依 round 升冪。 */
  seatRounds(seatId: number): RoundPlayerRecord[] {
    return this.rounds.filter((r) => r.seatId === seatId).sort((a, b) => a.round - b.round);
  }

  // ── 團隊積分 ──────────────────────────────────────────────────────────

  /** 用結算畫面的同一支 `rankScore` 算一次隊伍積分並存進帳本。 */
  setTeamScores(entries: readonly SeatRankEntry[]): TeamScore[] {
    this.teams = teamScores(entries);
    return this.teams;
  }

  // ── 輸出 ──────────────────────────────────────────────────────────────

  /** 整場快照(深拷貝陣列,呼叫端改不到帳本內部)。 */
  snapshot(): MatchLedgerSnapshot {
    return {
      matchId: this.matchId,
      picks: this.picks.map((p) => ({ ...p })),
      lineups: this.lineups.map((l) => ({
        round: l.round,
        zone: l.zone,
        sides: [
          { ...l.sides[0], championIds: [...l.sides[0].championIds] },
          { ...l.sides[1], championIds: [...l.sides[1].championIds] },
        ] as [LineupSide, LineupSide],
      })),
      casts: this.casts.map((c) => ({ ...c })),
      itemTxns: this.itemTxns.map((t) => ({ ...t })),
      offers: this.offers.map((o) => ({ ...o, offered: [...o.offered], declined: [...o.declined] })),
      rounds: this.rounds.map((r) => ({ ...r })),
      teams: this.teams.map((t) => ({
        ...t,
        seatIds: [...t.seatIds],
        memberScores: [...t.memberScores],
      })),
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 聚合(後台覆盤 #207 讀的形狀)
// ───────────────────────────────────────────────────────────────────────────

/**
 * 把逐次施放聚合成「每個座位、每個技能」一列。
 *
 * `whiffs` = 完全沒有打中任何東西(英雄或小怪)的施放數。命中率因此是
 * `(casts - whiffs) / casts`,而不是 hits/casts —— 一發打中三個人的 AoE 是一次
 * 成功的施放,不是 300% 命中率。
 *
 * 輸出依 (seatId, abilityId) 升冪 —— 不依賴 Map 的迭代順序。
 */
/**
 * 複合 Map key 的分隔符。
 *
 * 縱深防禦,**今天不是 load-bearing**:兩個 key 的左半都是空白安全的
 * (`seatId` 是數字、`OfferKind` 是固定 enum),所以連空白當分隔符都不會相撞 ——
 * 第一個空白必然就是分界。我一度為「空白會相撞」寫了一條測試,把分隔符改成空白
 * 之後它仍然是綠的,那是形態④(斷言方向跟缺陷無關),已經刪掉。
 *
 * 留 U+001F(單元分隔符)是為了**未來**:哪天左半變成 championId / itemId 這種
 * 內容作者打的字串,分隔符就立刻變成 load-bearing,而那一天不會有人記得回來
 * 檢查。U+001F 是控制字元,不可能出現在 id 裡。
 *
 * ⚠️ 寫成跳脫序列,不要貼字面控制字元 —— 字面的那個位元組會讓 git / grep / `file`
 * 把整份原始碼當成二進位檔(這個檔案已經被我犯過一次)。
 */
const KEY_SEP = "\u001f";

export function aggregateAbilityUse(casts: readonly AbilityCastRecord[]): AbilityUsage[] {
  const byKey = new Map<string, AbilityUsage>();
  for (const c of casts) {
    const key = `${c.seatId}${KEY_SEP}${c.abilityId}`;
    let u = byKey.get(key);
    if (!u) {
      u = {
        seatId: c.seatId,
        abilityId: c.abilityId,
        casts: 0,
        whiffs: 0,
        heroHits: 0,
        mobHits: 0,
        damageToHeroes: 0,
        damageToMobs: 0,
        healingDone: 0,
        ccTicksApplied: 0,
        heroKills: 0,
      };
      byKey.set(key, u);
    }
    u.casts += 1;
    if (c.heroHits === 0 && c.mobHits === 0) u.whiffs += 1;
    u.heroHits += c.heroHits;
    u.mobHits += c.mobHits;
    u.damageToHeroes += c.damageToHeroes;
    u.damageToMobs += c.damageToMobs;
    u.healingDone += c.healingDone;
    u.ccTicksApplied += c.ccTicksApplied;
    u.heroKills += c.heroKills;
  }
  return [...byKey.values()].sort((a, b) =>
    a.seatId !== b.seatId ? a.seatId - b.seatId : a.abilityId < b.abilityId ? -1 : a.abilityId > b.abilityId ? 1 : 0,
  );
}

/** 一張三選一卡片的取捨統計 —— 「被發過幾次、被選過幾次」。 */
export interface OfferChoiceStat {
  id: string;
  kind: OfferKind;
  /** 出現在選項裡的次數 */
  offered: number;
  /** 被玩家選走的次數(不含系統代選) */
  picked: number;
  /** 被系統代選走的次數 —— 這不是玩家的偏好,分開算 */
  autoPicked: number;
  /** 被發出來卻沒被選的次數。`offered = picked + autoPicked + declined` */
  declined: number;
}

/**
 * 三選一的取捨率。
 *
 * ⚠️ `picked / offered` 才是取捨率,不是 `picked / 總場次` —— 一張只在第 6 輪
 * 才進池的卡,分母是它真的被發出來的次數。這就是為什麼 `declined` 一定要記。
 * `autoPicked` 從分子扣掉:系統代選不是偏好。
 *
 * 輸出依 (kind, id) 升冪。
 */
export function aggregateOfferChoices(offers: readonly OfferRecord[]): OfferChoiceStat[] {
  const byKey = new Map<string, OfferChoiceStat>();
  const touch = (kind: OfferKind, id: string): OfferChoiceStat => {
    const key = `${kind}${KEY_SEP}${id}`;
    let s = byKey.get(key);
    if (!s) {
      s = { id, kind, offered: 0, picked: 0, autoPicked: 0, declined: 0 };
      byKey.set(key, s);
    }
    return s;
  };
  for (const o of offers) {
    for (const id of o.offered) touch(o.kind, id).offered += 1;
    for (const id of o.declined) touch(o.kind, id).declined += 1;
    if (o.picked !== null) {
      const s = touch(o.kind, o.picked);
      if (o.auto) s.autoPicked += 1;
      else s.picked += 1;
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.kind !== b.kind ? (a.kind < b.kind ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/** 一隻英雄的選取率 / 勝率(#207 的第一張表)。 */
export interface ChampionRateStat {
  championId: string;
  /** 被選中的場次 */
  picks: number;
  /** 其中按隨機鈕的 */
  randomPicks: number;
  /** 其中系統代選的 */
  autoPicks: number;
  /** 打過的回合數(不含輪空) */
  roundsPlayed: number;
  /** 其中活到回合結束的回合數 */
  roundsSurvived: number;
}

/**
 * 英雄選取率 + 存活率。
 *
 * 輪空回合**不計入** `roundsPlayed` —— 它是一場沒有發生的比賽,算進分母會讓
 * 抽到輪空比較多的英雄看起來比較弱。輸出依 championId 升冪。
 */
export function aggregateChampionRates(
  picks: readonly ChampionPickRecord[],
  rounds: readonly RoundPlayerRecord[],
): ChampionRateStat[] {
  const byId = new Map<string, ChampionRateStat>();
  const touch = (championId: string): ChampionRateStat => {
    let s = byId.get(championId);
    if (!s) {
      s = { championId, picks: 0, randomPicks: 0, autoPicks: 0, roundsPlayed: 0, roundsSurvived: 0 };
      byId.set(championId, s);
    }
    return s;
  };
  for (const p of picks) {
    const s = touch(p.championId);
    s.picks += 1;
    if (p.source === "random") s.randomPicks += 1;
    if (p.source === "auto") s.autoPicks += 1;
  }
  for (const r of rounds) {
    if (r.bye || r.championId === "") continue;
    const s = touch(r.championId);
    s.roundsPlayed += 1;
    if (r.alive) s.roundsSurvived += 1;
  }
  return [...byId.values()].sort((a, b) =>
    a.championId < b.championId ? -1 : a.championId > b.championId ? 1 : 0,
  );
}

/**
 * 一份回合紀錄 → S~D 評價。純轉發到 {@link gradeRound},存在的理由是讓消費端
 * 不必自己拼 `RoundPerformance`(拼錯一個欄位就是一個安靜的錯誤等第)。
 *
 * 輪空回合回 `null`:那一場沒有打過,給它一個 D 是在對玩家說謊。
 */
export function gradeRoundRecord(
  rec: RoundPlayerRecord,
  ctx: RoundGradeContext,
  cfg?: RoundGradeConfig,
): RoundGradeResult | null {
  if (rec.bye) return null;
  return gradeRound(rec, ctx, cfg);
}

// ───────────────────────────────────────────────────────────────────────────
// 傷害排行榜 (#636) —— 一場的「top 單發」
// ───────────────────────────────────────────────────────────────────────────

/**
 * 排行榜的一列(sim 側的純推導 —— **沒有** ts / version,那兩格是 host 才知道
 * 的事,由 game-server 的 stats/damageBoard.ts 補上;這裡補會破 sim 純度)。
 */
export interface TopDamageCast {
  round: number;
  seatId: number;
  /** 從 picks 解析;該座位沒有選角紀錄時是 ""(fail-open,不丟資料) */
  championId: string;
  abilityId: string;
  /** "Q" / "W" / "E" / "R" / "EX" / "passive" / "basic" */
  slot: string;
  /** damageToHeroes + damageToMobs —— 這一次施放打出的總傷害 */
  damage: number;
  /** 施放的絕對 tick */
  tick: number;
  /** 帳本內單調序號 —— 讓 (matchId, castId) 成為全域唯一鍵 */
  castId: number;
  /** 施放當下持有的道具(buy/grant − sell,tick ≤ 施放 tick,升冪排序) */
  items: string[];
  /**
   * ⭐ GH#914 —— 這一次施放**命中幾個英雄 / 幾隻小怪**。
   *
   * ⚠️ ⭐ **兩個數字刻意分開**（票文逐字）：「一發掃過 30 隻殭屍與一發打中 3 個英雄，
   * 是完全不同的事件」⇒ ⛔ 加起來變成一個「命中數」會把它們混成同一件事。
   *
   * ⭐ 而它讓這張榜第一次**可比**：今天的 `damage` 是一次施放的**總傷害**
   * ⇒ ⛔ 一發打中 8 隻的 AoE 與一發打中 1 個人的爆發，在同一欄裡根本不能比。
   */
  heroHits: number;
  mobHits: number;
  /** ⭐ 施放當下的等級。缺席 ⇒ 舊資料（⛔ 後台畫「—」，不是 0）。 */
  casterLevel?: number;
  /**
   * GH#658 —— 這一次施放打在**單一英雄**身上的最大一擊。0 = 沒打到任何英雄。
   */
  victimDamage: number;
  /**
   * 上面那一擊命中當下,**那個目標**的最大生命。0 = 不知道 ——
   * ⛔ 消費端要顯示「—」,⛔ 不可以當成 0(那會讓每一列看起來都是 0%)。
   */
  victimMaxHp: number;
}

/**
 * GH#658 —— 「這一發佔了目標多少血」。**推導**,⛔ 不存第二份(第〇·四守則)。
 *
 * 回 `null` 而不是 0 表示「不知道」:舊資料沒有這兩格、或這次施放一個英雄都
 * 沒打到。⚠️ 0 是一個**真的百分比**,拿它代表「不知道」會讓舊列全部看起來
 * 像沒傷害(#658 逐字點名的那個坑)。
 */
export function pctOfVictimMaxHp(c: {
  victimDamage: number;
  victimMaxHp: number;
}): number | null {
  if (!(c.victimMaxHp > 0) || !(c.victimDamage > 0)) return null;
  return c.victimDamage / c.victimMaxHp;
}

/**
 * 一場的 top 單發傷害 —— 依 (damage 降冪, castId 升冪) 取前 `limit` 筆。
 *
 * 「單發」的單位是**一次施放**(`AbilityCastRecord`),不是一個傷害封包:
 * 封包沒有 abilityId 可歸因(`largestSingleHit` 只是極值,不知道是哪一招),
 * 而 owner 要的正是「被哪個人**哪招**傷害最高」。
 *
 * 決定性:輸入同一份快照永遠得到同一個輸出 —— 排序的 tie-break 是 castId
 * (單調序號),items 依 itemId 升冪,沒有時鐘、沒有 Map 迭代順序。
 */
export function topDamageCasts(snap: MatchLedgerSnapshot, limit: number): TopDamageCast[] {
  if (limit <= 0) return [];
  const champBySeat = new Map<number, string>();
  for (const p of snap.picks) champBySeat.set(p.seatId, p.championId);
  const damageOf = (c: AbilityCastRecord): number => c.damageToHeroes + c.damageToMobs;
  return snap.casts
    .filter((c) => damageOf(c) > 0)
    .sort((a, b) => (damageOf(b) !== damageOf(a) ? damageOf(b) - damageOf(a) : a.castId - b.castId))
    .slice(0, limit)
    .map((c) => ({
      round: c.round,
      seatId: c.seatId,
      championId: champBySeat.get(c.seatId) ?? "",
      abilityId: c.abilityId,
      slot: c.slot,
      damage: damageOf(c),
      tick: c.tick,
      castId: c.castId,
      items: itemsOwnedAt(snap.itemTxns, c.seatId, c.tick),
      victimDamage: c.topHeroHit,
      victimMaxHp: c.topHeroHitMaxHp,
      heroHits: c.heroHits,
      mobHits: c.mobHits,
      casterLevel: c.casterLevel,
    }));
}

/**
 * 某座位在某個 tick 當下持有的道具(重複持有就出現兩次)。
 * `sell` 減一份、`buy`/`grant` 加一份 —— 與 ItemTxnRecord 的三種 kind 一一對應。
 */
function itemsOwnedAt(txns: readonly ItemTxnRecord[], seatId: number, tick: number): string[] {
  const counts = new Map<string, number>();
  for (const t of txns) {
    if (t.seatId !== seatId || t.tick > tick) continue;
    counts.set(t.itemId, (counts.get(t.itemId) ?? 0) + (t.kind === "sell" ? -1 : 1));
  }
  const out: string[] = [];
  for (const [id, n] of [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    for (let i = 0; i < n; i += 1) out.push(id);
  }
  return out;
}
