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
import {
  COMBAT_ENV_KEYS,
  FACTOR_BAND_MAX,
  FACTOR_BAND_MIN,
  GOLD_FACTOR_MAX,
  GOLD_FACTOR_MIN,
  isBandedFactorEnvKey,
  isGoldEnvKey,
  type CombatEnvKey,
} from "../../sim/combatEnv";
// 基礎加成的 per-stat 區間 (task #277) — 定義在 sim 那一份,schema 只是把它搬上
// Zod,所以「頁面 / schema / sim」三層守的是同一組數字。
import { ALL_STATS, Stat } from "../../sim/stats/statTypes";
import { baseBonusBounds } from "../../sim/baseBonus";
// 屬性上限的 per-stat 區間 —— 同一條規矩:數字定義在 sim,schema 只是搬上 Zod。
import { STAT_CAP_CEILING, statCapBounds } from "../../sim/statCaps";
import {
  AP_DAMAGE_RATE_MAX,
  DEFAULT_AP_DAMAGE_SCALING,
} from "../../sim/combat/apDamageScaling";
import {
  COOLDOWN_MIN_SECONDS_MAX,
  COOLDOWN_MIN_SECONDS_MIN,
  COOLDOWN_RULES_DOC_ID,
  DEFAULT_COOLDOWN_RULES,
} from "../../sim/cooldownRules";
// 吟唱規則（owner 2026-08-13 的三句：0.06~4.00、倍率可調、上下限可調）——
// 同一條規矩：數字與語意住在 sim/castTimeRules.ts，schema 只是把它搬上 Zod。
import {
  CAST_CAP_MAX,
  CAST_CAP_MIN,
  CAST_FLOOR_MAX,
  CAST_FLOOR_MIN,
  CAST_MULTIPLIER_MAX,
  CAST_MULTIPLIER_MIN,
  CAST_TIME_RULES_DOC_ID,
  DEFAULT_CAST_TIME_RULES,
} from "../../sim/castTimeRules";
// AoE 四級距（owner 2026-08-11「原則上不寫範圍數字」）—— 同一條規矩：
// 數字與語意定義在 content/aoeTiers.ts，schema 只是把它搬上 Zod。
import {
  AOE_TIER_NAMES,
  AOE_TIER_RADIUS_MAX,
  AOE_TIER_RADIUS_MIN,
  AOE_TIERS_DOC_ID,
  DEFAULT_AOE_TIERS,
} from "../aoeTiers";
// 施法距離五級距（GH#414）—— 同一條規矩，同一條梯子（content/skillTiers.ts）。
import {
  RANGE_TIER_NAMES,
  RANGE_TIER_MAX,
  RANGE_TIER_MIN,
  RANGE_TIERS_DOC_ID,
  DEFAULT_RANGE_TIERS,
} from "../rangeTiers";
// 冷卻五級距（GH#445）—— 三張表（單體／範圍／變身）的來歷與「為什麼照抄
// owner 的數字而不是推導」寫在 content/cooldownTiers.ts。
import {
  COOLDOWN_SHAPES,
  COOLDOWN_TIER_MAX,
  COOLDOWN_TIER_MIN,
  COOLDOWN_TIER_NAMES,
  COOLDOWN_TIERS_DOC_ID,
  DEFAULT_COOLDOWN_TIERS,
} from "../cooldownTiers";
// 傷害五級距（GH#447）—— 唯一的**回報**軸。五個數字從冷卻表推導，
// 推導式與 owner 的兩條輸入寫在 content/damageTiers.ts。
import {
  DAMAGE_TIER_MAX,
  DAMAGE_TIER_MIN,
  DAMAGE_TIER_NAMES,
  DAMAGE_TIERS_DOC_ID,
  DAMAGE_TIER_EXEMPTIONS_DOC_ID,
  DEFAULT_DAMAGE_TIERS,
  DEFAULT_DAMAGE_TIER_EXEMPTIONS,
  KILL_CASTS_REF,
  SHIPPED_ANCHOR_LEVEL,
  anchorFloor,
  castsToKill,
} from "../damageTiers";
// 耗魔五級距（2026-08-21）—— 五軸的最後一軸。五格從魔力池與 owner 的兩個錨
// 推導，推導式寫在 content/manaTiers.ts。
import {
  DEFAULT_MANA_TIERS,
  MANA_TIERS_DOC_ID,
  MANA_TIER_MAX,
  MANA_TIER_MIN,
  MANA_TIER_NAMES,
  describeManaTiers,
} from "../manaTiers";
// 移速／攻速的**每級成長**五級距（owner 2026-08-21）。⛔ 這裡刻意不抄那 20 個
// 數字：兩把梯子逐字住在 content/speedGrowthTiers.ts，抄一份就是第二個住處。
import {
  DEFAULT_SPEED_GROWTH_TIERS,
  SPEED_GROWTH_AXES,
  SPEED_GROWTH_AXIS_LABEL,
  SPEED_GROWTH_LADDER_IDS,
  SPEED_GROWTH_MAX,
  SPEED_GROWTH_MIN,
  SPEED_GROWTH_TIERS_DOC_ID,
  SPEED_GROWTH_TIER_FIELD,
  SPEED_GROWTH_TIER_NAMES,
  describeSpeedGrowthTiers,
  type SpeedGrowthAxis,
} from "../speedGrowthTiers";
// 技能正規化的九個決策點（owner 2026-08-21「決策點一律做成後台開關」）——
// 每一格的預設值與 rollback 理由寫在 content/skillNormalize.ts 的欄位註解上。
import {
  CARRIER_BASE_MAX_CEILING,
  DAMAGE_COLUMN_BASES,
  DAMAGE_LEAF_SCOPES,
  DEFAULT_SKILL_NORMALIZE,
  GAP_ALERT_MAX,
  RADIUS_COLUMN_BASES,
  SKILL_NORMALIZE_DOC_ID,
} from "../skillNormalize";
import { SNAP_POLICIES } from "../skillTiers";
import {
  BALANCE_ANCHOR_LEVELS,
  HARD_ANCHOR_LEVEL,
  HP_BASE_BONUS,
  HP_ENV_MULT,
  MEDIAN_BASE_HP,
  medianFinalHp,
} from "../balanceAnchors";
// ⭐ GH#465 相稱性 —— 公式與 owner 的係數住在 content/proportionality.ts，
//    schema 這一層只是把它搬上 Zod（⛔ 不在這裡再算一次）。
import {
  AIM_RISK_MAX,
  AIM_RISK_MIN,
  DEFAULT_AIM_RISK_MULT,
  DEFAULT_EXPECTED_HITS,
  DEFAULT_PROPORTIONALITY_MODEL,
  EXPECTED_HITS_MAX,
  EXPECTED_HITS_MIN,
  PROPORTIONALITY_MODELS,
  describeProportionalityModels,
  tableForModel,
} from "../proportionality";
// 魔力經濟（GH#446）—— 回魔的地板。⚠️ 它住 `sim/`（每 tick 都跑的純函式）。
import {
  DEFAULT_MANA_ECONOMY,
  MANA_ECONOMY_DOC_ID,
  REFILL_SECONDS_MAX,
  REFILL_SECONDS_MIN,
} from "../../sim/manaEconomy";
// 英雄屬性正規化（owner 2026-08-12）—— 同一條規矩：數字與語意定在
// content/statNormalization.ts，schema 只是把它搬上 Zod。
import {
  PER_LEVEL_BONUS_MAX,
  PER_LEVEL_BONUS_MIN,
} from "../../sim/baseBonus";
import {
  ARCHETYPES,
  BAND_VALUE_MAX,
  SCALE_KEYS,
  BAND_VALUE_MIN,
  DEFAULT_STAT_NORMALIZATION,
  NORMAL_BANDS,
  NORMALIZED_STAT_KEYS,
  ORIGINS,
  STAT_NORMALIZATION_DOC_ID,
} from "../statNormalization";
// 手把自動瞄準的小怪讓路幅度（GH#315）—— 同一條規矩：上下界定在 sim，schema 只搬上 Zod。
import { AIM_ASSIST_MOB_PENALTY_MAX, AIM_ASSIST_MOB_PENALTY_MIN } from "../../sim/combatFeel";
// 位移級距（GH#318）與減傷曲線／穿透（負抗性放大）—— 兩份 config schema 各自
// 住在自己的檔案裡（那一輪 config.ts 由多個 lane 同時碰），這裡只把它們接進 union。
// ⛔ 漏掉任何一行 = 那份 json 進了 content/ 之後整份驗證失敗 → 骨架英雄。
import { zConfigDisplacementTiersDoc } from "./displacementDoc";
import { zConfigMitigationDoc } from "./mitigationDoc";
// 混音（owner 2026-08-17）—— 同上，schema 住自己的檔案，這裡只接進 union。
import { zConfigAudioMixDoc } from "./audioMixDoc";
// 練習模式（GH#343，owner 2026-08-17）—— 同上。
import { zConfigPracticeDoc } from "./practiceDoc";
// 排名獎勵（owner 2026-08-17「MMR 倍率跟賽季積分也是類似的規則」）—— 同上。
// ⚠️ 這一份的消費端是 **Go**（`internal/ranking/standingsoverride.go`），但它仍然
// 必須進這個 union：`content/config/ranking.json` 是內容 bundle 的一份文件，
// union 不認得它的 schema tag = 整份內容驗證失敗 → 客戶端退回 2 隻骨架英雄。
import { zConfigRankingDoc } from "./rankingDoc";
// 地端產圖的風格（owner 2026-08-17「日本 2D RPG」）—— 同上，schema 住自己的檔案。
import { zConfigIconStyleDoc } from "./iconStyleDoc";
import { zConfigMapSpecDoc } from "./mapSpecDoc";
import { zConfigMapReportDoc } from "./mapReportDoc";
import { zConfigArenaPoolDoc } from "./arenaPoolDoc";
// 創建新英雄的警示開關（GH#480）—— ⛔ 它的 Zod 住在 `../newHeroChecks`，因為那個檔
// 同時擁有規則清單（`NEW_HERO_WARN_RULES`）與檢查本體，而 schema 的 `rules` 物件
// 就是從那份清單推導的。抄一份鍵名進 schema/ 就是第二個住處，⛔ 而且它會 drift。
// ⚠️ `newHeroChecks` 只 import `./schema/{ability,champion}` 與幾支純函式，
//    ⛔ 不 import 這個檔 —— 所以這條 import 不會造成循環。
import { zConfigNewHeroChecksDoc } from "../newHeroChecks";
// The eleven barcode slots, in ANATOMICAL ORDER. Imported (not restated) so the
// stored doc's keys can never drift from the model — see zConfigVoxelBarcodesDoc.
// `voxelSkin/types` is a leaf: zero imports of its own, no zod, no sim.
import { BARCODE_SLOTS } from "../voxelSkin/types";
// 每回合 S~D 評價的係數 (#212/#232)。整份 schema 定在自己的檔案裡(欄位多、
// 上下界全部從 sim 的 ROUND_GRADE_BOUNDS 生),這裡只把它掛進 collection union。
import { zConfigRoundGradeDoc } from "./roundGrade";
// config.victory-podium@1 (GH#257/#256) 的整份 schema、出貨預設與解析器住在自己
// 的檔案裡（欄位的理由很長,而且客戶端的 RoundWinnerStage / ui/panels/victoryPodium
// 直接 import 它）。這裡只做兩件事:把它掛進 collection union（**漏掉這一步就是
// 2026-08-02 那次線上事故的形狀** —— 內容裡有一個 union 不認得的 schema tag,
// 整棵內容驗證失敗、客戶端 fail-open 退回 2 隻英雄的骨架）、以及原地 re-export。
import { zConfigVictoryPodiumDoc } from "./victoryPodium";
// config.vfx-families@1 lives in ./vfx next to the vfx@1 docs it tunes (the
// w3x art family layer); only its union membership belongs here.
import { zConfigVfxFamiliesDoc, zConfigVfxAbilityArtDoc } from "./vfx";
// GH#529 —— 技能 ↔ 原作 emitter 的**推導**綁定表（`tools/vfx-bind/scan.py` 產生）。
// schema 住自己的檔案，這裡只接進 union。⛔ 漏掉下面那一行 union 成員 = 一份
// ability-vfx-bindings.json 進了 content/ 之後**整份**內容驗證失敗 → 骨架英雄。
import { zConfigAbilityVfxBindingsDoc } from "./abilityVfxBindings";
// GH#541 —— 29 個 JASS 連段函式的間隔表(第〇·四守則的共用表)。
// ⚠️ 漏掉這一行 = combo-strikes.json 進了 content/ 之後整份載入失敗 → 骨架英雄。
import { zConfigComboStrikesDoc } from "./comboStrikesDoc";
// ⛔ owner 的人工旋鈕授權表。⚠️ 漏掉這一行 = owner-knobs.json 進了 content/ 之後
// 整份內容驗證失敗 → 骨架英雄,而網站看起來完全正常。
import { zConfigOwnerKnobsDoc } from "./ownerKnobsDoc";
// GH#546 —— 開關型技能的「開啟中」外觀。⚠️ 漏掉這一行 = toggle-ability.json 進了
// content/ 之後整份載入失敗 → 骨架英雄,而網站看起來完全正常。
import { zConfigToggleAbilityDoc } from "./toggleAbilityDoc";
// GH#549 —— 畫面閃爍／震動／特效文字的**上限與無障礙**。⚠️ 漏掉這一行 =
// screen-fx.json 進了 content/ 之後整份載入失敗 → 骨架英雄。
import { zConfigScreenFxDoc } from "./screenFxDoc";
// 嘲弄規則的上界 —— 定義在 sim/taunt.ts(sim 也夾同一個數字),schema 只是把它
// 接上 Zod,所以兩層守的不可能是兩個數字。
import {
  TAUNT_DURATION_MULT_MAX,
  TAUNT_LEASH_MAX,
  TAUNT_MAX_TARGETS,
} from "../../sim/taunt";
// 火圈灼燒曲線的出貨值 —— 定義在 sim/fireRing.ts（sim 缺欄位時退回同一份），
// schema 只是把它接上 Zod 的 `.default()`。抄第二份就是兩個「沒填的話燒多少」。
import {
  DEFAULT_BURN_CURVE,
  DEFAULT_LETHAL_SAVE_APPLIES,
  DEFAULT_MAX_PCT_PER_SEC,
  DEFAULT_STAGE1_RADIUS,
  DEFAULT_STAGE2_SHRINK_SEC,
  ringFullCloseSec,
} from "../../sim/fireRing";
// 開房房主可調的四格（#288）的上下界 —— **只有一份**，住在 `roomSettings.ts`。
// 那四格同時被四層讀（client 表單的 min/max、game-server 的權威夾取、這一份 Zod、
// 後台顯示），所以抄一份數字進來就是第二個「上限是多少」的答案：房主表單擋在
// 1800，Zod 放行 3600，兩邊漂開的那一天沒有任何東西會紅。
// ⚠️ 相依方向是安全的：`roomSettings.ts` 自己一個 import 都沒有（純表 + 純函式）。
import { MAX_ROUNDS_UNLIMITED, ROOM_SETTING_LIMITS } from "../../roomSettings";
    /** 施法距離圈的顏色 —— 「我打得到多遠」。 */
    rangeColor: zColorHex,
    /** 距離圈的半透明填滿。⚠️ 刻意很淡，理由在後台那一頁。 */
    rangeFillAlpha: z.number().min(0).max(1),
    /** 命中範圍圈的顏色 —— 「它落在哪」。 */
    aoeColor: zColorHex,
    /** AoE 圈小得多，所以可以濃一點 —— 這是玩家真正要瞄的那一圈。 */
    aoeFillAlpha: z.number().min(0).max(1),
    /** 「特殊顏色框框」的不透明度。框要比填滿實得多，否則邊界讀不出來。 */
    rimAlpha: z.number().min(0).max(1),
    /**
     * 框的粗細（世界單位，torus 的管徑）。⚠️ 是**絕對**值不是半徑比例。
     * 上界 2 ≈ 三個角色身寬：再粗的話小技能的框會把自己的圈整個填滿。
     */
    rimThickness: z.number().min(0.01).max(2),
    /** #228 地面預告的三條通道。 */
    telegraph: z
      .object({
        /** 我自己放的 */
        self: zTelegraphChannelStyle,
        /** 隊友放的 —— 「有東西會落在那裡，但不是衝著你來」 */
        ally: zTelegraphChannelStyle,
        /**
         * 打向我的（`relationOf` 回 `unknown` 時也走這一條 —— 失敗要往危險的
         * 那一邊倒，把還沒解析的施法者畫成無害的會藏起一發真的 AoE）。
         */
        incoming: zTelegraphChannelStyle,
      })
      .strict(),
  })
  .strict();

/** The `config` collection accepts all variants (discriminated on `schema`). */
export const zConfigDoc = z.discriminatedUnion("schema", [
  zConfigReplayDoc,
  zConfigRosterDoc,
  zConfigBossIntroDoc,
  zConfigMatchDoc,
  zConfigStoreDoc,
  zConfigArenaRulesDoc,
  zConfigCombatEnvDoc,
  zConfigAmbientVfxDoc,
  zConfigVfxFamiliesDoc,
  // GH#384 —— 617 筆逐技能特效綁定的住址。⚠️ 漏掉這一行 = 一份
  // vfx-ability-art.json 進了 content/ 之後整份內容驗證失敗 → 骨架英雄。
  zConfigVfxAbilityArtDoc,
  // GH#529 —— 技能 ↔ 原作 emitter 的推導綁定表。⚠️ 同上：漏掉這一行 =
  // ability-vfx-bindings.json 會讓內容**整份**載入失敗 → 骨架英雄，而網站看起來正常。
  zConfigAbilityVfxBindingsDoc,
  // GH#541 —— 連段間隔表。⚠️ 同上:漏掉 = 內容整份驗證失敗,而網站看起來正常。
  zConfigComboStrikesDoc,
  zConfigOwnerKnobsDoc,
  zConfigToggleAbilityDoc,
  zConfigScreenFxDoc,
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
  // 每級加成（owner 2026-08-13）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigPerLevelBonusDoc,
  zConfigStatCapsDoc,
  zConfigCombatFeelDoc,
  zConfigFormVisualsDoc,
  zConfigModelLodDoc,
  zConfigVfxCleanupDoc,
  // 爽度特效（GH#494，owner 2026-08-21）。⚠️ 漏掉這一行 = 一份 feel-fx.json 進了
  // content/ 之後**整份**內容驗證失敗 → fail-open 退回 2 隻骨架英雄，而網站看起來
  // 完全正常（2026-08-02 事故的形狀）。
  zConfigFeelFxDoc,
  zConfigRoundGradeDoc,
  zConfigShieldDoc,
  zConfigBlockDoc,
  // 暴擊規則（GH#302）。⚠️ 漏掉這一行 = 一份 crit.json 進了 content/ 之後整份
  // 內容驗證失敗 → 骨架英雄，理由見下面那一段。
  zConfigCritDoc,
  zConfigBerserkDoc,
  zConfigWoundsDoc,
  // 【虛弱】的全域定義（GH#301-4）。⚠️ 漏掉這一行 = 一份 weakness.json 進了
  // content/ 之後整份內容驗證失敗 → 骨架英雄，理由見下面那一段。
  zConfigWeaknessDoc,
  zConfigDamageRulesDoc,
  // AP 傷害加成（owner 2026-08-21「技能傷害都套用公式 (1+AP*1%)」）。⚠️ 漏掉這一行 =
  // 一份 ap-damage-scaling.json 進了 content/ 之後**整份**內容驗證失敗 → 骨架英雄
  // （2026-08-02 事故的形狀），而網站看起來完全正常。
  zConfigApDamageScalingDoc,
  zConfigDispelDoc,
  zConfigCooldownRulesDoc,
  // 吟唱規則（owner 2026-08-13）。⚠️ 漏掉這一行 = 一份 cast-time.json 進了
  // content/ 之後整份內容驗證失敗 → 骨架英雄（2026-08-02 事故的形狀）。
  zConfigCastTimeDoc,
  // AoE 五級距（owner 2026-08-11 立、2026-08-19 擴成五級）。⚠️ 漏掉這一行 =
  // 一份 aoe-tiers.json 進了 content/ 之後整份內容驗證失敗 → 骨架英雄，理由見下面那一段。
  zConfigAoeTiersDoc,
  // 施法距離五級距（GH#414）。⚠️ 同上 —— 漏掉這一行，range-tiers.json 就會讓
  // 內容**整份**載入失敗（2026-08-02 事故的形狀），而不是只有這一份被忽略。
  zConfigRangeTiersDoc,
  // 冷卻五級距（GH#445，owner 2026-08-19 給滿三張表）。⚠️ 同上 —— 漏掉這一行，
  // cooldown-tiers.json 會讓內容**整份**載入失敗 → 骨架英雄，而網站看起來正常。
  zConfigCooldownTiersDoc,
  // 傷害五級距（GH#447）。⚠️ 同上。
  zConfigDamageTiersDoc,
  // ⛔ 級別/算好的值不可共存的**豁免表**（#534）。⚠️ 同上 —— 漏掉這一行，
  // damage-tier-exemptions.json 會讓內容**整份**載入失敗 → 骨架英雄，而網站看起來正常。
  zConfigDamageTierExemptionsDoc,
  // 耗魔五級距（2026-08-21，五軸的最後一軸）。⚠️ 同上 —— 漏掉這一行，
  // mana-tiers.json 會讓內容**整份**載入失敗 → 骨架英雄，而網站看起來正常。
  zConfigManaTiersDoc,
  // 移速／攻速的**每級成長**五級距（2026-08-21）。⚠️ 同上 —— 漏掉這一行，
  // speed-growth-tiers.json 會讓內容**整份**載入失敗 → 骨架英雄，而網站看起來正常。
  zConfigSpeedGrowthTiersDoc,
  // 技能正規化的九個決策點（2026-08-21）。⚠️ 同上。
  zConfigSkillNormalizeDoc,
  // 回魔地板（GH#446）。⚠️ 同上。
  zConfigManaEconomyDoc,
  // 英雄屬性正規化（owner 2026-08-12）。⚠️ 漏掉這一行 = 一份 stat-normalization.json
  // 進了 content/ 之後整份內容驗證失敗 → 骨架英雄。
  zConfigStatNormalizationDoc,
  // 出身 × 路線的文案（owner 2026-08-12）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigOriginRoutesDoc,
  // ⚠️ 批 1 (2026-08-04) 的新 schema tag。**union 漏掉這一行 = 整份內容驗證
  // 失敗 → main.tsx 的 fail-open 退回 2 隻骨架英雄**,而網站看起來完全正常。
  // 那正是 2026-08-02 線上壞掉四小時的形狀,理由寫在下面那一段。
  zConfigAugmentFilterDoc,
  zConfigStealthDoc,
  zConfigTauntDoc,
  zConfigBodyScaleDoc,
  zConfigRegenDoc,
  zConfigVictoryFxDoc,
  zConfigItemCardDoc,
  // owner 2026-08-16：介面用語進 JSON。⚠️ 漏了這一行 = 整份內容驗證失敗
  // → 退回 2 隻骨架英雄，而網站看起來完全正常（2026-08-02 的形狀）。
  zConfigUiLexiconDoc,
  // ── 2026-08-02 收尾:三個 lane 各自定義的欄位,三個落點一次接完 ───────────
  // ⚠️ **這三行是最重要的一步。** 新的 config 文件進了 `content/` 而 union 不認得
  // 它的 schema tag,`zConfigDoc` 就會拒絕整份文件 → ContentLoader 驗證失敗 →
  // `main.tsx` 的 fail-open 註冊 2 隻英雄的骨架 → 選人畫面整個空掉,而網站看起來
  // 完全正常。那正是 2026-08-02 線上壞掉四小時的根因（roster / boss-intro /
  // item-card / victory-fx 四個 tag 同時漏掉）。
  zConfigLobbyLayoutDoc,
  // 大廳集合令（GH#492，owner 2026-08-21）。⚠️ 漏掉這一行 = 一份 lobby-rally.json
  // 進了 content/ 之後整份內容驗證失敗 → 退回 2 隻骨架英雄，而網站看起來完全正常。
  zConfigLobbyRallyDoc,
  // 管理員預設好友（GH#499，owner 2026-08-21）。⚠️ 漏掉這一行 = 一份 admin-friend.json
  // 進了 content/ 之後整份內容驗證失敗 → 退回 2 隻骨架英雄，而網站看起來完全正常。
  zConfigAdminFriendDoc,
  // 手把手感（GH#520）。⚠️ 漏掉這一行 = 一份 gamepad.json 進了 content/ 之後
  // 整份內容驗證失敗 → 退回 2 隻骨架英雄，而網站看起來完全正常（2026-08-02 的形狀）。
  zConfigGamepadDoc,
  zConfigValhallaSandboxDoc,
  zConfigVictoryPodiumDoc,
  // 位移級距（GH#318，owner 2026-08-13）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigDisplacementTiersDoc,
  // 減傷曲線的負抗性放大上限（owner 2026-08-13）。⚠️ 同上。
  zConfigMitigationDoc,
  // 混音：其他角色的語音音量（owner 2026-08-17）。⚠️ 漏掉這一行 = 一份
  // audio-mix.json 進了 content/ 之後整份內容驗證失敗 → 骨架英雄。
  zConfigAudioMixDoc,
  // 練習模式（GH#343，owner 2026-08-17）。⚠️ 漏掉這一行 = 一份 practice.json 進了
  // content/ 之後整份內容驗證失敗 → 骨架英雄。
  zConfigPracticeDoc,
  // 排名獎勵：真人倍率進 MMR／賽季積分 + 宿敵加成（owner 2026-08-17）。
  // ⚠️ 漏掉這一行 = 一份 ranking.json 進了 content/ 之後整份內容驗證失敗 → 骨架英雄。
  // ⛔ 「消費端是 Go，所以 TS 不用管」是**錯的**：擋下整份 bundle 的是這個 union。
  zConfigRankingDoc,
  // 地端產圖的風格（owner 2026-08-17）。⚠️ 漏掉這一行 = 一份 icon-style.json 進了
  // content/ 之後整份內容驗證失敗 → 骨架英雄。
  zConfigIconStyleDoc,
  // 小地圖規格（GH#324，owner 2026-08-14）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigMapSpecDoc,
  // 地圖驗證報告（GH#324，產生器輸出）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigMapReportDoc,
  // 場地輪替池（GH#324）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigArenaPoolDoc,
  // ⭐ 一份壞文件的處置（GH#326，owner 2026-08-14）。⚠️ 漏掉這一行的後果特別諷刺：
  //    **管「不要整份失敗」的那份文件，自己會害整份失敗**。
  zConfigContentLoadDoc,
  // ⭐ 外部編輯器的原則界（GH#327）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigAuthoringRulesDoc,
  // ⭐ 戰鬥鏡頭的滾輪縮放界線（GH#332，owner 2026-08-15「最大視野減少兩節」）。
  //    ⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigCameraDoc,
  // ⭐ 技能範圍指引 + 地面預告通道（GH#376）。⚠️ 漏掉這一行 = 一份
  //    range-guide.json 進了 content/ 之後整份內容驗證失敗 → 骨架英雄
  //    （2026-08-02 線上壞掉四小時的形狀）。
  zConfigRangeGuideDoc,
  // ⭐ 創建新英雄的六條警示開關（GH#480，owner 2026-08-20「生成代入與檢查跳警示
  //    都要記得更新」）。⚠️ 漏掉這一行 = 一份 new-hero-checks.json 進了 content/
  //    之後整份內容驗證失敗 → 骨架英雄（2026-08-02 線上壞掉四小時的形狀）。
  //    ⛔ 它的 Zod 刻意住在 `../newHeroChecks`（規則清單、預設值、檢查本體同一個
  //    檔），這裡只負責把它掛進 union —— 掛不掛得上才是那份文件上不上得了線的關鍵。
  zConfigNewHeroChecksDoc,
]);

/** ConfigDoc keeps naming the canonical match config (existing consumers). */
export type ConfigBodyScaleDoc = z.infer<typeof zConfigBodyScaleDoc>;
export type ConfigRegenDoc = z.infer<typeof zConfigRegenDoc>;
export type VictoryFireworkTier = z.infer<typeof zVictoryFireworkTier>;
export type ConfigVictoryFxDoc = z.infer<typeof zConfigVictoryFxDoc>;
export type ConfigUiLexiconDoc = z.infer<typeof zConfigUiLexiconDoc>;
// 練習模式（GH#343）的型別**刻意不在這裡再匯出一次** —— 它跟 audioMixDoc 走同一條
// 路：由 `schema/index.ts` 的 `export * from "./practiceDoc"` 出去。兩條 star export
// 匯出同一個名字會互相遮蔽（那一行的註解就是為此而寫的）。
/** 道具卡片的四個語意分類（owner 2026-08-02 核准）。 */
export type ItemCardCategory = z.infer<typeof zItemCardCategory>;
export type ConfigItemCardDoc = z.infer<typeof zConfigItemCardDoc>;
/** 解析後的煙火政策 —— 兩層各自的開關。 */
export interface VictoryFxPolicy {
  roundVolley: VictoryFireworkTier;
  matchChicken: VictoryFireworkTier;
}
export type ConfigVoxelBodiesDoc = z.infer<typeof zConfigVoxelBodiesDoc>;
/**
 * `config` 這個集合裡的**任何一份**文件（GH#312）。
 *
 * ⚠️ 2026-08-11 之前這裡寫的是 `z.infer<typeof zConfigMatchDoc>` —— 也就是
 * 只描述 match 那一份。於是任何 `store.all<ConfigDoc>("config")` 拿到的型別
 * 都在說謊，而 `.schema === "config.xxx@1"` 的比對會被 tsc 判成
 * 「兩個字面型別沒有交集」→ **一個永遠 false 的死比對**。
 * 接 `config.aoe-tiers@1` 時撞到（tsc 擋下來了，所以沒有出貨）。
 *
 * ⭐ 「我要的就是 match 那一份」請用下一行的 {@link ConfigMatchDoc}。
 */
export type ConfigDoc = z.infer<typeof zConfigDoc>;
export type ConfigMatchDoc = z.infer<typeof zConfigMatchDoc>;
export type ConfigStoreDoc = z.infer<typeof zConfigStoreDoc>;
export type ArenaRoundGrant = z.infer<typeof zArenaRoundGrant>;
export type ConfigArenaRulesDoc = z.infer<typeof zConfigArenaRulesDoc>;
export type CombatEnvMultipliersDoc = z.infer<typeof zCombatEnvMultipliers>;
export type ConfigCombatEnvDoc = z.infer<typeof zConfigCombatEnvDoc>;
export type AmbientVfxBinding = z.infer<typeof zAmbientVfxBinding>;
export type ArenaFire = z.infer<typeof zArenaFire>;
export type ArenaBackdropPolicy = z.infer<typeof zArenaBackdrop>;
export type ArenaSceneryPolicy = z.infer<typeof zArenaSceneryPolicy>;
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
/** 一條地面預告通道的樣式（自己／隊友／來襲共用同一個形狀）。 */
export type TelegraphChannelStyle = z.infer<typeof zTelegraphChannelStyle>;
export type ConfigRangeGuideDoc = z.infer<typeof zConfigRangeGuideDoc>;
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
/** 爽度特效（`content/config/feel-fx.json`，GH#494）。 */
export type ConfigFeelFxDoc = z.infer<typeof zConfigFeelFxDoc>;
export type ConfigShieldDoc = z.infer<typeof zConfigShieldDoc>;
export type ConfigBlockDoc = z.infer<typeof zConfigBlockDoc>;
export type ConfigAugmentFilterDoc = z.infer<typeof zConfigAugmentFilterDoc>;
export type ConfigTauntDoc = z.infer<typeof zConfigTauntDoc>;
export type ConfigRosterDoc = z.infer<typeof zConfigRosterDoc>;
/** 對戰錄影政策（`content/config/replay.json`）。 */
export type ConfigReplayDoc = z.infer<typeof zConfigReplayDoc>;
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
  // #291 owner 2026-08-03「描述還有很多沒顯示完」—— 120 → 300。
  // ⚠️ 單獨調大這一格**看不出任何差別**（那正是缺陷的一半）：版面必須同時給得出
  // 高度，也就是下面 `layout.descMaxLines`。300 字 ÷ 36 字/行 ≈ 9 行 × 17px
  // ≈ 146px，1280×800 的中央走廊有 424px，連攻略要點與弱點一起放得下。
  descriptionMaxChars: 300,
  maxTips: 3,
  maxWeaknesses: 3,
  // #291 —— 和 `content/config/boss-intro.json` 一字不差；出貨值等於這一格出現
  // 之前 `bossIntroModel.ts` 那六個常數（DESC 那一格從「34px 固定」換成
  // 「一行 17px × 最多 10 行」，因為固定值就是缺陷本身）。
  layout: {
    quoteH: 42,
    nameH: 20,
    descLineH: 17,
    descMaxLines: 10,
    descCharsPerLine: 36,
    headH: 16,
    rowH: 17,
    padH: 14,
  },
  dropOrder: ["description", "tips", "weaknesses"],
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
  // GH#270 —— 出貨值必須和 `content/config/vfx-cleanup.json` 一字不差；
  // `vfxCleanupPolicy.test.ts` 的 drift 斷言在守。
  maxOneShotEmitters: 96,
  emitterSweepSec: 2,
  purgeImpactPoolOnRoundEnd: true,
  // owner 2026-08-17 —— 下一回合開打就把上一回合的勝利煙火停掉並重新武裝勝利偵測。
  // 三個住處都有它：這裡 · Zod（`.optional()`，線上舊 override 沒有這一格）·
  // `content/config/vfx-cleanup.json`。
  purgeVictoryFxOnCombatStart: true,
};

/**
 * 出貨預設 —— `content/config/feel-fx.json` 讀不到（舊部署 / 內容掛掉 / 被存壞的
 * override）時，`readFeelFx` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/feel-fx.json` 一字不差 ——
 * `apps/client/src/vfx/feelFx.test.ts` 的 drift 斷言在守。
 *
 * ⭐ 為什麼保險絲是**開著**的（`enabled: true`）：這一層碰不到任何一塊錢，
 * 它只決定「看不看得到」。讀不到內容就靜音掉 owner 明說要的爽度，是把一個
 * 內容故障翻譯成一個設計倒退（`arenaFire` 那格是相反的方向，因為 owner 明說
 * 要「全部場地都去掉」—— 保險絲要站在 owner 說過的那一邊）。
 */
export const DEFAULT_FEEL_FX: ConfigFeelFxDoc = {
  id: "feel-fx",
  schema: "config.feel-fx@1",
  goldPickup: {
    enabled: true,
    hoverSeconds: 1,
    flightSeconds: 0.42,
    easePower: 3,
    arcHeight: 1.9,
    maxConcurrent: 32,
    sfxThrottleMs: 55,
    sfxVolume: 0.32,
  },
  comboPitch: {
    enabled: true,
    semitonesPerStep: 1,
    maxSteps: 12,
    resetAfterSeconds: 5,
  },
  castMotes: {
    lifetimeMinSec: 0.175,
    lifetimeMaxSec: 0.35,
    gravityY: 3,
    drag: 0.7,
  },
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
 * 出貨預設 —— 圓盤外的 2D 景深背景政策（GH#324）。
 *
 * ⚠️ **回退值是「開的」**，跟 `DEFAULT_ARENA_FIRE` 相反，而理由是同一條：
 * **回退到 owner 要的那一邊**。環境火 owner 明說要拿掉 ⇒ 回退是關；
 * 背景是 owner 明說要做的東西（「填補場景外的空缺」）⇒ 回退是開。
 * ⛔ 如果回退是關的，「內容檔載不到」這條路會讓圓盤外變回一片黑，
 * 而那跟「這個功能沒做」在畫面上一模一樣（失敗形態①）。
 *
 * ⚠️ 每一格都要和 `content/config/ambient-vfx.json` 的 `backdrop` 一字不差 ——
 * drift 斷言在 `apps/client/src/render/arenaBackdrop.test.ts`。
 */
export const DEFAULT_ARENA_BACKDROP: ArenaBackdropPolicy = {
  enabled: true,
  maxLayers: 4,
  alphaScale: 1,
};

/** 讀出背景政策。文件缺席 / 沒有 `backdrop` 區塊時回退到 `DEFAULT_ARENA_BACKDROP`。 */
export function resolveArenaBackdrop(
  doc: ConfigAmbientVfxDoc | null | undefined,
): ArenaBackdropPolicy {
  return doc?.backdrop ?? DEFAULT_ARENA_BACKDROP;
}

/**
 * 出貨預設 —— 場景特色政策（GH#362）。
 *
 * ⚠️ **回退值是「開的」**，理由與 `DEFAULT_ARENA_BACKDROP` 同一條：
 * **回退到 owner 要的那一邊**。owner 2026-08-18 明說要「更多特色裝飾 · 會變動的光 ·
 * 該場景的地板與牆壁顏色」⇒ 讀不到設定時要給他那個，⛔ 不是退回他抱怨的那個樣子。
 *
 * `maxPropsPerZone: 40` 是出貨場地實際用量的上緣（最多的一張 colosseum 每區
 * 32 件手擺 decor），所以出貨內容一件都不會被砍；它存在是為了擋「作者一次填
 * 8 條 count 64 的規則」那種 1,024 件的情況。
 *
 * ⚠️ 每一格都要和 `content/config/ambient-vfx.json` 的 `scenery` 一字不差 ——
 * drift 斷言在 `apps/client/src/render/arenaScenery.test.ts`。
 */
export const DEFAULT_ARENA_SCENERY_POLICY: ArenaSceneryPolicy = {
  enabled: true,
  maxPropsPerZone: 40,
  animateLights: true,
  /** ⭐ 維持原樣（GH#386 ②）—— 出貨的 16 件 CC0 水晶今天就是帶著黑邊在跑的。 */
  outlineShells: true,
};

/** 讀出場景特色政策。文件缺席 / 沒有 `scenery` 區塊時回退到 `DEFAULT_ARENA_SCENERY_POLICY`。 */
export function resolveArenaScenery(
  doc: ConfigAmbientVfxDoc | null | undefined,
): ArenaSceneryPolicy {
  return doc?.scenery ?? DEFAULT_ARENA_SCENERY_POLICY;
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

// ─────────────────────── 大廳版面 / 英靈殿沙盒（2026-08-02 收尾）──────────

export type ConfigLobbyLayoutDoc = z.infer<typeof zConfigLobbyLayoutDoc>;
export type ConfigValhallaSandboxDoc = z.infer<typeof zConfigValhallaSandboxDoc>;

/** 去掉 id/schema/note 的殼之後,程式真正讀的那一份。 */
export type LobbyLayoutPolicyDoc = Omit<ConfigLobbyLayoutDoc, "id" | "schema" | "note">;
export type ValhallaSandboxPolicyDoc = Omit<ConfigValhallaSandboxDoc, "id" | "schema" | "note">;

/**
 * 出貨預設（＝內容載不到時的保險絲）。
 *
 * ⚠️ 每一格都必須和 `apps/client/src/ui/platform/lobbyLayout.ts` 的
 * `DEFAULT_LOBBY_LAYOUT` 一字不差 —— 那一份才是螢幕真的在用的。
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對兩邊,差一格就紅。
 */
export const DEFAULT_LOBBY_LAYOUT_POLICY: LobbyLayoutPolicyDoc = {
  leftColumnWidthPx: 280,
  // 25 / 15 / 20 / 40 —— GH#454 把宿敵榜插進來之後的四段。前身是 owner 2026-08-04
  // 的「3:2:5」(三段)，這一版保留他的**相對順序**（排位榜最大、線上玩家最小），
  // 只把新的一塊從四塊裡按比例讓出來。
  // 各段相加必須是 1 —— flexbox 不會替你檢查，`lobbyLayoutProblems()` 會。
  friendsShare: 0.25,
  onlineShare: 0.15,
  nemesisShare: 0.2,
  leaderboardShare: 0.4,
  nemesisSort: "played",
  friendSort: "online-first",
  splitOrder: ["friends", "online", "nemesis", "leaderboard"],
  alreadyFriendMode: "greyed-button",
  stackOrder: ["friends", "online", "nemesis", "leaderboard"],
  minSlotHeightPx: 168,
  splitMinHeightPx: 560,
  stackBelowWidthPx: 720,
};

/**
 * 出貨預設。owner 明說的兩格是 `dummyHealth: 10000` 與 `dummyRespawnSec: 3`。
 *
 * ⚠️ 同上,唯一真相是 `valhallaSandboxRules.ts` 的 `DEFAULT_VALHALLA_SANDBOX`。
 */
export const DEFAULT_VALHALLA_SANDBOX_POLICY: ValhallaSandboxPolicyDoc = {
  dummyHealth: 10_000,
  dummyRespawnSec: 3,
  dummyDistance: 3.2,
  applyCombatEnv: true,
  movementLock: "anchor",
  unlockAllSlots: true,
  infiniteMana: true,
};

/**
 * 文件 → 政策。缺席／壞掉一律回退到出貨預設,理由和 `resolveVictoryFx` 同源:
 * 內容載不到是 2026-08-01 骨架事故那一條路,而在那條路上把左欄高度變成 0
 * 會讓「內容全毀」看起來像「朋友列表不見了」。
 */
export function resolveLobbyLayout(
  doc: ConfigLobbyLayoutDoc | null | undefined,
): LobbyLayoutPolicyDoc {
  if (!doc) return DEFAULT_LOBBY_LAYOUT_POLICY;
  return {
    leftColumnWidthPx: doc.leftColumnWidthPx,
    friendsShare: doc.friendsShare,
    onlineShare: doc.onlineShare,
    nemesisShare: doc.nemesisShare,
    leaderboardShare: doc.leaderboardShare,
    nemesisSort: doc.nemesisSort,
    friendSort: doc.friendSort,
    splitOrder: doc.splitOrder,
    alreadyFriendMode: doc.alreadyFriendMode,
    stackOrder: doc.stackOrder,
    minSlotHeightPx: doc.minSlotHeightPx,
    splitMinHeightPx: doc.splitMinHeightPx,
    stackBelowWidthPx: doc.stackBelowWidthPx,
  };
}

// ─────────────────────── 大廳集合令（GH#492）────────────────────────────

export type ConfigLobbyRallyDoc = z.infer<typeof zConfigLobbyRallyDoc>;

/** 去掉 id/schema/note 的殼之後,程式真正讀的那一份。 */
export type LobbyRallyPolicyDoc = Omit<ConfigLobbyRallyDoc, "id" | "schema" | "note">;

/**
 * 出貨預設（＝內容載不到時的保險絲）。
 *
 * ⭐ `waitSeconds: 10` 是 owner 明說的那一格。⚠️ 它當天改過**兩次**：
 * 原始規格「最多等 10 秒」→ 早上「改成五秒」→ **晚上改回 10**
 * （「調整戰鬥開始的拉人時間 5->10秒」）。⛔ 中間那一版已被取代，⛔ 不要再改回 5。
 * `joinMode: "opt-out"` 是他同一天說死的第二格（「**預設是加入，五秒是讓人按否定的**」）；
 * 其餘各格是決策點，預設值選的是
 * 「照 owner 的話做」的那一邊（第〇·六守則：優先權大的更新預設啟動）。
 *
 * ⚠️ 每一格都必須和 `apps/client/src/ui/platform/lobbyRally.ts` 的
 * `DEFAULT_LOBBY_RALLY` 一字不差 —— 那一份才是畫面真的在用的。
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對兩邊,差一格就紅。
 */
export const DEFAULT_LOBBY_RALLY_POLICY: LobbyRallyPolicyDoc = {
  enabled: true,
  waitSeconds: 10,
  includeBotMatch: true,
  startIgnoresReady: true,
  // ⭐ owner 2026-08-21:「預設是加入，五秒是讓人按否定的」。
  // ⚠️ 那句話裡的「五秒」是當時的窗口值,同日晚上改成 10 —— ⛔ 裁決講的是**預設方向**,不是秒數。
  joinMode: "opt-out",
  autoJoinLeadSeconds: 1.5,
  idleExcludeSeconds: 120,
  readyOnJoin: true,
  rosterMinHumans: 2,
  showRosterInSettlement: true,
  showRosterInChampSelect: true,
};

/**
 * 文件 → 政策。缺席／壞掉一律回退到出貨預設。
 *
 * ⚠️ 這裡**沒有**「載不到就關掉功能」這個選項:一份載不到的內容文件是
 * 2026-08-01 骨架事故那一條路,而在那條路上把集合令靜靜關掉,會讓「內容全毀」
 * 長得跟「owner 昨天關掉了集合令」一模一樣 —— 兩個都不會有人看見。
 */
export function resolveLobbyRally(
  doc: ConfigLobbyRallyDoc | null | undefined,
): LobbyRallyPolicyDoc {
  if (!doc) return DEFAULT_LOBBY_RALLY_POLICY;
  return {
    enabled: doc.enabled,
    waitSeconds: doc.waitSeconds,
    includeBotMatch: doc.includeBotMatch,
    startIgnoresReady: doc.startIgnoresReady,
    joinMode: doc.joinMode,
    autoJoinLeadSeconds: doc.autoJoinLeadSeconds,
    idleExcludeSeconds: doc.idleExcludeSeconds,
    readyOnJoin: doc.readyOnJoin,
    rosterMinHumans: doc.rosterMinHumans,
    showRosterInSettlement: doc.showRosterInSettlement,
    showRosterInChampSelect: doc.showRosterInChampSelect,
  };
}

/** 同上。文件缺席時沙盒仍然要開得起來（假人 10,000 血、三秒補滿）。 */
export function resolveValhallaSandbox(
  doc: ConfigValhallaSandboxDoc | null | undefined,
): ValhallaSandboxPolicyDoc {
  if (!doc) return DEFAULT_VALHALLA_SANDBOX_POLICY;
  return {
    dummyHealth: doc.dummyHealth,
    dummyRespawnSec: doc.dummyRespawnSec,
    dummyDistance: doc.dummyDistance,
    applyCombatEnv: doc.applyCombatEnv,
    movementLock: doc.movementLock,
    unlockAllSlots: doc.unlockAllSlots,
    infiniteMana: doc.infiniteMana,
  };
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
      // ⭐ GH#482 —— 忠實值 0.01156 / 0.02778（`models_report.json` 的兩個
      //    `scale_factor`）。⛔ 舊值 0.3221 只有它的 77%，而旁邊那句註解引用的
      //    `0.008946` 在整個 repo 裡不存在。守衛：`content/attachmentScale.test.ts`。
      attachScale: 0.4161,
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
 * ⚠️ 2026-08-10 之前這裡是 `On-Hit` 與 `OnHit` **兩列**:雅典娜的驚嘆號
 * (godie-i006)寫 `[OnHit]`、其餘 16 支寫 `[On-Hit]`,而「原稿不准改」讓對照表
 * 必須同時認得兩種拼法。**owner 當天親自解除了那個限制**:「On-hit 說明應該
 * 跟技能統一 tag []」—— 整批(17 件的 description + authoringNote)改成
 * `[普通攻擊時]`,兩列併成一列,同一行裡重複的尾綴 `(On-Hit)` 一併拿掉。
 * ⭐ 留著這段是因為它記錄了**為什麼曾經有兩列**:那不是疏忽,是一條刻意的
 * 「不為了程式好寫去動文案」的紀律。解除它的是文案作者本人,不是我。
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
  // ⚠️ 值一律引用 {@link DEFAULT_ITEM_ICON_FILL_PCT}，⛔ 不重打 100 ——
  // 重打就是第四個住處，而 `itemCardShipped.test.ts` 只比得出「JSON 與這裡對不對得上」，
  // 比不出「這裡與那個常數對不對得上」。
  iconFillPct: DEFAULT_ITEM_ICON_FILL_PCT,
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
    普通攻擊時: "active", // owner 2026-08-10：標記統一成中文,兩種拼法併成一列
    擴散: "active", // 普攻濺射
    暴擊: "active", // 普攻機率兩倍傷害
    暴擊吸血: "active",
    // A4b(#278) —— 【淨化】。分到 active：它是一個**會發生的事件**
    // （On-Hit 機率觸發／每 N 秒觸發），不是一條常駐屬性。
    淨化: "active", // 暴擊時 100% 吸血
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
    // ⭐ 【穿透】—— 霸王破甲槍 2026-08-13 從「真傷」改成「100% 護甲穿透」之後
    //   啟用的新標記。⚠️ 它**不是**【無視】的同義詞：穿透照樣被格擋擋得下、
    //   照樣被物理護盾吃、照樣觸發反傷，只是把護甲當成 0。
    //   ⛔ 漏掉這一列，卡片會走 `unknownCategory` 去猜分類（猜出來剛好也是
    //   passive，所以畫面上看不出來 —— 那正是 `itemCardShipped` 要擋的形態）。
    穿透: "passive", // 普攻無視敵方 N% 護甲
    真實傷害: "passive", // 技能傷害全部轉真實
    反彈: "passive", // 反彈普通攻擊傷害
    斬殺: "passive", // 低血直接斬殺
    格擋: "passive", // 機率抵擋
    迴避: "passive", // 機率迴避物理傷害
    流星: "passive", // 每秒自動範圍傷害
    // ⭐ 2026-08-18:被動子句**帶著使用條件**的那一族。標的仍然是一個被動效果
    // (所以歸 passive),只是那一行自己先講清楚「誰吃得到」——這是 owner 當天立的
    // 「不放任何無效說明」的直接產物:不講,拿到的人就會以為它對自己有效。
    限遠程: "passive", // 只有遠程英雄吃得到的被動 (piercer-crossbow)
    限智力: "passive", // 只有智力主屬性吃得到全額 (sage-ward-amulet)
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
