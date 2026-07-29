/**
 * config@1 — system parameter documents. The canonical doc is `config.match`
 * (tick constants, match timers, economy values, progression, draft schedule).
 * Values mirror the engine defaults in constants.ts / economy/*.ts; the
 * game-server will consume this doc when it switches to the ContentLoader.
 *
 * config.store@1 — the M COIN store document (`config/store.json`): champion
 * unlock prices and per-placement match rewards. Lives in the same `config`
 * collection; the collection schema is a discriminated union on `schema`.
 */
import { z } from "zod";
import { zAlpha, zCoreAbilitySlot, zId, zRef, zTintRgb } from "./common";
import { zAugmentTier } from "./augment";
import { COMBAT_ENV_KEYS, type CombatEnvKey } from "../../sim/combatEnv";
// 基礎加成的 per-stat 區間 (task #277) — 定義在 sim 那一份,schema 只是把它搬上
// Zod,所以「頁面 / schema / sim」三層守的是同一組數字。
import { ALL_STATS, Stat } from "../../sim/stats/statTypes";
import { baseBonusBounds } from "../../sim/baseBonus";
// The eleven barcode slots, in ANATOMICAL ORDER. Imported (not restated) so the
// stored doc's keys can never drift from the model — see zConfigVoxelBarcodesDoc.
// `voxelSkin/types` is a leaf: zero imports of its own, no zod, no sim.
import { BARCODE_SLOTS } from "../voxelSkin/types";

/**
 * Fire-ring (火圈 / 火環) schedule — the round-pacing hazard (tasks #132/#195).
 * Lives inside `config.match@1`'s `match` block next to `combatMaxSec`.
 *
 * #195 turned the ring from a global burn timer into a SHRINKING ring: it
 * ignites `startSec` combat-elapsed seconds in, contracts from the zone
 * boundary to `minRadius` over `shrinkSec`, and burns only the champions
 * OUTSIDE it, at a rate ramping `burnPctPerSecStart` → `burnPctPerSecEnd` with
 * the shrink progress. `stepSec`/`pctPerStep` are gone with the staircase they
 * described — the block is `.strict()`, so an old doc fails loudly instead of
 * silently arming a ring with no shrink.
 *
 * Percentages are fractions of each victim's OWN maxHealth; the burn ignores
 * armor/MR (it is TRUE damage) and the combat-env damage knob. Optional +
 * additive: absent = no ring (legacy behavior).
 */
export const zFireRingConfig = z
  .object({
    /** combat-elapsed seconds until the ring ignites (the round-pacing knob) */
    startSec: z.number().positive(),
    /** seconds the ring takes to close from the zone boundary to `minRadius` */
    shrinkSec: z.number().positive().default(20),
    /**
     * the fully-closed radius. Deliberately BELOW a champion's collision radius
     * (0.6), so once closed the whole-body-inside test is false for everyone —
     * 「沒有生存空間」 with no second rule. 0 would collapse the visual to a
     * point and make "dist exactly 0" a measure-zero safe spot.
     */
    minRadius: z.number().nonnegative().default(0.5),
    /** per-second burn (fraction of maxHealth) at ignition, outside the ring */
    burnPctPerSecStart: z.number().min(0).max(1).default(0.04),
    /** per-second burn (fraction of maxHealth) once the ring is fully closed */
    burnPctPerSecEnd: z.number().min(0).max(1).default(0.2),
    /** safety cap on the per-second burn rate (fraction of maxHealth); absent = uncapped */
    maxPctPerSec: z.number().min(0).max(1).optional(),
  })
  .strict();

export type FireRingConfig = z.infer<typeof zFireRingConfig>;

/** Contract defaults for the fireRing block (dev cheats / fallbacks). */
export const DEFAULT_FIRE_RING_CONFIG: FireRingConfig = {
  startSec: 60,
  shrinkSec: 20,
  minRadius: 0.5,
  burnPctPerSecStart: 0.04,
  burnPctPerSecEnd: 0.2,
  maxPctPerSec: 1,
};

export const zConfigMatchDoc = z
  .object({
    id: zId,
    schema: z.literal("config@1"),
    tick: z
      .object({
        /** authoritative sim tick rate (Hz) */
        tickHz: z.number().int().positive(),
        /** network snapshot broadcast rate (Hz) */
        snapshotHz: z.number().int().positive(),
      })
      .strict(),
    match: z
      .object({
        teamCount: z.number().int().min(2),
        teamSize: z.number().int().min(1),
        /** shared team lives at match start (PairedDuels) */
        startingTeamLives: z.number().int().positive(),
        champSelectSec: z.number().positive(),
        intermissionSec: z.number().positive(),
        /**
         * HARD combat backstop: the phase force-ends here (PhaseMachine). It is
         * NOT the intended round length — the fire ring (below) closes in first
         * and settles a stalemate well before this cap. Must leave room for the
         * WHOLE ring (`startSec + shrinkSec`), not just its ignition: a ring
         * that is still shrinking when the phase force-ends never gets to
         * finish anyone (refine below).
         */
        combatMaxSec: z.number().positive(),
        /**
         * Fire ring (火圈 / 火環, tasks #132/#195) — the round-pacing ring.
         * `startSec` is the SINGLE SOURCE OF TRUTH for round length: at that
         * combat-elapsed time the ring appears at the zone boundary and then
         * contracts over `shrinkSec` to `minRadius`, burning everyone OUTSIDE
         * it with a defence-ignoring %-HP true-damage rate that ramps with the
         * shrink. By the end there is no survivable space at all, so a
         * stalemate cannot outlast it. Optional + additive: an absent block =
         * no ring (legacy behavior). Consumed by the sim via
         * `fireRingRulesFromConfig` → `beginCombatFireRing`.
         */
        fireRing: zFireRingConfig.optional(),
        resolutionSec: z.number().positive(),
      })
      .strict()
      .refine((m) => !m.fireRing || m.fireRing.startSec + m.fireRing.shrinkSec <= m.combatMaxSec, {
        message:
          "match.fireRing.startSec + shrinkSec must be <= match.combatMaxSec (the ring must finish closing before the hard combat backstop)",
        path: ["fireRing", "startSec"],
      }),
    economy: z
      .object({
        startingGold: z.number().int().min(0),
        killGold: z.number().int().min(0),
        /**
         * One-time bounty paid on TOP of killGold the first time each enemy
         * champion dies (task #90). OPTIONAL + additive: a config doc without it
         * (older exports, the editor's new-doc template) still validates, and the
         * sim reads its own GOLD_REWARDS.killBounty default — this key is the
         * operator override for that value.
         */
        killBounty: z.number().int().min(0).optional(),
        assistGold: z.number().int().min(0),
        roundWinGold: z.number().int().min(0),
        roundLoseGold: z.number().int().min(0),
        /** fraction of cost refunded on sell, 0..1 */
        sellRefund: z.number().min(0).max(1),
        inventorySlots: z.number().int().min(1).max(9),
      })
      .strict(),
    progression: z
      .object({
        levelCap: z.number().int().min(1),
        /** xpToNext(level) = xpBase + xpPerLevel * (level - 1) */
        xpBase: z.number().int().positive(),
        xpPerLevel: z.number().int().min(0),
        xpKill: z.number().int().min(0),
        xpAssist: z.number().int().min(0),
        xpRoundSurvive: z.number().int().min(0),
      })
      .strict(),
    draft: z
      .object({
        offerCount: z.number().int().min(1).max(5),
        /** round number (as string key) -> augment tier offered that round */
        tierSchedule: z.record(z.string().regex(/^[0-9]+$/), zAugmentTier),
      })
      .strict(),
  })
  .strict();

/** M COIN store config: champion unlock prices + match placement rewards. */
export const zConfigStoreDoc = z
  .object({
    id: zId,
    schema: z.literal("config.store@1"),
    /** championId -> M COIN unlock price (0 = free/starter, auto-owned) */
    championPrices: z.record(zId, z.number().int().min(0)),
    /** M COIN granted per final team placement (1 = winner) */
    mcoinRewards: z
      .object({
        placement1: z.number().int().min(0),
        placement2: z.number().int().min(0),
        placement3: z.number().int().min(0),
        placement4: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

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
    /** an enemy inside the ring HOLDS progress (false = enemies are ignored) */
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
  radius: 2,
  decayMult: 2,
  revivesPerTeamPerRound: 1,
  reviveHpPctMax: 0.5,
  reviveManaPctMax: 0.5,
  contestPauses: true,
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

/** Contract defaults for the goldDrop block (dev cheats / fallbacks). */
export const DEFAULT_GOLD_DROP_CONFIG: GoldDropConfig = {
  coinValue: 100,
  coinsPerRound: 10,
  dropRadius: 1.9,
  pickupRadius: 1.6,
  coinRadius: 0.31,
};

/**
 * Roguelite mob waves (task #215 肉鴿小怪波 — 聖杯黑泥醬-喪標麥可 voxel-zombies).
 * From `fromRound` onward, mobs stream in from the EDGES of each active duel
 * zone: a wave every `waveIntervalSec`, the wave at combat-second (2k-1)
 * spawning min(k, `mobsPerWaveCap`) mobs, capped at `maxAlivePerZone` alive per
 * battlefield. Each mob walks to the nearest enemy champion and melee-attacks;
 * on death it pays the killer `reward.gold` + `reward.xp`, and every
 * `reward.killsPerLevel`th mob kill grants that champion +1 LEVEL (the intended
 * climb past the round-grant L50 ceiling toward LV99). Optional + additive: an
 * absent block means the mechanic is simply OFF (same legacy-compat convention
 * as `flowers` / `reviveCircles` / `guardianTower`), which is what every unit
 * test and the client's prediction shadow world see. Seconds in the doc, ticks
 * in the sim (converted once by `mobRulesFromConfig`).
 */
/**
 * 由誰擔任的來源 (#289, owner 2026-07-29 「除了指定英雄,也要有隨機選項。特殊殭屍
 * 與殭屍王預設是隨機」; follow-up ruling: 隨機 = 「從策展白名單抽」).
 *
 * ⚠️ A PARALLEL ENUM, NOT `championId: "__random__"`. A sentinel string passes
 * `z.string().min(1)` unchanged, and the sim would then look it up, find nothing
 * and silently fall back to the default model + the default stats — a zombie
 * that says 「隨機」 in the console and is a plain 喪標麥可 in the match. Three
 * legal values means an unsupported one is a 422 an operator can see.
 *
 * ⚠️ THREE VALUES ONLY — no `"wave"`, no `"mob"`. A hero-derived zombie's hp and
 * attack damage are baked from ONE champion at arm time and stored per-KIND on
 * `MobRules`, so a per-wave/per-entity face would render a champion whose
 * numbers belong to somebody else. See `MobChampionSource` in sim/mobs.ts for
 * the full reasoning and what it would take to lift the restriction.
 *
 * THE ENUMERATION IS THE BOUND. There is no min/max to state for a string knob:
 * anything outside these three is rejected by zod here and by
 * `validateField`'s `enum` branch in the console, so both ends agree.
 */
export const zMobChampionSource = z.enum(["inherit", "fixed", "random"]);

/**
 * 英雄卡讀在幾級的來源 (#290, owner 2026-07-29 「特殊殭屍也可以設 heroLevel,但
 * 預設是跟當時場上英雄最高等級相同(一樣是個選項)」).
 *
 *   · `"round"`        — 沿用該回合一般殭屍的等級(會隨回合成長)。
 *   · `"fixed"`        — 用同一個 block 的 `heroLevel` 那個數字(王 = 99)。
 *   · `"matchHighest"` — **該小怪所在 zone 的全部英雄裡最高的等級,死活都算**,
 *     在**生成那一刻**解析。⚠️ 不要順手加回存活過濾:owner 2026-07-29 明文裁決
 *     「死活都計算在內」,理由是這樣就消掉「全隊倒地→殭屍反而變弱」那個倒過來的
 *     難度曲線。fallback 到 `armedLevel` 現在只有一條路走得到:那個 zone 真的
 *     一個英雄都沒有。
 *
 * ⚠️ ABSENT ≠ `"round"`. 缺席代表 pre-#290 那條鏈 `heroLevel ?? 該回合等級`,所以
 * 一份沒有這個欄位的舊 arena 逐位元不變 —— 特別是 `heroLevel: 99` 的王不會被一個
 * 「比較整齊」的預設值悄悄降到第 3 級(血量直接砍掉一半以上)。
 *
 * ⚠️ 為什麼不是 `heroLevel: 0` 這種 sentinel:`heroLevel` 是 `int().min(1).max(99)`,
 * 塞 sentinel 就得把下界開到 0,而 0 在其他每一格都只代表「填錯了」。三個具名值讓
 * 沒實作的模式是一個 422,不是一個安靜的預設值。
 *
 * THE ENUMERATION IS THE BOUND —— 和 `zMobChampionSource` 同一條規矩:字串旋鈕沒有
 * min/max 可講,清單本身就是界線,後台的 `validateField` 讀同一份清單。
 */
export const zMobHeroLevelSource = z.enum(["round", "fixed", "matchHighest"]);

export const zMobWavesConfig = z
  .object({
    /** 1-based round from which waves begin (matches ultUnlockRound:3 precedent) */
    fromRound: z.number().int().min(1),
    /** combat-second of wave k=1 (→ firstWaveTicks = round(sec/dt)) */
    firstWaveSec: z.number().positive(),
    /** combat-seconds between waves (wave k lands at second 2k-1 when =2) */
    waveIntervalSec: z.number().positive(),
    /** hard cap on mobs spawned per wave: count = min(k, mobsPerWaveCap) */
    mobsPerWaveCap: z.number().int().min(1),
    /** hard cap on mobs ALIVE per battlefield/duel zone at once */
    maxAlivePerZone: z.number().int().min(1),
    /**
     * LATE-MATCH SCHEDULE (owner, 2026-07-27) — a per-round OVERRIDE of the two
     * caps above, for the escalation into the finale:
     *
     *   rounds 3-5 →   5 / 15   (the authored caps — the ramp-in)
     *   round  6   →  10 / 20
     *   round  7   →  15 / 30
     *   round  8   →  20 / 40
     *   round  9   →  25 / 50
     *   round 10   →   0 /  0   (乾淨總決賽 — no zombies at all)
     *
     * An explicit TABLE rather than a multiplier, because the owner's curve is
     * not a curve: it doubles, then doubles again, then goes to ZERO. Any
     * formula that produces 0 at round 10 also produces nonsense on the way
     * there, and the grand final's emptiness is a design statement — the last
     * round is champions only, with nothing to farm and nowhere to hide.
     *
     * Applied where the LEVEL already is (`mobRulesFromConfig(cfg, dt, round)`),
     * so it needs no new channel for the round to reach the sim and nothing
     * per-tick learns what a round is.
     *
     * Rounds not listed keep the authored caps. Absent block ⇒ no schedule,
     * which is what every legacy doc, unit test and the client's prediction
     * shadow world see.
     *
     * min(0), unlike the base caps' min(1): 0 is the whole point of round 10.
     */
    schedule: z
      .array(
        z
          .object({
            /** 1-based round this row applies to */
            round: z.number().int().min(1),
            /** cap on mobs spawned per wave in that round (0 = none) */
            mobsPerWaveCap: z.number().int().min(0),
            /** cap on mobs ALIVE per zone in that round (0 = none) */
            maxAlivePerZone: z.number().int().min(0),
            /**
             * PER-ROUND MOB FACE (owner 2026-07-27, 後台殭屍波系統頁).
             *
             * 「甚至設定每回合殭屍指定哪個英雄來擔任」 — the champion doc this
             * round's mobs wear the face of, overriding `mob.championId` for
             * this round only. Absent (the normal case) ⇒ inherit
             * `mob.championId`, which is itself optional and falls back to
             * MOB_CHAMPION_ID — so every legacy doc keeps its exact behaviour
             * and nothing about the shipped schedule changes.
             *
             * CONSUMED SINCE GH#191. `mobRulesFromConfig` resolves the round's
             * champion through `mobChampionForRound`, which reads THIS field
             * first — travelling the same `round` argument the per-round caps
             * already use, so no new channel into the sim was needed. Because
             * the mob's MODEL is now resolved FROM that champion (GH#192), a
             * value here changes both the face and the mesh that spawns.
             */
            championId: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    /** the mob unit's combat stats */
    mob: z
      .object({
        /** mob hit points (no regen) */
        maxHp: z.number().positive(),
        /** melee packet amount */
        attackDamage: z.number().min(0),
        /** #215 — the mob's OWN walk speed (u/s). Without it a mob inherits
         *  MovementSystem's BASE_MOVE_SPEED, which is a GENERAL fallback and
         *  not a mob knob. */
        moveSpeed: z.number().min(0).optional(),
        /** melee reach (GGD units; stored/compared squared in the sim) */
        attackRange: z.number().positive(),
        /** melee cooldown in seconds */
        attackCdSec: z.number().positive(),
        /** collision/body radius (drives the edge inset = boundaryRadius - radius) */
        radius: z.number().positive(),
        /**
         * OPTIONAL MODEL OVERRIDE (GH#192). Absent — the normal case now — means
         * 「用英雄的模型」: the mesh is resolved from `championId`'s champion doc
         * (`mobChampionModelKey` in sim/mobs.ts), so 「選什麼英雄就會讀取什麼 3d
         * modal」 without an operator having to keep two fields in agreement.
         * Authored = that doc id wins, for an arena that deliberately wants a
         * mesh no champion wears.
         */
        modelKey: z.string().min(1).optional(),
        /**
         * 體型倍率 (GH#192) — the mob's on-screen size as a MULTIPLE of what its
         * model doc already declares. 1 = exactly the champion's own size.
         *
         * A multiplier and not an absolute height, because it has to compose
         * with #150's height-normalization: the champion's mesh is already
         * normalized to TARGET_HEIGHT × doc.scale, and this scales THAT. It is
         * pure presentation — the mob's collision `radius` above is the sim's
         * body and is deliberately NOT driven from here (a 10× visual with a 10×
         * hitbox would also need the nav grid and the zone inset to agree).
         */
        sizeMult: z.number().positive().optional(),
        /**
         * 染黑強度 (GH#192, owner: 「只會會是染黑色的模型避免跟玩家混在一起」).
         * 0 = the champion's own colours, 1 = a solid black silhouette. Applied
         * to EVERY mob kind (一般 / 特殊 / 王) through the #49/#254 tint pipeline,
         * so one knob decides how far a zombie reads as 「不是玩家」.
         *
         * 0.65 is the shipped default: dark enough that a 喪標麥可 zombie cannot
         * be mistaken for the 喪標麥可 a player picked, light enough that the
         * silhouette still says WHICH champion it is wearing.
         */
        tintStrength: z.number().min(0).max(1).optional(),
        /**
         * #217 — the CHAMPION DOC the mob wears the FACE of. Since #244 this is
         * PRESENTATION + a LEGACY FALLBACK only: when the four `baseHp`/
         * `hpPerLevel`/`baseRegen`/`regenPerLevel` numbers below are authored,
         * they win and the hero sheet is never read for stats. Absent =
         * `MOB_CHAMPION_ID` (godie-zombiex).
         */
        championId: z.string().min(1).optional(),
        /**
         * #289 — 指定 or 隨機 for the NORMAL zombie. Ships `"fixed"`: the owner
         * asked for 隨機 to be the DEFAULT on the king and the special only, and
         * the rank-and-file zombie stays 喪標麥可.
         *
         * ⚠️ THE PER-ROUND `schedule[].championId` COLUMN STILL WINS. 「第 5 回合
         * 由皮卡丘擔任」 is a statement about one round; 隨機 is a whole-match
         * default, so the draw slots in where `mob.championId` is and not above
         * the row (see `mobChampionForRound`).
         */
        championSource: zMobChampionSource.optional(),
        /** #217 — mob level in round `fromRound` (owner: 第3場 = lv3) */
        baseLevel: z.number().int().min(1).optional(),
        /** #217 — levels gained per round past `fromRound` (owner: 每場 +1) */
        levelPerRound: z.number().int().min(0).optional(),
        /**
         * #244 — THE MOB'S OWN HP CURVE, split out of the hero sheet.
         *
         * Before #244 the mob's hp was `championDoc.baseStats.maxHealth +
         * growth.maxHealth*(level-1)`, so editing 喪標麥可 THE HERO silently
         * re-tuned the roguelite difficulty — it happened on 2026-07-26 when a
         * growth change moved round-3 zombies from 200 to 300 hp. These four
         * numbers are the mob's own source; the champion doc is now only a
         * fallback for arenas authored before #244.
         *
         * Law is identical to the hero one so the shipped curve survives
         * byte-for-byte: `round(baseHp + hpPerLevel*(level-1))`.
         */
        baseHp: z.number().positive().optional(),
        /** #244 — hp gained per mob level past 1 (paired with `baseHp`) */
        hpPerLevel: z.number().min(0).optional(),
        /** #244 — hp regenerated per second at level 1 */
        baseRegen: z.number().min(0).optional(),
        /** #244 — hp/sec gained per mob level past 1 (paired with `baseRegen`) */
        regenPerLevel: z.number().min(0).optional(),
      })
      .strict(),
    /** per-kill rewards */
    reward: z
      .object({
        /** flat gold to the killer per mob kill */
        gold: z.number().int().min(0),
        /** XP to the killer per mob kill */
        xp: z.number().int().min(0),
        /** every Nth mob kill grants the killer +1 level */
        killsPerLevel: z.number().int().min(1),
      })
      .strict(),
    /**
     * 殭屍王 (task #262, owner 2026-07-28: 「殭屍王 有機會上線嗎 包括單個英雄擊敗
     * 100 隻殭屍招喚跟後台設定?」).
     *
     * A BATTLEFIELD QUEST hung on `world.mobKills`, which is already PER
     * CHAMPION and already MATCH-CUMULATIVE (#215 owner decision): when ONE
     * champion's personal tally reaches `killThreshold`, a boss is summoned into
     * THAT champion's duel zone. Two champions on 50 kills each summon nothing —
     * the counter that fires is one person's, never the team's sum.
     *
     * ABSENT = the whole sub-mechanic is off, exactly like an absent `mobWaves`
     * turns the waves off. That is what keeps every pre-#262 arena, every unit
     * test and the client's prediction shadow byte-identical.
     */
    boss: z
      .object({
        /** master switch; false keeps the block authored but inert */
        enabled: z.boolean(),
        /**
         * ONE champion's cumulative zombie kills that summon the king (owner:
         * 100). Compared against `world.mobKills.get(champion)`, so it spans
         * rounds — that is the 「跨回合累積」 in the task title.
         */
        killThreshold: z.number().int().min(1),
        /**
         * true  = every Nth kill summons another king (100, 200, 300 …)
         * false = ONCE per champion per match, on exactly the Nth kill.
         * Owner ruling pending (see the task's openQuestions); the shipped
         * default is `true` because `mobKills` never resets inside a match and a
         * once-only king would leave rounds 7-10 with nothing to chase.
         */
        repeatable: z.boolean(),
        /**
         * The king's hit points as a FLAT number. Used only when `hpMult` below
         * is absent — an arena authored before GH#192 keeps its exact king.
         */
        maxHp: z.number().positive(),
        /**
         * ×N THE NORMAL MOB'S HP FOR THAT ROUND (GH#192, owner: 「HP是100倍」).
         *
         * Wins over the flat `maxHp` when present, and it is the shipped setting,
         * because a flat king stops being a wall the moment the zombie curve is
         * retuned: at round 3 the mob has 60 hp, so ×100 is 6,000 — the same king
         * the flat number authored — and by round 9 (180 hp) it is 18,000 instead
         * of the same 6,000 a champion 16 levels stronger would delete.
         */
        hpMult: z.number().positive().optional(),
        /**
         * 由誰擔任 (GH#192). The champion doc the KING wears the face and the
         * MODEL of. Absent = whatever the normal mob of that round is wearing,
         * so an operator who only changes 「這回合由誰擔任」 gets a matching king
         * for free.
         */
        championId: z.string().min(1).optional(),
        /**
         * #289 — 指定 or 隨機 for the KING. SHIPS `"random"` (owner 2026-07-29
         * 「特殊殭屍與殭屍王預設是隨機」), drawn from the curated whitelist once
         * per round. The draw feeds `heroHpMult`/`heroDamageMult` as well as the
         * mesh, so a randomised king is a DIFFERENT FIGHT each round and not a
         * re-skin. Absent / `"inherit"` = the pre-#289 chain (`championId`, else
         * the round's mob champion).
         */
        championSource: zMobChampionSource.optional(),
        /**
         * 體型倍率 (GH#192, owner: 「modal 大小是10倍」). Same units and same
         * composition rule as `mob.sizeMult`; 10 is the shipped default, and it
         * is a KNOB rather than a constant precisely because 10 is enormous
         * (see the openQuestions on GH#192).
         */
        sizeMult: z.number().positive().optional(),
        /** melee packet amount */
        attackDamage: z.number().min(0),
        /** walk speed in GGD units/second */
        moveSpeed: z.number().min(0),
        /** melee reach (stored/compared squared in the sim) */
        attackRange: z.number().positive(),
        /** melee cooldown in seconds */
        attackCdSec: z.number().positive(),
        /** collision/body radius — also what makes the king LOOK like a king */
        radius: z.number().positive(),
        /** model doc id (resolved client-side); absent = the normal mob's */
        modelKey: z.string().min(1).optional(),
        /**
         * The prize pool in gold, split among every champion that damaged the
         * king in proportion to that damage. NOT a per-hero amount.
         *
         * ⚠️ NOT NECESSARILY THE AMOUNT PAID. Under the shipped
         * `lastHitMode: "bonus"` (owner 2026-07-29, GH#206) the last hitter
         * receives an EXTRA copy of their own share, so the total lands in
         * `[bountyGold, bountyGold × lastHitMultiplier]`. Only `"weight"` pays
         * exactly this number. See `splitBossBounty` in sim/mobBoss.ts.
         */
        bountyGold: z.number().int().min(0),
        /** the same, in XP */
        bountyXp: z.number().int().min(0),
        /**
         * 等級提升 (owner 2026-07-29: 「殭屍王 獎勵 金錢+30,000 等級提升+50」).
         * WHOLE LEVELS, split by damage share exactly like `bountyGold` — not
         * XP, so it skips the curve entirely.
         *
         * ⚠️ The REQUEST, not the guarantee: `LEVEL_CAP` is 99 and a champion
         * who farmed 100 zombies to summon the king is already past L50, so the
         * grant is routinely smaller. Anything shown to a player must read what
         * `grantLevels` returned, never this number.
         */
        bountyLevels: z.number().int().min(0).max(99),
        /**
         * 最後一刀翻倍 (owner). 2 = 翻倍. What it multiplies depends on
         * `lastHitMode`.
         */
        lastHitMultiplier: z.number().min(1).max(10),
        /**
         * How 「最後一刀翻倍」 is paid — the owner reversed this on 2026-07-29
         * and asked for both to stay available (GH#206):
         *   · `"bonus"`  (default) 「超過總額沒關係」 — split by raw damage, then
         *                pay the last hitter one extra copy of their own share.
         *                One champion doing all the damage AND landing the blow
         *                takes 200%, which is the owner's own worked example.
         *   · `"weight"` — the pre-#206 rule: the doubling is folded into the
         *                proportions, so the total is exactly `bountyGold` and
         *                a low-damage kill-stealer cannot mint gold.
         */
        lastHitMode: z.enum(["bonus", "weight"]).optional(),
        /**
         * 溢傷算不算 — owner 2026-07-29 ruled **不算** (GH#206).
         *
         * `false` (shipped): the ledger records the hp the king ACTUALLY lost,
         * so a 4,000-damage ult on a king with 100 hp left weighs 100. `true`:
         * the raw post-mitigation number, overkill and all — which under
         * `lastHitMode: "bonus"` inflates the whole payout, not just one share.
         */
        countOverkill: z.boolean().optional(),

        /* ── 從英雄推導的數值 (owner 2026-07-29, GH#206) ──────────────────
         *
         * 「生命與能力屬性倍數為**該設定英雄的** N 倍」。ABSENT ⇒ the pre-#206
         * path (`hpMult` × the round's zombie, flat `maxHp`/`attackDamage`)
         * stays byte-identical, which a lot of arena tests depend on.
         *
         * ⚠️ OWNER SAID ONE NUMBER; THIS IS TWO, AND THAT IS THE 折衷 THEY
         * APPROVED. The spec's single 「生命與能力屬性倍數 20×」 lands the king
         * at AD 4,400 against a round-3 player's ~2,000 hp — one swing kills
         * twice over. HP and damage fail differently: a huge HP pool just makes
         * the king a wall (fun), a huge AD makes it a one-shot (not). Splitting
         * them is the only way to keep 「20 倍的王」 without the one-shot.
         */
        /** ×`championStatBase(MaxHealth)` of `championId` at `heroLevel` */
        heroHpMult: z.number().positive().max(1000).optional(),
        /**
         * ×`championStatBase(AttackDamage)`. Deliberately SMALLER than
         * `heroHpMult` — see the note above. Shipped 4 (king) / 2 (special)
         * against 20 / 5 for hp.
         */
        heroDamageMult: z.number().positive().max(1000).optional(),
        /**
         * 基礎生命額外 — a FLAT add AFTER the multiply, mirroring the
         * `baseBonus` semantics owner ruled on 2026-07-28 (加成不參與倍率).
         */
        hpFlatBonus: z.number().min(0).max(10_000_000).optional(),
        /** ×the NORMAL zombie's walk speed. 0.2 = 「移動速度 -80%」 */
        moveSpeedMult: z.number().min(0).max(10).optional(),
        /**
         * 殭屍王的等級 (owner 2026-07-29:「殭屍王的等級是滿級99」).
         *
         * ⚠️ THIS IS NOT COSMETIC. At the round-3 level the hero-derived HP is
         * 553 and the flat +100,000 is 90% of the total, so WHICH CHAMPION THE
         * KING WEARS BARELY MATTERS. At 99 it is 8,847 → the hero contributes
         * 64%. The 隨機選英雄 feature only means something because of this.
         */
        heroLevel: z.number().int().min(1).max(99).optional(),
        /**
         * #290 — 上面那格「幾級」怎麼決定. SHIPS `"fixed"`, i.e. 「就用 99」 said
         * out loud: the owner pinned the king at 滿級 99 and that ruling has not
         * changed. `"matchHighest"` is available on the king too (every knob on
         * this page is 後台可調) and would make the king track the lobby's best
         * hero instead — a very different, much softer, boss.
         *
         * ABSENT ⇒ the pre-#290 chain `heroLevel ?? 該回合等級`, so a doc without
         * this field is byte-identical. See {@link zMobHeroLevelSource}.
         */
        heroLevelSource: zMobHeroLevelSource.optional(),
      })
      .strict()
      .optional(),
    /**
     * 特殊殭屍 (owner 2026-07-28: 「殭屍群裡面會有一隻特殊殭屍」).
     *
     * Every spawned mob rolls once against `chancePercent`; a winner is a
     * SPECIAL zombie — its own model, its own size, its own stats and its own
     * reward multiplier. The roll is `world.rng`, so the same seed reproduces
     * the same zombies (see sim/mobs.ts `rollMobKind`).
     *
     * ABSENT (or chancePercent 0) = no special zombies, and NO rng draw at all,
     * so a pre-#262 arena leaves the shared random stream untouched.
     */
    special: z
      .object({
        /** probability per spawned mob, in PERCENT (0 = off, 100 = always) */
        chancePercent: z.number().min(0).max(100),
        /** maxHp multiplier against the normal mob of the same round */
        hpMult: z.number().positive(),
        /** melee damage multiplier */
        damageMult: z.number().min(0),
        /** walk-speed multiplier */
        moveSpeedMult: z.number().min(0),
        /** body-radius multiplier — the SIM's body (melee reach scales with it) */
        radiusMult: z.number().positive(),
        /** GH#206 — same three as the boss; see the notes on `boss.heroHpMult` */
        heroHpMult: z.number().positive().max(1000).optional(),
        heroDamageMult: z.number().positive().max(1000).optional(),
        hpFlatBonus: z.number().min(0).max(10_000_000).optional(),
        /**
         * 特殊殭屍的等級。只有在 `heroLevelSource: "fixed"` 時才會被讀到。
         * ABSENT + 沒有 `heroLevelSource` = 沿用該回合一般殭屍的等級。
         */
        heroLevel: z.number().int().min(1).max(99).optional(),
        /**
         * #290 — 特殊殭屍的「幾級」來源. SHIPS `"matchHighest"` (owner
         * 2026-07-29 「預設是跟當時場上英雄最高等級相同」).
         *
         * ⚠️ 這一格是全 `mobWaves` 唯一一個在**生成那一刻**才解析的欄位。其他每一
         * 格都在 `mobRulesFromConfig`(arm time)烘成常數;「當時場上最高等級」不是
         * 常數,英雄在同一回合裡會升級,所以它必須在 `spawnMob` 那裡算。填 `"round"`
         * 就退回 #290 之前那條會隨回合成長的曲線。
         */
        heroLevelSource: zMobHeroLevelSource.optional(),
        /**
         * 體型倍率 (GH#192) — the RENDERED size, aligned in meaning with the
         * king's. Distinct from `radiusMult` (the collision body) on purpose:
         * before GH#192 the visible size came from the `champ.mob.zombie-special`
         * doc's `scale` and the hitbox from `radiusMult`, two numbers in two
         * files that nothing kept in agreement.
         */
        sizeMult: z.number().positive().optional(),
        /**
         * gold AND xp multiplier on the kill reward, paid to the LAST HITTER.
         *
         * ⚠️ INERT once a 分紅獎池 is authored below (#288): the pool replaces
         * this reward rather than stacking with it, so a special with
         * `bountyGold` pays 5,000-split and NOT an extra `rewardGold × 3` to
         * whoever landed the blow. Still the only thing that pays a special in
         * an arena that authors no pool.
         */
        rewardMult: z.number().min(0),
        /** model doc id (resolved client-side); absent = the normal mob's */
        modelKey: z.string().min(1).optional(),
        /** 由誰擔任 (GH#192); absent = the normal mob's champion for that round */
        championId: z.string().min(1).optional(),
        /**
         * #289 — 指定 or 隨機 for the 特殊殭屍. SHIPS `"random"` (owner
         * 2026-07-29 「特殊殭屍與殭屍王預設是隨機」). Same wiring as the king's:
         * the drawn champion is what `heroHpMult`/`heroDamageMult` read, so its
         * ~12,000 hp really is THAT hero's sheet ×5 and not the zombie's.
         */
        championSource: zMobChampionSource.optional(),

        /* ── 分紅獎池 (#288, owner 2026-07-29) ────────────────────────────────
         *
         * 「特殊殭屍也照傷害比例分,獎勵是金錢 +5,000 · 等級提升 +5」. Same six
         * knobs as the king's, meaning the same six things and divided by the
         * same `splitBossBounty` — plus `splitByDamage`, which the king does not
         * need (see below).
         *
         * ALL THREE POOL NUMBERS ABSENT ⇒ NO POOL AT ALL: the special keeps NO
         * damage ledger and pays the pre-#288 `rewardMult` to the last hitter,
         * byte for byte. Authoring any one of them opts the block in.
         */
        /** the pool in gold, split by damage share (owner: 5,000) */
        bountyGold: z.number().int().min(0).max(10_000_000).optional(),
        /** the same, in XP */
        bountyXp: z.number().int().min(0).max(10_000_000).optional(),
        /**
         * 等級提升 — WHOLE levels, split by damage exactly like gold (owner: 5).
         * ⚠️ A REQUEST, not a guarantee: `LEVEL_CAP` is 99 and the settlement
         * panel shows what `grantLevels` actually handed out.
         */
        bountyLevels: z.number().int().min(0).max(99).optional(),
        /**
         * 最後一刀倍率. ABSENT ⇒ **1**, i.e. a pure proportion with no 翻倍 —
         * the owner's 翻倍 ruling was about the KING, and the instruction here
         * was only 「照傷害比例分」. Deliberately different from the king's
         * shipped 2.
         */
        lastHitMultiplier: z.number().min(1).max(10).optional(),
        /** ABSENT ⇒ `"bonus"`, matching the king. Inert while the倍率 is 1. */
        lastHitMode: z.enum(["bonus", "weight"]).optional(),
        /**
         * ABSENT ⇒ **true** (the owner's instruction). `false` restores the
         * pre-#288 behaviour: the WHOLE pool goes to whoever landed the killing
         * blow, nobody else gets a share.
         */
        splitByDamage: z.boolean().optional(),
        /**
         * 溢傷算不算 — ABSENT ⇒ false, the same ruling the king ships with
         * (owner 2026-07-29 「不算」). Its OWN field rather than a read of
         * `boss.countOverkill`, so an arena with no king still controls this.
         */
        countOverkill: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type MobWavesConfig = z.infer<typeof zMobWavesConfig>;
export type MobBossConfig = NonNullable<MobWavesConfig["boss"]>;
export type MobSpecialConfig = NonNullable<MobWavesConfig["special"]>;

/** Contract defaults for the mobWaves block (dev cheats / fallbacks). */
export const DEFAULT_MOB_WAVES_CONFIG: MobWavesConfig = {
  fromRound: 3,
  firstWaveSec: 1,
  waveIntervalSec: 2,
  mobsPerWaveCap: 5,
  maxAlivePerZone: 15,
  // owner, 2026-07-27 (second pass — the ramp now starts at round 6 and climbs
  // by +5 alive a round instead of doubling). Round 10 is EMPTY: 乾淨總決賽.
  //
  // Render cost was checked rather than assumed. The peak is round 9: 50 alive
  // × 2 zones = 100 mobs, against the 60 that docs/改進延遲.md computed for the
  // old guardian_skeleton (5,288 tris ⇒ 317,280 skinned tris/frame). On today's
  // blocky-undead at 168 tris those 100 mobs are 16,800 tris — a nineteenth of
  // the load that motivated that document. Server-side AI for 100 mobs is the
  // cost worth watching, not the renderer.
  schedule: [
    { round: 6, mobsPerWaveCap: 10, maxAlivePerZone: 20 },
    { round: 7, mobsPerWaveCap: 15, maxAlivePerZone: 30 },
    { round: 8, mobsPerWaveCap: 20, maxAlivePerZone: 40 },
    { round: 9, mobsPerWaveCap: 25, maxAlivePerZone: 50 },
    { round: 10, mobsPerWaveCap: 0, maxAlivePerZone: 0 },
  ],
  mob: {
    // Flat LAST-RESORT fallback (#217): only reached when neither the #244 mob
    // curve below nor a registered champion doc is available.
    maxHp: 24,
    attackDamage: 1.2,
    moveSpeed: 3,
    attackRange: 1.8,
    attackCdSec: 1.0,
    radius: 0.6,
    championId: "godie-zombiex",
    // #289 — the RANK-AND-FILE zombie stays 喪標麥可 by name. 隨機 is available
    // on this row too (the owner asked for it on all three kinds) but is NOT the
    // default here: 「特殊殭屍與殭屍王預設是隨機」 named exactly two of the three.
    championSource: "fixed" as const,
    // NO `modelKey` (GH#192): blank is what makes 「選什麼英雄就會讀取什麼 3d
    // modal」 the LIVE path. Authoring one here would ship the feature inert —
    // the override would win on every arena and the champion branch would never
    // run in a real match.
    // 0.68 PRESERVES AN OWNER PLAYTEST RULING, it is not a fresh guess. #217
    // shipped `modelKey: "champ.mob.zombie"` — the same blocky-undead mesh at
    // doc scale 0.68 — because on 2026-07-26 the owner played the hero-sized
    // version and said 「肉鴿殭屍…縮小到適合尺寸…不然現在根本玩不了」. Resolving the
    // mesh from the champion (GH#192) would have handed that back at 1.0, so the
    // ruling moves onto this knob instead of being lost with the doc: a zombie
    // still renders at 0.68 × TARGET_HEIGHT = 1.224u against a 1.8u hero.
    sizeMult: 0.68,
    tintStrength: 0.65,
    baseLevel: 3,
    levelPerRound: 1,
    // #244 — the mob's OWN curve (owner 2026-07-26): 100 + 100*(level-1), so the
    // round-3 floor of level 3 is 300 hp, round 4 → 400, round 5 → 500,
    // round 6 → 600. Regen 1 + 0.2*(level-1). These used to live on the
    // 喪標麥可 hero sheet; they are the mob's numbers now and the hero's
    // stats can never move them again.
    baseHp: 20,
    hpPerLevel: 20,
    baseRegen: 0,
    regenPerLevel: 0,
  },
  reward: {
    gold: 20,
    xp: 40,
    // owner, 2026-07-27: 「打殭屍 變成每打死6支升1級」 (was 30).
    // Deliberate 5x acceleration of the roguelite climb, and it composes with
    // the v0.7.1 nerfs rather than compounding them: a zombie now has 20 base HP,
    // 1.2 attack and half the move speed, so six of them is a short errand
    // rather than the grind thirty of them used to be. The reward that used to
    // arrive once a round now arrives several times, which is the point —
    // 「肉鴿」 is supposed to feel like a climb, not like homework.
    killsPerLevel: 6,
  },
  // 殭屍王 (#262). 100 personal kills, and — because `killsPerLevel` is 6 — a
  // champion who summons one is already ~16 levels up from zombies alone, so the
  // king is authored as a genuine wall rather than a big zombie: 6,000 hp against
  // the round-9 zombie's 200, and a 12 attack against its 1.2.
  //
  // BOUNTY, owner 2026-07-28 (#187): 「殭屍王 總獎金也要後台能設定 預設是
  // 30,000」. It was 3,000 — deliberately「roughly HALF the ~7,600g deterministic
  // match income」so the king was a prize and not a second economy. 30,000 is a
  // knowing REVERSAL of that framing: the king is now worth ~4x a whole match's
  // baseline income, i.e. summoning one IS the economy for whoever kills it.
  // That is the owner's call, not an inference — the number is his, and the 後台
  // 小怪波 page can retune it live (`boss.bountyGold`).
  //
  // ⚠️ THIS DEFAULT IS WRITTEN THREE TIMES. `apps/admin/src/mobWaves.ts` mirrors
  // it (so the console can render a default before the GET resolves) and
  // `content/config/arena-rules.json` is the doc the sim actually loads;
  // apps/admin/src/mobWaves.test.ts pins all three together. Changing one alone
  // makes the console show a default the server does not use.
  boss: {
    enabled: true,
    killThreshold: 100,
    repeatable: true,
    maxHp: 6000,
    attackDamage: 12,
    moveSpeed: 2.4,
    attackRange: 2.6,
    attackCdSec: 1.4,
    // 1.8 against the zombie's 0.6 — the king is THREE TIMES as wide, which is
    // the silhouette cue that says 「這不是雜魚」 before any model loads.
    radius: 1.8,
    // ⚠️ MERGE SEAM (v0.9.12): two lanes each landed ONE owner instruction here
    // and the conflict looked like a choice. It is not — BOTH must survive, and
    // dropping either one is invisible to every test in the repo:
    //   · 經濟組  #187 「總獎金…預設是 30,000」  → bountyGold
    //   · 殭屍身分組 #192 「屬性跟 modal 大小是10倍、HP是100倍」 → hpMult/sizeMult,
    //     and NO `modelKey` (the king now wears the round's champion like every
    //     other zombie, so a hard-coded model doc would silently override it)
    // Taking either side wholesale ships a king that is either the wrong size or
    // the wrong price, and both suites stay green. This is the same shape as the
    // v0.9.11 attributes.ts seam — written down so the next merge does not have
    // to rediscover it.
    //
    // ×100 of the round-3 mob (60 hp) is 6,000 — byte-identical to the flat
    // `maxHp` above, so the shipped king at the round it FIRST appears is
    // unchanged and only the later rounds scale.
    hpMult: 100,
    // #289 owner 2026-07-29 「特殊殭屍與殭屍王預設是隨機」 + 「從策展白名單抽」.
    //
    // ⚠️ NO `championId` BESIDE IT, ON PURPOSE. `championSource` decides WHICH
    // branch runs; `championId` is only the 「指定」 branch's argument. Authoring
    // both would look like a contradiction on the console (「隨機」 next to a
    // named hero) even though the code has a clear precedence — and the moment
    // an operator flips this box back to 指定 they should be choosing the hero
    // deliberately, not inheriting one somebody left behind.
    //
    // THE KING'S NUMBERS FOLLOW THE DRAW: `heroHpMult: 20` reads the DRAWN
    // champion's MaxHealth, so round 4's king is a genuinely different wall from
    // round 3's — which is the point of the feature and the thing
    // mobs.randomChampion.test.ts pins.
    championSource: "random" as const,
    // 體型倍率. GH#206 shipped 30; the owner walked it back to **10** on
    // 2026-07-29 after a playtest — 30 × the zombie's 0.68 × the 1.8u normalised
    // body is 36.72u tall in a duel zone whose RADIUS is 24u, i.e. the king was
    // taller than the arena is wide and it ate the whole camera. 10 keeps it at
    // 12.24u: still a landmark, still legible, no longer a wall of texture.
    //
    // ⚠️ THIS MIRROR IS NOT THE SOURCE. `content/config/arena-rules.json` is,
    // and `mobs.heroDerived.test.ts` + `apps/admin/src/mobWaves.test.ts` both
    // pin the three copies against each other — editing one alone is a red suite,
    // which is exactly what stopped this value drifting for a whole version.
    sizeMult: 10,
    // ── 從英雄推導 (GH#206, owner 2026-07-29) ───────────────────────────────
    // 「生命與能力屬性 = 該設定英雄的 20 倍, 基礎生命額外 +100,000, 移速 −80%,
    //   等級是滿級 99」. Against the shipped 喪標麥可 sheet that resolves to:
    //     hp  = round(8,847.2 × 20) + 100,000 = 276,944
    //     ad  = 408.4 × 4                     = 1,633.6
    //     ms  = 3 × 0.2                       = 0.6   (×the ZOMBIE, not the hero)
    // `hpMult`/`maxHp`/`attackDamage`/`moveSpeed` above are now UNREACHABLE for
    // this doc — deliberately kept, because they are the fallback the moment an
    // operator clears `heroHpMult` in the console, and because a champion that
    // fails to resolve degrades onto them rather than onto zero.
    heroHpMult: 20,
    // ⚠️ 2, NOT 20 — the owner-approved 折衷, walked down from GH#206's 4 on
    // 2026-07-29. HP and damage fail differently: a huge pool makes the king a
    // wall (fun), a huge attack makes it a one-shot (not). At 99 the 喪標麥可
    // sheet gives 408.4 ad, so ×2 = 816.8 instead of 1,633.6. See the schema
    // note on `boss.heroDamageMult`.
    heroDamageMult: 2,
    hpFlatBonus: 100000,
    moveSpeedMult: 0.2,
    heroLevel: 99,
    // #290 — 「就用上面那個 99」 said out loud. The owner's 滿級 99 ruling is
    // unchanged; naming the mode is what makes 「跟場上最高」 a visible ALTERNATIVE
    // in the console rather than an invisible one.
    heroLevelSource: "fixed" as const,
    bountyGold: 30000,
    // XP stays at 1,200. GH#206 added 等級提升 as its OWN currency rather than
    // inflating this — the owner asked for 「等級提升+50」, and levels and XP are
    // different things (one skips the curve, the other rides it).
    bountyXp: 1200,
    // GH#206 owner 2026-07-29 「殭屍王 獎勵 金錢+30,000 等級提升+50」.
    bountyLevels: 50,
    lastHitMultiplier: 2,
    // GH#206 — see the schema note above. `"bonus"` is the owner's ruling and
    // deliberately lets the payout exceed `bountyGold` (200% at the extreme).
    lastHitMode: "bonus" as const,
    // owner 2026-07-29:「溢傷算不算?=> 不算」
    countOverkill: false,
  },
  // 特殊殭屍 (#262). One in twenty, so a wave of 20 carries about one — 「殭屍群
  // 裡面會有一隻特殊殭屍」 read literally. Double size and double hp make it
  // legible at a glance even before it has its own model; triple reward is what
  // makes hunting it a decision rather than trivia.
  special: {
    chancePercent: 5,
    hpMult: 2,
    damageMult: 1.5,
    // owner 2026-07-29 (GH#206) 「移動速度 −50%」 — WAS 1.25, i.e. the special
    // used to be FASTER than a zombie. This one field is the whole reason 移速
    // is anchored on the normal zombie instead of on the hero: the special picks
    // its face from the round's champion, hero `ms` on this roster spans 2.6..6.1,
    // and a hero-anchored ×0.5 would land anywhere from 1.3 to 3.05 — sometimes
    // faster than the 3.0 zombie it is supposed to be a slowed version of.
    moveSpeedMult: 0.5,
    radiusMult: 1.8,
    // GH#192 — the RENDERED size now says the same thing the hitbox does. No
    // `modelKey`: like the king, it wears the round's champion.
    // GH#206 shipped 3; owner walked it to **2** on 2026-07-29 (same playtest
    // that took the king from 30 to 10). 2 × 0.68 × 1.8u ≈ 2.45u — still reads
    // as 「那一隻不一樣」 next to a 1.22u zombie without blocking the fight behind it.
    sizeMult: 2,
    rewardMult: 3,
    // #289 — 隨機, same ruling and same no-`championId` rule as the king's.
    // Drawn on its OWN slot salt, so the special and the king are (usually) two
    // different heroes in the same round rather than twins.
    championSource: "random" as const,
    // ── 從英雄推導 (GH#206, 等級來源改寫於 #290) ─────────────────────────────
    // 「生命與能力屬性 = 該設定英雄的 5 倍, 基礎生命額外 +4,000」.
    heroHpMult: 5,
    heroDamageMult: 2,
    // owner 2026-07-29: 10,000 → **4,000**. At round 3 the +10,000 was 78% of a
    // special's 12,764 hp — the hero it wears barely mattered and every special
    // in the match was the same fat wall. 4,000 puts the HERO back in charge of
    // the number, which is the whole point of 隨機英雄 + 「跟場上最高等級」.
    hpFlatBonus: 4000,
    // #290 — owner 2026-07-29 「預設是跟當時場上英雄最高等級相同」. THE ONE FIELD
    // IN THIS DOC THAT IS NOT A CONSTANT: resolved in `spawnMob`, not at arm
    // time, because heroes level up inside a round. `"round"` restores the
    // pre-#290 curve (round 3 → the round-3 sheet, round 9 → the round-9 one).
    heroLevelSource: "matchHighest" as const,
    // ── 分紅獎池 (#288, owner 2026-07-29) ──────────────────────────────────
    // 「特殊殭屍也照傷害比例分,獎勵是金錢 +5,000 · 等級提升 +5」. Both numbers
    // are the owner's, verbatim.
    //
    // ⚠️ THIS REPLACES `rewardMult: 3` FOR THE SPECIAL — it does not stack. The
    // special used to pay 60 gold / 120 xp to the last hitter; it now pays a
    // 5,000-gold + 5-level pool divided among everyone who hurt it. That is a
    // ~83× reward increase, and it is deliberate: since GH#206 a 特殊殭屍 has
    // 12,764 hp at round 3 (a hero-derived mini-boss, not a fat zombie), so
    // killing one is a fight rather than a stray cleave.
    bountyGold: 5000,
    // NOT OWNER-SPECIFIED — he named gold and levels only. 200 is the king's
    // 1,200 scaled by the same 1/6 the gold pool is (5,000 vs 30,000), so the
    // special reads as 「王的六分之一」 on every currency instead of having one
    // number invented for it. A live 後台 knob like everything else here.
    bountyXp: 200,
    bountyLevels: 5,
    // 1 = NO 翻倍, unlike the king's 2. The owner's 「補最後一刀翻倍」 ruling was
    // about the 殭屍王; the instruction for the special is only 「照傷害比例分」,
    // so the shipped answer is a pure proportion.
    lastHitMultiplier: 1,
    // Inert while the multiplier is 1 (both modes agree there — see
    // mobBossBonus.test.ts). Authored anyway so raising the multiplier in the
    // console does not silently pick a mode the operator never saw.
    lastHitMode: "bonus" as const,
    splitByDamage: true,
    // owner 2026-07-29 「溢傷算不算?=> 不算」 — the same ruling as the king's.
    countOverkill: false,
  },
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

/**
 * config.combat-env@1 — the GLOBAL combat-environment multiplier table
 * (`config/combat-env.json`, task #28 admin 戰鬥系統). One multiplicative
 * factor per environment quantity; each factor is applied at exactly one sim
 * formula site (see `sim/combatEnv.ts` for the site table). 1.0 = neutral.
 * Keys are OPTIONAL (a sparse admin override is valid) and normalized onto
 * COMBAT_ENV_DEFAULTS via `normalizeCombatEnv` before entering the sim.
 * The key set is generated from the sim's COMBAT_ENV_KEYS, so the schema can
 * never drift from the engine.
 *
 * The eight #248 三圍 coefficients (`strToMaxHealth` …) ride the same table but
 * are COEFFICIENTS, not ×factors: their neutral value is the shipped WC3 number
 * (25 hp per strength point), not 1.0, and their legal band is 0..100 — which is
 * why `zEnvFactor` has always allowed 100 and why an omitted coefficient falls
 * back to `defaultForKey`, never to 1.0.
 */
const zEnvFactor = z.number().min(0).max(100);

export const zCombatEnvMultipliers = z
  .object(
    Object.fromEntries(COMBAT_ENV_KEYS.map((k) => [k, zEnvFactor.optional()])) as Record<
      CombatEnvKey,
      z.ZodOptional<z.ZodNumber>
    >,
  )
  .strict();

export const zConfigCombatEnvDoc = z
  .object({
    id: zId,
    schema: z.literal("config.combat-env@1"),
    /** monotonically bumped by the admin console on every published change */
    version: z.number().int().min(1),
    /** env-key -> factor; omitted keys mean 1.0 (neutral) */
    multipliers: zCombatEnvMultipliers,
  })
  .strict();

/**
 * config.base-bonus@1 — 基礎加成 (`config/base-bonus.json`): a FLAT grant added
 * to every champion's final stat, AFTER the combat-env multiplier and therefore
 * NOT scaled by it. owner 2026-07-28:「初始HP/MP/AP/AD/... 增加數值也要放到後台
 * 設定 並且不參與倍率計算」.
 *
 * ⚠️ 為什麼是自己一份文件,不是塞進 `config.combat-env@1`。那份文件的每個 key 都
 * 是**倍率**,而這裡每個 key 都是**加數**。合在一起的話,後台一個表格裡會有兩種
 * 語意相反的欄位共用同一種外觀 —— 把 300 打進倍率欄位是 300 倍傷害。
 *
 * 語意見 sim/baseBonus.ts。未列的 stat = 0(沒有贈禮),不是「沿用預設」。
 *
 * ⚠️ 每個 stat 都有**自己的區間** (task #277),和 combat-env 的 per-key bounds
 * 同一個形狀。舊版只有 `z.number().finite()`,於是 `maxHealth: -9999` 是一份
 * 完全合法的文件 —— 全 115 位英雄開場即死,而且三層(頁面/schema/sim)沒有一層
 * 會說話。區間本身定義在 `sim/baseBonus.ts`(`baseBonusBounds`),schema 這一層
 * 只是把它搬到 Zod 上,所以兩邊不可能漂走。
 *
 * 未知的鍵仍然被接受(`.catchall`,只要是有限數字)並在 `normalizeBaseBonus`
 * 被丟掉 —— 這維持了改版前的容忍度:一個打錯的 key 不該讓整棵內容樹載不起來。
 */
const zBaseBonusTable = z
  .object(
    Object.fromEntries(
      ALL_STATS.map((s) => {
        const [lo, hi] = baseBonusBounds(s);
        return [s, z.number().finite().min(lo).max(hi).optional()];
      }),
    ) as Record<Stat, z.ZodOptional<z.ZodNumber>>,
  )
  .catchall(z.number().finite());

export const zConfigBaseBonusDoc = z
  .object({
    id: zId,
    schema: z.literal("config.base-bonus@1"),
    /** stat key ("maxHealth" / "ad" / "ap" …) -> flat grant. 缺鍵 = 0。 */
    bonus: zBaseBonusTable,
  })
  .strict();

/**
 * config.stat-caps@1 — 屬性上限 (`config/stat-caps.json`, GH#286): 每條屬性的
 * **一般上限** 與 **解鎖上限**。owner 2026-07-28:「一般上限是 4.0,搭配特殊條件
 * 如技能、道具...等效果,可以解鎖最多到 10.0。這兩個參數也可以放到後台設定」.
 *
 * ⚠️ 又是一份自己的文件,理由和 `config.base-bonus@1` 一樣但更強:這裡每個 key
 * 的值是一個**上限對**,而 combat-env 是倍率、base-bonus 是加數。三種語意共用一張
 * 表格的話,操作者沒有任何線索分辨他填的 4.0 是「四倍」「+4 點」還是「天花板」。
 *
 * 語意見 sim/statCaps.ts。**缺文件 = 出貨預設**(攻速 4.0 / 10.0),缺鍵 =
 * 那條屬性退回 `STAT_CLAMPS` 的上界而且不可解鎖。
 */
export const zStatCap = z
  .object({
    /** 沒有解鎖來源時的上限 */
    base: z.number().finite(),
    /** `ModOp.CapRaise` 最多能抬到的硬上限(小於 base 會被讀成 base) */
    unlocked: z.number().finite(),
  })
  .strict();

export const zConfigStatCapsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stat-caps@1"),
    /** stat key ("as" / "ms" / "cdr" …) -> { base, unlocked } */
    caps: z.record(z.string().min(1), zStatCap),
  })
  .strict();

/**
 * config.combat-feel@1 — 戰鬥手感 (`config/combat-feel.json`, GH#193):
 * 擊退法則的三個參數 + 打就站定的開關與門檻。語意與出貨預設見 sim/combatFeel.ts。
 *
 * ⚠️ 為什麼又是一份自己的文件(現在 config 底下已經有四份「調參」文件):
 *   · combat-env  每格是**倍率**(1.0 = 不變)
 *   · base-bonus  每格是**加數**(0 = 沒有贈禮)
 *   · stat-caps   每格是一對**天花板**
 *   · combat-feel 每格是一條**規則的參數**(比例門檻 / 身位數 / 布林開關)
 * 混在一起的話,操作者沒有任何線索分辨他填的 0.05 是「打五折」「+0.05 點」
 * 「上限 0.05」還是「5% 的門檻」。
 *
 * **缺文件 = 出貨預設**(擊退 0.05/10/1.0、站定全開),不是空表。
 */
export const zConfigCombatFeelDoc = z
  .object({
    id: zId,
    schema: z.literal("config.combat-feel@1"),
    knockback: z
      .object({
        /** 傷害 / 受傷單位最大生命 低於此比例 → 完全不擊退 */
        minPct: z.number().min(0).max(1),
        /** 一擊打掉 100% 生命時的擊退身位數 */
        maxBodies: z.number().min(0).max(100),
        /** 一個身位 = 多少 GGD 單位 */
        bodyUnit: z.number().min(0).max(100),
      })
      .strict()
      .optional(),
    standstill: z
      .object({
        /** 總開關;false = 維持舊行為(邊走邊打) */
        enabled: z.boolean(),
        /** 「有在動」與「正在靠近」共用的速度門檻 (units/sec) */
        walkEps: z.number().min(0).max(100),
        /** 小怪(含殭屍王)是否同樣受約束 */
        applyToMobs: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * config.ambient-vfx@1 — AMBIENT vfx bindings (`config/ambient-vfx.json`):
 * per-model attachments that live while the entity lives (WC3 hero glows,
 * smolder trails, ribbon wings). Each binding names a `vfx` doc id from the
 * vfx collection (vfx@1 particle or ribbon@1 trail); the anchor bone lives ON
 * the vfx/ribbon doc itself, not the binding. Consumed by the client's
 * AmbientVfx channel; unknown modelKeys/doc ids degrade to no-ops.
 */
export const zAmbientVfxBinding = z
  .object({
    /** vfx-or-ribbon doc id in the vfx collection (SOFT: may be unauthored) */
    vfx: z.string().min(1),
  })
  .strict();

export const zConfigAmbientVfxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ambient-vfx@1"),
    /** modelKey -> ambient attachments applied while an entity uses the model */
    bindings: z.record(z.string().min(1), z.array(zAmbientVfxBinding)),
  })
  .strict();

/**
 * config.audio-map@1 — CLIENT audio bindings (`config/audio-map.json`):
 * scene → background-music track, and gameplay/UI event → SFX clip pool.
 * Consumed by the client's `audio/AudioSystem` (plain WebAudio, no Babylon):
 * `bgm` keys are scene names (menu/lobby/room/champSelect/intermission/
 * combat/fireRing/settlement + the one-shot stings battleStart/victory/
 * defeat), `sfx` keys are event names (the MSG.EVENT whitelist plus
 * client-only UI moments like `champSelectConfirm`). Both maps are OPEN
 * records: an unknown scene/event is simply silent, and a file that 404s is a
 * no-op — audio never throws into the frame loop.
 */
const zAudioAssetPath = z
  .string()
  .min(1)
  .regex(/^assets\//, "audio path must be relative to content/ and start with assets/");

export const zAudioBgmTrack = z
  .object({
    /** path under content/, e.g. "assets/audio/bgm/combat.mp3" */
    file: zAudioAssetPath,
    /** true = seamless loop (the file is loop-joined); false = one-shot sting */
    loop: z.boolean(),
    /** per-track gain multiplier applied on top of the BGM bus (default 1) */
    gain: z.number().min(0).max(4).optional(),
  })
  .strict();

export const zAudioSfxEntry = z
  .object({
    /** clip pool — one file is picked at random per trigger */
    files: z.array(zAudioAssetPath).min(1),
    /** per-event gain multiplier applied on top of the SFX bus (default 1) */
    gain: z.number().min(0).max(4).optional(),
    /** minimum ms between two plays of this event (bursts are dropped) */
    cooldownMs: z.number().min(0).optional(),
    /** max simultaneously-playing voices for this event */
    maxConcurrent: z.number().int().min(1).optional(),
  })
  .strict();

export const zConfigAudioMapDoc = z
  .object({
    id: zId,
    schema: z.literal("config.audio-map@1"),
    /** scene name -> background-music track */
    bgm: z.record(z.string().min(1), zAudioBgmTrack),
    /** event name -> SFX clip pool + throttling */
    sfx: z.record(z.string().min(1), zAudioSfxEntry),
  })
  .strict();

/**
 * config.champion-voices@1 — per-CHAMPION voice bindings
 * (`config/champion-voices.json`): the clip pool played when the player clicks
 * their own hero in battle. `select` lists w3x map quip clips extracted for
 * that champion (`source: "map-quip"`); champions with no map quip get an
 * empty pool (`source: "none"`) plus a `soundset` hint — the WC3 unit
 * soundset name the blizzard-local overlay can resolve to Blizzard click
 * lines on machines that staged `content/assets/blizzard-local/`. Missing
 * clips / null soundsets degrade to silence — never an error.
 */
export const zChampionVoiceEntry = z
  .object({
    /** click-quip clip pool, e.g. ["assets/audio/sfx/pikakill.mp3"] */
    select: z.array(zAudioAssetPath),
    /** where the pool came from: extracted map quips, or nothing authored */
    source: z.enum(["map-quip", "none"]),
    /** WC3 soundset name (blizzard-local overlay fallback hint) or null */
    soundset: z.string().min(1).nullable(),
  })
  .strict();

export const zConfigChampionVoicesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.champion-voices@1"),
    /** championId -> voice entry (every champion doc gets exactly one) */
    champions: z.record(zId, zChampionVoiceEntry),
  })
  .strict();

/**
 * config.unit-tints@1 — the w3x VERTEX-COLOUR PORTING LEDGER
 * (`config/unit-tints.json`, task #49).
 *
 * The champion-facing half of the port lives on the champion docs themselves
 * (`champion.tint` / `champion.alpha`) — that is what the renderer reads. This
 * doc is the COMPLETE extract, and exists because the map tints things GGD has
 * no collection for:
 *
 *   • `units` — every w3x unit whose effective art colour is non-neutral,
 *     keyed by its 4-char rawcode. The 20 that became champions carry
 *     `championId` and MUST agree with that champion doc (regression-tested);
 *     the other 32 are creeps/summons/bosses with no GGD doc yet, and this is
 *     the only place their colour survives until they are modelled.
 *   • `transient` — runtime `SetUnitVertexColorBJ` states a CHAMPION takes on
 *     during a buff (Berserker's red rage) and the restore that ends it. Not
 *     yet driven by the sim; recorded with its `war3map.j` line so the buff
 *     phase can wire it without re-reading the map. Two restores are flagged
 *     `erasesStaticTint` — original-map BUGS that reset the hero to white and
 *     destroy its identity tint for the rest of the match; the port must
 *     restore to `champion.tint`, never to white.
 *
 * Nothing here is read by the sim. Dummy-effect/missile unit tints are
 * deliberately OUT of scope (task #50 owns per-invocation VFX art params).
 */
export const zUnitTintEntry = z
  .object({
    /** the champion doc this w3x unit became; absent = no GGD doc yet */
    championId: zRef("champions").optional(),
    /** the unit's map name (context for a bare rawcode) */
    name: z.string().min(1),
    /** effective vertex-colour multiply; see `zTintRgb` */
    tint: zTintRgb.optional(),
    /** effective opacity; absent = 1 (every static w3u entry is opaque) */
    alpha: zAlpha.optional(),
    /**
     * `w3u-static`  — explicit `uclr/uclg/uclb` mods in `war3map.w3u`;
     * `w3u-base-inherited` — no mods of its own; the colour comes from the
     *                   entry's BASE, which is itself a `war3map.w3u` entry
     *                   (custom OR original table). #49 had no such step and
     *                   lost `U00L` (北斗之鼠) because of it — see task #263;
     * `slk-inherited` — no mods anywhere in the w3u chain; the colour comes
     *                   from the stock `Units\UnitUI.slk` row (43 units here).
     */
    source: z.enum(["w3u-static", "w3u-base-inherited", "slk-inherited"]),
    /** where the number came from, in enough detail to re-derive it */
    evidence: z.string().min(1),
  })
  .strict();

export const zUnitTintState = z
  .object({
    /** champion that takes on this state */
    championId: zRef("champions"),
    /** JASS trigger function the call lives in */
    trigger: z.string().min(1),
    /** line in the UNPROTECTED `GoDieEX22s-src/raw/war3map.j` */
    line: z.number().int().positive(),
    /** what the state is (ability name / "restore") */
    note: z.string().min(1),
    tint: zTintRgb.optional(),
    alpha: zAlpha.optional(),
    /**
     * true = the ORIGINAL MAP restores to white here and permanently erases
     * the champion's static tint. Do NOT reproduce: restore to `champion.tint`.
     */
    erasesStaticTint: z.boolean().optional(),
  })
  .strict();

export const zConfigUnitTintsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.unit-tints@1"),
    /** w3x unit rawcode (4 chars, case-sensitive) -> permanent colour */
    units: z.record(z.string().regex(/^[A-Za-z0-9]{4}$/, "w3x rawcode"), zUnitTintEntry),
    /** runtime buff-state colours, in `war3map.j` line order */
    transient: z.array(zUnitTintState),
  })
  .strict();

/**
 * config.gore@1 — the 濺血 STYLE KNOB (`config/gore.json`, task #39).
 *
 * The roster puts Pikachu, 初音 and 妙蛙種子 next to 死亡騎士 and 鋼彈, so how
 * bloody a landed hit sprays is an art/tone decision and belongs in content:
 *   • `style` — "blood" (red droplets + mist + a fading ground pool; the
 *     shipped default), "stylized" (a damage-type-tinted energy burst, no red
 *     and no ground pool) or "off" (the layer emits nothing at all).
 *   • `intensity` — 0..1, scales droplet counts, sizes and splat opacity.
 *   • `championStyles` — narrows the style for individual champions, so
 *     mechanical / undead / plant champions spray sparks or ichor, not blood.
 *
 * Consumed by the client's `vfx/goreConfig`, where a per-champion entry may
 * only ever REDUCE gore and the player's own setting is a hard floor — which
 * is why "blood" is not an accepted per-champion value. An absent doc leaves
 * the shipped default (blood @ 0.85). Purely presentational: never enters the
 * sim, never affects a damage number.
 */
export const zGoreStyle = z.enum(["blood", "stylized", "off"]);

export const zConfigGoreDoc = z
  .object({
    id: zId,
    schema: z.literal("config.gore@1"),
    /** global spray style */
    style: zGoreStyle,
    /** 0..1 spray density / opacity multiplier */
    intensity: z.number().min(0).max(1),
    /**
     * championId -> narrowed style (may only reduce gore, never add it).
     * SOFT by construction: a key naming a champion that no longer exists
     * simply never matches, so this table can never break a content build.
     */
    championStyles: z.record(zId, z.enum(["stylized", "off"])),
  })
  .strict();

/**
 * config.icon-plan@1 — WHICH content entries get a generated icon
 * (`config/icon-plan.json`, task #72), written by
 * `tools/icon-gen/src/plan.py --write` and read by the codex's broken-data
 * table and the 圖示覆蓋率 bar.
 *
 * PURELY DESCRIPTIVE. Nothing in the sim, the client renderer or the platform
 * reads it: it explains a gap, it never creates one. An entry the plan calls
 * "dropped" still ships, still appears in the codex, still works in a match —
 * the only consequence is that the paid image batch skips it.
 *
 * IT LIVES HERE, IN A SCHEMA-VALIDATED COLLECTION, ON PURPOSE. An unregistered
 * doc under `content/config/` loads fine until someone runs `content:build`,
 * which indexes every .json in the directory — and then the ContentLoader
 * throws on the unknown discriminator and the whole content load fails. Adding
 * the union member is the cost of putting a file here; the alternative is
 * `content/assets/`, which is served verbatim and validated by nobody.
 *
 * The rule keys (`recipe-book`, `third-party-ip`, …) are DATA, not schema: the
 * planner adds and retires rules as content changes, and a schema that
 * enumerated them would have to be edited in lockstep with a tool in another
 * language. So the buckets are a record, and each carries its own human
 * justification — that note is what the codex renders next to the entry.
 */
const zIconPlanBucket = z
  .object({
    /** short label for the group header */
    label: z.string(),
    /** why these entries are excluded — shown verbatim to the reader */
    note: z.string(),
    ids: z.array(z.string()),
  })
  .strict();

export const zConfigIconPlanDoc = z
  .object({
    id: zId,
    schema: z.literal("config.icon-plan@1"),
    /** the prompt-template version the batch would run with */
    templateVersion: z.string(),
    /** fingerprint of the content the plan was derived from */
    contentDigest: z.string(),
    counts: z
      .object({
        total: z.record(z.string(), z.number()),
        byFamily: z.record(z.string(), z.record(z.string(), z.number())),
      })
      .strict(),
    /** importer resolution -> how many icon-less entries came from it */
    provenance: z.record(z.string(), z.number()),
    /** rule key -> the entries deliberately never generated */
    dropped: z.record(z.string(), zIconPlanBucket),
    /** rule key -> the entries held pending a human decision */
    blocked: z.record(z.string(), zIconPlanBucket),
    generate: z
      .object({
        tier1: z.array(z.object({ id: z.string(), family: z.string() }).strict()),
        tier2: z.array(z.object({ id: z.string(), family: z.string() }).strict()),
      })
      .strict(),
    /** ids a live surface protects from ever being dropped */
    vetoed: z.array(z.string()),
    /** live-surface files the planner could not find (a too-narrow veto) */
    missingSurfaceFiles: z.array(z.string()),
  })
  .strict();

/**
 * config.victory-taunts@1 — the VICTORY VO SCRIPT (`config/victory-taunts.json`,
 * task #93 勝利演出). Two tiers of taunt live in one doc:
 *
 *   • `roundWin` — tier 1 (grey screen, small fireworks): one pool per CHAMPION,
 *     keyed by champion id, each line riffing on that champion's source
 *     character + 稱號. Every champion on the roster has an entry today, but the
 *     record is open by construction (as in `config.gore@1`): a key naming a
 *     champion that no longer exists simply never matches, so retiring a
 *     champion can never break a content build.
 *   • `matchWin` — tier 2 (dark screen, giant roast-chicken firework):
 *     champion-agnostic, one shared pool.
 *   • `roundWinFallback` — what plays when a champion's own pool is drained, or
 *     for a champion with nothing quotable to twist. Non-empty, so the
 *     presentation layer always has a line and never has to handle silence.
 *
 * Every line is one PRE-RENDERED clip staged under
 * `content/assets/audio/voice-taunt/`, generated by tools/tts-gen from
 * `content/audio-manifests/taunts.json`: `id` is the manifest id, `file` the
 * staged mp3, `text` the script (subtitle copy, and the record of what was
 * said), `langs` the languages actually spoken, in fragment order — a line may
 * switch language mid-sentence (「うそだ！抱歉，是真的。」), which is why it is a
 * list and not a single tag. `voices` and `rate` record the cast and speaking
 * rate the clips were rendered WITH: provenance for a re-render, not playback
 * parameters.
 *
 * `note` and `direction` are the authoring brief, kept next to the copy because
 * they are the two rules a rewrite must not lose: the lines are ORIGINAL
 * writing that twists a well-known catchphrase into an insult aimed at the
 * loser (never a reproduced quote), and the delivery is flat and emotionless —
 * the line is the joke, the voice never performs it. Same aesthetic the
 * announcer pack is held to; see `announcerVo.test.ts`.
 *
 * Purely presentational: nothing here enters the sim or touches a damage number.
 */
export const zVictoryTauntLang = z.enum(["zh", "ja", "en"]);

/** One pre-rendered clip: manifest id, staged mp3, and the script it reads. */
export const zVictoryTauntLine = z
  .object({
    /** tools/tts-gen manifest id, e.g. "taunt-round-godie-e001-2" */
    id: zId,
    /** path under content/, e.g. "assets/audio/voice-taunt/round/godie-e001-1.mp3" */
    file: zAudioAssetPath,
    /** the spoken script — doubles as the subtitle copy */
    text: z.string().min(1),
  })
  .strict();

/** A taunt line also tags the languages spoken in it, in fragment order. */
export const zVictoryTauntTaggedLine = zVictoryTauntLine
  .extend({
    /** languages heard in the clip, in the order they are spoken */
    langs: z.array(zVictoryTauntLang).min(1),
  })
  .strict();

/** One champion's tier-1 pool, plus the context the jokes were written from. */
export const zVictoryTauntChampionEntry = z
  .object({
    /** the champion as the copy addresses it (稱號 - 角色名) */
    name: z.string().min(1),
    /**
     * the source work whose catchphrase the lines twist, or null when none was
     * recorded — a null is a missing ANNOTATION, not a missing pool: the entry
     * still carries its full set of lines. Present-and-null (never absent), so
     * "unattributed" stays a deliberate state, as with `soundset` above.
     */
    source: z.string().min(1).nullable(),
    lines: z.array(zVictoryTauntTaggedLine).min(1),
  })
  .strict();

export const zConfigVictoryTauntsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.victory-taunts@1"),
    /** the authoring brief: what each tier is and what the copy may be */
    note: z.string().min(1),
    /** the delivery direction the clips were cast and rendered to */
    direction: z.string().min(1),
    /** BCP-47 tag -> the TTS voice that read that language (re-render provenance) */
    voices: z.record(z.string().min(1), z.string().min(1)),
    /** words-per-minute each tier was rendered at (re-render provenance) */
    rate: z
      .object({
        roundWin: z.number().int().positive(),
        matchWin: z.number().int().positive(),
      })
      .strict(),
    /** championId -> that champion's tier-1 pool */
    roundWin: z.record(zId, zVictoryTauntChampionEntry),
    /** tier-1 lines for a drained pool / a champion with no entry */
    roundWinFallback: z.array(zVictoryTauntLine).min(1),
    /** tier-2 pool, champion-agnostic */
    matchWin: z.array(zVictoryTauntTaggedLine).min(1),
  })
  .strict();

/**
 * config.voxel-barcodes@1 — 特徵生成 (docs/_體素特徵生成規格.md) L0, the layer the
 * ADMIN CONSOLE writes.
 *
 * WHY THIS DOC EXISTS SEPARATELY FROM `content/models/_voxel-barcodes.json`.
 * That file is the shipped SEED: it is a sidecar (leading underscore), so the
 * indexer skips it and it is fetched by path, exactly like `_voxel-skins.json`.
 * A sidecar cannot be the console's write target, because the platform's durable
 * overlay keys are `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$` — an id may not START
 * with an underscore, so `models/_voxel-barcodes` is a 400 and there is no
 * spelling of it that is not. This doc is the overlay-writable half:
 *
 *   effective barcode(champion) = overlay(config/voxel-barcodes).barcodes[id]
 *                              ?? seed(models/_voxel-barcodes.json).barcodes[id]
 *
 * so `barcodes` here holds ONLY what an operator edited. An empty map is the
 * shipped state and means "every champion is still on the seed", which is what
 * lets the console's per-champion badge tell 「後台改過的版本」 from 「出貨預設值」
 * as a FACT about the data rather than as decoration.
 *
 * IT LIVES IN A SCHEMA-VALIDATED COLLECTION FOR THE REASON `config.icon-plan@1`
 * spells out above, plus one this doc has and that one does not: the overlay
 * merge (`OverlayContentSource.readManifest`) publishes EVERY collection the
 * overlay touches, and `ContentLoader` rejects a collection it has no schema
 * for. So an unregistered home for this doc would not fail at authoring time —
 * it would fail on the host, at boot, the first time the owner pressed 儲存.
 *
 * The band shape is restated in zod rather than derived from `BarcodeBand`:
 * `BARCODE_SLOTS` is imported so the eleven keys and their ANATOMICAL ORDER
 * cannot drift, but the value constraints (a strict `#rrggbb`, a positive frac)
 * are checks a TypeScript interface cannot make on a JSON file.
 */
const zBarcodeHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "顏色必須是 #rrggbb");

const zBarcodeBand = z
  .object({
    hex: zBarcodeHex,
    /** share of the WHOLE figure's height; present bands sum to 1.0 */
    frac: z.number().gt(0).max(1),
  })
  .strict();

/** The eleven slots, every key present, an absent slot explicitly `null`. */
const zBarcodeBands = z
  .object(
    Object.fromEntries(BARCODE_SLOTS.map((s) => [s, zBarcodeBand.nullable()])) as Record<
      (typeof BARCODE_SLOTS)[number],
      z.ZodNullable<typeof zBarcodeBand>
    >,
  )
  .strict();

const zVoxelBarcodeEntry = z
  .object({
    v: z.literal(1),
    championId: zId,
    bands: zBarcodeBands,
    sleeve: z.enum(["long", "short", "none"]),
    faceColors: z
      .object({ eye: zBarcodeHex, nose: zBarcodeHex.nullable(), mouth: zBarcodeHex })
      .strict(),
    /** MANDATORY audit field — who decided this barcode (規格 §6). */
    source: z.enum(["manual", "extracted", "keyword", "generated"]),
    extraction: z
      .object({
        refImage: z.string().min(1),
        verdict: z.enum(["PASS", "SUSPECT", "FAIL", "DUPLICATE"]),
        reasons: z.array(z.string()),
        maxPairwiseDeltaE: z.number(),
        foregroundRatio: z.number(),
      })
      .strict()
      .optional(),
    note: z.string().optional(),
  })
  .strict();

export const zConfigVoxelBarcodesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.voxel-barcodes@1"),
    note: z.string().optional(),
    /** the file's own copy of the anatomical order — a formatter that
     *  alphabetised the slot keys shows up here instead of silently re-stacking
     *  every character */
    slotOrder: z.array(z.string()).optional(),
    /** championId -> the barcode an operator authored. Empty = all seed. */
    barcodes: z.record(zId, zVoxelBarcodeEntry),
  })
  .strict();

/**
 * config.voxel-bodies@1 — WHICH BODY EACH CHAMPION WEARS, and the ONLY place an
 * operator's answer to that question survives a deploy.
 *
 * owner, 2026-07-28:「請你都先用暴雪的 3d model，要替換成體素是我從後台設定套用
 * 才生效」.
 *
 * THE THREE-LAYER RESOLUTION, most specific first:
 *
 *   effective preferVoxelBody(champion)
 *     = overlay(config/voxel-bodies).bodies[id]                    ← 後台開關
 *    ?? seed(models/_voxel-skins.json).overrides[id].preferVoxelBody ← 手工美術指定
 *    ?? defaultPrefersVoxelBody(modelKey, id)                       ← 「有自己的模型就用」
 *
 * ⚠️ WHY THIS IS A CONFIG DOC AND NOT A FIELD IN `models/_voxel-skins.json`.
 * That file is a sidecar baked into the image. Had the console written to it,
 * every `docker compose build` would have restored the repo's copy and SILENTLY
 * DISCARDED the operator's choices — a setting that works all week and then
 * quietly reverts on the next deploy, with no error anywhere. The durable
 * overlay is the only writable surface that outlives an image, and its keys may
 * not start with `_`, so a sidecar could not be its target even in principle
 * (see `config.voxel-barcodes@1` above, which hit the same wall).
 *
 * `bodies` therefore holds ONLY what an operator explicitly toggled. Empty is
 * the shipped state and means 「全部照預設」 — which lets the console show
 * 「後台改過」 vs 「預設」 as a fact about the data rather than as a guess.
 */
export const zConfigVoxelBodiesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.voxel-bodies@1"),
    note: z.string().optional(),
    /**
     * championId -> true = 體素身體, false = 自己的 3D 模型.
     * BOTH directions are stored on purpose: an operator must be able to force a
     * Blizzard-modelled champion back onto voxel AND to force a voxel champion
     * onto whatever model it has. A one-way switch is a lever, not a setting.
     */
    bodies: z.record(zId, z.boolean()),
  })
  .strict();

/**
 * config.form-visuals@1 — 變身「看得出來」的三個旋鈕 (`config/form-visuals.json`,
 * task #249 / GH#288).
 *
 * ---------------------------------------------------------------------------
 * 為什麼這是一份 **設定**,而不是從 w3x 抄過來的事實
 * ---------------------------------------------------------------------------
 * owner:「基本上變身前後都是同一模型,但是附帶不同球體效果及 3D model 顏色、
 * 大小、能力屬性變化而已」。對 26 對裡的多數這是對的,但對本次上架的兩對,
 * **w3u 的顏色與大小欄位是空的**,查證如下(不要再查一次,直接看這裡):
 *
 *   · 09 悟空  `Ogrh` uclr/uclg/uclb 未設 → tint [1,1,1];`usca` 未設 → 1.0
 *              `O00X` 同上,tint [1,1,1]、`usca` 未設 → 1.0
 *              → **顏色與大小完全相同**。真正的差別是球體掛件:
 *                `Ogrh` 掛 `A0MI` 球體(悟空正常) = `Gokuhead.mdx`,
 *                `O00X` 掛 `A0MJ` 球體(悟空超3)  = `Goku3head.mdx`。
 *   · 20 Saber `E002` / `E00L` 兩半都是 tint [1,1,1]、`usca` 1.10 —— 一模一樣,
 *              而且 `O00X` 有的那種球體它一個也沒有(`E00L` 多的是 `A05M`
 *              法術書與 `A0M3` 攻擊修飾,兩個都沒有 art)。
 *   · `war3map.j` 全域搜 `SetUnitVertexColorBJ`,A09E(超級賽亞人)與 A0DZ
 *     (風王結界)兩條觸發**都沒有**改顏色(A09E 只放地震/踏地/雷擊特效)。
 *
 * 也就是說:照抄 w3x,這兩對變身在畫面上 **完全看不出來**。所以顏色與大小是
 * 這裡授權操作者做的**美術決定**,出貨預設是刻意挑的,不是量到的 —— 而球體
 * 掛件那一項是真的 w3x 事實。`championFormVisuals.test.ts` 把這段話的每一句
 * 都釘在匯入器的 fixture 上,所以它不會慢慢變成謊話。
 *
 * ---------------------------------------------------------------------------
 * 為什麼掛件是「執行期掛」而不是烘進 glb
 * ---------------------------------------------------------------------------
 * `godie-ogrh` 與 `godie-o00x` **共用 `imported.goku` 這一個 modelKey**,而
 * `Gokuhead` 已經在 #267 被烘進 `goku.glb` 了。把 `Goku3head` 也烘進去 ⇒
 * **基本型悟空也會長出超三的頭**。所以變身態的頭是執行期掛在 ChampionView 上
 * 的第二個 glb,base 那一半的設定表裡根本沒有這個欄位可以填。
 *
 * ---------------------------------------------------------------------------
 * 三個全域旋鈕的語意(每一個都能把功能整個關掉)
 * ---------------------------------------------------------------------------
 *   · `enabled`            總開關。false = 變身完全不改外觀(回到 v0.9.12 行為)。
 *   · `tintStrength`       0..1,對「顏色偏離白色的量」的濃度。0 = 不上色,
 *                          1 = 完全照 `forms[].tint`。**不是**直接乘上去 ——
 *                          直接乘會讓 0 變成全黑,那是關不掉的意思相反。
 *   · `scaleStrength`      0..2,對「大小偏離 1.0 的量」的濃度。0 = 不縮放。
 *   · `attachmentsEnabled` 球體掛件的獨立開關(掛件要多載一個 glb,所以低階
 *                          機器可以只留顏色與大小)。
 */
export const zFormVisualEntry = z
  .object({
    /** 這一格是怎麼來的 —— w3x 事實 or 美術決定,寫給下一個人看 */
    note: z.string().optional(),
    /**
     * 乘在 albedo/diffuse 上的 [r,g,b](和 #49 的 `tint` 同一條管線,同一個語意:
     * 乘法,不是覆蓋)。`[1,1,1]` 與省略同義。上界 4 而不是 1:WC3 的
     * `SetUnitVertexColor` 只能變暗,但這裡是美術決定,要能打亮一個金色超賽。
     */
    tint: z.tuple([z.number().min(0).max(4), z.number().min(0).max(4), z.number().min(0).max(4)]).optional(),
    /**
     * 疊在 #150 身高正規化 **之上** 的倍率(1 = 和本體一樣高)。
     * 上界 3 對齊 `_standin-overrides.json` 已經在用的最大值(O030 的 3.0);
     * 下界 0.2 以下就小到看不見了,那不叫變身。
     */
    scaleMult: z.number().min(0.2).max(3).optional(),
    /** 掛件的 models/ 文件 id(例:`imported.goku3head`)。省略 = 沒有掛件。 */
    attachModelKey: z.string().min(1).optional(),
    /**
     * 掛點。`"origin"`(預設,也是 w3x 對 A0MI/A0MJ 記的值)= 模型原點;
     * 其他值當骨頭名稱,找不到就退回模型原點(絕不丟例外)。
     */
    attachBone: z.string().min(1).optional(),
    /**
     * 掛件在**掛點的 local frame**(= 本體 glb 的原生座標系)裡的縮放。
     *
     * 為什麼預設是 0.3221 而不是 1:兩份 glb 是用**不同的轉檔倍率**烘出來的。
     * `goku.glb` 走英雄身高規則(整隻 1.70u),`goku3head.glb` 走 1/36 道具倍率
     * (2.836u,比本體還高)。0.3221 = 0.008946 / 0.027778,就是把後者換算回前者
     * 的座標系。換算完 SSJ3 的頭髮落在 Y 0.73..1.65,而本體頭骨在 1.476、
     * 頭頂在 1.698 —— 自己站到正確位置,所以 `attachOffsetY` 是 0。
     */
    attachScale: z.number().min(0.01).max(10).optional(),
    /** 掛件沿 Y 的微調,單位是掛點 local frame。0 = 用 mdx 自己烘的高度。 */
    attachOffsetY: z.number().min(-5).max(5).optional(),
  })
  .strict();

export const zConfigFormVisualsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.form-visuals@1"),
    note: z.string().optional(),
    /** 總開關。false = 變身不改外觀。 */
    enabled: z.boolean(),
    /** 0..1 顏色濃度(0 = 不上色,1 = 照 `forms[].tint`)。 */
    tintStrength: z.number().min(0).max(1),
    /** 0..2 大小濃度(0 = 不縮放,1 = 照 `forms[].scaleMult`)。 */
    scaleStrength: z.number().min(0).max(2),
    /** 球體掛件的獨立開關。 */
    attachmentsEnabled: z.boolean(),
    /**
     * **變身態 championId** -> 這一態長什麼樣。
     *
     * ⚠️ key 一律是 `Emeu` 那一半。`resolveFormVisual` 會再驗一次
     * `isAlternateForm(id)`,所以就算有人把 `godie-ogrh` 填進來,基本型也拿不到
     * 任何外觀 —— 這正是「基本型悟空不可以長出超三的頭」的資料層防線。
     */
    forms: z.record(zId, zFormVisualEntry),
  })
  .strict();

/** The `config` collection accepts all variants (discriminated on `schema`). */
export const zConfigDoc = z.discriminatedUnion("schema", [
  zConfigMatchDoc,
  zConfigStoreDoc,
  zConfigArenaRulesDoc,
  zConfigCombatEnvDoc,
  zConfigAmbientVfxDoc,
  zConfigAudioMapDoc,
  zConfigChampionVoicesDoc,
  zConfigUnitTintsDoc,
  zConfigGoreDoc,
  zConfigIconPlanDoc,
  zConfigVictoryTauntsDoc,
  zConfigVoxelBarcodesDoc,
  zConfigVoxelBodiesDoc,
  zConfigBaseBonusDoc,
  zConfigStatCapsDoc,
  zConfigCombatFeelDoc,
  zConfigFormVisualsDoc,
]);

/** ConfigDoc keeps naming the canonical match config (existing consumers). */
export type ConfigVoxelBodiesDoc = z.infer<typeof zConfigVoxelBodiesDoc>;
export type ConfigDoc = z.infer<typeof zConfigMatchDoc>;
export type ConfigMatchDoc = z.infer<typeof zConfigMatchDoc>;
export type ConfigStoreDoc = z.infer<typeof zConfigStoreDoc>;
export type ArenaRoundGrant = z.infer<typeof zArenaRoundGrant>;
export type ConfigArenaRulesDoc = z.infer<typeof zConfigArenaRulesDoc>;
export type CombatEnvMultipliersDoc = z.infer<typeof zCombatEnvMultipliers>;
export type ConfigCombatEnvDoc = z.infer<typeof zConfigCombatEnvDoc>;
export type AmbientVfxBinding = z.infer<typeof zAmbientVfxBinding>;
export type ConfigAmbientVfxDoc = z.infer<typeof zConfigAmbientVfxDoc>;
export type AudioBgmTrack = z.infer<typeof zAudioBgmTrack>;
export type AudioSfxEntry = z.infer<typeof zAudioSfxEntry>;
export type ConfigAudioMapDoc = z.infer<typeof zConfigAudioMapDoc>;
export type ChampionVoiceEntry = z.infer<typeof zChampionVoiceEntry>;
export type ConfigChampionVoicesDoc = z.infer<typeof zConfigChampionVoicesDoc>;
export type UnitTintEntry = z.infer<typeof zUnitTintEntry>;
export type UnitTintState = z.infer<typeof zUnitTintState>;
export type ConfigUnitTintsDoc = z.infer<typeof zConfigUnitTintsDoc>;
export type GoreStyle = z.infer<typeof zGoreStyle>;
export type ConfigGoreDoc = z.infer<typeof zConfigGoreDoc>;
export type ConfigIconPlanDoc = z.infer<typeof zConfigIconPlanDoc>;
export type VictoryTauntLang = z.infer<typeof zVictoryTauntLang>;
export type VictoryTauntLine = z.infer<typeof zVictoryTauntLine>;
export type VictoryTauntTaggedLine = z.infer<typeof zVictoryTauntTaggedLine>;
export type VictoryTauntChampionEntry = z.infer<typeof zVictoryTauntChampionEntry>;
export type ConfigVictoryTauntsDoc = z.infer<typeof zConfigVictoryTauntsDoc>;
export type ConfigVoxelBarcodesDoc = z.infer<typeof zConfigVoxelBarcodesDoc>;
export type ConfigBaseBonusDoc = z.infer<typeof zConfigBaseBonusDoc>;
export type StatCapDoc = z.infer<typeof zStatCap>;
export type ConfigStatCapsDoc = z.infer<typeof zConfigStatCapsDoc>;
export type ConfigCombatFeelDoc = z.infer<typeof zConfigCombatFeelDoc>;
export type FormVisualEntry = z.infer<typeof zFormVisualEntry>;
export type ConfigFormVisualsDoc = z.infer<typeof zConfigFormVisualsDoc>;
export type AnyConfigDoc = z.infer<typeof zConfigDoc>;

/**
 * 出貨預設 —— 文件不存在時 `resolveFormVisual` 讀的就是這一份。
 *
 * ⚠️ 這裡的每一個數字都要和 `content/config/form-visuals.json` 一字不差,
 * `championFormVisuals.test.ts` 的 drift 斷言在守(缺一個欄位就紅)。
 * 兩者存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**
 * (內容掛掉時遊戲還是要能跑,而且要跑成一樣的樣子)。
 */
export const DEFAULT_FORM_VISUALS: ConfigFormVisualsDoc = {
  id: "form-visuals",
  schema: "config.form-visuals@1",
  enabled: true,
  tintStrength: 1,
  scaleStrength: 1,
  attachmentsEnabled: true,
  forms: {
    // 09 悟空 → 超級賽亞人。掛件是 w3x 事實(A0MJ 球體(悟空超3) = Goku3head.mdx);
    // 金色與 +8% 身高是美術決定(w3u 兩半的 tint/usca 完全相同)。
    "godie-o00x": {
      note: "掛件=w3x A0MJ 球體(悟空超3),掛點 origin 也是 w3x 記的;金色 tint 與 1.08 倍身高是美術決定,w3u 兩半同色同大小",
      tint: [1.45, 1.3, 0.55],
      scaleMult: 1.08,
      attachModelKey: "imported.goku3head",
      attachBone: "origin",
      attachScale: 0.3221,
      attachOffsetY: 0,
    },
    // 20 Saber → 風王結界。w3x 沒有任何視覺差(同模型、同色、同 usca 1.10,
    // 且 A0DZ 觸發不改 vertex color),所以整格都是美術決定。
    "godie-e00l": {
      note: "w3x 無任何視覺差(同模型/同色/同 usca);風王結界的青白光暈與 1.04 倍身高皆為美術決定",
      tint: [0.72, 0.92, 1.35],
      scaleMult: 1.04,
    },
  },
};
