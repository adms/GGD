/**
 * ModifierSource — THE unifier. Champion passives, items, augments, and
 * temporary buffs all reduce to this one shape: stat modifiers + event hooks +
 * granted abilities. `attachSource`/`detachSource` are the only equip/expire
 * entry points, so no content type ever needs bespoke wiring.
 */
import type { Stat } from "./statTypes";
import type { AttrBasis, AttrBonus, AttrGrant, AttrKey } from "./attributes";
import type { EffectDef } from "../effects/effect";
import type { AbilityId, EntityId, StatusId } from "../../ids";
import type { CastableSlot } from "../intents";
import type { AuraDef, AuraOrigin } from "../aura/aura";
import type { VisionGrant } from "../stealth";
import type { ClassRequirement } from "../content/requirement";
import type { EffectCondition } from "../content/condition";

export enum ModOp {
  Flat = "flat",
  PercentAdd = "pctAdd",
  /**
   * 乘區 —— `final` 式子裡 `Π(1 + value)` 的那一項。**每一個來源自己一格**,
   * 所以兩份 +50% 是 ×2.25(不是 ×2.0,那是 `PercentAdd`)。
   *
   * ⚠️ **乘 `stacks`,而且是線性的**:`1 + value × stacks`(GH#286)。
   * 3 層 ×10% = +30%,不是複利的 +33.1%。
   *
   * ── 為什麼線性,而不是「N 層 ≡ N 份來源」的複利 ─────────────────────────
   * 複利那個讀法有它的道理(`stacks` 是 `applyBuff` 把 N 次施加**收合**成一格),
   * 但這裡選線性,三個理由:
   *   ① `stacks` 在這份 enum 裡只有**一個**意思 ——「把這條 modifier 的量放大
   *      N 倍」。`Flat` / `PercentAdd` / {@link PercentOf} 都是這個意思,
   *      再給 `PercentMult` 第二種意思等於讓同一個欄位在不同 op 上回答不同問題。
   *   ② 引擎裡**已經有兩處**手算過「N 倍的 pctMult」,而兩處都是線性:
   *      `sim/marks.ts::syncPerStackSource`(value × spent)與
   *      `sim/content/requirement.ts::scaleModifiers`(value × k)。複利會讓
   *      管線與那兩處對同一句話給出不同的數字。
   *   ③ 複利要在 `recomputeStats`(每 tick、每條屬性)裡跑 O(stacks) 次乘法,
   *      而 `applyBuff` 的 `maxStacks` 是**選填**(缺席 = `Infinity`),所以層數
   *      沒有上界。`sim/**` 又禁 `**`,只能寫迴圈。
   *
   * ⭐ **要複利的內容寫得出來**:`applyBuff` 不填 `stackKey` 時每一次施加都
   * attach 自己的一份來源,而這個式子本來就是 `Π` —— N 份來源就是 (1+v)^N。
   * 也就是說兩種語意都在,差別是作者選 `stackKey` 收合(線性)或不收合(複利)。
   */
  PercentMult = "pctMult",
  Override = "override",
  /**
   * 解鎖上限 (GH#286). `value` 是「把這條屬性的上限**抬到多少**」—— 不是加成、
   * 不是倍率、不乘 `stacks`。多個來源取 **max**(5 和 7 給的是 7,不是 12),
   * 而且抬不過 `sim/statCaps.ts` 的 `unlocked` 硬上限(攻速 10.0)。
   *
   * owner:「一般上限是 4.0,搭配特殊條件如技能、道具...等效果,可以解鎖最多
   * 到 10.0」. 它是一個 op 而不是新的 effect kind,正是因為 `applyBuff` /
   * 道具 / 三選一 / 靈氣 全部已經吃 `StatModifier[]`,而 `zModOp` 是整份
   * enum —— 加在這裡就等於同時開放給每一種內容,content schema 不用動。
   *
   * ⚠️ 一個 `CapRaise` 自己**不會給任何數值**。它只是把天花板搬高;要真的打到
   * 新的上限,還是得有 Flat / PercentAdd 把值推上去。
   */
  CapRaise = "capRaise",
  /**
   * ⭐ GH#354 / G5 —— 解鎖上限的**百分比**形式。`value` 是「比一般上限**多幾成**」
   *（0.25 = 一般上限的 1.25 倍），⛔ 不是一個絕對高度。
   *
   * owner 2026-08-17 的 #61 閃耀金玉「所有已達上限的屬性 **解鎖上限 +25%**」、
   * #50 不知火、#60 立體機動裝置寫的都是這個形狀。
   *
   * ── 為什麼絕對式寫不出來 ──────────────────────────────────────────────
   * 一件寶具的效果是「+25%」，而**每一條屬性的一般上限都不同**
   *（攻速 4.0 / 吸血 0.8 / 移速 18 / 護甲 5078…）。用 {@link CapRaise} 表達的話，
   * 作者得逐條屬性抄一個算好的絕對值進去 —— 那是 13 份會各自腐爛的抄本，
   * 而操作者在後台把攻速上限從 4.0 調成 5.0 的那一天，那 13 個數字**一個都不會**
   * 跟著動，卡片卻還寫著「+25%」（第三守則的形狀，而且沒有任何東西會紅）。
   *
   * ⚠️ 它與 `CapRaise` **一起**取 max（兩者都先折成一個絕對高度再比），所以
   * 「+25%」與「抬到 7.0」同時掛著時拿的是比較高的那一個，⛔ 不是相加。
   * ⚠️ ⛔ **不乘 `stacks`** —— 與 `CapRaise` 同一條理由：它是一個目標高度，
   * 不是一份加成。要疊就掛兩份來源（各自折出高度，取 max）。
   * ⚠️ 抬得再高仍然被 `statCaps` 的 `unlocked` 硬夾住 —— 那一格是操作者的閘，
   * 而**出貨的 13 條裡只有攻速與吸血留了空間**，其餘 `unlocked === base`，
   * 也就是說對它們寫 capRaise（兩種形式都一樣）今天是 **no-op**。
   * 那是一個 config 資料的決定（`content/config/stat-caps.json`），不是程式。
   */
  CapRaisePct = "capRaisePct",
  /**
   * 衍生屬性 —— 「把 A 的 X% 加到 B」(78-00 銅皮鐵骨:「防禦力額外增加自身攻擊力
   * 的 50%」)。`stat` 是**目的地**,{@link StatModifier.from} 是**來源**,
   * `value` 是比例(0.5 = 50%)。
   *
   * ⚠️ 這是這一份 enum 裡**唯一**需要第二條屬性的 op,所以 `from` 是選用欄位而
   * 不是必填 —— 但 `statPipeline` 對「`percentOf` 沒帶 `from`」的處理是**當作
   * 沒有這一條**(而不是加 0 或丟例外),schema 那一層則直接拒收,見
   * `content/schema/common.ts::zStatModifier`。
   *
   * ── 為什麼它必須是一個 op,而不是內容自己算好一個數字 ──────────────────
   * 「攻擊力的 50%」在一場比賽裡**每一 tick 都在變**:買一把劍、吃一張三選一、
   * 升一級、對面上一個減攻 debuff。把它寫成 `Flat 11`(= 22 的一半)的那一刻,
   * 它就變成一個永遠停在開場的數字,而面板還是會理直氣壯地顯示它 —— 正是
   * CLAUDE.md 失敗形態 ④(斷言/數字跟缺陷無關)。
   *
   * ── 求值順序,以及為什麼它不會連鎖 ─────────────────────────────────────
   * `recomputeStats` 跑**兩趟**:第一趟完全忽略 `PercentOf`,第二趟只重算帶有
   * `PercentOf` 的那幾條屬性,而且讀的是**第一趟**的來源值。所以
   * 「armor ← 50% ad」與「ad ← 50% armor」同時存在時不會互相追著跑,也不會有
   * 順序相依 —— 兩者都讀同一份 pass-1 快照。代價寫在明處:一條 `PercentOf`
   * **讀不到另一條 `PercentOf` 的產出**。這是刻意的,收斂性比表達力重要。
   *
   * ⚠️ 乘 `stacks`(和 `Flat` / `PercentAdd` 一樣):三層同樣的衍生就是三倍。
   */
  PercentOf = "percentOf",
}

export interface StatModifier {
  stat: Stat;
  op: ModOp;
  value: number;
  /**
   * `ModOp.PercentOf` 專用:**來源**屬性。其餘 op 一律忽略它。
   * 見 {@link ModOp.PercentOf}。
   */
  from?: Stat;
  /**
   * `ModOp.PercentOf` 專用,而且是 {@link StatModifier.from} 的**替代**(兩者
   * 互斥,schema 擋):來源不是一條 `Stat`,而是一項**當下的資源** ——
   * 光魔杖 (godie-i027) 的 「AP+ (目前MP的 5%)」。
   *
   * `from: "maxMana"` 給的是**最大**法力的 5%,一個重算時算完就凍住的數字;
   * `fromResource: "mp"` 給的是**目前**法力的 5%,一個隨著法力條下降而縮水的
   * 數字。兩者在滿魔時相同,空魔時前者照樣發滿額 AP —— 也就是文案的謊話。
   *
   * 「目前 vs 最大」是 owner 會改的那種決策,所以它是 modifier 上的一個鍵,
   * 不是程式裡的一個分支(CLAUDE.md 第一守則)。
   *
   * 機制、重算時機與它為什麼折進 `sc.final` 而不是讀取時算,全部寫在
   * `stats/resourceStats.ts` 的檔頭。`"hp" | "mp"` 這組字彙沿用
   * `sim/content/condition.ts` 的 `ResourceStat`,不是新發明的。
   */
  fromResource?: import("../content/condition").ResourceStat;
  /**
   * ⭐ G9 —— 這條加成**只對某一格技能生效**（79-04 卍解「[瞬步] 冷卻縮短 50%
   * 持續 8 秒」）。缺席 = **全域** = 折進 `sc.final[stat]`，也就是這個欄位出現
   * 之前每一條 modifier 的行為。
   *
   * ⛔ 帶 scope 的 modifier **完全不參與** `recomputeStats` 的全域折疊。這正是
   * 「scoped」這個字的定義：它不在 `sc.final` 裡，所以任何讀 `sc.final` 的地方
   *（面板、商店預覽、codex、其他五格技能）都拿不到它 —— 不會有第二個真相。
   * 讀取端是 `stats/scopedStat.ts`，唯一的消費者是技能冷卻的計算。
   *
   * ⚠️ 與 {@link scopeAbilityId} **互斥**（schema 擋）：「哪一格」與「哪一支」
   * 是兩個不同的問題，而管線只會採用其中一個。
   */
  scopeSlot?: CastableSlot;
  /**
   * ⭐ G9 —— {@link scopeSlot} 的另一半：指名**一支具體的技能**，不管它裝在
   * 哪一格。缺席 = 全域（同上）。
   *
   * ⚠️ **軟參照**：打錯 id = 這條 modifier 匹配不到任何技能、靜默無效。
   * 硬參照要把 `content/refs.ts` 那條邊拉進 `schema/common.ts`（最底層、被四份
   * schema 同時 import），而軟參照的代價已有前例（`EquipmentItemLeaf.itemId`：
   * 「條件寫得出來」不該被「道具還沒上架」擋住）。⛔ 不要假裝它今天會紅。
   */
  scopeAbilityId?: string;
}

/** Game events hooks can react to. */
export type HookEvent =
  // ⭐ GH#354（owner 2026-08-17）—— **14** 個新時刻。⛔ 沒有一個需要新的系統：
  // ⚠️ 這裡原本寫「13」，而逐筆比對 union 與 `WorldHookSystem` 的對照表都是 14
  //（19 → 33，0 個被刪）。散文裡的計數沒有守衛，所以它必然過期 —— 2026-08-18 修正。
  // 六個是既有事件的切片（`WorldHookRow.when`），四個是新的發射點，
  // 三個是既有事件換一個 scope。發射與收件的對照表住在 systems/WorldHookSystem.ts。
  | "onUltimateCast"
  | "onUltimateHit"
  | "onCrowdControlApplied"
  | "onCrowdControlReceived"
  | "onHeal"
  | "onOverheal"
  | "onAllyDamaged"
  | "onProjectileExpire"
  | "onBoundaryTouch"
  | "onDashOrBlink"
  | "onLethalDamage"
  | "onStatCapReached"
  | "onRoundStart"
  | "onRoundEnd"
  | "onAbilityCast"
  | "onAbilityHit"
  | "onBasicAttack"
  | "onDamageDealt"
  | "onDamageTaken"
  | "onKill"
  // `"onLevelUp"` 刪於 2026-08-05 —— 理由寫在 content/schema/effect.ts 的 `zHookEvent`。
  /**
   * 週期 —— 每一 tick 對每一個活著、有 `StatsComp` 的單位發射一次
   * (`systems/IntervalHookSystem.ts`)。**節奏由 `internalCooldown` 表達**,
   * 不是由這個事件表達:`internalCooldown: 10` 就是「每 10 秒」,而那個欄位
   * 本來就存在、本來就在編輯器上、本來就吃 `combatEnv.itemCooldown`(道具來源)。
   *
   * 它補的是一個真的空洞:在它之前,`HookEvent` 的七個成員**全部**要有人動手
   * (攻擊/施法/受傷/擊殺/升級),所以 43-00 觀音大士「每 10 秒生成一個護盾」
   * 這種 WC3 最常見的一族只能被寫成「被打的時候才給」—— 那是另一支技能。
   *
   * ⚠️ 沒有 `internalCooldown` = **每一 tick 都發**(30 次/秒)。那是合法的
   * (03-00 相轉移裝甲的常駐魔免就要這樣),但寫的時候要知道自己在寫什麼:
   * 帶 `chance` 或 `condition` 的話,rng 會**每一 tick**被抽。
   */
  | "onInterval"
  /**
   * 被暈眩的那一刻 (勇者小呆 08-00 龍紋記憶:「被暈眩時，覺醒龍之力」).
   *
   * ⚠️ 這是這一份 enum 裡**唯一**「別人對我做了什麼」的事件 —— 其餘每一個都是
   * 持有者自己動手 (攻擊/施法/擊殺/升級) 或時間到了。這個不對稱正是它沒辦法用
   * 現有成員表達的原因:最接近的 `onDamageTaken` 錯兩次 ——
   * 暈眩不一定帶傷害 (07-04 靈壓震撼、每一支位移控場都是),而傷害**一直在來**,
   * 所以「被打就 ×2 三圍」會讓小呆整場常駐覺醒。封閉 enum 加成員要付一次代價;
   * 用內容硬湊則是往後每一個讀者都要付。
   *
   * 由 `systems/CcHookSystem.ts` 從 `effects/applyStatus.ts` 發的 `stunApplied`
   * 事件轉成 hook,而且**只在暈眩真的掛上去的時候** —— 續期不重觸發,否則連續
   * 暈眩會每一 tick 重新翻倍。hook 的 `target` 是「下暈眩的那個人」,所以自我
   * 增益的 payload 要寫 `target: "self"`。
   *
   * **刻意窄化,而且這是一個值得寫出來的決策**:纏繞/減速/擊退**不**觸發它。
   * owner 說的是「被暈眩」,而一個會讓小呆覺醒的減速等於把全遊戲的減速都變成
   * 送禮。「哪些控場算」是候選欄位,不是定案 —— 見 openQuestions。
   */
  | "onStunned"
  /**
   * **反彈成功的那一刻**（owner 2026-08-05：「onReflect／反彈成功時 這個也要」；
   * 2026-08-08 從 `onReflect` 更名並補上 provenance，見下）。
   *
   * ── 「成功」的判準：**一發 `reflectDepth > 0` 的封包真的落地** ─────────────
   *
   * 兩層閘，缺一不可，而**兩層都不是這個事件自己的程式碼**：
   *
   *   Ⅰ 反彈封包**生得出來** —— `effects/damage.ts` 的 `incomingPct` 三道閘
   *     （沒有觸發封包 · `reflectDepth > maxChainDepth` · 排空預算來不及且
   *      `whenTooLate:"drop"`）任何一道攔下來就沒有封包。
   *     ⚠️ 還有第四道:**反彈量 ≤ 0 的封包根本不會被 push**（同檔那條
   *     「反彈了 0 就不發封包」）。所以「原傷害被完全擋下」= 不算成功，
   *     而「什麼算 0」由作者的 `incomingPct.basis`（raw / mitigated / hpLost）決定
   *     —— 那個決策點**已經是一個欄位**，不需要第二個。
   *
   *   Ⅱ 那一發封包**真的解算了** —— 目標還活著、沒有無敵/免疫、沒有被
   *     技能迴避擋掉。`combat/damage.ts` 的排空迴圈對這三種都是 `continue`。
   *
   * ⛔ 為什麼要窄到這個地步：一個在「其實沒反彈到」時照樣觸發的事件，會讓
   * 「反彈時回血」實際上變成「被打時回血」—— 那是另一支技能，
   * 而且**畫面上看不出差別**。
   *
   * ── payload（計畫 §2.1.1 明列的四項 provenance）────────────────────────
   *
   *   · **防禦者** = hook 的持有者（`target: "self"` 指到他）
   *   · **攻擊者** = hook 的 `target`（＝被反彈到的那個人）
   *   · **反彈傷害** = `EffectContext.incoming` —— 那一發**反彈封包自己的**
   *     `TriggerDamage`（raw / mitigated / hpLost 三個讀數都是真的，因為事件
   *     是在它落地的那一格發的）。20-002「每次造成 7 倍[反彈]傷害」讀的就是它。
   *   · **原傷害** = 同一個 tick、同一個持有者的 `onDamageTaken` 已經帶著它
   *     （`TriggerDamage` 是封閉型別，再塞一份進來只會是第二個真相）。
   *
   * ⚠️ 它與 `onDamageTaken` 不同,而這個差別正是它沒辦法用現有成員表達的原因：
   * `onDamageTaken` 每一發傷害都發,而反彈是**有條件**的（要有 `incomingPct`、
   * 要沒撞到鏈深上限、要真的落地）。用 `onDamageTaken` + 條件湊出來的話,
   * 作者要自己重寫上面那兩層閘,而它們會分岔。
   *
   * ⛔ **持有者是反彈的人（防禦者），hook 的 target 是被反彈到的那個人**
   *（＝原本打你的人）—— 與 `onStunned` 同一個方向。所以「反彈時自己回血」
   * 要寫 `target: "self"`,而「反彈時額外燒對方的魔」是預設的 target。
   *
   * 由 `systems/ReflectHookSystem.ts` 從 `world.pendingReflectHooks` 轉成 hook,
   * 理由與 `onStunned` 逐字相同：從封包解算處直接呼叫 `fireHooks` 之外，
   * 排在 `deathSystem` 之前才不會「死後才反彈」。
   */
  | "onReflectSuccess"
  /**
   * ── 以下六個由 `systems/WorldHookSystem.ts` 從**事件流**轉成 hook ──────
   *
   * 它們與上面那些的差別不在語意，在**來源**：上面每一個都有一個手寫的
   * `fireHooks(` 呼叫點，這六個是一張對照表的六列。
   * 加第七個時刻的成本 = 那張表加一列 + 這裡加一個成員，**不用寫新系統**。
   *
   * ⚠️ 為什麼它們不是「早就有了」：這六個時刻 sim 每一場都在 `world.emit()`
   *（給客戶端畫面用），但 `fireHooks` 的呼叫點沒有一個讀事件流，所以內容側
   * 一個都掛不上去 —— 做了、送出去了、但沒有人收得到（失敗形態②）。
   */
  /** 殭屍王出現（世界廣播，發給場上每一位活著的單位；沒有 target）。 */
  | "onBossSpawn"
  /** 火圈點燃 —— 只在點燃那一 tick 發一次，不是每 tick（世界廣播，沒有 target）。 */
  | "onFireRingIgnite"
  /**
   * 守衛塔倒下（世界廣播，沒有 target）。
   * ⚠️ 打倒守衛塔**不發 `onKill`**（獎勵由 GuardianSystem 自己付），所以在這個
   * 成員之前，「塔倒了」在內容側完全接不到。
   */
  | "onGuardianDown"
  /**
   * 死亡的那一刻。持有者 = 死掉的那個人，target = 兇手。
   * ⚠️ 火圈／DoT 燒死時**沒有兇手**，那時 hook 沒有 target —— 那是對的，
   * 所以「死亡時對兇手爆炸」要自己帶 `condition`，不能假設 target 一定在。
   */
  | "onDeath"
  /** 被復活的那一刻。持有者 = 被復活的人，不是頂著圈圈的隊友。 */
  | "onRevive"
  /**
   * 迴避成功的那一刻。⚠️ 持有者 = **閃掉的那個**，target = 攻擊者
   *（與 `onStunned` / `onReflectSuccess` 同一個方向）。
   */
  | "onEvade"
  /**
   * ── 以下四個由**契約層**（2026-08-09，GH#300）加進詞彙，**發射點還沒接** ──
   *
   * ⛔ 它們今天是**零發射點**的成員，跟 `onLevelUp` 被刪掉之前的狀態一樣 ——
   * 那正是為什麼這四行必須帶著這段警告：一個「下拉裡有、引擎不發」的事件，
   * schema 收得下、後台存得起來、卡片上看得到，而技能**一次都不會觸發**
   *（失敗形態 ②）。發射點是 lane B 的工作（GH#300）。
   *
   * ⚠️ 加進詞彙**先於**接發射點，是刻意的順序：四路平行實作全部要 import 這四
   * 個字面量，contract-first 才不會四路各自發明一個名字。代價是「宣稱有、其實
   * 沒有」的窗口存在幾個小時，而它由 GH#300 關閉 —— ⛔ 若 #300 最後沒有接完，
   * 沒接到的那幾個**要從這裡刪掉**，不要留在詞彙裡。
   *
   * 持有者／target 的方向逐一寫在下面。三個「別人對我做了什麼」的事件全部沿用
   * `onStunned` 的方向（持有者 = 被做的那個，target = 動手的那個）。
   */
  /**
   * 護盾產生的那一刻。持有者 = **拿到護盾的人**，target = 給護盾的人
   *（自己給自己時 target 就是自己；環境來源沒有 target）。
   */
  | "onShieldGained"
  /**
   * 護盾**破碎**的那一刻 —— 護盾池被打到 0。
   * ⚠️ 與【破盾】(`shieldBreak`) 不是同一件事：那是一個**動作**（我去拆別人的
   * 護盾），這是一個**時刻**（我的護盾沒了）。持有者 = 護盾破掉的人，
   * target = 打破它的人（自然到期時沒有 target）。
   * ⛔ 「被打到但還有剩」不算 —— 只在真的歸零那一格發，否則它會退化成
   * `onDamageTaken` 的一個同義詞。
   */
  | "onShieldBroken"
  /**
   * **隊友**陣亡的那一刻。持有者 = **還活著的那個隊友**，target = 死掉的人。
   * ⚠️ 方向與 `onDeath` 相反（那個的持有者是死者本人），這正是它沒辦法用
   * `onDeath` 表達的原因：「隊友死了我暴怒」掛在死人身上不會發生任何事。
   * ⛔ 自己死不觸發自己的這一條（那是 `onDeath`）。
   */
  | "onAllyDeath"
  /**
   * 一筆狀態**掛上去**的那一刻。持有者 = 拿到狀態的人，target = 施加的人
   *（環境／自我施加時沒有 target）。
   * ⚠️ 與 owner 說的「身上有某狀態時」**不是**同一個東西：那一族現在的答案是
   * effect 上的 `condition`（`EffectCommon.condition`），因為「持續期間都成立」
   * 是一個**狀態查詢**，不是一個時刻。這個事件只回答「剛剛掛上」。
   * ⛔ 續期不重觸發（同 `onStunned` 的規則，否則連續施加會每 tick 重發）。
   */
  | "onStatusApplied";

export interface HookDef {
  on: HookEvent;
  /**
   * ⭐ S3 —— 這條 hook 在它所屬的那一份來源裡的**穩定名字**，讓
   * `modifyCooldown{target:"hookInternalCooldown"}` 指得到它。
   * 缺席 = 這條 hook 沒有名字 = 沒有任何效果指得到它（也就是今天）。
   *
   * ⭐ 形狀直接抄 `AuraDef.key`（「stable name, unique within the passive」）——
   * 這個 repo 已經為「指名一份陣列裡的第 N 個」解過一次這個問題。
   * ⛔ **不可以用陣列索引定址**：`hooks[2]` 在作者插入一條新 hook 的那一刻就
   * 指到別人身上，而畫面上完全看不出來。
   */
  key?: string;
  /** optional condition: restrict to a specific ability slot (incl. "PASSIVE") */
  abilitySlot?: CastableSlot;
  /** effects run with the hook owner as caster and the event target as target */
  effects: EffectDef[];
  /**
   * Who the hook's effects RESOLVE against. Default "event" = the entity the
   * event was about (the unit you hit / killed / were hit by). "self" points
   * them back at the hook's owner, which is the only way to express WC3's very
   * common "on kill, YOU gain X" passives (呂布's 飛將神弓 `A0AU`: +10 attack
   * damage for 15 s per kill) — with the default the buff lands on the corpse.
   *
   * ⭐ `"allies"` —— 全隊作用域 (天生牙 godie-i031:「殺死任一個敵方單位，回復
   * **我們全部英雄** 1%生命」/「殺死任一個敵方英雄單位，將復活**我方所有英雄**」).
   *
   * Before it there was NO scope in the whole engine that could name more than
   * one unit from a hook: `"self"` is one body, `"event"` is one body, and an
   * `auras` block reaches the units standing in a RADIUS — which is a different
   * question, and the wrong one for a card that says 「全部」 regardless of where
   * they are standing. Writing it as a huge aura would have been a lie with a
   * number attached (the arena's own `boundaryRadius` is 24, so 「全部」 would
   * have meant 「除非有人跑遠了」).
   *
   * MEMBERSHIP, stated exactly because every one of these is a real case:
   *   · every entity carrying a `ChampionComp` whose `TeamComp.teamId` equals
   *     the hook owner's — mobs, summons, guardians and flowers are never in it
   *     (they have no ChampionComp), so 「英雄」 in the prose is the literal
   *     filter rather than an approximation;
   *   · INCLUDING the owner (「我方所有英雄」 counts the killer);
   *   · INCLUDING THE DEAD — that is the whole point for `revive`, and it costs
   *     the living-only kinds nothing because `healTarget` / `restoreMana`
   *     already return 0 on a corpse (`combat/restore.ts`);
   *   · NO zone filter. `MatchController.enterCombat`'s placement loop puts
   *     EVERY seat of a fighting team into the same duel zone, so a zone filter
   *     would drop nobody in a real match — and if the invariant ever broke, a
   *     filter would drop a teammate SILENTLY while the payload (revive at your
   *     own corpse, heal in place) moves nobody between zones anyway.
   *   · SORTED by entity id, because `world.champion` is a Map and
   *     `sim/purity.test.ts` is watching.
   */
  target?: "self" | "event" | "allies";
  /**
   * WHAT the event's entity has to BE for this hook to fire (task #244).
   * "champion" = only an entity carrying a ChampionComp; "mob" = only a
   * roguelite mob (`world.mob`); "any"/absent = no filter, which is what every
   * pre-#244 hook means and why the field is optional.
   *
   * The reason it exists: 黑泥吞噬 pays +8 max health for a mob kill and +40 for
   * a champion kill, and one `onKill` event cannot express two payouts. Chosen
   * over inventing an `onMobKill` event so there stays ONE event, one doc shape
   * and one place to reason about firing order. It also lets a hook that was
   * authored when mob kills never fired keep its exact old behaviour by pinning
   * `victim: "champion"`.
   *
   * The filter is skipped when the event carries no entity at all (a hook with
   * `target: "self"` on an entity-less event still fires, as before).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * 批 1 (2026-08-04) 加的三個成員 —— **會比隊伍**的那一半
   *
   * 上面三個成員問的是「那個實體**是什麼**」,一個字都沒問「它站在哪一邊」。
   * owner 的 17 張稜彩卡有 13 個 hook 位置寫的是「敵方**英雄**」,而在這三個
   * 成員之前那句話寫不出來 —— 最接近的 `"champion"` 對**隊友**也成立,於是
   * 「敵人被我控住時」那一族卡會被自己人的身體觸發。
   *
   *   · `"enemyChampion"` —— 帶 `ChampionComp` **且不同隊**
   *   · `"allyChampion"`  —— 帶 `ChampionComp` **且同隊**(含自己)
   *   · `"enemy"`         —— **任何**不同隊的身體,含殭屍/召喚物/小怪
   *
   * ⭐ `"enemy"` 是這一批最重要的一格。owner 已裁決**不給殭屍 `StatsComp`**
   * (效能與順暢度),所以 9 張在殭屍波裡半殘的卡唯一的活路就是這個成員 ——
   * 那 9 張的效果都掛在**自己**身上(疊層/充能/回血),只有過濾器擋著。
   *
   * ⚠️ **沒有 `TeamComp` 的身體一律不通過**,三個成員都一樣。客戶端的預測
   * 影子世界、以及裸的測試實體都沒有隊伍,而「不知道你站哪邊」不可以被讀成
   * 「你是敵人」——那會讓預測端跑出一份伺服器沒有的觸發。方向與
   * {@link alliedChampions}(無隊伍 → 空名單)一致。
   *
   * ⚠️ 全域覆寫 `world.augmentEnemyFilter.mobsCountAsEnemy`(出貨 false)只動
   * `"enemyChampion"`:打開之後它也收敵對陣營的小怪。`"allyChampion"` 永遠
   * 不受影響(殭屍不會變成隊友),`"enemy"` 本來就收。見 `sim/augmentEnemyFilter.ts`。
   */
  victim?: "champion" | "mob" | "any" | "enemyChampion" | "allyChampion" | "enemy";
  /**
   * 觸發這個 hook 的那一發傷害**是不是普通攻擊**。Absent = `"any"` = 不過濾,
   * 也就是這個欄位出現之前的每一份文件。
   *
   * 為什麼需要它:owner 給反射之盾寫的效能是「[反彈] 反彈**普通攻擊**傷害
   * 200%」。在這個欄位之前,`onDamageTaken` 分不出打你的是一次普攻、一發技能、
   * 還是一跳 DoT —— 那件道具只能被實作成「反彈所有傷害」,也就是**另一件道具**
   * (而且是強得多的一件)。原作 `A0C6` 的 base 是 `ANth` 荊棘光環,而荊棘反的
   * 也是攻擊,不是法術。
   *
   *   · `"basic"`    —— 只有 `origin === "basic"` 的封包(普通攻擊)
   *   · `"nonBasic"` —— 其餘全部
   *   · `"ability"`  —— 只有技能傷害(批 1)
   *   · `"other"`    —— 既不是普攻也不是技能(批 1)
   *   · `"any"`/省略 —— 不過濾
   *
   * ⚠️ 為什麼 `"nonBasic"` 不叫 `"ability"`:走那條路的不只有技能,還有
   * DoT、道具 proc、火圈、守衛塔、小怪。取名 `"ability"` 會是一個**名字說謊**
   * 的欄位(CLAUDE.md 第三守則)。所以批 1 沒有改它的語意,而是在旁邊加了
   * **真的**只收技能的那一個。
   *
   * ─────────────────────────────────────────────────────────────────────────
   * 批 1 (2026-08-04) 加的兩個成員 —— 把 `"nonBasic"` 那一坨拆開
   *
   * 戰爭交響曲說的是「普攻**或技能**造成傷害時回血」。用 `"nonBasic"` 寫,
   * **火圈燒到人也會回血** —— 那是另一張卡(而且是強得多的一張)。所以:
   *
   *   · `"ability"` —— `origin` 是 `` `ability:${id}` ``。**技能留下的延燒
   *     (DoT)也算**,因為 `effects/dotTick.ts` 逐字沿用施法者的 `origin`
   *     (owner 2026-08-01:「技能留下的延燒…算不算技能傷害? => yes」)。
   *   · `"other"` —— 兩者皆非:火圈、守衛塔、小怪、hook 自己排出來的封包。
   *
   * ⛔ 判斷**重用 `combat/damageTypeOverride.ts` 的 `originInScope`**,不是
   * 第二份 `startsWith("ability:")`。兩份就會有兩種「什麼算技能傷害」,而它們
   * 分歧的那一天,惡夢魔王碎片(`scope:"ability"`)與這個欄位會對同一發封包
   * 給出不同的答案。
   *
   * ⚠️ 事件沒有帶傷害時(`onKill` / `onBasicAttack` / `onInterval` …)這個過濾
   * **一律不通過**,而不是像 `victim` 那樣退化成「不過濾」。兩者不對稱是刻意的:
   * `victim` 的主詞(一個實體)在無實體事件上是真的「不知道」;而這個欄位的主詞
   * 是那一發封包,凡是帶封包的事件都一定帶著它 —— 沒有封包不是「不知道」,
   * 是「根本沒有傷害」,而「沒有傷害」不可能是一次普通攻擊。
   * 這條在正常內容上碰不到:`zHookDef` 在載入時就擋掉把它掛到無傷害事件上的
   * 文件,所以「寫得出來但永遠不會觸發」不是一個能出貨的狀態。
   */
  damageSource?: "any" | "basic" | "nonBasic" | "ability" | "other";
  /**
   * B2 (2026-08-05) —— 觸發這個 hook 的那一發傷害**是什麼型別**。
   * 解鎖【這一發是 AP】【是 AD】【是真傷】。
   *
   * 讀 `TriggerDamage.type`，也就是 `DamagePacket.type` —— **最後一次型別轉換
   * 之後**的型別。所以一發被惡夢魔王碎片轉成魔法的物理傷害，在這裡是 `"magic"`。
   * 那是對的：作者問的是「打到我身上的是什麼」，而護甲／魔抗吃的也是轉換後的型別。
   *
   * ⚠️ **與 `damageSource` 的三條規則逐字相同**（刻意的，它們是同一族）：
   *   · 省略或 `"any"` = 不過濾，所以每一份既有文件逐位元不變
   *   · **沒有封包 = 不通過**（不是退化成「不過濾」）—— 理由見 `damageSource`
   *   · 位置在**內部冷卻閘與機率骰之前**，被擋掉的一發不燒 ICD、不動 seed
   */
  damageType?: "any" | "physical" | "magic" | "true";
  /**
   * B2 (2026-08-05) —— 觸發這個 hook 的那一發傷害**是不是暴擊**。解鎖【暴擊時】。
   *
   * ⚠️ **為什麼是三值 enum 而不是 `boolean`**：`false` 與「沒填」在後台表單上
   * 分不開（`optBool` 那一整段的教訓 —— 空白格會被寫回 `false`，而
   * 「不過濾」與「只在非暴擊時」是兩件完全不同的事）。`"any"` 讓「不過濾」
   * 是一個作者**打得出來**的值，而且與 `damageSource` / `damageType` 的
   * `"any"` 慣例一致。
   *
   * ⚠️ 主詞是**那一發封包**，不是持有者的暴擊率。`"crit"` 問「剛剛那一下爆了嗎」。
   */
  damageCrit?: "any" | "crit" | "nonCrit";
  /**
   * ⭐ G8 —— 觸發這個 hook 的那一發暴擊，**是不是這一份來源自己那條
   * `critStrike` 造成的**（89-01 憤怒的頭槌：「**這一招**想起頭槌的那一下把敵人
   * 震昏」，不是「這位英雄任何一次暴擊都震昏」）。
   *
   * · `"any"`（缺席 = 這個）—— 不過濾，逐字等於 {@link damageCrit} 今天的行為。
   * · `"thisSource"` —— 只有 `incoming.critSources` 含**這一份 source 的 id**
   *   時才算。hook 與 grant 本來就住在**同一個** `ModifierSource` 上
   *  （`abilityPassives` 的 `...sourceGrants(block)` 把 `critStrike` 與 `hooks`
   *   一起轉發），所以「我自己那一條」是一個**關係**不是一個字串。
   *
   * ⛔ 不做「填一個 source id」：那會多一個會腐爛的 join key。
   * ⛔ 不做第三個值 `"otherSource"`：今天沒有任何一支技能要它，而同義詞是最貴
   * 的一種技術債。
   *
   * ── 哪些傷害**產得出** `critSources`（2026-08-10 之前只有一種，那是一個缺陷）──
   * 普攻（`BasicAttackSystem`／投射物）**與**技能傷害（`damage` / `damageArea` /
   * `damageLine` 的 `canCrit`）都走 `combat/critStrike.ts`，所以兩邊都產。
   * ⚠️ 在 2026-08-10 之前，`effects/damage.ts` 那一族只設 `crit = true` 而
   * **從不設 `critSources`** —— 於是這一格寫在**技能**暴擊上是永遠不觸發的，
   * 而這段說明與 `.describe()` 都沒有提到「只有普攻」（失敗形態②：一格填得下、
   * 載入過得了、遊戲裡永遠不發生）。
   *
   * ⚠️ 仍然成立的前提（這是**關係**，不是漏洞）：這條 hook 與那條 `critStrike`
   * 必須在**同一份來源**上。掛在別件裝備上的 hook 讀不到這一份的 id，那正是
   * 「這一招自己的暴擊」要的語意。
   *
   * ⭐ 這一格同時是「**一次判定、一串結果**」的整個答案：hook 自己**不填**
   * `chance`，判定就只有暴擊那一次骰 —— 所以「暴擊了但沒落雷」在結構上不可能。
   */
  critSource?: "any" | "thisSource";
  /**
   * ⭐ S10 —— 被這一發**反彈掉的原封包**是不是普通攻擊（60-04 迴旋斬：
   * 「若成功反彈敵方**技能** AP 傷害」）。
   *
   * 字彙與 {@link damageSource} **完全相同**，因為它問的是完全相同的問題，
   * 只是主詞換成原封包。⛔ 判定一律走 `damageSourcePasses` 那一份既有函式 ——
   * 兩份就會有兩種「什麼算技能傷害」，而它們分歧的那一天，惡夢魔王碎片與這個
   * 欄位會對同一發封包給出不同的答案。
   *
   * ⚠️ 只有 `onReflectSuccess` 帶得到原封包（schema 擋）。
   * 缺席 = 不過濾 = 今天（每一條 `onReflectSuccess` 都是無條件觸發）。
   * ⚠️ 「沒有原封包 = 不通過」，與 `damageSource` 的不對稱一致。
   */
  reflectedDamageSource?: "any" | "basic" | "nonBasic" | "ability" | "other";
  /**
   * ⭐ S10 —— 被反彈掉的**原封包是什麼型別**（60-04 的「AP」那一半）。
   * 讀的是原封包**最後一次型別轉換之後**的型別（＝護甲／魔抗真的吃到的那一個），
   * 與 {@link damageType} 逐字同一句話，所以作者不用學第二個概念。
   * 缺席 = 不過濾 = 今天。
   */
  reflectedDamageType?: "any" | "physical" | "magic" | "true";
  /**
   * ⭐ S6 —— 這條 hook **總共**能發動幾次（15-04 千之雷的「**下一次**普攻」）。
   *
   * 缺席 = **無限次** = 這個欄位出現之前每一條 hook 的行為（全樹 64 條 hook
   * 一條都不填，所以掛上它是嚴格的 no-op）。上界
   * {@link import("../effects/kindLimits").HOOK_MAX_TRIGGERS}。
   *
   * ⛔ 不要用「掛一個 duration 極短的 buff」假裝一次性：那是**時間**界不是
   * **次數**界，攻速一高就會吃到兩次，而畫面上跟正確的一模一樣（只有數字對不上）。
   */
  maxTriggers?: number;
  /**
   * ⭐ S6 —— {@link maxTriggers} 的額度**什麼時候被扣掉**。
   *
   * 今天只有一個值 `"fire"`（hook 真的發動的那一刻）。⚠️ 這一格刻意先存在：
   * 它把「這裡有二選一」寫進契約，而 `"hit"`（下游真的打到人才算）上線那天只是
   * 加一個 enum 成員、不是改語意。⛔ 不先開 `"hit"`：那需要把扣帳搬到
   * `combatResolveSystem` 的落地路徑，也就是**第二條接線** —— schema 開了
   * handler 沒接正是失敗形態②。
   */
  consumeOn?: "fire";
  /**
   * ⭐ S6 —— 額度用完之後，這份來源怎麼辦。
   * · `"stop"`（缺席 = 這個）—— hook 不再觸發，但來源與它的屬性加成留在身上。
   *   **嚴格小於** `detachSource` 的改變量，所以它是保守的那一邊。
   * · `"detachSource"` —— 整份來源卸下（增益圖示跟著消失）。
   */
  onConsumed?: "stop" | "detachSource";
  /**
   * ⭐ S6 —— 額度是**一份共用**還是**每個敵人各一份**。
   * 缺席 = `false` = 一份共用（「一次性」最直觀的意思）。
   * `true` = 「對每個敵人只吃一次」那一族（WC3 常見）。
   * ⚠️ 只有帶 target 的事件談得上「每個敵人」（schema 擋 `onInterval`）。
   */
  perTarget?: boolean;
  /** internal cooldown in seconds (0/undefined = every trigger) */
  internalCooldown?: number;
  /**
   * {@link internalCooldown} 的**作用域** —— 這條 hook 的冷卻是「整條共用一份」
   * 還是「每個技能槽位各一份」。批 1 (2026-08-04),決策點 1-4。
   *
   *   · `"source"`        —— 一份冷卻,不分槽位。**省略 = 這一個**,
   *                          也就是這個欄位出現之前每一份文件的行為。
   *   · `"perAbilitySlot"` —— Q/W/E/R/EX/PASSIVE **各記各的**:Q 剛觸發過
   *                          不會擋住 W 的第一次。
   *
   * 為什麼是「作用域」而不是第二個冷卻數字:末日預言的 `perAbilityCooldown`
   * 讀起來像另一格秒數,但它問的其實是**同一個 10 秒該怎麼記帳**。做成第二個
   * 數字就會有「兩個都填了誰贏」這個沒有正確答案的問題,而任何一種答法都要
   * 靠註解解釋(同 `IntervalHookSystem.ts` 對 `everySec` 的論證)。
   *
   * 為什麼是**槽位**而不是技能 id(決策點 1-4 的 A vs B):對**一位英雄**
   * 「每槽位」≡「每技能 id」(一格只放得下一支),而槽位**已經**是
   * `fireHooks(…, abilitySlot)` 的參數 —— 技能 id 要多接一條參數鏈,換來的是
   * 同一個答案。
   *
   * ⚠️ **`onDamageDealt` / `onDamageTaken` / `onBasicAttack` / `onKill` /
   * `onInterval` / `onStunned` 發射時 `abilitySlot` 是 `undefined`**,所以
   * `"perAbilitySlot"` 在那些事件上**退化成一份全域冷卻**(所有無槽位的觸發
   * 共用同一格)。它只在 `onAbilityCast` / `onAbilityHit` 上真的分得開。
   * 這一句必須留在欄位說明裡:不然作者會以為它處處有效,而「退化」和「生效」
   * 在畫面上長得一模一樣。
   */
  internalCooldownScope?: "source" | "perAbilitySlot";
  /**
   * Proc probability 0..1, rolled on the seeded `world.rng` every time the hook
   * would otherwise fire (absent = always). This is the WC3 proc-chance column
   * (`Hbh1` 狂怒擊機率 for Bash, `Ocr1` 致命一擊機率 for Critical Strike,
   * `War1` 動地跺機率 for Pulverize …) — without it a "10 % chance to deal +75"
   * on-attack passive can only be ported as an unconditional bonus, which is a
   * different ability. Rolled AFTER the internal-cooldown gate, and the ICD
   * clock only starts when the roll SUCCEEDS (WC3 semantics: a failed proc does
   * not consume the cooldown).
   */
  chance?: number;
  /**
   * 機率 = **一項三圍** × 係數,夾在 `[min, max]` —— 朗基努斯之槍 godie-i018
   * 「(總敏捷)% 機率性造成等同(總力量)之閃電傷害」。ABSENT = 用上面的
   * `chance`,也就是這個欄位出現之前的每一份文件。
   *
   * ─────────────────────────────────────────────────────────────────────────
   * 為什麼 `chance` 不夠
   *
   * `chance` 是一個**常數**(WC3 的 proc 欄位 `Hbh1`/`Ocr1`/`War1`)。owner 的
   * 文案要的是一個**活的**門檻:敏捷會隨等級、裝備與 能力屬性強化 一路長。
   * 寫成常數就是另一件武器,而且文案會說謊(失敗形態 ②)。
   *
   * ⚠️ 這**不**違反 `sim/content/condition.ts` 的 DECISION 1(亂數流的位置固定):
   * 抽的**次數**與**時機**完全沒變 —— 有 `chanceFrom` 就抽一次,跟有 `chance`
   * 時一樣、在同一行、在 ICD 閘之後、在 `condition` 之前。動的只有**門檻**,
   * 而門檻是世界狀態的純函式,每個複本算出同一個值。
   *
   * ⚠️ `chance` 與 `chanceFrom` **不可以同時出現**(`zHookDefBase` 在載入時擋)。
   * 兩個都在就會有「是相乘還是取代」這個沒有正確答案的問題,而任何一種選法
   * 都會在某一張卡上讀起來像 bug。
   *
   *   · `coeff` —— 每 1 點三圍值多少機率。「(總敏捷)%」= 0.01。
   *     上界 `CHANCE_PER_ATTR_MAX`,是**打錯數字的守衛**:寫 1 而不是 0.01
   *     等於「一點敏捷 = 100%」,也就是永遠觸發,而 clamp 會**幫它藏起來**。
   *   · `basis` —— 省略 = `"total"`(含裝備),因為文案寫的是「**總**敏捷」。
   *     `"base"` 是原作 `GetHeroStatBJ(…,false)` 的那一半(見 attrSources.ts)。
   *   · `min` / `max` —— 夾住。**兩端都是欄位,不是寫死的分支**:
   *     「(總敏捷)%」在後期是無界的(120 敏 = 120%),而「要不要真的讓它變成
   *     必定觸發」是 owner 的決定,不是我的。出貨值與實測數字寫在道具的
   *     `authoringNote` 上。
   */
  chanceFrom?: {
    attr: AttrKey;
    basis?: AttrBasis;
    coeff: number;
    min: number;
    max: number;
  };
  /**
   * 觸發條件 — WHEN this hook pays out (owner 2026-07-30:「on-attack by
   * condition 這個一定要實作 … `>= < =` 某個常數或某個數值條件，最常見是我方或
   * 敵人的屬性、HP/MP 數值或百分比 … 當然機率也是 condition，甚至可以組合技」).
   * Absent = always, which is every hook authored before this field existed.
   *
   * WHY IT DOES NOT REPLACE `chance` ABOVE. `chance` is the WC3 proc COLUMN —
   * one number lifted straight out of `Hbh1`/`Ocr1`/`War1`, and 100+ ported
   * passives carry it. `condition` is the general gate, and `{kind:"chance"}` is
   * one leaf of it. Both are evaluated and BOTH must pass; keeping them separate
   * means a faithful WC3 import never has to be rewritten into a tree, while a
   * card that needs 「非英雄 且 血量 < 35%」 is not forced to launder itself
   * through a bare probability (which is exactly the lie 獸矛 was shipping).
   *
   * ⚠️ CONSUMES `world.rng` — see DECISION 1 in sim/content/condition.ts for the
   * draw order, and `effects/hooks.ts` for where it sits relative to the ICD.
   */
  condition?: EffectCondition;
  /**
   * 職業限定閘 — WHO this hook pays out for (owner 2026-07-30's 近戰專用擴散 /
   * 法師保命 / 坦克衝刺 / 射手百分比傷害). Absent = everybody, which is every
   * hook authored before this field existed, so arming it is a strict no-op
   * until content opts in.
   *
   * Evaluated per FIRE against the source's carrier — see
   * `sim/content/requirement.ts` for the axes (and for why `role` is not one)
   * and `effects/hooks.ts` for the ordering. Authorable today only on
   * `item@1.passive` and `item@1.auras[].hooks` (`schema/item.ts`); abilities
   * and augments share the runtime type but have no authoring surface for it.
   */
  requires?: ClassRequirement;
}

/**
 * `"aura"` is the only kind the sim WRITES rather than content authoring: it
 * marks a source PROJECTED onto a unit by somebody else's `auras` block while
 * that unit stands inside the radius. `auraSystem` owns every one of them and
 * removes them the moment membership lapses — nothing else may create, mutate or
 * detach a source of this kind. See sim/aura/aura.ts.
 */
export type ModifierSourceKind = "champion" | "item" | "augment" | "passive" | "buff" | "aura";

export interface ModifierSource {
  /** unique instance id, e.g. "item:ember-rod#2", "aug:bloodlust", "buff:slow#t123" */
  id: string;
  kind: ModifierSourceKind;
  modifiers?: StatModifier[];
  /**
   * 三圍 (力/敏/智) this source grants while attached — 四魂之玉's 「力敏智+30」,
   * 朗基努斯之槍's 「力量+12 敏捷+12」.
   *
   * WHY IT IS NOT A `StatModifier`. 力/敏/智 are not members of {@link Stat}:
   * one point of STR feeds maxHealth AND healthRegen AND ad, and one point of
   * AGI feeds armor additively but attack speed MULTIPLICATIVELY on the
   * champion's own base (`stats/attributes.ts`). Expanding a grant into the
   * nine equivalent stat modifiers would need the champion's authored base AND
   * the live combat-env coefficients AT ATTACH TIME, so it would go stale the
   * moment an operator retunes `strToMaxHealth` in the 戰鬥系統 console — the
   * same argument that made `AttrBonus` a separate accumulator for the
   * 能力屬性強化 card (#260). Carrying the ATTRIBUTE keeps `championStatBase`
   * the single 三圍 → 數值 definition, so an item point and a card point are
   * indistinguishable by construction rather than by agreement.
   *
   * Folded into the champion's BASE by `statPipeline.recomputeStats`, at
   * exactly the place `ChampionComp.attrBonus` is folded. See
   * `stats/attrSources.ts` for why it rides the SOURCE (unequip / 變身
   * correctness) and for the 「總」 vs 「基礎」 split the source map itself uses.
   * Absent on every source in the catalogue except those two items, so arming
   * this field moved no other number.
   */
  attributes?: AttrGrant;
  /**
   * RUNTIME (never authored): 三圍 this source has EARNED during the match —
   * the DYNAMIC sibling of {@link attributes}, written only by
   * `effects/grantAttribute.ts` when the effect carries `store: "source"`.
   * 甘豆腐之袍 godie-i03f 「每殺死一名英雄可以額外獲得 10點智慧，上限 160」.
   *
   * WHY IT IS A SECOND FIELD RATHER THAN `+=` INTO `attributes`. `attributes`
   * is forwarded BY REFERENCE straight off the registered `ItemDef`
   * (`economy/itemSource.ts`), which is the parsed content document shared by
   * every champion in every concurrent match on the shard. Mutating it would
   * hand 甘豆腐之袍's stacks to everybody who ever equips one, forever, and
   * would persist into the next match because the registry outlives the world.
   *
   * WHY IT IS ON THE SOURCE AND NOT ON `ChampionComp.attrBonus`. Same argument
   * `stats/attrSources.ts` makes for `attributes`, and here it is the whole
   * requirement rather than a nicety: 「賣掉這件袍子，160 點智慧會留在身上」 is
   * the exact defect this replaces. `detachSource` drops the accumulator with
   * the item — the stacks cannot survive an unequip, because there is nowhere
   * for them to survive. Re-buying starts a fresh source at zero, which is the
   * honest reading of 「這件裝備疊了幾層」.
   *
   * Folded by `stats/attrSources.ts::sourceAttrGrants`, i.e. the same fold and
   * the same `expiresAtTick` skip as `attributes`, so nothing downstream (stat
   * pipeline, shop preview, codex) learns a second concept.
   */
  attrEarned?: AttrBonus;
  hooks?: HookDef[];
  grantedAbilities?: AbilityId[];
  /**
   * ⭐ G4 —— **這份來源是第幾階授予的**（RUNTIME、NEVER AUTHORED、無 Zod 鏡像）。
   *
   * 缺席 = **1** = `fireHooks` 在這個欄位之前寫死的那一欄，逐位元不變。
   * 寫入端保證整數且 ≥ 1；讀取端一律 `Math.max(1, src.grantRank ?? 1)`。
   *
   * 「這條 hook 是第幾階授予的」是**那個來源**的性質 —— 與 `evasionScope` /
   * `vision` / `block` / `critStrike` 騎在 source 上是同一個論證：聚合成任何
   * 東西的那一刻它就沒了。
   * ⛔ 不可以在 `fireHooks` 裡回頭查 `world.abilities` 反推 rank：一份來源可能
   * 來自道具（無 rank）、augment（無 rank）、靈氣（rank 屬於**發射者**不是接收
   * 者）、`applyBuff`（rank 屬於**那一次施放**）—— 四種來路查法各不相同，寫成
   * 四個 if 就是第〇·五守則的越線。
   *
   * ⚠️ 只有**技能 `passive.ranks[]` / `applyBuff` / 靈氣**三條載體帶得到它。
   * 道具與增益卡的 hook 永遠是第 1 欄（schema 的 refine 會把那種 `perRank`
   * 擋在載入時）。
   */
  grantRank?: number;
  /**
   * ⭐ G5（state.exclusive-group@1）—— 這份來源屬於哪一個**互斥組**。
   *
   * 缺席 = 不屬於任何組 = 永遠不會被別人拔掉，也不會拔掉別人（也就是今天：
   * `attachSource` 是無條件 push，三份形態 buff 會同時掛著且乘區相乘）。
   *
   * 同組的新來源掛上時，舊的整份被拔掉（或被回絕，見
   * `applyBuff.exclusiveOnExisting`）—— 15-02/03/04 那種「身上永遠只有一種
   * 戰型」寫的就是這個。
   * ⛔ 它與 `championForm` / `transform.counterpartId`（3D 身體那一半）**不是**
   * 同一件事，⛔ 也不可以拿它假裝三個 3D 形態。
   *
   * ⛔ 刻意**不**放進 `SOURCE_GRANT_SHAPE`：那一族的共同性質是「sim 端不問
   * kind、四個授權面都真的生效」，而互斥的**執行者**只有 `applyBuff`（拔除發生
   * 在掛上的那一刻）。放進去會讓一件道具寫得出 `exclusiveGroup` 而永遠沒有東西
   * 去拔它 —— 失敗形態②的鏡像。
   */
  exclusiveGroup?: string;
  /**
   * ⭐ G10 —— 這份來源**同時是一個具名標記**（`applyBuff.statusId`）。
   *
   * 缺席 = 這份來源不是任何標記 = 今天（240 份用 `applyBuff` 的文件逐位元不變）。
   *
   * ⭐ 為什麼是「同一個物件」而不是「applyStatus 順便掛 modifiers」：後者要把
   * `ModifierSource` 掛成 status 的衛星，於是**每一個 status 移除點都要串接
   * 拆除**（到期 / `statusBreak` / `clearPools` / `clearForFreshBody` / stacks
   * 歸零那條 splice —— 五處），而漏掉任何一處的後果是一條**永遠拔不掉的屬性
   * 修改**，沒有錯誤訊息。同一個物件的串接數是**零**：來源消失（到期／淨化／
   * detach）標記就跟著消失，因為沒有第二個物件。
   *
   * ⚠️ 它是**身分**不是行為：CC 語意（stun/root/…）仍然只住在 `StatusEffect`
   * 上。讀取端是 `effects/effectCommon.ts` 的 `hasStatus` / `statusStacks`
   *（它們已經是 `world.status` + `world.marks` 兩本帳的統一讀取器，這是第三本）。
   */
  statusId?: StatusId;
  /** for buffs: expiry tick (undefined = permanent) */
  expiresAtTick?: number;
  /**
   * ⭐ GH#354 / G3 —— 這份**永久**來源的永久只到**這一回合結束**
   *（`applyBuff.permanentScope: "round"`）。
   *
   * 缺席 = 整場 = 今天（既有的每一份永久來源逐位元不變）。
   *
   * ⚠️ 它與 `expiresAtTick` 是**兩個不同的時鐘**，⛔ 不可以拿後者假裝它：
   * 回合長度是 host 端的相位機決定的（`combatMaxTicksForRound`，決賽 180 秒
   * 而平時 100 秒，而且火圈提前結束一場是常態），sim 端沒有那份帳。
   * 施加時算一個「猜測的回合結束 tick」就是把一個**事件**寫成一個**數字** ——
   * 猜長了跨進下一回合，猜短了在回合中途無聲消失，而兩種都看不出來。
   *
   * 拆除點只有一個：`clearRoundScoped`（`sim/clearPools.ts`），由 host 在
   * **進入戰鬥的那一刻、發射 `roundStart` 之前**對每一個席位跑一次。
   * ⛔ 刻意**不**掛進 `clearForFreshBody` —— 那一支復活時也會跑，
   * 於是「這一回合」會變成「直到你死一次」（一個值不等於它名字的旋鈕）。
   */
  roundScoped?: boolean;
  /**
   * A4(#278) —— 這個來源可不可以被淨化拔掉。缺席 = 讀
   * `world.dispelRules.buffDefaultDispellable`（**出貨 false**）。
   *
   * ⛔ 這一格必須是**施加時寫下的欄位**,不可以推導:一個 source 可以同時帶
   * `{ms,+0.3}` 與 `{armor,-0.5}`,任何「看修飾詞猜極性」的啟發式都會在某一張
   * 卡上錯,而且從編輯器修不掉。
   */
  dispellable?: boolean;
  /** A4(#278) —— 增益還是減益。同上,施加時寫下,不推導。 */
  polarity?: "buff" | "debuff";
  stacks?: number;
  /**
   * PRESENTATION tag (task #244): this source's `stacks` are meant to be SEEN.
   * `visualStackCount` sums them and the snapshot turns the total into two
   * ENTITY_FLAG threshold bits, so a "the silhouette walking at you is getting
   * bigger" mechanic needs no new wire field and no per-champion netcode. Set
   * from the content's `applyBuff.stackVisual`. Never alters the stat pipeline.
   */
  visualStacks?: boolean;
  /**
   * Pure PRESENTATION tag (does NOT alter the stat pipeline or any damage
   * number): marks this source as a "damage-reduction / guard" buff. While an
   * active source with this flag is on a target, incoming hits read as
   * `blocked` in the damage/hitImpact events (guard spark + lighter knockback),
   * exactly as a shield-absorb does. Lets content express a defensive buff as a
   * block without inventing a new mitigation mechanic. Default (absent) = off.
   */
  damageReduction?: boolean;
  /**
   * AURAS (靈氣) this source PROJECTS onto other units — the only way a
   * ModifierSource reaches past the unit carrying it. Each entry names a radius,
   * a team filter and a payload; `auraSystem` applies that payload as its own
   * `kind: "aura"` source to everyone inside, every tick, and removes it as they
   * leave or die. Absent on almost everything; see sim/aura/aura.ts for the
   * model. Authored via `ability@1.passive.ranks[N].auras`.
   */
  auras?: AuraDef[];
  /** runtime: last tick each hook fired (internal-cooldown bookkeeping) */
  hookLastFired?: number[];
  /**
   * RUNTIME (never authored), **只有 `internalCooldownScope: "perAbilitySlot"`
   * 的 hook 會用到**:`hooks[hi]` ↔ 「這個槽位上一次觸發是第幾 tick」。
   *
   * 為什麼是第二個欄位而不是把 {@link hookLastFired} 改成 Record:那個陣列是
   * **每一份既有 hook** 的冷卻記帳,改它的形狀等於同時改動 100+ 支移植過來的
   * WC3 被動的節奏 —— 而這一批的硬約束是「省略新欄位 = 逐位元不變」。
   * 兩個欄位並存的代價是一行 `?? -1e9`;合併的代價是一次全內容重測。
   *
   * ⚠️ 索引順序與 `hooks` **完全相同**,所以 `hooks` 陣列被換掉時(變身
   * re-resolve、靈氣 rank-up)這一份和 `hookLastFired` **必須一起作廢** ——
   * `aura/aura.ts` 兩個都清。
   *
   * ⚠️ 只做 `get`/`set`,**從不迭代** —— `sim/purity.test.ts` 禁的是「靠 Map
   * 迭代順序決定行為」,而這裡的 key 只被用來查一個數字。
   */
  hookLastFiredBySlot?: (Map<string, number> | undefined)[];
  /**
   * ⭐ S6 RUNTIME（never authored）—— `hooks[hi]` 已經發動過幾次。
   * 只有填了 {@link HookDef.maxTriggers} 的 hook 才會長出這一格。
   *
   * ⚠️ 依 `hooks[hi]` **位置**索引，理由與 {@link hookLastFired} 逐字相同 ——
   * 所以 `hooks` 陣列被換掉時（變身 re-resolve、靈氣 rank-up）這一份**必須**
   * 跟著一起作廢。`aura/aura.ts` 是那個清除點；漏掉它的後果是一次靈氣重新落座
   * 就把已經用掉的那一發**還給玩家**，而全套測試會是綠的。
   */
  hookFireCount?: number[];
  /**
   * ⭐ S6 RUNTIME —— {@link HookDef.perTarget} 的那一半：`hooks[hi]` ↔
   *「對這個身體發動過幾次」。索引順序同上，作廢規則同上。
   * ⚠️ 只做 `get`/`set`，**從不迭代**（`sim/purity.test.ts` 禁的是靠 Map 迭代
   * 順序決定行為，而這裡的 key 只被用來查一個數字）。
   */
  hookFireCountByTarget?: (Map<EntityId, number> | undefined)[];
  /**
   * RUNTIME, `kind: "aura"` only: which emitter/aura projected this source.
   * Written by `auraSystem` when it attaches, read by it when it removes (the
   * linger tail). Never authored, never present on any other kind.
   */
  auraOrigin?: AuraOrigin;
  /**
   * 迴避的**涵蓋範圍** (lane P5) — the two DECISION POINTS of evasion, carried on
   * the source that grants it rather than hard-coded in the roll.
   *
   * WHY IT LIVES HERE AND NOT IN A CONFIG. `Stat.Evasion` is ONE aggregated
   * number (`final = clamp((base+Σflat)·…)`), so it cannot remember that buff A
   * was "dodges spells too" while champion passive B was not. The capability has
   * to ride the SOURCE. `sim/combat/evasion.ts` scans for it; nothing in the
   * stat pipeline reads it, so it changes no stat number and no panel value.
   *
   * ABSENT = TODAY'S SHIPPING BEHAVIOUR, EXACTLY: basic attacks only, true
   * damage never dodged (`combat/evasion.ts` DECISION 1). Every one of the
   * currently authored evasion sources — 3 champion docs, 8 abilities, 1 augment
   * — omits it, so arming this field is a strict no-op until content opts in.
   */
  evasionScope?: EvasionScope;
  /**
   * 隱形 / 真視 capability this source grants (see sim/stealth.ts).
   *
   * WHY IT RIDES THE SOURCE, exactly like `evasionScope`: 「這個 buff 讓我隱形」
   * and 「這個 buff 讓我看得見隱形」 are properties OF THE BUFF. There is no
   * aggregated stat that could carry them, and if there were, a 3-second
   * true-sight consumable would silently promote a permanent-invisibility
   * passive on the same body. `stealthSystem` scans for it once a tick and
   * writes the two derived maps; NOTHING in the stat pipeline reads it, so it
   * changes no stat number and no displayed value.
   *
   * ABSENT (every source in the catalogue today) = today's behaviour exactly:
   * nobody is invisible, nobody has true sight, and `world.stealth` /
   * `world.trueSight` stay empty — which is what keeps every existing replay
   * and digest bit-identical.
   */
  vision?: VisionGrant;
  /**
   * 飛行 (無視碰撞) this source grants — 04-00 翔封界. Rides the source for the
   * exact reason `vision` does: 「碰不碰得到」 is a property OF THE SOURCE, there
   * is no aggregated stat that could carry it, and if there were, a 3-second
   * flight consumable would silently promote a permanent grant on the same body.
   * `flightSystem` scans for it once a tick and writes `world.flight`; NOTHING
   * in the stat pipeline reads it, so no stat number and no displayed value
   * moves. ABSENT on every source in the catalogue except 翔封界's two docs.
   */
  flight?: import("../flight").FlightGrant;
  /**
   * 傷害型別轉換 —— 無視防禦 / 真實傷害家族 (霸王破甲槍 · 死之王的長槍 ·
   * 惡夢魔王碎片)。這個來源會把持有者**打出去**的某一類封包重蓋成另一個
   * `DamageType`。
   *
   * 它騎在 source 上的理由跟 `evasionScope` / `vision` / `flight` 一模一樣,
   * 而且更沒有退路:「我的普攻是真實傷害」是**那件裝備**的性質,聚合成一個
   * `Stat` 的話,「A 這件會轉、B 這件不會」在加總的那一刻就消失了。
   *
   * 讀它的**只有** `combat/damage.ts` 的佇列抽乾迴圈(透過
   * `combat/damageTypeOverride.ts` 的解析器)。統計管線一個字都不讀,所以它
   * 不動任何一個屬性數字、不動面板、不動商店預覽。
   *
   * ABSENT on every source in the catalogue except the three items above ——
   * 也就是說掛上這個欄位對其餘所有內容是**嚴格的 no-op**。
   */
  damageTypeOverride?: import("../combat/damageTypeOverride").DamageTypeOverride;
  /**
   * 格擋 —— 這個來源授予的「擋下傷害」能力 (奇門盾甲 · 黃金聖鬥衣 · 晨曦之光 ·
   * 殺豬刀)。四支文件是同一組軸的四組值,不是四個機制;完整推導在
   * `combat/block.ts` 的檔頭。
   *
   * 它騎在 source 上的理由跟 `evasionScope` / `vision` / `flight` /
   * `damageTypeOverride` 完全一樣:「這件擋 AD+AP、那件只擋致死的」是**那個來源**
   * 的性質。聚合成一個 `Stat` 的話,型別過濾與 `lethalOnly` 在加總的那一刻就沒了,
   * 而一個 30% 的致死格擋會把 50% 的全型別格擋一起變成致死限定(或反過來)。
   *
   * 讀它的**只有** `combat/damage.ts` 的佇列抽乾迴圈(透過 `blockCutFor`)。
   * 統計管線一個字都不讀,所以它不動任何屬性數字、不動面板、不動商店預覽。
   *
   * ABSENT on every source in the catalogue except those four items —— 掛上這個
   * 欄位對其餘所有內容是**嚴格的 no-op**,而且連一次 rng draw 都不會多抽
   * (`blockCutFor` 的 ZERO GUARANTEE),所以既有 replay 逐位元不變。
   */
  block?: import("../combat/block").BlockGrant;
  /**
   * RUNTIME:這個來源的格擋**上一次真的擋中**的絕對 tick
   * ({@link BlockGrant.internalCooldown} 的記帳)。從不被 authored。
   *
   * ⚠️ 為什麼不共用 `hookLastFired`:那是一個依 `hooks[hi]` **位置**索引的陣列,
   * 而格擋沒有位置 —— 而且同一個 source 完全可以同時帶 `hooks` 和 `block`
   * (晨曦之光現在就同時帶 `vision` 與 `block`)。借用 index 0 等於讓第一條 hook
   * 和格擋共用一個時鐘,兩邊互相把對方的內部冷卻洗掉,而且測起來全綠。
   *
   * 絕對 tick,不是遞減計數器(CLAUDE.md 硬性約束,`sim/purity.test.ts` 在守)。
   *
   * ⚠️ `aura.ts` 在 `hooks` 陣列被換掉時會把 `hookLastFired` 設回 `undefined`
   * (索引失效),但**這一格不需要那個處理**:它是一個純量,沒有索引可以錯位,
   * 而「同一個 source、換了一份 grant」繼續沿用同一個時鐘是正確的讀法(冷卻
   * 屬於那個來源,不屬於那份 grant)。目前也沒有任何 `auras` 內容帶 `block` ——
   * 真的有了而且語意要改成「換 grant 就重置」時,加的是 aura.ts 那一段的第二個
   * `if`,不是這裡。
   */
  blockLastFired?: number;
  /**
   * [暴擊吸血] —— 這個來源授予的暴擊 proc (天堂之劍 godie-i01n
   * 「6%機率造成10倍暴擊傷害，暴擊時吸血回復100%傷害」)。完整推導在
   * `combat/critStrike.ts` 的檔頭。
   *
   * 它騎在 source 上的理由跟 `evasionScope` / `vision` / `flight` /
   * `damageTypeOverride` / `block` 完全一樣,而且更沒有退路:那一行**曾經**是
   * `critChance` + `critDamage` 兩條 modifier,而聚合成屬性的那一刻
   * 「10 倍只屬於這 6%」與「這一發吸滿」兩件事同時消失 —— 前者變成「所有暴擊
   * 都 10 倍」,後者根本寫不出來(`Stat.Lifesteal` 無條件而且夾在 0.8)。
   *
   * 讀它的只有 `systems/BasicAttackSystem.ts` 的揮擊點(骰)與
   * `combat/damage.ts` 的吸血段(付款),都是透過 `combat/critStrike.ts` 的
   * 兩個解析器。統計管線一個字都不讀,所以它不動任何屬性數字、不動面板、
   * 不動商店預覽。
   *
   * ABSENT on every source in the catalogue except 天堂之劍 —— 掛上這個欄位對
   * 其餘所有內容是**嚴格的 no-op**,而且連一次 rng draw 都不會多抽
   * (`critStrikeFor` 的 ZERO GUARANTEE),所以既有 replay 逐位元不變。
   */
  critStrike?: import("../combat/critStrike").CritStrikeGrant;
  /**
   * [穿透] —— 這個來源授予的**護甲/魔法穿透**（LoL 四段的段③④）。霸王破甲槍
   * `godie-i00f` 的「普攻無視敵方 100% 護甲」就是 `{scope:"basic", armorPct:1}`。
   *
   * 它騎在 source 上的理由跟 `damageTypeOverride` 逐字相同,而且是**同一個
   * 論證的第二次應用**:穿透要帶**範圍**（只穿普攻 / 只穿技能 / 全部），而
   * 一個 `Stat` 記不住範圍 —— 聚合成一個數字的那一刻,「這一件只給普攻」就沒了。
   *
   * 讀它的**只有** `combat/damage.ts` 的兩個 `mitigate*`（透過
   * `combat/penetration.ts::resolvePenetration`）。統計管線一個字都不讀,
   * 所以它不動任何屬性數字、不動面板、不動商店預覽。
   *
   * ABSENT on every source in the catalogue except 霸王破甲槍 —— 掛上這個欄位
   * 對其餘所有內容是**嚴格的 no-op**（`resolvePenetration` 沒找到任何一份就回
   * 共用的 `NO_PENETRATION`,而 `resistAfterPenetration` 對它是恆等式）。
   */
  penetration?: import("../combat/penetration").PenetrationGrant;
  /**
   * [型別連擊免疫] —— 這個來源授予的「連續 N 發同型別之後免疫該型別」
   *（史萊姆裝）。完整推導在 `combat/typeStreakImmunity.ts` 的檔頭。
   *
   * ⛔ **不做成 Stat、也不做成 ModOp**：`block`(上面) 與 `critStrike` 已經把
   * 同一個論證寫過兩次 —— 型別過濾與**門檻**在「加總成一個數字」的那一刻就沒了。
   * 一個 `Stat.TypeStreakImmunity` 記不住「哪幾型算連擊」，也記不住「這一條的
   * 門檻是 2 而那一條是 5」。
   *
   * 讀它的**只有** `combat/typeStreakImmunity.ts` 的兩支解析器（從
   * `combat/damage.ts` 的佇列抽乾迴圈呼叫）。統計管線一個字都不讀，所以它不動
   * 任何屬性數字、不動面板、不動商店預覽。
   *
   * ABSENT on every source in the catalogue today —— 掛上這個欄位對其餘所有內容
   * 是**嚴格的 no-op**（那兩支解析器的 ZERO GUARANTEE），既有 replay 逐位元不變。
   */
  typeStreakImmunity?: import("../combat/typeStreakImmunity").TypeStreakImmunityGrant;
  /**
   * ⭐ 2026-08-19 ——【死亡遺留】：帶著這份來源的人在場時，同區的英雄陣亡會在
   * 屍體原地留下一個持久的光環物件。71-00 暗夜契約的**暗夜旗**是出貨的那一支。
   *
   * 同前八格：讀它的**只有** `sim/deathWard.ts`，而它走 `StatsComp.sources`
   * 且**不問 `kind`** —— 所以掛在天生技 rank、道具、增益卡或一份 `applyBuff`
   * 生出來的限時來源上，行為完全相同，⛔ 不需要第二支掃描器。
   *
   * ⚠️ 它取代了 `config.arena-rules@1.nightPact`：那個區塊把**一支技能的**
   * 半徑／上限／受益者／加成寫在**競技場規則**裡，並用一格 `abilityIds` 把
   * 引擎綁死在 `godie-u00k.passive` 上（CLAUDE.md 第〇·五守則的越線）。
   */
  deathWard?: import("../deathWard").DeathWardGrant;
  /**
   * ⭐ M5(2026-08-23) ——【紮根】：帶著這份來源期間**不能移動**，但**可攻擊、
   * 可施法**（owner 2026-08-13 逐字）。第十格。
   *
   * ⛔ 它**不是**【定身】：`root` 是 CC（可被淨化、被免控擋、計進 CC 戰績），
   * 而這三件事紮根一件都不是 —— 掛在**來源**上就結構性地全部成立。
   * 同前九格：讀它的**只有** `sim/movementHold.ts`，而它走 `StatsComp.sources`
   * 且**不問 `kind`**，⛔ 不需要第二支掃描器。
   *
   * ⚠️ 只有 `true`：`immobile: false` 會是一份掛得上去卻什麼都不做的來源。
   */
  immobile?: true;
  /**
   * ⭐ M5(2026-08-23) ——**主屬性覆寫**（力→智…）。第十一格。
   *
   * `Stat` 上沒有「主屬性是誰」這個數字，所以既有的 modifier 一條都表達不了它；
   * 在這一格之前，70-00 紮根的 STR→INT **只有換一整份英雄卡**（＝變身）做得到。
   * 讀它的只有 `stats/statPipeline.ts::sourcePrimaryAttribute`（最後掛上的贏）。
   */
  primaryAttribute?: import("./attributes").PrimaryAttributeGrant;
}

/**
 * WHAT a given evasion source is allowed to dodge. Both flags default to FALSE,
 * which reproduces WC3 `Evasion` (`Aevd`) semantics — attacks only.
 */
export interface EvasionScope {
  /**
   * Also roll against ABILITY damage (any packet whose origin is not `"basic"`).
   * The roll then happens at damage RESOLVE, not at cast — see
   * `combat/evasion.ts` DECISION 5 for why that is a different (and weaker)
   * moment than the basic-attack roll, and what it means for on-hit hooks.
   */
  abilities?: boolean;
  /**
   * Also roll against `type: "true"` packets. OFF by default on purpose: the
   * arena fire-ring burn is true damage (#270), and a dodge chance against the
   * closing ring would be a balance hole, not a defensive stat.
   */
  trueDamage?: boolean;
}
