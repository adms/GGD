/**
 * `config` 集合的 **union 與公開面** —— 每一份 config schema 住 `config/<名字>.ts`。
 *
 * ⭐ 2026-08-22 拆檔（owner：「分析優化 config.ts 檔，要謹慎不能遺漏資訊的情況下，
 * 以能平行化有利的方式優化這個檔案，拆檔也可以」）。拆之前它是**一個 9,169 行的檔**，
 * 而**每一份新 config 都要動它** —— 同一天有 6 條 lane 同時要加 config，於是那天的
 * 解法是「禁止 lane 碰它、主 session 最後統一接」。那是繞道，⛔ 不是修好。
 * 拆之後：新增一份 config = **新開一個檔** + 這裡**一行**。
 *
 * ⛔ **為什麼下面那張 union 表不能改成「掃資料夾自動組出來」**（有人一定會想）：
 * `z.discriminatedUnion` 的型別參數是一個**元組**，`ConfigDoc = z.infer<…>` 的精度
 * 完全來自它。改成執行期掃 namespace 收集，`ConfigDoc` 會塌成 `any`／union 失準 ——
 * 而這份檔案裡就記著一次「`ConfigDoc` 型別不夠準 ⇒ 一個永遠 false 的死比對」。
 * ⇒ 這張表是**手寫的**，而漏掉一行的代價由閘擋住，⛔ 不是靠記得：
 * `configUnionCoversDirectory.test.ts` 兩個方向都關 ——
 * 資料夾裡有一份 schema 沒進 union → 紅；union 有一員在資料夾裡找不到 → 紅。
 */
import { z } from "zod";
// 位移級距（GH#318）與減傷曲線／穿透（負抗性放大）—— 兩份 config schema 各自
// 住在自己的檔案裡（那一輪 config.ts 由多個 lane 同時碰），這裡只把它們接進 union。
// ⛔ 漏掉任何一行 = 那份 json 進了 content/ 之後整份驗證失敗 → 骨架英雄。
import { zConfigDisplacementTiersDoc } from "../displacementDoc";
import { zConfigMitigationDoc } from "../mitigationDoc";
// 混音（owner 2026-08-17）—— 同上，schema 住自己的檔案，這裡只接進 union。
import { zConfigAudioMixDoc } from "../audioMixDoc";
// 練習模式（GH#343，owner 2026-08-17）—— 同上。
import { zConfigPracticeDoc } from "../practiceDoc";
// 排名獎勵（owner 2026-08-17「MMR 倍率跟賽季積分也是類似的規則」）—— 同上。
// ⚠️ 這一份的消費端是 **Go**（`internal/ranking/standingsoverride.go`），但它仍然
// 必須進這個 union：`content/config/ranking.json` 是內容 bundle 的一份文件，
// union 不認得它的 schema tag = 整份內容驗證失敗 → 客戶端退回 2 隻骨架英雄。
import { zConfigRankingDoc } from "../rankingDoc";
// 地端產圖的風格（owner 2026-08-17「日本 2D RPG」）—— 同上，schema 住自己的檔案。
import { zConfigIconStyleDoc } from "../iconStyleDoc";
import { zConfigMapSpecDoc } from "../mapSpecDoc";
import { zConfigMapReportDoc } from "../mapReportDoc";
import { zConfigArenaPoolDoc } from "../arenaPoolDoc";
// 創建新英雄的警示開關（GH#480）—— ⛔ 它的 Zod 住在 `../newHeroChecks`，因為那個檔
// 同時擁有規則清單（`NEW_HERO_WARN_RULES`）與檢查本體，而 schema 的 `rules` 物件
// 就是從那份清單推導的。抄一份鍵名進 schema/ 就是第二個住處，⛔ 而且它會 drift。
// ⚠️ `newHeroChecks` 只 import `./schema/{ability,champion}` 與幾支純函式，
//    ⛔ 不 import 這個檔 —— 所以這條 import 不會造成循環。
import { zConfigNewHeroChecksDoc } from "../../newHeroChecks";
// 每回合 S~D 評價的係數 (#212/#232)。整份 schema 定在自己的檔案裡(欄位多、
// 上下界全部從 sim 的 ROUND_GRADE_BOUNDS 生),這裡只把它掛進 collection union。
import { zConfigRoundGradeDoc } from "../roundGrade";
// config.victory-podium@1 (GH#257/#256) 的整份 schema、出貨預設與解析器住在自己
// 的檔案裡（欄位的理由很長,而且客戶端的 RoundWinnerStage / ui/panels/victoryPodium
// 直接 import 它）。這裡只做兩件事:把它掛進 collection union（**漏掉這一步就是
// 2026-08-02 那次線上事故的形狀** —— 內容裡有一個 union 不認得的 schema tag,
// 整棵內容驗證失敗、客戶端 fail-open 退回 2 隻英雄的骨架）、以及原地 re-export。
import { zConfigVictoryPodiumDoc } from "../victoryPodium";
// config.vfx-families@1 lives in ./vfx next to the vfx@1 docs it tunes (the
// w3x art family layer); only its union membership belongs here.
import { zConfigVfxFamiliesDoc, zConfigVfxAbilityArtDoc } from "../vfx";
// GH#529 —— 技能 ↔ 原作 emitter 的**推導**綁定表（`tools/vfx-bind/scan.py` 產生）。
// schema 住自己的檔案，這裡只接進 union。⛔ 漏掉下面那一行 union 成員 = 一份
// ability-vfx-bindings.json 進了 content/ 之後**整份**內容驗證失敗 → 骨架英雄。
import { zConfigAbilityVfxBindingsDoc } from "../abilityVfxBindings";
// GH#541 —— 29 個 JASS 連段函式的間隔表(第〇·四守則的共用表)。
// ⚠️ 漏掉這一行 = combo-strikes.json 進了 content/ 之後整份載入失敗 → 骨架英雄。
import { zConfigComboStrikesDoc } from "../comboStrikesDoc";
// ⛔ owner 的人工旋鈕授權表。⚠️ 漏掉這一行 = owner-knobs.json 進了 content/ 之後
// 整份內容驗證失敗 → 骨架英雄,而網站看起來完全正常。
import { zConfigOwnerKnobsDoc } from "../ownerKnobsDoc";
// GH#546 —— 開關型技能的「開啟中」外觀。⚠️ 漏掉這一行 = toggle-ability.json 進了
// content/ 之後整份載入失敗 → 骨架英雄,而網站看起來完全正常。
import { zConfigToggleAbilityDoc } from "../toggleAbilityDoc";
// owner 2026-08-22：「超過施法距離人物不會走過去放技能（做成後台開關）」。
// ⚠️ 漏掉這一行 = cast-approach.json 進了 content/ 之後整份載入失敗 → 骨架英雄。
import { zConfigCastApproachDoc } from "../castApproachDoc";
// GH#549 —— 畫面閃爍／震動／特效文字的**上限與無障礙**。⚠️ 漏掉這一行 =
// screen-fx.json 進了 content/ 之後整份載入失敗 → 骨架英雄。
import { zConfigScreenFxDoc } from "../screenFxDoc";

// ── union 的成員：每一份都住 `config/<名字>.ts` ───────────────────────────
import { zConfigReplayDoc } from "./replay";
import { zConfigRosterDoc } from "./roster";
import { zConfigBossIntroDoc } from "./bossIntro";
import { zConfigMatchDoc } from "./match";
import { zConfigStoreDoc } from "./store";
import { zConfigArenaRulesDoc } from "./arenaRules";
import { zConfigCombatEnvDoc } from "./combatEnv";
import { zConfigAmbientVfxDoc } from "./ambientVfx";
import { zConfigAudioMapDoc } from "./audioMap";
import { zConfigChampionVoicesDoc } from "./championVoices";
import { zConfigUnitTintsDoc } from "./unitTints";
import { zConfigGoreDoc } from "./gore";
import { zConfigDamageColorsDoc } from "./damageColors";
import { zConfigIconPlanDoc } from "./iconPlan";
import { zConfigVictoryTauntsDoc } from "./victoryTaunts";
import { zConfigVoxelBarcodesDoc } from "./voxelBarcodes";
import { zConfigVoxelBodiesDoc } from "./voxelBodies";
import { zConfigBaseBonusDoc } from "./baseBonus";
import { zConfigPerLevelBonusDoc } from "./perLevelBonus";
import { zConfigStatCapsDoc } from "./statCaps";
import { zConfigCombatFeelDoc } from "./combatFeel";
import { zConfigFormVisualsDoc } from "./formVisuals";
import { zConfigModelLodDoc } from "./modelLod";
import { zConfigVfxCleanupDoc } from "./vfxCleanup";
import { zConfigFeelFxDoc } from "./feelFx";
import { zConfigShieldDoc } from "./shield";
import { zConfigBlockDoc } from "./block";
import { zConfigCritDoc } from "./crit";
import { zConfigBerserkDoc } from "./berserk";
import { zConfigWoundsDoc } from "./wounds";
import { zConfigWeaknessDoc } from "./weakness";
import { zConfigDamageRulesDoc } from "./damageRules";
import { zConfigApDamageScalingDoc } from "./apDamageScaling";
import { zConfigDispelDoc } from "./dispel";
import { zConfigCooldownRulesDoc } from "./cooldownRules";
import { zConfigCastTimeDoc } from "./castTime";
import { zConfigAoeTiersDoc } from "./aoeTiers";
import { zConfigRangeTiersDoc } from "./rangeTiers";
import { zConfigCooldownTiersDoc } from "./cooldownTiers";
import { zConfigDamageTiersDoc } from "./damageTiers";
import { zConfigDamageTierExemptionsDoc } from "./damageTierExemptions";
import { zConfigManaTiersDoc } from "./manaTiers";
import { zConfigSpeedGrowthTiersDoc } from "./speedGrowthTiers";
import { zConfigSkillNormalizeDoc } from "./skillNormalize";
import { zConfigManaEconomyDoc } from "./manaEconomy";
import { zConfigStatNormalizationDoc } from "./statNormalization";
import { zConfigOriginRoutesDoc } from "./originRoutes";
import { zConfigAugmentFilterDoc } from "./augmentFilter";
import { zConfigStealthDoc } from "./stealth";
import { zConfigTauntDoc } from "./taunt";
import { zConfigBodyScaleDoc } from "./bodyScale";
import { zConfigRegenDoc } from "./regen";
import { zConfigVictoryFxDoc } from "./victoryFx";
import { zConfigItemCardDoc } from "./itemCard";
import { zConfigUiLexiconDoc } from "./uiLexicon";
import { zConfigLobbyLayoutDoc } from "./lobbyLayout";
import { zConfigLobbyRallyDoc } from "./lobbyRally";
import { zConfigAdminFriendDoc } from "./adminFriend";
import { zConfigGamepadDoc } from "./gamepad";
import { zConfigValhallaSandboxDoc } from "./valhallaSandbox";
import { zConfigContentLoadDoc } from "./contentLoad";
import { zConfigAuthoringRulesDoc } from "./authoringRules";
import { zConfigCameraDoc } from "./camera";
import { zConfigRangeGuideDoc } from "./rangeGuide";

// ── 公開面 ────────────────────────────────────────────────────────────────
// ⭐ 拆檔前 `export * from "./config"` 拿得到的每一個名字，拆檔後**一個不少**
//    地從這裡出去（`configFacadeSurface.test.ts` 在數）。⛔ `_shared.ts` 不在
//    這張表上：它裡面的兩個名字拆檔前是**檔案私有**的。
export * from "./adminFriend";
export * from "./ambientVfx";
export * from "./aoeTiers";
export * from "./apDamageScaling";
export * from "./arenaRules";
export * from "./arenaRules.mobWaves";
export * from "./audioMap";
export * from "./augmentFilter";
export * from "./authoringRules";
export * from "./baseBonus";
export * from "./berserk";
export * from "./block";
export * from "./bodyScale";
export * from "./bossIntro";
export * from "./camera";
export * from "./castTime";
// ⭐ `castApproachDoc` 住在上一層（拆檔那天它剛好由另一條 lane 建立）。
// ⛔ 只 import 不 re-export = 後台 `import { zConfigCastApproachDoc } from "@ggd/shared/content"`
//    在**執行期**拿到 undefined，而 tsc 之外沒有東西會說 —— 走訪器直接 crash。
export { zConfigCastApproachDoc } from "../castApproachDoc";
export * from "./championVoices";
export * from "./combatEnv";
export * from "./combatFeel";
export * from "./contentLoad";
export * from "./cooldownRules";
export * from "./cooldownTiers";
export * from "./crit";
export * from "./damageColors";
export * from "./damageRules";
export * from "./damageTierExemptions";
export * from "./damageTiers";
export * from "./dispel";
export * from "./feelFx";
export * from "./formVisuals";
export * from "./gamepad";
export * from "./gore";
export * from "./iconPlan";
export * from "./itemCard";
export * from "./lobbyLayout";
export * from "./lobbyRally";
export * from "./manaEconomy";
export * from "./manaTiers";
export * from "./match";
export * from "./modelLod";
export * from "./originRoutes";
export * from "./perLevelBonus";
export * from "./rangeGuide";
export * from "./rangeTiers";
export * from "./regen";
export * from "./replay";
export * from "./roster";
export * from "./shield";
export * from "./skillNormalize";
export * from "./speedGrowthTiers";
export * from "./statCaps";
export * from "./statNormalization";
export * from "./stealth";
export * from "./store";
export * from "./taunt";
export * from "./uiLexicon";
export * from "./unitTints";
export * from "./valhallaSandbox";
export * from "./vfxCleanup";
export * from "./victoryFx";
export * from "./victoryTaunts";
export * from "./voxelBarcodes";
export * from "./voxelBodies";
export * from "./weakness";
export * from "./wounds";


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
  zConfigCastApproachDoc,
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
// config.round-grade@1 的型別/Zod/出貨文件全部在 ./roundGrade,這裡只再匯出一次
// 給 `export * from "./config"` 的既有消費端(admin / codex 都是這樣拿的)。
export * from "../roundGrade";
export type AnyConfigDoc = z.infer<typeof zConfigDoc>;
