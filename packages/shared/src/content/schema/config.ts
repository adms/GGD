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
// 屬性上限的 per-stat 區間 —— 同一條規矩:數字定義在 sim,schema 只是搬上 Zod。
import { STAT_CAP_CEILING, statCapBounds } from "../../sim/statCaps";
// The eleven barcode slots, in ANATOMICAL ORDER. Imported (not restated) so the
// stored doc's keys can never drift from the model — see zConfigVoxelBarcodesDoc.
// `voxelSkin/types` is a leaf: zero imports of its own, no zod, no sim.
import { BARCODE_SLOTS } from "../voxelSkin/types";
// 每回合 S~D 評價的係數 (#212/#232)。整份 schema 定在自己的檔案裡(欄位多、
// 上下界全部從 sim 的 ROUND_GRADE_BOUNDS 生),這裡只把它掛進 collection union。
import { zConfigRoundGradeDoc } from "./roundGrade";
// config.vfx-families@1 lives in ./vfx next to the vfx@1 docs it tunes (the
// w3x art family layer); only its union membership belongs here.
import { zConfigVfxFamiliesDoc } from "./vfx";
// 嘲弄規則的上界 —— 定義在 sim/taunt.ts(sim 也夾同一個數字),schema 只是把它
// 接上 Zod,所以兩層守的不可能是兩個數字。
import {
  TAUNT_DURATION_MULT_MAX,
  TAUNT_LEASH_MAX,
  TAUNT_MAX_TARGETS,
} from "../../sim/taunt";
// 火圈灼燒曲線的出貨值 —— 定義在 sim/fireRing.ts（sim 缺欄位時退回同一份），
// schema 只是把它接上 Zod 的 `.default()`。抄第二份就是兩個「沒填的話燒多少」。
import { DEFAULT_BURN_CURVE } from "../../sim/fireRing";

/**
 * Fire-ring (火圈 / 火環) schedule — the round-pacing hazard (tasks #132/#195).
 * Lives inside `config.match@1`'s `match` block next to `combatMaxSec`.
 *
 * #195 turned the ring from a global burn timer into a SHRINKING ring: it
 * ignites `startSec` combat-elapsed seconds in, contracts from the zone
 * boundary to `minRadius` over `shrinkSec`, and burns only the champions
 * OUTSIDE it, at a rate read off the `burnCurve` breakpoint table. `stepSec`/
 * `pctPerStep` are gone with the staircase they described, and (owner
 * 2026-08-02) `burnPctPerSecStart`/`burnPctPerSecEnd` are gone with the
 * two-point ramp THEY described — the block is `.strict()`, so an old doc fails
 * loudly instead of silently arming a ring with the wrong burn.
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
    /**
     * 灼燒曲線 (owner 2026-08-02):
     *
     *   「火圈應該是**隨秒數越高越燒越痛**的生命百分比的真實傷害
     *     (極端情形第100秒後燒100%真實傷害=必死)」
     *
     * 一張斷點表，x 是**火圈點燃後**經過的秒數，y 是那一刻每秒燒掉的自身最大
     * 生命比例；中間線性內插，最後一列之後**維持**在那個值。
     *
     * ⚠️ 它取代了 `burnPctPerSecStart` / `burnPctPerSecEnd`，而不是和它們並存。
     * 舊的兩點式 x 軸是**收圈進度**，20 秒就飽和 —— owner 要的「越燒越痛」在那
     * 個座標系裡根本表達不出來。兩個欄位並存就是兩個地方回答「這一刻燒多少」，
     * 也就是 `tauntRules.priority` 那份驗屍報告寫的同一種 drift。
     *
     * ⚠️ **x 是「點燃後」不是「回合第幾秒」，這一格刻意不是開關。**
     * `extendRoundForBoss` 把起燃往後推 180 秒，決賽輪則直接換成 180 秒；用
     * 回合絕對秒數查表的話，王局的圈一點燃就已經走完整張表 —— 實測「圈外站著
     * 不回來」從 11.60 秒死變成 1.03 秒死，20 秒的收圈張力整個塌掉。一個只有
     * 一種取值不是壞掉的「決策點」不是決策點。
     * owner 的「第 100 秒」因此是**出貨 `startSec: 60` 之下**的 `sec: 40`；
     * 後台頁把兩種時鐘並排顯示，所以改 `startSec` 時看得見錨點跑到哪。
     *
     * 上下界（CLAUDE.md「欄位要有上界，不是只有下界」）:
     *   · `sec` 0～600 —— 一個圈最長能燒多久是 `hardDeadline − hardCap`（出貨
     *     40 秒，上界情境下也不到 3600），600 = 10 分鐘已經遠在任何人會授權的
     *     回合長度之外，純粹是誤植守衛。
     *   · `pctPerSec` 0～2 —— 1.0 = 100 %/秒 = 一秒燒完一條滿血 = owner 說的
     *     「必死」。上界**刻意留在必死之上**：2.0 = 0.5 秒 = 15 個 tick，紅
     *     畫面與灼燒音效還來得及被看見/聽見；再往上火圈就不是危險而是一條瞬殺
     *     線，那是 `minRadius` 幾何的工作，不是燒傷的。
     *   · 2～8 列 —— 一個點畫不出「越燒越痛」（而且 `compileBurnCurve` 對空表
     *     會整張退回出貨曲線，等於操作者存了一列、遊戲照舊）；8 列與
     *     `attackRangeCurve` 同，也讓每 tick 的掃描最多 7 次比較。
     */
    burnCurve: z
      .array(
        z
          .object({
            /** 火圈**點燃後**經過的秒數（不是回合秒數） */
            sec: z.number().min(0).max(600),
            /** 這一刻每秒燒掉的自身最大生命比例。1 = 100 %/秒 = 一秒必死 */
            pctPerSec: z.number().min(0).max(2),
          })
          .strict(),
      )
      .min(2)
      .max(8)
      // 第一列必須是點燃當下,否則「起燃時每秒燒多少」有兩個答案:表上第一列的
      // 值,和 `fireRingRatePerSec` 在第一列之前那段夾出來的平值。
      .refine((pts) => pts[0]!.sec === 0, {
        message: "match.fireRing.burnCurve 的第一列必須是 sec: 0（火圈點燃的那一刻）",
      })
      // 嚴格遞增:重複的 sec 會讓內插的分母是 0,順序錯掉的表在畫面上完全正常
      // 而燒傷是亂的。
      .refine((pts) => pts.every((p, i) => i === 0 || p.sec > pts[i - 1]!.sec), {
        message:
          "match.fireRing.burnCurve 必須依 sec 由小到大排列，而且不可以有重複的秒數",
      })
      .default(DEFAULT_BURN_CURVE as { sec: number; pctPerSec: number }[]),
    /**
     * 每秒燒傷的安全上限（佔最大生命）。留白 = 不設限（曲線自己說了算）。
     *
     * ⚠️ 上界和 `burnCurve[].pctPerSec` 一樣是 2，理由同上 —— 一道比曲線本身
     * 還低的牆會讓操作者調了曲線卻沒有任何效果，那是最難查的一種「改了沒用」。
     */
    maxPctPerSec: z.number().min(0).max(2).optional(),
    /**
     * 回合硬上限 (#248). owner 2026-08-01:
     *
     *   「時間延長太久了，**不管什麼條件**，每回合最長上限就是 5 分鐘出現火圈
     *     準備收場，不會無限增加時間」
     *
     * The combat-elapsed second at which the ring's closing sequence STARTS no
     * matter what. It is a CEILING ON `startSec`, not a second timer: at this
     * many combat-elapsed seconds the ring ignites and contracts over the
     * ordinary `shrinkSec`, so 「出現火圈準備收場」 is the same sequence the
     * player already knows, just no longer deferrable.
     *
     * WHAT IT ACTUALLY STOPS. `boss.delayFireRingSec` / `boss.extendCombatSec`
     * are applied ONCE PER 殭屍王 SUMMON, and `arena-rules.json` ships the king
     * as `repeatable: true` at `killThreshold: 100` — so a champion farming
     * zombies re-summons at 100, 200, 300 … and EACH summon adds another 180 s
     * to both deadlines, per champion. That is the unbounded round the owner
     * measured; the two `.max(3600)` bounds on the boss knobs bound ONE summon,
     * never the total. This bounds the total.
     *
     * ⚠️ WHY THERE IS NO 「停用硬上限」 SWITCH. 不管什麼條件 is the requirement; a
     * boolean that turns it off is the defect wearing a checkbox. The operator's
     * escape hatch is the NUMBER — raise it to 1800 for a marathon round — which
     * cannot silently restore an unbounded round the way an off switch would.
     *
     * BOUNDED BOTH ENDS (CLAUDE.md 「欄位要有上界，不是只有下界」):
     *   · min 20 — a round shorter than one closing animation (`shrinkSec`
     *     ships at 20 s) would ignite the ring and force-end combat before it
     *     ever reached `minRadius`, i.e. the 收場 the player is promised would
     *     never be drawn. The cross-field refine below additionally requires
     *     `roundHardCapSec >= startSec + shrinkSec` against the ACTUAL authored
     *     shrink, so this static floor is only the last line.
     *   · max 1800 — 30 minutes. The mis-parse this catches is the stray digit
     *     on the shipped 300 (「5 分鐘」 typed as 3000 = 50 minutes, or as
     *     「500」 minutes), which is precisely the shape #277 named. 1800 is
     *     still longer than any round anyone would deliberately author, so the
     *     ceiling costs the operator nothing real.
     *
     * ABSENT ⇒ NO CAP in the SIM's own mirror (`FireRingConfigLike` in
     * sim/fireRing.ts treats it as `Infinity`), so a hand-built fixture or the
     * client's prediction shadow behaves byte-identically to pre-#248. The
     * schema's `.default(300)` means every doc that goes through the loader HAS
     * one — same two-sided asymmetry the `boss` block above documents.
     */
    roundHardCapSec: z.number().min(20).max(1800).default(300),
    /**
     * 殭屍王在場 → 回合延長 (#L1). owner 2026-07-30:
     *
     *   「殭屍王出現**回合結束時間延長 3 分鐘**(**火圈時間也延後**),
     *     除非全死不然不會提前結束,避免打到一半結果回合結束」
     *
     * TWO knobs, not one, even though the owner said one number. They move two
     * DIFFERENT deadlines and an operator will eventually want them apart: the
     * ring's ignition is 「還有多久開始收圈」 (pacing/tension) and the backstop is
     * 「這回合最長多久」 (match length). Shipping them fused would mean the first
     * time somebody wants a longer king fight WITHOUT a longer round, the answer
     * is a code change. Both ship at the owner's 180.
     *
     * WHY INSIDE `fireRing` AND NOT BESIDE IT. The match host resolves exactly
     * this block (`resolveFireRing()`) and hands it to the sim's
     * `fireRingRulesFromConfig`. A sibling block would need new plumbing through
     * the host before it did anything — and a knob that needs plumbing before it
     * works is a knob the operator can turn with no effect (failure mode ②).
     *
     * 0 on either = that half is OFF.
     *
     * ⚠️ AN ABSENT BLOCK DEFAULTS **ON**, at 180/180 — the one place in this
     * schema where 「缺席 = 今天的行為」 is deliberately NOT the rule. The reason
     * is `scripts/exportContentToJson.ts`: it regenerates `config.match.json`
     * from a literal that predates this block, so a default of 「off」 would let
     * a routine content re-export silently delete a mechanic the owner asked
     * for, and nothing downstream would notice (it would just be a shorter
     * round). Defaulting on makes that failure mode impossible. The SIM's own
     * mirror (`FireRingConfigLike.boss` in sim/fireRing.ts) still treats absent
     * as 0, so a hand-built fixture or the client's prediction shadow is
     * byte-identical to pre-#L1 — the two asymmetries protect opposite ends.
     *
     * Because of that default, deleting the block from the JSON does NOT turn
     * the feature off; `bossRoundExtension.test.ts` therefore pins the RAW file
     * as well as the parsed doc.
     *
     * ⚠️ BOUNDED ON BOTH SIDES (CLAUDE.md 「欄位要有上界,不是只有下界」). 3600 s
     * is an hour of extension per summon; the king is `repeatable`, so an
     * unbounded field plus a farmer is an unbounded round.
     */
    boss: z
      .object({
        /** seconds added to `combatMaxSec`'s deadline each time a king spawns */
        extendCombatSec: z.number().min(0).max(3600).default(180),
        /** seconds the ring's ignition is pushed back each time a king spawns */
        delayFireRingSec: z.number().min(0).max(3600).default(180),
      })
      .strict()
      .default({}),
  })
  .strict();

export type FireRingConfig = z.infer<typeof zFireRingConfig>;

/** Contract defaults for the fireRing block (dev cheats / fallbacks). */
export const DEFAULT_FIRE_RING_CONFIG: FireRingConfig = {
  startSec: 60,
  shrinkSec: 20,
  minRadius: 0.5,
  burnCurve: DEFAULT_BURN_CURVE as { sec: number; pctPerSec: number }[],
  maxPctPerSec: 1,
  roundHardCapSec: 300,
  boss: { extendCombatSec: 180, delayFireRingSec: 180 },
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
      })
      /**
       * #L1 — THE SAME INVARIANT, ONE 殭屍王 LATER.
       *
       * `extendRoundForBoss` adds `delayFireRingSec` to the ignition and
       * `extendCombatSec` to the backstop. If the delay is the larger of the
       * two, the ring is pushed PAST the (extended) backstop and the round ends
       * with the ring still open — the stalemate-breaker silently stops
       * existing for exactly the rounds a king showed up in, which is the worst
       * possible time for it to stop existing.
       *
       * Checked once here, at author time, instead of clamped at runtime: a
       * clamp would let the operator save 300/180 and then quietly play 200/180.
       * Shipped 60+20 vs 100 leaves 20 s of slack, so the shipped 180/180 passes
       * with room to spare.
       */
      .refine(
        (m) =>
          !m.fireRing ||
          m.fireRing.startSec +
            m.fireRing.boss.delayFireRingSec +
            m.fireRing.shrinkSec -
            m.fireRing.boss.extendCombatSec <=
            m.combatMaxSec,
        {
          message:
            "match.fireRing.boss: after a 殭屍王 extension the ring must STILL finish closing before the backstop — require startSec + delayFireRingSec + shrinkSec <= combatMaxSec + extendCombatSec",
          path: ["fireRing", "boss", "delayFireRingSec"],
        },
      )
      /**
       * #248 — THE HARD CAP MUST NOT TRUNCATE THE UN-EXTENDED ROUND.
       *
       * `roundHardCapSec` is a CEILING on the ignition tick. If it were authored
       * BELOW `startSec` the ring would ignite early on every ordinary round and
       * `startSec` — documented one field up as 「回合長度的單一真相」 — would
       * silently stop being true. Requiring the cap to leave room for the whole
       * un-extended ring (`startSec + shrinkSec`) states the stronger, more
       * useful fact: the cap can only ever shorten a round that something
       * EXTENDED, never the baseline one, and there is always at least one full
       * closing animation inside it.
       *
       * Shipped: 60 + 20 = 80 <= 300, so the cap is inert until a 殭屍王 shows up.
       *
       * Checked at author time rather than clamped at runtime, for the same
       * reason the refine above is: a clamp would let the operator save 30 and
       * then quietly play 80.
       */
      .refine(
        (m) =>
          !m.fireRing ||
          m.fireRing.startSec + m.fireRing.shrinkSec <= m.fireRing.roundHardCapSec,
        {
          message:
            "match.fireRing.roundHardCapSec must leave room for the WHOLE un-extended ring — require startSec + shrinkSec <= roundHardCapSec (回合硬上限只能砍掉被延長的回合，不能砍掉正常回合)",
          path: ["fireRing", "roundHardCapSec"],
        },
      ),
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

/**
 * Store config: the FLAT 藍水晶 champion unlock price + match placement rewards.
 *
 * Owner, 2026-07-30:「所有英雄藍水晶都是統一價，新上架預設也是一樣價格」. This
 * replaced a 53-entry `championPrices` map whose only real content was "300, 41
 * times, and 0 twelve times" — a maintenance liability that made FORGETTING a
 * line mean GIVING THE CHAMPION AWAY (an absent price reads as free on both the
 * client and the server). Under the flat model an unlisted champion costs
 * `championUnlockCost`, so onboarding a hero needs no store edit at all.
 */
export const zConfigStoreDoc = z
  .object({
    id: zId,
    schema: z.literal("config.store@1"),
    /**
     * The 藍水晶 price of ONE champion unlock — the same number for every
     * champion that is not on `freeChampionIds`. Upper bound is a typo guard,
     * not a balance opinion: 1,000,000 is already ~4,300 first-place matches.
     */
    championUnlockCost: z.number().int().min(0).max(1_000_000),
    /**
     * The champions that cost NOTHING — the free starter roster every new
     * account is seeded with. Emptying it is legal (the owner may want a fully
     * uniform store); see the note in apps/platform/internal/wallet/catalog.go
     * for what a new account then faces.
     */
    freeChampionIds: z.array(zId),
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
  })
  .strict();

export type ItemDraftConfig = z.infer<typeof zItemDraftConfig>;

/**
 * 71-00 暗夜契約 (owner 2026-07-30 re-design) — while a 暗夜契約 carrier fights
 * in a zone, EVERY champion death there (friend or foe) raises a 暗夜旗 that
 * radiates 黑夜靈氣; every flag is cleared at round end. Optional + additive: an
 * absent block means the mechanic is simply OFF (the same legacy-compat
 * convention as `flowers` / `reviveCircles` / `guardianTower` / `goldDrop`),
 * which is what every unit test and the client's prediction shadow world see.
 *
 * ⚠️ EVERY FIELD HERE IS A DECISION THE OWNER WILL WANT TO FLIP, and each has an
 * UPPER bound as well as a lower one — `validateField` only checked `min` until
 * 2026-07-29, which is how 50 typed as 500 used to sail through the admin form
 * and get silently clamped downstream (#277).
 */
export const zNightPactConfig = z
  .object({
    /**
     * WHICH 天生技 docs count as 暗夜契約. A LIST, not the single literal
     * `"godie-u00k.passive"`, for the reason `championPrices` taught us: one
     * hard-coded id means a re-id or a second hero with the same mechanic
     * silently disables the whole feature with no error anywhere.
     */
    abilityIds: z.array(z.string().min(1)).min(1).max(16),
    /**
     * BASE 黑夜靈氣 radius in sim units, BEFORE the combat-env `abilityRange`
     * factor (#136).
     *
     * ⚠️ THIS NUMBER IS NOT PORTED — it is a design choice, and it says so here
     * because a reader would otherwise assume fidelity. `A0HH` has an EMPTY
     * `area` column (`OBJECTS.json` → `"area": {}`), so the source map supplies
     * nothing. The shipped default is the ORDER OF MAGNITUDE the rest of this
     * content tree uses for a hero aura: 芬多精 `A0GM` is 4.58 (250 WC3 units),
     * 靈壓 `A0ID` is 9.17 (500), and 6.42 (350) is the modal `radius` among the
     * innate 天生技 docs in `content/abilities`. The 40 ceiling is the same
     * mis-parse guard `zAuraDef.radius` carries: the zone's `boundaryRadius` is
     * 24, so anything past 40 is a raw un-converted WC3 number.
     */
    auraRadius: z.number().positive().max(40),
    /**
     * WHO 黑夜靈氣 reaches. `owner` = only the unit carrying 暗夜契約 (死之王
     * himself); `team` = its whole team.
     *
     * ⚠️ THE OWNER DID NOT RULE ON THIS. The shipped default is the CONSERVATIVE
     * reading of 「帶來暗夜效果」 — the ubertip's 夜間 clauses are all about 死之王
     * — and it is a dropdown precisely so the answer costs one save.
     */
    beneficiary: z.enum(["owner", "team"]),
    /**
     * HOW SEVERAL FLAGS COMBINE. `max` = any number of overlapping flags is one
     * dose; `add` = they sum. A 12-champion massacre can leave a lot of banners
     * on one battlefield, so this is the difference between a flavour buff and
     * +600 % move speed — a real gameplay decision, hence a field.
     */
    stacking: z.enum(["max", "add"]),
    /** hard cap on simultaneously standing flags PER ZONE (0 would disable it) */
    maxFlagsPerZone: z.number().int().min(1).max(64),
    /** 移動速度提升 100% → 1.0 (a PercentAdd). The ubertip's own number. */
    msPercent: z.number().min(0).max(10),
    /** 生命回復速度提升 30 點 → a flat healthRegen. The ubertip's own number. */
    healthRegenFlat: z.number().min(0).max(500),
    /**
     * 「在死之王附近想施展技能的敵方單位有 12% 的機率魔力全失,並且受到傷害」.
     * NOT about the flag — it keys off proximity to a LIVING carrier.
     */
    manaBurn: z
      .object({
        enabled: z.boolean(),
        /** enemy casts within this distance of a living carrier are at risk */
        radius: z.number().positive().max(40),
        /** the ubertip's 12 % */
        chance: z.number().min(0).max(1),
        /**
         * TRUE damage on a successful proc.
         *
         * ⚠️ SHIPS AT 0 BECAUSE THE NUMBER DOES NOT EXIST. `A0HH`'s only two
         * data fields are `Def1`/`Def5` = 1.0, the NEUTERED damage-reduction
         * columns of its base `Aegr` (Elune's Grace, stock `AIdd`, `DataA1
         * 0.65`) — ×1.0 is "no reduction", not a damage value — and the rawcode
         * appears ZERO times in `war3map.j`. 0 is the honest encoding of
         * "unknown"; a made-up number would launder a guess into balance.
         */
        damage: z.number().min(0).max(10000),
      })
      .strict(),
  })
  .strict();

export type NightPactConfig = z.infer<typeof zNightPactConfig>;

/** Contract defaults for the nightPact block (dev cheats / fallbacks). */
export const DEFAULT_NIGHT_PACT_CONFIG: NightPactConfig = {
  abilityIds: ["godie-u00k.passive"],
  auraRadius: 6.42,
  beneficiary: "owner",
  stacking: "max",
  maxFlagsPerZone: 12,
  msPercent: 1.0,
  healthRegenFlat: 30,
  manaBurn: { enabled: true, radius: 6.42, chance: 0.12, damage: 0 },
};

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

/**
 * 殭屍上限的上界 (owner 2026-07-30 裁定「上限值 500」).
 *
 * ⚠️ 這是**上界**,不是預設值。出貨值仍然是 `maxAlivePerZone: 15`(逐回合表最高
 * 爬到 50);500 是「後台這一格最多讓操作者填到多少」。
 *
 * ── 為什麼上界非有不可 ───────────────────────────────────────────────────────
 * 這兩個欄位在 GH#206 補上界的那一輪被漏掉了:整個 `mobWaves` 區塊只有這兩格
 * 是 `min(1)` 而沒有 `max`,所以 50 打成 5000 會**完全合法**地存下去,一路寫進
 * 耐久覆蓋層。沒有人會在後台看到任何一個字,缺陷要到那一場比賽的伺服器開始
 * 掉幀才會被發現。
 *
 * ── 為什麼是 500,而不是「隨便一個很大的數」 ─────────────────────────────────
 * 一場比賽是**單執行緒**的:主機 24 核對「一場裡有幾隻殭屍」完全沒有幫助,加核
 * 只增加同時開幾場。`maxAlivePerZone` 是**每個 zone**、一場四個 zone,所以 500
 * 是場上 2,000 個實體的意思 —— 已經遠在單場 tick 預算之外。上界的作用是把
 * 「一個手滑的 0」擋在存檔之前,不是描述效能甜蜜點(甜蜜點是出貨的 15~50)。
 *
 * ── 為什麼是常數而不是欄位 ─────────────────────────────────────────────────
 * 和 `BASE_BONUS_MAX` 同一條規矩(sim/baseBonus.ts):**被守的那一格才是欄位**,
 * 上界本身是守衛。把守衛也做成可調的,等於沒有守衛。
 */
export const MOB_ALIVE_CAP_MAX = 500;

/**
 * 每波數量上限的上界。和 `MOB_ALIVE_CAP_MAX` 同一個數字、同一個理由 —— 一波生
 * 出來的量最終還是被場上上限收住,所以兩格用同一條天花板,操作者不用記兩個數。
 */
export const MOB_PER_WAVE_CAP_MAX = 500;

export const zMobWavesConfig = z
  .object({
    /** 1-based round from which waves begin (matches ultUnlockRound:3 precedent) */
    fromRound: z.number().int().min(1),
    /** combat-second of wave k=1 (→ firstWaveTicks = round(sec/dt)) */
    firstWaveSec: z.number().positive(),
    /** combat-seconds between waves (wave k lands at second 2k-1 when =2) */
    waveIntervalSec: z.number().positive(),
    /** hard cap on mobs spawned per wave: count = min(k, mobsPerWaveCap) */
    mobsPerWaveCap: z.number().int().min(1).max(MOB_PER_WAVE_CAP_MAX),
    /** hard cap on mobs ALIVE per battlefield/duel zone at once */
    maxAlivePerZone: z.number().int().min(1).max(MOB_ALIVE_CAP_MAX),
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
            mobsPerWaveCap: z.number().int().min(0).max(MOB_PER_WAVE_CAP_MAX),
            /** cap on mobs ALIVE per zone in that round (0 = none) */
            maxAlivePerZone: z.number().int().min(0).max(MOB_ALIVE_CAP_MAX),
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
         * 腳下圈圈的基準直徑 (#247, owner 2026-08-01: 「殭屍王底下圈圈會比較大，
         * 但不影響無碰撞」) — GGD units, at 體型倍率 1.
         *
         * ⚠️ PURELY VISUAL, AND THAT IS THE REQUIREMENT, NOT A SIDE NOTE. The
         * sim's body is `radius` (this block) / `boss.radius`, and NOTHING reads
         * this number on the server: it travels in `MatchState.mobVisualJson`
         * next to `tintStrength` and is consumed only by the renderer's team
         * ring. So there is no path by which widening the ring could widen what
         * the king collides with — see `mobGroundRingDiameter` in sim/mobs.ts
         * and its guard in sim/mobRingIndependence.test.ts.
         *
         * Lives on `mob` and not on `boss` for the same reason `tintStrength`
         * does: it applies to all three kinds, and the wire table is match-wide.
         *
         * 1.25 = the champion team ring's diameter, so a 體型倍率-1 zombie wears
         * exactly the ring a player does. 上界 8: a ring wider than 8u under one
         * body already covers a sixth of a 48u-wide zone — 24 (the arena's
         * boundary radius, the neighbouring number an operator might paste)
         * would carpet the whole floor. 0 = 不畫圈, a real choice.
         */
        groundRingDiameter: z.number().min(0).max(8).optional(),
        /**
         * 圈圈跟著體型倍率放大的程度. 1 (shipped) = 完全跟著 —— a 10× king wears a
         * 10× ring, which is owner's 「圈圈會比較大」. 0 = 每一種殭屍的圈圈一樣大.
         *
         * A SEPARATE knob from the diameter because they are separate decisions:
         * 「圈圈本身多大」 and 「王的圈圈要不要跟著王一起變大」. 上界 2 catches the
         * mis-paste of `boss.sizeMult` (10) into this box, which would put a
         * 100×-wide ring under the king; 下界 0 is the 「都一樣大」 end.
         */
        groundRingSizeFollow: z.number().min(0).max(2).optional(),
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

        /* ── #247 owner 2026-08-01 實戰回饋 ────────────────────────────────
         *
         * 「殭屍王 應該要可以無視碰撞穿透地形 不然被卡住永遠走不到」
         * 「每回合最多只會出現一次殭屍王，不會無限出場」
         *
         * BOTH are DECISIONS, so both are fields with the owner's answer as the
         * default. The no-clip half deliberately borrows 翔封界's vocabulary
         * (`FlightGrant` in sim/flight.ts) instead of inventing a second one:
         * the king is granted the SAME state a flying champion carries, so the
         * three MovementSystem exemptions have exactly one implementation.
         */
        /**
         * 無視碰撞 — master switch. SHIPS **true** (owner's answer).
         *
         * ⚠️ WHAT IT DOES NOT DO: it is not invulnerability and not stealth.
         * `world.grid` (the broad phase every targeting/AoE query reads) is
         * untouched, so a no-clip king is still hittable — that distinction is
         * the whole reason sim/flight.ts exists and is quoted there.
         */
        noClip: z.boolean().optional(),
        /**
         * 穿過其他單位 (其他殭屍、英雄、花、守衛塔). ABSENT = true.
         *
         * A SEPARATE decision from `noClipObstacles` for the reason
         * `FlightGrant` gives: walking through BODIES is a positioning change,
         * walking through PILLARS is a map-geometry change. In the king's case
         * this one is the load-bearing half — a round-9 zone holds up to 50
         * zombies, and the soft-separation pass is what pins a 1.8-radius body
         * inside its own escort.
         */
        noClipUnits: z.boolean().optional(),
        /** 穿過牆與柱子 (`zone.obstacles`). ABSENT = true. */
        noClipObstacles: z.boolean().optional(),
        /**
         * 仍然被場地邊界夾住. ABSENT = **true**, and the polarity is deliberately
         * the opposite of the two above — 「無視碰撞」 must not become 「走出競技
         * 場」. A king outside the boundary breaks every zone-scoped mechanic
         * (duel resolution, `teamAliveInZone`, the minimap) and the fire ring
         * would burn it from outside the world.
         */
        noClipStayInside: z.boolean().optional(),
        /**
         * 每回合最多召喚幾隻殭屍王 (owner 2026-08-01: 「每回合最多只會出現一次」).
         * SHIPS **1**.
         *
         * ⚠️ THIS IS A SECOND, INDEPENDENT GATE — it does NOT replace
         * `repeatable`. `repeatable` answers 「同一個英雄的第 200 隻要不要再召喚」
         * over the WHOLE MATCH; this answers 「這一回合已經來過幾隻了」. With
         * `repeatable: true` and six champions in a zone, the old code could
         * summon six kings inside one round — that is the 「無限出場」 owner saw.
         *
         * Counted per ROUND because `beginCombatMobs` is the round boundary the
         * host already calls; there is no timer and no decrementing counter
         * (sim/purity.test.ts).
         *
         * 上界 20:「一回合 20 隻王」 already means the cap does nothing, so
         * anything larger is a mis-paste — specifically the 100 from
         * `killThreshold`, the box directly above it on the 後台 page.
         * 下界 1: 0 would be 「永遠不召喚」 said in the wrong field; that is what
         * `enabled: false` is for, and a silent 0 would look like a broken king.
         */
        maxPerRound: z.number().int().min(1).max(20).optional(),
        /**
         * 那個上限是算「每個戰場」還是「整場比賽」. SHIPS `"zone"`.
         *
         * The ambiguity is real and it is owner's sentence, so it is a field
         * rather than a guess in a comment. `"zone"` is the default because a
         * king spawns in the SUMMONER's own duel zone: under `"match"`, one
         * champion in zone 0 crossing 100 kills would permanently deny every
         * other zone its king that round, which reads as a bug rather than a cap.
         */
        maxPerRoundScope: z.enum(["zone", "match"]).optional(),

        /* ── #247 owner 2026-08-01 實戰回饋(第二批)────────────────────────
         *
         * 「殭屍王出現英雄/bot都會優先打殭屍王 (因為獎勵很高)」
         * 「殭屍王 要像其他遊戲 BOSS 一樣亮長血條」
         *
         * 前者是**索敵排序**,後者是**畫面**,而兩件都是決策點,所以四個欄位。
         */

        /**
         * 殭屍王在自動索敵比較器上的**排名**(sim/targeting.ts 的 KEY 1)。
         *
         * ⚠️ 這是一個「數字」而不是「開關」,而且它落在的是一個**既有的軸**:
         * `TARGET_CLASS` 已經是 敵方英雄 0 → 召喚物 1 → 小怪 2 的字典序排名
         * (sim/summonRules.ts),`beats()` 比的就是 `a.kind < b.kind`。所以
         * 「王排第幾」最誠實的表達就是「王在這個軸上占哪個數字」——
         * 不是另外發明一套加權分數,那會把 嘲弄/威脅/低血/最近 四把鑰匙的語意
         * 一起改掉,而這次改動不該碰它們。
         *
         *   · **< 0**(出貨 −1)—— 王排在**敵方英雄之前**。owner 的字面讀法:
         *     「英雄/bot都會優先打殭屍王」。
         *   · 0 —— 跟敵方英雄同級,由 威脅/低血/最近 決勝。
         *   · 0 < x < 1 —— 敵方英雄之後、召喚物之前。這格就是「**稍微優先**」:
         *     被敵方英雄追殺時不會轉頭去打王,但王仍然贏過所有雜魚與召喚物。
         *   · 1 < x < 2 —— 召喚物之後、一般殭屍之前。
         *   · 2 —— 跟一般殭屍同級 = **等於關掉這個功能**(這正是上界的意義)。
         *
         * 下界 −1:任何負值效果都一樣(都在英雄之前),−1 是「剛好高一階」那個
         * 值,所以 −10 這種打錯的數字在這裡就被擋下來而不是靜默地等於 −1。
         * 上界 2:比 2 更大代表「排在一般殭屍後面」,而 `TARGET_CLASS` 沒有比
         * 小怪更低的階,所以 3 跟 2 完全同義 —— 也就是說 >2 一定是打錯。
         *
         * ABSENT ⇒ 2,也就是**今天的行為**(王就是一隻小怪)。這一格是平衡,
         * 所以照「缺席 = 今天的行為」的家規走 —— 跟下面三格刻意不同,理由見那裡。
         */
        aggroRank: z.number().min(-1).max(2).optional(),
        /**
         * 要不要亮長血條 (owner 2026-08-01)。SHIPS **true**。
         *
         * ⚠️ 這一格(以及下面兩格)**故意不照「缺席 = 今天的行為」**,跟
         * `aggroRank` 相反,理由與 sim/summonRules.ts 的
         * `DEFAULT_SUMMON_AUTO_TARGETABLE` 同一條:那條家規是為了「不要不小心
         * 改到行為」,而這裡**行為改變本身就是交付物**。而且它是純畫面 ——
         * 一張沒被作者填過的舊 arena 文件拿到血條,不會讓任何一場的數值不同。
         */
        healthBar: z.boolean().optional(),
        /**
         * 長血條畫在畫面上哪裡。SHIPS `"top"`。
         *
         *   · `"top"`    —— 相位計時器下方的中央走廊頂端(WoW/FF14 的團隊首領條)
         *   · `"bottom"` —— 技能列正上方(魂系遊戲的首領條)
         *
         * 兩種都是真的慣例,所以它是欄位而不是註解裡的辯護。兩邊都會讓
         * 降臨橫幅與連殺計數器讓位(#107 安全區契約),見
         * ui/hud/bossHealthBar.ts。
         */
        healthBarAnchor: z.enum(["top", "bottom"]).optional(),
        /**
         * 什麼時候亮出來。SHIPS `"summon"`。
         *
         *   · `"summon"`  —— 召喚的那一刻就亮(owner 的字面讀法:王一出現就亮)
         *   · `"sighted"` —— 要等到王真的**進入你正在看的那個戰場**才亮。
         *     差別是真的:#269 之後鏡頭是玩家自己按鈕切的,所以「我這一區的王」
         *     跟「我正在看的那一區」是兩個不同的集合。
         */
        healthBarReveal: z.enum(["summon", "sighted"]).optional(),
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
    // #247 owner 2026-08-01 「殭屍王底下圈圈會比較大」. 1.25 is the champion team
    // ring's own diameter, and `groundRingSizeFollow: 1` makes the ring track
    // 體型倍率 — so the shipped king (sizeMult 10) stands on a 12.5u ring while a
    // 0.68 zombie keeps a 0.85u one. Purely visual: see the schema note.
    groundRingDiameter: 1.25,
    groundRingSizeFollow: 1,
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
    // #247 owner 2026-08-01 —— 「應該要可以無視碰撞穿透地形 不然被卡住永遠走不到」.
    // All three permissions ON, the boundary clamp STILL ON. The king is granted
    // the same `FlightGrant` a flying champion carries (sim/flight.ts), so
    // 「無視碰撞」 has exactly one implementation in the repo.
    noClip: true,
    noClipUnits: true,
    noClipObstacles: true,
    noClipStayInside: true,
    // #247 owner 2026-08-01 —— 「每回合最多只會出現一次殭屍王，不會無限出場」.
    // Per DUEL ZONE, because a king spawns in the summoner's own zone and a
    // match-wide 1 would let one champion deny the other three zones their king.
    maxPerRound: 1,
    maxPerRoundScope: "zone" as const,
    // #247 owner 2026-08-01 —— 「殭屍王出現英雄/bot都會優先打殭屍王 (因為獎勵很高)」.
    // −1 是 owner 的字面讀法:王排在**敵方英雄之前**。想改成「稍微優先」(被敵方
    // 英雄追殺時不轉頭)就把這格填 0.5 —— 那是後台一個數字,不是一次改程式。
    aggroRank: -1,
    // 「殭屍王 要像其他遊戲 BOSS 一樣亮長血條」. 三格都是畫面決策,出貨值就是
    // owner 那句話的字面讀法:亮、在上方、召喚那一刻就亮。
    healthBar: true,
    healthBarAnchor: "top" as const,
    healthBarReveal: "summon" as const,
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
     * ⚠️ 這是**列表不是布林**，理由和 `nightPact.abilityIds` 同源：寫死單一
     * 字面值 `"quest-rewards"` 的話，第二張要退場的表就得改程式。
     *
     * 上界 16：出貨樹只有 3 張 loot table，16 遠高於任何合理的退場清單，而且
     * 擋得住「把整份 items 清單貼進來」這種打錯。每一格的長度上界 64 與
     * `itemDraft.fallbackTable` 同一個數字（出貨最長的 id `legendary-weapons`
     * 是 17 個字元）。省略 = 沒有任何表退場（＝這個機制以前的行為）。
     */
    retiredLootTables: z.array(z.string().min(1).max(64)).max(16).optional(),
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
    /** 71-00 暗夜契約 rules; omit = no 暗夜旗, no 黑夜靈氣, no mana burn */
    nightPact: zNightPactConfig.optional(),
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
 * The NINE 三圍 coefficients (`strToMaxHealth` … — eight from #248, plus
 * `intToMagicResist` from GH#221) ride the same table but are COEFFICIENTS, not
 * ×factors: their neutral value is the shipped WC3-or-owner number (23 hp per
 * strength point, 0.6 魔抗 per intelligence point), not 1.0, and their legal band
 * is 0..100 — which is why `zEnvFactor` has always allowed 100 and why an omitted
 * coefficient falls back to `defaultForKey`, never to 1.0.
 *
 * ⚠️ NOTHING IS ADDED HERE WHEN A KEY IS ADDED. The Zod object is BUILT from
 * `COMBAT_ENV_KEYS`, so `.strict()` starts accepting the new key the moment the
 * sim declares it. That is the design — but it also means this file cannot be
 * the place a reviewer checks to see whether the key landed; the sim's
 * COMBAT_ENV_KEYS is.
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
 * 語意見 sim/statCaps.ts。**缺文件 = 出貨預設**(攻速 4.0 / 10.0、法強 100000
 * 開到頂),缺鍵 = 那條屬性退回 `STAT_CLAMPS` 的上界而且不可解鎖。
 *
 * ⚠️ 2026-08-01 補上**兩端的界**。這兩個欄位在此之前只有 `z.number().finite()`,
 * 也就是 CLAUDE.md 2026-07-29 點名的那個缺陷的最純粹版本:上界下界都沒有。
 * 界分兩層:
 *   · `zStatCap` 自己 —— 全屬性通用的最寬合法帶 `[0, STAT_CAP_CEILING]`,
 *     連 `catchall` 收到的未知 key 都套得到,所以「兩端都有界」沒有例外。
 *   · `.superRefine` —— 認得的 stat key 再收緊到 `statCapBounds(stat)`
 *     (下界是那條屬性 `STAT_CLAMPS` 的**地板**:比地板還低的天花板不是更嚴格的
 *     上限,而是地板無條件獲勝、這一格完全失效)。
 * 這一層擋的是打錯,不是平衡:每一條上界都遠高於出貨內容打得到的值,見
 * sim/statCaps.ts 的 `STAT_CAP_MAX`。
 */
export const zStatCap = z
  .object({
    /** 沒有解鎖來源時的上限 */
    base: z.number().finite().min(0).max(STAT_CAP_CEILING),
    /** `ModOp.CapRaise` 最多能抬到的硬上限(小於 base 會被讀成 base) */
    unlocked: z.number().finite().min(0).max(STAT_CAP_CEILING),
  })
  .strict();

/** 一條屬性自己的那一對,收緊到 `statCapBounds(stat)`。 */
function zStatCapFor(stat: Stat): typeof zStatCap {
  const [lo, hi] = statCapBounds(stat);
  const n = z.number().finite().min(lo).max(hi);
  return z.object({ base: n, unlocked: n }).strict();
}

/**
 * ⚠️ 形狀刻意和 `zBaseBonusTable` 一樣(逐 stat 一格 + `catchall`),**不是**
 * `.superRefine`:`zConfigDoc` 是 `z.discriminatedUnion`,而 discriminated union
 * 的成員必須是 ZodObject —— 一個 `.superRefine` 會把這份 schema 變成 ZodEffects,
 * 整個 config 聯集當場失效。界要下在**值**上,不能下在文件上。
 */
export const zStatCapsTable = z
  .object(
    Object.fromEntries(ALL_STATS.map((s) => [s, zStatCapFor(s).optional()])) as Record<
      Stat,
      z.ZodOptional<typeof zStatCap>
    >,
  )
  // 未知的 key 仍然吃通用帶(兩端都有界)。它進不了遊戲 —— `normalizeStatCaps`
  // 只讀 `CAPPABLE_STATS` —— 但一份文件不該因為一個 typo 而變成無界。
  .catchall(zStatCap);

export const zConfigStatCapsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stat-caps@1"),
    /** stat key ("as" / "ap" / "ms" / "cdr" …) -> { base, unlocked } */
    caps: zStatCapsTable,
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
        /**
         * 決策點:技能授權的位移(擊退/擊飛/衝刺)遇上傷害驅動的擊退時誰贏。
         * ABSENT = 出貨預設 true(技能贏)。false = 傷害無條件蓋掉 —— 那是這條
         * 缺陷被修之前的行為,而它讓每一支「又打又推」的技能的擊退全滅。
         * 完整理由見 `sim/combatFeel.ts` 的 `damageShoveWins`。
         */
        authoredWins: z.boolean().optional(),
        /**
         * 決策點(只在 `authoredWins` 開著時有意義):傷害驅動的擊退推得更遠時
         * 要不要接管。ABSENT = 出貨預設 false。
         * ⚠️ true 那一側會讓拉近系(`from: "pull"`)的技能在傷害夠大時把目標
         * 往反方向推出去。
         */
        longerDamageWins: z.boolean().optional(),
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
    /**
     * 面向鎖的窗口長度 (#264 / #275 / #280)。語意與出貨預設見
     * `sim/combatFeel.ts` 的 `FacingRules`。
     *
     * ⚠️ 這裡**沒有** `aimHoldTicks`,那是刻意的 —— 見 `sim/aimHold.ts` 檔頭:
     * 客戶端預測沒有任何 config 通道,把瞄準沿用窗口做成可調會讓預測與權威用
     * 不同的窗口,自己的角色面向會和伺服器長期不同意。
     */
    facing: z
      .object({
        /** 出手後的收招餘韻 tick 數 (30 tick = 1 秒) */
        followThroughTicks: z.number().int().min(0).max(300),
        /** 瞬發技的最低鎖定 tick 數 */
        instantCastTicks: z.number().int().min(0).max(300),
      })
      .strict()
      .optional(),
    /**
     * 卡住就接敵 (GH#216)。語意與出貨預設見 `sim/combatFeel.ts` 的
     * `AutoEngageRules` —— 那裡有量到的數字(近戰索敵 6 / 射程 1.6 的四倍落差、
     * 右鍵點進柱子之後 |v| = 0.00 連續 2,240 tick)。
     *
     * ⚠️ `seekRadius` **不是平常的索敵半徑**。把它當成「自動攻擊範圍」調大並不會
     * 讓**走得動**的玩家自動衝過去 —— 那條路徑一格都沒有被動到(見
     * `systems/OrderSystem.ts` 的 `autoEngageActive`)。
     *
     * ⚠️ 它現在有**兩個**入口(2026-07-31):走位卡住(一直都有),以及站著不動
     * (`idleSeeks`,出貨關著)。所以「只在走位卡住時生效」這句話只在
     * `idleSeeks: false` 時才成立 —— 那是出貨值。
     */
    autoEngage: z
      .object({
        /** 總開關;false = 移動指令期間絕不接手(#274 的行為) */
        enabled: z.boolean(),
        /** 連續幾個 tick 走不動才算卡住 (30 tick = 1 秒) */
        stallTicks: z.number().int().min(1).max(600),
        /** 「走不動」的速度門檻 (units/sec),和 standstill.walkEps 同一個量 */
        stallSpeed: z.number().min(0).max(100),
        /** 卡住之後的索敵半徑(單位);bot 的 AI_ENGAGE_RANGE 是 48 */
        seekRadius: z.number().min(0).max(200),
        /**
         * **決策點**(2026-07-31 W4):站著不動的玩家要不要也吃 `seekRadius`。
         *
         * 出貨 `false` = 今天的行為。索敵半徑目前是**不對稱**的 ——「走位卡住」
         * 的人吃 `seekRadius`(48),「完全站著不動」的人只吃近戰地板 6,也就是
         * 卡住比站著更容易索到敵。實測 `autoAcquireWhileMoving.test.ts` 的
         * `[idle]` 情境:整場 2,410 tick 沒有任何敵方英雄靠到 14.95 單位以內,
         * 所以那個座位 0 次索敵、0 次揮擊。
         *
         * `true` = 站著不動的人也吃 `seekRadius`,手感等同全員預設 A 移動:
         * 什麼都不按也會自己走過去打人,代價是玩家放手時方向盤不在他手上。
         * 這是**平衡決策不是缺陷修正**,所以預設留在今天那一側,由 owner 決定。
         *
         * ⚠️ 需要總開關 `enabled` 也開著 —— `enabled: false` 承諾的是「完全回到
         * #274 的行為」,獨立生效會讓那句話變成謊話。
         */
        idleSeeks: z.boolean(),
        /**
         * true(出貨)= 玩家每送出一條新的移動指令,走位權當場還給他。
         * 搖桿/虛擬搖桿每一拍都送一條,所以推著搖桿的人永遠不會被接管;
         * 滑鼠右鍵一次只送一條,點進柱子之後才會觸發接敵。
         * 關掉會回到「上鎖之後不放手」的行為(實測 86.6% 的走位 tick 被搶走)。
         */
        respectLiveSteering: z.boolean(),
        /**
         * true(出貨)= 硬控(定身/昏迷/擊倒/施法鎖/hitstop)的 tick **不算**
         * 走位卡住,計數凍結在原地。
         *
         * 掃出貨內容量到:86 支帶 root/stun 的 `applyStatus`,其中 47 支持續
         * ≥ 1 秒,最長 4 秒 = 120 tick —— 是 `stallTicks` 的四倍。關掉這一格,
         * 一個被定身 1 秒以上的玩家會被判定成「走位卡住」,走位權被追擊搶走,
         * 解控之後角色往反方向跑。
         *
         * ⚠️ 不要用「把 stallTicks 調大到 120」代替它:那會讓真的卡在柱子上的
         * 玩家等四秒才被救。
         */
        ccPausesStall: z.boolean(),
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

/**
 * 場地環境火焰 —— `dressArena` 掛在競技場布景道具上的常駐火焰粒子。
 *
 * owner 2026-08-01 實戰回饋：「場地天空火焰很礙眼 請全部場地都去掉」(GH#251)。
 * 出貨值因此是 `enabled: false`。**程式碼沒有被刪掉**：這是一個「要不要有環境
 * 火」的決策點，不是一個 bug，所以它是一格開關而不是一次刪除 —— owner 改主意時
 * 只要把這一格打開就好，不必再改程式碼＋重新部署一次（CLAUDE.md 第一守則）。
 *
 * `models` 是「哪些布景道具會冒火」：值是對 decor `model` 路徑做**子字串**比對，
 * 也就是 `dressArena` 原本寫死的那個 `d.model.includes("torch")`。清單留空 =
 * 沒有任何道具冒火（等同關閉），這是刻意的：一個空清單讀起來就是「沒有東西該
 * 冒火」，不需要第二種語意。
 */
export const zArenaFire = z
  .object({
    /** 總開關。false = `dressArena` 一個火焰粒子系統都不建立。 */
    enabled: z.boolean(),
    /**
     * 會冒火的 decor 模型（對 `model` 路徑做子字串比對，例如 `"torch"` 命中
     * `assets/models/props/torch.glb` 與 `torch_mounted.glb`）。
     * 上限 8 條是為了讓「哪些道具會冒火」還是一件看得懂的事；每一條上限 64 字
     * 擋掉把整份路徑清單黏成一條字串貼進來的誤填。
     */
    models: z.array(z.string().min(1).max(64)).max(8),
    /**
     * 整張場地最多幾個火焰粒子系統。出貨的 skeleton / castle / colosseum 各有
     * 16 個火把，所以 16 是「全部點燃」；上限 64 擋掉把 16 打成 160/1600 這種
     * 誤填（每一個都是一組獨立的 ParticleSystem + 一張貼圖）。
     */
    maxEmitters: z.number().int().min(0).max(64),
    /** 每個火焰每秒噴幾顆粒子。上限 200 擋掉把 18 打成 180/1800。 */
    emitRate: z.number().min(0).max(200),
    /**
     * 火焰粒子大小的倍率（1 = 原本的 0.3–0.6 世界單位）。上限 4 擋掉把「倍率」
     * 當成「百分比」填 100 的那種誤填 —— 4 倍已經是一顆比英雄還高的火球。
     */
    sizeScale: z.number().min(0.05).max(4),
  })
  .strict();

export const zConfigAmbientVfxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ambient-vfx@1"),
    /** modelKey -> ambient attachments applied while an entity uses the model */
    bindings: z.record(z.string().min(1), z.array(zAmbientVfxBinding)),
    /** 場地布景道具的常駐火焰（GH#251）。缺席 = 用 `DEFAULT_ARENA_FIRE`。 */
    arenaFire: zArenaFire.optional(),
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
 * `#rrggbb`, and nothing else. A colour is a value with a **shape**, and the
 * shape is this field's upper bound in exactly the sense #277 means: without it
 * an operator can type 「紅」 into the form, the PUT succeeds, and the game
 * silently keeps the old colour — 「存了但畫面沒變」, the failure form this repo
 * hates most. Six digits only (no `#rgb`, no `rgba()`): one accepted spelling
 * means one parser on the client and one thing to assert in a test.
 */
const zColorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "顏色必須是 #rrggbb");

/**
 * config.damage-colors@1 — 傷害數字與受擊閃光的**四向配色**
 * (`config/damage-colors.json`).
 *
 * owner 2026-08-01, verbatim:
 *   「真實傷害目前在畫面上看不出來 => 顯示白色傷害數字(紅物理; 紫魔法; 白真實;
 *     綠治療)」
 *
 * Before this doc the client branched on `=== "magic"` in TWO places
 * (`ui/combatText.combatTextStyle` and `render/combatFeedback.flashColorFor`),
 * so 真實傷害 was pixel-identical to 物理傷害 in both the floating number and
 * the victim body flash. The only channel that already told them apart was the
 * impact spark (`vfx/vfxPresets.IMPACT_TINTS`, three-way since task #33) and the
 * hit SFX (`audio/combatSfx`, `hit` / `hitMagic` / `hitTrue`) — which is why the
 * defect reads as 「看不出來」 rather than 「完全沒反應」.
 *
 * ── WHY THIS IS A CONFIG DOC AND NOT FOUR CONSTANTS IN THE RENDERER ──────────
 * The owner has now overruled this exact palette TWICE IN TWO DAYS (2026-07-31
 * 「魔法傷害(AP) 跳出來的數字應該是紫色系」, then this). A hex literal in
 * `apps/client/**` is baked into the image at BUILD time, so each of those two
 * words cost a full rebuild + container restart; `content/` is the live
 * bind-mount, so this doc costs a save. That is CLAUDE.md 第一守則's stated
 * reason, and the seam already exists — `ContentDb.load` pushes gore / stealth /
 * vfx-families / model-lod into the render layer the same way.
 *
 * ── WHY `text` AND `flash` CARRY DIFFERENT VALUES FOR THE SAME SCHOOL ────────
 * They are not the same physical channel and 「白」 is only achievable in one of
 * them. The floating number is DOM text drawn over a hard black ring, so pure
 * white is its most legible possible fill (21:1 against the ring). The victim
 * flash is a Babylon overlay drawn with ALPHA_COMBINE
 * (`out = base·(1−a) + flash·a`), where a white overlay can only push channels
 * UP — measured against the real w3x tints in `config/unit-tints.json` it moves
 * a pale model by ΔRGB 0.03–0.09, i.e. it is INVISIBLE on exactly the models the
 * complaint is about. So the flash's 真實 entry is the palest colour that still
 * moves a pale model (a cyan-white), and `damagePalette.test.ts` measures it.
 * Same AXIS in both channels — three schools, three answers — different values,
 * on purpose, and both are yours to change.
 */
export const zDamageTextAxis = z.enum(["damageType", "relation"]);

/**
 * 哪些飄字算「我被打」,也就是要換外框的那一組 (owner 2026-08-01
 * 「加第二個通道，不動色相 => ok」)。
 *
 * `off` ＝ 這個功能出現之前的行為(全部同一個外框)。
 * `taken` ＝ 只有真的掉血的那個數字換框。
 * `incoming` ＝ 所有「朝我來的」都換框:掉血、被盾吃掉(GUARD)、閃掉(閃避)。
 *
 * 為什麼這是一個欄位而不是寫死: 「閃避」是不是「我被打」在字面上兩邊都說得通
 * (它是朝我來的一擊,但我沒被打到)。`ui/combatText` 自己的檔頭說 dodge
 * 「occupies the same slot in the player's attention」,所以出貨值選 `incoming`;
 * 覺得太吵就切 `taken`,不必改程式。
 */
export const zCombatTextOutlineMode = z.enum(["off", "taken", "incoming"]);

export const zConfigDamageColorsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.damage-colors@1"),
    note: z.string().optional(),
    /**
     * What a DAMAGE number's hue means. `damageType` is owner's ruling and the
     * shipped default; `relation` is the pre-ruling behaviour (hue = 受到/造成,
     * damage school shown only as a violet accent on magic) kept expressible
     * because it is a genuine trade-off, not a bug — see the admin page's note.
     */
    textAxis: zDamageTextAxis,
    /** Floating-number fills. `heal` applies on both axes; the rest only on `damageType`. */
    text: z
      .object({
        physical: zColorHex,
        magic: zColorHex,
        true: zColorHex,
        heal: zColorHex,
      })
      .strict(),
    /** Victim body-flash overlay colours (three schools; heal never flashes a body). */
    flash: z
      .object({
        physical: zColorHex,
        magic: zColorHex,
        true: zColorHex,
      })
      .strict(),
    /**
     * ── 第二個通道:外框 (owner 2026-08-01 「加第二個通道，不動色相 => ok」) ──
     *
     * `textAxis: "damageType"` 的代價是「我打人」與「我被打」同一個色相。這一組
     * 把那個分別放回去,**不動色相**:填色繼續講傷害屬性,外框講「這個數字是誰
     * 的血」。兩個通道互不搶。
     *
     * ⚠️ 這裡調的是**外圈**,不是那圈黑框。硬黑框是 #164「傷害數字看起來是黑色」
     * 留下來的辨識度地板,而且它**沒有餘裕可以換色** —— 實測:黑框對土色地面
     * (#6d6250) 只有 3.51:1,而物理傷害的填色 #FF5900 在同一個地面只有 1.90:1,
     * 也就是說那個地面完全靠黑框撐。把黑框換成任何一個看得出來是紅色的顏色
     * (#5A0000 → 2.45:1)就會掉到 3.0 以下,整個數字在土地上糊掉。
     *
     * 所以外圈是**多畫一層**,畫在黑框後面、比黑框大 `widthMult` 倍:黑框原封不
     * 動(地板還在),外圈提供顏色。`outgoing` 的出貨值就是黑色,而**與黑框同色的
     * 外圈不會被畫出來**(在黑框後面畫一圈黑只是多花畫素),所以「我打人」那一
     * 組的 CSS 和這個功能出現之前一字不差。
     */
    outline: z
      .object({
        /** 哪些飄字算「我被打」。`off` = 這個功能出現之前的行為。 */
        mode: zCombatTextOutlineMode,
        /** 「我打人」(以及所有第三方飄字)的外圈色。出貨黑 = 看不到外圈。 */
        outgoing: zColorHex,
        /** 「我被打」的外圈色。出貨深紅 #5A0000。 */
        incoming: zColorHex,
        /**
         * 外圈半徑 ÷ 黑框半徑。1.9 → 30px 的受傷數字得到一圈約 1.8px 的深紅。
         * 下界 1.1:等於 1 就完全被黑框蓋住,那是第二個關閉開關。
         * 上界 3:黑框 2px × 3 = 6px,再大就不是描邊而是一團色塊了。
         */
        widthMult: z.number().min(1.1).max(3),
      })
      .strict(),
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

/**
 * config.model-lod@1 —— 「哪一個畫質等級去抓哪一階模型檔」的對照表
 * (`config/model-lod.json`, task #115)。
 *
 * 為什麼是內容而不是程式裡的 switch:這張表是**平衡/體感決策**,不是事實。
 * 目前量到的變體覆蓋率是 83/167(49.7%),`-small` 平均省掉一半以上的面數與
 * 位元組;但「中畫質到底該吃 mid 還是 small」要看真機發燙與畫面能接受到哪裡,
 * owner 會想改。寫死的話改一格 = 一次 client rebuild + 重新部署;放在
 * `content/` 就是存檔即生效(content/ 是 live bind-mount)。
 *
 *   · `enabled`     總開關。false = 一律載原檔,等於 #115 之前的行為。
 *                   線上如果發現某一階的檔壞了,這一格是止血閥。
 *   · `presetTiers` 四個 preset 各自對到 high/mid/small。
 *
 * ⚠️ `auto` 預設留在 `high` 是**刻意**的,不是漏填:自適應階梯每幾秒就會換一
 * 級,而換模型階 = 丟掉 AssetContainer 再發一次網路請求。讓它跟著階梯跑,就會
 * 在最撐不住的那台機器上、打到一半、反覆下載模型。改這一格之前先讀
 * `apps/client/src/render/modelLod.ts` 的檔頭。
 *
 * 缺的階自動退回:要 small 但只生了 mid → 給 mid;兩個都沒有 → 給原檔。所以
 * 這張表**不可能**因為某個模型沒有變體而 404(`resolveLodPath` 在守)。
 */
export const zModelLodTier = z.enum(["high", "mid", "small"]);

export const zConfigModelLodDoc = z
  .object({
    id: zId,
    schema: z.literal("config.model-lod@1"),
    note: z.string().optional(),
    /** 總開關。false = 每個 preset 都載原檔。 */
    enabled: z.boolean(),
    /** 畫質 preset -> 要抓的模型階。四個都必填,不允許靜默漏掉一個。 */
    presetTiers: z
      .object({
        low: zModelLodTier,
        medium: zModelLodTier,
        high: zModelLodTier,
        auto: zModelLodTier,
      })
      .strict(),
  })
  .strict();

/**
 * config.vfx-cleanup@1 —— 回合邊界要把特效層的池子回收到什麼程度
 * (`config/vfx-cleanup.json`, task #262)。
 *
 * owner 的症狀是「越打越鈍」「一場就很燙」+ 親眼看到殘留特效。#259 已經把
 * **live** 的一次性效果與 VfxSystem/rig 自己的池子在回合邊界還回去了；量出來
 * 還在漏的是 `Telegraph` 的**每個 Scene 共用**的網格 free-list：它以
 * 「半徑字串」為 key，一個 key 最多 8 個 ring mesh(各自一份 StandardMaterial)，
 * 而那張 Map 沒有人清 —— `TelegraphLayer.dispose()` 也不清。實測 60 個不同
 * 半徑打完，`dispose()` 之後 scene 上仍留著 72 mesh / 73 material /
 * 13 texture / 12 particleSystem。
 *
 * 為什麼是內容而不是常數:「回合之間要不要把暖好的池子丟掉」是**體感取捨**,
 * 不是事實。丟掉 = 穩態記憶體最低,代價是下一回合第一次施法要重新配置;留著
 * = 第一次施法不卡,代價是那些網格整場都在。哪一邊比較好要看 owner 在真機上
 * 打起來的感覺,而寫死的話改一格 = 一次 client rebuild + 重新部署。
 *
 *   · `enabled`                    總開關。false = 完全回到 #259 的行為
 *                                  (只清 live 效果,共用池子不動)。止血閥。
 *   · `purgeSharedPoolsOnRoundEnd` 回合結束是否強制清空共用池子。
 *   · `maxPooledRings`             不強制清空時,整個 scene 允許留幾個預告圈
 *                                  網格。超出的部分在回合邊界被丟掉。0 = 一個
 *                                  都不留(等於強制清空 ring 那一層)。
 *
 * ⚠️ 「角色退場時歸還 tint clone 材質」**刻意不做成開關**:那是正確性修復
 * (未著色英雄 + 成長階級 > 0 的 clone 從來沒被歸還,實測每回合 +30 個
 * material 線性成長),不是 owner 會想推翻的判斷。給它一個開關等於把
 * 「要不要漏記憶體」放上後台。
 */
export const zConfigVfxCleanupDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-cleanup@1"),
    note: z.string().optional(),
    /** 總開關。false = 回合邊界不碰共用池子(#259 的行為)。 */
    enabled: z.boolean(),
    /** 回合結束是否強制清空共用池子(ring / fill / shockwave free-list)。 */
    purgeSharedPoolsOnRoundEnd: z.boolean(),
    /**
     * 不強制清空時,整個 scene 允許留下的預告圈網格上限。每一個網格帶一份
     * StandardMaterial,所以這個數字直接就是「回合之間常駐的 mesh/material 數」。
     * 上下界都有:0 = 一個都不留;512 是實測 60 個半徑 × 每個 key 上限 8 的
     * 量級,再高就沒有意義而只會讓打錯的數字靜默通過(#277 的形狀)。
     */
    maxPooledRings: z.number().int().min(0).max(512),
  })
  .strict();

/**
 * config.shield@1 — 護盾規則 (GH#289 lane P6)。
 *
 * 目前只有一格:**同一個單位身上有多個護盾池時,誰先被吃掉**。語意、三個值的
 * 差別、以及「為什麼這是欄位不是寫死的 if」全部寫在 `sim/shieldRules.ts`。
 *
 * ⚠️ 為什麼是自己一份文件,而不是塞進 `config.combat-feel@1`:
 *   · 語意上 combat-feel 是**手感**(擊退距離、打就站定、面向鎖窗口),護盾誰
 *     先吃是**傷害結算規則**,兩者一起調的機會是零;
 *   · 技術上 combat-feel 那一頁的後台欄位是 `deriveFields(zConfigCombatFeelDoc)`
 *     推導出來的,而那支推導器只認得 number / boolean —— enum 會被歸進
 *     `unsupported`,而 `apps/admin/src/combatFeel.test.ts` 斷言
 *     `unsupported` 必須是空陣列。把一個 enum 塞進去 = 隔壁工作流的頁面紅掉,
 *     而那個紅燈的意思是「有人要決定這一格的 UI 長怎樣」,不是「schema 錯了」。
 *
 * **缺文件 = 出貨預設**(`specificFirst` = 這條規則變成欄位之前的行為),不是空表。
 */
export const zConfigShieldDoc = z
  .object({
    id: zId,
    schema: z.literal("config.shield@1"),
    note: z.string().optional(),
    /**
     * 多個護盾池同時吃得下這一發時的消耗順序。
     *
     *   specificFirst   先花只吸這一型的池子(出貨值 = 舊行為)
     *   generalFirst    先花全類型的池子 —— 讓「先打掉泛用盾、逼出抗魔盾」
     *                   變成一個可以操作的節奏
     *   insertionOrder  不看類型專一性,純粹舊的先花 —— 護盾會過期,先花快到期
     *                   的那個才不會浪費
     *
     * 三個值都有行為守衛(sim/effects/shieldAbsorb.test.ts:同一組池子 + 同一發
     * 傷害 → 三種順序留下三組不同的剩餘量)。
     */
    absorbOrder: z.enum(["specificFirst", "generalFirst", "insertionOrder"]),
  })
  .strict();

/**
 * config.block@1 — 格擋規則。
 *
 * 目前只有一格:**同一個單位身上有多個格擋來源時,它們怎麼疊**。語意、owner 的
 * 原話、以及「為什麼 `best` 還留著」全部寫在 `sim/blockRules.ts`。
 *
 * ⚠️ 和 `config.shield@1` 不同,**這份文件的出貨值會改變平衡**,而且是故意的:
 * owner 2026-07-31 裁決「這種情形應該是獨立判斷兩次,拿第一次檔掉剩餘繼續算
 * 下一次」,推翻了原本的「取最好的一個、只抽一次」。晨曦之光 + 殺豬刀從 30%
 * 變成 51%。舊行為保留成 `best`,後台切得回去。
 *
 * 為什麼是自己一份文件而不是塞進 `config.shield@1`:護盾與格擋在 `damage.ts`
 * 是**兩段相鄰但獨立**的結算(格擋在護盾之前、而且刻意不吃護盾),而 schema 加
 * 一格等於把 `config.shield@1` 升版 —— 一份已經在線上存過 overlay 的文件升版,
 * 代價是操作者存過的值全部要遷移。同理也不塞 `config.combat-feel@1`:那一頁的
 * 欄位是 `deriveFields()` 從 Zod 推導的,而那支推導器只認得 number / boolean,
 * 塞一個 enum 進去就是把隔壁工作流的頁面弄紅(同 `config.shield@1` 的理由)。
 *
 * **缺文件 = 出貨預設**(`independent`),不是空表 —— 一個 undefined 的 stacking
 * 會讓 `blockCutFor` 兩條分支都不走,也就是格擋整族靜默失效。
 */
export const zConfigBlockDoc = z
  .object({
    id: zId,
    schema: z.literal("config.block@1"),
    note: z.string().optional(),
    /**
     * 多個格擋來源同時吃得到這一發時,它們怎麼疊。
     *
     *   independent  每個來源各抽各的,擋中的從**剩餘**傷害裡扣掉自己的
     *                `fraction`,剩下的交給下一個(出貨值 = owner 的裁決)
     *   best         只有 `chance × fraction` 最大的那一個參與,整發只抽一次
     *                (= 這條規則變成欄位之前的行為)
     *
     * 兩個值都有行為守衛(`sim/combat/block.test.ts` ⑤:同一組來源 + 同一顆
     * 種子 → 兩種模式給出兩組不同的擋掉量與不同的 rng draw 數)。
     */
    stacking: z.enum(["independent", "best"]),
  })
  .strict();

/**
 * config.stealth@1 — 隱形規則 (隱形原語 lane D).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在 `packages/shared/src/sim/
 * stealth.ts`。四個「擋不擋」與三個「破不破」全部是 WC3 原作行為,所以這份文件
 * 出現本身不改變任何一場比賽 —— 它只是把已經寫在程式裡的那些決定變成可以改的。
 *
 * ⚠️ **缺文件 = `DEFAULT_STEALTH_RULES`(出貨值)**,不是空表。空表在 TypeScript
 * 底下會讓四個 `blocks*` 全部讀成 `undefined`(falsy),也就是隱形只剩畫面、
 * 完全不影響索敵 —— 而畫面上看起來一切正常。
 *
 * 為什麼是自己一份文件而不是塞進 `config.combat-feel@1`:combat-feel 是**手感**
 * (擊退距離、打就站定、面向鎖),隱形是**可見性規則**,兩者一起調的機會是零;
 * 而且 combat-feel 那一頁的欄位是從 Zod 推導的,同一個理由(見 shield 那段)。
 */
export const zConfigStealthDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stealth@1"),
    note: z.string().optional(),
    /** 隱形是否讓敵人的**自動索敵**看不到你(WC3: 是) */
    blocksAutoAcquire: z.boolean(),
    /** 隱形是否讓**殭屍/小怪的 aggro** 看不到你(WC3: 是) */
    blocksMobAggro: z.boolean(),
    /** 隱形是否讓敵方玩家**點不到你**(WC3: 是) */
    blocksManualTarget: z.boolean(),
    /**
     * 隱形是否讓**技能 AoE 打不到你**。
     * WC3 出貨值是 **false** —— 暴風雪照樣燒得到隱形單位。true 會把永久隱形
     * 變成「穿過整場戰鬥毫髮無傷」,那是另一種設計而不是原作。
     */
    blocksAbilityAoe: z.boolean(),
    /** 普攻是否破隱(WC3: 是) */
    breaksOnBasicAttack: z.boolean(),
    /** 施法是否破隱(WC3: 是) */
    breaksOnCast: z.boolean(),
    /** **被打**是否破隱(WC3: 否) */
    breaksOnDamaged: z.boolean(),
    /**
     * 全域淡出延遲倍率。1 = 照技能文件寫的秒數(27-00 永久性的隱形術 = 4.0 s,
     * 直接來自 w3x `Dur` 欄)。上界 10 是誤植守衛(#277 的形狀):打成 40 等於
     * 那位英雄整場再也不會隱形,而畫面上看起來就是「功能壞了」。
     */
    fadeDelayMult: z.number().min(0).max(10),
    /** 己方看到的隱形隊友不透明度。**不要設 0** —— 你會看不到自己的角色。 */
    allyAlpha: z.number().min(0).max(1),
    /** 敵方(沒有真視)看到的不透明度。0 = 完全消失;>0 = 半透明鬼影。 */
    enemyAlpha: z.number().min(0).max(1),
    /** 隱形時對敵方隱藏血條(WC3: 是 —— 看不到單位自然看不到血條) */
    hideEnemyHealthBar: z.boolean(),
  })
  .strict();

/**
 * config.taunt@1 — 嘲弄規則 (鍊金術之盾 godie-i06q 的 [嘲弄]).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在
 * `packages/shared/src/sim/taunt.ts` 的 {@link TauntRules}。
 *
 * ⚠️ **缺文件 = `DEFAULT_TAUNT_RULES`(出貨值)**,不是空表。空表在 TypeScript
 * 底下會讓 `enabled` 讀成 `undefined`(falsy),也就是嘲弄靜默消失 —— 道具照樣
 * 買得到、描述照樣寫著「吸引周圍敵人」、內部冷卻照樣在跑,而場上沒有任何人被
 * 拉走。這是 `stealthRules` / `statCaps` 學過的同一課。
 *
 * 為什麼是自己一份文件而不是塞進 `config.combat-feel@1`:combat-feel 是**手感**
 * (擊退距離、打就站定、面向鎖窗口),嘲弄是**索敵規則**,兩者一起調的機會是零;
 * 而且 combat-feel 那一頁的欄位是 `deriveFields(zConfigCombatFeelDoc)` 推導的,
 * 而那支推導器不認得 enum(`conflictMode` 會落進 `unsupported`,而
 * `apps/admin/src/combatFeel.test.ts` 斷言 `unsupported` 必須是空陣列)——
 * 塞進去就是把隔壁工作流的頁面弄紅。同 `config.shield@1` 的理由。
 */
export const zConfigTauntDoc = z
  .object({
    id: zId,
    schema: z.literal("config.taunt@1"),
    note: z.string().optional(),
    /** 總開關;false = 嘲弄完全不存在(既有紀錄讀不出來,新的也寫不進去) */
    enabled: z.boolean(),
    /**
     * **決策點**:嘲弄要不要蓋掉玩家**自己右鍵點名**的目標。
     * 出貨 false = 只接管自動索敵與 bot／小怪 aggro,玩家手上的方向盤不動。
     * true = WC3 原作行為(嘲弄連玩家指令一起蓋掉)。
     */
    overridesManualOrder: z.boolean(),
    /**
     * **決策點**:上面那格開著時,嘲弄退掉之後要不要把玩家原本點名的目標
     * **還回去**。出貨 true。
     *
     * ⚠️ 它以前不存在,而缺席不是「少一個選項」是一個缺陷:被搶走的手選目標
     * 會被 `attackTargetAuto = true` 重新填上,也就是一次右鍵點名被**永久**
     * 轉成自動目標。一個布林值決定兩件事,而卡片上只寫了前一件。
     */
    restoreManualOrderOnLapse: z.boolean(),
    /** **決策點**:小怪(殭屍/殭屍王)吃不吃嘲弄。出貨 true。 */
    appliesToMobs: z.boolean(),
    /**
     * **決策點**:小怪被嘲弄時,嘲弄者是**取代**牠的最近敵人掃描(出貨
     * `replace`),還是只**偏袒**(`nearestFirst` —— 掃描照跑,嘲弄者只有在沒有
     * 更近的敵人時才贏)。
     */
    mobTauntMode: z.enum(["replace", "nearestFirst"]),
    /**
     * **決策點**:嘲弄在索敵比較器裡站哪一格。
     * `absolute`(出貨,= owner 卡面「優先攻擊自己」)= sort key 0,壓過
     * 「敵方英雄優先」與「威脅」;`aboveThreatOnly` = 排在「敵方英雄優先」
     * 之後。差別只在嘲弄者與另一個候選**種類不同**時看得到。
     */
    priority: z.enum(["absolute", "aboveThreatOnly"]),
    /**
     * **決策點**:一個被嘲弄的身體最多被拖多遠(GGD 單位)。0 = 不限制。
     * 出貨 24 = 一個決鬥區的半徑;上界 100 是誤植守衛(區域直徑才 48)。
     */
    leashUnits: z.number().min(0).max(TAUNT_LEASH_MAX),
    /**
     * **決策點**:一發**範圍**嘲弄最多拉幾個人。卡片沒寫 `maxTargets` 時用
     * 它,卡片寫了也夾不過它。出貨 20 = 這一格出現前寫死的那個數字。
     */
    maxTargetsCap: z.number().int().min(1).max(TAUNT_MAX_TARGETS),
    /**
     * **決策點**:上面那個上限砍人時**留下哪幾個**。
     * `nearest`(出貨,由近到遠)/ `lowestHp`(血最低先拉)/ `id`(先生成先拉)。
     */
    capOrder: z.enum(["nearest", "lowestHp", "id"]),
    /**
     * **決策點**:同一個人被兩個敵人先後嘲弄時誰贏。
     * newest(出貨)= 最後喊的贏;longest = 剩餘時間長的贏。
     */
    conflictMode: z.enum(["newest", "longest"]),
    /**
     * 全域持續時間倍率,乘在內容自己寫的秒數上。1 = 照文件寫的。
     * 上界 10 是誤植守衛(#277 的形狀):0.5 秒打成 40 倍就是 20 秒,
     * 整整一波交戰所有人都在打同一個人,而畫面上看起來就是「索敵壞掉了」。
     */
    durationMult: z.number().min(0).max(TAUNT_DURATION_MULT_MAX),
  })
  .strict();

/**
 * config.body-scale@1 — 身體放大倍數 → 攻擊距離 (GH#252).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在
 * `packages/shared/src/sim/bodyScale.ts`。
 *
 * ⚠️ **這份文件的出貨值會改變平衡**,和 `config.shield@1` 相反:在它出現之前
 * 射程完全不看體型,所以出貨曲線不是「維持原狀」而是 owner 要的新行為。要退回
 * 舊行為把 `enabled` 關掉。
 *
 * ⚠️ **缺文件 = `DEFAULT_BODY_SCALE_RULES`(出貨值)**,不是空表 —— 空表在
 * TypeScript 底下會讓曲線讀成 `undefined`,而 `undefined[0].rangeMult` 一路
 * 乘進 `Stat.AttackRange` 就是全場沒有人打得到人。
 *
 * ⚠️ **兩端夾住,不外推。** 小於第一個斷點取第一列,大於最後一個取最後一列。
 * 這是一個決定不是省事:外推要猜一條沒有人審過的斜率,而一隻 `sizeMult` 8 的
 * 殭屍王會照那條斜率一路長到一個 owner 從來沒看過的射程。要涵蓋更大的體型,
 * **加一列**(那是一個看得見的決定),不要改成外推(那是一個看不見的決定)。
 */
export const zConfigBodyScaleDoc = z
  .object({
    id: zId,
    schema: z.literal("config.body-scale@1"),
    note: z.string().optional(),
    /** 總開關。false = 攻擊距離完全不看體型(= 這個功能出現之前的行為)。 */
    enabled: z.boolean(),
    /**
     * **決策點**:體型 → 普攻射程倍率的斷點表,中間線性內插、兩端夾住。
     *
     * owner 2026-08-01:「**通常不會是等比倍率**,例如 2x body, 1.2x 攻擊距離;
     * 3x body 1.3x攻擊距離」——「遞減」不是一個係數表達得出來的東西(單一係數
     * 只畫得出一條直線),所以這裡放的是表不是數。
     *
     * 上界:8 個斷點是可讀性上限(要捲動的表看不出它是不是遞減的);體型 10 是
     * 小怪波 `boss.sizeMult` 的出貨值(貼錯格擋在這裡);倍率 3 擋的是「把百分比
     * 當倍率填」(120 → 120 倍射程,那位英雄會從畫面外開打)。
     */
    attackRangeCurve: z
      .array(
        z
          .object({
            /** 身體放大倍數(英雄卡的 `bodyScale`,1 = 一般體型)。 */
            bodyScale: z.number().min(0.1).max(10),
            /** 這個體型對應的普攻射程倍率(1 = 照卡面)。 */
            rangeMult: z.number().min(0.1).max(3),
          })
          .strict(),
      )
      .min(2)
      .max(8)
      // 嚴格遞增:重複的 `bodyScale` 會讓內插除以 0(→ Infinity 射程),而順序
      // 錯掉的表在畫面上看起來完全正常,只有內插結果是亂的。
      .refine(
        (pts) => pts.every((p, i) => i === 0 || p.bodyScale > pts[i - 1]!.bodyScale),
        { message: "attackRangeCurve 必須依 bodyScale 由小到大排列,而且不可以有重複的體型" },
      ),
  })
  .strict();

/**
 * config.regen@1 — 百分比回血 **與百分比扣血** 規則 (GH#253).
 *
 * 每一格的語意寫在 `packages/shared/src/sim/regenRules.ts`。
 *
 * ⚠️ 兩族欄位都是「英雄卡有填才啟動」:
 *   · 回血族(`pctEnabled` / `pctMode` / `floorPerSec` …)看英雄卡的
 *     `healthRegenPctOfMax` —— **出貨內容目前沒有任何一位填它**,所以這一族
 *     現在對每一場比賽都是 no-op;
 *   · 扣血族(`drain*`)看 `healthDrainPctOfMax` —— 出貨只有海克力斯 - Berserker
 *     (`godie-hapm`,0.01)填了,而 `drainFloorPctOfMax: 0.01` 就是 owner
 *     2026-08-02 的「直到生命不足 1%」。
 *
 * ⚠️ **缺文件 = `DEFAULT_REGEN_RULES`(出貨值)**,不是空表:一個 undefined 的
 * `pctMode` 會讓 `healthRegenPerSec` 兩條分支都不走 = 全場沒有人回血。
 */
export const zConfigRegenDoc = z
  .object({
    id: zId,
    schema: z.literal("config.regen@1"),
    note: z.string().optional(),
    /** 百分比回血的總開關。false = 英雄卡上的百分比全部當作沒填。 */
    pctEnabled: z.boolean(),
    /**
     * **決策點**:百分比是**取代**英雄卡那條固定回血,還是**疊加**在上面。
     * `replace` = 出貨值 = owner 的「沒有保底」——「疊加」等於給了一條與最大
     * 生命無關的地板,那正是 owner 要移除的東西。
     */
    pctMode: z.enum(["replace", "add"]),
    /**
     * **決策點**:保底,每秒至少回這麼多點。**出貨 0 = 沒有保底**(owner 裁決)。
     * 上界 1000 是誤植守衛:Berserker 一級最大生命約 7.5k,1% 是 75/秒,
     * 所以 1000 已經是「這條地板自己就能撐住一場」。
     */
    floorPerSec: z.number().min(0).max(1000),
    /** **決策點**:百分比那一項要不要吃 戰鬥系統 的 `healthRegen` 全域倍率。 */
    applyEnvMultiplier: z.boolean(),
    /**
     * **決策點**:百分比只給英雄(出貨 true)。關掉之後,一隻臉是 Berserker 的
     * 隨機英雄殭屍王也會每秒回 1% 最大生命。
     */
    championsOnly: z.boolean(),
    /** 百分比**扣血**的總開關(出貨 true)。關 = 英雄卡上的自傷全部當作沒填。 */
    drainEnabled: z.boolean(),
    /**
     * **決策點**:扣血停在「最大生命的」這個比例。出貨 `0.01` = owner 2026-08-02
     * 的「直到生命不足 1%」。上界 0.5 是誤植守衛 —— 地板高過半條命的話,扣血在
     * 絕大多數局面裡一點事都不會發生。
     * ⚠️ 填 0 也扣不死人:扣血不走傷害管線,沒有人會設 `alive`,所以實作把有效
     * 地板夾在 1 點之上(`regenRules.ts` 的 `MIN_ALIVE_HP`)。
     */
    drainFloorPctOfMax: z.number().min(0).max(0.5),
    /**
     * **決策點**:打到地板那一刻停手還是夾住 —— 兩者在「同時被敵人打」時完全不同。
     * `stop`(出貨)= 扣血自己不再往下,但也不把血條往上拉,敵人照樣殺得死他
     * (自傷不是無敵,這是 owner 的裁決)。`clamp` = 每 tick 夾在地板 = 免疫致死。
     */
    drainFloorMode: z.enum(["stop", "clamp"]),
    /** **決策點**:扣血只給英雄(出貨 true)。關掉之後殭屍王也會自己掉血。 */
    drainChampionsOnly: z.boolean(),
  })
  .strict();

/**
 * config.victory-fx@1 — 勝利煙火的開關 (#93 / #235).
 *
 * owner 2026-08-02 實戰回饋：「天空的火焰似乎沒有被移除，我懷疑是煙火的時間太長」
 * → 裁決「請你直接取消煙火(變成後台開關)」。**出貨值兩格都是關的。**
 *
 * ⚠️ 程式碼一行都沒有刪。「回合結束要不要放煙火」是一個決策點，不是一個 bug
 * （CLAUDE.md 第一守則）——owner 改主意時是後台打一個勾，不是再改一次程式碼
 * 加重新部署。GH#251 的 `arenaFire` 是同一個形狀，也是同一個理由。
 *
 * ⚠️ **兩格分開，不是一格。** 兩層是刻意不同的效果（`fireworkMath` 的檔頭寫著
 * 「deliberately NOT the same effect at two sizes」），而且成本與頻率差一個
 * 量級：回合小煙火一場放 3–5 次、峰值 +28 個 ParticleSystem、持續約 1.3 秒；
 * 全場結束的烤雞煙火一場放一次、峰值 +8 個 ParticleSystem 加一個自訂 shader 的
 * mesh、持續約 4.3 秒。用一格把兩者綁死，等於下次 owner 想「只留吃雞」時又要
 * 改一次程式。
 *
 * ⚠️ 這一份**不管畫面變灰／變暗**（`render/victoryPresentation` 的 wash）、
 * 也不管勝利的嘲弄語音（`config/victory-taunts.json`）。owner 要拿掉的是**煙火**，
 * 把結算畫面的底色和語音一起關掉會是一個沒有人要求的迴歸。
 */
export const zVictoryFireworkTier = z
  .object({
    /** 這一層煙火要不要放。false = 一個粒子系統都不會被建立。 */
    enabled: z.boolean(),
  })
  .strict();

export const zConfigVictoryFxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.victory-fx@1"),
    note: z.string().optional(),
    /** 每一回合贏的時候，天空那一輪小煙火（#235，約 1.3 秒）。 */
    roundVolley: zVictoryFireworkTier,
    /** 全場結束吃雞時，那隻全螢幕的烤雞煙火（#93，約 4.3 秒）。 */
    matchChicken: zVictoryFireworkTier,
  })
  .strict();

/**
 * config.item-card@1 — 道具卡片的**排版與配色**（`config/item-card.json`）。
 *
 * owner 2026-08-02, verbatim:
 *   「卡片道具的排版連在一起不好閱讀，關於效果及數值的部分應該要特殊顏色表示」
 *   「先做傳說武器道具開放的49個的部分就好」
 *   「別漏掉 [隱形]、[焚身] ...之類」
 *
 * ── 為什麼是一份 config 文件，不是元件裡的 if-else ──────────────────────────
 * owner 手寫的 49 支傳說文案把機制關鍵字寫成 `[標記]`（`[焚身]`、`[緩慢]`…），
 * 而那些字**不准被改**（`legendary49OwnerText.test.ts` 逐位元組比對）。所以卡片
 * 只能在**渲染時**解析：把 `[xx]` 認成 chip、把數值認成 token。那就需要一張
 * 「標記 → 分類」對照表，而這張表**一定會長**：owner 每寫一支新道具就可能發明
 * 一個新標記。表寫在元件裡 = 每新增一個標記就是一次 rebuild + 重啟容器；表寫在
 * `content/` = 存檔就生效（第一守則的那個理由，這裡是第 N 次）。
 *
 * ── 四個分類是 owner 核准的語意，不是這裡發明的 ─────────────────────────────
 *   `stat`    屬性加成（純數值，不需要任何事件）
 *   `active`  主動效果（需觸發：普攻、施法、擊殺、受擊…）
 *   `passive` 被動效果（常駐，沒有觸發事件）
 *   `debuff`  負面/控場（作用在敵人身上）
 *
 * ⚠️ 分類線最模糊的一條是 active↔passive。這裡採用的判準是「**有沒有一個離散的
 * 觸發事件**」：`[擴散]`（普攻濺射）算 active，`[流星]`（每秒自動）算 passive。
 * 這是判斷，不是真理 —— 所以它是一格資料。覺得 On-Hit 該算常駐，改這份 JSON 的
 * 一列即可，不要回來改程式。
 *
 * ── 未知標記不可以讓卡片壞掉 ────────────────────────────────────────────────
 * `unknownCategory` 是表上查不到的標記落到哪一類。它存在的理由是失敗形態：
 * owner 明天寫一支新道具用了新標記，卡片必須照常畫出來（chip 有顏色、有分行），
 * 只是分類是預設的那一類。
 */
export const zItemCardCategory = z.enum(["stat", "active", "passive", "debuff"]);

/** 一個分類的畫面樣子：中文標籤 + 它的專用色。 */
const zItemCardCategoryStyle = z
  .object({
    /** chip 旁邊那個分類名（玩家看得到）。 */
    label: z.string().min(1).max(12),
    /** 這一類 chip 的文字/邊框色。卡片專用配色，刻意不沿用戰鬥飄字那五個色。 */
    color: zColorHex,
  })
  .strict();

export const zConfigItemCardDoc = z
  .object({
    id: zId,
    schema: z.literal("config.item-card@1"),
    note: z.string().optional(),
    /** 四個分類各自的標籤與顏色。 */
    categories: z
      .object({
        stat: zItemCardCategoryStyle,
        active: zItemCardCategoryStyle,
        passive: zItemCardCategoryStyle,
        debuff: zItemCardCategoryStyle,
      })
      .strict(),
    /** 數值 token（`+87`、`30%`、`0.6秒`…）的顏色 —— owner 要的「數值特殊顏色」。 */
    numberColor: zColorHex,
    /** 解說/歷史那一段的顏色（刻意比效果暗，讓效果先被讀到）。 */
    loreColor: zColorHex,
    /** 表上查不到的標記落到哪一類 —— 新標記絕不可以讓卡片壞掉。 */
    unknownCategory: zItemCardCategory,
    /**
     * 標記 → 分類。key 是**方括號裡的原字**，一字不差（`On-Hit` 與 `OnHit` 是
     * 兩列，因為 owner 的原稿兩種都寫過，而原稿不准改）。
     */
    markers: z.record(z.string().min(1), zItemCardCategory),
    /**
     * 方括號裡其實是**內嵌數值**而不是關鍵字的那些字串，照數值上色、不畫成 chip。
     *
     * 這一格不是為了通用性發明的：49 支裡真的有一個 ——
     * 虛哭神去（godie-i007）的 `[自身已損失的生命百分比數值(0~100)]`。owner 用
     * 方括號當「這裡填一個值」的佔位符，不是當關鍵字。把它畫成 chip 會出現一個
     * 20 字寬的分類標籤，那就是排版壞掉。
     */
    inlineValueMarkers: z.array(z.string().min(1)),
    /**
     * 哪些整行的字是**段落標題**而不是內容（`效能`、`解說`、`歷史`…）。
     * 比對時會先去掉結尾的全形/半形冒號 —— 狂暴軒轅劍寫的是 `效能：`。
     */
    efficacyHeadings: z.array(z.string().min(1)),
    /** 同上，但這些標題以下的內容是**解說**（暗色、不解析數值）。 */
    loreHeadings: z.array(z.string().min(1)),
  })
  .strict();

/* ══════════════════════════════════════════════════════════════════════════
 * config.boss-intro@1 —— 殭屍王出場演出 (owner 2026-08-02)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * owner 2026-08-02：「殭屍王出場 會音效+大字講該英雄的名言，然後跳出該英雄的
 * 描述及攻略注意要點及弱點等提示，五秒後提示淡出消失」
 *
 * ── 「該英雄」是誰：**每次召喚都不一定是同一個人** ─────────────────────────
 * `mobWaves.boss.championSource` 的出貨值是 `"random"`（owner 2026-07-29
 * 「特殊殭屍 殭屍王 預設是隨機」），所以王借的是**當回合抽到的那位英雄**的臉、
 * 數值與模型 —— 不是固定的喪標麥可。抽籤發生在 arm time
 * （`sim/mobs.mobRulesFromConfig` 的 `mobKindChampion`），結果現在被寫進
 * `MobBossRules.championId` 並隨 `mobBossSpawn` 過線，所以這一頁的內容是
 * 「**這一隻**王穿的是誰」查出來的，不是猜的。
 *
 * ⚠️ 這就是為什麼**逐英雄的文案不能寫死在程式裡**：可能出場的是 120 位裡的
 * 任何一位。缺資料是常態而不是例外，所以 `bossIntroContent` 的契約是
 * 「只吐存在的段落」，不是「缺一段就整個不畫」。
 *
 * ── 名言：**今天沒有這份資料，而且我們沒有編造它** ────────────────────────
 * 每位英雄的名言是 GH#139 / #142，兩張都還是 pending：`champion@1` 沒有
 * `quote` 欄位，`config/victory-taunts.json` 裡的是**嘲弄台詞**（對輸家講的
 * 原創挖苦），不是那個角色的名言，拿來當名言用是張冠李戴。
 * 所以 {@link zBossIntroChampionEntry} 有 `quote` 這一格、出貨值**全部留空**，
 * 由 owner（或 #139）填。空的時候大字整段不畫 —— 不是畫一個空框，也不是塞一句
 * 我們自己寫的台詞。
 *
 * ── 為什麼逐英雄文案在 config 而不在 champion doc ───────────────────────
 * 和 `config/victory-taunts.json` 同一個形狀（那份也是 `championId -> 文案`）：
 * 演出文案是**演出**的資料，不是英雄的定義；放在這裡，一份文件就能看完整場
 * 演出要講什麼，也不用為了一句提示去動 120 份 champion doc。
 */
export const zBossIntroChampionEntry = z
  .object({
    /**
     * 大字名言。**出貨一律空字串**（見上）。空 = 大字那一段整段不畫。
     * ⚠️ 這一格不是「隨便寫一句氣勢的話」；它是那個角色**原作裡的名言**，
     * 沒有考據來源就留空。
     */
    quote: z.string().max(80).optional(),
    /** 攻略注意要點 —— 「打這隻的時候要記得做什麼」。 */
    tips: z.array(z.string().min(1).max(60)).max(6).optional(),
    /** 弱點 —— 「牠哪裡可以被吃」。 */
    weaknesses: z.array(z.string().min(1).max(60)).max(6).optional(),
    /** 這幾行是怎麼推導出來的（給下一個編輯的人看，不上畫面）。 */
    authoringNote: z.string().max(600).optional(),
  })
  .strict();

export const zConfigBossIntroDoc = z
  .object({
    id: zId,
    schema: z.literal("config.boss-intro@1"),
    note: z.string().optional(),
    /**
     * **決策點**：整段出場演出要不要存在。關掉 = 只剩既有的 4.6 秒降臨橫幅與
     * 恐怖音效，名言／描述／要點／弱點一格都不畫。止血閥：這一段吃掉螢幕中央
     * 走廊好幾秒，線上覺得礙眼時要能在不重新部署的情況下關掉。
     */
    enabled: z.boolean(),
    /**
     * 提示停留幾秒才開始淡出（owner 明說五秒）。
     * ⚠️ 這一格是欄位不是常數，因為 owner 對時長一向會調（火圈、商店倒數、
     * 死亡淡出都被改過）。上界 30 是誤植守衛：5 打成 50 會讓提示蓋著整場前半。
     */
    introHoldSec: z.number().min(0).max(30),
    /** 淡出花幾秒。0 = 直接消失（不建議：瞬間消失讀起來像掉幀）。 */
    fadeSec: z.number().min(0).max(5),
    /**
     * **決策點**：描述最多顯示幾個字，超過截斷加省略號。
     * champion doc 的 `description` 是完整故事（喪標麥可那一份 400 字以上），
     * 整段搬上戰鬥畫面就是一面牆。0 = 不顯示描述那一段。
     */
    descriptionMaxChars: z.number().int().min(0).max(400),
    /** 最多列幾條攻略要點（超過的不畫）。0 = 不顯示這一段。 */
    maxTips: z.number().int().min(0).max(6),
    /** 最多列幾條弱點（超過的不畫）。0 = 不顯示這一段。 */
    maxWeaknesses: z.number().int().min(0).max(6),
    /** championId -> 這一隻王穿上那張臉時要講什麼。沒有的 key = 那位沒有文案。 */
    champions: z.record(zBossIntroChampionEntry),
  })
  .strict();

/**
 * config.roster@1 — **哪些英雄已經下架**（owner 2026-08-02:「預設不應該再有」）。
 *
 * ── 為什麼這是一份文件而不是一張寫死的表 ─────────────────────────────────
 *
 * 前例是 `championForms.ts` 的 `CHAMPION_FORM_PAIRS`：那也是一條「這隻不可以被
 * 選」的規則，而它寫死在 TS 裡。下架**不一樣** —— 它是 owner 的內容裁決，會隨
 * 內容補完而改變（今天下架是因為技能沒做完，做完就該上架），寫死等於每改一次
 * 主意就要 rebuild + 重啟容器。`content/` 是 host 上的 live bind-mount，
 * 這一份存檔就生效。CLAUDE.md 第一守則。
 *
 * ── 為什麼不是白名單就好 ─────────────────────────────────────────────────
 *
 * ⚠️ 白名單**擋不住這件事**，兩個洞：
 *   ① 平台連不上時客戶端退到 `NO_FILTER`（champSelectFilter 的 `NO_FILTER`），
 *      **整份 119 隻全開**。localhost 與任何一次平台故障都走這條，
 *      而我們的試玩幾乎都在 localhost —— 也就是白名單那一格在我們自己看得到的
 *      環境裡永遠是 no-op。
 *   ② 伺服器端 `CurationWhitelist.bypass` 同理。
 * 而且白名單是**營運狀態**（後台勾選、可被一鍵重設覆蓋），下架是**內容事實**。
 * 一個手滑的勾選不應該把技能名字全是 `"none"` 的半成品放回選人畫面。
 * 所以這條規則刻意放在白名單**之外**，兩邊都擋。
 *
 * ── 出貨的兩隻 ───────────────────────────────────────────────────────────
 *
 * `godie-e00u` 十六夜Sakuya 與 `godie-u01f` 黑化張飛：各 5 支技能裡有 **4 支
 * `name: "none"`**（QWER 全部），也就是選到就是四格空技能。owner 2026-07-30
 * 說下架，2026-08-02 再確認一次「預設不應該再有」。
 */
export const zConfigRosterDoc = z
  .object({
    id: zId,
    schema: z.literal("config.roster@1"),
    note: z.string().optional(),
    /**
     * 已下架的英雄 id。這些 id **不會**出現在選人畫面、大廳英靈殿、商店英雄列，
     * 隨機也抽不到，伺服器直接拒絕，**不管白名單是什麼狀態**。
     *
     * ⚠️ 這裡放的是 id 不是名字：名字有 19 組重複（變身對），用名字會誤傷本體。
     * ⚠️ 空陣列 = 沒有人下架，是合法且有意義的狀態（全部上架）。
     */
    retiredChampions: z.array(z.string()),
  })
  .strict();

/** The `config` collection accepts all variants (discriminated on `schema`). */
export const zConfigDoc = z.discriminatedUnion("schema", [
  zConfigRosterDoc,
  zConfigBossIntroDoc,
  zConfigMatchDoc,
  zConfigStoreDoc,
  zConfigArenaRulesDoc,
  zConfigCombatEnvDoc,
  zConfigAmbientVfxDoc,
  zConfigVfxFamiliesDoc,
  zConfigAudioMapDoc,
  zConfigChampionVoicesDoc,
  zConfigUnitTintsDoc,
  zConfigGoreDoc,
  zConfigDamageColorsDoc,
  zConfigIconPlanDoc,
  zConfigVictoryTauntsDoc,
  zConfigVoxelBarcodesDoc,
  zConfigVoxelBodiesDoc,
  zConfigBaseBonusDoc,
  zConfigStatCapsDoc,
  zConfigCombatFeelDoc,
  zConfigFormVisualsDoc,
  zConfigModelLodDoc,
  zConfigVfxCleanupDoc,
  zConfigRoundGradeDoc,
  zConfigShieldDoc,
  zConfigBlockDoc,
  zConfigStealthDoc,
  zConfigTauntDoc,
  zConfigBodyScaleDoc,
  zConfigRegenDoc,
  zConfigVictoryFxDoc,
  zConfigItemCardDoc,
]);

/** ConfigDoc keeps naming the canonical match config (existing consumers). */
export type ConfigBodyScaleDoc = z.infer<typeof zConfigBodyScaleDoc>;
export type ConfigRegenDoc = z.infer<typeof zConfigRegenDoc>;
export type VictoryFireworkTier = z.infer<typeof zVictoryFireworkTier>;
export type ConfigVictoryFxDoc = z.infer<typeof zConfigVictoryFxDoc>;
/** 道具卡片的四個語意分類（owner 2026-08-02 核准）。 */
export type ItemCardCategory = z.infer<typeof zItemCardCategory>;
export type ConfigItemCardDoc = z.infer<typeof zConfigItemCardDoc>;
/** 解析後的煙火政策 —— 兩層各自的開關。 */
export interface VictoryFxPolicy {
  roundVolley: VictoryFireworkTier;
  matchChicken: VictoryFireworkTier;
}
export type ConfigVoxelBodiesDoc = z.infer<typeof zConfigVoxelBodiesDoc>;
export type ConfigDoc = z.infer<typeof zConfigMatchDoc>;
export type ConfigMatchDoc = z.infer<typeof zConfigMatchDoc>;
export type ConfigStoreDoc = z.infer<typeof zConfigStoreDoc>;
export type ArenaRoundGrant = z.infer<typeof zArenaRoundGrant>;
export type ConfigArenaRulesDoc = z.infer<typeof zConfigArenaRulesDoc>;
export type CombatEnvMultipliersDoc = z.infer<typeof zCombatEnvMultipliers>;
export type ConfigCombatEnvDoc = z.infer<typeof zConfigCombatEnvDoc>;
export type AmbientVfxBinding = z.infer<typeof zAmbientVfxBinding>;
export type ArenaFire = z.infer<typeof zArenaFire>;
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
export type DamageTextAxis = z.infer<typeof zDamageTextAxis>;
export type CombatTextOutlineMode = z.infer<typeof zCombatTextOutlineMode>;
export type ConfigDamageColorsDoc = z.infer<typeof zConfigDamageColorsDoc>;
export type ConfigStealthDoc = z.infer<typeof zConfigStealthDoc>;
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
export type ModelLodTierName = z.infer<typeof zModelLodTier>;
export type ConfigModelLodDoc = z.infer<typeof zConfigModelLodDoc>;
export type ConfigVfxCleanupDoc = z.infer<typeof zConfigVfxCleanupDoc>;
export type ConfigShieldDoc = z.infer<typeof zConfigShieldDoc>;
export type ConfigBlockDoc = z.infer<typeof zConfigBlockDoc>;
export type ConfigTauntDoc = z.infer<typeof zConfigTauntDoc>;
export type ConfigRosterDoc = z.infer<typeof zConfigRosterDoc>;
export type BossIntroChampionEntry = z.infer<typeof zBossIntroChampionEntry>;
export type ConfigBossIntroDoc = z.infer<typeof zConfigBossIntroDoc>;

/**
 * 出貨預設 —— `content/config/boss-intro.json` 讀不到（舊部署、內容載入失敗、
 * 或 overlay 存了一份壞的）時，出場演出退回到的那一份。
 *
 * ⚠️ **`champions` 是空的，而那是刻意的。** 這是程式裡的保險絲，不是文案的第二
 * 份副本：兩份逐英雄文案就是兩份會 drift 的東西，而它們的分歧會以「線上看到的
 * 弱點跟後台填的不一樣」的形態出現。缺文件 = 只剩既有的降臨橫幅 + 那個英雄的
 * 描述（描述來自 champion doc，不需要這份文件）。
 *
 * 純量那幾格必須和 `content/config/boss-intro.json` 一字不差 ——
 * `apps/client/src/ui/hud/bossIntroShipped.test.ts` 的 drift 斷言在守。
 */
export const DEFAULT_BOSS_INTRO: ConfigBossIntroDoc = {
  id: "boss-intro",
  schema: "config.boss-intro@1",
  enabled: true,
  introHoldSec: 5,
  fadeSec: 0.6,
  descriptionMaxChars: 120,
  maxTips: 3,
  maxWeaknesses: 3,
  champions: {},
};

/**
 * 讀一份 `config.boss-intro@1`。文件不在／schema 不對／型別不合 →
 * {@link DEFAULT_BOSS_INTRO}。
 *
 * ⚠️ 一格一格檢查型別，不是 `doc as ConfigBossIntroDoc`。這份文件會被後台
 * overlay 覆蓋（`data/` 耐久層），而 overlay 的寫入路徑在 GH#283 被查出**沒有**
 * Zod 驗證 —— 也就是說一個 `introHoldSec: "5"` 真的有辦法躺在正式站上。到了
 * 這裡再一次把它擋掉，代價是幾行 typeof，換到的是「壞資料不會變成一個永遠不消失
 * 的全螢幕提示」。
 */
export function bossIntroFromDoc(doc: unknown): ConfigBossIntroDoc {
  const parsed = zConfigBossIntroDoc.safeParse(doc);
  return parsed.success ? parsed.data : DEFAULT_BOSS_INTRO;
}
// config.round-grade@1 的型別/Zod/出貨文件全部在 ./roundGrade,這裡只再匯出一次
// 給 `export * from "./config"` 的既有消費端(admin / codex 都是這樣拿的)。
export * from "./roundGrade";
export type AnyConfigDoc = z.infer<typeof zConfigDoc>;

/**
 * 出貨預設 —— `content/config/model-lod.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyModelLodPolicy` 回退到的就是這一份,而它必須等於 #115 落地當下的行為:
 * low→small、medium→mid、high/auto→high。
 *
 * ⚠️ 每一格都要和 `content/config/model-lod.json` 一字不差 ——
 * `packages/shared/src/content/modelLodConfig.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 */
export const DEFAULT_MODEL_LOD: ConfigModelLodDoc = {
  id: "model-lod",
  schema: "config.model-lod@1",
  enabled: true,
  presetTiers: { low: "small", medium: "mid", high: "high", auto: "high" },
};

/**
 * 出貨預設 —— `content/config/vfx-cleanup.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyVfxCleanupPolicy` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/vfx-cleanup.json` 一字不差 ——
 * `packages/shared/src/content/vfxCleanupConfig.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 *
 * 預設選 `purgeSharedPoolsOnRoundEnd: true` 的理由是 owner 的原話 ——
 * 「洩漏的粒子/mesh 回收 很重要」「一場就很燙」:在「省記憶體」和
 * 「下一回合第一次施法少一次配置」之間,他已經表態要前者。
 */
export const DEFAULT_VFX_CLEANUP: ConfigVfxCleanupDoc = {
  id: "vfx-cleanup",
  schema: "config.vfx-cleanup@1",
  enabled: true,
  purgeSharedPoolsOnRoundEnd: true,
  maxPooledRings: 24,
};

/**
 * 出貨預設 —— `content/config/ambient-vfx.json` 沒有 `arenaFire` 區塊時
 * （舊部署 / 內容掛掉 / 後台把它清掉）`resolveArenaFire` 回退到的就是這一份。
 *
 * `enabled: false` 是 owner 2026-08-01 的原話：「場地天空火焰很礙眼 請全部場地
 * 都去掉」。**回退值也必須是關的** —— 如果保險絲是開的，那麼「內容檔載不到」
 * 這條路就會把 owner 明說要拿掉的東西又點回來，而且是在最沒人看的那條路上。
 *
 * ⚠️ 每一格都要和 `content/config/ambient-vfx.json` 的 `arenaFire` 一字不差 ——
 * `apps/client/src/render/arenaFire.test.ts` 的 drift 斷言在守。
 */
export const DEFAULT_ARENA_FIRE: ArenaFire = {
  enabled: false,
  models: ["torch"],
  maxEmitters: 16,
  emitRate: 18,
  sizeScale: 1,
};

/**
 * 讀出「這張場地要不要冒火、冒幾個」。文件缺席 / 沒有 `arenaFire` 區塊時回退到
 * `DEFAULT_ARENA_FIRE`（也是關的）。
 *
 * 放在 shared 而不是 client 的理由：出貨值（JSON）、保險絲（上面那份）與
 * 讀取規則必須是**同一段**程式，否則「後台關了但場上還在燒」會是三份各自
 * 正確的程式加起來的結果。
 */
export function resolveArenaFire(doc: ConfigAmbientVfxDoc | null | undefined): ArenaFire {
  return doc?.arenaFire ?? DEFAULT_ARENA_FIRE;
}

/**
 * 一個 decor 模型路徑該不該掛火焰。`models` 是子字串比對（`dressArena` 原本
 * 寫死的 `d.model.includes("torch")` 就是這個語意），總開關關掉時**永遠**是
 * false —— 這是唯一一個決定「場上有沒有火」的地方，讓它只有一份。
 */
export function decorModelBurns(fire: ArenaFire, modelPath: string): boolean {
  if (!fire.enabled) return false;
  return fire.models.some((m) => modelPath.includes(m));
}

/**
 * 出貨預設 —— `content/config/victory-fx.json` 讀不到時（舊部署 / 內容掛掉 /
 * 後台把它清掉）`resolveVictoryFx` 回退到的就是這一份。
 *
 * **兩格都是 false**，因為那是 owner 2026-08-02 的原話：「請你直接取消煙火」。
 * 保險絲必須和出貨值同向 —— 如果回退值是開的，那麼「內容檔載不到」這條路
 * （也就是 2026-08-01 骨架事故的那條路）就會把 owner 明說要拿掉的東西又點回來，
 * 而且是在最沒有人看的那條路上。`DEFAULT_ARENA_FIRE` 為了同一個理由也是關的。
 *
 * ⚠️ 每一格都要和 `content/config/victory-fx.json` 一字不差 ——
 * `apps/client/src/vfx/victoryFxPolicy.test.ts` 的 drift 斷言在守。
 */
export const DEFAULT_VICTORY_FX: VictoryFxPolicy = {
  roundVolley: { enabled: false },
  matchChicken: { enabled: false },
};

/**
 * 讀出「這一場的兩層勝利煙火各自要不要放」。文件缺席時回退到
 * `DEFAULT_VICTORY_FX`（也是關的）。
 *
 * 放在 shared 而不是 client 的理由和 `resolveArenaFire` 同源：出貨值（JSON）、
 * 保險絲（上面那份）與讀取規則必須是**同一段**程式，否則「後台關了但畫面上還在
 * 放煙火」會是三份各自正確的程式加起來的結果。
 */
export function resolveVictoryFx(doc: ConfigVictoryFxDoc | null | undefined): VictoryFxPolicy {
  if (!doc) return DEFAULT_VICTORY_FX;
  return { roundVolley: doc.roundVolley, matchChicken: doc.matchChicken };
}

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

/**
 * 出貨預設 —— `content/config/damage-colors.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyDamageColorsDoc` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/damage-colors.json` 一字不差 ——
 * `apps/client/src/render/damagePalette.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 *
 * 每一個 hex 都是**量出來的**,不是挑好看的。判準與 `ui/combatText` 檔頭同一套
 * (那是 #164 「傷害數字看起來是黑色」修好之後留下的規則),四個地面取樣自
 * `apps/client/src/ui/combatTextContrast.test.ts`:
 *
 *   text.physical `#FF5900` — 就是 `taken` 原本那一格。從 833 個同時滿足
 *     「每個地面 fill-或-ring ≥ 3.0」「fill 對自己的黑框 ≥ 3.0」「離四個隊伍色
 *     ΔE > 25」的候選裡挑出來最紅的一個(團隊色 ΔE 31.0 / 對黑框 6.68:1 /
 *     最差地面 3.14:1)。純紅 `#FF0000` 在暗土上只有 2.47:1,所以「紅」不等於
 *     `#FF0000`。
 *   text.magic `#B872FF` — 團隊色 ΔE 31.7、對黑框 6.89:1、暗土 fill 3.24:1,
 *     而且離 `dodge` 的薰衣草 `#C9A7FF` ΔE 34.5(場上另一個紫,必須分得開)。
 *     ⚠️ 更深的紫 `#9D4EDD` / `#A855F7` / `#8B5CF6` 全部**過不了暗土**
 *     (2.15 / 2.49 / 2.33),因為黑框在暗土上只有 2.13:1 —— 那個地面是這一格
 *     真正的限制條件,不是團隊色。
 *   text.true `#FFFFFF` — 對黑框 21:1,團隊色 ΔE 73.6。白岩地面 fill 只有
 *     1.19:1,由黑框(17.62:1)扛,這正是「框扛辨識度、色扛語意」的設計。
 *   text.heal `#00FF00` — RO 的 `(0,1,0)`,原本就在表上,團隊色 ΔE 55.5。
 *
 *   flash.* 是**另一條物理**(ALPHA_COMBINE 疊加,不是文字),所以值不同 ——
 *     見 `zConfigDamageColorsDoc` 的檔頭。`#FF2626` / `#FF59E6` 是原本寫死的
 *     `[1,.15,.15]` / `[1,.35,.9]` 的 8-bit 表示(差 <0.002,肉眼不可能分辨);
 *     `#33FFFF` = `[0.2,1,1]` 是新的一格,它在七個真實 w3x tint 上的
 *     ΔRGB 都 > 0.35(白色只有 0.06)。
 *
 *   outline.incoming `#5A0000` — 「我被打」的外圈。同樣是量出來的,但**約束條件
 *     和上面那七格不同**,因為它畫在黑框後面,不必扛地面辨識度(黑框還在原位)。
 *     它要滿足的是三件事:①離黑色夠遠,否則這個通道等於沒加(ΔE 48.1);
 *     ②離四個隊伍色夠遠,否則會被讀成隊伍標示而不是「我被打」(最近 ΔE 45.9,
 *     隊伍紅 #e5483f);③對每一個可能被它包住的填色都 ≥ 4.5:1,否則外圈會和
 *     數字糊在一起 —— 最差的一格是物理 #FF5900 的 4.66:1,其餘 4.80(魔法)/
 *     14.64(真實)/8.12(GUARD 灰)/7.29(閃避薰衣草)。它對物理受擊閃光
 *     #FF2626 也有 3.87:1,所以在數字誕生的那一下閃光上仍然看得見。
 *   outline.outgoing `#000000` — 就是黑框本身的顏色,所以外圈不會被畫出來,
 *     「我打人」的 CSS 與這個功能出現之前逐位元相同。
 *   outline.widthMult `1.9` — 8 個方向的位移是把整個字形往外膨脹,不是點光源,
 *     所以 8 個方向的近似誤差只有 `r × (1 − cos 22.5°) = 0.076 r`(1.9 × 2px
 *     時是 0.29px),不會出現扇貝邊。
 */
export const DEFAULT_DAMAGE_COLORS: ConfigDamageColorsDoc = {
  id: "damage-colors",
  schema: "config.damage-colors@1",
  textAxis: "damageType",
  text: {
    physical: "#FF5900",
    magic: "#B872FF",
    true: "#FFFFFF",
    heal: "#00FF00",
  },
  flash: {
    physical: "#FF2626",
    magic: "#FF59E6",
    true: "#33FFFF",
  },
  outline: {
    mode: "incoming",
    outgoing: "#000000",
    incoming: "#5A0000",
    widthMult: 1.9,
  },
};

/**
 * 出貨預設 —— `content/config/item-card.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyItemCardDoc` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/item-card.json` 一字不差 ——
 * `packages/shared/src/content/itemCardShipped.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(owner 會改),這份是**程式的保險絲**。
 *
 * ── `markers` 這 32 列是掃出來的,不是想出來的 ───────────────────────────────
 * 來源是 `content/loot-tables/legendary-weapons.json` 那 49 支的 description,
 * 逐字掃 `[...]`:31 個關鍵字標記 + 1 個內嵌數值(見 `inlineValueMarkers`)。
 * owner 點名的 `[焚身]` 在(死之王的神盾 godie-i061);他寫的 `[隱形]` **不在** ——
 * 49 支裡的那一個是 `[隱身]`(至尊魔戒 godie-i004)。`[隱形]` 這三個字在這批裡
 * 只出現在 `[看穿]` 的說明文字裡(「看穿隱形」),不是一個標記。表上兩個都收:
 * `隱身` 是實際存在的那一個,`隱形` 是 owner 講的那個名字,先在表上等它出現 ——
 * 一個查得到的空位比一個 fallback 好,因為 fallback 不會告訴你它猜過。
 *
 * ⚠️ `On-Hit` 與 `OnHit` 是**兩列**。雅典娜的驚嘆號(godie-i006)寫的是 `[OnHit]`,
 * 其餘 16 支寫 `[On-Hit]`。那是 owner 的原稿,原稿不准改(第一守則的 ⛔),所以
 * 對照表要同時認得兩種寫法 —— 這正是「表是資料」的價值:不必為了程式好寫去動文案。
 *
 * ── 顏色是量出來的 ──────────────────────────────────────────────────────────
 * 對卡片底色 `#12151d` 的對比度:stat 10.25 / active 11.36 / passive 9.40 /
 * debuff 7.50 / number 15.15 / lore 5.93 —— 全部過 4.5:1。
 * 四個分類彼此的 CIE76 ΔE 最小 57.7(stat↔passive),數值色離最近的分類色 32.7
 * (active),都在 ~25 的可混淆線之上。
 * 而且**刻意不沿用戰鬥飄字那五個色**(owner 2026-08-02 裁定「卡片專用一套新的」):
 * 離 `config/damage-colors.json` 五個 hue 最近的一格是 stat↔魔力青 ΔE 29.5,
 * 仍在線上 —— 卡片是靜態閱讀介面,不必扛戰場地面對比,判準是「別讀成傷害屬性」。
 */
export const DEFAULT_ITEM_CARD: ConfigItemCardDoc = {
  id: "item-card",
  schema: "config.item-card@1",
  categories: {
    stat: { label: "屬性加成", color: "#6FD3C4" },
    active: { label: "主動效果", color: "#FFC24D" },
    passive: { label: "被動效果", color: "#A9B6FF" },
    debuff: { label: "負面控場", color: "#FF7BA6" },
  },
  numberColor: "#FFE9A3",
  loreColor: "#8B93A6",
  unknownCategory: "passive",
  markers: {
    // ── 屬性加成:沒有任何觸發事件,就是一串數字 ──
    神速: "stat", // 攻速上限提升至 10 / 攻擊速度+200%
    伸長: "stat", // 近戰攻擊距離+4;遠戰+2
    閃避: "stat", // 閃避 +10%
    死之王套裝: "stat", // 三件套齊 → 總 AP +100%
    // ── 主動效果:有一個離散的觸發事件(普攻/施法/擊殺/受擊) ──
    "On-Hit": "active",
    OnHit: "active",
    擴散: "active", // 普攻濺射
    暴擊: "active", // 普攻機率兩倍傷害
    暴擊吸血: "active", // 暴擊時 100% 吸血
    疊層: "active", // 普攻命中 / 擊殺英雄時疊加
    衝刺: "active", // 施放技能時向前衝刺
    復活: "active", // 擊殺敵方英雄時復活我方
    回復: "active", // 擊殺任一敵方單位時回血
    煉金術: "active", // 受敵人攻擊時機率把敵人變成黃金
    // ── 被動效果:常駐,沒有觸發事件 ──
    隱身: "passive", // 永久隱身
    隱形: "passive", // owner 講的名字;49 支裡目前沒有,先佔位(見檔頭)
    看穿: "passive", // 常駐真視
    飛昇: "passive", // 移動轉為無視碰撞的飛行形態
    無視: "passive", // 普攻無視防禦
    真實傷害: "passive", // 技能傷害全部轉真實
    反彈: "passive", // 反彈普通攻擊傷害
    斬殺: "passive", // 低血直接斬殺
    格擋: "passive", // 機率抵擋
    迴避: "passive", // 機率迴避物理傷害
    流星: "passive", // 每秒自動範圍傷害
    // ── 負面/控場:作用在敵人身上 ──
    緩慢: "debuff",
    暈眩: "debuff",
    重創: "debuff", // 降低敵方吸血回復量
    嘲弄: "debuff", // 強制敵人優先攻擊自己
    焚身: "debuff", // 周圍敵人每秒燃燒
    腐蝕: "debuff", // 周圍敵方防禦 -30
    變形: "debuff", // 把敵人變成食材,無法動作
  },
  inlineValueMarkers: ["自身已損失的生命百分比數值(0~100)"],
  efficacyHeadings: ["效能"],
  loreHeadings: ["解說", "歷史"],
};
