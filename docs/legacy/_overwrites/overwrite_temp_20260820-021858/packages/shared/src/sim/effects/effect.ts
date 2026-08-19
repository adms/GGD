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
import type { DamageVariant } from "./variants/damage";
import type { DamageAreaVariant } from "./variants/damageArea";
import type { DamageLineVariant } from "./variants/damageLine";
import type { GrantAttributeVariant } from "./variants/grantAttribute";
import type { DispelVariant } from "./variants/dispel";
import type { ShieldBreakVariant } from "./variants/shieldBreak";
import type { DevourVariant } from "./variants/devour";
import type { ModifyCooldownVariant } from "./variants/modifyCooldown";
import type { WeightedBranchVariant } from "./variants/weightedBranch";
import type { SwapResourceVariant } from "./variants/swapResource";
import type { EventValueConversionVariant } from "./variants/eventValueConversion";
import type { RandomAreaVariant } from "./variants/randomArea";
import type { ManaBarrierVariant } from "./variants/manaBarrier";
import type { ExtendBuffVariant } from "./variants/extendBuff";
import type { ReviveVariant } from "./variants/revive";
import type { HealVariant } from "./variants/heal";
import type { ShieldVariant } from "./variants/shield";
import type { ApplyStatusVariant } from "./variants/applyStatus";
import type { ApplyBuffVariant } from "./variants/applyBuff";
import type { CycleBuffVariant } from "./variants/cycleBuff";
import type { RestoreVariant } from "./variants/restore";
import type { SpendManaVariant } from "./variants/spendMana";
import type { DashVariant } from "./variants/dash";
import type { LeapVariant } from "./variants/leap";
import type { BlinkVariant } from "./variants/blink";
import type { ChampionFormVariant } from "./variants/championForm";
import type { SpawnProjectileVariant } from "./variants/spawnProjectile";
import type { SpawnVfxVariant } from "./variants/spawnVfx";
import type { DotVariant } from "./variants/dot";
import type { SummonVariant } from "./variants/summon";
import type { InvulnerableVariant } from "./variants/invulnerable";
import type { KnockbackVariant } from "./variants/knockback";
import type { EvasionVariant } from "./variants/evasion";
import type { TauntVariant } from "./variants/taunt";
import type { GrantGoldVariant } from "./variants/grantGold";
import type { DelayedVariant } from "./variants/delayed";
import type { ProxyCastVariant } from "./variants/proxyCast";
import type { CarryVariant } from "./variants/carry";
import type { ConvertTeamVariant } from "./variants/convertTeam";
import type { ChainLightningVariant } from "./variants/chainLightning";

/**
 * ⭐ 2026-08-20（#467 ②）—— 這 40 格**搬到 `sim/effects/variants/<kind>.ts`** 了。
 *
 * 在此之前它是一個 2,420 行的行內聯集，跟 `content/schema/effect.ts` 的 4,754 行
 * 是同一個病：**任何**新機制都要碰這一個檔。現在一個 kind 一個檔，加一個機制
 * 碰的是一個**新**檔加下面一行。
 *
 * ⚠️ 順序與成員逐字不變（`Extract<EffectDef, { kind: "x" }>` 的結果一格都沒動）。
 * 四向閘（schema 檔案／Zod 聯集／註冊表／這一份 TS 聯集）在
 * `content/schema/effects/effectShardWiring.test.ts`。
 */
type EffectVariant =
  | DamageVariant
  | DamageAreaVariant
  | DamageLineVariant
  | GrantAttributeVariant
  | DispelVariant
  | ShieldBreakVariant
  | DevourVariant
  | ModifyCooldownVariant
  | WeightedBranchVariant
  | SwapResourceVariant
  | EventValueConversionVariant
  | RandomAreaVariant
  | ManaBarrierVariant
  | ExtendBuffVariant
  | ReviveVariant
  | HealVariant
  | ShieldVariant
  | ApplyStatusVariant
  | ApplyBuffVariant
  | CycleBuffVariant
  | RestoreVariant
  | SpendManaVariant
  | DashVariant
  | LeapVariant
  | BlinkVariant
  | ChampionFormVariant
  | SpawnProjectileVariant
  | SpawnVfxVariant
  | DotVariant
  | SummonVariant
  | InvulnerableVariant
  | KnockbackVariant
  | EvasionVariant
  | TauntVariant
  | GrantGoldVariant
  | DelayedVariant
  | ProxyCastVariant
  | CarryVariant
  | ConvertTeamVariant
  | ChainLightningVariant;
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
