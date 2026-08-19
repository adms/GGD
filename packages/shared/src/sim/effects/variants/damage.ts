/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { StatusId } from "../../../ids";
import type { DamageRefund, DistanceScaleTerm, ResourcePctTerm } from "../dynamicTerms";
import type { DamageType, IncomingBasis, Scaling } from "../effect";

export interface DamageVariant {
  kind: "damage";
  /**
   * ⭐ G11（GH#299）—— 這一段傷害打在誰身上。省略 = `"target"` = 今天的行為;
   * `"self"` 是「施法者付自己的血」（獻祭型的資源代價）。
   */
  applyTo?: "self" | "target";
  /**
   * 傷害型別。**省略 = `world.damageRules.defaultAbilityDamageType`**
   *（出貨 `magic` —— owner 2026-08-05「技能傷害預設都改成 AP 傷害」）。
   *
   * ⚠️ 這一格與**係數來源**（`amount` 的 `Scaling` 讀 ap/ad/str/agi/int）
   * 是兩件事：型別決定吃護甲還是魔抗，係數決定數字多大。
   */
  damageType?: DamageType;
  amount: Scaling;
  canCrit?: boolean;
  /**
   * COMBO WINDOW bonus — extra damage added ONLY while the CASTER still
   * carries `statusId`. The WC3 idiom this ports is a global integer the
   * map flips for exactly one second: 蒼月潮's `udg_MoonCombo` is set to 2
   * at the end of 07-02 者、皆、陣 (war3map.j:34438) and cleared 1.00 s
   * later (j:34440); 07-03 列、在、前 reads `udg_MoonCombo == 2` at
   * j:34189 and, when true, adds `5.00 × AGI` to its damage (j:34210).
   *
   * Expressed as a Scaling so the bonus scales exactly like the base term.
   * NOT consumed on use — the JASS marker only ever expires, it is never
   * cleared by the follow-up cast.
   */
  comboBonus?: { statusId: StatusId; amount: Scaling };
  /**
   * 存款加成 —— 額外傷害 = `min(標記帶的數字 × coeff, max)`,只在 CASTER
   * 身上還有 `statusId` 時計入。標記由 `spendMana.bankAs` 開出。
   *
   * 13-002 絕。暗殺奧義用它表達 owner 2026-07-31 的裁決「現存 MP 的 20%
   * 傷害」:coeff = 0.20,存款 = 那一刻被燒掉的法力。
   *
   * ⚠️ `coeff` 與 `max` 都是**欄位**,而且兩端都有界(Zod 那一半)。
   *    owner 明說「係數 0.20 要是欄位,不是寫死」,而 `max` 是保險:法力池
   *    會隨等級與裝備長大,一個沒有天花板的線性項在後期會變成一擊必殺。
   * ⚠️ 它是**額外**傷害,加在 `amount` 與 `hpPct` 之上,不是取代任何一項。
   * ⚠️ 跟 `comboBonus` 一樣讀 CASTER 的標記,但**不**走 `bake`:存款是在
   *    cast 當下就已經凍結的數字,所以晚讀早讀都是同一個值,沒有
   *    「問了一個原始碼從來沒問過的問題」的風險。
   */
  bankedBonus?: { statusId: StatusId; coeff: number; max: number };
  /**
   * 百分比生命傷害 —— a slice of the **VICTIM's** health, added on top of
   * `amount`.
   *
   * WHY IT CANNOT BE A `ratios` ENTRY. `resolveScaling` reads the CASTER's
   * `final` stat table, so `{stat: MaxHealth, coeff: 0.12}` is 12 % of the
   * ATTACKER's own health — a completely different (and, on a squishy
   * assassin, laughably small) number. 揍敵客阿福 W 龍頭戲畫.牙突 is written
   * as 「目標最大生命的 6/9/12 %」, and before this field there was no way to
   * author that at all: it would have shipped as a flat number that lies in
   * the tooltip (失敗形態 ②).
   *
   * `basis` is a DECISION POINT and therefore a field, not a branch picked
   * here (CLAUDE.md 第一守則): 「最大生命」 is predictable and is the shipped
   * default the owner's wording implies, 「當前生命」 is the execute-flavoured
   * reading. Both are one dropdown apart.
   *
   * `perRank` is indexed rank-1 and CLAMPED to the last entry, exactly like
   * `Scaling.perRank`'s neighbours, so a rank beyond the authored column
   * keeps the top row instead of silently paying 0. Every entry is bounded
   * 0..`HP_PCT_DAMAGE_MAX` by the Zod mirror — an un-normalised 12 (meaning
   * 12 %) would otherwise delete a full-health champion in one cast.
   */
  hpPct?: { basis: "max" | "current"; perRank: number[] };
  /**
   * [反彈] —— 額外傷害 = 「剛剛觸發這個 hook 的那一發」的一個百分比。
   *
   * ─────────────────────────────────────────────────────────────────────
   * 為什麼它是一個獨立欄位而不是 `ratios` 的一筆
   * ─────────────────────────────────────────────────────────────────────
   * 跟 `hpPct` 一模一樣的理由,只是換了一個受害者:`resolveScaling` 讀的是
   * **CASTER 的 `final` 屬性表**。反彈的分母不在任何一張屬性表上 —— 它是
   * 一發**封包**,是一個事件,不是一個屬性。`{stat: …, coeff: 2}` 沒有任何
   * 一個 `stat` 可以填。所以它跟 `hpPct` 一樣是 `Scaling` 之外的一項,
   * 而不是硬把事件塞進 `Stat` enum。
   *
   * 在這個欄位存在之前,「反彈普通攻擊傷害 200%」只能被寫成一個固定數字,
   * 那是一件**不同的道具**,而且文案會說謊(失敗形態 ②)。
   *
   * ─────────────────────────────────────────────────────────────────────
   * `basis` —— 反彈之前還是之後扣護甲?這是決策點,所以是欄位
   * ─────────────────────────────────────────────────────────────────────
   * 預設 `"mitigated"`,理由三條,而且**沒有一條是「WC3 就是這樣」**:
   *
   *  1. 原作的來源是 stock native。map 的 `A0C6`(反射之盾)base = `ANth`
   *     **荊棘光環**,`data.1.1 = 1.0`,物件編輯器後綴寫著 (100%);那個欄位
   *     的名字是 "Factor - Damage **Received**",讀起來是護甲之後。
   *     ⚠️ 但這條是**讀欄位名推的,不是量到的** —— 這件道具在 `war3map.j`
   *     裡只出現在 AI 購物清單(`UnitHasItemOfTypeBJ`),機制整段在引擎裡,
   *     沒有 JASS 可以讀。所以我把它寫成欄位而不是宣稱 WC3 如何。
   *  2. 玩家眼裡的「傷害」是他血條上掉的那個數。用 `"raw"` 當預設,一個
   *     100 護甲的坦克吃 50、反彈 200,畫面上的因果關係是斷的。
   *  3. `"mitigated"` 是三個裡面**最小**的其中一個,而反彈這個機制的天然
   *     使用者就是高護甲的身體 —— 預設要選出錯時傷害最小的那一個。
   *
   * ─────────────────────────────────────────────────────────────────────
   * `maxChainDepth` —— A 反彈給 B、B 再反彈回 A 的無窮迴圈,靠這個停
   * ─────────────────────────────────────────────────────────────────────
   * 預設 **0** = 「反彈出去的那一下,不會再被任何人反彈」。
   * 這也是原作的行為:荊棘光環反的是**攻擊**,而反傷本身不是一次攻擊。
   *
   * 終止性的完整證明在 `effects/damage.ts` 的 handler 上方。上界
   * `REFLECT_MAX_CHAIN_DEPTH` 是從 `DAMAGE_QUEUE_MAX_PASSES` 算出來的,
   * 不是挑的 —— 見 `effects/reflectLimits.ts`。
   *
   * ─────────────────────────────────────────────────────────────────────
   * `applyGlobalDamageMult` —— 反彈要不要跟著全域傷害旋鈕走?
   * ─────────────────────────────────────────────────────────────────────
   * 預設 **false** = 「反彈就是一面鏡子:我吃到多少,他就吃到那個數的 N%」。
   *
   * 這個欄位存在是因為 2026-08-01 抓到的一個**乘兩次**的缺陷:三個讀數
   * (`TriggerDamage`)是在 `combatEnv.damageDealt` 之後取的,而反彈算出來的
   * 封包再排進佇列時又會走一次同一行 —— 反彈比變成 `pct × k`。
   * 出貨 k = 1.0 剛好看不出來(`content/config/combat-env.json`),但後台
   * 戰鬥系統頁(#28)存在的意義就是動 k:k=0.5 時反射之盾的「200%」實際是
   * 100%,k=2 時是 400%。實測見 `incomingReflect.test.ts` 的「乘兩次」那一段。
   *
   * 為什麼預設是 false:owner 的文案「反彈普通攻擊傷害 200%」必須**字面為
   * 真**,而且是在任何一個 k 下都為真。true 是另一種一致的讀法(把反彈當成
   * 一個普通傷害來源,跟其他每一種來源一樣吃一次旋鈕),留給想要的人。
   *
   * ⚠️ 免除倍率的是**整發封包**,不是只有反彈那一項。一個同時帶 `flat` /
   * `hpPct` 的 `incomingPct` 效果,那些項也一起免除 —— 跟「沒有 incoming
   * 就整條不執行」同一個立場:帶 `incomingPct` 的效果**就是一個反彈**。
   *
   * ─────────────────────────────────────────────────────────────────────
   * `whenTooLate` —— 一發塞不進這個 tick 剩餘排空輪數的反彈,丟掉還是留著?
   * ─────────────────────────────────────────────────────────────────────
   * 預設 **"drop"**。`reflectLimits.ts` 自己說「一個晚一 tick 才出現的反彈是
   * bug report,不是設計」,所以預設選「不要發生」而不是「晚點發生」。
   * `"spill"` = 照排進佇列、下一個 tick 才落地(這是 2026-08-01 之前的行為)。
   *
   * 這個閘門才是「反彈一定在同一個 tick 之內結束」的**實際**保證。
   * `maxChainDepth ≤ REFLECT_MAX_CHAIN_DEPTH` 那個不等式只在鏈從第 0 輪起跳
   * 時夠用,而 [On-Hit] 排出來的封包最早是第 1 輪 —— 49 件傳說裡 16 件是
   * [On-Hit],那是常態。
   *
   * `perRank` 跟 `hpPct` 一樣是 rank-1 起算、超過欄位長度就夾在最後一格,
   * 每一格由 Zod 夾在 0..`INCOMING_PCT_MAX`。
   */
  incomingPct?: {
    basis?: IncomingBasis;
    perRank: number[];
    maxChainDepth?: number;
    applyGlobalDamageMult?: boolean;
    whenTooLate?: "drop" | "spill";
    /**
     * ⭐ 45-00 —— 反彈的同時**這一發不扣我的血**（免傷）。
     *
     * 省略 = **false** = 只把傷害打回去、原本那一發照樣扣血 = 今天的行為。
     * ⚠️ owner 2026-08-09 說的「反彈**預設**都是免傷」是**那一類技能的設計
     * 預設**，不是引擎的相容性預設：出貨唯一用 `incomingPct` 的
     * `content/items/godie-i03m.json`（反射之盾）是照今天的語意寫的，引擎預設
     * 改成 true 會靜默把一件已上架的道具變成免傷神裝，而卡片上一個字都沒變。
     *
     * ⚠️ 免傷**不可能**做成「事後補血」：`combat/damage.ts` 在 `hp.hp -= dmg`
     * 之後才發 `onDamageTaken`，所以擊殺判定、吸血、浮動數字、計分板四個下游
     * 都已經看到「他受傷了」——免傷卻會死人。實作走的是與 `blockCutFor` /
     * `manaBarrierCutFor` / `lethalSaveFor` **同一族**的預掃描（扣血之前削這
     * 一發）。
     */
    negateOriginal?: boolean;
  };
  /**
   * 資源百分比項 —— 「**誰的**哪一條血/魔的多少」。形狀、上界與兩種讀法
   * (`scale`) 的完整推導在 {@link ResourcePctTerm}(effects/dynamicTerms.ts)。
   *
   * 這一項與 `hpPct` **不重複**:`hpPct` 只讀受害者的生命、只有比例讀法,
   * 已經出貨在 揍敵客 W 牙突,原封不動。`resourcePct` 是一般化的那一個 ——
   * 主詞可以是自己(虛哭神去 godie-i007「自身已損失的生命」)、可以是魔條
   * (瑪那魔杖 godie-i020「敵方現存 MP 5%」)。
   *
   * PER TARGET,跟 `hpPct` 一樣(而跟 combo/存款/反彈不一樣):分母是某一個
   * **身體**的條,一次 AoE 的每個受害者算出來的數字本來就該不同。
   */
  resourcePct?: ResourcePctTerm;
  /**
   * 距離加成項 —— 炎神弩 godie-i06i「敵我距離越遠傷害越高」。線性內插,
   * 形狀與上界見 {@link DistanceScaleTerm}(effects/dynamicTerms.ts)。
   *
   * ⚠️ 唯一另一個跟距離有關的旋鈕是 `damageArea.falloff`,而它量的是 AoE
   * **圓心到副目標**的距離、方向還是相反的(越遠越弱)。兩者不能互相替代。
   */
  distanceScale?: DistanceScaleTerm;
  /**
   * 把**實際打出去的量**折回給施法者 —— 瑪那魔杖 godie-i020「回復己方 MP
   * 該傷害量」。形狀與為什麼它必須騎在封包上,見 {@link DamageRefund}。
   *
   * ⚠️ 這個欄位在這裡只是**宣告**;真正付款的是 `combat/damage.ts` 的排空
   * 迴圈(`DamagePacket.refund`),因為只有那裡知道全域倍率、護甲/魔抗、
   * 格擋與護盾之後真的掉了多少。
   */
  refund?: DamageRefund;
}
