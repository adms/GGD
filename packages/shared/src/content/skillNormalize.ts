/**
 * ⭐【技能正規化 —— 五欄級距的「適用 / 不適用」是一條**規則**，⛔ 不是一張名單】
 *
 * owner 2026-08-21：
 * > 「**一個檔案一次改完** —— 五欄級距 + 說明改寫 + 說明↔JSON 對照**同一趟**」
 * > 「決策點一律做成**後台開關**，預設 = 你的建議」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這一支回答的**唯一**問題：一支技能的某一軸，該不該有級別？
 *
 * 「420 支 × 5 欄 = 2,100 格」裡有一大半**本來就不該有值** —— 被動技沒有冷卻、
 * 免費技不耗魔、位移技不造成傷害。⛔ 把它們塞 0 是一句假話（0 秒冷卻與「沒有
 * 冷卻」在引擎裡是兩件事），而**留白**又和「漏填」長得一模一樣。
 *
 * ⇒ 每一格只有兩種合法狀態：**有級別**，或是**有一個推導得出來的理由**。
 * 這一支就是那條推導。閘（`tools/skill-normalize/gen.ts --check`）拿它逐支問，
 * 兩種都不是的那一格就紅。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 九格開關 —— 每一格都是一個**我拒絕替 owner 挑**的決策點
 *
 * ⚠️ 它們的預設值全部是「**不夾帶一次無聲的平衡改動**」那一邊。理由逐格寫在
 * {@link SkillNormalize} 的欄位註解上（後台那一頁也讀同一份字）。
 *
 * ⚠️ ⛔ **這一支不寫任何檔案。** 寫入路徑有兩條而且不在這裡：
 *   · `tools/skill-remake/tierize.py`（機制）＋ `apply_tiers.py`（330 支直接編的）
 *   · `tools/skill-remake/batch1.py`（產生器擁有的 90 支，重生成時套用同一個 tierize）
 * 這一支是**第二個意見**：TS 這邊從出貨 config 重新問一次「該不該有級別」，
 * 而 Python 那邊決定「填哪一格」。兩邊分岔就紅 —— 那正是守衛要的。
 */
import { AOE_TIER_NAMES } from "./aoeTiers";
import { SKILL_TIER_NAMES, SNAP_POLICIES, type SkillTierName, type SnapPolicy } from "./skillTiers";
import { SELA, THORNE } from "../sim/content/skeleton";

/** `content/config/skill-normalize.json` 的文件 id。 */
export const SKILL_NORMALIZE_DOC_ID = "skill-normalize";

/** 五欄。⛔ 順序就是報告與後台的順序，⛔ 不要在別處重打一份。 */
export const NORMALIZE_AXES = ["cooldown", "manaCost", "damage", "range", "radius"] as const;
export type NormalizeAxis = (typeof NORMALIZE_AXES)[number];

/** 五欄的中文名（報告 · 後台 · 閘訊息**共用**）。 */
export const AXIS_LABEL: Readonly<Record<NormalizeAxis, string>> = Object.freeze({
  cooldown: "冷卻 cooldownTier",
  manaCost: "耗魔 manaCostTier",
  damage: "傷害 damageTier",
  range: "施法距離 rangeTier",
  radius: "施法範圍 radiusTier",
});

/** 傷害葉能住在哪。⭐ 與 `tierSnap.DAMAGE_KINDS` / `tierize.py` 同一份名單。 */
export const DAMAGE_KINDS: ReadonlySet<string> = new Set([
  "damage",
  "damageArea",
  "damageLine",
  "dot",
  "damageOverTime",
  "chainLightning",
]);

/** 傷害葉的兩種量鍵。⚠️ `dot` 的傷害住 `amountPerTick`，⛔ 不在 `amount`。 */
export const AMOUNT_KEYS = ["amount", "amountPerTick"] as const;

/** 傷害葉可以從哪些容器找起。 */
export const DAMAGE_LEAF_SCOPES = ["cast-amount", "all-leaves"] as const;
export type DamageLeafScope = (typeof DAMAGE_LEAF_SCOPES)[number];

/** 傷害欄拿哪個數字去對「已填的級別」。 */
export const DAMAGE_COLUMN_BASES = ["leaf", "total"] as const;
export type DamageColumnBasis = (typeof DAMAGE_COLUMN_BASES)[number];

/** 範圍欄拿哪個節點去對「已填的級別」。 */
export const RADIUS_COLUMN_BASES = ["authored-node", "max-coverage"] as const;
export type RadiusColumnBasis = (typeof RADIUS_COLUMN_BASES)[number];

/**
 * ⛔ **fail-open 骨架** —— `apps/client/src/main.tsx` 在內容驗證失敗時註冊的那兩位。
 * 它們沒有說明、玩家永遠選不到，而且它們的權威副本是 `sim/content/skeleton.ts`
 * 裡的 TS 字面值（`loader.test.ts` 逐欄位比對「JSON 來回一趟等於那份字面值」）。
 * ⇒ 收它們進級距 = 那條守衛紅，而且紅的理由是假的（骨架本來就不該有平衡）。
 *
 * ⭐ 從 `SELA` / `THORNE` **推導**，⛔ 不抄兩個字串 —— 骨架換人時這裡自己跟著動。
 */
export const SKELETON_CHAMPION_IDS: ReadonlySet<string> = new Set([
  String(SELA.id),
  String(THORNE.id),
]);

export interface SkillNormalize {
  /**
   * 總開關兼**一鍵 rollback**。false = 整條正規化規則不跑（閘不叫、報告不產）。
   * ⚠️ 關掉**不會**改變任何技能的行為 —— 級別與原始值都還在文件裡。
   */
  enabled: boolean;
  /**
   * ⭐ **載體節點**的門檻。一顆 `damageArea{amount:{flat:1}, onHitTargets:[…]}`
   * 的工作是**送狀態**，那 1 點傷害只是為了讓圈成立。
   *
   * ⚠️ 把它當成「基礎傷害」收進級距 ⇒ 一支純控場技變成 600 傷害的核彈
   *（實測命中 70-03 木束縛之術 / 79-01 瞬步 / 92-04 馬勒戈壁 / 45-002 天照）。
   * ⇒ 出貨 **1.0**：小於等於它的傷害葉**不算傷害**，那一軸判「不適用」。
   * rollback：填 0 ⇒ 載體節點全部回來當傷害技，那 5 支會要求填級別。
   */
  carrierBaseMax: number;
  /**
   * ⭐ 「傷害葉」到底算哪些。出貨 **`cast-amount`** ——
   * 只有**施放路徑**（`effects` / `template.params`）上、掛在 **`amount`** 鍵上的葉子。
   * ⭐ 那與 `tools/skill-remake/tierize.py` 的寫入口徑**逐字相同**，
   * 兩邊分岔的後果是「閘要求填級別、寫入器不填」的死迴圈。
   *
   * ⚠️ 這是這九格裡**唯一會直接改變出貨傷害**的一格。切成 `all-leaves`
   * 之後，兩種葉子會一起被收進級距 —— 而級距是**取代**基礎值的：
   *   · 住 `passive.ranks[].hooks[]` / `toggle` 的（45-04 哥哥、58-02 鋼鐵尾巴…）
   *   · 住 `dot.amountPerTick` 的（92-02 消化液每跳 20/30/40/50 → 極小 600，**12 倍**）
   * 實測影響 17 支技能，而 `headlineDamage` 只讀 `amount` 這件事另外動到 137 支的
   * 靠攏方向。⇒ ⛔ 這是**平衡改動**，不是正規化，所以它預設是關的，
   * 由 owner 決定要不要開（第零守則⑧：排序是他的權力）。
   */
  damageLeafScope: DamageLeafScope;
  /**
   * ⭐ 傷害欄用哪個口徑去對「已填的級別」。出貨 **`leaf`**。
   *
   * owner 2026-08-21 裁決 A：「多發技能的**分級**用總計 / 有效覆蓋」。
   * ⚠️ 但 `amount.damageTier` 是一格**設定值的鍵**（`resolveDamageTier` 把它翻成
   * 那一葉的 `flat`），⛔ 不是一個分類標籤 —— 把 34-04 蒼龍破（12 段 × 1500 =
   * 18000）的葉子標成「極大」會讓**每一段**變成 6000，總計 72000，一次 4 倍的買。
   * ⇒ `leaf`：級別對的是**它自己那一葉**；裁決 A 的總計照算，住在
   * `damage.guaranteed` / `damage.ceiling` 並且**驅動相稱性**（那才是 owner 要
   * 它回答的問題）。rollback：`total` ⇒ 報告改用總計對級別，7 支會被點名。
   */
  damageColumnBasis: DamageColumnBasis;
  /**
   * ⭐ 範圍欄用哪個節點。出貨 **`authored-node`**（第一個填了級別的節點）。
   *
   * 理由與 `damageColumnBasis` 逐字相同：13-04 龍星群的 `scatterRadius` 是 8
   *（散佈半徑，裁決 A 的「有效覆蓋」），而**每一發**的 `radius` 是 3。
   * 把級別對到 8 會讓每一發的圈變成 8 —— 那是一次 2.7 倍的買。
   * rollback：`max-coverage` ⇒ 用最大覆蓋半徑對級別，2 支會被點名。
   */
  radiusColumnBasis: RadiusColumnBasis;
  /** 自由數字往哪一格收。出貨 `SNAP_POLICIES[0]`（最忠實，⛔ 不夾帶平衡改動）。 */
  snapPolicy: SnapPolicy;
  /**
   * ⭐ 有**條件上檔**的技能允不允許超出級距上限。出貨 **true**。
   *
   * owner 2026-08-21 對 65-04 天譴（`godie-udea.r`）的裁決逐字：
   * > 「飛鼠先生本來就會變成隱藏角色，所以強一點合理，並且他要有**足夠多敵人
   * >  在範圍內**才有連鎖加成效果，算是有**額外條件風險**」⛔ 不調數值
   *
   * ⚠️ 判準是**從結構推導**的（`ceiling > guaranteed` 且有風險因子），
   * ⛔ 不是一張沒有理由的豁免名單 —— 12 段打同一個目標的蒼龍破沒有上檔，
   * 它照全額被管；明天長出來的連鎖技能自動拿到同一個待遇。
   */
  riskAllowance: boolean;
  /**
   * ⭐ 沒有傷害葉的控制／位移技，要不要豁免相稱性。出貨 **true**。
   *
   * ⚠️ 「範圍·極小要求傷害是大／極大」那條相稱性規則的分母是**傷害**；
   * 一支根本不造成傷害的定身技拿去對它，得到的是一句必然為假的宣稱。
   * ⇒ 豁免，而且理由是**推導**的（效果樹上一片傷害葉都沒有），
   * ⛔ 不是「我覺得控場技比較弱」。
   */
  proportionalityExemptNoDamage: boolean;
  /** 離最近一級多遠才叫「收進去會改變手感」。與 `pnpm tiers:build` 同一個數字。 */
  gapAlert: number;
}

/** 出貨值。三個住處：`content/config/skill-normalize.json` · 這裡 · admin 的 `SHIPPED_*`。 */
export const DEFAULT_SKILL_NORMALIZE: SkillNormalize = Object.freeze({
  enabled: true,
  carrierBaseMax: 1,
  damageLeafScope: "cast-amount" as DamageLeafScope,
  damageColumnBasis: "leaf" as DamageColumnBasis,
  radiusColumnBasis: "authored-node" as RadiusColumnBasis,
  snapPolicy: SNAP_POLICIES[0],
  riskAllowance: true,
  proportionalityExemptNoDamage: true,
  gapAlert: 0.25,
});

/** 上下界（第一守則：**欄位要有上界，不是只有下界**）。 */
export const CARRIER_BASE_MAX_CEILING = 100;
export const GAP_ALERT_MAX = 1;

/** 把一份 `config.skill-normalize@1` 文件正規化。認不得 → 出貨值。 */
export function skillNormalizeFromDoc(doc: unknown): SkillNormalize {
  const d = doc as (Partial<SkillNormalize> & { schema?: string }) | undefined;
  if (!d || d.schema !== "config.skill-normalize@1") return DEFAULT_SKILL_NORMALIZE;
  const bool = (v: unknown, fb: boolean): boolean => (typeof v === "boolean" ? v : fb);
  const num = (v: unknown, fb: number, lo: number, hi: number): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : fb;
  const pick = <T extends string>(v: unknown, all: readonly T[], fb: T): T =>
    typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : fb;
  return {
    enabled: bool(d.enabled, DEFAULT_SKILL_NORMALIZE.enabled),
    carrierBaseMax: num(
      d.carrierBaseMax,
      DEFAULT_SKILL_NORMALIZE.carrierBaseMax,
      0,
      CARRIER_BASE_MAX_CEILING,
    ),
    damageLeafScope: pick(
      d.damageLeafScope,
      DAMAGE_LEAF_SCOPES,
      DEFAULT_SKILL_NORMALIZE.damageLeafScope,
    ),
    damageColumnBasis: pick(
      d.damageColumnBasis,
      DAMAGE_COLUMN_BASES,
      DEFAULT_SKILL_NORMALIZE.damageColumnBasis,
    ),
    radiusColumnBasis: pick(
      d.radiusColumnBasis,
      RADIUS_COLUMN_BASES,
      DEFAULT_SKILL_NORMALIZE.radiusColumnBasis,
    ),
    snapPolicy: pick(d.snapPolicy, SNAP_POLICIES, DEFAULT_SKILL_NORMALIZE.snapPolicy),
    riskAllowance: bool(d.riskAllowance, DEFAULT_SKILL_NORMALIZE.riskAllowance),
    proportionalityExemptNoDamage: bool(
      d.proportionalityExemptNoDamage,
      DEFAULT_SKILL_NORMALIZE.proportionalityExemptNoDamage,
    ),
    gapAlert: num(d.gapAlert, DEFAULT_SKILL_NORMALIZE.gapAlert, 0, GAP_ALERT_MAX),
  };
}

/* ─────────────────────────  逐支：五欄該不該有級別  ───────────────────────── */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;

/** 一格的判定。⭐ `applicable` 為 false 時 `why` **一定**有值（⛔ 不可以是空字串）。 */
export interface AxisVerdict {
  readonly applicable: boolean;
  /** 不適用的**理由** —— 推導出來的一句話，⛔ 不是「不知道」。 */
  readonly why?: string;
  /** 文件上已經填的級別（沒填 = undefined）。 */
  readonly authored?: SkillTierName;
  /** 引擎現值（卡面單位）。 */
  readonly value?: number;
}

const tierOf = (v: unknown): SkillTierName | undefined =>
  typeof v === "string" && (SKILL_TIER_NAMES as readonly string[]).includes(v)
    ? (v as SkillTierName)
    : undefined;

/** 陣列裡最大的正數（`cooldown[]` / `manaCost[]` 都是逐階陣列）。 */
function maxRank(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : 0;
  if (!Array.isArray(v)) return 0;
  let m = 0;
  for (const x of v) m = Math.max(m, maxRank(x));
  return m;
}

/**
 * 一個 `zScaling` 的**可換算基礎值**（flat + 滿階 perRank）。沒有就 undefined。
 * ⛔ 不看 `ratios` / `attrRatios`：那兩條是**成長**（取決於玩家那一場的裝備），
 * ⛔ 不是卡面基礎值 —— 級距取代的是基礎值那一格。
 */
export function scalingBase(amount: unknown): number | undefined {
  if (!isRec(amount)) return undefined;
  const flat = amount["flat"];
  const per = amount["perRank"];
  const hasFlat = typeof flat === "number" && Number.isFinite(flat);
  const perArr = Array.isArray(per) ? per.filter((x): x is number => typeof x === "number") : [];
  if (!hasFlat && perArr.length === 0) return undefined;
  return (hasFlat ? (flat as number) : 0) + (perArr.length ? Math.max(...perArr) : 0);
}

/** 傷害葉在文件裡的一筆紀錄。 */
export interface DamageLeaf {
  readonly base: number;
  /** 效果的 `kind`，或模板參數名（`template.damage`）。 */
  readonly kind: string;
  readonly key: (typeof AMOUNT_KEYS)[number];
  /** 它住在文件的哪一個頂層容器（`effects` / `passive` / `toggle` / `marks` / `template`）。 */
  readonly container: string;
  /** 這一葉在不在 `damageLeafScope: "cast-amount"` 的範圍內。 */
  readonly inCastScope: boolean;
  readonly authored?: SkillTierName;
}

/** 只有這兩個容器算「施放路徑」。⛔ `passive` / `toggle` / `marks` 不在裡面。 */
const CAST_CONTAINERS = ["effects", "template"] as const;

/**
 * 把一份技能文件上的傷害葉全部找出來。
 *
 * ⚠️ **兩個量鍵都要看** —— `dot` 的傷害住 `amountPerTick`。只讀 `amount` 會讓
 * 純 DoT 技能的招牌傷害恆為 0（實測 01-04 超究武神霸斬實際 1393、92-02 消化液
 * 560 都被讀成 0），而級距靠攏會把它們一律當低傷害往前靠 —— ⛔ 而且沒有任何
 * 東西會紅。⇒ 兩種都收，由 `damageLeafScope` 決定哪些算數。
 *
 * ⚠️ **模板技的傷害不在 `effects` 裡** —— 它住 `template.params`（一個 `zScaling`）。
 * ⭐ 判準是「**它長得像一個 Scaling**」（有 `flat` / `perRank` / `damageTier`），
 * ⛔ 不是一張參數名清單：實測 95 支模板技的 params 裡只有 `damage` 這一格是
 * Scaling，而抄一張名單會在下一個模板長出 `hitDamage` 時安靜地漏掉它。
 */
export function damageLeaves(doc: unknown): DamageLeaf[] {
  const out: DamageLeaf[] = [];
  const d = isRec(doc) ? doc : {};
  const inCast = (container: string): boolean =>
    (CAST_CONTAINERS as readonly string[]).includes(container);

  const walk = (node: unknown, container: string): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, container);
      return;
    }
    if (!isRec(node)) return;
    const kind = node["kind"];
    if (typeof kind === "string" && DAMAGE_KINDS.has(kind)) {
      for (const key of AMOUNT_KEYS) {
        const amount = node[key];
        const base = scalingBase(amount);
        if (base === undefined) continue;
        const t = tierOf((amount as Rec)["damageTier"]);
        out.push({
          base,
          kind,
          key,
          container,
          inCastScope: inCast(container) && key === "amount",
          ...(t !== undefined ? { authored: t } : {}),
        });
      }
    }
    for (const v of Object.values(node)) walk(v, container);
  };

  for (const [k, v] of Object.entries(d)) {
    if (k === "template") continue;
    walk(v, k);
  }

  const tpl = d["template"];
  if (isRec(tpl)) {
    for (const [name, v] of Object.entries((tpl["params"] as Rec | undefined) ?? {})) {
      const base = scalingBase(v);
      if (base === undefined) continue;
      const t = tierOf((v as Rec)["damageTier"]);
      out.push({
        base,
        kind: `template.${name}`,
        key: "amount",
        container: "template",
        inCastScope: true,
        ...(t !== undefined ? { authored: t } : {}),
      });
    }
  }
  return out;
}

/**
 * 這個節點的 `radius` 能不能掛 `radiusTier`。
 *
 * ⚠️ 判準是**它是不是一個 effect 節點**（有 `kind`）或**技能自己的頂層**。
 * ⛔ `template.params.radius` **不算** —— 那一格的單位是 **wc3u**
 *（`tpl-ground-nova` 的 `params.radius.unit === "wc3u"`，出貨值 224.5），
 * 而級距表的單位是 GGD 場地單位（決鬥區半徑 24）。填進去 = 一支技能的圈
 * 從 224.5 wc3u 變成 8 GGD，而**兩邊都不會有任何東西紅**。
 * ⛔ `auras[]` / `deathWard` 也不算：它們不是 effect，Zod 上沒有 `radiusTier` 一格。
 */
export interface RadiusNode {
  readonly radius: number;
  readonly root: boolean;
  readonly kind?: string;
  readonly authored?: SkillTierName;
}

/**
 * 頂層 `radius` 是不是效果樹上**另一個幾何鍵的預覽鏡像**（回傳那個鍵名）。
 *
 * ⚠️ 踩出來的（2026-08-21）：01-02 隕石擊的爆炸半徑住在 `leap.landRadius`
 *（4.58 ＝ war3map.j:33722 的 250 wc3），技能的頂層 `radius` 只是**畫給玩家看
 * 的那個圈**，逐位元組等於它。把頂層那一格獨立收進級距（4.58 → 4.5）之後，
 * ⛔ **預覽圈與真正的爆炸圈說了兩句話** —— 76-04 巨人迴旋彈是 6.97 → 6，
 * 預覽圈小了 14%。
 *
 * ⚠️ 這**不是保真度問題**（那是階梯第 3 層，設計贏得了它），是**內部一致性**
 * 問題：兩個欄位描述**同一個圓**，⛔ 不可以只動一個。
 * ⇒ 這一軸判「不適用」，理由是**推導**的，⛔ 不是一張「這四支例外」的名單。
 *
 * ⭐ 與 `tools/skill-remake/tierize.py::preview_mirror_radius()` 是**同一條規則**
 * ——那邊決定不寫級別，這邊決定不要求級別。兩邊分岔＝閘與寫入器打架。
 */
export function previewMirrorRadius(doc: unknown): string | undefined {
  const d = isRec(doc) ? doc : {};
  const r = d["radius"];
  if (typeof r !== "number" || !Number.isFinite(r)) return undefined;
  let hit: string | undefined;
  const walk = (node: unknown): void => {
    if (hit !== undefined) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (!isRec(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if (k !== "radius" && k.endsWith("Radius") && typeof v === "number" && Math.abs(v - r) < 1e-9) {
        hit = k;
        return;
      }
      walk(v);
    }
  };
  walk(d["effects"]);
  return hit;
}

export function radiusNodes(doc: unknown): RadiusNode[] {
  const out: RadiusNode[] = [];
  const d = isRec(doc) ? doc : {};
  const rootR = d["radius"];
  if (
    typeof rootR === "number" &&
    Number.isFinite(rootR) &&
    rootR > 0 &&
    previewMirrorRadius(d) === undefined
  ) {
    const t = tierOf(d["radiusTier"]);
    out.push({ radius: rootR, root: true, ...(t !== undefined ? { authored: t } : {}) });
  }
  const walk = (node: unknown, underTemplate: boolean): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, underTemplate);
      return;
    }
    if (!isRec(node)) return;
    const kind = node["kind"];
    const r = node["radius"];
    if (
      !underTemplate &&
      typeof kind === "string" &&
      typeof r === "number" &&
      Number.isFinite(r) &&
      r > 0
    ) {
      const t = tierOf(node["radiusTier"]);
      out.push({ radius: r, root: false, kind, ...(t !== undefined ? { authored: t } : {}) });
    }
    for (const [k, v] of Object.entries(node)) walk(v, underTemplate || k === "template");
  };
  for (const [k, v] of Object.entries(d)) walk(v, k === "template");
  return out;
}

/** 一支技能五欄的判定 —— ⭐ 閘與報告**共用這一支**，⛔ 不各自算一次。 */
export function axisVerdicts(
  doc: Rec,
  cfg: SkillNormalize = DEFAULT_SKILL_NORMALIZE,
): Readonly<Record<NormalizeAxis, AxisVerdict>> {
  const championId = String(doc["id"] ?? "").split(".")[0] ?? "";
  const NA = (why: string): AxisVerdict => ({ applicable: false, why });
  if (SKELETON_CHAMPION_IDS.has(championId)) {
    const why =
      "fail-open 骨架（main.tsx 在內容驗證失敗時註冊的那兩位）—— " +
      "它們的權威副本是 sim/content/skeleton.ts 的 TS 字面值，收進級距會讓 loader.test.ts 用假理由紅。⛔ 也不要刪：刪了就沒有安全網了。";
    return Object.freeze(
      Object.fromEntries(NORMALIZE_AXES.map((a) => [a, NA(why)])) as Record<
        NormalizeAxis,
        AxisVerdict
      >,
    );
  }

  // ── ① 冷卻 ──────────────────────────────────────────────────────────────
  const cd = maxRank(doc["cooldown"]);
  const cooldown: AxisVerdict =
    cd > 0
      ? { applicable: true, value: cd, ...(tierOf(doc["cooldownTier"]) !== undefined ? { authored: tierOf(doc["cooldownTier"])! } : {}) }
      : NA("沒有冷卻（被動／常駐／cooldown 全 0）—— ⛔ 0 秒冷卻與「沒有冷卻」在引擎裡是兩件事");

  // ── ② 耗魔 ──────────────────────────────────────────────────────────────
  const mp = maxRank(doc["manaCost"]);
  const manaCost: AxisVerdict =
    mp > 0
      ? { applicable: true, value: mp, ...(tierOf(doc["manaCostTier"]) !== undefined ? { authored: tierOf(doc["manaCostTier"])! } : {}) }
      : NA("不耗魔（manaCost 全 0）—— owner 2026-08-21 ④「那就不要調耗魔阿」");

  // ── ③ 傷害 ──────────────────────────────────────────────────────────────
  const leaves = damageLeaves(doc);
  const scoped = leaves.filter((l) => cfg.damageLeafScope === "all-leaves" || l.inCastScope);
  const real = scoped.filter((l) => l.base > cfg.carrierBaseMax);
  let damage: AxisVerdict;
  if (real.length > 0) {
    const top = real.reduce((a, b) => (b.base > a.base ? b : a));
    damage = {
      applicable: true,
      value: top.base,
      ...(top.authored !== undefined ? { authored: top.authored } : {}),
    };
  } else if (scoped.length > 0) {
    const top = Math.max(...scoped.map((l) => l.base));
    damage = NA(
      top > 0
        ? `只有載體節點（基礎值 ${top} ≤ 載體門檻 ${cfg.carrierBaseMax}）—— 那一點傷害的工作是讓圈成立好掛 onHitTargets，⛔ 不是基礎傷害`
        : "傷害葉的卡面基礎值是 0（只有 ratios / attrRatios 成長）—— ⛔ 級距取代的是基礎值那一格，沒有基礎值就無從定起",
    );
  } else if (leaves.length > 0) {
    const where = [...new Set(leaves.map((l) => `${l.container}→${l.kind}.${l.key}`))].join(" / ");
    damage = NA(
      `傷害葉全部在「施放路徑上的 amount」之外（${where}）—— 傷害葉範圍開關是 \`cast-amount\`，` +
        "⛔ 收它們進級距是**平衡改動**不是正規化（見 damageLeafScope）",
    );
  } else {
    damage = NA("不造成傷害，或傷害只有成長係數（ratios / attrRatios）—— ⛔ 沒有卡面基礎值可以定級距");
  }

  // ── ④ 施法距離 ──────────────────────────────────────────────────────────
  const rng = typeof doc["range"] === "number" ? (doc["range"] as number) : 0;
  const castType = String(doc["castType"] ?? "");
  let range: AxisVerdict;
  if (rng > 0) {
    range = {
      applicable: true,
      value: rng,
      ...(tierOf(doc["rangeTier"]) !== undefined ? { authored: tierOf(doc["rangeTier"])! } : {}),
    };
  } else if (castType === "self" || castType === "passive" || castType === "toggle") {
    range = NA(`自身施放（castType=${castType || "self"}）`);
  } else {
    range = NA(`range=0 而 castType=${castType} —— 貼身施放；⛔ 沒有距離可以定級距`);
  }

  // ── ⑤ 施法範圍 ──────────────────────────────────────────────────────────
  const nodes = radiusNodes(doc);
  const mirror = previewMirrorRadius(doc);
  let radius: AxisVerdict;
  if (nodes.length === 0) {
    radius = NA(
      mirror !== undefined
        ? `頂層 radius 是 \`${mirror}\` 的**預覽鏡像**（同一個圓的兩個欄位）—— ` +
          `獨立收進級距會讓玩家看到的圈與真正打到的圈說兩句話，而 \`${mirror}\` 那一軸今天還沒有級距表`
        : "單體／無圓形範圍 —— 線狀（length × width）、散佈半徑（scatterRadius / landRadius / jumpRange）" +
          "與模板參數（單位是 wc3u）都**不是** `radius` 鍵，`resolveRadiusTier` 碰不到它們",
    );
  } else {
    const authoredNode = nodes.find((n) => n.authored !== undefined);
    const pickNode =
      cfg.radiusColumnBasis === "max-coverage"
        ? nodes.reduce((a, b) => (b.radius > a.radius ? b : a))
        : (authoredNode ?? nodes[0]!);
    radius = {
      applicable: true,
      value: pickNode.radius,
      ...(pickNode.authored !== undefined ? { authored: pickNode.authored } : {}),
    };
  }

  return Object.freeze({ cooldown, manaCost, damage, range, radius });
}

/** 這一支技能的每一格都合法嗎（有級別，或有理由）。回傳**壞掉的那幾格**。 */
export function normalizeGaps(
  doc: Rec,
  cfg: SkillNormalize = DEFAULT_SKILL_NORMALIZE,
): { axis: NormalizeAxis; why: string }[] {
  const v = axisVerdicts(doc, cfg);
  const bad: { axis: NormalizeAxis; why: string }[] = [];
  for (const axis of NORMALIZE_AXES) {
    const col = v[axis];
    if (col.applicable && col.authored === undefined) {
      bad.push({
        axis,
        why: `適用（現值 ${col.value ?? "—"}）卻**沒有級別** —— 級距表一改它一動都不會動`,
      });
    }
    if (!col.applicable && (col.why ?? "") === "") {
      bad.push({ axis, why: "判為不適用卻**說不出理由** —— 那與漏填長得一模一樣" });
    }
  }
  return bad;
}

/** 五個級別名（後台下拉／文件共用）。⛔ 不要在別處重打一份。 */
export { SKILL_TIER_NAMES, AOE_TIER_NAMES };
