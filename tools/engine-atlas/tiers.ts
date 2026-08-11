/**
 * 五級分帶（極小/小/中/大/極大）的**量測**與**提案**。
 *
 * owner 2026-08-11：攻擊距離／攻速／移速／生命／防禦／魔抗／AD／AP
 * 「根據原始分佈，全部統一成五個」。
 *
 * ⛔ 這一支只**量**與**提案**，不改任何內容檔。理由：owner 同一句話裡說
 * 「原則上極大是少數並且有明顯缺陷作為補償機制的英雄設定」——
 * 那是**逐英雄的設計判斷**，不是一條可以自動套用的規則。自動套 119 位
 * 等於我替他做了 119 個決定。所以流程是：量 → 提案 → 他點頭 → 才寫。
 *
 *   npx tsx tools/engine-atlas/tiers.ts
 *
 * ---------------------------------------------------------------------------
 * 這一版修掉了上一版的兩個量測錯誤（兩個都會讓結論翻面）
 * ---------------------------------------------------------------------------
 * ① **上一版只讀 `doc.baseStats`**，也就是 w3x 的空殼。真正的法則是三層相加
 *    （`sim/stats/attributes.ts`）：
 *
 *        stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)
 *
 *    而 `championStatBase` 是**唯一**算這一項的地方（sim / 商店預覽 / 選人面板
 *    / codex 全部讀它）。所以這裡直接呼叫**出貨的那個函式**，不自己重算 ——
 *    自己重算就是失敗形態⑤「被測的不是出貨的那個」。
 *    代價量得到：魔抗的相異值 4 → **73**，AP 1 → **71**（AP 全 0 是把
 *    智慧→AP ×1 整項漏掉的結果）。
 *
 * ② **係數要讀出貨的 `content/config/combat-env.json`，不是程式裡的預設**。
 *    `agiToArmor` 程式預設 0.15、出貨值 **0.3** —— 用預設量防禦會整排偏低一半。
 *
 * ---------------------------------------------------------------------------
 * 為什麼用「自然斷點」而不是「五等分位」
 * ---------------------------------------------------------------------------
 * 上一版切五等分位。攻擊距離有 **77 位並列在 1.6**（119 位的 65%），
 * 等分位的四個切點會全部落在同一個並列值上 → 極小/小/中三帶**是空的**，
 * 而 owner 要的「根據原始分佈」正好是相反的意思。
 * 這裡用 **Jenks 自然斷點**（一維最小類內平方差，DP 精確解、無隨機、可重現）：
 * 界線落在資料自己的縫隙上。等分位切點仍然一起輸出，作為對照。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { championStatBase } from "../../packages/shared/src/sim/stats/attributes";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import {
  DEFAULT_COMBAT_ENV,
  STAT_ENV_CHAIN,
  statEnvFactor,
  type CombatEnvMultipliers,
} from "../../packages/shared/src/sim/combatEnv";
import { STAT_CLAMPS } from "../../packages/shared/src/sim/stats/statTypes";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const bundle = JSON.parse(readFileSync(join(REPO, "content/bundle.json"), "utf8")).collections;
const OUT = join(REPO, "docs/engine-tiers.json");

/** 出貨的 combat-env。⚠️ 不是 DEFAULT_COMBAT_ENV —— 兩者的 agiToArmor 差一倍。 */
const shippedEnvFile = JSON.parse(
  readFileSync(join(REPO, "content/config/combat-env.json"), "utf8"),
) as { multipliers?: Record<string, number> };
const ENV: CombatEnvMultipliers = {
  ...DEFAULT_COMBAT_ENV,
  ...(shippedEnvFile.multipliers ?? {}),
} as CombatEnvMultipliers;
const envDiffs = Object.entries(shippedEnvFile.multipliers ?? {})
  .filter(([k, v]) => (DEFAULT_COMBAT_ENV as Record<string, number>)[k] !== v)
  .map(([k, v]) => ({ key: k, codeDefault: (DEFAULT_COMBAT_ENV as Record<string, number>)[k], shipped: v }));

/** 出貨的基礎加成（贈禮，在所有倍率**之後**才加）。 */
const BASE_BONUS: Record<string, number> =
  JSON.parse(readFileSync(join(REPO, "content/config/base-bonus.json"), "utf8")).bonus ?? {};

/** 出貨的上限表（`config.stat-caps@1`）。真正生效的是它，STAT_CLAMPS 只是沒有它時的預設。 */
const STAT_CAPS: Record<string, { base?: number; unlocked?: number }> =
  JSON.parse(readFileSync(join(REPO, "content/config/stat-caps.json"), "utf8")).caps ?? {};

/** 已下架的英雄（`config.roster@1`）—— 仍在內容裡，但擋在白名單之外，玩家選不到。 */
const RETIRED: string[] =
  JSON.parse(readFileSync(join(REPO, "content/config/roster.json"), "utf8")).retiredChampions ?? [];

const TIERS = ["極小", "小", "中", "大", "極大"] as const;
type Tier = (typeof TIERS)[number];
const round = (v: number, n = 4): number => {
  const f = 10 ** n;
  return Math.round(v * f) / f;
};

// ── Jenks 自然斷點（DP 精確解）──────────────────────────────────────────────
/** 回傳 k−1 個「上界值」：v <= cut[0] 屬第一帶，依此類推。 */
function jenks(values: number[], k: number): number[] {
  const d = [...values].sort((a, b) => a - b);
  const n = d.length;
  if (n <= k) return d.slice(0, k - 1);
  const pre = [0];
  const pre2 = [0];
  for (let i = 0; i < n; i++) {
    pre.push(pre[i]! + d[i]!);
    pre2.push(pre2[i]! + d[i]! * d[i]!);
  }
  /** i..j（含）的類內平方差。 */
  const ssd = (i: number, j: number): number => {
    const cnt = j - i + 1;
    const s = pre[j + 1]! - pre[i]!;
    return pre2[j + 1]! - pre2[i]! - (s * s) / cnt;
  };
  // best[m][j] = 前 j+1 個點分成 m 類的最小總平方差；from[m][j] = 最後一類的起點
  const best: number[][] = Array.from({ length: k + 1 }, () => new Array(n).fill(Infinity));
  const from: number[][] = Array.from({ length: k + 1 }, () => new Array(n).fill(0));
  for (let j = 0; j < n; j++) best[1]![j] = ssd(0, j);
  for (let m = 2; m <= k; m++) {
    for (let j = m - 1; j < n; j++) {
      for (let i = m - 1; i <= j; i++) {
        const c = best[m - 1]![i - 1]! + ssd(i, j);
        if (c < best[m]![j]!) {
          best[m]![j] = c;
          from[m]![j] = i;
        }
      }
    }
  }
  const cuts: number[] = [];
  let j = n - 1;
  for (let m = k; m > 1; m--) {
    const i = from[m]![j]!;
    cuts.unshift(d[i - 1]!); // 前一類的最大值 = 上界
    j = i - 1;
  }
  return cuts;
}

/** 等分位切點 —— 只做對照，說明它為什麼在並列很多時會塌掉。 */
function quintiles(values: number[]): number[] {
  const s = [...values].sort((a, b) => a - b);
  return [0.2, 0.4, 0.6, 0.8].map((p) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0);
}

const tierOf = (v: number, cuts: number[]): Tier => {
  for (let i = 0; i < cuts.length; i++) if (v <= cuts[i]!) return TIERS[i]!;
  return "極大";
};

/** 把一個數字收到「好看的刻度」上：1 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 7.5 × 10^n。 */
const NICE_GRID = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10];
function nice(v: number): number {
  if (v === 0) return 0;
  const sign = v < 0 ? -1 : 1;
  const a = Math.abs(v);
  const mag = 10 ** Math.floor(Math.log10(a));
  const m = a / mag;
  let bestG = NICE_GRID[0]!;
  for (const g of NICE_GRID) if (Math.abs(g - m) < Math.abs(bestG - m)) bestG = g;
  return round(sign * bestG * mag, 4);
}
/**
 * 刻度上**嚴格大於** v 的下一格。
 * ⚠️ 這一支是必要的：上一版用 `nice(prev × 1.25)` 強制遞增，而 1 × 1.25 = 1.25
 * 在刻度上與 1 和 1.5 等距 → 收回 1，跟前一格**撞在一起**。實際輸出過
 * 攻速「極小 1 / 小 1」、移速「大 10 / 極大 10」、AD「大 100 / 極大 100」
 * 三對相同的目標值 —— 五帶其實只有四格。
 */
function niceAbove(v: number): number {
  if (v <= 0) return NICE_GRID[0]!;
  let mag = 10 ** Math.floor(Math.log10(v));
  for (let step = 0; step < 4; step++) {
    for (const g of NICE_GRID) {
      const c = round(g * mag, 4);
      if (c > v) return c;
    }
    mag *= 10;
  }
  return round(v * 2, 4);
}

// ── 英雄（119 份文件，含 26 份變身形態）───────────────────────────────────────
const STAT_KEYS = ["range", "as", "ms", "maxHealth", "armor", "mr", "ad", "ap"] as const;
type StatKey = (typeof STAT_KEYS)[number];
const STAT_ENUM: Record<StatKey, Stat> = {
  range: Stat.AttackRange,
  as: Stat.AttackSpeed,
  ms: Stat.MoveSpeed,
  maxHealth: Stat.MaxHealth,
  armor: Stat.Armor,
  mr: Stat.MagicResist,
  ad: Stat.AttackDamage,
  ap: Stat.AbilityPower,
};
const ZH: Record<StatKey, string> = {
  range: "攻擊距離",
  as: "攻擊速度",
  ms: "移動速度",
  maxHealth: "生命",
  armor: "防禦",
  mr: "魔抗",
  ad: "AD",
  ap: "AP",
};
/** 這一項的 lv10 值有多少來自三圍 —— 決定「能不能只改這一項」。 */
const DRIVEN_BY: Record<StatKey, string> = {
  range: "無（純 baseStats，沒有 growth 也沒有三圍）",
  as: "敏捷（乘法：base × (1 + 0.02·AGI)）",
  ms: "無（純 baseStats）",
  maxHealth: "力量（+23/點）",
  armor: "敏捷（+0.3/點，出貨值）",
  mr: "智慧（+0.6/點）",
  ad: "力量（+1/點）",
  ap: "智慧（+1/點）—— 100% 來自智慧，baseStats.ap 全為 0",
};

interface HeroRow {
  id: string;
  name: string;
  form: "本體" | "變身";
  counterpartId?: string;
  attackType: string;
  primary: string;
  /** 三圍的來源。`w3x` = 從原始地圖抓的真英雄；`authored` = 手寫的。 */
  attrSource: string;
  /** 已下架（`config.roster@1` 的 retiredChampions）—— 玩家現在選不到。 */
  retired: boolean;
  /**
   * 有沒有列入**分帶的分布**。⚠️ 排除的三位不是「不重要」，是**不是被設計出來的英雄**：
   * `sela` / `thorne` 是 `main.tsx` fail-open 用的骨架替身（內容載入失敗時註冊的那兩隻），
   * `godie-zombiex` 是小怪側的喪標麥可。三位都手寫三圍。
   * 留在列表裡（owner 要看 119 列）但不參與界線計算 —— 否則骨架替身會把上界拉走：
   * 實測 `sela` 在攻擊距離／防禦／AD 三項都落在極大，是「無補償」名單的第一名。
   */
  inDistribution: boolean;
  lv1: Record<string, number>;
  lv10: Record<string, number>;
  /** 玩家實際吃到的值：lv10 × combat-env 鏈 ( + 基礎加成 )。 */
  ingame: Record<string, number>;
  tier: Record<string, Tier>;
}

const LEVEL = 10;
const heroes: HeroRow[] = [];
for (const e of bundle.champions?.entries ?? []) {
  const d = e.doc;
  const def = { baseStats: d.baseStats ?? {}, growth: d.growth ?? {}, attributes: d.attributes };
  const lv1: Record<string, number> = {};
  const lv10: Record<string, number> = {};
  const ingame: Record<string, number> = {};
  for (const k of STAT_KEYS) {
    const s = STAT_ENUM[k];
    lv1[k] = round(championStatBase(def as never, s, 1, ENV));
    const v = championStatBase(def as never, s, LEVEL, ENV);
    lv10[k] = round(v);
    let f = 1;
    for (const link of STAT_ENV_CHAIN[s] ?? [])
      f *= statEnvFactor(link, ENV, { attackType: d.attackType });
    ingame[k] = round(v * f + (BASE_BONUS[k] ?? 0));
  }
  heroes.push({
    id: d.id,
    name: d.name,
    form: d.transform?.role === "alternate" ? "變身" : "本體",
    counterpartId: d.transform?.counterpartId,
    attackType: d.attackType,
    primary: d.attributes?.primary ?? "?",
    attrSource: d.attributes?.source ?? "(none)",
    retired: RETIRED.includes(d.id),
    inDistribution: d.attributes?.source === "w3x",
    lv1,
    lv10,
    ingame,
    tier: {} as Record<string, Tier>,
  });
}

// ── 逐項分帶 ────────────────────────────────────────────────────────────────
interface StatReport {
  key: StatKey;
  zh: string;
  drivenBy: string;
  distinct: number;
  min: number;
  max: number;
  /** ⚠️ 相異值 < 5 = 這一項**沒有分布可以切**，要用設計指定。 */
  bandable: boolean;
  bandableNote?: string;
  jenksCuts: number[];
  quintileCuts: number[];
  quintileDegenerate: boolean;
  counts: Record<Tier, number>;
  observedMedian: Record<Tier, number | null>;
  /**
   * 成員 < 5 人的帶 —— 那一格的目標值等於**由一兩位英雄決定**，不是分布給的。
   * 這種格子建議 owner 直接指定，就像他指定攻擊距離那樣。
   */
  thinBands: { tier: Tier; count: number }[];
  target: Record<Tier, number>;
  targetSource: "owner 指定" | "本工具提案（各帶中位數收到刻度）";
  /** 目標值乘完 env 倍率鏈之後撞到 clamp / stat-caps 的格子。空 = 五格都拿得到。 */
  capWarnings: string[];
  /** 改用「吸附到最近的目標值」指派的話，帶會怎麼分、內容要動多少。 */
  nearestTargetAlternative: {
    counts: Record<Tier, number>;
    regraded: number;
    medianAbsPct: number;
    maxAbsPct: number;
    over50pct: number;
  };
  /** 套用目標值之後的變動量。 */
  movement: {
    changed: number;
    unchanged: number;
    medianAbsPct: number;
    maxAbsPct: number;
    over25pct: number;
    over50pct: number;
    biggest: { id: string; name: string; from: number; to: number; pct: number }[];
  };
}

/** owner 2026-08-11 已經指定的一格。其餘七項由本工具提案。 */
const OWNER_TARGETS: Partial<Record<StatKey, Record<Tier, number>>> = {
  range: { 極小: 1.5, 小: 3, 中: 5, 大: 7, 極大: 10 },
};

/** 界線只由**真英雄**長出來；骨架替身與小怪側的手寫三圍不參與。 */
const fitPop = heroes.filter((h) => h.inDistribution);
const reports: StatReport[] = [];
for (const k of STAT_KEYS) {
  const vals = fitPop.map((h) => h.lv10[k]!);
  const distinct = new Set(vals).size;
  const cuts = jenks(vals, TIERS.length);
  const qcuts = quintiles(vals);
  // 帶別**每一列都給**（owner 要看 119 列），但界線是上面那 116 位算出來的。
  for (const h of heroes) h.tier[k] = tierOf(h.lv10[k]!, cuts);

  const counts = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  const byTier = Object.fromEntries(TIERS.map((t) => [t, [] as number[]])) as Record<Tier, number[]>;
  for (const h of fitPop) {
    counts[h.tier[k]!]++;
    byTier[h.tier[k]!]!.push(h.lv10[k]!);
  }
  const median = (a: number[]): number | null => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)]!;
  };
  const observedMedian = Object.fromEntries(
    TIERS.map((t) => [t, byTier[t]!.length ? round(median(byTier[t]!)!) : null]),
  ) as Record<Tier, number | null>;

  // 提案：每一帶取中位數收到好看的刻度；空帶用相鄰帶插值；再強制嚴格遞增。
  let target: Record<Tier, number>;
  if (OWNER_TARGETS[k]) {
    target = OWNER_TARGETS[k]!;
  } else {
    const raw = TIERS.map((t) => (observedMedian[t] === null ? null : nice(observedMedian[t]!)));
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== null) continue;
      const lo = raw.slice(0, i).filter((v): v is number => v !== null).pop() ?? 0;
      const hi = raw.slice(i + 1).find((v): v is number => v !== null) ?? lo * 2;
      raw[i] = nice((lo + hi) / 2);
    }
    for (let i = 1; i < raw.length; i++)
      if (raw[i]! <= raw[i - 1]!) raw[i] = niceAbove(raw[i - 1]!);
    target = Object.fromEntries(TIERS.map((t, i) => [t, raw[i]!])) as Record<Tier, number>;
  }

  // 變動量：把每個人吸附到自己那一帶的目標值。
  const deltas = fitPop.map((h) => {
    const from = h.lv10[k]!;
    const to = target[h.tier[k]!]!;
    const pct = from === 0 ? (to === 0 ? 0 : Infinity) : ((to - from) / Math.abs(from)) * 100;
    return { id: h.id, name: h.name, from, to, pct: round(pct, 1) };
  });
  const absPcts = deltas.map((d) => Math.abs(d.pct)).filter((v) => Number.isFinite(v));
  absPcts.sort((a, b) => a - b);
  const changed = deltas.filter((d) => d.from !== d.to).length;

  /**
   * ⚠️ 一個目標值可能**存得下去但玩家拿不到** —— finalizeStat 的順序是
   * `clamp(卡面 × env 倍率鏈 + 基礎加成)`，所以要拿**玩家實際吃到的值**去比上限，
   * 不是卡面。實測抓到兩件事：攻速目標 10 在預設上限 4.0 之下會被砍成 4.0
   * （只有 `config.stat-caps@1` 的 unlocked 10.0 才拿得到）；移速目標 15 乘完
   * 近戰 ×0.8 是 12，反而在 [2,14] 之內 —— 兩個結論都不可能靠看卡面得到。
   */
  const stat = STAT_ENUM[k];
  const chain = STAT_ENV_CHAIN[stat] ?? [];
  const factorFor = (at: string): number =>
    chain.reduce((f, link) => f * statEnvFactor(link, ENV, { attackType: at as never }), 1);
  const clampRange = STAT_CLAMPS[stat];
  const cap = STAT_CAPS[k];
  const capWarnings: string[] = [];
  for (const t of TIERS) {
    for (const at of ["melee", "ranged"]) {
      const final = round(target[t]! * factorFor(at) + (BASE_BONUS[k] ?? 0));
      const hi = cap?.base ?? clampRange?.[1];
      const lo = clampRange?.[0];
      const which = at === "melee" ? "近戰" : "遠程";
      if (hi !== undefined && final > hi)
        capWarnings.push(
          `${t} 目標 ${target[t]} → ${which}實際 ${final}，超過上限 ${hi}` +
            (cap?.unlocked && cap.unlocked > hi ? `（解鎖後 ${cap.unlocked} 才拿得到）` : "，會被靜默夾掉"),
        );
      if (lo !== undefined && final < lo)
        capWarnings.push(`${t} 目標 ${target[t]} → ${which}實際 ${final}，低於下限 ${lo}，會被夾上去`);
      if (factorFor("melee") === factorFor("ranged")) break;
    }
  }

  /**
   * ⭐ 第二種指派方式，因為它會改變**多少內容要動**，而那是 owner 真正在買單的成本。
   *
   * · `自然斷點`（上面那個）：先照分布的縫隙分群，再給每群一個目標值。
   *   壞處是群的邊界跟目標值的刻度**不對齊** —— 攻擊距離量到 8 位落在 6.0/6.4，
   *   自然斷點把他們歸進「小」，於是目標值 3 讓他們的射程**砍半**（−53%），
   *   但其實 5（中）離他們近得多。
   * · `最近目標值`：每位英雄直接吸附到五格裡最近的那一格。
   *   代價是帶的人數不再由分布決定，可能出現空帶。
   *
   * 兩個都算，把差額報出來，讓 owner 用「要動多少」而不是統計術語做選擇。
   */
  const nearest = (v: number): Tier =>
    TIERS.reduce((best, t) =>
      Math.abs(target[t]! - v) < Math.abs(target[best]! - v) ? t : best,
    );
  const nearestCounts = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  const nearestAbs: number[] = [];
  let regraded = 0;
  for (const h of fitPop) {
    const t = nearest(h.lv10[k]!);
    nearestCounts[t]++;
    if (t !== h.tier[k]) regraded++;
    const from = h.lv10[k]!;
    if (from !== 0) nearestAbs.push(Math.abs(((target[t]! - from) / from) * 100));
  }
  nearestAbs.sort((a, b) => a - b);

  reports.push({
    key: k,
    zh: ZH[k],
    drivenBy: DRIVEN_BY[k],
    distinct,
    min: round(Math.min(...vals)),
    max: round(Math.max(...vals)),
    bandable: distinct >= TIERS.length,
    bandableNote:
      distinct >= TIERS.length
        ? undefined
        : `只有 ${distinct} 種相異值，切不出 5 帶 —— 這一項要用設計指定，不能從分布推導`,
    jenksCuts: cuts.map((v) => round(v)),
    quintileCuts: qcuts.map((v) => round(v)),
    quintileDegenerate: new Set(qcuts).size < qcuts.length,
    counts,
    observedMedian,
    thinBands: TIERS.filter((t) => counts[t] < 5).map((t) => ({ tier: t, count: counts[t] })),
    target,
    targetSource: OWNER_TARGETS[k] ? "owner 指定" : "本工具提案（各帶中位數收到刻度）",
    capWarnings,
    nearestTargetAlternative: {
      counts: nearestCounts,
      regraded,
      medianAbsPct: round(nearestAbs[Math.floor(nearestAbs.length / 2)] ?? 0, 1),
      maxAbsPct: round(nearestAbs[nearestAbs.length - 1] ?? 0, 1),
      over50pct: nearestAbs.filter((v) => v > 50).length,
    },
    movement: {
      changed,
      unchanged: heroes.length - changed,
      medianAbsPct: round(absPcts[Math.floor(absPcts.length / 2)] ?? 0, 1),
      maxAbsPct: round(absPcts[absPcts.length - 1] ?? 0, 1),
      over25pct: absPcts.filter((v) => v > 25).length,
      over50pct: absPcts.filter((v) => v > 50).length,
      biggest: [...deltas]
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
        .slice(0, 5)
        .map((d) => ({ ...d, from: round(d.from), to: d.to })),
    },
  });
}

// ── 「極大帶但沒有補償弱項」───────────────────────────────────────────────────
/**
 * owner 2026-08-11：「原則上極大是少數並且有**明顯缺陷**作為補償機制的英雄設定」
 * （例：黑人牙膏移速極小換攻擊距離極大；皮卡丘攻速極大換生命極小）。
 *
 * ⚠️ 「有沒有一項是**小**」不是可用的判準 —— 它永遠成立，所以永遠抓不到人。
 * 量得到：Jenks 之下「小」帶最多裝了 81/119 位（魔抗）、77/119（AP）。
 * 一個 68% 的人都有的標籤不是「明顯缺陷」，是背景值。第一版用它當補償條件，
 * 結果 18 位極大英雄**全部**被判為「有補償」，清單長度 0 —— 一個恆真的檢查。
 *
 * 所以補償改成兩個都要看，而且 owner 舉的兩個例子都是**極小**：
 *   · `extremeLows`：落在**極小**的項目 —— owner 語意下的「明顯缺陷」
 *   · `netTierScore`：八項的帶位總和（中=0，極大=+2，極小=−2）——
 *     一位英雄就算沒有極小，只要整體不高於平均，也不算「白拿」
 *
 * 判為**無補償** = 一項極小都沒有，而且淨帶分 > 0（八項整體高於中間值）。
 * ⚠️ 這仍然是**提名**不是判決：補償也可能藏在技能組或射程手感裡，
 * 那不是這支工具看得到的東西。
 */
interface Outlier {
  id: string;
  name: string;
  form: string;
  retired: boolean;
  maxTiers: string[];
  extremeLows: string[];
  smallTiers: string[];
  netTierScore: number;
  verdict: "無補償" | "有補償（極小）" | "有補償（整體不高）";
}
const rankOf = (t: Tier): number => TIERS.indexOf(t);
const outliers: Outlier[] = [];
const compensated: Outlier[] = [];
// ⚠️ 只提名真英雄。骨架替身 `sela` 在攻擊距離／生命／防禦／AD 四項都是極大、
// 淨帶分 +9，會穩坐這張表第一名 —— 而它根本不是一位被設計出來的英雄。
for (const h of fitPop) {
  const maxTiers = STAT_KEYS.filter((k) => h.tier[k] === "極大").map((k) => ZH[k]);
  if (!maxTiers.length) continue;
  const extremeLows = STAT_KEYS.filter((k) => h.tier[k] === "極小").map((k) => ZH[k]);
  const smallTiers = STAT_KEYS.filter((k) => h.tier[k] === "小").map((k) => ZH[k]);
  const netTierScore = STAT_KEYS.reduce((s, k) => s + rankOf(h.tier[k]!) - 2, 0);
  const verdict: Outlier["verdict"] = extremeLows.length
    ? "有補償（極小）"
    : netTierScore <= 0
      ? "有補償（整體不高）"
      : "無補償";
  const row: Outlier = {
    id: h.id,
    name: h.name,
    form: h.form,
    retired: h.retired,
    maxTiers,
    extremeLows,
    smallTiers,
    netTierScore,
    verdict,
  };
  (verdict === "無補償" ? outliers : compensated).push(row);
}
const byScore = (a: Outlier, b: Outlier): number =>
  b.netTierScore - a.netTierScore || b.maxTiers.length - a.maxTiers.length;
outliers.sort(byScore);
compensated.sort(byScore);

// ── 天花板是不是被一個人佔住 ─────────────────────────────────────────────────
/**
 * ⭐ 這一段是為了回答一個**具體對不上的地方**：owner 說「皮卡丘攻擊速度極大換來
 * 生命值極小」，而量出來的皮卡丘是 **生命極小 ✓、攻速只有中/大 ✗**。
 *
 * 原因不在皮卡丘身上：攻速 lv10 第一名是 `godie-h02n 腦包英雄 - 打我阿笨蛋`
 * 的 **10.38**，第二名 1.80 —— 相差 **5.8 倍**。Jenks 會（正確地）把這種孤點
 * 單獨圈成一帶，於是「極大」整格只裝得下他一個人，其他人再快也只到「大」。
 * 同一位在生命也是第一名（5000）。
 *
 * 所以偵測規則：**第一名 ÷ 第二名 ≥ 2** = 這一項的天花板由單一英雄定義，
 * 「極大」那一格對其他所有人都是關著的。這種格子的目標值不能從分布長出來。
 */
const ceilings = STAT_KEYS.map((k) => {
  const sorted = [...fitPop].sort((a, b) => b.lv10[k]! - a.lv10[k]!);
  const first = sorted[0]!;
  const second = sorted[1]!;
  const ratio = second.lv10[k]! === 0 ? Infinity : first.lv10[k]! / second.lv10[k]!;
  return {
    key: k,
    zh: ZH[k],
    top: { id: first.id, name: first.name, value: first.lv10[k]!, retired: first.retired },
    runnerUp: { name: second.name, value: second.lv10[k]! },
    ratio: round(ratio, 2),
    singleHeroCeiling: ratio >= 2,
  };
}).filter((c) => c.singleHeroCeiling);

// ── 兩項會不會其實是同一顆旋鈕 ──────────────────────────────────────────────
/** 智慧同時決定 AP 與魔抗；力量同時決定生命與 AD。分帶重合度量出來給 owner 看。 */
const agree = (a: StatKey, b: StatKey): number =>
  round((heroes.filter((h) => h.tier[a] === h.tier[b]).length / heroes.length) * 100, 1);
const coupling = [
  { pair: "AP ↔ 魔抗", attr: "智慧", samTierPct: agree("ap", "mr") },
  { pair: "生命 ↔ AD", attr: "力量", samTierPct: agree("maxHealth", "ad") },
  { pair: "攻速 ↔ 防禦", attr: "敏捷", samTierPct: agree("as", "armor") },
];

// ── AoE（沿用上一版，未在本次範圍內）─────────────────────────────────────────
const AOE_BANDS = [
  { tier: "小", label: "約 5 人範圍", from: "< 200" },
  { tier: "中", label: "約 10 人範圍（預設）", from: "200 – 300" },
  { tier: "大", label: "1/4 競技場", from: "300 – 500" },
  { tier: "超大", label: "1/3 競技場", from: "≥ 500" },
] as const;
const aoe: { id: string; name: string; raw: number; tier: string }[] = [];
for (const e of bundle.abilities?.entries ?? []) {
  const r = e.doc?.template?.params?.radius;
  if (typeof r !== "number") continue;
  aoe.push({
    id: e.doc.id,
    name: e.doc.name,
    raw: r,
    tier: r < 200 ? "小" : r < 300 ? "中" : r < 500 ? "大" : "超大",
  });
}
aoe.sort((a, b) => b.raw - a.raw);

const out = {
  schema: "ggd-engine-tiers@2",
  generatedBy: "tools/engine-atlas/tiers.ts",
  level: LEVEL,
  tiers: TIERS,
  method: {
    value:
      "championStatBase(doc, stat, 10, 出貨 combat-env) —— 三層相加 baseStats + attr(L)·coef + growth·(L−1)，出貨的那個函式，不是自己重算",
    banding: "Jenks 自然斷點（一維最小類內平方差 DP 精確解，無隨機、可重現）",
    whyNotQuintiles:
      "攻擊距離 77/119 位並列在 1.6，等分位的四個切點會全部落在同一個並列值上，前三帶會是空的",
    envSource: "content/config/combat-env.json（出貨值）；與程式預設不同的鍵列在 envDiffs",
    envDiffs,
    baseBonus: BASE_BONUS,
    ingameNote:
      "ingame = lv10 × STAT_ENV_CHAIN 倍率鏈 (+ 基礎加成)。移速的倍率依 attackType 分岔（近戰 ×0.8 / 遠程 ×0.6）",
  },
  hero: {
    total: heroes.length,
    formCount: heroes.filter((h) => h.form === "變身").length,
    fitPopulation: fitPop.length,
    excludedFromFit: heroes
      .filter((h) => !h.inDistribution)
      .map((h) => ({ id: h.id, name: h.name, why: `attributes.source = ${h.attrSource}（手寫，不是 w3x 匯入的英雄）` })),
    zh: ZH,
    rows: heroes,
    stats: reports,
    coupling,
    ceilings,
    outliers: { noCompensation: outliers, compensated },
  },
  aoe: { bands: AOE_BANDS, rows: aoe },
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

console.log(`✓ ${OUT}`);
console.log(`  英雄列 ${heroes.length}（本體 ${heroes.length - out.hero.formCount} / 變身 ${out.hero.formCount}）`);
console.log(
  `  界線由 ${fitPop.length} 位真英雄長出；排除 ${out.hero.excludedFromFit.length} 位手寫三圍：${out.hero.excludedFromFit
    .map((e) => e.id)
    .join("、")}`,
);
if (envDiffs.length)
  console.log(
    `  ⚠️ 出貨 combat-env 與程式預設不同的係數：${envDiffs
      .map((d) => `${d.key} ${d.codeDefault}→${d.shipped}`)
      .join("、")}`,
  );
console.log("");
console.log("  項目      相異值  範圍                       Jenks 切點                     各帶人數");
for (const r of reports) {
  const counts = TIERS.map((t) => `${t}${r.counts[t]}`).join(" ");
  console.log(
    `  ${r.zh.padEnd(5, "　")} ${String(r.distinct).padStart(4)}  ` +
      `${`${r.min}..${r.max}`.padEnd(24)} ${r.jenksCuts.join(" / ").padEnd(30)} ${counts}` +
      (r.bandable ? "" : `  ⚠️ ${r.bandableNote}`),
  );
}
console.log("");
console.log("  提案目標值（極小/小/中/大/極大）與變動量");
for (const r of reports) {
  console.log(
    `  ${r.zh.padEnd(5, "　")} ${TIERS.map((t) => r.target[t]).join(" / ").padEnd(34)}` +
      ` 變動 ${r.movement.changed}/${fitPop.length} 位，|Δ| 中位 ${r.movement.medianAbsPct}%、>50% 有 ${r.movement.over50pct} 位  [${r.targetSource}]`,
  );
  const n = r.nearestTargetAlternative;
  console.log(
    `        ↳ 改用「吸附最近目標值」：${n.regraded}/${fitPop.length} 位換帶，|Δ| 中位 ${n.medianAbsPct}%、>50% 有 ${n.over50pct} 位` +
      `（人數 ${TIERS.map((t) => n.counts[t]).join("/")}）`,
  );
  for (const w of r.capWarnings) console.log(`        ⛔ ${w}`);
  if (r.thinBands.length)
    console.log(
      `        ⚠️ 薄帶（<5 人，目標值等於由一兩位決定，建議 owner 直接指定）：${r.thinBands
        .map((b) => `${b.tier}${b.count}人`)
        .join("、")}`,
    );
}
console.log("");
console.log(
  `  有極大帶的英雄 ${outliers.length + compensated.length} 位 → 無補償 ${outliers.length} 位、有補償 ${compensated.length} 位`,
);
for (const o of outliers)
  console.log(
    `    ⚠️ ${o.name}（${o.form}${o.retired ? "・已下架" : ""}）極大：${o.maxTiers.join("、")}｜一項極小都沒有｜淨帶分 +${o.netTierScore}` +
      (o.smallTiers.length ? `｜只有小：${o.smallTiers.join("、")}` : "｜連小都沒有"),
  );
console.log("");
console.log("  天花板被單一英雄佔住的項目（第一名 ÷ 第二名 ≥ 2 → 極大那一格對其他人是關著的）");
for (const c of ceilings)
  console.log(
    `    ${c.zh}：${c.top.name} ${c.top.value}${c.top.retired ? "（已下架）" : ""} vs 第二名 ${c.runnerUp.name} ${c.runnerUp.value} = ${c.ratio}×`,
  );
console.log("  對照 —— owner 舉的兩個例子長這樣：");
for (const o of compensated.filter((c) => c.extremeLows.length).slice(0, 6))
  console.log(`    ${o.name}（${o.form}）極大：${o.maxTiers.join("、")} ⇄ 極小：${o.extremeLows.join("、")}`);
console.log("");
console.log("  同一顆旋鈕的分帶重合度（改一項會拖動另一項）");
for (const c of coupling) console.log(`    ${c.pair}（${c.attr}）同帶率 ${c.samTierPct}%`);
