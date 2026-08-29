/**
 * 戰鬥手感規則 (combat feel) — 兩條**後台可調**的全域規則,合成一份文件
 * `config.combat-feel@1`:
 *
 *   1. 擊退 (knockback, GH#193) —— 擊退距離改由「這一擊打掉受傷單位多少百分比的
 *      最大生命」決定,並且**減掉攻守雙方目前的距離**。
 *   2. 打就站定 (standstill) —— 要出手就得站定;走動中不得起手,前搖中走動作廢。
 *
 * ⚠️ 不要和 `sim/combat/hitFeel.ts` 搞混。那一份是**每個技能/每位英雄各自**的
 * 演出覆寫(震幅、火花、凍結),由內容作者寫在 champion/ability 文件裡;這一份是
 * **整場比賽共用的一張規則表**,由操作者在後台調,和 `combatEnv` / `baseBonus` /
 * `statCaps` 同一個階層。
 *
 * ---------------------------------------------------------------------------
 * 為什麼擊退要整個翻掉(設計反轉,不是調參)
 * ---------------------------------------------------------------------------
 * 舊法是**絕對傷害分級**:`impact >= 70` 才推,推 `impact/100 × 1.6` 單位。
 * 它有兩個問題:
 *
 *   · 一個 70 點的傷害打在 6,000 血的王身上和打在 300 血的脆皮身上推一樣遠 ——
 *     擊退和「這一下對你有多痛」完全脫鉤。
 *   · 遠程可以隔著 8.2 的射程把人一直往後推,自己完全不用進場。近戰射程 1.6,
 *     推完之後目標就出射程了 —— **自己打出的擊退把自己的下一刀取消掉**。
 *     `sim/autoAttackCensus.test.ts` 的 KNOWN_BELOW_RATE 六位近戰(最差的
 *     godie-u011 只有 0.14)就是這個形狀。
 *
 * owner 2026-07-28 (GH#193):
 * 「傷害超過一定閾值會擊退,而且擊退距離會跟傷害/受傷單位血量的百分比有關,
 *   舉例,該傷害超過生命5%才會擊退、並且百分比越高擊退越遠,最多 10個身位距離
 *   (假設一擊就造成100%生命損失),這個距離會攻擊與受傷雙方距離相減」
 *
 * ---------------------------------------------------------------------------
 * ⚠️「減距離」不是 bug,不要把它優化掉
 * ---------------------------------------------------------------------------
 * `distance = max(0, raw − 攻守雙方目前距離)` 讀起來很像一條沒必要的減法,而它
 * 正是這條規則的**全部重點**:
 *
 *     近戰貼身 (d≈1.5) 打出 50% 傷害 → raw 5.0 − 1.5 = **3.5 身位**
 *     遠程隔 8.2 打出同樣 50% 傷害   → raw 5.0 − 8.2 = **0**(完全不推)
 *
 * 也就是說:**擊退從此是近戰的工具**。遠程再也不能靠推人永久風箏,而近戰打人
 * 也不會再把自己的目標推出自己的射程(距離越近推得越遠,但推完之後兩人距離就是
 * `raw`,而 `raw` 對一次普攻來說很小)。任何「這個減法看起來多餘」的重構都會
 * 同時把 #45 的近戰普攻率打回 0.14,並把風箏還給遠程。
 *
 * ⚠️ 6,000 血的殭屍王一擊要吃到 300 傷害才會被推 —— 也就是**王幾乎不會被擊退**。
 * 這是刻意的(王就該站得住),不是漏算。要讓王會被推就把 `minPct` 調小。
 */

import {
  DEFAULT_PREDICTION_HOLD,
  normalizePredictionHold,
  type PredictionHoldRules,
} from "./predictionHold";
import {
  DEFAULT_HITSTOP,
  normalizeHitstopRules,
  type HitstopRules,
} from "./combat/hitstopHold";
import { dot, len, lenSq, normalize, sub, type Vec2 } from "./math/vec2";

/** 擊退規則(全部後台可調)。 */
export interface KnockbackRules {
  /** 這一擊的傷害佔受傷單位**最大生命**的比例,低於這個值 → 完全不擊退。 */
  minPct: number;
  /** 一擊打掉 100% 生命時的擊退**身位數**(這是上限,pct 會先夾到 1)。 */
  maxBodies: number;
  /** 一個身位換算成多少 GGD 單位。 */
  bodyUnit: number;
  /**
   * 決策點：**技能授權的位移**（擊退/擊飛/衝刺）遇上**傷害驅動的擊退**時,誰贏。
   *
   * true（出貨）= 技能贏。身上還有一段技能授權的位移沒走完時,這一 tick 的傷害
   *              擊退不接管那具身體（硬直/擊倒照樣套用,讓出去的只有位移）。
   * false        = 修這條缺陷之前的行為:傷害**無條件**蓋掉。留著是給 owner 一條
   *              回頭路,不是一個平起平坐的選項 —— 見 `damageShoveWins` 的檔頭,
   *              那個行為讓每一支「又打又推」的技能的擊退在出貨路徑上全滅。
   */
  authoredWins: boolean;
  /**
   * 決策點（只在 `authoredWins` 開著時有意義）：傷害驅動的擊退**推得比較遠**時,
   * 要不要讓它接管。
   *
   * false（出貨）= 不接管,技能授權的距離與**方向**一路走完。
   * true         = 「取距離較大的那個」。⚠️ 這一側會讓**拉近**（`from: "pull"`）
   *               系的技能變得不可靠:勾中目標的那一下傷害如果算出更長的距離,
   *               身體會被往**反方向**推出去,鉤索當場失效。想開之前先想清楚。
   */
  longerDamageWins: boolean;
  /**
   * ⭐ 擊飛四檔落點的「一小段」有多長（GGD 單位，GH#301-1）。
   *
   * owner 2026-08-09 推翻了「落點由系統推算，作者指定不了」，同時把它**簡化成
   * 四檔**：一小段 / 預設 / 一大段 / 到底部。四檔是**列舉**（`knockback
   * .launchDistance`），但四檔各自**多遠**是操作者每週會改的那種數字 ——
   * ⛔ 所以它住在這裡，不是 `effects/knockback.ts` 裡的 `const SHORT = 3`。
   *
   * 出貨 3：競技場半徑 24、體半徑 0.6、近戰射程約 1.6，所以 3 是「推出一個
   * 身位半、對方一步就走得回來」—— 一小段該有的量級。
   */
  launchShortUnits: number;
  /** 「一大段」有多長（GGD 單位）。出貨 12 = 競技場半徑的一半，橫跨半個場。 */
  launchLongUnits: number;
  /**
   * 決策點：「到底部」推到**哪一個**邊緣。
   *
   * true（出貨）= 目前**還能站的**邊緣，也就是火圈此刻的半徑（火圈沒縮 / 沒
   *              武裝時就是決鬥區邊界）。
   * false        = 決鬥區的**幾何**邊界，無視火圈。
   *
   * ⚠️ 這一格為什麼不能寫死：`false` 那一側在火圈縮到一半之後，「到底部」會把
   * 人**扔進火裡**（真傷、每 tick 扣），也就是一支平平無奇的擊飛技在第 3 回合
   * 之後突然變成處決技 —— 一個只在後半場出現、而且完全靜默的機制。出貨選
   * true 是因為「底部」對玩家的意思是「我還站得住的地方的盡頭」；想要那個處決
   * 手感的話 owner 自己開。
   */
  launchEdgeUsesFireRing: boolean;
}

/** 打就站定規則(全部後台可調)。 */
export interface StandstillRules {
  /** 總開關。false = 整條規則不存在(維持舊行為:邊走邊打)。 */
  enabled: boolean;
  /**
   * 「有在動」的速度門檻 (GGD units/sec),同時也是「正在靠近目標」的門檻。
   * 讀的是 `Transform.vel`(實際位移/dt),不是移動意圖 —— 見 BasicAttackSystem。
   */
  walkEps: number;
  /**
   * 小怪(含殭屍王)是否同樣受這條規則約束。
   * owner 2026-07-28:「並且殭屍王也會預設套用」→ 預設 true。
   * 關掉的話小怪能邊走邊打而英雄不行,那是一個沒有人會想要的不對稱。
   */
  applyToMobs: boolean;
  /**
   * ⭐ GH#755 —— 「**完全沒動**」的雜訊地板 (GGD units/sec)。
   *
   * ⚠️ 這一格把 `walkEps` **一格當兩用**拆開了。在此之前同一個 0.5 同時是
   * 「有沒有在動」與「靠近多快」的門檻,於是 **有效移速 ≤ 0.5 的單位整條規則
   * 靜默關閉** —— 重減速之下純後退風箏拿**全額**輸出,而且沒有任何守衛量過。
   *
   * 為什麼是 **0.1**:它必須落在「浮點/碰撞雜訊」與「最慢的**真的在移動**」
   * 之間。出貨的移速中位數 ≈5.9,而 60% 減速把它壓到 2.36;疊到本票舉的
   * 0.3 仍然遠在 0.1 之上。⇒ 0.1 擋得掉雜訊而擋不掉任何一個真的在走的人。
   * ⛔ 它**不是**手感旋鈕(手感住 {@link closingRatio}),所以⛔ 不要拿它調平衡。
   */
  stillEps: number;
  /**
   * ⭐ GH#755 —— 「正在朝目標靠近」的門檻,寫成**這個單位自己移速的幾成**。
   *
   * ⚠️ 它是**無因次**的,而那就是修法本身:舊版用一個**絕對速度** 0.5 當門檻,
   * 於是同樣斜著走,慢的人徑向分量 < 0.5 被擋、快的人放行 ——
   * **允許的移動角度隨移速伸縮**,而且是**非單調**的(對敵人疊更多減速反而
   * 可能讓他拿回全額攻擊)。比例門檻讓判定只看**方向**,⛔ 不看速度。
   *
   * 0.5 的來源是幾何,⛔ 不是手感:徑向分量等於速度的一半 ⇔ 移動方向與
   * 「指向目標」夾角 60°。也就是「你的移動要有一半以上是朝著他去的」。
   * ⛔ sim 禁三角函數,所以它寫成投影比較而不是角度(見 {@link closingSpeed})。
   *
   * 上界是 1(等於「必須全速直衝」),下界 0(等於只擋真的在拉開距離)。
   */
  closingRatio: number;
  /**
   * ⭐ GH#755 的 **rollback** —— `true` = 逐位元回到 2026-08-27 之前的行為
   *(`|vel| > walkEps` 且 `closingSpeed < walkEps`)。
   *
   * 出貨 `false`(第〇·六守則:優先權大的更新後都是預設啟動)。它存在是為了
   * **回頭**,⛔ 不是觀望 —— 新規則會讓「被重減速的近戰接近戰」更難出手,
   * 而那是一個要用真的比賽才看得出來的取捨。
   */
  legacyAbsoluteClosing: boolean;
}

/**
 * 面向鎖的窗口長度 (task #264 / #275 / #280),全部後台可調。
 *
 * ⚠️ 這三個數字以前是 `facingLock.ts` 的三個 `export const`。owner 已經在
 * 面向這個題目上改過主意兩次(#264「出手即承諾」→ #275「瞄準優先」),而每一次
 * 想調的都是**窗口有多長** —— 那正是「會不會想改」的答案是「會」的欄位。
 *
 * ⚠️ 這一組只被**權威端**讀到。`armFacingLock` 的呼叫者是 `BasicAttackSystem`
 * 與 `abilities/abilitySystem`,兩者都只在伺服器的 `world.step()` 裡跑;客戶端的
 * `LocalPrediction` 只重播 `orderSystem` + `movementSystem`,從不自己上鎖(它讀
 * 的是快照同步過來的結果)。所以這三格改了不會讓預測和權威分家。
 * 對照:`aimHoldTicks` 就**不能**放進來,理由見 `aimHold.ts` 的檔頭。
 */
export interface FacingRules {
  /**
   * 出手後的「收招」餘韻 tick 數。傷害點結束時若同時放掉鎖,身體會在命中的同一幀
   * 被移動方向拉走,看起來就像根本沒轉過。
   */
  followThroughTicks: number;
  /**
   * 瞬發技 (castTimeSec = 0) 的最低鎖定長度。瞬發技沒有吟唱可以撐住面向,
   * 只給 follow-through 的話走位中的玩家幾乎看不到轉身。
   */
  instantCastTicks: number;
}

/**
 * 卡住就接敵 AUTO-ENGAGE (GH#216 / #274 的後半),全部後台可調。
 *
 * ---------------------------------------------------------------------------
 * 這條規則要修的是什麼(全部是量出來的,不是設計品味)
 * ---------------------------------------------------------------------------
 * #274 把「取得目標」與「追擊」拆開:移動指令期間**照樣索敵**,但**追擊停手**,
 * 這樣玩家的走位權不會被搶。它的註解說「你會邊走邊砍你路過的東西」。
 *
 * 那句話對 33 位遠程成立,對 82 位近戰**在構造上不可能成立**:
 *
 *     索敵半徑 = max(自身射程, MELEE_ACQUIRE_FLOOR = 6)
 *     近戰射程 ≈ 1.6   →  索敵 6、出手 1.6,中間那 4.4 只有追擊能走完
 *     遠程射程 ≈ 8.2   →  索敵 = 射程,取得目標的同時就已經在射程內
 *
 * 也就是說近戰取得了目標卻永遠打不到。實測(出貨 Saber `godie-e002`,
 * 2,326 tick 的真實對局,手把左類比一直推):
 *
 *     索敵半徑內 67 tick · 射程內 **0** tick · 起手 **0** 次 · 命中 **0**
 *
 * 而且更糟的一半:一個**到不了**的移動終點永遠不會被消耗掉(只有 ARRIVE_EPS
 * 會清 `nav.order`),所以上面那個狀態是**永久**的。實測同一場:
 *
 *     右鍵點進柱子 → 位置 (-50.1, 5.9)、|v| = 0.00 連續 2,240 tick(75 秒)
 *     最近的敵人 16.25 單位遠,索敵半徑 6 → 整場 0 次索敵、0 次出手
 *
 * ---------------------------------------------------------------------------
 * 為什麼門檻是「卡住」而不是「有沒有移動指令」
 * ---------------------------------------------------------------------------
 * 走位權要留給玩家,這一點 #274 是對的。所以這條規則**只在走位本身走不動時**
 * 才接手:連續 `stallTicks` 個 tick 速度低於 `stallSpeed`,而移動終點還沒到 ——
 * 那代表玩家指的地方到不了(牆、柱子、場外),他的走位並沒有被搶走,因為那個
 * 走位本來就在原地空轉。走得動的走位一個 tick 都不會被碰。
 *
 * `seekRadius` 對齊 bot 的 `AI_ENGAGE_RANGE = 48`(game-server/ai/Tier0Brain.ts):
 * bot 一直都是掃整個 24 半徑的競技場去找架打,玩家卻只有 6 —— 卡住的玩家因此
 * 是全場唯一一個看得到敵人卻不會動的單位。48 蓋得住競技場內任兩點。
 *
 * ⚠️ 這個接管是**有主人的**:`world.autoEngaging` 一旦上鎖,追擊就可以覆寫移動
 * 通道。沒有鎖的話會震盪 —— 追擊讓身體動起來 → 不再算卡住 → 追擊停手 → 又撞回
 * 牆上,每 `stallTicks` 個 tick 只前進一格。
 *
 * ---------------------------------------------------------------------------
 * ⚠️⚠️ 2026-07-30 更正:上面那個鎖第一版**永遠不放手**,這是量出來的
 * ---------------------------------------------------------------------------
 * 這一段原本寫著「要嘛目標沒了、要嘛玩家下了別的指令才會解鎖」,並且把它當成
 * 安全。那句話在紙上成立、在真實對局裡是假的,因為兩個出口對**握著搖桿的玩家**
 * 同時都不成立:搖桿每一拍都送一條 `kind:"move"`(所以「別的指令」永遠不會來),
 * 而競技場裡永遠有活著的敵人(所以「目標沒了」也永遠不會來)。
 *
 * 出貨 Saber `godie-e002`、seed 7919、真實 `MatchController` 對局,逐 tick 量到:
 *
 *     t=1..296   左類比一直推 +x,全速 5.80 走過去
 *     t=297..316 撞上 zone 0 的東邊界(x ≈ −16.66),沿著邊界滑
 *                |v| 從 0.427 一路掉到 0.394 —— **全部低於 stallSpeed 0.5**
 *                `walkStall` 1 → 30
 *     t=317      判定卡住 → 索敵半徑 6→48 → 索到 18.47 單位外的敵人 → **上鎖**
 *                `moveTarget` 從 (−12.66,−1.59) 被改寫成 (−35.25, 0.10)
 *                —— 也就是玩家推右邊,角色往**左邊**跑
 *     t=318..    `walkStall` 立刻回到 0(身體以 5.80 在跑),但鎖**再也沒放開**
 *
 *     整場 2,355 個「玩家手上有走位指令」的 tick,**2,039 個被搶走**(86.6%)。
 *
 * 也就是說:讓鎖上鎖的那個證據(走不動)在下一個 tick 就消失了,而接管沒有跟著
 * 結束。這正是 owner 說的「搶走玩家的走位,而且不放手」。
 *
 * 修法是 `respectLiveSteering`(見下)。**不要**把它換成「不卡住就自動放手」——
 * 那會回到上面那個震盪,量到的淨位移是正常速度的 3%。
 */
export interface AutoEngageRules {
  /** 總開關。false = 完全回到 #274 的行為(移動指令期間絕不接手)。 */
  enabled: boolean;
  /** 連續幾個 tick 走不動,才算這個走位卡住了。30 tick = 1 秒。 */
  stallTicks: number;
  /**
   * 「走不動」的速度門檻 (GGD units/sec)。讀的是 `Transform.vel`(實際位移/dt),
   * 和「打就站定」的 `walkEps` 同一個量。
   */
  stallSpeed: number;
  /**
   * 放大後的索敵半徑(單位)。bot 用的是 48。
   *
   * ⚠️ 有**兩個**入口:走位卡住(`autoEngageActive`,一直都有),以及站著不動
   * (`idleSeeks`,2026-07-31 新增、出貨關著)。**走得動**的走位兩條都拿不到。
   */
  seekRadius: number;
  /**
   * **站著不動的人要不要也吃 `seekRadius`** (2026-07-31 W4)。出貨 `false`。
   *
   * ── 這一格修的是一個不對稱,而那個不對稱是量出來的 ──────────────────────
   * `systems/OrderSystem.ts` 的 `autoAcquirePass` 裡,索敵半徑是**條件式**的:
   *
   *     卡住的玩家(`autoEngageActive`)  → `seekRadius`(出貨 48,蓋滿競技場)
   *     站著不動的玩家(手上沒有指令)   → `acquireRadius` = 近戰地板 6
   *
   * 也就是說「走位卡在柱子上」比「完全站著不動」**更容易**索到敵人。實測
   * `apps/game-server/src/match/autoAcquireWhileMoving.test.ts` 的 `[idle]` 情境
   * (真的 `MatchController`、出貨 Saber `godie-e002`、seed 7919):整場 2,410
   * tick,座位待在出生點 (−56,−4),最近的敵方英雄**從來沒有靠近到 14.95 單位
   * 以內**,而他的索敵半徑是 6 → **0 次索敵、0 次揮擊**。那條測試至今是紅的,
   * 而且它紅的理由不是「自動攻擊壞了」,是「站著的人看不到 6 單位外的任何東西」。
   *
   * ── 為什麼預設是 `false` ────────────────────────────────────────────────
   * 因為這是**手感的平衡決策,不是缺陷修正**,選擇權留給 owner:
   *
   *   false(出貨)= 今天的行為。站著不動 = 只打走到你面前 6 單位內的東西。
   *                 玩家放開手就是真的站著,不會自己跑走 —— 但也代表「什麼都
   *                 不按」在一場 bot 平均離你 40+ 單位的對局裡等於整場不出手。
   *   true       = 站著不動的人吃和卡住的人同一個半徑(`seekRadius`),所以他
   *                 會自己走過去打。手感接近「所有英雄預設都在 A 移動」:新手
   *                 不按鍵也打得到人,但**方向盤在他沒下指令的時候不在他手上**
   *                 —— 他一放手,角色就自己走掉了(追擊會改寫 `moveTarget`)。
   *
   * ⚠️ 需要總開關 `enabled` 也開著。理由:`enabled: false` 的文案承諾是「完全
   * 回到 #274 的行為」,如果這一格獨立生效,那句話就變成謊話(CLAUDE.md:語意
   * 改了舊文案就是謊話)。`respectLiveSteering` / `ccPausesStall` 也是同樣的
   * 從屬關係。
   *
   * ⚠️ 「站著不動」讀的是 `nav.order === null`(**指令套用之後**的那個值),
   * 不是「速度 0」。被定身的人速度也是 0,但他手上可能還握著一條走位指令 ——
   * 那是 `ccPausesStall` 管的題目,不是這一格。`hold` 有自己的半徑(縮到
   * 停手點),`attackMove` 是玩家自己要求接敵,兩者都不走這條路。
   */
  idleSeeks: boolean;
  /**
   * 玩家**正在下指令**的那一 tick,走位權無條件屬於他 (2026-07-30)。
   *
   * true(出貨)= 每一條新到的 `kind:"move"` 都把 `walkStall` 歸零並**當場解鎖**。
   * false      = 舊行為:只看身體動不動,上鎖之後剩下四條出口(全部在
   *              `systems/OrderSystem.ts` 的 `autoAcquirePass`)—— 換別種指令
   *              (`order?.kind !== "move"`)、目標沒了(`if (!best)`)、
   *              死亡(`!hp?.alive`)、zone 已結算(`settledZones.has`)。
   *              對握著搖桿的人前兩條都不會來,所以上面量到的 86.6% 被搶走
   *              就是這一格 false 的樣子。
   *              (⚠️ 用條件式指路不用行號:這一段第一版寫的是 `:405` / `:505`
   *              / `:342` / `:368`,四個全部已經飄掉十幾行。)
   *              (⚠️ 不要只寫「目標沒了 / 換別種指令」—— 那句話漏了死亡與
   *              回合結算兩條,`SimWorld.ts` 那份就是這樣漏了兩個月。)
   *
   * 為什麼「有沒有新指令進來」是對的判準,而不是「身體有沒有在動」:
   *
   *   · 類比搖桿 / 虛擬搖桿(`GamepadInput.mapGamepadFrame`、`TouchInput
   *     .touchMoveOrder`)**只在推著的時候**才產生 move,而且每一拍都用當下的
   *     `selfPos` 重算 —— 有新指令 ⇔ 玩家此刻正在轉方向盤。
   *   · 滑鼠右鍵(`InputCapture.mapRightClick`)一次點擊只送**一條**。點進柱子
   *     之後就再也沒有新指令 —— 那才是「玩家已經放手、而且他指的地方到不了」,
   *     也就是這條規則真正要救的人。
   *
   * 所以它救的是被卡住的滑鼠玩家,而**絕不碰**正在推搖桿的人:後者本來就有
   * 方向盤,替他轉向是幫倒忙。走不動的時候他自己會改推別的方向。
   *
   * ⚠️ 這一格是給 owner 反悔用的(第一守則:兩種模式都做,後台可切)。把它關掉
   * 會讓搖桿玩家再次被接管 —— 那是上面量到的那個行為,不是新的 bug。
   */
  respectLiveSteering: boolean;
  /**
   * **硬控期間不累積「卡住」** (2026-07-30)。true = 出貨。
   *
   * 這一格修的是「1 秒的窗口把 hitstop/擊退全部濾掉」那句話漏掉的一半 ——
   * 它只算了擊退,沒算硬控。掃出貨內容量到(`autoEngageStalledWalk.test.ts` 的
   * `ae-cc-census` 每次跑都會重量一次):
   *
   *     content/abilities/*.json 帶 applyStatus root:true / stun:true  86 支
   *       其中持續 ≥ 1.0 秒                                            47 支
   *       最長 4.0 秒 = 120 tick(godie-hvsh.passive / godie-hvwd.passive)
   *
   * `effectRunner` 的 `expiresAtTick = tick + round(duration/dt)`,
   * `MovementSystem` 對 `root || stun` 直接把速度歸零。所以在這一格之前,一個
   * 被定身 1 秒以上的玩家會在第 30 tick 被判定成「走位卡住」,走位權被追擊搶走。
   * 被控已經夠慘,解控之後角色還往反方向跑 —— 比原本的 bug 更糟。
   *
   * 判準讀的是 `sim/movementHold.ts` 的 `bodyHeldByRules`,和 `MovementSystem`
   * **同一個函式**(root / stun / 施法鎖 / recovery 鎖 / 擊倒 / hitstop)。
   * 抄一份過去的話兩份會漂走,而漂走的那天不會有任何測試紅。
   *
   * ⚠️ 是「凍結計數」不是「歸零計數」:一個已經卡在柱子上 20 tick 的玩家吃到
   * 硬控,解控之後應該從 20 繼續數,不是重新等一秒。硬控只是**不算證據**,不是
   * 把之前的證據抹掉。
   *
   * false = 2026-07-30 之前的行為(硬控照樣累積成「卡住」)。留著只是給 owner
   * 反悔用的,不是一個平起平坐的選項。
   */
  ccPausesStall: boolean;
}

/**
 * 玩家**自己點名**的攻擊目標,對上系統的自動索敵 (GH#266)。
 *
 * owner 2026-08-03:「玩家無法指定攻擊 特殊殭屍? **玩家指定攻擊的對象應該是
 * 最高優先級**」。
 *
 * ── 量到的東西(`manualTargetPriority.test.ts` 每次跑都會重量一次)────────────
 * 真的 `SimWorld`、真的 `spawnMob`、一隻特殊殭屍 + 一隻普通殭屍:
 *
 *   · 一條明確的 `attackTarget` 指令 → 目標正確寫進去,而且**只要玩家之後不送
 *     任何 intent,它可以撐 12 tick 以上不變**(所以 #221 的自動索敵本身沒有在
 *     覆寫「還握著的」手選目標)。
 *   · 同一條指令,之後每 tick 送一條 `move`(= 類比搖桿 / 虛擬搖桿的**真實形狀**,
 *     `GamepadInput` / `TouchInput` 推著的時候每一拍都送一條)→
 *     **下一個 tick 目標就從特殊殭屍換成旁邊的普通殭屍,`attackTargetAuto`
 *     從 false 變 true**。手選的壽命 = **1 tick(33 ms)**。
 *
 * 機制是兩步,而**傷害在第二步**:
 *   ① `systems/OrderSystem.ts` 的地面指令分支把手選目標清成 null(#274 的
 *      LoL 語意:右鍵地面 = 取消攻擊指令);
 *   ② 同一 tick 的 `autoAcquirePass` 看到真空,**立刻填上系統自己挑的另一個敵人**。
 *
 * 只有①的話,玩家看到的是「英雄停手了」——難用但誠實。真正的缺陷是②:系統
 * 悄悄把他點的那一隻換成別的。而且換掉之後**幾乎不可能換回來**:比較器的
 * key 3 是「血量低的優先」,特殊殭屍的 `hpMult` 讓它血量遠高於普通殭屍,所以
 * 只要旁邊有雜魚,自動索敵永遠不會挑特殊殭屍。這就是 owner 說的「無法指定攻擊」。
 *
 * ⚠️ 為什麼是欄位不是一行修正:#274 的「地面指令取代攻擊指令」在**滑鼠**上是
 * 對的(WC3 與 LoL 都這樣),右鍵一次點擊只送一條指令。壞掉的是把同一條規則
 * 套到**連續轉向**上 —— 搖桿送出的 move 不是「我要取消攻擊」,是「我正在走路」。
 * sim 分不出這兩者(兩邊都是 `{kind:"move"}`),所以選擇權交給 owner。
 */
export interface ManualOrderRules {
  /**
   * 玩家點名的攻擊目標**撐不撐得過一條移動指令**。
   *
   * true(出貨)= owner 的規則:玩家指定 > 自動索敵。走位照走(追擊仍然讓路給
   *              #274 的走位權),但打的還是他點的那一隻。
   * false      = #274 的原行為(WC3 / LoL:右鍵地面取消攻擊指令)。在搖桿與
   *              觸控上等於「手選目標只活 1 tick」,也就是上面量到的那個。
   *
   * ⚠️ 只管 `kind:"move"`。A 移動 (`attackMove`) **一律**取代手選目標,兩側都
   * 一樣 —— A 是玩家自己下的另一條戰鬥決策(「打你遇到的」),而且沒有任何輸入
   * 裝置會連續送它(`InputCapture` 的 A+左鍵、`GamepadInput` 的按鈕,都是一次
   * 一條)。S / H(停手)、點名別人、目標死掉,三條出口在兩側也都沒有變。
   */
  survivesGroundMove: boolean;
  /**
   * 手選目標的**牽引距離**(單位)。超過就放手,方向盤還給自動索敵。
   *
   * `0`(出貨)= 不限制,對應 owner 的「**永遠**」。
   *
   * 它存在是因為 `survivesGroundMove: true` 有一個副作用:走位走完之後
   * (`nav.order` 被消耗成 null)追擊會恢復,英雄會**自己走回去**找那個目標。
   * 想要「跑掉就算了」的人把這一格設成一個距離即可(競技場半徑 24,所以 24
   * 以上等於不限制)。自動索敵自己的 `ACQUIRE_LEASH` 是 2,那是給**系統挑的**
   * 目標用的,故意沒有套在手選目標上。
   *
   * ── ⭐ GH#652 細節③「右鍵敵人的視野追擊」在 GGD **不成立**（2026-08-24 查證）──
   * LoL 的規則是「點名的目標走出**視野**一小段仍然追」。⛔ GGD **沒有戰爭迷霧**：
   * `sim/vision.ts` 的 `fullVision` 出貨 **true**，那是 owner 2026-08-23 的逐字
   * 裁決「理論上這個地圖是**全視野，就算牆後也看得到**」；同一份規則也把
   * `wallBlocksBasicAttack` 關成 false。⇒ 一個目標**永遠不會**離開視野，
   * 「失去視野後再追 N 秒」沒有任何一個 tick 會執行到。
   *
   * ⭐ 唯一近似「看不見」的機制是**隱形**（`sim/stealth.ts` 的 `canSee`），
   * 而它今天的行為**已經比 LoL 更寬鬆**：`isManuallyTargetable` 只擋「新的點名」，
   * ⛔ 不會把**已經握著**的手選目標拿掉，追擊迴圈也不查隱形 ⇒ 點名之後對方隱身，
   * 英雄照追。⇒ ⛔ 這裡不加第二條「視野牽引」欄位：這一格（距離牽引）就是
   * GGD 版本的答案，而且它已經在了。⭐ 假裝做了才是缺陷（第一·五守則）。
   */
  leashUnits: number;
  /**
   * ⭐ 打帶跑 (GH#637)：玩家**點地板**之後,自動索敵冷卻幾秒。
   *
   * owner 2026-08-24:「我如果點了地板作為目標 要有1秒冷卻不能跑去打任何目標
   * (自動攻擊)讓我可以連續移動不被干擾來達成打帶跑(像是被打不能跟我搶指揮權
   * 跑去打人)」。
   *
   * 窗口內:不索**新的**自動目標、「誰在打我」的反擊接管也不生效、已握的
   * **自動**目標當場放下。⛔ 三樣東西刻意不受影響:玩家**自己點名**的目標
   * (那是他的指令,不是系統的)、嘲弄的強制目標(`forcedTargetOf`,被嘲弄
   * 就是被嘲弄)、以及前搖中已承諾的那一刀(既有語意:不在前搖中改指向)。
   *
   * ⚠️ 只有**離散的點擊**會武裝它 —— 搖桿/虛擬搖桿每一拍送一條 move 的**流**
   * 不會(否則推著搖桿 = 永久關掉自動攻擊,正是 #274 修掉的災難)。分辨法與
   * 「只跟著真人座位」的閘都在 `systems/OrderSystem.ts` 的 `armMoveOrderNoAggro`。
   *
   * `0` = 整條機制關閉(#637 之前的行為,owner 的一鍵 rollback)。上界 10 秒:
   * 再長等於「點一下地板就把自動攻擊關掉一輩子」,那是一個看起來像壞掉的值。
   */
  moveOrderNoAggroSec: number;
  /** GH#637 追加：窗口撐到抵達（出貨 true），⛔ 不是固定秒數。false = 回到秒數。 */
  moveOrderNoAggroUntilArrival: boolean;
  /**
   * GH#652 指令模型。**true（出貨）＝ LoL** —— 沒有下令就不會自己出手；
   * **false ＝ 輔助** —— 這一版之前的 GGD 行為（站著會自動索敵、被打會自動反擊）。
   */
  lolControlModel: boolean;
  /**
   * ⭐ **後搖取消（animation cancel）** —— LoL 老玩家最有感的那一項（GH#652 細節①）。
   *
   * LoL：技能／普攻**結算之後**的後搖，任何一條新指令（走位、下一發技能、A、S、H）
   * 都可以把它砍掉，而**那一發照樣算數**（傷害已經結算，⛔ 不回收）。
   * ⛔ **前搖**不在這條裡：前搖中途走開仍然作廢那一次攻擊（既有語意，
   * `systems/BasicAttackSystem.ts` 的 `standstillBlocks`，一格都沒動）。
   *
   * ── 量到的（2026-08-24，⛔ 不是假設）────────────────────────────────────
   * GGD 的**普攻本來就沒有後搖**：`basicAttackSystem` 在傷害點那一 tick 把
   * `ab.windup` 清成 null，下一 tick 完全自由（那個檔案自己的註解寫著
   * 「傷害點之後沒有任何鎖…hit-and-run 微操是自然浮現的」）。
   * ⇒ 這一格管的是 sim 裡**唯一真的存在**的後搖：`abilities/abilityRecovery.ts`
   * 的 `ab.recovery`（技能**揮空**時才武裝，出貨 0.6 s，命中會自己取消）。
   * 它擋的是 **OUTPUT**（不能再放技能、不能普攻），預設不擋腳步。
   *
   * true（出貨）＝ 真人座位下任何一條新指令 ⇒ 後搖當場結束（`recoveryEnd`
   * 帶 `reason: "cancel"`），走位與下一次出手同一 tick 就放行。
   * false ＝ DOTA 式的完整揮空懲罰窗口（GH#652 之前的行為，一鍵 rollback）。
   *
   * ⚠️ **這一格會抬高有效輸出上限** —— 揮空的成本從 0.6 s 變成 0，
   * 這正是它必須是一格開關而不是一行修正的理由。
   * ⚠️ **只管真人座位**（`MobRules.humanSeats`，GH#577 開的同一扇門）：
   * bot 每 tick 都在下指令，一起放行等於把揮空懲罰從整個 AI 身上拿掉。
   * 缺席/空集合 ⇒ 舊行為**逐位元**不變。
   */
  recoveryCancelOnOrder: boolean;
  /**
   * ⭐ **A 移動的 tie-break**（GH#652 細節②）。
   *
   * LoL：attack-move 打的是**離游標最近**的那一個 —— ⛔ 不是離角色最近，
   * ⛔ 也不是英雄優先。GGD 今天走 `targeting.ts` 的共用排序
   * （英雄 → 召喚物 → 小怪，再比威脅/血量/距離），而那個排序是為**自動索敵**
   * 寫的：玩家沒有指到任何地方，所以只能用「誰比較重要」代替「他想打誰」。
   * A 移動有指令點，⇒ 那個代替品不再需要。
   *
   * true（出貨）＝ `attackMove` 的候選人**只比一件事**：離**指令點**多遠
   * （嘲弄仍然贏過一切，`forcedTargetOf`）。
   * false ＝ 回到共用排序（英雄優先），一鍵 rollback。
   *
   * ⚠️ 索敵**半徑**仍然是身體到候選人的距離（那是「我看得到多遠」）；
   * 換掉的只有**比較鍵**。⛔ 否則 A 點在場外會索到整張地圖。
   * ⚠️ 只有 `attackMove` 讀它 —— 自動索敵、bot、小怪 aggro 一個 tick 都沒變
   * （沒有指令點的路徑根本走不到這裡）。
   */
  attackMoveNearestToCursor: boolean;
}

export interface CombatFeelRules {
  knockback: KnockbackRules;
  standstill: StandstillRules;
  /**
   * ⚠️ 選用的理由和 `facing` / `autoEngage` 完全一樣。讀的時候一律走
   * `systems/OrderSystem.ts` 的 `manualOrderRules(world)`,它對缺格回退到
   * `DEFAULT_MANUAL_ORDER`。
   */
  manualOrder?: ManualOrderRules;
  /**
   * ⚠️ 選用的理由和 `facing` 完全一樣(見下)。讀的時候一律走
   * `systems/OrderSystem.ts` 的 `autoEngageRules(world)`,它對缺格回退到
   * `DEFAULT_AUTO_ENGAGE`。
   */
  autoEngage?: AutoEngageRules;
  /**
   * ⭐ 單位互卡脫困保險絲（GH#677）。選用的理由與 `facing` 逐字相同。
   * 讀的時候一律走 `sim/stuckEscape.ts` 的 `stuckEscapeRules(world)`。
   */
  stuckEscape?: StuckEscapeRules;
  /** 手把／觸控自動瞄準的小怪讓路幅度（GH#315）。見 {@link AimAssistRules}。 */
  aimAssist?: AimAssistRules;
  /**
   * ⚠️ 選用,而且**必須**保持選用。`combatFeelFromDoc` 與 `DEFAULT_COMBAT_FEEL`
   * 一定會填它,所以出貨路徑上它永遠存在;選用是為了那些手寫半張表的既有測試
   * (`world.combatFeel = { knockback, standstill }`)—— 把它改成必填會讓那些檔案
   * 編不過,而它們散在別的工作流擁有的目錄裡。
   *
   * 讀的時候一律走 `facingLock.ts` 的 `facingTicks(world)`,它對缺格回退到
   * `DEFAULT_FACING`。**不要**直接讀 `world.combatFeel.facing!` —— undefined
   * 一路傳下去會變成 `world.tick + NaN`,而 `NaN` 讓每個到期比較都是 false,
   * 面向鎖會永遠不過期,而且完全無聲。
   */
  facing?: FacingRules;
  /**
   * ⭐ 預測影子的扣留旗標（GH#370）。選用的理由與 `facing` 逐字相同。
   * 語意與量到的數字全部在 `sim/predictionHold.ts`；客戶端讀的是
   * `apps/client/src/predict/predictionHold.ts` 的現值（算好的遮罩）。
   */
  predictionHold?: PredictionHoldRules;
  /**
   * ⭐ 命中定格（hitstop）要不要連**脚步**一起按住。選用的理由與 `facing` 逐字相同。
   * 語意、量到的數字（被圍住時 39/100 tick 完全動不了）與出貨預設全部在
   * `sim/combat/hitstopHold.ts`。讀的時候一律走那支的 `hitstopRules(world)`。
   */
  hitstop?: HitstopRules;
}

/**
 * owner 在 GH#193 直接給的數字。`bodyUnit` 是本任務替他假設的 1.0。
 *
 * `authoredWins: true` / `longerDamageWins: false` 的理由見 `damageShoveWins`。
 */
export const DEFAULT_KNOCKBACK: KnockbackRules = Object.freeze({
  minPct: 0.05,
  maxBodies: 10,
  bodyUnit: 1.0,
  authoredWins: true,
  longerDamageWins: false,
  launchShortUnits: 3,
  launchLongUnits: 12,
  launchEdgeUsesFireRing: true,
});

export const DEFAULT_STANDSTILL: StandstillRules = Object.freeze({
  enabled: true,
  walkEps: 0.5,
  applyToMobs: true,
  // GH#755 —— 兩格門檻各自可調（理由寫在宣告上），rollback 預設關。
  stillEps: 0.1,
  closingRatio: 0.5,
  legacyAbsoluteClosing: false,
});

/**
 * 出貨預設 = #264 訂下、#275 沿用的那兩個數字(3 tick = 100ms 蓋過 client 那段
 * 70ms 的 yaw 平滑;6 tick = 200ms,和 `TURN_FACTOR` 轉完 90° 同一個量級)。
 */
export const DEFAULT_FACING: FacingRules = Object.freeze({
  followThroughTicks: 3,
  instantCastTicks: 6,
});

/**
 * 出貨預設。
 *
 * `stallTicks: 30` = 1 秒。**不要調小到接近 hitstop/擊倒的長度** —— 那些會讓
 * 速度短暫歸零,而 1 秒的窗口濾得掉**單發**的它們(`combat/damage.ts` 的
 * `KNOCKDOWN_TICKS = 14`;內容裡授權的 `hitstopTicks` 最大是 5,量的是
 * `content/abilities/*.json`)。上界 600 tick(20 秒)是刻意的:再長就等於這條
 * 規則不存在,而且是靜默的。
 *
 * ⚠️⚠️ 2026-07-30 更正:上面那句話原本寫的是「1 秒的窗口把它們**全部**濾掉」,
 * 而那個「全部」是**假的**,兩個方向都假:
 *
 *   · 它漏了**硬控**。掃出貨內容量到 86 支帶 `root`/`stun` 的 `applyStatus`,
 *     其中 47 支持續 ≥ 1 秒,最長 4 秒(= 120 tick,是這個窗口的四倍)。
 *     ⚠️ 最長的那一支是 **stun**(`godie-hvsh.passive` 石化之眼),不是 root ——
 *     只處理 root 的實作會漏掉最嚴重的那一種。
 *   · 連 hitstop 它也只擋得住**單發**。每一發新傷害都重新上值,被兩三個單位
 *     輪流打的人 hitstop 是接續的,連起來超過 30 tick 一點都不難
 *     (`autoEngageStalledWalk.test.ts` 的 `ae-cc-hitstop-is-not-a-stall`
 *     就是用 40 tick 的連段量的)。
 *
 * 兩者都靠 `ccPausesStall`(見下)處理,**不是**靠把 `stallTicks` 調大 ——
 * 調大 120 會讓真的卡住的玩家等四秒。
 *
 * `stallSpeed: 0.5` 沿用「打就站定」的 `walkEps` —— 同一個問題(這一 tick 到底
 * 有沒有在走)只該有一個門檻的量級,兩個數字各自漂移是下一個 bug 的形狀。
 *
 * `seekRadius: 48` = bot 的 `AI_ENGAGE_RANGE`。競技場半徑 24,所以 48 蓋得住
 * 場內任兩點;查詢本身仍然是 zone-scoped(`queryOverlap` 認 zone),不會跨場。
 */
export const DEFAULT_AUTO_ENGAGE: AutoEngageRules = Object.freeze({
  enabled: true,
  stallTicks: 30,
  stallSpeed: 0.5,
  seekRadius: 48,
  // 出貨 **false** = 今天的行為,一個 tick 都沒有變(見 `idleSeeks` 的說明)。
  // 這一格是 owner 的平衡決策,不是缺陷修正:true 那一側會讓「什麼都不按」的
  // 玩家自己走過去打人,手感等同全員預設 A 移動。預設留在今天的那一側。
  idleSeeks: false,
  // 出貨 true。false 那一側是量到「86.6% 的走位 tick 被搶走」的那個行為,
  // 留著只是為了讓 owner 可以在後台回頭,不是一個平起平坐的選項。
  respectLiveSteering: true,
  // 出貨 true。false = 被定身 1 秒以上的玩家照樣被判定成「走位卡住」,走位權被
  // 追擊搶走 —— 出貨內容有 47 支這種硬控,最長 4 秒。同樣只是給 owner 回頭用的。
  ccPausesStall: true,
});

/**
 * ⭐ 單位互卡**脫困保險絲**（GH#677, owner 2026-08-24：「黏超過 N秒一定可以離開
 * 之類，這些機制做成後台開關，目前 **N 預設2秒**」）。
 *
 * ── 它治的是哪一種「黏住」（三種黏住、三個機制，⛔ 不要合併）─────────────────
 *   · hitstop victim-hold / 擊倒 → `hitstop.stuckGuard`（挨打型凍結）
 *   · 撞牆 / 卡柱子             → `autoEngage`（接敵接手）＋ 導航表繞路
 *   · **單位互卡**（被人群 / 隊友的身體堵死）→ **這一格**。
 *     判準沿用 `walkIsStalled` 那一族的同一組門（有 move 指令、還沒到站、
 *     ⛔ 被硬控按住的 tick 不算），但位移量的是 **tick 與 tick 之間的實際座標差**
 *     —— `Transform.vel` 是分離 pass **之前**寫的，被人群原地頂回來的單位
 *     vel 永遠報滿速（`MovementSystem` 步驟 2 的註解），拿它量互卡永遠量不到。
 *
 * ── 脫困手段：**短暫忽略單位間碰撞**（phasing），⛔ 不是瞬移 ─────────────────
 * 觸發後 `releaseSec` 內，這具身體與其他單位的**軟分離**（`separatePair`）互相
 * 跳過 —— 他走得穿人牆。⚠️ 界線：**牆 / 柱子 / 場界 / 守護者一格都不豁免**
 * （`moveWithCollision` / `pushOutOfObstacle` / `clampToBoundary` 原封不動），
 * 否則保險絲變成穿牆逃課機制。⭐ 觸發本身也閘在「此刻真的與別的單位重疊」上 ——
 * 卡在純牆上的人不觸發（phasing 幫不了他，觸發只會白喊「脫困」）。
 */
export interface StuckEscapeRules {
  /** 總開關。false = 保險絲整個不存在（GH#677 之前的行為，一鍵 rollback）。 */
  enabled: boolean;
  /** 連續互卡幾秒就放行。owner 的數字：**2**。 */
  thresholdSec: number;
  /** 放行窗長度（秒）：這段期間單位間碰撞不擋他。0 = 只累積不放人 = 等於關。 */
  releaseSec: number;
}

/**
 * 出貨值。`thresholdSec: 2` 是 owner 的原話（「目前 N 預設2秒」）；
 * `releaseSec: 1` 是**我挑的**（移速 5.8 × 1 秒 ≈ 5.8 單位 ≈ 穿過四五個身位 ——
 * 夠走出任何一圈人牆，又不足以整場當幽靈），回頭的路就是後台那一格。
 */
export const DEFAULT_STUCK_ESCAPE: StuckEscapeRules = Object.freeze({
  enabled: true,
  thresholdSec: 2,
  releaseSec: 1,
});

/** 正規化。夾限 0..10 與 Zod 的上下界**逐字相同**（admin 的鏡射測試會比對）。 */
export function normalizeStuckEscapeRules(raw: unknown): StuckEscapeRules {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  return Object.freeze({
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_STUCK_ESCAPE.enabled,
    thresholdSec: num(r.thresholdSec, DEFAULT_STUCK_ESCAPE.thresholdSec, 0, 10),
    releaseSec: num(r.releaseSec, DEFAULT_STUCK_ESCAPE.releaseSec, 0, 10),
  });
}

/**
 * 出貨預設 = owner 2026-08-03 明說的那一側(「玩家指定攻擊的對象應該是最高
 * 優先級」),**不是**今天的行為。這是刻意的:今天的行為是量到的缺陷
 * (手選目標在搖桿 / 觸控上只活 1 tick),不是一個平起平坐的選項。
 *
 * `leashUnits: 0` = 「永遠」,同樣照 owner 的字面。想要「跑遠了就算了」的人在
 * 後台填一個距離即可。
 */
export const DEFAULT_MANUAL_ORDER: ManualOrderRules = Object.freeze({
  survivesGroundMove: true,
  leashUnits: 0,
  // owner 2026-08-24 直接給的數字(「要有1秒冷卻」)。
  moveOrderNoAggroSec: 1.0,
  // ⭐ owner 2026-08-24「直到 我走到目的地」⇒ 預設就是新的那一邊（第〇·六守則）。
  moveOrderNoAggroUntilArrival: true,
  // ⭐ owner 2026-08-24:「現在玩 LOL 人數最多，最容易被接受」⇒ 預設就是 LoL 語意。
  lolControlModel: true,
  // ⭐ GH#652 細節①:owner 2026-08-24「do it」⇒ 出貨就是 LoL 那一邊（第〇·六守則）。
  recoveryCancelOnOrder: true,
  // ⭐ GH#652 細節②:同上。
  attackMoveNearestToCursor: true,
});

/**
 * 手把／觸控的**自動**瞄準：一堆殭屍擋在敵方英雄前面時，該鎖誰（GH#315）。
 *
 * ⚠️ 這是 2026-08-11 那個 T0 的另一半。修好「殭屍點得到」之後，同一份可點選
 * 清單也餵給 `pickNearestUnit`（手把瞄準輔助 / 觸控自動取得）—— 少了這個懲罰，
 * 貼臉的殭屍會把瞄準從敵方英雄身上搶走，那是把一個缺陷換成另一個。
 *
 * ⛔ **只有自動索敵讀它。** 滑鼠直接點（`pickUnit`）刻意不讀 —— 直接點是玩家的
 * 明確選擇，點到誰就是誰，插一個優先序進去等於「我點了殭屍，英雄卻去打別人」。
 */
export interface AimAssistRules {
  /**
   * 小怪在自動索敵裡被扣的「等效距離」（單位）。
   *
   * 出貨 **6.0** = 「殭屍要比英雄近 6 個單位以上，才搶得走瞄準」。決鬥區半徑是
   * 24，所以那是「貼臉的殭屍才會被鎖」。
   *
   * `0` = 不讓路（誰近鎖誰，也就是 GH#315 修好之前那個會被殭屍海淹沒的行為）。
   * 上界 **24** = 決鬥區半徑：再高就等於「小怪永遠不會被自動瞄準」，
   * 而那是一個看起來像壞掉的值（第一守則：欄位要有上界，不是只有下界）。
   */
  mobPenalty: number;
}

/** 出貨預設。owner 2026-08-11 核准把這一格從客戶端常數升級成後台欄位。 */
export const DEFAULT_AIM_ASSIST: AimAssistRules = Object.freeze({ mobPenalty: 6 });

/** `mobPenalty` 的上下界。schema 與後台欄位共用這一組。 */
export const AIM_ASSIST_MOB_PENALTY_MIN = 0;
export const AIM_ASSIST_MOB_PENALTY_MAX = 24;

export function normalizeAimAssistRules(raw: unknown): AimAssistRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    mobPenalty: num(
      r.mobPenalty,
      DEFAULT_AIM_ASSIST.mobPenalty,
      AIM_ASSIST_MOB_PENALTY_MIN,
      AIM_ASSIST_MOB_PENALTY_MAX,
    ),
  });
}

/**
 * 出貨預設。
 *
 * ⚠️ 缺文件 / 壞文件 → **回這個**,不是空表。回空表的話 `minPct` 是 0(每一下
 * 都推)或 `maxBodies` 是 0(永遠不推),兩種都是靜默的規則消失:沒有任何錯誤
 * 訊息,遊戲照跑,手感全毀。這是 `statCaps.ts` 學到的同一課。
 */
export const DEFAULT_COMBAT_FEEL: CombatFeelRules = Object.freeze({
  knockback: DEFAULT_KNOCKBACK,
  standstill: DEFAULT_STANDSTILL,
  facing: DEFAULT_FACING,
  predictionHold: DEFAULT_PREDICTION_HOLD,
  hitstop: DEFAULT_HITSTOP,
  autoEngage: DEFAULT_AUTO_ENGAGE,
  stuckEscape: DEFAULT_STUCK_ESCAPE,
  manualOrder: DEFAULT_MANUAL_ORDER,
  aimAssist: DEFAULT_AIM_ASSIST,
});

/** 文件的 schema 字串 —— 讀寫兩端(sim / 後台)共用這一個常數。 */
export const COMBAT_FEEL_SCHEMA = "config.combat-feel@1";
/** 文件 id(`content/config/combat-feel.json`)。 */
export const COMBAT_FEEL_DOC_ID = "combat-feel";

function num(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * 正規化操作者/文件給的表。每一格單獨退回出貨預設 —— 一格打錯不會把整張表
 * 一起丟掉,但也不會把 `NaN` 帶進 sim(`NaN` 會讓每一個比較都是 false,擊退就
 * 靜默消失)。
 *
 * 夾限是刻意的:`minPct` 允許 0(每一下都推)到 1(只有一擊必殺才推);
 * `maxBodies` / `bodyUnit` 不允許負數(負的擊退 = 把人吸過來,那是另一個機制,
 * 不該從一個打錯的設定值意外冒出來)。
 */
export function normalizeKnockbackRules(raw: unknown): KnockbackRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    minPct: num(r.minPct, DEFAULT_KNOCKBACK.minPct, 0, 1),
    maxBodies: num(r.maxBodies, DEFAULT_KNOCKBACK.maxBodies, 0, 100),
    bodyUnit: num(r.bodyUnit, DEFAULT_KNOCKBACK.bodyUnit, 0, 100),
    authoredWins:
      typeof r.authoredWins === "boolean" ? r.authoredWins : DEFAULT_KNOCKBACK.authoredWins,
    longerDamageWins:
      typeof r.longerDamageWins === "boolean"
        ? r.longerDamageWins
        : DEFAULT_KNOCKBACK.longerDamageWins,
    // 上界 100 與 `maxBodies` / `bodyUnit` 同一個帶：競技場半徑 24，所以 100
    // 以上實務上等同「到底部」，留著只是擋「12 打成 1200」那種手滑（#277）。
    launchShortUnits: num(r.launchShortUnits, DEFAULT_KNOCKBACK.launchShortUnits, 0, 100),
    launchLongUnits: num(r.launchLongUnits, DEFAULT_KNOCKBACK.launchLongUnits, 0, 100),
    launchEdgeUsesFireRing:
      typeof r.launchEdgeUsesFireRing === "boolean"
        ? r.launchEdgeUsesFireRing
        : DEFAULT_KNOCKBACK.launchEdgeUsesFireRing,
  });
}

export function normalizeStandstillRules(raw: unknown): StandstillRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_STANDSTILL.enabled,
    walkEps: num(r.walkEps, DEFAULT_STANDSTILL.walkEps, 0, 100),
    applyToMobs:
      typeof r.applyToMobs === "boolean" ? r.applyToMobs : DEFAULT_STANDSTILL.applyToMobs,
    // GH#755 —— 上界不只有下界（第一守則）：`stillEps` 到 100（＝關掉整條規則的
    // 極端），`closingRatio` 硬性 [0,1]（>1 沒有意義：徑向分量不可能大於速度）。
    stillEps: num(r.stillEps, DEFAULT_STANDSTILL.stillEps, 0, 100),
    closingRatio: num(r.closingRatio, DEFAULT_STANDSTILL.closingRatio, 0, 1),
    legacyAbsoluteClosing:
      typeof r.legacyAbsoluteClosing === "boolean"
        ? r.legacyAbsoluteClosing
        : DEFAULT_STANDSTILL.legacyAbsoluteClosing,
  });
}

/**
 * 讀一份 `config.combat-feel@1` 文件(sim 與後台共用的那個 `Configs` registry)。
 * 沒有文件 / schema 不對 → 出貨預設(見 DEFAULT_COMBAT_FEEL 上面的警告)。
 */
/**
 * Tick 數專用:先夾到 [min,max] 再取整。**非整數的 tick 是靜默的災難** ——
 * `world.tick + 2.5` 之後 `world.tick >= lock.untilTick` 會在半個 tick 的位置
 * 為真,鎖的長度就變成「有時 2 有時 3」,而 sim 必須逐 tick 決定性重播。
 */
function ticks(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  const clamped = v < min ? min : v > max ? max : v;
  return Math.round(clamped);
}

/**
 * 上界是刻意的(第一守則:「欄位要有上界,不是只有下界」)。300 tick = 10 秒 ——
 * 遠超過任何一次出手,但擋得住「6 打成 600」那種手滑:600 tick 的鎖等於整整
 * 20 秒不能用右類比轉身,而且是**靜默**的,沒有任何錯誤訊息。
 */
export function normalizeFacingRules(raw: unknown): FacingRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    followThroughTicks: ticks(r.followThroughTicks, DEFAULT_FACING.followThroughTicks, 0, 300),
    instantCastTicks: ticks(r.instantCastTicks, DEFAULT_FACING.instantCastTicks, 0, 300),
  });
}

/**
 * 上界都是刻意的(第一守則:「欄位要有上界,不是只有下界」)。
 * `seekRadius` 夾到 200:競技場半徑 24,200 已經遠超過任何合理值,但擋得住
 * 「48 打成 4800」那種手滑 —— 太大的半徑會讓 `queryOverlap` 每 tick 掃全場。
 */
export function normalizeAutoEngageRules(raw: unknown): AutoEngageRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_AUTO_ENGAGE.enabled,
    stallTicks: ticks(r.stallTicks, DEFAULT_AUTO_ENGAGE.stallTicks, 1, 600),
    stallSpeed: num(r.stallSpeed, DEFAULT_AUTO_ENGAGE.stallSpeed, 0, 100),
    seekRadius: num(r.seekRadius, DEFAULT_AUTO_ENGAGE.seekRadius, 0, 200),
    idleSeeks: typeof r.idleSeeks === "boolean" ? r.idleSeeks : DEFAULT_AUTO_ENGAGE.idleSeeks,
    respectLiveSteering:
      typeof r.respectLiveSteering === "boolean"
        ? r.respectLiveSteering
        : DEFAULT_AUTO_ENGAGE.respectLiveSteering,
    ccPausesStall:
      typeof r.ccPausesStall === "boolean"
        ? r.ccPausesStall
        : DEFAULT_AUTO_ENGAGE.ccPausesStall,
  });
}

/**
 * 上界是刻意的(第一守則:「欄位要有上界,不是只有下界」)。`leashUnits` 夾到
 * 200:競技場半徑 24,所以 24 以上實務上就是「不限制」,200 純粹是擋住
 * 「24 打成 2400」那種手滑 —— 一個荒謬的牽引距離不會有任何錯誤訊息,只會讓
 * 這一格看起來沒作用。
 */
export function normalizeManualOrderRules(raw: unknown): ManualOrderRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    survivesGroundMove:
      typeof r.survivesGroundMove === "boolean"
        ? r.survivesGroundMove
        : DEFAULT_MANUAL_ORDER.survivesGroundMove,
    leashUnits: num(r.leashUnits, DEFAULT_MANUAL_ORDER.leashUnits, 0, 200),
    moveOrderNoAggroSec: num(
      r.moveOrderNoAggroSec,
      DEFAULT_MANUAL_ORDER.moveOrderNoAggroSec,
      0,
      10,
    ),
    moveOrderNoAggroUntilArrival:
      typeof r.moveOrderNoAggroUntilArrival === "boolean"
        ? r.moveOrderNoAggroUntilArrival
        : DEFAULT_MANUAL_ORDER.moveOrderNoAggroUntilArrival,
    lolControlModel:
      typeof r.lolControlModel === "boolean"
        ? r.lolControlModel
        : DEFAULT_MANUAL_ORDER.lolControlModel,
    recoveryCancelOnOrder:
      typeof r.recoveryCancelOnOrder === "boolean"
        ? r.recoveryCancelOnOrder
        : DEFAULT_MANUAL_ORDER.recoveryCancelOnOrder,
    attackMoveNearestToCursor:
      typeof r.attackMoveNearestToCursor === "boolean"
        ? r.attackMoveNearestToCursor
        : DEFAULT_MANUAL_ORDER.attackMoveNearestToCursor,
  });
}

export function combatFeelFromDoc(doc: unknown): CombatFeelRules {
  if (!doc || typeof doc !== "object") return DEFAULT_COMBAT_FEEL;
  const d = doc as {
    schema?: unknown;
    knockback?: unknown;
    standstill?: unknown;
    facing?: unknown;
    autoEngage?: unknown;
    stuckEscape?: unknown;
    manualOrder?: unknown;
    aimAssist?: unknown;
    predictionHold?: unknown;
    hitstop?: unknown;
  };
  if (d.schema !== COMBAT_FEEL_SCHEMA) return DEFAULT_COMBAT_FEEL;
  return Object.freeze({
    knockback: normalizeKnockbackRules(d.knockback),
    standstill: normalizeStandstillRules(d.standstill),
    facing: normalizeFacingRules(d.facing),
    autoEngage: normalizeAutoEngageRules(d.autoEngage),
    stuckEscape: normalizeStuckEscapeRules(d.stuckEscape),
    manualOrder: normalizeManualOrderRules(d.manualOrder),
    aimAssist: normalizeAimAssistRules(d.aimAssist),
    predictionHold: normalizePredictionHold(d.predictionHold),
    hitstop: normalizeHitstopRules(d.hitstop),
  });
}

/**
 * 這一擊的**原始**擊退距離 (GGD units),還沒有減掉距離。
 *
 *     pct  = damage / maxHp                       (受傷單位的最大生命)
 *     pct < minPct                → 0             (完全不擊退)
 *     raw  = maxBodies × min(pct,1) × bodyUnit    (身位 → GGD 單位)
 *
 * @param damage 這一擊**減傷後、吃盾前**的傷害(damage.ts 的 `impact`)
 * @param maxHp  受傷單位的最大生命;<= 0 視為沒有身體 → 不擊退
 */
export function knockbackRaw(rules: KnockbackRules, damage: number, maxHp: number): number {
  if (!(maxHp > 0) || !(damage > 0)) return 0;
  const pct = damage / maxHp;
  if (!(pct >= rules.minPct)) return 0;
  const capped = pct > 1 ? 1 : pct;
  return rules.maxBodies * capped * rules.bodyUnit;
}

/**
 * 減距離:`max(0, raw − gap)`。⚠️ 見檔頭 ——「這個減法是重點」。
 *
 * ⚠️ 這一步套用在**每一種**擊退上,包含內容作者寫在 `hitFeel.knockbackMag`
 * 的覆寫值(見 combat/damage.ts)。理由是量出來的:出貨內容裡 **114/115 位英雄
 * 的普攻都帶著一個 hitFeel.knockbackMag**(0 / 0.25 / 0.3 / 0.45),如果覆寫值
 * 不走這條減法,#193 的整條新法則對**普攻完全無效** —— 而普攻正是 owner 抱怨的
 * 那件事(#45:近戰自己打出的擊退把目標推出自己的射程)。
 *
 * 所以覆寫值的語意是「距離 0 時要推多遠」,不是「無論如何都推這麼遠」。
 */
export function afterGap(raw: number, gap: number): number {
  const out = raw - (gap > 0 ? gap : 0);
  return out > 0 ? out : 0;
}

/**
 * 完整的擊退法則(raw → 減距離)。**唯一**的擊退計算,sim 與任何面板都讀這一支。
 *
 * 純算術:加減乘除與比較,沒有 rng、沒有三角函數、沒有 `**`。兩台主機同樣的
 * 輸入必然得到同樣的輸出(sim/purity.test.ts)。
 *
 * @param gap 攻守雙方**目前**的距離 (GGD units)
 */
export function knockbackDistance(
  rules: KnockbackRules,
  damage: number,
  maxHp: number,
  gap: number,
): number {
  return afterGap(knockbackRaw(rules, damage, maxHp), gap);
}

/** 目前佔著 `nav.override` 的那一段位移,壓成仲裁需要的兩個事實。 */
export interface ActiveShove {
  /** 技能授權的嗎(擊退/擊飛/衝刺 effect),還是傷害驅動的環境擊退 */
  authored: boolean;
  /** 還剩多少距離要走 (GGD units);擊飛用「現在到落點」的平面距離 */
  remaining: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  誰贏:傷害驅動的擊退 vs 已經在身上的那一段位移
 * ═══════════════════════════════════════════════════════════════════════════
 * `combat/damage.ts` 在 `step()` 的第 8 格排乾傷害佇列,而 effect 是在第 2b/3 格
 * 跑的。所以「這一擊要不要接管那具身體」是一個**每 tick 都會遇到的決策**,
 * 不是罕見的競態。
 *
 * ── 為什麼預設是「技能贏」(`authoredWins: true`, `longerDamageWins: false`)
 *
 * ① **不這樣做的話這根原語在出貨路徑上是全滅的,這是量出來的。** 出貨內容裡
 *    描述已經承諾要擊退/擊飛的 11 支技能(見 content/fieldAdoption.test.ts 的
 *    knockback 豁免條目所列的完整清單:95-01、47-03、77-01、05-04、57-01、
 *    32-01、76-02、39-02、06-00、06-002、78-04)**每一支都造成傷害**。無條件
 *    賦值之下,它們授權的距離會被自己的傷害在同一 tick 蓋成傷害驅動的那個值。
 *    實測(`sim/knockbackVsDamage.test.ts` 的場景):授權 12 單位 → 量到 1.50。
 *
 * ② **方向也是設計,不只是距離。** `from: "pull"` 的鉤索系技能把目標**拉向**
 *    施法者,而傷害驅動的擊退永遠是**推開**。任何「取距離較大的那個」或
 *    「兩者相加」的合併規則都會在傷害夠大時把拉近翻成推開 —— 那不是被調弱,
 *    是那支技能當場失效。所以 `longerDamageWins` 的預設是 false,而且它的
 *    欄位說明必須講出這個代價。
 *
 * ③ **這和 GH#193 不衝突,因為 #193 已經在技能那一側了。** `effects/knockback.ts`
 *    的 `impactPower` 會把授權的擊退送進**同一支** `knockbackRaw` / `afterGap`,
 *    吃的是操作者當下的 `minPct` / `maxBodies` / `bodyUnit`。所以「技能贏」贏掉的
 *    是**重複計算**,不是那條法則。
 *
 * ④ **和全遊戲共用的那個語意同向。** 作者寫的 `hitFeel.knockbackMag` 早就是
 *    「下限」而不是「取代」(見 afterGap 的檔頭)。作者的數字一路被當成**至少
 *    要這麼多**,而不是被環境規則洗掉 —— 這裡只是把同一個立場延伸到
 *    「兩個寫入者撞在一起」這個情形。
 *
 * ── 被否決的候選,以及為什麼
 *
 *   · 「兩者相加」—— 沒有任何上界。`KB_MAX_DISTANCE` 只夾單一來源,相加之後
 *     可以把人推出整個競技場,而且是靜默的。
 *   · 「依 kind 排優先序」—— `kind` 只有 dash/knockback/leap 三個值,分不出
 *     「技能寫的 knockback」和「傷害寫的 knockback」,而那正是要分的那一刀。
 *
 * 純比較,沒有 rng / 三角函數 / `**`(sim/purity.test.ts)。
 *
 * @param active   目前佔著 `nav.override` 的位移;`null` = 那具身體是空的
 * @param incoming 這一擊算出來的擊退距離(已經減過距離)
 * @returns 傷害擊退可以寫入 `nav.override` 嗎
 */
export function damageShoveWins(
  rules: KnockbackRules,
  active: ActiveShove | null,
  incoming: number,
): boolean {
  // 沒有東西擋路,或擋路的本來就是上一發傷害擊退 → 新的一發覆蓋舊的一發,
  // 這是修這條缺陷之前就有的行為,而且它沒有問題(連續挨打就是一直被推)。
  if (active === null || !active.authored) return true;
  if (!rules.authoredWins) return true;
  return rules.longerDamageWins && incoming > active.remaining;
}

// --------------------------------------------------------------- 打就站定 --
// owner 2026-07-28:「遠程單位在攻擊的時候可以邊移動邊攻擊,這樣對近戰單位來說
// 是不公平的」+「殭屍王也會預設套用」+「整體這個功能在後台也是個開關」。
//
// 為什麼這條規則以前**不存在**,以及不對稱到底在哪裡 —— 全部是量出來的
// (出貨 bundle,115 位英雄,2026-07-28):
//
//                     人數   射程中位數   前搖中位數        沒設前搖的
//     近戰            82     1.6          0.25 s = 8 tick   51/82
//     遠程            33     8.2          0.30 s = 9 tick   25/33
//     移速中位數             5.9 / 5.7(兩邊幾乎一樣)
//
// ⚠️ 不對稱**不在前搖**。遠程的預設前搖(DEFAULT_DAMAGE_POINT_RANGED = 0.3)
// 其實比近戰的(0.25)還**長**,而且兩邊中位數只差一個 tick。真正差五倍的是
// **射程**:前搖那 0.25 s 內,一個 5.9 移速的目標會走掉 1.48 個單位 —— 對 1.6
// 射程的近戰來說幾乎就是脫離接觸,對 8.2 射程的遠程來說整碗吸收。所以「能不能
// 邊走邊打」以前是被射程夾出來的副作用,不是被任何規則決定的。
// (PR #182 的註解寫「近戰前搖 0.5s(15 tick) vs 遠程 0.3s(9 tick)」,那個
//  0.5 s 是近戰的**最大值**不是中位數。錯的註解會變成下一個人的事實,所以更正
//  在這裡留一份。)

/** 這一 tick 有沒有在「走」—— 讀的是實際位移 `Transform.vel`,不是移動意圖。 */
export function isWalking(rules: StandstillRules, vel: Vec2): boolean {
  return lenSq(vel) > rules.walkEps * rules.walkEps;
}

/**
 * 徑向靠近速度:正 = 正在拉近,負 = 正在拉開,0 = 純側移或沒動。
 * 用向量投影,不用角度 —— sim 禁止三角函數(purity.test.ts)。
 */
export function closingSpeed(vel: Vec2, selfPos: Vec2, targetPos: Vec2): number {
  return dot(vel, normalize(sub(targetPos, selfPos)));
}

/**
 * 站定規則的**唯一**判斷:這一 tick 該不該擋下對 `targetPos` 的出手?
 *
 *     有在動(|vel| > stillEps) 而且 不是在朝目標靠近(徑向速度 < closingRatio × |vel|) → 擋
 *
 * ⭐ **GH#755 把兩個門檻拆開了**(2026-08-27)。在此之前兩者共用同一個 `walkEps`,
 * 而那不是設計選擇 —— 它有兩個沒有人量過的結構後果:
 *
 *     A  有效移速 ≤ 0.5 的單位**整條規則靜默關閉**(重減速下純後退拿全額輸出)
 *     B  允許的移動角度**隨移速伸縮**而且非單調(疊更多減速反而可能拿回攻擊)
 *
 * 現在「有沒有在動」讀雜訊地板 `stillEps`,「靠近多快」讀**無因次**的
 * `closingRatio × |vel|` ⇒ 判定只看**方向**,對移速齊次。舊行為留在
 * `legacyAbsoluteClosing` 這一格後台開關後面(預設關)。
 *
 * 三種移動被清楚地分開:
 *
 *     朝目標衝     靠近速度 ≈ 全速  → 可以出手(近戰接近戰、被擊退後歸位)
 *     繞圈／側移   靠近速度 ≈ 0     → 不能出手(風箏的走位是這一種)
 *     後退／被擊退 靠近速度 < 0     → 不能出手(風箏的本體;被打飛就別想揮完)
 *
 * 用**徑向靠近速度 >= walkEps**,而不是 `dot > 0`:純側移的靠近速度約等於 0,
 * 浮點雜訊會讓它在正負之間跳,規則就變成擲骰子。
 *
 * ---------------------------------------------------------------------------
 * 「正在靠近」這個例外是**量出來的,不是設計品味**
 * ---------------------------------------------------------------------------
 * 把「靠近」那一半拿掉(等於只要在動就擋)再跑 `sim/autoAttackCensus.test.ts`:
 *
 *     godie-zombiex 在射程內十秒**一下都打不出來**(0/7),再加一位掉到門檻以下
 *
 * 靠近的動作(接近戰、被推開之後歸位、身體被擠開之後回位)會被誤判成「玩家在
 * 跑」。PR #182 第一版沒有這個例外時點名 **14 位**近戰;現在只剩 1~2 位,差別
 * 來自 GH#193 的擊退修正。例外變小了但沒有消失,所以它留著。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 已知的邊界:碰撞造成的抖動
 * ---------------------------------------------------------------------------
 * PR #182 的註解說「撞牆推不動的人位移是 0,所以他還是能打」。對**場地邊界**
 * 成立(`moveWithCollision` 乾淨地夾住,`vel` 真的是 0);對**圓形柱子**不一定,
 * 因為 `pushOutOfObstacle` 會把身體推進去又推出來。兩種情形都有守衛
 * (`sim/attackStandstill.test.ts` 的 ss-blocked-counts-as-still / ss-obstacle-jitter),
 * 而且都是綠的 —— 但那句話值得標成「有條件成立」而不是通則。
 *
 * 英雄(BasicAttackSystem)和小怪/殭屍王(MobSystem)讀的是同一支,所以不會
 * 出現「殭屍能邊走邊打、玩家不能」—— owner 明確要求殭屍王也套用,而小怪走的是
 * 完全不同的簡化攻擊路徑,兩邊各寫一次必然會分岔。
 *
 * 目標和自己完全重疊時 `normalize` 給 0 向量、靠近速度 0 → 算沒在靠近;那種
 * 情況下身體會被 separation 推開,而 separation 直接改 `pos` 從不寫 `vel`,
 * 所以那個單位讀到的速度是 0,走的是「站著」那條路,不受這裡影響。
 */
export function standstillBlocks(
  rules: StandstillRules,
  vel: Vec2,
  selfPos: Vec2,
  targetPos: Vec2,
): boolean {
  if (!rules.enabled) return false;
  // ⛔ ROLLBACK（GH#755）—— 逐位元的舊行為。⚠️ 兩行都要留在同一支裡：
  // 分成兩個函式就會有兩份「什麼叫在走」，而漂掉的那一份不會有東西紅。
  if (rules.legacyAbsoluteClosing) {
    if (!isWalking(rules, vel)) return false;
    return closingSpeed(vel, selfPos, targetPos) < rules.walkEps;
  }
  // ── 新規則（GH#755）：兩個門檻**不再共用同一個數字** ────────────────────
  // ① 有沒有在動 —— 雜訊地板 `stillEps`（⛔ 不是 `walkEps`）。
  //    舊版拿 0.5 當這一格 ⇒ **有效移速 ≤ 0.5 的單位整條規則靜默關閉**，
  //    重減速之下純後退風箏拿全額輸出（本票的後果 A）。
  const speed = len(vel);
  if (!(speed > rules.stillEps)) return false;
  // ② 靠近多快 —— **比例**門檻。舊版用絕對速度 0.5 ⇒ 允許的移動角度隨移速
  //    伸縮而且非單調（後果 B）：同一個方向把 |vel| 從 2.0 縮到 0.8 會翻面。
  //    `closing / speed` 只看方向，⇒ 對移速**齊次**。⛔ 寫成乘法而不是除法：
  //    `speed > stillEps ≥ 0` 保證分母非零，但乘法連那個假設都不需要。
  return closingSpeed(vel, selfPos, targetPos) < rules.closingRatio * speed;
}
