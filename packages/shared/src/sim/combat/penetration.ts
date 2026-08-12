/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  護甲／魔抗 —— LoL 的**四段穿透**與**雙分支減傷曲線**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * owner 2026-08-12：「LoL 的完整做法（四段 + 雙分支）都比照實作」
 *                   「霸王破甲槍⋯改成百分百穿透」
 *                   「所有破甲 破防 破魔 都比照 LoL」
 *
 * ── 四段是哪四段，以及**引擎的哪一半本來就有了** ────────────────────────────
 *
 *   ① 扁平減抗（破防）   目標身上的 `applyBuff`/`aura` `{stat:armor|mr, op:flat, 負值}`
 *   ② 百分比減抗         目標身上的 `op:pctAdd`/`pctMult` 負值
 *   ── 以上兩段是**目標身上的減益**，走既有的屬性管線，這個檔一個字都不管 ──
 *   ③ 百分比穿透         **攻擊者**身上的 `penetration.armorPct/mrPct`  ← 這裡
 *   ④ 扁平穿透（致命性）  **攻擊者**身上的 `penetration.armorFlat/mrFlat` ← 這裡
 *
 * `stats/statPipeline.ts` 的折疊順序 `(base + Σflat) × (1 + ΣpctAdd) × Π(1 + pctMult)`
 * 本身就是「先 flat 後 %」＝ 段①→段②的順序，所以段①②不需要新程式。
 *
 * ── ⭐ 四段的**地板規則各不相同，那個不對稱就是整個設計** ──────────────────
 *
 * | 段 | 能把抗性推到 0 以下嗎 | 抗性已經 ≤ 0 時 |
 * |---:|---|---|
 * | ① 扁平減抗 | ✅ **可以，而且只有它可以** | — |
 * | ② 百分比減抗 | ❌ | 整組跳過（住在 `statPipeline.ts`） |
 * | ③ 百分比穿透 | ❌ | ⛔ **整段跳過** |
 * | ④ 扁平穿透 | ❌ | ⛔ **夾在 0**，不得為負 |
 *
 * ⭐ 一句話：**減抗是隊友都吃得到的減益，可以放大傷害；穿透是自己的，
 * 只能把抗性往 0 這一邊撈回來。**
 *
 * ⚠️ 致命性（lethality）自 LoL V14.1 起**不再隨等級縮放**，所以 GGD ⛔ 不需要
 * 任何 lethality→flat pen 的換算曲線。扁平穿透就是扁平穿透。
 *
 * ── 雙分支曲線 ────────────────────────────────────────────────────────────
 *
 *   R ≥ 0 ： dmg × 100 / (100 + R)                      （今天就有的那一半）
 *   R < 0 ： dmg × ( k − (k−1)·A / (A − R) )，A = 100(k−1)
 *
 * `k = 2` 時它**逐字**就是 LoL 的 `2 − 100/(100 − R)`。一般化成 `k` 的四個性質
 * （全部驗算過，守衛在 `penetration.test.ts`）：
 *   · `R = 0` 兩分支相等（`100/100 = 1`；`k − (k−1) = 1`）
 *   · `R = 0` **一階可微**（兩側導數都是 `−0.01`）⇒ 接縫不需要任何特判或混合
 *   · `R → −∞` 趨近 `k` 但**永遠達不到**
 *   · `k = 1` 逐位元等於「這個檔出現之前的行為」＝ owner 的一鍵 rollback
 *
 * ⛔ **不要寫 `Math.min(2, …)`。** 2× 是這條公式的**漸近極限**，不是一個夾限；
 *    LoL 的數學裡沒有任何 clamp。寫一個 clamp 是不可達的死碼，而且會把機制
 *    描述錯（第三守則的下一個受害者）。
 * ⭐ 也**不另外開一個 boolean** —— `k = 1.0` 已經是那個開關，兩格管同一件事
 *    只會分歧（第一守則要的「可調」與第〇·六守則要的「可 rollback」在這裡是同一格）。
 *
 * ── ⚠️ 這條曲線影響得到誰（0-3，量過的） ──────────────────────────────────
 *
 * | 目標 | 有 StatsComp | 減傷走哪條 | 破甲/破魔 | 穿透 |
 * |---|---|---|---|---|
 * | 英雄 / 召喚物 | ✅ | `mitigate()` | ✅ | ✅ |
 * | 殭屍 / 小怪 | ❌（`MobComp` 連 armor 欄位都沒有） | `resist = 0` | ⛔ 雙重 no-op | ⛔ 結構性 no-op |
 * | 守衛塔 | ❌（`StructureComp` 自己的 armor/mr） | `mitigateStructure()` | ⛔ 施加不到 | ⚠️ 有效但出貨 armor = 0 |
 *
 * ⇒ 整個負分支 + 穿透設計**只影響英雄/召喚物 vs 英雄/召喚物**。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 沒有 rng、沒有 `Date.now`、沒有三角函式、沒有 `**`。唯一的迭代是對
 * `StatsComp.sources` 這個**陣列**依索引掃描（無 Map 迭代 ⇒ 無順序洩漏），
 * 到期判斷用絕對 tick，與 `resolveDamageConversion` 逐字同一條規則。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { originInScope, type DamageConversionScope } from "./damageTypeOverride";

/**
 * 一個來源（道具 / 天生技 rank / 三選一 / `applyBuff`）授予的穿透。
 *
 * ⚠️ 它**不是**一個 `Stat`，而那是刻意的，三個各自獨立的理由：
 *   ① `Stat` 記不住**範圍** —— 霸王破甲槍是 `scope:"basic"`（只有普攻）。做成
 *      `Stat` 會讓 100% 穿透連持有者的**技能**一起穿，那是沒有人要求過的行為改變。
 *   ② `Stat` 的折疊是 `(base+Σflat)(1+ΣpctAdd)Π(1+pctMult)`，**產不出乘法互補**
 *      `1 − Π(1−xᵢ)`；反過來存「剩餘比例」（中性 1）更糟 —— 任何一張沒寫這一格的
 *      英雄卡 base 會是 0 ＝ **100% 穿透**，是災難級的靜默預設。
 *   ③ 它是 `damageTypeOverride.ts:21` 當年否決 `Stat.ArmorPen` 的同一個論證。
 */
export interface PenetrationGrant {
  /** 穿哪些傷害。與 `damageTypeOverride` **同一套字彙**（`originInScope` 共用）。 */
  scope: DamageConversionScope;
  /** 百分比護甲穿透，0..1（1 = 100%）。多份**乘法**疊加。 */
  armorPct?: number;
  /** 扁平護甲穿透（致命性），≥ 0。多份**加法**疊加。 */
  armorFlat?: number;
  /** 百分比魔法穿透，0..1。 */
  mrPct?: number;
  /** 扁平魔法穿透，≥ 0。 */
  mrFlat?: number;
}

/**
 * 一次**已經解算完**的穿透量。四格永遠都在（0 = 沒有），呼叫端不用記預設值。
 */
export interface ResolvedPenetration {
  /** 0..1 */
  armorPct: number;
  /** ≥ 0 */
  armorFlat: number;
  /** 0..1 */
  mrPct: number;
  /** ≥ 0 */
  mrFlat: number;
}

/**
 * 「這個來源一毛穿透都沒有」的**唯一**答案。
 *
 * ⛔ 沒有 StatsComp 的攻擊者（殭屍、守衛塔）回這個，不是拋錯，也不是讓呼叫端
 * 自己補一個字面量 —— 兩個地方各寫一次 `{0,0,0,0}` 就是兩份會分歧的預設。
 */
export const NO_PENETRATION: ResolvedPenetration = Object.freeze({
  armorPct: 0,
  armorFlat: 0,
  mrPct: 0,
  mrFlat: 0,
});

/**
 * `source` 這個實體對一發 `origin` 的封包帶著多少穿透。
 *
 * ⭐ **% 是乘法疊加**（`1 − Π(1−xᵢ)`），**扁平是加法**。兩者刻意不同，因為 LoL
 * 就是這樣，而且乘法保證了「兩件 50% 疊起來不會變成 100%」——
 * wiki 自己的算例：40% + 8% + 20% → `1 − 0.60×0.92×0.80 = 55.84%`（加法會給 68%）。
 */
export function resolvePenetration(
  world: SimWorld,
  source: EntityId,
  origin: string,
): ResolvedPenetration {
  const sc = world.stats.get(source);
  if (!sc) return NO_PENETRATION;
  let armorRemain = 1;
  let mrRemain = 1;
  let armorFlat = 0;
  let mrFlat = 0;
  let any = false;
  // 陣列，依索引 —— 沒有 Map 迭代，所以沒有順序洩漏（sim/purity.test.ts）。
  for (let i = 0; i < sc.sources.length; i++) {
    const src = sc.sources[i];
    if (src === undefined) continue;
    const p = src.penetration;
    if (p === undefined) continue;
    // 到期的 buff 不再穿透。絕對 tick 比較 —— 沒有這一行，一個 3 秒的「穿透附魔」
    // 會在來源被清掉之前的那幾 tick 繼續生效，而且只在某些 tick 生效。
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!originInScope(origin, p.scope)) continue;
    any = true;
    if (p.armorPct !== undefined) armorRemain *= 1 - p.armorPct;
    if (p.mrPct !== undefined) mrRemain *= 1 - p.mrPct;
    armorFlat += p.armorFlat ?? 0;
    mrFlat += p.mrFlat ?? 0;
  }
  if (!any) return NO_PENETRATION;
  return { armorPct: 1 - armorRemain, armorFlat, mrPct: 1 - mrRemain, mrFlat };
}

/**
 * 段③④ —— 穿透**只能把抗性往 0 撈回來**，一格都不能穿破 0。
 *
 * ⛔ 第一行的 `if (raw <= 0) return raw` **不是最佳化，是規則本身**（LoL 明文：
 * 「Percentage armor penetration and Lethality have no effect if the target's
 * armor is less than or equal to 0」）。少了它，一把 100% 穿透的槍會把 −27 的
 * 護甲**抹成 0**，於是「破甲之後更痛」變成「破甲之後不痛」—— 而畫面上只差一個
 * 數字（CLAUDE.md 失敗形態 ②）。
 */
export function resistAfterPenetration(
  raw: number,
  pen: ResolvedPenetration,
  physical: boolean,
): number {
  if (raw <= 0) return raw;
  const afterPct = raw * (1 - (physical ? pen.armorPct : pen.mrPct)); // 段③
  const afterFlat = afterPct - (physical ? pen.armorFlat : pen.mrFlat); // 段④
  return afterFlat > 0 ? afterFlat : 0; // 段④ 的地板是 0
}

/**
 * 雙分支減傷曲線 —— 全 repo **唯一**的減傷曲線定義，英雄與建築共用。
 *
 * ⛔ `ceiling` 是**漸近極限不是 clamp**，所以這裡沒有、也不可以有 `Math.min`。
 * `ceiling = 1` 時 `a = 0` ⇒ 回 1.0（負分支關閉），而 `a − resist = |resist| > 0`
 * 所以**不會除以零**。
 */
export function mitigationMult(resist: number, ceiling: number): number {
  if (resist >= 0) return 100 / (100 + resist);
  const a = 100 * (ceiling - 1);
  return ceiling - ((ceiling - 1) * a) / (a - resist);
}

// ═════════════════════════════════════════════════════════════════════════════
//  `config.mitigation@1` —— 這條曲線上**唯一的決策點**
// ═════════════════════════════════════════════════════════════════════════════

/** `content/config/mitigation.json` 的文件 id。 */
export const MITIGATION_DOC_ID = "mitigation";

/** 下界 **1.0 ＝ 關掉負分支 ＝ 這個檔出現之前的行為**（owner 的一鍵 rollback）。 */
export const NEGATIVE_RESIST_CEILING_MIN = 1;
/** 上界 4.0 是**打錯數量級的守衛**，不是平衡意見。 */
export const NEGATIVE_RESIST_CEILING_MAX = 4;

export interface MitigationRules {
  /**
   * 負抗性最多把傷害放大到幾倍（漸近極限，永遠達不到）。出貨 **2.0** ＝ LoL。
   *
   * 為什麼它是**決策**而不是機制：2× 是 LoL 的數字，但它是一格**平衡旋鈕**
   * （owner 反覆推翻過 `hpMult` 100→20、攻速上限 2.5→4→10），而 **1.0 就是
   * 一鍵 rollback**（第〇·六守則「優先權大的更新後都是預設啟動」）。
   */
  negativeResistAmplifyCeiling: number;
}

/**
 * 出貨值。
 *
 * ⚠️ **缺文件 = 這一份，不是空物件**（同 `DEFAULT_DAMAGE_RULES` 的規矩）——
 * 一個 undefined 的 ceiling 會讓 `mitigationMult` 產出 NaN，而 NaN 傷害
 * 在畫面上是「這一發沒扣血」，看起來跟無敵一模一樣。
 */
export const DEFAULT_MITIGATION_RULES: MitigationRules = Object.freeze({
  negativeResistAmplifyCeiling: 2,
});

/**
 * 正規化操作者/文件給的表 —— 三層守衛的**最裡面**一層（同 `normalizeDamageRules`）：
 * 後台頁擋在前面、Zod 擋在中間，這裡擋的是任何繞過那兩層的來源。
 */
export function normalizeMitigationRules(raw: unknown): MitigationRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_MITIGATION_RULES;
  const v = (raw as { negativeResistAmplifyCeiling?: unknown }).negativeResistAmplifyCeiling;
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_MITIGATION_RULES;
  const clamped =
    v < NEGATIVE_RESIST_CEILING_MIN
      ? NEGATIVE_RESIST_CEILING_MIN
      : v > NEGATIVE_RESIST_CEILING_MAX
        ? NEGATIVE_RESIST_CEILING_MAX
        : v;
  return { negativeResistAmplifyCeiling: clamped };
}

/** 從 `config.mitigation@1` 文件讀出來。缺文件 = 出貨預設。 */
export function mitigationRulesFromDoc(doc: unknown): MitigationRules {
  const d = doc as { schema?: string } | undefined;
  if (!d || d.schema !== "config.mitigation@1") return DEFAULT_MITIGATION_RULES;
  return normalizeMitigationRules(d);
}
