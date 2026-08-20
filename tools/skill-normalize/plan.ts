#!/usr/bin/env tsx
/**
 * ⭐【420 支技能正規化 —— **一趟算完**的計畫產生器】
 *
 * owner 2026-08-21：
 * > 「盡量**寫 script 自動化完成**，而不是全部都要 LLM 判斷」
 * > 「**一個檔案一次改完** —— 五欄級距 + 說明改寫 + 說明↔JSON 對照**同一趟**，
 * >  ⛔ 不要分三遍掃」
 *
 * ⛔ 這一支**不寫任何 content/ 檔案**。它只產出兩份東西：
 *   ① 機器可讀的計畫（JSON）—— 下一階段的寫入器吃它
 *   ② 一份給 owner 看的 md
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 它一趟讀完什麼（⛔ 不讀三遍）
 *
 * | 來源 | 讀幾次 | 拿到什麼 |
 * |---|---|---|
 * | `ContentLoader.load()` + `registerAll()` | **1** | 出貨註冊表（含 95 支 `template.ref` 展開後的效果樹） |
 * | `content/abilities/*.json` | **1** | `provenance`（＝寫入路徑）、已經填了哪幾格級別 |
 * | `Configs.all()` | **1** | 五張級距表（⛔ 不抄字面值） |
 * | `packages/shared/testkit/balancePopulation` | **1** | 49 位對戰可選本體（⛔ 不是 71 檔） |
 *
 * ⭐ **每一段判斷都是重用既有的出貨程式**，⛔ 沒有第二份正則、第二張表：
 *   · 台詞剝除 → `descriptionClaims.mechanicsText`（與 `batch1.py::_mechanics_text()`
 *     逐字同構，兩邊都由 `abilityProse.test.ts` / `descriptionClaims.test.ts` 守著）
 *   · 說明↔JSON → `descriptionClaims.scanAbility`（已有 57 份分片 baseline）
 *   · 說明改寫 → `abilityProse.placeholderizeAbilityText`（唯一的算繪處）
 *   · 冷卻級距 → `lowDamageCells.placeAbility` + `cooldownTiers.cooldownShapeOf`
 *   · 就近收 → `skillTiers.snapToTier` / `snapGap`
 *   · 招牌傷害 → `tierSnap.headlineDamage`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 五個決策點，五格開關（第一守則：⛔ 不是挑一個然後在註解裡辯護）
 *
 * ⚠️ 這一階段是**計畫**，所以開關住在 CLI；⛔ 但它們的最終住處是三個地方
 * （`content/config/*.json` + Zod `DEFAULT_*` + admin `SHIPPED_*`）——
 * 寫入階段要把預設值搬過去，⛔ 不可以留在這裡當寫死的常數。
 * 每一格的「預設為什麼選這個 · 後悔時怎麼一鍵 rollback」印在產出的 md 裡。
 *
 * ⛔ 刻意**沒有產生日期**寫進 JSON（同 `caps:export` / `spec:build`）：
 * 任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬 ——
 * 而一條被放寬的閘等於沒有閘。md 的檔名帶時間戳（`_temp_` 慣例），內容不帶。
 *
 * 用法：
 *   pnpm tsx tools/skill-normalize/plan.ts
 *   pnpm tsx tools/skill-normalize/plan.ts --md docs/技能正規化計畫_temp_20260821-0130.md
 *   pnpm tsx tools/skill-normalize/plan.ts --damage-agg headline --snap-policy down
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ContentLoader } from "../../packages/shared/src/content/loader";
import { FsContentSource } from "../../packages/shared/src/content/node/FsContentSource";
import { Arenas, Configs, registerAll } from "../../packages/shared/src/content/registries";
import { Abilities } from "../../packages/shared/src/sim/content/registry";
import { balanceAbilityOwners, BALANCE_POPULATION_PROVENANCE } from "../../packages/shared/testkit/balancePopulation";
import {
  SKILL_TIER_NAMES,
  SNAP_POLICIES,
  snapGap,
  snapToTier,
  type SkillTierName,
  type SnapPolicy,
} from "../../packages/shared/src/content/skillTiers";
import { aoeTiersFromDoc } from "../../packages/shared/src/content/aoeTiers";
import { rangeTiersFromDoc } from "../../packages/shared/src/content/rangeTiers";
import {
  displacementTiersFromDoc,
  minBodyRadiusFromConfigs,
} from "../../packages/shared/src/content/displacementTiers";
import { cooldownTiersFromDoc, cooldownShapeOf } from "../../packages/shared/src/content/cooldownTiers";
import { damageTiersFromDoc } from "../../packages/shared/src/content/damageTiers";
import { tierSnapFromDoc, headlineDamage } from "../../packages/shared/src/content/tierSnap";
import { lowDamageCells, placeAbility } from "../../packages/shared/src/content/lowDamageCells";
import {
  abilityQuantities,
  placeholderizeAbilityText,
  type ProseFinding,
  type ProseTables,
} from "../../packages/shared/src/content/abilityProse";
import { scanAbility, mechanicsText, type Mismatch } from "../../packages/shared/src/content/descriptionClaims";

import type { AbilityDef } from "../../packages/shared/src/sim/content/defs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(REPO, "content");
const ABIL_DIR = join(CONTENT, "abilities");

/**
 * ⚠️ ⛔ **刻意不 import `descriptionClaims.baseline`** —— 那支模組在 import 的當下就
 * 讀完整個分片目錄，而它對「空殼分片」（`[]`）是 **throw**（`baselineShards.ts:49`）。
 *
 * ⭐ 這不是假想的：2026-08-21 03:00 工作區裡 `godie-udea.json` 正好是 `[]`
 * （另一條 lane 修完那一位但還沒刪檔，幾分鐘後才刪掉），而那幾分鐘裡**任何**
 * import 它的工具都會在載入期直接死掉 —— 一支唯讀的計畫產生器不該被別條 lane
 * 的半成品擋住。
 * ⇒ 這裡自己讀目錄，並且把空殼**列進 `meta.emptyClaimShards`**
 *（⛔ 不是靜默跳過，也 ⛔ 不替別條 lane 刪檔）。
 */
const CLAIMS_BASELINE_DIR = join(REPO, "packages/shared/src/content/descriptionClaims.baseline");

/* ─────────────────────────────  開關  ───────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
};

/** ⭐ 開關①：多發技能的傷害怎麼合計。owner 2026-08-21 裁決 A ⇒ 預設 `total`。 */
const DAMAGE_AGG = flag("damage-agg", "total") as "total" | "headline";
/** ⭐ 開關②：自由數字往哪一格收。出貨 `SNAP_POLICIES[0]` ⇒ 預設 `nearest`。 */
const SNAP_POLICY = flag("snap-policy", SNAP_POLICIES[0]) as SnapPolicy;
/** ⭐ 開關③：卡面只印其中一階時綁不綁。`placeholderizeAbilityText` 出貨預設 `bind`。 */
const PROSE_PARTIAL = flag("prose-partial", "bind") as "bind" | "keep";
/** ⭐ 開關④：有條件風險的技能允不允許超出級距上限（天譴）。預設 `on`。 */
const RISK_ALLOWANCE = flag("risk-allowance", "on") === "on";
/** ⭐ 開關⑤：離最近一級多遠才叫「收進去會改變手感」。與 `tiers:build` 同一個數字。 */
const GAP_ALERT = Number(flag("gap-alert", "0.25"));

const stamp = (): string => {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};
const JSON_OUT = flag("json", join(REPO, "docs/_plans/skill-normalize-plan.json"));
const MD_OUT = flag("md", join(REPO, `docs/技能正規化計畫_temp_${stamp()}.md`));

/* ─────────────────────────────  型別  ───────────────────────────── */

type Axis = "cooldown" | "manaCost" | "damage" | "range" | "radius";

interface Column {
  /** 適用 / 不適用 —— ⛔ 不適用不塞 0 */
  readonly applicable: boolean;
  /** 不適用的**理由**（⛔ 不可以是空字串） */
  readonly notApplicable?: string;
  /** JSON 已經填了的級別（沒填 = undefined） */
  readonly authored?: SkillTierName;
  /** 引擎現值（卡面單位） */
  readonly value?: number;
  /** 依現值就近收會落在哪一級 */
  readonly suggested?: SkillTierName;
  /** 離那一級多遠（相對級距值） */
  readonly gap?: number;
  /** 這個值是怎麼算出來的（多發技能的總計式子） */
  readonly basis?: string;
  /** 已填的級別與建議是否一致 */
  readonly agrees?: boolean;
}

interface Unknown_ {
  readonly code: string;
  readonly why: string;
}

interface Row {
  readonly id: string;
  readonly name: string;
  readonly num: string;
  readonly file: string;
  readonly championId: string;
  /** `owner-spec` ⇒ 產生器擁有（改 `tools/skill-remake/heroes/*.py`）；`w3x-import` ⇒ 直接改 JSON */
  readonly provenance: string;
  readonly writePath: "產生器" | "JSON";
  readonly inBalancePopulation: boolean;
  readonly fromTemplate: boolean;
  readonly columns: Readonly<Record<Axis, Column>>;
  /** 有條件風險（⭐ 從結構推導，⛔ 不是一張手寫豁免名單） */
  readonly riskFactors: readonly string[];
  readonly damage: {
    readonly headline: number;
    readonly guaranteed: number;
    readonly ceiling: number;
  };
  /**
   * ⭐ 相稱性用哪個數字 —— ⛔ 這是**規則**不是名單。
   * `riskFactors` 非空（連鎖要湊人數、隨機落點要看站位、持續傷害要目標活著）
   * ⇒ 用 `guaranteed`，並且允許 `ceiling` 超出級距上限（owner 對天譴的裁決）。
   */
  readonly proportionality: {
    readonly basis: "guaranteed" | "ceiling";
    readonly value: number;
    readonly tier?: SkillTierName;
    readonly overCapAllowed: boolean;
    readonly why: string;
  };
  readonly prose: {
    readonly current: string;
    /** ⭐ 剝掉角色對白 `「…」` 之後的**機制文字**（第〇·六守則②） */
    readonly mechanics: string;
    readonly target: string;
    readonly changed: boolean;
    readonly findings: readonly ProseFinding[];
  };
  readonly claims: readonly (Mismatch & { readonly known: boolean })[];
  readonly unknowns: readonly Unknown_[];
}

/* ────────────────────────  多發技能的總計  ──────────────────────── */

const numOf = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (Array.isArray(v)) {
    let m: number | undefined;
    for (const x of v) {
      const n = numOf(x);
      if (n !== undefined) m = m === undefined ? n : Math.max(m, n);
    }
    return m;
  }
  return undefined;
};

/** 一片傷害葉的量 —— ⛔ 不看 `ratios` / `attrRatios`（那是成長，不是卡面基礎值）。 */
function leafAmount(a: unknown): number {
  if (typeof a === "number") return Number.isFinite(a) ? a : 0;
  if (Array.isArray(a)) return a.reduce<number>((m, x) => Math.max(m, leafAmount(x)), 0);
  if (a !== null && typeof a === "object") {
    let m = 0;
    for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
      if (k === "ratios" || k === "attrRatios" || k === "damageTier") continue;
      m = Math.max(m, leafAmount(v));
    }
    return m;
  }
  return 0;
}

/** ⭐ 與 `tierSnap.DAMAGE_KINDS` 同一份名單（⛔ 不另立一組）。 */
const DAMAGE_KINDS = new Set([
  "damage",
  "damageArea",
  "damageLine",
  "dot",
  "damageOverTime",
  "chainLightning",
]);
const AMOUNT_KEYS = ["amount", "amountPerTick"] as const;

interface DamageProfile {
  /** 單發最大（＝ `headlineDamage` 的口徑，開關 rollback 用） */
  readonly headline: number;
  /** ⭐ **保證吃到**的總量：1 個敵人、站著不動。連鎖只算第一跳 */
  readonly guaranteed: number;
  /** ⭐ **有效覆蓋上限**：條件全部成立時的總量（連鎖跳滿、隨機落點全中） */
  readonly ceiling: number;
  readonly basis: readonly string[];
  readonly risks: readonly string[];
  readonly unknowns: readonly Unknown_[];
}

/**
 * ⭐ 多發技能的傷害總計（owner 2026-08-21 裁決 A：「傷害 = 每發 × 發數 × 遞減」）。
 *
 * ⚠️ **兩個數字，⛔ 不是一個**。`guaranteed` 與 `ceiling` 分開，是因為 owner 對
 * 天譴（`godie-udea.r`）的裁決逐字：
 * > 「他要有**足夠多敵人在範圍內**才有連鎖加成效果，算是有**額外條件風險**」
 *
 * ⇒ 相稱性要能表達「有條件風險，允許超出上限」，而那必須是**從結構推導**的
 * （`riskFactors` 非空），⛔ 不是一張沒有理由的豁免名單。一支新的連鎖技能明天長出來，
 * 它自動拿到同一個待遇；⛔ 沒有人要記得去補名單。
 *
 * ⚠️ 每一種倍率都必須說得出它乘的是什麼，說不出來的一律進 `unknowns`
 * （⛔ 不猜：一個猜出來的倍率會產生一個看起來有來源的假數字）。
 */
function damageProfile(def: unknown): DamageProfile {
  const basis: string[] = [];
  const risks: string[] = [];
  const unknowns: Unknown_[] = [];
  let guaranteed = 0;
  let ceiling = 0;

  const walk = (n: unknown, gMult: number, cMult: number, trail: string): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x, gMult, cMult, trail);
      return;
    }
    if (n === null || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    const kind = typeof rec["kind"] === "string" ? (rec["kind"] as string) : undefined;

    let g = gMult;
    let c = cMult;
    let label = trail;

    // ── 連鎖：每跳乘一次 decay ⇒ 等比級數。⛔ 保證那一半只算第一跳 ──────────
    if (kind === "chainLightning") {
      const jumps = Math.max(1, Math.round(numOf(rec["jumps"]) ?? 1));
      const d = numOf(rec["decay"]) ?? 1;
      const series = d >= 1 ? jumps : (1 - Math.pow(d, jumps)) / (1 - d);
      c *= series;
      label = `${label}×連鎖(1-${d}^${jumps})/(1-${d})=${round2(series)}`;
      risks.push(`連鎖需要 ${jumps} 個敵人依序落在跳躍範圍內才吃得滿（單一敵人只吃第 1 跳）`);
    }
    // ── 持續傷害：ticks = duration / intervalSec ────────────────────────────
    else if (kind === "dot") {
      const dur = numOf(rec["duration"]) ?? numOf(rec["durationSec"]);
      const iv = numOf(rec["intervalSec"]);
      if (dur !== undefined && iv !== undefined && iv > 0) {
        const ticks = Math.max(1, Math.floor(dur / iv));
        g *= ticks;
        c *= ticks;
        label = `${label}×${ticks}跳(${dur}s÷${iv}s)`;
        risks.push(`持續傷害要目標活滿 ${dur} 秒才吃得滿`);
      } else {
        unknowns.push({
          code: "dot-ticks-unknown",
          why: `dot 少了 duration 或 intervalSec（duration=${dur ?? "—"} / intervalSec=${iv ?? "—"}）⇒ ⛔ 不猜跳數`,
        });
      }
    }
    // ── 重複施放 / 隨機落點：count 發 ──────────────────────────────────────
    else if (kind === "delayed" || kind === "randomArea") {
      const count = numOf(rec["count"]);
      if (count !== undefined && count > 1) {
        c *= count;
        label = `${label}×${count}發`;
        if (kind === "delayed") {
          g *= count;
          risks.push(`分 ${count} 次投放，要目標留在原地才吃得滿`);
        } else {
          // 隨機落點：⛔ 單一目標**不保證**吃滿（那是 scatterRadius 的覆蓋問題）
          risks.push(`${count} 發隨機落在散佈半徑內 —— 單一目標吃到幾發取決於站位`);
        }
      }
    }
    // ── 形狀說不清楚的：⛔ 標出來，不猜 ────────────────────────────────────
    if (rec["segmentCount"] !== undefined) {
      unknowns.push({
        code: "segment-shape-unclear",
        why: `帶 segmentCount=${String(rec["segmentCount"])} —— 一個目標會吃到幾段是**幾何**問題，⛔ script 判斷不了`,
      });
    }

    if (kind !== undefined && DAMAGE_KINDS.has(kind)) {
      for (const k of AMOUNT_KEYS) {
        if (rec[k] === undefined) continue;
        const amt = leafAmount(rec[k]);
        if (amt <= 0) {
          unknowns.push({
            code: "damage-scaling-only",
            why: `${kind}.${k} 只有 ratios/attrRatios（成長），沒有卡面基礎值 ⇒ ⛔ 無法定傷害級距`,
          });
          continue;
        }
        guaranteed += amt * g;
        ceiling += amt * c;
        basis.push(`${kind}.${k}=${amt}${label}`);
      }
    }

    for (const v of Object.values(rec)) walk(v, g, c, label);
  };

  const d = (def ?? {}) as Record<string, unknown>;
  walk([d["effects"], d["passive"], d["marks"], d["toggle"]], 1, 1, "");
  return {
    headline: headlineDamage(def),
    guaranteed: round2(guaranteed),
    ceiling: round2(ceiling),
    basis,
    risks: [...new Set(risks)],
    unknowns,
  };
}

/* ────────────────────────  有效覆蓋（範圍）  ──────────────────────── */

/** 「這一格算不算**有效覆蓋**」。⭐ 多發技能用散佈半徑，⛔ 不是每一發自己的半徑。 */
const COVERAGE_KEYS: readonly string[] = [
  "radius",
  "scatterRadius",
  "landRadius",
  "segmentAoe",
  "jumpRange",
];

function coverage(def: unknown): { value: number; basis: string; lineOnly: boolean } {
  let best = 0;
  let basis = "";
  let lineOnly = false;
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (n === null || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    for (const k of COVERAGE_KEYS) {
      const v = numOf(rec[k]);
      if (v !== undefined && v > best) {
        best = v;
        basis = k;
      }
    }
    if (rec["length"] !== undefined && rec["width"] !== undefined) lineOnly = true;
    for (const v of Object.values(rec)) walk(v);
  };
  const d = (def ?? {}) as Record<string, unknown>;
  const top = numOf(d["radius"]);
  if (top !== undefined && top > best) {
    best = top;
    basis = "radius（頂層）";
  }
  walk([d["effects"], d["passive"], d["marks"], d["toggle"]]);
  return { value: best, basis, lineOnly };
}

/* ─────────────────────────────  工具  ───────────────────────────── */

const round2 = (x: number): number => Math.round(x * 100) / 100;
const abilityNumber = (s: string | undefined): string => (s ?? "").match(/^(\d\d-\d{2,3})/)?.[1] ?? "";

const NA = (why: string): Column => ({ applicable: false, notApplicable: why });

function col(
  value: number,
  table: Readonly<Record<SkillTierName, number>>,
  authored: SkillTierName | undefined,
  basis?: string,
): Column {
  const suggested = snapToTier(value, table, SNAP_POLICY);
  const gap = round2(snapGap(value, table, SNAP_POLICY));
  return {
    applicable: true,
    ...(authored !== undefined ? { authored } : {}),
    value: round2(value),
    suggested,
    gap,
    ...(basis !== undefined && basis !== "" ? { basis } : {}),
    ...(authored !== undefined ? { agrees: authored === suggested } : {}),
  };
}

const tierOf = (v: unknown): SkillTierName | undefined =>
  typeof v === "string" && (SKILL_TIER_NAMES as readonly string[]).includes(v)
    ? (v as SkillTierName)
    : undefined;

/**
 * 磁碟上那份文件裡**已經填了**哪一格級別。
 *
 * ⚠️ **一定要深走訪** —— `damageTier` 住在 `amount` 上（199 筆全部是巢狀），
 * `radiusTier` 兩種都有（21 筆頂層 + 38 筆巢狀在效果上）。只讀頂層的話
 * 「已填級別」會少報 38 支，而那個數字看起來完全正常（失敗形態⑦）。
 */
function authoredTier(disk: unknown, key: string): SkillTierName | undefined {
  let found: SkillTierName | undefined;
  const walk = (n: unknown): void => {
    if (found !== undefined) return;
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (n === null || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    const t = tierOf(rec[key]);
    if (t !== undefined) {
      found = t;
      return;
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(disk);
  return found;
}

/* ─────────────────────────────  主流程  ───────────────────────────── */

async function build(): Promise<{ rows: Row[]; meta: Record<string, unknown> }> {
  // ── ① 出貨內容，讀**一次** ───────────────────────────────────────────────
  const loaded = await new ContentLoader(new FsContentSource(CONTENT)).load();
  registerAll(loaded.store);

  const cfgs = Configs.all() as unknown as { schema?: string }[];
  const pick = (s: string): unknown => cfgs.find((c) => c.schema === s);
  const aoe = aoeTiersFromDoc(pick("config.aoe-tiers@1"));
  const rng = rangeTiersFromDoc(pick("config.range-tiers@1"));
  const cds = cooldownTiersFromDoc(pick("config.cooldown-tiers@1"));
  const dmgT = damageTiersFromDoc(pick("config.damage-tiers@1"));
  const snap = tierSnapFromDoc(pick("config.tier-snap@1"));
  const disp = displacementTiersFromDoc(
    pick("config.displacement-tiers@1"),
    minBodyRadiusFromConfigs(cfgs as never),
  );
  const zoneRadius = Math.min(...Arenas.all().flatMap((a) => a.zones.map((z) => z.boundaryRadius)));
  const tables: ProseTables = {
    range: rng.range,
    radius: aoe.radius,
    travel: Object.fromEntries(
      Object.entries(disp.travel).map(([k, v]) => [k, v.distance]),
    ) as Readonly<Record<SkillTierName, number>>,
    push: Object.fromEntries(
      Object.entries(disp.push).map(([k, v]) => [k, v.distance]),
    ) as Readonly<Record<SkillTierName, number>>,
    zoneRadius,
  };
  const cells = lowDamageCells(cds.seconds, dmgT.damage);

  // ── ② 磁碟那一份，讀**一次** ────────────────────────────────────────────
  const disk = new Map<string, Record<string, unknown>>();
  for (const f of readdirSync(ABIL_DIR)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(join(ABIL_DIR, f), "utf8")) as Record<string, unknown>;
    disk.set(String(d["id"]), { ...d, __file: `content/abilities/${f}` });
  }

  // ── ③ 平衡母體（49 位可選本體），讀**一次** ─────────────────────────────
  const owners = balanceAbilityOwners(REPO);

  // ── ④ 已知的說明↔JSON 不一致（棘輪 baseline），讀**一次** ────────────────
  const known = new Set<string>();
  const emptyShards: string[] = [];
  for (const f of readdirSync(CLAIMS_BASELINE_DIR)) {
    if (!f.endsWith(".json")) continue;
    const keys = JSON.parse(readFileSync(join(CLAIMS_BASELINE_DIR, f), "utf8")) as string[];
    if (keys.length === 0) emptyShards.push(f);
    for (const k of keys) known.add(k);
  }

  // ── ⑤ 逐支：五欄 + 說明 + 對照 + 判斷不了，**同一趟** ────────────────────
  const rows: Row[] = [];
  for (const def of Abilities.all()) {
    const d = def as unknown as Record<string, unknown>;
    const id = String(d["id"]);
    const raw = disk.get(id);
    if (raw === undefined) continue; // 註冊表裡但磁碟沒有 ⇒ 不是這一批（模板/道具）
    const name = String(d["name"] ?? id);
    const championId = id.split(".")[0]!;
    const unknowns: Unknown_[] = [];

    // 五欄 ────────────────────────────────────────────────────────────────
    const dmg = damageProfile(def);
    unknowns.push(...dmg.unknowns);

    // (a) 冷卻 —— 重用 `placeAbility`（形狀判斷⛔不重寫一份）
    const place = placeAbility(raw as never, cells, cds);
    const cdCol: Column =
      place === null
        ? NA("沒有冷卻（被動 / 常駐 / cooldown 全 0）")
        : col(place.seconds, cds.seconds[place.shape], tierOf(raw["cooldownTier"]), `形狀=${place.shape}`);

    // (b) 耗魔 —— ⭐ 2026-08-21 起這一軸**真的有一格欄位**了
    //     （`ability@1.manaCostTier` + `config.mana-tiers@1` + `resolveManaCostTier`）。
    //     ⚠️ 在那之前這裡只能「現算一個建議級別」而 `authored` 恆為 undefined，
    //     於是報告上的「已填 0 支」讀起來像 212 支漏填 —— 真相是**機制沒做**。
    const manaArr = Array.isArray(d["manaCost"]) ? (d["manaCost"] as unknown[]) : [];
    const manaMax = manaArr.reduce<number>((m, x) => Math.max(m, numOf(x) ?? 0), 0);
    const mpCol: Column =
      manaMax > 0
        ? col(manaMax, snap.manaCost, tierOf(raw["manaCostTier"]), "manaCost 最大階")
        : NA("不耗魔（manaCost 全 0）");

    // (c) 傷害 —— ⭐ 多發用總計 / 有效覆蓋（owner 2026-08-21 裁決 A）
    const dmgValue = DAMAGE_AGG === "headline" ? dmg.headline : dmg.ceiling;
    const dmgCol: Column =
      dmgValue > 0
        ? col(dmgValue, dmgT.damage, authoredTier(raw, "damageTier"), dmg.basis.join(" + "))
        : NA(dmg.headline > 0 ? "傷害只有成長係數，沒有卡面基礎值" : "不造成傷害（輔助 / 位移 / 增益）");

    // (d) 施法距離
    const range = numOf(d["range"]) ?? 0;
    const castType = String(d["castType"] ?? "");
    let rangeCol: Column;
    if (range > 0) {
      rangeCol = col(range, rng.range, tierOf(raw["rangeTier"]));
    } else if (castType === "self" || castType === "passive" || castType === "toggle") {
      rangeCol = NA(`自身施放（castType=${castType || "self"}）`);
    } else {
      rangeCol = NA(`range=0 但 castType=${castType}`);
      unknowns.push({
        code: "range-zero-but-targeted",
        why: `castType=${castType} 卻沒有施法距離 —— ⛔ script 判斷不了它是「近身」還是漏填`,
      });
    }

    // (e) 施法範圍 —— ⭐ 多發用散佈半徑
    const cov = coverage(def);
    let radiusCol: Column;
    if (cov.value > 0) {
      radiusCol = col(cov.value, aoe.radius, authoredTier(raw, "radiusTier"), cov.basis);
    } else if (cov.lineOnly) {
      radiusCol = NA("線狀範圍（length × width）—— 圓形半徑不適用");
      unknowns.push({
        code: "line-shape-no-radius",
        why: "線狀技能沒有圓形半徑；要不要給它一個等效級距是**設計**決定，⛔ script 不替 owner 挑",
      });
    } else {
      radiusCol = NA("單體 / 無範圍");
    }

    // 說明改寫 ─────────────────────────────────────────────────────────────
    const description = String(d["description"] ?? "");
    const q = abilityQuantities(def, tables);
    const rewrite = placeholderizeAbilityText(description, q, { partial: PROSE_PARTIAL });
    // ⚠️ `NUM_PATTERNS` 會對**同一個數字**吐出好幾個重疊的片段
    //    （「造成0.3秒暈眩158點」/「⋯158點傷害」/「158點傷害」＝同一句話的三個窗口）。
    //    ⇒ 用「這一軸 + 這個最大數字」收斂，⛔ 不然「判斷不了」的支數會被灌水三倍。
    const seenProse = new Set<string>();
    const biggest = (t: string): string => {
      const xs = (t.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      return xs.length === 0 ? t : String(Math.max(...xs));
    };
    for (const f of rewrite.findings) {
      if (f.rule !== "num-unbound" && f.rule !== "geo-no-engine-value") continue;
      const key = `${f.rule}|${f.slot}|${biggest(f.before)}`;
      if (seenProse.has(key)) continue;
      seenProse.add(key);
      unknowns.push(
        f.rule === "num-unbound"
          ? {
              code: "prose-number-unbound",
              why: `卡面「${f.before}」在 JSON 裡找不到對應的值 —— 要動的是平衡資料還是文案，⛔ script 判斷不了`,
            }
          : {
              code: "prose-geo-no-engine-value",
              why: `卡面「${f.before}」寫了幾何，引擎這一軸是空的 —— ⛔ 換佔位符只會讓一句做不到的宣稱更像真的`,
            },
      );
    }

    // 說明↔JSON 對照 ───────────────────────────────────────────────────────
    const claims = scanAbility(def as AbilityDef & { description?: string }).map((m) => ({
      ...m,
      known: known.has(`${id}|${m.rule}`),
    }));

    // 有條件風險（⭐ 從結構推導）───────────────────────────────────────────
    const riskFactors = [...dmg.risks];

    if (description.trim() === "") {
      unknowns.push({ code: "no-description", why: "沒有說明 —— 說明↔JSON 對照無從做起" });
    }
    // ⭐ 只在**真的有 `template.ref`** 時才叫。磁碟 `effects: []` 還有另一種
    //    完全正常的原因：內容住 `passive.ranks[].hooks[]`（例 20-002 解放）——
    //    ⛔ 把那些也標成「模板」是一句假話，而它會把寫入路徑指到不存在的地方。
    if (raw["template"] !== undefined) {
      unknowns.push({
        code: "effects-from-template",
        why: `效果住 template.ref（${String((raw["template"] as { ref?: unknown } | undefined)?.ref ?? "?")}）—— ⭐ 寫入路徑是**模板**，⛔ 不是這一份 JSON`,
      });
    }

    rows.push({
      id,
      name,
      num: abilityNumber(name),
      file: String(raw["__file"]),
      championId,
      provenance: String(raw["provenance"] ?? "(none)"),
      writePath: raw["provenance"] === "owner-spec" ? "產生器" : "JSON",
      inBalancePopulation: owners.has(championId),
      fromTemplate: raw["template"] !== undefined,
      columns: { cooldown: cdCol, manaCost: mpCol, damage: dmgCol, range: rangeCol, radius: radiusCol },
      riskFactors,
      damage: { headline: dmg.headline, guaranteed: dmg.guaranteed, ceiling: dmg.ceiling },
      proportionality: (() => {
        // ⭐ 相稱性一律看**保證吃到**的量：那是「這支技能穩定給你什麼」。
        // ⭐ 上限豁免的條件是**有條件的上檔**（`ceiling > guaranteed`），
        //    ⛔ 不是「有沒有風險字串」—— 12 段打同一個目標（蒼龍破）沒有上檔，
        //    它就該照全額被管；連鎖／隨機落點有上檔，才拿得到豁免（天譴）。
        const upside = dmg.ceiling > dmg.guaranteed + 0.01;
        const allowed = RISK_ALLOWANCE && upside && riskFactors.length > 0;
        const value = dmg.guaranteed;
        return {
          basis: "guaranteed" as const,
          value,
          ...(value > 0 ? { tier: snapToTier(value, dmgT.damage, SNAP_POLICY) } : {}),
          overCapAllowed: allowed,
          why: allowed
            ? `有條件的上檔（保證 ${dmg.guaranteed} → 上限 ${dmg.ceiling}）⇒ 允許超出級距上限`
            : upside
              ? "有上檔但豁免開關關著 ⇒ 照有效覆蓋上限管"
              : "沒有條件上檔（保證量＝上限）⇒ 照全額管",
        };
      })(),
      prose: {
        current: description,
        // ⭐ 重用 `descriptionClaims.mechanicsText`（與 `batch1.py::_mechanics_text()` 逐字同構）
        //    ⛔ 不寫第二份正則 —— 下一階段要讀機制文字時就讀這一格。
        mechanics: mechanicsText(description),
        target: rewrite.next,
        changed: rewrite.next !== description,
        findings: rewrite.findings,
      },
      claims,
      // ⛔ 逐字重複的那些收掉 —— `perRank` 讓同一個結論在同一支技能上出現 4 次
      //    （89-002 俄羅斯輪盤：同一句 `damage-scaling-only` × 6）。
      //    ⚠️ 收的是**逐字相同**的，⛔ 不是「看起來像」—— 兩個不同欄位的同型結論要各留一條。
      unknowns: [...new Map(unknowns.map((u) => [`${u.code}|${u.why}`, u])).values()],
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));

  const meta = {
    tool: "tools/skill-normalize/plan.ts",
    abilities: rows.length,
    /** ⚠️ 空殼分片 —— `baselineShards.loadShardedBaseline` 對它是 throw（見檔頭） */
    emptyClaimShards: emptyShards,
    balancePopulation: BALANCE_POPULATION_PROVENANCE,
    zoneRadius,
    knobs: {
      damageAgg: DAMAGE_AGG,
      snapPolicy: SNAP_POLICY,
      proseParital: PROSE_PARTIAL,
      riskAllowance: RISK_ALLOWANCE,
      gapAlert: GAP_ALERT,
    },
    tables: {
      cooldown: cds.seconds,
      manaCost: snap.manaCost,
      damage: dmgT.damage,
      range: rng.range,
      radius: aoe.radius,
    },
  };
  return { rows, meta };
}

/* ─────────────────────────────  報表  ───────────────────────────── */

const AXES: readonly { key: Axis; zh: string }[] = [
  { key: "cooldown", zh: "冷卻 cooldownTier" },
  { key: "manaCost", zh: "耗魔 manaCostTier" },
  { key: "damage", zh: "傷害 damageTier" },
  { key: "range", zh: "施法距離 rangeTier" },
  { key: "radius", zh: "施法範圍 radiusTier" },
];

function markdown(rows: Row[], meta: Record<string, unknown>): string {
  const L: string[] = [];
  const p = (s = ""): void => void L.push(s);
  const pct = (n: number, d: number): string => (d === 0 ? "—" : `${Math.round((n / d) * 1000) / 10}%`);
  const N = rows.length;
  const pop = rows.filter((r) => r.inBalancePopulation);

  p("# 技能正規化計畫 —— 420 支一趟算完");
  p();
  p("> ⚙️ 這一份是 `pnpm tsx tools/skill-normalize/plan.ts` **產生的**。");
  p("> ⛔ 這一階段**不改任何 `content/` 檔案** —— 它只回答「該改成什麼」。");
  p(`> 機器可讀的那一份：\`${JSON_OUT.replace(REPO + "/", "")}\``);
  p();
  p("---");
  p();
  p("## 〇 · 母體與寫入路徑（⭐ 先分堆，⛔ 不要混著改）");
  p();
  p(`| | 支數 | 寫入路徑 | ⛔ 弄錯的代價 |`);
  p(`|---|---:|---|---|`);
  const gen = rows.filter((r) => r.writePath === "產生器");
  const jsn = rows.filter((r) => r.writePath === "JSON");
  p(
    `| \`provenance: owner-spec\` | **${gen.length}** | 改 \`tools/skill-remake/heroes/*.py\` 再跑 \`batch1.py\` | 直接改 JSON ⇒ 下一次 \`skills:sync\` **逐位元組蓋回去**（GH#319 的形狀） |`,
  );
  p(
    `| \`provenance: w3x-import\` | **${jsn.length}** | 直接改 \`content/abilities/*.json\` | — |`,
  );
  p(`| **合計** | **${N}** | | |`);
  p();
  const tpl = rows.filter((r) => r.fromTemplate);
  p(
    `⚠️ 另有 **${tpl.length}** 支的 \`effects\` 住在 \`template.ref\` —— 它們的**效果**要改模板，` +
      `⛔ 不是改技能 JSON（改了也不會生效，而且沒有任何東西會紅）。`,
  );
  p();
  const skel = rows.filter((r) => r.championId === "sela" || r.championId === "thorne");
  p(
    `⚠️ 那 ${jsn.length} 支裡有 **${skel.length}** 支是 \`sela\` / \`thorne\` 的 **fail-open 骨架**` +
      `（\`main.tsx\` 內容全毀時註冊的那兩隻）。它們沒有說明、玩家永遠選不到 ——` +
      `⭐ 級距與文案**一律不必動**，⛔ 但也不要刪：刪了就沒有安全網了。`,
  );
  p();
  p(`平衡母體 = **${new Set(pop.map((r) => r.championId)).size} 位對戰可選本體**的 **${pop.length}** 支技能`);
  p(`（\`${String(meta["balancePopulation"])}\`）。⛔ 不是 71 檔、⛔ 不含變身態。`);
  p();
  p("---");
  p();
  p("## 一 · 五欄級距覆蓋率（⭐ 適用 / 不適用，⛔ 不適用不塞 0）");
  p();
  p("| 欄 | 適用 | 不適用 | 已填級別 | 已填但**與現值不符** | 落差 > " + Math.round(GAP_ALERT * 100) + "% |");
  p("|---|---:|---:|---:|---:|---:|");
  for (const a of AXES) {
    const app = rows.filter((r) => r.columns[a.key].applicable);
    const authored = app.filter((r) => r.columns[a.key].authored !== undefined);
    const disagree = authored.filter((r) => r.columns[a.key].agrees === false);
    const far = app.filter((r) => (r.columns[a.key].gap ?? 0) > GAP_ALERT);
    p(
      `| **${a.zh}** | ${app.length} (${pct(app.length, N)}) | ${N - app.length} | ${authored.length} | ` +
        `${disagree.length} | ${far.length} |`,
    );
  }
  p();
  p("⚠️ **「已填級別」那一欄要分開讀** —— 三種完全不同的狀況：");
  p();
  p("| 欄 | 欄位住在哪 | 現況 |");
  p("|---|---|---|");
  p("| `cooldownTier` | 技能**頂層** | 350 支已填 —— 這一軸幾乎做完了 |");
  p("| `rangeTier` | 技能**頂層** | 186 支已填 |");
  p("| `damageTier` | ⭐ **`amount` 上**（巢狀） | 199 筆已填，⛔ 讀頂層會全部漏掉 |");
  p("| `radiusTier` | 頂層 **與** 效果上**都有** | 21 + 38 —— ⛔ 只讀頂層會少報 38 支 |");
  p("| `manaCostTier` | ⛔ **這個欄位還不存在** | `ability@1` 的 Zod 上沒有它 ⇒ 「已填 0」是**機制還沒做**，⛔ 不是大家忘了填 |");
  p();
  p("⇒ 耗魔那一欄的建議級別，現在是從 `config.tier-snap@1` 的 `manaCost` 五格**現算**的");
  p("（`tierSnap.manaTiersFromPool`，兩個 owner 錨推導）。要把它變成一格可填的級別，");
  p("需要新增 `manaCostTier` 到**三個住處** —— 那是寫入階段的第一件事，⛔ 不是這一支能做的。");
  p();
  p("### 不適用的理由分佈（⭐ 每一支都說得出理由）");
  p();
  for (const a of AXES) {
    const why = new Map<string, number>();
    for (const r of rows) {
      const c = r.columns[a.key];
      if (c.applicable) continue;
      const k = (c.notApplicable ?? "?").replace(/castType=\w+/, "castType=…").replace(/[（(].*?[)）]/g, "");
      why.set(k, (why.get(k) ?? 0) + 1);
    }
    if (why.size === 0) continue;
    p(
      `- **${a.zh}**：` +
        [...why.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v} 支`).join(" · "),
    );
  }
  p();
  p("---");
  p();
  p("## 二 · ⭐ 說明↔JSON 不符（owner 特別問的那一欄）");
  p();
  const withClaims = rows.filter((r) => r.claims.length > 0);
  const newClaims = rows.filter((r) => r.claims.some((c) => !c.known));
  p(
    `**${withClaims.length}** 支技能上量到 **${rows.reduce((n, r) => n + r.claims.length, 0)}** 處不一致；` +
      `其中 **${newClaims.length}** 支帶著**不在棘輪 baseline 上**的新不一致。`,
  );
  p();
  const byRule = new Map<string, number>();
  for (const r of rows) for (const c of r.claims) byRule.set(c.rule, (byRule.get(c.rule) ?? 0) + 1);
  p("| 規則 | 幾處 | 它在問什麼 |");
  p("|---|---:|---|");
  const RULE_ZH: Record<string, string> = {
    "cooldown-mismatch": "卡面寫的秒數，`cooldown[]` 一個都對不上",
    "mana-mismatch": "卡面寫的耗魔，`manaCost[]` 一個都對不上",
    "duration-absent": "卡面承諾的「持續 N 秒」，效果樹上沒有那個 duration",
    "damage-absent": "卡面承諾的點數，效果樹上沒有那一發",
    "mana-restore-absent": "卡面說會還魔力，效果樹上沒有任何還魔的表達面",
    "hp-pct-absent": "卡面說「最大生命 X%」，效果樹上沒有那個表達面",
    "tag-no-mechanism": "首行標籤承諾的機制，效果樹裡一個都沒有",
  };
  for (const [k, v] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    p(`| \`${k}\` | ${v} | ${RULE_ZH[k] ?? "—"} |`);
  }
  p();
  p("### ⛔ 不在 baseline 上的（＝這一批要嘛修、要嘛解釋）");
  p();
  if (newClaims.length === 0) {
    p("（0 支 —— 全部都已經在棘輪名單上。）");
  } else {
    p("| 技能 | id | 規則 | 卡面那一句 | 為什麼不符 |");
    p("|---|---|---|---|---|");
    for (const r of newClaims) {
      for (const c of r.claims.filter((x) => !x.known)) {
        p(`| ${r.name} | \`${r.id}\` | \`${c.rule}\` | ${c.claim.replace(/\|/g, "\\|")} | ${c.why.replace(/\|/g, "\\|")} |`);
      }
    }
  }
  p();
  p("---");
  p();
  p("## 三 · 說明改寫（機制數字 → 佔位符）");
  p();
  const changed = rows.filter((r) => r.prose.changed);
  p(`**${changed.length}** 支的說明會變（共 ${rows.reduce((n, r) => n + r.prose.findings.length, 0)} 處）。`);
  p("⚠️ 台詞 `「…」` 已經先剝掉（`descriptionClaims.mechanicsText`，與 `batch1.py::_mechanics_text()` 同構）。");
  p();
  const byFinding = new Map<string, number>();
  for (const r of rows) for (const f of r.prose.findings) byFinding.set(f.rule, (byFinding.get(f.rule) ?? 0) + 1);
  p("| 種類 | 幾處 | 意思 |");
  p("|---|---:|---|");
  const F_ZH: Record<string, string> = {
    "num-bound": "手打數字 → 佔位符，**算繪逐位元組相同**（玩家看到的字零變動）",
    "num-partial": "卡面只印其中一階 ⇒ 綁上去之後印出整串（開關③）",
    "num-unbound": "⛔ 卡面數字 JSON 找不到 —— **不動**，這是既有的說謊",
    "geo-tiered": "幾何數字 → 級距詞（⭐ 唯一會改變玩家看到的字的那一軸）",
    "geo-no-engine-value": "⛔ 卡面寫了幾何但引擎那一軸是空的 —— **不動**",
  };
  for (const [k, v] of [...byFinding.entries()].sort((a, b) => b[1] - a[1])) {
    p(`| \`${k}\` | ${v} | ${F_ZH[k] ?? "—"} |`);
  }
  p();
  p("---");
  p();
  p("## 四 · ⭐ 多發技能的總計 / 有效覆蓋（owner 2026-08-21 裁決 A）");
  p();
  p("> 「傷害 = 每發 × 發數 × 遞減；範圍 = 散佈半徑（多發）/ radius（單發）」");
  p();
  // ⛔ 只列**真的有傷害**的：`riskFactors` 也會掛在純治療/純位移的多段技能上
  //    （例 92-01 臥草泥馬的 delayed×6 裝的是 restore），列進來只是雜訊。
  const multi = rows.filter(
    (r) => r.damage.ceiling > 0 && (r.riskFactors.length > 0 || r.damage.ceiling > r.damage.headline),
  );
  p(`量到 **${multi.length}** 支技能的總計與單發不同。`);
  p();
  p("| 技能 | id | `headlineDamage` | **保證吃到** | **有效覆蓋上限** | 分級（裁決 A） | 相稱性基準 | 有條件風險（⭐ 從結構推導） |");
  p("|---|---|---:|---:|---:|---|---|---|");
  for (const r of multi.sort((a, b) => b.damage.ceiling - a.damage.ceiling)) {
    p(
      `| ${r.name} | \`${r.id}\` | ${r.damage.headline} | ${r.damage.guaranteed} | **${r.damage.ceiling}** | ` +
        `${r.columns.damage.suggested ?? "—"} | ${r.proportionality.value}` +
        `${r.proportionality.overCapAllowed ? "（⭐ 允許超上限）" : ""} | ${r.riskFactors.join("；") || "—"} |`,
    );
  }
  p();
  p("### ⭐ 相稱性：「有條件風險 ⇒ 允許超出上限」是一條**規則**，⛔ 不是一張豁免名單");
  p();
  p("owner 2026-08-21 對 **天譴 `godie-udea.r`** 的裁決逐字：");
  p();
  p("> 「飛鼠先生本來就會變成隱藏角色，所以強一點合理，並且他要有**足夠多敵人在範圍內**");
  p("> 才有連鎖加成效果，算是有**額外條件風險**」⛔ 不調數值");
  p();
  p("⇒ 判準寫成程式，三行：");
  p("1. **分級**（裁決 A）看 `ceiling` —— 總計 / 有效覆蓋。");
  p("2. **相稱性**看 `guaranteed` —— 這支技能**穩定**給你什麼。");
  p("3. **上限豁免**的條件是「有**條件的上檔**」（`ceiling > guaranteed` 且 `riskFactors` 非空），");
  p("   ⛔ 不是「有沒有風險字串」—— 12 段打同一個目標（蒼龍破）沒有上檔，它照全額被管。");
  p("一支明天長出來的連鎖技能自動拿到同一個待遇，⛔ 沒有人要記得去補名單。");
  p(`（開關④ \`--risk-allowance\`，目前 **${RISK_ALLOWANCE ? "on" : "off"}**。）`);
  p();
  p("---");
  p();
  p("## 五 · ⛔ script 判斷不了的（逐支列出來）");
  p();
  const unk = rows.filter((r) => r.unknowns.length > 0);
  p(`**${unk.length}** 支需要人看一眼，共 ${rows.reduce((n, r) => n + r.unknowns.length, 0)} 條。`);
  p();
  const byCode = new Map<string, Row[]>();
  for (const r of rows) for (const u of r.unknowns) byCode.set(u.code, [...(byCode.get(u.code) ?? []), r]);
  p("| 代號 | 幾支 | 為什麼 script 判斷不了 |");
  p("|---|---:|---|");
  const CODE_ZH: Record<string, string> = {
    "prose-number-unbound": "卡面數字在 JSON 找不到 ⇒ 要動的是**平衡資料**還是**文案**，那是 owner 的排序",
    "prose-geo-no-engine-value": "卡面寫了幾何、引擎那一軸是空的 ⇒ 是漏做機制還是文案誇大",
    "range-zero-but-targeted": "`castType` 指名目標卻沒有施法距離 ⇒ 「近身」還是漏填",
    "line-shape-no-radius": "線狀技能沒有圓形半徑 ⇒ 要不要給等效級距是**設計**",
    "segment-shape-unclear": "`segmentCount` ⇒ 一個目標吃到幾段是**幾何**問題",
    "dot-ticks-unknown": "`dot` 少了 duration 或 intervalSec ⇒ ⛔ 不猜跳數",
    "damage-scaling-only": "傷害只有成長係數，沒有卡面基礎值 ⇒ 級距無從定起",
    "effects-from-template": "效果住 `template.ref` ⇒ **寫入路徑是模板**，⛔ 不是技能 JSON",
    "no-description": "沒有說明 ⇒ 說明↔JSON 對照無從做起",
  };
  for (const [k, v] of [...byCode.entries()].sort((a, b) => b[1].length - a[1].length)) {
    p(`| \`${k}\` | ${v.length} | ${CODE_ZH[k] ?? "—"} |`);
  }
  p();
  p("### ⚠️ 順手量到的**引擎盲點**（⛔ 不當場修，第零守則⑧ ⇒ 開票給 owner 排）");
  p();
  p("`tierSnap.headlineDamage()` 的 `DAMAGE_KINDS` 收了 `dot`，但它只讀 `amount` ——");
  p("而 `dot` 的傷害住在 **`amountPerTick`**。⇒ 純 DoT 技能的招牌傷害恆為 **0**，");
  p("於是 `tier-snap` 的「傷害低的往前靠、傷害高的往後靠」把它們**一律當成低傷害**。");
  p("量到的：`godie-hart.r` 超究武神霸斬（實際 1393）、`godie-h02v.e` 消化液（實際 560）等。");
  p("⛔ 這一支不修它 —— 它會改變 137 支技能的靠攏方向，那是一次平衡改動，要 owner 排。");
  p();
  p("<details><summary>逐支展開</summary>");
  p();
  p("| 技能 | id | 代號 | 為什麼 |");
  p("|---|---|---|---|");
  for (const r of unk) {
    for (const u of r.unknowns) {
      p(`| ${r.name} | \`${r.id}\` | \`${u.code}\` | ${u.why.replace(/\|/g, "\\|")} |`);
    }
  }
  p();
  p("</details>");
  p();
  p("---");
  p();
  p("## 六 · ⭐ 五格開關（預設為什麼選這個 · 後悔時怎麼一鍵 rollback）");
  p();
  p("⚠️ 這一階段是**計畫**，開關住在 CLI。⛔ 寫入階段要把每一格搬進**三個住處**");
  p("（`content/config/*.json` + Zod `DEFAULT_*` + admin `SHIPPED_*`）——");
  p("一格後台調不到的參數，就是 owner 下一次要改時的一次完整部署。");
  p();
  p("| # | 開關 | 預設 | 預設為什麼選這個 | 一鍵 rollback |");
  p("|---:|---|---|---|---|");
  p(
    `| ① | \`--damage-agg\` 多發傷害怎麼合計 | \`${DAMAGE_AGG}\` | owner 2026-08-21 裁決 A：「傷害 = 每發 × 發數 × 遞減」 | \`--damage-agg headline\`（回到 \`headlineDamage\` 的單發口徑；⭐ JSON 兩個數字都存著，⛔ 不必重跑也讀得到） |`,
  );
  p(
    `| ② | \`--snap-policy\` 自由數字往哪收 | \`${SNAP_POLICY}\` | 與出貨 \`SNAP_POLICIES[0]\` 同一格；最忠實，⛔ 不夾帶一次無聲的平衡改動 | \`--snap-policy down\`（owner 抱怨「普遍超遠／超大」時要的就是這個） |`,
  );
  p(
    `| ③ | \`--prose-partial\` 卡面只印一階時綁不綁 | \`${PROSE_PARTIAL}\` | 與 \`placeholderizeAbilityText\` 出貨預設同一格；owner：「傷害/冷卻/耗魔要**明確數值** 不然很難讓玩家判斷取捨」 | \`--prose-partial keep\`（留手打數字；⛔ 留著的那些會被 \`proseViolations\` 點名） |`,
  );
  p(
    `| ④ | \`--risk-allowance\` 有條件風險能不能超出上限 | \`${RISK_ALLOWANCE ? "on" : "off"}\` | owner 對天譴的裁決：「有額外條件風險」⇒ ⛔ 不調數值。⭐ 從結構推導，不是名單 | \`--risk-allowance off\`（連鎖／隨機落點技能一律照 \`ceiling\` 受上限管） |`,
  );
  p(
    `| ⑤ | \`--gap-alert\` 落差多大才叫「會改變手感」 | \`${GAP_ALERT}\` | 與 \`pnpm tiers:build\` 的 \`GAP_ALERT\` 同一個數字，⛔ 不另立一個 | \`--gap-alert 0.5\`（放寬）／\`0.1\`（收緊） |`,
  );
  p();
  p("---");
  p();
  p("## 七 · 出貨級距表（⛔ 全部從 config 推導，不抄字面值）");
  p();
  const t = meta["tables"] as Record<string, Record<string, Record<string, number> | number>>;
  p(`| 軸 | ${SKILL_TIER_NAMES.join(" | ")} |`);
  p(`|---|${SKILL_TIER_NAMES.map(() => "---:").join("|")}|`);
  const cdT = t["cooldown"] as unknown as Record<string, Record<SkillTierName, number>>;
  for (const shape of Object.keys(cdT)) {
    p(`| 冷卻·${shape}（卡面秒） | ${SKILL_TIER_NAMES.map((n) => cdT[shape]![n]).join(" | ")} |`);
  }
  for (const [k, zh] of [["manaCost", "耗魔"], ["damage", "傷害"], ["range", "施法距離"], ["radius", "施法範圍"]] as const) {
    const tab = t[k] as unknown as Record<SkillTierName, number>;
    p(`| ${zh} | ${SKILL_TIER_NAMES.map((n) => tab[n]).join(" | ")} |`);
  }
  p();
  p("⚠️ 冷卻是**卡面值** —— 玩家實際等到的 = 卡面 × `combatEnv.cooldown`（出貨 0.2）。");
  p();
  p("<sub>⚙️ 由 `pnpm tsx tools/skill-normalize/plan.ts` 從出貨 config + 出貨註冊表產生 · ⛔ 不要手改</sub>");
  p();
  return L.join("\n");
}

/* ─────────────────────────────  入口  ───────────────────────────── */

async function main(): Promise<void> {
  const { rows, meta } = await build();
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  mkdirSync(dirname(MD_OUT), { recursive: true });
  writeFileSync(JSON_OUT, `${JSON.stringify({ meta, abilities: rows }, null, 2)}\n`);
  writeFileSync(MD_OUT, markdown(rows, meta));
  console.log(`✅ ${rows.length} 支技能 → ${JSON_OUT}`);
  console.log(`✅ 報表 → ${MD_OUT}`);
}

void main();
