/**
 * ⭐【GH#465】**相稱性** —— 成本軸（冷卻 × 形狀）反過來對回報軸（傷害）的要求。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 2026-08-20：這張表從**資料**變成**公式 + 一個係數**
 *
 * 它在 2026-08-19 是**十五格手填的資料**，而那一版的檔頭自己寫著：
 *
 * > 「⚠️ 而且它**推導不出來** —— 試過三條路⋯沒有一條同時重現
 * >   『單體·極小 → 極小』與『範圍·極小 → 大』。那代表 owner 的那一格帶著
 * >   『瞄準風險』這個**表上沒有的**輸入，所以它是**資料**不是公式。」
 *
 * ⭐ owner 2026-08-20 把**表上沒有的那個輸入**給了我（逐字）：
 *
 * > 「簡單粗暴的建議，**30/6秒=5，所以是 5 倍差距**，但由於是極小還是有可能位於
 * >  **2 個人的命中範圍，所以再除 2**，最後結論**約等於 2.5 倍**的這樣邏輯
 * >  來推演上下限的合理性範圍」
 *
 * ⇒ 缺的輸入是 **期望命中人數**（`expectedHits`），而它是一格後台欄位不是常數 ——
 * owner 自己已經把它從量到的 **1.33 人**改成 **2 人**（第一守則：他會再改）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 公式（一條，⛔ 不是十五格）
 *
 *     單位輸出率 unitRate = 傷害[極小] ÷ 冷卻[單體][極小]
 *     要求傷害  required(形狀, 級距)
 *              = unitRate × 冷卻[形狀][級距] ÷ 期望命中人數[形狀]
 *     最低傷害級距 = **第一個**值 ≥ required 的級距
 *
 * ⚠️ `unitRate` 不是我挑的常數 —— `content/damageTiers.ts` 的五格本來就是
 * 「極小 × 單體冷卻比」，也就是**同一個** unitRate。⇒ 單體那一列必然是
 * **對角線**（冷卻級距 T → 傷害級距 T），而那正是 owner Q4「已經有傷害相應的
 * 冷卻做限制」的另一種寫法。
 *
 * ⭐ 驗算 owner 給的係數：`範圍·極小 required ÷ 單體·極小 required`
 * = `(30 ÷ 6) ÷ 2` = **2.5×** —— 逐位元等於 owner 的「30/6=5，再除 2」。
 * ⛔ 這裡刻意只寫**比值**：它與傷害級距的大小無關（整條梯子縮放，比值不動），
 * 所以 owner 下一次重錨時這一段**不會變成謊話**。
 *
 * ⚠️ ⛔ 但它**沒有重現** owner 2026-08-19 手填的那一格（範圍·極小 → **大**）：
 * 公式給的是「**小**」—— 差**兩級**（「大」是「小」的 3.0 倍，而那個倍數
 * 同樣與級距大小無關）。
 * ⛔ 我**沒有**去湊那個差（第〇·六守則：不能停就照階梯做下去 + 做成開關）：
 * 照階梯，2026-08-20 的公式是**比較新的第 1 層**，所以它贏並且**預設啟動**；
 * 舊的那一格另存在 {@link OWNER_20260819_CELL}，而 `expectedHits` 就是
 * 一鍵回頭的開關（把「範圍」填 0.67 就會回到「大」）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ `expectedHits = 0` ＝ **這個形狀不套相稱性**
 *
 * 出貨 `變身: 0`。理由不是「還沒填」：變身／長持續增益的**回報軸根本不是傷害**，
 * 對它要求一個最低傷害級距等於逼作者在一支變身技上填傷害。
 * ⇒ 0 是一個**語意**（豁免），⛔ 不是一個沒填完的坑。
 *
 * ⚠️ 違反只**警告不擋**（和 `authoringRules.ts` 的其餘 `principle` 同一層）——
 * owner 說的是「不合理」不是「不准」。
 */
import {
  COOLDOWN_SHAPES,
  DEFAULT_COOLDOWN_TIERS,
  type CooldownShape,
  type CooldownTiers,
} from "./cooldownTiers";
import {
  DAMAGE_TIER_NAMES,
  DEFAULT_DAMAGE_TIERS,
  type DamageTierName,
  type DamageTiers,
} from "./damageTiers";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** 期望命中人數的合法區間。0 ＝ 豁免（見檔頭）；上界 10 ＝ 一場最多的人數量級。 */
export const EXPECTED_HITS_MIN = 0;
export const EXPECTED_HITS_MAX = 10;

/** 形狀 → 一次命中幾個人（owner 2026-08-20：範圍 **2 人**）。 */
export type ExpectedHits = Readonly<Record<CooldownShape, number>>;

/**
 * 出貨值。⭐ 三個數字全部有出處：
 * · `單體: 1` —— 定義（單體就是打一個人）
 * · `範圍: 2` —— owner 2026-08-20「可能位於 **2 個人**的命中範圍」
 *   （⚠️ 量到的是 **1.33 人**；owner 自己把它進位成 2，那是他的裁決不是我的四捨五入）
 * · `變身: 0` —— 豁免：它的回報軸不是傷害
 */
export const DEFAULT_EXPECTED_HITS: ExpectedHits = Object.freeze({
  單體: 1,
  範圍: 2,
  變身: 0,
});

/**
 * owner 2026-08-19 手填的那**一格**（「的確是太小不合理，要綜合看傷害是不是
 * 極大或**至少大**的」）。
 *
 * ⛔ 留在這裡是因為第〇·六守則：「**分開不是丟掉**」——
 * 2026-08-20 的公式贏了並且預設啟動，但被它取代的那個判斷不可以無聲消失。
 * ⭐ 守衛 `skillCostTiers.test.ts` 讀這一格，把「公式重現不了它」這件事
 * **釘成一條會紅的斷言** —— 哪天公式或係數變到重現得了，它會叫。
 */
export const OWNER_20260819_CELL = Object.freeze({
  shape: "範圍" as CooldownShape,
  tier: SKILL_TIER_NAMES[0],
  damageTier: "大" as DamageTierName,
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 三個模型（owner 2026-08-20「fix #465, 3 suggestions?」）
 *
 * 這一格存在的理由是**兩層 owner 說法打架**（第〇·六守則：不能停就照階梯做下去
 * 並且做成開關）：08-19 手填「範圍·極小 → 大」，08-20 給的公式算出來是「小」。
 * ⛔ 我**沒有替他挑**，三條路全部做出來，⭐ 預設 = **今天的行為**。
 *
 * ⚠️ 量到的一件事，⛔ 不要被三個名字騙了：`ownerCell` 與 `aimRisk` 的十格
 * **逐格相同**。算式是 `rate × 秒 ÷ hits × risk`，兩個係數都是純量 ⇒
 * 「hits ÷ 3」與「risk × 3」在數學上是同一件事。差別是**哪一個數字被改寫**：
 * · `ownerCell` 改掉 owner 親口說的「**2 個人**」（那格 config 從此在說謊）
 * · `aimRisk` 讓「2 個人」原封不動，另外開一格「有多容易完全落空」
 * ⇒ 兩者對玩家與編輯器**完全等價**，對**下一次調整**完全不等價。
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * · `formula`   —— 照 2026-08-20 的公式（`expectedHits` 原封不動）。**出貨值**。
 * · `ownerCell` —— 把 `expectedHits[範圍]` 改寫成能重現 08-19 手填那一格的值。
 * · `aimRisk`   —— `expectedHits` 不動，另乘一格**瞄準風險倍率**。
 * · `custom`    —— 誰都不推導，直接用下面手填的十五格（⭐ 單格破例用這個）。
 */
export const PROPORTIONALITY_MODELS = ["formula", "ownerCell", "aimRisk", "custom"] as const;
export type ProportionalityModel = (typeof PROPORTIONALITY_MODELS)[number];

/** ⭐ 出貨 = **今天的行為**（第〇·六守則：高層級的更新預設啟動）。 */
export const DEFAULT_PROPORTIONALITY_MODEL: ProportionalityModel = "formula";

/** 形狀 → 瞄準風險倍率。1 ＝ 沒有額外要求（＝ 公式本身）。 */
export type AimRiskMult = Readonly<Record<CooldownShape, number>>;

/**
 * 下界 **0.1**：< 1 ＝ 「這個形狀比單體**更容易**打中」，留給 owner 而不是我封死。
 * 上界 **10**：與 {@link EXPECTED_HITS_MAX} 同一個量級 —— 再高就是「要求傷害
 * 超過極大十倍」，那不是一條原則，是把整個形狀關掉。
 */
export const AIM_RISK_MIN = 0.1;
export const AIM_RISK_MAX = 10;

/** 「一點風險都不算」—— `formula` 與 `ownerCell` 都用它。 */
export const NO_AIM_RISK: AimRiskMult = Object.freeze(
  Object.fromEntries(COOLDOWN_SHAPES.map((s) => [s, 1])) as Record<CooldownShape, number>,
);

/** 對角線的錨：unitRate 從**這一格**取（單體·極小）。 */
const ANCHOR_SHAPE: CooldownShape = COOLDOWN_SHAPES[0];
const ANCHOR_TIER: SkillTierName = SKILL_TIER_NAMES[0];

/**
 * 一格要求的**傷害點數**（⛔ 不是級距名 —— 級距名由 {@link tierAtLeast} 決定）。
 * `expectedHits <= 0` ⇒ `0`（豁免，任何級距都過）。
 *
 * `risk` ＝ **瞄準風險倍率**（方案 C）。1 = 沒有額外要求，也就是 2026-08-20
 * 落地的那條公式本身。它與 `hits` 是**兩件不同的事**：`hits` 說「打到幾個人」，
 * `risk` 說「有多容易一個都沒打到」。⛔ 兩者在算式上都是一個純量，所以
 * 「hits ÷ 3」與「risk × 3」會長出**逐格相同**的表 —— 差別在**哪一個數字被改寫**
 * （見 {@link describeProportionalityModels}）。
 */
export function requiredDamage(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
  shape: CooldownShape,
  tier: SkillTierName,
  risk = 1,
): number {
  const n = hits[shape];
  if (!(n > 0)) return 0;
  const anchorSec = seconds[ANCHOR_SHAPE]?.[ANCHOR_TIER];
  const anchorDmg = damage[ANCHOR_TIER];
  const sec = seconds[shape]?.[tier];
  if (!(anchorSec > 0) || !(anchorDmg > 0) || !(sec > 0)) return 0;
  return (anchorDmg / anchorSec) * (sec / n) * (risk > 0 ? risk : 1);
}

/**
 * **第一個**值 ≥ `want` 的傷害級距；全部都不夠就回最大的那一格。
 * ⚠️ 帶 1e-9 的容差：`required` 走過兩次浮點除法，`X.0000000000005 > X`
 * 會讓一格無聲地跳到下一級（而畫面上完全看不出來）。
 */
export function tierAtLeast(
  damage: DamageTiers["damage"],
  want: number,
): DamageTierName {
  for (const name of DAMAGE_TIER_NAMES) {
    if (damage[name] + 1e-9 >= want) return name;
  }
  return DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!;
}

/** 形狀 → 冷卻級距 → **最低**傷害級距。整張表，一條公式推出來。 */
export function deriveMinDamageTier(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
  risk: AimRiskMult = NO_AIM_RISK,
): Record<CooldownShape, Record<SkillTierName, DamageTierName>> {
  const out = {} as Record<CooldownShape, Record<SkillTierName, DamageTierName>>;
  for (const shape of COOLDOWN_SHAPES) {
    const row = {} as Record<SkillTierName, DamageTierName>;
    for (const tier of SKILL_TIER_NAMES) {
      row[tier] = tierAtLeast(
        damage,
        requiredDamage(seconds, damage, hits, shape, tier, risk[shape] ?? 1),
      );
    }
    out[shape] = row;
  }
  return out;
}

/* ── 兩個係數的**推導**（⛔ 一個字面值都沒有，全部從出貨的三張表反算） ──────── */

/**
 * 方案 B 的係數：`expectedHits[範圍]` 要多少，才會長出 {@link OWNER_20260819_CELL}。
 * ⭐ 反算，⛔ 不是我挑的 0.67 —— 級距表哪天動了，它自己跟著動。
 */
export function ownerCellHits(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
): number {
  const { shape, tier, damageTier } = OWNER_20260819_CELL;
  const rate = damage[ANCHOR_TIER] / seconds[ANCHOR_SHAPE][ANCHOR_TIER];
  const want = damage[damageTier];
  if (!(want > 0)) return DEFAULT_EXPECTED_HITS[shape];
  return (rate * seconds[shape][tier]) / want;
}

/**
 * 方案 C 的係數：**瞄準風險倍率**要多少，才會長出同一格 —— 而
 * `expectedHits`（owner 的「2 個人」）**一個字都不動**。
 */
export function ownerCellAimRisk(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
): number {
  const { shape, tier, damageTier } = OWNER_20260819_CELL;
  const base = requiredDamage(seconds, damage, hits, shape, tier);
  if (!(base > 0)) return 1;
  return damage[damageTier] / base;
}

/**
 * 出貨的瞄準風險倍率。⭐ 只有 {@link OWNER_20260819_CELL} 的那個形狀不是 1 ——
 * 而它的值是**反算**出來的（＝ 選了 `aimRisk` 就會拿到 owner 手填的那一格）。
 * ⚠️ 出貨模型是 `formula`，所以這一格**現在不生效**；它是為了讓「切過去」
 * 這件事不需要再填第二個數字。
 */
export const DEFAULT_AIM_RISK_MULT: AimRiskMult = Object.freeze(
  Object.fromEntries(
    COOLDOWN_SHAPES.map((s) => [
      s,
      s === OWNER_20260819_CELL.shape
        ? ownerCellAimRisk(
            DEFAULT_COOLDOWN_TIERS.seconds,
            DEFAULT_DAMAGE_TIERS.damage,
            DEFAULT_EXPECTED_HITS,
          )
        : 1,
    ]),
  ) as Record<CooldownShape, number>,
);

/** 一個模型實際會餵進公式的兩個係數。⛔ `custom` 不推導（見 {@link tableForModel}）。 */
export function coefficientsForModel(
  model: ProportionalityModel,
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
  risk: AimRiskMult,
): { hits: ExpectedHits; risk: AimRiskMult } {
  if (model === "ownerCell") {
    return {
      hits: Object.freeze({
        ...hits,
        [OWNER_20260819_CELL.shape]: ownerCellHits(seconds, damage),
      }) as ExpectedHits,
      risk: NO_AIM_RISK,
    };
  }
  if (model === "aimRisk") return { hits, risk };
  return { hits, risk: NO_AIM_RISK };
}

/**
 * 一個模型的十五格。`custom` ⇒ 原封不動用 `stored`（⭐ 那是**單格破例**的住處，
 * 也是 2026-08-20 之前的行為）；讀不到 `stored` 就退回公式，⛔ 不回空表。
 */
export function tableForModel(
  model: ProportionalityModel,
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
  risk: AimRiskMult,
  stored?: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<CooldownShape, Record<SkillTierName, DamageTierName>> {
  if (model === "custom" && stored) {
    const out = {} as Record<CooldownShape, Record<SkillTierName, DamageTierName>>;
    const fallback = deriveMinDamageTier(seconds, damage, hits);
    for (const shape of COOLDOWN_SHAPES) {
      const row = {} as Record<SkillTierName, DamageTierName>;
      for (const tier of SKILL_TIER_NAMES) {
        const v = stored[shape]?.[tier];
        row[tier] = DAMAGE_TIER_NAMES.includes(v as DamageTierName)
          ? (v as DamageTierName)
          : fallback[shape][tier];
      }
      out[shape] = row;
    }
    return out;
  }
  const c = coefficientsForModel(model, seconds, damage, hits, risk);
  return deriveMinDamageTier(seconds, damage, c.hits, c.risk);
}

/**
 * 三個模型 × **完整十格**，一段字。
 *
 * ⭐ 它是 `.describe()` 與後台說明的**唯一**來源：owner 選一個模型之前，看得到
 * 的必須是「它會長出什麼」，⛔ 不是「這是方案 B」這種只有名字的字。
 * ⛔ 十格從表推，⛔ 不抄字面值（第二守則：抄一份就是第四個住處）。
 *
 * ⚠️ 只列 `單體` 與 `範圍` 十格：`變身` 的 `expectedHits` 是 0 ＝ **整個形狀
 * 豁免**，它在每一個模型下都是同一列「不構成限制」。
 */
export function describeProportionalityModels(
  seconds: CooldownTiers["seconds"],
  damage: DamageTiers["damage"],
  hits: ExpectedHits,
  risk: AimRiskMult,
): string {
  const rows: readonly CooldownShape[] = COOLDOWN_SHAPES.filter((s) => (hits[s] ?? 0) > 0);
  const line = (model: ProportionalityModel): string => {
    const t = tableForModel(model, seconds, damage, hits, risk);
    return rows.map((s) => `${s}＝${SKILL_TIER_NAMES.map((k) => t[s][k]).join("/")}`).join("　");
  };
  const why: Record<Exclude<ProportionalityModel, "custom">, string> = {
    formula: `照 owner 2026-08-20 的公式（期望命中人數不動）`,
    ownerCell: `把「範圍」的期望命中人數改寫成 ${ownerCellHits(seconds, damage).toFixed(2)} 人，` +
      `好讓 owner 2026-08-19 手填的「${OWNER_20260819_CELL.shape}・${OWNER_20260819_CELL.tier}` +
      ` → ${OWNER_20260819_CELL.damageTier}」重現`,
    aimRisk: `期望命中人數維持 owner 親口說的數字，另乘一格瞄準風險 ` +
      `×${ownerCellAimRisk(seconds, damage, hits).toFixed(2)}（同樣重現那一格）`,
  };
  return (
    `⭐ 十格結果（順序＝${SKILL_TIER_NAMES.join("/")}）：` +
    `【formula】${why.formula}　→　${line("formula")}｜` +
    `【ownerCell】${why.ownerCell}　→　${line("ownerCell")}｜` +
    `【aimRisk】${why.aimRisk}　→　${line("aimRisk")}｜` +
    `【custom】不推導，直接吃下面手填的十五格（＝ 2026-08-20 之前的行為）。` +
    `⚠️ ownerCell 與 aimRisk 的十格**逐格相同** —— 差別在哪一個數字被改寫：` +
    `前者改掉 owner 說的「2 個人」，後者讓它原封不動。⚠️ 違反一律只**警告不擋**。`
  );
}

/** 一份 `expectedHits` 的正規化。認不得的形狀／值 → 出貨值。 */
export function expectedHitsFromDoc(raw: unknown): ExpectedHits {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Record<CooldownShape, number>;
  for (const shape of COOLDOWN_SHAPES) {
    const v = rec[shape];
    out[shape] =
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(Math.max(v, EXPECTED_HITS_MIN), EXPECTED_HITS_MAX)
        : DEFAULT_EXPECTED_HITS[shape];
  }
  return Object.freeze(out);
}

/** 一份 `aimRiskMult` 的正規化。認不得的形狀／值 → 出貨值。 */
export function aimRiskFromDoc(raw: unknown): AimRiskMult {
  const rec = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Record<CooldownShape, number>;
  for (const shape of COOLDOWN_SHAPES) {
    const v = rec[shape];
    out[shape] =
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(Math.max(v, AIM_RISK_MIN), AIM_RISK_MAX)
        : DEFAULT_AIM_RISK_MULT[shape];
  }
  return Object.freeze(out);
}

/** 一格 `model` 的正規化。⛔ 認不得就是**出貨模型**，不是「關掉」。 */
export function proportionalityModelFromDoc(raw: unknown): ProportionalityModel {
  return (PROPORTIONALITY_MODELS as readonly string[]).includes(raw as string)
    ? (raw as ProportionalityModel)
    : DEFAULT_PROPORTIONALITY_MODEL;
}
