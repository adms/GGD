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
import { DEFAULT_STAT_CAPS } from "../sim/statCaps";
import { Stat } from "../sim/stats/statTypes";


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
  /** 每一條規則現在的實際值都從這裡算出來,所以它跟著後台走。 */
  readonly derivedFrom: readonly string[];
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
      max: aoe.radius["超大"],
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
  ];

  return {
    schema: AUTHORING_RULES_SCHEMA,
    hard,
    principle,
    manaIsDerived: true,
    derivedFrom: [
      "config.cast-time@1",
      "config.cooldown-rules@1",
      "config.aoe-tiers@1",
      "config.stat-caps@1",
      "config.authoring-rules@1",
    ],
  };
}
