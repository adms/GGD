/**
 * apDamageScaling.ts —— 「AP 是**原本傷害的額外加成**」的唯一讀取點。
 *
 * owner 2026-08-21（逐字）：
 *
 * > 「我有個更好的建議，就是**技能傷害都套用公式 (1+AP*1%)**
 * >  物理意義來說 就是 **AP 變為原本傷害的額外加成**，
 * >  例如 AP 37 => 額外 37% AP 傷害；AP 245 => 額外 245% AP 傷害」
 * > 「=> **預設 0.5%**」
 *
 * ⇒ `最終技能傷害 = 基礎傷害 × (1 + AP × 加成率)`，加成率出貨 **0.5%/點**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 它解決的是一個**量到的結構問題**，⛔ 不是一次調參
 * ═══════════════════════════════════════════════════════════════════════════
 * 今天 115 個技能傷害節點靠 `ratios: [{stat:"ap", coeff}]` 吃 AP，而那是一條
 * **加法**：`傷害 = flat + perRank + AP × coeff`。加法的問題是它**與基礎傷害脫鉤**
 * —— 一支基礎 1,200 的大招與一支基礎 120 的小招，只要 coeff 相同就拿到**一樣多**
 * 的 AP 收益，於是「堆法強」這件事對前者幾乎沒有感覺。
 * 乘法把收益綁回**這一支技能自己的體量**，這正是 owner 那句「AP 變為原本傷害的
 * **額外加成**」的字面意思。
 *
 * ⚠️ 它也是**出身**這件事第一次有意義的地方：法刺（AP 377）的技能是射手（AP 94）
 * 的 **1.96 倍**；在這一層出現之前那個差距只有 **1.4%**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 三個「⛔ 不是」——每一個都是刻意的，⛔ 不是漏掉
 * ═══════════════════════════════════════════════════════════════════════════
 * ① ⛔ **不是**第二份「什麼算技能傷害」的定義。範圍判定走 `damageTypeOverride.ts`
 *    的 {@link originInScope} —— 那支的檔頭已經寫死了這條規矩：
 *    「兩份就會有兩種『什麼算技能傷害』，而它們分歧的那一天，惡夢魔王碎片與這個
 *    欄位會對同一發封包給出不同的答案」。
 *
 * ② ⛔ **不是**寫死的常數。三格全部是欄位（第一守則）：加成率、吃到的範圍、
 *    以及「跟既有的 `ratios:{stat:"ap"}` 疊加還是取代」。
 *    ⭐ **`rate = 0` 是完整的一鍵 rollback** —— 乘數逐位元回到 1，
 *    也就是這一層出現之前的每一場比賽。守衛真的驗這一條。
 *
 * ③ ⛔ **不是**每個傷害葉各寫一次。它掛在**傷害佇列**排空的那一行上，
 *    緊貼 `combatEnv.damageDealt` 全域倍率 —— 那是同一層（出手多重，減傷之前）。
 *    每一個傷害來源（技能、技能投射物、技能 DoT、代放）都排進同一條佇列，
 *    所以**一行**就是全部；⛔ 五個葉子各乘一次是五份會分頭腐爛的算式。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 反彈封包**不吃**這一層，而且理由與它不吃全域倍率**逐字相同**
 * ═══════════════════════════════════════════════════════════════════════════
 * 一發反彈的量是「剛剛打中我的那一下」的一個百分比，而那三個讀數
 * （`TriggerDamage.raw/mitigated/hpLost`）**已經吃過攻擊者的 AP 乘數**。
 * 反彈者再乘一次自己的，反彈比例就不等於卡面寫的百分比了。
 * ⇒ 這一層與全域倍率共用**同一個**旗標 `DamagePacket.skipGlobalDamageMult`
 * （以及它的內容側開關 `incomingPct.applyGlobalDamageMult`），⛔ 不開第二個。
 */
import type { SimWorld } from "../SimWorld";
import type { EntityId } from "../../ids";
import type { DamageType } from "../effects/effect";
import { Stat } from "../stats/statTypes";
import { originInScope, type DamageConversionScope } from "./damageTypeOverride";

/** `content/config/ap-damage-scaling.json` 的文件 id。 */
export const AP_DAMAGE_SCALING_DOC_ID = "ap-damage-scaling";

/**
 * 哪一類封包吃這一層。⛔ 這不是一個新詞彙 —— 它就是 `damageTypeOverride` 的
 * `DamageConversionScope`，同一個 enum、同一支謂詞。三個值分別涵蓋：
 *
 * | 值 | 吃到的 origin | 具體是誰 |
 * |---|---|---|
 * | `"ability"`（出貨） | `ability:*` | 瞬發技能、吟唱技能、技能投射物、技能掛的 DoT、代放 |
 * | `"basic"` | `basic` | 只有普通攻擊（近戰與遠程投射物） |
 * | `"all"` | 全部 | 再加上道具／增益卡觸發（`hook:*`）、火圈、守衛塔、殭屍 |
 */
export type ApDamageScope = DamageConversionScope;

/**
 * 新的**乘法**與既有的 `ratios: [{stat:"ap", coeff}]` **加法**怎麼共存。
 *
 * ⭐ 出貨 `"stack"`，而這是量出來的，⛔ 不是我挑順眼的那個：
 * 115 個帶 `ap` 係數的技能傷害節點裡，**115 個（100%）**在拿掉那條係數之後
 * 就**完全沒有任何屬性相依**（沒有其他 `ratios`、沒有 `attrRatios`）——
 * 也就是變成純固定值。係數今天的分佈是 0.1 … 7.0（中位 0.6），
 * `"replace"` 會把「×7.0 AP 的大招」與「×0.1 AP 的小招」壓成**同一支技能**。
 *
 * ⇒ `"replace"` 存在是為了**回頭**（owner 若判定雙重計算太肥），
 * ⛔ 不是為了觀望。切過去之後：`ability` 範圍內的傷害 `Scaling` 讀不到 `ap`
 * （只有那一族），乘法層照舊。
 */
export type ApRatioMode = "stack" | "replace";

export interface ApDamageScaling {
  /**
   * 每 1 點 AP 讓傷害多幾成。0.005 = 0.5%/點 ⇒ AP 100 = ×1.5。
   * ⭐ **0 = 這一層整個不存在**（乘數恆為 1），也就是一鍵 rollback。
   */
  rate: number;
  /** 哪一類封包吃這一層。見 {@link ApDamageScope}。 */
  scope: ApDamageScope;
  /** 與既有 AP 係數的關係。見 {@link ApRatioMode}。 */
  apRatioMode: ApRatioMode;
  /**
   * ⭐ GH#929 —— 卡面寫「目標最大生命 X%」的**真傷**那一份**不吃**這一層。
   *
   * > 「生命百分比傷害若是 **[真實傷害]** 則不列入 AP 乘數中，
   * >  因為**真實傷害沒有魔抗來制衡**」
   * > — owner 2026-09-02（逐字）
   *
   * ⭐ 出貨 **true ＝ 修好的那一邊**（第〇·六守則：優先權高的更新預設啟動；
   * 而「卡面不可以說謊」是第一·五守則）。**false ＝ 一鍵 rollback**，
   * 逐位元回到 2026-09-02 之前 —— 那時 59-04「目標最大生命 10%」在
   * 滿裝法師手上實測是 **27%**。
   *
   * ⚠️ owner 的判準是**有沒有煞車**，⛔ 不是「百分比傷害都不該被放大」：
   * magic / physical 的百分比傷害會被魔抗／護甲吃掉一截，所以它們吃 AP 乘數
   * 是有制衡的；⛔ 真傷沒有任何制衡。⇒ 這一格**只**認 `damageType === "true"`。
   * 出貨量到的 24 個 `resourcePct` 節點裡，這一格管的是 **12 個**。
   */
  resourcePctSkipsGlobalMult: boolean;
  /**
   * ⭐ GH#1029 三段式（owner 2026-09-06 逐字「#1029 改成「M=40 · K=400 · p=0.8」開票」）：
   *   法強 ≤ K ：1 + rate × 法強                              ← 逐位元等於直線
   *   法強 > K ：1 + rate × [K + (K/p) × ((法強/K)^p − 1)]      ← 邊際遞減，斜率在 K 連續、永不為 0
   *   上界     ：min(上式, 1 + M)
   * `apCurveK` ＝ 膝點。owner：「K應該要設定在99級ap上限的數值(裸裝) 裝備帶來的ap價值會開始遞減才對」。
   */
  apCurveK: number;
  /**
   * 邊際遞減指數 p（0 < p ≤ 1）。⭐ **1.0 ＝ 逐位元回到直線**（rollback）。
   * ⚠️ 解析時收成 **1/20 的有理數**：純度閘擋 `Math.pow`（IEEE-754 不是正確捨入，跨機器會分岔），
   * 所以 x^p 走 `x^(a/b)` ＝ b 次方根（牛頓法，決定性）。
   */
  apCurveP: number;
  /** 硬上界 M：乘數 ≤ 1 + M（出貨 40）。⭐ 0 ＝ 沒有上界。實際上它是千年積木那一件單品的煞車。 */
  apCurveMaxMult: number;
}

/**
 * 出貨值。
 *
 * ⚠️ **缺文件 = 這一份，不是空物件**（同 `DEFAULT_DAMAGE_RULES` 的規矩）——
 * 一個 undefined 的 `rate` 會讓 `1 + ap * rate` 變成 **NaN**，
 * 而 NaN 傷害在畫面上等於「這一發沒扣血」，⛔ 而且不會有任何一行報錯。
 */
export const DEFAULT_AP_DAMAGE_SCALING: ApDamageScaling = Object.freeze({
  rate: 0.005,
  scope: "ability",
  apRatioMode: "stack",
  resourcePctSkipsGlobalMult: true,
  apCurveK: 400,
  apCurveP: 0.8,
  apCurveMaxMult: 40,
});

/** `apCurveK` 的上界（第一守則：欄位要有上界）。 */
export const AP_CURVE_K_MAX = 100000;
/** `apCurveMaxMult` 的上界。 */
export const AP_CURVE_MAX_MULT_MAX = 1000;
/** `apCurveP` 的分母：p 收成這個分母的有理數（1/20 ⇒ 0.05 一格）。 */
export const AP_CURVE_P_DENOM = 20;

/** p 收成 1/20 的有理數（0.05 ≤ p ≤ 1）。⛔ 這是純度的代價，⛔ 不是設計選擇。 */
export function snapCurveP(p: number): number {
  if (!Number.isFinite(p)) return DEFAULT_AP_DAMAGE_SCALING.apCurveP;
  const n = Math.min(AP_CURVE_P_DENOM, Math.max(1, Math.round(p * AP_CURVE_P_DENOM)));
  return n / AP_CURVE_P_DENOM;
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/**
 * ⭐ `x^(n/20)`（x ≥ 1）—— **有理逼近**，⛔ 不是 `Math.pow`（`purity.test.ts`：IEEE-754 的 pow 不是正確捨入）。
 * 先約分 n/20 = a/b，x^a 用連乘，b 次方根用牛頓法（固定步數上限，收斂即停）：每一步只有 + − × ÷，
 * 而那四個在 IEEE-754 裡**是**正確捨入的 ⇒ 兩台機器逐位元相同。
 */
export function rationalPow(x: number, p: number): number {
  const n = Math.round(p * AP_CURVE_P_DENOM);
  if (n >= AP_CURVE_P_DENOM) return x;
  if (n <= 0 || !(x > 0)) return 1;
  const g = gcd(n, AP_CURVE_P_DENOM);
  const a = n / g;
  const b = AP_CURVE_P_DENOM / g;
  // ⭐ 先開 b 次方根、再乘 a 次（⛔ 不是先 x^a：250^19 ≈ 1e45 會讓牛頓法從 1e44 起步、y^20 直接溢位）。
  const inv = x < 1;
  const v = inv ? 1 / x : x;
  // b 次方根：從 Bernoulli 上界 1 + (v−1)/b 起步 ⇒ 牛頓法**單調下降**收斂；收斂（下一步不再變小）即停。
  let y = 1 + (v - 1) / b;
  for (let k = 0; k < 400; k++) {
    let yb1 = 1;
    for (let i = 0; i < b - 1; i++) yb1 *= y;
    const next = y - (yb1 * y - v) / (b * yb1);
    if (!(next < y)) break;
    y = next;
  }
  let out = 1;
  for (let i = 0; i < a; i++) out *= y;
  return inv ? 1 / out : out;
}

/**
 * ⭐⭐ 三段式乘數（GH#1029）—— **全專案唯一的算式**，`apDamageMult` 與產生器都呼叫它。
 * ⚠️ 法強 ≤ K 與 p ≥ 1 兩條路**刻意不經過任何除法** ⇒ 逐位元等於 `1 + rate × 法強`（AC 3 / AC 6）。
 */
export function apCurveMult(ap: number, r: ApDamageScaling): number {
  if (r.rate === 0 || !(ap > 0)) return 1;
  const K = r.apCurveK;
  const p = r.apCurveP;
  let eff = ap;
  if (K > 0 && p < 1 && ap > K) eff = K + (K / p) * (rationalPow(ap / K, p) - 1);
  const mult = 1 + eff * r.rate;
  return r.apCurveMaxMult > 0 ? Math.min(mult, 1 + r.apCurveMaxMult) : mult;
}

/**
 * 加成率的上界。⛔ 這不是一個「保險起見」的數字 ——
 * 第一守則要求欄位有**上界**不是只有下界（#277：50 打成 500 會過後台）。
 * 0.05 = 5%/點 ⇒ 一個 AP 200 的英雄拿到 ×11，那已經是「技能一發一個人」的區間；
 * 再高就不是平衡而是打錯字。
 */
export const AP_DAMAGE_RATE_MAX = 0.05;

const SCOPES: readonly ApDamageScope[] = ["basic", "ability", "all"];
const MODES: readonly ApRatioMode[] = ["stack", "replace"];

/**
 * 正規化操作者/文件給的表 —— 三層守衛的**最裡面**一層（同 `normalizeDamageRules`）：
 * 後台頁擋在前面、Zod 擋在中間，這裡擋的是任何繞過那兩層的來源。
 */
export function normalizeApDamageScaling(raw: unknown): ApDamageScaling {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_AP_DAMAGE_SCALING;
  const r = raw as {
    rate?: unknown;
    scope?: unknown;
    apRatioMode?: unknown;
    resourcePctSkipsGlobalMult?: unknown;
    apCurveK?: unknown;
    apCurveP?: unknown;
    apCurveMaxMult?: unknown;
  };
  const rate =
    typeof r.rate === "number" && Number.isFinite(r.rate) && r.rate >= 0
      ? Math.min(r.rate, AP_DAMAGE_RATE_MAX)
      : DEFAULT_AP_DAMAGE_SCALING.rate;
  return {
    rate,
    scope: SCOPES.includes(r.scope as ApDamageScope)
      ? (r.scope as ApDamageScope)
      : DEFAULT_AP_DAMAGE_SCALING.scope,
    apRatioMode: MODES.includes(r.apRatioMode as ApRatioMode)
      ? (r.apRatioMode as ApRatioMode)
      : DEFAULT_AP_DAMAGE_SCALING.apRatioMode,
    // ⭐ GH#929 —— 只認**真的布林**；任何別的東西（含缺席）都回出貨預設。
    // ⛔ 不可以寫成 `!!r.x` —— 那會把「這份文件沒有這一格」讀成 **false**，
    // 也就是把一個**缺席的旗標**靜靜地變成「關掉修正」。
    resourcePctSkipsGlobalMult:
      typeof r.resourcePctSkipsGlobalMult === "boolean"
        ? r.resourcePctSkipsGlobalMult
        : DEFAULT_AP_DAMAGE_SCALING.resourcePctSkipsGlobalMult,
    // ⭐ GH#1029 —— 三格都有上下界；缺席／越界 ⇒ 出貨值（同 rate 的規矩）。
    apCurveK:
      typeof r.apCurveK === "number" && Number.isFinite(r.apCurveK) && r.apCurveK > 0
        ? Math.min(r.apCurveK, AP_CURVE_K_MAX)
        : DEFAULT_AP_DAMAGE_SCALING.apCurveK,
    apCurveP: snapCurveP(typeof r.apCurveP === "number" ? r.apCurveP : DEFAULT_AP_DAMAGE_SCALING.apCurveP),
    apCurveMaxMult:
      typeof r.apCurveMaxMult === "number" && Number.isFinite(r.apCurveMaxMult) && r.apCurveMaxMult >= 0
        ? Math.min(r.apCurveMaxMult, AP_CURVE_MAX_MULT_MAX)
        : DEFAULT_AP_DAMAGE_SCALING.apCurveMaxMult,
  };
}

/** 從 `config.ap-damage-scaling@1` 文件讀出來。缺文件 = 出貨預設。 */
export function apDamageScalingFromDoc(doc: unknown): ApDamageScaling {
  const d = doc as { schema?: string } | undefined;
  if (!d || d.schema !== "config.ap-damage-scaling@1") return DEFAULT_AP_DAMAGE_SCALING;
  return normalizeApDamageScaling(d);
}

/**
 * 這一發封包的 AP 乘數 —— `1 + 施法者的 AP × 加成率`。
 *
 * ⚠️ 讀的是 **`pkt.source`（施法者）** 的 AP，⛔ 不是受害者的。
 * 「AP 變為原本傷害的額外加成」講的是出手的人有多強，而 `pkt.source` 在每一條
 * 路徑上都是那個人：技能是 `ctx.caster`（`effects/damage.ts` 那一行）、
 * 投射物是它的擁有者、DoT tick 是 `DotInstance.sourceId`。
 *
 * 回 **1**（＝這一層不存在）的四種情況，四種都刻意：
 *   · `rate` 是 0 —— 一鍵 rollback，快路徑先擋；
 *   · 這一發不在 `scope` 裡（出貨 = 不是 `ability:*`）；
 *   · 沒有 source，或這個 source 沒有 StatsComp（環境傷害、火圈、守衛塔那些
 *     「沒有主人」的來源本來就不該被誰的法強放大 —— 與 `outputMult` 同一句話）；
 *   · AP 是 0。
 *
 * purity：一個加法一個乘法。⛔ 無 `**`、無三角函式、無時鐘、無亂數。
 */
export function apDamageMult(
  world: SimWorld,
  source: EntityId | undefined,
  origin: string,
): number {
  const rules = world.apDamageScaling;
  if (rules.rate === 0) return 1;
  if (!originInScope(origin, rules.scope)) return 1;
  if (source === undefined) return 1;
  const ap = world.stats.get(source)?.final[Stat.AbilityPower];
  if (ap === undefined || ap <= 0) return 1;
  // ⭐ GH#1029：三段式（≤K 逐位元等於 `1 + ap × rate`）。
  return apCurveMult(ap, rules);
}

/**
 * 這一次解算要不要把 `Scaling.ratios` 裡的 `ap` 那一條**摀掉** ——
 * `apRatioMode: "replace"` 的全部。
 *
 * ⚠️ 為什麼摀在**這裡**而不是刪內容：`ratios` 是 115 個節點上的作者資料，
 * 刪掉就回不去了，而一個回不去的開關不是開關。摀掉是**執行期**的，
 * 切回 `"stack"` 下一場就恢復。
 */
export function apRatiosSuppressed(world: SimWorld, origin: string): boolean {
  const rules = world.apDamageScaling;
  return rules.apRatioMode === "replace" && originInScope(origin, rules.scope);
}

/**
 * ⭐ GH#929 —— 這一發封包裡「某一條血條的百分比」那一份**佔多少比例**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 為什麼是**比例**而不是絕對量
 * ═══════════════════════════════════════════════════════════════════════════
 * 傷害葉在 push 之前還會對**整發**乘一些東西（`canCrit` 的暴擊倍率、
 * `damageArea` 的距離衰減）。記絕對量的話，那些乘法每多一個就要記得同步乘
 * 一次它 —— 而漏掉的那一次會讓豁免的量與實際的量脫鉤，
 * ⛔ 且**在畫面上跟正確的一模一樣**。
 * ⭐ 比例對「對整發同乘一個數」是**不變量**：`(u·k) / (t·k) = u / t`。
 * ⇒ 只要那些乘法乘的是整發，這一格就永遠是對的，⛔ 不必逐一維護。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 三道閘，缺一發就是另一種「卡面說謊」
 * ═══════════════════════════════════════════════════════════════════════════
 *  · 開關關掉 ⇒ 回 0 ⇒ 逐位元回到 2026-09-02 之前（一鍵 rollback）。
 *  · ⛔ 型別不是 `"true"` ⇒ 回 0。owner 的判準是**有沒有煞車**：
 *    magic/physical 會被魔抗/護甲吃掉一截，⇒ 它們吃 AP 乘數是有制衡的。
 *  · 兩個量任一 ≤ 0 ⇒ 回 0（`u/t` 在 `t = 0` 是 `Infinity`／`NaN`，
 *    而一個 NaN 傷害在血條上等於「這一發沒扣血」而且**不會有任何一行報錯**）。
 *
 * ⭐ 夾在 1：`u > t` 只可能來自上游把 amount 減過（負的加項），
 * 而「豁免的比例 > 100%」在下游會把封包放大，⇒ 夾住比相信它安全。
 *
 * purity：一個除法、兩個比較。⛔ 無 `**`、無三角函式、無時鐘、無亂數。
 */
export function unscaledFractionOf(
  world: SimWorld,
  total: number,
  resourcePctPart: number,
  type: DamageType,
): number {
  if (world.apDamageScaling.resourcePctSkipsGlobalMult !== true) return 0;
  if (type !== "true") return 0;
  if (resourcePctPart <= 0 || total <= 0) return 0;
  const f = resourcePctPart / total;
  return f >= 1 ? 1 : f;
}
