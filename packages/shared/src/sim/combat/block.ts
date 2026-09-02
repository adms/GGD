/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  格擋 — ONE source-carried gate for four items that promise three mechanics
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * owner 的 49 支棱彩傳說裡有四支帶 `[格擋]`,而它們**不是同一個機制**:
 *
 *   奇門盾甲   godie-i00j 「[格擋] 50%格擋 AD 及 AP 傷害 (真實傷害無法阻擋)」
 *   黃金聖鬥衣 godie-i00s 「[格擋] 50%機率抵擋 100% AP傷害」
 *   晨曦之光   godie-i016 「[格擋] 30%機率 抵擋致命一擊(超過現存生命的傷害)」
 *   殺豬刀     godie-i06g 「[格擋] 30%機率 抵擋致命一擊(超過現存生命的傷害)」
 *
 * 拆開來是三件事:**型別過濾的機率門**、**擋掉的比例**、**只對致死封包生效**。
 * 三個 bespoke 分支會讓「50% 到底是機率還是比例」這種問題永遠只能靠改程式回答,
 * 所以這裡做成一個帶六根軸的 {@link BlockGrant},四支文件只是這六根軸的四組值。
 * (原本是四根;`lethalBasis` 與 `internalCooldown` 是後來各補的一根。軸數寫在
 * 文字裡會腐爛,所以 `content/blockNoteTruth.test.ts` 拿 `zItemBlockGrant.shape`
 * 的鍵數去比對每一份出貨 `authoringNote` 裡的「N 根軸」。)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 「50%格擋」到底是機率還是比例 —— 用證據回答,而不是猜
 *
 * 奇門盾甲那一行沒有寫「機率」兩個字,所以它可以讀成「50% 的機率整包擋掉」或
 * 「每一發都擋掉 50%」。**兩個證據都指向機率**:
 *
 *   · w3x 原始資料(`docs/content/reconciliation/items.md` 的 `godie-i00j` 那一列):
 *     `A0US`◄`Ansk`→`Assk`「Hardened Skin(Naga Turtle)」**降低傷害機率 (%) 50**。
 *     那個欄位的名字自己就是「機率」。
 *   · 同一支 WC3 技能 `Ansk`、同一個 50,也掛在 黃金聖鬥衣(`A035`,同樣是
 *     降低傷害機率 (%) 50),而 owner 對那一支寫的是「50%**機率**抵擋」。
 *     同一個來源欄位、同一個數字,owner 在其中一支明寫了機率。
 *
 * 所以出貨值是 `chance: 0.5, fraction: 1`。**但 `fraction` 仍然是一個欄位**,
 * 正是因為這一題有過爭議:owner 若要改讀成「每發擋一半」,那是後台把
 * `chance` 改 1、`fraction` 改 0.5,不是一次 PR(CLAUDE.md 第一守則)。
 *
 * ⚠️ WC3 的 `Ansk` 其實是「擋掉**固定 100/125 點**」(忽視的傷害 100 / 125),
 * 不是比例。這裡**沒有**做「固定點數」那根軸 —— owner 的文案一個字都沒提到點數,
 * 而一根沒有任何內容在用的軸就是失敗形態 ②(欄位存在、沒有人餵它)。要補的話
 * 是 `flatBlocked?: number` 一個欄位加 `cut = min(impact, flat)` 一行。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② 「真實傷害無法阻擋」必須從欄位掉出來,不是一個 `if`
 *
 * `damageTypes` 是一個**明列**的陣列,而且是**必填**。奇門盾甲寫
 * `["physical","magic"]`,那句括號註解就是這個陣列的內容,不是程式裡的一行
 * `if (type === "true") return 0`。黃金聖鬥衣寫 `["magic"]`,所以「100% AP傷害」
 * 也是同一個欄位表達的 —— 兩支的差別是資料,不是分支。
 *
 * 必填而不是「省略 = 物理+魔法」:一個預設值會讓「這件擋不擋真傷」變成一個
 * 讀者要去別的檔案查的問題,而這正是這四行文案唯一講清楚的事。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ 它放在傷害佇列的哪裡,以及為什麼**不是** `refusesDamage` 旁邊
 *
 * 直覺會說「跟 `refusesDamage` 一起,免疫怎麼做格擋就怎麼做」。那是錯的,而且
 * `refusesDamage` 自己的註解就寫了為什麼它要 `continue`:
 * 「a refused packet must not walk the shield pool and must not emit `damage`,
 *  or the client plays a hit that never happened」。
 *
 * **無敵是「這一發沒有打到我」;格擋是「這一發打到了,被我擋下來」。** 後者在這個
 * 專案裡已經有一條完整、出貨中、有客戶端消費者的路 —— **護盾吃滿一發**:
 *
 *   · `combatResolveSystem` 讓 `dmg` 變 0、`hp` 不動、`blocked = true`,
 *     然後照常 `emit("damage", { amount: 0, blocked: true })`;
 *   · `ui/combatText.ts` 的 `combatTextCategory` 有一條專門的分支
 *     「Fully absorbed: the useful fact is "that was blocked", not "0"」
 *     → 回 `"guard"`,畫面上就是「擋下」;
 *   · `combat/hitFeel.ts` 的 `deriveCosmetics(tier, type, isBlock, …)` 在
 *     `isBlock` 時把 `sparkKind` 換成 `"block"`、震動 ×0.6、鏡頭 kick ×0.5;
 *   · `apps/client/src/GameApp.ts` 的 `damage` handler 有一段
 *     `if (d.blocked === true && … target === localId) playContextualVoice(blocker, "block")`
 *     —— 你的英雄會**喊出格擋語音**。
 *
 * 所以格擋**不需要新事件**,因此也不需要動 `net/eventFanout.ts` 的兩檔契約:
 * 它借用的是一條已經有真正消費者的線。這比新增一個 `block` 事件更安全 ——
 * 這份清單自己的檔頭就記著 `evade`/`explosion`/`buffApply` 曾經「做完、測過、
 * 出貨,然後在遊戲裡不存在」,而 `immune` 到今天仍然是「過了線、沒有人畫」。
 *
 * 位置因此是:**`mitigate()` 之後、護盾池之前**。三個理由,每一個都是可觀察的:
 *   · 之後 → `impact` 已經過了護甲/魔抗,「擋掉一半」擋的是玩家實際會吃的量;
 *   · 之前 → 格擋**不吃你的護盾**(擋掉的那一份根本沒進池子);
 *   · 而 `applyImpact` 收到的仍是**擋之前**的 `impact` —— 跟護盾完全一致
 *     (damage.ts 檔頭:「a fully-blocked heavy hit still block-freezes」),
 *     所以一發被完全擋下的重擊照樣有硬直與擋格火花。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ④ 致死判定需要**當下的血**,而這個位置剛好拿得到
 *
 * 「超過現存生命的傷害」只有在算完減傷、而且**還沒動到護盾**的那一刻才問得準:
 * 太早問(免疫閘那裡)讀到的是還沒過護甲的數字,太晚問(扣完血之後)人已經死了。
 * 這個閘同時拿得到 `impact`、`hp.hp` 與**這一發吃得到的護盾總額**,所以
 * {@link BlockGrant.lethalBasis} 兩種讀法都表達得出來,而且不必再算一次。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑤ 多來源:**鏈式獨立判定**,剩餘往下傳(owner 2026-07-31 的裁決)
 *
 * 兩件都帶 30% 致死格擋(晨曦之光 + 殺豬刀)時,答案是 30% 還是 51%?
 * **owner 2026-07-31 裁決:**
 *
 *   「這種情形應該是獨立判斷兩次,拿第一次檔掉剩餘繼續算下一次」
 *
 * 所以是 **51%**(1 − 0.7 × 0.7),而且「鏈」這個字是字面的:每個合格來源依
 * `sc.sources` 的插入序**各抽各的**,擋中的那一個從**剩餘**傷害裡扣掉自己的
 * `fraction`,再把剩下的交給下一個。兩個 `fraction: 0.5` 都擋中 ⇒ 剩 0.25。
 *
 * 這條規則本身是 {@link BlockStacking} 欄位(`sim/blockRules.ts`),出貨值
 * `independent` 就是 owner 說的那一個;舊的「取 `chance × fraction` 最大的一個、
 * 只抽一次」保留成 `best`,後台一個下拉選單就切得回去。**選項存在的理由寫在
 * `blockRules.ts`,不寫在這裡** —— 這裡只描述兩條分支各自在做什麼。
 *
 * 鏈式帶出兩組必須明講的決定:**走訪順序,以及它對亂數流的真實影響**;還有
 * **`lethalOnly` 在鏈裡對誰判致死**。
 *
 *   · **順序** = `sc.sources` 的**插入序**,和 `evasion.ts` / `critStrike.ts` /
 *     `fireHooks` 走同一個陣列同一個方向。不是 Map 迭代序(`itemSets.ts`:
 *     「Slot order, not Map order」),也不另外按 id 排序 —— 理由見下一點。
 *   · ⚠️ **2026-08-01 更正(第三守則):這一段原本的理由是量出來就倒的。**
 *     舊文字寫「`attachSource` 是 `sources.push`,新買的一件接在尾巴,於是
 *     『多帶一件格擋』**不會改變**原本那件會拿到的那一次 draw —— 它拿的是
 *     **下一次**」,並且拿「按 `src.id` 排序會把既有來源的 draw 整串往後推、
 *     既有 replay 全部漂掉」當成不排序的理由。**兩句都是假的**,而且只有第一
 *     發封包看起來像真的:每一發封包多走一個合格來源就**多消耗一次 draw**,
 *     所以第二發起,既有那一件讀到的就是亂數流上完全不同的位置 —— 這跟它排在
 *     第幾格無關,插入序一樣會漂。
 *
 *     實測(直接呼叫 `blockCutFor`,seed 20260801、`chance: 0.3`、
 *     `fraction: 0.01` 讓鏈不會提早結束、連打 30 發、讀**第一件**的
 *     `blockLastFired` 有沒有被蓋):
 *
 *       一件  → 第一件擋中的封包 = 1, 4, 6, 9, 10, 14, 15
 *       兩件  → 第一件擋中的封包 = 1, 5, 8
 *
 *     第 1 發之後就分岔了。四顆種子(20260801 / 1234 / 7 / 99)全部分岔。
 *   · **真正成立的性質**,寫清楚免得下一個人再推導出上面那句:插入序保證的是
 *     **同一組來源**在每個 replica 上以同一個順序被走訪 —— 那是**決定性**,
 *     不是「換裝備不影響舊 draw」。多帶一件格擋**確實**會讓同一顆種子跑出不
 *     一樣的比賽,而那沒有關係:那是一次**內容變更**,不是把同一場比賽重播一
 *     次。replay 重播的是同一份裝備 + 同一顆種子,那條路上沒有人多買東西。
 *   · **那為什麼還是不排序**(結論沒變,理由換了):`sc.sources` 是 push/splice
 *     陣列,插入序是它**本來就有**的、零成本的全序,而且 `evasion.ts` /
 *     `critStrike.ts` / `fireHooks` 三處既有先例全部走同一個陣列同一個方向。
 *     按 `src.id` 排序要多一個比較器、多一次排序,而**換不到任何東西** ——
 *     它一樣改變不了「多一件就多一次 draw」。不排序是照先例、省一個比較器,
 *     不是因為排序會破壞什麼。
 *     一發封包消耗的 draw 數 = 「走到它時仍然合格」的來源數,而不是身上有幾件。
 *   · **`lethalOnly` 在鏈裡對誰判致死**:owner 的原話是「拿第一次檔掉**剩餘**
 *     繼續算下一次」,所以致死判定的被除數是**剩餘傷害**,不是原始 `impact`。
 *     具體後果:一件 50% 部分格擋先把 2000 砍成 1000,而你只剩 900 血時,致死
 *     格擋**仍然**觸發(1000 > 900);砍成 800 時就**不觸發**了,因為那一發已經
 *     殺不死你 —— 一個保命技不該替一發打不死人的傷害燒掉。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑥ 內部冷卻 —— owner 的第二條裁決,而且是**絕對 tick**
 *
 * owner 2026-07-31:「致命一擊格擋要不要內部冷卻? => 冷卻 1秒」
 *
 * {@link BlockGrant.internalCooldown} 是**秒**,出貨在晨曦之光與殺豬刀上都是
 * `1`。w3x 原始技能寫的是 Cool 45 / Cool 100,owner 知道並刻意選了 1 ——
 * 那兩個數字是原作的,不是這個遊戲的。
 *
 * 記帳在 `ModifierSource.blockLastFired`,存的是**上一次真的擋中的絕對 tick**,
 * 判斷寫成 `world.tick - blockLastFired < icdTicks`。沒有遞減計數器
 * (CLAUDE.md 硬性技術約束,`sim/purity.test.ts` 在守)。
 *
 * 兩個跟著它走的決定,兩個都照 `effects/hooks.ts` 的既有先例,不是新發明:
 *   · **冷卻閘在骰子之前** —— 被冷卻擋掉的來源**不抽 rng、不燒冷卻**。hooks.ts
 *     對 `requires` / `damageSource` 寫過同一段理由:一個必定不會觸發的來源不
 *     可以偷偷推進亂數流。
 *   · **只有真的擋中才記時間** —— 抽輸的那一次不重置冷卻(hooks.ts:「A failed
 *     roll leaves the ICD clock alone」,`content/condition.test.ts` 有守衛)。
 *
 * ⚠️ 為什麼不重用 `hookLastFired`:那是一個**依 `src.hooks` 位置索引**的陣列
 * (`hooks[hi]` ↔ `hookLastFired[hi]`)。格擋不是 hook、沒有位置,而**同一個
 * source 真的會同時帶 `hooks` 和 `block`** —— 晨曦之光 `godie-i016` 現在就是:
 * 它的文件同時有 `passive`(→ `hooks`)與 `block`,兩者走同一個
 * `itemModifierSource`,落在同一個 `ModifierSource` 上。借用 index 0 就是讓
 * 那條 hook 和格擋共用一個時鐘 —— 兩個機制互相把對方的冷卻洗掉,而且因為兩邊
 * 的測試各自只看自己那一半,測起來會全綠。所以是一格獨立的 `blockLastFired`。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⑦ 決定性
 *
 * 骰子一律走 `world.rng.chance`(播種、狀態折進 `SimWorld.digest()`),沒有
 * `Math.random`;沒有 `Date.now`、沒有三角函式、沒有 `**`;冷卻是**絕對 tick**
 * 不是遞減計數器;唯一的迭代是插入序的 `sc.sources` 陣列。
 *
 * **ZERO GUARANTEE**:沒有任何一個活著、型別對得上、不在冷卻中、(若是致死格擋)
 * 這一發真的會致死的來源時,`blockCutFor` 在**碰 rng 之前**就回 0。所以在內容
 * 填進來之前這條閘一次亂數都不抽 —— 每一份既有 replay 與 digest 逐位元不變。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ModifierSource } from "../stats/modifiers";
import type { DamageType } from "../effects/effect";
import type { BlockStacking } from "../blockRules";

/**
 * 致死判定的分母 —— 「超過現存生命」裡的「現存生命」指什麼。
 *
 * · `"hpAndShields"`(預設)—— 血 + **這一發吃得到的**護盾。這是「這一發會不會
 *   殺死我」的正確算法:身上還有 500 點護盾時,一發 300 的傷害不是致命一擊,
 *   而一個在那裡觸發的「抵擋致命一擊」等於白白替護盾擋刀。
 * · `"hp"` —— 只看血條,也就是文案的字面讀法。
 *
 * 預設選 `"hpAndShields"` 是**比較保守**的那一個:它觸發的次數嚴格較少
 * (帶護盾時才有差),所以預設值不會替玩家憑空多發一次保命。
 */
export type BlockLethalBasis = "hp" | "hpAndShields";

/**
 * 一個來源(道具/技能/buff)授予的格擋能力。
 *
 * 六根軸各自對應四支文件裡真的被寫出來的一個決定,或 owner 的一次裁決;沒有
 * 任何一根是為了未來想像出來的。上下界都有,理由寫在各欄位上(CLAUDE.md
 * 第一守則:欄位要有上界,不是只有下界 —— 50 打成 500 必須在**載入時**就被
 * 擋下,不是在下游被靜默夾掉)。
 */
export interface BlockGrant {
  /**
   * 這個格擋對哪些傷害型別生效。**必填、明列**,`[]` 不合法。
   *
   * 「真實傷害無法阻擋」= 這個陣列裡沒有 `"true"`,不是程式裡的一個分支。
   */
  damageTypes: DamageType[];
  /** 觸發機率 0..1。`0.5` = 50%。 */
  chance: number;
  /** 觸發時擋掉這一發的幾成 0..1。`1` = 整包擋掉。 */
  fraction: number;
  /**
   * 只對「這一發會殺死我」的封包生效(晨曦之光 / 殺豬刀的「抵擋致命一擊」)。
   * 省略 = false = 每一發都可能被擋(奇門盾甲 / 黃金聖鬥衣)。
   */
  lethalOnly?: boolean;
  /** 致死判定的分母,見 {@link BlockLethalBasis}。省略 = `"hpAndShields"`。 */
  lethalBasis?: BlockLethalBasis;
  /**
   * 內部冷卻(**秒**)—— 這個來源擋中一次之後,要隔多久才能再擋一次。
   *
   * owner 2026-07-31:「致命一擊格擋要不要內部冷卻? => 冷卻 **1秒**」。晨曦之光
   * 與殺豬刀出貨都是 `1`。w3x 原始技能是 Cool 45 / Cool 100,owner 知道那兩個
   * 數字而刻意選了 1。
   *
   * 省略 / `0` = **沒有冷卻**,每一發合格的封包都可以擋(奇門盾甲、黃金聖鬥衣
   * 就是這樣,它們的 50% 是「每一發各抽一次」)。所以這個欄位加進來對既有的
   * 兩支平擋道具是**嚴格的 no-op**。
   *
   * 記帳:`ModifierSource.blockLastFired`,存**絕對 tick**(不是遞減計數器)。
   * 冷卻閘在骰子之前,而且只有真的擋中才記時間 —— 兩者的理由與先例見檔頭 ⑥。
   */
  internalCooldown?: number;
  /**
   * ⭐ GH#650 —— **擋下的那一瞬間放什麼特效**（掛在被擋的那個人身上）。
   *
   * owner 說過**兩次**：「初號機 AT力場應該要有特效 **這個之前回報過了啊**」。
   * ⚠️ ⭐ 在此之前這條鏈**沒有出口**：施法者側的特效走 `spawnVfx` / `spawnModelFx`
   * （掛在**技能施放**上），⛔ 而「這一發被擋下」發生在**減傷鏈的中途** ——
   * 那裡一個內容驅動的特效欄位都沒有 ⇒ **所有格擋長一模一樣**。
   *
   * ⛔ 省略 = 維持泛用的格擋火花（逐位元同今天）。
   * ⚠️ 有值時它**取代**泛用火花，⛔ 不是疊在上面。
   */
  vfxId?: string;
  /** 上面那份特效的縮放。省略 = 1。 */
  vfxScale?: number;
  /** 上面那份特效的染色 `[r,g,b]` 0–255。省略 = 不染色。 */
  vfxTint?: readonly [number, number, number];
}

/**
 * [0,1] 夾取 —— `chance` 與 `fraction` 的**唯一**執行期上下界。
 *
 * schema 已經擋過一次(`zItemBlockGrant` 的 `.positive().max(1)`),但後台
 * override 是第二條寫入路徑,所以這裡再夾一次。
 *
 * ⚠️ 這是**唯一**的一道,而且刻意如此。`blockCutFor` 的結尾本來還有一句
 * `return cut > impact ? impact : cut;` —— 突變驗證證明它是死的:`fraction`
 * 已經被夾在 1 以下,`impact * fraction` 就不可能大於 `impact`,刪掉那一行
 * **當時的 43 條**測試全綠(那次量測的時間點:格擋還是「取最好的一個」的版本;
 * 現在這一節是 block.test.ts 的 35 條 + block.shipped.test.ts 的 24 條)。
 * 一條刪掉也不會紅的防線不是防線,而且更糟:它會讓下一個讀者以為上界在那裡,
 * 於是放心把這裡拿掉(CLAUDE.md 第二守則)。
 *
 * 鏈式版本的同一個結論在 `chainBlockCut`:`remaining -= remaining * fraction`
 * 配上夾好的 `fraction ∈ [0,1]`,`remaining` 永遠留在 `[0, impact]`,所以那裡
 * 一樣沒有第二道夾取。
 *
 * ⚠️ 上界真正擋住的是什麼,也是量出來的而不是推論的。`fraction: 1.5` 讓
 * `dmg = impact − 1.5·impact` 變成**負數**,而 `damage.ts` 的血量寫入有守衛
 * (`if (dmg > 0) hp.hp -= dmg`)—— 所以「它有沒有幫我補血」這個斷言**拿掉上界
 * 也照樣綠**。護盾迴圈沒有守衛:`sh.amount -= Math.min(sh.amount, -150)` 會把
 * 護盾**加厚 150**。所以釘住這道上界的是 block.test.ts 的
 * 「`fraction` over 1 cannot INFLATE the victim's shield」,斷言的是池子不是血條。
 */
function clamp01(v: number): number {
  if (!(v > 0)) return 0; // 同時擋掉 NaN
  return v > 1 ? 1 : v;
}

/**
 * 這個來源現在還在冷卻裡嗎(見檔頭 ⑥)。
 *
 * **絕對 tick**:`blockLastFired` 存的是上一次擋中的那個 tick,比較的是
 * `world.tick - blockLastFired`。沒有遞減計數器(`sim/purity.test.ts` 在守)。
 *
 * `internalCooldown` 省略 / 0 / 負 / NaN ⇒ 永遠不在冷卻(`!(x > 0)` 一次擋掉
 * 全部四種),所以奇門盾甲與黃金聖鬥衣完全不受這個機制影響。
 */
function blockOnCooldown(world: SimWorld, src: ModifierSource, b: BlockGrant): boolean {
  const secs = b.internalCooldown;
  if (secs === undefined || !(secs > 0)) return false;
  const last = src.blockLastFired;
  if (last === undefined) return false; // 一次都還沒擋過
  return world.tick - last < Math.round(secs / world.dt);
}

/**
 * 這一發封包被**格擋掉多少**(0 = 沒擋到 / 沒有格擋來源)。
 *
 * 呼叫端(`combat/damage.ts` 的佇列排空)把回傳值從 `dmg` 扣掉,但**不要**從
 * `impact` 扣 —— `impact` 是「這一拳打得多重」,護盾也是這樣處理的。
 *
 * @param impact         過了護甲/魔抗、**還沒進護盾池**的傷害
 * @param currentHp      受擊者現在的血(致死判定用)
 * @param eligibleShield 這一發**吃得到**的護盾總額(致死判定用;型別過濾過的)
 *
 * rng draw 數 = 走到它時**仍然合格**(型別對、沒過期、不在冷卻、若是致死格擋
 * 則剩餘傷害真的還會致死)的來源數;一個都沒有時 **0 次**(檔頭 ⑦ ZERO
 * GUARANTEE)。`best` 模式下永遠是 0 或 1 次。
 */
/**
 * ⭐⭐ GH#650 —— **擋下的那一瞬間**（owner 說過**兩次**：
 * 「初號機 AT力場應該要有特效 **這個之前回報過了啊**」）。
 *
 * ⚠️ ⭐ 為什麼發在這裡而不是在 `damage.ts` 的 `emit("damage", { blocked })` 那一格：
 * 那個事件的 `origin` 是**攻擊者的**技能，⛔ 而格擋特效屬於**防禦者的那一格 grant**
 * ⇒ 在那裡發，特效會掛在錯的人的技能上。⭐ 這裡是**唯一**知道「是哪一格 grant 擋的」的地方。
 *
 * ⛔ **沒有 `vfxId` 就一則都不發** —— 出貨的兩支平擋道具（晨曦之光 / 殺豬刀）
 * 都沒填，所以這一段對它們是**嚴格的 no-op**（逐位元同今天，維持泛用火花）。
 */
function emitBlockVfx(world: SimWorld, target: EntityId, b: BlockGrant): void {
  if (b.vfxId === undefined) return;
  const t = world.transform.get(target);
  world.emit("blockVfx", {
    target,
    vfxId: b.vfxId,
    scale: b.vfxScale ?? 1,
    tint: b.vfxTint,
    x: t?.pos.x ?? 0,
    z: t?.pos.z ?? 0,
  });
}

export function blockCutFor(
  world: SimWorld,
  target: EntityId,
  type: DamageType,
  impact: number,
  currentHp: number,
  eligibleShield: number,
): number {
  if (!(impact > 0)) return 0;
  const sc = world.stats.get(target);
  if (!sc) return 0; // 建築/花/投射物沒有 StatsComp —— 依構造沒有格擋
  const stacking: BlockStacking = world.blockRules.stacking;
  return stacking === "best"
    ? bestBlockCut(world, target, sc.sources, type, impact, currentHp, eligibleShield)
    : chainBlockCut(world, target, sc.sources, type, impact, currentHp, eligibleShield);
}

/**
 * `independent`(出貨值,owner 2026-07-31 的裁決)—— **鏈式獨立判定**。
 *
 * 每個合格來源依 `sources` 的插入序各抽各的,擋中的從**剩餘**傷害裡扣掉自己的
 * `fraction`,剩下的交給下一個。兩個 30% 全額格擋 ⇒ 1 − 0.7·0.7 = 51%。
 */
function chainBlockCut(
  world: SimWorld,
  target: EntityId,
  sources: readonly ModifierSource[],
  type: DamageType,
  impact: number,
  currentHp: number,
  eligibleShield: number,
): number {
  let remaining = impact;
  for (const src of sources) {
    const b = src.block;
    if (b === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!b.damageTypes.includes(type)) continue;
    // ⭐ GH#650 —— 系統倍率（`config.block@1.chanceMult`，出貨 1.0 ＝ 逐位元不變）。
    //   ⚠️ ⭐ 乘在 **clamp 之前**是承重的：先夾再乘會讓一格 0.6 的機率
    //   乘 2 之後變成 1.2 而 `blockOnCooldown` 之後的 `rng.chance(1.2)` 恆真 ——
    //   ⛔ 那不是「更常擋」，是「永遠擋」。
    const chance = clamp01(b.chance * world.blockRules.chanceMult);
    const fraction = clamp01(b.fraction);
    // 一個 chance 或 fraction 為 0 的來源什麼都擋不掉,所以它不可以吃掉一次
    // draw —— 否則「裝一件沒用的格擋」會偷偷平移整條亂數流。
    if (!(chance > 0 && fraction > 0)) continue;
    if (b.lethalOnly === true) {
      // 「超過現存生命的傷害」—— 對**剩餘**傷害問,不是對原始 `impact`
      // (owner:「拿第一次檔掉剩餘繼續算下一次」)。前一個來源已經把這一發砍到
      // 殺不死人時,保命技就不該再燒掉一次(也因此不抽 rng)。
      const pool =
        (b.lethalBasis ?? "hpAndShields") === "hp" ? currentHp : currentHp + eligibleShield;
      if (!(remaining > pool)) continue;
    }
    // 冷卻閘**在骰子之前**(檔頭 ⑥ 的先例):被擋掉的來源不抽 rng、不燒冷卻。
    if (blockOnCooldown(world, src, b)) continue;
    if (!world.rng.chance(chance)) continue; // 抽輸不重置冷卻
    src.blockLastFired = world.tick; // 只有真的擋中才記時間,而且是絕對 tick
    emitBlockVfx(world, target, b); // ⭐ GH#650 —— 擋中的那一瞬間
    remaining -= remaining * fraction;
    // 整發都被擋光了,鏈就到此為止 —— 沒有「剩餘」可以繼續算,而讓後面的來源
    // 對 0 傷害抽籤只會白燒它們的冷卻與一次 draw。
    if (!(remaining > 0)) return impact;
  }
  return impact - remaining;
}

/**
 * `best`(舊行為,後台切得回去)—— 只有 `chance × fraction` 最大的那一個參與,
 * 整發**只抽一次**。
 *
 * 「最大」在這裡有精確定義:期望減傷 `chance × fraction`,同值時取 `sources`
 * 陣列裡靠前的那一個(嚴格大於 ⇒ 先到先贏 ⇒ 每個 replica 選到同一個)。
 * ⚠️ 這個排名指標**只有這個模式在用** —— `independent` 底下每個來源都會自己
 * 抽,沒有人被比較掉。
 */
function bestBlockCut(
  world: SimWorld,
  target: EntityId,
  sources: readonly ModifierSource[],
  type: DamageType,
  impact: number,
  currentHp: number,
  eligibleShield: number,
): number {
  let bestChance = 0;
  let bestFraction = 0;
  let bestWeight = 0;
  let winner: ModifierSource | null = null;
  for (const src of sources) {
    const b = src.block;
    if (b === undefined) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!b.damageTypes.includes(type)) continue;
    if (b.lethalOnly === true) {
      const pool =
        (b.lethalBasis ?? "hpAndShields") === "hp" ? currentHp : currentHp + eligibleShield;
      if (!(impact > pool)) continue;
    }
    if (blockOnCooldown(world, src, b)) continue;
    // ⭐ GH#650 —— 系統倍率（`config.block@1.chanceMult`，出貨 1.0 ＝ 逐位元不變）。
    //   ⚠️ ⭐ 乘在 **clamp 之前**是承重的：先夾再乘會讓一格 0.6 的機率
    //   乘 2 之後變成 1.2 ⇒ `rng.chance(1.2)` 恆真 —— ⛔ 那不是「更常擋」，是「永遠擋」。
    const chance = clamp01(b.chance * world.blockRules.chanceMult);
    const fraction = clamp01(b.fraction);
    const weight = chance * fraction;
    if (weight > bestWeight) {
      bestWeight = weight;
      bestChance = chance;
      bestFraction = fraction;
      winner = src;
    }
  }
  // THE ZERO GUARANTEE: 到這裡都沒有合格來源 ⇒ 不碰 rng,不改任何狀態。
  if (!(bestWeight > 0) || winner === null) return 0;

  if (!world.rng.chance(bestChance)) return 0;
  winner.blockLastFired = world.tick;
  emitBlockVfx(world, target, winner.block!); // ⭐ GH#650 —— 擋中的那一瞬間
  // `bestFraction` is already clamped to [0,1] by {@link clamp01}, so this
  // product can never exceed `impact` and there is deliberately NO second clamp
  // here — see the note on `clamp01` for the mutation run that proved one was
  // dead code.
  return impact * bestFraction;
}
