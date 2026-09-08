# 生命支付與逐階比例編輯

新增 `spendHealth`，在效果清單執行到這一段時，由施法者支付生命。可調固定值／屬性係數、最大生命比例、當前生命比例及生命底線；百分比可共用一個值或逐階設定。各項相加，最多扣到指定底線（省略為 1 HP），已低於底線不會回血。它只支付施法者一次，不隨命中目標數增加，也不進入傷害、護盾、免疫、吸血、傷害觸發器或死亡結算。沒有新增世界狀態池，仍由既有生命快照與 replay digest 保存結果。

`healthSpend` 事件攜帶實扣量，伺服器允許外送，遊戲用「生命支付 -數值」呈現，普查也辨識為獨立遊戲機制。沒有用一般傷害事件冒充生命支付。付款不足會支付到生命底線，**不會**阻止效果清單中的後續技能；需要足額門檻的設計應另用既有條件判斷。

引擎治具用實際 `castAbility` 與 `SimWorld.step()` 驗證 0.8 秒吟唱：開始與等待期間不扣反噬，釋放時支付最大生命 3%，再命中對手；被暈眩中斷時保留已付魔力，但不支付尚未釋放的反噬，也不命中敵方。另涵蓋 1 HP／低於 1 HP、死亡／缺少本體、自訂底線、逐階固定與百分比項、空／重複目標、護盾／無敵、傷害倍率／治療倍率、吸血／傷害觸發、延遲 payload 讀取當前生命、效果順序、條件閘與 replay digest。這是阿薩謝爾 R 所需的共用能力與施法治具，尚未把正式角色配方標成完成。

編輯器新增通用的「所有等級共用／逐階設定」數字控制項，保留數值及陣列長度限制。切回共用採第一階，增加／移除最後一階可直接操作。模式切換清除舊的 raw input 表示法，防止已消失欄位的未完成數字繼續阻擋儲存。只辨識數字與數字陣列的二分聯集，不展開其他遞迴聯集。

`ui/` 是隔離 Editor 的實際表單截圖與收據：3%／1 HP、3%→5% 逐階值、切回共用保留 3%、輸入 `2e` 後切換可清除隱藏錯誤，最後確認 save 可用，再以 revert 還原並重載。全程沒有 POST／PUT／PATCH／DELETE，沒有儲存到來源、投稿或發布。這些是控制項與文字預覽證據；截圖中的 3D 面板仍標示 pending，不能當成原作技能演出或遊戲飄字的畫面驗收。遊戲事件消費端另由實際 VfxSystem／NullEngine 測試覆蓋。

核心回歸為 **9 檔 88 項通過**；shared／Editor／client TypeScript 通過，完整 Editor **558 項與 production build 通過**。三門檻 skills／Editor release／coord 為 **1／0／0**；skills 仍被既有 2026-09-06 訊息帳本未對票擋住，本次契約與派生文件檢查均已通過。最終門檻與完整 Editor 結果見 `gates.json` 及同目錄原始 log，各組可能重疊，不加總為不同案例。刻意移除生命底線時，5 HP 案例落到 0 並使測試失敗；還原前後 handler 的 SHA-256 相同。初次失敗紀錄保留：治具誤改唯讀環境倍率、條件缺少 `mode`；舊的效果清單未列新 kind；實際 UI 發現百分比還是 raw JSON，以及第一次畫面腳本期待單一比例而預覽重複顯示各階。修正處理各自原因，沒有把測試失敗當成角色原設計已驗收。

本批沒有改寫 37 名的原文、沒有清除 requiredRefinement，也沒有重建投稿 ZIP 或發布英雄。阿薩謝爾仍需每次合法技能傷害只增加一層的負面能量、來源排除、正式 Q/W/E/R/EX 配方、反轉文字與金色增益／驚愕演出，以及全套多人／淨化／中斷情境的正式內容驗收。原本的 R→EX 同來源詛咒反轉分支與三層消耗已有獨立證據，見相鄰 `status-consumption/`。

```sh
pnpm exec vitest run packages/shared/src/sim/effects/spendHealth.test.ts packages/shared/src/sim/castabilityVfxOnly.test.ts apps/game-server/src/net/eventFanout.test.ts apps/client/src/vfx/VfxSystem.resourceWire.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
pnpm editor:accept:release
```
