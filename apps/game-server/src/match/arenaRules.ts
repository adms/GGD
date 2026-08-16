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
import { Configs, scheduledRetiredTables } from "@ggd/shared/content";
import { MAX_ROUNDS_UNLIMITED } from "@ggd/shared/roomSettings";
import type {
  ConfigArenaRulesDoc,
  FlowerConfig,
  ReviveCircleConfig,
  GuardianTowerConfig,
  GoldDropConfig,
  NightPactConfig,
  MobWavesConfig,
} from "@ggd/shared/content";

export interface RoundGrant {
  grantLevels?: number;
  grantGold?: number;
  autoLearn?: CoreAbilitySlot[];
  augmentTier?: AugmentTier;
  weaponLootTable?: string;
}

export interface ArenaRules {
  /** round from which R is learnable at any level; null = classic 6/11/16 */
  ultUnlockRound: number | null;
  /** round from which champions with an exAbility unlock EX; null = never */
  exUnlockRound: number | null;
  /** choices per offer (augment + weapon offers) */
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
  /** 71-00 暗夜契約 (死之王). Absent = OFF, same legacy-compat shape as goldDrop. */
  nightPact: NightPactConfig | null;
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
}

/** Legacy behavior: augment tiers per AUGMENT_TIER_SCHEDULE + round-2+ gacha. */
export const DEFAULT_ARENA_RULES: ArenaRules = {
  ultUnlockRound: null,
  exUnlockRound: null,
  offerCount: 3,
  itemDraft: DEFAULT_ITEM_DRAFT_POLICY,
  grailDraft: DEFAULT_GRAIL_DRAFT,
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
  nightPact: null,
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
    });
  }
  return {
    ultUnlockRound: doc.ultUnlockRound ?? null,
    exUnlockRound: doc.exUnlockRound ?? null,
    offerCount: doc.offerCount,
    // Absent block = the shipped policy, NOT null. See the field's doc comment.
    // A RETIRED fallback pool is emptied to "" — the authored 「沒有備援」 value,
    // which `economy/draft.ts` already handles as "then just deal a short card".
    itemDraft: retiredFields.has("itemDraft.fallbackTable")
      ? { ...(doc.itemDraft ?? DEFAULT_ITEM_DRAFT_POLICY), fallbackTable: "" }
      : (doc.itemDraft ?? DEFAULT_ITEM_DRAFT_POLICY),
    grailDraft: doc.grailDraft ?? DEFAULT_GRAIL_DRAFT,
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
    nightPact: doc.nightPact ?? null,
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

/**
 * Resolve the active rules from the content registry (populated at boot by the
 * ContentLoader). Absent doc (unit tests / skeleton fallback) -> legacy rules.
 */
export function resolveArenaRules(): ArenaRules {
  const doc = Configs.tryGet("arena-rules") as unknown as ConfigArenaRulesDoc | undefined;
  if (!doc || doc.schema !== "config.arena-rules@1") return DEFAULT_ARENA_RULES;
  return rulesFromDoc(doc);
}
