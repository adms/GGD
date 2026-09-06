/**
 * ArenaRules — the MatchController's data-driven round-rules table, resolved
 * from the `config.arena-rules@1` content doc (LoL-Arena style: per-round
 * level/gold grants, auto-learned QWE, augment tiers, free legendary-weapon
 * offers, R unlock round). DEFAULT_ARENA_RULES reproduces the legacy skeleton
 * behavior EXACTLY (augments rounds 1/3/5, gacha round 2+, classic 6/11/16 R
 * gate, no grants) so every existing unit test and any match created without
 * the doc behaves as before.
 */
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import type { AugmentTier } from "@ggd/shared/sim/content/defs";
import { AUGMENT_TIER_SCHEDULE, DEFAULT_ITEM_DRAFT_POLICY } from "@ggd/shared/sim/economy/draft";
import type { ItemDraftPolicy } from "@ggd/shared/sim/economy/draft";
import { DEFAULT_GRAIL_DRAFT } from "@ggd/shared/sim/economy/grailVocabulary";
import type { GrailDraftRules } from "@ggd/shared/sim/economy/grailVocabulary";
import type { ObjectiveConfigLike } from "@ggd/shared/sim/systems/ObjectiveSystem";
import {
  Configs,
  scheduledRetiredTables,
  DEFAULT_DRAFT_CONFLICT,
  DEFAULT_LEGENDARY_SHELF,
  DEFAULT_WEAPON_TIERS,
  DEFAULT_AUGMENT_TIERS,
  DEFAULT_FINAL_ROUND,
  DEFAULT_BOTH_DRAFTS_EXTRA_SEC,
  DEFAULT_BOT_ONLY_RING_ACCEL_SEC,
  DEFAULT_POST_MATCH_LINGER_SEC,
  DEFAULT_BOT_ONLY_RING_ACCEL_ENABLED,
  DEFAULT_HUMAN_SEATS_FROM_ROUND,
  DEFAULT_BOT_SHOP,
  DEFAULT_DISADVANTAGE_WEIGHTS,
} from "@ggd/shared/content";
import type { WeaponTierRule } from "@ggd/shared/sim/economy/weaponTiers";
import { DEFAULT_SELL_REFUND_PCT, WEAPON_SHELF_OPEN } from "@ggd/shared/sim/economy/shopShelf";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";
import { MAX_ROUNDS_UNLIMITED } from "@ggd/shared/roomSettings";
import type {
  BotShopConfig,
  DraftConflict,
  LegendaryShelfConfig,
  ConfigArenaRulesDoc,
  FlowerConfig,
  ReviveCircleConfig,
  GuardianTowerConfig,
  GoldDropConfig,
  MobWavesConfig,
  DisadvantageWeights,
} from "@ggd/shared/content";

export interface RoundGrant {
  grantLevels?: number;
  grantGold?: number;
  autoLearn?: CoreAbilitySlot[];
  augmentTier?: AugmentTier;
  weaponLootTable?: string;
  /** ⭐ 這一回合的三選一是「寶具」的機率（0–100，`draftConflict: "round-roll"` 才讀）。 */
  weaponDraftPct?: number;
  /** ⭐ 這一回合**兩張都發**（推翻 `weaponDraftPct`），中場相對應延長。 */
  draftBoth?: boolean;
}

/**
 * 寶具貨架那一區塊**解析完**的樣子 —— 從 `SimWorld` 那一格推導，⛔ 不重打形狀。
 *
 * config 那一份（`LegendaryShelfConfig`）有兩格是 `.optional()`（線上舊 override
 * 沒有它們），而 sim 讀的是必填的四格；`legendaryShelfRules` 就是這兩者之間
 * **唯一**的一道解析。
 */
export type LegendaryShelfRules = SimWorld["legendaryShelf"];

/**
 * `config.arena-rules@1` 的 `legendaryShelf` → sim 讀得懂的四格。
 *
 * ⚠️ 缺席的欄位拿的是**引擎常數**（`DEFAULT_SELL_REFUND_PCT` / 空表），也就是
 * `SimWorld` 自己的預設值 —— 所以「舊 override 少一格」與「沒有接線」得到的是
 * 同一個結果，⛔ 不會有第三種行為。
 */
export function legendaryShelfRules(cfg: LegendaryShelfConfig): LegendaryShelfRules {
  return {
    open: cfg.open,
    priceMultiplier: cfg.priceMultiplier,
    sellRefundPct: cfg.sellRefundPct ?? DEFAULT_SELL_REFUND_PCT,
    // 複製一份：`world.legendaryShelf` 是整塊指派的，共用同一個陣列會讓一場比賽
    // 有辦法動到 DEFAULT_ARENA_RULES（模組層常數，每一場都在讀它）。
    randomOnlyTables: [...(cfg.randomOnlyTables ?? [])],
  };
}

export interface ArenaRules {
  /** round from which R is learnable at any level; null = classic 6/11/16 */
  ultUnlockRound: number | null;
  /** round from which champions with an exAbility unlock EX; null = never */
  exUnlockRound: number | null;
  /** choices per offer (augment + weapon offers) */
  /**
   * ⭐ GH#330 —— 升級拿到的技能點自動照 `skillOrder` 花掉（⭐ 預設開）。
   * ⛔ 關掉＝回到玩家自己按技能上那顆 `+`（一鍵 rollback）。
   * ⚠️ 刻意 optional：舊房間／舊錄影沒有這一格，⭐ 而消費端寫 `!== false`
   * ⇒ 缺席＝開著（＝出貨行為），⛔ 不是關著。
   */
  autoSpendSkillPoints?: boolean;
  offerCount: number;
  /**
   * 傳說武器卡的補抽規則 (GH#249). NEVER null: an absent block resolves to
   * `DEFAULT_ITEM_DRAFT_POLICY`, because "no policy" is not a state a card can
   * be rolled in — the mechanic is not optional, only its exhausted-pool
   * answer is.
   */
  itemDraft: ItemDraftPolicy;
  /**
   * ⭐ 聖杯顯現規則（§15 靈基適性條件 · §16 顯現差異）。NEVER null，同
   * `itemDraft` 的理由：「不發卡條件」不是一個機制可以待著的狀態，缺席的
   * 那份文件要的是**出貨規則**，不是「這個閘不存在」。
   */
  grailDraft: GrailDraftRules;
  /**
   * ⭐ **寶具貨架 + 那一則的整組金流旋鈕**（owner 2026-08-17：上架 / 統一價倍率 /
   * 賣出退款率 / 隨機限定表）。NEVER null，同 `grailDraft` 的理由。
   *
   * ⚠️ 型別是 `SimWorld` 那一格**推導**出來的（⛔ 不重打一份形狀）：它會被
   * `MatchController` **整塊**指派給 `world.legendaryShelf`，所以 config 長出新欄位
   * 時這裡跟著 tsc 紅，而不是靜靜地只送舊的兩格。
   */
  legendaryShelf: LegendaryShelfRules;
  /**
   * ⭐ **#261 下架的 70 把普通武器能不能買**（GH#350，後台 `weaponShelfOpen`）。
   *
   * ⚠️ 在 2026-08-20 之前這是 `sim/economy/shopShelf.ts` 的一個 export 布林常數，
   * 而 `grep world.weaponShelfOpen` 在 production 程式是**空的** —— 改一次要
   * rebuild + 重啟容器。現在它走與 `legendaryShelf` 一模一樣的那條路。
   *
   * ⚠️ 舊錄影的表頭沒有這一格（`rebuildRules` 直接 spread），所以消費端
   * （`MatchController`）用 `??` 落到 `WEAPON_SHELF_OPEN`。
   */
  weaponShelfOpen: boolean;
  /**
   * ⭐ 同一回合**同時**排了聖杯願望（`augmentTier`）與寶具（`weaponLootTable`）
   * 時要發哪一個（owner 2026-08-17「兩者衝突不顯示寶具三選一」，#340）。
   *
   * ⚠️ 它是一個**決策點**不是數值（第一守則）：兩張三選一共用同一段中場倒數，
   * 所以「都發」的代價是玩家的選擇時間被切成兩半。判斷哪一張讓路是設計，
   * 不是調參 —— 所以它是一格後台開關，而 `both` 逐字等於 2026-08-17 之前的行為。
   *
   * ⚠️ 消費端一律走 {@link grailDraftAllowed} / {@link weaponDraftAllowed}，
   * ⛔ 不要在別處再寫一次這個比較 —— 舊錄影的表頭沒有這一格（見
   * `replay/headerCodec.ts` 的 `rebuildRules`），那兩支函式吃得下 undefined
   * 並還原成當時真的發生的「兩張都發」。
   */
  draftConflict: DraftConflict;
  /**
   * ⭐ 更高階寶具（EX解放 / EX∅ 根源），由**高到低**排。空陣列 = 關掉。
   * 機制住在 `sim/economy/weaponTiers.ts`，這裡只是把設定送過去。
   */
  weaponTiers: readonly WeaponTierRule[];
  /**
   * ⭐ 聖杯願望的階級升級表（GH#357），與 `weaponTiers` **同一個引擎**。
   * 空陣列 = 關掉，回合表排什麼等級就發什麼。
   */
  augmentTiers: readonly WeaponTierRule[];
  /** ⭐ 賽制的最後一回合。打完就全場結算，而且它是全員大亂鬥的那一回合。 */
  finalRound: number;
  /** ⭐ 真的兩張都發出去的回合，中場多給幾秒。 */
  bothDraftsExtraSec: number;
  /**
   * ⭐ GH#643 —— 還在打的 zone 裡沒有活著的人類時，火圈點火夾到「現在＋幾秒」。
   * ⚠️ 舊錄影的表頭沒有這兩格（`rebuildRules` 直接 spread）⇒ 執行期是
   * `undefined`；消費端（`accelFireRingForBotOnly`）用 `!== true` / `undefined`
   * 判讀成「機制關著」—— 那正是錄影當時真的發生的行為。型別上宣告成必填
   * 是為了強迫新的建構點想一次（同 `maxRounds` 的理由）。
   */
  botOnlyRingAccelEnabled: boolean;
  /** GH#643 的秒數（出貨 10）。0 = 人類全滅的下一個 tick 就點火。 */
  botOnlyRingAccelSec: number;
  /**
   * ⭐ GH#1033 —— sim 從第幾回合起知道哪幾個座位是真人（`MobRules.humanSeats`）。
   * 出貨 1；3 ＝ 舊行為（名單只跟著殭屍波武裝走）。⚠️ 舊錄影的表頭沒有這一格
   * （`rebuildRules` 直接 spread）⇒ 執行期 `undefined`；消費端（`enterCombat`）
   * 用 `typeof === "number"` 判讀成「機制關著」—— 那正是錄影當時真的發生的行為。
   */
  humanSeatsFromRound: number;
  /** GH#651 打完之後房間還留著幾秒（讓玩家看戰績）。 */
  postMatchLingerSec: number;
  /** ⭐ bot 怎麼花錢（owner 2026-08-18：買隨機寶具、半價）。 */
  botShop: BotShopConfig;
  /**
   * 劣勢值 `D` 的三項權重（owner 2026-08-17 的 50/30/20）。NEVER null —— 同
   * `itemDraft` 的理由：「沒有權重」不是一個狀態，缺席的文件要的是出貨規則。
   */
  disadvantageWeights: DisadvantageWeights;
  /** round number -> grants applied at that round's intermission entry */
  rounds: ReadonlyMap<number, RoundGrant>;
  /** grants for every round past the highest `rounds` key (escalating gold) */
  overflow: {
    grantLevels: number;
    grantGold: number;
    grantGoldPerRound: number;
    /** augment tier offered on overflow rounds (so "every round" stays literal) */
    augmentTier?: AugmentTier;
  } | null;
  /** legacy per-round free item gacha; null = disabled */
  gacha: { fromRound: number; lootTable: string } | null;
  /** healing-flower rules (combat-phase plants); null = no flowers (legacy) */
  flowers: FlowerConfig | null;
  /** revive-circle rules (task #84); null = mechanic off (legacy) */
  reviveCircles: ReviveCircleConfig | null;
  /** neutral duel-zone guardian rules (task #89); null = mechanic off (legacy) */
  guardianTower: GuardianTowerConfig | null;
  /** 陣亡投幣 rules (task #191); null = dead players cannot throw gold (legacy) */
  goldDrop: GoldDropConfig | null;
  /** roguelite mob-wave rules (task #215); null = mechanic off (legacy) */
  mobWaves: MobWavesConfig | null;
  /**
   * PER-ROOM roguelite-mob toggle (task #215, owner directive 2026-07-25:
   * 「肉鴿殭屍模式…做成房間開關，但預設是打開」). This is NOT sourced from the
   * content doc — `mobWaves` above is the GLOBAL tuning (fromRound/reward/cap),
   * this is the per-match ON/OFF switch a room host flips. It defaults to ON and
   * is only driven to `false` by an explicit room override, so absent/undefined
   * === ON at every hop (old rooms, old replays, DEFAULT_ARENA_RULES). Frozen
   * into ArenaRules at match creation and read by the sim ONLY via `this.rules`,
   * so it is a deterministic, replay-recorded input — never a client cosmetic.
   */
  rogueliteMobs: boolean;
  /**
   * 房主設定的**總回合數上限**（#288，owner 2026-08-08:「開房房主可以設定 選角、
   * 商店、每回合的時間跟總回合數，但**預設值保留現在**」）。
   * {@link MAX_ROUNDS_UNLIMITED}（0）= 不設限 = 今天的行為。
   *
   * ⚠️ 它和 `rogueliteMobs` 走**完全同一條路**，而且是刻意的：這是一格 PER-ROOM
   * 的設定，不是 `config.arena-rules@1` 的內容欄位（出貨預設住在
   * `config.match@1` 的 `match.maxRounds`，由 `phaseConfig.resolveMaxRounds` 讀，
   * 房主沒設時就用它 —— 語意①「缺席 ≠ 重設」）。住在 ArenaRules 換到三件事：
   *   ① 建構子已經有這一格（第 6 個位置），不必再加第 26 個位置參數；
   *   ② 回放 header 已經整份記錄 `arenaRules` 並由 `rebuildRules` 還原，
   *      所以一場 3 回合的比賽重播出來也是 3 回合，不是 10 回合；
   *   ③ `MatchRoom.onCreate` 已經在同一行合併房主的 `rogueliteMobs`。
   *
   * ⚠️ 舊錄影沒有這一格 → `undefined` → `roundCapReached` 回 false → 不設限。
   * 型別上宣告成必填（和 `rogueliteMobs` 一樣）是為了強迫新的建構點想一次，
   * 消費端一律走 `roundCapReached`，它自己吃得下 undefined。
   */
  maxRounds: number;
  /**
   * ⭐ 戰場任務「陣營塔」的覆蓋值（GH#752 mini dota）。
   *
   * ⚠️ **刻意 optional 而且刻意不在 {@link DEFAULT_ARENA_RULES} 裡**：出貨值
   * 只有**一個**住處，就是 `sim/systems/ObjectiveSystem.ts` 的
   * `DEFAULT_OBJECTIVE_RULES`（第〇·四守則 —— 在這裡再抄一份就是第二個住處，
   * 而兩份會各自漂）。缺席 ⇒ `objectiveRulesFromConfig(undefined)` ⇒ 出貨值。
   *
   * ⛔ 今天沒有任何一條路填它：`config.arena-rules@1` 的 Zod 還沒長出 `objective`
   * 那一格（那份 schema 在本 lane 的檔案柵欄外，見 #752 的接線清單）。
   * ⭐ 那一格一落地，`rulesFromDoc` 只要多一行 `objective: doc.objective`，
   *    後台就變成三住處的旋鈕，⛔ 而這裡與 sim 一個字都不用改。
   */
  objective?: ObjectiveConfigLike;
}

/** Legacy behavior: augment tiers per AUGMENT_TIER_SCHEDULE + round-2+ gacha. */
export const DEFAULT_ARENA_RULES: ArenaRules = {
  ultUnlockRound: null,
  exUnlockRound: null,
  offerCount: 3,
  autoSpendSkillPoints: true,
  itemDraft: DEFAULT_ITEM_DRAFT_POLICY,
  grailDraft: DEFAULT_GRAIL_DRAFT,
  // ⭐ 出貨的寶具貨架（owner 2026-08-17）。引用 shared 的那一份，⛔ 不重打 ——
  // 重打一份就是第四個住處，而它沒有 drift 測試在守。
  legendaryShelf: legendaryShelfRules(DEFAULT_LEGENDARY_SHELF),
  // ⭐ #261 的普通武器貨架（GH#350）。引用 sim 的那一份常數，⛔ 不重打 ——
  // 那是「今天的行為」的唯一定義，重打一份就是第二個會漂走的住處。
  weaponShelfOpen: WEAPON_SHELF_OPEN,
  // ⚠️ 這一格**不是**「保留舊行為」的那個值。第〇·六守則：優先權大的更新
  // 預設啟動，所以連骨架/單元測試的預設也走 owner 的裁決。DEFAULT_ARENA_RULES
  // 本身一個回合都沒排寶具，所以它在這裡沒有可見後果 —— 但它讓「新建構點忘了
  // 想這一格」時落到的那個值是**設計**，不是 2026-08-17 之前的行為。
  draftConflict: DEFAULT_DRAFT_CONFLICT,
  weaponTiers: DEFAULT_WEAPON_TIERS,
  augmentTiers: DEFAULT_AUGMENT_TIERS,
  finalRound: DEFAULT_FINAL_ROUND,
  bothDraftsExtraSec: DEFAULT_BOTH_DRAFTS_EXTRA_SEC,
  // ⭐ GH#643 —— 引用 shared 的常數，⛔ 不重打（重打就是第四個住處）。預設**開**
  // （第〇·六守則），所以連骨架/單元測試的預設也走 owner 的裁決；全 bot 沙盒
  // 另有「0 個 humanSeat 不觸發」那一關，所以既有 all-bot 測試逐位元不變。
  botOnlyRingAccelEnabled: DEFAULT_BOT_ONLY_RING_ACCEL_ENABLED,
  botOnlyRingAccelSec: DEFAULT_BOT_ONLY_RING_ACCEL_SEC,
  // ⭐ GH#1033 —— 引用 shared 的常數，⛔ 不重打。全 bot 沙盒另有「0 個 humanSeat
  // 不送」那一關（空集合 ⇒ 不武裝），所以既有 all-bot 測試逐位元不變。
  humanSeatsFromRound: DEFAULT_HUMAN_SEATS_FROM_ROUND,
  postMatchLingerSec: DEFAULT_POST_MATCH_LINGER_SEC,
  botShop: DEFAULT_BOT_SHOP,
  disadvantageWeights: DEFAULT_DISADVANTAGE_WEIGHTS,
  rounds: new Map(
    Object.entries(AUGMENT_TIER_SCHEDULE).map(([round, tier]) => [
      Number(round),
      { augmentTier: tier },
    ]),
  ),
  overflow: null,
  gacha: { fromRound: 2, lootTable: "round-reward" },
  flowers: null,
  reviveCircles: null,
  guardianTower: null,
  goldDrop: null,
  mobWaves: null,
  // Default ON (owner directive): every match/test/room without an explicit
  // override plays with the roguelite mobs armed. `mobWaves` being null here
  // means DEFAULT_ARENA_RULES still spawns nothing (no tuning), but a resolved
  // arena-rules doc that supplies mobWaves will spawn unless a room turns this
  // off — which is exactly the pre-existing behavior, now switchable.
  rogueliteMobs: true,
  // 不設限 = 今天的行為（比賽打到決賽才結束）。房主沒設、內容沒設、單元測試、
  // 骨架開機、舊錄影 —— 全部落在這一格，所以這個機制在出貨預設下不存在。
  maxRounds: MAX_ROUNDS_UNLIMITED,
};

/**
 * Convert a parsed config.arena-rules@1 doc into the controller's rule table.
 *
 * ⚠️ 退場的抽獎池在這裡**被剝掉**,不是被照發 (owner 2026-08-01「退場」).
 * `ContentLoader` 已經會拒絕一份把退場的表排回去的文件,所以走 `content/` 那條路
 * 的話永遠不會走到這裡。這一段守的是**另一條路**:後台耐久覆蓋層的寫入路徑目前
 * 完全沒有 Zod 驗證 (#283),所以線上一個 override 有辦法把 `quest-rewards` 排回
 * 第 4 回合而沒有任何東西擋。剝掉 + `console.warn` 是刻意的組合 —— 靜靜地照發是
 * owner 剛否決的事,靜靜地不發是失敗形態 ②。
 */
export function rulesFromDoc(doc: ConfigArenaRulesDoc): ArenaRules {
  // ONE implementation of 「哪些欄位排到了退場的表」, shared with the content
  // loader (packages/shared/src/content/retiredLootTables.ts). Two copies of
  // this rule would be two rules that drift.
  const retiredUses = scheduledRetiredTables(doc);
  const retiredFields = new Set(retiredUses.map((u) => u.field));
  const retiredRounds = new Set(
    retiredUses
      .map((u) => /^rounds\.(\d+)\.weaponLootTable$/.exec(u.field)?.[1])
      .filter((k): k is string => k !== undefined),
  );
  for (const use of retiredUses) {
    console.warn(
      `[arena-rules] ${use.field} 排了已退場的抽獎池 "${use.table}" —— 這一份規則不會發它。` +
        `owner 2026-08-01 裁定它退場;要復活請先把它從 retiredLootTables 移除。`,
    );
  }
  const rounds = new Map<number, RoundGrant>();
  for (const [key, grant] of Object.entries(doc.rounds)) {
    if (!grant) continue;
    rounds.set(Number(key), {
      grantLevels: grant.grantLevels,
      grantGold: grant.grantGold,
      autoLearn: grant.autoLearn,
      augmentTier: grant.augmentTier,
      weaponLootTable: retiredRounds.has(key) ? undefined : grant.weaponLootTable,
      weaponDraftPct: grant.weaponDraftPct,
      draftBoth: grant.draftBoth,
    });
  }
  return {
    ultUnlockRound: doc.ultUnlockRound ?? null,
    exUnlockRound: doc.exUnlockRound ?? null,
    offerCount: doc.offerCount,
    autoSpendSkillPoints: doc.autoSpendSkillPoints ?? true,
    // Absent block = the shipped policy, NOT null. See the field's doc comment.
    // A RETIRED fallback pool is emptied to "" — the authored 「沒有備援」 value,
    // which `economy/draft.ts` already handles as "then just deal a short card".
    itemDraft: retiredFields.has("itemDraft.fallbackTable")
      ? { ...(doc.itemDraft ?? DEFAULT_ITEM_DRAFT_POLICY), fallbackTable: "" }
      : (doc.itemDraft ?? DEFAULT_ITEM_DRAFT_POLICY),
    grailDraft: doc.grailDraft ?? DEFAULT_GRAIL_DRAFT,
    // ⭐ 寶具貨架 —— 後台那四格從這裡進比賽（`MatchController` 在 tick 0 之前
    // 整塊指派給 `world.legendaryShelf`）。
    // ⚠️ `??` 同下面 `draftConflict` 那一條：線上耐久覆蓋層那份文件是這一區塊
    // 存在之前存的，缺席拿到的是**出貨預設**。
    legendaryShelf: legendaryShelfRules(doc.legendaryShelf ?? DEFAULT_LEGENDARY_SHELF),
    // ⭐ GH#350 —— #261 那 70 把普通武器的貨架，從這裡進比賽。
    // ⚠️ `??` 同上：線上耐久覆蓋層那份文件是這一格存在之前存的，缺席拿到的是
    // **出貨常數**（false ＝ 今天的行為），⛔ 不是靜靜地把商店整批打開。
    weaponShelfOpen: doc.weaponShelfOpen ?? WEAPON_SHELF_OPEN,
    // ⚠️ `??` 不是防禦性寫法，它是**線上耐久覆蓋層**的那條路：那份文件是這一格
    // 存在之前存的，少了它。缺席要拿到的是新的出貨預設（owner 的裁決），
    // ⛔ 不是 `both`（＝靜靜地維持他剛剛抱怨的那個行為）。
    draftConflict: doc.draftConflict ?? DEFAULT_DRAFT_CONFLICT,
    // ⚠️ `??` 同上：線上耐久覆蓋層那份文件是這一格出現之前存的。
    weaponTiers: doc.weaponTiers ?? DEFAULT_WEAPON_TIERS,
    // ⚠️ `??` 同上：線上耐久覆蓋層那份文件是這三格出現之前存的。
    augmentTiers: doc.augmentTiers ?? DEFAULT_AUGMENT_TIERS,
    finalRound: doc.finalRound ?? DEFAULT_FINAL_ROUND,
    bothDraftsExtraSec: doc.bothDraftsExtraSec ?? DEFAULT_BOTH_DRAFTS_EXTRA_SEC,
    // ⚠️ `??` 同上：線上耐久覆蓋層那份文件是這兩格出現之前存的，缺席拿到的是
    // 出貨預設（開、10 秒），⛔ 不是靜靜地把 GH#643 關掉。
    botOnlyRingAccelEnabled: doc.botOnlyRingAccelEnabled ?? DEFAULT_BOT_ONLY_RING_ACCEL_ENABLED,
    botOnlyRingAccelSec: doc.botOnlyRingAccelSec ?? DEFAULT_BOT_ONLY_RING_ACCEL_SEC,
    postMatchLingerSec: doc.postMatchLingerSec ?? DEFAULT_POST_MATCH_LINGER_SEC,
    botShop: doc.botShop ?? DEFAULT_BOT_SHOP,
    disadvantageWeights: doc.disadvantageWeights ?? DEFAULT_DISADVANTAGE_WEIGHTS,
    rounds,
    overflow: doc.overflow ?? null,
    // A retired gacha pool turns the legacy per-round gacha OFF rather than
    // rolling it: `null` is the authored 「這個機制關著」 state (it is what the
    // shipped doc means by omitting the block), so nothing downstream has to
    // learn about retirement.
    gacha: retiredFields.has("gacha.lootTable") ? null : (doc.gacha ?? null),
    flowers: doc.flowers ?? null,
    reviveCircles: doc.reviveCircles ?? null,
    guardianTower: doc.guardianTower ?? null,
    goldDrop: doc.goldDrop ?? null,
    mobWaves: doc.mobWaves ?? null,
    // NOT a content-doc field: the per-room toggle defaults ON here and is only
    // ever driven to false by the room override merged in MatchRoom.onCreate.
    rogueliteMobs: true,
    // 同上：不是 `arena-rules@1` 的欄位。出貨預設在 `config.match@1`，房主的值
    // 在 `MatchRoom.onCreate` 合併進來。這裡放「不設限」＝今天的行為。
    maxRounds: MAX_ROUNDS_UNLIMITED,
  };
}

/** The grant for a round: explicit table entry, or the overflow escalation. */
export function grantForRound(rules: ArenaRules, round: number): RoundGrant | null {
  const explicit = rules.rounds.get(round);
  if (explicit) return explicit;
  if (!rules.overflow) return null;
  const maxRound = Math.max(0, ...rules.rounds.keys());
  if (round <= maxRound) return null;
  return {
    grantLevels: rules.overflow.grantLevels,
    grantGold: rules.overflow.grantGold + rules.overflow.grantGoldPerRound * (round - maxRound - 1),
    augmentTier: rules.overflow.augmentTier,
  };
}

// ────────────────────────────── 同一回合撞卡的裁決（#340）──────────────────
//
// owner 2026-08-17：「調整寶具跟固有能力三選一 不要同時出現 造成選擇時間不夠
// (兩者有衝突不顯示寶具三選一)」。
//
// ⛔ **機制在這裡，不在內容裡**（第〇·五守則）：解法不是把第 2、5 回合的
// `weaponLootTable` 從 arena-rules.json 刪掉。刪掉的話 owner 改主意就得改內容 +
// 重新部署，而且「為什麼那兩回合沒有寶具」會變成一段沒有人記得的歷史。留著排程、
// 由這兩支謂詞在發卡當下裁決，`draftConflict` 一格就切得回來。
//
// ⛔ 也**不為第 2、5 回合寫 if**：這兩支只讀「這一回合排了什麼」，
// 所以任何一個新的雙排回合（後台排的、overflow 排的）自動受同一條規則管。

/**
 * `alternate` 的裁決：**這是第幾個排了寶具的回合**（1-based）。
 *
 * ⛔ 刻意不是「回合編號的奇偶」—— 那會隨排程漂移：operator 把寶具從第 5 回合搬到
 * 第 6 回合，奇偶就翻面，而畫面上完全看不出來為什麼這一場沒有寶具。
 * 數的是**序位**，所以「第一次讓給聖杯、第二次讓給寶具」在任何排程下都成立。
 *
 * round 讀不到（舊錄影的表頭沒有這一格）時回 0 ⇒ 下面兩支都放行 ⇒ 兩張都發，
 * 那**正是**當時真的發生的事。
 */
function weaponRoundOrdinal(rules: ArenaRules, round: number | undefined): number {
  if (round === undefined) return 0;
  let n = 0;
  // ⚠️ Map 迭代排序過再數：這一支住在 game-server 不是 sim，但同一份錄影要在
  // 任何機器上還原成同一個答案，所以順序不可以靠插入序。
  for (const r of [...rules.rounds.keys()].sort((a, b) => a - b)) {
    if (r > round) break;
    if (rules.rounds.get(r)?.weaponLootTable) n++;
  }
  return n;
}

/**
 * ⭐ **`round-roll`：這一回合的三選一是哪一種**（GH#357，出貨預設）。
 *
 * owner 2026-08-18：「每回合只給一種（固有能力／寶具）—— 回合表決定機率」。
 *
 * ⚠️ **一回合只擲一次**，所以全場拿到同一種 —— 「只給一種」講的是回合，
 * ⛔ 不是每個人各擲各的（那會變成「有人抽寶具有人抽固有」，而那不是一種）。
 *
 * ⭐ **⛔ 不會發生「一張都沒有」**：擲中的那一種如果這一回合根本沒排，就直接
 * 讓給另一種。owner 的「每回合結束到商店**必定**可以跳出隨機三選一」是硬要求，
 * 而 `alternate` 的毛病正是它會**靜靜地讓一張消失**（第 10 回合就是這樣把根源
 * 讓掉的）。
 *
 * `pct` 省略時由排程推導：兩種都排了 = 50、只排了一種 = 那一種 100%。
 *
 * @returns true = 這一回合發寶具，false = 發聖杯願望
 */
export function rollWeaponRound(rules: ArenaRules, grant: RoundGrant, roll: number): boolean {
  const hasWeapon = grant.weaponLootTable !== undefined;
  const hasGrail = grant.augmentTier !== undefined;
  if (!hasWeapon) return false;
  if (!hasGrail) return true;
  const pct = grant.weaponDraftPct ?? 50;
  return roll * 100 < pct;
}

/** 這一回合發不發**聖杯願望**三選一（`augmentTier` 已經確定有排的前提下）。 */
export function grailDraftAllowed(
  rules: ArenaRules,
  grant: RoundGrant,
  round?: number,
  roll?: number,
): boolean {
  // ⭐ owner 2026-08-18：這一回合排了「兩張都發」⇒ 兩支謂詞都放行，⛔ 沒有裁決。
  if (grant.draftBoth === true) return true;
  if (rules.draftConflict === "round-roll") {
    // ⚠️ 沒有骰子（舊錄影的表頭、單元測試的直接呼叫）⇒ 退回「兩張都發」，
    // 也就是這條路出現之前真的會發生的事。⛔ 不是靜靜地不發。
    return roll === undefined ? true : !rollWeaponRound(rules, grant, roll);
  }
  if (!grant.weaponLootTable) return true; // 沒撞卡
  if (rules.draftConflict === "weapon-wins") return false;
  if (rules.draftConflict === "alternate") {
    const n = weaponRoundOrdinal(rules, round);
    return n === 0 || n % 2 === 1; // 第 1、3、5… 次撞卡：聖杯贏
  }
  return true;
}

/** 這一回合發不發**寶具**三選一（`weaponLootTable` 已經確定有排的前提下）。 */
export function weaponDraftAllowed(
  rules: ArenaRules,
  grant: RoundGrant,
  round?: number,
  roll?: number,
): boolean {
  if (grant.draftBoth === true) return true; // 同上
  if (rules.draftConflict === "round-roll") {
    return roll === undefined ? true : rollWeaponRound(rules, grant, roll);
  }
  if (!grant.augmentTier) return true; // 沒撞卡
  if (rules.draftConflict === "grail-wins") return false;
  if (rules.draftConflict === "alternate") {
    const n = weaponRoundOrdinal(rules, round);
    return n === 0 || n % 2 === 0; // 第 2、4、6… 次撞卡：寶具贏
  }
  return true;
}

/**
 * Resolve the active rules from the content registry (populated at boot by the
 * ContentLoader). Absent doc (unit tests / skeleton fallback) -> legacy rules.
 */
export function resolveArenaRules(): ArenaRules {
  const doc = Configs.tryGet("arena-rules") as unknown as ConfigArenaRulesDoc | undefined;
  if (!doc || doc.schema !== "config.arena-rules@1") return DEFAULT_ARENA_RULES;
  return rulesFromDoc(doc);
}
