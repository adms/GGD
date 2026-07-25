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

/**
 * Fire-ring (火圈 / 火環) schedule — the round-pacing hazard (task #132). Lives
 * inside `config.match@1`'s `match` block next to `combatMaxSec`. Percentages
 * are fractions of each victim's OWN maxHealth; the burn ignores armor/MR (it
 * is TRUE damage) and the combat-env damage knob. `startSec` doubles as the
 * intended round length (single source of truth) — see the field on the match
 * object. Optional + additive: absent = no ring (legacy behavior).
 */
export const zFireRingConfig = z
  .object({
    /** combat-elapsed seconds until the ring ignites (== intended round length) */
    startSec: z.number().positive(),
    /** ramp step length — the "per second" of the 1%/s, 2%/s … escalation */
    stepSec: z.number().positive(),
    /** maxHealth fraction ADDED to the per-second burn rate each step (0.01 = +1%/s) */
    pctPerStep: z.number().min(0).max(1),
    /** safety cap on the per-second burn rate (fraction of maxHealth); absent = uncapped */
    maxPctPerSec: z.number().min(0).max(1).optional(),
  })
  .strict();

export type FireRingConfig = z.infer<typeof zFireRingConfig>;

/** Contract defaults for the fireRing block (dev cheats / fallbacks). */
export const DEFAULT_FIRE_RING_CONFIG: FireRingConfig = {
  startSec: 180,
  stepSec: 1,
  pctPerStep: 0.01,
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
         * and settles a stalemate well before this cap. Must be >= the ring
         * start so the ring always has room to do its work (refine below).
         */
        combatMaxSec: z.number().positive(),
        /**
         * Fire ring (火圈 / 火環, task #132) — the round-pacing accelerator.
         * `startSec` is the SINGLE SOURCE OF TRUTH for round length: at that
         * combat-elapsed time the ring closes in and burns every living
         * champion with an escalating, defence-ignoring %-HP true-damage ramp
         * (1%/s at t+1s, 2%/s at t+2s …), so a normal round settles by ~3-4 min
         * and stalemates are punished. Optional + additive: an absent block =
         * no ring (legacy behavior). Consumed by the sim via
         * `fireRingRulesFromConfig` → `beginCombatFireRing`.
         */
        fireRing: zFireRingConfig.optional(),
        resolutionSec: z.number().positive(),
      })
      .strict()
      .refine((m) => !m.fireRing || m.fireRing.startSec <= m.combatMaxSec, {
        message:
          "match.fireRing.startSec must be <= match.combatMaxSec (the ring must ignite before the hard combat backstop)",
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
  })
  .strict();

/**
 * config.combat-env@1 — the GLOBAL combat-environment multiplier table
 * (`config/combat-env.json`, task #28 admin 戰鬥系統). One multiplicative
 * factor per environment quantity; each factor is applied at exactly one sim
 * formula site (see `sim/combatEnv.ts` for the site table). 1.0 = neutral.
 * Keys are OPTIONAL (a sparse admin override is valid) and normalized onto
 * the all-1.0 default via `normalizeCombatEnv` before entering the sim.
 * The key set is generated from the sim's COMBAT_ENV_KEYS, so the schema can
 * never drift from the engine.
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
     * `slk-inherited` — no mods; the colour comes from the BASE unit's stock
     *                   `Units\UnitUI.slk` row (43 units in this map).
     */
    source: z.enum(["w3u-static", "slk-inherited"]),
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
]);

/** ConfigDoc keeps naming the canonical match config (existing consumers). */
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
export type AnyConfigDoc = z.infer<typeof zConfigDoc>;
