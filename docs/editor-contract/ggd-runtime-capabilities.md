# GGD 遊戲端執行期能力清單（`ggd-runtime-capabilities@1`）

**指紋 `17f97fa4`** —— 編輯器用它 pin base。指紋只在引擎事實真的改變時才會變。

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
| `hook.on-lethal-damage@1` | ⚠️ 部分支援 | §12 G4 · §13「lethal hook 在 death commit 前」 | 攔截點在 `combat/damage.ts` 的護盾之後、扣血之前，符合計畫的「death commit 前」。⛔ 但**火圈燒傷攔不到** —— `FireRingSystem` 直寫 `hp.hp -=` 不走傷害佇列（無敵也一樣擋不住）。 | packages/shared/src/sim/combat/lethalSave.ts + lethalSave.test.ts（兩個突變都驗過） |
| `effect.charge-ledger@1` | ✅ 支援 | §12 G4 · §13「十二道試煉的 ledger 跨 round 不跨 match」 | — | packages/shared/src/sim/marks.ts（具名標記：count/spent/expiresAtTick/resetOn）。`resetOn:"match"` 就是計畫要的「跨 round 不跨 match」——`SimWorld` 一場比賽一個。 |
| `hook.on-evade@1` | ⚠️ 部分支援 | §7 P1 · §12 G4 | 事件會發到**閃掉的那一方**（`WorldHookSystem` 的 actorKey=target），符合計畫的 defender hook。⛔ 尚未區分「真閃避」與「attacker fumble」，計畫 §13 要求 fumble 零次 —— 這一格還沒守。 | packages/shared/src/sim/systems/WorldHookSystem.ts + worldHook.test.ts |
| `hook.on-ability-hit@1` | ✅ 支援 | §2.1.1（配合 condition.target-status@1） | — | content/schema/effect.ts 的 zHookEvent |
| `effect.modify-cooldown@1` | ✅ 支援 | §12 G4 | — | packages/shared/src/sim/effects/modifyCooldown.ts（`slot` 或 `abilityId` 指名一支；`reduce`/`reduceFlat`/`reset` 三種模式，`basis` 決定百分比的分母是剩餘量還是基礎冷卻）。守衛 packages/shared/src/sim/effects/lane1Kinds.test.ts。 |
| `effect.execute@1` | ⚠️ 部分支援 | §12 G4 · §16.13 · §5「待確認 14」 | 計畫 §160 的最低契約有五項，`devour` 拿到三項：① **typed threshold** ✅ `thresholdPctOfMax` 是逐階陣列（3/5/7/9% 就是四格）；② **hero-only** ✅ `victim: "champion" \| "any"` 是欄位；③ **kill credit** ✅ 它不寫 `hp = 0`，而是推一發 `type:"true"` 進 `world.damageQueue`，所以擊殺賞金 / `onKill` / 掉金幣 / 擊殺語音 / MVP 統計全部走出貨的那一條路。⛔ 缺的兩項，寫技能的人一定會撞到：④ **回復 basis 不是欄位** —— 固定讀施法瞬間的 `hp.hp`（cast-commit 快照），而計畫 §16.13 要問的「讀 cast commit 前還是實際 hpLost」今天只有一個答案且寫死；`healPct` 只是**倍率**，不是 basis。⑤ **invulnerable interaction 沒有欄位** —— 因為走傷害佇列，`refusesDamage` 會讓無敵目標**靜默吞不掉**（既沒有 `pierceInvulnerable`，也沒有「被擋下了」的回饋）。⚠️ 另外它是**吞噬風味**的處決不是中性 primitive：`healPct` 省略 = 1，要純處決得明寫 `healPct: 0`。 | packages/shared/src/sim/effects/devour.ts + devour.test.ts（護盾那條驗過 `throughShields`：致死量含當下吃得到的護盾，否則「即死」會被護盾靜默擋掉） |
| `effect.weighted-branch@1` | ⚠️ 部分支援 | §12 G4 · §16.14（俄羅斯輪盤） | 機制已出貨：一次施放**只 draw 一次** `world.rng`（計畫 §13 的決定性要求），分支各帶自己的 `weight` 與 `effects[]`，總權重 0 在載入時就被擋下。⛔ 但 §16.14 的**機率表語意尚未 owner freeze**（1/6 是「每次獨立」還是「六發彈倉」），所以 importer 在 freeze 之前仍應拒絕 89-002 那一類文件 —— 引擎做得到，規格還沒定。 | packages/shared/src/sim/effects/weightedBranch.ts + lane1Kinds.test.ts（「只抽一次」做過突變驗證） |
| `effect.swap-resource@1` | ✅ 支援 | §12 G4 · §16.16（交換筆記本） | — | packages/shared/src/sim/effects/swapResource.ts —— 依 §16.16 的建議實作：resolve tick 原子交換，各自 clamp 到 [clampMin, 自己的上限]，目標失效預設整招失敗。三個決策點（`resource` / `clampMin` / `onInvalidTarget`）都是欄位，所以 owner 之後改語意不必改程式。 |
| `defense.mana-barrier@1` | ⚠️ 部分支援 | §12 G4 | primitive 已出貨（`manaBarrier`）：`manaBarrierCutFor` 在**扣血之前**把傷害換成扣魔 —— ⛔ 不是受傷後補護盾，魔力真的被扣、期間回的魔力真的會變成新的抵擋量。計畫點名的兩格都在：`perMana` 就是 damage-to-MP ratio，remainder 由函式回傳（抵不完的部分原封不動往下走進 免死 → 血條）。三個決策點都是欄位（`perMana` / `damageTypes` **必填明列** / `minManaReserve`）。⛔ 但**接線還沒接**：它要 `combat/damage.ts` 的佇列排空迴圈呼叫一次（護盾池之後、免死之前），而那支檔案不屬於這一路 —— 在那一行進去之前，44-00 掛得上但擋不了任何傷害。要插的那一行與確切位置寫在 `sim/effects/manaBarrier.ts` 檔頭②。 | packages/shared/src/sim/effects/manaBarrier.ts + lane2Kinds.test.ts |
| `effect.control-restriction@1` | ⛔ 不支援 | §12 G4 | `applyStatus` 目前有 root / stun / silenced / berserk / feared 五個獨立布林（`feared` 是 2026-08-08 為 89-002 俄羅斯輪盤與 52-02/04/002 加的），但**沒有可組合的 typed 控制限制模型** —— 每多一種控制就多一個布林，而「這個狀態擋住哪幾種行為」散落在各個消費端的 if 裡，不是一張表。 | — |
| `scheduler.random-area@1` | ⚠️ 部分支援 | §12 G4 | 排程器已出貨（`randomArea`），而且 §13 要的 draw 預算模型是**明確**的：一次施放固定花 `2 × count` 次 `world.rng.next()`，**全部在施法那一刻抽完** —— 所以「這一波抽了幾次」不受場上人數、也不受它有沒有被打斷影響。到期是**絕對 tick**；方形→圓形用 elliptical grid mapping（`sim/**` 禁三角函式）。⛔ 但**接線還沒接**：`randomAreaSystem` 要被掛進 `SimWorld.step()` 的 7c″（`intervalHookSystem` 之後、`combatResolveSystem` 之前），而 `SimWorld.ts` 不屬於這一路 —— 在那一行進去之前，13-04 / 70-04 排得出來但不會落地。見 `sim/effects/randomArea.ts` 檔頭④。⚠️ `content/templates/expand.ts` 的 `random-barrage` 那 8 張卡**仍然走 `dot`**，遷移到這個 kind 是獨立的一批。 | packages/shared/src/sim/effects/randomArea.ts + lane2Kinds.test.ts（draw 預算做過突變驗證） |
| `effect.extend-buff-on-damage@1` | ✅ 支援 | §12 G4（2026-08-08 覆蓋矩陣 X20：52-01 狂戰士之怒） | — | packages/shared/src/sim/effects/extendBuff.ts —— 「期間每承受自身最大生命 5% 的傷害，延長 2 秒」。⭐ **無狀態**：延長量是這一發傷害的連續比例（總量與階梯式相同），所以不需要累積器、不需要任何新的 SimWorld 欄位，也**不需要任何接線**。`maxRemainingSec` 是**必填**：這條是正回饋（挨越多、越久），沒有上界會變成永久，而症狀是「這個回合打不完」——一個不會讓任何測試變紅的故障。⚠️ 現有詞彙**組不出來**（逐條查過）：`applyBuff.stackKey` 寫的是「重設到滿」不是「延長」，而 `condition@1` 的葉子與 `HookDef` 的過濾器沒有任何一格讀得到「剛剛那一下打了多少」。 |
| `effect.event-value-conversion@1` | ⚠️ 部分支援 | §12 G4 · §16.12（太陰道） | 機制已出貨：來源可選 `incomingDamage`（讀 `EffectContext.incoming`）或 `targetCurrentHealth`（59-01 吞噬的「等同其剩餘生命」），轉成 mana / health，並可順帶給一段限時屬性加成（15-002 太陰道的「短暫加成至 AP」）。⛔ 但 §16.12 的**基數 `raw \| mitigated \| hpLost` 尚未 owner freeze** —— 所以它是一格欄位，出貨預設 `mitigated`（與 `damage.incomingPct.basis` 同一句話）。freeze 之後只要改預設值，不必改程式。 | packages/shared/src/sim/effects/eventValueConversion.ts + lane1Kinds.test.ts |
| `hook.consume-policy@1` | ⛔ 不支援 | §2.1.1.2（雷天大壯「施放技能後的下一次普攻」）· §12 G4 | 一次性消耗沒有形狀 —— `maxTriggers` / `consumeOn` / `expiresAt` / `perTarget` 四格都不存在。⛔ 不可以用 `internalCooldown` 近似成「每 N 秒一次」：攻速快的英雄會**多觸發**、慢的會**漏觸發**，而兩種錯法在畫面上都看不出來（它只是偶爾多打或少打一下）。 | — |
| `hook.on-reflect-success@1` | ⚠️ 部分支援 | §2.1.1 · §12 G4 · §13 | 事件與 provenance 都出貨了：判準是「一發 `reflectDepth > 0` 的封包**真的落地**」，hook 的持有者＝**防禦者**、`target`＝**攻擊者**，而 `EffectContext.incoming` 是**那一發反彈封包自己的** `TriggerDamage`（raw / mitigated / hpLost 三個讀數都是真值），所以 20-002「每次造成 7 倍[反彈]傷害」寫得出來 —— 用 `damage.incomingPct`。⚠️ 兩個限制，寫技能的人一定會撞到：① 那一發的 `reflectDepth` 已經是 1，child chain 的 `incomingPct` 要一起寫 `maxChainDepth: 1`，否則被鏈深閘擋掉（那是終止性，不是 bug）；② `incomingPct.perRank` 的上界是 `INCOMING_PCT_MAX = 5`，所以「7 倍」要靠`amount` 那一項補，不能寫成單一個 7。⛔ 計畫 §2.1.1 四項 provenance 裡的**原傷害**沒有進 payload：`TriggerDamage` 是封閉型別，而同一個 tick、同一個持有者的 `onDamageTaken` 已經帶著它 —— 再塞一份進來就是第二個真相。要「原傷害的百分比」請掛在 `onDamageTaken` 上。 | packages/shared/src/sim/combat/damage.ts（push 點）+ packages/shared/src/sim/systems/ReflectHookSystem.ts（dispatch）；守衛 reflectHook.test.ts（不該發的時候不發）+ reflectSuccessProvenance.test.ts（provenance 到得了 child chain，且交給它的是反彈傷害不是原傷害；三個突變都驗過） |
| `effect.target-set-chain@1` | ⛔ 不支援 | §6 P1 · §12 G4 | selector 選出的 victims 沒辦法安全傳進 nested Product chain。現況：`shape:"circle"` 只在**單一 effect 內**解目標，跨 effect 傳遞要靠上游 ctx.targets。 | — |
| `effect.attack-dash@1` | ⛔ 不支援 | §2.1.1 | 「每次普攻向目標短距離衝刺」需要 collision + target invalidation + exactly-once，`dash` kind 三者都沒有。 | — |
| `effect.dash-on-end@1` | ⛔ 不支援 | §2.1.1 P1（條件式）· §16.7 | 計畫自己說這個**只有在 owner 選擇 collision-aware 停止語意時才要做**；固定落點的案例用既有 `leap.onLand` 就精確表達得出來。⛔ 在 §16.7 freeze 前不要宣告它。 | — |
| `state.exclusive-group@1` | ⚠️ 部分支援 | §12 G4 · §16.15（涅吉三形態） | ✅ 15-02/03/04 逐字寫的「([變身]為唯一狀態不可疊加)」**對變身成立，而且是結構性的**：一個實體只有一格形態、一個身體只有一個 `championId`，所以第二個形態不可能與第一個並存 —— ⛔ 技能文件**不需要、也不應該**自己檢查「我是不是已經變身了」。重複進入時「舊形態的剩餘時間怎麼辦」是欄位（`champion@1.transform.reenter`：`restart` / `keepLongest` / `reject`），預設 = 出貨現況，被回絕會走 `castRejected`。⛔ 仍缺兩件，**涅吉三形態今天仍然表達不出來**：① **它只是【變身】的互斥，不是泛化的互斥狀態群** —— 沒有「這三個 buff 互斥」的模型，而 15-02/03/04 讀起來更像三個**屬性狀態**（移速倍率／攻速％／普攻附加傷害）而不是三個 3D body；② **一個英雄只有一個 `transform.counterpartId`**，而 `championForm` effect 的 `to` 只有`alternate`/`base`/`toggle`，沒有「變成指定的那一個形態」—— 所以第二個**不同**的形態根本不是目的地：再施放一次只會刷新當前形態（WC3 Metamorphosis 的語意，刻意保留）。⚠️ 這兩件都卡在計畫 §16.15 還沒裁決「三個 gameplay state 還是三個 3D body」——⛔ 在那之前不要把三形態降級成三個獨立變身，那會是一個**看起來**能用的錯誤答案。 | packages/shared/src/sim/systems/ChampionFormSystem.ts + sim/championFormExclusive.test.ts（四個突變都驗過會紅：拿掉 `sc.championId` 的寫入、`championForm.set` 改成不覆寫、拿掉 `keepLongest`、拿掉整個 `reject` 分支） |
| `state.lifecycle@1` | ⚠️ 部分支援 | §12 G4（與 `state.exclusive-group@1` 同一列）· §13「風王結界手動關閉與 MP 不足自動關閉都走同一個 onExit child」 | ✅ 計畫 §13 逐字要求的那一條**已經成立**：`exitToggle()` 是全專案唯一的關閉出口，手動關閉（`castAbility` 第二次按下，刻意排在冷卻閘之前）與 MP 不足自動關閉（`toggleUpkeepSystem`）都只是呼叫它，所以「關閉時釋放風王鐵槌」不可能只發生一半。開關成本（`ability@1.manaCost`）與維持成本（`toggle.upkeepCost`）是兩個獨立數列，節奏 `none`/`perAttack`/`perSecond` 是欄位。⛔ 仍缺三件：① **stable state key 與 exclusive group** —— 一顆按鈕一個切換，沒有「這三個狀態互斥」的模型（那一半是 `state.exclusive-group@1`）；② **duration / refresh policy** —— 切換沒有自帶時限，要限時請用 `applyBuff`；③ **死亡不觸發 onExit** —— 屍體不付維持成本但旗標留著，「大招要不要從屍體放出來」是一個還沒裁決的決策點，⛔ 不可以在遊戲端偷開第二條出口去補它。 | packages/shared/src/sim/abilities/toggle.ts + toggle.test.ts（三個突變都驗過會紅：拿掉自動關閉、拿掉 perAttack 節奏閘、拿掉 onExit 的 runEffects） |
| `condition.has-equipment@1` | ✅ 支援 | §2.1.1.2（77-002 御雷劍）· §12 G4 | — | packages/shared/src/content/schema/condition.ts 的 `zEquipmentItemLeaf` / `zEquipmentTagLeaf`（⭐ 一個 UNION 而不是一個帶兩個 optional 欄位的物件，所以 `{itemId, tag}` 同時寫是 **PARSE ERROR**，不會安靜地由求值端替作者決定哪一格贏）+ packages/shared/src/sim/content/condition.ts 的求值與中文標籤。✅ 計畫要的「只接穩定 itemId、禁止用顯示名稱連結」成立：`itemId` 走 `zRef<ItemId>("items")`。⚠️ 對方要知道的一件事：那個 ref 是 **soft**（御雷劍那一族的道具文件還沒進 `content/items/`），所以打錯的 itemId **不會在載入時被擋**，它只是永遠不成立。 |
| `condition.stack-count@1` | ⛔ 不支援 | §2.1.1.2（層數門檻）· §12 G4 | 「≥N 層才觸發 / 滿層引爆」沒有 typed condition。⛔ 不可以用 `chance` 近似（那是機率不是計數），也不可以用 `stat` 近似（讀的是別的池子）。 | — |
| `condition.ability-state@1` | ⛔ 不支援 | §2.1.1.2（哥哥、絕。暗殺奧義、虛化）· §12 G4 | 「某支技能正在冷卻 / 已學會 / 正在開啟」問不出來 —— `zConditionLeaf` 沒有這一種葉。⛔ 禁止以技能顯示名稱（「哥哥」「千年練成」）連結（計畫 §2.1.1.2 逐字）。 | — |
| `ability-augment@1` | ⚠️ 部分支援 | §2.1.1 P1 · §12 G4 · §13 | ✅ 計畫 §4.4 的兩條禁令都守住了：目標是 **exact ability ref**（`zRef("abilities")`，不是槽位、不是名稱文字），操作是一個 **allowlist enum** —— `procChance`（改機率）/ `durationSec`（改持續時間）/ `damageCoeffAp`（加 AP 傷害係數）/ `thresholdPct`（改門檻），四個剛好對上四支出貨卡（77-002 / 77-002 / 70-002 / 59-001），⛔ 沒有位置 JSON Pointer。每個 op 的 `value` **兩端都有界**（`AUGMENT_OP_BOUNDS`），`mode` 只有 `set` / `add`。**fail closed 在載入時**：目標指不到就 `DanglingRefError`（`content/refs.ts::abilityRefs` 推的是**硬** ref edge），不是執行期靜默跳過；`thresholdPct` 另外強制填 `nodeKind`，那一格就是 §13「不得套到相鄰效果」的閘（一棵 condition 樹裡通常不只一個 `value`）。⛔ 仍缺三件，寫技能的人一定會撞到：① **這一版是執行期，不是編譯期** —— 計畫要的 reverse dependency closure 重編需要一個住在 `content/registries.ts` 的 compiler。現在是 `abilityPassives.ts::rankBlock` 在把 passive 區塊組成 `ModifierSource` 的那一刻讀 augment 表再算（**可觀測等價**：同一組 ops、同一個目標解析、同一份界），但沒有 closure、不遞迴（強化一支自己也被強化的技能不成立）；② **只有被動區塊這一個 seam 接上了** —— 主動施放路徑（`castAbility` 讀 `def.effects`）還沒問過 augment，所以 70-002 / 92-002 那種「強化一支**主動技**的傷害」今天拿不到；77-002（77-02 的 proc 機率 / 77-03 的持續時間）與 59-001（59-00 hook 的門檻）拿得到；③ **`nodeKind` 是自由字串**（condition 的 kind 表住在另一份 schema，抄過來就是第二份會過期的真相），所以打錯字 = 那條操作匹配不到任何節點、靜默無效。⛔ 不要假裝它會紅。 | packages/shared/src/sim/abilities/abilityAugment.ts（收集 + 純改寫）+ packages/shared/src/sim/abilities/abilityPassives.ts（唯一接上的 seam）；守衛 packages/shared/src/sim/abilities/abilityAugment.test.ts（兩個方向一起讀：學了 → 真的變；沒學 → 一格不動。突變驗過會紅） |
| `defense.block-source@1` | ⚠️ 部分支援 | §2.1.1 P1 · §12 G4 | `BlockGrant`（含 `lethalOnly` / `lethalBasis` / `internalCooldown` / 鏈式獨立判定）已出貨且時序正確（`mitigate()` 之後、護盾之前），寫入點現在有**兩個**：道具（`economy/itemSource.ts`）與**技能被動**（`ability@1.passive.ranks[].block` → `abilities/abilityPassives.ts`，配 `whileForm` 就寫得出「卍解狀態下才格擋」）。兩者走同一個 `ModifierSource.block`，所以鏈式判定與型別過濾逐條相同。⛔ 仍然缺的是**限時 buff / status 授予格擋**：`applyBuff` 掛上去的來源沒有這一格，所以「接下來 5 秒內格擋」還是沒有形狀。⚠️ 另外 `internalCooldown` 的記帳住在 source 上，而技能被動的 source 在升級 / EX 解鎖 /變身時會 detach + attach，等於冷卻歸零 —— 出貨的兩支技能格擋都沒有 ICD，所以今天不可觀測。 | packages/shared/src/sim/combat/blockFromPassive.test.ts |
| `effect.convert-hit-damage-type@1` | ⚠️ 部分支援 | §2.1.1 P1 · §12 G4 | `damageTypeOverride` 能轉換傷害型別且有 `impactGateType` 處理擊倒閘，但計畫要的是「以逐級機率把**該次普攻**完整轉成真傷」—— 逐級機率那一格沒有。⛔ 不可以改成「另外補一段真傷」，那是不同的東西（計畫 §2.1.1 明列）。 | packages/shared/src/sim/combat/damageTypeOverride.ts |

## 2. ⛔ 不可使用清單

編輯器產出的內容只要用到下列任何一項，遊戲端就會回 `unsupported-runtime`：

- `condition.ability-state@1`
- `condition.stack-count@1`
- `effect.attack-dash@1`
- `effect.control-restriction@1`
- `effect.dash-on-end@1`
- `effect.target-set-chain@1`
- `hook.consume-policy@1`

## 3. 可以編譯到的 effect 種類

這是引擎執行期**真的有處理器**的全部種類；不在這張表上的名稱一律會被拒絕。

`applyBuff` · `applyStatus` · `championForm` · `cycleBuff` · `damage` · `damageArea` · `damageLine` · `dash` · `devour` · `dispel` · `dot` · `evasion` · `eventValueConversion` · `extendBuff` · `grantAttribute` · `grantGold` · `heal` · `invulnerable` · `knockback` · `leap` · `manaBarrier` · `modifyCooldown` · `randomArea` · `restore` · `revive` · `shield` · `shieldBreak` · `spawnProjectile` · `spawnVfx` · `spendMana` · `summon` · `swapResource` · `taunt` · `weightedBranch`

## 4. 可以掛的 hook 事件

`onAbilityCast` · `onAbilityHit` · `onBasicAttack` · `onBossSpawn` · `onDamageDealt` · `onDamageTaken` · `onDeath` · `onEvade` · `onFireRingIgnite` · `onGuardianDown` · `onInterval` · `onKill` · `onReflectSuccess` · `onRevive` · `onStunned`

## 5. 可展開的技能模板家族

模板是「參數化的技能骨架」：填參數就展開成一組 effect。下列家族已在遊戲端出貨且可展開（清單由展開器本人過濾，所以不會宣稱一個展不開的家族）。

`buff-self` · `charge-push` · `ground-nova` · `instant-blast` · `leap-strike` · `line-sweep` · `lock-combo` · `mark-stacks` · `on-attack` · `on-hit-react` · `orbit-array` · `proxy-cast` · `proxy-fanout` · `random-barrage` · `single-strike` · `teleport` · `traveling-wave`

## 6. 模擬器能力旗標

| 能力 | 可用 | 限制 |
|---|---|---|
| `applyBuff` | ✅ | — |
| `applyStatus` | ✅ | — |
| `auras` | ✅ | — |
| `combo` | ⛔ | — |
| `conditions` | ✅ | — |
| `dash` | ✅ | — |
| `hooks` | ✅ | — |
| `invulnerable` | ✅ | — |
| `knockback` | ✅ | — |
| `leap` | ✅ | — |
| `marks` | ✅ | — |
| `periodicDamage` | ✅ | — |
| `projectile` | ✅ | — |
| `summon` | ✅ | 召喚物的擊殺歸屬 killCredit: "owner" 尚未實作（施放時會擲錯），其餘欄位皆可用 |

---

這份檔案由 GGD repo 的匯出工具產生，並由一條 CI 閘（`--check`）保證它跟引擎同步：引擎改了而清單沒重新產生，建置就會紅。所以**清單過期**這件事不會靜悄悄地發生。
