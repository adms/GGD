/**
 * 屬性上限 (stat caps) — the pure logic behind 後台 → 屬性上限 (GH#286).
 *
 * owner, 2026-07-28:「一般上限是 4.0,搭配特殊條件如技能、道具...等效果,
 * 可以解鎖最多到 10.0。這兩個參數也可以放到後台設定」.
 *
 * ⚠️ 這一頁和它的兩個鄰居很像,而三者的語意**完全不同**:
 *   · 戰鬥系統 (combat-env) —— 每格是**倍率**(1.0 = 不變)
 *   · 基礎加成 (base-bonus) —— 每格是**加數**(0 = 沒有贈禮)
 *   · 屬性上限 (這一頁)     —— 每格是一對**天花板**
 * 所以是三份文件、三個頁面,而且這一頁每一列都寫著「一般 / 解鎖」兩個字。
 *
 * 寫入走 durable content overlay(和 基礎加成 同一條路),因為那是唯一撐得過
 * `docker compose build` 的可寫表面。
 *
 * ⚠️ 存檔一定寫**整張表**(`capsDocFor(rowsToCaps(rows))`),不是只寫被改的那一列。
 * 只寫一列的話,文件裡就會出現「有 as 沒有 ms」這種狀態,而 `capFor` 對缺鍵的
 * 屬性會退回 `STAT_CLAMPS` 且 `unlocked === base` —— 那條屬性從此不能被解鎖,
 * 而且畫面上完全看不出來。
 */
import { STAT_CLAMPS, Stat } from "@ggd/shared/sim/stats/statTypes";
import { STAT_LABEL_ZH } from "@ggd/shared/sim/baseBonus";
import {
  CAPPABLE_STATS,
  DEFAULT_STAT_CAPS,
  DERIVED_CAP_PROVENANCE,
  capCeiling,
  capFor,
  capSpaceFor,
  normalizeStatCaps,
  type CapSpace,
  type StatCap,
  type StatCapTable,
  statCapBounds,
} from "@ggd/shared/sim/statCaps";
import { COMBAT_ENV_DEFAULTS, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";

/**
 * 每一列在說「這個天花板會夾到**什麼**」,不是重複一次欄位名。
 *
 * ⚠️ 這一份存在的理由:`STAT_LABEL_ZH` 給的是屬性的名字(「法術強度」),而操作者
 * 在這一頁要決定的是「把它夾住會影響誰」。只寫名字的欄位在 CLAUDE.md 裡有名字
 * ——「說明文字要寫**它影響什麼**,不是複述欄位名」。
 *
 * EXHAUSTIVE `Record<Stat, string>`:新增一條屬性會在這裡變成型別錯誤,而不是
 * 悄悄畫出一列沒有說明的輸入框。
 */
export const CAP_EFFECT_ZH: Readonly<Record<Stat, string>> = Object.freeze({
  // ⭐ G2（GH#354）—— 輸出倍率三兄弟。⚠️ 語意是**加成**（0 = ×1，0.25 = ×1.25），
  // ⛔ 不是倍率本身：一個沒填的英雄拿到 0，而 ×0 是全部歸零。
  [Stat.OutputDamagePct]:
    "「我造成的傷害整體 ×N」的天花板。⚠️ 它坐在**封包層**不是屬性層 —— 一支「造成 300 點固定傷害」的技能對攻擊力免疫，但吃得到這一格。[EX解放] 的 7 件靠它。",
  [Stat.OutputHealingPct]: "「我給出的治療整體 ×N」的天花板。⚠️ 是**產出側** —— 重創（我被治療打折）是另一格，兩者方向相反且各自獨立。",
  [Stat.OutputShieldPct]: "「我給出的護盾整體 ×N」的天花板。⚠️ 放大的是**給的人**的能力，⛔ 不是收的人的。",
  [Stat.MaxHitPctMaxHp]:
    "「單次受到的傷害最多只能是我最大生命的幾成」。⚠️ **0 = 沒有上限**（⛔ 不是「上限 0%」，那會讓沒填的人免疫一切）。掛在**承受者**身上。",
  [Stat.UnavoidablePct]:
    "「我打出去的攻擊有多難被迴避」，1 = 完全無法被迴避。⚠️ 它只折抵**迴避**，格擋／護盾／免疫一概照舊。",
  [Stat.CooldownDrainRate]:
    "「技能冷卻轉得多快」的加成（0.5 = ×1.5）。⛔ 與冷卻縮減不同：這一條對**正在轉的**冷卻立刻生效，⚠️ 而且不影響普攻（那是攻速）。",
  [Stat.AttackSpeed]: "每秒普攻次數的天花板 —— 夾住之後攻速裝與敏捷再堆也不會更快",
  [Stat.AbilityPower]:
    "法傷技能的傷害基數天花板 —— 夾住它就同時砍掉「總 AP +100%」那一類倍增道具疊起來的上限(惡夢魔王碎片 + 死之王套裝 = ×3.0)。出貨開到頂,今天不夾任何人",
  [Stat.CooldownReduction]: "技能冷卻能被縮短到什麼程度(1.0 = 零冷卻)",
  [Stat.CritChance]: "暴擊觸發率的天花板(1.0 = 每一刀都暴擊)",
  [Stat.MoveSpeed]: "跑動速度的天花板 —— 夾住會同時影響追擊、風箏與逃離火圈",
  [Stat.Lifesteal]: "普攻回血佔傷害的比例天花板 —— 夾住它就是續戰能力的上限",
  [Stat.Evasion]: "普攻被閃掉的機率天花板(1.0 = 普攻打不到)",
  [Stat.SpellVamp]: "技能傷害轉回血的比率上限(技能吸血)",
  [Stat.MaxHealth]: "生命上限的天花板 —— 夾住之後堆血裝與力量都不再變厚",
  [Stat.MaxMana]: "魔力上限的天花板 —— 夾住之後智慧與魔力裝不再擴池",
  [Stat.HealthRegen]: "每秒自動回血的天花板 —— 夾住它等於限制「打不死」的續戰下限",
  [Stat.ManaRegen]: "每秒自動回魔的天花板 —— 夾住它等於限制連續施法的次數",
  [Stat.AttackDamage]: "普攻傷害基數的天花板 —— 夾住之後攻擊裝與力量都不再變痛",
  [Stat.Armor]: "物理減傷曲線吃到的護甲天花板",
  [Stat.MagicResist]: "魔法減傷曲線吃到的魔抗天花板",
  [Stat.CritDamage]: "暴擊那一下的倍率天花板(1.75 = +75%)",
  [Stat.AttackRange]: "普攻能打多遠的天花板(競技場單一決鬥區半徑 24)",
});

/** The `config` collection doc the console writes through the durable overlay. */
export const CAPS_COLLECTION = "config";
export const CAPS_DOC_ID = "stat-caps";
export const CAPS_SCHEMA = "config.stat-caps@1";

export interface StatCapsDoc {
  id: string;
  schema: string;
  caps: Record<string, StatCap>;
}

/**
 * Pull the `caps` map out of whatever the API returned (overlay doc, shipped
 * doc, or nothing). WRONG SCHEMA yields `{}` rather than being read anyway —
 * an operator who mis-saved a combat-env table here would otherwise see
 * multipliers rendered as ceilings.
 */
export function extractCaps(doc: unknown): Record<string, StatCap> {
  if (!doc || typeof doc !== "object") return {};
  const d = doc as { schema?: unknown; caps?: unknown };
  if (d.schema !== CAPS_SCHEMA) return {};
  if (!d.caps || typeof d.caps !== "object") return {};
  const out: Record<string, StatCap> = {};
  for (const [k, v] of Object.entries(d.caps as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const { base, unlocked } = v as { base?: unknown; unlocked?: unknown };
    if (typeof base !== "number" || !Number.isFinite(base)) continue;
    if (typeof unlocked !== "number" || !Number.isFinite(unlocked)) continue;
    out[k] = { base, unlocked };
  }
  return out;
}

export interface CapRow {
  stat: Stat;
  label: string;
  /** 這個天花板夾到什麼(見 `CAP_EFFECT_ZH`) */
  effect: string;
  /** 操作者設過的值,沒碰過就是 null */
  operator: StatCap | null;
  /** 出貨預設(表裡沒有的屬性 = STAT_CLAMPS 上界,base === unlocked) */
  shipped: StatCap;
  /** 現在真的生效的 */
  effective: StatCap;
  /** 這條屬性的硬下限(顯示用,這一頁不編輯它) */
  floor: number | null;
  /** 這一列兩個輸入框的合法區間 `[min, max]`,**兩端都有** */
  bounds: readonly [number, number];
  /**
   * ⭐ 這一格填的是**哪個空間**的數字（2026-08-20）。
   *
   * ⚠️ 這一頁在此之前對操作者說了一句沒有明說的謊：那 7 條推導出來的天花板寫的是
   * **基礎空間**的數字，而引擎夾的是**乘過 `combat-env` 之後**的最終值 ——
   * 所以「生命上限 561720」在場上其實是 **2,246,880**（×4.0）。
   * 兩個數字都對，但畫面上只印一個而且沒說是哪一個。
   * ⇒ `space` + `spaceNote` 把它變成畫面上看得到的一句話，⛔ 不是一段註解。
   */
  space: CapSpace;
  /** 上面那件事的人話版本；`final` 的那幾列是空字串（沒有第二個數字要解釋）。 */
  spaceNote: string;
}

/**
 * 這一列的「基礎 ×N = 最終」那句話。⛔ 從 `capSpaceFor` + env 鏈**推導**，
 * ⛔ 不是逐條手寫 —— 手寫的那一份會在 owner 下一次動 `combat-env` 時變成謊話。
 */
export function capSpaceNote(stat: Stat, cap: StatCap, env: CombatEnvMultipliers): string {
  if (capSpaceFor(stat) === "final") return "";
  const shownFinal = capCeiling({ [stat]: cap }, stat, 0, env);
  const k = cap.base === 0 ? 1 : shownFinal / cap.base;
  return (
    `⚠️ 這一格是**基礎值**（⛔ 不含戰鬥系統倍率）。場上實際夾在 **${Number(shownFinal.toFixed(2))}**` +
    `（×${Number(k.toFixed(4))}，戰鬥系統那一頁調它就跟著動）。` +
    `⭐ 出貨值是「母體在 LV${DERIVED_CAP_PROVENANCE.anchorLevel} 的中位 ×${DERIVED_CAP_PROVENANCE.multiple}」` +
    `推導的（${DERIVED_CAP_PROVENANCE.population} 張卡），⛔ 不是手填的 —— 見 docs/屬性上限推導.md。`
  );
}

/**
 * 一列填得對不對。回 `null` = 沒問題,否則是要顯示給操作者看的那句話。
 *
 * ⚠️ 它是純函式而且住在這裡(不是 `StatCapsPage.tsx`),因為這是**規則**不是畫面:
 * 規則寫在畫面裡就沒有人測得到,而這一頁在 2026-08-01 之前只檢查
 * 「unlocked ≥ base」—— 兩端的界一個都沒有,也就是 CLAUDE.md 2026-07-29 點名的
 * 那個缺陷(50 打成 500 過表單,到下游才被拒或被靜默夾掉)。
 */
export function capRowIssue(stat: Stat, base: string, unlocked: string): string | null {
  const [lo, hi] = statCapBounds(stat);
  for (const [text, name] of [
    [base, "一般上限"],
    [unlocked, "解鎖上限"],
  ] as const) {
    if (text.trim() === "") return `${name}不能空白`;
    const v = Number(text);
    if (!Number.isFinite(v)) return `${name}不是一個數字`;
    // 下界不是 0 —— 比 STAT_CLAMPS 的地板還低的天花板會讓**地板無條件獲勝**,
    // 那一格從此完全沒有作用而且畫面上看不出來。見 sim/statCaps.ts。
    if (v < lo) return `${name} ${v} 低於這條屬性的地板 ${lo} —— 填下去等於這一格失效`;
    if (v > hi) return `${name} ${v} 超過上界 ${hi}(打錯一個零的保險絲)`;
  }
  if (Number(unlocked) < Number(base)) return "解鎖上限不可小於一般上限";
  return null;
}

/**
 * One row per CAPPABLE stat.
 *
 * ⚠️ fallback 規則必須和 sim 一致 (`statCapsFromDoc`):
 *   · 整份文件不存在(`caps === null`) → 每一列顯示**出貨預設**(攻速 4/10)
 *   · 文件存在但沒有這個 key         → 這一列是 `STAT_CLAMPS` 上界且**不可解鎖**
 * 兩者差的是「一支技能能不能把攻速推到 10」,而畫面上兩種狀態長得一模一樣 ——
 * 所以差別寫在這裡一次,不散在畫面上。
 */
export function capRows(
  caps: Record<string, StatCap> | null,
  /**
   * 操作者現在生效的戰鬥系統表。⚠️ 缺 = 程式預設（每個 ×factor 都是 1.0），
   * 那會讓「基礎 → 最終」那句話印出 ×1 —— fail-safe（少說一句話），
   * ⛔ 不是猜一個倍率。
   */
  env: CombatEnvMultipliers = COMBAT_ENV_DEFAULTS,
): CapRow[] {
  const table: StatCapTable | null = caps === null ? null : normalizeStatCaps(caps);
  return CAPPABLE_STATS.map((stat) => {
    const clamp = STAT_CLAMPS[stat];
    const raw = caps?.[stat];
    const operator =
      raw &&
      typeof raw.base === "number" &&
      Number.isFinite(raw.base) &&
      typeof raw.unlocked === "number" &&
      Number.isFinite(raw.unlocked)
        ? { base: raw.base, unlocked: raw.unlocked }
        : null;
    const effective = capFor(table ?? DEFAULT_STAT_CAPS, stat);
    return {
      stat,
      label: STAT_LABEL_ZH[stat],
      effect: CAP_EFFECT_ZH[stat],
      operator,
      shipped: capFor(DEFAULT_STAT_CAPS, stat),
      effective,
      floor: clamp ? clamp[0] : null,
      bounds: statCapBounds(stat),
      space: capSpaceFor(stat),
      spaceNote: capSpaceNote(stat, effective, env),
    };
  });
}

/** Set one stat's pair. `unlocked < base` is stored as-is; the sim reads it as base. */
export function setCap(
  caps: Record<string, StatCap>,
  stat: Stat,
  cap: StatCap,
): Record<string, StatCap> {
  return { ...caps, [stat]: cap };
}

/**
 * 把畫面上**每一列**折成要 PUT 的表。這是「只存一列會悄悄關掉其他屬性的解鎖」的
 * 那條防線 —— 頁面永遠送整張表,所以文件裡不會出現半套狀態。
 */
export function rowsToCaps(rows: readonly CapRow[]): Record<string, StatCap> {
  const out: Record<string, StatCap> = {};
  for (const r of rows) {
    // 無限大的天花板(生命上限那種沒有 STAT_CLAMPS 的屬性)寫進 JSON 會變成
    // `null`,再讀回來就不是有限數 —— 那一列本來就沒有上限可設,跳過。
    if (!Number.isFinite(r.effective.base) || !Number.isFinite(r.effective.unlocked)) continue;
    out[r.stat] = { base: r.effective.base, unlocked: r.effective.unlocked };
  }
  return out;
}

/** Human summary for the page header. 只列出真的能解鎖的(unlocked > base)。 */
export function capsSummary(rows: readonly CapRow[]): string {
  const unlockable = rows.filter(
    (r) => Number.isFinite(r.effective.unlocked) && r.effective.unlocked > r.effective.base,
  );
  if (unlockable.length === 0) return "目前沒有任何屬性可以被解鎖";
  return unlockable
    .map((r) => `${r.label} ${r.effective.base} → 解鎖 ${r.effective.unlocked}`)
    .join(" · ");
}

/** The doc body to PUT. Always the FULL table the page is showing. */
export function capsDocFor(caps: Record<string, StatCap>): StatCapsDoc {
  return { id: CAPS_DOC_ID, schema: CAPS_SCHEMA, caps };
}
