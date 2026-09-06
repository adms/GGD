/**
 * abilityLiveDamage —— 技能卡面的「目前 N」（GH#1039）：玩家**這一刻**的法強對每一發基礎傷害的即時試算。
 *
 * ── 為什麼要有它（owner 2026-09-06）──────────────────────────────────────────
 *
 * > 「原本我的公式 ap 乘數 0.005 **就是為了也可以影響純基礎傷害的技能**阿」
 * > 「我覺得對**玩家玩法直覺**也很重要 **跟平衡一樣重要**」
 *
 * 全域乘數 `1 + 法強 × rate`（三段式，`apCurveMult`）對每一支技能都生效，
 * 而卡面上的 `{{dmg}}` **按定義是基礎傷害**（`abilityProse.ts` 的 `PROSE_SLOT_DOC.dmg`）
 * ⇒ 卡面一個字都沒提法強。⭐ 這一支補上第二個數：`造成 500 點傷害（目前 1832）`。
 *
 * ── 三個「⛔ 不是」──────────────────────────────────────────────────────────
 *
 * ① ⛔ **不是第二份公式。** 乘數走 `apCurveMult`（全專案唯一的三段式算式）、
 *    基礎值走 `abilityQuantities` / `damageLeafScalings`（卡面 `{{dmg}}` 背後的同一片葉子）、
 *    全域傷害倍率走 `envFactor("damageDealt")`（displayFinal 的同一張表）。
 *    這裡只有**乘法**，⛔ 沒有任何一個自己記得的數字。
 * ② ⛔ **不是第二份算繪。** 卡面的字仍然只由 `renderAbilityText` 產生（註冊時）；
 *    這一支只在**已經算繪好的字**上找到 `q.dmg[i]` 那一串，把「（目前 N）」接在它後面。
 *    ⚠️ 客戶端拿不到帶佔位符的原文（`withProse` 在註冊時就代入了），所以定位是**找那串字**：
 *    量到的（2026-09-06，scratch 量測）：126 個 `{{dmg}}` 佔位符 **126 個定位到真位置、0 個錯**；
 *    定位不到（w3x 舊慣例只印其中一階、或基礎值 0 只靠係數）的走**頁尾一行**。
 * ③ ⛔ **不是自己算法強。** 法強讀 `seat.apNow` —— 伺服器每個 snapshot 送的
 *    `final[Stat.AbilityPower]`（GH#894），與 `apDamageMult` 讀的是**同一格**；
 *    買裝／升級／三選一改了屬性，下一個 snapshot 就跟著動。
 *    ⚠️ 已知殘差：那一格在線上是 `uint16`（整數），引擎乘的是未取整的值 ——
 *    差在小數點後，round 之後多數看不出來；要逐位元就得伺服器多送一格算好的乘數（協定 append，柵欄外）。
 *
 * ── 開關（決策點 ⇒ 一格後台欄位，預設開）──────────────────────────────────
 *
 * `config.ap-coefficient@1.proseLive`（與 `proseFromFormula` 同一份文件，同樣只管**顯示**）：
 * 關 ⇒ 卡面逐位元回到今天。⚠️ 這一格與預設值是我挑的，⛔ 不是 owner 說的。
 * 這裡讀它是防禦式的（缺席 ＝ 開）—— 三個住處由主 session 落地。
 */
import { Configs } from "@ggd/shared/content";
import {
  AP_DAMAGE_SCALING_DOC_ID,
  apCurveMult,
  apDamageScalingFromDoc,
  type ApDamageScaling,
} from "@ggd/shared/sim/combat/apDamageScaling";
import { originInScope } from "@ggd/shared/sim/combat/damageTypeOverride";
import {
  abilityQuantities,
  damageLeafScalings,
  type DamageLeafScaling,
} from "@ggd/shared/content/abilityProse";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { envFactor } from "../displayFinal";

/** `content/config/ap-coefficient.json` 的文件 id（開關住在那一份上）。 */
export const AP_COEFFICIENT_DOC_ID = "ap-coefficient";

/** 技能傷害封包的 origin 形狀（`damageTypeOverride.originInScope` 認的前綴）。 */
const ABILITY_ORIGIN = "ability:card";

export interface LiveDamageRules {
  /** `ap-coefficient.proseLive`（缺席 ＝ 開）。 */
  readonly enabled: boolean;
  /** 出貨的三段式（`apDamageScalingFromDoc`，缺文件 ＝ 出貨預設）。 */
  readonly scaling: ApDamageScaling;
}

/** 從兩份 config 文件推導；預設讀註冊表（測試可以直接餵文件）。 */
export function liveDamageRules(
  scalingDoc: unknown = Configs.tryGet(AP_DAMAGE_SCALING_DOC_ID),
  coeffDoc: unknown = Configs.tryGet(AP_COEFFICIENT_DOC_ID),
): LiveDamageRules {
  const flag = (coeffDoc as { proseLive?: unknown } | undefined)?.proseLive;
  return { enabled: typeof flag === "boolean" ? flag : true, scaling: apDamageScalingFromDoc(scalingDoc) };
}

/** 這一刻的乘數；技能不在 `scope` 裡（scope=basic）⇒ 1。 */
export function liveApMult(rules: LiveDamageRules, ap: number): number {
  return originInScope(ABILITY_ORIGIN, rules.scaling.scope) ? apCurveMult(ap, rules.scaling) : 1;
}

export interface LiveDamageInput {
  /** 目前階級（0 = 未學 ⇒ 用第 1 階，與卡面 meta chips 同一條規矩）。 */
  readonly rank: number;
  /** 玩家這一刻的法強（`seat.apNow`）。 */
  readonly ap: number;
  readonly env: CombatEnvMultipliers;
  readonly rules: LiveDamageRules;
}

/**
 * 一片葉子在這一刻真的會打出去的量（減傷前）：
 * `(基礎[階] + 法強 × 每點加成[階]) × combatEnv.damageDealt × apCurveMult(法強)`
 * —— 逐項對到 `resolveScaling` → `damage.ts` 佇列排空那三行的順序。
 */
export function liveDamageOf(leaf: DamageLeafScaling, input: LiveDamageInput): number {
  const i = Math.min(Math.max(0, input.rank - 1), leaf.ranks.length - 1);
  const inScope = originInScope(ABILITY_ORIGIN, input.rules.scaling.scope);
  // `apRatioMode: "replace"` ⇒ 卡面係數那一條在技能傷害上被摀掉（`apRatiosSuppressed`）。
  const ratiosOn = !(input.rules.scaling.apRatioMode === "replace" && inScope);
  const base = leaf.ranks[i] ?? 0;
  const perPoint = ratiosOn ? (leaf.apPerPoint[i] ?? 0) : 0;
  const dmgEnv = envFactor("damageDealt", input.env);
  return (base + input.ap * perPoint) * (Number.isFinite(dmgEnv) ? dmgEnv : 1) * liveApMult(input.rules, input.ap);
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const fmt = (n: number): string => String(Math.round(n));

/**
 * 在算繪好的卡面字裡定位 `q.dmg[i]` 那一串（獨立的數字串：前後都不是數字／斜線／小數點／%）。
 * 偏好後面 14 字內有「傷害／損害」或緊接 AP 項（`+N% [AP]`）的那一處；沒有偏好命中時
 * **只有逐階串**（含 `/`）才退回第一個命中 —— 一個孤零零的「500」有太多別的意思。
 */
export function locateDamageString(text: string, s: string, from: number): number {
  if (/^0(?:\/0)*$/.test(s)) return -1;
  const re = new RegExp(`(?<![\\d./])${esc(s)}(?![\\d./%])`, "g");
  re.lastIndex = from;
  const hits: number[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) hits.push(m.index);
  const pref = hits.find((i) => {
    const after = text.slice(i + s.length, i + s.length + 14);
    return /傷害|損害/.test(after) || /^\s*\+\s*[\d./]+%/.test(after);
  });
  if (pref !== undefined) return pref;
  return s.includes("/") ? (hits[0] ?? -1) : -1;
}

/** 數字後面緊接的「單位片語」：先跳過 AP 項（`+N% [AP]`），再跳過「點／的／[真實]／額外…傷害」。 */
const AP_TERM_RE = /^\s*\+\s*[\d./]+%\s*\[[^\]]*\]/;
const UNIT_RE = /^\s*(?:點|的)?\s*(?:\[[^\]]*\]\s*)?(?:的)?[一-鿿]{0,3}?(?:傷害|損害)/;

/**
 * ⭐ 卡面字 → 帶「（目前 N）」的卡面字。開關關 ⇒ **逐位元回傳原文**。
 * 定位得到的葉子接在單位片語後面；定位不到的收成頁尾一行「目前傷害 N（基礎 M）」。
 */
export function liveAbilityBody(text: string | undefined, def: unknown, input: LiveDamageInput): string | undefined {
  if (text === undefined || !input.rules.enabled) return text;
  const q = abilityQuantities(def);
  const leaves = damageLeafScalings(def);
  if (q.dmg.length === 0) return text;
  // 對不齊 ⇒ 兩邊走訪分家了（不該發生）；寧可全部走頁尾也不把數字接到別片葉子後面。
  const aligned = leaves.length === q.dmg.length;
  const inserts: { at: number; s: string }[] = [];
  const footer: string[] = [];
  let from = 0;
  leaves.forEach((leaf, i) => {
    const live = fmt(liveDamageOf(leaf, input));
    const s = q.dmg[i];
    const baseAtRank = fmt(leaf.ranks[Math.min(Math.max(0, input.rank - 1), leaf.ranks.length - 1)] ?? 0);
    if (s === undefined || live === s) return; // 一模一樣 ⇒ 一句空話（第一·五守則）
    const at = aligned ? locateDamageString(text, s, from) : -1;
    if (at < 0) {
      footer.push(`${live}（基礎 ${baseAtRank}）`);
      return;
    }
    let end = at + s.length;
    const ap = AP_TERM_RE.exec(text.slice(end));
    if (ap) end += ap[0].length;
    const unit = UNIT_RE.exec(text.slice(end));
    if (unit) end += unit[0].length;
    inserts.push({ at: end, s: `（目前 ${live}）` });
    from = end;
  });
  let out = text;
  for (const ins of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, ins.at) + ins.s + out.slice(ins.at);
  if (footer.length > 0) out += `\n目前傷害 ${footer.join(" · ")}`;
  return out;
}

const fmtPct = (r: number): string => String(Math.round(r * 100 * 100) / 100);

/**
 * ⭐ A 票那一行全域規則 —— 值**從 config 推導**（改 config ⇒ 文案跟著變）：
 * 「技能傷害 ＋每 1 點法強 0.5%（法強 400 後遞減，最多 ×41）· 你的法強 245 ⇒ ×2.23」。
 * 這一層不存在（rate 0 / scope 不含技能 / 開關關）⇒ `undefined`（⛔ 不印一句空話）。
 */
export function apRuleCaption(rules: LiveDamageRules, ap: number): string | undefined {
  const r = rules.scaling;
  if (!rules.enabled || r.rate === 0 || !originInScope(ABILITY_ORIGIN, r.scope)) return undefined;
  const bend = r.apCurveK > 0 && r.apCurveP < 1 ? `法強 ${fmt(r.apCurveK)} 後遞減` : "";
  const cap = r.apCurveMaxMult > 0 ? `最多 ×${fmt(1 + r.apCurveMaxMult)}` : "";
  const bounds = [bend, cap].filter((s) => s !== "").join("，");
  const mult = liveApMult(rules, ap);
  return (
    `技能傷害 ＋每 1 點法強 ${fmtPct(r.rate)}%` +
    (bounds ? `（${bounds}）` : "") +
    ` · 你的法強 ${fmt(ap)} ⇒ ×${(Math.round(mult * 100) / 100).toFixed(2)}`
  );
}
