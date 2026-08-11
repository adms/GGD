/**
 * 英雄屬性正規化 —— **兩軸**（初始 / 每級成長）× 16 項屬性 × 三種去重模式。
 *
 * 產物：`docs/hero-stat-tiers.json`（`--out <path>` 可改）。這一支**只量測**，
 * ⛔ 不寫 `content/`（`docs/英雄屬性正規化計畫.md` 第七節）。
 *
 * ---------------------------------------------------------------------------
 * 為什麼要有這一支，而不是在 `tiers.ts` 上再加一欄
 * ---------------------------------------------------------------------------
 * `tiers.ts` 量的是「lv10 的合值」。owner 2026-08-11：
 *
 *   > 「要把**初始跟每級成長兩種分開統計五級距**討論才能決定」
 *
 * 合值會把兩種完全不同的英雄折成同一格：一位「初始高、成長平」的坦與一位
 * 「初始低、成長陡」的後期英雄，lv10 可以剛好相同，而他們在第一回合與第九回合
 * 是兩個世界。所以兩軸各自有自己的母體、自己的 Jenks、自己的五格。
 *
 * ⚠️ 兩軸**不共用界線**：生命的初始是 ~1,500、每級是 ~40，量綱差 30 倍，
 * 共用界線的結果是其中一軸整個塌成一格。
 *
 * ---------------------------------------------------------------------------
 * 三條不可以繞過的事實（繞過就是重犯上一版的錯）
 * ---------------------------------------------------------------------------
 * ① 戰力法則是**三層**：`stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)`。
 *    ⛔ 只讀 `doc.baseStats` 會得到「魔抗只有 4 種相異值、AP 全是 0」的錯覺。
 *    唯一可以算屬性的是 `championStatBase()`（出貨的那一支），⛔ 不要自己抄公式。
 * ② 成長軸**不可以**只讀 `doc.growth` —— 三圍係數也隨等級長（AP 100% 來自智慧），
 *    只讀 growth 會讓 AP 的成長全變成 0。這裡用出貨的 `championStatGrowth()`
 *    （它自己就是 `base(2) − base(1)`）。
 * ③ 卡面值 ≠ 玩家吃到的值。`finalizeStat` 有四道關卡：環境倍率鏈 → 體型倍率
 *    （只有攻擊距離）→ 基礎加成（+，在倍率之後）→ clamp / stat-caps。
 *    所以每一格同時輸出 `values`（卡面）與 `ingameValues`（過完四關）。
 *
 * ---------------------------------------------------------------------------
 * 母體：**74 = 53 可選本體 + 21 可達變身態**（owner 2026-08-11 二次拍板）
 * ---------------------------------------------------------------------------
 * 判定不在這裡，在 `selectablePopulation.ts`（三層 AND，每一層的來源寫在那支的
 * 檔頭）。
 *
 * ⚠️ 這一段在 2026-08-11 改過兩次，兩次都是因為**前一版數錯了**：
 *
 * ① 第一版寫「75 = 53 + 21 + zombiex」，而那是**重複計數** ——
 *    `godie-zombiex` 本來就在白名單種子裡（`starter.go:346`，owner 2026-07-28
 *    「喪標麥可 應該在預設英雄開放名單上」），所以它是那 53 位可選本體**之一**，
 *    不是第 54 位。
 * ② 第一版還把它**擋在界線推導之外**（`inBoundaryDerivation: false`），理由是
 *    「它是小怪側數值」。owner 二次拍板：**母體就是 53+21，全部進統計**。
 *    ⭐ 這是對的：它既然是玩家選得到的英雄，它的數值就該參與定義「什麼算正常」，
 *    否則會出現「照界線它是極小、但界線根本沒看過它」這種自打嘴巴的表。
 *
 * ⛔ 所以 `inBoundaryDerivation` 現在**恆為 true**。欄位保留是為了讓 JSON 的
 *    讀者看得到這一格存在過而且現在是全開，不是靜默拿掉。
 *
 * ── 去重模式也退場了 ────────────────────────────────────────────────────────
 * `reachable-dedup` 曾經是預設，唯一理由是「21 位變身態裡有 17 位與本體逐位元
 * 相同」。**那句話是假的**（2026-08-11 對抗複驗實測）：26 個非退化軸格全同的
 * 只有 **1 位**（`godie-e00l`），中位數 23/26。理由沒了，預設就回到 `reachable`
 * ——「母體是誰」是 owner 的裁決，不是一個統計技巧。
 * 三種模式仍然全部算出來放進 JSON 供對照（第一守則：有爭議就三個都做）。
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTR_KEYS,
  ATTR_LABEL,
  ATTR_STAT_SOURCE,
  attributeAtLevel,
  championStatBase,
  championStatGrowth,
  type AttrKey,
  type ChampionAttributes,
} from "../../packages/shared/src/sim/stats/attributes";
import { Stat, STAT_CLAMPS } from "../../packages/shared/src/sim/stats/statTypes";
import { finalizeStat, baseBonusFromDoc } from "../../packages/shared/src/sim/baseBonus";
import { statCapsFromDoc } from "../../packages/shared/src/sim/statCaps";
import {
  attackRangeScaleFactor,
  bodyScaleRulesFromDoc,
} from "../../packages/shared/src/sim/bodyScale";
import {
  DEFAULT_COMBAT_ENV,
  type CombatEnvMultipliers,
} from "../../packages/shared/src/sim/combatEnv";
import {
  classifyPopulation,
  retiredIds,
  starterChampionIds,
  POPULATION_CAVEATS,
} from "./selectablePopulation";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argOut = process.argv.indexOf("--out");
const OUT = argOut >= 0 ? process.argv[argOut + 1]! : join(REPO, "docs/hero-stat-tiers.json");

const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(REPO, rel), "utf8"));
const fingerprint = (rel: string): string =>
  createHash("sha256").update(readFileSync(join(REPO, rel))).digest("hex").slice(0, 12);

// ── 出貨的四份旋鈕（⛔ 都不是程式碼裡的 DEFAULT_*，是 content/ 的那一份）────────
const bundleRaw = readJson("content/bundle.json") as {
  contentVersion?: string;
  collections: Record<string, { entries: { doc: ChampionDoc }[] }>;
};
const envDoc = readJson("content/config/combat-env.json") as { multipliers?: Record<string, number> };
const ENV: CombatEnvMultipliers = {
  ...DEFAULT_COMBAT_ENV,
  ...(envDoc.multipliers ?? {}),
} as CombatEnvMultipliers;
const BASE_BONUS = baseBonusFromDoc(readJson("content/config/base-bonus.json"));
const STAT_CAPS = statCapsFromDoc(readJson("content/config/stat-caps.json"));
const BODY_SCALE_RULES = bodyScaleRulesFromDoc(readJson("content/config/body-scale.json"));

interface ChampionDoc {
  id: string;
  name: string;
  attackType?: "melee" | "ranged";
  bodyScale?: number;
  baseStats?: Record<string, number>;
  growth?: Record<string, number>;
  attributes?: ChampionAttributes;
  transform?: { role?: string; counterpartId?: string };
}

// ── 屬性表：一個模板 × 16 列（第零守則⑨：N 個同型 = K 個模板 + 一張表）─────────
/**
 * `stat` = 走 `championStatBase` 的引擎屬性；`attr` = 三圍本身（它不是 `Stat`，
 * 它是**餵給** `Stat` 的那一層，所以走 `attributeAtLevel`，也不吃任何倍率）。
 */
interface StatSpec {
  readonly key: string;
  readonly label: string;
  readonly stat?: Stat;
  readonly attr?: AttrKey;
}
const SPECS: readonly StatSpec[] = [
  { key: "maxHealth", label: "生命上限", stat: Stat.MaxHealth },
  { key: "maxMana", label: "魔力上限", stat: Stat.MaxMana },
  { key: "healthRegen", label: "生命回復", stat: Stat.HealthRegen },
  { key: "manaRegen", label: "魔力回復", stat: Stat.ManaRegen },
  { key: "ad", label: "攻擊力", stat: Stat.AttackDamage },
  { key: "ap", label: "法術強度", stat: Stat.AbilityPower },
  { key: "armor", label: "防禦", stat: Stat.Armor },
  { key: "mr", label: "魔抗", stat: Stat.MagicResist },
  { key: "as", label: "攻擊速度", stat: Stat.AttackSpeed },
  { key: "ms", label: "移動速度", stat: Stat.MoveSpeed },
  { key: "range", label: "攻擊距離", stat: Stat.AttackRange },
  { key: "critChance", label: "暴擊率", stat: Stat.CritChance },
  { key: "critDamage", label: "暴擊傷害", stat: Stat.CritDamage },
  ...ATTR_KEYS.map((a) => ({ key: a, label: ATTR_LABEL[a], attr: a })),
];

const TIERS = ["極小", "小", "中", "大", "極大"] as const;
type Tier = (typeof TIERS)[number];
type Axis = "initial" | "growth";
const AXES: readonly Axis[] = ["initial", "growth"];
const MODES = ["reachable", "reachable-dedup", "pickable"] as const;
type Mode = (typeof MODES)[number];
/**
 * ⭐ 預設模式 = `reachable`（owner 2026-08-11 二次拍板：母體就是 53+21 全收）。
 *
 * ⚠️ 這裡曾經是 `reachable-dedup`，唯一的理由是「17 位變身態與本體逐位元相同」
 * —— 而那句話實測是**假的**（全同的只有 1 位，中位數 23/26）。
 * 一個靠假前提選出來的預設值，比沒有預設值更糟。
 */
const DEFAULT_MODE: Mode = "reachable";

const round = (v: number, n = 4): number => {
  const f = 10 ** n;
  return Math.round(v * f) / f;
};

// ── Jenks 自然斷點（一維最小類內平方差，DP 精確解 —— 無隨機、可重現）───────────
/**
 * 回傳 k−1 個「上界值」：`v <= cut[0]` 屬第一帶，依此類推。
 * ⛔ 不用等分位：攻擊距離有 65% 的英雄並列在同一個值，等分位的前三個切點會相同，
 * 前三帶全空。
 *
 * ⚠️ 這段 DP 與 `tiers.ts` 的那一份是同一個演算法。刻意複製而不是 import ——
 * `tiers.ts` 是一支**有頂層副作用**的腳本（import 它就會跑一次分析並寫檔）。
 */
function jenks(values: readonly number[], k: number): number[] {
  const d = [...values].sort((a, b) => a - b);
  const n = d.length;
  if (n <= k) return d.slice(0, k - 1);
  const pre = [0];
  const pre2 = [0];
  for (let i = 0; i < n; i++) {
    pre.push(pre[i]! + d[i]!);
    pre2.push(pre2[i]! + d[i]! * d[i]!);
  }
  const ssd = (i: number, j: number): number => {
    const cnt = j - i + 1;
    const s = pre[j + 1]! - pre[i]!;
    return pre2[j + 1]! - pre2[i]! - (s * s) / cnt;
  };
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
    cuts.unshift(d[i - 1]!);
    j = i - 1;
  }
  return cuts;
}

const tierOf = (v: number, cuts: readonly number[]): Tier => {
  for (let i = 0; i < cuts.length; i++) if (v <= cuts[i]!) return TIERS[i]!;
  return "極大";
};

// ── 母體 ─────────────────────────────────────────────────────────────────────
const RETIRED = retiredIds(REPO);
const WHITELIST_SEED = new Set(starterChampionIds(REPO));
const DOCS: ChampionDoc[] = (bundleRaw.collections.champions?.entries ?? []).map((e) => e.doc);
const VERDICTS = classifyPopulation(
  DOCS.map((d) => d.id),
  WHITELIST_SEED,
  RETIRED,
);

/**
 * ⚠️ owner 2026-08-11 點名的一份。它的 `attributes.source` 是 `authored`，數值是
 * 小怪側的 —— 進落點表（要被校正），⛔ 不進界線推導（不定義什麼算正常）。
 */
const MOB_IDS = new Set(["godie-zombiex"]);

type Group = "base" | "transform" | "mob";
interface Row {
  readonly id: string;
  readonly name: string;
  readonly group: Group;
  readonly counterpartId?: string;
  readonly inBoundaryDerivation: boolean;
  readonly attackType?: "melee" | "ranged";
  readonly bodyScale: number;
  readonly attrSource: string;
  readonly reachability: string;
  /** 卡面值：`values[axis][statKey]`。 */
  readonly card: Record<Axis, Record<string, number>>;
  /** 玩家吃到的值：過完 finalizeStat 的四道關卡。 */
  readonly ingame: Record<Axis, Record<string, number>>;
}

function measure(doc: ChampionDoc): Pick<Row, "card" | "ingame"> {
  const def = {
    baseStats: (doc.baseStats ?? {}) as never,
    growth: (doc.growth ?? {}) as never,
    attributes: doc.attributes,
  };
  const rangeScale = attackRangeScaleFactor(doc.bodyScale, BODY_SCALE_RULES);
  const fin = (v: number, stat: Stat): number =>
    finalizeStat(v, stat, {
      env: ENV,
      baseBonus: BASE_BONUS,
      caps: STAT_CAPS,
      rangeScale,
      subject: { attackType: doc.attackType },
    });

  const card: Record<Axis, Record<string, number>> = { initial: {}, growth: {} };
  const ingame: Record<Axis, Record<string, number>> = { initial: {}, growth: {} };
  for (const spec of SPECS) {
    if (spec.stat !== undefined) {
      const s = spec.stat;
      const b1 = championStatBase(def, s, 1, ENV);
      card.initial[spec.key] = round(b1);
      card.growth[spec.key] = round(championStatGrowth(def, s, ENV));
      // ⚠️ 實際成長要**兩端都過關卡**再相減，不是「成長 × 倍率」——
      // 基礎加成是常數（相減時抵銷）而 clamp 不是（撞到天花板的人成長是 0）。
      const f1 = fin(b1, s);
      const f2 = fin(championStatBase(def, s, 2, ENV), s);
      ingame.initial[spec.key] = round(f1);
      ingame.growth[spec.key] = round(f2 - f1);
    } else {
      const a = spec.attr!;
      const attrs = doc.attributes;
      // 三圍不吃 combat-env、不吃基礎加成、不吃 clamp —— 它是**上游**，
      // 倍率作用在它推導出來的那些屬性上。所以卡面 = 實際。
      const init = attrs === undefined ? 0 : attributeAtLevel(attrs, a, 1);
      const grow = attrs === undefined ? 0 : attributeAtLevel(attrs, a, 2) - init;
      card.initial[spec.key] = round(init);
      card.growth[spec.key] = round(grow);
      ingame.initial[spec.key] = round(init);
      ingame.growth[spec.key] = round(grow);
    }
  }
  return { card, ingame };
}

const rows: Row[] = [];
for (const doc of DOCS) {
  const v = VERDICTS.get(doc.id)!;
  const isMob = MOB_IDS.has(doc.id);
  if (!v.reachable && !isMob) continue;
  const group: Group = isMob ? "mob" : v.pickable ? "base" : "transform";
  rows.push({
    id: doc.id,
    name: doc.name,
    group,
    counterpartId: doc.transform?.counterpartId,
    // ⛔ 恆為 true（owner 2026-08-11 二次拍板）。欄位留著是為了讓 JSON 的讀者
    //    看得到這一格存在過而且現在是全開 —— 靜默拿掉會讓舊 JSON 的讀者以為
    //    這一版也排除了 zombiex。
    inBoundaryDerivation: true,
    attackType: doc.attackType,
    bodyScale: doc.bodyScale ?? 1,
    attrSource: doc.attributes?.source ?? "(none)",
    reachability: v.reachability,
    ...measure(doc),
  });
}
const byId = new Map(rows.map((r) => [r.id, r]));

// ── 三種去重模式（⭐ 這是一個決策點，所以三個都算，不是我挑一個然後辯護）───────
const REACHABLE = rows.filter((r) => r.inBoundaryDerivation);
const PICKABLE = REACHABLE.filter((r) => r.group === "base" || r.group === "mob");

/**
 * `reachable-dedup`：**逐屬性、逐軸**去掉「與本體同值」的變身態。
 * ⚠️ 是逐屬性不是逐英雄 —— 一位變身態可能生命與本體相同、攻速不同，
 * 逐英雄丟掉會連同那筆真的新資訊一起丟。
 */
function membersFor(mode: Mode, key: string, axis: Axis): Row[] {
  if (mode === "pickable") return PICKABLE;
  if (mode === "reachable") return REACHABLE;
  return REACHABLE.filter((r) => {
    if (r.group !== "transform") return true;
    const base = r.counterpartId === undefined ? undefined : byId.get(r.counterpartId);
    if (base === undefined || !base.inBoundaryDerivation) return true;
    return r.card[axis][key] !== base.card[axis][key];
  });
}

interface AxisReport {
  values: Record<string, number>;
  ingameValues: Record<string, number>;
  breaksJenks: number[];
  bandCounts: number[];
  /** 相異值 < 5 ⇒ 這一項**撐不起五帶**，界線是假的，落點一律 null。 */
  degenerate: boolean;
  distinct: number;
  min: number;
  max: number;
  derivationN: number;
  modes: Record<Mode, { n: number; distinct: number; breaks: number[]; bandCounts: number[] }>;
}

function bandCounts(values: readonly number[], cuts: readonly number[]): number[] {
  const c = TIERS.map(() => 0);
  for (const v of values) c[TIERS.indexOf(tierOf(v, cuts))]! += 1;
  return c;
}

const stats: Record<string, unknown> = {};
/** 這一項的 lv10 值有多少來自三圍 —— 決定「能不能只改這一格」。量的，不是寫的。 */
function couplingNote(spec: StatSpec): string {
  if (spec.attr !== undefined) return "三圍本身 —— 它是上游，其他屬性從它推導出來";
  const src = ATTR_STAT_SOURCE[spec.stat!];
  if (src === undefined) return "無（純 baseStats + growth，不受三圍影響）";
  const shares: number[] = [];
  for (const r of PICKABLE) {
    const doc = DOCS.find((d) => d.id === r.id)!;
    const def = {
      baseStats: (doc.baseStats ?? {}) as never,
      growth: (doc.growth ?? {}) as never,
      attributes: doc.attributes,
    };
    const total = championStatBase(def, spec.stat!, 10, ENV);
    const authored = (doc.baseStats?.[spec.key] ?? 0) + (doc.growth?.[spec.key] ?? 0) * 9;
    if (total !== 0) shares.push((total - authored) / total);
  }
  shares.sort((a, b) => a - b);
  const med = shares.length === 0 ? 0 : shares[Math.floor(shares.length / 2)]!;
  const attrZh = ATTR_LABEL[src.attr];
  const mode = src.mode === "add" ? "加法" : "乘法（base × (1 + 係數·屬性)）";
  return `${attrZh}（${mode}，係數 ${ENV[src.key]}）—— lv10 有 ${Math.round(med * 100)}% 來自三圍（可選本體的中位數）`;
}

for (const spec of SPECS) {
  const axes: Record<string, AxisReport> = {};
  for (const axis of AXES) {
    const values: Record<string, number> = {};
    const ingameValues: Record<string, number> = {};
    for (const r of rows) {
      values[r.id] = r.card[axis][spec.key]!;
      ingameValues[r.id] = r.ingame[axis][spec.key]!;
    }
    const modeOut = {} as AxisReport["modes"];
    for (const mode of MODES) {
      const vals = membersFor(mode, spec.key, axis).map((r) => r.card[axis][spec.key]!);
      const cuts = jenks(vals, TIERS.length).map((v) => round(v));
      modeOut[mode] = {
        n: vals.length,
        distinct: new Set(vals).size,
        breaks: cuts,
        bandCounts: bandCounts(vals, cuts),
      };
    }
    const primary = modeOut[DEFAULT_MODE];
    const primaryVals = membersFor(DEFAULT_MODE, spec.key, axis).map((r) => r.card[axis][spec.key]!);
    axes[axis] = {
      values,
      ingameValues,
      breaksJenks: primary.breaks,
      bandCounts: primary.bandCounts,
      degenerate: primary.distinct < TIERS.length,
      distinct: primary.distinct,
      min: round(Math.min(...primaryVals)),
      max: round(Math.max(...primaryVals)),
      derivationN: primary.n,
      modes: modeOut,
    };
  }
  stats[spec.key] = {
    label: spec.label,
    couplingNote: couplingNote(spec),
    /** 出貨的最終 clamp（`finalizeStat` 的第四關）。null = 這一項沒有夾限。 */
    finalClamp: spec.stat === undefined ? null : (STAT_CLAMPS[spec.stat] ?? null),
    axes,
  };
}

// ── 落點表（75 位全收，含 zombiex）───────────────────────────────────────────
type Landing = Record<string, Record<string, Record<Axis, Tier | null>>>;
const landing: Landing = {};
for (const r of rows) {
  const per: Record<string, Record<Axis, Tier | null>> = {};
  for (const spec of SPECS) {
    const cell = {} as Record<Axis, Tier | null>;
    for (const axis of AXES) {
      const a = (stats[spec.key] as { axes: Record<string, AxisReport> }).axes[axis]!;
      cell[axis] = a.degenerate ? null : tierOf(r.card[axis][spec.key]!, a.breaksJenks);
    }
    per[spec.key] = cell;
  }
  landing[r.id] = per;
}

// ── 「極大但沒有補償」───────────────────────────────────────────────────────
/**
 * owner 兩次都講了同一句話：
 *   > 「原則上**極大是少數**並且**有明顯缺陷作為補償機制**的英雄設定」
 * 判準：任一屬性落在「極大」→ 檢查他**有沒有任何一項落在「極小」**。沒有 → 進清單。
 *
 * ⚠️ 三個軸組合都報，不挑一種：
 *   · `initial` 初始極大 × 初始極小 —— 開局就成立的補償
 *   · `growth`  成長極大 × 成長極小 —— 後期成立的補償
 *   · `cross`   初始極大 × **成長**極小 —— 「早強晚弱」，形狀不同但也是補償
 * ⛔ degenerate 的屬性一律不算（全員同值時「大家都是極小」，會把每個人都判成
 *    有補償 —— 那不是補償，那是這一項沒有分布）。
 */
const AXIS_PAIRS: { axis: "initial" | "growth" | "cross"; from: Axis; to: Axis }[] = [
  { axis: "initial", from: "initial", to: "initial" },
  { axis: "growth", from: "growth", to: "growth" },
  { axis: "cross", from: "initial", to: "growth" },
];
const extremeWithoutCompensation: unknown[] = [];
const compensated: unknown[] = [];
for (const { axis, from, to } of AXIS_PAIRS) {
  for (const r of rows) {
    const big = SPECS.filter((s) => landing[r.id]![s.key]![from] === "極大").map((s) => s.key);
    if (big.length === 0) continue;
    const small = SPECS.filter((s) => landing[r.id]![s.key]![to] === "極小").map((s) => s.key);
    const anyMinimalStats = SPECS.flatMap((s) =>
      AXES.filter((ax) => landing[r.id]![s.key]![ax] === "極小").map((ax) => `${s.key}@${ax}`),
    );
    const entry = {
      id: r.id,
      name: r.name,
      group: r.group,
      axis,
      extremeStats: big,
      compensationStats: small,
      anyMinimalStats,
    };
    (small.length === 0 ? extremeWithoutCompensation : compensated).push(entry);
  }
}

// ── 自我診斷：這份分帶哪裡撐不住 ────────────────────────────────────────────
/**
 * ⚠️ 「Jenks 給得出四個切點」不等於「這一項真的有五帶」。三種撐不住的形態，
 * 全部量出來寫進 JSON，否則下游會把一個由**一位英雄**定義的帶當成分布。
 */
const axisOf = (key: string, axis: Axis): AxisReport =>
  (stats[key] as { axes: Record<string, AxisReport> }).axes[axis]!;
const degenerateAxes: string[] = [];
const thinBands: { stat: string; axis: Axis; tier: Tier; count: number }[] = [];
for (const spec of SPECS)
  for (const axis of AXES) {
    const a = axisOf(spec.key, axis);
    if (a.degenerate) {
      degenerateAxes.push(`${spec.key}@${axis}`);
      continue;
    }
    a.bandCounts.forEach((c, i) => {
      if (c <= 2) thinBands.push({ stat: spec.key, axis, tier: TIERS[i]!, count: c });
    });
  }
/** 兩項屬性在整個母體上**逐位元相同** = 它們不是兩個旋鈕，是同一個。 */
const identicalAxes: string[] = [];
for (let i = 0; i < SPECS.length; i++)
  for (let j = i + 1; j < SPECS.length; j++)
    for (const axis of AXES) {
      const ra = axisOf(SPECS[i]!.key, axis);
      const rb = axisOf(SPECS[j]!.key, axis);
      // 兩邊都是「全員同值」時當然相同 —— 那是 degenerate，不是耦合，別報成雜訊。
      if (ra.degenerate && rb.degenerate) continue;
      const a = ra.values;
      const b = rb.values;
      if (rows.every((r) => a[r.id] === b[r.id]))
        identicalAxes.push(`${SPECS[i]!.key} ≡ ${SPECS[j]!.key} @${axis}`);
    }

// ── 輸出 ─────────────────────────────────────────────────────────────────────
const counts = {
  base: rows.filter((r) => r.group === "base").length,
  transform: rows.filter((r) => r.group === "transform").length,
  mob: rows.filter((r) => r.group === "mob").length,
};
const out = {
  schema: "hero-stat-tiers@1",
  generatedFrom: {
    contentVersion: bundleRaw.contentVersion ?? "(none)",
    championDocsInBundle: DOCS.length,
    configFingerprints: {
      "combat-env": fingerprint("content/config/combat-env.json"),
      "base-bonus": fingerprint("content/config/base-bonus.json"),
      "stat-caps": fingerprint("content/config/stat-caps.json"),
      "body-scale": fingerprint("content/config/body-scale.json"),
      roster: fingerprint("content/config/roster.json"),
    },
    whitelistSeedSource: "apps/platform/internal/curation/starter.go · starterChampions",
    statFunction:
      "championStatBase(def, stat, L, 出貨 combat-env) —— 三層相加 baseStats + attr(L)·coefficient + growth·(L−1)",
    axisDefinition: {
      initial: "championStatBase(def, stat, 1, ENV)",
      growth: "championStatBase(def, stat, 2, ENV) − championStatBase(def, stat, 1, ENV)",
    },
    banding: "Jenks 自然斷點（一維最小類內平方差 DP 精確解，無隨機、可重現），k=5",
    defaultMode: DEFAULT_MODE,
  },
  readme: [
    "values = **卡面值**（英雄文件裡該填的數字）；ingameValues = 過完 finalizeStat 四道關卡之後**玩家吃到**的值。",
    "四道關卡：①combat-env 倍率鏈 ②體型倍率 rangeScale（只有攻擊距離）③基礎加成（+，在倍率之後）④clamp / stat-caps。",
    "界線（breaksJenks）是 4 個**上界**：v <= breaks[0] → 極小，依此類推，超過 breaks[3] → 極大。",
    "degenerate: true = 這一項的相異值不到 5 個，撐不起五帶 —— 界線是假的，landing 一律 null，也不進補償判定。",
    "godie-zombiex **進**界線推導（owner 2026-08-11 二次拍板：母體就是 53+21）。它在白名單種子裡，是那 53 位可選本體之一 —— 玩家選得到的英雄就該參與定義「什麼算正常」。",
    "兩軸各自跑自己的 Jenks，⛔ 不共用界線（量綱差 30 倍，共用會讓其中一軸塌成一格）。",
  ],
  population: {
    total: rows.length,
    counts,
    boundaryDerivationTotal: REACHABLE.length,
    pickableTotal: counts.base + counts.mob,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      group: r.group,
      counterpartId: r.counterpartId ?? null,
      inBoundaryDerivation: r.inBoundaryDerivation,
      attackType: r.attackType ?? null,
      bodyScale: r.bodyScale,
      attrSource: r.attrSource,
      reachability: r.reachability,
    })),
    caveats: [
      ...POPULATION_CAVEATS,
      // ⚠️ 量到的，不是抄計畫書的。計畫書寫「53 本體 + 21 變身 + zombiex = 75」，
      // 而 godie-zombiex **本來就在白名單種子裡**（starter.go 第 346 行，owner
      // 2026-07-28「喪標麥可 應該在預設英雄開放名單上」）—— 它是那 53 位裡的一位，
      // 不是第 54 位。所以可達母體是 **74**，不是 75；75 是把它算了兩次。
      `母體 ${rows.length} = 可選本體 ${counts.base + counts.mob}（含 godie-zombiex）+ 可達變身 ${counts.transform}。owner 2026-08-11 二次拍板：**53+21 全部進統計**。`,
      "⚠️ 計畫書第一版的「75」是重複計數 —— godie-zombiex 本來就在白名單種子裡（starter.go:346），是那 53 位可選本體之一，不是第 54 位。",
      "⚠️ 第一版把 zombiex 擋在界線推導外（inBoundaryDerivation=false），這一版取消了：玩家選得到的英雄就該參與定義「什麼算正常」，否則會出現「照界線它是極小、但界線根本沒看過它」這種自打嘴巴的表。",
      "預設模式從 reachable-dedup 改回 **reachable**。dedup 的唯一理由是「17 位變身態與本體逐位元相同」，而那句話實測是假的（26 個非退化軸格全同的只有 1 位，中位數 23/26）。三種模式仍全部算出來供對照。",
    ],
  },
  /**
   * owner 2026-08-11 已經逐格指定的一項 —— ⛔ 它**不是**量出來的，
   * 不可以跟 `breaksJenks` 混在一起讀。而且它還缺一個裁決：
   * 這五個數字是「卡面要填的」還是「玩家實際打得到的」？兩套都算得出來
   * （`values` vs `ingameValues`，攻擊距離的倍率是 combat-env 0.6 × 體型倍率）。
   */
  ownerSpecifiedTargets: {
    range: {
      values: { 極小: 1.5, 小: 3, 中: 5, 大: 7, 極大: 10 },
      source: "owner 2026-08-11 逐格指定",
      openQuestion:
        "這五個數字是卡面值還是玩家實際值？卡面 10 → 實際 6.0（×0.6）；要讓實際等於 10，一般體型的卡面要寫 16.67，體型 3.0 的（rangeMult 1.3）只要寫 12.82。",
    },
    attackSpeedCeiling: {
      base: 4,
      unlocked: 10,
      source: "owner 2026-08-11：英雄攻速上限 4（極大），只有技能／變身／傳說武器能解鎖到 10",
      engineStatus:
        "引擎已經照這樣做了（config.stat-caps@1 as: base 4 / unlocked 10，解鎖走 ModOp.CapRaise 取 max 不相加）—— 不用改程式。",
    },
  },
  env: {
    combatEnv: ENV,
    baseBonus: BASE_BONUS,
    statCaps: STAT_CAPS,
    bodyScale: {
      rules: BODY_SCALE_RULES,
      heroesWithScale: rows
        .filter((r) => r.bodyScale !== 1)
        .map((r) => ({
          id: r.id,
          name: r.name,
          bodyScale: r.bodyScale,
          rangeMult: round(attackRangeScaleFactor(r.bodyScale, BODY_SCALE_RULES)),
        })),
    },
  },
  stats,
  landing,
  outliers: {
    criterion:
      "任一屬性落在「極大」→ 檢查他有沒有任何一項落在「極小」。沒有 → 進 extremeWithoutCompensation，交給 owner 逐位裁決。",
    axisPairs: {
      initial: "初始極大 × 初始極小 —— 開局就成立的補償",
      growth: "成長極大 × 成長極小 —— 後期才成立的補償",
      cross: "初始極大 × 成長極小 —— 「早強晚弱」，形狀不同但也是補償",
    },
    caveat:
      "⚠️ 這個判準的靈敏度由「極小」那一帶有幾個人決定，而那是 Jenks 決定的。極小只有 1 人的軸（見 diagnostics.thinBands），幾乎沒有人可能有補償；極小有 30 人的軸，幾乎人人都有。兩軸的結果不可以直接互比。",
    extremeWithoutCompensation,
    compensated,
  },
  diagnostics: {
    degenerateAxes,
    thinBands,
    identicalAxes,
    note: "degenerateAxes = 相異值 < 5，撐不起五帶；thinBands = 那一格只有 1–2 位英雄，等於界線由一兩個人定義（建議 owner 直接指定，像他指定攻擊距離那樣）；identicalAxes = 這兩項在整個母體上逐位元相同，它們不是兩個旋鈕。",
  },
};

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

// ── 主控台摘要（給人看的那一份，JSON 才是機器讀的）──────────────────────────
console.log(`母體 ${rows.length} = 本體 ${counts.base} + 變身 ${counts.transform} + 小怪 ${counts.mob}`);
console.log(`界線推導母體 ${REACHABLE.length}（53 可選本體含 zombiex + 21 可達變身）；預設模式 ${DEFAULT_MODE}`);
console.log("");
console.log("屬性        軸      相異  推導N  範圍                       Jenks 切點");
for (const spec of SPECS) {
  const s = stats[spec.key] as { axes: Record<string, AxisReport> };
  for (const axis of AXES) {
    const a = s.axes[axis]!;
    console.log(
      `${spec.key.padEnd(12)}${axis.padEnd(8)}${String(a.distinct).padStart(4)}${String(a.derivationN).padStart(7)}  ` +
        `${`${a.min}..${a.max}`.padEnd(24)} ${a.degenerate ? "（撐不起五帶）" : a.breaksJenks.join(" / ")}`,
    );
  }
}
console.log("");
console.log(
  `極大但沒有補償：${extremeWithoutCompensation.length} 筆（三個軸組合合計）；有補償 ${compensated.length} 筆`,
);
console.log(`→ ${OUT}`);
