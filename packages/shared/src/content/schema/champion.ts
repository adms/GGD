/** champion@1 — mirrors `ChampionDef` in sim/content/defs.ts (abilities embedded). */
import { z } from "zod";
// 角色定位的四個值。⛔ 不要在這裡重打一份字串陣列。
import { ARCHETYPES } from "../statNormalization";
import type { AbilityId, ChampionId, ItemId } from "../../ids";
import {
  zAlpha,
  zCoreAbilitySlot,
  zIdFor,
  zPartialStatBlock,
  zRef,
  zStatModifier,
  zTintRgb,
} from "./common";
import { zHookDef } from "./effect";
import { zAbilityDef, zHitFeel } from "./ability";

/**
 * Per-level numbers off a WC3 ability, keyed by the LEVEL as a string ("1".."4").
 * A MAP, not an array, because the source really is sparse: `A0VG 90-002 超進化!
 * 妙蛙花` only defines levels 1 and 4, and an array would have to invent the
 * holes.
 */
const zPerLevelSeconds = z.record(z.string().regex(/^[1-9]\d?$/), z.number().nonnegative());

/**
 * 變身 — the base⇄alternate FORM LINK, recovered from the source map's WC3
 * Metamorphosis fields `Eme1` (normal-form unit) / `Emeu` (alternate-form unit).
 *
 * DATA ONLY (task #249). Nothing in the sim reads this yet: it records WHICH
 * champion doc is the other half of a transform and WHICH ability performs it,
 * so the mechanic (task #119) can be built without another trip into the .w3x.
 * The owner has not yet decided the auto-trigger conditions for the four
 * passive-slot transforms, so no behaviour is wired here on purpose.
 *
 * WHY IT MATTERS EVEN AS PURE DATA: all 26 transforms in the map are a COMPLETE
 * second unit definition (own model, scale, movement speed, ability list), and
 * the importer dropped `Eme1`/`Emeu` (task #56 — it whitelists ~30 of 180 w3u
 * field codes). Nothing downstream could tell a hero from its transformed body,
 * so 10 of the 50 first-open-roster slots shipped the ALTERNATE form as if it
 * were the hero — including 草泥馬's lying-down 臥 body (w3x movement speed 0).
 *
 * BOTH halves of a pair carry the SAME w3x facts and differ only in `role`, so
 * a doc can be read on its own without loading its counterpart.
 */
const zTransformLink = z
  .object({
    /**
     * Which half of the pair THIS doc is. `"base"` = the hero a player picks;
     * `"alternate"` = the transformed body, which is NOT independently
     * selectable — it is reached only by casting the transform ability
     * (owner ruling 2026-07-26: 「換成本體，變身態改由技能觸發」).
     */
    role: z.enum(["base", "alternate"]),
    /**
     * The champion doc on the OTHER side of the link. ABSENT when that form was
     * never imported — four alternate bodies (H00W 26洨者狀態, O030 30變態紳士,
     * N01B 40萬解, E010 70紮根) still have no champion doc, and an absent
     * counterpart is a recovered fact, not a TODO. The rawcodes below always
     * name both halves, imported or not.
     */
    counterpartId: zRef<ChampionId>("champions").optional(),
    /** `Eme1` — the rawcode of the NORMAL-form unit in war3map.w3u. */
    normalUnitRawcode: z.string().min(4).max(4),
    /** `Emeu` — the rawcode of the ALTERNATE-form unit in war3map.w3u. */
    alternateUnitRawcode: z.string().min(4).max(4),
    /**
     * 【變身唯一狀態】的**碰撞規則** —— 一個實體已經在形態中，又被要求再次進入
     * 形態時，舊形態的**剩餘時間**怎麼辦。
     *
     * ⚠️ 互斥本身不是這個欄位在做的事，也不需要任何欄位：`SimWorld.championForm`
     * 是 `Map<EntityId, ChampionFormComp>`，一個實體只有一格，而身體只有一個
     * `championId`。所以「同時只能有一個形態」是**結構性**的 —— 沒有一支技能
     * 需要自己檢查（守衛：`sim/championFormExclusive.test.ts`）。
     * 這個欄位補的是互斥**必然**帶來的那個決策：贏家的計時器從哪裡算。
     *
     * · `"restart"`（預設）—— 舊的剩餘時間丟棄，用新的時長重新計時。
     *   WC3 Metamorphosis 重施就是重新計時，也是 2026-08-08 之前寫死的行為。
     * · `"keepLongest"` —— 取 max(舊剩餘, 新時長)。擋掉「一個 1 秒的形態把一個
     *   還剩 59 秒的形態砍短」這種靜默削弱（`restart` 下真的會發生）。
     *   永不到期（toggle）視為無限長，永遠贏。
     * · `"reject"` —— 已在形態中就拒絕，走 `castRejected`，舊形態原封不動。
     *   給「變身期間不准再變」的設計用。
     */
    reenter: z.enum(["restart", "keepLongest", "reject"]).optional(),
    /** The transform ability, as the map's own w3a entry describes it. */
    triggerAbility: z
      .object({
        /** w3a rawcode, e.g. "A0VG". The link's provenance, not a content ref. */
        rawcode: z.string().min(4).max(4),
        /** The map's ability name, `NN-0X …` per the task #11 convention. */
        name: z.string().min(1).optional(),
        /**
         * `ahdu` (HERO duration) per level, in seconds. ABSENT = the form does
         * not time out: `A0DZ 20-01 風王結界` and `A0O6 70-00 紮根` are TOGGLES
         * (the body persists until re-cast) and `Aphx 61-00 百連我殺` is a
         * death-state morph (`adur` 0.01s — an instant swap). Three of 26.
         */
        durationSec: zPerLevelSeconds.optional(),
        /** `acdn` per level, in seconds. Absent on the two toggles. */
        cooldownSec: zPerLevelSeconds.optional(),
      })
      .strict(),
  })
  .strict();

export const zChampionDef = z
  .object({
    id: zIdFor<ChampionId>(),
    name: z.string().min(1),
    /**
     * Human-readable champion lore/description recovered from the w3x source
     * (WC3 color codes stripped, line breaks normalized). Optional metadata —
     * absent when the map yields no text. Not consumed by the sim; drives
     * editor/UI display.
     */
    description: z.string().optional(),
    role: z.string().min(1),
    attackType: z.enum(["melee", "ranged"]),
    /**
     * ⭐ 角色定位（owner 2026-08-12）。**選填** —— 留空時由主屬性 × 攻擊型別推導
     * （`content/statNormalization.ts` 的 `deriveArchetype`），填了就以這裡為準。
     *
     * 它決定「今天不區分英雄的那些屬性」該落在哪一格：
     * owner：「遠距離攻擊 移動速度應該是中 / 近距離攻擊 應該是快 但坦克是中或慢 /
     * 法師 中或慢 但慢的為主　魔抗則是遠距離及法師弱 近距離中 坦克高」
     *
     * ⛔ 不要用既有的 `role` 欄位代替它 —— `role` 只有三個值（fighter 51 /
     * marksman 22 / tank 1），51 位 fighter 裡混了坦克與法師。那是匯入時的
     * 粗分類，不是設計。
     */
    archetype: z.enum(ARCHETYPES).optional(),
    modelKey: zRef("models"),
    /**
     * The RAW stat card. Since #248 the eight attribute-derived rows hold the
     * source map's own numbers, WITHOUT the 三圍 term — `maxHealth` on
     * godie-e001 is the map's 150, and the sim adds `25 × STR` on top of it
     * (sim/stats/attributes.ts). Read it through `championStatBase`, never
     * directly, or a stat table shows 150 where the hero really has 575.
     */
    baseStats: zPartialStatBlock,
    /**
     * Additive per level beyond 1 — the per-hero DESIGNER KNOB, and since #248
     * a deliberate SECOND source alongside `attributes.*Growth`:
     *
     *     stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)
     *
     * The two are summed, not reconciled. That is not double-counting: the
     * attribute term carries the w3x-faithful part of the curve, `growth`
     * carries the tuning laid on top, so a hero's progression is not locked to
     * his three attributes (owner ruling on #248 —「growth 區塊就是重複來源
     * => 本來就可以重複沒有衝突」). `championGrowthLayers.test.ts` pins the
     * three-layer sum so a reader cannot silently apply only two of the three.
     *
     * `growth.mr` is simply the row where the attribute term is zero: Warcraft
     * III has no magic-resistance attribute, so 魔抗 is growth-only by nature,
     * not by omission.
     */
    growth: zPartialStatBlock,
    /**
     * 三圍 — STRENGTH / AGILITY / INTELLIGENCE + per-level growths (task #248),
     * recovered from the source map by walking each unit's `base` chain into
     * the Blizzard stock tables. `source` is provenance: "w3x" for the 111
     * champions the map can answer for, "authored" for the three it cannot
     * (godie-zombiex, sela, thorne), whose numbers were chosen to reproduce
     * their shipped level-1 sheet exactly.
     *
     * OPTIONAL in the schema, REQUIRED in the shipped tree: a doc without it
     * simply gets no attribute term (the pre-#248 law), which keeps hand-written
     * test fixtures valid, and `championAttributes.test.ts` asserts every real
     * champion has one so the roster can never silently lose it.
     */
    attributes: z
      .object({
        str: z.number().finite(),
        agi: z.number().finite(),
        int: z.number().finite(),
        strGrowth: z.number().finite(),
        agiGrowth: z.number().finite(),
        intGrowth: z.number().finite(),
        primary: z.enum(["STR", "AGI", "INT"]),
        source: z.enum(["w3x", "authored"]),
      })
      .strict()
      .optional(),
    /**
     * 身體放大倍數 (GH#252) —— 「這位英雄的身體是一個正常體型英雄的幾倍大」。
     * 缺 = 1.0(正常體型)。
     *
     * 出貨值抄自 `content/models/_standin-overrides.json` 的
     * `standinRelativeScale ?? relativeScale`(= `content/standinScale.ts` 的
     * `standinRelativeScaleOf`),兩邊由 `content/championBodyScale.test.ts`
     * 對帳。抄過來而不是直接讀那份檔案,是因為那份檔案是 **client-only**:
     * 它不在 `content/manifest.json` 的任何 collection 裡,game-server 從來
     * 讀不到 —— 這正是「體型影響射程」在 GH#252 之前不可能發生的原因。
     *
     * 上下界: 0.1 .. 10。上界 10 是小怪波 `boss.sizeMult` 的出貨值,把
     * 「體型倍率貼錯格」擋在文件層;出貨最大值是 3.0(godie-o030)。
     */
    bodyScale: z.number().min(0.1).max(10).optional(),
    /**
     * 每秒回復「最大生命的百分比」(GH#253)。`0.01` = 每秒 1%。缺 = 沒有百分比
     * 回血,只吃 `baseStats.healthRegen` 那條固定值。
     *
     * 上界 0.5 擋的是一個很具體的手誤:owner 要的「1%」在這裡寫成 `0.01`,
     * 直接填 `1`(以為單位是百分比)會變成**每秒回滿血**,而畫面上看起來只是
     * 「這個角色打不死」。百分比與固定值的關係、以及有沒有保底,是
     * `config.regen@1` 的欄位(見 `sim/regenRules.ts`)。
     *
     * ⚠️ **下界是 0,而且它是刻意的。** 「每秒扣血」不是這一格填負數 ——
     * 那條路上有三個地方會把負號靜默吃掉(`regenRules.ts` 檔頭列出來了),
     * 所以自傷是隔壁那一格 {@link healthDrainPctOfMax}。
     * ⚠️ 出貨內容目前**沒有任何一位**填它(2026-08-02 之前是 `godie-hapm`)。
     */
    healthRegenPctOfMax: z.number().min(0).max(0.5).optional(),
    /**
     * 每秒**流失**「最大生命的百分比」(owner 2026-08-02:「Berserker 是每秒
     * 損失 1%生命, 直到生命不足1%」)。`0.01` = 每秒 1%。缺 = 沒有自傷。
     *
     * 上界 0.5 和上面同一個手誤守衛:填 `1` 會變成每秒扣光滿血。
     * **它不是傷害** —— 不走 `combat/damage.ts`,所以不吃全域傷害倍率、不被
     * 護盾吸、也扣不死人:停在「最大生命的 `drainFloorPctOfMax`」(出貨 0.01),
     * 那一格與地板到達時停手/夾住的裁決都在 `config.regen@1`。
     * 出貨只有 `godie-hapm`(海克力斯 - Berserker)填了 0.01。
     */
    healthDrainPctOfMax: z.number().min(0).max(0.5).optional(),
    /** ranged auto-attack projectile speed (GGD units/sec) */
    missileSpeed: z.number().positive().optional(),
    /** wind-up (seconds) before a basic attack's hit lands */
    attackDamagePoint: z.number().min(0).optional(),
    /** base attack-cadence multiplier (default 1.0) */
    baseAttackTime: z.number().positive().optional(),
    /**
     * Optional BASIC-ATTACK hit-feel override (task #133). Applies to every
     * auto this champion lands (origin "basic"); absent = the sim's
     * damage-derived default. Per-ability feel lives on each ability's own
     * `hitFeel`. Additive & all-optional — see `zHitFeel`.
     */
    hitFeel: zHitFeel.optional(),
    abilities: z
      .object({ Q: zAbilityDef, W: zAbilityDef, E: zAbilityDef, R: zAbilityDef })
      .strict(),
    /**
     * Optional per-hero "EX 技能" — a standalone ability@1 (slot "EX") unlocked
     * at the arena EX-unlock point (WC3 level 30). Absent = this hero has no EX
     * skill (faithful: not every hero has one). Ref into the abilities collection.
     */
    exAbility: zRef<AbilityId>("abilities").optional(),
    /**
     * The per-hero 天生技 / PASSIVE — the SIXTH slot, owned from level 1.
     *
     * A standalone ability@1 with `slot: "PASSIVE"`, id `<championId>.passive`,
     * resolved through the abilities collection exactly like `exAbility`. The
     * source map codes it `NN-00` (NN = the hero 編號) in the WC3 hero unit's
     * non-learnable `abilities` list; the importer dropped it, so every
     * champion shipped with five slots instead of six.
     *
     * Absent = this hero genuinely has no NN-00 in the map. Exactly three do
     * not: godie-h02n 腦包英雄 and godie-u01q 測試英雄 (no abilities at all) and
     * godie-ogld 美白大法師 (has 72-01..04 + 72-002, but no 72-00 exists
     * anywhere in the map). Absence is a recovered fact, never a TODO.
     *
     * NOT to be confused with `passive` below — that is a legacy per-champion
     * hook/modifier block on 7 docs, not a slot.
     */
    passiveAbility: zRef<AbilityId>("abilities").optional(),
    /**
     * w3x portrait icon extracted from the map archive (task #33), path
     * relative to content/, e.g. "assets/icons/champions/godie-e001.png".
     * Absent = Blizzard STOCK art or no WC3 source — client fallback rendering.
     */
    icon: z.string().regex(/^assets\//, "icon must be relative to content/ and start with assets/").optional(),
    /**
     * Per-champion vertex-colour MULTIPLY, `[r,g,b]` 0..1 (see `zTintRgb`).
     * Ported from the w3x unit's `uclr/uclg/uclb` (or the inherited
     * `UnitUI.slk` default). ABSENT = untinted; we never write `[1,1,1]`.
     *
     * WHY IT LIVES ON THE CHAMPION AND NOT ON `model@1`: `modelKey` is a
     * many-to-one ref — `champ.sela` is shared by 18 champion docs and
     * `champ.thorne` by 10 — while the WC3 tint is a per-UNIT art field. A
     * tint on the model doc would repaint every champion sharing the mesh.
     * `model@1.teamTintMaterials` stays the model's business ("which
     * materials accept a tint"); this field is the champion's ("what colour").
     * It also has to live here for the blizzard-overlay champions (incl.
     * 海克力斯 Berserker), whose ModelDoc is SYNTHESIZED at runtime from
     * `data/blizzard-overlay/MANIFEST.json` and has no doc on disk to carry it.
     */
    tint: zTintRgb.optional(),
    /** Opacity 0..1; absent == 1 (opaque). See `zAlpha` for the WC3 inversion. */
    alpha: zAlpha.optional(),
    passive: z
      .object({
        name: z.string().min(1),
        hooks: z.array(zHookDef).optional(),
        modifiers: z.array(zStatModifier).optional(),
      })
      .strict()
      .optional(),
    /**
     * 變身 form link — see `zTransformLink`. Present on both halves of each of
     * the 26 w3x transform pairs; absent on every champion that has no second
     * form.
     *
     * ⚠️ 「DATA ONLY: no behaviour reads it yet」曾經寫在這一行，而它已經是謊話
     * （第三守則）：`sim/systems/ChampionFormSystem.ts` 的 `destinationFor` 讀
     * `counterpartId` 決定目的地，`applyChampionForm` 讀 `reenter` 決定重複進入
     * 時的計時規則。
     */
    transform: zTransformLink.optional(),
    /** AI hints (Q/W/E/R only; EX is auto-unlocked, never in skill order) */
    skillOrder: z.array(zCoreAbilitySlot),
    buildPriority: z.array(zRef<ItemId>("items")),
    tags: z.array(z.string()),
  })
  .strict();

export const zChampionDoc = zChampionDef
  .extend({ schema: z.literal("champion@1") })
  .strict()
  .superRefine((doc, ctx) => {
    for (const slot of ["Q", "W", "E", "R"] as const) {
      if (doc.abilities[slot].slot !== slot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["abilities", slot, "slot"],
          message: `embedded ability slot must be "${slot}"`,
        });
      }
    }
  });

export type ChampionDoc = z.infer<typeof zChampionDoc>;
