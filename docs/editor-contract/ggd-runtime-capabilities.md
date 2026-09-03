# GGD 遊戲端執行期能力清單（`ggd-runtime-capabilities@1`）

**指紋 `f40f16e4`** —— 編輯器用它 pin base。指紋只在引擎事實真的改變時才會變。

## 這份文件是什麼

它回答**一個**問題：GGD 遊戲端的執行期引擎現在做得到哪些事。每一格都從**出貨的註冊表推導**（effect 處理器表、Zod 的 hook 事件列舉、模板展開器本人），不是手打的清單。

⛔ **最重要的規則**：遊戲端沒有對應 capability 時會回 `unsupported-runtime`，**不會降級成相似但不同的效果**。所以編輯器不可以產出用到「不支援」清單裡任何一項的內容 —— 產出了也不會上線，只會被拒絕。

讀法上的三個約定：

- `§` 開頭的章節編號指的是雙方共有的計畫文件《main_load_editor_plan.md》。
- `#` 加數字是 **GGD 遊戲端的 GitHub issue 編號**，跟編輯器專案自己的編號無關。
- 「佐證」欄是 GGD repo 裡的檔案路徑，只用來讓我們自己被查核；**說明欄本身已經自足**，不需要那個 repo 也讀得懂。

## 1. 計畫點名的 capability 逐筆狀態

狀態有三種：✅ 現在就做得到 · ⚠️ 主要路徑可用但有明講的限制 · ⛔ 做不到。

| 能力 | 狀態 | 出處章節 | 說明（限制／為什麼還沒有） | 佐證 |
|---|---|---|---|---|
| `hook.on-lethal-damage@1` | ⚠️ 部分支援 | §12 G4 · §13「lethal hook 在 death commit 前」 | 攔截點在 `combat/damage.ts` 的護盾之後、扣血之前，符合計畫的「death commit 前」。⚠️ **火圈燒傷是一個要知道的例外，而它現在是一格後台開關**（GH#287）：火圈不走傷害佇列（那條路會帶來每 tick 的浮動數字、擊倒、擊殺歸屬 —— 全都不是環境傷害要的），改走 `combat/environmentalBurn.ts` 這唯一的第二條路，它直接呼叫佇列**自己在用的**`refusesDamage` 與 `lethalSaveFor`。所以：**無敵擋得住火圈**（`invulnerable` 的 `blocksTrueDamage`，無條件），而**免死擋不擋火圈是 `match.fireRing.lethalSaveApplies`**，⛔ **出貨預設關**（＝火圈無視免死，維持今天的行為，等 owner 裁決）。⇒ 寫「受到致命傷害時 ⋯」的卡片時，不要假設它在火圈裡會生效。⚠️ 這一句在 2026-08-08 當天有過一個中間版本寫著「火圈燒傷攔不到 —— 直寫 `hp.hp -=`，無敵也一樣擋不住」，那是寫在 GH#287 落地**之前**的（同 `defense.mana-barrier@1` 那一格）。⭐ 2026-08-09（GH#306）**`surviveHpPct` 現在有兩種語意，而預設是舊的那一種** —— 這是寫免死卡的人一定要讀的一格：`restoreMode:"clamp"`（**省略時的預設**，逐位元等於這一格出現前的每一份文件）＝「這一發最多把你扣到這裡」，所以血**已經低於**地板時一格都不補；`restoreMode:"restore"` ＝ owner 2026-08-09 講死的那一句「到生命 0 以下，**再回到** 20%，不是停在 20%」，是一個**無條件設值**（救完血量 == 地板，與挨打前是 60% 還是 5% 無關）。⛔ 卡片文案寫「免死，並留在 N% 生命」卻沒填 `restoreMode:"restore"` 的話，被磨到剩 5% 血的玩家會被救活在 5% 血 —— 下一發就死，而畫面上跟正常一模一樣。⚠️ 兩種模式**只在血量已經低於地板時**行為不同，所以任何只試「滿血挨一發」的驗證看不出差別。 | packages/shared/src/sim/combat/lethalSave.ts + lethalSave.test.ts（`restoreMode` 那一條真的用**兩個起始血量**跑同一發致命傷，斷言兩者落在同一格血量；只驗高於地板的那一邊，三種實作都會過） |
| `effect.charge-ledger@1` | ✅ 支援 | §12 G4 · §13「十二道試煉的 ledger 跨 round 不跨 match」 | — | packages/shared/src/sim/marks.ts（具名標記：count/spent/expiresAtTick/resetOn）。`resetOn:"match"` 就是計畫要的「跨 round 不跨 match」——`SimWorld` 一場比賽一個。 |
| `hook.on-evade@1` | ⚠️ 部分支援 | §7 P1 · §12 G4 | 事件會發到**閃掉的那一方**（`WorldHookSystem` 的 actorKey=target），符合計畫的 defender hook。⛔ 尚未區分「真閃避」與「attacker fumble」，計畫 §13 要求 fumble 零次 —— 這一格還沒守。 | packages/shared/src/sim/systems/WorldHookSystem.ts + worldHook.test.ts |
| `hook.on-ability-hit@1` | ✅ 支援 | §2.1.1（配合 condition.target-status@1） | — | content/schema/effects/_hook.ts 的 zHookEvent |
| `effect.modify-cooldown@1` | ✅ 支援 | §12 G4 | — | packages/shared/src/sim/effects/modifyCooldown.ts（`slot` 或 `abilityId` 指名一支；`reduce`/`reduceFlat`/`reset` 三種模式，`basis` 決定百分比的分母是剩餘量還是基礎冷卻）。⭐ 2026-08-10（S3）多一條路：`target` 決定縮短的是**技能槽位**（`abilitySlot`，省略時的預設＝這個 kind 在此之前的全部行為）還是**觸發器的內部冷卻**（`hookInternalCooldown` ——「重置某個 proc 的 ICD」，`hookKey` 比對 `HookDef.key`，`hookScope` 決定只碰觸發這一發的那一份來源（`originSource`，預設，較窄）還是身上全部來源（`allSources`，此時 `hookKey` 必填）)。⚠️ `hookScope:"originSource"` 只認得 `origin` 是 `hook:…` 的呼叫 —— 從**施放**跑出來的`modifyCooldown`（`origin` 是 `ability:…`）不屬於任何一份來源，那條路下什麼都不會發生，而且是**靜默**的：要從施放去重置 proc，請用 `allSources` + `hookKey`。守衛 packages/shared/src/sim/effects/lane1Kinds.test.ts + hookFamily.test.ts。 |
| `effect.execute@1` | ⚠️ 部分支援 | §12 G4 · §16.13 · §5「待確認 14」 | 計畫 §160 的最低契約有五項，`devour` 拿到三項：① **typed threshold** ✅ `thresholdPctOfMax` 是逐階陣列（3/5/7/9% 就是四格）；② **hero-only** ✅ `victim: "champion" \| "any"` 是欄位；③ **kill credit** ✅ 它不寫 `hp = 0`，而是推一發 `type:"true"` 進 `world.damageQueue`，所以擊殺賞金 / `onKill` / 掉金幣 / 擊殺語音 / MVP 統計全部走出貨的那一條路。⛔ 缺的兩項，寫技能的人一定會撞到：④ **回復 basis 不是欄位** —— 固定讀施法瞬間的 `hp.hp`（cast-commit 快照），而計畫 §16.13 要問的「讀 cast commit 前還是實際 hpLost」今天只有一個答案且寫死；`healPct` 只是**倍率**，不是 basis。⑤ **invulnerable interaction 沒有欄位** —— 因為走傷害佇列，`refusesDamage` 會讓無敵目標**靜默吞不掉**（既沒有 `pierceInvulnerable`，也沒有「被擋下了」的回饋）。⚠️ 另外它是**吞噬風味**的處決不是中性 primitive：`healPct` 省略 = 1，要純處決得明寫 `healPct: 0`。 | packages/shared/src/sim/effects/devour.ts + devour.test.ts（護盾那條驗過 `throughShields`：致死量含當下吃得到的護盾，否則「即死」會被護盾靜默擋掉） |
| `effect.weighted-branch@1` | ⚠️ 部分支援 | §12 G4 · §16.14（俄羅斯輪盤） | 機制已出貨：一次施放**只 draw 一次** `world.rng`（計畫 §13 的決定性要求），分支各帶自己的 `weight` 與 `effects[]`，總權重 0 在載入時就被擋下。⛔ 但 §16.14 的**機率表語意尚未 owner freeze**（1/6 是「每次獨立」還是「六發彈倉」），所以 importer 在 freeze 之前仍應拒絕 89-002 那一類文件 —— 引擎做得到，規格還沒定。 | packages/shared/src/sim/effects/weightedBranch.ts + lane1Kinds.test.ts（「只抽一次」做過突變驗證） |
| `effect.swap-resource@1` | ✅ 支援 | §12 G4 · §16.16（交換筆記本） | — | packages/shared/src/sim/effects/swapResource.ts —— 依 §16.16 的建議實作：resolve tick 原子交換，各自 clamp 到 [clampMin, 自己的上限]，目標失效預設整招失敗。三個決策點（`resource` / `clampMin` / `onInvalidTarget`）都是欄位，所以 owner 之後改語意不必改程式。 |
| `defense.mana-barrier@1` | ⚠️ 部分支援 | §12 G4 | primitive 已出貨（`manaBarrier`）：`manaBarrierCutFor` 在**扣血之前**把傷害換成扣魔 —— ⛔ 不是受傷後補護盾，魔力真的被扣、期間回的魔力真的會變成新的抵擋量。計畫點名的兩格都在：`perMana` 就是 damage-to-MP ratio，remainder 由函式回傳（抵不完的部分原封不動往下走進 免死 → 血條）。**四個**決策點都是欄位（`perMana` / `damageTypes` **必填明列** / `minManaReserve` / `durationSec`）。⭐ 2026-08-09（GH#307）`durationSec` 改成**選填**：省略 = **常駐**（沒有到期 tick），填數字 = 到期或魔力耗盡先到的那個停。⛔ 兩種寫法的**強制停止都是魔力耗盡** ——魔力見底時屏障是真的被**拔掉**（`detachSource`），不是「這一發抵 0」，否則常駐的那一半永遠不會結束（owner 2026-08-09 明說「共同的強制停止都是魔力耗盡」）。接線**已經接上**（`combat/damage.ts`，護盾池之後、免死之前）—— 44-00 掛上去就會擋。⚠️ 這一句在 2026-08-08 當天有過一個中間版本寫著「接線還沒接」，那是寫在接線落地**之前**的；留這句話在這裡是因為它示範了這份清單最危險的失效方式：守衛只檢查 caveat 是不是空字串，**從不讀它的內容**，所以一句過期的散文可以把一個已經可用的機制擋在門外，而且什麼都不會紅（見檔頭③與 GH#291 的同型）。 | packages/shared/src/sim/effects/manaBarrier.ts + lane2Kinds.test.ts |
| `effect.control-restriction@1` | ⛔ 不支援 | §12 G4 | `applyStatus` 目前有 root / stun / silenced / berserk / feared / disarmed 六個獨立布林（`feared` 是 2026-08-08 為 89-002 俄羅斯輪盤與 52-02/04/002 加的，`disarmed` 是 2026-08-10 的 S8），但**沒有可組合的 typed 控制限制模型** —— 每多一種控制就多一個布林，而「這個狀態擋住哪幾種行為」散落在各個消費端的 if 裡，不是一張表。⚠️ 所以這一列停在 `unsupported` 是**對的**，但它的 `nearestExisting` 才是對方要讀的那一半：六個布林各自都是能用的，⛔ 不要因為這一列寫 unsupported 就繞開它們。 | — |
| `scheduler.random-area@1` | ⚠️ 部分支援 | §12 G4 | 排程器已出貨（`randomArea`），而且 §13 要的 draw 預算模型是**明確**的：一次施放固定花 `2 × count` 次 `world.rng.next()`，**全部在施法那一刻抽完** —— 所以「這一波抽了幾次」不受場上人數、也不受它有沒有被打斷影響。到期是**絕對 tick**；方形→圓形用 elliptical grid mapping（`sim/**` 禁三角函式）。接線**已經接上**：`randomAreaSystem` 掛在 `SimWorld.step()` 的 slot 7e（`combatResolveSystem` 之前），13-04 / 70-04 排得出來也落得下去。（同 `effect.mana-barrier@1`：這一句 2026-08-08 當天曾寫著「接線還沒接」而接線就在那裡。）⚠️ `content/templates/expand.ts` 的 `random-barrage` 那 8 張卡**仍然走 `dot`**，遷移到這個 kind 是獨立的一批。 | packages/shared/src/sim/effects/randomArea.ts + lane2Kinds.test.ts（draw 預算做過突變驗證） |
| `effect.extend-buff-on-damage@1` | ✅ 支援 | §12 G4（2026-08-08 覆蓋矩陣 X20：52-01 狂戰士之怒） | — | packages/shared/src/sim/effects/extendBuff.ts —— 「期間每承受自身最大生命 5% 的傷害，延長 2 秒」。⭐ **無狀態**：延長量是這一發傷害的連續比例（總量與階梯式相同），所以不需要累積器、不需要任何新的 SimWorld 欄位，也**不需要任何接線**。`maxRemainingSec` 是**必填**：這條是正回饋（挨越多、越久），沒有上界會變成永久，而症狀是「這個回合打不完」——一個不會讓任何測試變紅的故障。⚠️ 現有詞彙**組不出來**（逐條查過）：`applyBuff.stackKey` 寫的是「重設到滿」不是「延長」，而 `condition@1` 的葉子與 `HookDef` 的過濾器沒有任何一格讀得到「剛剛那一下打了多少」。 |
| `effect.event-value-conversion@1` | ⚠️ 部分支援 | §12 G4 · §16.12（太陰道） | 機制已出貨：來源可選 `incomingDamage`（讀 `EffectContext.incoming`）或 `targetCurrentHealth`（59-01 吞噬的「等同其剩餘生命」），轉成 mana / health，並可順帶給一段限時屬性加成（15-002 太陰道的「短暫加成至 AP」）。⛔ 但 §16.12 的**基數 `raw \| mitigated \| hpLost` 尚未 owner freeze** —— 所以它是一格欄位，出貨預設 `mitigated`（與 `damage.incomingPct.basis` 同一句話）。freeze 之後只要改預設值，不必改程式。 | packages/shared/src/sim/effects/eventValueConversion.ts + lane1Kinds.test.ts |
| `hook.consume-policy@1` | ⚠️ 部分支援 | §2.1.1.2（雷天大壯「施放技能後的下一次普攻」）· §12 G4 | ⭐ **執行面已經落地**（2026-08-10 Lane 3 / S6，這一句前一版寫的是「只有欄位，引擎還沒讀」而那已經不成立 —— 第三守則）。`sim/effects/hooks.ts` 的額度閘坐在**內部冷卻閘與機率骰之前**（與 `victim` / `damageSource` 同一族的 rng-FREE 過濾），所以一條額度用完的 hook **不燒 ICD、不動 seed**。扣帳走 `ModifierSource.hookFireCount` / `hookFireCountByTarget`（依 `hooks[hi]` 位置索引）。⚠️ 仍然是 `partial`，剩下的限制只有一個：`consumeOn` 只有 `"fire"`（見下）。⛔ **不可以**改用 `internalCooldown` 近似成「每 N 秒一次」：攻速快的英雄會**多觸發**、慢的會**漏觸發**，而兩種錯法在畫面上都看不出來（只是偶爾多打或少打一下）—— 那是**時間**界，這一族要的是**次數**界。⚠️ `consumeOn` 今天刻意只有 `"fire"` 一個值：`"hit"`（下游真的打到人才算）需要把扣帳搬到傷害落地那條路，那是第二條接線，⛔ 不先開一個接不到的選項。 | packages/shared/src/content/schema/effects/_hook.ts（zHookDefBase）+ packages/shared/src/sim/effects/hooks.ts（額度閘 + consumeTrigger + detachSource）+ packages/shared/src/sim/effects/lane3Kinds.test.ts |
| `hook.on-reflect-success@1` | ⚠️ 部分支援 | §2.1.1 · §12 G4 · §13 | 事件與 provenance 都出貨了：判準是「一發 `reflectDepth > 0` 的封包**真的落地**」，hook 的持有者＝**防禦者**、`target`＝**攻擊者**，而 `EffectContext.incoming` 是**那一發反彈封包自己的** `TriggerDamage`（raw / mitigated / hpLost 三個讀數都是真值），所以 20-002「每次造成 7 倍[反彈]傷害」寫得出來 —— 用 `damage.incomingPct`。⚠️ 兩個限制，寫技能的人一定會撞到：① 那一發的 `reflectDepth` 已經是 1，child chain 的 `incomingPct` 要一起寫 `maxChainDepth: 1`，否則被鏈深閘擋掉（那是終止性，不是 bug）；② ⭐ 2026-08-09 已解除：`INCOMING_PCT_MAX` 從 5 抬到 **10**，所以「7 倍」現在直接寫成 `perRank: [7]`，不必再靠 `amount` 那一項補。（在此之前那條上界自稱是「打錯數字的守衛」卻擋住了 owner 的文案 —— 護欄裝在錯的位置；10 仍然擋得住「200 打在該寫 2.00 的格子裡」。）⛔ 計畫 §2.1.1 四項 provenance 裡的**原傷害**沒有進 payload：`TriggerDamage` 是封閉型別，而同一個 tick、同一個持有者的 `onDamageTaken` 已經帶著它 —— 再塞一份進來就是第二個真相。要「原傷害的百分比」請掛在 `onDamageTaken` 上。 | packages/shared/src/sim/combat/damage.ts（push 點）+ packages/shared/src/sim/systems/ReflectHookSystem.ts（dispatch）；守衛 reflectHook.test.ts（不該發的時候不發）+ reflectSuccessProvenance.test.ts（provenance 到得了 child chain，且交給它的是反彈傷害不是原傷害；三個突變都驗過） |
| `effect.target-set-chain@1` | ⚠️ 部分支援 | §6 P1 · §12 G4 | `damageArea` / `damageLine` 現在把**自己解出來、`victimCondition` 過濾完、`maxTargets` 切完**的那一組人當成 `ctx.targets` 交給 `onHitTargets`（`onHitTargetsMode` 決定整群一次 batch 還是一個一個 perTarget；下游若是圓／線那類自己解幾何的 kind，batch 只會炸出一個圈）。`runOnEmptyHit` 決定一個人都沒打到時要不要照樣跑（預設不跑）。⛔ 仍然**不是**計畫要的『兩個具名 target set 同一 tick 並存』：`ctx.targets` 只有一個，所以「ally selector 回 MP、enemy selector 造成傷害」還是只能靠後者覆寫前者 —— 要兩組並存請維持 `unsupported-runtime`。 | packages/shared/src/sim/effects/victimFilter.ts（`selectVictims` + `runOnHitChain`，兩個 kind 共用一支模板）；守衛 areaVictimChain.test.ts（下游收到的是真的挨打的那群人而不是上游的震央；突變驗過會紅） |
| `effect.attack-dash@1` | ⛔ 不支援 | §2.1.1 | 「每次普攻向目標短距離衝刺」需要 collision + target invalidation + exactly-once，`dash` kind 三者都沒有。 | — |
| `effect.dash-on-end@1` | ✅ 支援 | §2.1.1 P1（條件式）· §16.7 | — | packages/shared/src/sim/effects/dashOnEnd.ts（`dashOnEndSystem`，掛在 `SimWorld.step()` 的 slot 5′）+ lane3Kinds.test.ts 的三臂量測 |
| `state.exclusive-group@1` | ⚠️ 部分支援 | §12 G4 · §16.15（涅吉三形態） | ✅ 15-02/03/04 逐字寫的「([變身]為唯一狀態不可疊加)」**對變身成立，而且是結構性的**：一個實體只有一格形態、一個身體只有一個 `championId`，所以第二個形態不可能與第一個並存 —— ⛔ 技能文件**不需要、也不應該**自己檢查「我是不是已經變身了」。重複進入時「舊形態的剩餘時間怎麼辦」是欄位（`champion@1.transform.reenter`：`restart` / `keepLongest` / `reject`），預設 = 出貨現況，被回絕會走 `castRejected`。⭐ 2026-08-10（G5）：**泛化的互斥狀態群落地了** —— 這一句前一版寫的是「沒有『這三個 buff 互斥』的模型」，那已經不成立（第三守則）。`applyBuff.exclusiveGroup` 是一個自由字串群名，掛上之前先掃 `sc.sources`：同組且未過期的舊來源整份卸下（`exclusiveOnExisting:"replace"`，省略時的預設，形狀抄 `shield.onExisting`）或整發不掛（`"reject"`）。所以 15-02/03/04 逐字寫的「[變身]為唯一狀態不可疊加」在**數值那一層**已經成立：三個形態的移速倍率／攻速％／普攻附加傷害不會再連乘（⛔ 技能文件仍然不需要自己檢查）。⚠️ 它作用在 **gameplay state（buff source）** 這一層，⛔ **不可以拿它假裝三個 3D 形態** —— 那是下面 ② 的事，而 ② 還沒解。⛔ 仍缺一件，**涅吉三形態的「三個身體」今天仍然表達不出來**：② **一個英雄只有一個 `transform.counterpartId`**，而 `championForm` effect 的 `to` 只有`alternate`/`base`/`toggle`，沒有「變成指定的那一個形態」—— 所以第二個**不同**的形態根本不是目的地：再施放一次只會刷新當前形態（WC3 Metamorphosis 的語意，刻意保留）。⚠️ 它卡在計畫 §16.15 還沒裁決「三個 gameplay state 還是三個 3D body」——⛔ 在那之前不要把三形態降級成三個獨立變身，那會是一個**看起來**能用的錯誤答案。（那個裁決**不會**再回頭改 `exclusiveGroup` 那一層：數值互斥與身體選擇是兩件事。） | packages/shared/src/sim/systems/ChampionFormSystem.ts + sim/championFormExclusive.test.ts（四個突變都驗過會紅：拿掉 `sc.championId` 的寫入、`championForm.set` 改成不覆寫、拿掉 `keepLongest`、拿掉整個 `reject` 分支）；泛化互斥群在 packages/shared/src/sim/effects/applyBuff.ts::enforceExclusiveGroup + sim/exclusiveDisarmNegate.test.ts（同一次執行裡比四臂：互斥 / 只掛一份 / 不填 group 仍然相乘 / reject） |
| `state.lifecycle@1` | ⚠️ 部分支援 | §12 G4（與 `state.exclusive-group@1` 同一列）· §13「風王結界手動關閉與 MP 不足自動關閉都走同一個 onExit child」 | ✅ 計畫 §13 逐字要求的那一條**已經成立**：`exitToggle()` 是全專案唯一的關閉出口，手動關閉（`castAbility` 第二次按下，刻意排在冷卻閘之前）與 MP 不足自動關閉（`toggleUpkeepSystem`）都只是呼叫它，所以「關閉時釋放風王鐵槌」不可能只發生一半。開關成本（`ability@1.manaCost`）與維持成本（`toggle.upkeepCost`）是兩個獨立數列，節奏 `none`/`perAttack`/`perSecond` 是欄位。⭐ 2026-08-10（G13-2）：`toggle.whileOn` 落地 —— 開著的期間掛一份**被動區塊**（重用 `AbilityPassive`，⛔ 不是第二份 `EffectDef[]`），走的是 `abilityPassives.ts` 那**同一份**程式（形態閘／六種授予轉發／四個強化面只有一份）。attach 掛在 `enterToggle`、detach 掛在`exitToggle`，所以手動關閉與 MP 不足自動關閉都一定卸得掉；`whileOnDuringExit` 只決定卸下與`onExit` 的**順序**，不決定會不會卸下。⚠️ 已知邊界：開著的時候升級**不換 rank**（加成停在開啟當下那一階）。⛔ 仍缺三件：① **stable state key** —— 一顆按鈕一個切換；「這幾個狀態互斥」現在寫得出來了（`applyBuff.exclusiveGroup`，見 `state.exclusive-group@1`），但那是**buff 層**的互斥，切換本身沒有群的概念；② **duration / refresh policy** —— 切換沒有自帶時限，要限時請用 `applyBuff`；③ **死亡不觸發 onExit** —— 屍體不付維持成本但旗標留著，「大招要不要從屍體放出來」是一個還沒裁決的決策點，⛔ 不可以在遊戲端偷開第二條出口去補它。 | packages/shared/src/sim/abilities/toggle.ts + toggle.test.ts（三個突變都驗過會紅：拿掉自動關閉、拿掉 perAttack 節奏閘、拿掉 onExit 的 runEffects） |
| `condition.has-equipment@1` | ✅ 支援 | §2.1.1.2（77-002 御雷劍）· §12 G4 | — | packages/shared/src/content/schema/condition.ts 的 `zEquipmentItemLeaf` / `zEquipmentTagLeaf`（⭐ 一個 UNION 而不是一個帶兩個 optional 欄位的物件，所以 `{itemId, tag}` 同時寫是 **PARSE ERROR**，不會安靜地由求值端替作者決定哪一格贏）+ packages/shared/src/sim/content/condition.ts 的求值與中文標籤。✅ 計畫要的「只接穩定 itemId、禁止用顯示名稱連結」成立：`itemId` 走 `zRef<ItemId>("items")`。⚠️ 對方要知道的一件事：那個 ref 是 **soft**（御雷劍那一族的道具文件還沒進 `content/items/`），所以打錯的 itemId **不會在載入時被擋**，它只是永遠不成立。 |
| `condition.stack-count@1` | ⚠️ 部分支援 | §2.1.1.2（層數門檻）· §12 G4 · GH#301-5 | ✅ 寫得出來的是「某個主體身上的**某一份狀態**疊到 ≥N 層」：`{kind:"status", subject, statusId, minStacks:N}`（缺 `minStacks` = 只問有無，與這一格出現前逐字相同）。層數由 `applyStatus.stacks` 寫入、多來源相加、上界 `MARK_MAX_COUNT`(999)。⛔ 三件**還不行**，不要繞：① 讀不到 `sim/marks.ts` 的具名標記池（`effect.charge-ledger@1` 那一套的 `count`/`spent`）——那是另一個池子。⚠️ **但「`minStacks` 只看 `StatusComp`」這句話 2026-08-10 起不成立了**（第三守則）：G10 之後 `statusStacks` 讀**三本帳** —— `StatusComp.effects`、`world.marks`，以及帶 `statusId` 的 `ModifierSource`（`applyBuff.statusId`：標記與數值變成同一個物件，所以到期／淨化／卸下只有一條路，`extendBuff` 一行都不用改就把標記一起延長了）。→ 對方要「破甲同時是狀態也是數值」時，寫 **一發** `applyBuff{stackKey, statusId, modifiers}`，⛔ 不要拆成 `applyStatus` + `applyBuff` 兩份 —— 拆了的那一份 `extendBuff` 只延長得到後者；② `tag` 那個分支**刻意沒有** `minStacks`（「【破甲】類的狀態合計幾層」沒有人定義過語意，所以它是 PARSE ERROR 而不是由求值端替作者猜）；③ 只有「≥」一種比較 —— 「剛好 N 層」「至多 N 層」寫不出來（後者用 `not` 包一個 `minStacks:N+1`）。⚠️ 還有一件對方一定要知道的：出貨的 28 份狀態文件**沒有一份**寫 `stacks`，而 `applyStatus` 只在作者明寫 `stacks` 時才累加 —— 所以對既有狀態問 `minStacks:2` 永遠是 false，那不是壞掉，是那些狀態根本不疊層。 | packages/shared/src/content/schema/condition.ts 的 `zStatusIdLeaf.minStacks` + packages/shared/src/sim/content/condition.ts 的求值（走 `statusStacks`）與中文標籤。 |
| `condition.ability-state@1` | ⛔ 不支援 | §2.1.1.2（哥哥、絕。暗殺奧義、虛化）· §12 G4 | 「某支技能正在冷卻 / 已學會 / 正在開啟」問不出來 —— `zConditionLeaf` 沒有這一種葉。⛔ 禁止以技能顯示名稱（「哥哥」「千年練成」）連結（計畫 §2.1.1.2 逐字）。 | — |
| `ability-augment@1` | ⚠️ 部分支援 | §2.1.1 P1 · §12 G4 · §13 | ✅ 計畫 §4.4 的兩條禁令都守住了：目標是 **exact ability ref**（`zRef("abilities")`，不是槽位、不是名稱文字），操作是一個 **allowlist enum** —— `procChance`（改機率）/ `durationSec`（改持續時間）/ `damageCoeffAp`（加 AP 傷害係數）/ `thresholdPct`（改門檻），四個剛好對上四支出貨卡（77-002 / 77-002 / 70-002 / 59-001）加上 `modifierValue`（改一條 `StatModifier` 的數值，必填 `stat`），⛔ 沒有位置 JSON Pointer。每個 op 的 `value` **兩端都有界**（`AUGMENT_OP_BOUNDS`），`mode` 只有 `set` / `add`。**fail closed 在載入時**：目標指不到就 `DanglingRefError`（`content/refs.ts::abilityRefs` 推的是**硬** ref edge），不是執行期靜默跳過；`thresholdPct` 另外強制填 `nodeKind`，那一格就是 §13「不得套到相鄰效果」的閘（一棵 condition 樹裡通常不只一個 `value`）。⭐ 2026-08-10：**四個面全部接上了** —— `scope` 那一格（`all` 預設 / `hooks` / `effects` / `grants`）決定一條操作打得到 hook 的 `chance` 與 hook 效果樹、主動施放的 `def.effects`（`castAbility` 與 `CastResolveSystem` 兩個入口都問）、來源授予的 `critStrike.chance`，或 passive 區塊的 `modifiers`（`modifierValue`，只有預設的 `all` 打得到）。`AugmentTarget.condition` 也讀了（77-002「裝備了某類道具時」；求值主體只有 `self`，所以 `subject:"target"` 的葉子恆為假）。⛔ 仍缺兩件，寫技能的人一定會撞到：① **這一版是執行期，不是編譯期** —— 計畫要的 reverse dependency closure 重編需要一個住在 `content/registries.ts` 的 compiler。現在是「組出那一份 clone 的前一刻」讀 augment 表再算（**可觀測等價**：同一組 ops、同一個目標解析、同一份界），但沒有 closure、不遞迴（強化一支自己也被強化的技能不成立）；② **`nodeKind` 是自由字串**（condition 的 kind 表住在另一份 schema，抄過來就是第二份會過期的真相），所以打錯字 = 那條操作匹配不到任何節點、靜默無效。⛔ 不要假裝它會紅。 | packages/shared/src/sim/abilities/abilityAugment.ts（收集 + 純改寫 + `opHitsSurface` 是全 sim 唯一讀 `scope` 的地方）；四個 seam：abilityPassives.ts::rankBlock（hooks / modifiers / grants）、abilitySystem.ts::castAbility 與 systems/CastResolveSystem.ts（effects）；守衛 packages/shared/src/sim/abilities/abilityAugment.test.ts（被動那一面）+ abilityAugmentCastAndScope.test.ts（主動施放那一面，突變驗過會紅） |
| `defense.block-source@1` | ⚠️ 部分支援 | §2.1.1 P1 · §12 G4 | `BlockGrant`（含 `lethalOnly` / `lethalBasis` / `internalCooldown` / 鏈式獨立判定）已出貨且時序正確（`mitigate()` 之後、護盾之前）。⭐ 2026-08-09（owner #299 第 6 條「授權格要放寬」）之後寫入點有**四個**：道具（`economy/itemSource.ts`）、**技能被動**（`ability@1.passive.ranks[].block`，配 `whileForm` 就寫得出「卍解狀態下才格擋」）、**三選一增益卡**（`augment@1.block`）、以及 **`applyBuff.block`**（限時授予 ——「接下來 5 秒內格擋」，同時也是**主動技能**那一格的答案：⛔ 不需要新的 effect kind）。四者走同一個 `ModifierSource.block`（`blockCutFor` 不看 `kind`），所以鏈式判定與型別過濾逐條相同；轉發只有一份（`sim/stats/sourceGrants.ts`）。⛔ 仍然缺的是**「格擋的那一刻」這個時機** —— 擋下來不會觸發任何 hook。⚠️ 另外 `internalCooldown` 的記帳住在 source 上，而技能被動的 source 在升級 / EX 解鎖 /變身時會 detach + attach、`applyBuff` 每次施放都是新的 source，等於冷卻歸零；後者的正確讀法是「這一次施放最多擋幾次」。出貨的兩支技能格擋都沒有 ICD，所以今天不可觀測。 | packages/shared/src/sim/combat/blockFromPassive.test.ts + packages/shared/src/sim/stats/sourceGrants.test.ts（四個授權面，四個突變都驗過會紅） |
| `effect.convert-hit-damage-type@1` | ⚠️ 部分支援 | §2.1.1 P1 · §12 G4 | `damageTypeOverride` 能轉換傷害型別且有 `impactGateType` 處理擊倒閘，但計畫要的是「以逐級機率把**該次普攻**完整轉成真傷」—— 逐級機率那一格沒有。⛔ 不可以改成「另外補一段真傷」，那是不同的東西（計畫 §2.1.1 明列）。⭐ 2026-08-09（G7）之後寫入點與 `defense.block-source@1` 一樣有**四個**：道具、`ability@1.passive.ranks[].damageTypeOverride`、`augment@1.damageTypeOverride`、以及 `applyBuff.damageTypeOverride`（限時 ——「接下來 5 秒你的普攻是真傷」，到期走那份 buff 自己的 `expiresAtTick`，⛔ 不需要新的 effect kind）。同一批也把**三圍授予**（`attributes`）放寬到同樣四個面。四者走同一個 `ModifierSource` 欄位（`resolveDamageConversion` / `sourceAttrGrants` 都不看 `kind`），轉發只有一份（`sim/stats/sourceGrants.ts`）。 | packages/shared/src/sim/combat/damageTypeOverride.ts + packages/shared/src/sim/stats/sourceGrants.test.ts（授權格與轉發表逐鍵對齊，兩個突變都驗過會紅） |
| `effect.delayed-sequence@1` | ⚠️ 部分支援 | 計畫未點名（Lane 3 / G12：20-002 連續七次斬擊 · 52-002 連續 100 下） | ✅ 機制已出貨並接線（`SimWorld.step()` 的 7e′，排在 `combatResolveSystem` 之前，所以這一 tick 落下的一刀在**同一個 tick** 被減傷、被護盾吃、被記分、被結算）。⭐ 它**完全不碰 rng**（沒有落點要抽），所以一次施放推進亂數流 0 步 —— ⛔ 不必像 `scheduler.random-area@1` 那樣去算 draw 預算。排程是**絕對 tick**。⛔ 四個邊界，寫技能的人一定會撞到：① **發數有硬上界**（`sim/effects/kindLimits.ts::DELAYED_MAX_COUNT`，今天是 32）——52-002 的「連續 100 下」**寫不到 100**，schema 在載入時就拒絕，⛔ 不要靠疊兩發 `delayed` 去湊，那會變成兩串各自獨立的排程（`finalEffects` 也會跑兩次）；② **間隔被夾成至少 1 tick** —— 0.001 秒與一個 tick 在 30Hz 下是同一件事，所以「瞬間 32 連擊」拿不到，那是刻意的（整波塞進同一 tick 正是這個 kind 要修的症狀）；③ `finalEffects` 是**追加**不是取代（省略 = 最後一發與其餘完全相同，⛔ 不是「最後一發不跑」）；④ 三個會讓整串**提前停掉**的情境是欄位或規則，不是 bug：目標死亡（`dropDeadTargets`，預設跳過）、施法者死亡（`stopOnCasterDeath`，**預設繼續**）、以及該分區的決鬥已經結束（`settledZones`，⛔ 不可調 —— 回合結束後還在扣血是玩家看得見的缺陷）。⚠️ payload 在**施法那一刻烘焙**（同 `randomArea.effects` / `leap.onLand`），所以第七刀用的是施法時的 `comboBonus`，不是落地當下的。 | packages/shared/src/sim/effects/delayed.ts（`delayedEffect` + `delayedSystem`）+ packages/shared/src/content/schema/effects/delayed.ts + packages/shared/src/sim/effects/lane3Kinds.test.ts（「名單在施放那一刻凍住，而且分散在不同的 tick 上落下」） |
| `effect.proxy-cast@1` | ⚠️ 部分支援 | 計畫未點名（Lane 3 / S5：80-04 赤兔咆哮「攻擊時有 20% 機率使出弒鬼神」） | ✅ 代放走的是**目標技能自己的 payload**，所以改 80-02 就等於改 80-04 觸發的那一發。`payCosts`（`none` 預設 / `mana` / `manaAndCooldown`）決定要不要付代價，後兩者走 `castAbility` 的**同一排閘**（魔力／沉默／暈眩／擊倒／暴走／學過沒有／已在吟唱），⛔ 不是在這裡重寫一次那些 if。⛔ 四個邊界，寫技能的人一定會撞到：① **鏈深上界**（`sim/effects/kindLimits.ts::PROXY_MAX_CHAIN_DEPTH`，今天是 3），而 `maxDepth` **省略時是 0** —— 被代放的技能自己的代放直接被擋，那是終止性不是 bug；② `abilityId` 是**軟參照**（代放一支還沒上架的技能不會讓內容載入失敗），代價是**打錯的 id 不會在載入時被擋**，它只是永遠什麼都不發生 —— ⛔ 不要假裝它會紅；③ 三個預設值是**刻意**的，改之前先想一遍：不付冷卻（`payCosts:"none"`）、不看那一格的冷卻（`respectCooldown` 省略 = 冷卻中照樣代放）、要求已學會（`requireLearned` 省略 = 沒點那一招時什麼都不發生）。⚠️ 一個每次普攻都可能觸發的 proc 若改成 `manaAndCooldown`，那支大招就會**自己把自己鎖住**，而畫面上只看得到「W 一直是灰的」；④ `slot` 與 `abilityId` **恰好填一個**（superRefine 擋，不是由求值端替作者挑）；代放的主詞永遠是**施法者自己**，⛔ 不會去掃 registry 找「誰有這支」。 | packages/shared/src/sim/effects/proxyCast.ts（雙載體深度：`EffectContext.proxyDepth` ＋呼叫堆疊上的 `proxyStackDepth`，閘門讀兩者最大值，所以混著走的鏈也停得下來）+ packages/shared/src/content/schema/effects/proxyCast.ts + packages/shared/src/sim/effects/lane3Kinds.test.ts（「代放的是那一支技能自己的 payload，而且鏈一定會停」） |
| `grant.type-streak-immunity@1` | ⚠️ 部分支援 | [EX∅ 根源] 史萊姆裝（owner 2026-08-18：「連續受到 2 次同型別傷害後免疫該型別」） | ⛔ 四個邊界，寫這種卡的人一定會撞到：① `damageTypes` **必填**且是雙向的 —— **沒被列進去的傷害型別既不累計也不打斷連擊**。所以「只列 physical/magic」的卡，火圈真傷（#270）照樣燒得到你，但也不會替敵人洗掉你的物理連擊；② **被免疫擋掉的那一發不會被記進連擊** ⇒ 連擊**凍結在門檻上**，免疫一直持續到來了另一種被列進 `damageTypes` 的傷害為止 —— 那是這件寶具唯一的破解方式，⛔ 不是 bug，但它必須印在卡片上，否則玩家不知道自己為什麼打不動；③ `streakTimeoutSec` **省略 = 連擊在這一回合內永不逾時**，⛔ 但**不會跨回合**（`sim/clearPools.ts::clearRoundScoped` 在 host 的 `enterCombat()` 逐席位把連擊表歸零，owner 2026-08-18：「的確不應該跨回合殘留」）。回合**內**要不要有時鐘仍然由這一格決定 ——省略它，面對一波純物理的敵人就是整回合免疫，而 `zInvulnerable.durationSec` 已經寫過「an unbounded immunity is an unwinnable round」。⭐ 出貨的史萊姆裝刻意留空，理由是 owner 的另一半：「場上一定會有其他敵方或特殊殭屍給 AP 傷害打斷」；④ `resetMode` 省略 = `restart`（異型那一發**自己算新連擊第 1 發**），`zero` 才是「歸零、下一發才算」。兩者只在「剛換型別的那一發」不同，一般驗證看不出差別。 | packages/shared/src/sim/combat/typeStreakImmunity.ts + packages/shared/src/sim/combat/typeStreakImmunity.test.ts（五發序列 physical×2 → 第三發 hp 逐位元不變並發出 `immune`，再用 magic / physical 各一發證明它不是「隨便發一份 invulnerable」）+ content/items/slime-suit.json |
| `effect.taunt-reverse@1` | ⚠️ 部分支援 | [EX∅ 根源] 戰鬥力探測器（『指定我方去嘲諷指定目標』） | ⭐ 反向 = `side:"allies"` + `forcedTarget:"target"` 兩格一起填（各自省略時逐位元等於2026-08-18 之前的行為，所以出貨的鍊金術之盾 `godie-i06q` 一個字都沒變）。⛔ 三個邊界：① `includeNeutrals` **只在 `side:"allies"` 有作用** —— `enemies` 那一側的圓本來就含 `MONSTER_TEAM`；② 「殭屍也會一起撲上去」有條件：`forcedTargetOf` 的 mob 分支要求嘲弄者與那隻小怪**不同隊**，而殭屍全在同一隊 ⇒ 打你的如果是殭屍，隊友會被指過去，**其他殭屍不會**；③ `config.taunt@1.overridesManualOrder` **出貨 false** ⇒ 一個正在右鍵點名的隊友**不會**被強制轉頭（bot／召喚物／沒有手動指令的人會）。⚠️ 掛在 `onDamageTaken` 上時 ⛔ **不可以**寫 `hook.target:"self"` —— `resolveAgainst` 會把targets 換成持有者本人，於是 `forcedTarget:"target"` 指的是**自己**，全隊被指去打自己人，而卡片上一個字都不會變（失敗形態②）。 | packages/shared/src/sim/effects/taunt.ts + packages/shared/src/sim/tauntReverseDirection.test.ts（⭐ 第三條斷言是 `forcedTargetOf(敵人)===null` —— 「方向真的反了」而不是「圓變寬了」；第二個 it 從磁碟讀出貨的 `godie-i06q` 跑同一支 handler）+ content/items/scouter.json |
| `aura.scale-by-nearby@1` | ⚠️ 部分支援 | [EX∅ 根源] 討伐叉〈さすまた〉（『靈氣強度隨範圍內有幾個隊友變化』） | ⭐ 它做的事是把數到的人頭變成那一份投影的 `stacks`，而 `stacks` 對 Flat／PercentAdd／PercentMult 三種 op 是**線性乘數** —— ⚠️ 所以一條 `pctMult -0.5` 配 2 層就是 ×0 把對方屬性歸零，`max` 因此是**必填**。⛔ 三個邊界：① 「一個人」的定義是**同隊 + 活著 + 有 StatsComp 的身體** ⇒ **召喚物與被復活的隊友算人頭**，殭屍與中立守衛不算，倒地的隊友不算。引擎今天**沒有**「只數英雄」這根軸；② 人數 < `min`（省略 = 1）⇒ **這一圈整份不掛**（連持有者自己都沒有），⛔ 不是「掛 0 層」；③ 人數縮放與**發射源自己的 stacks 相乘**（2 層 buff 投出的圈在 3 名隊友旁邊是 6 層）。⚠️ `.radius` 省略時與這圈共用同一次 `queryOverlap`（零成本）；填了會多查一次，而**今天沒有任何出貨內容在用那條路徑**。 | packages/shared/src/sim/aura/aura.ts（auraSystem PASS 1 的兩步）+ packages/shared/src/sim/aura/aura.test.ts（0 名 → 整份不掛／1 名 → stacks 1／2 名 → stacks 2 **且屬性差正好是兩倍**／走出去掉回 1 **而來源 id 不變**）+ content/items/sasumata.json |
| `effect.carry@1` | ⚠️ 部分支援 | [EX∅ 根源] 禰豆子的木箱（『背負／附著移動 + 不可選取』） | ⛔ 五個邊界：① `untargetable` 的四根軸逐字沿用 `sim/stealth.ts::StealthRules`，而 **`abilityAoe` 今天沒有消費者** —— 填 `true` 的文件在引擎裡是空的（謂詞已匯出，閘點 `enemiesInCircle` 差一行）。出貨的木箱填 `false`（＝今天的行為）所以卡片沒有說謊；② `shape:"circle"` **一定要有 `radius`**（`radiusTier` 是註冊時才翻譯的，載入時的 refine 讀不到它）；③ `side:"allies"` 的圓**含持有者自己而且他離圓心距離 0** ⇒ 拒載條件必須排在切 `maxTargets` **之前**，否則那一刀每次都正好切下持有者本人，結果是一個人都收不進來（實測踩過）；④ `onCarrierDeath:"drop"` 的引擎語意是「乘客**留在倒下的箱子裡**（位置凍住、仍不可選取）直到 `durationSec` 走完」—— 引擎沒有「被擊倒」這個機制，也不能讓一件道具憑空造傷害；⑤ **沒有任何東西在回合邊界清 `world.carried`**，它靠絕對 tick 到期自癒（上界 30 秒）。⚠️ `ENTITY_FLAG.CARRIED` 已經過網，但**客戶端今天沒有為它畫任何東西** ⇒ 螢幕上看不出那個人不能被選取。 | packages/shared/src/sim/carry.ts + sim/systems/CarrySystem.ts + sim/effects/carry.ts + packages/shared/src/sim/carry.test.ts（①同一 tick 內乘客座標 == 載具座標 ②敵人的 `acquireTarget` 在乘客「應該勝出」的夾具下仍回載具 ③到期後不再跟）+ content/items/nezuko-box.json |
| `effect.convert-team@1` | ⚠️ 部分支援 | [EX∅ 根源] 大師球（『陣營轉換 —— 把一個既有單位改成友軍』） | ⛔ 五個邊界：① **`onHitTargets` 這一格 `convertTeam` 沒有**（`carry` 才有）⇒ 掛在同一個 `effects` 陣列裡的回血／上鎖是**無條件**跑的，捕獲被拒絕的那一刻它們照樣發生。要「成功才給」今天寫不出來；② **不對稱**：被借走的殭屍**會**被其他殭屍打，但它**打不到**其他殭屍（`isMobTargetable` 對一隻沒被捕的普通 mob 一律回 false）。它仍然會去打敵方英雄，所以寶具是有用的；③ **捕獲者死掉不會歸位** —— 歸位只有三條路（被捕者死亡／`until:"duration"` 到期／回合開始）。`until` 那個 enum 沒有「載具死亡」這一格（`carry` 的 `onCarrierDeath` 才有）；④ `countsForOriginalTeam` **預設 `false`**（owner 2026-08-18：被捕的單位實質上就是我方單位）—— `true` 是一鍵回頭（被借走的敵方英雄在勝負判定上仍替原隊活著）。填 `false` 只是把原隊那一側的人頭拿掉，⛔ **不會**改算捕獲者那一隊 —— 座位是勝負判定的軸，而借調不動座位；⑤ ⛔ 它**不發任何事件** —— 玩家的可見性靠 `ENTITY_FLAG.TEAM_OVERRIDE*` 三顆 bit 讓那具身體當場換顏色。⇒ 想掛特效的話要自己在同一份 `effects` 裡加一發 `spawnVfx`。 | packages/shared/src/sim/mindControl.ts + sim/effects/mindControl.ts + apps/game-server/src/net/mindControlWire.test.ts（⭐ 第三條斷言真的跑 `projectSnapshot` + Colyseus encode→decode 再把隊伍序數解回來 —— 那是「遊戲邏輯全對、螢幕全錯」的唯一防線）+ content/items/master-ball.json |
| `vfx.bound-sound@1` | ✅ 支援 | GH#390 特效自帶的音效一個都沒移植 | ⭐ 四個時機（發射 / 命中 / 循環 / 消散）填的是 **`config.audio-map@1.sfx` 的 key**，⛔ 不是檔名也不是 URL —— 音量 / 冷卻 / 同時發聲數住在 audio-map 那一份，播放走 `AudioSystem.playSfx` ⇒ 玩家的總音量與 SFX 開關自動適用。⚠️ 兩層逐格覆寫：`abilities[<id>].soundX` 蓋 `families[<fam>].soundX`，⛔ 不是「填一格就整組換掉」。⚠️ **循環音是重播不是真 loop**：每 `soundLoopMs` 重放一次，並在 `soundLoopMaxMs` 絕對到期時自動回收並改播消散音（⛔ 沒有「一直響到有人叫停」）。⚠️ 填一個 audio-map 沒有的 key = 這個時機安靜（⛔ 不是報錯）；填 `wc3.*` 那一族要注意它們住在只有 full-asset build 才掛得上的 Blizzard overlay，正式站上會**退回家族那一格**。 | packages/shared/src/content/schema/vfx.ts（`VFX_SOUND_CUES` / `resolveVfxSound`）+ apps/client/src/audio/vfxSound.ts + apps/client/src/audio/vfxSoundWired.test.ts + content/config/vfx-families.json（21 個家族原型 + 72 支原作 JASS 音效的逐支覆寫，由 `bash scripts/genrun.sh pitch:build` 產生） |
| `vfx.bone-attachment@1` | ✅ 支援 | GH#392 穿在骨頭上的模型（WC3 `Asph` 球體） | ⭐ **一份 `attachment@1` 綁在 `config.ambient-vfx@1.bindings` 上**，鍵可以是 **modelKey**（所有穿這具身體的人都戴著）或 **championId**（形態感知）。⚠️ 悟空兩態共用 `imported.goku`，所以「只有超三戴」**一定要用 championId** —— 填 modelKey 的話基本型也會戴上。⚠️ `points[]` **一格掛一份拷貝**（= WC3 的 `atac`）：雙手就是 `["left,hand","right,hand"]`。⛔ `"right,hand"` 是**一個**掛點的兩個逗號 token，⛔ 不是兩個掛點。掛點名解析不出來 = 退回模型原點（那是 WC3 自己的行為，⛔ 不是缺陷）。⚠️ `anim` 填的是**掛件自己的** glb 動畫軌名（出貨的三顆都只有一條 `Stand`）；省略 = 播全部，填一個對不上的名字 = 一條都不播（⛔ 不會退回第一條）。⚠️ `follow: false` 是**世界座標快照**，掛件從此和角色無關 —— ⛔ 不是「掛在模型根上」（那還是會跟著角色走）。⚠️ 掛件的生命週期綁在那具 body 上：變身會整個重建 view，所以「變回本體 = 掛件消失」不需要任何解除步驟。 | packages/shared/src/content/schema/vfx.ts（`zAttachmentDoc`）+ packages/shared/src/content/wornAttachments.ts（兩個來源折成一個型別）+ apps/client/src/render/views/ChampionView.ts（`attachOnePart`：parent = 跟隨、`g.play()` = 播動畫）+ apps/client/src/render/boneAttachmentFollow.test.ts（NullEngine 真的移動角色再讀掛件的**世界座標**） |
| `action.grant-shield@1` | ✅ 支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「grantShield」 | — | packages/shared/src/sim/effects/shield.ts —— ⭐ `absorbs` 是一格**傷害類型過濾器**（「只擋魔法傷害」寫得出來），⛔ 它不是一個 effect kind，所以不要去 effectKinds 裡找它。 |
| `action.summon-unit@1` | ✅ 支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「summonUnit」 | — | packages/shared/src/sim/effects/summon.ts（`SimWorld.summon` + summonSystem） |
| `action.revive-self@1` | ✅ 支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「reviveSelf」 | — | packages/shared/src/sim/effects/revive.ts —— handler 決定 WHO / WHERE / WHETHER，「被復活的人長什麼樣」是 `sim/revive.ts::reviveChampionAt` 那一份契約。 |
| `action.reset-cooldown@1` | ✅ 支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「resetCooldown」 | — | packages/shared/src/content/schema/effects/modifyCooldown.ts 的 `mode: z.enum(["reduce","reduceFlat","reset"])`。⚠️ `reduce` 的 `amount` 是**比例**（上界 1），按秒縮短要用 `reduceFlat` —— 填錯 mode 會被 refine 擋下，⛔ 不會靜默夾掉。 |
| `action.copy-ability@1` | ⚠️ 部分支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「copyAbility」 | ⭐ `proxyCast` 做到的是「**代放一次**」：一支技能施放另一支技能，`payCosts` 非 none 時走 `castAbility` 的同一排閘（沉默／暈眩／魔力），終止性靠深度嚴格遞增 + 有界上限。⛔ **它不是「複製到自己的槽位」**：施法者的六格技能列一格都不會變，所以「偷來的招之後可以再放」寫不出來 —— 那需要執行期改寫 `world.abilities`，而那一格今天只在 `spawnChampion` 寫一次（同 #129 變身技能列的那個缺口）。 | packages/shared/src/sim/effects/proxyCast.ts |
| `action.change-target-rule@1` | ⚠️ 部分支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「changeTargetRule」 | ⭐ 引擎有**一根**改寫瞄準的軸：`targeting.forcedTargetOf`（`sim/taunt.ts`），而且 `taunt` 已經證明它可以**反向**用（`godie-i06q` 偵查鏡：讓敵人**不**選你）。⛔ 但它是「指定一個人」這一種規則，⛔ 不是一個可組合的瞄準規則語言 ——「優先打血最少的」「優先打施法者」這些今天只能靠 `effect` 上的 `targetPriority` / `targetMode` 在**單一效果**的範圍內表達，⛔ 改不了那個單位平常的自動選敵。 | packages/shared/src/sim/taunt.ts + sim/tauntReverseDirection.test.ts |
| `action.modify-resource-rule@1` | ⚠️ 部分支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「modifyResourceRule」 | ⭐ 兩個**具名的**規則改寫已經出貨：`swapResource`（原子交換雙方的 HP↔MP）與 `manaBarrier`（扣血之前先把傷害換成扣魔，44-00 機警）。`eventValueConversion` 再補一條「把這次事件的數值換成另一種資源」。⛔ 但它們是**三條寫死的路**，⛔ 不是「這個單位從現在起用怒氣代替魔力」那種一般化的規則層 ——資源條的種類今天是 HP / MP 兩根，內容側加不了第三根。 | packages/shared/src/sim/effects/swapResource.ts + manaBarrier.ts + eventValueConversion.ts |
| `action.create-zone@1` | ⚠️ 部分支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「createZone」（票 body 的第 3 順位） | ⛔ **今天所有的「範圍」都是瞬間的**：`damageArea` / `damageLine` / `randomArea` 在結算的那一 tick 查一次重疊就結束。「留下一片持續 N 秒的區域」只能用 `delayed`（凍住名單）或 `randomArea`（到期用圓心重解）硬湊成 N 次脈衝，而且 ⚠️ **畫面上不會有那一圈** —— 沒有任何實體過網，玩家看不到自己站在裡面。⇒ 毒圈／治療圈／減速場這一整族的骨架今天寫不出來。 | packages/shared/src/sim/effects/randomArea.ts（draw 預算 2×count，到期走絕對 tick）+ delayed.ts（⛔ 與 randomArea 的差別是一句話：那邊到期用圓心重解，這邊用凍住的名單） |
| `action.delay-death@1` | ⚠️ 部分支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「delayDeath」 | ⭐ 「這一發不會死」已經有兩條路：`invulnerable`（無條件擋，含真傷）與**免死**（`sim/marks.ts` 的 `lethal` 標記 + `combat/lethalSave.ts`，攔在護盾之後扣血之前）。⛔ 但引擎**沒有「死亡延後 N 秒」**：死亡是在同一 tick commit 的，⛔ 沒有一個「已經死了但還站著」的中間狀態。⇒ 「陣亡後 3 秒內仍可行動」這種卡片今天要改寫成「免死 + 一段短無敵」，⚠️ 而那兩者的**可被驅散性**與畫面表現都不一樣，⛔ 不是同一句話。⚠️ 免死的 `restoreMode` 預設是 `clamp`（見 `hook.on-lethal-damage@1`），⛔ 寫「留在 N% 生命」的卡片一定要填 `restore`。 | packages/shared/src/sim/effects/invulnerable.ts + sim/combat/lethalSave.ts + sim/marks.ts |
| `effect.combo-strikes@1` | ✅ 支援 | #541 —— 01-04 超究武神霸斬「連斬七次」· 20-002「連續七次斬擊…最後施展約束與勝利之劍」 | — | packages/shared/src/sim/effects/comboStrikes.ts —— 每一段是自己的一次 `runEffects`，所以各觸發一次 on-hit、各吃一次減傷、各記一次分。⭐ 節奏（幾段／間隔／收尾延遲）**在載入時**從 `config.combo-strikes@1` 解析（`sim/effects/comboFamilies.ts`），⛔ 不烘進技能 JSON；不等間隔用 `steps[]`。⚠️ 排程走的是**既有的** `SimWorld.delayed` 佇列與 `delayedSystem`，⛔ 不是第二個排程器。 |
| `effect.pull@1` | ✅ 支援 | #147 —— A091 05-03 及喀爾度「2×等級 個錨點 + 250+100×等級 半徑」(war3map.j:28224-28233) | — | packages/shared/src/sim/effects/pull.ts —— `destination` 三檔（caster / point / anchorRing）。⭐ 等分錨點環用一張**單位旋轉常數表**做（`RING_UNIT_ROTATION`），因為 `sim/**` 禁止三角函式（`sim/purity.test.ts`）。位移走的是 `knockback` 已經在用的 `nav.override` 地面滑行 + `world.knockdown` 行動鎖，⛔ 沒有第二套位移機制。 |
| `effect.spawn-model-fx@1` | ✅ 支援 | #551 —— owner 2026-08-22「w3x jass + 球體 + 蝗蟲群單位 3d model 特效(ex. Saber 約束勝利之劍的翻滾光束就是)」 | ⭐ **兩半都到齊了（2026-08-23，GH#606）**：玩法那一半（路徑求值、`onTouch` 的逐段取樣、`onArrive` 的落點結算，班表推進**既有的** `SimWorld.delayed`）在 sim 裡，視覺那一半在 `apps/client/src/render/modelFxRig.ts`，事件也在 `eventFanout` 白名單上。⚠️ **在 2026-08-23 之前這一格的 caveat 是對的而我們自己不知道**：sim 送 `{ caster, modelKey, instances, … }`,客戶端讀 `ev.data.spec` —— 零個寫入端 ⇒ 消費端第一行就 `break`,整族在畫面上一具模型都沒出現過。⭐ 根治不是改欄位名（下一個欄位照樣會歪）,是**兩邊 import 同一個型別** `ModelFxSpawnEvent`（住 `sim/effects/spawnModelFx.ts`）。⛔ **落點特效不由客戶端排**:寫在技能 JSON 的 `onArrive: [{ kind: "spawnVfx" }]`,它走 sim 的延遲班表 ⇒ 特效與傷害同 tick 同點。客戶端再排一次會差幾幀。⚠️ 模型離地高度是 `model@1.fxSpawnHeight`（缺席 = 貼地),⛔ 不是技能的欄位 —— 「這根東西該飛多高」是網格自己的性質,同 `fxLongAxis`。 | packages/shared/src/sim/effects/spawnModelFx.ts —— ⭐ 等分角度讀的是 `pull.ts` 的`ringPoints` / `RING_UNIT_ROTATION`（單位旋轉常數表），因為 `sim/**` 禁止三角函式（`sim/purity.test.ts`）。⭐ `onTouch` 與 `onArrive` 是**兩串**佇列而不是一串：`delayedSystem` 的 `struck` 過濾同時套用在 `effects` 與 `finalEffects` 上，掛成同一串會讓「被光束掃到的人不會被落點爆炸打到」。 |
| `effect.screen-feedback@1` | ⚠️ 部分支援 | #543 —— owner 2026-08-22「畫面閃爍及震動 不然都不知道發生什麼事情」 | ⭐ sim 這一半只負責**什麼時候發、發給誰**（`applyTo`：self／victim／all，三個 kind 共用同一支解析器）。⭐ **2026-08-23 整條線已經接通**（`c49b04a1` / GH#608，同一批把兩個 kind 從**擲 TypeError** 修成真的畫得出來）：客戶端有 `VfxSystem` 的 `case "screenFlash"` / `case "screenShake"`（→ `apps/client/src/render/screenFx.ts`），兩個事件也都在 `apps/game-server/src/net/eventFanout.ts` 的白名單裡。⚠️ 這一筆在 2026-08-24 之前寫著「缺的兩件：① 客戶端沒畫 ② 沒進白名單」——**兩件都做完了**。⇒ 剩下的是**三個真的限制**：① `amplitude` / `peakAlpha` 是 **0..1 的正規化強度，⛔ 不是像素、⛔ 不是絕對不透明度**——真正的位移量由後台那份**全域上限**（`config.screen-fx@1`，⭐ `content/config/screen-fx.json`）乘出來；② 它同時吃 `prefers-reduced-motion`，而出貨的相機位移對那些玩家是**整個關掉**的（震動沒有「弱一點的版本」）⇒ ⛔ 不可以把「畫面會震」當成技能邏輯的一部分；③ 上限與無障礙都在**載入時**解析一次 ⇒ 後台改完要玩家重新整理才生效。⇒ 寫卡片時 ⛔ 不要假設 `amplitude: 1` 在每一台機器上都會震同樣多；它是「這一發相對於全域上限有多用力」，而不是一個絕對值。 | packages/shared/src/sim/effects/clientCues.ts（三個 kind 共用 `cueRecipients`） |
| `effect.floating-text@1` | ⚠️ 部分支援 | #549 —— owner 2026-08-22「別忘了還有特效文字」（原作 `CreateTextTagUnitBJ`） | ⭐ `text` 支援佔位符 **`{{i}}`**（這一次執行是序列裡的第幾段，1 起算），所以「1Hit…7Hit」是 `comboStrikes.perStrike` 裡的**一個**節點寫 `"{{i}}Hit"`，⛔ 不是七個各寫死一個數字的節點。段號來自 `EffectContext.sequenceIndex`（由 `delayedSystem` 填），不在序列裡時解析成 **1**。⭐ 2026-08-23：**整條線已經接通** —— 客戶端會把它畫成一段往上飄、到 55% 壽命開始淡出的字（`FloatingTextFx`），事件也在 `eventFanout.ts` 的白名單裡。⚠️ 這一格在 2026-08-22–23 之間寫著「⛔ 缺的兩件：客戶端沒畫、白名單沒進」，而那兩件在 `77773e73` / `c49b04a1` 就做完了 —— 對外契約說謊會讓作者**白白繞路**（檔頭 ② 的兩個過期方向之一）。⛔ **仍然存在的三個限制**（這才是它是 `partial` 的理由）：① `applyTo` 只有 `self` / `victim`，⛔ **沒有 `all`** —— 字要有一個身體當錨；② 同時最多幾段字由 `config.screen-fx@1.floatingTextMaxOnScreen` 決定（⚠️ 這裡刻意**不複述它的出貨值** —— 這一句在 2026-08-24 之前寫著「出貨 48」而出貨是 **40**：一個抄進契約的數字就是第二個住處，owner 在後台轉一格它就開始說謊。⇒ 要知道現在是多少就讀那一格），⭐ 它在**建構時**吃掉，所以後台改了要玩家重新整理才生效；滿了會**擠掉剩餘壽命最短的那一段**，⛔ 不是排隊；③ 同一個錨點最多同時掛 **8** 段（第 9 段直接丟掉），同一幀落在同一點的多發每段往後推 90ms（原作 `0.2f * i` 的縮版）。⚠️ 它 ⛔ **不是傷害數字**（那一族由 `damage` 事件在客戶端自己算），也 ⛔ 不是 UI 字串。 | packages/shared/src/sim/effects/clientCues.ts::resolveCueText + sim/effects/delayed.ts（`sequenceIndex: index + 1`，⛔ 這是 `{{i}}` 唯一的來源）；渲染那一半 apps/client/src/vfx/FloatingTextFx.ts（`MAX_PER_ANCHOR` / `STAGGER_MS` / `FADE_FROM`）＋ VfxSystem.ts 的 `case "floatingText"`；上線那一半 apps/game-server/src/net/eventFanout.ts 的 `FANNED_OUT_EVENT_TYPES` |
| `action.redirect-damage@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「redirectDamage —— 把即將落在 A 身上的傷害轉到 B」 | 傷害佇列今天只認得**一個**承受者（`combat/damage.ts` 的封包帶 target，沒有第二個座位）。「換一個人挨」要在扣血之前改寫封包的 target，而那一格是護盾／免死／無敵三道閘共用的輸入。 | — |
| `action.store-damage@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「storeDamage —— 把承受到的傷害存起來」 | 引擎有「記一個數字」的機制，但它的**存款來源只有一種**：`spendMana.bankAs` 記的是**這一次實際扣掉的法力**。⛔ 沒有任何一格讀得到「剛剛那一發打了我多少」再把它記下來 —— `HookDef` 的過濾器與 `condition@1` 的葉子都沒有那個數字（`extendBuff` 的檔頭逐條查過同一件事）。 | — |
| `action.release-stored-damage@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「releaseStoredDamage —— 把存起來的傷害一次放出去」 | 與 `action.store-damage@1` 是同一條路的兩端：沒有存款端就沒有支出端。⚠️ 兩者要一起做，⛔ 只做一半的話卡片會宣稱一個永遠是 0 的數字（第一·五守則的形狀）。 | — |
| `action.rewind-state@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「rewindState —— 把一個單位倒回 N 秒前的狀態」 | ⛔ sim **沒有保存任何歷史狀態**。決定性重播靠的是重跑輸入（`MatchRecorder` 錄的是 input log），⛔ 不是狀態快照 —— 所以「倒回去」在引擎裡沒有可以讀的東西。要做的話是動 `SimWorld` 的儲存體本身，而那是決定性與重播的承重牆（票 body 建議**最後**做）。 | — |
| `action.swap-position@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「swapPosition —— 兩個單位對調位置」 | 位移的三個 kind（`dash` / `leap` / `blink`）都只搬**一具身體**，而且落點是算出來的座標。「同一 tick 把兩具身體互換」還要決定**對方能不能拒絕**（免疫／不可位移／卡在牆裡），而那組決策今天一個欄位都沒有。 | — |
| `action.create-terrain@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「createTerrain —— 執行期長出新的地形/障礙」 | 場地幾何是**編譯期**的：`arena@1.obstacles` 由 `map/compile.ts` 從格盤產出，而碰撞的 relax 每 tick 掃的就是那個陣列。執行期插一塊新的要同時處理導航（`nav.nextHop` 是烘好的）與「有人正好站在那裡」——⛔ 兩件事今天都沒有答案。 | — |
| `action.create-portal@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「createPortal —— 放一個持續存在、任何人踩得到的傳送門」 | 傳送門是**一個持續存在的世界實體**（有位置、有半徑、有壽命、對誰生效是欄位），而引擎今天唯一的持續實體是 `summon`（一具身體）與投射物。⚠️ 它與 `action.create-zone@1` 是同一個缺口的兩張臉，⛔ 不要分兩次做。 | — |
| `action.modify-arena-boundary@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「modifyArenaBoundary —— 技能改變場地邊界」 | 邊界（`arena@1.bounds` 與火圈半徑）是**一份 config 的排程**，不是任何一支技能寫得到的狀態。而且它是所有出生點合法性檢查與 `sim/map/bounds.ts` 的共同前提 —— 改它會讓那些檢查的答案在一場比賽中途改變。票 body 建議**最後**做，理由與 `rewindState` 同一條。 | — |
| `action.transfer-cooldown@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「transferCooldown —— 把自己的冷卻轉給別人（或反過來）」 | `modifyCooldown` 的三個 mode（`reduce` / `reduceFlat` / `reset`）都只動**持有者自己**的一支技能，而且它拿的是 `abilityId`。「轉給別人」要先回答「對方有沒有這一支」以及「對方的槽位是哪一格」——⛔ 兩個問題今天都沒有欄位。 | — |
| `action.copy-buff@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「copyBuff —— 讀出目標身上那一份增益，複製到自己（或隊友）身上」 | `applyBuff` 掛的是**作者在 JSON 裡寫死的**那一份修飾子。「讀出對方身上現在有什麼」需要一個把 `StatsComp.sources` 反序列化回一份 `applyBuff` 的路徑，而 modifier 的來源（道具／技能／靈氣／標記）語意各不相同 —— 複製過來之後**歸誰、什麼時候到期**今天沒有答案。 | — |
| `action.evolve-item@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「evolveItem —— 一件道具在戰鬥中升級成另一件」 | ⛔ **GGD 沒有合成步驟**：`item@1.recipe`（book + components）的欄位註解自己寫著「GGD has no combine step; this is provenance only」——它是從原作 TRIGGERS 撈回來的**出處紀錄**，⛔ 不是一條執行期的路。而且沒有任何 effect kind 動得了背包（`economy/itemSource.ts` 只在購買與回合邊界寫）。 | — |
| `action.sacrifice-item@1` | ⛔ 不支援 | GH#354 owner 2026-08-17 的 Action 清單 —— 「sacrificeItem —— 消耗掉一件道具換取效果」 | 與 `action.evolve-item@1` 同一個缺口：⛔ 沒有任何 effect 拿得走背包裡的一格。⚠️ 它還多一個決策：**退不退錢、退多少** —— 那是 owner 的平衡題，⛔ 不是實作題。 | — |

## 2. ⛔ 不可使用清單

編輯器產出的內容只要用到下列任何一項，遊戲端就會回 `unsupported-runtime`：

- `action.copy-buff@1`
- `action.create-portal@1`
- `action.create-terrain@1`
- `action.evolve-item@1`
- `action.modify-arena-boundary@1`
- `action.redirect-damage@1`
- `action.release-stored-damage@1`
- `action.rewind-state@1`
- `action.sacrifice-item@1`
- `action.store-damage@1`
- `action.swap-position@1`
- `action.transfer-cooldown@1`
- `condition.ability-state@1`
- `effect.attack-dash@1`
- `effect.control-restriction@1`

## 3. 可以編譯到的 effect 種類

這是引擎執行期**真的有處理器**的全部種類；不在這張表上的名稱一律會被拒絕。

`applyBuff` · `applyStatus` · `blink` · `carry` · `chainLightning` · `championForm` · `comboStrikes` · `convertTeam` · `cycleBuff` · `damage` · `damageArea` · `damageLine` · `dash` · `delayed` · `devour` · `dispel` · `dot` · `evasion` · `eventValueConversion` · `extendBuff` · `floatingText` · `grantAttribute` · `grantGold` · `grantXp` · `heal` · `invulnerable` · `knockback` · `leap` · `manaBarrier` · `modifyCooldown` · `proxyCast` · `pull` · `randomArea` · `restore` · `revive` · `screenFlash` · `screenShake` · `shield` · `shieldBreak` · `spawnModelFx` · `spawnProjectile` · `spawnVfx` · `spendMana` · `summon` · `swapResource` · `taunt` · `weightedBranch`

⭐ **一個種類一個檔**（#467）—— 檔名恆等於上面那張清單裡的種類名：

| 種類的哪一半 | 檔案 | 覆蓋 |
|---|---|---|
| 欄位與上下界 | `packages/shared/src/content/schema/effects/<種類>.ts` | 47 / 47 個種類有自己的檔 |
| 型別 | `packages/shared/src/sim/effects/variants/<種類>.ts` | 47 / 47 個種類有自己的檔 |

⚠️ 右欄兩個數字是**每次匯出時數出來的**，⛔ 不是寫死的宣稱。分母是這一節上方那張
清單的長度；分子是那個目錄裡真的存在的檔。兩者不相等就代表有種類還沒分出去。

## 4. 可以掛的 hook 事件

`onAbilityCast` · `onAbilityHit` · `onAllyDamaged` · `onAllyDeath` · `onBasicAttack` · `onBossSpawn` · `onBoundaryTouch` · `onCrowdControlApplied` · `onCrowdControlReceived` · `onDamageDealt` · `onDamageTaken` · `onDashOrBlink` · `onDeath` · `onEvade` · `onFireRingIgnite` · `onGuardianDown` · `onHeal` · `onInterval` · `onKill` · `onLethalDamage` · `onOverheal` · `onProjectileExpire` · `onReflectSuccess` · `onRevive` · `onRoundEnd` · `onRoundStart` · `onShieldBroken` · `onShieldGained` · `onStatCapReached` · `onStatusApplied` · `onStunned` · `onUltimateCast` · `onUltimateHit`

## 5. 可展開的技能模板家族

模板是「參數化的技能骨架」：填參數就展開成一組 effect。下列家族已在遊戲端出貨且可展開（清單由展開器本人過濾，所以不會宣稱一個展不開的家族）。

`beam-roll` · `blink-strike` · `buff-self` · `charge-push` · `combo-finisher` · `ground-nova` · `instant-blast` · `leap-strike` · `line-blast` · `line-sweep` · `lock-combo` · `locust-line` · `locust-orb` · `locust-strike` · `locust-swarm` · `locust-travel` · `mark-stacks` · `on-attack` · `on-hit-react` · `orbit-array` · `periodic-field` · `proxy-cast` · `proxy-fanout` · `radial-burst` · `random-barrage` · `single-strike` · `summon-agent` · `teleport` · `traveling-wave`

## 6. 模擬器能力旗標

| 能力 | 可用 | 限制 |
|---|---|---|
| `applyBuff` | ✅ | — |
| `applyStatus` | ✅ | — |
| `auras` | ✅ | — |
| `combo` | ✅ | — |
| `conditions` | ✅ | — |
| `dash` | ✅ | — |
| `hooks` | ✅ | — |
| `invulnerable` | ✅ | — |
| `knockback` | ✅ | — |
| `leap` | ✅ | — |
| `marks` | ✅ | — |
| `periodicDamage` | ✅ | — |
| `projectile` | ✅ | — |
| `pull` | ✅ | — |
| `summon` | ✅ | 召喚物的擊殺歸屬 killCredit: "owner" 尚未實作（施放時會擲錯），其餘欄位皆可用 |
| `travelingWave` | ✅ | — |

## 7. 特效（VFX）授權面 —— 你在哪一份 JSON 的哪一層寫得出特效參數

⚠️ **這一節在 2026-08-18 之前完全不存在**，而後果不是「少一個欄位」：特效那一整面對編輯器是**不存在的**，所以它產不出任何一支帶特效參數的技能 —— 而且**不會收到任何錯誤**，因為它根本沒寫那些格子。⛔ 這比「不支援」更難發現：不支援至少會被拒絕。

下表的鍵是**授權的位置**（你在哪一份文件的哪一層寫它），值是那一層收得下的欄位名。欄位名一樣是從出貨的 schema 推導的，所以不會宣稱一個引擎不認得的格子。⚠️ 每一格的**上下界與語意**在這份清單裡看不到 —— 那是另一份文件的工作，這裡只回答「這個名字存不存在」。

| 寫在哪 | 欄位 |
|---|---|
| `vfx@1` | `ambient` · `anchorBone` · `blendMode` · `burstCount` · `color` · `colorStops` · `emitter` · `gore` · `gravityY` · `id` · `lifetimeSec` · `mode` · `orient` · `presentation` · `rate` · `schema` · `size` · `sizeStops` · `speed` · `spriteSheet` · `stretched` · `tailLength` · `texture` · `tracks` |
| `vfx@1.orient` | `pitchDeg` · `swirlDegPerSec` · `yawDeg` · `yawFrom` |
| `ribbon@1` | `anchorBone` · `blendMode` · `color` · `id` · `lifespanSec` · `schema` · `texture` · `uvScrollPerSec` · `widthAbove` · `widthBelow` |
| `attachment@1` | `anim` · `animLoop` · `follow` · `id` · `modelKey` · `note` · `offsetY` · `points` · `scale` · `schema` |
| `ability@1.vfxLayers[]` | `alpha` · `attachTo` · `delayMs` · `enabled` · `facingDeg` · `flyHeight` · `pitchDeg` · `timeScale` · `tint` · `vfxKey` · `w3xScale` |
| `config.vfx-families@1.abilities[]` | `alpha` · `anchor` · `enabled` · `facingDeg` · `family` · `flyHeight` · `pitchDeg` · `soundDissipate` · `soundGain` · `soundImpact` · `soundLaunch` · `soundLoop` · `timeScale` · `tint` · `w3xScale` |
| `config.vfx-families@1.families[]` | `alpha` · `element` · `enabled` · `groundDecal` · `heightY` · `models` · `primitive` · `scale` · `soundDissipate` · `soundGain` · `soundImpact` · `soundLaunch` · `soundLoop` · `soundLoopMaxMs` · `soundLoopMs` · `timeScale` |
| `config.vfx-ability-art@1.bindings.prim` | `element` · `primitive` · `size` |
| `config.vfx-ability-art@1.bindings.family` | `anchor` · `family` · `flyHeight` · `model` · `paramSource` · `provenance` · `scale` · `tint` · `via` · `w3aId` |
| `config.vfx-ability-art@1.bindings.owner` | `anchor` · `family` · `flyHeight` · `scale` · `tint` · `why` |
| `config.vfx-ability-art@1.bindings.promoted` | `extra` · `family` · `primary` · `provenance` · `via` · `w3aId` |

⭐ 兩個最容易被漏掉的：`vfx@1.orient` 是**巢狀**的（只看 `vfx@1` 只看得到 `orient` 這個名字，看不到裡面的三格），而 `ability@1.vfxLayers[]` 是**每一支技能自己的覆寫**——同一份 `vfx@1` 文件被兩支技能用，兩支可以各自放大、轉色、改仰角，⛔ 不必複製一份文件。

## 8. 文件授權面 —— 一支技能／一件道具／一個狀態**本身**寫得出什麼

⚠️ **這一節在 2026-08-18 之前完全不存在**，而它少的是最基本的一層：第 3 節告訴你一支技能可以做出哪些**效果**，這一節才告訴你「**這一支是指定還是範圍、射得多遠、多久放一次、耗多少魔**」。在它之前 `castType` / `range` / `hitRadius` / `craftRole` 在整份契約裡出現 **0 次** —— ⛔ 所以照著舊契約產出的技能，那幾格一律是引擎的預設，而且**不會收到任何錯誤**。

讀法和第 7 節一樣：鍵是**授權的位置**（你在哪一份 JSON 的哪一層寫它），值是那一層收得下的欄位名，全部從出貨的 schema 推導。⚠️ `id` 與 `schema` 是每一份文件都有的樣板欄位，不是這個面的特色。⚠️ 每一格的**上下界與語意**看另一份文件（這裡只回答「這個名字存不存在」）。

| 寫在哪 | 欄位 |
|---|---|
| `ability@1` | `augment` · `castTimeSec` · `castTimeTier` · `castType` · `cooldown` · `cooldownShape` · `cooldownTier` · `description` · `effects` · `hitFeel` · `icon` · `id` · `innateActivePassive` · `innateKind` · `interruptOn` · `manaCost` · `manaCostTier` · `marks` · `maxRank` · `name` · `passive` · `persistentVfx` · `provenance` · `radius` · `radiusTier` · `range` · `rangeTier` · `rangeUnlimited` · `recoveryRoots` · `recoverySec` · `rootWhileCasting` · `sfxKey` · `slot` · `targetsEnemies` · `template` · `toggle` · `vfxKey` · `vfxLayers` |
| `ability@1.marks[]` | `durationSec` · `initial` · `lethal` · `markId` · `max` · `perStackLost` · `resetOn` · `roundDelta` |
| `projectile@1` | `flight` · `hitRadius` · `id` · `maxRange` · `meshShape` · `pierce` · `schema` · `speed` · `vfxKey` |
| `status-effect@1` | `alpha` · `description` · `iconKey` · `id` · `name` · `polarity` · `schema` · `tags` · `tint` |
| `item@1` | `attributes` · `auras` · `authoringNote` · `block` · `cost` · `craftRole` · `critStrike` · `damageTypeOverride` · `description` · `draftEligible` · `flight` · `icon` · `iconKey` · `id` · `marks` · `modifiers` · `name` · `passive` · `penetration` · `recipe` · `requiresAttackType` · `schema` · `sets` · `tags` · `tier` · `typeStreakImmunity` · `unique` · `vision` |
| `champion@1` | `abilities` · `alpha` · `archetype` · `asGrowthTier` · `attackDamagePoint` · `attackType` · `attributes` · `baseAttackTime` · `baseStats` · `bodyScale` · `buildPriority` · `description` · `exAbility` · `growth` · `healthDrainPctOfMax` · `healthRegenPctOfMax` · `hitFeel` · `icon` · `id` · `immobile` · `missileSpeed` · `modelKey` · `msGrowthTier` · `name` · `origin` · `passive` · `passiveAbility` · `pitch` · `playstyle` · `role` · `schema` · `skillOrder` · `tags` · `tint` · `transform` |
| `template@1` | `description` · `exemplar` · `family` · `gapScore` · `id` · `name` · `params` · `requires` · `schema` · `status` |

⭐ `ability@1.marks[]` 是**巢狀**的（只看 `ability@1` 只看得到 `marks` 這個名字），而且 `item@1.marks[]` 用的是**同一份**定義 —— 一件道具給的疊層和一支技能給的疊層寫法完全一樣。⚠️ `template@1` 是**參數化的技能骨架**（第 5 節那些家族的文件形狀），⛔ 不是另一種技能。

## 9. 參數名 —— effect／hook／條件／靈氣各自收得下哪些格子

⚠️ **這一節在 2026-08-19 之前只存在於隨附的 JSON 裡**，人看的這一份一個字都沒印。而 `effectFields` 的 201 個名字有 **109 個**在整份文件裡出現 0 次 —— 第 3 節告訴你有哪些 kind，卻沒有任何一節告訴你**一個 kind 裡面寫得出哪些參數**。⛔ 同一個安靜的失敗：不會被拒絕，只是不知道那些格子存在。

⚠️ 下面每一族都是**所有分支的聯集** —— 一個名字出現在這裡代表「某一個 kind／某一顆條件葉收得下它」，⛔ 不代表每一個都收。哪一個 kind 配哪幾格、以及每一格的上下界與語意，看另一份文件。

**effect 參數（所有 kind 的聯集）**（265）

`abilityId` · `absorbs` · `addSec` · `advance` · `aim` · `alpha` · `amount` · `amountPerTick` · `amplitude` · `anchor` · `anchorCount` · `anchorRadius` · `apexHeight` · `applyTo` · `arriveSoundKey` · `at` · `attach` · `attackType` · `attr` · `attributes` · `autoTargetable` · `bankAs` · `bankedBonus` · `basis` · `berserk` · `block` · `blocksControl` · `blocksDamage` · `blocksTrueDamage` · `body` · `boneOn` · `bountyGold` · `branches` · `breakOnDamage` · `breakOnDamageMin` · `buff` · `burnsInFireRing` · `canCrit` · `capScope` · `centre` · `championId` · `chance` · `clampMin` · `clip` · `clipTimeScale` · `colorRgb` · `comboBonus` · `condition` · `count` · `countsForOriginalTeam` · `critStrike` · `cycleKey` · `damageMult` · `damageType` · `damageTypeOverride` · `damageTypes` · `deathWard` · `decay` · `delaySec` · `destination` · `disarmed` · `dispellable` · `distance` · `distanceScale` · `distanceTier` · `distanceUnits` · `dodgesAbilities` · `dodgesTrueDamage` · `dragToCaster` · `driftAngleDeg` · `driftAngleStepDeg` · `driftFrom` · `driftSpeed` · `dropDeadTargets` · `duration` · `durationSec` · `effects` · `emitCastEvents` · `everyNth` · `exclusiveGroup` · `exclusiveOnExisting` · `fallbackLevel` · `falloff` · `family` · `feared` · `finalEffects` · `finisher` · `finisherDelaySec` · `firstAtCast` · `fixedRank` · `flat` · `flight` · `forceClip` · `forcedTarget` · `formation` · `from` · `fromCaster` · `getupTicks` · `healPct` · `healingTakenMult` · `healthPct` · `hitOncePerTarget` · `hookKey` · `hookScope` · `hooks` · `hpBasis` · `hpMult` · `hpPct` · `immobile` · `impactPower` · `includeNeutrals` · `includeOrigin` · `incomingPct` · `intervalJitter` · `intervalSec` · `jumpIntervalSec` · `jumpRange` · `jumps` · `killCredit` · `kind` · `landRadius` · `launchDistance` · `launchHeight` · `length` · `level` · `lifeSec` · `lifestealMult` · `manaPct` · `manualTargetable` · `markStatusId` · `maxAlive` · `maxAttribute` · `maxAttributeBasis` · `maxDepth` · `maxDistance` · `maxHeld` · `maxRemainingSec` · `maxSourceTotal` · `maxSources` · `maxStacks` · `maxStat` · `maxTargets` · `maxTargetsCounts` · `maxTotalJumps` · `minManaReserve` · `missChance` · `mobLevelSource` · `mobTargetable` · `mode` · `modelKey` · `modifiers` · `moveSpeedMult` · `offsetForwardU` · `onArrive` · `onCap` · `onCarrierDeath` · `onCasterDeath` · `onDevour` · `onDevourPer` · `onEnd` · `onEndOn` · `onEndWhenDead` · `onExisting` · `onHit` · `onHitTargets` · `onHitTargetsMode` · `onInvalidTarget` · `onLand` · `onOwnerDeath` · `onTouch` · `oncePerRoundPerVictim` · `order` · `path` · `payCosts` · `pctCurrentMana` · `pctMaxMana` · `peakAlpha` · `penetration` · `perDamageFlat` · `perDamagePctOfMaxHealth` · `perMana` · `perRank` · `perStrike` · `perStrikeSoundKey` · `perTargetLevel` · `permanent` · `permanentScope` · `polarity` · `pools` · `preset` · `primaryAttribute` · `projectileId` · `radius` · `radiusTier` · `rankMode` · `ratio` · `refresh` · `refund` · `regenMult` · `requireLearned` · `resource` · `resourcePct` · `resourcePctPhase` · `respectCooldown` · `revisit` · `riseSpeed` · `root` · `runOnEmptyHit` · `scale` · `scaleAxis` · `scatterRadius` · `scripted` · `shape` · `side` · `silenced` · `sizeScale` · `slot` · `soundKey` · `source` · `spacing` · `speed` · `spinDegPerSec` · `spread` · `stackKey` · `stackVisual` · `stacking` · `stacks` · `statusId` · `statusImmunity` · `steps` · `stopDistance` · `stopOnCasterDeath` · `stopShortUnits` · `store` · `strikeReposition` · `strikes` · `stun` · `subtractGap` · `target` · `targetMode` · `targetPriority` · `targetsAllies` · `team` · `teamCharge` · `text` · `thresholdPctOfMax` · `throughShields` · `throwDistance` · `tickOnApply` · `tint` · `to` · `touchOncePerTarget` · `touchRadius` · `touchSide` · `typeStreakImmunity` · `uncontrollable` · `untargetable` · `until` · `velocityAngle` · `vfxId` · `victim` · `victimCondition` · `vision` · `who` · `width`

**巢狀 effect 參數的完整路徑（深度 ≤ 2）**（429）

`abilityId` · `absorbs` · `addSec` · `advance` · `advance.dir` · `advance.startDist` · `advance.stepDist` · `aim` · `alpha` · `amount` · `amount.attrRatios` · `amount.attrRatios.attr` · `amount.attrRatios.basis` · `amount.attrRatios.coeff` · `amount.conditionTier` · `amount.damageTier` · `amount.damageTierPerRank` · `amount.flat` · `amount.mult` · `amount.perRank` · `amount.ratios` · `amount.ratios.coeff` · `amount.ratios.stat` · `amount.ratios.when` · `amountPerTick` · `amountPerTick.attrRatios` · `amountPerTick.attrRatios.attr` · `amountPerTick.attrRatios.basis` · `amountPerTick.attrRatios.coeff` · `amountPerTick.conditionTier` · `amountPerTick.damageTier` · `amountPerTick.damageTierPerRank` · `amountPerTick.flat` · `amountPerTick.mult` · `amountPerTick.perRank` · `amountPerTick.ratios` · `amountPerTick.ratios.coeff` · `amountPerTick.ratios.stat` · `amountPerTick.ratios.when` · `amplitude` · `anchor` · `anchorCount` · `anchorRadius` · `apexHeight` · `applyTo` · `arriveSoundKey` · `at` · `attach` · `attackType` · `attr` · `attributes` · `attributes.agi` · `attributes.int` · `attributes.str` · `autoTargetable` · `bankAs` · `bankAs.durationSec` · `bankAs.statusId` · `bankedBonus` · `bankedBonus.coeff` · `bankedBonus.max` · `bankedBonus.statusId` · `basis` · `berserk` · `block` · `block.chance` · `block.damageTypes` · `block.fraction` · `block.internalCooldown` · `block.lethalBasis` · `block.lethalOnly` · `block.vfxId` · `block.vfxScale` · `block.vfxTint` · `blocksControl` · `blocksDamage` · `blocksTrueDamage` · `body` · `boneOn` · `bountyGold` · `branches` · `branches.effects` · `branches.weight` · `breakOnDamage` · `breakOnDamageMin` · `buff` · `buff.durationSec` · `buff.ratio` · `buff.stat` · `burnsInFireRing` · `canCrit` · `capScope` · `centre` · `championId` · `chance` · `clampMin` · `clip` · `clipTimeScale` · `colorRgb` · `comboBonus` · `comboBonus.amount` · `comboBonus.amount.attrRatios` · `comboBonus.amount.conditionTier` · `comboBonus.amount.damageTier` · `comboBonus.amount.damageTierPerRank` · `comboBonus.amount.flat` · `comboBonus.amount.mult` · `comboBonus.amount.perRank` · `comboBonus.amount.ratios` · `comboBonus.statusId` · `condition` · `count` · `countsForOriginalTeam` · `critStrike` · `critStrike.chance` · `critStrike.damageMult` · `critStrike.empowers` · `critStrike.lifestealFraction` · `critStrike.lifestealMode` · `cycleKey` · `damageMult` · `damageType` · `damageTypeOverride` · `damageTypeOverride.applyAt` · `damageTypeOverride.becomes` · `damageTypeOverride.impactType` · `damageTypeOverride.scope` · `damageTypes` · `deathWard` · `deathWard.beneficiary` · `deathWard.maxPerZone` · `deathWard.modelKey` · `deathWard.modifiers` · `deathWard.modifiers.from` · `deathWard.modifiers.fromResource` · `deathWard.modifiers.msBonusTier` · `deathWard.modifiers.op` · `deathWard.modifiers.scopeAbilityId` · `deathWard.modifiers.scopeSlot` · `deathWard.modifiers.stat` · `deathWard.modifiers.value` · `deathWard.radius` · `deathWard.stacking` · `decay` · `delaySec` · `destination` · `disarmed` · `dispellable` · `distance` · `distanceScale` · `distanceScale.atRange` · `distanceScale.far` · `distanceScale.near` · `distanceTier` · `distanceUnits` · `dodgesAbilities` · `dodgesTrueDamage` · `dragToCaster` · `driftAngleDeg` · `driftAngleStepDeg` · `driftFrom` · `driftSpeed` · `dropDeadTargets` · `duration` · `durationSec` · `effects` · `emitCastEvents` · `everyNth` · `exclusiveGroup` · `exclusiveOnExisting` · `fallbackLevel` · `falloff` · `family` · `feared` · `finalEffects` · `finisher` · `finisherDelaySec` · `firstAtCast` · `fixedRank` · `flat` · `flight` · `flight.hoverHeight` · `flight.ignoreObstacles` · `flight.ignoreUnits` · `flight.stayInsideBoundary` · `forceClip` · `forcedTarget` · `formation` · `from` · `fromCaster` · `getupTicks` · `healPct` · `healingTakenMult` · `healthPct` · `hitOncePerTarget` · `hookKey` · `hookScope` · `hooks` · `hpBasis` · `hpMult` · `hpPct` · `hpPct.basis` · `hpPct.perRank` · `immobile` · `impactPower` · `includeNeutrals` · `includeOrigin` · `incomingPct` · `incomingPct.applyGlobalDamageMult` · `incomingPct.basis` · `incomingPct.maxChainDepth` · `incomingPct.negateOriginal` · `incomingPct.perRank` · `incomingPct.whenTooLate` · `intervalJitter` · `intervalSec` · `jumpIntervalSec` · `jumpRange` · `jumps` · `killCredit` · `kind` · `landRadius` · `launchDistance` · `launchHeight` · `length` · `level` · `lifeSec` · `lifestealMult` · `manaPct` · `manualTargetable` · `markStatusId` · `maxAlive` · `maxAttribute` · `maxAttributeBasis` · `maxDepth` · `maxDistance` · `maxHeld` · `maxRemainingSec` · `maxSourceTotal` · `maxSources` · `maxStacks` · `maxStat` · `maxStat.basis` · `maxStat.stat` · `maxStat.value` · `maxTargets` · `maxTargetsCounts` · `maxTotalJumps` · `minManaReserve` · `missChance` · `mobLevelSource` · `mobTargetable` · `mode` · `modelKey` · `modifiers` · `modifiers.from` · `modifiers.fromResource` · `modifiers.msBonusTier` · `modifiers.op` · `modifiers.scopeAbilityId` · `modifiers.scopeSlot` · `modifiers.stat` · `modifiers.value` · `moveSpeedMult` · `offsetForwardU` · `onArrive` · `onCap` · `onCarrierDeath` · `onCasterDeath` · `onDevour` · `onDevourPer` · `onEnd` · `onEndOn` · `onEndWhenDead` · `onExisting` · `onHit` · `onHitTargets` · `onHitTargetsMode` · `onInvalidTarget` · `onLand` · `onOwnerDeath` · `onTouch` · `oncePerRoundPerVictim` · `order` · `path` · `payCosts` · `pctCurrentMana` · `pctMaxMana` · `peakAlpha` · `penetration` · `penetration.armorFlat` · `penetration.armorPct` · `penetration.mrFlat` · `penetration.mrPct` · `penetration.scope` · `perDamageFlat` · `perDamagePctOfMaxHealth` · `perMana` · `perRank` · `perRank.duration` · `perRank.modifiers` · `perRank.modifiers.from` · `perRank.modifiers.fromResource` · `perRank.modifiers.msBonusTier` · `perRank.modifiers.op` · `perRank.modifiers.scopeAbilityId` · `perRank.modifiers.scopeSlot` · `perRank.modifiers.stat` · `perRank.modifiers.value` · `perStrike` · `perStrikeSoundKey` · `perTargetLevel` · `permanent` · `permanentScope` · `polarity` · `pools` · `pools.buffs` · `pools.dot` · `pools.shields` · `pools.status` · `preset` · `primaryAttribute` · `projectileId` · `radius` · `radiusTier` · `rankMode` · `ratio` · `refresh` · `refund` · `refund.basis` · `refund.pct` · `refund.resource` · `regenMult` · `requireLearned` · `resource` · `resourcePct` · `resourcePct.basis` · `resourcePct.perRank` · `resourcePct.resource` · `resourcePct.scale` · `resourcePct.subject` · `resourcePctPhase` · `respectCooldown` · `revisit` · `riseSpeed` · `root` · `runOnEmptyHit` · `scale` · `scaleAxis` · `scatterRadius` · `scripted` · `shape` · `side` · `silenced` · `sizeScale` · `slot` · `soundKey` · `source` · `spacing` · `speed` · `spinDegPerSec` · `spread` · `stackKey` · `stackVisual` · `stacking` · `stacks` · `statusId` · `statusImmunity` · `statusImmunity.tags` · `steps` · `steps.duration` · `steps.modifiers` · `steps.modifiers.from` · `steps.modifiers.fromResource` · `steps.modifiers.msBonusTier` · `steps.modifiers.op` · `steps.modifiers.scopeAbilityId` · `steps.modifiers.scopeSlot` · `steps.modifiers.stat` · `steps.modifiers.value` · `stopDistance` · `stopOnCasterDeath` · `stopShortUnits` · `store` · `strikeReposition` · `strikeReposition.distU` · `strikeReposition.ringN` · `strikeReposition.stepPerStrike` · `strikeReposition.who` · `strikes` · `stun` · `subtractGap` · `target` · `targetMode` · `targetPriority` · `targetsAllies` · `team` · `teamCharge` · `text` · `thresholdPctOfMax` · `throughShields` · `throwDistance` · `tickOnApply` · `tint` · `to` · `touchOncePerTarget` · `touchRadius` · `touchSide` · `typeStreakImmunity` · `typeStreakImmunity.damageTypes` · `typeStreakImmunity.resetMode` · `typeStreakImmunity.streakTimeoutSec` · `typeStreakImmunity.threshold` · `uncontrollable` · `untargetable` · `untargetable.abilityAoe` · `untargetable.autoAcquire` · `untargetable.manualTarget` · `untargetable.mobAggro` · `until` · `velocityAngle` · `vfxId` · `victim` · `victimCondition` · `vision` · `vision.stealthFadeDelaySec` · `vision.trueSightRadius` · `who` · `width`

**條件葉種類**（6）

`chance` · `equipment` · `kind` · `recentCast` · `stat` · `status`

**條件葉參數**（16）

`abilityId` · `is` · `itemId` · `kind` · `minStacks` · `mode` · `op` · `other` · `p` · `slot` · `stat` · `statusId` · `subject` · `tag` · `value` · `withinSec`

**hook 參數**（21）

`abilitySlot` · `chance` · `chanceFrom` · `condition` · `consumeOn` · `critSource` · `damageCrit` · `damageSource` · `damageType` · `effects` · `internalCooldown` · `internalCooldownScope` · `key` · `maxTriggers` · `on` · `onConsumed` · `perTarget` · `reflectedDamageSource` · `reflectedDamageType` · `target` · `victim`

**靈氣參數**（8）

`affects` · `hooks` · `includeSelf` · `key` · `lingerSec` · `modifiers` · `radius` · `scaleByNearby`

**`ability@1` 頂層欄位**（38）

`augment` · `castTimeSec` · `castTimeTier` · `castType` · `cooldown` · `cooldownShape` · `cooldownTier` · `description` · `effects` · `hitFeel` · `icon` · `id` · `innateActivePassive` · `innateKind` · `interruptOn` · `manaCost` · `manaCostTier` · `marks` · `maxRank` · `name` · `passive` · `persistentVfx` · `provenance` · `radius` · `radiusTier` · `range` · `rangeTier` · `rangeUnlimited` · `recoveryRoots` · `recoverySec` · `rootWhileCasting` · `sfxKey` · `slot` · `targetsEnemies` · `template` · `toggle` · `vfxKey` · `vfxLayers`

## 10. ⭐ 一次產出很多支的時候 —— 一件事一份檔

⚠️ **這一節在 2026-08-20 之前不存在**，而它少的不是規矩是**吞吐**：在此之前引擎的 40 個 effect 種類住在**同一個 4,754 行的檔**，於是任何一個新機制都要碰那一個檔，兩件同時進行的工作就在排同一個隊。第 3 節那張表就是拆完的結果。

### 10.1 你交出來的每一份東西都應該是一個**新檔案**

| 你要產出／修改的東西 | 一份寫在哪 |
|---|---|
| 一支技能 | `content/abilities/<技能 id>.json` |
| 一位英雄 | `content/champions/<英雄 id>.json` |
| 一件道具 | `content/items/<道具 id>.json` |
| 一個 effect 種類（引擎側，要我們做） | 第 3 節那兩個目錄**各一個新檔** |

⭐ 判準只有一句：**你新增的東西應該是一個新檔案。**如果你發現自己要「打開某個既有的大檔，在中間插一段」，那就是撞車的形狀 —— 兩份同時進行的產出會互相蓋掉，而**被蓋掉的那一份不會有任何錯誤訊息**。

### 10.2 ⛔ 三種檔案你一個字都不要寫

　`_index.json` · `bundle.json` · `manifest.json`

它們是**推導值**，由遊戲端的一支打包程式產生。規則是「**一個產物只能有一個產生器寫**」—— 第二個寫入者不會報錯，它只會讓兩份產物開始分岔，而分岔的那一天沒有任何東西會紅。⇒ 你只要交出**來源文件**，索引由我們這邊重新生成。

### 10.3 需要一個引擎還沒有的機制時，怎麼講

⛔ 不要說「請在那個聯集裡加一個分支」—— 那一支已經不裝種類了。✅ 請寫：**種類名 · 它解鎖哪 N 支技能 · 每支要填哪幾格**。一個新種類對我們是**兩個新檔**（第 3 節那兩個目錄各一個），所以「它解鎖幾支」就是這件事值不值得做的全部依據。

## 11. 🔴 你讀到的 JSON 欄位**不一定是引擎跑的值**

下面這些欄位是**級別欄位**（五格：由後台的級距表把一個級別翻成一個數字）：

　`castTimeTier` · `conditionTier` · `cooldownTier` · `damageTier` · `distanceTier` · `manaCostTier` · `msBonusTier` · `radiusTier` · `rangeTier`

每一格級別欄位旁邊都有一格**原始值**（例如 `rangeTier` 旁邊是 `range`）。規則只有一句：

| 一份文件裡寫了 | 引擎跑什麼 |
|---|---|
| 只有級別 | 級距表查出來的值 |
| 只有原始值 | 文件上那個值（⭐ 這是**留特例**的唯一寫法） |
| **兩個都寫** | **級別贏**。原始值被整格取代 —— ⛔ 不是相加、⛔ 不是取大 |

⛔ **所以「讀原始欄位」不是一個安全的近似。** 出貨內容裡真的有技能的 `range` 與它的 `rangeTier` 差到數倍：檔案上寫著一個很小的數字，引擎跑的是級距表上那個大的。把原始值當成事實去設計、去排序、去算 DPS，得到的結論會是錯的，而**沒有任何一步會報錯**。

**⇒ 交件建議：能填級別就填級別，⛔ 不要兩格都填。**兩格都填不會報錯，只會讓那份文件從此對讀它的人說謊（包括你自己下一次讀它）。

### 11.1 ⛔ 這幾格**還收得下，但不要再填**

⚠️ 它們**不是** `unsupported`：Zod 收得下、引擎跑得動、你不會收到任何錯誤。問題是它們是同一個值的**第二個住處** —— 我們改一次公式表，填了級別的全庫跟著動，填了字面值的那幾支不動。

| 欄位 | 哪一層 | 改填 | 票 |
|---|---|---|---|
| `flat` | 傷害系 effect 的 `amount`（`Scaling`）—— damage / damageArea / damageLine / dot / chainLightning | `damageTier` | GH#534 |
| `perRank` | 同上 —— 傷害系 effect 的 `amount` | `damageTier` | GH#534 |

**`flat` → `damageTier`**：傷害五級距（`config.damage-tiers@1`）在**註冊時**把級別翻成數字，⛔ 是**取代**不是相加 —— 兩格都填的那一份，`flat` 一個位元都不會被讀。而且它是同一個值的**第二個住處**：owner 改一次公式表，填了級別的全庫跟著動，填了字面值的那幾支不動，**沒有任何一步會報錯**。

　⭐ 仍然可以填字面值的例外**判準**（⛔ 不是名單）：
　· ① 這個數字根本不是傷害（護盾／治療／耗魔）—— 五級距只有傷害一條軸
　· ② 判定用的一點（範圍／直線技用一個極小值當「有沒有打到」）—— 作用是觸發不是輸出
　· ③ 持續傷害的每一跳（`dot`）—— 級距錨的是**一次施法**的總量
　· ④ per-hit rider（法球效應／每次普攻追加／多段命中各打一次）
　· ⭐ ④ 的判準是「**這個數字一次施法會發生幾次？**」——⛔ 不是「它的 kind 是不是傷害」。大於一次的就不屬於單發五級距。
　· ⚠️ 完整的分類鍵與逐筆理由在遊戲端的豁免表（`config.damage-tier-exemptions@1`）,⛔ 這裡只放判準：名單會動，而這份契約是逐位元組比對的。

**`perRank` → `damageTier`**：與 `flat` 同一條規則、同一個取代路徑。⚠️ 額外一句：填了級別 = **每一階同一個值**，所以「升階傷害變高」現在由 `ratios` / `attrRatios` 那一面負責，⛔ 不是回頭手寫一條逐階陣列。

　⭐ 仍然可以填字面值的例外**判準**（⛔ 不是名單）：
　· 同 `flat` 的四類

⛔ **例外要帶一個能被反駁的理由** ——「還沒收」不算理由。被豁免的**節點名單**不在這份契約裡（它會動，而這份契約是逐位元組比對的）；判準在上面，名單在遊戲端的豁免表。

## 12. ⭐ 你交出來的 JSON 被拒絕時，你會拿到什麼

遊戲端收件時逐份跑一次**嚴格** Zod 驗證。回傳值只有兩種形狀：

```ts
{ ok: true,  doc }
{ ok: false, issues: Array<{ path: string; message: string; code: string }> }
```

- `path` —— 進到文件裡的**點路徑**（`effects.0.kind`）。**空字串 = 這一層物件本身**。
- `code` —— 機器讀的分類，取自 Zod 的 issue code（`invalid_type` · `too_big` · `invalid_enum_value` · `unrecognized_keys` · `invalid_union_discriminator` …）。
- `message` —— 給人看的英文句子。⭐ enum／discriminator 那兩類的訊息**自己列出合法值**。

⛔ **`issues` 是一個陣列，不是第一個錯誤。** 一次交件請把整批都改完再送 ——逐條修、逐條重送會讓你在同一份文件上來回很多次。

下面每一筆都是把一份出貨技能文件**只弄壞一個地方**再餵進出貨驗證器，真的跑出來的回傳值（⛔ 不是手寫的範例）：

### 12.1 少一格必填欄位

`path` 就是那一格的名字。

```json
{
  "ok": false,
  "issues": [
    {
      "path": "cooldown",
      "message": "Required",
      "code": "invalid_type"
    }
  ]
}
```

### 12.2 引擎沒有的 effect kind

⭐ 拒絕訊息**自己列出**全部合法的 kind —— 這是第 3 節那張表的執行期版本。

```json
{
  "ok": false,
  "issues": [
    {
      "path": "effects.0.kind",
      "message": "Invalid discriminator value. Expected 'damage' | 'damageArea' | 'damageLine' | 'grantAttribute' | 'revive' | 'heal' | 'shield' | 'applyStatus' | 'applyBuff' | 'cycleBuff' | 'restore' | 'spendMana' | 'dash' | 'leap' | 'blink' | 'championForm' | 'spawnProjectile' | 'spawnVfx' | 'dot' | 'summon' | 'invulnerable' | 'knockback' | 'evasion' | 'taunt' | 'grantGold' | 'grantXp' | 'dispel' | 'shieldBreak' | 'devour' | 'modifyCooldown' | 'weightedBranch' | 'swapResource' | 'eventValueConversion' | 'randomArea' | 'delayed' | 'proxyCast' | 'manaBarrier' | 'extendBuff' | 'carry' | 'convertTeam' | 'chainLightning' | 'comboStrikes' | 'pull' | 'spawnModelFx' | 'screenFlash' | 'screenShake' | 'floatingText'",
      "code": "invalid_union_discriminator"
    }
  ]
}
```

### 12.3 enum 值打錯字

同上：合法值就在訊息裡，⛔ 不必回頭查文件。

```json
{
  "ok": false,
  "issues": [
    {
      "path": "castType",
      "message": "Invalid enum value. Expected 'targeted' | 'skillshot' | 'ground' | 'self' | 'dash', received 'point'",
      "code": "invalid_enum_value"
    }
  ]
}
```

### 12.4 多打了一個引擎不認得的鍵

⚠️ `path` 是**空字串**＝這一層物件本身。⛔ 未知欄位不會被忽略，整份會被拒絕。

```json
{
  "ok": false,
  "issues": [
    {
      "path": "",
      "message": "Unrecognized key(s) in object: 'manaDrain'",
      "code": "unrecognized_keys"
    }
  ]
}
```

### 12.5 數字超出上下界

上下界住 schema，⛔ 不在這份文件裡；被拒絕時訊息會說出那個界。

```json
{
  "ok": false,
  "issues": [
    {
      "path": "maxRank",
      "message": "Number must be less than or equal to 6",
      "code": "too_big"
    }
  ]
}
```

### 12.6 🔴 軟參照指到不存在的東西

⭐ **它回 `ok: true`。** 逐份驗證**不查參照** —— 參照是整批載入時才解的（解不開的那一份會被隔離，理由 `dangling-ref`）。⇒ ⛔ 一次乾淨的逐份驗證**不代表**你的 `vfxKey` / `projectileId` 指得到東西。

```json
{
  "ok": true
}
```

### 12.7 ⛔ 通過驗證**不等於**上得了線

這一關只回答「這份 JSON 的**形狀**對不對」。它 ⛔ 不回答：① 參照指不指得到（見 12.6）② 用到的 capability 引擎有沒有（那是第 1、2 節的事，會回 `unsupported-runtime`）③ 這條 modifier 在出貨設定下改不改得動任何數字。

⇒ **收到 `ok: true` 之後仍然要拿第 2 節的不可使用清單自己掃一遍。**

---

這份檔案由 GGD repo 的匯出工具產生，並由一條 CI 閘（`--check`）保證它跟引擎同步：引擎改了而清單沒重新產生，建置就會紅。所以**清單過期**這件事不會靜悄悄地發生。
