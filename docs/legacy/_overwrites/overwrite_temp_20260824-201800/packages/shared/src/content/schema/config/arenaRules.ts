import { z } from "zod";
import { zCoreAbilitySlot, zId } from "../common";
import { zAugmentTier } from "../augment";
import { zMobWavesConfig } from "./arenaRules.mobWaves";

/** `Configs` 登錄表裡這份文件的 id。⛔ 不要在呼叫端手打字串。 */
export const ARENA_RULES_DOC_ID = "arena-rules";

/**
 * ⭐ **視野規則**（`vision` 區塊，owner 2026-08-23「理論上這個地圖是全視野，
 * 就算牆後也看得到」）。兩格各是一個決策點，出貨值＝ owner 說的那一邊。
 * 完整推理（那個不對稱是怎麼量出來的、為什麼隱形不在這裡）見
 * `packages/shared/src/sim/vision.ts` 的檔頭。
 *
 * ⚠️ 每一格都 `.optional()`：線上的耐久覆蓋層可能已經存過一份**有 `vision`
 * 但少一個 key** 的文件。缺席時 `visionRulesFromDoc` 回**出貨值**，
 * ⛔ 不是關掉。
 */
export const zVisionRules = z
  .object({
    fullVision: z
      .boolean()
      .optional()
      .describe(
        "⭐ **全視野：牆後的敵人也畫出來**（出貨開著）。" +
          "owner 2026-08-23：「理論上這個地圖是全視野，就算牆後也看得到，不然現在很奇怪，" +
          "看到 bot 瘋狂隔牆打空氣敵人，但我卻看不到也打不到」。" +
          "關掉 = 回到 GH#324 的視野遮蔽：站在牆後的**敵人**不畫（隊友與自己永遠畫）。" +
          "⛔ 它一格都不影響**隱形** —— 隱形是技能機制，住在「隱形規則」那一頁。",
      ),
    wallBlocksBasicAttack: z
      .boolean()
      .optional()
      .describe(
        "牆擋不擋**普攻**（出貨關著 ＝ 不擋）。打開 = 回到 GH#324「走出視線 ＝ 走出射程」" +
          "（owner 2026-08-14：「擋普攻 不然會風箏到死 但不擋技能」）—— " +
          "那條規則是**從視野模型推導**出來的，全視野打開之後它就不再自洽，所以出貨關著。" +
          "⛔ 兩種值都不影響**技能**：技能從 GH#324 起就穿牆，那是裁決不是遺漏。" +
          "⚠️ 打開它會讓貼牆風箏重新變成一種打法。",
      ),
  })
  .strict();
export type VisionRulesConfig = z.infer<typeof zVisionRules>;

/**
 * config.arena-rules@1 — LoL-Arena style ROUND RULES (`config/arena-rules.json`).
 * Per-round grants (levels/gold), auto-learned abilities, augment-offer tiers,
 * free 3-choose-1 item ("legendary weapon") offers rolled from a loot table,
 * and the round from which R ignores the 6/11/16 level gate. Consumed by the
 * game-server MatchController; when the doc is absent the controller keeps the
 * legacy skeleton behavior exactly (Q-only start, level gates, gacha round 2+).
 */
export const zArenaRoundGrant = z
  .object({
    /** champion levels granted at intermission entry (each = +1 ability point) */
    grantLevels: z.number().int().min(0).optional(),
    /** flat gold granted at intermission entry */
    grantGold: z.number().int().min(0).optional(),
    /** slots auto-learned to rank 1 (points permitting) after level grants */
    autoLearn: z.array(zCoreAbilitySlot).optional(),
    /** augment offer tier this round (3-choose-1 via the draft system) */
    augmentTier: zAugmentTier.optional(),
    /** free 3-choose-1 item offer rolled from this loot table id */
    weaponLootTable: z.string().min(1).optional(),
    /**
     * ⭐ **這一回合的三選一是「寶具」的機率**（0–100，`draftConflict: "round-roll"`
     * 才讀它）。owner 2026-08-18：「每回合只給一種（固有能力／寶具），回合表決定機率」。
     *
     * ⚠️ 這一回合只擲**一次**，全場所有人拿到同一種 —— 「只給一種」講的是回合，
     * ⛔ 不是每個人各擲各的。
     *
     * 省略時由排程推導：兩種都排了 = 50、只排了一種 = 那一種 100%。
     * ⭐ 所以**一張卡都不會消失**：擲中的那一種沒有池時會讓給另一種，
     * ⛔ 不是靜靜地不發（那正是 `alternate` 的毛病）。
     */
    weaponDraftPct: z.number().min(0).max(100).optional(),
    /**
     * ⭐ **這一回合兩張都發**（owner 2026-08-18：「第十回合成為特殊設定，
     * 寶具跟固有能力**同時發放**，但有遇到這種情形的商店時間要延長 10 秒鐘」）。
     *
     * ⚠️ 它**推翻** `weaponDraftPct` 那一擲 —— 兩張都發就沒有「是哪一種」可以問。
     *
     * ⭐ 為什麼這不是在走回 #340 的老路：owner 當初要「不要同時出現」的理由是
     * **「選擇時間不夠」**，⛔ 不是「兩張同時很糟」。所以正解是把時間補回去
     * （`bothDraftsExtraSec`），⛔ 不是丟掉一張 —— 而丟掉那一張正是第 10 回合
     * 的根源一次都發不出來的原因。
     */
    draftBoth: z.boolean().optional(),
  })
  .strict();

/**
 * Healing-flower rules (LoL-Arena style): during Combat, neutral attackable
 * flowers spawn periodically in each duel zone; killing one bursts HP/MP to
 * the killer + nearby allies. Percentages are fractions of each RECIPIENT's
 * own maxHealth/maxMana. Optional + additive: absent block = no flowers
 * (legacy behavior).
 */
export const zFlowerConfig = z
  .object({
    /** seconds after combat start until the first flower spawns (per zone) */
    firstSpawnSec: z.number().positive(),
    /** seconds after a flower's DEATH until the zone's next flower spawns */
    respawnSec: z.number().positive(),
    /** max concurrently-alive flowers per zone */
    maxAlivePerZone: z.number().int().min(1),
    /** flower hit points (no regen) */
    hp: z.number().positive(),
    /** fraction of each recipient's OWN maxHealth restored on burst (0..1) */
    healPctMax: z.number().min(0).max(1),
    /** fraction of each recipient's OWN maxMana restored on burst (0..1) */
    manaPctMax: z.number().min(0).max(1),
    /** burst radius (GGD units) around the FLOWER for allied recipients */
    burstRadius: z.number().positive(),
  })
  .strict();

export type FlowerConfig = z.infer<typeof zFlowerConfig>;

/** Contract defaults for the flowers block (used by dev cheats / fallbacks). */
export const DEFAULT_FLOWER_CONFIG: FlowerConfig = {
  firstSpawnSec: 15,
  respawnSec: 25,
  maxAlivePerZone: 1,
  hp: 60,
  healPctMax: 0.18,
  manaPctMax: 0.18,
  burstRadius: 6,
};

/**
 * Revive circles (task #84 復活小火圈): a champion who dies in combat drops a
 * team-tinted ring on the corpse; a LIVING TEAMMATE who stands in it and
 * channels brings them back — once per team per round. Optional + additive:
 * an absent block means the mechanic is simply OFF (same legacy-compat
 * convention as `flowers`). Every judgement call in the design is one of these
 * keys, so a playtest disagreement is a JSON edit, not a rebuild.
 */
export const zReviveCircleConfig = z
  .object({
    /**
     * seconds a teammate must ACCUMULATE standing in the ring before the revive
     * fires (must exceed the kill cadence). Shipped at 5.0 — the task #206
     * threshold, mirrored by REVIVE_CHANNEL_SEC in sim/revive.ts.
     */
    channelSec: z.number().positive(),
    // NOTE: there is deliberately no `lifetimeSec`. The ring burns until the
    // round ends (task #196, matching LoL Arena's untimed downed zone), so the
    // knob was removed rather than pinned to 0 — a dead knob invites someone
    // to "restore" the bug. `.strict()` below makes a stale doc that still
    // carries the key fail loudly instead of silently doing nothing.
    /** ring radius (GGD units) — the channel/contest area */
    radius: z.number().positive(),
    /** progress drained per tick when the ring is empty (1 = same rate as filling) */
    decayMult: z.number().min(0),
    /** completed revives a team may perform per ROUND (the round-termination knob) */
    revivesPerTeamPerRound: z.number().int().min(0),
    /** fraction of the revived champion's OWN maxHealth restored (0..1) */
    reviveHpPctMax: z.number().min(0).max(1),
    /** fraction of the revived champion's OWN maxMana restored (0..1) */
    reviveManaPctMax: z.number().min(0).max(1),
    /** an enemy inside the ring HOLDS progress. ⚠️ 出貨值是 **false**（owner
     *  2026-08-14：LoL 競技場的玩法是敵人不影響復活圈）—— true 會讓復活圈實質上
     *  永遠用不出來，因為屍體就在剛才打架的地方。 */
    contestPauses: z.boolean(),
    /** taking damage cancels the channel (false by design — see the todo doc) */
    damageInterrupts: z.boolean(),
    /** stun/root/knockdown cancels the channel */
    ccInterrupts: z.boolean(),
  })
  .strict();

export type ReviveCircleConfig = z.infer<typeof zReviveCircleConfig>;

/** Contract defaults for the reviveCircles block (dev cheats / fallbacks). */
export const DEFAULT_REVIVE_CIRCLE_CONFIG: ReviveCircleConfig = {
  channelSec: 5, // task #206: 5s accumulate threshold (REVIVE_CHANNEL_SEC)
  // ⭐ owner 2026-08-24 逐字:「隊友死亡的復活火圈 **可以再大一倍**」⇒ 2 → 4。
  radius: 4,
  decayMult: 2,
  revivesPerTeamPerRound: 1,
  reviveHpPctMax: 0.5,
  reviveManaPctMax: 0.5,
  // owner 2026-08-14：「**LoL 競技場的玩法是敵人不影響復活圈**」。
  // ⚠️ 這不是修一個缺陷 —— 機制本來就在動（實測敵人進到圈心 2.0 格內進度確實
  // 停住、2.1 格外繼續）。這是一個**設計裁決**：一隊一回合只有一次復活、要詠唱
  // 5 秒，而屍體就躺在剛才打架的地方 ⇒ 敵人幾乎必然在 2 格內
  // ⇒ contest 開著等於「復活圈實質上永遠用不出來」。
  // ⛔ 程式碼刻意留著：這是決策點不是 bug，owner 改主意就是後台一個勾（第一守則）。
  contestPauses: false,
  damageInterrupts: false,
  ccInterrupts: true,
};

/**
 * Neutral duel-zone GUARDIAN (守護塔 / 守護石碑, task #89). During Combat one
 * neutral attackable guardian stands at each ACTIVE duel zone's centre; anyone
 * may attack it, the LAST-HIT killer is paid (full HP+MP, gold, 鎮守之力), and
 * while awake it fires a telegraphed AoE volley at its top damagers. Optional +
 * additive: an absent block means the mechanic is simply OFF (same legacy-compat
 * convention as `flowers` / `reviveCircles`). Seconds in the doc, ticks in the
 * sim (converted once by `guardianRulesFromConfig`). See docs/guardian-tower.md
 * §5 for the derivation of every number.
 *
 * SEAM: `armor` / `magicResist` (structure mitigation) and `maxHitPctMaxHp`
 * (the per-packet clamp) are consumed by `combat/damage.ts` — owned by the
 * parallel combat wave — and are carried here + on StructureComp so that file
 * needs no further schema change. Until it wires them, a guardian takes
 * unmitigated damage exactly like the flower.
 */
export const zGuardianTowerConfig = z
  .object({
    /** base HP at round 1 */
    hpBase: z.number().positive(),
    /** HP scales by (1 + hpGrowthPerRound*(round-1)) */
    hpGrowthPerRound: z.number().min(0),
    /** structure armour (SEAM: read by combat/damage.ts) */
    armor: z.number().min(0),
    /** structure magic resist (SEAM: read by combat/damage.ts) */
    magicResist: z.number().min(0),
    /** body / collision radius (GGD units) */
    radius: z.number().positive(),
    /** hard cap on a single packet, as a fraction of maxHp (SEAM: combat/damage.ts) */
    maxHitPctMaxHp: z.number().min(0).max(1),

    /** seconds between volleys while awake */
    volleyPeriodSec: z.number().positive(),
    /** telegraph wind-up before a volley lands */
    volleyWindupSec: z.number().positive(),
    /** number of top-damagers marked per volley */
    volleyMarks: z.number().int().min(1),
    /** AoE radius around each stamped mark */
    volleyRadius: z.number().positive(),
    /** base per-mark damage at round 1 */
    volleyDamageBase: z.number().positive(),
    /** volley damage scales by (1 + growth*(round-1)) */
    volleyDamageGrowthPerRound: z.number().min(0),
    /** anti-stall ramp: volley n deals base × min(rampMax, 1 + rampPct*(n-1)) */
    volleyRampPct: z.number().min(0),
    volleyRampMax: z.number().min(1),
    /** seconds untouched before the guardian sleeps (threat + ramp reset) */
    dormancySec: z.number().positive(),

    /** gold paid to the last-hit killer */
    rewardGold: z.number().int().min(0),
    /** fraction of the killer's OWN maxHealth restored (0..1) — 滿血 = 1 */
    restoreHpPct: z.number().min(0).max(1),
    /** fraction of the killer's OWN maxMana restored (0..1) — 滿魔 = 1 */
    restoreManaPct: z.number().min(0).max(1),
    /** seconds the 鎮守之力 inherited-volley buff lasts */
    buffDurationSec: z.number().positive(),
    /** 鎮守之力 pulse damage as a fraction of the guardian's volley damage */
    heirPulsePct: z.number().min(0),
    /** 鎮守之力 pulse radius around the bearer */
    heirPulseRadius: z.number().positive(),
  })
  .strict();

export type GuardianTowerConfig = z.infer<typeof zGuardianTowerConfig>;

/** Contract defaults for the guardianTower block (dev cheats / fallbacks). */
export const DEFAULT_GUARDIAN_TOWER_CONFIG: GuardianTowerConfig = {
  hpBase: 1450,
  hpGrowthPerRound: 0.28,
  armor: 0,
  magicResist: 17.65,
  radius: 2.5,
  maxHitPctMaxHp: 0.15,
  volleyPeriodSec: 4.0,
  volleyWindupSec: 0.8,
  volleyMarks: 3,
  volleyRadius: 3.0,
  volleyDamageBase: 108,
  volleyDamageGrowthPerRound: 0.14,
  volleyRampPct: 0.15,
  volleyRampMax: 2.0,
  dormancySec: 6.0,
  rewardGold: 150,
  restoreHpPct: 1.0,
  restoreManaPct: 1.0,
  buffDurationSec: 25,
  heirPulsePct: 0.25,
  heirPulseRadius: 2.5,
};

/**
 * 陣亡投幣 (task #191) — a DEAD player may throw their unspent gold onto the
 * arena floor 100 at a time, and any passing champion picks it up. Optional +
 * additive: an absent block means the mechanic is simply OFF (same legacy-compat
 * convention as `flowers` / `reviveCircles` / `guardianTower`), which is what
 * every unit test and the client's prediction shadow world see.
 *
 * No seconds anywhere, so unlike the other three blocks there is no ticks
 * conversion — `coinRulesFromConfig` copies it straight through.
 */
export const zGoldDropConfig = z
  .object({
    /** gold per coin — deducted from the thrower, banked whole by the finder */
    coinValue: z.number().int().positive(),
    /** hard cap on throws per player per ROUND (the owner's 「最多 10 枚」) */
    coinsPerRound: z.number().int().min(1).max(255),
    /** radius of the 10-slot ring the coins land on, around the corpse */
    dropRadius: z.number().positive(),
    /** a living champion this close to a coin collects it */
    pickupRadius: z.number().positive(),
    /** the coin's own body radius (it collides with nothing; drives the model) */
    coinRadius: z.number().positive(),
  })
  .strict();

export type GoldDropConfig = z.infer<typeof zGoldDropConfig>;

/**
 * 傳說武器三選一的補抽規則 (GH#249) — what a weapon card does when its ELIGIBLE
 * POOL is genuinely smaller than `offerCount`.
 *
 * owner 2026-08-01:「傳說武器有時候只有跳出一個而不是三選一」. The reported bug
 * was NOT this block: `MatchController` rolled three and then dropped the ones
 * the operator whitelist did not enable, so a 49-entry pool with a stale
 * whitelist produced 1-card and 2-card draws at random. That is fixed by ORDER
 * (`sim/economy/draft.eligibleItemPool` now filters before the roll) and is not
 * switchable — a card silently losing entries is never a preference.
 *
 * What IS a preference is the leftover case: every gate has run and there really
 * are fewer than `offerCount` legal weapons left. Three answers, and the shipped
 * one is the conservative `short`; see `DEFAULT_ITEM_DRAFT_POLICY` in
 * `sim/economy/draft.ts` for why the other two each hand the player something
 * the content never promised.
 *
 * Optional: an absent block means the shipped policy, so every pre-GH#249 doc
 * (and `DEFAULT_ARENA_RULES`) keeps behaving exactly as it did.
 */
/**
 * ⭐ **聖杯顯現的四個旋鈕**（第一守則：決策點要可調）。
 *
 * 型別與出貨值住在 `sim/economy/grailVocabulary.ts` 的 {@link DEFAULT_GRAIL_DRAFT}
 * —— 這裡只寫上下界與中文說明。⛔ 不要在這裡再抄一份預設值：那會變成第四個
 * 住處，而三個住處之間已經有 drift 測試在守。
 */
export const zGrailDraftConfig = z
  .object({
    eligibilityEnabled: z
      .boolean()
      .describe(
        "靈基適性條件（§15 禁止死願望）。開 = 一張願望的觸發機制你身上沒有就不發給你" +
          "（例:全 repo 只有 1 支技能產得出反彈,所以「反彈成功時⋯」對其他人是按不到的卡）。" +
          "關 = 每張願望都可能發給任何人。",
      ),
    slotDiversityEnabled: z
      .boolean()
      .describe(
        "三張要不要湊不同的顯現位置（§16）。開 = 優先湊齊 連動／泛用／轉向 三種," +
          "湊不到才照權重補。關 = 純照權重抽,可能三張都是同一種。",
      ),
    preferenceBonus: z
      .number()
      .min(1)
      .max(10)
      .describe(
        "「與你現有 build 連動」的願望權重乘幾倍（1 = 這一格等於關掉）。" +
          "只乘一次,命中兩個不會乘兩次。",
      ),
    legacyPool: z
      .enum(["exclude", "include"])
      .describe(
        "舊的 31 張增益卡進不進卡池。exclude（出貨）= 只發聖杯願望——設計規則 §8" +
          "「禁止純屬性增益」而舊池 31 張裡 16 張是純屬性。include = 兩批一起發。" +
          "⛔ 舊的 JSON 一份都沒有刪,切回來就整批回來。",
      ),
  })
  .strict();

export const zItemDraftConfig = z
  .object({
    /**
     * 候選不足時怎麼辦。`short` = 就發幾張（出貨值，最保守）;
     * `fallback` = 從 `fallbackTable` 借; `duplicate` = 重複已抽到的補滿。
     */
    shortPoolMode: z.enum(["short", "fallback", "duplicate"]),
    /**
     * `fallback` 模式要借哪一張 loot table。空字串 = 沒有備援（於是等同 short）。
     * 64 chars is well past every shipped table id (`legendary-weapons` = 17);
     * the ceiling exists so a pasted paragraph cannot become a table id.
     */
    fallbackTable: z.string().max(64),
    /**
     * 一張卡最多抽幾次。Every draw removes an entry from its working pool, so
     * termination never depends on this — it bounds a mis-typed `offerCount`
     * and any future with-replacement mode. Floor 1 (a card must be allowed at
     * least one draw); ceiling 512, which catches 64 mis-typed as 640 while
     * still sitting an order of magnitude above the 49-entry shipped pool.
     */
    maxDraws: z.number().int().min(1).max(512),
    /**
     * 哪些 `craftRole` **不可以**被三選一發出去（owner 2026-08-04
     * 「49支可被隨機三選一 就好」）。
     *
     * 出貨值 `["token","service"]` —— 完整理由與它取代了什麼寫在
     * `sim/economy/offerEligibility.ts` 的 `DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES`。
     * 一句話版：2026-08-04 之前 `component` 也在名單裡，而那道閘**只掛在
     * 傳說寶玉上**，免費武器卡沒有 —— 同一支合成原料免費卡發得出來、寶玉抽不到。
     * 現在兩條門讀同一份清單，而 `component` 被拿掉了（GGD 沒有合成系統，
     * 那個標記描述的是一個不存在的系統裡的角色）。
     *
     * ⚠️ **要把 `component` 關回去，在這裡加一個字串就好** —— 不用改程式、
     * 不用重建映像（`content/` 是 live bind-mount）。
     *
     * 省略 = 出貨值。上界 8 個成員 / 每個 32 字元：`craftRole` 今天只有四個值
     * (`final`/`component`/`quest`/`token`)＋`service`，8 是留給未來的餘裕，
     * 而不是一個可以貼進一整段文字的欄位（#277 的教訓：**欄位要有上界**）。
     */
    excludedCraftRoles: z.array(z.string().min(1).max(32)).max(8).optional(),
  })
  .strict();

export type ItemDraftConfig = z.infer<typeof zItemDraftConfig>;

/**
 * ⛔ `zNightPactConfig` / `DEFAULT_NIGHT_PACT_CONFIG` 在 2026-08-19 被**刪掉**了，
 * 而那不是清理 —— 是 CLAUDE.md 第〇·五守則的一次落地。
 *
 * 那個區塊把**一支技能的**半徑／上限／受益者／疊加規則／加成內容寫在
 * **競技場規則**裡，而且第一格是 `abilityIds: ["godie-u00k.passive"]` ——
 * 引擎被一支技能的 id 綁死。於是 71-00 暗夜契約的 `passive.ranks[0]` 是**空的**，
 * castability 普查每一次跑都量出一格 ❌（而那個 ❌ 說的是實話）。
 *
 * ⇒ 現在它是**一格 JSON**：`ability@1.passive.ranks[].deathWard`
 *（`content/schema/effect.ts` 的 `zDeathWardGrant`，第九個「騎在來源上的授予」），
 * 機制在 `packages/shared/src/sim/deathWard.ts`。
 * ⚠️ 那半句「敵方在附近施法有 12% 機率魔力全失」現在**完全沒有引擎程式**：
 * 它是 `auras[] → hooks[on:"onAbilityCast"] → spendMana`，一份既有機制的組合。
 */

/** Contract defaults for the goldDrop block (dev cheats / fallbacks). */
export const DEFAULT_GOLD_DROP_CONFIG: GoldDropConfig = {
  coinValue: 100,
  coinsPerRound: 10,
  dropRadius: 1.9,
  pickupRadius: 1.6,
  coinRadius: 0.31,
};

/**
 * 聖杯願望 × 寶具**撞在同一回合**時的裁決（owner 2026-08-17）。
 *
 * ⛔ 三個值刻意不是布林：`both` 是「回到舊行為」的那條路，而「只發一張」有
 * **兩種**只發法。一格布林逼人在「關掉衝突處理」與「聖杯贏」之間二選一，
 * 而 owner 想換成寶具贏的那一天就得改程式（第一守則）。
 */
export const zDraftConflict = z.enum([
  "round-roll",
  "grail-wins",
  "weapon-wins",
  "both",
  "alternate",
]);
export type DraftConflict = z.infer<typeof zDraftConflict>;

/**
 * 出貨預設：**輪流**（`alternate`）。
 *
 * ⭐ 2026-08-17 傍晚由 `grail-wins` 改成這個，理由是 GH#347 量到的後果：
 * 出貨排程**每一回合都有 `augmentTier`**，而第 2、5 回合是全表僅有的兩個
 * `weaponLootTable` ⇒ `grail-wins` 之下，**一場比賽下來一張免費傳說武器都不會發**。
 * owner 問「如果永遠不會出現，你建議怎麼改比較能避免呢?」——
 *
 * `alternate` 的規則只有一句：**撞卡的回合輪流讓路，第一次聖杯贏、第二次寶具贏**。
 * 判準是「這是第幾個排了寶具的回合」（⛔ 不是回合編號的奇偶，那會隨排程漂移）。
 * 出貨排程下就是：第 2 回合發聖杯、第 5 回合發寶具 ⇒ **一場保證有一次**免費寶具，
 * 而 owner 原本要的「兩張不同時出現」一秒都沒有被破壞。
 *
 * ⚠️ 它**不是**在推翻 owner 的決定（第〇·六守則第 1 層）：他要的是「不要同時出現」，
 * ⛔ 不是「寶具那條路關掉」——後者是排程的副作用，不是設計。四個值都在後台那一格，
 * 想回到嚴格的舊行為就選 `grail-wins`。
 */
export const DEFAULT_DRAFT_CONFLICT = "round-roll" as const;

/**
 * ⛔ **`alternate` 為什麼被換掉**（owner 2026-08-18「每回合只給一種」＝ GH#357）。
 *
 * `alternate` 數的是「這是第幾個排了寶具的回合」，撞卡時輪流讓路。出貨排程有三個
 * 撞卡回合（2 / 5 / 10）⇒ 序位 1、2、3 ⇒ **聖杯、寶具、聖杯**。
 *
 * 也就是說 **第 10 回合的寶具卡讓給了聖杯**，而第 10 回合是 `ex-origin`
 * （[EX∅ 根源]，窗口 10..10）**唯一**可能出現的回合 ⇒ 根源在出貨設定下
 * **一次都不會發**。⚠️ 這是根源的**第三個**「結構上不可能」——
 * 前兩個（池不存在、回合窗口與發卡回合互斥）都修掉了，這一個藏在**裁決規則**裡，
 * 而且它是「規則本身沒錯，只是排程剛好讓它落在錯的一邊」——⛔ 分開看規則或看排程
 * 都看不出來。
 *
 * ⇒ `round-roll`：**回合表自己說這一回合是哪一種**（`weaponDraftPct`），
 * 一回合只擲一次、全場同一種。撞卡這個概念因此消失 —— 沒有兩張要裁決。
 * 舊的四個值全部留著，是 owner 的一鍵回頭（第〇·六守則）。
 */

/**
 * ⭐ **寶具（傳說武器）貨架**（owner 2026-08-17：「寶具(傳說武器) 可以上架直接
 * 販售了，價格統一是**隨機抽的 6 倍**（後台可設定）」）。
 *
 * ── 兩格，各自是一個決策點（第一守則）─────────────────────────────────────
 * `open`            寶具上不上架。它**推翻**了 2026-08-01 的「只能隨機三選一」，
 *                   所以第〇·六守則：預設 `true`，開關存在是為了一鍵回頭。
 * `priceMultiplier` 統一價 = **傳說寶玉價 × 這個數**（`legendaryShelfPrice`）。
 *                   ⛔ 它不是一個金額 —— 寫成金額的話，寶玉調價之後兩者就會各自
 *                   漂走，而 owner 說的是「隨機抽的 N 倍」這個**關係**。
 *
 * ⚠️ 上界 50 不可以省（GH#277 的教訓：只檢查下界時 6 打成 60 會靜靜地過去，
 * 而 60 = 144,000 金 —— 一整場的金幣都買不起，畫面上卻只是「好貴」，看不出是
 * 設定打錯）。下界 0.1 = 240 金，仍然是一個真的價格而不是免費送。
 *
 * ⚠️ 整塊必須 `.optional()`：線上已經有 `config.arena-rules@1` 的耐久覆蓋層，
 * 那份文件沒有這一格 —— 少一個必填欄會讓整份 config 被 Zod 退回 → 內容載入
 * 全滅 → 退回 2 隻骨架英雄（2026-08-02 線上事故）。省略 = 下面的出貨預設。
 */
export const zLegendaryShelfConfig = z
  .object({
    open: z.boolean(),
    priceMultiplier: z.number().min(0.1).max(50),
    /**
     * ⭐ 賣出退款率：**取得價 × 這個數**（owner 2026-08-17「賣價一定是取得價的
     * 40%（後台可設定）」）。「取得價」＝那一格**實付**的金額，三選一／寶玉發
     * 的是 0 —— ⛔ 不是道具標價（49 把寶具的標價全部是 0）。
     *
     * ⚠️ **它管的是整間商店**，不只是寶具；住在這個區塊是因為它與寶具價格是
     * 同一則裡的同一條金流決定（買得起幾把 ↔ 賣掉退多少）。
     *
     * ⚠️ 上界 1 不可以省：> 1 = 賣得比買得多 = 買了賣、買了賣的無限金幣，
     * 而畫面上只會是「金幣一直變多」，看不出是設定打錯（同 GH#277）。
     * 下界 0 是合法的「賣出不退錢」。⭐ `.optional()` 讓線上舊 override
     * （沒有這一格）照常載入 → 拿出貨值。
     */
    sellRefundPct: z.number().min(0).max(1).optional(),
    /**
     * ⭐ **隨機限定階層**（owner 2026-08-17：「仍然可以有寶具是隨機才能取得的，
     * 我預計是新增的 50~70 個⋯」）。⚠️ owner 2026-08-17 稍後**正式廢除**了他當時用的
     * 「EX理外」這個名字，改成 **EX ＜ [EX解放] ＜ [EX∅ 根源]** —— 理由是玩家拿到的是
     * 「既有能力被解封」，不是「一件裝備突然推翻所有規則」。
     *
     * 填的是**抽獎表 id**，不是道具 id：那一批本來就要有一張表才抽得到，所以
     * 上架 50~70 把＝新增一張表 + 這裡填一個表名，⛔ 不用改程式、也不用逐份
     * 道具 JSON 加旗標（第〇·五守則：機制在引擎、內容在 JSON）。
     * 表裡的每一件道具**永遠不上架**，只能靠三選一／寶玉抽到。
     *
     * 出貨是**空的** —— 49 把寶具照樣全部上架。上限 32 張表是防呆（一份寫壞的
     * 設定不該讓每一次購買掃幾百張表）；未登錄的表名靜靜跳過。
     */
    randomOnlyTables: z.array(zId).max(32).optional(),
  })
  .strict();
export type LegendaryShelfConfig = z.infer<typeof zLegendaryShelfConfig>;

/**
 * ⭐ **更高階寶具**（owner 2026-08-17 第三則）。
 *
 *	「改寫為 **[EX解放]** 等級寶具，比 EX 更高級一點，隨機三選一會出現，
 *	  特別是**劣勢方出現機率會明顯變高**」
 *	「接下來我還會增加一個等級 **[EX∅ 根源]** 只會出現在**第九回合後**，
 *	  特別是劣勢方抽到機率明顯變高，用來**逆轉**」
 *
 * ⛔ 引擎裡**沒有**「EX解放」「EX∅ 根源」這兩個名字（第〇·五守則）：owner 的兩句話
 * 形狀一樣，只差三個數字加一張獎池，所以這裡是**一張表**，引擎只有一條規則
 * （`sim/economy/weaponTiers.ts`）。第三、第四階都是填一列。
 *
 * ⚠️ 順序有意義：**由高到低**。引擎逐階問「開放了嗎 × 骰中了嗎 × 這張池對這位玩家
 * 有東西嗎」，第一個全中的就用它；全都沒中就走這一回合原本排的獎池。
 */
/**
 * ⭐ **一階「隨戰況升級」的規則**，寶具與聖杯願望**共用同一個形狀**。
 *
 * ⛔ 兩份 8 欄位的 schema 是兩份會分岔的 schema（第零守則⑨：N 個同型 = K 個模板）。
 * 唯一的差別是 `table` 指向什麼：寶具指一張 loot table 的 id，
 * 聖杯願望指一個 tier 名（silver/gold/prismatic）—— 所以那一格由各自 `.extend()` 補上。
 * 引擎那一支 `pickWeaponTable()` 兩者共用，⛔ 沒有第二份逐階骰的程式。
 */
const zTierRuleBase = z.object({
  id: z.string().min(1).max(32).describe("內部 id；會變成卡片的 tier（`weapon:<id>`）。"),
  label: z.string().min(1).max(24).describe("玩家看到的階級名（「EX解放」）。"),
  minRound: z
    .number()
    .int()
    .min(1)
    .max(99)
    .describe("第幾回合起才可能出現。[EX∅ 根源] 是「第九回合**結束後**」⇒ 10。"),
  maxRound: z
    .number()
    .int()
    .min(1)
    .max(99)
    .optional()
    .describe(
    "最後在第幾回合出現（含）。省略 = 沒有上界。" +
      "⭐ owner 2026-08-17：[EX∅ 根源]「只會在第九回合**結束後**，到**最終回合開始前**出現」。" +
      "⚠️ 出貨是 10..10 而最終回合就是第 10 回合 —— 這**不矛盾**：三選一發生在該回合的**商店階段**，" +
      "也就是最終大亂鬥開打**之前**。owner 2026-08-18：「最後一回合弱勢保底可以抽根源」。",
    ),
  basePct: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("**平手方**（劣勢值 D = 0）抽到這一階的百分比。0＝這一階只發給劣勢方。"),
  underdogFactor: z
    .number()
    .min(0)
    .max(20)
    .describe(
    "劣勢加權的**強度**。最終機率 = `basePct × (1 + factor × D^exponent)`，D ∈ [0,1] 是劣勢值。" +
      "owner 2026-08-17 給的兩組：[EX解放] factor 1.5（嚴重劣勢 2.5 倍）、[EX∅ 根源] factor 4。",
    ),
  underdogExponent: z
    .number()
    .min(1)
    .max(4)
    .describe(
    "劣勢加權的**曲線**。1 = 線性（[EX解放]）；2 = 平方（[EX∅ 根源]）。" +
      "⭐ owner：「使用平方是為了讓**小幅落後只得到有限補償**，真正瀕臨淘汰的隊伍才明顯提高機率」——" +
      "⛔ 這正是它不能跟 factor 合成一個數字的原因：兩者調的是不同的東西。",
    ),
  guaranteeAtD: z
    .number()
    .min(0.05)
    .max(1)
    .optional()
    .describe(
    "⭐ **劣勢保底門檻**：劣勢值 D 到這個數字以上，這一階**必得**（機率 100%）。" +
      "owner 2026-08-18：「最後一回合弱勢保底可以抽根源」。設了之後這一階改走保底曲線 " +
      "`basePct + (100−basePct) × min(1, D/門檻)^exponent`，⛔ `underdogFactor` 不再參與。" +
      "省略 = 沒有保底。出貨 [EX∅ 根源] 0.6 ⇒ 真正在挨打的隊伍第 10 回合一定拿得到根源，" +
      "領先方仍然只有 basePct。",
    ),
  limitScope: z
    .enum(["champion", "team"])
    .describe(
    "數量限制算在誰頭上。owner 2026-08-17：[EX解放]「每名英雄最多一件」⇒ champion。" +
      "⚠️ [EX∅ 根源] 原本是 team，**owner 2026-08-18 撤掉了**（「不需要每隊限一件的限制」）——" +
      "保底路徑上同隊三個座位本來就會各拿一張，team 限制只會讓其中兩個人靜默拿不到。",
    ),
  limitCount: z
    .number()
    .int()
    .min(1)
    .max(6)
    .describe("同一個 scope 最多持有幾件這一階。達到之後這一階對他就不再出現。"),
});

/** 寶具階：`table` 是一張 loot table 的 id。 */
export const zWeaponTier = zTierRuleBase
  .extend({ table: zId.describe("這一階的獎池（content/loot-tables/<id>.json）。") })
  .strict();
export type WeaponTierConfig = z.infer<typeof zWeaponTier>;

/**
 * ⭐ **聖杯願望階**（GH#357「階級由劣勢決定」）：`table` 是一個 tier 名。
 *
 * 在這之前 `rounds[N].augmentTier` 是**寫死的一個字**，所以「隨著戰況可以隨機到的
 * 等級不一樣」這句話只對寶具成立，對固有能力完全不成立 —— 而 owner 那一句話
 * 講的是**兩種卡**。這張表把同一個機制接到聖杯那一半。
 */
export const zAugmentTierRule = zTierRuleBase
  .extend({ table: zAugmentTier.describe("這一階要發的聖杯願望等級。") })
  .strict();
export type AugmentTierRuleConfig = z.infer<typeof zAugmentTierRule>;

/**
 * 劣勢值 `D` 的三個權重（owner 2026-08-17 逐字給的公式）。
 *
 *	D = 50% × 回合／隊伍生命差距
 *	  + 30% × 已完成裝備價值差距
 *	  + 20% × 最近三回合勝負差距
 *
 * ⭐ 為什麼不能只看「目前生命值」——owner 自己講了：「否則容易被**刻意壓血**利用」。
 * 三項一起看才擋得住。⚠️ 三項各自已經正規化到 [0,1] 再加權，所以 D 也在 [0,1]。
 */
export const zDisadvantageWeights = z
  .object({
    roundGapPct: z.number().int().min(0).max(100).describe("回合勝場差距佔多少（出貨 50）。"),
    itemValueGapPct: z.number().int().min(0).max(100).describe("已完成裝備價值差距佔多少（出貨 30）。"),
    recentFormPct: z.number().int().min(0).max(100).describe("最近三回合勝負差距佔多少（出貨 20）。"),
  })
  .strict();
export type DisadvantageWeights = z.infer<typeof zDisadvantageWeights>;

/** 出貨值 —— 逐字等於 owner 給的 50/30/20。 */
export const DEFAULT_DISADVANTAGE_WEIGHTS: DisadvantageWeights = {
  roundGapPct: 50,
  itemValueGapPct: 30,
  recentFormPct: 20,
};

/**
 * 出貨值。
 *
 * ⚠️ **EX∅ 根源那一階指向一張還不存在的獎池**（owner：「接下來我還會增加⋯50~70 個」）。
 * 這是刻意的，而且比「放一張空的 loot-table」正確：`loot-table@1` 的 `entries`
 * 下界是 1，所以空檔案根本過不了 `pnpm content:build` 的驗證（它擋下來了，2026-08-17）。
 * ⛔ 也不塞一個佔位道具 —— 那會真的被抽到。
 *
 * 引擎對「這張池抽不到東西」早就有答案：`pickWeaponTable` 的 `hasEligible` 探針
 * 探不到就往下一階讓。⇒ 今天這一階**永遠不會中**，owner 把
 * `content/loot-tables/ex-origin-weapons.json` 建出來的那一天它自己就活了，
 * ⛔ 不必改任何程式。
 */
export const DEFAULT_WEAPON_TIERS: WeaponTierConfig[] = [
  {
    id: "ex-origin",
    label: "EX∅ 根源",
    table: "ex-origin-weapons",
    // ⚠️ 最終回合是**第 10 回合**（`PairedDuels.FINAL_ROUND`，打完就全部結算）——
    // 出貨排程曾經寫到 13 回合，那三列在 2026-08-18 已經退到 `content/_legacy/`。
    minRound: 10,
    maxRound: 10,
    basePct: 8,
    underdogFactor: 4,
    underdogExponent: 2, // 平方：小輸只得到有限補償
    // ⭐ 劣勢保底（owner 2026-08-18）。D ≥ 0.6 ⇒ 必得；領先方仍然只有 basePct 8%。
    guaranteeAtD: 0.6,
    limitScope: "champion",
    limitCount: 1,
  },
  {
    id: "ex-release",
    label: "EX解放",
    table: "ex-release-weapons",
    minRound: 1,
    basePct: 15,
    underdogFactor: 1.5,
    underdogExponent: 1, // 線性
    limitScope: "champion",
    limitCount: 1,
  },
];

/**
 * ⭐ **聖杯願望的階級升級表**（GH#357）。與 {@link DEFAULT_WEAPON_TIERS} 同一個機制，
 * 只是 `table` 是 tier 名。由高到低：prismatic ＞ gold。
 *
 * ⚠️ 這張表**只往上升級**（`pickWeaponTable` 的不可降級那條）——
 * 回合表排的 tier 是**地板**，劣勢只會把你抬高，⛔ 不會把領先方壓低。
 * 領先方仍有 `basePct` 的機率摸到高階（owner 2026-08-17：「避免系統看起來像
 * 直接補償敗方」，所以 basePct ⛔ 不可以是 0）。
 */
export const DEFAULT_AUGMENT_TIERS: AugmentTierRuleConfig[] = [
  {
    id: "grail-prismatic",
    label: "稜彩",
    table: "prismatic",
    minRound: 1,
    basePct: 6,
    underdogFactor: 4,
    underdogExponent: 2,
    limitScope: "champion",
    limitCount: 6,
  },
  {
    id: "grail-gold",
    label: "黃金",
    table: "gold",
    minRound: 1,
    basePct: 12,
    underdogFactor: 3,
    underdogExponent: 1,
    limitScope: "champion",
    limitCount: 6,
  },
];

/**
 * ⭐ **賽制的最後一回合**（owner 2026-08-18：「理論上如果要改不是第十回合，
 * 就要去後台改預設值」）。
 *
 * ⚠️ `PairedDuels.FINAL_ROUND` 以前是一個常數，而它的檔頭寫著「WHY A CONSTANT AND
 * NOT A CONFIG KNOB」——那段理由現在**過期了**（第三守則）：它說「回合表寫到第 13
 * 回合加 overflow，所以上限推導不出來」，而第 11–13 回合在 2026-08-18 已經退到
 * `content/_legacy/`；它也說「只有 MatchRoom 填得了第十三個建構子參數」，而
 * `ArenaRules` 本來就整包傳進 MatchController。
 *
 * ⚠️ 它與 `maxRounds`（房間設定）是**兩件事**：這一格是賽制本身的終點，
 * `maxRounds` 只能把一場**縮短**。兩條是 OR，先到的贏。
 */
export const DEFAULT_FINAL_ROUND = 10;

/** 兩張三選一同時發的回合，中場多給幾秒（owner 2026-08-18：10 秒）。 */
export const DEFAULT_BOTH_DRAFTS_EXTRA_SEC = 10;

/**
 * ⭐ **GH#643 只剩 bot 在打時的火圈加速**（owner 2026-08-24：
 * 「如果現場只剩 bot 存活，回合時間縮減到10秒後就縮火圈 不要平白浪玩家等待」）。
 *
 * 判準是「還在打的 zone 裡活著的**人類**（`humanSeat`）＝0」；成立時把火圈點火
 * 時間夾到 min(現值, now + 這格秒數)。夾的是 `FireRingRules.startTicks` ——
 * 與殭屍王延長動的是同一個數字，所以二段制／燃燒曲線整個形狀跟著平移。
 * 消費端：`apps/game-server/src/match/MatchController.ts::accelFireRingForBotOnly`。
 *
 * ⭐ **GH#659 把出貨值從 10 改成 0**（owner 2026-08-24 逐字，這是對 #643 的更正）：
 * > 「場地只剩 bot 的話 **不管有沒有殭屍王** 火圈**都會立即出現縮圈**」
 *
 * 0 ⇒ cap ＝ `world.fireRingTicks`（現在），而 `fireRingActive` 的判準是
 * `fireRingTicks >= startTicks` ⇒ **同一個 tick 就點火**，⛔ 不再等 10 秒。
 * 「不管有沒有殭屍王」那一半本來就成立（每個 combat tick 重新夾，王把
 * `startTicks` 推遠 180 秒也會在下一個 tick 被夾回來）—— #659 要求把它
 * **驗一次**而不是相信 commit 訊息，守衛在 `botOnlyRingAccel.test.ts`。
 * ⭐ rollback ＝ 把這一格調回 10（v0.26.1 的行為），⛔ 不必改程式。
 */
export const DEFAULT_BOT_ONLY_RING_ACCEL_SEC = 0;
/**
 * GH#651 —— 一場打完之後，房間還留著幾秒讓大家看戰績。
 *
 * ⭐ owner 2026-08-24 逐字：
 * > 「與伺服器連線中斷 代碼4000 也太快出現把人踢出房間了 **至少留兩分鐘給我看戰績阿**」
 *
 * ⚠️ 這一格在此之前是 `MatchRoom.finishMatch()` 裡**寫死的 10_000**（第一守則的
 * 反例：它從第一天起就該是一格欄位）。10 秒 ⇒ 結算畫面在第 10 秒被 Colyseus
 * 的主動收房（客戶端看到的就是那個 **4000**）蓋掉。
 */
export const DEFAULT_POST_MATCH_LINGER_SEC = 120;

/**
 * GH#643 的開關。預設**啟動**（第〇·六守則：優先權大的更新預設 on）；
 * 關掉＝一鍵回到「bot 互毆也照原點火時間等」的舊行為（owner 常設：
 * 「自己判斷 但是留後台開關可以簡易 rollback」）。
 */
export const DEFAULT_BOT_ONLY_RING_ACCEL_ENABLED = true;

/**
 * ⭐ **bot 的商店行為**（owner 2026-08-18：「一樣花錢買隨機寶具，
 * 只是消耗金錢是半價」）。
 *
 * ⛔ 為什麼是欄位不是 `if (isBot)`：折扣走的是 `ChampionComp.shopPriceMult`
 * ——一個**每位英雄**的售價倍率，host 在開場照座位的 driver 填。sim 只做乘法，
 * 它從頭到尾不知道「bot」這個概念（也就不會有第二個地方需要學會它）。
 */
export interface BotShopConfig {
  /** bot 會不會拿金幣去買隨機寶具。出貨 true。 */
  buyWeapons: boolean;
  /** bot 的售價倍率。出貨 **0.5**（半價）。1 = 跟人類同價。 */
  priceMult: number;
}
export const DEFAULT_BOT_SHOP: BotShopConfig = { buyWeapons: true, priceMult: 0.5 };
export const zBotShopConfig = z
  .object({
    buyWeapons: z
      .boolean()
      .describe("bot 會不會在中場拿金幣買一件**隨機**寶具（⛔ 不是走每位英雄手寫的推薦出裝）。"),
    priceMult: z
      .number()
      .min(0)
      .max(4)
      .describe("bot 買東西的售價倍率。出貨 0.5＝半價；1＝跟人類同價；0＝免費（會讓 bot 每一場都塞滿）。"),
  })
  .strict();

/**
 * 出貨值。⚠️ 這是**第三個住處**（`content/config/arena-rules.json` ·
 * 這裡 · admin 的 `SHIPPED_LEGENDARY_SHELF`），三者由 drift 測試釘在一起。
 * 引擎那一份常數（`sim/economy/shopShelf.ts`）是 world 的預設值，兩邊必須同值 ——
 * ⛔ 這裡刻意不 import 它：`content/schema` 不可以依賴 `sim`。
 */
export const DEFAULT_LEGENDARY_SHELF: LegendaryShelfConfig = {
  open: true,
  // ⭐ 4，不是 6（owner 2026-08-17 第二則：「一場根本買不起 2 把⋯改成 4 倍
  // 比較好?」）。2400 × 4 = 9,600：第 10 回合買得起一把、第 12 回合兩把。
  priceMultiplier: 4,
  sellRefundPct: 0.4,
  // 出貨沒有任何一張隨機限定表 —— 49 把寶具照樣全部上架，這一批只做機制。
  randomOnlyTables: [],
};

export const zConfigArenaRulesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.arena-rules@1"),
    /** round from which R is learnable at any level; absent = classic 6/11/16 */
    ultUnlockRound: z.number().int().min(1).optional(),
    /**
     * Round from which champions that HAVE an `exAbility` unlock their per-hero
     * "EX 技能" (WC3 level-30 gate mapped to a late arena round). Absent = EX
     * never unlocks (skeleton/legacy behavior).
     */
    exUnlockRound: z.number().int().min(1).optional(),
    /** choices per offer (augment + weapon offers) */
    offerCount: z.number().int().min(1).max(5),
    /**
     * ⭐ **聖杯顯現規則**（聖杯願望三選一 §15 · §16）。省略 = 出貨的
     * {@link DEFAULT_GRAIL_DRAFT}。
     *
     * ⚠️ 它住在 arena-rules 而不是自成一份 config 文件，理由是 `offerCount`
     * 就在上面一行 —— 這四格講的是**同一張卡怎麼發出來**，分兩個文件只會讓
     * 「開幾張」與「發哪幾張」的規則各自漂移。
     */
    grailDraft: zGrailDraftConfig.optional(),
    /**
     * ⭐ **同一回合同時排了聖杯願望與寶具時，發哪一個**（owner 2026-08-17）。
     *
     * `zArenaRoundGrant` 的 `augmentTier`（聖杯願望）與 `weaponLootTable`（寶具）
     * 是兩格獨立的欄位，所以「同一回合兩格都填」一直是合法的 —— 而它的後果是
     * 玩家在同一個休息段被連續丟兩張三選一，回報是**選擇時間不夠**。
     *
     * ⚠️ 這是一個**決策點**不是數值（第一守則）：哪一張該讓路是設計判斷，
     * 而 owner 已經明說是聖杯 ⇒ 出貨預設 {@link DEFAULT_DRAFT_CONFLICT}。
     * 這一格同時是那個決定的**一鍵 rollback**：`both` 逐字等於 2026-08-17 之前
     * 的行為。省略 = 出貨預設（⛔ 不是 `both`）。
     *
     * ⚠️ 必須 `.optional()`：線上已有 `config.arena-rules@1` 的耐久覆蓋層，
     * 少一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 骨架英雄。
     */
    draftConflict: zDraftConflict
      .optional()
      .describe(
        "同一回合**同時**排了聖杯願望（augmentTier）與寶具（weaponLootTable）時要發哪一個。" +
          "grail-wins＝只發聖杯願望（出貨預設，owner 2026-08-17：兩者衝突不顯示寶具三選一）；" +
          "weapon-wins＝只發寶具；" +
          "both＝兩張都發（＝2026-08-17 之前的行為，玩家反應選擇時間不夠）。",
      ),
    /**
     * 傳說武器卡候選不足時的補抽規則 (GH#249); omit = the shipped `short`
     * policy. See {@link zItemDraftConfig} — and note that the whitelist
     * shrink owner reported is fixed by ordering, NOT by this block.
     */
    itemDraft: zItemDraftConfig.optional(),
    /**
     * 已退場的抽獎池 (owner 2026-08-01「第 2、5 回合改發棱彩傳說之後，那 13 支
     * 任務小飾品沒有任何回合排它＝拿不到。排回去還是退場? **=> 退場**」).
     *
     * ── 為什麼「退場」是一個欄位，而不是刪掉那張表 ─────────────────────────
     * 刪表是最大破壞的做法：`content/loot-tables/quest-rewards.json` 同時是
     * `starter.go` 的 DRAFT 白名單面 (`starterDraftItems`)、Go 側
     * `TestStarterDraftIsQuestSet` 的兩個方向、`arenaItemModel.test.ts` 的
     * DRAFT∩LEGENDARY 對照，以及後台 三選一抽獎池 分頁的一個可編輯文件。
     * 刪掉它會讓那 13 支道具從白名單消失（＝從圖鑑與後台一起消失），而 owner
     * 的裁決只說「不要再發給玩家」，沒有說「這些道具下架」。
     *
     * 所以退場的機械意義是**它不可以被任何回合排到**，而那正是這個欄位 +
     * 下面的 superRefine 在擋的事。表還在、道具還在白名單上、後台照樣編輯得到；
     * 要復活它是一個**看得見的兩步編輯**（把 id 從這裡拿掉），不是一次靜靜地
     * 把 `weaponLootTable` 打回去。
     *
     * ⚠️ 這是**列表不是布林**，理由和「一份設定寫死一個 id」同源：寫死單一
     * 字面值 `"quest-rewards"` 的話，第二張要退場的表就得改程式。
     *
     * 上界 16：出貨樹只有 3 張 loot table，16 遠高於任何合理的退場清單，而且
     * 擋得住「把整份 items 清單貼進來」這種打錯。每一格的長度上界 64 與
     * `itemDraft.fallbackTable` 同一個數字（出貨最長的 id `legendary-weapons`
     * 是 17 個字元）。省略 = 沒有任何表退場（＝這個機制以前的行為）。
     */
    retiredLootTables: z.array(z.string().min(1).max(64)).max(16).optional(),
    /**
     * ⭐ **寶具貨架**（owner 2026-08-17）。省略 = {@link DEFAULT_LEGENDARY_SHELF}。
     * ⚠️ 它管的是**寶具**那 49 把；#261 下架的 70 把普通武器是另一個開關
     * （`sim/economy/shopShelf.ts` 的 `WEAPON_SHELF_OPEN`），⛔ 不會被這一格打開。
     */
    legendaryShelf: zLegendaryShelfConfig
      .optional()
      .describe(
        "寶具（傳說武器）能不能在中場商店直接用金幣買。" +
          "open＝上不上架（出貨 true，owner 2026-08-17：「寶具可以上架直接販售了」）；" +
          "priceMultiplier＝統一價的倍率，實際售價 = 傳說寶玉價 × 這個數（出貨 6 ＝ 14,400 金）。" +
          "⛔ 它不會打開 #261 暫時下架的那些普通武器道具。",
      ),
    /**
     * ⭐ **#261 下架的那 70 把普通武器能不能買**（GH#350）。
     *
     * ⚠️ 它與上面的 `legendaryShelf.open` 是**兩格**，而且刻意分開：owner
     * 2026-08-17 只說「寶具可以上架」，⛔ 沒有說要把 #261「暫時下架」的普通武器
     * 放回來。一格開了不可以順手把另一格也開掉。
     *
     * ⛔ 它**不管**三選一與傳說寶玉那條路 —— 那兩條從 #261 當天起就沒有被關過
     * （`shopShelf.ts` 的 SHELF / DROP 兩道門）。這一格只關「商店列不列、買不買
     * 得到」。
     *
     * 省略 = `sim/economy/shopShelf.ts` 的 `WEAPON_SHELF_OPEN`（出貨 false ＝
     * 今天的行為）。⚠️ 必須 `.optional()`：線上已經有 `config.arena-rules@1` 的
     * 耐久覆蓋層，多一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 →
     * 骨架英雄（2026-08-02 事故的形狀）。
     */
    weaponShelfOpen: z
      .boolean()
      .optional()
      .describe(
        "#261 暫時下架的 70 把普通武器道具，能不能在中場商店直接用金幣買。" +
          "出貨 false ＝ 商店只剩「能力屬性強化」與「傳說寶玉」兩項服務。" +
          "⛔ 它不影響三選一卡與傳說寶玉抽獎（那兩條路從來沒被關過），也⛔ 不管寶具" +
          "（寶具走 `legendaryShelf.open`）。",
      ),
    /**
     * ⭐ **視野規則**（owner 2026-08-23）。省略 = `sim/vision.ts` 的
     * `DEFAULT_VISION_RULES`（＝全視野開著、牆不擋普攻）。
     * 規則本體、為什麼兩格分開、以及那個不對稱是怎麼量出來的，全部在
     * `packages/shared/src/sim/vision.ts` 的檔頭。
     *
     * ⚠️ 必須 `.optional()`：線上已經有 `config.arena-rules@1` 的耐久覆蓋層，
     * 多一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 骨架英雄
     * （2026-08-02 事故的形狀）。
     */
    vision: zVisionRules.optional(),
    /**
     * ⭐ **更高階寶具**（EX解放 / EX∅ 根源）。省略 = {@link DEFAULT_WEAPON_TIERS}。
     * ⚠️ 由**高到低**排；引擎照這個順序逐階骰。
     */
    weaponTiers: z
      .array(zWeaponTier)
      .max(8)
      .optional()
      .describe(
        "排了寶具三選一的回合，可以改抽**更高階**的獎池。由高到低逐階骰，第一個中的就用它；" +
          "全沒中（或該池對這位玩家沒有合格的東西）就走這一回合原本排的那一張。" +
          "⭐ 劣勢方的機率是另一格，owner 2026-08-17：「特別是劣勢方出現機率會明顯變高」。" +
          "⛔ 空陣列 = 完全關掉，回到只有一張基礎獎池的行為。",
      ),
    /**
     * ⭐ **聖杯願望的階級升級表**（GH#357「階級由劣勢決定」）。
     * 省略 = {@link DEFAULT_AUGMENT_TIERS}；空陣列 = 關掉（回合表排什麼就發什麼）。
     * ⚠️ 與 `weaponTiers` **同一個引擎**（`pickWeaponTable`），由高到低排。
     */
    augmentTiers: z
      .array(zAugmentTierRule)
      .max(8)
      .optional()
      .describe(
        "聖杯願望三選一的等級也隨戰況升級。回合表排的等級是**地板**，劣勢只會把你抬高，" +
          "⛔ 不會把領先方壓低。owner 2026-08-18：「隨著戰況可以隨機到的等級不一樣，" +
          "會比較偏向弱勢拿好一點等級才有機會扭轉」。空陣列 = 關掉。",
      ),
    /**
     * ⭐ **兩張都發的回合，中場多給幾秒**（owner 2026-08-18：「商店時間要延長
     * 10 秒鐘」）。省略 = {@link DEFAULT_BOTH_DRAFTS_EXTRA_SEC}。
     *
     * ⚠️ 只有真的**兩張都發出去**的那一回合才加 —— ⛔ 不是「排了 draftBoth 就加」。
     * 兩者的差別在「這一回合的其中一種其實沒有池」那個情況：那時候只發得出一張，
     * 而多給 10 秒會讓玩家對著一張卡等一段沒有理由的空白。
     */
    bothDraftsExtraSec: z
      .number()
      .min(0)
      .max(120)
      .optional()
      .describe(
        "兩張三選一同時發的回合，中場倒數多給幾秒（出貨 10）。" +
          "owner 2026-08-18：兩張同時出現的問題是「選擇時間不夠」，所以補時間、⛔ 不是丟掉一張。",
      ),
    /**
     * ⭐ **賽制的最後一回合**（owner 2026-08-18）。省略 = {@link DEFAULT_FINAL_ROUND}。
     * 打完它就全場結算；它同時決定「大亂鬥從第幾回合開始」。
     */
    finalRound: z
      .number()
      .int()
      .min(2)
      .max(99)
      .optional()
      .describe(
        "賽制的最後一回合 —— 打完就全部結算，而且這一回合是**全員同一張地圖的大亂鬥**。" +
          "⚠️ 它與房間設定的 `maxRounds` 是兩件事：那一格只能把一場**縮短**，兩條是 OR、先到的贏。" +
          "⛔ 改大之前先確認回合表排到那一回合，否則後面幾回合會落到 overflow 規則上。",
      ),
    /**
     * ⭐ **GH#643 只剩 bot 在打時，火圈點火提前到「現在＋幾秒」**。
     * 省略 = {@link DEFAULT_BOT_ONLY_RING_ACCEL_SEC}。
     *
     * ⚠️ 必須 `.optional()`：線上已經有 `config.arena-rules@1` 的耐久覆蓋層，
     * 多一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 骨架英雄
     * （2026-08-02 事故的形狀）。
     */
    /**
     * GH#651 一場打完之後房間還留著幾秒。省略 = {@link DEFAULT_POST_MATCH_LINGER_SEC}。
     * ⚠️ 必須 `.optional()`：同下，線上耐久覆蓋層相容（2026-08-02 事故的形狀）。
     */
    postMatchLingerSec: z
      .number()
      .min(0)
      .max(600)
      .optional()
      .describe(
        "一場結束之後，房間還留著幾秒讓玩家看戰績（出貨 120）。owner GH#651：" +
          "「與伺服器連線中斷 代碼4000 也太快出現把人踢出房間了 至少留兩分鐘給我看戰績阿」。" +
          "時間到才主動收房（客戶端看到的 4000 就是它）。⛔ 它不影響結算計算、" +
          "獎勵發放、平台回呼 —— 那些在這之前就跑完了，這一格只管「房間還活著多久」。" +
          "⚠️ 上界 600 秒是**成本**上界：房間活著就佔一個 shard 槽位，而一台 shard 的" +
          "房間數是有限的（`maxRooms`）—— 調到很大 = 打完的房間會把新的房間擠掉。",
      ),
    botOnlyRingAccelSec: z
      .number()
      .min(0)
      .max(120)
      .optional()
      .describe(
        "還在打的場地裡一個活著的人類都不剩（全滅、輪空、或人類的場已分出勝負）時，" +
          "火圈點火時間被夾到「現在＋這格秒數」。owner GH#659（對 #643 的更正）：" +
          "「場地只剩 bot 的話 不管有沒有殭屍王 火圈都會立即出現縮圈」 ⇒ 出貨值是零秒＝立刻點火。" +
          "調大＝bot 互毆多打幾秒才收（調成十秒就是 v0.26.1 的行為）。" +
          "⛔ 它只提前點火，不動回合硬底線，也⛔ 不會把已經更早的點火時間往後推。",
      ),
    /**
     * GH#643 的開關。省略 = {@link DEFAULT_BOT_ONLY_RING_ACCEL_ENABLED}（開）。
     * ⚠️ 必須 `.optional()`：同上，耐久覆蓋層相容。
     */
    botOnlyRingAccelEnabled: z
      .boolean()
      .optional()
      .describe(
        "「只剩 bot 在打就提前縮火圈」整個機制的開關（出貨開）。關掉＝回到舊行為：" +
          "就算場上只剩 bot 互毆，火圈也照原本的點火時間等。" +
          "⚠️ 殭屍王延長與它同場時，這格開著的話 bot-only 贏（人都不在了，" +
          "王的延長沒有觀眾）—— 關掉這格就是把裁決整個讓回給殭屍王延長。",
      ),
    /**
     * ⭐ **bot 的商店行為**（owner 2026-08-18）。省略 = {@link DEFAULT_BOT_SHOP}。
     */
    botShop: zBotShopConfig
      .optional()
      .describe(
        "bot 在中場怎麼花錢。owner 2026-08-18：「一樣花錢買隨機寶具，只是消耗金錢是半價」。" +
          "⚠️ 關掉 buyWeapons 之後 bot 整場不會花任何金幣（每位英雄手寫的推薦出裝已經退場）。",
      ),
    /**
     * 劣勢值 `D` 的三項權重（owner 2026-08-17 的 50/30/20）。
     * 省略 = {@link DEFAULT_DISADVANTAGE_WEIGHTS}。
     */
    disadvantageWeights: zDisadvantageWeights
      .optional()
      .describe(
        "「誰算劣勢方」怎麼算。三項各自正規化到 0~1 再加權：回合勝場差距／已完成裝備價值差距／" +
          "最近三回合勝負差距（出貨 50/30/20）。⭐ owner：「不能只用目前生命值判斷劣勢，" +
          "否則容易被**刻意壓血**利用」—— 壓血壓得動第一項，壓不動另外兩項。" +
          "三格都調成 0 = 完全關掉劣勢加權（每個人都拿 basePct）。",
      ),
    /** round number (string key) -> grants for that round */
    rounds: z.record(z.string().regex(/^[0-9]+$/), zArenaRoundGrant),
    /** grants applied on every round PAST the highest `rounds` key */
    overflow: z
      .object({
        grantLevels: z.number().int().min(0),
        grantGold: z.number().int().min(0),
        /** extra gold per round beyond the table (escalates the late game) */
        grantGoldPerRound: z.number().int().min(0),
        /** augment offer tier on every overflow round (keeps 隨機三選一 literal) */
        augmentTier: zAugmentTier.optional(),
      })
      .strict()
      .optional(),
    /** legacy per-round free item gacha; omit to disable under arena rules */
    gacha: z
      .object({
        fromRound: z.number().int().min(1),
        lootTable: z.string().min(1),
      })
      .strict()
      .optional(),
    /** healing-flower rules; omit = no flowers (legacy behavior) */
    flowers: zFlowerConfig.optional(),
    /** revive-circle rules; omit = no revive circles (legacy behavior) */
    reviveCircles: zReviveCircleConfig.optional(),
    /** neutral guardian-tower rules; omit = no guardian (legacy behavior) */
    guardianTower: zGuardianTowerConfig.optional(),
    /** 陣亡投幣 rules (task #191); omit = dead players cannot throw gold */
    goldDrop: zGoldDropConfig.optional(),
    /** roguelite mob-wave rules (task #215); omit = no mobs (legacy behavior) */
    mobWaves: zMobWavesConfig.optional(),
  })
  .strict();
export type ArenaRoundGrant = z.infer<typeof zArenaRoundGrant>;
export type ConfigArenaRulesDoc = z.infer<typeof zConfigArenaRulesDoc>;
