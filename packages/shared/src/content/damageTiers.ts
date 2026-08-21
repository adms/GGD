/**
 * 傷害**五級距**（`config.damage-tiers@1`，GH#447）—— 四軸裡唯一的**回報**軸。
 *
 * owner 2026-08-19：
 * > Q1「假設最極端**單體 Q 傷害技能不帶負面狀態冷卻 6 秒**，
 * >   一回合**連續施展 20 次以內一定要能殺死對方**吧 不然也太爛了」
 * > Q3「**可以重新設計拉高**，畢竟之前檢討過 **AP 太弱勢**，
 * >   我們幾乎要拉到高等級才能開始追平普通攻擊無風險的傷害」
 * > Q4「**不用**（γ 超線性）已經有**傷害相應的冷卻跟耗魔**做限制」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 2026-08-20：這張表原本錨在 **Lv18**，而那是**錯的錨**
 *
 * owner 2026-08-20（逐字，對 #447 的更正）：
 * > 「我的錨點有講過是 **LV 30/50/99 三個**，至少要滿足 **30(hard limit)**，
 * >  能 **50 比較好(soft limit)**, **99 是極限**」
 *
 * 舊的五個數字（500/1250/2500/3750/5000）是拿 Lv18 的中位有效血量 9048 算的。
 * ⚠️ 它們不是「有點保守」——**血量比傷害長得快**（Lv18→LV99 中位有效血量 ×5.19，
 * 而中位滿階傷害只 ×2.14），所以一個錨在 Lv18 的表在 LV30 就已經**開始失效**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 2026-08-20 第二次重錨：**錨點空間**與**錨點等級**兩個都被 owner 更正了
 *
 * owner 2026-08-20（兩則，逐字）：
 * > 「**🅲 保留倍率，但把它從錨點推導裡剝掉** => OK」
 * > 「**我的建議是拿 30 級的當標準就好**，因為技能通常還有 AP 加成那塊沒算到」
 * > 「**不要計算 HP 系統倍率以及魔抗減傷 會讓我誤判**」
 *
 * ⇒ 兩件事一起改：
 *   · **空間**：錨點從「中位**有效**血量」（含魔抗）改成「中位**純基礎**血量」，
 *     系統倍率在推導式裡**顯式**乘一次，魔抗那一層**整層退場**。
 *   · **等級**：出貨錨**就是 hard limit**（LV30），⛔ 不再是「滿足得了的最高那一個」——
 *     那條規則會挑到 LV50，而 owner 明說要 LV30（第〇·六守則第 1 層）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這張表是**推導**出來的，⛔ 一個數字都不是挑的
 *
 * 四個輸入，四個都是 owner 給的或量到的（⛔ 沒有一個住在這個檔裡）：
 *
 *     KILL_CASTS_REF   = 20                       ← owner Q1「20 次以內一定要能殺死對方」
 *     MEDIAN_BASE_HP   純基礎中位血量（三個錨點）   ← `pnpm anchors:build` 量到的
 *     ⛔ **HP 系統倍率不在裡面**（owner 2026-08-22）—— 留給 owner 當最後的旋鈕
 *     HP_BASE_BONUS    base-bonus 的初始生命加成    ← 出貨 config 的快照
 *     DEFAULT_COOLDOWN_TIERS.seconds.單體          ← owner 2026-08-19 給的冷卻表
 *
 * ① **一個錨點要求的下限（極小）** —— `anchorFloor()`：
 *
 * ```
 *   純基礎中位 ÷ 20 發 × HP 倍率  +  初始加成 ÷ 20 發   →  進位到級距粒度
 * ```
 *
 *    ⚠️ **初始加成除以 20 之後才加，而且⛔ 不參與倍率**（owner #273
 *    「初始HP/MP/AP⋯不參與倍率計算」）。上一版把它折進「基礎」再回乘，
 *    差 **+16.5%** —— 那不是量測誤差，是一個算術錯誤。
 *    ⚠️ 一定要**進位**：捨去會差幾個 % 違反 owner 的 Q1，而且沒有任何東西會紅。
 *
 * ② **其餘四格**：`極小 × 單體冷卻 ÷ 極小那一格的冷卻`，也就是**與冷卻表嚴格成正比**
 *    （`tiersFromAnchor()`）。⭐ 這正是 owner Q4 的意思 ——「已經有傷害相應的冷卻
 *    做限制」＝貴的技能貴在它落在冷卻表的哪一格，⛔ 不是靠一條沒有錨的 γ 超線性曲線。
 *    ⇒ 五格 = 極小 × 1 / 2.5 / 5 / 7.5 / 10。
 *
 * ③ **進位粒度**（`TIER_ROUND_UP_TO`）：⭐ 它有一條**推導出來的下界**
 *    `MIN_TIER_STEP` —— 讓**五格全部落在整數上**的最小單位（比例 2.5 與 7.5 的
 *    分母 LCM）。粒度不是那個下界的倍數 = 級距表會長出 `1477.5` 這種卡面數字，
 *    而那不是「有點醜」，是**每一個消費端各自四捨五入到不同的答案**。
 *
 * ④ **哪一個錨點出貨**：⭐ **hard limit 那一個**（owner 2026-08-20 明說 LV30）。
 *    `anchorIsSatisfiable()` / `pickAnchor()` 留著是為了**報告**（差多少要看得到），
 *    ⛔ 不再決定出貨值。天花板仍然在守：
 *
 *        極大 ≤ DAMAGE_TIER_MAX（＝ hard limit 那一級的**引擎最終**中位血量）
 *
 *    也就是**一發不可以秒殺 LV30 的中位英雄**。
 *
 * ⭐ 三個錨點各自的達成率（`castsToKill()`，⛔ 不要手抄 —— 它是算出來的）：
 *    分母是**引擎最終**血量（引擎真的在打的那條），⛔ 不是純基礎。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 只有**一張**表，⛔ 沒有「單體一張、範圍一張」
 *
 * 形狀的代價**整個住在冷卻軸上**（範圍表比單體表貴 2–5×，`cooldownTiers.ts`）。
 * 再在傷害軸打一次折就是同一個懲罰收兩次。驗算：
 *
 *     單體·極大  5000 傷 ÷  60 卡面秒 = 83 每卡面秒 × 1 人   =  83
 *     範圍·極大  5000 傷 ÷ 120 卡面秒 = 42 每卡面秒 × 1.85 人 =  77
 *
 * 兩者在**每卡面秒的期望輸出**上幾乎相等 —— 一張表就夠了。
 * ⚠️ 但同樣的驗算在**範圍·極小**上是壞的（500 ÷ 30 × 1.33 = 22，只有單體極小的
 * 1/3.8）—— 那正是 GH#465 的來歷，而 owner 的答案是「那一格要求傷害是大／極大」，
 * ⛔ 不是「把傷害表拆成兩張」。相稱性住 `config.authoring-rules@1`。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 填了 `damageTier`，這一格的**基礎值就交出去了**
 *
 * `damageTier` 住在 `zScaling` 上（`amount: { damageTier: "中" }`），所以任何用
 * `Scaling` 的效果都吃得到 —— 一個機制，⛔ 不是 damage/damageArea/damageLine/dot/
 * chainLightning 各寫一份（第零守則⑨）。
 *
 * 解析時級距**取代** `flat` 與 `perRank`（⛔ 不是相加）—— 兩者相加會讓
 * 「填了級距卻比表大」變成一個沒有人發現得了的靜默偏差。
 * `ratios` / `attrRatios` **不動**：那兩條是**成長**，不是基礎值。
 */
import {
  BALANCE_ANCHOR_LEVELS,
  HARD_ANCHOR_LEVEL,
  HP_BASE_BONUS,
  HP_ENV_MULT,
  medianBaseHp,
  medianFinalHp,
  type BalanceAnchorLevel,
} from "./balanceAnchors";
import { DEFAULT_COOLDOWN_TIERS } from "./cooldownTiers";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** `content/config/damage-tiers.json` 的文件 id。 */
export const DAMAGE_TIERS_DOC_ID = "damage-tiers";

/** 五個級別 —— 與其餘三軸**同一份**。⛔ 不要在這裡另立一組。 */
export const DAMAGE_TIER_NAMES = SKILL_TIER_NAMES;
export type DamageTierName = SkillTierName;

/**
 * owner Q1 的「連續施展幾次一定要能殺死對方」。⛔ 不是一個平衡旋鈕的預設值，
 * 是**這張表的輸入**。
 */
export const KILL_CASTS_REF = 20;

/**
 * 五格之間的比例 —— **從冷卻表推導**（`單體` 那一列 ÷ 它自己的極小）。
 * ⭐ 全專案唯一知道「五格之間差幾倍」的地方，⛔ 不要在別處再寫一次 1/2.5/5/7.5/10。
 */
export function tierRatios(
  cd: Readonly<Record<DamageTierName, number>> = DEFAULT_COOLDOWN_TIERS.seconds["單體"],
): Readonly<Record<DamageTierName, number>> {
  const base = cd[DAMAGE_TIER_NAMES[0]];
  const out = {} as Record<DamageTierName, number>;
  for (const n of DAMAGE_TIER_NAMES) out[n] = base > 0 ? cd[n] / base : 1;
  return Object.freeze(out);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * ⭐ 讓**五格全部落在整數上**的最小單位 —— 從 `tierRatios()` 推導，⛔ 不是挑的。
 *
 * 出貨比例是 1 / 2.5 / 5 / 7.5 / 10 ⇒ 分母的 LCM 是 **2** ⇒ 極小必須是偶數。
 * ⚠️ 這不是潔癖：`591 × 2.5 = 1477.5`，而卡面、後台、Codex 契約、報告四個消費端
 * 各自 `Math.round` 一次就會得到**四個不同的答案**，而且沒有任何東西會紅。
 *
 * ⚠️ 只認到千分位（`DENOM_LIMIT`）—— 冷卻表被填成無理比例時退回 1，
 * ⛔ 不是無窮迴圈。
 */
const DENOM_LIMIT = 1000;
export function minTierStep(
  ratios: Readonly<Record<DamageTierName, number>> = tierRatios(),
): number {
  let lcm = 1;
  for (const n of DAMAGE_TIER_NAMES) {
    const r = ratios[n];
    if (!Number.isFinite(r) || r <= 0) continue;
    // r 的最簡分母：r × d 是整數的最小 d。
    let d = 1;
    while (d <= DENOM_LIMIT && Math.abs(r * d - Math.round(r * d)) > 1e-9) d++;
    if (d > DENOM_LIMIT) return 1;
    lcm = (lcm * d) / gcd(lcm, d);
  }
  return lcm;
}

/**
 * 進位的粒度 —— **卡面數字的可讀性單位**，⛔ 不是一個平衡旋鈕。
 *
 * ⚠️ 它必須是 `minTierStep()` 的整數倍（`tierStep()` 會把它抬上去），
 * 否則「五格全整數」那條性質會被一個看起來無害的編輯打破。
 * ⭐ 想改**級距的大小**時改的是 `KILL_CASTS_REF`（owner 的 20 發）或冷卻表，
 * ⛔ 不是這一格 —— 這一格只決定「進位到多細」。
 */
const TIER_ROUND_UP_TO = 50;

/** 實際用的進位粒度：可讀性單位**抬到**「五格全整數」那條下界上。 */
export function tierStep(): number {
  const min = minTierStep();
  return Math.max(min, Math.ceil(TIER_ROUND_UP_TO / min) * min);
}

export interface DamageTiers {
  /**
   * 止血閥兼**一鍵 rollback**。false = `damageTier` 不解析，技能回到自己手寫的
   * `flat` / `perRank`（＝今天的那一套數字）。
   */
  enabled: boolean;
  /** 級別 → **卡面**基礎傷害。⚠️ 上場還要乘 `combatEnv.damageDealt` 與減免。 */
  damage: Readonly<Record<DamageTierName, number>>;
}

/**
 * 單一格的上下界。
 * 下界 **1**：0 傷害的「傷害級距」是一個空宣稱（第一·五守則）。
 * 上界 = **hard limit 那一級（LV30）的中位有效血量**：超過它的一發就是**一發秒殺**，
 * 而那不是一個傷害級距，是另一種設計 —— 要做的話走專門的機制，⛔ 不是把這一格填爆。
 *
 * ⭐ 為什麼取 **LV30** 而不是 LV50/LV99：一發要不要算「秒殺」，看的是**最早**
 * 會遇到它的那一級。錨在更高的等級 = 在 LV30 開一扇「這一發合法但它就是即死」的門。
 * ⇒ 這一條同時是 `pickAnchor()` 的天花板（見檔頭 ③）。
 */
export const DAMAGE_TIER_MIN = 1;
export const DAMAGE_TIER_MAX = Math.floor(medianFinalHp(HARD_ANCHOR_LEVEL));

/**
 * 某一個錨點**要求**的極小值 —— 檔頭 ① 那一條式子，逐項對得起來：
 *
 * ```
 *   （純基礎中位 + 初始加成） ÷ 擊殺次數   →  進位到 tierStep()
 * ```
 *
 * ⛔⛔ **公式裡沒有 HP 系統倍率，這是刻意的。** owner 2026-08-22 逐字：
 *
 * > 「你的傷害要**從生命反推我沒意見**，但**不能把系統倍率乘進去再反推**啊，
 * >  這樣我用系統倍率就**沒意義了**」
 * > 「我就是要**保留系統倍率來做最後調整**」
 *
 * ⚠️ 在此之前這裡乘了 `HP_ENV_MULT`，於是**倍率自己把自己抵銷掉了**：
 * 血條 ×N 的同時級距也 ×N ⇒「一發極大佔血條幾 %」**逐位元不變**。
 * 實測三次（2026-08-22）：`maxHealth` 4.0 / 6.0 / 7.2 分別得到 51.0% / 52.0% / 50.9%
 * —— 也就是後台那一格**轉不動任何東西**，而它看起來完全正常
 *（第一·五守則：欄位在、schema 收得下、存得起來、全套測試綠，而它是空的）。
 *
 * ⇒ 現在倍率只進**血量**那一側，所以它就是 owner 要的那支最後的旋鈕：
 * 倍率調高 ⇒ 同一發佔血條的比例下降 ⇒ 要更多發才殺得死。
 *
 * ⚠️ 連帶語意變更：`KILL_CASTS_REF` 現在是**純基礎空間**的參考次數，
 * ⛔ 不再是「遊戲裡真的打幾發」——真實發數 = 參考次數 × HP 倍率。
 */
export function anchorFloorFrom(baseHp: number, bonus: number): number {
  const step = tierStep();
  const raw = (baseHp + bonus) / KILL_CASTS_REF;
  return Math.ceil(raw / step) * step;
}

/**
 * 同上，輸入取**已經量好的**那一份（`balanceAnchorsDerived.ts`）。
 * ⚠️ 產生器要用**這一輪剛量到的**數字時走 `anchorFloorFrom()`，⛔ 不是這一支 ——
 * 不然會拿上一輪的量測算出這一輪的表（差一拍，而且 `--check` 要跑兩次才綠）。
 */
export function anchorFloor(level: BalanceAnchorLevel): number {
  return anchorFloorFrom(medianBaseHp(level), HP_BASE_BONUS);
}

/**
 * 一個極小值展開成五格 —— **與單體冷卻表嚴格成正比**（owner Q4）。
 * ⭐ 全專案唯一知道「五格之間的比例」的地方。
 */
export function tiersFromAnchor(smallest: number): Readonly<Record<DamageTierName, number>> {
  const ratios = tierRatios();
  const out = {} as Record<DamageTierName, number>;
  // ⚠️ `Math.round` 在 `tierStep()` 成立時是恆等的 —— 它在這裡是**保險絲**，
  //    ⛔ 不是四捨五入策略（有人把冷卻表改成非整除比例時，至少不會漏出小數）。
  for (const n of DAMAGE_TIER_NAMES) out[n] = Math.round(smallest * ratios[n]);
  return Object.freeze(out);
}

/** 這個錨點**滿足得了嗎** —— 展開之後極大有沒有撞破「一發不可以秒殺」的天花板。 */
export function anchorIsSatisfiable(level: BalanceAnchorLevel): boolean {
  const t = tiersFromAnchor(anchorFloor(level));
  return t[DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!] <= DAMAGE_TIER_MAX;
}

/**
 * 「滿足得了的最高那一個」—— ⛔ **2026-08-20 起它不再決定出貨值**。
 *
 * owner 明說「**拿 30 級的當標準就好**」（第〇·六守則第 1 層：設計贏過推導）。
 * 這一支留著是因為**報告要印「另外兩個錨差多少」**，⛔ 不是因為還有人拿它挑錨點。
 */
export function pickAnchor(): BalanceAnchorLevel {
  let picked: BalanceAnchorLevel = HARD_ANCHOR_LEVEL;
  for (const level of BALANCE_ANCHOR_LEVELS) if (anchorIsSatisfiable(level)) picked = level;
  return picked;
}

/**
 * 出貨表落在哪一個錨點上 —— ⭐ **hard limit 那一個**（owner 2026-08-20 逐字裁決）。
 * 報告與後台說明從這裡讀，⛔ 不各自手寫。
 */
export const SHIPPED_ANCHOR_LEVEL: BalanceAnchorLevel = HARD_ANCHOR_LEVEL;

/**
 * 用出貨表打死某一個錨點的中位英雄要**幾發極小**。
 * ⭐ 達成率表的唯一算式 —— `≤ KILL_CASTS_REF` 就是達成。
 *
 * ⚠️ 分母是**引擎最終**血量（引擎真的在打的那條），⛔ 不是純基礎、
 * 也⛔ 不含魔抗（owner 2026-08-20「不要計算⋯魔抗減傷 會讓我誤判」）。
 */
export function castsToKill(level: BalanceAnchorLevel, smallest: number): number {
  return medianFinalHp(level) / smallest;
}

/**
 * 同上，但在**純基礎空間**（⛔ 不含 HP 系統倍率）。
 *
 * ⭐ `KILL_CASTS_REF` 的達成率**只能拿這一支對**。owner 2026-08-22：
 *
 * > 「技能 普攻 生命 五級距公式 **可以互相影響帶入公式作為參數**，
 * >  但是**系統倍率不能放在裡面**」
 *
 * ⇒ 級距是從**純基礎**血量反推的，所以「幾發殺死」這個**設計承諾**也活在純基礎空間。
 * ⚠️ 上面那支 `castsToKill()` 回答的是**另一個問題**——「遊戲裡實際要打幾發」，
 * 它含倍率是對的（那是玩家真的會經歷的數字），⛔ 但它不可以拿來驗設計承諾：
 * 兩者現在**刻意**不相等，差距就是 HP 系統倍率本身，而那正是 owner 要的旋鈕。
 */
export function castsToKillBase(level: BalanceAnchorLevel, smallest: number): number {
  return (medianBaseHp(level) + HP_BASE_BONUS) / smallest;
}

/**
 * 出貨值。⭐ 從**三個錨點 + 冷卻表**推導（owner Q4「傷害相應的冷卻」），⛔ 不抄字面值。
 * 三個住處：`content/config/damage-tiers.json` · 這裡 · `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_DAMAGE_TIERS: DamageTiers = Object.freeze({
  enabled: true,
  damage: tiersFromAnchor(anchorFloor(SHIPPED_ANCHOR_LEVEL)),
});

function clampDamage(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, DAMAGE_TIER_MIN), DAMAGE_TIER_MAX);
}

/** 把一份 `config.damage-tiers@1` 文件正規化成級距表。認不得 → 出貨值。 */
export function damageTiersFromDoc(doc: unknown): DamageTiers {
  const d = doc as
    | { schema?: string; enabled?: unknown; damage?: Record<string, unknown> }
    | undefined;
  if (!d || d.schema !== "config.damage-tiers@1") return DEFAULT_DAMAGE_TIERS;
  const src = d.damage ?? {};
  const damage = {} as Record<DamageTierName, number>;
  for (const name of DAMAGE_TIER_NAMES) {
    damage[name] = clampDamage(src[name], DEFAULT_DAMAGE_TIERS.damage[name]);
  }
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_DAMAGE_TIERS.enabled,
    damage: Object.freeze(damage),
  };
}

/**
 * 把每一格 `amount.damageTier` 翻成 `amount.flat`。
 *
 * ⭐ 全專案**唯一**知道級別怎麼變成傷害的地方（同 `resolveRadiusTier`）。
 * 走整棵樹，因為 `Scaling` 可以出現在任何一層 effect 上。
 *
 * 規則：
 *   · 沒有 `damageTier` → 原樣返回。
 *   · `enabled: false` → 整棵樹原樣返回（＝一鍵回到舊的那一套數字）。
 *   · 級距**取代** `flat` 與 `perRank`；`ratios` / `attrRatios` 不動（見檔頭）。
 */
export function resolveDamageTier<T extends object>(def: T, tiers: DamageTiers): T {
  if (!tiers.enabled) return def;
  return walk(def) as T;

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const rec = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = walk(v);
    const tier = rec["damageTier"];
    if (typeof tier === "string") {
      const v = tiers.damage[tier as DamageTierName];
      if (typeof v === "number") {
        out["flat"] = v;
        delete out["perRank"];
      }
    }
    return out;
  }
}
