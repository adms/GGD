# 固定四名英雄：結構化解碼對照（事前登記）

本輪不訓練、不新增或修正資料、不修改配方與引擎；它先拆開「輸出契約失敗」與「原文機制理解失敗」，供下一次微調決策使用。

固定 ir2-jsonschema-smoke-v1 的四名開發英雄、原始 messages、native no-thinking prompt、seed 20260908、temperature 0、8192 output tokens、原始正規化／IR／編譯／行為與反例評分器。這不是新增盲測。

兩個預先指定組別：原始 Gemma 4 12B IT 8-bit；原 lora-facts-pilot-v1 第 24 步。對照各自既存的 unconstrained 原始輸出。歷史輸出是重評，不是假稱本輪重新生成；不因結果改組別、挑 checkpoint 或修答案。

唯一生成機制改動：每個序列建立新的 llguidance logits processor，依既存 responseSchema 限制 token。沒有 batching。已安裝 mlx-vlm 0.6.17、llguidance 1.8.0；不安裝套件、不改第三方程式。

相容處理只准將 `$defs/action.oneOf` 的 19 個分支，在程式證明都是 object、op 必填且為不同 const 後，轉成等價 anyOf。其他 oneOf 一律停止；不用 blanket coerce_one_of。原提示仍含原 schema；原始嚴格 schema 和所有語義驗證不變。解碼器只允許 JSON 的固定空白格式，可能改變輸出長度／路徑，因此速度比較包含這個差異。

CPU 先驗證 grammar 能編譯、三份歷史結構合法輸出可接受、錯誤欄位／缺槽／錯誤 op／錯誤字面值／非法逗號被拒、只有完整 JSON 可 EOS。另有結構合法但來源不實的負例，必須交回既存語義閘拒絕；不能把 grammar 通過當作英雄正確。

GPU：一次一個有鎖的 worker，兩組循序；每組最多 20 分鐘、每例 600 秒，原接電／電池下降 2 點／可用 RAM 6 GiB／swap 增加 2 GiB 停止條件不變。OUT/STOP 可停。失敗保留 raw.partial/state/log，不自動重跑。基底全部 11 檔與 adapter 在執行前後驗 SHA；無雲端支出。

逐組分母固定四例，報 JSON、IR／來源錨定、編譯、局部行為與來源反例的分子分母、完整失敗原因、時間與峰值 Metal。不把未進入下游測試的例子移出英雄分母。機制安全優先；完整來源涵蓋與獨立家族留出尚未成立，任何結果均不升級成 95% 全自動成功、模型合格或啟用 Editor。

若只改善格式／編譯但未改善語義與反例，結論只能是解碼層工程進展；不得歸因 fine-tune 成功。所有新文字證據與 script 納入現有研究交付分支，無新權重、無公開推送。
