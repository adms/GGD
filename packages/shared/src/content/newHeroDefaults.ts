/**
 * ⭐【創建新英雄 —— 六欄的**生成代入**】GH#480
 *
 * owner 2026-08-20 逐字：
 *
 * > 「**後台跟 codex編輯器的 創建新英雄** 十出身產出**十一種屬性、技能說明、
 * >  施展距離、範圍、傷害、冷卻、耗魔**的**生成代入與檢查跳警示**都要記得更新，
 * >  特別是 **script 程式自動化跟警示**的部分」
 *
 * ── 這一支補的是哪一半 ──────────────────────────────────────────────────────
 *
 * **十一種屬性那一半已經有了**：`heroForge.ts` 的 `forgeChampion()` 從出身生三圍、
 * 從同定位中位數生 baseStats/growth。⛔ 這支不重做它。
 *
 * **技能六欄那一半是空的**。實測（2026-08-20）：
 *   · `heroTemplate.blankAbilityRow()` → `cooldown 0 / manaCost 0 / range 0`
 *   · `heroForgePage.placeholderAbility()` → 同上，外加 `description` 根本沒有這一格
 * ⇒ 一支新技能出生時六欄全部是 0／空，而 **Zod 全部收得下**（`cooldown` 的界是
 * `.min(0)`）。也就是說：一位「生成完成」的新英雄，六欄可以一格都沒填而
 * `content:build` 全綠 —— 第一·五守則那個「每一個零件都是對的，只有它們的組合是空的」
 * 的形狀。
 *
 * ── ⛔ 中位數是**量出來的**，不是寫死的數字 ────────────────────────────────
 *
 * 每一格預設值都從**出貨的技能語料**取中位數，分桶順序是
 * `slot+castType` → `slot` → `全部` → {@link FALLBACK}，
 * 而且**每一格都帶著 `sample` 與 `basis`**（它是從幾支、哪一層算出來的）。
 *
 * ⚠️ 為什麼一定要帶 `sample`/`basis`：`heroForge.ts` 的檔頭已經記過同一個教訓 ——
 * 「永遠亮著的警告等於不在」。反過來也一樣：**一個沒有出處的預設數字，
 * 和一個作者亂填的數字在畫面上長得一模一樣**。帶著出處，後台才畫得出
 * 「冷卻 12 秒（Q 槽 targeted 技 87 支的中位數）」而不是一個裸的 12。
 *
 * ── ⭐ 說明是**從數字生出來的**，⛔ 不是另外寫一段 ──────────────────────────
 *
 * {@link describeAbilityDefaults} 用的就是同一組數字，所以出生的那一刻
 * 「說明↔JSON 一致」**依構造成立**（`newHeroChecks` 的 `claim-mismatch` 一條都不會亮）。
 * ⛔ 這不是文案潔癖：說明與 JSON 一旦從兩個來源長出來，它們的第一次分岔就是
 * `descriptionClaims.ts` 檔頭記的那件事 —— 兩邊各自都對，只有關係是壞的。
 *
 * ⚠️ 生成的說明**刻意不含任何 `「…」`**（第〇·六守則②）。它是機制文字，
 * 台詞由作者自己補；混在一起的話下一支讀說明的程式會把台詞讀成機制。
 *
 * ⛔ 這個檔案**不碰 fs、不碰 DOM**：語料由呼叫端餵進來
 *（後台頁已經抓了 461 支技能，CLI 直接讀 `content/abilities/`）。
 */
import { DEFAULT_COOLDOWN_TIERS } from "./cooldownTiers";
// ⭐ GH#445 —— 「傷害相對冷卻偏低」的那幾格。生成端與警示端**共用同一支推導**。
import { lowDamageCells, placeAbility } from "./lowDamageCells";
import { SKILL_TIER_NAMES } from "./skillTiers";
import type { CastType } from "../sim/content/defs";

/** 六欄 —— owner 點名的那幾格。⭐ 這是唯一一份清單，文件與後台都從它推導。 */
export const NEW_HERO_ABILITY_COLUMNS = Object.freeze([
  Object.freeze({ key: "description", zh: "技能說明", unit: "" as const }),
  Object.freeze({ key: "range", zh: "施展距離", unit: "格" as const }),
  Object.freeze({ key: "radius", zh: "範圍", unit: "格" as const }),
  Object.freeze({ key: "damage", zh: "傷害", unit: "點" as const }),
  Object.freeze({ key: "cooldown", zh: "冷卻", unit: "秒" as const }),
  Object.freeze({ key: "manaCost", zh: "耗魔", unit: "點" as const }),
] as const);

export type NewHeroColumnKey = (typeof NEW_HERO_ABILITY_COLUMNS)[number]["key"];

/** 語料裡的一份技能文件 —— 只讀得懂這幾格，其餘一律忽略。 */
export interface AbilityCorpusDoc {
  readonly slot?: unknown;
  readonly castType?: unknown;
  readonly cooldown?: unknown;
  readonly manaCost?: unknown;
  readonly range?: unknown;
  readonly radius?: unknown;
  readonly effects?: unknown;
  readonly template?: unknown;
}

/** 一格預設值**與它的出處**。⛔ 不要只回傳數字。 */
export interface ColumnDefault {
  readonly value: number;
  /** 這個中位數是從幾支技能算出來的（0 = 沒有樣本，用的是 {@link FALLBACK}） */
  readonly sample: number;
  readonly basis: DefaultBasis;
  /**
   * ⭐ GH#445 —— 中位數**原本**是多少，在它被挪出「傷害相對冷卻偏低」的級距格之前。
   * 只有真的挪過的那幾格才有這一欄。
   *
   * ⚠️ ⛔ 不是把 `basis` 換掉：中位數的出處**沒有消失**，只是它落在一個
   * owner 2026-08-20 判定為不相稱的格子裡（範圍・極小 −60% / 範圍・小 −33%）。
   * 兩件事都要說得出來，否則後台畫出來的會是一個沒有出處的數字。
   */
  readonly liftedFromMedian?: number;
}

export type DefaultBasis =
  /** 同槽位 + 同施放型態的中位數 —— 最貼的一層 */
  | "slot+castType"
  /** 同槽位的中位數（施放型態樣本不夠） */
  | "slot"
  /** 全語料的中位數（槽位樣本也不夠） */
  | "corpus"
  /** ⛔ 一支都沒有 —— 用檔案裡的保守值，而且呼叫端要說出來 */
  | "fallback";

export interface AbilityDefaults {
  readonly slot: string;
  readonly castType: CastType;
  readonly cooldown: ColumnDefault;
  readonly manaCost: ColumnDefault;
  readonly range: ColumnDefault;
  readonly radius: ColumnDefault;
  readonly damage: ColumnDefault;
  /** 由上面五格生出來的機制文字（⛔ 不含台詞） */
  readonly description: string;
}

/**
 * 樣本少於這個數就往上一層退。
 *
 * ⚠️ 與 `heroForgePage.MEDIAN_MIN_SAMPLE` 同一個理由（那邊的註解逐字是
 * 「三隻英雄的『中位數』是雜訊不是錨點」），但**刻意是另一格**：
 * 技能語料有 461 支、英雄只有 119 位，兩邊該用同一個門檻是巧合不是規律。
 */
export const DEFAULT_MIN_SAMPLE = 8;

/**
 * ⛔ 一支語料都沒有時的保守值。
 *
 * ⚠️ 這**不是**「預設值」—— 它是「語料讀不到」的標記。任何一格落在這裡，
 * `basis` 就是 `"fallback"`，而呼叫端**必須**把它顯示出來
 *（第二守則：fail-open 沒錯，靜默才是缺陷）。
 */
const FALLBACK = Object.freeze({
  cooldown: 12,
  manaCost: 60,
  range: 5,
  radius: 3,
  damage: 200,
});

/** 語料的傷害量從這幾格讀 —— 與 `descriptionClaims.DAMAGE_KEYS` 同一組語意。 */
const DAMAGE_KEYS = ["amount", "base", "damage", "bonusDamage", "perHit"] as const;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 逐階欄位的第一階（`cooldown: [30,25,20]` → 30）。 */
function firstRank(v: unknown): number | undefined {
  if (isNum(v)) return v;
  if (Array.isArray(v)) {
    for (const x of v) if (isNum(x)) return x;
  }
  return undefined;
}

function median(xs: readonly number[]): number | undefined {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const m = s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  // ⚠️ 兩位小數：`as` 那一族的中位數會是 0.6999999999999
  return Math.round(m * 100) / 100;
}

/**
 * 一格「量」的純量值。
 *
 * ⚠️ **傷害量不是一個數字，是 `zScaling`**：`{flat}` / `{perRank:[…]}` /
 * `{ratios:[…]}` 三種寫法並存（`schema/common.ts`）。只讀 `typeof v === "number"`
 * 會對**整個出貨語料**回 undefined —— 這支腳本第一版就是這樣，
 * 30 組預設值的傷害全部退到 fallback，而它自己的配對閘當場把它抓出來。
 */
function scalarOf(v: unknown): number | undefined {
  const direct = firstRank(v);
  if (direct !== undefined) return direct;
  if (v === null || typeof v !== "object" || Array.isArray(v)) return undefined;
  const s = v as Record<string, unknown>;
  const perRank = firstRank(s["perRank"]);
  if (perRank !== undefined) return perRank;
  return firstRank(s["flat"]);
}

/**
 * 效果樹上第一個**看得懂的**傷害量（巢狀 onHit / branches 一起走）。
 * ⛔ 回 undefined 代表「讀不到」，⛔ 不是「它是 0」。
 */
export function firstDamageAmount(node: unknown, depth = 0): number | undefined {
  if (depth > 8 || node === null || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const x of node) {
      const d = firstDamageAmount(x, depth + 1);
      if (d !== undefined) return d;
    }
    return undefined;
  }
  const rec = node as Record<string, unknown>;
  for (const k of DAMAGE_KEYS) {
    const v = scalarOf(rec[k]);
    if (v !== undefined && v > 0) return v;
  }
  for (const v of Object.values(rec)) {
    const d = firstDamageAmount(v, depth + 1);
    if (d !== undefined) return d;
  }
  return undefined;
}

/** 一份語料文件攤成「這五格各是多少」（讀不到的格子是 undefined，⛔ 不當成 0）。 */
interface Row {
  readonly slot: string;
  readonly castType: string;
  readonly cooldown?: number;
  readonly manaCost?: number;
  readonly range?: number;
  readonly radius?: number;
  readonly damage?: number;
}

function rowOf(doc: AbilityCorpusDoc): Row {
  const num = (v: unknown): number | undefined => {
    const n = firstRank(v);
    // ⛔ 0 不進中位數：出貨語料裡的 0 幾乎全是「這一格不適用」（純被動的冷卻、
    //    self 技的施展距離），把它們算進去會把中位數整個拉向 0 —— 那正是
    //    這支要修的病，⛔ 不可以讓病本身變成基準。
    return n !== undefined && n > 0 ? n : undefined;
  };
  return {
    slot: typeof doc.slot === "string" ? doc.slot : "",
    castType: typeof doc.castType === "string" ? doc.castType : "",
    cooldown: num(doc.cooldown),
    manaCost: num(doc.manaCost),
    range: num(doc.range),
    radius: num(doc.radius),
    damage: firstDamageAmount(doc.effects),
  };
}

export interface DeriveOptions {
  readonly minSample?: number;
}

/**
 * 從語料算出一格的中位數，**逐層往上退**並回報退到了哪一層。
 */
function columnFrom(
  rows: readonly Row[],
  slot: string,
  castType: string,
  pick: (r: Row) => number | undefined,
  fallback: number,
  minSample: number,
): ColumnDefault {
  const layers: readonly { basis: DefaultBasis; keep: (r: Row) => boolean }[] = [
    { basis: "slot+castType", keep: (r) => r.slot === slot && r.castType === castType },
    { basis: "slot", keep: (r) => r.slot === slot },
    { basis: "corpus", keep: () => true },
  ];
  for (const layer of layers) {
    const xs = rows.filter(layer.keep).map(pick).filter((v): v is number => v !== undefined);
    if (xs.length < minSample) continue;
    const m = median(xs);
    if (m !== undefined) return { value: m, sample: xs.length, basis: layer.basis };
  }
  return { value: fallback, sample: 0, basis: "fallback" };
}

/**
 * ⭐ 這一格是不是這種施放型態**本來就不該有**的。
 *
 * ⛔ 不是「填 0」而是「不適用」—— 兩者在警示那一支是完全不同的結論：
 * 一支 `self` 技的施展距離是 0 **完全正確**，而一支 `targeted` 技的 0
 * 是「作者沒填」。這張表是那個判斷的唯一住處，`newHeroChecks` 直接讀它。
 */
export function columnApplies(
  column: NewHeroColumnKey,
  castType: CastType,
  slot = "",
): boolean {
  switch (column) {
    case "range":
      // self 技打自己，沒有施展距離。
      return castType !== "self";
    case "radius":
      // 只有會在地上炸開／掃過去的那幾種才有範圍。
      return castType === "ground" || castType === "skillshot";
    case "damage":
      // ⛔ 天生技（純被動）的 `effects` 必須留空 —— `zAbilityDoc` 的 superRefine
      //    只允許 `innateKind: "active"` 帶效果，而一支剛出生的天生技是 "passive"。
      //    給它塞一發傷害＝草稿在 schema 那一關就被拒，而拒絕訊息會指向 innateKind。
      return slot !== "PASSIVE";
    default:
      return true;
  }
}

/**
 * ⭐【GH#445】把冷卻的中位數**挪出**「傷害相對冷卻偏低」的級距格。
 *
 * owner 2026-08-20 對那兩格（範圍・極小 **−60%** / 範圍・小 **−33%**）的裁決是
 * 「**傷害太低要跳出警告清單給我，後台跟 codex 編輯器也同步跳警告**」。
 * ⇒ 那條警告在 `newHeroChecks` 的 `low-damage-cell`。
 *
 * ⛔ 而一支**照預設值生出來的**新技能不可以一出生就踩到它 ——
 * 那正是 `tools/newhero/gen.ts` 的配對閘在守的事（「生成代入」↔「檢查警示」）。
 * 實測（2026-08-20）：30 組預設值裡有 **6 組**（PASSIVE/Q/W × skillshot/ground）
 * 的中位冷卻落在那兩格。
 *
 * ⭐ 做法：往上找**第一個不偏低的級距**，用它的卡面秒數。⛔ 不是挑一個數字 ——
 * 級距表動了，這裡自己跟著動。⚠️ 原本的中位數存在 `liftedFromMedian`，
 * ⛔ 不是無聲蓋掉（第二守則：fail-open 沒錯，靜默才是缺陷）。
 *
 * ⚠️ 為什麼是**挪冷卻**而不是**拉傷害**：拉傷害要動 `damage` 那一欄，而那一欄的
 * 出貨中位數（現況 ~400）遠低於傷害五級距（最低 1,150）—— 那是 GH#447 整批要處理的事，
 * ⛔ 不是這一支能替 owner 決定的（第一·五守則③：需要改平衡資料時不要自己挑數字）。
 */
function liftCooldown(
  cooldown: ColumnDefault,
  castType: CastType,
  slot: string,
  radius: ColumnDefault,
): ColumnDefault {
  const cells = lowDamageCells();
  if (cells.length === 0 || !(cooldown.value > 0)) return cooldown;
  // ⭐ 形狀走**同一支**判斷（`placeAbility` → `cooldownShapeOf`），⛔ 不在這裡重寫：
  //    生成端與警示端對「什麼算範圍技」一旦分岔，就會生出一支自己觸發自己警示的草稿。
  const probe: Record<string, unknown> = { cooldown: [cooldown.value] };
  if (columnApplies("radius", castType, slot) && radius.value > 0) probe["radius"] = radius.value;
  const placed = placeAbility(probe, cells);
  if (!placed || placed.cell === null) return cooldown;

  const row = DEFAULT_COOLDOWN_TIERS.seconds[placed.shape];
  const from = SKILL_TIER_NAMES.indexOf(placed.tier);
  for (let i = from + 1; i < SKILL_TIER_NAMES.length; i++) {
    const tier = SKILL_TIER_NAMES[i]!;
    if (cells.some((c) => c.shape === placed.shape && c.tier === tier)) continue;
    return { ...cooldown, value: row[tier], liftedFromMedian: cooldown.value };
  }
  // 整列都偏低（今天不會發生）—— ⛔ 原樣返回，讓警示自己去叫，不要憑空造一個數字。
  return cooldown;
}

/**
 * 一支新技能的六欄預設值。
 *
 * ⚠️ `corpus` 要餵**出貨的技能文件**。模板技（`template` 有值）的 `effects`
 * 在磁碟上是空的（`templates/expand.ts` 在註冊時才展開），所以它們的傷害讀不到 ——
 * 讀不到就是 `undefined`，⛔ 不會被當成 0 拉低中位數（見 {@link rowOf}）。
 */
export function deriveAbilityDefaults(
  corpus: readonly AbilityCorpusDoc[],
  slot: string,
  castType: CastType,
  opts: DeriveOptions = {},
): AbilityDefaults {
  const minSample = Math.max(1, opts.minSample ?? DEFAULT_MIN_SAMPLE);
  const rows = corpus.map(rowOf);
  const col = (pick: (r: Row) => number | undefined, fb: number): ColumnDefault =>
    columnFrom(rows, slot, castType, pick, fb, minSample);

  const zero: ColumnDefault = { value: 0, sample: 0, basis: "fallback" };
  const manaCost = col((r) => r.manaCost, FALLBACK.manaCost);
  const range = columnApplies("range", castType, slot) ? col((r) => r.range, FALLBACK.range) : zero;
  const radius = columnApplies("radius", castType, slot) ? col((r) => r.radius, FALLBACK.radius) : zero;
  const damage = columnApplies("damage", castType, slot) ? col((r) => r.damage, FALLBACK.damage) : zero;
  // ⭐ GH#445 —— 冷卻的中位數要**挪出**「傷害相對冷卻偏低」的那幾格。⛔ 見 liftCooldown()。
  const cooldown = liftCooldown(col((r) => r.cooldown, FALLBACK.cooldown), castType, slot, radius);

  const out: AbilityDefaults = {
    slot,
    castType,
    cooldown,
    manaCost,
    range,
    radius,
    damage,
    description: "",
  };
  return { ...out, description: describeAbilityDefaults(out) };
}

const CAST_ZH: Readonly<Record<CastType, string>> = Object.freeze({
  targeted: "指定單一敵人",
  skillshot: "朝指定方向發射",
  ground: "在指定地點",
  self: "對自身",
  dash: "朝指定方向突進",
});

/**
 * ⭐ 從**同一組數字**生一段機制說明。
 *
 * ⛔ 不含 `「…」`（第〇·六守則②：台詞不是效果，混進來下一支讀說明的程式就會誤讀）。
 * 每一個數字都與同一份 JSON 逐字相同 ⇒ `newHeroChecks` 的 `claim-mismatch`
 * 在出生的那一刻是零。作者改了 JSON 而忘了改說明 → 那一條就會亮。
 */
export function describeAbilityDefaults(d: AbilityDefaults): string {
  const parts: string[] = [`${CAST_ZH[d.castType]}`];
  if (columnApplies("range", d.castType, d.slot) && d.range.value > 0) {
    parts.push(`施法距離 ${d.range.value}`);
  }
  if (columnApplies("radius", d.castType, d.slot) && d.radius.value > 0) {
    parts.push(`範圍 ${d.radius.value}`);
  }
  const head = parts.join("，");
  const body = d.damage.value > 0 ? `造成 ${d.damage.value} 點傷害。` : "（效果待填）。";
  return `${head}，${body}冷卻 ${d.cooldown.value} 秒，消耗[MP] ${d.manaCost.value}。`;
}

/** 一發最小的傷害效果 —— 剛出生的技能**至少會做一件事**，⛔ 不是一個空殼。 */
function seedDamageEffect(damage: number): Record<string, unknown> {
  return { kind: "damage", damageType: "magic", amount: { perRank: [damage] } };
}

/**
 * 把預設值**代入**一份技能草稿 —— ⛔ 只填空的格子，作者填過的一格都不動。
 *
 * ⚠️ 「空」的定義對每一格不同，而且 `0` 算空：一支 `targeted` 技的
 * `cooldown: [0]` 是 `blankAbilityRow()` 留下的痕跡，不是作者的設計。
 * 真的要 0 冷卻的技能，作者改完之後這裡不會再動它（代入只在建立當下跑一次）。
 */
export interface ApplyOptions {
  /**
   * 要不要把生成的說明代進去（`config.new-hero-checks@1.autofillDescription`）。
   * ⛔ 這是**一格後台開關**（第一守則），⛔ 不是呼叫端各自的偏好 ——
   * 兩個入口（新英雄模板 / 鑄英雄工坊）必須對同一個問題給同一個答案。
   */
  readonly description?: boolean;
}

export function applyAbilityDefaults(
  doc: Readonly<Record<string, unknown>>,
  d: AbilityDefaults,
  opts: ApplyOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc };
  const emptyRanks = (v: unknown): boolean =>
    !Array.isArray(v) || v.length === 0 || v.every((x) => !isNum(x) || x === 0);

  if (emptyRanks(out["cooldown"])) out["cooldown"] = [d.cooldown.value];
  if (emptyRanks(out["manaCost"])) out["manaCost"] = [d.manaCost.value];
  if (columnApplies("range", d.castType, d.slot)) {
    // ⚠️ `rangeTier` 填了就**不要**填 `range`（ability schema：兩格都填級別贏）。
    if (out["rangeTier"] === undefined && (!isNum(out["range"]) || out["range"] === 0))
      out["range"] = d.range.value;
  } else if (!isNum(out["range"])) {
    out["range"] = 0;
  }
  if (columnApplies("radius", d.castType, d.slot) && out["radiusTier"] === undefined && !isNum(out["radius"])) {
    out["radius"] = d.radius.value;
  }
  // ⭐【傷害】—— 六欄之一，所以它也要**代入**，⛔ 不是留一個空殼讓人自己填。
  //   ⚠️ 只在效果樹真的空的時候塞，而且模板技（`template`）一格都不動：
  //   它的 effects 在磁碟上本來就是空的，塞進去等於在展開結果外面多長一發傷害。
  if (
    columnApplies("damage", d.castType, d.slot) &&
    d.damage.value > 0 &&
    out["template"] === undefined &&
    (!Array.isArray(out["effects"]) || out["effects"].length === 0)
  ) {
    out["effects"] = [seedDamageEffect(d.damage.value)];
  }
  // ⚠️ 關掉「自動代入說明」時這一格**維持原樣**（多半是不存在），⛔ 不是寫一個
  //   空字串進去 —— 一個空的 `description` 在卡片上與「沒有這一格」長得一樣，
  //   但它會讓下一支讀說明的程式以為作者寫過而且寫了空的。
  if (
    (opts.description ?? true) &&
    (typeof out["description"] !== "string" || out["description"].trim() === "")
  ) {
    out["description"] = d.description;
  }
  return out;
}
