# 新 37 名英雄：43 題本機推論診斷

本次排序：基底 > R7 > R3。既有微調版本在這批資料沒有改善，且三者都有 1 題錯誤放行。不能宣稱微調普遍無效，也不能拿這份小樣本宣稱任何模型已可上線。

## 實測結果

| 模型 | 正確／43 | 正確率 | 錯誤放行 | 43 題程序耗時 | Metal 峰值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| base | 41/43 | 95.35% | 1 | 20.20 秒 | 8.61 GiB |
| r3 | 37/43 | 86.05% | 1 | 20.80 秒 | 9.03 GiB |
| r7 | 39/43 | 90.70% | 1 | 20.16 秒 | 9.03 GiB |

| 任務 | 基底 | R3 | R7 |
| --- | ---: | ---: | ---: |
| hero-source | 6/6 | 4/6 | 5/6 |
| owner-mechanism | 35/37 | 33/37 | 34/37 |

三組程序耗時合計 61.16 秒，另有執行前後模型雜湊驗證時間。所有 129 次輸出格式合法、無生成錯誤／截斷。耗時是短 JSON 分類，不可外推完整英雄生成速度。Metal 峰值不等於整機 RAM；未量測瓦數或電池淨充電。

## 配對差異與洞察

- R3 相對基底：修正 0 題、退步 4 題，少 9.30 個百分點。R7：修正 0 題、退步 2 題，少 4.65 個百分點。
- 新增退步都朝 not-stated 偏移：模型把來源的明確矛盾（或明確支持）誤當證據不足。這是本批觀察到的輸出偏移，尚不能歸因於某個訓練樣本或過擬合。
- 共同高風險錯誤是承太郎時停：三者都將「對決倒數跟著暫停」錯誤放行，但來源明寫倒數繼續。同一來源的正向題卻能答對，呈現正反判斷不一致。
- 阿薩謝爾 R→EX 增益反轉、菜月昴 EX 消耗存檔後不得再攔截致死等所選題三者都正確；不等於整招其他條件已完整涵蓋或引擎已實作。
- 不調整答案去迎合模型；本次 6 道至少一個模型答错的題目已逐題重新對照輸入來源，保留標籤與原因。
- 目前不替換或啟用模型。先保留基底作對照與人工覆核；若日後重新授權訓練，應針對支持／矛盾／未提及的區分補資料，再用獨立來源集驗證，不能以這 43 題重考當泛化提升。

## 範圍與可重現性

本次是校正資料集 555 題中的 43 題，涵蓋 13 名角色、16 個來源單元（6 題角色設定、37 題技能原意）。不是全部 37 名／222 槽驗收。題目在模型輸出前固定；同來源正反例相關，不把 43 題當作 43 個獨立來源推算顯著性。

使用現有本機 BF16 基底及 R3/R7 LoRA，相同提示、順序、逐題種子，temperature=0、presence penalty=0、thinking=false，不加 grammar 或修補輸出。每次僅一個模型，12 GiB 上限、8 分鐘 GPU 截止。輸入 tokenize 全數通過（374–624 token，輸出預留 256）。

新 555 題沒有被用來訓練此次模型，但其分類仍為 train-candidate，不是已證明全歷史去重的獨立測試集。它只能驗證給定來源文本的判讀，不能確認外部原作正確性、模板支援度、實際遊戲行為或視覺。

執行前後基底及兩份 adapter 的內容雜湊皆通過；訓練呼叫 0，未修改舊 CANCEL、模型、正式資料集或發布設定。已結束本次 worker 並釋放自己的 GPU lock。

## 逐題錯誤覆核

### 阿薩謝爾 — community37-566d8fe592ba5267de58

Claim：資料已確認 FAINAL 拼字經漫畫原頁逐字核實。

預期：contradicted；base=contradicted；r3=not-stated；r7=not-stated

來源明寫尚未核對漫畫原頁；claim 偷換成已逐字核實。R3/R7 將明確相反誤判為未提及。

### 空條承太郎 R 白金之星・世界 — community37-cdeccc8850edfa13b33b

Claim：對決倒數也隨時停暫停，直到時停結束才繼續。

預期：contradicted；base=supported；r3=supported；r7=supported

來源明寫對決倒數繼續，三個模型卻都支持倒數暫停。這是共同錯誤放行，不是新增引擎缺陷證據。

### 卡比 Q 吸入 — community37-6845135b208daedff94d

Claim：吸入可同時含住三個目標。

預期：contradicted；base=not-stated；r3=not-stated；r7=not-stated

本槽規格是短暫含住一個合法對象，claim 改成同時三個；三者都答未提及。保留原標籤，不為配合模型改來源；若 Owner 要允許多目標，需另作規格變更。

### 阿薩謝爾 — community37-8623a0fb326b96d93180

Claim：阿薩謝爾指アザゼル篤史，FAINAL 的拼字尚未核對漫畫原頁。

預期：supported；base=supported；r3=not-stated；r7=supported

角色實體與尚未核對兩項都在輸入中。R3 錯答未提及，R7 與基底正確。

### 安茲·烏爾·恭 E 高階傳送 — community37-d0fc3a1fde4fbc9f7a8d

Claim：可傳送到不合法的落點。

預期：contradicted；base=contradicted；r3=not-stated；r7=not-stated

來源規定合法落點，claim 換成不合法落點；R3/R7 將相反規則誤判為未提及。

### 菜月昴 R 死亡回歸 — community37-2ba3d5632b85bae195f0

Claim：回到存檔會同步倒轉全世界時間並重置冷卻。

預期：contradicted；base=contradicted；r3=not-stated；r7=contradicted

來源明定世界時間與冷卻繼續，claim 偷換成全世界倒轉與冷卻重置；R3 漏判明確矛盾。

## 證據與交接

- `PREPARATION.json`、`token-budget.json`：凍結與輸入檢查。
- `base-raw.json`、`r3-raw.json`、`r7-raw.json`：129 次原始輸出與耗時。
- `comparison.json`、`analysis.json`、`error-review.json`：逐題配對、混淆矩陣與重新覆核。
- `models-before.json`、`models-after.json`、`summary.json`：模型完整性及停止狀態。
- `report.mjs`：僅 CPU 重評分與報告產生，不會啟動模型。

Main 回饋：此為模型／資料判讀問題證據，不是新增產品 regression 或原作查證結果。不可因本批高分將 source 判讀器當作技能編譯器的放行權威；共同時停反例應保留為回歸案例。本次未新增外部 issue。
