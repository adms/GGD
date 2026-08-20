/**
 * ⭐【`ggd-authoring-rules@1`】—— 外部編輯器的**創作規則**，推導出來的。
 *
 * `docs/技能編輯器引擎須知 20260811.md` 第九章早就把這件事寫死了：
 *
 *   > 權威是一個**推導出來的端點**，跟 `capabilities` 同一個設計：
 *   >     GET <content-api prefix>/authoring-rules → ggd-authoring-rules@1
 *   > 它**不是手寫的**。它從三個地方推導：出貨的 Zod 界、`content/config/*.json`
 *   > 的後台欄位、以及遊戲主程式開機時跑的那支稽核函式。
 *   > ⛔ **你抄一份到編輯器裡 = 第二個住處 = 它一定會過期**，而且沒有人會發現，
 *   > 直到玩家撞上。這份 md 的舊第九章就是活生生的例子。
 *
 * ⚠️ 那一章寫完之後**沒有人實作它** —— `editor-target-profile.json` 的
 * `authoringRules.pricingEndpoint` 到 2026-08-14 都還是 `null`，出處欄位指著
 * 那份「會過期」的散文。這個檔案就是把那一格填起來。
 *
 * ── ⭐ 兩層，⛔ 不要混為一談（第九章 9.2）────────────────────────────
 *
 * | 層 | 什麼進來 | 系統怎麼反應 |
 * |---|---|---|
 * | **硬界** `hard` | 升階冷卻上升 · MP > 該英雄魔力池 · AoE 半徑 > 決鬥區 · 階數不符 | ⛔ **擋下**。上不了線 |
 * | **原則界** `principle` | 單體冷卻不在 5–30 · 範圍不在 30–120 · 變身/長持續沒到 120 | ⚠️ **警告但放行** |
 *
 * 為什麼分兩層：硬界那些是「上架就是死的」；原則界那些是 owner 的設計偏好，
 * 而他明說是「**原則上**」—— 保留刻意破例的空間。一律擋 = 想破例就得改程式；
 * 一律放 = 真缺陷跟設計選擇混在同一堆訊息裡。
 *
 * ── ⚠️ 每一條規則都要說得出**它從哪裡來** ──────────────────────────
 *
 * 每一條帶一格 `source`。⛔ 沒有這一格，這份端點就會慢慢長出手寫的規則，
 * 然後變成第九章舊版那種「散文合約」—— 而它撒謊的時候沒有任何東西會紅。
 */
import {
  DEFAULT_AOE_TIERS_DOC,
  DEFAULT_AUTHORING_PRINCIPLES,
  DEFAULT_CAST_TIME_DOC,
  DEFAULT_COOLDOWN_RULES_DOC,
  type ConfigAuthoringRulesDoc,
} from "./schema/config";
import { DEFAULT_STAT_CAPS, statCapsFromDoc } from "../sim/statCaps";
// ⭐ GH#465 的三個模型 —— 表在這裡**現推**，⛔ 不是把文件裡那十五格照抄出去。
import { cooldownTiersFromDoc } from "./cooldownTiers";
import { damageTiersFromDoc } from "./damageTiers";
import {
  aimRiskFromDoc,
  expectedHitsFromDoc,
  proportionalityModelFromDoc,
  tableForModel,
} from "./proportionality";
import { SKILL_TIER_NAMES } from "./skillTiers";
// ⭐ GH#445 —— 「傷害相對冷卻偏低」的推導。⛔ 這裡只呼叫，判斷與文案都在那一支裡。
import { ANCHOR_SHAPE, ANCHOR_TIER, lowDamageCells } from "./lowDamageCells";
import { COMBAT_ENV_DEFAULTS } from "../sim/combatEnv";
import {
  BAND_MEANING,
  NORMAL_BANDS,
  NORMALIZED_STAT_KEYS,
  ORIGINS,
  statNormalizationFromDoc,
} from "./statNormalization";
import { Stat } from "../sim/stats/statTypes";
// GH#480 —— 「創建新英雄」的六條警示。⛔ 清單與開關都不在這裡重打一次：
// 規則本身是 `NEW_HERO_WARN_RULES`，開不開是 `config.new-hero-checks@1`。
import { NEW_HERO_WARN_RULES, newHeroChecksFromDoc } from "./newHeroChecks";


export const AUTHORING_RULES_SCHEMA = "ggd-authoring-rules@1";

/** 一條規則的出處。⛔ 沒有它這份端點會慢慢長回手寫散文。 */
export type RuleSource =
  /** 出貨 Zod schema 的 `.min()`／`.max()`。改它要改程式 + 重新部署。 */
  | "zod-bound"
  /** `content/config/*.json` 的後台欄位。owner 改一格,這個端點下一秒就變。 */
  | "admin-config"
  /** 引擎的結構事實（例如決鬥區半徑）。 */
  | "engine-fact";

export interface AuthoringRule {
  /** 穩定的 key,⛔ 不要用章節號（章節會改號,計畫 §Appendix A 的教訓）。 */
  readonly id: string;
  /** 這條規則管什麼欄位（editor 用它決定要驗哪一格）。 */
  readonly field: string;
  readonly min?: number;
  readonly max?: number;
  readonly unit: "sec" | "unit" | "ratio" | "count" | "none";
  /** 給人看的一句話 —— ⚠️ 是「它影響什麼」不是複述欄位名。 */
  readonly note: string;
  readonly source: RuleSource;
  /** `admin-config` 必填:改它的那一份文件。 */
  readonly configDoc?: string;
}

export interface AuthoringRulesManifest {
  readonly schema: typeof AUTHORING_RULES_SCHEMA;
  /**
   * ⛔ **擋下**。違反 = 上不了線（`content:build` 非零 / `content.ok=false` /
   * 部署後置條件失敗）。
   */
  readonly hard: readonly AuthoringRule[];
  /** ⚠️ **警告但放行**。owner 說的是「原則上」,保留刻意破例的空間。 */
  readonly principle: readonly AuthoringRule[];
  /**
   * ⭐ MP 的立場:**作者不要填**（第九章 9.1「⛔ 你不填,它是算出來的」）。
   * 這一格是給編輯器讀的旗標,讓它把那個輸入框**關掉**而不是留著讓人填錯。
   */
  readonly manaIsDerived: true;
  /**
   * ⭐ **數值調校 —— 讓外部編輯器讀 JSON,⛔ 不要讀散文**（owner 2026-08-16：
   * 「應該是**大家都讀同一份 JSON 設定檔** 並且引用到文件裡」）。
   *
   * 🔴 這一格是被**四處說謊**逼出來的。2026-08-16 抓到合約文件的散文裡
   * 攻擊距離五格、移速上限、`manaRegen`、`damageDealt` 全是舊值,而
   * 那份文件開頭就寫著「給外部技能模板編輯器」。對方照著做出來的東西
   * 在引擎裡不是那個量級,⛔ 而且沒有任何一步會報錯。
   *
   * ⇒ 現在**同一批數字有一個共同來源**（`content/config/*.json`）,三個消費端：
   *   · 引擎    → `Configs` 登錄表
   *   · 後台    → 欄位表（drift 測試在守）
   *   · 外部編輯器 → **這一格**（profile 就在 CDN 上,一個 GET）
   *   · 文件    → `pnpm contract:numbers` 產生的標記區塊（引用同一份 JSON）
   */
  readonly statTuning: StatTuning;
  /**
   * ⭐ **創建新英雄時該跳的警示**（GH#480，owner 2026-08-20：「⋯**生成代入與檢查
   * 跳警示**都要記得更新，特別是 **script 程式自動化跟警示**的部分」）。
   *
   * ⚠️ 為什麼這一格屬於**契約**而不是我們內部的事：外部編輯器也在「創建新英雄」，
   * 而它手上沒有這六條判斷。⛔ 少了這一格，同一份草稿在 GGD 後台會亮六條警示、
   * 在對面**一條都不亮** —— 而對面不會收到任何錯誤，它只是不知道有這些檢查。
   *
   * ⭐ `enabled` 跟著 `config.new-hero-checks@1` 走：owner 在後台關掉一條，
   * 這個端點下一秒就變 false，對面也跟著不再警告。⛔ 不是一份寫死的清單。
   *
   * ⚠️ 每一條都是**警告不是擋** —— 只有 `out-of-bounds` 那一條寫進去伺服器真的會
   * 422，而那是 Zod 界（已經逐條列在 {@link AuthoringRulesManifest.hard}）在擋，
   * ⛔ 不是這份清單在擋。
   */
  readonly newHeroChecks: readonly NewHeroCheckRule[];
  /**
   * ⭐【GH#445】**傷害相對冷卻偏低的那幾格**（owner 2026-08-20：「傷害太低要跳出
   * 警告清單給我，**後台跟 codex 編輯器也同步跳警告**」）。
   *
   * ⚠️ 為什麼它是**一格資料**而不是十五條 `principle` 規則：`principle` 那一族
   * 回答「這樣寫合不合規」，而這一格回答「**這一格本身有多不划算**」——
   * 後者是編輯器要**畫**給作者看的（黃字：「你挑的這一格每卡面秒少 60%」），
   * ⛔ 不是一條可以違反的規則。十五格全發成規則就是把一格資料變成十四條廢話
   *（同 `proportionalityRules()` 檔頭那一段）。
   *
   * ⭐ 逐格**現算**：冷卻五級距 × 傷害五級距 × 期望命中人數。owner 在後台動任何
   * 一格，這裡下一秒就變。⛔ 對面抄一份就是第二個住處。
   */
  readonly lowDamageCells: readonly LowDamageCellRule[];
  /** 每一條規則現在的實際值都從這裡算出來,所以它跟著後台走。 */
  readonly derivedFrom: readonly string[];
}

/** 一格「傷害偏低」對外的樣子。⛔ 欄位語意寫在 `content/lowDamageCells.ts`。 */
export interface LowDamageCellRule {
  readonly shape: string;
  readonly cooldownTier: string;
  /** 這一格的卡面冷卻秒數（＝ `config.cooldown-tiers@1` 的那一格） */
  readonly cooldownSec: number;
  /** 照對角線填傷害時的每卡面秒期望輸出 */
  readonly ratePerCardSecond: number;
  /** 錨點（單體・極小）的每卡面秒期望輸出 */
  readonly anchorRate: number;
  /** 相對錨點差幾 %（負數 = 偏低）。⚠️ 已四捨五入 —— 它是給人看的。 */
  readonly deficitPct: number;
  /** 作者「照級距名填」會拿到的傷害級距 */
  readonly diagonalDamageTier: string;
  /** 要追平錨點得跳到哪一個傷害級距 */
  readonly requiredDamageTier: string;
  /** 給人看的一句話（⛔ 對面不要自己組，兩邊組出來的話一定會分岔） */
  readonly note: string;
}

/** 一條「創建新英雄」警示對外的樣子。⛔ 名稱與說明從 `NEW_HERO_WARN_RULES` 抄，不重寫。 */
export interface NewHeroCheckRule {
  readonly rule: string;
  readonly zh: string;
  readonly note: string;
  /** 這一條現在開著嗎（`config.new-hero-checks@1` 的一格開關）。 */
  readonly enabled: boolean;
}

export interface StatTuning {
  /**
   * ⭐ 五級距的名字與**語意**（owner 2026-08-15）。順序就是由小到大。
   * ⚠️ 語意不是裝飾 —— 「極大 = 特化」是說它應該**少數**且有明顯代價，
   * ⛔ 不是「這一格比較強」。
   */
  readonly bandNames: readonly { readonly band: string; readonly meaning: string }[];
  /** 十種出身的名字。⛔ 這是完整清單，不是範例。 */
  readonly origins: readonly string[];
  /**
   * 🔴 **出身 × 屬性 → 級距**（owner 2026-08-16：「英雄 出身 五級距
   * **互相對應**的部分也是」）。這是三者對應的中間那一層。
   */
  readonly bandByOriginAndStat: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * 🔴 **級距 → 實際數值**。與上一格相乘就是一位英雄的每一項數值。
   * ⚠️ 這些是**基準等級的最終總值**（見 {@link referenceLevel}），⛔ 不是初始值。
   */
  readonly bandValues: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /**
   * 分成兩把尺的那幾項（今天只有 `range`）——查得到就**優先於** {@link bandValues}。
   * 走哪一把由 {@link rangeByOrigin} 的 `scale` 決定。
   */
  readonly bandValuesByScale: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>>;
  /** `bandValues` 的數字是**這一級**的最終總值。出貨 99。 */
  readonly referenceLevel: number;
  /** 硬上限。`unlocked` > `base` 的那幾項要靠 `capRaise` 才碰得到。 */
  readonly caps: Readonly<Record<string, { readonly base: number; readonly unlocked: number }>>;
  /** 每一場都會套用的全域倍率 —— ⚠️ 你寫的每個數字最後都被它乘一次。 */
  readonly envMultipliers: Readonly<Record<string, number>>;
  /**
   * ⛔ **這幾項填在英雄卡上沒有用** —— 註冊時 `resolveChampionStats()` 會依
   * 該英雄的**出身**改寫它們。編輯器應該把這幾格設成唯讀並指向出身。
   */
  readonly normalizedStats: readonly string[];
  /**
   * 出身 → 普攻距離的完整換算（⭐ 這就是「同一份 JSON」最尖銳的一格）。
   *
   * ⚠️ `scale` 由**出身**決定,⛔ 不是英雄卡的 `attackType` ——
   * 出貨資料裡有 10 位兩者刻意相反。
   */
  readonly rangeByOrigin: readonly {
    readonly origin: string;
    readonly scale: string;
    readonly band: string;
    readonly value: number;
  }[];
  /** 每一格的出處 —— ⭐ 編輯器要顯示「去哪裡改」時印這個。 */
  readonly sources: Readonly<Record<"caps" | "envMultipliers" | "normalization", string>>;
}

/**
 * 一個 config 文件的來源。
 *
 * ⭐ **注入而不是直接讀 `Configs`** —— 這個函式有兩個呼叫端,而它們的來源不同:
 *   · 執行期端點  → `Configs` 登錄表（含後台 override）
 *   · `content:build` → 直接讀 `content/config/*.json`（登錄表是空的）
 * ⛔ 寫死讀 `Configs` 會讓 build 端**安靜地**拿到全部預設值,而那份 profile 會
 *    宣稱它是出貨值 —— 一個沒有人會發現的謊。
 */
export type ConfigReader = (id: string) => unknown;

const pick = <T>(read: ConfigReader, id: string, fallback: T): T =>
  (read(id) as T | undefined) ?? fallback;

/**
 * 現在這一刻的創作規則。
 *
 * ⚠️ **每次呼叫都重算** —— ⛔ 不要 memo:後台改一格之後這個端點必須下一秒就變,
 * 那正是它取代散文的理由。成本是幾個 map 查詢。
 */
/**
 * GH#465 的相稱性 → 一組 `principle` 規則。
 *
 * ⭐ 一個模板 + 一張**推導出來的**表（第零守則⑨），⛔ 不是十五條手寫規則 ——
 * 表本身也不是手填的資料了：`content/proportionality.ts` 的
 * `deriveMinDamageTier()` 從「冷卻級距 × 傷害級距 × owner 的期望命中人數」推出它。
 * ⛔ 只發出**真的構成限制**的那幾格 —— 「最低傷害級距 = 極小」是傷害軸的第一格，
 * 它不排除任何東西，發出去只會讓對方的警告清單多十四條沒有內容的字。
 *
 * `min`/`max` 刻意留空：這一條約束的是**級距名**不是數字，而 `AuthoringRule`
 * 的兩格界是數字。⇒ 用 `field` 指名它管哪一格，語意寫在 `note` 裡。
 */
function proportionalityRules(
  table: Readonly<Record<string, Readonly<Record<string, string>>>>,
): AuthoringRule[] {
  const floor = SKILL_TIER_NAMES[0];
  const out: AuthoringRule[] = [];
  for (const shape of Object.keys(table).sort()) {
    const row = table[shape]!;
    for (const tier of SKILL_TIER_NAMES) {
      const need = row[tier];
      if (typeof need !== "string" || need === floor) continue;
      out.push({
        id: `principle.proportionality.${shape}.${tier}`,
        field: "damageTier",
        unit: "none",
        note:
          `冷卻級距「${tier}」的**${shape}**技能，傷害級距至少要「${need}」。` +
          "⭐ 這一格是**推導**出來的（owner 2026-08-20：「30/6秒=5⋯可能位於 2 個人的" +
          "命中範圍，所以再除 2⋯約等於 **2.5 倍**」）：要求傷害 ＝ 單位輸出率 × 這一格的" +
          "卡面冷卻 ÷ 期望命中人數，⛔ 不是有人手填的。" +
          " —— 付得多、打得少、傷害又低的那些格子沒有人會選，而一個死格比不存在更糟：" +
          "它佔著一個標籤，作者會填它，然後那些技能上線就是弱的。⚠️ 違反只**警告**。",
        source: "admin-config",
        configDoc: "config.authoring-rules@1",
      });
    }
  }
  return out;
}

export function buildAuthoringRules(read: ConfigReader): AuthoringRulesManifest {
  const castTime = pick(read, "cast-time", DEFAULT_CAST_TIME_DOC as never) as typeof DEFAULT_CAST_TIME_DOC;
  const cooldown = pick(read, "cooldown-rules", DEFAULT_COOLDOWN_RULES_DOC as never) as typeof DEFAULT_COOLDOWN_RULES_DOC;
  const aoe = pick(read, "aoe-tiers", DEFAULT_AOE_TIERS_DOC as never) as typeof DEFAULT_AOE_TIERS_DOC;
  // ⚠️ stat-caps 的文件形狀是 `{ caps: { <Stat>: {base, unlocked} } }`;
  //    讀不到就用 sim 的出貨表(兩者由 capUnlockContent.test.ts 釘在一起)。
  const capsDoc = read("stat-caps") as { caps?: Record<string, { base: number }> } | undefined;
  const cdrCap =
    capsDoc?.caps?.[Stat.CooldownReduction]?.base ??
    DEFAULT_STAT_CAPS[Stat.CooldownReduction]?.base ??
    // ⛔ 走到這裡代表出貨表自己缺了那一格 —— 那是 statCaps 的守衛該紅的事,
    //    不是這個端點該猜的。1 = 「沒有天花板」,對編輯器是最保守的答案
    //    (它不會因為讀到一個假的低上限而擋掉合法的技能)。
    1;
  const principles = pick(
    read,
    "authoring-rules",
    DEFAULT_AUTHORING_PRINCIPLES as never,
  ) as ConfigAuthoringRulesDoc;

  const hard: AuthoringRule[] = [
    {
      id: "cast-time.floor",
      field: "castTimeSec",
      min: castTime.floorSec,
      unit: "sec",
      note:
        "吟唱時間的下限。⚠️ 下界是**一個 sim tick**(≈0.034 秒)不是 0 —— " +
        "sim 是 30 Hz,0.01 秒換算成 0 tick ⇒ sim 當它瞬發,而客戶端照樣畫吟唱條。" +
        "兩邊都不報錯,只有玩家看得出來。",
      source: "admin-config",
      configDoc: "config.cast-time@1",
    },
    {
      id: "cast-time.cap",
      field: "castTimeSec",
      max: castTime.capSec,
      unit: "sec",
      note: "吟唱時間的上限。超過這個值的技能在實戰中放不出來(對手早就走開了)。",
      source: "admin-config",
      configDoc: "config.cast-time@1",
    },
    {
      id: "cooldown.floor",
      field: "cooldownSec",
      min: cooldown.minSeconds,
      unit: "sec",
      note:
        "實際冷卻的地板(套用冷卻縮減與全域倍率**之後**才夾)。" +
        "低於它等於每個 tick 都放得出來。",
      source: "admin-config",
      configDoc: "config.cooldown-rules@1",
    },
    {
      id: "aoe.max-radius",
      field: "radius",
      // ⛔ 這裡曾經寫死 `aoe.radius["超大"]`，而註解說的是「**最大的**那一級距」——
      //    「超大」是**第 4 格**，最大的是第 5 格。⇒ 上限一直比它自己宣稱的少一級
      //    （8 而不是 12）。GH#463 的改名讓 TypeScript 指著這一行才被抓到。
      // ⭐ 現在從 `SKILL_TIER_NAMES` 的**最後一個**取，⛔ 不抄字面值：
      //    級距名再改一次（或未來加一格），這一行自動跟上，⛔ 不會再說謊。
      max: aoe.radius[SKILL_TIER_NAMES[SKILL_TIER_NAMES.length - 1]!],
      unit: "unit",
      note:
        "AoE 半徑上限 = 最大的那一級距。⛔ 超過決鬥區半徑的範圍技等於「打全場」," +
        "而畫面上看不出來它比場地還大。",
      source: "admin-config",
      configDoc: "config.aoe-tiers@1",
    },
    {
      id: "stat.cdr-cap",
      field: "cooldownReduction",
      max: cdrCap,
      unit: "ratio",
      note: "冷卻縮減的天花板。它與 `cooldown.floor` 是**兩個旋鈕蓋住同一個值域**的兩端。",
      source: "admin-config",
      configDoc: "config.stat-caps@1",
    },
    {
      id: "levels.ranks",
      field: "levels",
      unit: "count",
      note:
        "Q/W/E 四級、R 三級。⚠️ 階數與陣列長度不符 = 硬界(那一階讀出 undefined)。" +
        "⛔ 編輯器完成的線性取樣由 importer 驗證,**不再插值或裁切**。",
      source: "zod-bound",
    },
    {
      id: "cooldown.monotonic",
      field: "cooldownSec[]",
      unit: "sec",
      note:
        "owner:「原則上附加技能升級冷卻不會增加」⇒ **升階冷卻上升直接擋下**。" +
        "⚠️ 這一條是硬界不是原則界(owner 2026-08-12)。",
      source: "zod-bound",
    },
  ];

  const principle: AuthoringRule[] = [
    {
      id: "principle.single-target-cooldown",
      field: "cooldownSec",
      min: principles.singleTargetCooldown.min,
      max: principles.singleTargetCooldown.max,
      unit: "sec",
      note: "單體技能的冷卻區間。⚠️ 超出只**警告**,owner 說的是「原則上」。",
      source: "admin-config",
      configDoc: "config.authoring-rules@1",
    },
    {
      id: "principle.aoe-cooldown",
      field: "cooldownSec",
      min: principles.aoeCooldown.min,
      max: principles.aoeCooldown.max,
      unit: "sec",
      note: "範圍技能的冷卻區間。",
      source: "admin-config",
      configDoc: "config.authoring-rules@1",
    },
    {
      id: "principle.transform-cooldown",
      field: "cooldownSec",
      min: principles.transformCooldownMin,
      unit: "sec",
      note: "變身／長持續技能的冷卻下限 —— 它們的價值來自「一場只有幾次」。",
      source: "admin-config",
      configDoc: "config.authoring-rules@1",
    },
    // ⭐ GH#465 —— **相稱性**：成本軸反過來對回報軸的要求。
    //    owner 2026-08-19：「的確是太小不合理，要**綜合看傷害是不是極大或至少大的**」。
    //
    // ⛔ 只發出**真的構成限制**的那幾格（最低傷害級距 > 第一格）。十五格全發
    //    等於在對外契約裡塞十四條「傷害至少要極小」的廢話，而編輯器沒有辦法
    //    分辨哪一條是 owner 真的裁決過的 —— 那是把一格資料變成十五格雜訊。
    // ⭐ 三個模型（owner 2026-08-20「fix #465, 3 suggestions?」）在**這裡**生效 ——
    //    ⛔ 不是只把一格字串存進文件。少了這一行，後台那格下拉就是一句
    //    「說了但不會發生」的話（第一·五守則），而每一個零件看起來都對。
    // ⚠️ 兩張級距表讀的是**現在這一刻**的 config，⛔ 不是 DEFAULT_* ——
    //    owner 改了冷卻／傷害級距，相稱性要跟著動，不然它會拿舊表發警告。
    ...(principles.proportionality.enabled
      ? proportionalityRules(
          tableForModel(
            proportionalityModelFromDoc(principles.proportionality.model),
            cooldownTiersFromDoc(read("cooldown-tiers")).seconds,
            damageTiersFromDoc(read("damage-tiers")).damage,
            expectedHitsFromDoc(principles.proportionality.expectedHits),
            aimRiskFromDoc(principles.proportionality.aimRiskMult),
            principles.proportionality.minDamageTier,
          ),
        )
      : []),
  ];

  // ⭐ GH#480 —— 六條警示 × 它們現在的開關。⛔ 讀不到文件就是出貨值（全部 on），
  //    ⛔ 不是「一條都不跳」：對外的預設要往「多說一句」倒，不是往靜默倒。
  const checks = newHeroChecksFromDoc(read("new-hero-checks"));
  const newHeroChecks: NewHeroCheckRule[] = NEW_HERO_WARN_RULES.map((r) => ({
    rule: r.rule,
    zh: r.zh,
    note: r.note,
    enabled: checks.rules[r.rule],
  }));

  // ⭐ GH#445 —— 「傷害太低」的那幾格。⚠️ 三個輸入讀的都是**現在這一刻**的 config
  //    （同上面相稱性那一段的理由）：拿 DEFAULT_* 算會讓端點對後台改過的表說謊。
  const cellSeconds = cooldownTiersFromDoc(read("cooldown-tiers")).seconds;
  const cellDamage = damageTiersFromDoc(read("damage-tiers")).damage;
  const cellHits = expectedHitsFromDoc(principles.proportionality.expectedHits);
  const lowDamage: LowDamageCellRule[] = lowDamageCells(cellSeconds, cellDamage, cellHits).map(
    (c) => ({
      shape: c.shape,
      cooldownTier: c.tier,
      cooldownSec: cellSeconds[c.shape][c.tier],
      ratePerCardSecond: c.ratePerCardSecond,
      anchorRate: c.anchorRate,
      deficitPct: c.deficitPct,
      diagonalDamageTier: c.diagonalDamageTier,
      requiredDamageTier: c.requiredDamageTier,
      note:
        `「${c.shape}・${c.tier}」的期望輸出比錨點（${ANCHOR_SHAPE}・${ANCHOR_TIER}）` +
        `**${c.deficitPct}%**：照級距名填「${c.diagonalDamageTier}」傷害的話，每卡面秒只有 ` +
        `${c.ratePerCardSecond.toFixed(1)}。⇒ 要嘛把傷害拉到「${c.requiredDamageTier}」，` +
        "要嘛把冷卻挪出這一格。⚠️ 只警告不擋。",
    }),
  );

  return {
    schema: AUTHORING_RULES_SCHEMA,
    hard,
    principle,
    manaIsDerived: true,
    statTuning: buildStatTuning(read),
    newHeroChecks,
    lowDamageCells: lowDamage,
    derivedFrom: [
      // GH#445 —— 「傷害偏低的那幾格」與相稱性都讀這兩張表。⛔ 它們在 2026-08-20
      // 之前漏在這張清單外面，而那正是「對外契約說得出自己從哪裡來」的那一格。
      "config.cooldown-tiers@1",
      "config.damage-tiers@1",
      "config.cast-time@1",
      "config.cooldown-rules@1",
      "config.aoe-tiers@1",
      "config.stat-caps@1",
      "config.authoring-rules@1",
      "config.combat-env@1",
      "config.stat-normalization@1",
      // GH#480 —— 六條「創建新英雄」警示的開關。
      "config.new-hero-checks@1",
    ],
  };
}

/**
 * 數值調校的三張表 —— ⛔ 全部從 `content/config/*.json` 讀,一個手打的常數都沒有。
 *
 * ⚠️ 缺席的設定檔一律**退回出貨預設**（`statNormalizationFromDoc` / `statCapsFromDoc`
 * 自己就是逐格 fallback），⛔ 不要回空物件 —— 對方會把「空」讀成「沒有上限」。
 */
function buildStatTuning(read: ConfigReader): StatTuning {
  const caps = statCapsFromDoc(read("stat-caps"));
  const norm = statNormalizationFromDoc(read("stat-normalization"));
  // ⚠️ `combat-env` 沒有 `*FromDoc` 幫手（它的消費端都直接吃 `multipliers`），
  //   所以逐格 fallback 到出貨預設 —— ⛔ 不要回文件裡的原樣物件：
  //   一份少了一半 key 的 override 會讓對方以為那些倍率不存在。
  const raw = (read("combat-env") as { multipliers?: Record<string, unknown> } | undefined)?.multipliers;
  const env: Record<string, number> = { ...COMBAT_ENV_DEFAULTS };
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) env[k] = v;
  }

  const scales = norm.scaleByOrigin.range;
  const ladders = norm.bandsByScale.range;
  const rangeByOrigin: { origin: string; scale: string; band: string; value: number }[] = [];
  for (const origin of ORIGINS) {
    const scale = scales?.[origin];
    const band = norm.byOrigin.range?.[origin];
    const value = scale !== undefined && band !== undefined ? ladders?.[scale]?.[band] : undefined;
    // ⛔ 表不完整就整列不出現 —— 印一個猜的值等於讓對方照錯的量級設計技能
    if (scale === undefined || band === undefined || typeof value !== "number") continue;
    rangeByOrigin.push({ origin, scale, band, value });
  }

  // ⭐ 出身 × 屬性 → 級距。⛔ 逐格從設定讀，缺格就不出現（⛔ 不填「中」當預設 ——
  //   那會讓對方以為那一格被指定過）。
  const bandByOriginAndStat: Record<string, Record<string, string>> = {};
  for (const origin of ORIGINS) {
    const row: Record<string, string> = {};
    for (const stat of NORMALIZED_STAT_KEYS) {
      const band = norm.byOrigin[stat]?.[origin];
      if (band !== undefined) row[stat] = band;
    }
    bandByOriginAndStat[origin] = row;
  }

  return {
    bandNames: NORMAL_BANDS.map((band) => ({ band, meaning: BAND_MEANING[band] })),
    origins: [...ORIGINS],
    bandByOriginAndStat,
    bandValues: Object.fromEntries(
      NORMALIZED_STAT_KEYS.map((k) => [k, { ...norm.bands[k] }]),
    ),
    bandValuesByScale: Object.fromEntries(
      Object.entries(norm.bandsByScale).flatMap(([k, v]) =>
        v === undefined ? [] : [[k, Object.fromEntries(Object.entries(v).map(([s, b]) => [s, { ...b }]))]],
      ),
    ),
    referenceLevel: norm.referenceLevel,
    caps: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { base: v.base, unlocked: v.unlocked }])),
    envMultipliers: { ...env },
    normalizedStats: [...norm.appliesTo],
    rangeByOrigin,
    sources: {
      caps: "config.stat-caps@1",
      envMultipliers: "config.combat-env@1",
      normalization: "config.stat-normalization@1",
    },
  };
}
