# 起手預告系統設計（CT / Telegraph System）

> 需求原話：「**CT (起手時間) 很重要，並且一定要有對應的動畫特效等，讓玩家有機會閃躲**」
>
> 本文件把它當作**公平性契約**（fairness contract）處理，不是拋光需求。所有數字都來自 2026-07-23
> 對**真實載入登錄表**（`ContentLoader` + `registerAll`，與 `apps/game-server/src/index.ts:165-166` 同一條路徑）
> 與**真實 SimWorld 逐 tick 步進**的實測，不是讀 JSON、不是讀測試。

---

## 0.0 LANE A 已實作：**分級起手時間（TIERED CAST POINT）**——本節取代所有「一律 0.6 秒」的敘述

> **owner 修訂後的規則（現行）**：
> 「castTimeSec **0.3 – 0.6 秒**，依技能有多兇殘決定，**最兇的封頂 0.9 秒**。」
>
> 第一版規則是**全部 0.6 秒**（未設定→0.6、已設定→+0.3）。它真的上線過，
> 也真的在 12 隻 bot 的 MatchController 裡跟 `castTimeSec = 0` 做過 A/B，然後被推翻。
> **推翻它的不是手感形容詞，是五組實測數字**，全部列在下面。

### 0.0.1 為什麼平坦值一定錯（實測，不是論證）

| 症狀 | 平坦 0.6 s 的實測 | 現在 |
|---|---|---|
| **人類定身佔比**（玩家一好就放，四格加總） | 平均 **41.7 %**、中位 **34.7 %**；113 隻裡 **25 隻 ≥ 50 %** | 平均 **22.0 %**、中位 **21.6 %**；**≥50 % 的有 0 隻** |
| **雕像**（CD 比自己的起手還短，永遠出不了施法狀態） | **7 隻**：godie-e00v / ekee / etyr / u011 / u012 / sela / thorne | **0 隻**（見 0.0.4 的不變量） |
| **位移技先被定住才動** | 13 支，實測位移到 **tick 18** 才開始長 | 12 支拿地板 0.3 s → **tick 9** 開始動；1 支（thorne.q）直接瞬發 |
| **起手比自己產生的效果還長** | 15 支（珍奶顏射 0.6 s 起手 / 0.1 s 效果、sela.r 0.8 / 0.75…） | **1 支**，而且是效果比 0.3 s 地板還短的那一支 |
| **護盾／治療遲到** | 全部 0.6 s | 全部 0.3 s 地板 |

> ⚠ **bot 量不出這件事。** Tier0Brain 在 815 秒裡只放了 260 次技能，定身佔比 1.7 %。
> 真正的分母是「**人類把每個技能一好就按**」——冷卻已經被 `combatEnv.cooldown = 0.25` 乘過，
> 中位技能其實每 **11.25 秒**就好一次，p10 只有 **3 秒**。任何用 bot 得出的「還好啊」都要丟掉。

### 0.0.2 公式（`packages/shared/src/content/castTimeFormula.ts`，內容由它推導而來）

**不手寫 554 個數字。** 內容是衍生資料，公式才是真相來源；
`castTimeCoverage.test.ts` 會把 554 支全部重新推導一次，跟 content 不一致就紅。

```
1) 例外先判（見 0.0.3），命中就直接定案
2) 否則算 PUNISH SCORE（權重合計 1，全部用真實 545 支的分布正規化）：
     .35  傷害      max-rank 傷害 / 1400        （p25 190 / 中位 300 / p75 700 / max 2200）
     .20  硬控      暈眩 1.0 / 定身 0.6 / 減速 0.25，**再乘上控制實際持續秒數**（>=1 s 才滿權重）
     .15  範圍      radius / 8                  （中位 5.88、max 9.72）
     .20  欄位      EX .9 > R .55 > W/E .12 > Q .08
     .10  投放      ground .5 / skillshot .3 / targeted .1 / self 0
   → 對映到 0.3 0.4 0.5 0.6 0.7 0.8 0.9 七階（score 0.75 = 封頂）
3) 兩道天花板再往下壓：
     A 冷卻天花板  ct <= 自己的後乘冷卻 / 8      ← 這條就是雕像不變量
     B 效果天花板  ct <= 自己最長的計時效果（下限仍是 0.3 s 地板）
```

**為什麼是 0.1 秒一階**：sim 是 30 Hz，`abilitySystem.ts` 用 `Math.round(castTimeSec / dt)`。
0.3…0.9 的每一個 0.1 倍數都剛好是整數 tick（9 / 12 / 15 / 18 / 21 / 24 / 27），
授權的秒數與模擬的 tick 完全一致。舊的 0.35 s 沒有這個性質（10.5 → 11 tick → 實際 0.367 s）。

**硬控權重乘上持續時間**這一項是刻意的：0.1 秒的「暈眩」是命中硬直（hit flinch），不是控制，
不該跟 2 秒的鎖死買到同樣的 0.20 分——珍奶顏射就是這樣換到 0.6 秒起手的。

### 0.0.3 例外清單（**逐條交代理由，不是默默豁免**）

| 類別 | 判準（機械化，從真實內容枚舉） | 支數 | 結果 | 理由 |
|---|---|---|---|---|
| **passive-only** | `passive` 有值 **且** `effects` 為空 | 9 | **無 castTimeSec 欄位** | `activateAbility` 在進到 cast 分支前就回傳 `"passive"`，寫了也讀不到，而且會在 codex 上騙人 |
| **rapid-fire** | 冷卻天花板已經低於 0.3 s 地板（＝後乘冷卻 < 2.4 s） | 17 | **瞬發** | 一個每 0.13 s 就好一次的技能沒有「承諾」可言。這正是七尊雕像的來源 |
| **mobility** | 任何 `dash` effect | 12（+1 落入 rapid-fire） | **0.3 s 地板** | 會自我預告的逃生鍵不是逃生鍵。全 13 支都是**純位移**（無傷害無控制），所以沒有攻擊性承諾可罰 |
| **defensive** | 有 heal / shield / restore 且**無**傷害 | 17 | **0.3 s 地板** | 遲到 0.6 秒的護盾等於沒有護盾 |
| **scored** | 其餘 | 499 | 0.3–0.9 | 上面的曲線 |

**普攻不在這裡**：`BasicAttackSystem` 的 windup 是另一套系統，本次一行都沒動。

> 🟡 **要在 playtest 用身體確認的兩件事（刻意套用規則而不是偷偷豁免）**
> 1. **位移技 0.3 s（9 tick）**。owner 給的選項是「地板或明確豁免」，這裡選地板而不是 0，
>    因為 owner 的視覺需求是**每一次施法都要有光柱**，瞬發就沒有柱子可放。
>    平坦規則下的實測失敗是 18 tick；現在砍半。若實戰仍覺得逃不掉，改成瞬發是一行。
> 2. **自我增益（applyBuff，175 支）**照常吃分數**沒有豁免**。一個純自 buff 沒有傷害沒有控制，
>    分數 0 → 落在 0.3 地板；有 R/EX 加權的會到 0.4–0.6。若「開大」的手感變鈍，
>    要調的是 slot 權重而不是逐支例外。
> 3. 全遊戲**沒有任何 toggle / 反擊（counter）castType**——枚舉過 `castType` 只有
>    targeted 211 / self 185 / ground 85 / skillshot 51 / dash 13，所以「反擊技被 0.6 秒毀掉」
>    這個疑慮在本內容庫裡**不存在**，不需要為它開例外。

### 0.0.4 雕像不變量（THE STATUE INVARIANT）

```
ct <= 自己的後乘冷卻 / 8
   => 單一技能定身佔比 <= 12.5 %
   => 四格全開的英雄，定身佔比 <= 50 %。這是「由構造保證」，不是量出來的巧合。
```

`ct <= cd/8 < cd` 恆成立，所以**任何下游調整都不可能再造出雕像**。
天花板低於 0.3 s 地板時（後乘冷卻 < 2.4 s），該技能改為瞬發而不是硬塞一個做不到的值。
`castTimeCoverage.test.ts` 把這條當 assertion 守著。

### 0.0.5 那 10 支原本就有授權值的技能，公式把它們搬到哪裡

owner 的舊指示是「原本有設定的都 +0.3」。**這條已被取代**：公式不看舊值，一律重推，
否則 554 支的曲線會被 10 個歷史數字扭曲。實際落點：

| 技能 | 原授權 | 現在 | 原作者會不會抗議 |
|---|---|---|---|
| godie-emfr.ex / osam.ex / ubal.ex | 0.35 | 0.6 | **會，而且應該被駁回**。這三支是 EX，0.35 s 比全服中位（0.4 s）還快——在一個「大招要有預告」的世界裡，究極技比小招還瞬發是不自洽的 |
| godie-h02s.ex / h02z.ex | 0.35 | 0.7 | 同上，且兩支都是帶硬控的 EX |
| godie-h01u.e | 0.6 | 0.7 | 幾乎沒動 |
| godie-u010.ex / uvng.ex（究極暴走黑龍波） | 0.6 | 0.8 | 900 傷害 × radius 6 的 EX，往上是對的 |
| sela.r（Firestorm） | 0.5 | 0.7 | 被**自己的 0.75 s 暈眩**天花板壓住，正好符合「起手不得長過自己的效果」 |
| thorne.r | 0.4 | 0.6 | — |

**唯一值得記住的一句**：這 10 個值是在「其他 544 支全部瞬發」的世界裡訂的。
那個世界已經不存在了，所以它們的相對關係本來就要重算。

### 0.0.6 現行分布（真實登錄表，`scripts/probeCastTelegraph.ts`）

```
contentVersion cv_d4c9a235c135        554 abilities
  (unset)   26   ← 9 passive-only + 17 rapid-fire
     0.30  172
     0.40  198   ← 中位數
     0.50   73
     0.60   42
     0.70   29
     0.80   12
     0.90    2   ← 76-04 三檔.巨人迴旋彈 ×2（1200 傷害 + 暈眩 + AoE）
會施法的 528 支：平均 0.425 s、中位 0.400 s
Champions.get(id).abilities[slot] 452 筆，0 筆與登錄表不一致（MIRROR 成立）
```

重推工具：`pnpm --filter @ggd/shared exec tsx scripts/deriveCastTimes.ts [--write]`。
**`combatEnv.cooldown` 一旦被改，整條曲線必須重推**——兩道天花板都是對後乘冷卻算的，
`castTimeCoverage.test.ts` 有一條測試專門把 0.25 這個值釘住，改了就會紅。

---

## 0. 一句話結論（先講最難聽的）

**這是一個披著特效外衣的數值問題——而且「加長起手時間」這個直覺解法本身也是錯的。**

實測：真實登錄表 554 個技能中 **544 個 `castTimeSec = 0`**（98.2%），會造成傷害的 329 個裡有 **319 個是瞬發**。
全遊戲最長的起手時間是 **0.60 秒**。而依照第 4 節重算後的幾何，
**要讓 90% 的英雄走得出中位傷害型 AoE，從危險出現在螢幕上到傷害落地，至少需要 1.19 秒**（地面蓋章式）
／**1.29 秒**（黏在施法者身上式）。全遊戲最長的預告只有這個門檻的 **50%**。

> ⚠ **1.19 秒是零餘裕的物理地板，不是可以拿去授權的數字**（第四輪修正，見 4.3a）：
> 照著它訂，玩家的閃避率大約是擲硬幣。**實際授權值要加 `M = 0.15 s` 的辨別／選擇反應餘裕
> ⇒ 中位 AoE 的 `T_warn` = 1.34 秒。**
> 同一輪也推翻了「後搖＝懲罰窗」：**閃掉一發技能的真正代價是 11.25 秒的冷卻，不是 0.6 秒的後搖**（見 0.5.3）。

但**不能因此把 `castTimeSec` 訂成 1.2 秒**。施法會硬定身、CD 又被 ×0.25 放大，
一個 1.2 秒定身的 Q 等於「按下去先自我暈眩 36 個 tick」——那不是預告，是懲罰施法者。

> ### 本文件的核心主張：**把「警告時間」和「施法者鎖定時間」拆開。**
>
> ```
> 總警告時間 T_warn  =  castTimeSec（施法者被定身、播蓄力動畫）
>                    +  impactDelaySec（地面蓋章已經畫好、施法者已經自由）
> ```
>
> 施法者只被鎖 **0.45–0.60 秒**（跟 LoL 同級、手感正常），
> 受害者卻拿到 **1.2–1.6 秒**的地面警告。兩者同時成立的唯一方法就是這個拆分。
>
> **這個機制 sim 端已經寫好了，只是被關在守護者裡**：`GuardianSystem` 的
> `sc.marks` + `impactTick` + `applyMark()` 就是一個完整的「蓋章 → N tick 後結算 → 結算當下重查命中名單」
> 泛用危害系統。它從來沒有暴露給技能用（`zAbilityDef` 沒有任何延遲欄位）。
> **第一優先的工程工作是把它泛化，不是把 `castTimeSec` 調大。**

引擎端其餘部分幾乎全部就緒（見第 7 節）：`castTimeSec → castBegin → CastResolveSystem` 會延後結算、會硬定身、
會在被暈眩／擊倒／死亡時中斷、而且**地面 AoE 在結算當下重新查詢命中名單**——走出圈子是真的有效。
缺的是：**（一）泛用的落地延遲機制、（二）內容數值、（三）受害者看得到「打哪裡」的線路、
（四）守護者整條演出被丟在伺服器內**。

---

## 0.5 架構前提：幀資料模型（FRAME DATA）——**已由 owner 拍板，不再討論**

> 「三種都有，**要把渲染跟傷害判斷時間兩個邏輯分開**，也就是視覺跟實際判斷傷害點是分開的」
> 「這跟**快打旋風**之類的格鬥遊戲是類似做法，**動作幀跟碰撞幀是分開的**」

本系統採用格鬥遊戲的幀資料模型。**動畫時間軸與命中結算時間軸是兩套獨立系統**，
每個技能都有一份以 **sim tick（30 Hz，33.3 ms/tick）** 表示的權威幀資料：

| 相位 | 日文／格鬥術語 | 定義 | 在本系統的角色 |
|---|---|---|---|
| **STARTUP** | 発生／起手 | **還沒有判定框**。從按下到判定生成之間的 tick 數 | **這就是 owner 要的 CT，也就是預告窗**（第 4 節整節在算它該多長） |
| **ACTIVE** | 持続 | **判定框存在**。傷害在這段內的某個 tick 於 sim 結算 | 目前全遊戲都是 **1 tick**（瞬間結算）；`activeTicks` 讓持續型判定成為可能 |
| **RECOVERY** | 硬直 | 判定框已消失，**施法者仍被鎖住（不能出招，可移動）** | 收招動畫的容身處 ＋ 預告洗版的節流閥；**今天完全不存在**。⚠ **它不是 AGENCY 那一腳**（第四輪推翻），見 0.5.3 |

### 0.5.1 權威歸屬（不可違反的一條）

> **sim 擁有 startup / active / recovery 與傷害 tick。
> 渲染器只能把動畫「對齊、拉伸、交叉淡入」到這條時間軸上——動畫永遠不能移動傷害 tick。**
>
> 用快打旋風的話講：**換一套服裝不會改變 frame data。**

這不是風格偏好，是**決定性（determinism）要求**。`packages/shared/src/sim` 必須維持
「同 seed 重播逐位元相同」——`packages/shared/src/sim/combat/hitFeel.ts:9-12` 的檔頭已經明文寫下這條契約
（*"Content is a fixed input, so the whole thing stays deterministic (no rng / no wall-clock) and same-seed replay is byte-identical."*）。
若命中時間由動畫推導，它就會繼承 **frame rate、LOD 切換（#115）、以及 glb 到底載完了沒**——
決定性當場消失，而且是**只在某些玩家機器上**消失，這是最難查的一種 bug。
**任何日後想「讓傷害對齊動畫的命中幀」的提案，一律駁回；正確方向永遠是反過來把動畫對齊 sim 的 active tick。**

推論（可直接當 code review 規則）：

1. `apps/client` 內**不得**出現任何寫入傷害時間的路徑；client 收到的 tick 是唯讀的。
2. 已知的既有反例是 `ATTACK_STRIKE_FRACTION` 固定 0.5（見 `docs/_hitfeel-audit.md` P1
   「*contact hold may not align with the clip's real impact frame*」）——那是**動畫去對齊 sim**的問題，
   處置是調整 clip 對齊參數，**不是**去改 `attackDamagePoint`。
3. 幀資料以**秒**授權（作者友善），但在註冊時一次轉成 **tick 並以 tick 為權威**
   （沿用 `abilitySystem.ts:186` 既有的 `Math.round(castTimeSec / world.dt)`）。
   **不得在每 tick 重算浮點秒數**——那會讓不同 dt 產生不同結果。

### 0.5.2 與 #133 `ImpactProfile` 的關係：**延伸，不是另起爐灶**

`packages/shared/src/sim/combat/damage.ts:103` 的 `ImpactProfile` 已經把 sim/client 的界線劃好了，
本文件**沿用同一條界線**，只是補上它缺的前半段：

```
        ── 本文件（新增）──────────  ── #133 ImpactProfile（已存在）────────
        STARTUP        ACTIVE                 hitstop / hitstun / knockback
        （預告窗）      （判定框）              （命中之後的幀優勢）
   ─────┼──────────────┼──────────────────────┼──────────────────────────►
        │              │                      │
   幀資料 FrameProfile │                 ImpactProfile
   （sim 權威）        │                 （gameplay 半：sim 權威）
        │              │                 （cosmetic 半：client 提示）
   動畫：cast clip 拉伸到 startup 窗            動畫：hitstop 凍結、閃光、噴濺
```

* **`ImpactProfile` 管「打中之後」**：`hitstopTicks`（雙方凍結）、`hitstunTicks`（受害者鎖）、
  `knockback` 是 **gameplay 半，sim 權威**；`shakeMag` / `sparkKind` / `flashColor` / `camKick` / `exFreeze`
  是 **cosmetic 半，client 提示**。
* **`FrameProfile` 管「打中之前」**：`startupTicks` / `activeTicks` / `recoveryTicks`，**全部是 sim 權威**，
  沒有 cosmetic 半——因為預告窗的長度就是公平性本身，不能讓 client 有任何話語權。
* 兩者的 override 機制也一致：**damage-derived 預設值 + 內容可選覆寫**
  （`hitFeel.ts` 的模式），所以未授權的技能一樣有合理行為。第 4.4 節的公式就是 `FrameProfile` 的預設曲線。
* client 端的消費點也已經存在：`apps/client/src/render/combatFeedback.ts` 的 `planImpactFeedback`
  把一份 `ImpactProfile` 轉成一組協調的視聽通道。**`FrameProfile` 應該走同一個形狀**
  （一份 sim 資料 → 一個 plan 函式 → N 個通道），不要每個通道各自去讀事件。

### 0.5.3 RECOVERY：**今天完全不存在——但它不是 AGENCY 的第三隻腳（第四輪修正）**

實測：`CastResolveSystem` 在結算的那一 tick 就把 `ab.cast` 清掉，施法者**當場恢復自由**，
所以「施法後搖」這個相位在本 sim 裡確實完全不存在，`recoverySec` 該補。

> ### ❌ 但第三輪寫的「閃過大招的收益是 0 / 對手沒有付出任何代價」是**錯的**，已撤回。
>
> 實測登錄表：**會造成傷害的技能，冷卻中位數 45 秒**（p25 25 / p75 60），
> 乘上 `combatEnv.cooldown = 0.25` 之後是 **11.25 秒**。
> 閃掉一發技能 = 對手白付 11 秒的冷卻與整份魔力。**那是很大的代價，而且它今天就已經生效。**
> **真正的「閃躲值多少」旋鈕不是 `recoverySec`，是 `combatEnv.cooldown` 這個 ×0.25。**
>
> ### ❌ 而且照本文件原本的規格（鎖輸出、不鎖移動），**後搖產生的追擊窗是 0**。
>
> 算給你看（全部用實測值）：`ground` 技能的有效投放距離中位 **2.75u**；
> 受害者從圓心逃出去之後，與施法者的距離是 **4.96u**（垂直逃）到 **6.88u**（背向逃）。
> **113 個英雄裡 80 個是近戰，攻擊距離一律 1.6u**（`baseStats.range`，另 33 個是 6–12u 的遠程）。
> 近戰要打到人得先貼到約 2.8u（含雙方體半徑），也就是還要跑 2.16u。
> **但施法者在後搖期間可以走**——他的移速中位 5.9，追擊者 5.6，**距離永遠不會縮短**。
> 就算把後搖期間的移速砍到 0.3 倍，淨接近速度 3.83 u/s，跑完 2.16u 要 0.56 s，
> 再加上 `attackDamagePoint` 0.25–0.5 s，總共 0.81–1.06 s，**大於任何一格 recovery 值**。
> 更別說普攻的**整個循環**是 `baseAttackTime / as = 1.0 / 0.5 = **2.0 秒**（實測中位）——
> 追上去的時候普攻很可能還在轉。

**結論：`recoverySec` 要做，但理由要換掉。** 它的真正價值有兩個，都與「懲罰」無關：

1. **給收招動畫一個家。** 沒有 recovery，cast clip 只能被塞進 startup，於是
   「蓄力」和「收招」被壓在同一段裡播——這正是 3.1 節那個「動畫看起來提早出手」的病根（見 11.4）。
   有了 recovery，STARTUP 可以是純預備幀、RECOVERY 放收招，**這才是 owner 要的格鬥遊戲切法**。
2. **擋住預告洗版。** ×0.25 的 CD 讓一個施法者可以在 2 秒內連蓋 4 個危害章，
   直接撞上 3.6 節「同時最多 6 個地面預告」的可讀性上限。後搖是最便宜的節流閥。

**不要**再把它寫成「AGENCY 的第三隻腳」。第三隻腳是**冷卻**，旋鈕是 `combatEnv.cooldown`。

> **規格**：`recoveryTicks` 期間，施法者**不能施放任何技能、不能普攻**（移動不受限）。
>
> 這裡**刻意偏離**快打旋風（SF 的 recovery 連移動都鎖）。理由：GGD 是俯視 MOBA，
> 鎖移動 = 站著被打，在 ×0.25 CD 乘數下會變成「放一次技能等於送一次死」。
> 鎖**輸出**而不鎖**位移**，等同 LoL 的施法後搖，已足夠構成懲罰窗：
> 對手拿到的是「這段時間他打不出傷害」，而不是「這段時間他是靶子」。

**數值怎麼訂**（既然目的不是懲罰，就不要假裝是）：recovery 的長度應該由**收招動畫的長度**與
**節流需求**決定，而不是由「夠不夠挨一下反擊」決定（上面已經證明不可能夠）。
取 clip 剩餘段的典型長度 0.3–0.6 s，同時讓 D 級的 recovery 足以避免同一施法者連開兩個大章：

| 級 | `recoveryTicks` | 秒 | 理由 |
|---|---|---|---|
| **A** 即發 | 0 | 0 | 不造成傷害或貼身反應技，沒有可懲罰的承諾 |
| **P** 拋射 | 6 | 0.20 | 拋射物出手即脫手，承諾程度低 |
| **W** 普攻 | （沿用既有攻速間隔） | — | 已由 `as` 決定，不另加 |
| **B** 輕擊 | **9** | **0.30** | 收招段夠播完，節流影響小 |
| **C** 重擊 | **14** | **0.47** | 收招段 + 不與下一個章重疊 |
| **D** 大招 | **18** | **0.60** | 收招段最長；同一人不得在 1 秒內蓋兩個大章 |
| **L** 鎖定 | **14** | **0.47** | 與 C 同級 |
| **E** 區域 | — | — | 守護者無所謂收招，節流由 `volleyPeriodSec` 擔任 |

> 🔴 **規格漏洞（第四輪補）：recovery 從哪一刻起算，原文沒有定義。**
> 有了 `impactDelaySec` 之後，施法者在**蓋章當下**（＝ `castTimeSec` 結束）就被解除定身，
> 而「結算」是最多 1.0 秒之後的事。若照 2.5-E 寫的「結算後掛 `ab.recoverTicks`」，
> 施法者會**先自由 1 秒、再莫名其妙被鎖住**——手感荒謬且無法解釋。
> **明確規定：`recoveryTicks` 從 `castTimeSec` 結束的那一 tick 起算，與危害引信並行倒數。**
> 也就是 `STARTUP(施法者段) → RECOVERY` 是連續的，`impactDelaySec` 是**危害物件**的獨立時間軸。

**平衡與手感從此可獨立調整**——這正是拆開兩條時間軸的實際收益，必須寫進文件避免日後被合回去：

* 為了**可讀性**把 `startupTicks` 拉長 → **完全不動傷害數字**。
* 為了**平衡**移動傷害 tick 或改傷害 → **完全不用重做動畫**（clip 會自動重新拉伸）。
* 為了**手感**換一個 cast clip → **不影響任何一個 tick**。

---

## 1. 契約與分級

### 1.1 契約（設計師只要記住這一句）

> **任何會扣你血的東西，都必須在扣血之前，在你的螢幕上、在你來得及反應並走得出去的時間內，
> 明確畫出它會打在哪一塊地面。**

拆成三個必要條件，缺一即不成立（本文件後續每一段都要對這三條交代）：

| 代號 | 條件 | 判準 |
|---|---|---|
| **TIME** | 起手時間 ≥ 延遲預算 + 逃離距離 ÷ 移速 | 第 4 節公式 |
| **SIGNAL** | 受害者（不是施法者）看得見，且看得出 **打哪裡** | 第 2、3 節 |
| **AGENCY** | 在那段時間內，受害者有可執行的動作 | 走位／CC 打斷／位移；第 4.5 節 |

**推論（可以直接當 lint 規則）**：
「有 `castTimeSec` 但沒有地面幾何上線」＝ 只有延遲，沒有預告；
「有預告但畫錯大小」＝ 比沒有預告更糟，因為玩家會照著錯的圈做決策。
今天 `VfxSystem.ts:612` 用未經 `abilityRange` 縮放的 `def.radius` 畫圈，實際命中半徑是 ×0.6，
**畫出來的圈比真正打到的圈大 1.667 倍**——這正是「比沒有預告更糟」的那一類。

### 1.2 分級（Telegraph Class）

不是每個技能都值得同等待遇。**分級由 `castType` + 有效半徑 + 是否造成傷害推得，不由作者心情決定**。
`T_warn` 欄是第 4 節公式算出來的**總警告時間**，`castTimeSec` 是其中施法者被定身的那一段。

> **與 0.5 節幀資料的對應**（每一級都是一份完整的 `FrameProfile`，不是只有起手）：
> `STARTUP = castTimeSec + impactDelaySec`（＝下表的 `T_warn`，但**分屬兩條時間軸**：
> `castTimeSec` 是**施法者的**起手幀，`impactDelaySec` 是**危害物件的**引信，蓋章後施法者已自由）；
> `ACTIVE` 全級預設 **1 tick**；`RECOVERY` 見 **0.5.3 的每級表**（B 0.30 s／C 0.47 s／D 0.60 s／L 0.47 s）。
> **下表沒有 recovery 欄，是因為它屬於施法者的承諾成本，與受害者看到的預告無關——但它一樣是必填的。**

| 級 | 名稱 | `T_warn` | `castTimeSec` | `impactDelaySec` | 適用 | 地面預告 | 施法者身上 | 音效 |
|---|---|---|---|---|---|---|---|---|
| **A** | 即發 | — | `0` | `0` | 自我增益、位移、不造成傷害、貼身（≤1.5u）反應技 | 無 | 身體閃光（`StatusAuraFx`） | 單擊 |
| **P** | 拋射 | 0.35–0.45 | `0.40` | `0`（飛行時間本身就是窗口） | **51 個 skillshot** | 無（飛行體本身就是預告） | `cast` clip 壓到 0.35s | `castBegin` 短促 |
| **W** | 揮擊 | 0.25–0.50 | （沿用 `attackDamagePoint`） | — | **普通攻擊** | 無 | 已有的 `attackWindup` 條 + 攻擊 clip | 已有 |
| **B** | 輕擊 | 0.72–0.95 | `0.45` | `T_warn − 0.45` | 小範圍 ground（`r_eff` ≤ 2.2u） | 細環，**不填色** | `cast` clip 拉伸 + 元素微光 | `castBegin` 1 聲 |
| **C** | 重擊 | 0.95–1.30 | `0.50` | `T_warn − 0.50` | 大部分造成傷害的 ground（`r_eff` ≤ 3.9u） | 完整 `Telegraph`（外環＋魔法陣填充＋色階升溫） | `cast` clip 拉伸 + 元素蓄力環 | `castBegin` + 70% 處 `castImminent` |
| **D** | 大招 | 1.30–1.60 | `0.60` | `T_warn − 0.60` | R 與 EX，決勝級，`r_eff` ≤ 5.9u | C 級 ＋ **畫面外方向箭頭** ＋ 更高亮度 | C 級 ＋ `layeredPop("ex")` 前置蓄力 | 上升音（riser）+ 落點重音 |
| **L** | 鎖定 | 0.95–1.30 | **全部**（無法蓋章） | `0` | 造成傷害的 `targeted` | 受害者腳下旋轉弧線 + 連線（見 3.4） | 同 C | 同 C |
| **E** | 持續／區域 | 持續存在 | — | — | 守護者齊射、鎮守之力、地面持續區 | **整段生命週期都在地上**，邊緣脈動 | 依來源 | 進入／離開區域的 loop 音 |

**為什麼 P 級（skillshot）只要 0.35 秒**——這是本表最反直覺、也最省成本的一格。
實測 51 個 skillshot 的有效射程中位 **6.60u**，42 個用 `imported.wave`（速度 18 u/s），
所以飛行時間中位 **0.367 秒**、最遠 0.467 秒。而躲一顆拋射物只需要**橫移一個身體寬度（~1.2u）**，
不是走出整個 AoE：`1.2 / 5.6 = 0.21 秒`。
**注意 L 要用附身式的 0.55，不是蓋章式的 0.45**（第四輪修正）：拋射物是 snapshot 實體，
走 `InterpolationBuffer`，**受害者看到的飛彈永遠落後真實位置 100 ms**，這 100 ms 拿不回來。
於是 `T_warn = 0.55 + 0.21 − 0.367 ≈ 0.39 秒` → 取 **0.40 秒**。
**skillshot 仍然是全遊戲最便宜的公平性修補：一個 0.40 秒的起手就讓它合格。**
（順帶：`ProjectileSystem.ts:26` 的 `hitRadius` **有**吃 `resolveAbilityRadius` ×0.6，
所以實際橫移需求比 1.2u 更小；這裡保留 1.2u 當餘裕，因為好的施法者會預判。）
但要誠實：拋射物是靠**預判**躲的，不是靠反應躲的（0.367 秒的飛行時間本身低於反應時間）；
起手動畫的作用是給你「開始預判」的那個信號，沒有它連預判都無從開始。

**為什麼 W 級（普通攻擊）0.25 秒就夠**——因為它的逃離距離不是 AoE 半徑。
`BasicAttackSystem` 的規則是**結算當下目標離開施法距離就整個取消**，
而你本來就站在攻擊距離的邊緣（近戰 `range` 中位 1.6u），所以 `d` 是零點幾個單位而不是 4.13u。
**普通攻擊今天就已經合格，不要為了「一致性」把它拉長**——那只會讓近戰對砍變慢而不會變公平。

**A 級的紀律**：A 級**不是預設值**，是白名單。一個技能要留在 A 級，必須滿足
「不造成傷害」或「命中判定發生在貼身距離（≤1.5u）」。
今天 319 個造成傷害的瞬發技能中，絕大多數不符合這個條件。

---

## 2. 線路（THE WIRE）

### 2.1 為什麼要走 snapshot，而不是只靠事件

現在 `castBegin` / `castEnd` / `castInterrupt` **確實已經廣播給所有 client**
（`apps/game-server/src/rooms/MatchRoom.ts:304-306`），`CastTracker` 也確實對**每一個** entity 記錄進度，
`GameApp.ts:1638-1640` 也確實替**每一個**英雄 anchor 寫 `anchor.cast`。這條線是活的、是對的。

但它有兩個缺陷——**注意其中一個常見的說法是錯的，先排除掉**：

> ❌ **「事件會掉」是錯的，不要拿它當理由。** 傳輸層是
> `new WebSocketTransport({...})`（`apps/game-server/src/index.ts:152`）＝ TCP，**可靠且保序，事件不會掉**。
> 而且 `MatchRoom.ts:348` 廣播的 payload **已經帶 `ev.tick`（絕對 tick）**，
> `MatchState.tick` 也已經在 wire 上（`schema.ts:297,347`，`uint32`）。
> **算「還剩多久」所需要的一切，今天全部到齊了。**

真正的兩個缺陷是：

1. **沒有任何一個 client 消費者用它拿到的 tick——而且不只 `CastTracker` 一個（第四輪修正）。**
   `GameApp.frame`（`GameApp.ts:788-802`）在 drain 之後把**同一個 `performance.now()`**
   同時餵給三個消費者：
   ```
   this.vfx.handleEvent(ev, nowMs);    // 地面預告 / 粒子
   this.views.handleEvent(ev, nowMs);  // 施法動畫脈衝  ← 第三輪漏了這個
   this.casts.handleEvent(ev, nowMs);  // 頭上施法條
   ```
   所以短掉一個單程延遲的**不只是預告條，還有起手動畫本身**——
   `EntityViewRegistry.ts:221-232` 的 `pulse("cast", nowMs, …)` 起點同樣是到達時間。
   0.35s 的技能實際只剩 ~0.27s 可見，而且動畫會比 sim 的 active tick 早結束。
   **三個都要改成「用 `ev.tick` 對 `TimeSync` 換算起點」，不是只改 `CastTracker`。**
2. **`castBegin` 的 payload 裡沒有幾何。** 實測 payload 就是
   `{caster, slot, abilityId, ticks, castTimeSec}`——沒有 `point`、沒有 `radius`、沒有 `direction`。
   受害者知道「有人在放招」，永遠不知道「打哪裡」。

因此職責分工是：

* **事件＝驅動（drive）**：`castBegin` / `guardianMark` 帶著 `ev.tick`（或 `impactTick`）＋ 幾何，
  client 在**收到的當下鎖存一次**（`startTick`, `durationTicks`, `x`, `z`, `r`, `shape`），
  之後整段動畫跑**本機 60–144 Hz 的時鐘**。
* **snapshot＝校正與自癒（heal）**：`cast*` 欄位讓斷線重連、切回分頁、中途加入的 client 能把已經在跑的施法補畫出來，
  並且每 patch 校正一次漂移。

> 🔴 **可渲染性陷阱（必須寫進實作規格）**：`MatchRoom` **沒有呼叫 `setPatchRate`**，
> 所以 Colyseus 用預設的 **50 ms（20 Hz）**，而 sim 是 30 Hz。
> **如果直接把 `castLeft` 當作填充進度來畫，你會得到一個 20 Hz、帶 ±1 tick 抖動的階梯狀圓環**——
> 在 60–144 Hz 螢幕上比今天那個「錯但平滑」的 300 ms 填充還醜。
> 規則：**snapshot 欄位只用來校正，永遠不直接驅動動畫**。
> 校正方式是把鎖存的 `startTick` 往新值收斂，不是直接跳。
>
> 🔴 **收斂速率要以時間計，不能以幀計（第四輪補）。** 原文寫「每幀最多 ±1 tick」——
> 在 144 Hz 螢幕上那是 144 tick/s ＝ **4.8 倍速快轉**，肉眼看得出來。
> 正確規格：**收斂速率 ≤ 1 sim tick / 33 ms**，或直接用時間常數 ≥150 ms 的指數逼近
> （與 `LocalPrediction` 既有的 ~100 ms 半衰期誤差吸收同一套作法，不要另發明一種）。

### 2.2 `EntityState` 新增欄位

檔案：`packages/shared/src/protocol/schema.ts`（`defineTypes(EntityState, …)`）。
**Colyseus 只序列化「有變動」的欄位**，所以非施法中的 entity 這些欄位成本為 0。

```ts
// --- 起手預告（telegraph）。castTicks === 0 表示「沒有在施法」，其餘欄位無意義 ---
castKey:   "string",   // 正在施放的 abilityId（""=無）。整段施法只送一次
castTicks: "uint8",    // 起手總 tick 數（30Hz；0 = 未施法）。上限 255 tick = 8.5s，足夠
castLeft:  "uint8",    // 剩餘 tick 數 → elapsed = castTicks - castLeft（權威進度，僅供校正）
castX:     "float32",  // 落點世界座標 X（自我中心技能 = 施法者座標）
castZ:     "float32",  // 落點世界座標 Z
castR:     "float32",  // 【已乘上 combatEnv.abilityRange 的有效半徑】0 = 無區域
castArc:   "float32",  // cone 半角(rad) 或 line 半寬(u)；circle 時為 0
```

**落地延遲（impactDelay）不放在 `EntityState` 上。** 蓋章之後施法者就自由了，
危害區域已經**不再屬於任何 entity**——它是一個獨立的世界物件。
兩個選擇，建議前者：

> 🔴 **第四輪抓到的結構錯誤：同一個圈有兩份表示法，而且沒有交接規則。**
> 照原文，client 會在 `castTimeSec` 期間用 `EntityState.castX/castZ/castR` 畫一個圈，
> 然後在蓋章那一刻收到 `hazardMark` **再畫第二個圈**——交接處會出現重畫、
> 填充進度歸零、或兩個環疊在一起。**這是「畫出來的＝打到的」規則的自傷版本。**
>
> **修法：`hazardMark` 在 `castBegin` 的同一 tick 就發，`impactTick = tick + startupTicks`（含引信）。**
> 落點在那一刻**已經確定**——`abilitySystem.ts:153-163` 在延後之前就把 `cast.point` 填好了，
> 所以沒有任何理由等到蓋章才發。這樣就是**一個事件、一份幾何、一個絕對 tick、零交接**。
> `EntityState` 的 `cast*` 欄位退回它真正該做的兩件事：
> **(a)** 施法者身上那條頭上進度條、**(b)** 斷線重連 / 中途加入的自癒補畫。
>
> **代價（必須一起處理）：** 施法被打斷時，那個章必須**消失**。
> 新增 `hazardCancel { id }` 進白名單。這其實是好事——
> **打斷變成看得見的事件**（圈子直接熄掉），這正是「打出一發暈眩」該有的視覺回報。

* **(建議) 走事件**：`hazardMark { id, x, z, r, shape, arc, impactTick, abilityId, teamId }`
  ＋ `hazardImpact { id }`。與 `guardianMark` **完全同一個形狀**，所以 client 只需要一個 handler
  就同時服務技能危害與守護者齊射。可靠傳輸 + 絕對 tick ⇒ 不需要每 tick 重送。
  代價：中途加入／重連的 client 看不到已經在倒數的那一個章（生命期 ≤1.0 s，可接受）。
* (備案) 開一個 `ENTITY_KIND.HAZARD`，沿用復活圈的浮點槽位再利用慣例。
  自癒性較好，但 20 Hz patch 對一個 0.7 秒的物件成本比事件高，且要多一個 entity 生命週期。

**形狀（shape）不另開欄位**，塞進既有的 `flags: "uint16"`（目前只用到 1..128，256 以上全空）：

```ts
export const ENTITY_FLAG = {
  …
  /** 起手預告幾何：圓（castX/Z/R） */
  CAST_CIRCLE: 256,
  /** 起手預告幾何：扇形（castX/Z 為圓心、fx/fz 為朝向、castR 為長度、castArc 為半角） */
  CAST_CONE:   512,
  /** 起手預告幾何：直線（castX/Z 為終點、castArc 為半寬） */
  CAST_LINE:  1024,
  /** 起手預告：鎖定單體（castX/Z 為目標當下座標，會跟著目標動） */
  CAST_LOCK:  2048,
} as const;
```

`CAST_LOCK` 很重要：它讓 client 知道「這個圈**會跟著目標走**」，因此**走位無效、要靠打斷**。
把「可走位」與「不可走位」在視覺上分成兩種語彙（第 3.4 節），是誠實的關鍵。

**這些欄位由誰寫**：`apps/game-server/src/net/snapshot.ts` 的英雄分支，
在既有的 `if (ab?.cast) flags |= ENTITY_FLAG.CASTING;`（snapshot.ts:223）旁邊展開即可——
`ab.cast` 已經帶著 `ticksLeft`、`point`、`targets`，`AbilityDef` 已經帶著 `radius`、`castType`。
`resolveAbilityRadius`（`abilitySystem.ts:40-42`）**必須在伺服器端就套用**，
讓 wire 上的 `castR` 已經是真值——client 永遠不該自己乘 0.6，那正是今天畫錯的原因。

### 2.3 線路成本（誠實估算）

現況每個移動中的英雄每個 patch 送 `x,z,fx,fz` ≈ 4×(1 索引 byte + 4 資料 byte) = **20 B**；
12 個英雄 × 20 Hz ≈ **4.8 KB/s**。

新增欄位的穩態成本：施法期間**只有 `castLeft` 每個 patch 變動** = 2 B/patch/施法者；
`castX/castZ/castR/castArc/castTicks` 各在起手當下送一次（≈ 22 B），`castKey` 一次（≈ 16 B）。
以同時 4 人施法計：**穩態 160 B/s + 每次施法 38 B 的一次性成本**。
相對既有實體流量 **< 4%**。這個代價換掉「受害者不知道打哪裡」，無疑值得。

（可選最佳化：`castKey` 改成 `uint16` 索引到每場一次下發的技能表。目前不建議——
`contentVersion` 已同步、client 手上就有以字串為 key 的登錄表，字串一次 16 B 不值得增加一層對照表。）

### 2.4 新的實體種類：守護者

```ts
export const ENTITY_KIND = {
  CHAMPION: 0, PROJECTILE: 1, FLOWER: 2, REVIVE_CIRCLE: 3,
  /** 中立守護者（#89 / #105）。world.structure 的投影 */
  GUARDIAN: 4,
} as const;
```

`snapshot.ts` 目前**沒有 `world.structure` 分支**，守護者掉進最後的 `else`，
被編碼成 `kind = 0`（英雄）、`seatId = -1`、`key = ""`。
client 端 `teamBySeat.get(-1) ?? 0` → **藍隊**、`nameBySeat` miss → 名字變 `#<entityId>`、
`EntityViewRegistry` 找不到 model → 退回**程序化體素人形**。
所以今天的守護者不只是「看不見」，而是**偽裝成一個沒有名字的藍隊玩家站在區域中央**——比看不見更糟。

新增分支（沿用復活圈「浮點槽位再利用」的既有慣例，見 `schema.ts:365-380` 的註解）：

| 欄位 | 意義 |
|---|---|
| `kind` | `ENTITY_KIND.GUARDIAN` |
| `seatId` | `-1`（中立；client 必須有 `kind===4 → 中立色`，不可再 `?? 0` 落到藍隊） |
| `key` | 守護者模型 key（#105 的 樹人／石頭人／巨獸人 身分） |
| `hp` / `maxHp` | `HealthComp`（頭上血條照舊，`hasOverheadBar` 需納入 kind 4） |
| `shield` | `t.radius`（本體碰撞半徑，讓 client 用權威值畫底座，不要用魔術數字） |
| `mana` | **齊射起手剩餘 tick 數；不在起手窗內時為 0** |
| `maxMana` | `volleyWindupTicks` |
| `flags` | 起手中時帶 `ENTITY_FLAG.WINDUP` |

`mana` 刻意只在起手窗內非零，讓它每 patch 變動的時間佔比壓在 ~25%（0.8-1.2s / 4.0s 週期），
4 個守護者的穩態額外流量 < 100 B/s。

### 2.5 事件白名單（`MatchRoom.ts:294-347`）必須新增

實測：`grep -rn "guardian" apps/game-server/src/rooms/MatchRoom.ts apps/game-server/src/net/snapshot.ts apps/client/src` → **零命中**。
以下事件由 sim 產生、從未離開伺服器行程：

```
guardianSpawn      guardianWake       guardianMark       guardianImpact
guardianSleep      guardianSlain      guardianHeirPulse  guardianBuffExpire
fireRingStart      fireRingTick       fireRingDamage
```

第 2.5 階段另外新增三個（見 2.2 的單一表示法規則）：

```
hazardMark         hazardImpact       hazardCancel
```

其中 **`guardianMark` 的 payload 已經是一份教科書級的預告封包**
（`GuardianSystem.ts:446`）：`{ id, targets:[{entityId,x,z}], impactTick, amount }`。
`impactTick` 是**絕對 tick**——client 拿它跟 `MatchState.tick` 相減，
就能得到**與延遲無關的**準確倒數，這比任何以到達時間為起點的計時都準。

`castBegin` 的 payload 也應補上 `point` / `radius`（已乘 `abilityRange`）/ `shape`，
給不吃 snapshot 的路徑（音效、動畫脈衝）一個一次到位的來源。

> **`fireRingDamage` 已經是一個完整的傷害封包**（`FireRingSystem.ts:55-62`）：
> `{ id, amount, dmgType:"true", origin:"fireRing", x, z }`。
> 它有跳字需要的一切——只差沒有進白名單。見 5.5，**不要**為了跳字把它改走 `damageQueue`。

### 2.6 內容 schema：`FrameProfile`（0.5 節的資料落點）

檔案：`packages/shared/src/content/schema/ability.ts`。
今天那裡只有 `castTimeSec` 與 `rootWhileCasting`（實測 **554 個技能沒有任何一個**設定後者），
**沒有任何欄位可以表達落地延遲、持續判定或後搖**。新增：

```ts
// --- 幀資料（0.5 節）。以秒授權、註冊時一次轉 tick，tick 才是權威 ---
castTimeSec:     number,   // 既有。STARTUP 的「施法者被鎖」段
impactDelaySec?: number,   // 新增。STARTUP 的「危害引信」段（蓋章後施法者已自由）
activeSec?:      number,   // 新增。ACTIVE 判定框存續；省略 = 1 tick（今天全部的行為）
recoverySec?:    number,   // 新增。RECOVERY 後搖：不可施法、不可普攻，移動不受限
```

**授權規則**：作者只填 `radius` 與傷害，四個時間欄由 4.4 的公式產生預設值，
只有需要偏離時才手動覆寫——與 `hitFeel`（#133）「damage-derived 預設 + 可選覆寫」完全同一個模式。

> 🔴 **`#79` 的覆寫陷阱（⭐ 2026-08-26 複查：引擎側已修掉，⛔ 本段的舊教條不要再照做）。**
> 當年 `registerChampion` 會把英雄 doc **內嵌的 Q/W/E/R 副本蓋掉** standalone 技能 doc ——
> 只改 `content/abilities/*.json` 在載入當下被靜默丟棄，這正是 #79 死掉的方式。
> ⭐ **現況**：`sim/content/registry.ts` 的 `registerChampion` 已改為 **standalone doc 為權威**
> （內嵌副本只 `fillGaps` 補 standalone 沒定義的欄位，⛔ 不再覆蓋），
> 而兩份副本的**鏡射由產生器自動維護（abilityMirror）**——standalone → embedded 單向，
> `tools/skill-remake/apply_tiers.py::_mirror`，守衛 `abilityMirror.test.ts`。
> ⛔ **不要手動同步兩份**：`content/champions/*.json` 72/72 全是產物
> （`tiers:apply`／`skillremake:json` 擁有，隔離區鎖 444），要動就改產生器來源再重生成。
> **驗收條件不得是「JSON 裡有這個欄位」，必須是「`Abilities.all()` 讀出來有這個值」。**

---

## 3. 視覺（THE VISUALS）

> ### ⚠ 本節全部服從 0.5.1：**動畫對齊 sim，永遠不是反過來**
>
> 這一節描述的每一個視覺都是**把畫面貼到 sim 已經決定好的 tick 上**。
> 具體到實作：`clipWindowMs` 由 `startupTicks × TICK_MS` 推得，clip 被拉伸去**覆蓋**起手窗；
> 若 clip 太短就補速度比例，太長就壓縮，**glb 沒載完就退回程序化體素人形照樣打**——
> **傷害 tick 在這三種情況下完全相同**。任何「等動畫播到某一幀才結算」的寫法都違反 0.5.1。

### 3.1 起手動畫：用模型真的有的 clip，不要發明新的

實測：**117 個 model doc 的 `clipMap` 全部、且只有** `idle / run / attack / cast / hurt / death` 六個 key。
`cast` 是唯一的施法 clip；113 個英雄實例中 92 個解析到真正的 Spell/Spellcast 動作。

所以：

* **一律用既有呼叫** `EntityViewRegistry.ts:221-232` 的 `pulse("cast", …)`，
  `ClipAnimator.pulseSpeedRatio`（`ClipAnimator.ts:86-99`）會把 clip 拉伸／壓縮到窗口大小。
  **不要新增 clip 名稱，不要新增動畫檔。**

> ### 🔴 3.1a **反向失真：動畫誠實地演了一個錯的時間點**（第四輪新增，前三輪完全沒處理）
>
> 0.5.1 只防了一個方向（動畫不准移動傷害 tick）。**反方向一樣會毀掉公平性**：
> 一個技術上正確、但**看起來早出手 0.2 秒**的動畫，會讓玩家照著身體動作做決策而做錯。
>
> **這個 bug 今天就在檔案裡，而且旁邊三十行就是它的正解。**
>
> ```ts
> // EntityViewRegistry.ts:253-254 —— 普攻，做對了
> windowMs: windupMs / ATTACK_STRIKE_FRACTION,   // ATTACK_STRIKE_FRACTION = 0.5
> clipWindowMs: windupMs / ATTACK_STRIKE_FRACTION,
> ```
> 普攻把 clip 拉伸到「**clip 的第 50% 幀落在傷害 tick 上**」，剩下的 50% 是收招。**正確。**
> ```ts
> // EntityViewRegistry.ts:229-232 —— 施法，做錯了
> this.champions.get(caster)?.pulse("cast", nowMs, { windowMs: durMs, clipWindowMs: durMs });
> ```
> 施法把 clip 拉伸到**覆蓋整個起手窗**，於是 clip 自己的「放出去」那一幀
> （美術通常擺在 60–80%）落在起手窗的 60–80% 處。
> **在一個 0.6 s 的起手上，角色會在 0.36–0.48 s 就把招式甩出去，然後傷害在 0.60 s 才落地。**
> 地面預告是誠實的、身體是說謊的——而人眼先信身體。
>
> **修法（同時是 RECOVERY 的正當理由，見 0.5.3）**：
> 在 model doc 的 `clipMap` 旁加一個 `castStrikeFraction`（預設 **0.6**），然後
> ```ts
> const f = modelDoc.castStrikeFraction ?? 0.6;
> pulse("cast", startTickMs, { windowMs: startupMs / f, clipWindowMs: startupMs / f });
> ```
> **STARTUP 播 clip 的前 f 段（純預備幀），RECOVERY 播剩下的 (1−f)（收招）。**
> 這正是 owner 要的格鬥遊戲切法，而且**動畫完全沒有碰到傷害 tick**——
> `castStrikeFraction` 只改播放速率，sim 端一個 bit 都不知道它存在。
>
> **兩個實作陷阱：**
> 1. `pulseSpeedRatio` 有 `PULSE_RATE_MIN/MAX` 夾擠（`ClipAnimator.ts:97`）。
>    clip 長度與窗口差太多時**會被夾住、對齊靜默失敗**。必須把被夾住的組合列出來，不能當它不存在。
> 2. `startTickMs` 必須由 `ev.tick` 換算（2.1 節第 1 點），不是 `nowMs`。
>    用到達時間的話，整條對齊在有延遲時就整體前移。
* **問題**：這些 clip 幾乎沒有「預備幀（anticipation）」，拉長只是變慢動作。
  補救不靠美術，靠程序化前置姿態：起手前 25% 內對根節點做
  **下沉 −0.06u ＋ 後傾 4°**，最後 15% 做 **前衝 +0.08u**。
  這是 `ChampionView` / `ClipAnimator` 一層薄薄的 additive offset，成本近零，
  但它是「看得出他在蓄力」與「看起來只是動作變慢」的分野。
* **瞬發（A 級）維持現狀**：`abilityCast` → `pulse("cast")` 450ms 預設。
  但必須誠實標註：**那是收招（follow-through），不是起手**，它在傷害結算之後才播。

### 3.2 施法者身上的特效：重用 `fx.prim.*`，不要另起爐灶

`content/vfx/` 已有 **389 份 doc**，其中 **95 份 `fx.prim.<element>.<kind>`**
（arcane / blood / earth / fire / holy / ice / ki / lightning / nature / physical / sound / void / wind
× nova / explosion / shockwave / tornado / beam / swarm / slash / pulse，含 `-sm` / `-lg` 變體），
生成器在 `apps/client/src/render/vfx/primitives.ts`（8 個 `PrimitiveKind`），
元素配色在 `apps/client/src/render/vfx/elements.ts`。

蓄力視覺 = **元素 `pulse-sm` 在施法者手部 loop**，強度隨進度線性升到 1.0，
結算瞬間換成技能自己的 `vfxKey`。這需要在 `VfxSystem.handleEvent` 補**目前完全不存在**的兩個 case：

```
case "castBegin":  // 開始蓄力 loop + 生成地面預告（見 3.3）
case "castEnd":    // 蓄力 loop 結束（castInterrupt 則是「熄滅」變體）
```

實測 `VfxSystem.ts` 的 case 清單（第 607–881 行）確實只有 `abilityCast` 沒有 `castBegin`/`castEnd`。

> **相依性警告**：實測真實登錄表 **460 / 554 個技能的 `vfxKey` 仍是 `fx.ember-bolt-cast`**（同一顆橘色火球）。
> 起手預告會告訴受害者「**何時**」，但在 #79 完成之前永遠說不出「**是什麼**」。
> 兩者是互補的，不是替代的。

### 3.3 地面預告：重用 `Telegraph.ts`，它的建構子早就準備好了

`apps/client/src/vfx/Telegraph.ts:160-167`：

```ts
constructor(scene, x, z, radius, nowMs, private readonly fillMs = 300, private readonly holdMs = 150)
```

**`fillMs` / `holdMs` 是既有參數，只是沒人傳。** `VfxSystem.ts:612` 只給 5 個引數，
所以每一個預告都填 300ms 然後在 `age > fillMs` 放「打在這裡了」的 resolve pop。
後果：544 個瞬發技能的「填充中」動畫**整段畫在傷害之後**；
0.6s 的技能則在 300ms 就宣告落點，**早了 300ms**。

修法就是把真值傳進去（一行）：

```ts
new Telegraph(scene, point.x, point.z, castR /* 已乘 0.6 */, nowMs, castTimeSec * 1000, 150)
```

> 🔴 **但只傳長度不夠——「原點」也必須改（第四輪補）。**
> `Telegraph.ts:270-276` 是用 `age > fillMs` 判斷 resolve pop，而 `age` 來自建構當下的
> `performance.now()`。掉幀、切到背景分頁、或封包晚到，這個「打在這裡了」的重音就會落錯位置。
> **規格：`Telegraph` 改收一個 `impactAtMs`，由 `(impactTick − MatchState.tick) × TICK_MS` 一次換算而得，
> 並在每次 snapshot 校正時重新推導。**「還剩幾 tick」是權威資料，「已經播了幾毫秒」不是。

> 🔴 **實作阻擋：3.4 節的「線寬」通道在這個檔案上做不出來（第四輪補）。**
> `Telegraph.ts:180-186` 的外環是
> `MeshBuilder.CreateTorus(…, { diameter: radius*2, thickness: 0.12, tessellation: 48 })`，
> **而且 mesh pool 是用半徑當 key**（`radiusKey(radius)`）。
> `thickness` 在建構時就烘死了：想動它，要嘛每個寬度開一個新 mesh（pool 失效、每幀 churn），
> 要嘛非等比縮放 torus（連直徑一起變，圈就說謊了）。
> **兩個可行解，擇一寫進規格：**
> **(a)** 外環改成一片平面圓環 + 徑向漸層 emissive 貼圖，線寬變成 uv/shader 參數 → 零 mesh churn，建議；
> **(b)** 只給 3 段離散線寬，pool key 改成 `(radius, tier)`。
> **不要**寫「把線寬從 0.10 動畫到 0.22」然後把問題丟給實作者——那條路在現有檔案上是死的。

另外重用 `apps/client/src/render/AimIndicator.ts` 的 `dashedRing()` 幾何
（#152 已寫好、有半徑快取、穩定 hold 不重建），作為 **B 級的細虛線環**與 **E 級的區域邊界**。
注意：#152 的 `AimIndicator` **本身是瞄準輔助、不是預告**——實測它由
`getHeldAbility()`（本機按住的鍵）驅動、以 `localSelfPos()` 為圓心、放招瞬間消失，
**永遠不會替敵人畫**。我們重用的是它的 **mesh 產生程式碼**，不是它的資料流。

長駐地面痕跡重用 `apps/client/src/vfx/GroundDecalPool.ts`（`MAX_DECALS = 20`, `DECAL_Y = 0.035`），
**但 E 級的區域邊界不可用 `castScorchSpec`**——那是傷害殘留（深色、alpha 0.5），語意相反。

### 3.4 色彩與急迫度（urgency ramp）——**不可只靠色相**

> **修正一個過時前提**：#161 已經把戰鬥攝影機從 55° 拉到 **68°**
> （`CameraRig.ts:36 CAMERA_PITCH_RAD = 68°`，檔頭明文記錄 55→68 的理由）。
> 68° 下地面圓的短軸／長軸 = `sin 68° = 0.927`——**幾乎是正圓，不是被壓扁的細長橢圓**。
> 也就是說「俯角太低看不出圓」**不是**這個系統的問題，不要再拿它當設計約束。
> 真正的問題在下面 3.6：圓**太大**，不是太小。

手機螢幕、色弱玩家、加上 #85 的去飽和後製，**色相仍然是最不可靠的通道**。
急迫度必須同時走三個通道：

| 通道 | 0% → 100% |
|---|---|
| **亮度（主）** | emissive 0.55 → 1.00（去飽和後仍然是「亮環」） |
| **線寬** | 0.10u → 0.22u（世界單位；實作限制見 3.3 的紅框，torus `thickness` 不可動畫）。**下限不是常數**：`DOLLY_MAX = 40` 時 px/u ≈ 11，0.10u 只有 1.1 px，所以最小世界線寬必須**由當下 dolly 反推**成 ≥2 CSS px，而不是寫死 0.10u |
| **脈動頻率** | 0 Hz → 6 Hz，最後 20% 改為雙閃 |
| 色相（輔助） | 琥珀 `(1.00,0.62,0.23)`（沿用 `AimIndicator.AOE_COLOR`）→ 猩紅 `(1.00,0.22,0.14)` |

**兩種語彙必須明顯不同**（呼應 `CAST_LOCK`）：

* **可走位（ground / skillshot / cone / line）** → **實心外環 + 魔法陣填充**，「地上這一塊」。
* **鎖定單體（targeted）** → **繞著受害者腳下旋轉的細弧線 + 一條連向施法者的細線**，
  明確表達「跑沒有用，要打斷或被隊友救」。用不同語彙，玩家才不會學到錯的規則。

### 3.6 手機與畫面佔用——**實測後的結論跟原本的假設相反**

在 `DOLLY_MIN = 10`（#31 把預設 zoom 訂在最近端）、Babylon `TargetCamera` 預設 `fov = 0.8 rad`、
iPhone 橫向 844×390 的條件下：

* 螢幕縱向覆蓋地面 `2 × 10 × tan(0.4) / sin 68° ≈ 9.1u` → **約 43 px / 世界單位**。
* 中位傷害型 AoE（`r_eff = 3.53u`）在螢幕上的直徑 ≈ **300 px**——
  **在一支 390 px 高的手機上，一個圈就吃掉四分之三的畫面高度。**

**所以「圈太小看不清」不是問題，「圈太大蓋滿畫面」才是問題。** 原本第 5 條規則寫反了，已在第 6 節改掉。
三個敵人同時放招 + 守護者 3 個標記 = 6 個 300 px 橢圓疊在 844×390 上，那不是預告，那是霧。

規則：

1. **同時最多繪製 6 個地面預告**；超出時**優先保留離本機英雄最近的**（威脅最相關），其餘退化成
   受害者腳下的細環。
2. **重疊時只畫外環、不畫魔法陣填充**——填充是急迫度通道，兩個填充疊在一起兩個都讀不到。
3. `DOLLY_MAX = 40` 時 px/u 掉到 ~11，此時 `r_eff < 1.0u` 的圈直徑 < 24 px：
   **這才是「退化成頭上方向標記」該觸發的門檻**，而不是預設狀況。
4. **死亡觀戰的縮放是 `DOLLY_MAX_DEAD = 90`**（`CameraRig.ts:42`），px/u ≈ 4.8。
   加上 #85 的去飽和，觀戰視角的預告幾乎必然不可讀——**這是可接受的**（死者沒有 AGENCY），
   但不要假裝觀戰能學到東西。

> **這一節同時是「縮半徑」最有力的論據，而且與閃躲數學無關**：
> 實測 `ground` 技能的**投放距離**中位只有 **2.75u（已乘 0.6）**，
> 而它的**有效半徑**中位是 **3.53u**。
> **AoE 比你能丟出去的距離還大——丟到最遠處，圈子仍然蓋住施法者自己。**
> 這在幾何上就是壞的，跟公平性無關。第 4.4 節的縮半徑建議應以此為第一理由。

### 3.5 音效：既有 cue 已存在，缺的是空間化

`apps/client/src/audio/sfxManifest.ts` 已列 `castBegin` / `castEnd` / `castInterrupt` /
`abilityCast` / `attackWindup`；`combatSfx.ts:22-33` 直接把事件名當 key 透傳。
問題是 `GameApp.ts:803-804` 呼叫 `audioSystem.playSfx(sfxKey)` **完全不帶 opts**，
而 `AudioSystem.playSfx(event, opts?: SfxPlayOptions)`（`AudioSystem.ts:689`）本來就支援 `{volume, pan}`。

規格：

1. **一律帶 `{volume, pan}`**：`pan` 由施法者相對本機英雄的螢幕空間 X 決定，
   `volume` 由距離衰減（0u = 1.0，24u = 0.25，超出本區域 = 0）。
2. **區域過濾**：只播本機所在對戰區的施法音（與 #67 minimap 只顯示自己那一區一致）。
   今天四區的施法音以同樣音量疊在一起，等於白噪音。
3. **新增一個 cue `castImminent`**：C/D 級在進度 70% 時播，音高比 `castBegin` 高一個五度。
   這是唯一需要新音檔的項目（`content/assets` 由其他 agent 持有，須協調）。
4. **D 級加上升音（riser）**，長度 = 起手時間，落點對齊結算 tick。

---

## 4. 數字（THE NUMBERS）

### 4.1 逃離幾何

* 命中判定：`queryOverlap` 用 `circleVsCircle`，英雄碰撞半徑 **0.6**（`spawnChampion.ts:29`）。
* 有效半徑：`resolveAbilityRadius = radius × combatEnv.abilityRange`，
  `content/config/combat-env.json` 的 `abilityRange = **0.6**`。
* 因此**從圓心走到安全**所需距離：`d = r_eff + 0.6`。

母體定義（**已於第三輪覆算修正，原稿標錯**）：實測登錄表中**帶 `radius > 0` 的技能共 85 個，
且 85 個全部是 `castType === "ground"`**——沒有任何 `targeted` / `skillshot` / `self` / `dash` 帶半徑
（201 個造成傷害的 `targeted` 全部**沒有** `radius`，是單體）。下表就是這 85 個的分佈。

> **原稿把這張表標成「76 個會造成傷害的 ground 技能」，那是錯的標籤配上對的數字。**
> 85 個裡有 **9 個不造成傷害**（純控場／地形類）。若把母體縮到「造成傷害且帶 radius」的 **76 個**，
> 中位數會從 5.88 掉到 **5.69**（偶數樣本、5.5 與 5.88 的平均）→ `d = 4.01u` → `T_warn = 1.17 s`。
> **兩種母體的結論差 0.02 秒，頭條數字不受影響**；但既然本文件要被拿去實作，母體要標對：
> **下表 = 85 個 ground 技能；1.19 s 這個門檻用的就是它。**

**百分位法一律用「最近排名法」`idx = ceil(p/100 × n) − 1`**（第四輪明訂；前幾輪沒寫，
才會出現同一格數字兩輪不同）。

| | raw | ×0.6 有效 `r_eff` | 逃離距離 `d` |
|---|---|---|---|
| min | 1.50 | 0.90 | 1.50 |
| p10 | 3.67 | 2.20 | 2.80 |
| p25 | 3.67 | 2.20 | 2.80 |
| **中位** | **5.88** | **3.53** | **4.13** |
| p75 | 6.00 | 3.60 | 4.20 |
| **p90** | **6.42** | **3.85** | **4.45** |
| max | 9.72 | 5.83 | 6.43 |

> 🔴 **第三輪把 p90 從 6.42「更正」成 6.05，那次更正本身是錯的（第四輪推翻，恢復原值）。**
> n=85 的排序尾端是 `… 6.00 ×5, 6.05, 6.42, 6.42, 6.42, 7.33, 7.79, 8.25, 9.17, 9.41, 9.72`。
> 最近排名法 p90 = `sorted[ceil(0.9×85)−1] = sorted[76] = **6.42**`；6.05 是 `sorted[75]`（≈ p89.4）。
> 線性內插法會給 6.27。**三種法都不會給出「6.05 是最近排名法」這個說法。**
> 同理 76 個傷害子集的中位：最近排名法 **5.50**（第三輪寫的 5.69 是取第 38/39 名平均）。
> 頭條數字 1.19 s 不受影響，但 p90 那一列的 `T_warn` 從 1.21 改為 **1.25**。

移速（實測 `Champions.all()` 的 `baseStats.ms`，`growth.ms` 全部為 0，
`combatEnv.moveSpeed = 1.0` 不縮放，裝備只給 +0.23~0.83 的零頭）：

| min | **p10** | p25 | 中位 | p75 | max |
|---|---|---|---|---|---|
| 4.0（1 人） | **5.6** | 5.8 | 5.9 | 6.0 | 10.1（4 人） |

> **參考速度取 `v_ref = 5.6`（p10），不取中位 5.9。**
> 公平性地板要對**九成的英雄**成立，不是對一半的英雄成立。
> 剩下 10%（11 個 ≤5.5 u/s、其中一個 4.0）是坦克，**設計上就該吃招**——這是明示的取捨，不是漏算。

**障礙物阻擋：已驗證，可以排除，不要再重新推導。** 我對五張競技場的 zone 0 各取樣 ~3800 個位置、
每點掃 24 個方向，計算「能不能在某個方向上跑完 4.13u 而不被障礙物或邊界擋住」：

| arena | 障礙物數 | 任何方向都跑不掉的比例 | 最佳逃離距離 p10 |
|---|---|---|---|
| skeleton | 3 | 0.0% | 5.15u |
| **godie** | **28** | **0.1%** | 5.25u |
| colosseum | 20 | 0.6% | 5.00u |
| castle | 9 | 0.0% | 4.85u |
| dota | 10 | 0.0% | 5.35u |

即使在障礙物最多的 godie（28 個）也只有 0.1% 的位置無路可逃。
`steerAroundObstacles`（`MovementSystem.ts` 步驟 2）會繞柱子，邊界只在極端貼邊時限制一個半平面。
**地形不是這個問題的因素**，公式不需要為它加係數。

### 4.2 延遲預算 L——**必須分成兩個常數**

原本用單一 L 是錯的。100 ms 的插值延遲**能不能省掉，取決於幾何黏在誰身上**：

* **蓋章式（stamped）**：幾何是**世界空間的固定座標** + 一個**絕對 `impactTick`**
  （守護者標記、地面 AoE 的落點、本文件提案的 `hazardMark`）。
  它不會動，所以**沒有「圈和人分家」的問題**——收到封包的當下就畫，是正確的，不是作弊。
  而且本機英雄本來就是 **client 預測、跑在當下**（`predict/LocalPrediction.ts`，
  「blending prev→cur renders the local hero at most one tick in the past」），
  所以「危險區」和「我的身體」本來就在同一個時間軸上。**這 100 ms 是真的能拿回來的。**
* **附身式（attached）**：幾何跟著施法者的身體走（從身上長出來的錐形、鎖定線）。
  這種必須畫在 `renderTick`，否則圈和人真的會分家。**100 ms 拿不回來。**

| 項 | 蓋章式 | 附身式 | 來源 |
|---|---|---|---|
| 廣播對齊（loop = `TICK_MS/2`） | 8 ms | 8 ms | `MatchRoom.ts:254` |
| 網路單程 | 30 ms | 30 ms | **一般網路，不是 LAN** |
| client 下一幀 | 8 ms | 8 ms | 60 fps |
| 遠端渲染插值 | **0 ms** | **66 ms** | `constants.ts INTERP_DELAY_MS`（30 Hz 快照下 = 2 個快照間隔）|
| **人類反應** | **300 ms** | **300 ms** | 需求方指定的 250–300 ms **取上界** |
| 輸入合併 | 17 ms | 17 ms | `IntentSender` 30 Hz |
| 網路回程 | 30 ms | 30 ms | — |
| 伺服器 tick 對齊 | 17 ms | 17 ms | `TICK_MS` |
| **加速度爬升損失** | **33 ms** | **33 ms** | `ACCEL_TICKS = 3` → 剛好損失整整一個 tick 的位移 |
| **合計** | **≈ 0.45 s** | **≈ 0.55 s** | |

**與原稿的差異，以及為什麼原稿太樂觀**：原稿的 L = 0.40 s 用了 220 ms 反應（需求方要求 250–300）
與 20 ms 起步損失（實際是 `ACCEL_TICKS = 3` → 速度 1/3、2/3、1，比全速少跑整整一個 tick = 33 ms），
而且只算 LAN 的 2 ms 單程。修正後**每一條建議時長都要往上加 0.05–0.15 s**。

> 加速度細節（會影響誰吃虧）：`t.accel` 只有在 `!moved` 時歸零，所以**移動中轉向不付爬升成本**，
> 但**站著平 A 的近戰**（最常見的對峙狀態）每次起跑都付滿 33 ms。原稿沒有區分，這裡明示。

### 4.3 最低警告時長（本文件最重要的一張表）

`T_warn = L + d / v_ref`，`v_ref = 5.6`

| `r_eff` → `d` | **蓋章式 L=0.45** | 附身式 L=0.55 | （參考）v=4.0 最慢者、蓋章式 |
|---|---|---|---|
| 0.90 → 1.50 | **0.72** | 0.82 | 0.83 |
| 2.20 → 2.80 | **0.95** | 1.05 | 1.15 |
| **3.53 → 4.13（中位傷害 AoE）** | **1.19** | **1.29** | 1.48 |
| 3.60 → 4.20 | 1.20 | 1.30 | 1.50 |
| **3.85 → 4.45（p90）** | **1.25** | **1.35** | **1.56** |
| 5.83 → 6.43（最大） | **1.60** | **1.70** | 2.06 |

> ### 🔴 4.3a **這張表是「剛好不被打到」，不是「躲得掉」——公式必須加餘裕（第四輪新增）**
>
> `T_warn = L + d / v_ref` 是一個**等號**：一個 p10 移速的玩家，反應時間**剛好** 300 ms、
> 逃跑方向**剛好**最佳、路上**剛好**沒被隊友的 `separatePair` 推一下，
> 會**剛好**在傷害 tick 那一刻抵達邊界。任何一點誤差就是吃滿。
> **照這條公式授權出來的技能，實戰閃避率大約是擲硬幣，不是「有機會閃躲」。**
>
> 而且本文件自己在 5.3 節就承認了這一點：守護者需要 1.225 s，
> 文件卻主張給 1.25 s，理由寫得很清楚——「多給 0.05 s 就能讓 113 個英雄全數過關，沒有理由省」。
> **同一份文件對守護者留餘裕、對技能不留，這是內部矛盾。**
>
> **修正：公式加一個顯式餘裕項 `M = 0.15 s`**，並把設計目標寫成數字而不是形容詞：
> > **目標：一個注意到預告的 p10 移速玩家，在最佳方向上應該有 ≥0.15 s 的到達餘裕。**
> 0.15 s 的來源不是拍腦袋：躲一發 AoE 不是**簡單反應**（看到燈就按），是**辨別＋選擇反應**
> （這個圈包不包含我？往哪邊跑？）。文獻上選擇反應普遍比簡單反應慢 100–150 ms，
> 而需求方指定的 250–300 ms 是簡單反應的區間。**M 就是把這個差額顯式化，不要藏在「反應時間」裡假裝沒有。**
>
> 代入後的門檻（蓋章式）：中位 AoE **1.34 s**、p90 **1.40 s**、最大 **1.75 s**。
> **1.75 s 太長了，這正是 4.4 節「`d > 5.0u` 一律縮半徑、不要加時間」該當成硬規則而不是建議的原因。**

### 🔴 **單一最重要的數字：1.19 秒**

要讓 **90% 的英雄**走得出**中位傷害型 AoE**，從危險出現在螢幕上到傷害落地所需的最短時間。
（**零餘裕的物理下限**；實際授權值請用 4.3a 的 `+M`，即 **1.34 秒**。1.19 是「不可能低於」的地板，
不是「可以訂在這裡」的目標。）
**全遊戲最長的起手時間是 0.60 秒（只有 3 個技能）＝ 這個門檻的 50%；98.2% 的技能是 0.00 秒。**

推論（已用真實 sim 端到端驗證）：把三個有起手時間的 ground AoE 正對著一個**零反應時間、零延遲、
在施法那一 tick 就開始逃跑**的中位移速受害者施放——**三個全中**（223 / 260 / 223 傷害）。
**這個遊戲裡沒有任何一個技能的起手時間長到足以走出它自己的爆炸半徑。**

### 4.3b 減速鏈——**原稿完全沒有處理，而這是最常見的實戰組合**

實測 `content/abilities/` 的 `moveSpeedMult`：**36 個技能給 0.6（−40%）**，另有 0.2 / 0.4 ×4 / 0.5 / 0.65 / 0.7 / 0.75 / 0.8 ×3。
把中位英雄套上最常見的 0.6：`5.9 → 3.54 u/s`。中位 AoE 的 `T_warn` 從 1.19 s 變成
`0.45 + 4.13/3.54 = ` **1.62 秒**。套上 0.2 的那一個，變成 **6.3 秒**。

**不要因此把所有技能訂成 1.6 秒。** 正確的處理是把契約寫成**遞迴**的：

> **鏈條規則**：一段連招裡，**只有第一環需要滿足 `T_warn`**。
> 被減速／定身之後吃到後續傷害，是**已經被擊中的後果**，不是不公平——前提是**造成減速的那一招本身是可躲的**。
>
> 推論（可當 lint）：**任何 `moveSpeedMult < 0.8` 或帶 stun / root 的技能，
> 一律不得留在 A 級**，必須自己有 `T_warn`。今天 16 個 root、42 個 stun、49 個 slow 技能全是瞬發，
> 所以今天**每一條連招的第一環都不合格**——這才是真正要修的地方，而不是把第二環拉長。

### 4.4 授權公式（作者只填半徑與傷害，時間用算的）

```
M               = 0.15                                              # 辨別+選擇反應餘裕（4.3a）
T_warn          = 0.45 + (radius × abilityRange + 0.6) / 5.6 + M    # 蓋章式（ground / hazard）
                = 0.55 + (radius × abilityRange + 0.6) / 5.6 + M    # 附身式（targeted 鎖定）
castTimeSec     = clamp(0.45, 0.60, round_0.05(T_warn × 0.45))      # 施法者被鎖的那一段
impactDelaySec  = ceil_0.05(T_warn − castTimeSec)                   # 蓋章之後、施法者已自由
recoverySec     = 依 0.5.3 的分級表（自 castTimeSec 結束起算，與引信並行）
```

代入現有半徑分佈（含 `M = 0.15`）：

| `r_eff` | `T_warn` | `castTimeSec` | `impactDelaySec` | 級 |
|---|---|---|---|---|
| 0.90 | 0.87 | 0.45 | 0.45 | B |
| 2.20 | 1.10 | 0.50 | 0.60 | B |
| **3.53（中位）** | **1.34** | **0.60** | **0.75** | **C** |
| 3.85（p90） | 1.40 | 0.60 | 0.80 | C |
| 5.83（最大） | **1.75** ⛔ | 0.60 | 1.15 | D → **應改為縮半徑** |

> **`castTimeSec` 的 0.60 s 上限不要動。** 它是由 ×0.25 的 CD 乘數推出來的手感上限（4.5c），
> 與可讀性無關；`T_warn` 變長時該長的是 `impactDelaySec`，不是定身。

**這張表就是本文件的實際主張**：施法者最多只被鎖 0.60 秒，受害者最多拿到 1.60 秒的地面警告。

* `targeted`（附身式、無法蓋章）**全部走 `castTimeSec`**，沒有 `impactDelaySec` 可用——
  所以它的 `T_warn` 天生比較貴（0.95–1.30 s 全部要施法者站著）。
  這正是 4.5(a) 要把它們改成 `resolveRecheck:"range"` 的原因：**貴的東西必須真的能躲**。
* **任何 `d > 5.0u` 的技能：縮半徑，不要加時間——這是硬規則，不是建議。** 三個理由：
  (1) 加了 `M` 之後 `T_warn` 會衝破 **1.75 s**，比多數 MOBA 的大招前搖還久，會讓戰鬥變成回合制；
  (2) 見 3.6——它在手機上已經蓋掉大半個畫面，而且比它自己的投放距離還大；
  (3) 見 4.3b——一旦受害者身上有 −40% 減速（36 個技能給），1.75 s 會再漲到 2.4 s，無法收斂。
  **具體門檻：`radius × abilityRange > 4.4`（即 `d > 5.0`）的技能一律把 `radius` 壓到 `4.4 / abilityRange`。**

> ### 4.4a **施法者可以「預判」，所以這張表是下限、不是保證（第四輪補）**
>
> `cast.point` 在 **cast begin** 就決定（`abilitySystem.ts:153-163`），
> 而 `T_warn` 現在有 1.3 秒——一個好的施法者不會蓋在你**現在**站的地方，會蓋在你**等一下會到**的地方。
> 而且反向跑在本 sim **完全免費**（`t.accel` 只在 `!moved` 時歸零，移動中轉向不付爬升成本），
> 所以這會變成一場乾淨的**猜拳**：他猜你往哪逃，你猜他猜你往哪逃。
>
> **這是特性，不是缺陷，而且是本設計最重要的一句話**：
> **公平性的終點不是「一定躲得掉」，是「躲不躲得掉取決於你，不取決於延遲」。**
> 也因此**不要無限往上加 `T_warn`**：超過 ~1.4 s 之後，多出來的時間不會提高閃避率
> （因為那是猜拳，不是反應），只會拖慢戰鬥節奏。**縮半徑的效益永遠大於加時間。**

### 4.5 兩個公式救不了的結構問題

**(a) 211 個 `targeted` 技能靠走位永遠閃不掉。**
`CastResolveSystem.ts:52-57` 明文：只有 `ground` 在結算時重新查詢命中名單，
其餘（targeted / self / skillshot / dash）**在起手當下鎖定**。
所以就算把 211 個 targeted 全加上 1.1 s 起手，走位依然無效。

> **注意這裡沒有「蓋章」可用**：`targeted` 的危險區跟著目標走，所以它是**附身式**，
> 100 ms 插值延遲省不掉，整段 `T_warn` 都得由 `castTimeSec` 承擔（見 4.2）。
>
> **提案**：`AbilityDef` 新增 `resolveRecheck: "lock" | "range"`（預設 `"lock"`＝現況，向下相容）。
> `"range"` 的語意直接沿用 `BasicAttackSystem.ts:96-113` **已經驗證可用**的規則：
> 結算當下若目標離開施法距離，整個施法作廢。
> 所有造成傷害的 targeted 技能都應設 `"range"`——這是把 AGENCY 還給 211 個技能最便宜的一刀。
> （此欄位動到 `packages/shared/src/content/schema/ability.ts`，該目錄目前由其他 agent 持有，需協調。）

**(b) 113 個英雄裡只有 12 個有位移技（13 個 dash）。**
89% 的英雄面對預告只能用走的——這正是 4.3 表格的硬地板來源。
`dash` 的 `maxDistance` **不吃 `abilityRange` 縮放**（`effectRunner.ts:155-163` 傳原值），
7.33–11u 覆蓋範圍大於全遊戲最大逃離距離 6.43u，所以**有位移＝全躲得掉，沒位移＝全躲不掉**。

三個選項，建議順序：
1. **（建議）**照 4.4 公式授權時間 + 對 `d > 5.0u` 的技能縮半徑。不動輸入、不動手感。
2. 加一個全英雄通用短位移（長 CD）。改動最大，會改變整個遊戲的節奏，不建議在此任務內做。
3. 提高移速。會連帶影響 TTK（#153）與追擊平衡，代價不可控。

**(c) `cooldown` 乘數 0.25。** 所有技能 CD ×0.25，等於**未預警傷害的量被放大四倍**。
這是上面每一條的力量倍增器，授權起手時間時必須一併重審。
**而且它與 `castTimeSec` 直接衝突**：一個原本 8 秒 CD 的技能實際 CD 是 2 秒，
若再配上 1.2 秒的定身，施法者一半的時間站著不動。**這是「不能只加 `castTimeSec`」最硬的工程理由**，
也是拆成 `castTimeSec + impactDelaySec` 的直接動機。

**(e) 追擊窗（punish window）在這個遊戲的幾何下不存在——不要為它設計，去調冷卻。**
完整算式見 0.5.3 的紅框。摘要：80/113 個英雄是 1.6u 的近戰；受害者逃出中位 AoE 之後
離施法者 4.96–6.88u；施法者在後搖期間可以走，移速中位 5.9 > 追擊者 5.6，**距離永遠不縮短**；
普攻循環是 2.0 秒。**任何 ≤0.6 s 的後搖都不可能換到一次反擊。**
真正的懲罰是**冷卻**（傷害技能中位 45 s × 0.25 = **11.25 s**），旋鈕是 `combatEnv.cooldown`。
**要讓閃躲更值錢，就把 0.25 調高；不要把 `recoverySec` 調長。**

**(d) 位移可以被用來把人推進去，這是特性不是 bug。**
`MovementSystem.ts` 的 `nav.override`（dash / knockback）**刻意忽略 root**，
所以「先蓋章、再把人擊退到章上」是成立的連招。因為章是**不追蹤**的，
這個組合對雙方都對稱（你也可以被擊退**出去**）。
**列在這裡是為了避免有人日後把它當成漏洞「修掉」。**

---

## 5. 守護者（THE GUARDIAN）——最嚴重的一例，也是最便宜的一修

### 5.1 現況

sim 端**已經把預告做對了**，而且是全專案唯一做對的一個：

* `GuardianSystem.ts:428-465 fireVolley()`：依威脅表取前 N 名，在**他們當下的位置**蓋下
  **不追蹤**的標記（原始碼註解：*One stamped, NON-TRACKING telegraph point（walking out of it is a decision）*）。
* `GuardianMark = { guardianId, x, z, impactTick, amount }`——傷害在蓋章當下就凍結。
* `applyMark()`（:392-406）在 `impactTick` 用 `queryOverlap` 重新查詢命中名單 → **走出去真的有效**。
* 實測節奏：起手 **24 tick = 0.800 s**，週期 **120 tick = 4.0 s**，3 個標記，半徑 **3.0**，
  第 1 回合 108 傷害（實測命中 97，佔 460 HP 的 **21%**），第 5 回合 + ramp 可達 ~47%。

**然後 100% 在網路邊界被丟掉**：`MatchRoom.ts` 的白名單沒有任何 `guardian*`，
`apps/client/src` 對 `guardian` 事件**零命中**，`snapshot.ts` 沒有 `world.structure` 分支。

**結論：這不是設計工作，是接線工作。** 唯一做對公平契約的系統，是唯一沒人看得見的系統。

### 5.2 具體預告規格（E 級）

| 階段 | 時間 | 視覺 | 音效 |
|---|---|---|---|
| **甦醒** `guardianWake` | — | 本體眼／核心亮起，底座環（半徑 `shield` = `t.radius`）點亮 | 低頻甦醒吼 |
| **蓄力** 起手前 0.25 s | — | 本體上方聚光收束、朝向目標旋轉 | 上升音起 |
| **標記** `guardianMark` | `impactTick − volleyWindupTicks` | **3 個地面圓**（半徑 = `volleyRadius`，見 5.3），瞬間以最終大小畫出外環（**可讀性優先，外環不成長**），內圈由 0 → 1 填充，亮度 0.55 → 1.00，線寬 0.10 → 0.22u，脈動 0 → 6 Hz，最後 20% 雙閃 | 每個標記一聲短促定位音，pan 依標記螢幕位置 |
| **落點** `guardianImpact` | `impactTick` | `Telegraph` 的 resolve pop（衝擊波環 + ember kick + 塵爆）+ `fx.prim.earth.shockwave` | 落地重音 |
| **休眠** `guardianSleep` | — | 核心熄滅、底座環轉暗 | 下降音 |

**倒數必須用 `impactTick` 對 `MatchState.tick` 算**，不可以用事件到達時間——
這是 client 端唯一能拿到「與延遲無關」進度的地方。畫在 `renderTick` 時間軸上。

### 5.3 數值：0.8 秒不夠，這是幾何算出來的

守護者的 `volleyRadius = 3.0` **原值傳入 `applyMark`**（`GuardianSystem.ts:352`，
**沒有**經過 `resolveAbilityRadius`，所以不吃 ×0.6）。故 `d = 3.0 + 0.6 = 3.6u`。
守護者標記是**蓋章式**（不追蹤 + 絕對 `impactTick`），所以用 **L = 0.45**。

| | 需要 `T_warn` | 現值 0.8 s 夠嗎 |
|---|---|---|
| v = 5.6（p10，設計參考） | **1.09 s** | ❌ 差 0.29 s |
| v = 4.0（最慢） | **1.35 s** | ❌ 差 0.55 s |

0.8 s 扣掉 L=0.45 只剩 0.35 s 可用，參考英雄只能走 1.96u < 3.6u。**現在這個起手時間，畫出來也躲不掉。**

**提案（改 `content/config/arena-rules.json`）**：

```
volleyWindupSec: 0.8  →  1.25     # 原稿寫 1.2，在修正後的延遲預算下差一個 tick，改 1.25
volleyRadius:    3.0  →  2.5      # 對齊 guardianTower.radius = 2.5，語意也更好懂
```

驗算：`d = 2.5 + 0.6 = 3.1`；
`v_ref = 5.6` 需 **1.00 s ≤ 1.25** ✅（留 0.25 s 餘裕）、
`v = 4.0` 最慢者需 **1.225 s ≤ 1.25** ✅（**連整個名單裡最慢的那一個都躲得掉**）。

> 原稿提的 1.2 s 是用舊的 L=0.40 算的，在修正後的預算下最慢者需要 1.225 s，**差 25 ms ＝ 差一個 tick**。
> 多給 0.05 s 就能讓 113 個英雄全數過關，沒有理由省。

傷害不必動（`volleyDamageBase` 108 維持）——**把躲得掉的招留下痛感，比削弱它更好**。
週期 `volleyPeriodSec` 4.0 也不必動：1.25 s 的起手佔週期的 31%，仍有 2.75 s 的安全空檔。

### 5.4 鎮守之力（heir pulse）也是無預警傷害

`heirPulse`（:468-492）：擊殺守護者者背 25 s buff，每 4 s 對半徑 2.5 內敵人打
`heirPulsePct 0.25 × volleyDamage`。`guardianHeirPulse` 同樣不在白名單、**沒有任何光環**。
規格：**攜帶者腳下常駐一圈與守護者同色的環（半徑 2.5，即真實作用半徑）**，
脈動與 4 s 週期同步，脈衝當下 `fx.prim.earth.pulse`。這是「訊號存在＝威脅存在」最低限度的誠實。

> **但常駐環本身不夠。** 脈衝是**瞬發**的（沒有任何起手），所以一個只顯示「危險半徑在這裡」的環
> 只能靠**預先站位**來閃，不能靠反應。它需要一個**預告拍**：
> **每個 4 秒週期的最後 0.5 秒，環的亮度／線寬走完整的急迫度爬升（3.4 節），落在脈衝那一 tick。**
> `d = 2.5 + 0.6 = 3.1u`，`T_warn(蓋章, v_ref) = 1.00 s`——
> 但因為週期是**固定且可預測**的，0.5 秒的預告拍 + 可見的環就足夠了：
> **可預測的節奏本身就是警告的一部分**，這是 E 級和 C 級的根本差別。
> （同理適用守護者：4 秒週期讓 1.25 秒的起手比孤立的 1.25 秒更好躲。）

### 5.5 火圈（#132）——**先修正原稿對它的判決**

事實部分成立：`FireRingSystem` **沒有任何幾何**，它遍歷 `world.champion` 燒**所有區域的所有活著的英雄**，
與位置完全無關；三個 `fireRing*` 事件都不在白名單；
而唯一的 client 提示（BGM bed + minimap rim）在戰鬥第 **210** 秒才開，
但滿血英雄在第 **194.9** 秒就已經被燒死。

> ### ❌ 但原稿的兩個判決是錯的，必須撤回
>
> **錯誤一：「它在契約下三條全滅」是類別錯誤。**
> #132 的原始需求是「戰鬥約 3 分鐘基準，然後火圈收進來**加速收尾**」。
> 它是一個**棋鐘**，不是一次攻擊。棋鐘**本來就不該有 AGENCY**——
> 拿 TIME/SIGNAL/AGENCY 去審一個回合計時器，就像責怪倒數計時器沒有預告一樣。
> 它需要的只有 **SIGNAL**：你必須知道它開始了、知道血條為什麼在掉、知道還剩多久。
>
> **錯誤二：「必須改走 `damageQueue`」是有害的建議。**
> `FireRingSystem.ts:1-10` 的檔頭明文寫著這是刻意的：
> 「no attacker, so no kill credit, no bounty, no lifesteal, and it bypasses armor/MR AND the combat-env damage knob」，
> 而且 `hp.hp -= dmg` 之後由**同一 tick 的 `deathSystem`** 接手，killer = null → 環境死亡。
> 改走 `damageQueue` 會**同時**加回護甲減免、護盾吸收、吸血、擊殺獎金與擊殺歸屬——
> **把一個刻意設計成不可被玩弄的收尾機制，變成可以被裝備對抗的傷害來源。**
>
> **真正的修法便宜得多**：`fireRingDamage` **已經是一個完整的傷害封包**
> （`FireRingSystem.ts:55-62`：`{ id, amount, dmgType:"true", origin:"fireRing", x, z }`）。
> **把它加進白名單，client 直接用它畫跳字與紅閃即可，一行 sim 都不用動。**

**所以火圈的處置是（不需要 owner 拍板的部分）**：

1. `fireRingStart` / `fireRingTick` / `fireRingDamage` 三個事件進白名單。
2. 跳字與紅閃由 `fireRingDamage` 驅動（`amount` + `x/z` 都在），**不改 `damageQueue`**。
3. BGM／minimap 提示改由 `fireRingStart` 驅動，**刪掉 `audio/scene.ts:12` 的 `FIRE_RING_SEC = 30` 猜測**
   ——那個常數就是「第 210 秒才響、但第 194.9 秒就死了」的成因。
4. HUD 加一條**明確的「灼燒中 −x% HP/s」狀態列**，用 `fireRingTick` 的 `ratePerSec`。
   `FireRingSystem.ts:39` 已經有一個 `ratePerSec <= 0` 的「grace second: telegraph only, no damage yet」——
   **那一秒就是它的預告窗，今天沒有任何東西畫它。**

**需要 owner 拍板的只有一件事**：要不要給它真幾何（每區一個收縮圓，圓外才燒，
半徑上 wire 成 `MatchState.fireRingR: "float32"`）。
給了它就從棋鐘變成一個真正的區域壓縮機制（＝真的叫「圈」）；不給就照上面 1–4 誠實呈現它是全域流血。
**兩者都可以，但不要一邊叫它「圈」一邊沒有圈。**

---

## 6. 公平性規則（全域，任何新功能都要通過）

1. **沒有訊號就不准扣血。** 任何 `damageQueue.push` 或 `hp.hp -=` 的來源，
   都必須能指出「哪一個廣播事件／哪一個 snapshot 欄位，在傷害發生前的哪一個 tick，告訴了受害者」。
   目前全 sim 的傷害入口共 6 個（第四輪獨立 grep 複驗，與第三輪一致）：`effectRunner.ts:42`、
   `ProjectileSystem.ts:66`、`BasicAttackSystem.ts:227`、`GuardianSystem.ts:398`、
   `GuardianSystem.ts:476`、`FireRingSystem.ts:52`（最終結算一律走 `combat/damage.ts:513`）。
   **後三個今天完全沒有訊號。**
   兩個必須明寫、否則下一次稽核會重推一遍的子情形：
   **(a)** 道具／被動 hook（`effects/hooks.ts fireHooks`）把傷害推進**同一條佇列**，
   但它們一律搭在一次**已經被預告過的命中**上，故滿足本規則，不算獨立入口；
   **(b)** 遠程普攻（33/113 個英雄，`baseStats.range` 6–12u）的傷害走 `ProjectileSystem`，
   所以它的窗口是「`attackWindup` 起手 ＋ 飛行時間」兩段，**兩段都必須可見**。
   **階段 2.5 會新增第 7 個入口（`HazardSystem`）；它的訊號是 cast begin 當下發出的 `hazardMark`。**
2. **訊號給受害者，不是給施法者。** 任何只由本機輸入狀態驅動的東西（`getHeldAbility()`、
   `localSelfPos()`、`touchFrame.indicator`）**不算預告**。#152 的虛線圈是瞄準輔助，不是預告。
3. **訊號必須說「哪裡」。** 只說「有人在放招」的預告條不滿足契約。
   幾何必須上 wire（第 2.2 節），而且**必須是伺服器算過 `abilityRange` 的真值**。
4. **畫出來的＝打到的。** 預告半徑與實際命中半徑不一致是**比沒有預告更嚴重的缺陷**。
   建議加一條 runtime 斷言（dev build）：`|drawnRadius − resolvedRadius| < 0.01`。
   **這條同樣適用於拋射物（第四輪補）**：`ProjectileSystem.ts:26`
   `const hitRadius = proj.basic ? proj.hitRadius : resolveAbilityRadius(world, proj.hitRadius)`
   ——技能拋射物的命中半徑**有**吃 ×0.6，普攻拋射物**沒有**。
   `ProjectileView` 的視覺大小必須跟著同一條規則，否則就是 `VfxSystem.ts:612` 那個 1.667× 謊言的第二現場。
5. **手機可讀——注意方向：問題是太大，不是太小。**
   實測（3.6 節）：68° 俯角下地面圓幾乎是正圓（短軸/長軸 = 0.927），
   而預設 `DOLLY_MIN = 10` 下中位 AoE 直徑約 **300 px**，在 390 px 高的手機上吃掉四分之三畫面高度。
   規則：**同時最多 6 個地面預告**（保留離本機最近的）；**重疊時只畫外環不畫填充**；
   環的螢幕線寬 **≥ 2 CSS px**；只有在遠端 zoom（`DOLLY_MAX = 40`）下直徑 **< 24 CSS px** 時
   才退化成頭上的方向標記＋距離文字。
   落點被身體遮住時，補一根**高 2.5u 的低 alpha 光柱**，讓落點在人堆裡仍可見。
6. **必須撐過 #85 死亡去飽和——而且實測比預期更糟。**
   `DeathFocusFx` 是掛在攝影機上的後製，預告是場景 mesh，會被一起抽色。
   實測色池尺寸（`render/deathFocus.ts:76-86`）：隊友身上**全彩半徑只有 ~1.25u，到 3u 就完全變灰**。
   一個 `r_eff = 3.53u` 的預告圈，**中心那一小塊有色、而「安全邊界」那一圈 100% 是灰的**——
   偏偏邊界才是要做決策的地方。再疊上死亡觀戰的 `DOLLY_MAX_DEAD = 90`（px/u ≈ 4.8），
   觀戰視角的預告實質不可讀。
   **判定：可接受，但要說清楚為什麼。** 死者沒有 AGENCY，這是**學習／理解**的損失，不是公平性的損失。
   兩個必要條件：**(a)** 急迫度不可只走色相（第 3.4 節）——高亮度 + 線寬 + 脈動頻率在全灰階下仍可讀；
   **(b)** 不要為此把預告 mesh 排除在後製之外——那會讓死者看到活人看不到的東西，是反向的不公平。
   （附記：`FOCUS_MAX_SOURCES = 4` 已被 self/revive + 3 隊友佔滿，**沒有空槽**可以拿來替預告開色池，
   所以「把預告加進色池」這條路實作上也不通。）
6b. **火圈沒有畫面調色。** 已查證：`fireRing` 只有 BGM bed（`audio/scene.ts`）與 minimap rim
   （`ui/hud/Minimap.tsx:109-128`），**沒有任何全螢幕 tint 或後製**。
   所以「預告會被火圈染色蓋掉」這個顧慮不存在，不要為它設計對策。
7. **必須撐過 #93 勝利洗畫面。** `ROUND_WASH_FILTER = grayscale(0.88) saturate(0.18) brightness(0.88)`
   加 0.76 alpha 灰漸層是 **DOM 層、蓋在 canvas 之上**，任何場景內預告都會被壓平。
   因此規則是**時序**而非視覺：**勝利演出擁有畫面時，不得有傷害發生。**
   這條與 #100（回合判定後英雄還打了 ~66 秒）直接衝突。
   **第四輪把這條從「已知破口」升級為出貨閘（ship gate）**：#100 未修之前，
   回合判定之後仍有 `fireRingDamage`／技能傷害在一張 `grayscale(0.88) saturate(0.18)`
   ＋0.76 alpha 灰幕底下發生，也就是**在玩家盯得最緊的那一刻，展示一個可證明看不見的預告**。
   **階段 1／2 可以先上（那是把不可見變可見，不會被這條擋住）；階段 2.5 的危害系統不應在 #100 之前宣告完成。**
8. **鎖定與可走位要用不同語彙。** 見 3.4；不然玩家會學到一條錯的規則，然後在該跑的時候不跑。
9. **幾何必須是 snapshot／事件權威，不得由 client 推導。**
   `castR` 由伺服器算完 `resolveAbilityRadius` 才上 wire；client **永遠不得自己乘 `abilityRange`**。
   否則兩台 client 只要 `combatEnvJson` 到達時機不同，就會對「危險區在哪」給出不同答案。
   **今天已經有這個 bug 的正確版與錯誤版並存**：
   `GameApp.resolveHoldPreview`（#152）**做對了**（`radius = rawRadius * envFactor("abilityRange")`，`GameApp.ts:1243`），
   而 `VfxSystem.ts:612` **做錯了**（用未縮放的 `def.radius`）。
   ⇒ **施法者自己看到的圈和受害者看到的圈，今天大小不同（差 1.667×）。**
   #152 的那一行就是正解的參考實作。

### 6.1 資訊外洩審查（原稿缺，這裡補齊）

| 問題 | 判定 | 依據 |
|---|---|---|
| 預告是否洩漏潛行中的施法者？ | **不適用** | 全 sim `grep` 無 stealth / invisible / untargetable 機制，沒有隱形可洩漏 |
| 預告是否洩漏「假動作（feint）」？ | **不適用** | 沒有玩家主動取消施法的途徑（`abilitySystem.ts:99` 施法中再按只回 `"cooldown"`），所以不存在可洩漏的假動作 |
| `castKey` 是否讓對手提前知道技能身分？ | **可接受** | `abilityCast` 事件今天就已經廣播 `abilityId` 給所有人；不是新的洩漏。而且「知道打過來的是什麼」正是需求要的 |
| `guardianMark.targets` 洩漏威脅表？ | **可接受、且是需要的** | 「守護者鎖定你」正是警告本身 |
| 跨區域洩漏（4 個對戰區的施法全都送給所有 client）？ | **既有狀況，不是本設計造成** | `snapshot.ts` 沒有任何 per-seat 的 entity 過濾，12 個英雄的位置今天就已經全送。Colyseus 是**單一共享 state**，技術上也無法只對某些 client 隱藏欄位 |

**但要因此加一條硬規則**：

10. **跨區域的東西一律不得產生感官輸出。** wire 上有不代表可以播。
    施法音效必須做**本區域過濾**（3.5 節第 2 點），地面預告只畫本機所在區域，
    與 #67「minimap 只顯示自己那一區」的既有決策一致。
    否則四個區的預告與音效會疊成噪音——**這既是體驗問題，也是把既有的 wire 洩漏轉成實際優勢的唯一路徑**。
11. **可預測的節奏本身就是警告的一部分。** 固定週期的危害（守護者 4 s、鎮守之力 4 s）
    容許比一次性技能更短的起手，因為玩家可以預先站位；但**仍必須有一個落在結算 tick 上的預告拍**（5.4 節）。

---

## 7. 已經存在、必須重用而不是重寫

| 已有 | 路徑 | 狀態 |
|---|---|---|
| 起手時間機制本身（延後結算） | `packages/shared/src/sim/abilities/abilitySystem.ts:186-208` | ✅ 正確，實測 ct=0.6 → 18 tick 準確結算 |
| 施法結算 / 中斷 / 定身 / 地面 AoE 結算時重查 | `packages/shared/src/sim/systems/CastResolveSystem.ts:16-79` | ✅ **全專案最好的一段公平性程式碼**，勿動 |
| 守護者標記相位（不追蹤、帶 impactTick） | `packages/shared/src/sim/systems/GuardianSystem.ts:352, 392-406, 428-465` | ✅ 已完整實作，**只缺渲染與轉發** |
| 施法旗標寫入 snapshot | `apps/game-server/src/net/snapshot.ts:222-224` | ⚠ 有寫，**client 零消費者**（死線） |
| `castBegin/castEnd/castInterrupt/attackWindup` 廣播 | `apps/game-server/src/rooms/MatchRoom.ts:304-307, 348` | ✅ 已對所有 client 廣播 |
| 每個英雄（含敵人）的頭上施法條 | `apps/client/src/CastTracker.ts` + `GameApp.ts:1638-1640` + `ui/WorldAnchorLayer.tsx:183-192` | ✅ 端到端可用，**只是沒有資料餵它** |
| 地面預告環 + 魔法陣 + resolve pop（含 mesh pool） | `apps/client/src/vfx/Telegraph.ts` | ✅ `fillMs`/`holdMs` **建構子參數早就在，只是沒人傳** |
| 虛線環幾何（含半徑快取） | `apps/client/src/render/AimIndicator.ts` `dashedRing()` | ✅ 重用**幾何**，勿重用其資料流（caster-only） |
| 地面貼花池 | `apps/client/src/vfx/GroundDecalPool.ts` | ✅ `MAX_DECALS=20`, `DECAL_Y=0.035` |
| VFX primitive 產生器 + 元素配色 | `apps/client/src/render/vfx/primitives.ts` / `elements.ts` / `content/vfx/fx.prim.*`（95 份） | ✅ 直接用，不要新做粒子 |
| 施法 clip 拉伸 | `apps/client/src/render/EntityViewRegistry.ts:221-232` + `ClipAnimator.ts:90-99` | ✅ 已支援 `clipWindowMs` |
| 狀態身體光環（暈眩／定身／減速／衝刺） | `apps/client/src/vfx/StatusAuraFx.ts` + `VfxSystem.ts:390-399` | ⚠ **完全沒有 production caller**，`vfx.statusFx.set(...)` 沒人呼叫 |
| 音效 cue 與空間化參數 | `audio/sfxManifest.ts` / `combatSfx.ts` / `AudioSystem.playSfx(event, opts)` | ⚠ cue 都在，`GameApp.ts:803-804` 呼叫時**不帶 opts** |
| 平手可用的攻擊起手範本 | `packages/shared/src/sim/systems/BasicAttackSystem.ts:28-30, 96-113, 139-152` | ✅ 全遊戲唯一三條件都成立的傷害來源；`resolveRecheck:"range"` 直接抄它 |

**只需要「接上一根線」就會活過來的四件事**（各為個位數行數）：

1. `VfxSystem.ts:612` 把 `castTimeSec*1000` 當 `fillMs` 傳進 `Telegraph`。
2. `VfxSystem.ts:612` 的半徑改用**伺服器算好的** `castR`（已 ×0.6），停止說謊。
3. `GameApp` 每幀呼叫 `vfx.statusFx.set(es.id, es.flags, …)`——旗標、線路、渲染器都在，只缺這一句。
4. `MatchRoom.ts` 白名單加 11 個 `guardian*` / `fireRing*` 事件。

---

## 8. 分階段實作計畫（相依序 + 並行 lane）

> **檔案領域宣告**：目前已知其他 agent 持有
> `apps/client`（boot loader / `AssetManager` / `ContentDb`）、`content/assets`、`nginx`、
> `packages/shared/src/content`、`README.md`、`tools/`。下列 lane 已避開這些路徑；
> 標 ⚠ 者需要事前協調。
>
> **第四輪覆核（誠實版）**：`docs/design/` 不在任何已宣告領域內，本文件安全。
> 但**「其他 agent 持有 `apps/client`」與階段 0／1-B／1-C／2-D／0-D 全部在 `apps/client` 之下是直接衝突的**——
> 原文只說「已避開這些路徑」，實際上避不開。真正的切分是**按檔案**而非按目錄：
> 本設計動的是 `apps/client/src/vfx/*`、`render/EntityViewRegistry.ts`、`CastTracker.ts`、
> `ui/WorldAnchorLayer.tsx`、`GameApp.ts` 的事件 drain 段；
> 他人持有的是 boot loader、`AssetManager`、`ContentDb`。
> **`GameApp.ts` 是唯一真正的共用檔，必須逐段協調，不能宣稱不相干。**

> ### 🔴 與其他任務的實質重疊（原稿漏列，全部需要協調而非只是避開檔案）
>
> | 任務 | 狀態 | 重疊點 | 處置 |
> |---|---|---|---|
> | **#147** 戰鬥果汁 VFX：陰影、走路塵土、**cast decals**、火花、血 | pending | **直接撞 0-A / 2-D**——「cast decals」就是本文件的地面預告 | **必須合併或明確切分**：本文件負責「傷害前的警告」，#147 負責「傷害後的殘留」。兩者用不同的視覺語彙（3.3 節：預告不可用 `castScorchSpec`） |
> | **#105** 守護者的每競技場身分（樹人／石頭人／巨獸人） | **in_progress** | **直接撞 1-B**——它要決定守護者的 `modelKey` 與外觀，本文件要決定它的 wire 種類與血條 | **1-A（wire）可以先做，1-B（client view）必須等 #105 或與其同一個 agent 做** |
> | **#144** 從 w3x 還原每英雄的**移動速度**／攻速／回復 | pending | **直接撞第 4 節的全部算術** | ⚠ **它會改掉 `v_ref = 5.6`**。第 4 節的表必須在 #144 落地後重算一次。**授權 `castTimeSec` 應排在 #144 之後**，否則要做兩次 |
> | **#56** 匯入器白名單（`acas` / `ucpt` / `ucbs` 被丟掉） | pending，**在 `tools/`（他人持有）** | 階段 3「還原原圖數值」的**前置**條件 | ⚠ **階段 3 無法在 `tools/` 的持有者參與前開始**。原稿把 3-A 放進 `scripts/` 迴避了檔案衝突，但**沒有迴避相依性** |
> | **#123** 共用 VFX primitive 函式庫 | pending | 撞 3.2 節「重用 `fx.prim.*`」 | 只讀取、不新增 primitive，衝突低；但蓄力 loop 若需要新的 `PrimitiveKind` 要走 #123 |
> | **#79** 技能 VFX 綁定（460/554 共用同一顆火球） | pending | 預告說得出「何時／哪裡」，說不出「是什麼」 | 互補，可平行 |
> | **#136** `abilityRange = 0.6` | completed | 若日後調回 1.0，**第 4 節每個 `T_warn` 要重算**（`d` 會漲近一倍） | 在 4.1 註記為輸入參數 |
> | **#100** 回合結束後仍在打 | pending | 阻擋公平性規則第 7 條 | 已在第 6 節記為已知破口 |
> | **#153** TTK / `maxHealth` | completed | 起手時間拉長 ⇒ DPS 下降 ⇒ 回合變長 | 授權後必須重跑 #153 的回合長度驗證 |

### 階段 0 — 誠實化（可立刻做，零相依，無 sim 變更）

| Lane | 檔案領域 | 內容 |
|---|---|---|
| **0-A 視覺誠實** | `apps/client/src/vfx/VfxSystem.ts`、`Telegraph.ts` | 傳真實 `fillMs`；半徑改用權威值；**瞬發技能不再畫「填充中」的環**（改為單幀落點閃，語意 = 命中回饋） |
| **0-B 狀態可見** | `apps/client/src/GameApp.ts`、`vfx/StatusAuraFx.ts` | 呼叫 `statusFx.set(es.id, es.flags, …)`；`CASTING` 給身體視覺 |
| **0-C 音效空間化** | `apps/client/src/audio/*`、`GameApp.ts:803-804` | `playSfx` 帶 `{volume,pan}`；本區域過濾 |
| **0-D 幀資料 audition 頁** | `apps/client/src/ui/`（新頁）或既有 codex 分頁 | 見下方紅框——**這是 3.1a 唯一的驗收方式** |

> 🔴 **3.1a 的對齊誤差是視覺屬性，單元測試抓不到（第四輪補）。**
> 測試最多只能斷言算術（`pulseSpeedRatio(clipDur, "cast", startupMs/f)` 會把 strike 幀放到最後一 tick），
> **它無法斷言 0.6 對這個 clip 是不是正確的分數**——那要看得到才知道。
> 依本專案「findings ship as live pages」的慣例，做一頁 **`/frame-data` audition**：
> 每個英雄 × 每個級別，把 cast clip 疊在一把 **tick 尺**上播，
> 標出 `startupTicks`、active tick、recovery 段，並列出
> `clipStrikeMs − startupMs`（對齊誤差）與**是否被 `PULSE_RATE_MIN/MAX` 夾住**。
> 誤差 > 1 tick 或被夾住的組合列成紅色清單——那就是要調 `castStrikeFraction` 的名單。
> **這頁同時是 0.5.1 的守門員**：任何人日後想「讓傷害對齊動畫」，這頁會立刻顯示他改壞了什麼。

**驗收**：AoE 環大小與實際命中半徑誤差 < 0.01u（dev 斷言）；被暈眩的英雄看得出來。

### 階段 1 — 守護者上線（最高 CP 值；不需要任何內容授權）

| Lane | 檔案領域 | 內容 |
|---|---|---|
| **1-A wire** ⚠ | `packages/shared/src/protocol/schema.ts`、`apps/game-server/src/net/snapshot.ts`、`apps/game-server/src/rooms/MatchRoom.ts` | `ENTITY_KIND.GUARDIAN = 4`；`world.structure` 分支；11 個事件進白名單 |
| **1-B client view** | `apps/client/src/render/EntityViewRegistry.ts`、`render/overheadAnchors.ts`、`GameApp.ts` | kind 4 → 中立色（**修掉 `?? 0` 落藍隊**）、守護者模型、`hasOverheadBar` 納入 kind 4 |
| **1-C 標記渲染** | `apps/client/src/vfx/VfxSystem.ts` | `guardianMark` → 3 個 `Telegraph`，`fillMs` 由 `impactTick − state.tick` 推得；`guardianImpact` → resolve pop |
| **1-D 數值** | `content/config/arena-rules.json` | `volleyWindupSec 0.8→1.2`、`volleyRadius 3.0→2.5` |
| **1-E 鎮守之力** | `apps/client/src/vfx/*` | 攜帶者腳下 2.5u 常駐環 + 4 s 同步脈衝 |

**驗收（必須是 runtime 驗收，不是單元測試）**：起一場真的房間，
確認 client 收到 `guardianMark`、地上出現 3 個圈、圈內站著會被打、**走出去不會**。

### 階段 2 — 施法幾何上 wire（讓預告能說「哪裡」）

| Lane | 檔案領域 | 內容 |
|---|---|---|
| **2-A schema** ⚠ | `packages/shared/src/protocol/schema.ts` | 7 個 `cast*` 欄位 + 4 個 `CAST_*` flag |
| **2-B server** | `apps/game-server/src/net/snapshot.ts` | 由 `ab.cast` + `AbilityDef` 填寫；`resolveAbilityRadius` 在此套用 |
| **2-C sim payload** | `packages/shared/src/sim/abilities/abilitySystem.ts` | `castBegin` payload 補 `point/radius/shape`（**不改任何 sim 行為，只加欄位**） |
| **2-D client 消費** | `apps/client/src/CastTracker.ts`、`frameBus.ts`、`ui/WorldAnchorLayer.tsx`、`vfx/VfxSystem.ts` | 進度改用 **`ev.tick` 鎖存 + 本機時鐘驅動**，`castTicks/castLeft` **只做校正**（見 2.1 的可渲染性陷阱）；`castBegin`/`castEnd` 兩個新 case；依 `CAST_*` flag 畫圓／扇／線／鎖定弧 |
| **2-E 施法條升級** | `ui/WorldAnchorLayer.tsx` | 加技能 icon（`AbilityDef.icon` 已有）＋依級別配色，讓玩家看得出「這是大招」 |

**驗收**：兩台 client，A 施放帶 ct 的 ground AoE，B 螢幕上在傷害之前出現**大小正確**的圈，
且 B 走出去不會被打到。
**額外驗收（針對可渲染性）**：在 144 Hz 螢幕上錄影，環的填充**不得有 20 Hz 的階梯**；
人為注入 150 ms 的網路抖動，環**不得跳動或倒退**。

### 階段 2.5 — 幀資料（`FrameProfile`）：落地延遲 ＋ 後搖，本文件的核心機制

| Lane | 檔案領域 | 內容 |
|---|---|---|
| **2.5-A schema** ⚠ | `packages/shared/src/content/schema/ability.ts` | 新增 `impactDelaySec?` / `activeSec?` / `recoverySec?`（全部預設 0／1 tick＝現況行為），見 2.6 |
| **2.5-E 後搖（RECOVERY）** | `packages/shared/src/sim/systems/CastResolveSystem.ts`、`abilities/abilitySystem.ts`、`protocol/schema.ts` | 結算後掛 `ab.recoverTicks`；`castAbility` 與 `BasicAttackSystem` 在其 >0 時拒絕出手（沿用既有的 `"cooldown"` 拒絕路徑）；移動**不**受限（0.5.3 的刻意偏離）。snapshot 用既有的 `ENTITY_FLAG.WINDUP` 之外新增一格 `RECOVERING`，讓對手看得出「他現在打不出東西」——**懲罰窗必須是可見的，否則等於不存在** |
| **2.5-B sim** | `packages/shared/src/sim/systems/`（新 `HazardSystem.ts`）、`CastResolveSystem.ts` | 把 `GuardianSystem` 的 `sc.marks` + `impactTick` + `applyMark()` 泛化成 `world.hazards`；`CastResolveSystem` 在 `impactDelaySec > 0` 時**蓋章而不是結算**，解除定身，N tick 後由 `HazardSystem` 用 `queryOverlap` 重查命中名單並結算 |
| **2.5-C wire** | `MatchRoom.ts` | `hazardMark` / `hazardImpact` 進白名單（payload 與 `guardianMark` 同形） |
| **2.5-D client** | `apps/client/src/vfx/VfxSystem.ts` | **與 1-C 共用同一個 handler**——守護者標記與技能危害是同一件事 |

> **這一階段的價值**：它讓「施法者手感」與「受害者警告時間」脫鉤。
> 沒有它，第 4.4 節的表就退化成「把 `castTimeSec` 訂成 1.2 秒」，而那會被 ×0.25 的 CD 乘數放大成災難（4.5c）。
> **`GuardianSystem` 已經證明這個機制在本 sim 裡是可行且確定性的（`sc.marks` 是純資料、按 id 序迭代）**，
> 泛化它比從零設計安全得多。
>
> **驗收必須是 runtime**：蓋章當下記錄命中名單，結算當下再記錄一次，
> 斷言「站在章上不動 → 中；蓋章後走出去 → 不中；蓋章後被擊退進去 → 中」。

### 階段 3 — 內容授權（真正滿足需求的一步；也是最大的一步）

| Lane | 檔案領域 | 內容 |
|---|---|---|
| **3-A 授權腳本** ⚠ | `scripts/`（不用 `tools/`，該目錄他人持有） | 依 4.4 公式對 554 個技能產出建議 `castTimeSec`，輸出審核表（不自動寫入） |
| **3-B 寫入** | `content/abilities/*.json`（英雄內嵌 Q/W/E/R 副本的**鏡射由產生器自動維護**，⛔ 不要手動同步兩份） | 見下方 🔴 |
| **3-C 半徑審核** | `content/abilities/*.json` | `d > 5.0u` 的技能縮半徑而非拉長時間 |
| **3-D targeted 補救** ⚠ | `packages/shared/src/content/schema/ability.ts`、`sim/systems/CastResolveSystem.ts` | `resolveRecheck: "lock" \| "range"`，造成傷害的 targeted 一律 `"range"` |

> 🔴 **#79 的覆寫陷阱（⭐ 2026-08-26 複查：引擎側已修掉）**：
> 當年 `registerChampion` 會用**英雄文件內嵌的 Q/W/E/R 副本覆蓋**掉獨立文件，
> 只改 `content/abilities/*.json` 的 Q/W/E/R 在 runtime 會被完全丟棄。
> ⭐ **現況**：`sim/content/registry.ts` 以 **standalone doc 為權威**（內嵌副本只 `fillGaps`，⛔ 不覆蓋），
> 兩份副本的**鏡射由產生器自動維護（abilityMirror）**——standalone → embedded 單向
> （`tools/skill-remake/apply_tiers.py::_mirror`），⛔ **不要手動同步兩份**：
> `content/champions/*.json` 72/72 全是產物，要動就改產生器來源再重生成。
> **每一次授權後，驗收必須是「載入真實登錄表、讀 `Abilities.all()`」，不是讀檔案。**

### 階段 4 — 火圈（設計決策，需 owner 拍板）

見 5.5：(A) 給幾何 或 (B) 誠實改名為全域流血 ＋ 可見倒數。
**兩者都 ⛔ 不得改走 `damageQueue`**（5.5 已推翻該建議：會加回護甲／護盾／吸血／擊殺歸屬，
把刻意設計成不可被裝備對抗的收尾機制變成可被對抗的傷害來源）。
跳字與紅閃一律由已完整的 `fireRingDamage` 封包驅動，client 提示改由 `fireRingStart` 驅動。
**只有「要不要給真幾何」這一項需要 owner 拍板；上述接線部分（5.5 的 1–4 點）不需要等。**

### 相依圖

```
階段0 ──┬─→ 階段1（守護者；不需 0，但 0-A 先做會共用 Telegraph 修正）
        │      └─→ 1-B 需要 #105（in_progress，守護者外觀）
        └─→ 階段2 ──→ 階段2.5（落地延遲）──→ 階段3（內容授權）
                                                    ↑
                                      #56（匯入器，在 tools/，他人持有）
                                      #144（w3x 移速還原，會改掉 v_ref）
階段4（火圈）：1–4 項可立刻做；「要不要真幾何」等 owner 決策
#79 / #123（VFX 身分）與階段 2/3 平行；沒有它，預告說得出「何時／哪裡」說不出「是什麼」
#147（cast decals）必須與 0-A / 2-D 合併或明確切分
#100（回合結束後仍在打）阻擋公平性規則第 7 條
#153（TTK）需在階段 3 之後重跑
```

**如果只能做三件事，做這三件**（依 CP 值）：

1. **階段 1**（守護者上線）——sim 已經對了，純接線，而且是目前最不公平的一個。
2. **0-A**（`Telegraph` 傳真實 `fillMs`、半徑改用權威值）——兩行，把「說謊的預告」變成「誠實的預告」。
3. **階段 2.5**（落地延遲）——**沒有它，階段 3 的內容授權只能產出定身 1.34 秒的技能**，
   而那會因為 ×0.25 的 CD 乘數變成比現況更差的手感。

**如果只能再多做一件事**：3.1a 的 `castStrikeFraction`。它是三行改動，
而且沒有它，前面每一項都會產出「地面圈誠實、角色身體說謊」的組合——
**玩家會照著身體做決策，所以那等於白做。**

---

## 9. 已知的「已實作但實際不會發生」清單（本任務新增 4 例）

本專案已有三個確認案例（#93 的 `roundWins` 伺服器從不寫、champion taunt 缺 ctx、#79 被內嵌副本覆蓋）。
本次調查新增：

1. `ENTITY_FLAG.CASTING` / `WINDUP` — 伺服器每 tick 寫，**client 零消費者**。
2. `StatusAuraFx` 整套 — 有實例、有 accessor、有使用說明註解，**零 production caller**。
3. 全部 8 個 `guardian*` 事件 — sim 發出，**不在廣播白名單**，client 零引用。
4. 全部 3 個 `fireRing*` 事件 — 同上。

**共同教訓**：綠色測試斷言的是記憶體中的表，不是**載入後的登錄表**、不是**跨過網路邊界的事件**。
本文件每一階段的驗收都刻意寫成 runtime 驗收，原因在此。

---

## 10. 對抗性複核紀錄（2026-07-23，第二輪）

本節記錄第二輪針對本文件本身的挑戰結果——**哪些原稿的主張被推翻、哪些疑慮查證後排除**。
目的是不要有人重新推導同樣的東西。

### 10.1 推翻的（原稿寫錯，已在正文修正）

| # | 原稿主張 | 實際 | 依據 |
|---|---|---|---|
| 1 | 最低門檻 **1.10 s** | **1.19 s**（蓋章）／**1.29 s**（附身） | 反應時間用需求方指定的 300 ms 上界（原稿用 220），加速度損失是整整一個 tick 33 ms（原稿寫 20），網路取一般值非 LAN。見 4.2 |
| 2 | 參考速度 = 中位 5.9 | **p10 = 5.6**。公平地板要對九成成立 | `baseStats.ms` 分佈實測；`growth.ms` 全為 0 |
| 3 | 「100 ms 插值延遲拿不回來」 | **蓋章式拿得回來**。本機英雄是 client 預測跑在當下，蓋章幾何是世界靜態 + 絕對 tick | `predict/LocalPrediction.ts` 檔頭；`constants.ts:21` |
| 4 | 「事件會掉，所以要走 snapshot」 | **事件不會掉**——`WebSocketTransport` = TCP。而且 payload 早就帶 `ev.tick`，`MatchState.tick` 也早就在 wire 上 | `index.ts:152`；`MatchRoom.ts:348`；`schema.ts:297,347` |
| 5 | 火圈「三條全滅」 | **類別錯誤**。它是回合棋鐘（#132），本來就不該有 AGENCY，只需要 SIGNAL | #132 原始需求；`FireRingSystem.ts` 檔頭 |
| 6 | 火圈「必須改走 `damageQueue`」 | **有害**。會加回護甲／護盾／吸血／擊殺歸屬。`fireRingDamage` 已經是完整封包，進白名單即可 | `FireRingSystem.ts:1-10, 55-62` |
| 7 | 守護者起手改 **1.2 s** | **1.25 s**。1.2 在修正後的預算下對最慢英雄差 25 ms＝差一個 tick | 5.3 驗算 |
| 8 | 「固定 55°+ 俯角」 | **68°**（#161 已改）。地面圓短/長軸 0.927，幾乎正圓 | `CameraRig.ts:36` |
| 9 | 「預告直徑 < 40 px 要退化」 | **方向寫反**。預設 zoom 下中位 AoE ≈ 300 px，吃掉手機四分之三畫面高 | 3.6 節推算 |
| 10 | 「只加 `castTimeSec` 即可」 | **不可**。×0.25 的 CD 乘數會讓 1.2 s 定身變成自殘。必須拆成 `castTimeSec + impactDelaySec` | 4.5(c)、階段 2.5 |

### 10.1b 第三輪覆算（2026-07-23，獨立重跑登錄表）

第三輪把第 4 節的每一格數字用**獨立寫的探針**重算一次（同樣走 `ContentLoader` + `registerAll`），
目的是驗證第二輪自己有沒有算錯。**頭條數字 1.19 s 完全重現**，但抓到兩個表格層級的錯誤：

> ⚠ **下表第 B 列已於第四輪推翻——「更正」本身才是錯的，p90 應維持 6.42。**
> 見 4.1 的紅框與 11.2 第 4 項。A 列的結論（母體標籤要標對）仍然成立，
> 但 76 個子集的中位在最近排名法下是 **5.50**（5.69 是取第 38/39 名平均）。

| # | 第二輪寫的 | 覆算實際 | 處置 |
|---|---|---|---|
| A | 4.1 表標注母體為「**76** 個造成傷害的 ground 技能」 | **標籤錯，數字對**。表中的 min/p10/p25/中位/p75/max **完全重現於 n=85 的母體**（帶 `radius>0` 的技能共 85 個，且 **85 個全部是 ground**；其中 9 個不造成傷害）。縮到 76 個的傷害子集，中位由 5.88 → **5.69**、`d` → 4.01u、門檻 → **1.17 s** | 已在 4.1 改正母體定義，並註明兩種母體只差 0.02 s |
| B | p90 = raw **6.42** → `r_eff` 3.85 → `d` 4.45 → `T` 1.25 | **重現不出來**。n=85 最近排名法 p90 = raw **6.05** → `r_eff` 3.63 → `d` **4.23** → `T` **1.21**（附身 1.31、v=4.0 為 1.51） | 已改正 4.1、4.3、4.4 三處的 p90 列 |

覆算同時**逐條確認**下列第二輪主張為真，不必再查：
`EntityState` 目前 **16 個欄位**（Colyseus 上限 64，加 7 個安全）；`ENTITY_FLAG` 只用到 1..128，
256/512/1024/2048 在 `uint16` 內全空；`apps/game-server/src` **沒有任何 `setPatchRate`** → 確為預設 20 Hz；
117 個 model doc 的 `clipMap` **恰好只有** `idle/run/attack/cast/hurt/death` 六個 key（117/117 全含）；
`castType` 分佈 `targeted 211 / self 194 / skillshot 51 / ground 85 / dash 13`；`castTimeSec > 0` **10/554，最大 0.60**；
`GuardianSystem.ts:352` 確實把 `rules.volleyRadius` **原值**傳進 `applyMark`（不吃 ×0.6）；
`FireRingSystem` 的 `fireRingDamage` 確實已帶 `{id, amount, dmgType:"true", origin:"fireRing", x, z}`，
且 `ratePerSec <= 0` 那行的註解確實是 *grace second: telegraph only, no damage yet*；
`resolveHoldPreview`（#152）**有**乘 `envFactor("abilityRange")`，`VfxSystem.ts:612` **沒有** ⇒ 1.667× 落差成立。

### 10.1c 第三輪的**結構性**補件：幀資料模型（0.5 節）

**前兩輪整份文件完全沒有處理 owner 已拍板的架構決定**（「動作幀跟碰撞幀分開」／快打旋風模型）——
沒有 STARTUP／ACTIVE／RECOVERY 的詞彙、沒有「sim 擁有傷害 tick、渲染器只能對齊」的權威規則、
沒有決定性理由、也沒有接上 #133 `ImpactProfile` 與 `docs/_hitfeel-audit.md` 的既有 sim/client 分界。
本輪新增 **0.5 節**補齊，並往下游串了四處：1.2（每級的幀資料對應）、2.6（`FrameProfile` 內容 schema）、
3.（動畫服從 sim 的警語）、階段 2.5（新增 2.5-E 後搖 lane）。

**其中最重要的不是詞彙，是抓出一個漏掉的機制：`RECOVERY` 今天完全不存在。**
`CastResolveSystem` 在結算那一 tick 就放開施法者，所以**成功閃過一發大招的收益是 0**——
對手沒有付出任何代價。前兩輪把 AGENCY 判為「唯一做對的一隻腳」，那個判定**只對了一半**：
「走出去真的有效」是對的，但「閃掉之後能反打」從來沒有被實作。**沒有後搖的閃躲不是攻防，只是沒被打到。**

### 10.2 原稿漏掉的（已補進正文）

* **減速鏈**（4.3b）：36 個技能給 −40% 移速，中位 AoE 的門檻會從 1.19 s 漲到 1.62 s。
  處置是**遞迴契約**（只有連招第一環要合格），並推出一條 lint：**帶 slow / root / stun 的技能不得留在 A 級**。
* **skillshot（51 個）與普通攻擊**原本沒有分級（1.2 節新增 P 級 / W 級）。
  skillshot 只要 **0.35 s** 就合格（飛行 0.367 s + 只需橫移 1.2u）——**全遊戲最便宜的公平性修補**。
* **可渲染性**（2.1）：Colyseus 用預設 20 Hz patch，直接拿 `castLeft` 畫填充會得到階梯狀圓環。
  規則改成「事件鎖存 + 本機時鐘驅動，snapshot 只校正」。
* **資訊外洩審查**（6.1）：原稿完全沒有。查證結果是**沒有新的洩漏**（無隱形、無假動作、跨區早已全送），
  但補了規則 10（跨區不得產生感官輸出）。
* **幾何權威的既有矛盾**（規則 9）：#152 的 `resolveHoldPreview` **做對了**（有乘 `abilityRange`），
  `VfxSystem.ts:612` **做錯了**。⇒ **今天施法者與受害者看到的圈相差 1.667×。**
* **擊退把人推進章上**（4.5d）：`nav.override` 刻意忽略 root，這是對稱的特性，列出以免日後被「修掉」。
* **與其他任務的實質重疊**（第 8 節）：#147（cast decals）、#105（守護者外觀）、#144（移速還原會改掉 `v_ref`）、
  #56（在 `tools/`，是階段 3 的相依而非只是檔案衝突）。

### 10.3 查證後排除的（不要再花時間，也不要當成待辦）

| 疑慮 | 結論 | 證據 |
|---|---|---|
| 障礙物／邊界會擋住逃生路線 | **排除**。五張競技場各取樣 ~3800 點 × 24 方向，最糟（colosseum）只有 0.6% 的位置無法在任一方向跑完 4.13u；障礙最多的 godie（28 個）只有 0.1% | 4.1 節表格 |
| 火圈的畫面染色會蓋掉預告 | **排除**。`fireRing` 只有 BGM 與 minimap rim，**沒有任何全螢幕 tint 或後製** | 規則 6b |
| 轉身時間會吃掉閃躲窗口 | **排除**。`MovementSystem` 檔頭明文：移動方向立即生效，facing 只是外觀；`turnToward` 不影響位移 | `MovementSystem.ts:14-22` |
| 移動中反向要付減速／再加速 | **排除**。`t.accel` 只在 `!moved` 時歸零，移動中轉向不付成本。**但站著平 A 的近戰每次起跑付滿 33 ms**（已計入 L） | `MovementSystem.ts` 步驟 2 |
| 還有沒被盤點到的傷害來源 | **排除，來源就是 6 個**。`grep -rn "damageQueue.push\|hp\.hp -=" packages/shared/src apps/game-server/src` 的其餘命中全是治療／回復／重生／回合清場（`MatchController` 的 `hp.hp = 0` 是換場歸零，不是傷害） | 規則 6.1 的清單 |
| 移速會隨等級成長，所以後期比較好躲 | **排除**。`growth.ms` 113 個英雄全為 0；裝備只給 +0.23~0.83 的零頭；`combatEnv.moveSpeed = 1.0` | 4.1 節 |
| `targeted` 技能是不是也有 AoE 濺射 | **排除**。201 個造成傷害的 `targeted` **沒有一個帶 `radius`**，全是單體。帶 `radius` 的 76 個全部是 `ground` | 4.1 節母體定義 |


---

## 11. 對抗性複核紀錄（2026-07-23，**第四輪**）

第四輪的唯一問題是：**真的有玩家躲得掉嗎？** 所有數字都用**獨立寫的探針**重跑
（`ContentLoader` + `FsContentSource` + `registerAll`，與 `apps/game-server/src/index.ts:165-166` 同路徑），
不看前幾輪的結論。

### 11.1 重現的（不必再查）

| 主張 | 結果 |
|---|---|
| 554 技能 / 544 個 `castTimeSec = 0` / 最長 0.60 | ✅ 逐字重現 `{"0":544,"0.35":5,"0.6":3,"0.5":1,"0.4":1}` |
| `castType` 分佈 211/194/51/85/13 | ✅ |
| 帶 `radius>0` 共 85 個且**全部**是 `ground` | ✅（其中 76 個造成傷害） |
| 移速 p10 = 5.6、中位 5.9、最慢 4.0、`growth.ms` 全 0 | ✅（≤5.5 的有 10 人） |
| `abilityRange = 0.6`、`cooldown = 0.25` | ✅（注意兩者都在 `multipliers` 底下，讀錯層會拿到 1.0） |
| 延遲預算 8+30+8+0+300+17+30+17+33 = **443 ms ≈ 0.45 s** | ✅ 逐項重算相符 |
| **頭條 1.19 秒** | ✅ 完全重現 |
| 6 個傷害入口 | ✅ 獨立 grep 一致 |
| 8 個 `guardian*` + 3 個 `fireRing*` 不在白名單 | ✅ 事件集合差集重算一致 |
| `EntityState` 16 欄；`ENTITY_FLAG` 只用到 1..128；無 `setPatchRate`；無 stealth | ✅ 全數重現 |
| 拋射物**不追蹤**（`sweptCircleVsCircle` 沿固定 `delta`） | ✅ 走位躲飛彈成立 |

### 11.2 推翻的（正文已改）

| # | 前幾輪主張 | 第四輪實測 | 改在哪 |
|---|---|---|---|
| 1 | 「閃過大招的收益是 0，對手沒付出代價」 | **錯。** 傷害技能冷卻中位 **45 s × 0.25 = 11.25 s**。閃掉 = 對手白付 11 秒 | 0.5.3、4.5(e) |
| 2 | `recoverySec` 是「AGENCY 的第三隻腳／懲罰窗」 | **錯。** 80/113 是 1.6u 近戰；逃完離施法者 4.96–6.88u；後搖不鎖移動 ⇒ 移速 5.9 vs 5.6 **距離永不縮短**；普攻循環 2.0 s。**任何 ≤0.6 s 的後搖都換不到反擊。** 第三隻腳是冷卻 | 0.5.3、4.5(e) |
| 3 | recovery「結算後起算」 | **規格漏洞。** 有引信後施法者會先自由 1 s 再莫名被鎖。改為**自 `castTimeSec` 結束起算** | 0.5.3 |
| 4 | p90 半徑 = 6.05（第三輪的「更正」） | **那次更正本身是錯的。** 最近排名法 = **6.42**（6.05 是 `sorted[75]` ≈ p89.4）⇒ `d` 4.45、`T` **1.25 s**。恢復第二輪原值並明訂百分位法 | 4.1、4.3 |
| 5 | `T_warn = L + d/v` 就是授權值 | **零餘裕 = 擲硬幣。** 加顯式 `M = 0.15 s`（辨別＋選擇反應）；且與 5.3 自己給守護者留 0.25 s 餘裕互相矛盾 | 4.3a、4.4 |
| 6 | P 級 skillshot 起手 **0.35 s** | **拋射物是 snapshot 實體，走 `InterpolationBuffer`，100 ms 拿不回來** ⇒ 用附身式 L=0.55 ⇒ **0.40 s** | 1.2 |
| 7 | 「`CastTracker` 沒用 `ev.tick`」是一行改動 | **是三個消費者。** `GameApp.ts:788-802` 把同一個 `nowMs` 餵給 `vfx` / `views` / `casts`，所以**起手動畫也短了一個單程延遲** | 2.1 |
| 8 | snapshot 校正「每幀最多 ±1 tick」 | 144 Hz 下 = **4.8 倍速快轉**。改為 ≤1 tick / 33 ms 或時間常數 ≥150 ms | 2.1 |
| 9 | 幾何走 `EntityState` + 蓋章時再發 `hazardMark` | **同一個圈兩份表示法、沒有交接規則** ⇒ 重畫／進度歸零。改為 **cast begin 就發 `hazardMark`**（`cast.point` 那時已定），並新增 `hazardCancel` | 2.2、2.5 |
| 10 | 「線寬 0.10u → 0.22u」 | **在指定重用的檔案上做不出來。** `Telegraph.ts:180-186` 的 torus `thickness` 建構時烘死，且 pool 以半徑為 key。必須改平面圓環＋徑向漸層貼圖，或改離散三段並改 pool key | 3.3、3.4 |
| 11 | 傳 `castTimeSec*1000` 當 `fillMs` 就修好 `Telegraph` | **只修了長度、沒修原點。** `Telegraph.ts:270-276` 用 `performance.now()` 的 `age`。要收 `impactAtMs`，由 `(impactTick − MatchState.tick) × TICK_MS` 推得並隨 snapshot 重推 | 3.3 |
| 12 | 「已避開其他 agent 的檔案領域」 | **避不開。** 階段 0/1-B/1-C/2-D/0-D 全在 `apps/client` 底下。切分必須按檔案，`GameApp.ts` 是真正的共用檔 | 8 |
| 13 | #100 是「已知破口」 | **升級為出貨閘。** 灰幕底下仍在扣血 = 展示一個可證明看不見的預告 | 規則 7 |

### 11.3 幀資料分離稽核（0.5.1 的正向檢查）——**通過**

逐項找「渲染器影響傷害時間」的路徑，**全部沒有**：

* 動畫事件回呼驅動命中：`onAnimationGroupEndObservable` 只出現在
  `render/intermission/IntermissionScene.ts:549,662`（商人演出，純裝飾），**戰鬥渲染路徑零命中**。
* 由骨骼／mesh 位置推導判定框：無。所有 `queryOverlap` 都吃 `t.pos` + `t.radius`（sim 資料）。
* 施法在 clip 播完時結算：無。`CastResolveSystem` 只看 `ticksLeft`。
* 貼花生命週期取自動畫長度：`Telegraph` 目前取自 `fillMs` 常數（錯，但不是取自動畫）；
  修法已規定改由 tick 差推得。
* client 端預測傷害：無。`LocalPrediction` 檔頭明寫「for the LOCAL champion only／movement」，
  只走 `orderSystem` + `movementSystem`。

**唯一的既有反例仍然是 `ATTACK_STRIKE_FRACTION = 0.5`，而它的方向是對的**
（動畫去對齊 sim），只是那個 0.5 是猜的、沒有 per-clip 資料。處置見 3.1a。

### 11.4 反向失真稽核（動畫說謊）——**沒通過，這是第四輪最重要的發現**

前三輪只防了「動畫移動傷害 tick」，沒防「動畫演錯時間點」。
`EntityViewRegistry.ts:229-232` 把 cast clip 拉伸**覆蓋整個起手窗**，
所以 clip 自己的出手幀（美術通常在 60–80%）落在起手窗的 60–80%：
**0.6 s 的起手，角色在 0.36–0.48 s 就把招甩出去，傷害 0.60 s 才落地。**
而同一個檔案第 253–254 行的普攻**已經做對了**（`windupMs / ATTACK_STRIKE_FRACTION`）。
完整規格、`castStrikeFraction` 的引入、`PULSE_RATE_MIN/MAX` 夾擠陷阱與
**audition 頁驗收方式**寫在 **3.1a** 與 **階段 0-D**。

### 11.5 查證後排除的（第四輪新增，不要再查）

| 疑慮 | 結論 |
|---|---|
| 事件到達率不足以畫平滑貼花 | **排除。** TCP 可靠保序 + payload 帶絕對 `ev.tick` + `MatchState.tick` 在 wire 上 ⇒ 一次鎖存、本機時鐘驅動即可。20 Hz patch 只用來校正（規則已在 2.1） |
| 本機英雄的插值會讓蓋章幾何對不上自己的身體 | **排除（且對玩家有利）。** `LocalPrediction` 檔頭：本機英雄「at most one tick (33 ms) in the past」。圈畫在當下、身體落後 33 ms ⇒ 玩家以為自己比實際更靠近圈心 ⇒ 多跑一點。不計入 L |
| 火圈會全螢幕染色蓋掉預告 | **排除（複驗）。** `grep grayscale` 全 client 只有 `victoryPresentation.ts:54`、`AbilityBar.tsx:181` 與兩支測試；火圈只有 BGM bed + minimap rim |
| 預告會洩漏潛行者／假動作 | **排除（複驗）。** sim 內無 stealth / invisible / untargetable 的戰鬥機制；施法中再按只回 `"cooldown"`，沒有假動作可洩漏 |
| `hazardMark` 提早到 cast begin 會多洩漏資訊 | **可接受且是需求本身。** 落點在 cast begin 就已在 sim 內確定，提早廣播只是把既有事實告訴受害者；代價是施法者無法「晚一點再瞄」——但那在 sim 裡本來就不可能 |
| 道具被動是額外的無預警傷害 | **排除。** `effects/hooks.ts` 一律搭在已預告的命中上，走同一條 `damageQueue` |
| 障礙物擋住逃生路線 | **排除（沿用第三輪的 5 張競技場 × ~3800 點 × 24 方向掃描，最糟 0.6%）** |

### 11.6 第四輪的總結判斷

**閃躲窗在修正後的數字下是真的，但只有在三件事同時成立時才成立：**
**(1)** `T_warn` 用**含 `M = 0.15` 的公式**授權（中位 1.34 s，不是 1.19 s）；
**(2)** `d > 5.0u` 的技能**縮半徑**而不是加時間（否則 D 級會膨脹到 1.75 s，減速後 2.4 s）；
**(3)** **3.1a 的動畫對齊有做**——否則地面圈誠實、角色身體早 0.2 秒說謊，玩家會照身體做決策。

**而「閃掉之後怎麼辦」這一題的答案不是後搖，是冷卻。**
`combatEnv.cooldown = 0.25` 才是決定「一次成功閃躲值多少」的旋鈕；
`recoverySec` 該做，但它的價值是**給收招動畫一個家**與**擋住預告洗版**，不是懲罰。
