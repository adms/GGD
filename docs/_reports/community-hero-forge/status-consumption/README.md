# 資源成本與狀態消耗分支

`ability.statusCost` 在施法開始時，與魔力、冷卻一起支付指定的自身狀態層數。資源不足回覆「技能資源不足」，不扣魔力、不啟動冷卻，也不扣部分層數；目標不合法同樣不付款。吟唱中斷不退還已付成本，沿用 GGD 現有施法成本時機。省略新欄位的技能沿用原行為。

新積木 `consumeStatus` 原子扣除足額層數後只執行 `onConsumed`，不足則只執行 `onMissing`。`count` 可選數字或 `all`；後者移除所有符合的有效層數。`appliedBy: self` 只計入當前施法者明確擁有的狀態。`subject: self` 只扣自身一次並保留分支目標，`target` 對各目標分別結算；圓形取人沿用引擎既有幾何。先消耗最早到期的層數，忽略過期紀錄；具名計數器扣到零仍保留，能再次累積，既有 perStackLost 與 HUD 事件照常生效。暫時狀態、具名計數器及 buff 來源可消耗，不拆除裝備、常駐被動或光環的來源。部分 buff 扣層會重算屬性，相同來源 ID 的不同實例以實際物件識別移除。

阿薩謝爾的 R→EX 契約在測試夾具中確認：自己施加的 R 屬性詛咒被移除後，敵方取得 AD/AP 增益，不執行普通 EX 傷害。無詛咒、已淨化、精確到期、另一施法者的詛咒走普通分支；兩名施法者同 tick 交錯、控制免疫、圈外目標、重複目標、跨狀態池扣層與高於 HUD 上限的 buff 都有案例。另有實際 `castAbility` R→EX 與淨化後 EX 的整合測試，確認狀態判斷與三層施法成本能一起工作。

編輯器新增「指定數值／全部」控制項，數字保留 1–999 的限制，不必輸入 JSON。成功與不足分支都能編輯，預覽文字區分兩條路。數值／字串聯集只辨識這個可明確建模的形狀，沒有展開其他遞迴條件。`ui/` 是隔離 Editor 的實際控制項截圖與收據：在未儲存的 `godie-e001.q` 示範表單操作，填入狀態、成功分支及成本，最後重載捨棄編輯；沒有送出寫入要求。這是表單與文字預覽驗收，不能當成阿薩謝爾的原作畫面驗收。

核心／回歸 **12 檔 99 項**、Editor 控制項 **5 檔 21 項**通過；shared、Editor、client TypeScript 通過。完整 Editor release 為 **555 項通過，production build 成功**。三門檻 skills／Editor release／coord 為 **1／0／0**：skills 已通過這次能力、積木及文件更新，仍被既有 2026-09-06 訊息帳本未對票擋住。當日 14 則漏列在工具中明示不阻擋。詳見 `gates.json` 與原始 log，各組測試可能重疊，不相加為不同案例總數。

刻意把成功分支改為普通分支時，測試抓到生命由 1684 錯扣為 1614；還原前後 handler 的 SHA-256 相同。最初失敗紀錄也保留：補齊遞迴子鏈、表單種類清單與預警幾何的型別接線；更正測試把「未開始吟唱」強求為 null，以及把 Scaling 物件誤認為既有 no-op 偵測器的純數值輸入。R→EX 施法夾具最初借用了 Sela 的命中灼燒被動，造成額外傷害；確認來源後移除該不相干被動，沒有修改正式引擎的既有命中觸發規則。

本批沒有改寫 37 名英雄的原始描述、沒有把 requiredRefinement 標成完成，也沒有投稿或發布新的英雄。阿薩謝爾仍需接入每次合法技能命中只累積一次的負能量、上限與排除來源、R 的非致死反噬、反轉文字與金色增益／驚愕演出，再驗證正式配方及完整遊戲流程。其餘機制、逐槽特效／音效、當下服務版本的 37 份 ZIP 與投稿審查亦仍在整體目標內。

```sh
pnpm exec vitest run packages/shared/src/sim/effects/consumeStatus.test.ts packages/shared/src/sim/abilities/statusCost.test.ts packages/shared/src/content/consumeStatusContract.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
pnpm --filter @ggd/shared exec tsc --noEmit
pnpm editor:accept:release
```
