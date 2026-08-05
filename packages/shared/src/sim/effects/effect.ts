/**
 * EffectDef — the serializable effect union. Abilities, item actives/passives,
 * augment hooks, and status DoTs all execute the SAME ordered EffectDef[] via
 * one interpreter (effectRunner). Data, not code → JSON-authorable.
 */
import type { EntityId, ProjectileId, StatusId } from "../../ids";
import type { Stat } from "../stats/statTypes";
import type { HookDef, StatModifier } from "../stats/modifiers";
import type { AttrBasis, AttrKey } from "../stats/attributes";
import type { DamageRefund, DistanceScaleTerm, ResourcePctTerm } from "./dynamicTerms";
import type { Vec2 } from "../math/vec2";
import type { SimWorld } from "../SimWorld";
import type { Rng } from "../math/rng";
import type { CastableSlot } from "../intents";

export type DamageType = "physical" | "magic" | "true";

/**
 * 反彈要拿「剛剛那一下」的哪一個讀數當基數 —— **一個決策點,所以是欄位**
 * (CLAUDE.md 第一守則),不是我在 handler 裡挑一個然後在註解裡辯護。
 *
 *   · `"raw"`       —— 封包本來的量(已經乘過 `combatEnv.damageDealt`,還沒被
 *                      護甲/魔抗吃掉)。「他打出來的那一拳有多重」。
 *   · `"mitigated"` —— 過了護甲/魔抗、**還沒**進護盾池(`damage.ts` 裡的
 *                      `impact`,也就是打擊感/擊退讀的那個數)。**預設**。
 *   · `"hpLost"`    —— 真的從血條上掉下來的那一格(護盾吃掉的不算)。
 *                      「我實際上痛了多少」。
 *
 * 為什麼預設是 `"mitigated"`,見 `EffectDef.damage.incomingPct` 的說明。
 */
export type IncomingBasis = "raw" | "mitigated" | "hpLost";

/**
 * 觸發這一次 hook 的**那一發傷害** —— 「剛剛打中我的那一下」。
 *
 * WHY IT EXISTS. `Scaling` 只讀得到 CASTER 的 `final` 屬性表,所以
 * 「反彈普通攻擊傷害 200%」在這個型別出現之前**根本沒有辦法被寫出來**:
 * 200% 的分母是那一發封包,不是持有者身上的任何一個屬性。反射之盾
 * (`content/items/godie-i03m.json`)因此出貨成一張只有文案的空卡(失敗形態 ②)。
 *
 * 三個讀數**同時**帶著,而不是在來源端就先選好一個:選哪一個是內容作者的決定
 * (`incomingPct.basis`),而 sim 這一側三個都算得出來、成本是零。來源端先選
 * 等於把決策點烘進程式。
 *
 * 只有真的帶著一發封包的事件會填它 —— 目前是 `onDamageTaken` 與
 * `onDamageDealt`(兩邊都由 `combatResolveSystem` 在同一發封包上發出)。
 * 其餘每一個 `HookEvent` 都是 `undefined`,而 `zHookDef` 會在**載入時**擋掉
 * 把 `incomingPct` / `damageSource` 掛到那些事件上的文件,所以「寫得出來但永遠
 * 不會發生」不是一個能出貨的狀態。
 */
export interface TriggerDamage {
  /**
   * 封包原本的量,未經護甲/魔抗。
   *
   * ⚠️ 這是**全域傷害倍率之後**的讀數 —— 除非那一發封包自己免除了倍率
   * (`DamagePacket.skipGlobalDamageMult`,目前只有反彈會),那時它就只是封包
   * 自己的量。這句話很重要:三個讀數全都在倍率之後,所以一發**由它們算出來**
   * 的反彈封包如果再走一次倍率,倍率就進去了兩次。
   */
  readonly raw: number;
  /** 過了護甲/魔抗、未進護盾池 —— `combat/damage.ts` 的 `impact` */
  readonly mitigated: number;
  /** 真的從血條扣掉的量(護盾吸收的不算) */
  readonly hpLost: number;
  /** 封包的 provenance,`"basic"` = 普通攻擊。`HookDef.damageSource` 讀它 */
  readonly origin: string;
  /**
   * 這一發封包**已經是第幾代反彈**。原始攻擊是 0,反彈一次是 1……
   *
   * ⚠️ 這是終止性的全部:見 `effects/damage.ts` 的 `incomingPct` 段落。
   */
  readonly reflectDepth: number;
  /**
   * 這一發封包是在排空迴圈的**第幾輪**落地的(0 起算)。
   *
   * ⚠️ **不是**「等於 reflectDepth」。`reflectLimits.ts` 以前的推導就是這樣假設
   * 的,而那個假設只在鏈從第 0 輪起跳時成立:hook 排出來的封包(每一件
   * [On-Hit] 道具的 `on: onDamageDealt`)最早也要第 1 輪才解算,從它起跳的
   * 反彈鏈整條往後平移,尾巴就溢到下一個 tick 了。
   *
   * 反彈用它算「還剩幾輪」,一發塞不下的反彈按 `incomingPct.whenTooLate` 處置。
   */
  readonly resolvePass: number;
  /**
   * 這一發封包的**傷害型別** —— `HookDef.damageType` 讀它。
   *
   * ⚠️ 它是 `DamagePacket.type`，也就是**最後一次型別轉換之後**的型別（惡夢魔王
   * 碎片那一族 `damageTypeOverride` 改的就是它）。想問「轉換前是什麼」的人要的是
   * `DamagePacket.impactType`，而那一格**沒有**被抄進來 —— 它今天唯一的消費者是
   * 擊倒衝擊反應那道閘，把它一起送上來等於多一個沒有人讀的欄位。
   *
   * ── 為什麼它到 2026-08-05 才出現 ──────────────────────────────────────────
   * 資料一直就在原地：組出這個物件的那個迴圈（`combat/damage.ts`）手上就握著
   * `pkt`，`pkt.type` 與 `pkt.crit` 是它的第 44、45 個欄位。它們沒被抄過來，
   * 於是【這一發是 AP】【是 AD】【是真傷】三個標籤**寫不出來** —— 不是引擎做不到，
   * 是這兩行沒寫。抄過來的成本是零（同一個作用域、同一個物件字面）。
   */
  readonly type: DamageType;
  /**
   * 這一發封包**是不是暴擊** —— `HookDef.damageCrit` 讀它。
   *
   * 同上：`pkt.crit` 就在手邊。它解鎖【暴擊時】，而那是玩家最講得出名字的一個
   * 觸發時機。
   *
   * ⚠️ 它是**這一發封包**的暴擊旗標，不是持有者的暴擊率。一條
   * `damageCrit: "crit"` 的 hook 問的是「剛剛那一下爆了嗎」，不是「我暴擊率夠不夠」。
   */
  readonly crit: boolean;
}

/** Rank-aware scaling: flat + per-rank + stat ratios of the caster. */
export interface Scaling {
  flat?: number;
  perRank?: number[];
  ratios?: { stat: Stat; coeff: number }[];
  /**
   * 三圍係數 —— 「等同(總力量)」「5.0 × AGI」這一族,加在 `ratios` 之上。
   *
   * ─────────────────────────────────────────────────────────────────────────
   * 為什麼它不能是 `ratios` 的一筆
   *
   * 力/敏/智 **不是** `Stat` 的成員(見 stats/statTypes.ts 與 stats/attributes.ts
   * 的檔頭:一點力量同時餵 maxHealth、healthRegen 與 ad,一點敏捷加性地餵護甲、
   * 乘性地餵攻速)。`{stat: …, coeff: 1}` 沒有一個 `stat` 可以填,而硬把三圍
   * 塞進 `Stat` enum 會讓 `statPipeline` 的每一條規則都要多一個例外。
   *
   * 在這個欄位之前,朗基努斯之槍 godie-i018 「造成等同(總力量)之閃電傷害」
   * **完全寫不出來** —— 只能寫成一個固定數字,而那是一件不同的武器,而且文案
   * 會說謊(失敗形態 ②)。原作那邊這種寫法是常態:抽出來的 JASS 裡到處是
   * `GetHeroStatBJ(0,u,true)*9.`。
   *
   * ─────────────────────────────────────────────────────────────────────────
   * `basis` 是欄位,因為**原始碼自己兩種都用**
   *
   * Blizzard 的 `GetHeroStatBJ(stat, unit, includeBonuses)` 把答案當參數收,而
   * 抽出來的法術兩種都出現過(見 stats/attrSources.ts 的「總 vs 基礎」那一段):
   * 傷害公式用 `true`(總,含裝備),蒼月潮 07-00 的 120 敏上限用 `false`(基礎)。
   * 省略 = `"total"`,因為 owner 的 效能 文案寫的是「**總**力量」「**總**敏捷」。
   *
   * ⚠️ `resolveScaling` 的第四個參數是**必填**的,而且就是為了這個欄位。少傳
   * 一個呼叫點 = 這一項靜默算成 0 = 文案寫了、玩家拿不到(失敗形態 ②)。做成
   * 必填之後那種漏接是**編譯錯誤**,不是一條要記得寫的測試。
   */
  attrRatios?: { attr: AttrKey; basis?: AttrBasis; coeff: number }[];
}

/**
 * 「這個身體的某一項三圍現在是多少」—— `resolveScaling` 讀 `Scaling.attrRatios`
 * 的唯一管道。
 *
 * 做成 FUNCTION 而不是一張預先算好的表,有兩個具體理由:
 *   · `basis` 是**每一筆**係數自己的欄位(見上),預先算表就要算兩份;
 *   · `resolveScaling` 至今是一個**純函式**(輸入全在參數上,不碰 world),
 *     測試可以直接餵數字。傳一個 `(world, id)` 進去會把它變成要架世界才測
 *     得動的東西,而它是全遊戲被呼叫最多的算式之一。
 *
 * sim 這一側的實作是 `effects/effectCommon.ts::casterAttrs`(轉呼叫
 * `stats/attrSources.ts::liveAttribute`)。
 */
export type AttrLookup = (attr: AttrKey, basis: AttrBasis) => number;

/**
 * 「這個身體沒有三圍」——回 0。給非英雄的身體、編輯器預覽、以及所有只想測
 * `flat`/`ratios` 的測試用。**不是**一個可以拿來搪塞真正呼叫點的東西:一個
 * 真的有英雄在場的地方傳它進去,`attrRatios` 就會靜默變成 0。
 */
export const NO_ATTR_LOOKUP: AttrLookup = () => 0;

export type EffectDef =
  | {
      kind: "damage";
      damageType: DamageType;
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
  /**
   * damageArea (task #210 近戰擴散) — 傷害一個**圓**, 圓心是這次事件的受害者。
   *
   * -------------------------------------------------------------------------
   * 為什麼需要一個新的 kind, 而不是給 `HookDef` 加一個 `spread`
   * -------------------------------------------------------------------------
   * 技能之所以打得到多人, 是因為**技能的 targeting 先解出一組受害者**
   * (CastResolveSystem 的 AoE re-query), 再讓每個 effect 對每個人各跑一次。
   * `radius` 從來就掛在 ability 上 (schema/ability.ts:「skillshot width or AoE
   * radius」), 不在 effect 上。
   *
   * 於是 `onBasicAttack` 這種 hook 完全沒有辦法表達「順便打到旁邊的」——
   * `fireHooks` 把 `targets` 寫死成 `[event 的那一個實體]`, 而 effect 只認
   * `ctx.targets`。丈八蛇矛的「擴散傷害60%」、霸王槍的「40%機率造成225點範圍
   * 傷害」、熾天使之弓的「火焰擴散傷害44」在文案上承諾了三年, 在 sim 裡從來
   * 沒有一行程式碼實作過 (七種失敗形態的第 ② 種)。
   *
   * 給 HookDef 加 `spread` 只能修 hook 這一條路; 把圓做成 EFFECT 之後,
   * 小怪、守衛塔、status DoT、augment —— 任何跑 `runEffects` 的東西都同時拿到
   * 了「打一個圈」的能力, 而且是同一個 runner、同一組決定性規則。
   *
   * -------------------------------------------------------------------------
   * 決定性 (sim/purity.test.ts 在守)
   * -------------------------------------------------------------------------
   * 命中集合來自 `queryOverlap` (保證回傳**遞增的 entity id**), 然後用
   * 「(距離平方, id)」這個 TOTAL ORDER 排序才套 `maxTargets`。沒有任何一步吃
   * Map 的插入順序, 所以同一顆 seed 的兩次重播命中順序逐字相同 —— `canCrit`
   * 每個受害者各擲一次 rng, 順序一變傷害就會變, 這是必須排序的真正理由。
   */
  | {
      kind: "damageArea";
      damageType: DamageType;
      /** 每個受害者在**圓心**吃到的量 (再乘 falloff 的距離衰減) */
      amount: Scaling;
      /**
       * 半徑, GGD 單位。⚠️ 不經過 combatEnv.abilityRange —— 那顆旋鈕的定義是
       * 「技能的施法距離 / AoE 半徑」(#136), 而這是一件**道具**掛在普攻上的
       * 濺射。把它偷偷乘上 0.6 會讓後台顯示的半徑不是實際半徑, 也就是 #125
       * 「顯示值 == 實際值」被打破。要調就調 item 文件裡的這個數字本身。
       */
      radius: number;
      /**
       * 邊緣倍率 0..1: 圓心吃滿額, 半徑處吃 `falloff` 倍, 中間線性內插。
       * 省略 = 1 = 不衰減。月牙魔杖「距離越遠流星傷害越低」就是這個欄位。
       */
      falloff?: number;
      /** 這一次最多濺到幾個人 (預設 `SPREAD_MAX_TARGETS`, 由近到遠取) */
      maxTargets?: number;
      canCrit?: boolean;
      /**
       * 震央 (`ctx.targets`, 也就是被普攻打中的那個人) 要不要**再吃一次**。
       * 預設 false: `onBasicAttack` 的情境下他已經吃過普攻本身了, 再算一次
       * 就是雙重計費。技能想用同一個 kind 打「以自己為圓心的爆炸」時才開。
       */
      includeOrigin?: boolean;
    }
  /**
   * damageLine — 面前的一條直線範圍傷害 (18-00 薔薇荊棘之刃). A CAPSULE, not a
   * circle: see `effects/damageLine.ts` for why the shape difference is the
   * whole play pattern and for the 「3 個身位」 → 3.6 GGD units derivation.
   */
  | {
      kind: "damageLine";
      damageType: DamageType;
      amount: Scaling;
      /** how far forward the lash reaches, GGD units (3 身位 = 3 × 1.2 = 3.6) */
      length: number;
      /** how WIDE the lash is, GGD units (one body = 1.2). Not a radius. */
      width: number;
      /** where it points: through the event victim (default) or the body facing */
      aim?: "facing" | "target";
      /** start at the caster's body (default true = 「面前」) or at the victim */
      fromCaster?: boolean;
      maxTargets?: number;
      canCrit?: boolean;
      /** does the entity that TRIGGERED this eat it again? default false */
      includeOrigin?: boolean;
    }
  /**
   * grantAttribute — PERMANENTLY add 力/敏/智, with a 「每 N 次」 gate and a
   * ceiling on the resulting attribute (07-00 獸化心靈). See
   * `effects/grantAttribute.ts` for why an attribute is not a StatModifier and
   * why the tally advances even when the ceiling refuses the payout.
   */
  | {
      kind: "grantAttribute";
      attr: "str" | "agi" | "int";
      /**
       * "flat" (default) = `amount` points. "pctOfCurrent" = `amount` × the
       * LIVE attribute, so 1.0 is 「×2」. A real decision: a flat number is
       * enormous at level 1 and irrelevant at level 9.
       */
      mode?: "flat" | "pctOfCurrent";
      /** points (flat) or ratio of the live attribute (pctOfCurrent) per PAYOUT */
      amount: number;
      /**
       * ABSENT = PERMANENT (獸化心靈's WC3 `ModifyHeroStat`). Present = the
       * grant is reversed at an absolute tick (龍紋記憶's 3 秒). Refreshes per
       * `<origin>|<attr>` rather than stacking, so a chain-stun cannot reach ×8.
       */
      durationSec?: number;
      /** pay only on every Nth trigger. absent/1 = every time. 獸化心靈 = 8 */
      everyNth?: number;
      /** refuse the payout once the LIVE attribute reaches this. 獸化心靈 = 120 */
      maxAttribute?: number;
      /**
       * WHICH 三圍 `maxAttribute` measures — 決策點做成欄位 (CLAUDE.md 第一守則),
       * and the axis is the SOURCE MAP'S OWN, not one invented here.
       *
       * Blizzard's `GetHeroStatBJ(stat, unit, includeBonuses)` takes the answer
       * as a parameter, and the extracted spells under
       * `tools/w3x-import/out/GoDieEX22s/jass-spells/` use both values:
       * damage formulas read `…,true)` (bonuses in), while 蒼月潮 07-00 獸化心靈's
       * hidden ceiling reads `GetHeroStatBJ(1,GetKillingUnit(),false)<$8C`
       * (bonuses OUT). GGD's two accumulators line up exactly —
       * `ChampionComp.attrBonus` ≡ `ModifyHeroStat` (base), an item's
       * `ModifierSource.attributes` ≡ equipment (bonus).
       *
       *   · `"base"` (DEFAULT, and the conservative one) — innate + growth +
       *     三選一 picks + previous `grantAttribute` payouts. This is what
       *     獸化心靈's JASS measures, and it keeps a champion's innate passive
       *     UNAFFECTED by what he is carrying: equipping 朗基努斯之槍 (+12 AGI)
       *     must not silently retire 蒼月潮's kill-stacking 12 points early.
       *     It is also byte-identical to the behaviour every shipped doc had
       *     before items could grant 三圍 at all.
       *   · `"total"` — items included, for a future card whose ceiling is meant
       *     to mean 「總敏捷」 in the same sense a weapon's 效能 line does.
       */
      maxAttributeBasis?: AttrBasis;
      /**
       * WHERE THE POINTS ARE BANKED —— 決策點做成欄位, and the difference is
       * 「賣掉之後還在不在」.
       *
       *   · `"champion"` (DEFAULT, and byte-identical to every doc authored
       *     before this field) — `ChampionComp.attrBonus`, WC3 `ModifyHeroStat`.
       *     Permanent, and deliberately INDEPENDENT of whatever caused it:
       *     蒼月潮 07-00 獸化心靈 earns the 敏捷 with his own hands and it is his.
       *   · `"source"` — the accumulator on the `ModifierSource` that FIRED this
       *     hook (`ModifierSource.attrEarned`). 甘豆腐之袍 godie-i03f 「每殺死一名
       *     英雄可以額外獲得 10點智慧，上限 160」: an ITEM's stacks belong to the
       *     item, so selling the robe takes the 160 智慧 with it. The whole class
       *     of 「賣掉還留著」 bug becomes unreachable rather than tested-for,
       *     because `detachSource` drops the accumulator and there is nowhere
       *     else the points could be.
       *
       * ⚠️ `"source"` REQUIRES a hook origin (`origin === "hook:<sourceId>"`),
       * which is what every item passive / aura hook has. Run from an ABILITY's
       * effect list there is no source to bank into and the payout is REFUSED
       * (never silently redirected into `attrBonus`, which would be the
       * permanent-and-unsellable semantics wearing the sellable one's name).
       */
      store?: "champion" | "source";
      /**
       * `store: "source"` ONLY —— the ceiling on how much THIS SOURCE has paid
       * out in total, per attribute. 甘豆腐之袍's 「上限 160」 = 16 stacks of 10.
       *
       * ⚠️ IT IS NOT {@link maxAttribute}, and the difference is why this field
       * had to exist. `maxAttribute` caps the champion's RESULTING 三圍 (獸化心靈's
       * 「敏捷 < 120」, innate + level growth included), so on a high-level 智慧
       * hero it would refuse the very first stack and the robe would be a card
       * that does nothing. This one counts only what the robe itself has issued.
       *
       * A payout that would cross the ceiling is CLAMPED to the remaining
       * headroom, never refused: 「上限 160」 is a promise about the total, and
       * refusing would make an item authored 15/160 pay 150 instead of 160.
       */
      maxSourceTotal?: number;
    }
  /**
   * `revive` —— 復活. See `effects/revive.ts` for the whole model: it delegates
   * the state contract to `sim/revive.ts::reviveChampionAt`, the SAME function
   * the 復活圈 (#84/#206) completes through, so there is exactly one definition
   * of what a revived champion looks like.
   *
   * 天生牙 godie-i031 「[復活] 殺死任一個敵方英雄單位，將復活我方所有英雄」 —— the
   * 「我方所有英雄」 half is the hook's `target: "allies"` scope, not this effect.
   */
  /**
   * 【淨化】【驅散】(A4b, #278) —— 把目標身上選定的池子清掉。
   * 行為在 `sim/effects/dispel.ts`，池子的語意在 `sim/clearPools.ts`，
   * 全域旋鈕在 `sim/dispelRules.ts`（`config.dispel@1`）。
   */
  | {
      kind: "dispel";
      /**
       * ⭐ E1 硬約束（owner 核准）：**新 kind 一律帶 `shape`**。
       *
       *   single  清 hook/技能已經解析好的那些人（`target: self|event|allies`
       *           那一層決定的）—— 這個 kind 不重新發明目標選擇
       *   circle  以受害者/施法點/施法者為圓心的一個圓
       *
       * ⚠️ `line` / `cone` **刻意不在 enum 裡**：今天沒有任何一份文件需要它們，
       * 而一個 schema 收得下、引擎沒實作的值正是同一批裡剛刪掉的 `onLevelUp`。
       */
      shape: "single" | "circle";
      /** `shape:"circle"` 必填。吃 `combatEnv.abilityRange` 倍率。 */
      radius?: number;
      /** `shape:"circle"` 才有意義：清友軍（預設）還是清敵人。 */
      side?: "allies" | "enemies";
      /** `shape:"circle"` 的人數上限。省略 = 圓內全部。 */
      maxTargets?: number;
      /** 清哪幾池。省略 = `config.dispel@1` 的四個 `defaultPool*`。 */
      pools?: { status?: boolean; shields?: boolean; dot?: boolean; buffs?: boolean };
      /** 只清這一種極性。省略 = `"debuff"`（淨化的字面意思）。 */
      polarity?: "buff" | "debuff" | "any";
      /** 每一池最多拔幾層。省略 = `maxCountCap`；寫了也**夾不過**它。 */
      count?: number;
      /** 拔不完時先拔哪一邊。省略 = `defaultOrder`。 */
      order?: "newest" | "oldest";
    }
  | {
      /**
       * 【破盾】（D1，#278）。只打掉 `HealthComp.shields`，`st.effects` 一格不動。
       *
       * ⚠️ 它與 `dispel` 分開的理由是**止血閥**（`dispelRules.enabled` 不該
       * 順手廢掉一件破盾道具）—— 完整理由見 `sim/effects/shieldBreak.ts` 檔頭。
       */
      kind: "shieldBreak";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。語意與 `dispel` 的那一格相同。 */
      shape: "single" | "circle";
      /** `shape:"circle"` 必填。吃 `combatEnv.abilityRange` 倍率。 */
      radius?: number;
      /** `shape:"circle"` 才有意義。破盾的預設是**打敵人**（與淨化相反）。 */
      side?: "allies" | "enemies";
      /** `shape:"circle"` 的人數上限。省略 = 圓內全部。 */
      maxTargets?: number;
      /** 最多打掉幾層盾。省略 = 整池。⚠️ 這裡沒有全域上限（破盾不是淨化）。 */
      count?: number;
      /** 打不完時先打哪一邊。省略 = `"newest"`（先打最晚掛上的那一片）。 */
      order?: "newest" | "oldest";
    }
  | {
      kind: "revive";
      /**
       * Fraction of maxHp to come back on. ABSENT = the match's own
       * `reviveCircles.reviveHpPctMax` (shipped 0.5), falling back to
       * `REVIVE_EFFECT_FALLBACK_HP_PCT` when no circles are armed — 「復活回多少
       * 血」 is ONE operator concept with ONE home in 戰鬥系統, and an item that
       * answered it separately would be a second number nobody knows exists.
       * Bounded 0..1: the floor still yields a living body (`reviveChampionAt`
       * clamps to ≥1 HP), and the ceiling catches the mis-parse that matters —
       * 50 typed for 「50%」, which without it is a full-HP team resurrection.
       */
      hpPct?: number;
      /** Fraction of maxMana. Same default chain and same 0..1 bounds as `hpPct`. */
      manaPct?: number;
      /**
       * WHO may be stood up. `"ally"` (DEFAULT, conservative) = same team as the
       * caster only. `"any"` drops the check, for a hypothetical necromancy card
       * that raises whoever it names.
       *
       * The default is not decoration: `revive` on an `onKill` hook WITHOUT
       * `target: "allies"` resolves against the corpse you just made, so the
       * permissive reading is an item that resurrects its own victims — silent,
       * catastrophic, and exactly the kind of thing a default should refuse.
       */
      side?: "ally" | "any";
      /**
       * 一回合一次 —— whether this shares the 復活圈's per-team round budget
       * (`world.reviveCharges`, `config.arena-rules@1 revivesPerTeamPerRound`,
       * shipped 1).
       *
       *   · `"ignore"` (DEFAULT) — owner's card text puts no limit on 天生牙, so
       *     this is what ships. The item can fire as often as its hook allows.
       *   · `"requireAndSpend"` — refuses unless the caster's team still holds a
       *     charge, and spends ONE on success (one charge for the whole team's
       *     resurrection, not one per body). This is the once-per-round bound,
       *     and it reuses the only round-scoped counter that already exists —
       *     `endCombatRevives` resets it, so it needs no new SimWorld field and
       *     cannot leak across rounds.
       *
       * ⚠️ Under `"requireAndSpend"` the item and the 復活圈 EAT THE SAME BUDGET:
       * a resurrection from 天生牙 means no circle rescue later that round.
       */
      teamCharge?: "ignore" | "requireAndSpend";
    }
  | { kind: "heal"; amount: Scaling }
  | {
      kind: "shield";
      amount: Scaling;
      duration: number;
      /**
       * WHICH damage the pool eats. owner 2026-07-30: 「護盾的確有分**吸收所有
       * 傷害**跟**吸收 AP 傷害 only**」 — that is a DECISION POINT, so it is a
       * content field rather than a branch somebody picked in code (CLAUDE.md
       * 第一守則).
       *
       * ABSENT = `"all"` = today's behaviour exactly, so no shipped document
       * changes meaning. `"magic"` is the AP-only shield owner named; the
       * physical/true rows exist because the enum would be arbitrary without
       * them, not because a doc asks for them yet.
       *
       * The filter runs in `combat/damage.ts`, at the step shields always ate at
       * (POST-mitigation), so the authored number keeps meaning "damage as the
       * victim actually feels it". A pool that does not eat the incoming type is
       * fully TRANSPARENT to it — no absorb, no consumption. Two pools on one
       * target: narrow before broad (`absorbOrder`).
       */
      absorbs?: "all" | DamageType;
    }
  | {
      kind: "applyStatus";
      statusId: StatusId;
      duration: number;
      /**
       * Who receives it: each resolved target (default), or the CASTER. The
       * self form is how a combo WINDOW is opened — 者、皆、陣 is a
       * unit-targeted strike whose JASS also sets the caster-side marker
       * (j:34438), so without `applyTo` the marker would land on the victim.
       */
      applyTo?: "self" | "target";
      moveSpeedMult?: number;
      root?: boolean;
      stun?: boolean;
      /**
       * 失手率 0..1 — WC3 `Acrs` 詛咒. THE CARRIER's own basic attacks miss this
       * often, at anybody. It is NOT evasion: evasion protects the body it is
       * on, this one sabotages it. See `components.ts::StatusEffect.missChance`
       * for why the direction matters and why it lives on the status.
       */
      missChance?: number;
      /**
       * 暴走 —— 「不可控制並自動尋敵」(59-00 初號機 暴走). The carrier loses the
       * wheel: `orderSystem` drops that seat's orders and the body hunts on its
       * own. Model + decisions: `sim/berserk.ts`.
       */
      berserk?: boolean;
      /**
       * C4 睡眠（#278）—— **受傷即提早解除這一筆**。
       * ⛔ 只拔標了它的那幾筆；身上的其他 status 一格不動（`sim/statusBreak.ts`）。
       */
      breakOnDamage?: boolean;
      /** 打醒門檻（實際扣掉的傷害）。省略 = 0 = 任何傷害都醒（WC3 沉睡的語意）。 */
      breakOnDamageMin?: number;
      /**
       * 【重創】A6（#278）—— 治療 / 吸血 / 自然回復三格**獨立**倍率。
       * owner 裁決⑥：出貨的重創三格都是 0.5；**禁療 = 三格都填 0 的一份文件**。
       */
      healingTakenMult?: number;
      lifestealMult?: number;
      regenMult?: number;
    }
  /**
   * `perRank` (index rank-1, clamped to the last entry) is the rank-indexed
   * variant: WC3 authors every buff column per ability LEVEL (`Oae1/Oae2`
   * 增加移動速度/攻擊速度, `adur` 持續 …), and a single `modifiers`+`duration`
   * pair can only carry one of them. When present it REPLACES the flat pair for
   * that rank; the flat pair stays as the rank-1 fallback so existing docs and
   * hook-fired buffs (rank 1) are untouched.
   */
  | {
      kind: "applyBuff";
      modifiers: StatModifier[];
      duration: number;
      perRank?: { modifiers: StatModifier[]; duration: number }[];
      /**
       * STACKING (task #244). Without it every application attaches a NEW
       * ModifierSource keyed `buff:<origin>#<tick>` — which has two defects for
       * a "permanent, once per kill" buff: 180 kills leave 180 live sources for
       * `recomputeStats` and `fireHooks` to rescan, and two kills on the SAME
       * TICK (one AoE, two mobs) collide on that id so only ONE lands.
       *
       * With `stackKey` the buff instead lands on ONE source with the fixed id
       * `buff:stack:<stackKey>` and bumps its `stacks` counter. `statPipeline`
       * already multiplies every flat/percent-add modifier by `stacks`, so the
       * arithmetic is identical while the source count stays O(1).
       */
      stackKey?: string;
      /** hard ceiling on `stacks` (absent = unbounded) */
      maxStacks?: number;
      /**
       * This stack is meant to be SEEN: the snapshot sums `stacks` over sources
       * flagged this way and sets the growth-tier ENTITY_FLAG bits, so a
       * champion-agnostic "visible growth" read costs zero new wire fields.
       */
      stackVisual?: boolean;
      /**
       * HOOKS this timed source carries — a buff that grants a temporary PROC,
       * not just temporary numbers.
       *
       * `ModifierSource.hooks` has always existed and `fireHooks` has always
       * walked it (that is how item passives and 天生技 fire), but until now the
       * ONLY way to attach one was a permanent source — an item, an augment, a
       * `passive.ranks[N]` block. Nothing could say 「接下來 5 秒，你的下一次 Q
       * 命中會多做一件事」, which is exactly what 揍敵客阿福 EX 絕.暗殺奧義 is.
       *
       * Expiry is the SAME `expiresAtTick` the modifiers use (an absolute tick),
       * and `fireHooks` already skips a source whose deadline has passed, so a
       * hook granted this way cannot outlive its buff. `hookLastFired` is
       * per-source-INSTANCE, so `internalCooldown` on one of these hooks reads
       * 「一次施放最多觸發幾次」 rather than a global clock.
       */
      hooks?: HookDef[];
    }
  /**
   * cycleBuff (揍敵客阿福 13-00 念。攻防轉換) — 輪替增益: apply the NEXT step of a
   * fixed rotation, where 「next」 is derived from the world's own absolute
   * expiry ticks instead of from a counter.
   *
   * ── WHY THIS IS NOT `applyBuff` WITH A COUNTER ───────────────────────────
   * The ability owner asked for is 「每次攻擊會帶來 AP/AD/防禦/魔抗 +10% **輪流**
   * 四個 buff，**可同時存在**，持續 1 秒」. Four independent 1-second buffs that
   * arrive one per swing in a fixed order. Written with `applyBuff` it needs a
   * per-entity 「which one is next」 integer — mutable, un-derivable state that a
   * replay has to carry and that nothing else in `sim/**` keeps.
   *
   * ── HOW THE INDEX IS DERIVED (ABSOLUTE TICKS, NO COUNTER) ────────────────
   * Each step owns a source id `buff:cycle:<cycleKey>:<i>`, so the world ALREADY
   * remembers, for every step, the absolute tick it expires on. The next step is
   * therefore a pure read:
   *
   *     1. the FIRST step (authored order) with no live source  → that one
   *     2. all four live                                        → the one whose
   *                                                               `expiresAtTick`
   *                                                               is SMALLEST
   *                                                               (ties: authored
   *                                                                order)
   *
   * Swing 1 finds AP absent → AP. Swing 2 finds AD absent → AD. … Swing 5 finds
   * all four live and AP closest to expiry → AP. That is a perfect round-robin,
   * and 「可同時存在」 falls out for free because each step is its own source with
   * its own deadline. No counter, no `world` field, no wire field; two replicas
   * that agree on the tick agree on the pick.
   *
   * ── WHAT IS A FIELD AND WHY ──────────────────────────────────────────────
   * `steps` is the whole rotation — count, order, per-step modifiers AND per-step
   * duration are all authored, so 「輪流四個」 is content, not a constant. An
   * operator can make it three steps, or give the armour step a longer window,
   * without a code change (CLAUDE.md 第一守則).
   */
  | {
      kind: "cycleBuff";
      /**
       * Namespace for this rotation's source ids. TWO DIFFERENT cycles on one
       * body (阿福's own 10 % ring and the EX's +40 % ring) must not share a
       * key or they would take turns with each other.
       */
      cycleKey: string;
      /** the caster (default) or each resolved target */
      applyTo?: "self" | "target";
      /** the rotation, in order. One entry = a degenerate 1-step refresh. */
      steps: { modifiers: StatModifier[]; duration: number }[];
    }
  /**
   * restore — WC3's `SetUnitLifePercentBJ` / `SetUnitManaPercentBJ` idiom: set a
   * FRACTION of the target's own maximum, not a flat amount. `heal` cannot
   * express it because `Scaling.ratios` reads the CASTER's stats, so a "restore
   * this ally to full" ultimate (初音's `MikuEX`) had nowhere to go and shipped
   * as a damage nuke. 0..1 of the TARGET's max; absent = untouched.
   */
  | { kind: "restore"; healthPct?: number; manaPct?: number }
  /**
   * spendMana — 消耗法力. The MIRROR of `restore.manaPct`, and the missing half
   * of the vocabulary: every path that could move mana before this only ever
   * moved it UPWARDS (`restore`, `Stat.ManaRegen`) or charged it as an
   * ABILITY's own `manaCost` at cast time (abilities/abilitySystem.ts).
   *
   * WHY IT HAD TO EXIST — a real card the old vocabulary could only lie about.
   * 20-01 風王結界 (`godie-e002.w`, w3a `A0DZ`) is a WC3 ORB: while the barrier
   * is up, EVERY BASIC ATTACK spends 30 mana and adds bonus damage. That cost
   * is not the ability's `manaCost` — the toggle is cast once and the charge is
   * paid per SWING, from a hook, and the swing still lands when the pool is
   * empty (the orb simply does not fire). `manaCost` charges once, at cast, and
   * REFUSES the cast when short; those are different rules, so this is a
   * different mechanism, not a re-use of that one.
   *
   * ⚠️ IT DOES NOT GATE ITSELF. This effect SPENDS; deciding whether there was
   * enough to spend is the hook's `condition` (sim/content/condition.ts —
   * 「自身法力 >= 30」). Folding a threshold in here would have built a second,
   * invisible copy of the condition system whose number could drift out of sync
   * with the visible one, and would have made the same effect un-authorable for
   * 「花光剩下的法力」 cards. What it DOES guarantee is that the pool never goes
   * negative: the spend is clamped at 0 (see effects/spendMana.ts).
   */
  | {
      kind: "spendMana";
      /** flat mana to burn, per application. Resolved against the CASTER's stats. */
      amount: Scaling;
      /**
       * ADDITIONAL 0..1 fraction of the payer's OWN max mana, added to `amount`.
       * Both terms exist because WC3 authors both forms (`Ncl6`-style flat costs
       * and the percentage drains); absent = 0, so a flat-only card is unchanged.
       */
      pctMaxMana?: number;
      /**
       * ADDITIONAL 0..1 fraction of the payer's **CURRENT** mana — 熾天使之弓
       * godie-i012 「每次削去敵方英雄**現存** MP 3%」(owner 2026-08-01 把 5% 調成 3%)。
       * ABSENT = 0,所以每一份
       * 既有文件完全不變。加在 `amount` 與 `pctMaxMana` 之上。
       *
       * ⚠️ 為什麼是**第二個欄位**而不是給 `pctMaxMana` 加一個 `basis`:
       * `pctMaxMana` 這個名字寫著 **Max**,而且已經出貨在內容裡。加一個
       * `basis: "current"` 會讓那個名字在一半的取值下變成謊話 —— CLAUDE.md
       * 第一守則末段點名的正是這種事(「語意改了,舊文案就是謊話」)。兩個
       * 名字各自誠實、相加,語意也清楚:兩個都是「這次要提多少」。
       *
       * ⚠️ 分母永遠是**付款人自己的**條(跟 `pctMaxMana` 一樣),即使
       * `applyTo: "target"` —— 「削去敵方現存 MP 3%」的 3% 當然是敵方的魔,
       * 這是這個機制唯一說得通的讀法,也是 spendMana 檔頭已經寫下的規則。
       */
      pctCurrentMana?: number;
      /** who pays: the hook/ability owner (default) or each resolved target (mana burn) */
      applyTo?: "self" | "target";
      /**
       * 把**這一次實際扣掉的法力**存進一個標記,讓稍後的 `damage.bankedBonus`
       * 讀得到。ABSENT = 不存(今天五支 spendMana 有四支不需要)。
       *
       * WHY IT EXISTS AT ALL — owner 2026-07-31 對 13-002 絕。暗殺奧義:
       * 「現存 MP 的 20% 傷害」。那一招把法力燒到 0,而送傷害的免費牙突是
       * hook 上的 `onAbilityHit`,幾秒後才可能打中人。那時 `hp.mana` 已經是 0,
       * 所以「在傷害那一刻讀法力」永遠算出 0 —— 失敗形態②。存款是唯一能
       * 表達「在消耗全魔的那一刻結算」的形狀。
       *
       * ⚠️ 存的是**實扣量**不是 `want`:法力不夠時 spendMana 會夾到剩下的量,
       * 而玩家買到的傷害必須對應他真的付出去的東西。
       */
      bankAs?: { statusId: StatusId; durationSec: number };
    }
  | { kind: "dash"; mode: "forward" | "toPoint"; speed: number; maxDistance: number }
  /**
   * leap (task #247) — the map's own parabolic jump, ported from the nine
   * `SetUnitFlyHeightBJ(-k*Pow(i-m,2)+A)` sites in war3map.j. A SEPARATE kind
   * from `dash` because it needs a different integrator: no per-tick collision
   * (terrain crossing IS the point), an absolute parametric position so the arc
   * cannot drift, a height channel, an integer tick budget and a deferred
   * effect payload. See sim/movement/leap.ts for the arc math and the
   * blocked-landing rule.
   */
  | {
      kind: "leap";
      /** who flies: the caster (default), or each resolved target (thrown arcs) */
      applyTo?: "self" | "target";
      /** "toPoint" = the snapshotted cast point; "inPlace" = vertical, distance 0 */
      mode: "toPoint" | "inPlace";
      /** apex height in GGD units (JASS peak × 11/600) */
      apexHeight: number;
      /** flight time; converted to an INTEGER tick count exactly once, at takeoff */
      durationSec: number;
      /**
       * How far a THROWN body travels when there is no cast point to aim at —
       * i.e. `applyTo: "target"` on a unit-targeted ability (52-02 蹂躪編年史
       * hurls its victim 400 wc3 units along the caster's facing, j:51767).
       * GGD units; ignored for `applyTo: "self"` and for `mode: "inPlace"`.
       */
      throwDistance?: number;
      /**
       * DRAG PHASE (52-02 蹂躪編年史「迅速將目標抓回」). When true the flyer is
       * yanked to the CASTER before the throw, so the arc runs
       * caster.pos → caster.pos + facing × throwDistance instead of starting
       * where the victim happened to be standing.
       *
       * That is what the JASS does: `Trig_Trample_Effect` pulls the victim 50
       * wc3 units per 0.05 s tick toward the caster until it is within 50
       * (war3map.j:51755-51763), and only THEN is the throw aimed —
       * `PolarProjectionBJ(casterLoc, 400.00, GetUnitFacing(caster))` at
       * j:51765-51767. Without this flag the landing point is off by the
       * original caster→victim distance, which on a 5.5-unit cast range is up
       * to 75 % of the throw itself.
       */
      dragToCaster?: boolean;
      /** landing burst radius, GGD units (0/absent = the flyer alone) */
      landRadius?: number;
      /** effects run on the LANDING tick, centred on the landing point */
      onLand?: EffectDef[];
    }
  /**
   * championForm (task #249 變身) — the map's own WC3 **Metamorphosis** pair,
   * `Eme1` (normal unit) ⇄ `Emeu` (alternate unit), as a sim primitive.
   *
   * WHY IT IS A BODY SWAP AND NOT A BUFF. All 26 transforms in
   * `src_gogodieEX227s.w3x` are a COMPLETE second unit definition in
   * `war3map.w3u` — its own hp/armor/attack speed/range/model/ability list —
   * never a modifier stack on the first (see content/championForms.ts). An
   * `applyBuff` could not express 40萬解's melee→ranged change or 30變態紳士's
   * ground→flying body at all, so the primitive swaps WHICH CHAMPION DOC the
   * entity resolves through, in place, keeping the entity id, HP, level, items
   * and cooldowns (see systems/ChampionFormSystem.ts for the swap contract).
   *
   * `to` is a DIRECTION, not an id: the counterpart is read from the champion
   * doc's own `transform.counterpartId`, so one authored effect works for every
   * hero and the id can never be typo'd into a body that does not exist.
   *
   * `durationSec` is the w3a `ahdu` (HERO duration) of the transform ability.
   * ABSENT = the form does not time out — 20-01 風王結界 and 70-00 紮根 are
   * TOGGLES and 61-00 百連我殺 is a death-state morph. Three of 26; an absent
   * duration is a recovered fact, not missing data.
   */
  | { kind: "championForm"; to: "alternate" | "base" | "toggle"; durationSec?: number }
  | { kind: "spawnProjectile"; projectileId: ProjectileId; onHit: EffectDef[] }
  /**
   * spawnVfx — the WC3 "dummy effect unit" idiom (化繁為簡): a Locust/invuln
   * unit that only carries a MODEL and expires is NOT gameplay, it's a one-shot
   * visual at a position. Emits a `vfxSpawn` sim event carrying a vfx@1 doc id
   * and a world point; the client's VfxSystem plays the doc there. Purely
   * cosmetic — mutates no world state, keeps the sim deterministic.
   */
  | { kind: "spawnVfx"; vfxId: string; at?: "self" | "target" | "point"; durationSec?: number }
  /* ═══════════════════════════════════════════════════════════════════════
   * RESERVED KINDS (GH#289) — the schema and the registry know them, the
   * handlers throw. Each is one parallel lane's landing pad; see the header of
   * effects/effectRegistry.ts for the three-file recipe, and the kind's own
   * module for why it does or does not need a new SimWorld store.
   *
   * They are declared HERE, up front and all at once, so that six lanes never
   * have to edit this union (or SimWorld's class body) concurrently — the
   * merge conflict this whole split exists to prevent. The FIELDS are a
   * first draft: a lane may reshape its own member, and only its own.
   * ═══════════════════════════════════════════════════════════════════════ */
  /**
   * dot — 持續傷害 (lane P1). Periodic damage on a deadline, the WC3
   * 中毒/燃燒/腐蝕 family. A separate kind from `damage` because it needs
   * SCHEDULING: `world.dot` remembers who is burning and when the next payout
   * lands (see effects/dot.ts).
   */
  | {
      kind: "dot";
      /**
       * Armour (physical) / MR (magic) / neither (true). Payouts go through the
       * damage QUEUE, so this is the same knob and the same mitigation curve as
       * the `damage` kind — a 「中毒」 that ignored armour would be `"true"` on
       * purpose, not by accident.
       */
      damageType: DamageType;
      /** damage per PAYOUT (not per second) — resolved against the caster at apply */
      amountPerTick: Scaling;
      /**
       * 資源百分比項,**每一次付款**都加上它 —— 熾天使之弓 godie-i012 的
       * 「每秒燃燒 3% 最大生命,持續 2 秒」。形狀與上界見
       * {@link ResourcePctTerm}(effects/dynamicTerms.ts),與 `damage` 用的
       * 是同一個型別、同一個解算函式。
       *
       * ⚠️ **在 apply 當下就對每個受害者解算完,凍進 `DotInstance.amountPerTick`**,
       * 跟 `amountPerTick` 這一項的既有語意完全一致(dot.ts:「一次施放的每個
       * 受害者燒同一個數字,而那個數字在 APPLY 就凍住」)。每次付款重讀會是
       * 另一個機制(而且會讓一個死掉的施法者的燒傷還在跟著對方的裝備變動)。
       * 也因此 `effects/dotTick.ts` **一行都不用改**。
       *
       * ⚠️ 上界架在**整段燒完的總量**上,不是單次付款 —— 一次 `damage` 的
       * 0.35 是一下,而 dot 會付 `duration/interval` 次。推導與數字見
       * `DOT_RESOURCE_PCT_RATIO_TOTAL_MAX`,載入時的檢查在
       * `content/schema/effect.ts` 的 `dot` superRefine。
       */
      resourcePct?: ResourcePctTerm;
      /** seconds between payouts; converted to whole ticks once, at apply */
      intervalSec: number;
      /** total seconds the effect lasts */
      durationSec: number;
      /**
       * Re-applying the SAME `origin` from the SAME caster. THE decision point
       * of this primitive — all three behaviours are shippable and the owner
       * will want to move between them, so it is a field, not a branch.
       *
       *   · `"refresh"` (DEFAULT) — one instance; the deadline is extended and
       *     the payload re-resolved, the cadence is untouched. Chosen as the
       *     default because it is the WC3 buff idiom (re-casting replaces the
       *     buff) and because it is the only one of the three where spamming a
       *     button cannot multiply your damage — the conservative reading of an
       *     authored 「每秒 N 點、持續 M 秒」.
       *   · `"independent"` — every application is its own instance with its own
       *     cadence and deadline. Two casts = double damage.
       *   · `"stack"` — one instance whose payout is `N × stacks`, capped by
       *     {@link maxStacks}; the deadline refreshes with each application.
       *
       * Two DIFFERENT casters never merge under any mode: merging would hand
       * the second caster the first one's kill credit.
       */
      stacking?: "refresh" | "independent" | "stack";
      /** ceiling on the stack count (`"stack"` only). Absent = the schema's own ceiling. */
      maxStacks?: number;
      /**
       * Pay once on the CAST tick as well as on every interval boundary
       * (default false = the first payout is one interval away).
       *
       * Default false because a DoT is usually authored NEXT TO a direct
       * `damage` effect in the same list, and an immediate payout would make
       * the two land on the same tick and read as one double-strength hit. It
       * ADDS a payout rather than re-phasing the schedule, so turning it on is
       * never also a stealth nerf.
       */
      tickOnApply?: boolean;
      /**
       * What happens to a live burn when its caster dies.
       *
       *   · `"continue"` (DEFAULT) — it keeps ticking and keeps crediting the
       *     dead caster, so a poison that finishes someone still pays that
       *     caster the kill and the bounty. This is WC3's behaviour (the buff
       *     lives on the VICTIM) and the reading every 「中毒」 description
       *     implies.
       *   · `"stop"` — the burn dies with its caster, and does NOT resume if he
       *     is revived (a revive is not a re-cast).
       */
      onCasterDeath?: "continue" | "stop";
    }
  /**
   * summon — 召喚物 (GH#289 lane P2). Spawns one or more bodies that fight for
   * the caster and despawn on a deadline. `world.summon` carries owner + expiry
   * + the cap group; the tick lifecycle lives in `sim/summons.ts`.
   *
   * ── EVERY FIELD BELOW EXCEPT `championId`/`count` IS A DECISION POINT ──────
   * owner 2026-07-30: 「所有開發都要以編輯器可以彈性設定為準，**尤其是決策點**」.
   * The 52 「召喚代理」 in docs/ability-templates.md disagree with each other on
   * literally every one of them, so a branch picked in code would be wrong for
   * most of them:
   *
   *   · COUNT + SHAPE  — 96-04 獨孤九劍 puts 9 sword spirits ON the target point,
   *     91-002 亡靈大軍 rings 8 ghouls at 450u, 37-03 災難之牆 lays 9 wall units
   *     in a LINE 100u apart, 21-002 天破壤碎 scatters 40 points at random inside
   *     a rect. → `count` / `formation` / `spread` / `at`.
   *   · LIFETIME       — 18-04 億年樹 lives `9s × level`, 96-04 lives 10s,
   *     35-00 召喚佩 is a PET that persists until replaced. → `durationSec`
   *     ABSENT = permanent, which is WC3's own 0-duration form.
   *   · CAP            — 37-02 黑核晶 caps concurrent crystals at 7 and 「超過殺
   *     最舊」. That is where BOTH `maxAlive` and `onCap: "replaceOldest"` come
   *     from; they are not invented ceilings.
   *   · OWNER DEATH    — nothing in the JASS states it, so it must not be
   *     stated in code either. → `onOwnerDeath`.
   *
   * ⚠️ A summon is deliberately NOT a `mob` and NOT a `champion`:
   *   · no MobComp — the #215 wave scheduler counts `mob` entries against its
   *     own alive cap and pays 20 gold per kill from that ledger, and its AI
   *     targets 「every champion」 with no team notion, i.e. a summon wearing a
   *     MobComp would attack its own summoner;
   *   · no ChampionComp — `deathSystem` pays kill gold + the once-per-victim
   *     kill BOUNTY for anything `world.champion.has()`, so a champion-bodied
   *     summon would be a gold printer, and the scoreboard / duel resolution /
   *     placement all key off that same store.
   * It carries Transform + Health + Nav + Team + Stats + Abilities + Status, so
   * it walks (`orderSystem` chase → `movementSystem`) and swings
   * (`basicAttackSystem`) through the SHIPPED systems with no new AI.
   */
  | {
      kind: "summon";
      /**
       * WHOSE BODY. `"champion"` (default) = the named doc. `"self"` = a copy
       * of the CASTER's own champion — 57-03 複製鏡 and 27-002 霧隱分身之術 are
       * clones, and naming the hero twice in their own ability doc is the kind
       * of duplication that goes stale on the next 變身 pair.
       */
      body?: "champion" | "self";
      /** which body to spawn — a champion doc id, resolved through the registry */
      championId: string;
      /** how many bodies this cast creates */
      count: number;
      /** seconds before despawn; ABSENT = permanent (the WC3 0-duration form) */
      durationSec?: number;
      /** level of the summoned body (WC3 summons scale off the ability level) */
      level?: number;
      /**
       * 歸屬 — whose side it fights on. `"owner"` (default) = the summoner's
       * team. `"neutral"` = the sentinel MONSTER team, i.e. hostile to
       * EVERYONE including the summoner (the WC3 「敵對召喚」 / 變異 form).
       */
      team?: "owner" | "neutral";
      /** anchor point: the caster (default), the first resolved target, or the cast point */
      at?: "self" | "target" | "point";
      /**
       * 固定陣型 or 隨機散佈. `"ring"` (default) spaces the bodies evenly around
       * the anchor, `"line"` lays them perpendicular to the caster's facing,
       * `"scatter"` draws from the world's SEEDED rng (never `Math.random`).
       */
      formation?: "ring" | "line" | "scatter";
      /** ring radius / line spacing / scatter radius, in GGD units */
      spread?: number;
      /**
       * 上限 — the most bodies this cap GROUP may hold at once. ABSENT =
       * {@link DEFAULT_SUMMON_CAP}: an uncapped summon is one content typo away
       * from filling the arena, which is a server-side entity leak, not a
       * balance question.
       */
      maxAlive?: number;
      /**
       * What the cap counts. `"casterAbility"` (default) = per caster PER
       * ability, so a hero's pet and its ultimate's swarm do not evict each
       * other; `"caster"` = one budget for everything that hero summons.
       */
      capScope?: "caster" | "casterAbility";
      /** at the cap: drop the new body (default) or evict the oldest (37-02 黑核晶) */
      onCap?: "skip" | "replaceOldest";
      /** summoner dies → the body despawns (default) or fights on to its deadline */
      onOwnerDeath?: "despawn" | "persist";
      /** ×the source champion's own maxHealth (1 = the hero's own sheet) */
      hpMult?: number;
      /** ×the source champion's own attack damage */
      damageMult?: number;
      /**
       * Who is paid when the SUMMON lands a killing blow.
       *
       * ABSENT / `"none"` = nobody, which is what the sim does today by
       * construction: `deathSystem` gates every payout on
       * `world.champion.has(killer)` and a summon is not a champion.
       *
       * ⚠️ `"owner"` is NOT IMPLEMENTED and the handler REFUSES it out loud
       * (the `shield.absorbs` precedent). Paying the owner needs a killer-
       * rewrite seam inside `systems/DeathSystem.ts`, which is another lane's
       * file; re-deriving the gold/xp/bounty/assist/killCombo ladder over here
       * would be a SECOND payout path that drifts from the first one silently.
       */
      killCredit?: "none" | "owner";
      /* ── 誰打得到它 —— 決策點。解析器/預設值/理由: sim/summonRules.ts ─────
       * A summon is deliberately neither `champion` nor `mob`, and BOTH of the
       * sim's automatic target pickers were allow-lists over exactly those two
       * stores (`targeting.isAutoTargetable`, `MobSystem`'s aggro scan), so on
       * the shipped path NOTHING could ever auto-acquire one: measured at 300
       * ticks with a summon standing ON an enemy champion, `attackTarget` never
       * left `null` and the body took 0 damage. These six fields are what turned
       * that from a hard-coded fact into an authored one. */
      /** 敵方自動索敵看不看得見它; ABSENT = true (WC3: an ordinary unit) */
      autoTargetable?: boolean;
      /** 索敵比較器的第一鍵; ABSENT = `"summon"` (its own tier, hero > it > mob) */
      targetPriority?: "champion" | "summon" | "mob";
      /** #215 殭屍咬不咬它; ABSENT = true (WC3: creeps fight summoned units) */
      mobTargetable?: boolean;
      /** 玩家點不點得到它; ABSENT = true (WC3: right-clickable) */
      manualTargetable?: boolean;
      /** 火圈燒不燒它; ABSENT = true (owner 2026-07-30 的 保底 —— 見 summonRules.ts) */
      burnsInFireRing?: boolean;
      /** 打死它給擊殺者多少金幣; ABSENT = 0 (WC3: 召喚物不是給錢的單位) */
      bountyGold?: number;
    }
  /**
   * invulnerable — 無敵 / 免疫 (lane P3, LANDED). Timed immunity.
   * `world.invulnerable` holds one ABSOLUTE expiry tick PER AXIS.
   *
   * 無敵與免疫**不是同一件事**,原作也不是:`Avul` 擋所有東西,魔法免疫只擋
   * 魔法,而 07-01 臨、兵、鬥「可抵擋對方負性魔法」只擋負面狀態、完全不擋
   * 傷害。所以這裡是三個正交的決策點欄位,不是一個 boolean。
   * 完整的考證與理由在 sim/effects/invulnerable.ts 的檔頭。
   */
  | {
      kind: "invulnerable";
      durationSec: number;
      /** the caster (default) or each resolved target */
      applyTo?: "self" | "target";
      /**
       * 傷害免疫的**範圍**。ABSENT = `"all"` = WC3 的 `Avul`。
       *
       *  · `"all"` —— 41-002 絕對屏障、29-03 有功夫無懦夫,以及 JASS 裡
       *    30+ 個 `SetUnitInvulnerable` / `'Avul'` 站點(天翔龍閃、ExcaliburMAX、
       *    百連我殺、蹂躪、蒼月潮 07-02 的衝刺…)。
       *  · `"magic"` —— 魔法免疫:47-04 天翔龍閃、97-04/97-002 火產靈神、
       *    99-04「不受任何魔法傷害」、道具 黃昏公主的血脈。
       *  · `"none"` —— **純免控**:07-01 臨、兵、鬥「可抵擋對方負性魔法」。
       *    這一支就是「免傷與免控必須能分開」的存在證明。
       *  · `"physical"` —— 對稱補完(目前沒有出貨文件用到)。
       */
      blocksDamage?: "all" | "none" | "physical" | "magic";
      /**
       * 真實傷害這一根軸。ABSENT = 跟著 `blocksDamage === "all"` 走
       * (WC3 `Avul` 擋所有東西)。
       *
       * ⚠️ 火圈是 #270 明確的**真實傷害**,而「無敵要不要免疫縮圈」是 owner 的
       * 平衡決定,所以它是欄位而不是程式裡的分支。⚠️ 但**今天它還管不到火圈**:
       * champion 的燒傷直接寫 `hp.hp -=`(systems/FireRingSystem.ts),沒有走
       * 傷害佇列 —— 見 effects/invulnerable.ts 檔頭 ⑤。
       */
      blocksTrueDamage?: boolean;
      /**
       * 免控:拒絕敵方施加的 stun / root / 減速。**預設 false,而且是刻意的**
       * —— 讓它跟著免傷自動打開,等於把 14 支技能的免控變成後台看不見的隱性
       * 效果。想要 `Avul` 的完整語意就明寫 `true`。
       */
      blocksControl?: boolean;
    }
  /**
   * knockback — 擊退 (lane P4). Shoves the target along a direction. Writes
   * the EXISTING `nav.override` (`DashOverride` with `kind: "knockback"`), so
   * it adds no SimWorld field — see effects/knockback.ts.
   */
  | {
      kind: "knockback";
      /**
       * GGD units of displacement **AT GAP 0** — a FLOOR, not a fixed length.
       * The gap subtraction (GH#193) still runs on top of it, exactly as it
       * does for the author's `hitFeel.knockbackMag` in combat/damage.ts. See
       * effects/knockback.ts for why "the author's number is what you get at
       * touching distance" is the one semantic the whole game shares.
       */
      distance: number;
      /** units per second the body travels while shoved */
      speed: number;
      /**
       * Direction source: away from the caster (default), along the caster's
       * facing, or toward the caster (a PULL). A DECISION POINT.
       */
      from?: "caster" | "facing" | "pull";
      /** who gets shoved: each resolved target (default) or the caster (a recoil) */
      applyTo?: "target" | "self";
      /**
       * 「這一擊的重量」in DAMAGE units, fed through GH#193's own law
       * (`combatFeel.knockbackRaw`) against the victim's health, so an authored
       * shove obeys 「傷害佔受傷者生命百分比」 and the operator's live
       * `minPct` / `maxBodies` / `bodyUnit` knobs. It deals NO damage — pair it
       * with a `damage` effect if the ability also hurts.
       *
       * ABSENT = the flat `distance` floor only.
       */
      impactPower?: number;
      /**
       * Which health `impactPower` is a percentage OF. A DECISION POINT.
       *
       * "max" (default) = the shipped global rule — 打脆皮飛得遠、打坦克推不動。
       * "current" = 殘血更容易被擊飛. combat/damage.ts rejected "current" for
       * the GLOBAL rule (an invisible execute mechanic nobody asked for); as an
       * opt-in on ONE authored ability it is a visible design choice, which is
       * why it is a field with the owner-stated default rather than a branch.
       */
      hpBasis?: "max" | "current";
      /**
       * Subtract the caster↔victim gap (GH#193). DEFAULT TRUE — owner:
       * 「並減去雙方距離」. false exists only so an operator can author a pull
       * or a fixed-length launcher, where "the further away, the less you move"
       * is backwards. Never flip the default: see combatFeel.ts's
       * 「這個減法不是 bug」.
       */
      subtractGap?: boolean;
      /**
       * 擊飛 — apex height in GGD units. > 0 makes the shove a PARABOLA
       * (`LeapOverride`, the #247 integrator) instead of a ground slide, so the
       * body crosses walls, leaves the planar physics world and is rendered in
       * the air. 0 / absent = the ground slide.
       */
      launchHeight?: number;
      /**
       * 期間不可控制. DEFAULT TRUE. Writes `world.knockdown` for the flight, the
       * one channel every actor already reads (abilitySystem rejects the cast,
       * BasicAttackSystem the swing, CastResolveSystem interrupts, movementHold
       * roots AND freezes turning). The override alone only takes the FEET.
       */
      uncontrollable?: boolean;
      /** extra 不可控制 ticks AFTER landing (the 爬起來 window). Needs `uncontrollable`. */
      getupTicks?: number;
    }
  /**
   * evasion — 閃避 (lane P5). Timed miss-chance. Rides the EXISTING
   * `Stat.Evasion` on `world.stats`, so it adds no SimWorld field — but see
   * effects/evasion.ts for the reason that is not the same as "it works".
   */
  | {
      kind: "evasion";
      /**
       * 0..1 dodge chance granted, BEFORE the ceiling. Both the basic-attack
       * and the ability channel clamp to `effectiveCap(statCaps, Stat.Evasion)`
       * (ships 0.8, 後台可調), so `1` is not a route to invulnerability.
       */
      chance: number;
      durationSec: number;
      /** the caster (default) or each resolved target */
      applyTo?: "self" | "target";
      /**
       * DECISION POINT — may this dodge apply to ABILITY damage, or only to
       * basic attacks? Default (absent) = basic attacks only, which is WC3
       * `Evasion` fidelity and today's shipping behaviour.
       */
      dodgesAbilities?: boolean;
      /**
       * DECISION POINT — may this dodge apply to `type: "true"` damage?
       * Default (absent) = no. Only meaningful with `dodgesAbilities`; kept off
       * by default so the arena fire-ring burn (#270) stays undodgeable.
       */
      dodgesTrueDamage?: boolean;
    }
  /**
   * taunt — 嘲弄 (鍊金術之盾 godie-i06q「每秒吸引周圍敵人優先攻擊自己」).
   * Forces the subjects to auto-target the CASTER for a while. The whole model
   * — where the state lives, why it is not a `StatusEffect`, and every one of
   * its decision-point fields — is in sim/taunt.ts; the targeting seam it feeds
   * is `targeting.forcedTargetOf`.
   */
  | {
      kind: "taunt";
      /**
       * 持續幾秒。Multiplied by the operator's `tauntRules.durationMult` at
       * apply time, then rounded to whole ticks (an ABSOLUTE expiry tick).
       *
       * BOTH ENDS BOUNDED. The floor is 0.034 s for the same reason
       * `grantAttribute.durationSec` has one: below that,
       * `Math.round(sec / dt)` at 30 Hz is 0 ticks — a blank round that looks
       * exactly like the feature being broken. The ceiling
       * (`TAUNT_MAX_DURATION_SEC`, sim/taunt.ts) is a MIS-PARSE guard: 0.5 typed as 50
       * is a taunt that outlives most rounds, i.e. one shield that owns every
       * enemy's targeting for the whole fight.
       */
      durationSec: number;
      /**
       * 範圍 (GGD units) around the CASTER. ABSENT = single-target: the taunt
       * lands on this effect's own resolved targets instead.
       *
       * Two modes rather than two kinds because they differ only in WHO, never
       * in WHAT — and the single-target form is what an ability-targeted WC3
       * taunt needs, while the item needs the circle. Flows through
       * `resolveAbilityRadius`, i.e. the same `combatEnv.abilityRange` budget
       * every other AoE obeys (aura.ts DECISION 3), so it cannot become the one
       * area in the game that ignores the operator's range knob.
       */
      radius?: number;
      /** 一次最多拉幾個人 (nearest first). Absent = `TAUNT_MAX_TARGETS` (sim/taunt.ts). */
      maxTargets?: number;
    }
  /**
   * grantGold — 發放金幣. Pays the caster (or each target) gold, optionally
   * SCALED BY THE TARGET'S LEVEL — which is the only shape that can express
   * 鍊金術之盾's「黃金數量為敵方等級」. See effects/grantGold.ts for what
   * "level" resolves to on each body kind (and what it does NOT resolve to).
   */
  | {
      kind: "grantGold";
      /** 固定金額. Absent = 0 — a pure per-level payout is legal. */
      flat?: number;
      /**
       * 每一級發多少金 —— 「黃金數量為敵方等級」 is exactly `1`.
       * Multiplied by the RESOLVED TARGET's level, so it is meaningless (and
       * contributes 0) when the effect has no target.
       */
      perTargetLevel?: number;
      /** 誰收錢: the caster (default) or each resolved target. */
      to?: "self" | "target";
      /**
       * DECISION POINT — 小怪(殭屍)的「等級」從哪裡來。
       *
       * "wave" (default, absent) = the ROUND's `mobRules.level`, i.e. the same
       *   number the mob's own hp and regen curves are computed from.
       * "fallback" = a mob has no level, so it is worth `fallbackLevel`.
       *
       * ⚠️ It defaults to "wave" because the previous behaviour — a hardcoded
       * 0 — made 鍊金術之盾's 「黃金數量為敵方等級」 pay NOTHING for every
       * zombie in the game while the card said otherwise (failure shape ②).
       */
      mobLevelSource?: "wave" | "fallback";
      /**
       * 沒有等級可讀的身體值幾級。Absent = 0, i.e. a per-level payout on a
       * body with no level concept pays nothing — a number from nowhere is
       * worse than no payout at all. Also what a mob is worth outside a mob
       * round (`world.mobRules` is null there).
       */
      fallbackLevel?: number;
    };

export interface EffectContext {
  world: SimWorld;
  caster: EntityId;
  /** rank of the source ability (1 for items/augments/hooks) */
  rank: number;
  targets: EntityId[];
  point?: Vec2;
  direction?: Vec2;
  /** provenance, e.g. "ability:sela.q", "item:serrated-edge" */
  origin: string;
  /** slot of the casting ability (threads through projectiles into hooks) */
  abilitySlot?: CastableSlot;
  /**
   * 觸發這一次執行的那一發傷害。**只有** `fireHooks` 在 `onDamageTaken` /
   * `onDamageDealt` 上會填它 —— 技能施放、投射物命中、DoT tick 都沒有「剛剛那
   * 一下」可言,所以是 `undefined`,而讀它的效果(`damage.incomingPct`)在那種
   * 情況下**整條不執行**,不會退化成一個只有 flat 項的半吊子傷害。
   */
  incoming?: TriggerDamage;
  rng: Rng;
}

/** Resolve a Scaling against the caster's current final stats. */
export function resolveScaling(
  finalStats: Record<Stat, number>,
  sc: Scaling,
  rank: number,
  /**
   * 施法者的三圍讀取器。**必填,而且刻意必填** —— 見 `Scaling.attrRatios`:
   * 選填的話,任何一個忘了接上的呼叫點都會讓 `attrRatios` 靜默算成 0,也就是
   * 「文案寫了、玩家拿不到」(失敗形態 ②),而且**測試全綠**。必填讓那種漏接
   * 變成編譯錯誤。不涉及三圍的呼叫點傳 {@link NO_ATTR_LOOKUP}。
   */
  attrs: AttrLookup,
): number {
  let v = (sc.flat ?? 0) + (sc.perRank?.[Math.max(0, rank - 1)] ?? 0);
  for (const r of sc.ratios ?? []) v += (finalStats[r.stat] ?? 0) * r.coeff;
  for (const r of sc.attrRatios ?? []) v += attrs(r.attr, r.basis ?? "total") * r.coeff;
  return v;
}
