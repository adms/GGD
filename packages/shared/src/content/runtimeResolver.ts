import type { TemplateDoc } from "./schema/template";
import { aoeTiersFromDoc, resolveRadiusTier } from "./aoeTiers";
import { rangeTiersFromDoc, resolveRangeTier } from "./rangeTiers";
import { cooldownTiersFromDoc, resolveCooldownTier } from "./cooldownTiers";
import { damageTiersFromDoc, resolveDamageTier } from "./damageTiers";
import { manaTiersFromDoc, resolveManaCostTier } from "./manaTiers";
import { DEFAULT_CAST_TIME_TIERS, resolveCastTimeTierOnDoc } from "./castTimeTiers";
import { DEFAULT_RANK_GROWTH_RULES, resolveRankGrowthOnDoc, type RankGrowthRules } from "./rankGrowth";
import { DEFAULT_AP_COEFFICIENT, resolveApCoeffOnDocWithTiers, type ApCoefficientConfig } from "./apCoefficient";
import { moveSpeedTiersFromDoc, resolveMsBonusTier } from "./moveSpeedTiers";
import { displacementTiersFromDoc, minBodyRadiusFromConfigs, resolveDisplacementTier } from "./displacementTiers";
import { normalizeComboTable, resolveComboFamilies } from "../sim/effects/comboFamilies";
import { resolveModelFxPreset } from "./modelFxPreset";

/** One ordered runtime resolution pipeline for registration, Editor and imports. */
export function createRuntimeResolver(
  templates: ReadonlyMap<string, TemplateDoc>,
  configDocs: readonly { schema?: string }[],
) {
  const aoeTiers = aoeTiersFromDoc(configDocs.find((c) => c.schema === "config.aoe-tiers@1"));
  // 位移級距（GH#318）。⚠️ 速度天花板是**推導**出來的，輸入是最小身體半徑 ——
  // 所以這裡要先把 `config.arena-rules@1` 讀出來，⛔ 不可以寫死 16
  //（有人把 mob 半徑調到 0.4 的那天，16 就再次說謊，而且沒有東西會紅）。
  const displacementTiers = displacementTiersFromDoc(
    configDocs.find((c) => c.schema === "config.displacement-tiers@1"),
    minBodyRadiusFromConfigs(configDocs),
  );
  /**
   * 兩個級距合成**一個**接縫。⭐ 每一支技能（standalone / 內嵌 / 模板展開後）
   * 與每一件道具都要走這裡，⛔ 不是只有模板技 —— 見下面 `mapChampionAbilities`
   * 的說明，AoE 那條內嵌路徑到今天為止一次都沒真的跑過。
   */
  // 施法距離級距（GH#414）—— owner 2026-08-19「可施展技能的距離普遍超遠」。
  // ⚠️ 這一軸在此之前**沒有表**，216 支各帶一個從 w3a 換算來的自由數字。
  const rangeTiers = rangeTiersFromDoc(
    configDocs.find((c) => c.schema === "config.range-tiers@1"),
  );
  // 冷卻五級距（GH#445）與傷害五級距（GH#447）—— 成本軸的第三條與**唯一**的
  // 回報軸。⚠️ 兩者都掛在**同一個** `withTiers` 接縫上，理由同上面那一段：
  // standalone / 內嵌 / 模板展開後 / 道具，四條路只能有一個答案。
  const cooldownTiers = cooldownTiersFromDoc(
    configDocs.find((c) => c.schema === "config.cooldown-tiers@1"),
  );
  const damageTiers = damageTiersFromDoc(
    configDocs.find((c) => c.schema === "config.damage-tiers@1"),
  );
  // 耗魔五級距（2026-08-21）—— 五軸的最後一軸。⚠️ 在它之前 `ability@1` 上根本
  // 沒有 `manaCostTier` 一格，所以 212 支要花魔力的技能各自帶一個自由數字：
  // 級距表一改它們一動都不會動，⛔ 而且沒有任何東西會紅。
  const manaTiers = manaTiersFromDoc(configDocs.find((c) => c.schema === "config.mana-tiers@1"));
  // ⭐ 吟唱五級距（GH#943）—— ⛔ 缺席時用 `DEFAULT_`（＝出貨值），
  //   而 `resolveCastTimeTierOnDoc` 在 `enabled:false` 時逐位元 no-op。
  const castTimeTiers =
    (configDocs.find((c) => c.schema === "config.cast-time-tiers@1") as unknown as
      | typeof DEFAULT_CAST_TIME_TIERS
      | undefined) ?? DEFAULT_CAST_TIME_TIERS;
  // ⭐ 升級成長率（GH#938 的機制，GH#906 的接線）—— ⛔ 缺席時用 `DEFAULT_`（＝出貨值），
  //   而 `resolveRankGrowthOnDoc` 在 `enabled:false` 時逐位元 no-op（⭐ 那格就是 rollback）。
  const rankGrowth =
    (configDocs.find((c) => c.schema === "config.rank-growth@1") as unknown as
      | RankGrowthRules
      | undefined) ?? DEFAULT_RANK_GROWTH_RULES;
  // 移速**加成**五級距（GH#789，owner 2026-08-27「%轉換為五級距⋯0.1~4」）。
  // ⚠️ 它級距化的是 **modifier 節點**（任意深度的 `{stat:"ms", op:pctAdd|pctMult}`），
  // 帶 `msBonusTier` 的節點**沒有** `value`（#534 exclusive）——所以這一層**不可以漏**：
  // 漏了＝modifier 沒有 value＝statPipeline 的 `m.value * stacks` 算出 NaN 傳染進移速。
  const moveSpeedTiers = moveSpeedTiersFromDoc(
    configDocs.find((c) => c.schema === "config.move-speed-tiers@1"),
  );
  // GH#541 —— 29 個 JASS 連段函式的間隔表。⭐ 間隔就是動畫節奏的來源(owner 2026-08-22),
  // 所以它**逐支不同**(克勞德 0.2/0.6/0.4 · 龍虎亂舞 0.3/0.05/0.5 · 理想鄉 0.1/0.3/0.2)——
  // ⛔ 統一成一個 `intervalSec` 會把每一支的手感抹平。
  const comboFamilies = normalizeComboTable(
    configDocs.find((c) => c.schema === "config.combo-strikes@1"),
  );
  // ⭐⭐ AP 係數公式（GH#942/#945，接線 GH#1035 —— owner 2026-09-06「全部技能接上公式」）。
  //   ⛔ 缺席時用 `DEFAULT_`（＝出貨值）；`enabled:false` ⇒ `resolveApCoeffOnDoc` 逐位元 no-op
  //   （手填的 `coeff` 原封不動）—— ⭐ 那一格就是 rollback。
  //   ⚠️ 冷卻中位／秒數由 `apCoeffCooldownFor()` **逐節點**決定，與 `tools/ap-coeff-apply/gen.ts` 的報表**同一支**：
  //   報表上看到的公式值就是場上跑的值，⛔ 不會再有「這裡印 A、場上跑 B」。
  const apCoeff =
    (configDocs.find((c) => c.schema === "config.ap-coefficient@1") as unknown as
      | ApCoefficientConfig
      | undefined) ?? DEFAULT_AP_COEFFICIENT;
  const cooldownTiersRaw = configDocs.find((c) => c.schema === "config.cooldown-tiers@1") as unknown as
    | { seconds?: Record<string, Record<string, number>> }
    | undefined;
  const withApCoeff = <T extends object>(d: T): T =>
    resolveApCoeffOnDocWithTiers(d as Record<string, unknown>, cooldownTiersRaw, apCoeff) as T;
  // ⭐ AP 係數包在**最外層**，而位置是承重的：它讀 `resolveCooldownTier` 寫完的 `cooldown[]`、
  //   `resolveRangeTier` 寫完的 `range`、`resolveCastTimeTierOnDoc` 寫完的 `castTimeSec`、
  //   `resolveRadiusTier` 寫完的 `radius`（形狀）—— 包在裡面任何一層，它就讀到退路值。
  const withTiers = <T extends object>(d: T): T => withApCoeff(withTiersCore(d));
  const withTiersCore = <T extends object>(d: T): T =>
    // ⚠️ 冷卻在**幾何之外**是刻意的：`cooldownShapeOf` 的自動推形狀會去看
    // `radius`/`radiusTier`，而 `resolveRadiusTier` 只**加**欄位不刪 ——
    // 先跑幾何再跑冷卻，兩種寫法（填數字／填級距）看到的形狀才會一樣。
    // ⭐ 耗魔包在最外層只是**順序無關**（它只讀頂層 `manaCostTier`／`manaCost`，
    // ⛔ 不看幾何也不看傷害），⛔ 不要因此以為它有優先權。
    // ⭐ 連段家族包在最外層與耗魔同理:它只讀 `comboStrikes` 節點的 `family`,
    // ⛔ 不看幾何、不看傷害、不看冷卻 ⇒ 順序無關。
    // ⭐ 移速加成級距包在最外層與耗魔同理：它只讀 modifier 節點的 `msBonusTier`，
    // ⛔ 不看幾何、不看傷害、不看冷卻 ⇒ 順序無關。
    // ⭐ 吟唱級距（GH#943）包在最外層與耗魔同理：它只讀頂層 `castTimeTier`，
    // ⛔ 不看幾何、不看傷害、不看冷卻 ⇒ 順序無關。
    // ⚠️ ⛔ 少了這一層，`castTimeTier` 就是「有欄位而沒有人翻譯」（失敗形態⑧）。
    // ⭐⭐ 升級成長率（GH#906）包在**最外層**，而位置是承重的：
    //   它讀的是 `resolveDamageTier` **寫完之後**的 `flat`
    //   ⇒ 包在裡面的話它會讀到 `undefined`，那一層逐位元 no-op 而**沒有任何東西會紅**。
    // ⚠️ ⭐ 它與吟唱／耗魔那幾層不同：那些只讀頂層欄位所以順序無關，
    //   ⛔ 這一層**有順序相依**。
    resolveRankGrowthOnDoc(
    resolveCastTimeTierOnDoc(
    resolveMsBonusTier(
    resolveComboFamilies(
      resolveManaCostTier(
      resolveCooldownTier(
        resolveDamageTier(
          resolveDisplacementTier(
            resolveRangeTier(
              // ⭐【橫放光束砲】特效模板（owner 2026-08-23）—— `spawnModelFx.preset`
              // 在**最內層**解開：模板補的是演出幾何（modelKey/path/speed/distance/
              // spin/scale/touch*），⛔ 沒有一格是級距的輸入，所以它與外面五層
              // 順序無關；擺在最內層只是讓下游看到的永遠是**補完**的節點。
              // 表住 `content/ability-templates/tpl-beam-roll.json`（第〇·四守則）。
              resolveRadiusTier(resolveModelFxPreset(d, templates) as never, aoeTiers) as never,
              rangeTiers,
            ) as never,
            displacementTiers,
          ),
          damageTiers,
        ) as never,
        cooldownTiers,
      ) as never,
      manaTiers,
      ) as never,
      comboFamilies,
    ) as never,
      moveSpeedTiers,
    ) as never,
      castTimeTiers,
    ) as never,
      rankGrowth,
    ) as T;
  return { resolve: withTiers, aoeTiers, displacementTiers, rangeTiers, damageTiers, moveSpeedTiers };
}

export function resolveRuntimeDraft(
  doc: Readonly<Record<string, unknown>>,
  templates: ReadonlyMap<string, TemplateDoc>,
  configs: Readonly<Partial<Record<string, Record<string, unknown>>>>,
): Record<string, unknown> {
  return createRuntimeResolver(templates, Object.values(configs).filter((value): value is Record<string, unknown> => value !== undefined)).resolve({ ...doc });
}

