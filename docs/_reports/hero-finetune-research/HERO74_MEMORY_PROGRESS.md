# Hero74 長序列梯度記憶體修正

2026-09-09。承接 `hero74-training-v2` 的 500 train／119 internal-dev；不是重新選資料，不截斷，模型仍為固定 Gemma 4 12B IT 8-bit、末兩層 q/o LoRA、rank 8。未獲正式訓練通過證據前不產生 release。

## 後續執行狀態：v20 預檢通過，正式流程正在 dev-before

v20 probe 已 completed、worker 已 join，四種完整格式 4/4 通過；`fitsTimeBudget=true`、`fitsStepBudget=true`、`prefixCacheParityPassed=true`。快取前向／反向依序 20.119、26.732、32.821、45.027 秒；各自未快取對照 44.833、55.184、58.633、65.752 秒，皆小於每段 120 秒。固定估算公式得 31,555.717 秒（8.765 小時），低於核准的 16 小時；估時不是完成保證。

同一受保護 shell 已自動接續 train，於本次記錄時 worker 42858 正在 119 筆 `dev-before`。這是訓練流程啟動，不是 optimizer 已更新；必須以後續 `training-trace.json` 確認更新筆數。probe 和 train 的即時證據位於 workspace `outputs/hero-forge-12b-restart-20260908/full-hero-distillation-v20/`；train 尚未終止，不提前產生完成收據或 release。

新增 CPU-only 推論核心 `tools/editor-acceptance/hero-distillation-generation.py`：119 個 public cases 均通過輸入 hash／契約邊界檢查，6 項單元測試通過。固定所有題目及 base/LoRA 的無思考、greedy、16,384 output-token 上限、256-token prefill；不讀 teacher、不截斷 prompt、不按教師答案長度設輸出限制、不自動重試。保留原始輸出及中途錯誤；即使截斷輸出能解析 JSON 也不能當完整輸出。研究包裝只接受純 JSON 或完整單一 JSON fence，拒絕重複鍵／非有限數字，不代替 Editor #1108。這支是受保護 worker 的待接核心，尚未啟動 GPU 推論，尚缺 final adapter 綁定、數值策略與 supervisor 接線、編譯及對局驗收；CPU 測試不算生成品質。

後續接線：新增 `hero-distillation-infer.py`，`prepare` 僅接受 supervisor 已 completed、worker 已 join、整輪 task 數吻合、固定 final checkpoint hash 與 adapter-roundtrip 全通過的 run，綁定資料／模型／adapter／程式快照，只複製 public cases，不開啟 private teachers。`run --arm base` 或 `run --arm lora` 各用全新 process／model／KV cache，同一 GPU lock 和接電／RAM／swap 保護；已有 run 不重跑、已有 lock 不刪除。每 arm 保守硬上限 7,200 秒、每題／階段 610 秒；這是停機保護，不是已量測可完成 119 題的工期，若達限則保留未完成狀態，不能改小分母或自动續跑。訓練 57,600 秒上限不變。

兩 arm 使用相同 native autoregressive KV + FP32 SDPA forward policy，不套用訓練 custom-VJP／PrefixKV。9/9 測試通過，涵蓋未結束訓練拒絕、輸入／權重／快照漂移、foreign lock、不接電、spawn error 清理、逾時終止與 join、以及小張量的實際 MLX **CPU** GQA／causal mask／BF16 output dtype。首次 sandbox 無法匯入 MLX（No Metal device available），在允許裝置可見後重跑，測試明確設定 CPU 且不載入模型，9/9 通過；這不是 12B GPU 推論通過。尚未對目前 live train 執行 prepare/run；正式 GPU 推論、語意／編譯／對局評分仍待訓練完成。

訓練完成後的命令順序（目前不啟動）：`python tools/editor-acceptance/hero-distillation-infer.py prepare --run <completed-training-run> --evaluation <hero74-eval-plan-v1> --out <new-inference-run>`；再分別 `python tools/editor-acceptance/hero-distillation-infer.py run --run <new-inference-run> --arm base`、`--arm lora`。同題原始輸出與每筆 index 保存，不執行上架、部署、teacher 修補或自動選 checkpoint。

使用者已明確核准「延長到16小時」，見 `time-authorization-16h.json`；下面 v18 的待授權敘述是當時狀態，不再是目前阻擋。

v19 已終止：前 3 種格式通過，最後完整 HERO 觸發 `PHASE_TIME_LIMIT`，optimizer 0。原因是 probe 將一次未快取基準及一次快取梯度合併放在同一個 120 秒階段；不是已證明單次正式 train 超時。原始時間顯示從階段開始到第一個 cached event 為 78.056 秒，之後觀察到 cached 部分又執行 42.140 秒即被停止。這不是精確分段完整耗時，因 trace 抽樣且最後一筆尚未結束；不能把未完成結果當通過。總 417.43 秒、最低可用 RAM 52.51 GB、接電 100%、觀察 swap 增量 0。原始證據與實際來源快照已存 `hero74-prefix-v19/`。

v20 僅修正計時與觀測：未快取／快取每次完整前向反向各自開始 `gradient-probe` 計時，**每段仍限 120 秒**，正式 train 每步 120 秒、probe 總 1,200 秒、train 總 57,600 秒及其他保護均不變。額外記錄同題 uncached reference 秒數，沒有改數值算法、教師、完整長度或 LoRA 設定。Supervisor/authorization CPU tests 11/11 通過。獨立 v20 的連續 probe→train 流程已啟動；這不是覆寫或原樣重啟 v19，是否已進入權重更新仍必須讀真實 training trace。

同時已固定 `hero74-eval-plan-v1/` 的 119 筆對照輸入：17 個完整英雄為主分母、102 槽為輔助；只把原始 system/user 給推論，教師答案另檔，不捏造歷史 Codex 型號／effort。CPU tests 3/3；尚無新生成／對局結果。

**v18 完成當時的結論（授權與執行狀態已由上方更新）：對齊公共前綴切點後，四種完整格式 4/4 通過，快取與未快取的 hidden、loss、8 個 trainable tensor 梯度差異全部 0。全量一輪保守估時降至 30,980.73 秒（8.61 小時），仍超過原 7,200 秒設定；當時未執行正式 500 步、沒有新 adapter，提出 10 小時授權建議。** 後續使用者已核准 16 小時；不要將此歷史段落當作仍待授權。

## v18 完整快取一致性已通過，待核准全量單輪時限

資料使用 `hero74-training-v3` 無損提示排序版本，仍 500 train／119 internal-dev；教師答案、完整輸入值及 split 均與 v2 相同。原生公共快取切點 18,944、社群 20,736，對齊 256-token query block。剩餘公共 tokens 跟隨 suffix 計算，不丟棄；末兩層每次重算，沒有跨 optimizer step 重用 trainable hidden。

| 格式 | 完整 tokens | 答案 tokens | 快取前向＋反向秒數 | 同題 hidden／loss／全部梯度差異 | 探針 peak Metal（GB） |
|---|---:|---:|---:|---|---:|
| native-slot | 22,027 | 912 | 21.25 | 全部 0 | 29.45 |
| hero-slot | 24,780 | 2,834 | 26.12 | 全部 0 | 31.50 |
| native-content | 25,908 | 4,799 | 31.53 | 全部 0 | 32.39 |
| hero-plan | 29,995 | 8,049 | 43.36 | 全部 0 | 35.49 |

每行比較同一 v3 prompt／token 序列、同一初始化參數，非拿 v15 不同 JSON 排序的 loss 當對照。相對 L2 差異 0 是本次有限樣本／固定權重的實測，不是任意輸入與所有後續權重的數學保證；CPU 還覆蓋變動 suffix 與 tail 參數後的快取重用。快取階段時間不包含該行先做的未快取對照；表中 peak 則包含對照與快取兩路，不應誤標為快取單路 peak。

兩組公共快取建立共 47.19 秒，host bytes 合計 3,054,534,656（另計於系統 RAM，不藏在 Metal 值外）。Supervisor completed／worker 已 join，整個包含對照的 probe 417.55 秒，最低可用系統 RAM 54.00 GB、觀察 swap 增量 0、接電／電量 100%。原 28 GiB block 邊界 active 檢查、6 GiB 可用 RAM、2 GiB swap 增量、2 點電量下降、單步 120 秒及 probe 1,200 秒等保護皆未放寬。allocator peak 不是 block 邊界 active 值，不能說總記憶體被硬鎖在 28 GiB。

固定原估算方法：每格式最慢實测快取 gradient ×（train 筆數＋2×dev 筆數），加總乘 1.5，加 300 秒，再加 1.5×公共快取建立秒數，得 **30,980.725 秒／8.606 小時**。它把 dev forward 按 gradient 成本估算，是保守排程值、不是完成保證。相較 v15 的 16.173 小時估算降低約 46.8%；因 v15/v18 輸入排序不同，不把它冒稱為同題 runtime 嚴格 A/B 加速率。

`fitsStepBudget=true`、`prefixCacheParityPassed=true`、`fitsTimeBudget=false`。**正式訓練尚未開始、optimizer 更新 0。** 建議待核准單輪 10 小時上限，只跑既定 500 筆一次、不自動續跑／sweep，119 筆 dev 用於前後比較。若保護先觸發即停止，不能以完成目標為由放寬。下一步必須取得新總時限授權，不再重跑已通過 probe 來代替開訓。

原始資料、程式快照、probe 原始 log／memory trace、數值比較及終止收據見 `hero74-prefix-v18/`。資料相關 Node tests 6/6、cache CPU tests 5/5、supervisor tests 9/9、receipt tests 3/3。本機狀態仍不等於生成品質、完整上場、公開上架或模型 release；最终仍缺正式 adapter 與同題生成／對局結果、另一批未見測試需求。

## v16 快取實驗：不准入訓

本次資料要求已完成：`hero74-training-v2` 保留 500 train／119 internal-dev，74 名社群英雄及 444 槽全數納入，完整英雄與所屬六槽不跨集。重新執行 frozen-data 全檔 hash／覆蓋／分組／輸出契約測試通過。這不代表已做完整新人工語意審查或正式上架。

為減少全量訓練的公共目錄重算，另衍生 `hero74-training-v3`（僅提示 JSON 成員排序），619 份教師答案、所有輸入值與切分保持不變。它只供實驗，不取代已准入的 v2。公共前綴只從 train 輸入建立，不含教師答案；只快取前 46 個 frozen 層，末兩層 LoRA 每次重新計算。CPU 實際小 Gemma4 decoder 測試 4/4 通過，不能代替 12B 實機證據。

v16 第一筆完整 `godie-h02k:R` 的實機比較：hidden 相對 L2 **4.751%**（預設上限 1%）、loss 差 **0.00303**（上限 0.02）、最大梯度相對 L2 **8.753%**（上限 2%）。所以 `PREFIX_CACHE_PARITY_FAILED`，其餘三格式未繼續，不公布加速倍數、不放寬誤差、不執行 optimizer。數值差異的根因尚未定位，不能歸咎於教師資料。

Supervisor 已終止並 join 自己的 worker；總 122.26 秒，最低可用 RAM 55.90 GB，接電／電量 100%、觀察 swap 增量 0，optimizer steps 0。詳見 `hero74-prefix-v16/receipt.json`、原始 log、parity JSON 與逐檔綁定的程式快照。沒有新 adapter 或生成品質提升證據。

**v16 結束時可用的是 v15 未快取全長路徑，不是 v16；後續 v18 狀態見頂部。** 當時 16.17 小時為保守估算而非保證，原 7,200 秒限制未改。不能以持續重寫 runtime 代替實際模型訓練，也不能偷偷提高時限或縮減 500 筆資料。

## 問題與實測進展

### v17 定位：公共前綴切點與 query 區塊對齊

以同一筆完整 22,026 個模型輸入 tokens（22,027-token 樣本扣最後 label）作有界前向診斷，只比較第 1 層及第一個 full-attention 所在的第 6 層，不作梯度或 optimizer 更新。原公共切點 19,137 改為向下對齊 256 的 18,944；剩餘 193 tokens 仍在 suffix 完整計算。診斷不是縮成六層訓練，正式模型仍 48 層、前 46 層 frozen、末兩層 LoRA。

| 切點 | 第 1 層 hidden 相對 L2 | 第 6 層 hidden 相對 L2 | 第 1 層 q/k/v projection 相對 L2 |
|---|---:|---:|---:|
| 19,137，未對齊 | 0.02597% | 0.28438% | 全部 0 |
| 18,944，對齊 | 0 | 0 | 全部 0 |

差異只出現在 suffix，prefix 差異為 0。這個本機控制把問題定位到分段後改變的 query 區塊邊界，不支持「教師資料錯誤」或「quantized projection 改變」的解釋；不宣稱已分析每個底層數值運算。v17 20.09 秒完成，最低可用 RAM 60.80 GB、swap 增量 0、接電 100%，optimizer 0。診斷 manifest 和 result 均禁止 train；即使改結果 flags，supervisor 仍拒絕 diagnostic manifest。

來源、原始 trace 與終止證據在 `hero74-prefix-v17/`。修正只改 runtime 公共切點計算，不變教師、資料分組、token 序列、區塊大小、誤差門檻或資源保護。v18 才檢查全部 46 層 frozen hidden、loss 及末兩層梯度，不能從本表直接推定完整快取准入。

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

## v15 狀態（歷史）

v15 改為只在當前 attention block 轉 FP32，原 BF16 Q/K/V 保留，不再常駐全段 FP32 副本。每個 token 的前向輸出 cast 後串接，等價於串接後 cast；反向 K/V 完整 FP32 累加後才單次 cast 回原 dtype，沒有改用較低精度 attention。

目前 `fitsStepBudget=true`（各筆小於 120 秒）、`fitsTimeBudget=false`。16.17 小時來自預先固定公式：各格式最慢 gradient 秒數 ×（train 數＋2×dev 數），總和 ×1.5＋300 秒；其中以 gradient 成本代替 dev forward 是保守估法。**不是已量到完整單輪要 16 小時，也不是已獲授權加時。** 現有 guard 阻止開訓，沒有調高 timeout 或刪減樣本繞過。後續先改善重複計算並重新實測；若仍無法符合原上限，須提出具體時程向使用者取得新的明確授權。

## v16 之前的改善假設（歷史記錄，非當前准入結論）

`hero-distillation-prefix-audit.py` 對全部 619 筆做純 CPU 盤點（見 `hero74-prefix-opportunity.json`）。只重排 JSON 成員、所有值與答案均保留的假設下：

- 原生 101 筆共用前綴由 78 增至 19,143 tokens；社群 518 筆由 78 增至 20,884 tokens。
- 原總 prompt tokens 13,420,544；重排後 13,419,925。**這不是縮短資料，也不是已量到加速**；只是大量相同公共目錄有機會共用 frozen-prefix 運算。
- 尚未改動凍結資料、沒有 prefix cache 實作。若採用，須另立新輸入版本、保持教師與 split、逐筆驗證因果 KV 位置與 frozen hidden／梯度一致性。只可重用固定 frozen layers 的公共目錄前綴，不能跨 optimizer step 重用 trainable tail，不能加入教師答案或 dev-answer 檢索。
- cache 仍須遵守相同系統 RAM／swap／active Metal 邊界；prefix tokens 不能直接換算成速度倍數。這是降低重複工作以爭取全量單輪的方向，不是授權延長執行時限。
