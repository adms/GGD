# Mac 研究入口 v2：與 R6 相同解碼設定

新入口 `research-inference-v2.mjs` 固定 **4B non-thinking、presence penalty=0、12GiB MLX分配上限**。舊公開入口仍保留原1.5設定供歷史重播；不可把不同設定的結果當成微調前後配對。

它支援來源單句判讀、完整提案／逐項覆蓋檢查、目前單卡、多卡及VFX模板推薦。所有輸出仍是研究用，**不修改技能、不產生參數、不執行視覺驗證、不啟用Editor**。12GiB上限不是16GB實機證明。

從GGD-hero-auto-forge執行，下列路徑需換成實際絕對路徑；新的output目錄必須不存在：

```sh
node tools/forge-training/research-inference-v2.mjs \
  /absolute/path/spec.json \
  /absolute/path/native-reference.json \
  /absolute/path/arm64-venv/bin/python \
  /absolute/path/shared-runtime \
  /absolute/path/new-output \
  2026-09-06T17:21:10Z RESEARCH_ONLY
```

native-reference需明示`decoding.presencePenalty=0`並帶正確adapter摘要；不得為繞過到期檢查修改舊實驗policy。每次最多300秒，4096context保留256輸出，超長拒絕、不截斷。GPU鎖存在就拒絕，不刪鎖或中斷其他模型。來源、目錄、請求、模型與程式摘要都會驗證。

`spec.kind`決定入口：

| kind | input | 目錄 |
| --- | --- | --- |
| source | id、task（hero-source或owner-mechanism）、source、claim | 無；source必須明確鎖定id/name/version/text/sha256 |
| fidelity | 見`r3-fidelity-client.mjs`的提案與已審查requirement輸入 | 無 |
| single | id、request | main-catalog-review-v4.json及內容digest |
| stack | id、request | 已審查32計畫catalog及內容digest |
| vfx | id、task="vfx"、request | 原VFX catalog及內容digest |

範例與事先凍結的10個入口檢查在R6-v2輸出目錄的`manual-entry-v3/`。`EXPECTED.private.json`只供檢查程序對照，**不交給推論入口**。可以複製其他spec JSON作為使用範本；source文字變更時必須重新計算摘要，不能冒用另一英雄／版本。來源入口只判斷呼叫者明確選定的文字，英雄身分曖昧時仍須先用既有hero-source-client解決，不自動套外部作品記憶。

結果：`raw.json`保留原始模型文字；`checked.json`／`summary.json`的`contractPass`只代表格式和已允許模板合法，**不代表語意正確**。多卡保留重複模板ID及合法順序，不補救／修理模型答案。fidelity只檢查提供的requirement，不能證明未列出的完整來源都已涵蓋。所有結果都有`semanticQualified:false`、`releaseQualified:false`、`activation:false`。

目前僅CPU契約／漂移／忙碌拒絕測試通過；10個真實入口會在R6核心及三臂post完成後自動執行，實際狀態和結果以`manual-entry-v3/state.json`及`summary.json`為準。不存在summary就不是已實測。

原`manual-entry-v2`接續在任何GPU入口執行前已停止，保留失敗紀錄。v3只修正準備物件的JSON序列化比對：undefined欄位不再造成誤報；輸入、私有答案、公開推論程式及模型輸出處理均未改變。
