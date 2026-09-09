# Hero74 長序列梯度記憶體修正

2026-09-09。承接 `hero74-training-v2` 的 500 train／119 internal-dev；不是重新選資料，不截斷，模型仍為固定 Gemma 4 12B IT 8-bit、末兩層 q/o LoRA、rank 8。未獲正式訓練通過證據前不產生 release。

**最新結論：v15 的四種格式完整長度梯度探針 4/4 通過，最長 29,996 tokens。單步時限通過；全量單輪保守估時 58,221.86 秒（16.17 小時）超過 7,200 秒設定，`fitsTimeBudget=false`，所以沒有啟動正式 500 步，也沒有新 adapter。** 此為容量進展，不是微調品質／可上場成果。

## 問題與實測進展

MLX 0.32.2 的 trace 保留計算圖；`eval` 與 `stop_gradient` 並不自動把已算區塊變成無父節點的數值。參照 [MLX custom_function 契約](https://ml-explore.github.io/mlx/build/html/python/_autosummary/mlx.core.custom_function.html) 與固定 [v0.32.2 transforms 原始碼](https://github.com/ml-explore/mlx/blob/v0.32.2/mlx/transforms_impl.h)。下列是本機實測，不是官方效能聲明。

| 版本 | 修正 | 最後觀察到的阻擋 | 探針總秒數 | 權重更新 |
|---|---|---|---:|---:|
| v7（舊 124 筆池） | frozen prefix＋stop_gradient | 注意力前向 active 37.81 GB | 32.08 | 0 |
| v8（新 619 筆池） | 區塊結果顯式數值 leaf | 第二個尾層注意力前向 active 31.76 GB | 46.12 | 0 |
| v9 | 尾層 frozen MLP 分塊 | 前向完成，loss backward active 30.62 GB | 44.11 | 0 |
| v10 | 兩層分開重算／鏈式 VJP | MLP 反向通過，attention backward active 30.11 GB | 56.12 | 0 |
| v11 | 顯式 attention 導數 | 2/4 格式通過，25,909-token 樣本仍超 active 上限 | 194.70 | 0 |
| v12 | 試做 frozen norm 分塊 | 記憶體反而退步，已撤回此項；僅 1/4 通過 | 120.46 | 0 |
| v13 | host FP32 attention 梯度累加 | 3/4 通過；29,996-token HERO 反向 active 31.67 GB | 212.79 | 0 |
| v14 | VJP 邊界數值化 | 仍為 3/4，未改善最後 HERO 的 active 峰值 | 214.89 | 0 |
| v15 | 當前 block 才轉 FP32，保留等價 cast 邊界 | **4/4 完整梯度通過**；單輪時程閘未通過 | 224.86 | 0 |

v7–v10 出錯樣本均為既有原生 `godie-h02k:R`、完整 22,028 tokens；之後版本的失敗樣本／覆蓋如表。表中的 GB 是十進位 active 值，不是 GiB，也不是所有階段的 peak；active 保護線保持 28 GiB（約 30.06 GB）。瞬間 allocator peak 可以高於這條 block 邊界 active 檢查值，不能聲稱總峰值被硬限制在 28 GiB；系統 RAM／swap 仍由 supervisor 監控。

v8–v14 均由 supervisor 確認終止並 join 自己的 worker；全程接電／電量 100%，相對開跑前觀察到的 swap 增量 0，原本既有 swap 不代表此次產生。精確狀態、原始 memory trace、來源快照及 hash 在各自 `hero74-memory-v*/`。

v13 三筆完成的真實完整梯度：native-slot 22,028 tokens／40.05 秒／peak 31.43 GB；hero-slot 24,781 tokens／51.62 秒／peak 33.73 GB；native-content 25,909 tokens／56.56 秒／peak 34.72 GB。最後 hero-plan 29,996 tokens 尚未完成。不是抽三筆訓練，這是四種格式的最長序列／答案容量前置檢查；train/dev 仍為 500/119。

### v15 最終收據

| 格式／樣本 | 完整 tokens | 答案 tokens | 完整前向＋反向秒數 | peak Metal（GB） |
|---|---:|---:|---:|---:|
| native-slot／godie-h02k:R | 22,028 | 912 | 42.31 | 29.28 |
| hero-slot／community-review-02-20260907:PASSIVE | 24,781 | 2,834 | 51.76 | 31.31 |
| native-content／godie-h02k:HERO | 25,909 | 4,799 | 52.28 | 32.19 |
| hero-plan／community-review-02-20260907:HERO | 29,996 | 8,049 | 66.97 | 35.26 |

每筆包含完整來源與答案，全部 8 個 trainable tensor 梯度有限；probe 前後 adapter 初始參數保持不變。Supervisor 狀態 completed、已 join worker／釋放自己的鎖；本輪總 224.86 秒，最低可用系統 RAM 53.87 GB，接電／電量 100%、觀察 swap 增量 0。這不是整批 500 步訓練或所有英雄生成驗收。

詳見 `hero74-memory-v15/receipt.json`、`probe/result.json`、`probe/kernel-equivalence.json`、`probe/memory-trace.jsonl` 與同版來源快照。原資料 hash、超參數與資源／時限設定都未放寬。最高瞬間 Metal peak 35.26 GB，不等於 block 邊界的 28 GiB active 上限；不要把二者混寫成 28 GiB 總記憶體硬上限。

## 新演算法與保真界線

- frozen prefix 仍在梯度追蹤外計算；末兩層都仍有可訓練 q/o LoRA，不縮成單層。
- attention、frozen MLP、completion loss 分塊保留全部 token。顯式 NumPy 數值複製只用來切斷內部 graph 引用；BF16 透過 FP32 值還原，不改變原 BF16 數值。
- 尾層 checkpoint full hidden states，逐層重算一階 VJP，仍把全部 prompt／answer 位置與跨層梯度串回每個可訓練 tensor。
- 顯式 SDPA 一階導數處理 attention backward，GQA 的 K/V 跨 head／query-block 貢獻用 host FP32 累加；保留原 causal／sliding mask。host buffer 成本不能藏在 Metal active 數字外，另受系統 RAM／swap 保護。
- 此 helper 僅支援固定純文字、無 KV cache、無 MoE／共享 KV／per-layer input 路徑；不支援高階導數。frozen MLP／norm 若有可訓練參數即拒絕，不偷偷丟梯度。
- 分塊與 dense 控制使用相同 FP32 attention 後還原 activation dtype。不是對舊 BF16 attention 的等價證明；未來 base／adapter 必須共用明列的算術政策。

CPU memory tests 8/8，含 Q/K/V 導數、GQA、遮罩、不同 head width、BF16、全部答案、frozen MLP、兩層完整 completion-only 梯度及參數復原。Supervisor tests 7/7；receipt tests 2/2；prefix audit tests 2/2。實際 12B 1,153-token kernel 控制保留固定 2% 相對 L2 上限；v8–v10 最大約 0.732%，各版實際值見各自 receipt。小控制只證數值，不代替全長容量。

## 當前狀態

v15 改為只在當前 attention block 轉 FP32，原 BF16 Q/K/V 保留，不再常駐全段 FP32 副本。每個 token 的前向輸出 cast 後串接，等價於串接後 cast；反向 K/V 完整 FP32 累加後才單次 cast 回原 dtype，沒有改用較低精度 attention。

目前 `fitsStepBudget=true`（各筆小於 120 秒）、`fitsTimeBudget=false`。16.17 小時來自預先固定公式：各格式最慢 gradient 秒數 ×（train 數＋2×dev 數），總和 ×1.5＋300 秒；其中以 gradient 成本代替 dev forward 是保守估法。**不是已量到完整單輪要 16 小時，也不是已獲授權加時。** 現有 guard 阻止開訓，沒有調高 timeout 或刪減樣本繞過。後續先改善重複計算並重新實測；若仍無法符合原上限，須提出具體時程向使用者取得新的明確授權。

## 耗時的下一個可驗證改善方向

`hero-distillation-prefix-audit.py` 對全部 619 筆做純 CPU 盤點（見 `hero74-prefix-opportunity.json`）。只重排 JSON 成員、所有值與答案均保留的假設下：

- 原生 101 筆共用前綴由 78 增至 19,143 tokens；社群 518 筆由 78 增至 20,884 tokens。
- 原總 prompt tokens 13,420,544；重排後 13,419,925。**這不是縮短資料，也不是已量到加速**；只是大量相同公共目錄有機會共用 frozen-prefix 運算。
- 尚未改動凍結資料、沒有 prefix cache 實作。若採用，須另立新輸入版本、保持教師與 split、逐筆驗證因果 KV 位置與 frozen hidden／梯度一致性。只可重用固定 frozen layers 的公共目錄前綴，不能跨 optimizer step 重用 trainable tail，不能加入教師答案或 dev-answer 檢索。
- cache 仍須遵守相同系統 RAM／swap／active Metal 邊界；prefix tokens 不能直接換算成速度倍數。這是降低重複工作以爭取全量單輪的方向，不是授權延長執行時限。
