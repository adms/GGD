/**
 * 暴走規則 —— 內容表達不了的那三件事,而且三件都是欄位。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * owner 2026-08-03 的定稿(來回確認三次):
 *
 *              天生技(自動)                    EX(主動)
 *   門檻      HP ≤ 5%,100% 觸發              HP ≤ 15%,主動放
 *   攻速      解除上限到 10(靠自己頂)         直接設定為 10
 *   持續      10 秒                           10 秒
 *   次數      無限                            無限
 *   冷卻      120 秒                          120 秒
 *   暴走中(兩支相同):吸血 100% · 迴避 +50% · 冷卻時間 ×2
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 為什麼這個檔只有三格,而不是把上面九個數字全抄一遍
 *
 * 六個數字**已經是**後台可調的欄位,因為它們住在兩份 ability 文件裡,而 ability
 * 文件是 內容管理 / 鑄技工坊 直接編輯的東西(存檔生效,不用重新部署):
 *
 *   · 5% / 15% 門檻   → 天生技 hook 的 `condition.value` / 這裡的 `castHpPct`
 *   · 10 秒持續       → `applyBuff.duration` + `applyStatus.duration`
 *   · 120 秒冷卻      → 天生技 hook 的 `internalCooldown` / EX 的 `cooldown[0]`
 *   · 吸血 100%       → buff 的 `lifesteal` flat + capRaise
 *   · 迴避 +50%       → buff 的 `evasion` flat
 *   · 攻速 10         → buff 的 `as` capRaise(天生技)/ capRaise + override(EX)
 *
 * 把它們在 TS 裡再寫一次會造出**第二份真相**:改文件不生效、改常數要重新部署,
 * 而且兩邊不一致的時候畫面上完全看不出來。所以這裡只留下**內容寫不出來的**:
 *
 *   1. {@link BerserkRules.castHpPct} —— 「HP 夠低才放得出來」是一條**施法前**
 *      的閘,而 `zEffectDef` 只有 hook 有 `condition`,主動技沒有任何欄位表達得
 *      出來。寫在效果裡的話按鈕會照樣吃掉魔力與 120 秒冷卻然後什麼都不做
 *      (CLAUDE.md 失敗形態 ②)。
 *   2. {@link BerserkRules.cooldownMult} —— 「冷卻時間 ×2」動的是
 *      `castAbility` 算 `cooldownRemainingTicks` 的那一行。`Stat.CooldownReduction`
 *      表達不了:它的 `STAT_CLAMPS` 下界是 0,負的冷卻縮減會被**靜默夾成 0**。
 *   3. {@link BerserkRules.trigger} —— 這兩格套用在**誰**身上。
 *
 * ⚠️ `cooldownMult` 的方向是 owner 的字面意思:2 = 冷卻**變兩倍長**(暴走的代價,
 * 和「失去方向盤」同一個方向)。如果他打完一場覺得應該是反過來(暴走中技能轉得
 * 更快),那是把這一格改成 0.5,不是改程式 —— 這正是它是欄位的理由。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 決策 —— 閘掛在「這支技能會給暴走」上,不是掛在 `godie-e00r.ex` 這個 id 上
 *
 * `grantsBerserk()` 讀的是**出貨的那一份 def**:效果列表裡有沒有一發落在
 * **施法者自己**身上的 `applyStatus { berserk: true }`。所以規則講得出來、而且
 * 對下一支暴走系技能自動成立:「一支會讓**你自己**失控的主動技,只有在你快死的
 * 時候按得下去」。用英雄 id 寫死的話,這條規則會在下一位英雄身上安靜地消失。
 *
 * ⛔ 「落在自己身上」那半是 GH#305 補的,而它不是細節:【混亂】(對敵人下的
 * 暴走)共用同一格 `berserk: true`,少了受詞判斷,每一支混亂技都會被這條閘鎖住
 * (實測 12-01 鬥仙術滿血放不出來)。逐行推導見 {@link grantsBerserk}。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 全部是純讀取 + 數值比較。沒有 rng、沒有時鐘、沒有三角函式、沒有 `**`,
 * 也沒有 Map 迭代(只掃一個 def 的 effects 陣列)。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilityDef } from "../content/defs";
import { isBerserk } from "../berserk";

/** 誰吃 {@link BerserkRules} 的兩格。 */
export type BerserkTriggerScope =
  /** 只有會授予暴走的主動技(出貨值 —— 天生技走 hook 的 condition,不需要閘) */
  | "berserkGrantors"
  /** 關掉:施法閘不存在,冷卻也不加倍(等於這個功能整個下線,但看得見) */
  | "off";

/**
 * 暴走的三格。**兩端都有界**(見 {@link normalizeBerserkRules})—— 上界不是
 * 平衡政策,是防打錯的保險絲:`castHpPct` 打成 15 而不是 0.15 等於「隨時能放」,
 * 而夾掉之後畫面上看不出差別。
 */
export interface BerserkRules {
  /**
   * 主動暴走可以按下去的生命門檻,0..1 的**比例**(0.15 = 15%)。
   * 生命 ≤ 這個比例才放得出來;高於它 `castAbility` 回 `"hp-too-high"`,
   * **魔力與冷卻一格都不扣**。
   */
  castHpPct: number;
  /**
   * 暴走期間,這一次施法的冷卻要乘多少。2 = 冷卻時間變兩倍長(owner 的字面
   * 意思,暴走的代價)。1 = 不影響。0.5 = 反過來變成獎勵。
   *
   * ⚠️ 它乘的是**開始施放的那一刻**算出來的秒數,所以「暴走中放的技能冷卻比較
   * 長」是對的,而暴走**之前**就已經轉起來的冷卻不會被追溯加倍 —— 那會讓玩家
   * 看到進度條倒退。
   */
  cooldownMult: number;
  /** 上面兩格套用在誰身上。 */
  trigger: BerserkTriggerScope;
}

/**
 * 出貨預設 = owner 定稿的兩個數字。
 *
 * ⚠️ **缺文件 = 這一份,不是空物件**(同 `DEFAULT_STAT_CAPS` / `DEFAULT_BASE_BONUS`
 * 的規矩)。空物件會讓 `castHpPct` 讀成 undefined → 閘永遠不成立 → EX 在滿血
 * 也放得出來,而且沒有任何錯誤訊息。
 */
/** `content/config/berserk.json` 的文件 id —— 與 `BLOCK_DOC_ID` 同一個慣例。 */
export const BERSERK_DOC_ID = "berserk";

export const DEFAULT_BERSERK_RULES: BerserkRules = Object.freeze({
  castHpPct: 0.15,
  cooldownMult: 2,
  trigger: "berserkGrantors",
});

/** 這一格能填的範圍,`[min, max]` 兩端都是閉區間。 */
export const BERSERK_CAST_HP_PCT_BOUNDS: readonly [number, number] = [0, 1];
/**
 * 冷卻倍率的界。下界 0.1 而不是 0:0 = 每一支技能都沒有冷卻,那不是「冷卻縮短」
 * 是「無限連放」,而且一個打錯的 0 看起來跟關掉這個功能一模一樣。
 * 上界 10 遠高於 owner 講過的任何值,只擋多打一個零。
 */
export const BERSERK_COOLDOWN_MULT_BOUNDS: readonly [number, number] = [0.1, 10];

const TRIGGER_SCOPES: readonly BerserkTriggerScope[] = ["berserkGrantors", "off"];

function fit(n: unknown, [lo, hi]: readonly [number, number], fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * 正規化操作者/文件給的表 —— 三層守衛的**最裡面**一層(同 `normalizeStatCaps`):
 * 後台頁擋在前面、Zod schema 擋在中間,而這裡擋的是任何繞過那兩層的來源
 * (手改 overlay.json、舊版主機寫下的文件、測試夾具)。
 * 認不得的值一律退回出貨預設,而不是 0/undefined。
 */
export function normalizeBerserkRules(raw: unknown): BerserkRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_BERSERK_RULES;
  const r = raw as Record<string, unknown>;
  const trigger = TRIGGER_SCOPES.includes(r.trigger as BerserkTriggerScope)
    ? (r.trigger as BerserkTriggerScope)
    : DEFAULT_BERSERK_RULES.trigger;
  return Object.freeze({
    castHpPct: fit(r.castHpPct, BERSERK_CAST_HP_PCT_BOUNDS, DEFAULT_BERSERK_RULES.castHpPct),
    cooldownMult: fit(
      r.cooldownMult,
      BERSERK_COOLDOWN_MULT_BOUNDS,
      DEFAULT_BERSERK_RULES.cooldownMult,
    ),
    trigger,
  });
}

/**
 * 讀一份 `config.berserk@1` 文件。
 *
 * ⚠️ 缺文件 / schema 不符 → **出貨預設**,不是空表。理由與 `statCapsFromDoc`
 * 逐字相同:回空表的話施法閘會靜默消失,而遊戲裡看起來一切正常。
 */
export function berserkRulesFromDoc(doc: unknown): BerserkRules {
  if (!doc || typeof doc !== "object") return DEFAULT_BERSERK_RULES;
  const d = doc as { schema?: unknown; rules?: unknown };
  if (d.schema !== "config.berserk@1") return DEFAULT_BERSERK_RULES;
  return normalizeBerserkRules(d.rules);
}

/**
 * 這支技能會不會把**施法者自己**變成暴走狀態 —— 讀**出貨的那一份 def**,
 * 不是英雄 id。
 *
 * ⚠️ 讀 `def.effects`,而 `Abilities.get()` 回的是**模板展開之後**的 def,所以
 * 用 `template` 寫的暴走技也算得到(CLAUDE.md 失敗形態 ⑤:被測的必須是出貨的
 * 那一個)。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ GH#305 ——「有沒有一發 `berserk: true`」**不是**這個問題的答案
 *
 * 【暴走】與【混亂】共用同一格 `applyStatus.berserk`(schema 明講混亂必須配
 * `berserk: true`,owner 2026-08-09:「混亂應該是完全無法指定目標,並且會亂走
 * 路」)。差別**只在受詞**:暴走落在自己身上,混亂落在敵人身上。
 *
 * 所以在這一段之前,一支「對敵人下混亂」的普通技(12-01 鬥仙術,12 秒冷卻)被
 * 判成「自我暴走」,吃到下面那條「血夠低才放得出來」的閘 —— **滿血按下去回
 * `"hp-too-high"`,掉到 10% 血才放得出來**。上架就是死的。
 *
 * ⭐ 判斷受詞的那一行**逐字鏡射** `effects/applyStatus.ts` 的
 *
 *     const subjects = e.applyTo === "self" ? [ctx.caster] : ctx.targets;
 *
 * 兩種寫法都落在施法者身上,兩種都算:
 *   · `applyTo: "self"` —— 明寫(59-001 完全暴走 EX 就是這樣寫的);
 *   · `castType: "self"` —— `ctx.targets` 本身就是 `[caster]`
 *     (`abilitySystem.ts` 的 `case "self": targets = [caster]`)。
 * ⛔ 不要只留前者:一支沒寫 `applyTo` 的自我暴走技會從閘裡漏出去,滿血就放得
 * 出來,而畫面上跟正確行為一模一樣(失敗形態②)。
 */
export function grantsBerserk(def: AbilityDef): boolean {
  for (const e of def.effects) {
    if (e.kind !== "applyStatus" || e.berserk !== true) continue;
    if (e.applyTo === "self" || def.castType === "self") return true;
  }
  return false;
}

/**
 * 這一次施放該不該被生命門檻擋下來,`null` = 放行。
 *
 * 回傳的字串就是 `CastResult` 的成員,所以呼叫端是一行 early-return,而玩家
 * 拿到的是一個講得出原因的拒絕(#181 的 P7 回饋管道),不是一個沒反應的按鈕。
 *
 * 沒有 `HealthComp` / `maxHp <= 0` 的身體 → **放行**。它們不是這條規則描述的
 * 對象(沒有血條就沒有「快死了」),而在資料缺席時擋住施放,會讓一個測試夾具
 * 或客戶端預測影子世界安靜地失去這支技能。
 */
export function berserkCastBlock(
  world: SimWorld,
  def: AbilityDef,
  caster: EntityId,
): "hp-too-high" | null {
  const rules = world.berserkRules;
  if (rules.trigger === "off") return null;
  if (!grantsBerserk(def)) return null;
  const hp = world.health.get(caster);
  if (!hp || !(hp.maxHp > 0)) return null;
  return hp.hp <= hp.maxHp * rules.castHpPct ? null : "hp-too-high";
}

/**
 * 這一次施放的冷卻要乘的倍率。不是暴走中 → 1(逐位元不變,所以每一份既有錄影
 * 與每一位沒有暴走的英雄完全不受影響)。
 */
export function berserkCooldownFactor(world: SimWorld, caster: EntityId): number {
  const rules = world.berserkRules;
  if (rules.trigger === "off") return 1;
  return isBerserk(world, caster) ? rules.cooldownMult : 1;
}
