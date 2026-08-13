/**
 * EffectDef — the serializable effect union. Abilities, item actives/passives,
 * augment hooks, and status DoTs all execute the SAME ordered EffectDef[] via
 * one interpreter (effectRunner). Data, not code → JSON-authorable.
 */
import type { AbilityId, EntityId, ProjectileId, StatusId } from "../../ids";
import type { Stat } from "../stats/statTypes";
import type { RankScalar } from "../perRank";
import type { HookDef, StatModifier } from "../stats/modifiers";
import type { AttrBasis, AttrKey } from "../stats/attributes";
import type { DamageRefund, DistanceScaleTerm, ResourcePctTerm } from "./dynamicTerms";
import type { Vec2 } from "../math/vec2";
import type { SimWorld } from "../SimWorld";
import type { Rng } from "../math/rng";
import type { CastableSlot } from "../intents";
import type { EffectCondition } from "../content/condition";

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
  /**
   * ⭐ G8 —— 這一發封包被**哪幾條 `critStrike` 來源**加成了（`ModifierSource.id`
   * 的清單）。`HookDef.critSource: "thisSource"` 讀它。
   *
   * `undefined` = 一條 grant 都沒有參與 = 這個欄位出現之前的每一發封包。
   *
   * ⚠️ 語意是「**加成到**這一發的來源」而不是「自己骰中的來源」—— 所以
   * `empowers: "everyCrit"` 的 grant 在英雄自己暴擊時也會進名單，那是正確的：
   * `empowers` 這個決策點**已經是一格欄位**，不需要在這裡再開第二個。
   *
   * ⚠️ 它**不是**在 TriggerDamage 上塞第二個真相（那條反對意見針對的是「原傷害
   * 的**量**」）—— 它是同一發封包的一個**分類**，與 `type` / `crit` 兩格
   * 2026-08-05 抄過來的理由逐字相同。
   */
  readonly critSources?: readonly string[];
  /**
   * ⭐ S10 —— 被這一發**反彈掉的原封包**的分類（60-04 迴旋斬：「若成功反彈敵方
   * **技能** AP 傷害」）。`HookDef.reflectedDamageSource` / `reflectedDamageType`
   * 讀它。`undefined` = 這不是一發反彈封包。
   *
   * ⚠️ **只有分類，沒有量**。原傷害的「量」仍然不在 payload 裡 —— 那一份由同一
   * tick 的 `onDamageTaken` 帶著，再塞一份進來才是第二個真相。
   *
   * ⭐ 為什麼「分類」進得來而「量」進不來：60-04 要的是一個**連言** ——
   *「反彈成功了」與「原封包是技能 AP」住在**兩個不同的事件**上，而掛到
   * `onDamageTaken` 的 hook 根本不知道反彈有沒有成功。所以這一格不是第二個真相，
   * 是唯一的真相。
   */
  readonly reflectedFrom?: { readonly origin: string; readonly type: DamageType };
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

/**
 * 一個 effect 的**本體**（kind 專屬欄位）。⛔ 不要直接用它 —— 出貨的型別是
 * {@link EffectDef}，也就是這個聯集再交上每個 kind 共有的欄位。分成兩層的理由
 * 見 `EffectDef` 的註解（第零守則⑨：34 個同型項目 = 1 個模板，不是 34 次複製）。
 */
type EffectVariant =
  | {
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
      /**
       * ⭐ S2（GH#299）—— 資源百分比項。與 `damage.resourcePct` **同一份型別、
       * 同一個讀取器**（`dynamicTerms.ts::resourcePctAmount`），per-target 解算。
       */
      resourcePct?: ResourcePctTerm;
      /**
       * 傷害型別。**省略 = `world.damageRules.defaultAbilityDamageType`**
       *（出貨 `magic` —— owner 2026-08-05「技能傷害預設都改成 AP 傷害」）。
       *
       * ⚠️ 這一格與**係數來源**（`amount` 的 `Scaling` 讀 ap/ad/str/agi/int）
       * 是兩件事：型別決定吃護甲還是魔抗，係數決定數字多大。
       */
      damageType?: DamageType;
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
      /**
       * ⭐ G1 ① —— 圈**內**逐一過濾（`condition.target-status@1` 在範圍技上的
       * 那一半：「範圍內只打帶〔恐懼〕的敵人」）。
       *
       * ⛔ 與 {@link EffectCommon.condition} **不是**同一格，而這正是它必須存在
       * 的理由（實測）：
       *   · `condition` 讀的是**上游交下來的** `ctx.targets`，決定「這一段跑不跑」；
       *     `effectRunner::gateOnCondition` 在 handler 被呼叫**之前**就過濾完了，
       *     一個都沒通過就 `return undefined`（handler 完全不被呼叫，那是 owner
       *     自己要的語意⑤）。
       *   · 於是「以自己為圓心的爆炸，只打帶恐懼的敵人」（`ctx.targets` 是空的）
       *     會讓 `subject:"target"` 讀 FALSE → **整圈永遠不發**；而「打 A、濺到
       *     旁邊帶恐懼的人」在 A 乾淨時會被上游閘擋掉 → **整圈消失**。
       *     兩種寫法都拿不到那張卡。
       *   · 這一格讀的是**這個圓自己用 `enemiesInCircle` 解出來的人**，只在
       *     handler 解完圈之後逐一過濾，**不參與**上游閘。
       *
       * 同一個型別、同一個求值器（`evaluateCondition`）、同一組葉子 ——
       * ⛔ 不是第二套條件系統。
       *
       * 缺席 = 一次 `evaluateCondition` 都不呼叫 = 零 rng draw = 今天的行為逐位元
       * 不變（既有 12 份 `damageArea` + 6 份 `damageLine` 文件全部缺席）。
       *
       * ⚠️ rng 預算：`conditionChanceCount(cond) × 候選數`，而且**與
       * {@link maxTargetsCounts} 無關** —— 求值一律跑滿排序後的整份候選清單再切
       * cap，讓 draw 次數不會因為某個人站遠一點而分叉（同 `randomArea` 檔頭②
       * 「看得見的預算」）。
       */
      victimCondition?: EffectCondition;
      /**
       * ⭐ G1 —— `maxTargets` 數的是誰。
       * · `"qualified"`（省略 = 這個）—— 通過 `victimCondition` 的**前 N 個**
       *   （卡面「最多 5 名帶〔恐懼〕的敵人」讀起來就是這個）。
       * · `"candidates"` —— 先取最近的 N 個候選**再**過濾（「最近 5 人裡帶恐懼的」）。
       * 沒填 `victimCondition` 時這一格沒有作用。
       */
      maxTargetsCounts?: "qualified" | "candidates";
      /**
       * ⭐ G1 ② —— `effect.target-set-chain@1`：把這一圈**真的打到的那群人**
       * 當成 `ctx.targets` 交給這一段（`victimCondition` 過濾之後、`maxTargets`
       * 切完之後的那一份）。
       *
       * ⛔ 交的必須是那一份，不是 `ctx.targets`：下游看到的人要跟血條上真的掉血
       * 的那群人是同一批，否則就是「畫面上打到 A、狀態蓋在 B」。
       *
       * ⛔ **不需要 bake**：這一段與母效果在**同一個 tick** 執行，不是延遲
       * payload，所以 #247 那個「窗口在飛行途中過期」的問題在這裡不存在
       *（對比 `leap.onLand` / `spawnProjectile.onHit` / `randomArea.effects`
       * 三個都要 bake）。
       *
       * ⚠️ 深度：一段 `onHitTargets` 裡可以再放一個帶 `onHitTargets` 的
       * `damageArea`。JSON 不可能有環，所以深度由文件本身的巢狀決定、必然有限；
       * `EFFECT_CHAIN_MAX_STEPS` 只擋**寬度**。與 `randomArea.effects` 的既有姿態
       * 一致，⛔ 不加深度計數器（那會是一個沒有需求的機制）。
       */
      onHitTargets?: EffectDef[];
      /**
       * ⭐ G1 ② —— 一個人都沒打到時，要不要照樣跑 {@link onHitTargets}。
       * 省略 = **false** = 不跑（＝今天什麼都不會發生的那個語意）。
       * 開著才寫得出「打空了也留下一個落地特效」。
       * ⚠️ 開著時下游拿到 `targets: []`，帶 `subject:"target"` 條件的效果會退化成
       * 整段閘並讀 FALSE（`effectRunner` 的④）—— 那是一個真的、但不該是預設的語意。
       */
      runOnEmptyHit?: boolean;
      /**
       * ⭐ G1 ② —— {@link onHitTargets} 收到的是**整群人一次**還是**一個一個**。
       *
       * 省略 = `"batch"` = 整群一次交下去（`ctx.targets = struck`），也就是
       * {@link onHitTargets} 上面那段檔頭**已經公告過**的語意 —— ⛔ 這一格不是新
       * 語意，是把那句話裡本來就藏著的二選一拿出來當欄位（第一守則：決策點）。
       *
       * · `batch` —— 「打到的每個人都中毒」「濺射到的人被擊退」：下游 handler 自己
       *   會 for 過 targets，一次交完最省。
       * · `perTarget` —— 「每個被打到的人腳下再炸一小圈」：下游是 `damageArea` /
       *   `damageLine` 這種**自己解幾何**的 kind，而它們只讀 `ctx.targets[0]` 當
       *   圓心 —— batch 模式下 5 個受害者只會炸出 1 個圈，而且**畫面上跟壞掉一模
       *   一樣**（失敗形態②）。
       *
       * ⚠️ `perTarget` 讓下游的 rng draw 隨受害者數線性成長；受害者清單本身已經是
       * 全序決定性的，所以決定性不破，但它是一筆看得見的成本。
       */
      onHitTargetsMode?: "batch" | "perTarget";
    }
  /**
   * damageLine — 面前的一條直線範圍傷害 (18-00 薔薇荊棘之刃). A CAPSULE, not a
   * circle: see `effects/damageLine.ts` for why the shape difference is the
   * whole play pattern and for the 「3 個身位」 → 3.6 GGD units derivation.
   */
  | {
      kind: "damageLine";
      /**
       * ⭐ S2（GH#299）—— 資源百分比項。與 `damage.resourcePct` **同一份型別、
       * 同一個讀取器**（`dynamicTerms.ts::resourcePctAmount`），per-target 解算。
       */
      resourcePct?: ResourcePctTerm;
      /**
       * 傷害型別。**省略 = `world.damageRules.defaultAbilityDamageType`**
       *（出貨 `magic` —— owner 2026-08-05「技能傷害預設都改成 AP 傷害」）。
       *
       * ⚠️ 這一格與**係數來源**（`amount` 的 `Scaling` 讀 ap/ad/str/agi/int）
       * 是兩件事：型別決定吃護甲還是魔抗，係數決定數字多大。
       */
      damageType?: DamageType;
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
      /** ⭐ G1 ① —— 見 `damageArea.victimCondition`，同一份型別、同一個求值器。 */
      victimCondition?: EffectCondition;
      /** ⭐ G1 —— 見 `damageArea.maxTargetsCounts`。同名同語意，⛔ 不是第二件事。 */
      maxTargetsCounts?: "qualified" | "candidates";
      /** ⭐ G1 ② —— 見 `damageArea.onHitTargets`。同樣不需要 bake。 */
      onHitTargets?: EffectDef[];
      /** ⭐ G1 ② —— 見 `damageArea.runOnEmptyHit`。省略 = false。 */
      runOnEmptyHit?: boolean;
      /**
       * ⭐ G1 ② —— 見 `damageArea.onHitTargetsMode`。省略 = `"batch"`。
       * ⛔ 兩個 kind 在這一族上必須**同名同語意**：欄位名一旦分岔，編輯器上長得
       * 一樣的兩格就會是兩件事 —— 那是最難查的一種缺陷。
       */
      onHitTargetsMode?: "batch" | "perTarget";
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
      /**
       * 【吞噬】—— 處決 + 等值回復（owner 2026-08-05，初號機 EX）。
       * 行為與「為什麼走傷害佇列 / 為什麼要穿盾」見 `sim/effects/devour.ts` 檔頭。
       */
      kind: "devour";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /** 逐階處決線：`hp <= maxHp × 這一格`。owner 的 3/5/7/9% = `[0.03,0.05,0.07,0.09]`。 */
      thresholdPctOfMax: number[];
      /** 回復「吞下去的生命」的幾成。省略 = 1（＝owner 的「回復等值生命」）。 */
      healPct?: number;
      /** 吞得掉誰。省略 = `"champion"`（owner 文案的「敵方**英雄**單位」）。 */
      victim?: "champion" | "any";
      /**
       * 致死量要不要把當下的護盾一起算進去。省略 = **true**。
       * ⛔ false 的話一個帶盾的目標「進了處決線但吞不死」，而卡上寫著即死。
       */
      throughShields?: boolean;
      /**
       * ⭐ S9a —— **真的吞掉之後**才跑的那一段（92-03「每吞噬一名敵人 +1 AP，永久」）。
       * 缺席 = 沒有後續 = 今天。
       *
       * ⛔ 「用 `onKill` 代替」不成立：`onKill` 的三個發射點都是
       * `fireHooks(world, killer, "onKill", id)` —— **沒有 abilitySlot、沒有
       * incoming**，所以「吞噬殺掉的」與「普攻殺掉的」在 hook 端**分不出來**，
       * 掛上去會變成「任何擊殺都 +1 AP」。
       * ⛔ 「掛同一組門檻的第二個效果」也不成立：那對**沒有**越過處決線的目標
       * 也會跑（見這個 kind 的守衛突變）。
       *
       * ⚠️ **觸發時刻是「處決線通過、致死量已排進 `world.damageQueue`」的那一刻**，
       * 不是「屍體確認了」。一個帶【免死】的目標（52-00 十二道試煉）會被吞噬打到
       * 卻活下來，而這一段已經跑過。⛔ 沒有做成 `emitOn: "committed" |
       * "confirmedKill"`：後者要一份 `world.pendingDevourConfirm` + 一支排在
       * `deathSystem` 之後的系統，而今天**沒有任何一張卡**要求那個語意 ——
       * 一個只有一半值真的會動的欄位是失敗形態②。
       */
      onDevour?: EffectDef[];
      /**
       * ⭐ S9a —— 一次施放吞掉三個人時，{@link onDevour} 跑幾次。
       * · `"victim"`（省略 = 這個）—— 每個**真的被吞掉**的人各跑一次
       *   （92-03「每吞噬一名 +1 AP」）。
       * · `"cast"` —— 只要有人被吞掉就跑一次（「吞噬成功後回滿魔」那一類）。
       * ⚠️ 預設對 `shape: "single"`（出貨唯一形狀）兩者**完全等價**，也就是預設值
       * 不替任何人做決定。
       */
      onDevourPer?: "victim" | "cast";
    }
  /**
   * ── Lane 1（2026-08-08）四個新 kind ────────────────────────────────────
   * 四個是**同一個形狀**的四個實例（`shape` + 決策欄位 + 一個 handler），
   * 界都住在 `sim/effects/kindLimits.ts`（一份，schema 與 handler 共用）。
   */
  | {
      /**
       * 【縮短特定技能冷卻】(#284)。行為與兩個決策點的完整理由見
       * `sim/effects/modifyCooldown.ts` 檔頭。
       * ⛔ 它**不是**全域 CDR —— 那條屬性早就存在，做成那個等於沒做。
       */
      kind: "modifyCooldown";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`who:"self"` 時它不參與解析。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /** 改誰的冷卻。省略 = `"self"`（owner 那三支技能全部是自己）。 */
      who?: "self" | "target";
      /** 只改這一格。與 `abilityId` 可以同時寫（= 兩個條件都要滿足）。 */
      slot?: CastableSlot;
      /**
       * 只改**這一支具名技能**所在的格子 —— 「[瞬步] 冷卻縮短 50%」講的是
       * 一支技能，它裝在哪一格是英雄的事。
       * ⛔ schema 擋掉 `slot` 與 `abilityId` **都不填**：那是「改全部六格」，
       * 而那正是這個 kind 存在要避免的東西。
       */
      abilityId?: AbilityId;
      /**
       * `reduce` = 按比例（配 `basis`）· `reduceFlat` = 按秒 · `reset` = 歸零。
       * 負的 `amount` 走同一條路，語意是**延長**。
       */
      mode: "reduce" | "reduceFlat" | "reset";
      /** `reduce` 是 0..1 的比例，`reduceFlat` 是秒。`reset` 忽略它。 */
      amount?: number;
      /**
       * `reduce` 的分母。省略 = `"remaining"`（剩餘量的百分比）。
       * `"base"` = 這一階**基礎冷卻**的百分比 —— 「這一招冷卻縮短 50%」
       * 在一次性效果裡唯一與「還剩多久」無關的寫法。
       */
      basis?: "remaining" | "base";
      /**
       * ⭐ S3 —— 這一發改的是**哪一種**冷卻。
       * · `"abilitySlot"`（省略 = 這個）—— `AbilityInstance.cooldownRemainingTicks`，
       *   也就是這個 kind 今天的全部行為（三份既有文件都走這條）。
       * · `"hookInternalCooldown"` —— 一條 hook 的**內部冷卻**
       *   （`ModifierSource.hookLastFired`）。
       *
       * ⭐ 它解鎖的是 60-002 絕光斬那一族：一支 **passive-only** 的技能永遠不會被
       * cast，所以它的 `cooldownRemainingTicks` **恆為 0**，`modifyCooldown` 今天
       * 在第一道 `if (inst.cooldownRemainingTicks <= 0) continue;` 就跳過它 ——
       * 「120 秒一次」與「反彈成功立即重置」於是二選一。
       *
       * ⛔ 為什麼不做 `MarkSpec.rechargeSec`：`sim/marks.ts` 檔頭⑤已經逐字拒絕過
       * 同型欄位（「那會是**第二個**冷卻概念，與 `HookDef.internalCooldown` 平行、
       * 語意重疊、兩個都填得下」），而且它只給得起「重置」，給不起「縮短 50%」。
       * ⛔ 為什麼不「自動偵測」（找不到技能冷卻就去改 hook）：那會讓一支寫錯
       * `abilityId` 的文件安靜地去重置某條 hook，而作者以為自己在縮短技能冷卻。
       */
      target?: "abilitySlot" | "hookInternalCooldown";
      /**
       * ⭐ S3 —— `target: "hookInternalCooldown"` 時指名**哪一條** hook
       *（比對 {@link HookDef.key}）。省略 = 那份來源上的**每一條** hook。
       * ⚠️ `target` 不是 `"hookInternalCooldown"` 卻填了它 = PARSE ERROR
       *（否則它是一格填得下、永遠不被讀的欄位）。
       */
      hookKey?: string;
      /**
       * ⭐ S3 —— 這一發碰得到**誰的** hook。
       *
       * 省略 = `"originSource"` = 只動這一發效果**自己所屬**的那一份
       * `ModifierSource`（由 `ctx.origin === "hook:" + src.id` 認出來）。
       * 60-002 要的正是它：兩條 hook 住在同一份被動來源上，「反彈成功」那一條去
       * 重置「120 秒一次」那一條。
       *
       * `"allSources"` = 這個身體上每一份叫得出同一個 `hookKey` 的來源
       *（`hookKey` 因此必填，載入時擋）。
       *
       * ⚠️ 預設選較窄的那一個：一份打錯 `hookKey` 的文件在 `originSource` 下什麼
       * 都不會發生，在 `allSources` 下會**安靜地**重置別件裝備的 proc。
       * ⚠️ `originSource` 而 `ctx.origin` 不是 hook origin（例如從主動技能直接放）
       * → 整條不做。那是誠實的：那一發沒有「自己那份來源」可言。
       */
      hookScope?: "originSource" | "allSources";
    }
  | {
      /**
       * 【加權分支】—— 一次 RNG 抽一個分支（89-002 俄羅斯輪盤）。
       * ⭐ **只 draw 一次**，理由（錄影決定性）見
       * `sim/effects/weightedBranch.ts` 檔頭；那不是欄位，是預算。
       */
      kind: "weightedBranch";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。中選分支在這組目標上執行。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /**
       * 分支表。權重是**相對**的（1/1/4 與 10/10/40 完全等價）。
       * `weight: 0` = 先關掉這個分支但不刪它；總和為 0 在**載入時**被擋。
       */
      branches: { weight: number; effects: EffectDef[] }[];
    }
  | {
      /**
       * 【交換資源】(44-002 交換筆記本)。cast resolve tick 原子交換，
       * 三個決策點都是欄位 —— 見 `sim/effects/swapResource.ts` 檔頭。
       */
      kind: "swapResource";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /** 決策點①：交換哪一項。省略 = `"health"`（owner 文案的「現存生命」）。 */
      resource?: "health" | "mana";
      /**
       * 決策點②：夾住的下限。省略 = **1**（§16.16 的建議：交換不殺人）。
       * 設 0 = 「交換到 0 就死」，由既有的 `deathSystem` 解算。
       */
      clampMin?: number;
      /**
       * 決策點③：目標失效（死了 / 不存在）時。
       * 省略 = `"abort"`（§16.16 的「全招失敗」）；`"skip"` = 跳過那一個。
       */
      onInvalidTarget?: "abort" | "skip";
    }
  | {
      /**
       * 【事件數值轉換】(15-002 太陰道 · 59-01 吞噬)。
       * ⚠️ `basis` 待 owner freeze（計畫 §16.12）—— 見
       * `sim/effects/eventValueConversion.ts` 檔頭。
       */
      kind: "eventValueConversion";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /**
       * 轉換誰。省略 = `"incomingDamage"`（`EffectContext.incoming`，
       * 缺席時**整條不執行**）。`"targetCurrentHealth"` = 目標當下的生命。
       */
      source?: "incomingDamage" | "targetCurrentHealth";
      /**
       * `source:"incomingDamage"` 讀哪一個讀數。省略 = `"mitigated"`。
       * ⚠️ **待 freeze**（計畫 §16.12），所以它是欄位不是寫死。
       */
      basis?: IncomingBasis;
      /** 轉換比例。1 = 等量。 */
      ratio: number;
      /** 轉成什麼。省略 = `"mana"`（太陰道的「轉化為自身魔力」）。 */
      to?: "mana" | "health";
      /** 誰收。省略 = `"self"`。 */
      who?: "self" | "target";
      /**
       * 「以及**短暫**加成至 AP」—— 一個限時的 flat 屬性來源。
       * `ratio` 省略時沿用外層的 `ratio`（兩件事同一個數值的兩種用途）。
       */
      buff?: { stat: Stat; durationSec: number; ratio?: number };
    }
  /**
   * ── Lane 2（2026-08-08）三個新 kind ────────────────────────────────────
   * 與 Lane 1 **同一個形狀**（`shape` + 決策欄位 + 一個 handler），界一樣住在
   * `sim/effects/kindLimits.ts`（一份，schema 與 handler 共用）。
   */
  | {
      /**
       * 【隨機落點排程】(13-04 龍星群 · 70-04 千年練成)。
       * ⭐ draw 預算 = `2 × count`，而且**只在施法那一刻花掉** —— 完整的
       * 決定性推導見 `sim/effects/randomArea.ts` 檔頭②。
       */
      kind: "randomArea";
      /**
       * ⛔ **沒有 `shape` / `radius` / `side` / `maxTargets`**（2026-08-10 拿掉）。
       *
       * 它們曾經在這裡，而 `sim/effects/randomArea.ts` **一格都不讀** —— 這個 kind
       * 解的是**落點**不是**受害者**：到期時它用 `targets: []` + `point: hit.pos`
       * 跑 `effects`，「打到誰」是巢狀的 `damageArea` 自己拿 `ctx.point` 當圓心解的。
       * 作用範圍由 {@link scatterRadius} + {@link who} 講清楚（E1 要的東西，只是不叫
       * `shape`）。⛔ 想要「施放那一刻凍住的名單」請用 `delayed`，那正是它存在的理由。
       *
       * 以誰為圓心。省略 = `"self"`（兩支都是「自身[周圍]」）。
       */
      who?: "self" | "target";
      /** 逐階發數。70-04 的 4/6/8 就是 `[4,6,8]`；13-04 是 `[10]`。 */
      count: number[];
      /** 兩發之間隔幾秒。13-04 = 0.2。執行期夾成**至少 1 tick**。 */
      intervalSec: number;
      /** 落點的散佈半徑（以圓心為中心）。 */
      scatterRadius: number;
      /**
       * 第一發落在施法 tick 上。省略 = **true**，理由與 `random-barrage`
       * 模板的 `tickOnApply` 逐字相同（原作是「先放一發，再 sleep」）。
       */
      firstAtCast?: boolean;
      /**
       * 施法者陣亡就整波停掉。省略 = **false**（流星已經在天上了）。
       * ⚠️ 分區決鬥結束（`settledZones`）**一律**停，那不是欄位 ——
       * 回合結束後還在落東西是玩家看得見的缺陷（#100/#216）。
       */
      stopOnCasterDeath?: boolean;
      /** 每一發落地時跑的東西（傷害／召喚／特效走同一條路）。 */
      effects: EffectDef[];
    }
  | {
      /**
       * 【魔力屏障】(44-00 機警「每點魔力可以抵免 3 點傷害」)。
       * ⛔ **不是**受傷後補護盾 —— 它在扣血之前把傷害換成扣魔，完整推導見
       * `sim/effects/manaBarrier.ts` 檔頭①②。
       */
      kind: "manaBarrier";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /** 給誰。省略 = `"self"`。 */
      who?: "self" | "target";
      /** 一點魔力抵幾點傷害。44-00 = 3。 */
      perMana: number;
      /**
       * 對哪些傷害型別生效。**必填、明列**（與 `BlockGrant.damageTypes` 同一個
       * 設計）：「可抵擋**全部**傷害」= 三種都寫進來，不是程式裡的一行 `if`。
       */
      damageTypes: DamageType[];
      /** 抵到剩多少魔力就停手。省略 = 0（抵到見底）。 */
      minManaReserve?: number;
      /**
       * 屏障持續幾秒。**省略 = 常駐**（沒有到期 tick）。
       * ⭐ 兩種情況的**強制停止都是魔力耗盡**（owner GH#307）——
       * 填了秒數也照樣看魔力，先到的那個停。推導見 `manaBarrier.ts` 檔頭⑤。
       */
      durationSec?: number;
    }
  | {
      /**
       * 【受傷延長增益】(52-01 狂戰士之怒)。
       * ⭐ **無狀態**：延長量是這一發傷害的連續比例，不是累積計數器 ——
       * 理由（以及「現有詞彙為什麼組不出來」的逐條結論）見
       * `sim/effects/extendBuff.ts` 檔頭①②。
       */
      kind: "extendBuff";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`who:"self"` 時它不參與解析。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /** 延長誰身上的。省略 = `"self"`。 */
      who?: "self" | "target";
      /** 要延長的那個 buff 的 `applyBuff.stackKey`。 */
      stackKey: string;
      /** 滿一份門檻延長幾秒。52-01 = 2。 */
      addSec: number;
      /** 門檻 = 自身最大生命的幾成。52-01 = 0.05。 */
      perDamagePctOfMaxHealth?: number;
      /** 門檻 = 固定點數（與上面二選一，上面優先）。 */
      perDamageFlat?: number;
      /**
       * 讀 `incoming` 的哪一個讀數。省略 = **`"hpLost"`**（「承受」對照的是血條，
       * 護盾吃掉的那一份不算）—— 與 `eventValueConversion` 的預設刻意不同，
       * 理由見那支檔頭④。
       */
      basis?: IncomingBasis;
      /**
       * ⭐ **必填**：延長後的剩餘時間上限（秒）。
       * 這條機制是正回饋，沒有它會變成永久，而症狀是「回合打不完」——
       * 一個不會讓任何東西變紅的故障。見 `extendBuff.ts` 檔頭③。
       */
      maxRemainingSec: number;
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
  | {
      kind: "heal";
      amount: Scaling;
      /** ⭐ G11 —— 治療落在誰身上。省略 = "target"。 */
      applyTo?: "self" | "target";
    }
  | {
      kind: "shield";
      amount: Scaling;
      duration: number;
      /** ⭐ S1（GH#299）—— 不疊加政策的身分。缺席 = 每次都是新的一片。 */
      stackKey?: string;
      /** ⭐ S1 —— 身上已經有同 key 那一片時怎麼辦。`stackKey` 有值而這格沒填 = replace。 */
      onExisting?: "replace" | "keepLarger" | "stack";
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
      /**
       * ⭐ G2 —— 逐階可以是陣列。⛔ 讀它一律走 `sim/perRank.ts::rankScalar`，
       * **不要**寫 `typeof d === "number" ? d : d[rank-1]` —— 那句話已經在這個
       * repo 裡被抄過五次（見那支檔頭）。
       */
      duration: RankScalar;
      /**
       * ⭐ 狀態的**層數**（owner 2026-08-09 / GH#301-5：「狀態除了有無也會是
       * 數字層數」）。
       *
       * 在它之前一筆 status 只有「有 / 沒有」。owner 的修正表第 8 條說層數累積
       * 會連動技能 ID 或狀態疊層，所以〔破甲 3 層〕與〔破甲 1 層〕必須是兩件
       * 不同的事，而條件葉子問得出差別。
       *
       * ABSENT = 1（＝今天的行為，「有這個狀態」）。⛔ 不是 0 —— 0 層等於沒有，
       * 而一份沒寫這一格的舊文件的意思是「有」。
       * 界共用 `sim/markLimits.ts` 的 `MARK_MAX_COUNT`（±999），因為那已經是這個
       * repo 對「一個計數器最多幾層」的答案；抄第二個數字就是第四個住處。
       *
       * ⭐ **負數 = 減層**（GH#304 軸①【隨觸發】／軸②【隨時間】）。整套三條軸
       * 的分工寫在 `sim/marks.ts` 檔頭⑤，這一格是其中兩條唯一需要的新詞彙。
       *
       * ⭐ 送到客戶端的路**已經選好了**（owner 2026-08-09 選①）：
       * `SeatState.counterIds[]` / `counterCounts[]` —— 一份泛型的
       * `(id, 層數)` 清單，標記層數與狀態層數合併成一套送
       *（`apps/game-server/src/net/snapshot.ts` 的 `namedCounters`）。
       * ⚠️ 上一版這裡寫著「未解決，三條路等裁決」，那句話從
       * `counterIds` 落地的那一刻起就是謊話（CLAUDE.md 第三守則）。
       */
      stacks?: number;
      /**
       * 重複施加時要不要把到期時間往後推。省略 = `"extend"` = 舊行為。
       * ⚠️ 減層（`stacks < 0`）一律當 `"keep"`。理由與整段語意見
       * `content/schema/effect.ts` 的同名欄位。
       */
      refresh?: "extend" | "keep";
      /**
       * Who receives it: each resolved target (default), or the CASTER. The
       * self form is how a combo WINDOW is opened — 者、皆、陣 is a
       * unit-targeted strike whose JASS also sets the caster-side marker
       * (j:34438), so without `applyTo` the marker would land on the victim.
       */
      applyTo?: "self" | "target";
      /** ⭐ G2 —— 逐階可以是陣列（`0` = 完全不能動，見 schema 的同名欄位）。 */
      moveSpeedMult?: RankScalar;
      root?: boolean;
      stun?: boolean;
      /**
       * 失手率 0..1 — WC3 `Acrs` 詛咒. THE CARRIER's own basic attacks miss this
       * often, at anybody. It is NOT evasion: evasion protects the body it is
       * on, this one sabotages it. See `components.ts::StatusEffect.missChance`
       * for why the direction matters and why it lives on the status.
       */
      /** ⭐ G2 —— 逐階可以是陣列。 */
      missChance?: RankScalar;
      /**
       * 暴走 —— 「不可控制並自動尋敵」(59-00 初號機 暴走). The carrier loses the
       * wheel: `orderSystem` drops that seat's orders and the body hunts on its
       * own. Model + decisions: `sim/berserk.ts`.
       */
      berserk?: boolean;
      /**
       * 恐懼 —— `berserk` 的鏡像：一樣沒收座位的指令，但身體**遠離**最近的敵人
       * 而且**不攻擊**。模型與三個決策點：`sim/fear.ts`。
       * ⚠️ 它**是** CC（免控擋得掉），也只管腳 —— 要連技能一起封請配 `silenced`。
       */
      feared?: boolean;
      /**
       * C4 睡眠（#278）—— **受傷即提早解除這一筆**。
       * ⛔ 只拔標了它的那幾筆；身上的其他 status 一格不動（`sim/statusBreak.ts`）。
       */
      /** 【沉默】C1（#278）—— 不能施放技能，但走得動、打得到。 */
      silenced?: boolean;
      /**
       * ⭐【繳械】S8（92-01）—— **打不出普通攻擊**。省略 = 打得出來（今天）。
       *
       * ⛔ 它**不是** `missChance` 的包裝（實測：`missChance:1` 的人照樣發
       * `attackWindup` / `basicAttack` 事件、燒攻擊冷卻、破隱，只是傷害 0）。
       * ⛔ 它**不擋技能** —— 要連技能一起封請配 `silenced`。
       * ⚠️ 它**算硬控**（`HARD_CC_FLAGS` + `applyStatus` 的 `isCc`），完整推導見
       * `sim/components.ts` 的同名欄位。
       */
      disarmed?: boolean;
      /** 【混亂】C2（#278）—— 配 `berserk: true` 用：失控之後**不分敵我**。 */
      targetsAllies?: boolean;
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
      /**
       * A4（#278 / GH#295）—— 這一筆狀態可不可以被【淨化】拔掉。
       * 省略 = `world.dispelRules.statusDefaultDispellable`（出貨 true）。
       * 回合重置與復活不看它（`clearForFreshBody` 傳 `requireDispellable: false`）。
       */
      dispellable?: boolean;
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
      /**
       * 這份增益掛多久（秒）。⭐ S4a 之後它是**選填**，與 {@link permanent}
       * **互斥且必填其一**（schema 的 `refineApplyBuff` 兩個方向都關死）。
       * ⛔ 「省略 duration」本身**不等於**永久 —— 那會讓一個打字漏填變成一份靜默
       * 的永久增益，而那正是這個 repo 反覆踩到的那一類。
       */
      duration?: number;
      /**
       * ⭐ S4a —— **永久**（80-00「每次擊殺 +1 層、永久」/ 92-03）。
       *
       * 引擎層從第一天就做得到：`ModifierSource.expiresAtTick` 缺席 = 永久
       *（`buffExpirySystem` 的 `s.expiresAtTick !== undefined &&` 那一半就是它活
       * 下來的原因）。缺的一直是 **authoring 面** —— 於是出貨已經有四份文件用
       * `duration: 99999` 假裝永久。
       *
       * 語意是**整場**（回合重置不清 buff 來源）。⛔ 不做 `permanentScope:
       * "match" | "round"`：今天唯一能掛「回合清掉」的鉤子是 `clearForFreshBody`，
       * 而它**復活時也會跑**，所以 `"round"` 實際的意思會是「直到你死一次」——
       * 一個值不等於它名字的旋鈕（`extendBuff` 檔頭②同一條理由）。
       */
      permanent?: boolean;
      /**
       * ⭐ G10 —— 這份來源**同時是一個具名標記**（52-01 狂怒 / 破甲 / 破魔）。
       *
       * 缺席 = 不是任何標記 = 今天。⭐ 它把「標記」與「數值」變成**同一個物件**，
       * 所以兩本帳不可能再腐爛：`extendBuff` 改的就是那一份來源的 `expiresAtTick`
       *（實測缺陷：buff 361→573 而 status 停在 361，於是 52-02 的閘在玩家還在狂怒
       * 中時就關了）；淨化／回合重置／到期同理。
       *
       * ⚠️ 讀取端是 `effectCommon.ts` 的 `hasStatus` / `statusStacks`（已經是
       * `world.status` + `world.marks` 的統一讀取器，這是第三本帳）。
       * ⚠️ `stackKey` 路徑的 `stacks` 直接就是 `condition.status.minStacks` 讀得到
       * 的層數（「他身上疊了 3 層破甲嗎」）。
       */
      statusId?: StatusId;
      /**
       * ⭐ S9b —— 這一份增益落在誰身上：`"target"`（省略 = 這個，`ctx.targets`）
       * 或 `"self"`（施法者自己）。
       *
       * 它解鎖的是「**一條** hook 讀敵人狀態、增益自己」：拆成兩條 hook 不是一次
       * 判定 —— ICD 記在 `src.hookLastFired[hi]`（**逐 hook** 一格）、機率也是逐
       * hook 各抽一次，所以「30% 機率對帶恐懼的敵人追加傷害**並且**自己加攻速」
       * 寫成兩條 hook 會有 9% 的情況只發生一半，而畫面上看不出來。
       *
       * ⛔ 與其他九個 kind 用**同一格**語意（`applyStatus` / `restore` /
       * `spendMana` / `leap` / `cycleBuff` / `blink` / `evasion` / `invulnerable`
       * / `knockback`），`applyBuff` 是漏掉的那一個。
       */
      applyTo?: "self" | "target";
      /**
       * ⭐ G5（state.exclusive-group@1）—— 這份增益屬於哪一個**互斥組**。
       *
       * 缺席 = 不互斥 = 今天（實測：三個不同 origin 的形態 buff 同時掛著，攻速
       * 乘區逐位元等於 1.4³）。⚠️ `stackKey` **不是**這題的答案：實測同 key 的
       * 第二發會把 modifiers **整組丟掉**，只把 `stacks` 加一。
       *
       * 15-02/03/04 那種「身上永遠只有一種戰型」寫的就是這個。
       * ⛔ 它只做 gameplay 狀態互斥；3D 身體那一半仍然是 `championForm` 的地盤。
       */
      exclusiveGroup?: string;
      /**
       * ⭐ G5 —— 同組已經有一份時怎麼辦。省略 = `"replace"`（新的接手、舊的整份
       * 拔掉 —— 抄 `addShield.onExisting` 的預設，也是 owner「[變身]為唯一狀態
       * 不可疊加」讀起來的意思）；`"reject"` = 新的不生效、舊的原地不動。
       * ⛔ 沒有 `keepLonger`：形態不是一個量，「比較久的那個形態贏」對玩家無法解釋。
       * ⚠️ 沒有 `exclusiveGroup` 卻填了它 = PARSE ERROR（同 `shield.onExisting`
       * 需要 `stackKey`）。
       */
      exclusiveOnExisting?: "replace" | "reject";
      /**
       * ⭐ S4b —— 這條加成加到某個**絕對值**就停（80-00「上限到 10」）。
       *
       * 缺席 = 沒有絕對上限 = 今天（實測：同 stackKey 疊 21 次 +1 攻擊距離，
       * 11 → 32，沒有任何東西攔它）。授權契約（為什麼 `maxStacks` /
       * `ModOp.CapRaise` / `grantAttribute.maxAttribute` / `STAT_CLAMPS` 四個都
       * 不是答案）住在 `content/schema/effect.ts` 的 `applyBuff.maxStat`，
       * ⛔ 不在這裡重複一份（兩份會分岔）。
       *
       * · `basis` 省略 = `"final"` = 讀 `StatsComp.final[stat]`（玩家面板上那個數字）。
       * · `"thisSource"` = 只算這一份 `stackKey` 來源自己貢獻的量（需要 `stackKey`，
       *   載入時擋）。
       *
       * ⚠️ 語意是**只 refuse、不回收也不夾取**（同 `grantAttribute.maxAttribute`），
       * 所以最後一層可能小幅越線 —— 那是那條先例已經接受的行為。
       */
      maxStat?: { stat: Stat; value: number; basis?: "final" | "thisSource" };
      perRank?: { modifiers: StatModifier[]; duration?: number }[];
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
      /**
       * A4（#278 / GH#295）—— 這一份增益可不可以被【淨化】拔掉。
       * 省略 = `world.dispelRules.buffDefaultDispellable`（出貨 **false**），
       * 所以出貨設定下只有明確填 true 的來源拔得走。寫進 `ModifierSource`。
       */
      dispellable?: boolean;
      /**
       * A4（#278 / GH#295）—— 增益還是減益。⛔ 施加時寫下，不推導（一個來源可以
       * 同時帶正負修飾詞）。省略 = 無極性 = **有方向的淨化拔不到它**。
       */
      polarity?: "buff" | "debuff";
      /**
       * ⭐ 限時授予**格擋 / 暴擊來源**（owner GH#299 第 2 · 6 條）。
       *
       * 這兩格是「主動技能」與「限時」兩個授權格的**同一個**答案：一支 Q 想給
       * 「接下來 5 秒內 30% 機率格擋」或「這段期間 20% 機率 3 倍暴擊」，寫的是
       * 一份 `applyBuff`，⛔ 不是一個新的 effect kind —— 新 kind 會變成第二套
       * 格擋 / 第二套暴擊，而 `blockCutFor` / `rankedGrants` 只認得
       * `StatsComp.sources` 上的這兩格。
       *
       * 到期由這份 buff 自己的 `expiresAtTick` 管（兩個讀取端都已經在跳過過期的
       * source），所以**沒有第二個時鐘**。`blockLastFired` 住在 source 實例上，
       * 而每次施放都是一份新的 source，所以掛在這裡的 `internalCooldown` 讀作
       * 「這一次施放最多擋幾次」—— 與 `hooks` 那一格逐字相同的語意。
       *
       * ⚠️ 疊層路徑（`stackKey`）也帶，理由與 `hooks` / `dispellable` 完全相同：
       * 一支技能一旦也填了 `stackKey`，這兩格就會靜默失效（失敗形態 ②）。
       */
      block?: import("../combat/block").BlockGrant;
      critStrike?: import("../combat/critStrike").CritStrikeGrant;
      /**
       * ⭐ 2026-08-09 (G7) —— 第三、第四格授予，語意與上面兩格逐字相同（同一份
       * `SourceGrantFields`、同一個 `sourceGrants()` 轉發、同一個 `expiresAtTick`
       * 當時鐘）。它們解鎖的是「這支大招期間力量 +30」與「接下來 5 秒你的普攻
       * 是真傷」—— 兩件在此之前**只有道具**寫得出來的事。
       *
       * ⛔ 這裡不能直接 `& SourceGrantFields`：`EffectDef` 是一個
       * `discriminatedUnion` 的鏡子，成員必須是純物件型別。加一格授予時這四行
       * 要跟 `SourceGrantFields` 一起改 —— 而 `content/compat.test.ts` 的
       * 型別鏡射斷言就是那道會紅的閘。
       */
      attributes?: import("../stats/attributes").AttrGrant;
      damageTypeOverride?: import("../combat/damageTypeOverride").DamageTypeOverride;
      /**
       * ⭐ 2026-08-09 (S11) —— 第五格授予：**限時飛行**。
       *
       * ⚠️ **這一行在 2026-08-10 之前漏了**，而上面那段註解逐字寫著「加一格授予時
       * 這四行要跟 `SourceGrantFields` 一起改」—— 也就是那份鏡像自己記錄了它會
       * 漂，然後它真的漂了：Zod 的 `SOURCE_GRANT_SHAPE` 有 `flight`、
       * `sourceGrants()` 有 `flight`、`fieldAdoption` 有
       * `field:abilities.effects[]#applyBuff.flight` 的豁免，只有這個型別鏡子沒有。
       * 後果是 `packages/shared/src/sim/effects/authGatesWave1.test.ts` 那條「限時
       * 飛行」的守衛**根本編譯不過**（`pnpm typecheck` 在 main 上就是紅的）。
       */
      flight?: import("../stats/sourceGrants").SourceGrantFields["flight"];
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
  | {
      kind: "restore";
      /** ⭐ G2 —— 逐階可以是陣列。讀取一律走 `sim/perRank.ts::rankScalar`。 */
      healthPct?: RankScalar;
      manaPct?: RankScalar;
      /** ⭐ G11 —— 回自己。省略 = "target"。 */
      applyTo?: "self" | "target";
    }
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
  | {
      kind: "dash";
      mode: "forward" | "toPoint";
      speed: number;
      maxDistance: number;
      /**
       * ⭐ S7 —— **衝刺結束的那一刻**才跑的那一段（52-04「向前衝刺 400 距離後
       * 揮出」）。缺席 = 沒有回呼 = 今天的行為，一個 tick 都不差。
       *
       * ── 為什麼它必須存在（實測，三臂同 seed）─────────────────────────────
       *   · `dash` 單獨（對照組）                → 位移 +4.40u，受害者掉 43.47
       *   · `[dash, damageArea]` 同一個 effects[] → 位移 +4.40u，受害者掉 43.47
       *     ← **逐字相同：那一刀從起點揮出，完全落空**
       *   · 同一個 AoE 從衝刺**終點**放           → 受害者掉 199.83
       * 原因是順序：effect 在 slot 2b/3 跑完，位移在 slot 5 才發生，所以同一個
       * `effects[]` 裡的 AoE 必然用衝刺**前**的座標。
       *
       * ⭐ 為什麼是擴充 `dash` 而不是開一個新 kind `dash-on-end`：
       *   (a) 新 kind 依 E1 硬約束要帶一整組 `shape`/`radius`/`side`/`maxTargets`，
       *       而那對「自己位移」沒有語意 —— 會生出一組永遠是 `"single"` 的死欄位；
       *   (b) 會出現兩個「dash」概念（第零守則⑨的反面）；
       *   (c)「衝刺結束了」這個真相**只存在於** `MovementSystem` 的 override 迴圈
       *       裡，callback 只能掛在 override 上 —— 開新 kind 也還是要改同一行。
       * 這個選擇同時讓它**不需要新的 step slot**：`MovementSystem` 是 slot 5、
       * `combatResolveSystem` 是 slot 8，所以 `onEnd` 排出來的傷害仍然在**同一
       * tick** 被減傷、計分、結算。
       *
       * ⚠️ 它與 `delayed` **方向相反**（兩邊的檔頭都要寫）：`delayed` 凍住的是
       * **目標名單**（位置無關）；這一格凍不住任何東西，要的正是**結束那一刻的
       * 位置**（名單無關）。混用會安靜地做錯。
       */
      onEnd?: EffectDef[];
      /**
       * ⭐ S7 —— 被牆擋下來的衝刺**算不算「衝完」**。
       * 省略 = `"always"`（照樣揮出）；`"completed"` = 只有真的跑完距離才揮。
       * ⚠️ 這是一個真的岔路：`MovementSystem` 今天把「撞牆停下」與「跑完距離」
       * 合成**同一個**結束條件。預設選 `"always"`，因為卡面說「衝刺後揮出」，
       * 而一刀被場景取消是玩家看不見的失敗。
       */
      onEndOn?: "always" | "completed";
      /**
       * ⭐ S7 —— 衝刺途中死掉還要不要揮。省略 = `false`。
       * 形狀與精神逐字沿用 `randomArea.stopOnCasterDeath`。
       */
      onEndWhenDead?: boolean;
    }
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
   * ⭐ blink — **真瞬移**（owner 2026-08-09 / GH#301-2）。
   *
   * ── 它為什麼不是 `leap` 的一個選項 ────────────────────────────────────────
   * 今天所有「瞬移」的技能都被展開成 `leap` 配一個極短的 `travelSec`，而
   * `MIN_LEAP_TICKS = 2`（`sim/movement/leap.ts`）把飛行時間**壓在地板上** ——
   * 身體真的存在於中間的每一個位置，0.067 秒。規範因此寫「不是瞬間傳送，是極短
   * 平移，過程看得見」，owner 的裁決是：**「是真的瞬移，不是平移」**。
   *
   * ⛔ 差別不是美術上的。中途位置存在 = 可以被打到、可以被範圍技掃到、
   * 會被地形擋（`leap` 的落點阻擋規則）。瞬移的定義就是那兩格不存在。
   * 把它做成 `leap` 的一個布林值會讓「有沒有中間位置」變成 `leap` 積分器內部
   * 的一個 if，而那正是第〇·五守則說的越線。
   *
   * ── `templates/expand.ts` 那句「deliberately was not added」已經被推翻 ─────
   * 那句話當時的理由是「effect union / Zod / registry 三個檔正被別的 lane 同時
   * 編輯」，並明說「Named in the report as the owner's call」。owner 2026-08-09
   * 做了那個 call。⛔ 註解已同步改掉 —— 一句不再成立的辯護留著就是第三守則講
   * 的那種謊。
   *
   * ── 欄位 ─────────────────────────────────────────────────────────────────
   * `shape` 是 E1 硬約束（A4b 之後每一個新 kind 都要講得清楚作用範圍，守衛
   * `content/schema/newKindShape.test.ts` 從出貨註冊表推導，不是抄名字）。
   * 它回答的是「**誰**被瞬移」：`single` = 一個身體（施法者，或這一次的目標）；
   * `circle` = 半徑內的一群（集結隊友那一族：A0EY 英雄之笛 / A0YA 和諧世界 /
   * A10U 84-002），沿用 Lane 1/2 那一組 `radius` / `side` / `maxTargets` 欄位
   * 與**同一份** `refineDispelShape` 檢查。
   */
  | {
      kind: "blink";
      /** ⭐ E1 硬約束：誰被瞬移 —— 一個身體，還是半徑內的一群。 */
      shape: "single" | "circle";
      /** `shape:"circle"` 的半徑，GGD 單位。單體時寫它會被 schema 擋下。 */
      radius?: number;
      /** `shape:"circle"` 收誰（集結隊友 = `"allies"`）。 */
      side?: "allies" | "enemies";
      /** `shape:"circle"` 最多帶幾個。 */
      maxTargets?: number;
      /**
       * 目的地。三個值對應 JASS 那 11 個成員真正做的三件事：
       *   · `"targetUnit"` 貼上目標（7 支，最大宗：17-03 空破圓斬、08-02
       *     萊丁快速劍、13-03 快步、34- 冥道殘月破、阿福 EX、76-01 橡膠戰斧、
       *     27-04 飛燕閃）
       *   · `"point"`      指向點（82-02 虛空瞬動，讀 `GetOrderPointLoc`）
       *   · `"caster"`     集結到施法者身邊（3 支，配 `applyTo:"target"`）
       */
      to: "point" | "targetUnit" | "caster";
      /** 誰移動：施法者（預設），或每一個解算出來的目標（集結／拉人）。 */
      applyTo?: "self" | "target";
      /**
       * 落在目的地**前面**多少單位。27-04 飛燕閃在 JASS 裡落在目標前 150 wc3
       * 單位（j:41669），而 `leap` 沒有這一格，所以那一支今天是**貼在對方身上**
       * 落地。ABSENT = 0 = 正好落在目的地。
       */
      stopShortUnits?: number;
      /**
       * 抵達之後**立刻**執行的效果，同一個 tick。
       *
       * ⚠️ 為什麼需要它、而不是把傷害寫在 `effects[]` 的下一格：這一族每一個
       * 會傷害的成員都是**先位移再打**（27-04 在 j:41669 瞬移，j:41671 才
       * `UnitDamageTargetBJ`）。寫在同一層的下一格會在**起跳點**解算，那正是
       * `leap.onLand` 存在的理由。
       *
       * ⛔ 這裡**沒有** `arriveRadius`（`leap.landRadius` 的對應物），是刻意的：
       * 落點的圓由 `damageArea` 自己的半徑表達，多一格半徑等於同一件事有兩個
       * 住處，而它們會分岔。
       */
      onArrive?: EffectDef[];
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
  | {
      kind: "championForm";
      to: "alternate" | "base" | "toggle";
      /** ⭐ G2 —— 逐階可以是陣列（rank 4 的變身活得比 rank 1 久）。 */
      durationSec?: RankScalar;
    }
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
      /** ⭐ G11（GH#299）—— 燒在誰身上。省略 = `"target"`。 */
      applyTo?: "self" | "target";
      /**
       * Armour (physical) / MR (magic) / neither (true). Payouts go through the
       * damage QUEUE, so this is the same knob and the same mitigation curve as
       * the `damage` kind — a 「中毒」 that ignored armour would be `"true"` on
       * purpose, not by accident.
       */
      /**
       * 傷害型別。**省略 = `world.damageRules.defaultAbilityDamageType`**
       *（出貨 `magic` —— owner 2026-08-05「技能傷害預設都改成 AP 傷害」）。
       *
       * ⚠️ 這一格與**係數來源**（`amount` 的 `Scaling` 讀 ap/ad/str/agi/int）
       * 是兩件事：型別決定吃護甲還是魔抗，係數決定數字多大。
       */
      damageType?: DamageType;
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
      /**
       * ⭐ 45-01 —— `resourcePct` 什麼時候解算。省略 = `"onApply"` = 在施加的
       * 那一刻算一次並凍進 `DotInstance.amountPerTick`（今天每一支的行為）。
       * `"onTick"` = **每一次付款**才用當下的條重算（「每秒受到**當下**現存生命 1%」）。
       * 完整語意與預設值的辯護在 `content/schema/effect.ts` 的同名欄位。
       */
      resourcePctPhase?: "onApply" | "onTick";
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
      /**
       * A4（#278 / GH#295）—— 這一筆延燒可不可以被【淨化】拔掉。
       * 省略 = `world.dispelRules.dotDefaultDispellable`（出貨 true）。
       */
      dispellable?: boolean;
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
       * 平衡決定,所以它是欄位而不是程式裡的分支。
       * ✅ GH#287 起**它真的管得到火圈**:三條燒傷路徑都經過
       * `combat/environmentalBurn.ts`,那裡問的是同一個 `refusesDamage(…, "true")`。
       * (這一段以前寫著「今天它還管不到火圈」—— 那是真的,而且真了一年。)
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
       * ⭐ 擊飛的**落點**（owner 2026-08-09 / GH#301-1）。
       *
       * 規範原本寫「落點與飛行時間由系統推算，作者指定不了」。owner 推翻了它，
       * 但同時把它**簡化成四檔**：
       *
       *   · `"short"`   一小段
       *   · `"default"` 預設 —— 也就是今天的行為（由 `distance` / `impactPower`
       *                 / gap 減法推算出來的那個長度）
       *   · `"long"`    一大段
       *   · `"toEdge"`  到底部 —— 推到**決鬥區邊緣**（不是地圖邊緣）
       *
       * ⛔ **不是自由數字，而且這是 owner 明講的簡化**：「應該要可以[指定落點]，
       * 但簡化成 一小段 / 預設 / 一大段 / 到底部 四種」。一格自由距離會讓每一張
       * 卡都要重新決定一次「多遠算遠」，四檔讓它變成一格下拉選單。
       *
       * ABSENT = 今天的行為（等同 `"default"`）—— 所有既有內容一格不變。
       *
       * ⛔⛔ **四檔的實際距離不可以是這支引擎裡的常數**（CLAUDE.md 第一守則）。
       * 它們是 owner 每週會改的那種數字，所以必須住在
       * `config.combat-feel@1` 的 `knockback` 群組底下（那裡已經有 `minPct` /
       * `maxBodies` / `bodyUnit` 三個同族旋鈕），三個住處 + admin 欄位一起補。
       * 實作 #301-1 的那一路：如果你在 `effects/knockback.ts` 裡寫下
       * `const SHORT = 4`，那就是越線了。
       * ⚠️ 契約層（2026-08-09）**沒有**動 `schema/config.ts`：加一格 config 欄位
       * 要連 `content/config/combat-feel.json` 與 admin 表單一起動，而那超出
       * 「只改型別與 schema」的範圍。這是一筆**明確交接**的債，不是漏掉的。
       */
      launchDistance?: "short" | "default" | "long" | "toEdge";
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
    }
  /**
   * ── Lane 3（2026-08-10）兩個新 kind ──────────────────────────────────────
   */
  | {
      /**
       * ⭐ G12【延遲序列】—— 一段**排在未來 tick** 的效果，而且
       * **目標在施放那一刻就凍住**（20-002「連續七次斬擊…最後再給予…」/
       * 52-002「對目標連續 100 下的斬擊」）。
       *
       * ⭐ 它與 {@link randomArea} 的差別只有一句話，而那句話就是它存在的理由：
       *   · `randomArea` 到期時用**圓心重解**（實測：目標走開就打空）；
       *   · `delayed`   到期時用**施放時凍住的那一份名單**。
       * 今天寫「連續七次斬擊」只能寫成同一 tick 七發 damage —— 畫面上那不是連擊。
       *
       * ⚠️ 它與 `dash.onEnd` **方向相反**：這裡凍住的是**名單**（位置無關），
       * 那裡要的是**結束那一刻的位置**（名單無關）。兩個長得像，混用會安靜地做錯。
       *
       * ⭐ 決定性：這個 kind **完全不碰 rng**（沒有落點要抽），所以它連
       * `randomArea` 的 draw 預算問題都沒有。到期一律用**絕對 tick**。
       */
      kind: "delayed";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`"circle"` = 施放那一刻把圓內的人凍成名單。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /** 第一發等多久（秒）。上界 `DELAYED_MAX_DELAY_SEC`。 */
      delaySec: number;
      /** 總共幾發。省略 = 1（＝退化成純延遲）。上界 `DELAYED_MAX_COUNT`。 */
      count?: number;
      /** 兩發之間隔幾秒（`count > 1` 才有意義）。執行期夾成**至少 1 tick**。 */
      intervalSec?: number;
      /** 每一發跑的東西。 */
      effects: EffectDef[];
      /**
       * **最後一發**額外跑的東西（20-002 的「最後再給予…1800 傷害」/
       * 「最後一擊附加擊退＋恐懼」）。
       * 省略 = 最後一發與其餘完全相同（⛔ **不是**「最後一發不跑」）。
       */
      finalEffects?: EffectDef[];
      /**
       * 目標怎麼決定。省略 = `"frozen"`（施放時凍住 —— 這個機制存在的全部理由）。
       * `"reresolve"` = 到期才重解，也就是 `randomArea` 的語意 —— 對「原地爆的
       * 連擊」那是**正確**的，所以留成一格下拉而不是刪掉。
       */
      targetMode?: "frozen" | "reresolve";
      /** 凍住的目標死了就跳過他。省略 = `true`（不繼續鞭屍）。 */
      dropDeadTargets?: boolean;
      /**
       * 施法者陣亡就整波停掉。省略 = `false`，逐字沿用 `randomArea` 的同名欄位。
       * ⚠️ 分區決鬥結束一律停，那不是欄位。
       */
      stopOnCasterDeath?: boolean;
    }
  | {
      /**
       * ⭐ S5【代放】—— 一支技能**施放另一支技能**（80-04 赤兔咆哮「攻擊時有
       * 20% 使出弒鬼神」）。
       *
       * 今天這一族只能靠**手抄一份 payload**：80-04 帶著 `spawnProjectile` +
       * damage `[10,20,30]`，而 80-02 弒鬼神本人是同一個 projectileId + damage
       * `[150,250,350,0,0]` —— 同一支技能的兩份 payload，數字**已經不一樣了**。
       *
       * ⚠️ `content/templates/expand.ts` 的 `"proxy-cast"` 是一個**模板家族名**，
       * 不是這個 kind（它自己的檔頭寫著「這裡不召喚任何東西」，展開結果只有
       * `damage` + 選配 `applyStatus`）。對外契約要把這件事講清楚，否則同一個字
       * 會撒第三次謊。
       *
       * ⛔ **終止性是這個 kind 的正確性義務，不是選配**：
       * `EffectContext.proxyDepth` 嚴格遞增，閘門是 `proxyDepth > maxDepth →
       * return`，上界由 Zod 夾在 `PROXY_MAX_CHAIN_DEPTH`。上界 + 嚴格遞增 ⇒
       * 鏈長有限 ⇒ 一定終止。這個證明的形狀與 `effects/damage.ts` 的
       * `reflectDepth` 逐字相同 —— ⛔ 不要發明第二套。
       */
      kind: "proxyCast";
      /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
      shape: "single" | "circle";
      radius?: number;
      side?: "allies" | "enemies";
      maxTargets?: number;
      /** 代放**我自己的哪一格**。與 {@link abilityId} **恰好填一個**（schema 擋）。 */
      slot?: CastableSlot;
      /** 代放**哪一支具名技能**（軟參照）。與 {@link slot} 恰好填一個。 */
      abilityId?: AbilityId;
      /**
       * 代放要不要付代價。省略 = `"none"`（不扣魔、不轉冷卻）。
       *
       * ⚠️ 預設的理由是可檢查的：80-04 的「攻擊時有 20% 使出弒鬼神」是每次普攻都
       * 可能觸發的 proc；若它燒掉 80-02 那 35 秒的冷卻，這支大絕就會**自己刪掉
       * 自己的 W**，而畫面上只看得到「W 一直是灰的」。三個值全做，讓 owner 改一格
       * 下拉就能翻案。
       *
       * ⚠️ `"mana"` / `"manaAndCooldown"` 走的是 `castAbility` **同一排閘**
       *（魔力／沉默／暈眩／擊倒／暴走）—— ⛔ 不可以在 handler 裡自己再寫一次
       * 那些 if，那是兩份會分岔的判斷。副作用要說在明處：`castAbility` 有一道
       * 「已在吟唱中就拒絕」，所以代放一支有 `castTimeSec` 的技能會在施法者正在
       * 吟唱時被拒 —— 那是**正確**的（一個人不能同時吟唱兩招）。
       */
      payCosts?: "none" | "mana" | "manaAndCooldown";
      /** 代放要不要看那一格真按鈕的冷卻。省略 = `false`。⛔ 與 {@link payCosts} 是兩個問題。 */
      respectCooldown?: boolean;
      /** rank 0（沒點那一招）時什麼都不發生。省略 = `true`。 */
      requireLearned?: boolean;
      /** 用哪一階施放。省略 = `"casterRank"`（玩家的投資）。 */
      rankMode?: "casterRank" | "fixed";
      /** `rankMode: "fixed"` 的那一階。 */
      fixedRank?: number;
      /** 目標從哪來。省略 = `"inherit"`（沿用觸發事件的 targets/point/direction）。 */
      targetMode?: "inherit" | "reresolve";
      /**
       * 代放鏈最多再往下幾層。省略 = **0**（A 代放 B，B 自己的 `proxyCast` 直接
       * 被擋）—— 逐字沿用 `damage.incomingPct.maxChainDepth` 的預設與理由。
       * 上界 `PROXY_MAX_CHAIN_DEPTH`。
       */
      maxDepth?: number;
      /**
       * ⭐ 第一守則（2026-08-10）—— `payCosts:"none"` 要不要發 `onAbilityCast` /
       * `onAbilityHit`。省略 = **false** = 今天的行為（那條路直接 `runEffects`，
       * 繞過 `castAbility`，所以兩個事件從來不發）。
       *
       * ⛔ 在這一格出現之前，「不發」是一個**沒有欄位的選擇** —— 而
       * 「代放算不算一次施法」是設計偏好不是引擎事實：80-04 那種每次普攻都可能
       * 觸發的 proc 不該再觸發一輪「施法時」被動，但「大絕結束後自動再放一次 Q」
       * 會希望它算數。
       *
       * ⚠️ 打開它之後遞迴由既有的深度計數擋（{@link maxDepth} +
       * `proxyStackDepth`），⛔ 不是靠這一格關著。`"mana"` / `"manaAndCooldown"`
       * 走 `castAbility`，兩個事件本來就會發，所以這一格對它們沒有作用。
       */
      emitCastEvents?: boolean;
    };

/**
 * ⭐ 每一個 effect kind **共有**的欄位。今天只有一格 —— `condition`。
 *
 * 寫成一份交集而不是往 34 個聯集成員各貼一行,是第零守則⑨:34 個同型項目 =
 * 1 個模板 + 一張表。⛔ 下一個共有欄位也走這裡,不要開始複製貼上。
 */
export interface EffectCommon {
  /**
   * ⭐ 「這一段效果要不要發生」的閘 —— owner 2026-08-09 裁決（GH#300）。
   *
   * ── 為什麼會有這一格 ────────────────────────────────────────────────────
   * 在它之前,`condition` **只是 `HookDef` 的一個欄位**,全 repo 只有一個
   * `evaluateCondition` 呼叫點。於是「若目標身上有〔恐懼〕則追加傷害」只寫得成
   * 一條 hook,掛在主動技的 `effects[]` 上**寫不出來** —— 而 owner 說這一族的
   * 使用率超高。
   *
   * ⛔ 它與 hook 上的那一格是**同一個型別、同一個求值器、同一組葉子**
   * ({@link EffectCondition} / `evaluateCondition` / `zEffectCondition`)。
   * 做第二套條件系統是這一批最容易犯、也最貴的錯:兩份葉子清單保證分岔,
   * 而編輯器只看得到其中一份。
   *
   * ── 語意（DECIDED，lane A 照這個實作）─────────────────────────────────
   *
   * **① 缺席 = 無條件執行。** 今天所有已上架內容的行為一格不變。
   *
   * **② `self` 永遠是 `ctx.caster`。** 與 hook 上的 `subject:"self"` 同義。
   *
   * **③ `target` 是【逐一判斷】,不是整段全有全無。**
   *   對 `ctx.targets` 的每一個身體各求值一次(`{self: caster, target: t}`),
   *   通過的那些組成新的目標清單交給 handler。
   *
   *   ⭐ 為什麼選逐一:owner 點名的寫法(「對身上有恐懼的敵人追加傷害」)本身
   *   就是逐一的。整段閘會在**每一支 AoE** 上安靜地算錯 —— 而且是失敗形態 ④:
   *   單體技的行為兩種語意完全相同(N=1),所以壞掉的那一種在測試與手感上
   *   都跟正確的一模一樣,只有 AoE 的玩家會覺得「有時候不生效」。
   *   成本說清楚:`chance` 葉子變成**每個目標各擲一次**,一發打 8 個人的 AoE
   *   會消耗 8 × `conditionChanceCount(cond)` 次 rng。這是刻意的(「每個人各有
   *   50% 機率被燒」才是那張卡的意思),但它是一筆真的預算。
   *
   * **④ `ctx.targets` 是空的時候,退化成整段閘。**
   *   自我增益 / 落點特效 / 發金幣這種本來就沒有目標的效果,若照③過濾會變成
   *   永遠不執行。所以空清單時求值**一次**,`target` 傳 `undefined` ——
   *   也就是 hook 今天在「沒有 target 的事件」上的行為,`subjectOf` 回
   *   `undefined`、葉子回 `false`。因此在一段沒有目標的效果上寫
   *   `subject:"target"` 的條件 = 這段效果不執行,而那是誠實的答案
   *  （「你問了一個不存在的人身上有沒有恐懼」）。
   *
   * **⑤ 一個都沒通過 → handler **完全不被呼叫**。**
   *   ⭐ 這條是 owner 要求的「『沒通過條件』與『執行了但沒打到人』要分得開」。
   *   兩者在今天的引擎裡都會長成「血條沒變」,所以差別必須做在**呼叫與否**上,
   *   不是做在傳一個空陣列進去 —— 有些 handler(`damageArea` / `randomArea`)
   *   拿到空陣列還是會自己去解算圓圈,那就會變成「條件沒通過但效果照發」。
   *
   * ── 已知的邊界（named gap，不是漏掉）────────────────────────────────────
   * 過濾只作用在 `ctx.targets`,也就是**執行器交給 handler 的那一份清單**。
   * 自己在內部重新解算身體的 kind(`damageArea` / `damageLine` / `randomArea`)
   * 不會被逐一過濾;對它們,③ 的結果只決定「這段效果整段跑不跑」。
   * ⭐ 要讓圓圈／膠囊**內部**也逐一過濾，用 `damageArea.victimCondition` /
   * `damageLine.victimCondition`（G1，同一個型別、同一個求值器）——
   * ⛔ 不要用這一格假裝有做。
   *
   * ⚠️ **這一段在 2026-08-10 之前把 `leap.onLand 的落地圈` 也列在這裡，而那是
   * 假的**（第三守則，實測推翻）：`systems/LeapSystem.ts::detonate` 把
   * `enemiesInCircle(...)` 直接餵成 `ctx.targets`，所以 `onLand` 走的正是 ③ 那條
   * **逐一過濾**的路。實測：帶 `condition:{status,target,fear}` 時只有帶恐懼的
   * 身體挨打，乾淨的那個沒有；拿掉 condition 兩個都挨打。同一句謊話當時同時
   * 寫在 `effectRunner.ts` 與這裡 —— 兩份自洽的註解在同一件事上撒謊。
   */
  condition?: EffectCondition;
}

/**
 * 出貨的 effect 型別 = kind 專屬欄位（{@link EffectVariant}）交上共有欄位
 * （{@link EffectCommon}）。
 *
 * ⚠️ TS 會把 `(A|B) & C` 正規化成 `(A&C)|(B&C)`,所以 `Extract<EffectDef,
 * {kind:"damage"}>`、`EffectDef["kind"]` 的映射型別（`EffectRegistry`）、
 * 以及 `e.kind === "damage"` 的收窄**全部照舊**。
 */
export type EffectDef = EffectVariant & EffectCommon;

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
  /**
   * ⭐ S5 —— 這一次執行**已經是第幾層代放**（RUNTIME、從不 authored、無 Zod）。
   *
   * **缺席 = 0**，所以每一個既有呼叫點（`castResolveSystem` / `abilitySystem` /
   * `fireHooks` / `dotTick` / `randomAreaSystem` / `projectileSystem` /
   * `leapSystem` …）一個字都不用改，行為完全不變。
   *
   * ⚠️ 深度必須騎在 `ctx` 上而不是存進 `SimWorld`：它是**一次執行**的性質不是
   * 世界的性質 —— 兩支技能同一 tick 各自代放時，一個世界層的計數器會把它們算成
   * 同一條鏈。`TriggerDamage.reflectDepth` 走的正是這條路。
   */
  proxyDepth?: number;
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
