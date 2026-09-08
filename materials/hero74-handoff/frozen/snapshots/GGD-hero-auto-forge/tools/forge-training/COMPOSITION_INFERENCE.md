# Mac：已審查單卡／多卡推薦入口

`composition-predict.mjs` 是研究用途的本機入口，不啟用 Editor、不修改技能、不產生參數。它只選已列出的 29 個單卡與 3 個多卡計畫；不任意拼裝，不把缺少必要機制的部分答案當成功。英雄設定與 Owner 原文忠實度仍應先用 `SOURCE_INFERENCE.md` 的入口核對。

輸入 JSON 只有 `id` 和 `request`：

```json
{"id":"my-self-recovery","request":"同次施法立即回復自身生命，並暫時提高自己的攻擊力；不是治療隊友，也不替換技能組。"}
```

從 GGD-hero-auto-forge 執行，路徑替換為實際絕對路徑；輸出目錄必須尚不存在。MODEL_REFERENCE 是已選定模型的 `native-reference.json`，不是 base 目錄。Python 必須為已安裝 MLX 的 arm64 環境。

```sh
node tools/forge-training/composition-predict.mjs \
  /absolute/path/composition-diagnostic-v2/catalog.json \
  1d1c9c9411c51525e9a0c5ba1fd3e715df1004cc7b72a34511141b704b5537be \
  /absolute/path/input.json \
  /absolute/path/native-reference.json \
  /absolute/path/arm64-venv/bin/python \
  /absolute/path/shared-runtime \
  /absolute/path/new-output-directory \
  2026-09-06T17:21:10Z RESEARCH_ONLY
```

本次授權的 GPU 截止是上例時間；過期會拒絕，不應為了重跑而靜默改舊實驗 policy。單次預設最多 120 秒，MLX 分配上限 12GiB；4096 context 保留 256 輸出，超長拒絕而不截斷。共用 GPU 鎖存在時不啟動、不刪鎖、不建立結果目錄。模型、adapter、目錄、輸入、程式及 policy 摘要會綁定並複核。

成功輸出在 `checked.json`／`summary.json`。`classification.templateIds` 是建議卡片；`requiredChoices` 是已審查計畫仍需人工設定的條件。雙斬擊會保留兩個相同 ID；不得去重。回復加增益需要自我回復、相容施法方式；獨立普攻／受傷觸發不是限時按鍵技能。

`contractPass:true` 只代表選了合法計畫，不能證明它完整理解需求；`semanticQualified`、`releaseQualified` 和 `activation` 一律為 false。拒絕只表示此審查目錄沒有推薦完整計畫，不代表引擎所有未列組合都不可能。12GiB 分配限制不是 16GB 實機證明，也不是量化保真證明。

CPU 契約／漂移／GPU 忙碌拒絕測試已通過，公開 builder 重建的 20 題 messages 與凍結診斷完全一致。2026-09-06 21:10 已完成R5 step80真實GPU入口：三個已知模式只 **1/3語意正確**。自我回復加增益輸出未允許的計畫ID；限時主動雙hook錯誤接受常駐被動；同次雙擊正確。結果位於額外四小時目錄的 `recovered-r5-follow-on-v1/follow-on-evaluation-v1/summary.json`。這些不是新來源泛化測試，不參與訓練或選模，答案未傳入模型。**入口可執行不代表模型已可用；不得啟用Editor。**
