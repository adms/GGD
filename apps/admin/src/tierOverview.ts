/**
 * 🪜 **五級距總覽** —— 四軸十五格 + 五格 + 五格 + 五格，一頁看得到，
 * 而且每一格都印 **卡面值 → 實際值**。
 *
 * owner 2026-08-21：
 * > 「**後台設定及說明**⋯都要一起更新喔（**全部都是推導動態即時產生**）」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 這一頁**一個數字都不是手打的**，而那不是潔癖
 *
 * 五級距在 2026-08-19～21 之間被重錨了**三次**（Lv18 → LV30/50/99 → 剝掉魔抗），
 * 而每一次重錨都讓「上一份手抄的說明」在**全綠**的情況下變成謊話 ——
 * `configForms.ts` 的 `DAMAGE_TIER_WHY` 自己的檔頭就記著這件事發生過一次
 * （「這一段在 2026-08-20 之前是手抄的（700 / 1,150 / 2,400 / 13,927 / 83%⋯），
 * 而錨點換了之後它整段變成謊話」）。
 *
 * ⇒ 這個檔只做一件事：**把四份級距文件 × 一份 combat-env 攤成一張表**。
 * 卡面值來自現在生效的文件（線上覆蓋層 ?? 出貨 JSON ?? `DEFAULT_*`），
 * 係數來自現在生效的 combat-env，實際值是**當場乘出來的**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 為什麼「卡面 → 實際」必須並排，⛔ 不是各自一頁
 *
 * 四軸裡有**三軸**的卡面值不是玩家碰到的值：
 *
 *   | 軸 | 卡面 | 乘誰 | 出貨係數的意思 |
 *   |---|---|---|---|
 *   | 冷卻 | owner 給的秒數 | `combatEnv.cooldown` | 卡面 6 秒 → 實際 1.2 秒 |
 *   | 施法距離 | 決鬥區半徑的分數 | `combatEnv.abilityRange` | 「大」畫在地上比卡面短 |
 *   | AoE 半徑 | 同上 | `combatEnv.abilityRange` | 同上 |
 *   | 傷害 | 反算出來的錨 | `combatEnv.damageDealt` | 出貨中性 |
 *
 * owner 2026-08-19 對冷卻表明說「**不計入系統倍率及減少 CD 等效果**」——
 * ⚠️ 那句話讓卡面表**正確**，同時讓它**讀起來像謊話**：後台上寫 60 秒，
 * 遊戲裡等 12 秒。⇒ 兩欄並排是唯一能同時對這兩件事誠實的畫法。
 *
 * ⚠️ 冷卻那一軸**乘完還要夾一次**（`cooldown-rules.minSeconds`）。少了這一步，
 * 「係數調到 0.01」會在畫面上算出 0.06 秒，而引擎給的是地板值 ——
 * 那正是失敗形態②（算出來了但跟出貨的那條路不是同一條）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 這裡**沒有**位移那一軸，那是一個決定
 *
 * `displacement-tiers` 是同一條梯子的第三個視窗，但它的兩張表（travel / push）
 * 各自帶速度與安全係數，而且**不吃 `abilityRange`** —— 硬塞進這張表會讓
 * 「卡面 → 實際」那一欄對它變成一個恆等式，也就是一欄**看起來有算、其實沒算**的數字。
 * ⇒ 它留在自己那一頁（後台「位移級距」），這一頁的頁尾指過去。
 *
 * 邏輯全部在這裡（純函式、node 可測）；`ui/TierOverviewPage.tsx` 只負責畫。
 */
import {
  DEFAULT_AOE_TIERS,
  AOE_TIER_RADIUS_MAX,
  AOE_TIER_RADIUS_MIN,
  aoeTiersFromDoc,
} from "@ggd/shared/content/aoeTiers";
import {
  DEFAULT_RANGE_TIERS,
  RANGE_TIER_MAX,
  RANGE_TIER_MIN,
  rangeTiersFromDoc,
} from "@ggd/shared/content/rangeTiers";
import {
  COOLDOWN_SHAPES,
  COOLDOWN_TIER_MAX,
  COOLDOWN_TIER_MIN,
  DEFAULT_COOLDOWN_TIERS,
  cooldownTiersFromDoc,
  type CooldownShape,
} from "@ggd/shared/content/cooldownTiers";
import {
  DAMAGE_TIER_MAX,
  DAMAGE_TIER_MIN,
  DEFAULT_DAMAGE_TIERS,
  damageTiersFromDoc,
} from "@ggd/shared/content/damageTiers";
import { SKILL_TIER_NAMES, type SkillTierName } from "@ggd/shared/content/skillTiers";
import {
  DEFAULT_COOLDOWN_RULES,
  applyCooldownFloor,
  cooldownRulesFromDoc,
} from "@ggd/shared/sim/cooldownRules";
import type { CombatEnvKey } from "@ggd/shared/sim/combatEnv";

export { SKILL_TIER_NAMES };
export type { SkillTierName };

/** 這一頁真的會去讀的 config 文件 id —— ⛔ 頁面不另外打一份清單。 */
export const TIER_OVERVIEW_DOC_IDS = Object.freeze([
  "cooldown-tiers",
  "damage-tiers",
  "range-tiers",
  "aoe-tiers",
  "cooldown-rules",
  "combat-env",
] as const);
export type TierOverviewDocId = (typeof TIER_OVERVIEW_DOC_IDS)[number];

/** 一格值是從哪裡來的 —— ⛔ 畫面上必須說出來，否則操作者不知道他看的是不是線上生效的。 */
export type TierSource = "overlay" | "shipped" | "default";

export const SOURCE_ZH: Readonly<Record<TierSource, string>> = Object.freeze({
  overlay: "線上覆蓋層（data/）",
  shipped: "出貨 JSON（content/config/）",
  default: "程式內建預設（讀不到文件）",
});

/** 四份級距文件 + 兩份會影響「實際值」的文件，全部是**原始 JSON**（可能是 null）。 */
export interface TierOverviewInput {
  readonly docs: Readonly<Partial<Record<TierOverviewDocId, unknown>>>;
  readonly source: Readonly<Partial<Record<TierOverviewDocId, TierSource>>>;
  /**
   * 現在生效的 combat-env 倍率表。null = 完全讀不到 ——
   * ⛔ 這時候「實際值」那一欄要是**空的**，⛔ 不是用 1.0 假裝中性
   * （那會讓一個 0.2 的世界看起來像 1.0 的世界，而且完全看不出來）。
   */
  readonly env: Readonly<Record<string, number>> | null;
}

/** 一軸（＝表上的一列）。 */
export interface TierAxis {
  /** 穩定 key，畫面與測試共用。 */
  readonly key: string;
  /** 表上那一欄的中文名。 */
  readonly zh: string;
  /** 卡面值的單位。 */
  readonly unit: string;
  /** **它影響什麼** —— ⛔ 不是複述欄位名（第一守則）。 */
  readonly affects: string;
  /** 這一軸的級距開關現在是開是關。關掉 = 整條規則不生效，畫面上要看得見。 */
  readonly enabled: boolean;
  /** 關掉之後會發生什麼（那句話對每一軸都不一樣）。 */
  readonly disabledMeans: string;
  /** 這一軸的卡面值，五格。 */
  readonly card: Readonly<Record<SkillTierName, number>>;
  /** 單格的上下界 —— ⭐ 從出貨 Zod 的同一組常數來，⛔ 後台不另外挑一個。 */
  readonly min: number;
  readonly max: number;
  /** 乘進「實際值」的 combat-env 係數；null = 這一軸不吃任何係數。 */
  readonly envKey: CombatEnvKey | null;
  /** 那個係數在「戰鬥系統」頁上的中文名。 */
  readonly envZh: string;
  /**
   * 乘完之後還會被誰夾一次（秒數地板）；null = 沒有。
   *
   * ⭐ 它是一支**函式**而不是一個數字，而且指向引擎自己的 `applyCooldownFloor`
   * —— 後台⛔ 不可以自己再寫一次 `Math.max`。兩份 `Math.max` 就是
   * 「有一半的路徑忘記套用」的標準劇本（那句話就寫在 `cooldownRules.ts` 上）。
   */
  readonly clamp: ((seconds: number) => number) | null;
  /** 那個地板現在是幾秒（只給畫面印，⛔ 不參與計算）。 */
  readonly floor: number | null;
  readonly floorZh: string | null;
  /** 去哪一頁改它。 */
  readonly page: string;
  readonly pageZh: string;
  /** 這一軸的值是從哪一份文件讀到的。 */
  readonly docId: TierOverviewDocId;
  readonly source: TierSource;
}

/** 表上一格。 */
export interface TierCell {
  readonly tier: SkillTierName;
  /** 卡面值（後台填的那個數字）。 */
  readonly card: number;
  /** 實際值 —— null ＝ 讀不到 combat-env，⛔ 不是 0、⛔ 不是等於卡面。 */
  readonly live: number | null;
  /** 這一格有沒有被秒數地板夾住（夾住 = 卡面再往下調也不會更短）。 */
  readonly floored: boolean;
}

/**
 * 一軸 × 一格的實際值。
 *
 * ⭐ 這支函式是這一頁**唯一**知道「卡面怎麼變成實際」的地方 ——
 * 頁面 ⛔ 不可以自己再乘一次（兩個住處就是兩個會 drift 的答案）。
 */
export function liveValueOf(axis: TierAxis, card: number, env: TierOverviewInput["env"]): number | null {
  if (axis.envKey === null) return card;
  if (!env) return null;
  const mult = env[axis.envKey];
  if (typeof mult !== "number" || !Number.isFinite(mult)) return null;
  const scaled = card * mult;
  return axis.clamp === null ? scaled : axis.clamp(scaled);
}

/** 一軸的五格。 */
export function cellsOf(axis: TierAxis, env: TierOverviewInput["env"]): TierCell[] {
  return SKILL_TIER_NAMES.map((tier) => {
    const card = axis.card[tier];
    const live = liveValueOf(axis, card, env);
    return {
      tier,
      card,
      live,
      floored: axis.floor !== null && live !== null && live <= axis.floor,
    };
  });
}

/** 冷卻三張表各自的一句「它影響什麼」。⭐ 三個字是 owner 給的，⛔ 不是我分的類。 */
const SHAPE_AFFECTS: Readonly<Record<CooldownShape, string>> = Object.freeze({
  單體: "只打一個目標的技能要等多久才能再按一次。⭐ 這一列的「極小」是整套四軸的錨 —— 傷害五級距的極小是從它反算出來的（owner 的「20 次以內一定要能殺死對方」）。",
  範圍: "會打到一片的技能（技能帶 `radius` / `radiusTier`）要等多久。⚠️ 沒填形狀時是**自動判斷**的，關掉自動判斷會讓範圍大絕靜默拿到單體那張便宜的表。",
  變身: "變身與長持續增益（技能帶 `championForm`）要等多久。⚠️ 它排在「範圍」前面判斷 —— 一支帶 AoE 的變身技仍然算變身。",
});

/**
 * 把「現在生效的四份文件 + combat-env」攤成表。
 *
 * ⛔ 讀不到某一份文件時退回 `DEFAULT_*`（那是出貨值），**而且把 source 標成
 * `default`** —— fail-open 沒錯，**靜默**才是缺陷（CLAUDE.md 第二守則）。
 */
export function buildTierAxes(input: TierOverviewInput): TierAxis[] {
  const cd = cooldownTiersFromDoc(input.docs["cooldown-tiers"]);
  const dmg = damageTiersFromDoc(input.docs["damage-tiers"]);
  const rng = rangeTiersFromDoc(input.docs["range-tiers"]);
  const aoe = aoeTiersFromDoc(input.docs["aoe-tiers"]);
  const rules = cooldownRulesFromDoc(input.docs["cooldown-rules"]);
  const src = (id: TierOverviewDocId): TierSource => input.source[id] ?? "default";

  const cdAxes: TierAxis[] = COOLDOWN_SHAPES.map((shape) => ({
    key: `cooldown.${shape}`,
    zh: `冷卻・${shape}`,
    unit: "秒",
    affects: SHAPE_AFFECTS[shape],
    enabled: cd.enabled,
    disabledMeans:
      "關掉之後 `cooldownTier` 不解析，技能回到自己手寫的 `cooldown` 陣列 —— ⭐ 那就是一鍵回到舊的那一套秒數。⚠️ 關掉**不會**讓技能失去冷卻。",
    card: cd.seconds[shape],
    min: COOLDOWN_TIER_MIN,
    max: COOLDOWN_TIER_MAX,
    envKey: "cooldown",
    envZh: "技能冷卻時間",
    clamp: (s: number) => applyCooldownFloor(rules, s),
    floor: rules.enabled ? rules.minSeconds : null,
    floorZh: rules.enabled ? "冷卻規則・秒數地板" : null,
    page: "cooldownTiers",
    pageZh: "冷卻五級距",
    docId: "cooldown-tiers",
    source: src("cooldown-tiers"),
  }));

  return [
    ...cdAxes,
    {
      key: "damage",
      zh: "傷害",
      unit: "點",
      affects:
        "技能在 `amount` 裡填 `damageTier` 的那一格實際打多少基礎傷害。⚠️ 級距**取代** `flat` 與 `perRank`（⛔ 不是相加）；`ratios` / `attrRatios` 不受影響 —— 那兩條是**成長**，不是基礎值。⭐ 四軸裡唯一的**回報**軸：另外三軸決定代價，這一軸決定拿到什麼。",
      enabled: dmg.enabled,
      disabledMeans:
        "關掉之後 `damageTier` 不解析，技能回到自己手寫的 `flat` / `perRank` —— ⭐ 一鍵回到重錨之前的那一套傷害。⚠️ 關掉**不會**讓技能不再造成傷害。",
      card: dmg.damage,
      min: DAMAGE_TIER_MIN,
      max: DAMAGE_TIER_MAX,
      envKey: "damageDealt",
      envZh: "造成傷害",
      clamp: null,
      floor: null,
      floorZh: null,
      page: "damageTiers",
      pageZh: "傷害五級距",
      docId: "damage-tiers",
      source: src("damage-tiers"),
    },
    {
      key: "range",
      zh: "施法距離",
      unit: "格",
      affects:
        "填 `rangeTier` 的技能**站多遠按得下去**。⚠️ 它與下面的 AoE 半徑是兩件事：這一格是「打得到」，那一格是「炸多大」。同一個級距名在兩軸指向同一個絕對值 —— 一支「大」的技能打得到多遠，炸開就多大。",
      enabled: rng.enabled,
      disabledMeans:
        "關掉之後 `rangeTier` 不解析，技能只剩手寫的 `range`。⚠️ 關掉**不會**讓技能失去射程。",
      card: rng.range,
      min: RANGE_TIER_MIN,
      max: RANGE_TIER_MAX,
      envKey: "abilityRange",
      envZh: "技能範圍",
      clamp: null,
      floor: null,
      floorZh: null,
      page: "rangeTiers",
      pageZh: "施法距離五級距",
      docId: "range-tiers",
      source: src("range-tiers"),
    },
    {
      key: "aoe",
      zh: "AoE 半徑",
      unit: "格",
      affects:
        "填 `radiusTier` 的技能**掃多大一片**。⚠️ AoE 命中是身體碰撞，所以半徑 r 實際會掃到圓心距離 r ＋ 英雄碰撞半徑的人 —— 畫面上的圈比命中範圍小一點是正常的。⭐ 它也是冷卻「形狀」自動判斷的依據：有這一格就走「範圍」那張比較貴的冷卻表。",
      enabled: aoe.enabled,
      disabledMeans:
        "關掉之後 `radiusTier` 不解析，技能只剩手寫的 `radius`。⚠️ 關掉**不會**讓技能失去範圍。",
      card: aoe.radius,
      min: AOE_TIER_RADIUS_MIN,
      max: AOE_TIER_RADIUS_MAX,
      envKey: "abilityRange",
      envZh: "技能範圍",
      clamp: null,
      floor: null,
      floorZh: null,
      page: "aoeTiers",
      pageZh: "AoE 範圍五級距",
      docId: "aoe-tiers",
      source: src("aoe-tiers"),
    },
  ];
}

/** 出貨值那一份（讀不到任何文件時的樣子）—— ⛔ 不抄，指向 shared 的 `DEFAULT_*`。 */
export const SHIPPED_TIER_INPUT: TierOverviewInput = Object.freeze({
  docs: Object.freeze({}),
  source: Object.freeze({}),
  env: null,
});

/**
 * 一句摘要：**這張表現在是哪一份在生效**。
 * ⚠️ 有任何一格退回 `default` 都要說出來 —— 那代表後台正在畫一份
 * 「跟線上不一定一樣」的表，而那比看不到還糟。
 */
export function overviewSourceLine(axes: readonly TierAxis[]): string {
  const counts = new Map<TierSource, number>();
  for (const a of axes) counts.set(a.source, (counts.get(a.source) ?? 0) + 1);
  return [...counts.entries()]
    .map(([s, n]) => `${SOURCE_ZH[s]} ${n} 軸`)
    .join(" · ");
}

/** 級距開關全部打開了嗎 —— 有任何一軸是關的，總覽頂端要掛一條警示。 */
export function disabledAxes(axes: readonly TierAxis[]): TierAxis[] {
  return axes.filter((a) => !a.enabled);
}

/** 顯示用：把一個算出來的數字收成人看得懂的位數（⛔ 不改變它，只是不要印 1.2000000000000002）。 */
export function fmtTier(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const r = Math.round(v * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : r.toFixed(Math.abs(r) < 1 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "");
}

/** 出貨秒數地板（畫面在讀不到 `cooldown-rules` 時要說出它用的是哪一個）。 */
export const SHIPPED_COOLDOWN_FLOOR = DEFAULT_COOLDOWN_RULES.minSeconds;

/** 四份級距文件的出貨值 —— 頁面用它畫「和出貨值差多少」。⛔ 不抄，指向 shared。 */
export const SHIPPED_TIER_TABLES = Object.freeze({
  cooldown: DEFAULT_COOLDOWN_TIERS.seconds,
  damage: DEFAULT_DAMAGE_TIERS.damage,
  range: DEFAULT_RANGE_TIERS.range,
  aoe: DEFAULT_AOE_TIERS.radius,
});
