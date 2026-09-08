# IR5 全自動工程實驗結果

狀態：completed-experiment-not-promoted

這是小型工程對照，不是正式英雄生成能力驗收。沒有自動發布、模型啟用或視覺驗證。

資料：8 份合成訓練；4 份同家族合成 dev；2 位已曝光真實英雄控制組。名稱有提示、措辭高度重複，不能當獨立泛化證據。

固定 16 steps、rank 8、最後 2 層 q/o LoRA、學習率 2e-5；只評固定末步，不以 loss 或 dev 分數挑 checkpoint。

| 檢查（分母 6） | 基底 | LoRA |
|---|---:|---:|
| jsonValid | 5 | 1 |
| irValid | 0 | 0 |
| compiled | 0 | 0 |
| engineeringPassed | 0 | 0 |
| fullHeroQualified | 0 | 0 |

engineeringPassed 只代表預先定義的工程檢查，不包含完整英雄設定文字判讀或獨立留出驗收。

## 逐例對照

| 案例 | 基底工程通過 | LoRA 工程通過 | 已知來源欄位前後 |
|---|---|---|---|
| community7-lux | False | False | 52 → 55 |
| community7-xerath | False | False | 50 → 0 |
| synthetic-spatial-5-required | False | False | 61 → 0 |
| synthetic-spatial-5-none | False | False | 58 → 0 |
| synthetic-spatial-6-required | False | False | 56 → 0 |
| synthetic-spatial-6-none | False | False | 0 → 0 |

## 結論

完整工程通過數變化：+0/6。無論改善或退步，本批都不具備正式採用證據，模型維持研究用途。

## 訓練收據

訓練步驟耗時：207.44 秒；峰值 Metal：34.27 GiB。
訓練集遮罩 loss：0.137833 → 0.015402；loss 不作採用指標。

Adapter 已保存於 research-adapter；基底權重不在該目錄，須使用 model-card.json 指定的版本。

## 重跑與證據

完整命令、退出碼、耗時及 log hash 在 state.json；原始答案保留在 ir5-base-v1 和 ir5-lora-v1。
執行入口：`python run-ir5-workflow.py NEW_DIRECTORY --allow-engineering-controls`。同名 worker run 不覆寫、不重試；既有完成 stage 只在完整性驗證後重用。

資料／標籤異常停止訓練並寫 data-issues.json；技術或資源故障也停損並寫報告，不自動改資料、提示或評分。
