import { z } from "zod";
// 冷卻五級距（GH#445）—— 三張表（單體／範圍／變身）的來歷與「為什麼照抄
// owner 的數字而不是推導」寫在 content/cooldownTiers.ts。
import { COOLDOWN_SHAPES, COOLDOWN_TIER_NAMES, DEFAULT_COOLDOWN_TIERS } from "../../cooldownTiers";
// 傷害五級距（GH#447）—— 唯一的**回報**軸。五個數字從冷卻表推導，
// 推導式與 owner 的兩條輸入寫在 content/damageTiers.ts。
import { DAMAGE_TIER_NAMES, DEFAULT_DAMAGE_TIERS } from "../../damageTiers";
// ⭐ GH#465 相稱性 —— 公式與 owner 的係數住在 content/proportionality.ts，
//    schema 這一層只是把它搬上 Zod（⛔ 不在這裡再算一次）。
import { AIM_RISK_MAX, AIM_RISK_MIN, DEFAULT_AIM_RISK_MULT, DEFAULT_EXPECTED_HITS, DEFAULT_MAX_TIERS_ABOVE_MIN, DEFAULT_PROPORTIONALITY_MODEL, EXPECTED_HITS_MAX, EXPECTED_HITS_MIN, MAX_TIERS_ABOVE_MIN_MAX, MAX_TIERS_ABOVE_MIN_MIN, PROPORTIONALITY_MODELS, describeProportionalityCeiling, describeProportionalityModels, tableForModel } from "../../proportionality";

// ---------------------------------------------------------------- #327 ----
/**
 * ⭐【`config.authoring-rules@1`】—— 外部編輯器的**原則界**（GH#327）。
 *
 * `docs/技能編輯器引擎須知 20260811.md` 9.2 把創作規則分成兩層：
 *
 * | 層 | 例 | 反應 |
 * |---|---|---|
 * | **硬界** | 升階冷卻上升 · AoE 半徑超過決鬥區 · 階數不符 | ⛔ 擋下,上不了線 |
 * | **原則界** | 單體冷卻不在 5–30 · 範圍不在 30–120 · 變身沒到 120 | ⚠️ 警告但放行 |
 *
 * ⭐ **硬界不在這裡** —— 它們從既有的 Zod 界與 `config.cast-time@1` /
 * `cooldown-rules@1` / `aoe-tiers@1` / `stat-caps@1` **推導**（`authoringRules.ts`）。
 * ⛔ 抄一份到這裡就是第二個住處。
 *
 * 這一份只放**原則界**,因為它們是 owner 的**設計偏好**而不是引擎事實 ——
 * 而設計偏好正是第一守則說要做成欄位的東西。owner 2026-08-12 的原話是
 * 「**原則上**」,所以它必須保留刻意破例的空間:違反只警告,⛔ 不擋。
 */
export const AUTHORING_RULES_DOC_ID = "authoring-rules";

/**
 * 冷卻秒數的合理上下界。⚠️ 上界不是只有下界（第一守則）。
 *
 * ⭐ 兩句人話由呼叫端給（GH#992）—— 這個子物件**被用兩次**（單體／範圍），
 * ⛔ 所以描述不可以寫死在它身上：那會讓兩頁欄位拿到同一句話。
 */
const zCooldownBand = (minDesc: string, maxDesc: string) =>
  z
    .object({
      min: z.number().min(0).max(600).describe(minDesc),
      max: z.number().min(0).max(600).describe(maxDesc),
    })
    .strict();

/**
 * ⭐【GH#465】**相稱性** —— 成本軸（冷卻 × 形狀）反過來對回報軸（傷害）的要求。
 *
 * owner 2026-08-19，被問到「範圍·極小 30 秒打 1.33 人、每點輸出付 3.76 倍，
 * 這一格是可行選擇還是刻意勸退？」：
 * > 「**的確是太小不合理，要綜合看傷害是不是極大或至少大的**」
 *
 * ⇒ 他的答案不是「把 30 秒調小」，也不是「承認它是勸退」，而是**第三種**：
 * 那一格合不合理**取決於另一個軸**。合起來與他的 Q4（「傷害相應的冷卻跟耗魔
 * 做限制」）是**同一條雙向規則** —— 傷害決定成本，成本反過來要求傷害。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 2026-08-20：它從**十五格資料**變成**一條公式 + 一個係數**
 *
 * 這一段在昨天寫的是「⚠️ 它推導不出來⋯所以它是**資料**不是公式」。
 * owner 2026-08-20 把缺的那個輸入給了我（逐字）：
 *
 * > 「簡單粗暴的建議，**30/6秒=5，所以是 5 倍差距**，但由於是極小還是有可能位於
 * >  **2 個人的命中範圍，所以再除 2**，最後結論**約等於 2.5 倍**」
 *
 * ⇒ 缺的輸入是**期望命中人數**（`expectedHits`），公式與整張表的推導寫在
 * `content/proportionality.ts`。`minDamageTier` 現在是**推導出來的**，
 * ⛔ 不是手填的 —— 改係數，十五格自己跟著動。
 *
 * ⚠️ ⛔ 公式**沒有重現** owner 2026-08-19 手填的那一格（範圍·極小 → 大）：
 * 它給的是「小」，差 3.0 倍／兩級。⛔ 我沒有去湊 —— 照第〇·六守則，
 * 比較新的第 1 層贏且**預設啟動**，舊的那一格另存在
 * `proportionality.ts` 的 `OWNER_20260819_CELL`，而 `expectedHits` 就是回頭的開關。
 *
 * ⚠️ 違反只**警告不擋**（和這一份文件的其餘欄位同一層）：owner 說的是
 * 「不合理」不是「不准」，而刻意的例外要留空間。
 */
/** 傷害級距名的下拉。⛔ 抽成函式的理由同 `zCooldownSecondsRow`（轉型要對得上）。 */
const zDamageTierEnum = () => z.enum(DAMAGE_TIER_NAMES);

/** 五個傷害級距選項的中文 —— ⛔ 從 `DEFAULT_DAMAGE_TIERS` 推導，⛔ 不抄字面值。 */
const DAMAGE_TIER_OPTS = DAMAGE_TIER_NAMES.map(
  (t) => `@opt ${t} ${t}（${DEFAULT_DAMAGE_TIERS.damage[t]} 傷害）`,
).join("\n");

/** 一個形狀的五格「最低傷害級距」。⭐ 人話帶著形狀（GH#992），⛔ 這一列被用三次。 */
const zMinDamageTierRow = (shape: string) =>
  z
    .object(
      Object.fromEntries(
        COOLDOWN_TIER_NAMES.map((n) => [
          n,
          zDamageTierEnum().describe(
            `@zh ${shape}・冷卻 ${n} → 傷害至少\n` +
              `@note 一支「${shape}」形狀、冷卻級距填「${n}」的技能，傷害級距至少要到哪一格才算相稱。` +
              "填「極小」＝**不構成限制**（那是傷害軸的第一格）。⚠️ 違反只**警告不擋**。" +
              "⚠️ ⛔ **這一格只有在上面的「相稱性模型」選 `custom` 時才生效** —— 其餘三個模型" +
              "都是**現推**的（改了模型，十五格自己跟著動）。⇒ 想做**刻意的單格破例**，" +
              "先把模型切到 `custom`，這裡才是效力來源。" +
              "⭐ 出貨值 = `formula` 推出來的那一份（owner 2026-08-20 的 2.5× 邏輯）：要求傷害 = " +
              "單位輸出率 × 這一格的卡面冷卻 ÷「期望命中人數」。\n" +
              DAMAGE_TIER_OPTS,
          ),
        ]),
      ) as Record<(typeof COOLDOWN_TIER_NAMES)[number], ReturnType<typeof zDamageTierEnum>>,
    )
    .strict();

const zProportionality = z
  .object({
    /** 關掉 = 這條相稱性檢查完全不出現在編輯器的警告清單裡。 */
    // [spec] ⭐ GH#465 —— 相稱性。⛔ 十五格不是手打的（第零守則⑨：N 個同型 = K 個模板
    // [spec]    + 一張表）；形狀名與級距名都從 shared 的常數來，⛔ 後台不另立一組字串。
    enabled: z.boolean().describe(
      "@zh 相稱性檢查總開關\n" +
      "@note 關掉之後，「付得多、打得少、傷害又低」的組合**完全不會**出現在編輯器的警告清單裡。⚠️ 關掉不會讓那些技能上不了線 —— 這一整族本來就只警告不擋。",
    ),
    /**
     * ⭐ **哪一個模型**推導下面那十五格（owner 2026-08-20「fix #465, 3 suggestions?」）。
     *
     * ⛔ 這一格存在的理由是**兩層 owner 說法打架**，而我沒有替他挑：08-19 手填
     * 「範圍・極小 → 大」，08-20 給的公式算出來是「小」。⭐ 出貨 = **今天的行為**
     *（第〇·六守則：高層級的更新預設啟動），另外兩條路各是一格下拉。
     */
    model: z
      .enum(PROPORTIONALITY_MODELS)
      .describe(
        "@zh 相稱性模型（三選一）\n" +
          "@note **哪一個模型推導下面那十五格。** 這一格存在的理由是 owner 自己的兩句話打架：" +
          "2026-08-19 手填「範圍・極小要配傷害**大**」，2026-08-20 給的公式算出來是「**小**」" +
          "（差 3 倍／兩級）。⛔ 三條路都做出來了，⭐ 出貨是 **formula ＝ 今天的行為**。" +
          describeProportionalityModels(
            DEFAULT_COOLDOWN_TIERS.seconds,
            DEFAULT_DAMAGE_TIERS.damage,
            DEFAULT_EXPECTED_HITS,
            DEFAULT_AIM_RISK_MULT,
          ) +
          "⚠️ 改這一格會**同時**改掉範圍那五條警告，⛔ 不影響任何技能上不上得了線。\n" +
          // ⛔ 選項標籤把**那個模型的範圍五格**帶上，⛔ 不是只寫一個代號 ——
          //    「這是方案 B」對操作者不構成資訊，「範圍＝大/極大/…」才是。
          PROPORTIONALITY_MODELS.map((m) =>
            m === "custom"
              ? `@opt ${m} custom 手填（吃下面十五格）`
              : `@opt ${m} ${m}：範圍＝${COOLDOWN_TIER_NAMES.map(
                  (t) =>
                    tableForModel(
                      m,
                      DEFAULT_COOLDOWN_TIERS.seconds,
                      DEFAULT_DAMAGE_TIERS.damage,
                      DEFAULT_EXPECTED_HITS,
                      DEFAULT_AIM_RISK_MULT,
                    )["範圍"][t],
                ).join("/")}`,
          ).join("\n"),
      ),
    /**
     * ⭐ **瞄準風險倍率** —— 只有 `model: "aimRisk"` 會讀它。
     * 語意：一支範圍技**有多容易完全落空**（⛔ 與「打到幾個人」是兩件事）。
     * 出貨那一格是**反算**出來的：切過去就會重現 owner 2026-08-19 手填的那一格。
     */
    aimRiskMult: z
      .object(
        Object.fromEntries(
          COOLDOWN_SHAPES.map((s) => [
            s,
            z
              .number()
              .finite()
              .min(AIM_RISK_MIN)
              .max(AIM_RISK_MAX)
              .describe(
                `@zh ${s}・瞄準風險倍率\n` +
                  `@note 一支「${s}」形狀的技能**有多容易一個人都沒打到** —— 要求傷害再乘這個數字。` +
                  "**1 ＝ 沒有額外要求**（＝ 公式本身）。⚠️ **只有上面的模型選 `aimRisk` 時才生效**。" +
                  "⭐ 它與「期望命中人數」刻意是**兩格**：「打到幾個人」與「有多容易完全落空」是" +
                  "兩件不同的事，混成一格的代價是 owner 親口說的「**2 個人**」會被改寫成 0.67 人，" +
                  "而那格 config 從此在說謊。⚠️ 出貨「範圍」那格是**反算**出來的：切到 `aimRisk` " +
                  "就會重現 owner 2026-08-19 手填的「範圍・極小 → 大」。",
              ),
          ]),
        ) as Record<(typeof COOLDOWN_SHAPES)[number], z.ZodNumber>,
      )
      .strict(),
    /**
     * ⭐ **期望命中人數** —— owner 2026-08-20 給的那個係數（範圍 **2 人**）。
     * ⛔ **0 ＝ 這個形狀豁免**（出貨的「變身」就是 0：它的回報軸不是傷害）。
     * 語意與公式寫在 `content/proportionality.ts`。
     */
    expectedHits: z
      .object(
        Object.fromEntries(
          COOLDOWN_SHAPES.map((s) => [
            s,
            z
              .number()
              .finite()
              .min(EXPECTED_HITS_MIN)
              .max(EXPECTED_HITS_MAX)
              .describe(
                `@zh ${s}・期望命中人數\n` +
                  `@note 一支「${s}」形狀的技能，一次期望打到幾個人。⭐ 它是 GH#465 整張表的**唯一係數**：` +
                  "要求傷害 = 單位輸出率 × 這一格的卡面冷卻 ÷ 這個數字。owner 2026-08-20：" +
                  "「**30/6秒=5，所以是 5 倍差距**，但由於是極小還是有可能位於 **2 個人的命中範圍，" +
                  "所以再除 2**，最後結論**約等於 2.5 倍**」。⚠️ 量到的是 **1.33 人**，" +
                  "owner 自己進位成 **2** —— 那是他的裁決，⛔ 不是四捨五入。" +
                  "⛔ **填 0 ＝ 這個形狀豁免**（出貨「變身」就是 0：它的回報軸不是傷害，" +
                  "對它要求最低傷害等於逼作者在變身技上填傷害）。" +
                  "⚠️ 調小這個數字會**同時收緊**該形狀的五格；調大會放鬆。",
              ),
          ]),
        ) as Record<(typeof COOLDOWN_SHAPES)[number], z.ZodNumber>,
      )
      .strict(),
    /**
     * 形狀 → 冷卻級距 → **最低**傷害級距。
     * ⭐ **推導出來的**（`tableForModel`），⛔ 不是手填的資料 ——
     * 它跟著 `model` × `expectedHits` × `aimRiskMult` × 冷卻級距表 × 傷害級距表走。
     * 「極小」＝ 不構成限制（那是傷害軸的最低一格）。
     *
     * ⚠️ **只有 `model: "custom"` 會讀這十五格。** 其餘三個模型一律現推 ——
     * 否則切換模型會變成一格「說了但不會發生」的下拉（第一·五守則）。
     * ⇒ 想做**單格破例**就把模型切到 `custom`，這十五格才是效力來源。
     */
    minDamageTier: z
      .object(
        Object.fromEntries(COOLDOWN_SHAPES.map((s) => [s, zMinDamageTierRow(s)])) as Record<
          (typeof COOLDOWN_SHAPES)[number],
          ReturnType<typeof zMinDamageTierRow>
        >,
      )
      .strict(),
    /**
     * ⭐【GH#616】**上限** —— 傷害級距最多可以比推導出來的最低值高幾格。
     *
     * ⚠️ 在 2026-08-23 之前這條原則**只有下限**，而級距梯子的正當性是
     * owner Q4 的「傷害與冷卻**嚴格成正比**」—— 那是一個**等式**，⛔ 不是不等式。
     * ⇒ 一支冷卻只值「小」而傷害填「極大」的技能違反的是**同一條**原則，
     * 而在此之前一格閘都沒有。
     *
     * ⭐ 出貨 **1**（⛔ 不是 0：最低那一側是無條件**進位**的，帶寬 0 會把
     * 「完全照公式填」的節點判成違規；⛔ 也不是 2 以上：那會讓這條規則今天
     * 一格都指不到，而永遠不會紅的閘等於沒有閘）。
     * 推導、量到的分佈與「為什麼是 1」寫在 `content/proportionality.ts`。
     *
     * ⭐ 填 {@link MAX_TIERS_ABOVE_MIN_MAX}（＝整條梯子）＝ **一鍵關掉上限**。
     * ⚠️ 與最低那一側同一層：違反只**警告不擋**。
     */
    maxTiersAboveMin: z
      .number()
      .int()
      .min(MAX_TIERS_ABOVE_MIN_MIN)
      .max(MAX_TIERS_ABOVE_MIN_MAX)
      .describe(
        "@zh 傷害級距最多高出最低要求幾格\n" +
          "@note **上限。** 級距梯子的正當性是 owner Q4 的「傷害與冷卻**嚴格成正比**」—— " +
          "那是一個**等式**，⛔ 不是不等式。一支冷卻只值「小」而傷害填「極大」的技能，" +
          "破壞的是**同一條**原則的另一邊，而在 2026-08-23 之前這一側**一格閘都沒有**。" +
          "⭐ **出貨 {{出貨值}} 是 Claude 挑的，⛔ 不是 owner 的裁決**（他的常設指令是" +
          "「沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback」）：量到出貨 217 個" +
          "有卡面冷卻的傷害節點，高出 ≤0 級 193 個、**+1 級 22 個**、**+2 級 2 個**、+3 以上 0 個。" +
          "⛔ 不挑 0（最低那一側是無條件**進位**的，帶寬 0 會把「完全照公式填」的節點判成違規）；" +
          "⛔ 不挑 2 以上（今天一格都指不到 ＝ 永遠不會紅的閘）。" +
          describeProportionalityCeiling(
            DEFAULT_COOLDOWN_TIERS.seconds,
            DEFAULT_DAMAGE_TIERS.damage,
            DEFAULT_EXPECTED_HITS,
            DEFAULT_AIM_RISK_MULT,
            DEFAULT_MAX_TIERS_ABOVE_MIN,
          ),
      ),
  })
  .strict();

/**
 * 十五格的出貨值 —— ⭐ **推導**，⛔ 不是抄的。
 * 三個輸入全部是既有的出貨表：冷卻級距 × 傷害級距 × owner 的期望命中人數。
 */
const shippedMinDamageTier = (): Record<string, Record<string, string>> =>
  tableForModel(
    DEFAULT_PROPORTIONALITY_MODEL,
    DEFAULT_COOLDOWN_TIERS.seconds,
    DEFAULT_DAMAGE_TIERS.damage,
    DEFAULT_EXPECTED_HITS,
    DEFAULT_AIM_RISK_MULT,
  ) as unknown as Record<string, Record<string, string>>;

export const DEFAULT_AUTHORING_PRINCIPLES = {
  id: AUTHORING_RULES_DOC_ID,
  schema: "config.authoring-rules@1",
  singleTargetCooldown: { min: 5, max: 30 },
  aoeCooldown: { min: 30, max: 120 },
  transformCooldownMin: 120,
  proportionality: {
    enabled: true,
    // ⭐ 出貨 = **今天的行為**（公式）。另外兩條路是 owner 一格下拉就切得過去的。
    model: DEFAULT_PROPORTIONALITY_MODEL,
    expectedHits: DEFAULT_EXPECTED_HITS,
    aimRiskMult: DEFAULT_AIM_RISK_MULT,
    minDamageTier: shippedMinDamageTier(),
    // ⭐ GH#616 —— 上限。⛔ 我挑的（owner 常設：「沒做完以前別問我了自己判斷
    //    但是留後台開關可以簡易 rollback」）；理由與量到的分佈在 proportionality.ts。
    maxTiersAboveMin: DEFAULT_MAX_TIERS_ABOVE_MIN,
  },
} as const;

export const zConfigAuthoringRulesDoc = z
  .object({
    id: z.literal(AUTHORING_RULES_DOC_ID),
    schema: z.literal("config.authoring-rules@1"),
    note: z.string().optional(),
    /**
     * 單體技能的冷卻區間。出貨 5–30 秒。
     *
     * ⚠️ 超出只**警告**。這一格影響的是外部編輯器的黃字提示與後台的稽核清單,
     * ⛔ 不影響任何技能真的能不能上線。
     */
    singleTargetCooldown: zCooldownBand(
      "@zh 單體技能冷卻下限\n" +
        "@note 出貨 **{{出貨值}} 秒**。低於它的單體技能等於「一直按」,而那會讓其他技能的存在感消失。⚠️ 只警告不擋。",
      "@zh 單體技能冷卻上限\n" +
        "@note 出貨 **{{出貨值}} 秒**。高於它玩家一場只放得出幾次,而單體技能的定位是常用手段。",
    ),
    /** 範圍技能的冷卻區間。出貨 30–120 秒 —— 它比單體長,因為它一次打很多人。 */
    aoeCooldown: zCooldownBand(
      "@zh 範圍技能冷卻下限\n" +
        "@note 出貨 **{{出貨值}} 秒** —— 比單體技能長,因為它一次打到很多人;冷卻太短會讓範圍技變成常態手段,而單體技能失去存在的理由。",
      "@zh 範圍技能冷卻上限\n" +
        "@note 出貨 **{{出貨值}} 秒**。高於它的範圍技一場放不到兩次,那個定位應該用「變身/長持續」那一條界,而不是把範圍技拉長。",
    ),
    /**
     * 變身／長持續技能的冷卻**下限**。出貨 120 秒。
     *
     * ⭐ 只有下限沒有上限是刻意的：這一類技能的價值來自「一場只有幾次」,
     * 冷卻太短會讓變身變成常態,而那等於直接改了那位英雄的基礎形態。
     */
    transformCooldownMin: z.number().min(0).max(600).describe(
      "@zh 變身／長持續冷卻下限\n" +
      "@note 出貨 **{{出貨值}} 秒**。⭐ 只有下限沒有上限是刻意的:這一類技能的價值來自「一場只有幾次」,冷卻太短會讓變身變成常態 —— 那等於直接改了那位英雄的基礎形態。",
    ),
    /**
     * ⭐ GH#465 —— **相稱性**：成本軸反過來對傷害軸的要求。理由與「為什麼十四格
     * 是空的」寫在 {@link zProportionality} 的檔頭。
     */
    proportionality: zProportionality,
  })
  .strict();

export type ConfigAuthoringRulesDoc = z.infer<typeof zConfigAuthoringRulesDoc>;
